const test=require('node:test');
const assert=require('node:assert/strict');
const inference=require('../insight_trip_inference_v1.js');

const TODAY='2026-10-11';
const options={today:TODAY};
function record(d=null,s=null){return {delivery:d,sales:s};}
function entry(first,second,third){return {trips:[first||record(),second||record(),third||record()]};}
function make(){
  return {current:'storeA',stores:{storeA:{salesCounts:{}},storeB:{salesCounts:{}}},salesCountManagement:{
    version:1,categories:[{id:'cat1',name:'カテゴリA',activeTrips:[true,true,false]}]}};
}
function add(snapshot,store,category,date,recordValue){
  const data=snapshot.stores[store].salesCounts;
  if(!data[date])data[date]={};
  data[date][category]=recordValue;
}
function fill(snapshot,store,category,month,days,recordFactory){
  for(let i=1;i<=days;i++)add(snapshot,store,category,month+'-'+String(i).padStart(2,'0'),recordFactory(i));
}
function statuses(report){return report.trips.map(t=>t.status);}

test('入力された0は対象便の確定した実績、nullは未入力として区別する',()=>{
  const snapshot=make();
  add(snapshot,'storeA','cat1','2026-09-01',entry(record(0,0),null,record(0,null)));
  const report=inference.inferMonth(snapshot,'storeA','cat1','2026-09',options);
  assert.deepEqual(statuses(report),['observed_active','unknown','observed_active']);
  assert.equal(report.trips[0].deliveryDays,1);
  assert.equal(report.trips[0].salesDays,1);
  assert.equal(report.trips[2].deliveryDays,1);
  assert.equal(report.trips[2].salesDays,0);
});

test('他便の入力が7日以上ある完了月で一度も入力されない便のみ推定対象外にする',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-09',9,i=>entry(record(i,0),record(i,null),record()));
  const before=JSON.stringify(snapshot);
  const report=inference.inferMonth(snapshot,'storeA','cat1','2026-09',options);
  assert.deepEqual(statuses(report),['observed_active','observed_active','inferred_inactive']);
  assert.equal(report.trips[2].otherTripObservedDays,9);
  assert.equal(report.trips[2].observedDays,0);
  assert.equal(report.minEvidenceDays,7);
  assert.equal(JSON.stringify(snapshot),before,'推定は保存済み実績と現行対象便設定を変更しない');
  assert.deepEqual(snapshot.salesCountManagement.categories[0].activeTrips,[true,true,false]);
});

test('他便の入力日数は便ごとに二重計上せず異なる日付だけを数える',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-09',4,i=>entry(record(i,null),record(null,i),record()));
  const report=inference.inferMonth(snapshot,'storeA','cat1','2026-09',options);
  assert.equal(report.trips[2].otherTripObservedDays,4);
  assert.equal(report.trips[2].status,'unknown');
});

test('他便の入力が少ない月は推定対象外と断定せず判定不能にする',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-09',6,i=>entry(record(i,null),record(),record()));
  assert.deepEqual(statuses(inference.inferMonth(snapshot,'storeA','cat1','2026-09',options)),
    ['observed_active','unknown','unknown']);
});

test('当月や未来月では7日以上の他便実績があっても対象外と推定しない',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-10',9,i=>entry(record(i,null),record(),record()));
  const report=inference.inferMonth(snapshot,'storeA','cat1','2026-10',options);
  assert.equal(report.monthCompleted,false);
  assert.deepEqual(statuses(report),['observed_active','unknown','unknown']);
});

test('店舗・カテゴリー・月を跨いだ記録は判定に混入させない',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-09',8,i=>entry(record(i,0),record(),record()));
  fill(snapshot,'storeB','cat1','2026-09',8,i=>entry(record(),record(),record(i,0)));
  fill(snapshot,'storeA','cat2','2026-09',8,i=>entry(record(),record(),record(i,0)));
  fill(snapshot,'storeA','cat1','2026-08',8,i=>entry(record(),record(),record(i,0)));
  assert.equal(inference.inferMonth(snapshot,'storeA','cat1','2026-09',options).trips[2].status,'inferred_inactive');
  assert.equal(inference.inferMonth(snapshot,'storeB','cat1','2026-09',options).trips[2].status,'observed_active');
  assert.equal(inference.inferMonth(snapshot,'storeA','cat2','2026-09',options).trips[2].status,'observed_active');
  assert.equal(inference.inferMonth(snapshot,'storeA','cat1','2026-08',options).trips[2].status,'observed_active');
});

test('当時は対象外でも現行は対象の便は、入力0件かつ十分な証拠があると推定対象外にできる',()=>{
  const snapshot=make();
  snapshot.salesCountManagement.categories[0].activeTrips=[true,true,true];
  fill(snapshot,'storeA','cat1','2026-09',12,i=>entry(record(i,null),record(0,i),record()));
  assert.equal(inference.inferMonth(snapshot,'storeA','cat1','2026-09',options).trips[2].status,'inferred_inactive');
});

test('過去に数値が1日だけある便も除外せず、月途中の変更可能性を示す',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-09',10,i=>entry(record(i,null),record(i,null),record()));
  snapshot.stores.storeA.salesCounts['2026-09-10'].cat1.trips[2]=record(0,null);
  const report=inference.inferMonth(snapshot,'storeA','cat1','2026-09',options);
  assert.equal(report.trips[2].status,'observed_active');
  assert.equal(report.trips[2].observedDays,1);
  assert.equal(report.trips[2].needsDateReview,true);
});

test('不正な記録があれば未入力便を推定対象外にせず判定不能にする',()=>{
  const snapshot=make();
  fill(snapshot,'storeA','cat1','2026-09',8,i=>entry(record(i,null),record(),record()));
  snapshot.stores.storeA.salesCounts['2026-09-07'].cat1.trips[1]={delivery:-1,sales:null};
  const report=inference.inferMonth(snapshot,'storeA','cat1','2026-09',options);
  assert.equal(report.invalidRecordDays,1);
  assert.equal(report.trips[2].status,'unknown');
});

test('過去月の入力履歴一覧は該当店舗・カテゴリーの保存日付だけから返す',()=>{
  const snapshot=make();
  add(snapshot,'storeA','cat1','2026-08-11',entry(record(5,null)));
  add(snapshot,'storeA','cat1','2026-09-11',entry(record(6,null)));
  add(snapshot,'storeA','cat2','2026-07-11',entry(record(7,null)));
  const before=JSON.stringify(snapshot);
  const list=inference.inferAvailableMonths(snapshot,'storeA','cat1',options);
  assert.deepEqual(list.map(x=>x.month),['2026-08','2026-09']);
  assert.equal(JSON.stringify(snapshot),before);
});

test('入力記録が全くない月は対象外ではなく判定不能にする',()=>{
  const report=inference.inferMonth(make(),'storeA','cat1','2026-09',options);
  assert.deepEqual(statuses(report),['unknown','unknown','unknown']);
  assert.equal(report.recordDays,0);
});

test('不正な年月・店舗・閾値は推測せずエラーにする',()=>{
  const snapshot=make();
  assert.throws(()=>inference.inferMonth(snapshot,'storeA','cat1','2026-13',options),/YYYY-MM/);
  assert.throws(()=>inference.inferMonth(snapshot,'missing','cat1','2026-09',options),/Unknown store/);
  assert.throws(()=>inference.inferMonth(snapshot,'storeA','cat1','2026-09',{today:TODAY,minEvidenceDays:0}),/1 to 31/);
  assert.throws(()=>inference.inferMonth(snapshot,'storeA','cat1','2026-09',{today:'invalid'}),/valid local today/);
});
