const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'insight_storage_v1.js'),'utf8');

function setup(options={}){
  const calls=[];
  const window={
    SK:'insight_v11',
    localStorage:{
      setItem(key,value){
        if(options.failWrite)throw new Error('quota');
        calls.push([key,value]);
      }
    }
  };
  const context={window,globalThis:window,SK:'insight_v11',JSON,Error};
  vm.createContext(context);
  vm.runInContext(source,context);
  return {window,calls};
}

test('snapshot writerは指定キーへ1回だけJSON保存する',()=>{
  const {window,calls}=setup();
  const value={current:'a',stores:{a:{name:'A'}}};
  const serialized=window.InsightStorage.writeSnapshot(value);
  assert.equal(serialized,JSON.stringify(value));
  assert.deepEqual(calls,[['insight_v11',serialized]]);
});

test('snapshot writerは保存失敗を握りつぶさない',()=>{
  const {window}=setup({failWrite:true});
  assert.throws(()=>window.InsightStorage.writeSnapshot({current:'a'}),/quota/);
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
  const files=fs.readdirSync(root).filter(name=>/^insight_.*\.js$/.test(name)&&name!=='insight_storage_v1.js');
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

test('Indexの共通persistだけはpayload起動前安全化として維持する',()=>{
  const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
  assert.match(index,/var safePersist=/);
  assert.match(index,/localStorage\.setItem\(SK,JSON\.stringify\(allStores\)\)/);
  assert.match(index,/insight_storage_v1\.js\?v=20260930-step6-2/);
});
