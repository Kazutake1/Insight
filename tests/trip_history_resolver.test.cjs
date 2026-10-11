const test=require('node:test');
const assert=require('node:assert/strict');
const history=require('../insight_trip_history_resolver_v1.js');

const opts={today:'2026-10-11'};
const trip=(delivery=null,sales=null)=>({delivery,sales});
const row=(a=trip(),b=trip(),c=trip())=>({trips:[a,b,c]});
function fixture(){
  return {schemaVersion:1,current:'a',salesCountManagement:{version:1,categories:[
    {id:'food',name:'食品',activeTrips:[true,true,true]},{id:'other',name:'別カテゴリー',activeTrips:[false,true,true]}
  ]},stores:{a:{name:'A',salesCounts:{}},b:{name:'B',salesCounts:{}}}};
}
function fill(s,store,category,month,days,make){
  for(let i=1;i<=days;i++){
    const date=month+'-'+String(i).padStart(2,'0');
    (s.stores[store].salesCounts[date]??={})[category]=make(i);
  }
}
function override(s,store,cat,month,tripNumber,status){
  const data=(s.stores[store].tripHistoryOverrides??={version:1,categories:{}});
  (((data.categories[cat]??={})[month]??={})[String(tripNumber)])=status;
}
const month=(s,store='a',cat='food',m='2026-09')=>history.monthly(s,store,cat,m,opts);
const day=(s,date,store='a',cat='food')=>history.resolveDate(s,store,cat,date,opts);

test('旧データは読取専用、対象便不明を勝手に対象外にしない',()=>{
  const s=fixture(),original=JSON.stringify(s),report=month(s);
  assert.deepEqual(report.trips.map(t=>t.status),['unknown','unknown','unknown']);
  assert.equal(JSON.stringify(s),original);
});

test('2026年9月の推定は他便7日以上のときだけ対象外にする',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',8,i=>row(trip(i,i),trip(i,0)));
  const report=month(s);
  assert.deepEqual(report.trips.map(t=>t.status),['active','active','inactive']);
  assert.equal(report.trips[2].source,'inference');
  assert.equal(report.trips[2].tentative,true);
  assert.deepEqual(day(s,'2026-09-08').mask,[true,true,false]);
});

test('証拠不足6日では未知の便を対象外にしない',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',6,i=>row(trip(i,0),trip(i,0)));
  assert.deepEqual(day(s,'2026-09-02').mask,[true,true,null]);
});

test('手動対象と手動対象外の区別、解除後の自動復帰',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',8,i=>row(trip(i,i),trip(i,i)));
  override(s,'a','food','2026-09',3,'active');
  assert.deepEqual(day(s,'2026-09-04').mask,[true,true,true]);
  assert.equal(month(s).trips[2].source,'manual');
  s.stores.a.tripHistoryOverrides.categories.food['2026-09']['3']='inactive';
  assert.equal(day(s,'2026-09-04').mask[2],false);
  delete s.stores.a.tripHistoryOverrides.categories.food['2026-09']['3'];
  assert.equal(day(s,'2026-09-04').mask[2],false);
  assert.equal(month(s).trips[2].tentative,true);
});

test('入力された0個は実績として保護し、対象外と表示しない',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',9,i=>row(trip(0,0),trip(i,0)));
  override(s,'a','food','2026-09',1,'inactive');
  const d=day(s,'2026-09-03');
  assert.equal(d.mask[0],true);
  assert.equal(d.trips[0].source,'observed_day');
  assert.equal(d.trips[0].conflict,true);
  assert.equal(d.needsReview,true);
});

test('月途中の変更が疑われる便は入力日のみ対象、他の日は未確認',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',10,i=>row(trip(i,i),trip(i,i),i===10?trip(0,0):trip()));
  const report=month(s);
  assert.equal(report.trips[2].needsDateReview,true);
  assert.equal(report.trips[2].status,'unknown');
  assert.equal(day(s,'2026-09-09').mask[2],null);
  assert.equal(day(s,'2026-09-10').mask[2],true);
});

test('店舗・カテゴリー・年月の設定は混ざらない',()=>{
  const s=fixture();
  override(s,'a','food','2026-09',3,'active');
  override(s,'b','food','2026-09',3,'inactive');
  override(s,'a','other','2026-09',3,'inactive');
  override(s,'a','food','2026-08',3,'inactive');
  assert.equal(day(s,'2026-09-05').mask[2],true);
  assert.equal(day(s,'2026-09-05','b').mask[2],false);
  assert.equal(day(s,'2026-09-05','a','other').mask[2],false);
  assert.equal(day(s,'2026-08-05').mask[2],false);
});

test('当月は既存の現行対象便設定を維持する',()=>{
  const s=fixture();
  assert.deepEqual(day(s,'2026-10-05','a','other').mask,[false,true,true]);
  assert.equal(month(s,'a','other','2026-10').completed,false);
});

test('未確認の便がある日の1日平均は算出せず、便別平均は維持する',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',6,i=>row(trip(i,0),trip(2,0)));
  const rows=[1,2,3,4,5,6].map(i=>({
    date:'2026-09-'+String(i).padStart(2,'0'),
    record:s.stores.a.salesCounts['2026-09-'+String(i).padStart(2,'0')].food
  }));
  const a=history.averageByDate(s,'a','food',rows,'sales',opts);
  assert.equal(a.total,null);
  assert.deepEqual(a.trips,[0,0,null]);
  assert.equal(a.totalDays,0);
  assert.equal(a.unverifiedDates.length,6);
});

test('明示0を含む完了日のみ合計平均し、対象外推定を記録する',()=>{
  const s=fixture();
  fill(s,'a','food','2026-09',8,i=>row(trip(i,i===1?0:i),trip(2,0)));
  const rows=Object.keys(s.stores.a.salesCounts).map(date=>({date,record:s.stores.a.salesCounts[date].food}));
  const saved=JSON.stringify(s),a=history.averageByDate(s,'a','food',rows,'sales',opts);
  assert.equal(a.totalDays,8);
  assert.equal(a.total,(0+2+3+4+5+6+7+8)/8);
  assert.equal(a.trips[0],a.total);
  assert.equal(a.trips[2],null);
  assert.equal(a.estimatedDates.length,8);
  assert.equal(JSON.stringify(s),saved);
});

test('終了月が異なるとその月の設定に基づき各日を集計する',()=>{
  const s=fixture();
  fill(s,'a','food','2026-08',8,i=>row(trip(10,10),trip(10,10),trip(10,10)));
  fill(s,'a','food','2026-09',8,i=>row(trip(10,10),trip(10,10)));
  const rows=['2026-08-01','2026-09-01'].map(date=>({date,record:s.stores.a.salesCounts[date].food}));
  const a=history.averageByDate(s,'a','food',rows,'sales',opts);
  assert.equal(a.total,25);
  assert.equal(a.totalDays,2);
});

test('不正な保存形式、不正な日付や値は曖昧に補正しない',()=>{
  const s=fixture();
  assert.throws(()=>history.resolveDate(s,'a','food','2026-02-31',opts),/Invalid date/);
  assert.throws(()=>history.averageByDate(s,'a','food',[],'waste',opts),/metric/);
  s.stores.a.tripHistoryOverrides={version:2,categories:{}};
  assert.throws(()=>month(s),/形式/);
});

test('破損したレコードがある月は推定で対象外を断定しない',()=>{
  const s=fixture();fill(s,'a','food','2026-09',8,i=>row(trip(i,i),trip(i,i)));
  s.stores.a.salesCounts['2026-09-01'].food.trips[0].delivery=-3;
  const report=month(s);
  assert.equal(report.invalidRecordDays,1);
  assert.deepEqual(report.trips.map(x=>x.status),['unknown','unknown','unknown']);
});

test('年月日が2026年9月以降でも現在の設定や保存キーを変更しない',()=>{
  const s=fixture(),before=JSON.stringify(s);
  day(s,'2026-11-01');
  history.averageByDate(s,'a','food',[], 'sales', opts);
  assert.equal(s.schemaVersion,1);
  assert.equal(JSON.stringify(s),before);
});
