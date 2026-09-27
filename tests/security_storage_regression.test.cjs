const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');

function safePersistSource(){
  const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
  const marker='var safePersist=',start=index.indexOf(marker);
  const end=index.indexOf(';\nif(html.indexOf(originalPersist)',start);
  assert.ok(start>=0&&end>start,'安全な保存処理がIndex.htmlに定義されていること');
  return vm.runInNewContext(index.slice(start+marker.length,end));
}

test('共通保存処理は成功時だけtrueを返す',()=>{
  const calls=[];
  const context={
    SK:'insight',allStores:{current:'a'},
    localStorage:{setItem:(key,value)=>calls.push([key,value])},
    alert:()=>assert.fail('保存成功時に警告を出さないこと'),
    window:{addEventListener:()=>{}},Error
  };
  vm.runInNewContext(safePersistSource(),context);
  assert.equal(context.persist(),true);
  assert.deepEqual(calls,[['insight','{"current":"a"}']]);
});

test('共通保存処理は失敗時に成功表示へ進ませない',()=>{
  const alerts=[];let errorHandler;
  const context={
    SK:'insight',allStores:{current:'a'},
    localStorage:{setItem:()=>{throw new Error('quota');}},
    alert:message=>alerts.push(message),
    window:{addEventListener:(type,handler)=>{if(type==='error')errorHandler=handler;}},Error
  };
  vm.runInNewContext(safePersistSource(),context);
  assert.throws(()=>context.persist(),error=>error&&error.name==='InsightPersistError');
  assert.match(alerts[0],/現在の変更は保存されていません/);
  let prevented=false;errorHandler({error:{name:'InsightPersistError'},preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);
});

test('セール実績の店舗名はHTMLではなく文字列として描画する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_sales_count_v1.js'),'utf8');
  const start=source.indexOf('function renderAnalysis()');
  const end=source.indexOf('function disp(',start);
  assert.ok(start>=0&&end>start,'セール実績描画処理が存在すること');
  const render=source.slice(start,end);
  assert.match(render,/values=\[x\.date,[\s\S]*x\.store/);
  assert.match(render,/tr\.append\(el\('td',String\(value\)\)\)/);
  assert.doesNotMatch(render,/innerHTML=[^;]*x\.store/);
});
