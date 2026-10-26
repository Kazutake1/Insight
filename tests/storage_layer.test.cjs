const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'insight_storage_v1.js'),'utf8');

function setup(options={}){
  const calls=[];
  const listeners={};
  const values=options.sharedValues||Object.assign({},options.initial||{});
  const window={
    SK:'insight_v11',
    localStorage:{
      setItem(key,value){
        if(options.beforeWrite)options.beforeWrite({key,value,window,values});
        if(options.failWrite)throw new Error('quota');
        calls.push([key,value]);
        values[key]=value;
      },
      getItem(key){
        return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;
      }
    }
  };
  window.addEventListener=function(type,callback){
    (listeners[type]||(listeners[type]=[])).push(callback);
  };
  const context={window,globalThis:window,SK:'insight_v11',JSON,Error};
  vm.createContext(context);
  vm.runInContext(source,context);
  return {window,calls,values,context,
    emitStorage(event){(listeners.storage||[]).forEach(fn=>fn(event));}};
}

test('snapshot writerはschemaVersionを付けて指定キーへ1回だけJSON保存する',()=>{
  const {window,calls}=setup();
  const value={current:'a',stores:{a:{name:'A'}}};
  const serialized=window.InsightStorage.writeSnapshot(value);
  assert.deepEqual(JSON.parse(serialized),{current:'a',stores:{a:{name:'A'}},schemaVersion:1});
  assert.deepEqual(calls,[['insight_v11',serialized]]);
  assert.equal(value.schemaVersion,undefined);
});

test('snapshot readerは実際の保存内容をschema検証付きで読み戻す',()=>{
  const saved=JSON.stringify({schemaVersion:1,current:'a',stores:{a:{name:'A'}}});
  const {window}=setup({initial:{insight_v11:saved}});
  const value=window.InsightStorage.readSnapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(value)),{schemaVersion:1,current:'a',stores:{a:{name:'A'}}});
});

test('snapshot readerは壊れたJSONを拒否する',()=>{
  const {window}=setup({initial:{insight_v11:'{broken'}});
  assert.throws(()=>window.InsightStorage.readSnapshot(),/saved data JSON is invalid/);
});

test('snapshot writerは保存失敗を握りつぶさない',()=>{
  const {window}=setup({failWrite:true});
  assert.throws(()=>window.InsightStorage.writeSnapshot({current:'a'}),/quota/);
});

test('schemaVersionなしの旧データはversion 1へ移行する',()=>{
  const {window}=setup();
  const migrated=window.InsightStorage.migrateSnapshot({current:'a',stores:{}});
  assert.equal(migrated.schemaVersion,1);
  assert.equal(window.InsightStorage.CURRENT_SCHEMA_VERSION,1);
});

test('現在より新しいschemaVersionは読み込まない',()=>{
  const {window}=setup();
  assert.throws(
    ()=>window.InsightStorage.migrateSnapshot({schemaVersion:2,current:'a',stores:{}}),
    /新しいInsight/
  );
});

test('不正なschemaVersionは拒否する',()=>{
  const {window}=setup();
  assert.throws(()=>window.InsightStorage.migrateSnapshot({schemaVersion:'abc'}),/schema version is invalid/);
  assert.throws(()=>window.InsightStorage.migrateSnapshot({schemaVersion:-1}),/schema version is invalid/);
});

test('writeMetadataは補助メタデータを共有storage層から保存する',()=>{
  const {window,calls}=setup();
  assert.equal(window.InsightStorage.writeMetadata('insight_last_backup',12345),true);
  assert.deepEqual(calls,[['insight_last_backup','12345']]);
});

test('persistCurrentは現在データを共有writer経由で保存する',()=>{
  const {window,calls}=setup();
  const live={current:'a',stores:{a:{name:'A'}}};
  assert.equal(window.InsightStorage.persistCurrent(live),true);
  assert.equal(live.schemaVersion,1);
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(calls[0][1]),live);
});

test('transactionは元データを直接変更せず検証後に保存・反映する',()=>{
  const {window,calls}=setup();
  const sourceValue={count:1,nested:{value:2}};
  const order=[];
  const next=window.InsightStorage.transaction(
    sourceValue,
    draft=>{order.push('mutate');draft.count=2;draft.nested.value=3;},
    draft=>{order.push('validate');assert.equal(draft.count,2);},
    draft=>{order.push('apply');assert.equal(calls.length,1);assert.equal(draft.count,2);}
  );
  assert.deepEqual(sourceValue,{count:1,nested:{value:2}});
  assert.equal(next.count,2);
  assert.deepEqual(order,['mutate','validate','apply']);
});

test('transactionは検証失敗時に保存・反映しない',()=>{
  const {window,calls}=setup();
  let applied=false;
  assert.throws(()=>window.InsightStorage.transaction(
    {count:1},
    draft=>{draft.count=2;},
    ()=>{throw new Error('invalid');},
    ()=>{applied=true;}
  ),/invalid/);
  assert.deepEqual(calls,[]);
  assert.equal(applied,false);
});

test('複数タブ: 後から開いたタブの古いスナップショット保存を拒否し既存データを保持する',()=>{
  const initial=JSON.stringify({schemaVersion:1,current:'a',stores:{a:{name:'A',value:0},b:{name:'B',value:0}}});
  const sharedValues={insight_v11:initial};
  const tabA=setup({sharedValues}),tabB=setup({sharedValues});
  const a=tabA.window.InsightStorage,b=tabB.window.InsightStorage;
  const aSnapshot=a.readSnapshot(),bSnapshot=b.readSnapshot();

  a.transaction(aSnapshot,next=>{next.stores.a.value=15;});
  // Reading the latest storage does not acknowledge it for an out-of-date UI.
  assert.equal(b.readSnapshot().stores.a.value,15);
  assert.throws(()=>b.transaction(bSnapshot,next=>{next.stores.b.value=25;}),error=>
    error.name==='InsightStorageConflictError'&&/別のタブ/.test(error.message));

  const saved=JSON.parse(sharedValues.insight_v11);
  assert.equal(saved.stores.a.value,15);
  assert.equal(saved.stores.b.value,0);

  // The writing tab can still save normally.
  a.transaction(a.readSnapshot(),next=>{next.stores.a.value=16;});
  assert.equal(JSON.parse(sharedValues.insight_v11).stores.a.value,16);
});

test('同じタブの連続保存とメタデータ更新では競合しない',()=>{
  const {window,values}=setup();
  const storage=window.InsightStorage;
  storage.writeSnapshot({current:'a',stores:{a:{value:1}}});
  storage.writeMetadata('insight_last_backup','123');
  storage.writeSnapshot({current:'a',stores:{a:{value:2}}});
  assert.equal(JSON.parse(values.insight_v11).stores.a.value,2);
});

test('他タブによるキー削除後も古いタブの再作成を拒否する',()=>{
  const sharedValues={insight_v11:JSON.stringify({schemaVersion:1,current:'a',stores:{}})};
  const tab=setup({sharedValues});
  delete sharedValues.insight_v11;
  assert.throws(()=>tab.window.InsightStorage.writeSnapshot({current:'a',stores:{}}),error=>
    error.name==='InsightStorageConflictError');
  assert.equal(sharedValues.insight_v11,undefined);
});

test('競合は既存persistガードで専用警告になり保存されない',()=>{
  const sharedValues={insight_v11:JSON.stringify({schemaVersion:1,current:'a',stores:{a:{value:1}}})};
  const a=setup({sharedValues}),b=setup({sharedValues});
  const warnings=[];
  b.window.alert=message=>warnings.push(message);
  b.window.persist=()=>true;
  b.window.allStores={schemaVersion:1,current:'a',stores:{a:{value:2}}};
  vm.runInContext(fs.readFileSync(path.join(root,'insight_persist_guard_v1.js'),'utf8'),b.context);
  a.window.InsightStorage.writeSnapshot({current:'a',stores:{a:{value:3}}});
  assert.throws(()=>b.window.persist(),error=>error.name==='InsightPersistError'&&
    error.cause&&error.cause.name==='InsightStorageConflictError');
  assert.equal(warnings.length,1);
  assert.match(warnings[0],/別のタブ/);
  assert.match(warnings[0],/再読み込み/);
  assert.equal(JSON.parse(sharedValues.insight_v11).stores.a.value,3);
});

test('feature moduleはlocalStorageへ直接書き込まず共有storageを使う',()=>{
  const files=fs.readdirSync(root).filter(name=>/^insight_.*\.js$/.test(name)&&!name.startsWith('insight_payload_')&&name!=='insight_storage_v1.js'&&name!=='insight_bootstrap_patches_v1.js');
  const offenders=[];
  files.forEach(name=>{
    const text=fs.readFileSync(path.join(root,name),'utf8');
    if(/localStorage\.setItem\s*\(/.test(text))offenders.push(name);
  });
  assert.deepEqual(offenders,[]);
  for(const name of ['insight_events_v1.js','insight_sales_count_v1.js','insight_backup_guard_v1.js']){
    const text=fs.readFileSync(path.join(root,name),'utf8');
    assert.match(text,/InsightStorage/,name+' が共有storageを使用していません');
  }
});

test('runtime persist guardはStorage直後に読み込まれ共有保存層へ委譲する',()=>{
  const index=fs.readFileSync(path.join(root,'insight_shell_loader_v1.js'),'utf8');
  const bootstrap=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const guard=fs.readFileSync(path.join(root,'insight_persist_guard_v1.js'),'utf8');
  assert.doesNotMatch(bootstrap,/originalPersist|safePersist|InsightPersistError/);
  assert.match(guard,/InsightStorage\.persistCurrent\(currentSnapshot\(\)\)/);
  assert.doesNotMatch(guard,/localStorage\.setItem/);
  assert.match(index,/insight_storage_v1\.js\?v=20261021-saved-report-1/);
  assert.match(index,/insight_persist_guard_v1\.js\?v=20261011-stale-tab-1/);
  assert.ok(index.indexOf('insight_storage_v1.js')<index.indexOf('insight_persist_guard_v1.js'));
  assert.ok(index.indexOf('insight_persist_guard_v1.js')<index.indexOf('insight_year_manager_v1.js'));
});


/* STEP4 P4d-7: isolated storage-observation boundary checks.
 * These tests exercise the ORIGINAL InsightStorage module with fictional
 * localStorage, not any real store data, browser event loop or AI consumer.
 * A stable reportState is NOT a trusted full-app-clean or model-use proof.
 */
const FICTIONAL_A=JSON.stringify({schemaVersion:1,current:'fictional',
  stores:{fictional:{value:'A'}}});
const FICTIONAL_B=JSON.stringify({schemaVersion:1,current:'fictional',
  stores:{fictional:{value:'B'}}});

test('P4d7 S01: reportState witnesses a pending write before setItem commits',()=>{
  let during;
  const f=setup({beforeWrite({window}){during=window.InsightStorage.reportState();}});
  const first=f.window.InsightStorage.reportState();
  assert.equal(first.pending,0);
  f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_A));
  assert.equal(during.pending,1);
  assert.ok(during.revision>first.revision);
  const after=f.window.InsightStorage.reportState();
  assert.equal(after.pending,0);
  assert.equal(after.held,false);
  assert.equal(f.calls.length,1);
});

test('P4d7 S02: failed write leaves held status and never claims clean',()=>{
  const f=setup({failWrite:true});
  assert.throws(()=>f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_A)),/quota/);
  const state=f.window.InsightStorage.reportState();
  assert.equal(state.pending,0);
  assert.equal(state.held,true);
  assert.ok(state.revision>0);
  assert.equal(f.calls.length,0);
});

test('P4d7 S03: unannounced cross-tab raw difference is reported and not acknowledged by readSnapshot',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}});
  const first=f.window.InsightStorage.reportState();
  f.values.insight_v11=FICTIONAL_B;
  const beforeRead=f.window.InsightStorage.reportState();
  assert.equal(beforeRead.conflict,true);
  assert.equal(beforeRead.revision,first.revision); // no event, only raw mismatch
  assert.equal(f.window.InsightStorage.readSnapshot().stores.fictional.value,'B');
  assert.equal(f.window.InsightStorage.reportState().conflict,true);
  assert.throws(()=>f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_A)),
    e=>e.name==='InsightStorageConflictError');
  assert.equal(f.calls.length,0);
});

test('P4d7 S04: observed cross-tab A-B-A remains conflict after raw returns to A',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}});
  const start=f.window.InsightStorage.reportState();
  f.values.insight_v11=FICTIONAL_B;
  f.emitStorage({key:'insight_v11',newValue:FICTIONAL_B});
  f.values.insight_v11=FICTIONAL_A;
  const state=f.window.InsightStorage.reportState();
  assert.equal(state.conflict,true);
  assert.ok(state.revision>start.revision);
  assert.throws(()=>f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_A)),
    e=>e.name==='InsightStorageConflictError');
  assert.equal(f.values.insight_v11,FICTIONAL_A);
});

test('P4d7 S05: silent A-B-A cannot be proven fresh by the current report API',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}});
  const start=f.window.InsightStorage.reportState();
  f.values.insight_v11=FICTIONAL_B;
  f.values.insight_v11=FICTIONAL_A; // no dispatched storage event
  const after=f.window.InsightStorage.reportState();
  assert.equal(after.conflict,false);
  assert.equal(after.revision,start.revision);
  assert.equal(after.pending,0);
  // This is a documented detection GAP, NOT a clean/authorization assertion.
  assert.equal(f.calls.length,0);
});

test('P4d7 S06: even same-value storage notifications invalidate report freshness',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}});
  f.emitStorage({key:'insight_v11',newValue:FICTIONAL_A});
  const state=f.window.InsightStorage.reportState();
  assert.equal(state.conflict,true);
  assert.ok(state.revision>0);
  assert.equal(f.values.insight_v11,FICTIONAL_A);
  // report conflict is not the same thing as writeSnapshot's own stale guard.
});

test('P4d7 S07: nested transaction cannot be mistaken for a single settled state',()=>{
  const during=[];
  const f=setup({beforeWrite({window}){during.push(window.InsightStorage.reportState());}});
  f.window.InsightStorage.transaction(JSON.parse(FICTIONAL_A),
    next=>{next.stores.fictional.value='B';});
  assert.equal(during.length,1);
  assert.equal(during[0].pending,2);
  assert.equal(during[0].held,false);
  const settled=f.window.InsightStorage.reportState();
  assert.equal(settled.pending,0);
  assert.equal(settled.held,false);
  assert.ok(settled.revision>=2);
  assert.equal(JSON.parse(f.values.insight_v11).stores.fictional.value,'B');
});

test('P4d7 S08: apply failure after committed bytes remains held, not proven clean',()=>{
  const f=setup();
  assert.throws(()=>f.window.InsightStorage.transaction(JSON.parse(FICTIONAL_A),
    next=>{next.stores.fictional.value='B';},null,()=>{throw new Error('fictional apply fail');}),
    /fictional apply fail/);
  const report=f.window.InsightStorage.reportState();
  assert.equal(report.pending,0);
  assert.equal(report.held,true);
  assert.equal(JSON.parse(f.values.insight_v11).stores.fictional.value,'B');
  // A write can commit while in-memory apply fails; do not grant permission.
});

test('P4d7 S09: unreadable storage report throws rather than returning false confidence',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}});
  f.window.localStorage.getItem=()=>{throw new Error('fictional storage unavailable');};
  assert.throws(()=>f.window.InsightStorage.reportState(),
    /fictional storage unavailable/);
  assert.equal(f.calls.length,0);
});

test('P4d7 S10: unrelated storage event does not fabricate source revision',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}});
  const start=f.window.InsightStorage.reportState();
  f.emitStorage({key:'fictional_unrelated_key',newValue:'irrelevant'});
  const after=f.window.InsightStorage.reportState();
  assert.equal(after.revision,start.revision);
  assert.equal(after.conflict,false);
  assert.equal(f.calls.length,0);
});


/* STEP4 P4d-8: TEST-ONLY joined observation of the original InsightStorage
 * and seven fictional editor STATUS CALLBACKS. Never loaded by Index.html.
 * All observations, including an all-false sampling, are non-authorizing.
 * This is not an atomic snapshot, subscription, browser/iPad proof or AI gate.
 * Pre-existing P4d-1 tests check the editor-only contract separately.
 */
const P4D8_EDITOR_KEYS=Object.freeze([
  'sales_count','quick_daily','daily_sales','daily_customers',
  'daily_waste','hourly_customers','events_and_promotions'
]);
const p4d8Result=observation=>Object.freeze({
  observation,full_app_clean:false,provenance_verified:false,authorized_for_model:false
});
const p4d8Unknown=()=>p4d8Result('UNKNOWN');

// Read only OWN DATA DESCRIPTORS: never resolve accessor values, IDs, draft or raw.
function p4d8Own(value,key){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!Object.hasOwn(descriptor,'value'))
    throw Error('fictional_status_unavailable');
  return descriptor.value;
}
function p4d8Statuses(providers){
  const stamps=[];
  for(const key of P4D8_EDITOR_KEYS){
    const provider=p4d8Own(providers,key);
    if(typeof provider!=='function')throw Error('fictional_provider_missing');
    const value=provider();
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw Error('fictional_status_missing');
    const initialized=p4d8Own(value,'initialized');
    const dirty=p4d8Own(value,'dirty');
    const epoch=p4d8Own(value,'epoch');
    if(initialized!==true||typeof dirty!=='boolean'||
        !Number.isSafeInteger(epoch)||epoch<0)
      throw Error('fictional_status_unknown');
    stamps.push({key,provider,dirty,epoch});
  }
  return stamps;
}
function p4d8Report(storage){
  const report=storage.reportState(); // original real module running in isolated VM
  if(!report||typeof report!=='object'||Array.isArray(report))
    throw Error('fictional_report_invalid');
  const revision=p4d8Own(report,'revision');
  const pending=p4d8Own(report,'pending');
  const held=p4d8Own(report,'held');
  const conflict=p4d8Own(report,'conflict');
  if(!Number.isSafeInteger(revision)||revision<0||
      !Number.isSafeInteger(pending)||pending<0||
      typeof held!=='boolean'||typeof conflict!=='boolean')
    throw Error('fictional_report_invalid');
  return {revision,pending,held,conflict};
}
function p4d8ObserveJoined(storage,providers,interleave){
  try {
    if(!storage||typeof storage.reportState!=='function'||
        !providers||typeof providers!=='object')return p4d8Unknown();
    const before=p4d8Report(storage);
    if(before.pending!==0||before.held||before.conflict)return p4d8Unknown();
    const first=p4d8Statuses(providers);
    if(typeof interleave==='function')interleave(); // fictional race injection only
    const second=p4d8Statuses(providers);
    const after=p4d8Report(storage);
    if(after.pending!==0||after.held||after.conflict||
        before.revision!==after.revision)return p4d8Unknown();
    for(let i=0;i<first.length;i++){
      if(first[i].provider!==second[i].provider||
          first[i].dirty!==second[i].dirty||
          first[i].epoch!==second[i].epoch)return p4d8Unknown();
    }
    // Local samples are not transactional; a clean sample does NOT allow use.
    return p4d8Result(second.some(s=>s.dirty)?'DIRTY':'OBSERVED_CLEAN_ONLY');
  }catch(_){return p4d8Unknown();} // never surface untrusted error text
}
function p4d8Editors(){
  const statuses=Object.fromEntries(P4D8_EDITOR_KEYS.map(key=>[
    key,{initialized:true,dirty:false,epoch:0}
  ]));
  const providers=Object.fromEntries(P4D8_EDITOR_KEYS.map(key=>[
    key,()=>statuses[key]
  ]));
  return {statuses,providers};
}
function p4d8Check(result,observation){
  assert.equal(result.observation,observation);
  assert.equal(result.full_app_clean,false);
  assert.equal(result.provenance_verified,false);
  assert.equal(result.authorized_for_model,false);
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(Object.keys(result).sort(),[
    'authorized_for_model','full_app_clean','observation','provenance_verified'
  ]);
}

test('P4d8 J01: seven sampled clean statuses and original Storage never authorize',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}}),e=p4d8Editors();
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'OBSERVED_CLEAN_ONLY');
  assert.equal(f.calls.length,0);
});
test('P4d8 J02: any observed editor dirty is still non-authorizing',()=>{
  const f=setup(),e=p4d8Editors();
  e.statuses.daily_customers.dirty=true;
  e.statuses.daily_customers.epoch++;
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'DIRTY');
  assert.equal(f.calls.length,0);
});
test('P4d8 J03: missing, uninitialized or null-dirty editor stops a joined capture',()=>{
  const f=setup(),e=p4d8Editors();
  delete e.providers.events_and_promotions;
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'UNKNOWN');
  e.providers.events_and_promotions=()=>e.statuses.events_and_promotions;
  e.statuses.quick_daily.initialized=false;
  e.statuses.quick_daily.dirty=null;
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'UNKNOWN');
  assert.equal(f.calls.length,0);
});
test('P4d8 J04: original Storage save between editor samples invalidates revision',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}}),e=p4d8Editors();
  const outcome=p4d8ObserveJoined(f.window.InsightStorage,e.providers,()=>{
    f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_B));
  });
  p4d8Check(outcome,'UNKNOWN');
  assert.equal(f.calls.length,1);
  assert.equal(JSON.parse(f.values.insight_v11).stores.fictional.value,'B');
});
test('P4d8 J05: silent external raw mismatch aborts even without revision bump',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}}),e=p4d8Editors();
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers,()=>{
    f.values.insight_v11=FICTIONAL_B;
  }),'UNKNOWN');
  assert.equal(f.calls.length,0);
});
test('P4d8 J06: editor epoch changing mid-window aborts the observation',()=>{
  const f=setup(),e=p4d8Editors();
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers,()=>{
    e.statuses.daily_waste.epoch++;
    e.statuses.daily_waste.dirty=true;
  }),'UNKNOWN');
});
test('P4d8 J07: a provider callback replaced mid-window is unknown',()=>{
  const f=setup(),e=p4d8Editors();
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers,()=>{
    e.providers.sales_count=()=>({...e.statuses.sales_count});
  }),'UNKNOWN');
});
test('P4d8 J08: actual pending write re-entry cannot claim a settled view',()=>{
  let seen=null,e=p4d8Editors();
  const f=setup({beforeWrite({window}){
    seen=p4d8ObserveJoined(window.InsightStorage,e.providers);
  }});
  f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_A));
  p4d8Check(seen,'UNKNOWN');
  assert.equal(f.calls.length,1);
});
test('P4d8 J09: original Storage failure held state remains unknown',()=>{
  const f=setup({failWrite:true}),e=p4d8Editors();
  assert.throws(()=>f.window.InsightStorage.writeSnapshot(JSON.parse(FICTIONAL_A)),/quota/);
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'UNKNOWN');
  assert.equal(f.calls.length,0);
});
test('P4d8 J10: notified A-B-A remains unknown even after raw returns',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}}),e=p4d8Editors();
  f.values.insight_v11=FICTIONAL_B;
  f.emitStorage({key:'insight_v11',newValue:FICTIONAL_B});
  f.values.insight_v11=FICTIONAL_A;
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'UNKNOWN');
});
test('P4d8 J11: UNNOTIFIED A-B-A is undetectable and never authorizes',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}}),e=p4d8Editors();
  f.values.insight_v11=FICTIONAL_B;
  f.values.insight_v11=FICTIONAL_A; // impossible to prove continuous freshness
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'OBSERVED_CLEAN_ONLY');
  // Green observation is a LIMIT demonstration, not proof of full-app clean.
  assert.equal(f.calls.length,0);
});
test('P4d8 J12: hostile input/identifier getters are never read or returned',()=>{
  const f=setup(),e=p4d8Editors();
  let accessed=0;
  Object.defineProperty(e.statuses.sales_count,'draft',{get(){
    accessed++;throw Error('fictional-private-input');
  }});
  Object.defineProperty(e.statuses.daily_sales,'storeId',{get(){
    accessed++;throw Error('fictional-store-id');
  }});
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'OBSERVED_CLEAN_ONLY');
  assert.equal(accessed,0);
  Object.defineProperty(e.statuses.sales_count,'epoch',{configurable:true,get(){
    accessed++;throw Error('fictional-secret');
  }});
  p4d8Check(p4d8ObserveJoined(f.window.InsightStorage,e.providers),'UNKNOWN');
  assert.equal(accessed,0); // accessor descriptor, not value
});
test('P4d8 J13: failed storage reading and thrown provider never leak error strings',()=>{
  const f=setup({initial:{insight_v11:FICTIONAL_A}}),e=p4d8Editors();
  e.providers.quick_daily=()=>{throw Error('fictional-raw-secret');};
  const a=p4d8ObserveJoined(f.window.InsightStorage,e.providers);
  p4d8Check(a,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(a),/fictional-raw-secret/);
  e.providers.quick_daily=()=>e.statuses.quick_daily;
  f.window.localStorage.getItem=()=>{throw Error('fictional-storage-secret');};
  const b=p4d8ObserveJoined(f.window.InsightStorage,e.providers);
  p4d8Check(b,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(b),/fictional-storage-secret/);
});
