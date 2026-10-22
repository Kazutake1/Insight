const test=require('node:test');
const assert=require('node:assert/strict');
const readiness=require('../insight_weather_sales_readiness_v1.js');
const history=require('../insight_trip_history_resolver_v1.js');

function date(month,day){return '2026-'+month+'-'+String(day).padStart(2,'0');}
function daily(d,weather='晴',max=20,min=10){return {d:String(d),weather,tempMaxC:max,tempMinC:min};}
function record(sales){return {trips:[
  {delivery:10,sales:sales},{delivery:null,sales:null},{delivery:null,sales:null}
]};}
function fixture(month='10',days=8){
  const rows=[],counts={};
  for(let d=1;d<=days;d++){
    rows[d-1]=daily(d);
    counts[date(month,d)]={food:record(d)};
  }
  return {current:'a',salesCountManagement:{categories:[
    {id:'food',name:'おにぎり',activeTrips:[true,false,false],hidden:false}
  ]},stores:{
    a:{name:'A店',data:{2026:{[Number(month)+'月']:rows}},salesCounts:counts},
    b:{name:'B店',data:{},salesCounts:{}}
  }};
}
function fakeContext(snapshot,meta={}){
  return {buildRange(start,end,storeId){
    const result=[];
    const store=snapshot.stores[storeId];
    for(const [month,rows] of Object.entries(store.data?.['2026']||{})){
      for(const row of rows){
        if(!row)continue;
        const key=date(String(Number(month.replace('月',''))).padStart(2,'0'),Number(row.d));
        if(key<start||key>end)continue;
        const day=new Date(key+'T12:00:00Z').getUTCDay();
        result.push({date:key,metrics:{inputDays:0},conditions:{
          weekday:day,holiday:(meta.holidays||[]).includes(key),
          eventIds:(meta.events||[]).includes(key)?['event']:[],
          weather:row.weather
        }});
      }
    }
    return {daily:result};
  }};
}
function examine(s,opts={},meta={}){
  return readiness.examine(s,{today:'2026-10-22',startDate:'2026-10-01',endDate:'2026-10-08',...opts},
    {analysis:fakeContext(s,meta),resolver:history});
}
function trip(report,index=0){return report.categories[0].trips[index];}

test('明示的な販売0件と0℃を入力済みとし、天気・曜日グループを区別する',()=>{
  const snapshot=fixture(),original=JSON.stringify(snapshot);
  snapshot.stores.a.data[2026]['10月'][0]=daily(1,'晴',0,-2);
  snapshot.stores.a.salesCounts['2026-10-01'].food.trips[0].sales=0;
  snapshot.stores.a.data[2026]['10月'][2].weather='雨';
  snapshot.stores.a.data[2026]['10月'][6].weather='雨';
  const before=JSON.stringify(snapshot);
  const result=examine(snapshot,{}, {holidays:['2026-10-07']});
  const one=trip(result);
  assert.equal(one.eligibleDays,8);
  assert.equal(one.counts.eligible,8);
  assert.equal(one.samples[0].sales,0);
  assert.equal(one.samples[0].tempMaxC,0);
  assert.equal(one.samples[0].tempMinC,-2);
  assert.equal(one.samples.find(row=>row.date==='2026-10-07').dayType,'sundayHoliday');
  assert.deepEqual(result.categories[0].trips.slice(1).map(t=>t.counts.inactiveTrip),[8,8]);
  assert.equal(result.policy.status,'input-readiness-only-not-a-demand-forecast');
  assert.equal(JSON.stringify(snapshot),before);
  assert.notEqual(original,before);
});

test('イベントを除外し、天気・気温・販売の欠損を別々に判定する',()=>{
  const s=fixture();
  s.stores.a.data[2026]['10月'][3].weather='';
  delete s.stores.a.data[2026]['10月'][4].tempMaxC;
  s.stores.a.salesCounts['2026-10-08'].food.trips[0].sales=null;
  const out=examine(s,{}, {events:['2026-10-06']});
  const one=trip(out);
  assert.equal(one.eligibleDays,4);
  assert.equal(one.counts.eventDay,1);
  assert.equal(one.counts.missingWeather,1);
  assert.equal(one.counts.missingTemperature,1);
  assert.equal(one.counts.missingSales,1);
  assert.equal(one.counts.eligible,4);
  assert.equal(Object.values(one.counts).reduce((a,b)=>a+b,0),8);
});

test('日の保存行が欠けても他日の記録から天気を推定しない',()=>{
  const s=fixture();
  s.stores.a.data[2026]['10月'][1]=null;
  const report=examine(s);
  assert.equal(trip(report).counts.missingDailyRow,1);
  assert.equal(trip(report).eligibleDays,7);
});

test('過去便は現行設定で決めつけず、判定不能の便を除外しない',()=>{
  const s=fixture('09',1);
  s.salesCountManagement.categories[0].activeTrips=[false,false,false];
  const opts={startDate:'2026-09-01',endDate:'2026-09-01'};
  const before=JSON.stringify(s);
  const report=examine(s,opts);
  assert.equal(trip(report).eligibleDays,1); // 保存された販売0を含む明示データ
  assert.equal(trip(report,1).counts.unknownTrip,1);
  assert.equal(trip(report,2).counts.unknownTrip,1);
  assert.equal(JSON.stringify(s),before);
});

test('過去の手動対象便設定を尊重し、同月の現在の便設定を遡及しない',()=>{
  const s=fixture('09',1);
  s.salesCountManagement.categories[0].activeTrips=[false,true,true];
  s.stores.a.tripHistoryOverrides={version:1,categories:{food:{
    '2026-09':{'1':'active','2':'inactive','3':'inactive'}
  }}};
  const r=examine(s,{startDate:'2026-09-01',endDate:'2026-09-01'});
  assert.equal(trip(r).eligibleDays,1);
  assert.deepEqual(r.categories[0].trips.slice(1).map(t=>t.counts.inactiveTrip),[1,1]);
});

test('過去の推定対象外を確定した対象外と混同しない',()=>{
  const s=fixture('09',8);
  const category=s.salesCountManagement.categories[0];
  category.activeTrips=[true,true,true];
  const r=examine(s,{startDate:'2026-09-01',endDate:'2026-09-08'});
  assert.equal(trip(r,0).eligibleDays,8);
  assert.equal(trip(r,1).counts.tentativeInactiveTrip,8);
  assert.equal(trip(r,2).counts.tentativeInactiveTrip,8);
  assert.equal(trip(r,1).counts.inactiveTrip,0);
});

test('同じ曜日・天気のサンプル件数が3未満なら比較可能と判断しない',()=>{
  const s=fixture('10',9);
  const r=examine(s,{endDate:'2026-10-09'});
  const sunnyWeekday=trip(r).cohorts.find(c=>c.dayType==='weekday'&&c.weather==='晴');
  assert.equal(sunnyWeekday.minimumMet,true);
  assert.ok(sunnyWeekday.count>=3);
  const single=examine(s,{startDate:'2026-10-01',endDate:'2026-10-01'});
  assert.equal(trip(single).cohorts[0].minimumMet,false);
});

test('別店舗の記録を混ぜず、当日・未来日・不正な期間を拒否する',()=>{
  const s=fixture();
  const empty=examine(s,{storeId:'b'});
  assert.equal(trip(empty).eligibleDays,0);
  assert.equal(trip(empty).counts.unknownTrip,0);
  // 現在月の対象便設定上、記録は有効だが保存日行はない
  assert.equal(trip(empty).counts.missingDailyRow,8);
  assert.throws(()=>examine(s,{endDate:'2026-10-22'}),/終了日/);
  assert.throws(()=>examine(s,{startDate:'2026-10-10',endDate:'2026-10-08'}),/期間/);
  assert.equal(readiness.validTemp(''),false);
  assert.equal(readiness.validTemp('  '),false);
  assert.equal(readiness.validTemp(null),false);
  assert.equal(readiness.validTemp(0),true);
});
