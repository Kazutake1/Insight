const test=require('node:test');
const assert=require('node:assert/strict');
const manager=require('../insight_year_manager_v1.js');

const MONTHS=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
function blankHaiki(){return {米飯:0,調理パン:0};}
function blankYear(year){
  const y=Number(year),out={};
  MONTHS.forEach((month,index)=>{
    const days=new Date(y,index+1,0).getDate();
    out[month]=Array.from({length:days},(_,i)=>({d:String(i+1),売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:blankHaiki(),weather:''}));
  });
  return out;
}
function snapshot(){
  return {current:'a',stores:{a:{name:'A',years:['2025','2026'],data:{'2025':blankYear('2025'),'2026':blankYear('2026')},salesCounts:{'2024-08-03':{keep:true}},hourlyCustomers:{'2024-08-03':[1,2,3]},events:[{id:'keep'}]}}};
}

test('未登録年度の疎データを保持しながら1年分の正常データへ昇格する',()=>{
  const all=snapshot(),store=all.stores.a;
  store.data['2024']={'8月':[null,null,{d:'3',売上:123,客数:456,haiki:{米飯:9},weather:'晴',storeMemo:'保持'}]};
  const result=manager.promote(all,'a','2024',blankYear);
  assert.equal(result.added,true);
  assert.equal(result.recoveredRows,1);
  assert.deepEqual(store.years,['2024','2025','2026']);
  assert.equal(Object.keys(store.data['2024']).length,12);
  assert.equal(store.data['2024']['2月'].length,29);
  assert.equal(store.data['2024']['8月'].length,31);
  assert.equal(store.data['2024']['8月'][0].d,'1');
  assert.equal(store.data['2024']['8月'][0].売上,0);
  assert.equal(store.data['2024']['8月'][2].売上,123);
  assert.equal(store.data['2024']['8月'][2].客数,456);
  assert.equal(store.data['2024']['8月'][2].haiki.米飯,9);
  assert.equal(store.data['2024']['8月'][2].haiki.調理パン,0);
  assert.equal(store.data['2024']['8月'][2].storeMemo,'保持');
  assert.deepEqual(store.salesCounts,{'2024-08-03':{keep:true}});
  assert.deepEqual(store.hourlyCustomers,{'2024-08-03':[1,2,3]});
  assert.deepEqual(store.events,[{id:'keep'}]);
});

test('既に登録済みの年度も値を失わず正常化できる',()=>{
  const all=snapshot(),store=all.stores.a;
  store.data['2025']['1月'][0].売上=777;
  const result=manager.promote(all,'a','2025',blankYear);
  assert.equal(result.added,false);
  assert.equal(store.data['2025']['1月'][0].売上,777);
  assert.deepEqual(store.years,['2025','2026']);
});

test('年度は4桁のみ許可する',()=>{
  const all=snapshot();
  assert.throws(()=>manager.promote(all,'a','999',blankYear),/4桁/);
});
