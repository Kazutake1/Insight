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


test('年度削除は年度直結データを削除しイベント履歴と他年度を保持する',()=>{
  const all=snapshot(),store=all.stores.a;
  store.years=['2024','2025','2026'];
  store.data['2024']=blankYear('2024');
  store.monthlyOps={
    '2024':{'8月':{laborCostYen:100,grossMarginRate:30}},
    '2025':{'8月':{laborCostYen:200,grossMarginRate:31}}
  };
  store.salesCounts={
    '2024-08-03':{old:true},
    '2024-12-31':{old2:true},
    '2025-01-01':{keep:true}
  };
  store.hourlyCustomers={
    '2024-08-03':Array(24).fill(1),
    '2025-01-01':Array(24).fill(2)
  };
  store.events=[
    {id:'event-2024',startDate:'2024-08-03',endDate:'2024-08-03'},
    {id:'event-2025',startDate:'2025-01-01',endDate:'2025-01-01'}
  ];
  all.eventManagement={version:1,presets:[],events:[{id:'global-2024',startDate:'2024-08-03',endDate:'2024-08-03'}]};

  const result=manager.removeYear(all,'a','2024');
  assert.deepEqual(result.remaining,['2025','2026']);
  assert.equal(result.removed.dataYear,true);
  assert.equal(result.removed.monthlyOpsYear,true);
  assert.equal(result.removed.salesCountDates,2);
  assert.equal(result.removed.hourlyCustomerDates,1);
  assert.equal(store.data['2024'],undefined);
  assert.equal(store.monthlyOps['2024'],undefined);
  assert.equal(store.salesCounts['2024-08-03'],undefined);
  assert.equal(store.salesCounts['2024-12-31'],undefined);
  assert.deepEqual(store.salesCounts['2025-01-01'],{keep:true});
  assert.equal(store.hourlyCustomers['2024-08-03'],undefined);
  assert.equal(store.hourlyCustomers['2025-01-01'].length,24);
  assert.equal(store.events.length,2);
  assert.equal(all.eventManagement.events.length,1);
});

test('年度削除後は基準年度と比較年度が同一にならず比較なしも維持する',()=>{
  assert.deepEqual(manager.resolveSelection(['2024','2025'],2026,2025),{baseYear:'2025',compareYear:'2024'});
  assert.deepEqual(manager.resolveSelection(['2024','2026'],2026,2025),{baseYear:'2026',compareYear:'2024'});
  assert.deepEqual(manager.resolveSelection(['2024','2025','2026'],2026,2024),{baseYear:'2026',compareYear:'2024'});
  assert.deepEqual(manager.resolveSelection(['2024','2025','2026'],2026,null),{baseYear:'2026',compareYear:null});
});

test('最後の1年度と未登録年度は削除できない',()=>{
  const all=snapshot();
  assert.throws(()=>manager.removeYear(all,'a','2024'),/登録されていません/);
  all.stores.a.years=['2026'];
  assert.throws(()=>manager.removeYear(all,'a','2026'),/最後の1年度/);
});
