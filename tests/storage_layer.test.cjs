const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'insight_storage_v1.js'),'utf8');

function setup(options={}){
  const calls=[];
  const values=Object.assign({},options.initial||{});
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
  return {window,calls,values};
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

test('feature moduleはlocalStorageへ直接書き込まず共有storageを使う',()=>{
  const files=fs.readdirSync(root).filter(name=>/^insight_.*\.js$/.test(name)&&name!=='insight_storage_v1.js'&&name!=='insight_bootstrap_patches_v1.js'&&!name.startsWith('insight_payload_'));
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
  assert.match(index,/insight_storage_v1\.js\?v=20261003-restore-readback/);
  assert.match(index,/insight_persist_guard_v1\.js\?v=20261006-persist-runtime-1/);
  assert.ok(index.indexOf('insight_storage_v1.js')<index.indexOf('insight_persist_guard_v1.js'));
  assert.ok(index.indexOf('insight_persist_guard_v1.js')<index.indexOf('insight_year_manager_v1.js'));
});
