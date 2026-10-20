const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'insight_storage_v1.js'),'utf8');

function setup(options={}){
  const calls=[];
  const values=options.sharedValues||Object.assign({},options.initial||{});
  const window={
    SK:'insight_v11',
    localStorage:{
      setItem(key,value){
        if(options.failWrite)throw new Error('quota');
        calls.push([key,value]);
        values[key]=value;
      },
      getItem(key){
        return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;
      }
    }
  };
  const context={window,globalThis:window,SK:'insight_v11',JSON,Error};
  vm.createContext(context);
  vm.runInContext(source,context);
  return {window,calls,values,context};
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
