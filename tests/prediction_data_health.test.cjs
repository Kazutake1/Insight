const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../insight_prediction_data_health_v1.js');

function sample(){
  const rows=Array.from({length:30},(_,i)=>({d:String(i+1),客数:0,weather:''}));
  rows[0]={d:'1',客数:0,weather:'晴',tempMaxC:28,tempMinC:22};
  rows[1]={d:'2',客数:14,weather:'雨',tempMaxC:27,tempMinC:20};
  rows[2]={d:'3',客数:0,weather:''};
  rows[3]={d:'4',客数:16,weather:'曇',tempMaxC:0,tempMinC:10};
  return {
    current:'a',salesCountManagement:{categories:[
      {id:'food',name:'おにぎり',activeTrips:[true,false,true],hidden:false},
      {id:'extra',name:'その他',activeTrips:[true,true,true],hidden:true}
    ]},
    stores:{
      a:{name:'A店',data:{2025:{'9月':rows}},salesCounts:{
        '2025-09-01':{food:{trips:[{delivery:10,sales:0},{delivery:30,sales:40},{delivery:null,sales:null}]}},
        '2025-09-02':{food:{trips:[{delivery:null,sales:5},{delivery:null,sales:null},{delivery:null,sales:null}]}},
        '2025-09-04':{food:{trips:[{delivery:8,sales:8},{delivery:null,sales:null},{delivery:0,sales:0}]}}
      }},
      b:{name:'B店',data:{},salesCounts:{}}
    }
  };
}

test('入力済みの0を含め、納品・販売を便別に計数し、対象外便は除外する',()=>{
  const data=sample(),before=JSON.stringify(data);
  const report=model.examine(data,{start:'2025-09-01',end:'2025-09-05'});
  const category=report.stores[0].categories[0];
  assert.equal(report.days,5);
  assert.deepEqual(category.trips.map(t=>t.active),[true,true,true]);
  assert.deepEqual(category.trips[0].statusDays,
    {confirmed_active:3,confirmed_inactive:0,review:0,unverified:2});
  assert.equal(category.trips[1].periodStatus,'needs_review');
  assert.deepEqual(
    category.trips[0]&&[category.trips[0].delivery,category.trips[0].sales,category.trips[0].both,category.trips[0].zeroSales,category.trips[0].recentSales],
    [2,3,2,1,3]
  );
  assert.equal(category.trips[0].longestGap,0);
  assert.equal(category.trips[2].sales,0);
  assert.equal(category.trips[2].reviewSaved.sales,1);
  assert.equal(category.trips[2].zeroSales,0);
  assert.equal(category.completeDays,0);
  assert.equal(JSON.stringify(data),before,'診断は元データを変更しない');
});

test('初期値客数0は入力済みと断定せず、天気・気温と別に集計する',()=>{
  const report=model.examine(sample(),{start:'2025-09-01',end:'2025-09-05'});
  const first=report.stores[0];
  assert.equal(first.customersPositive,2);
  assert.equal(first.customersUncertain,3);
  assert.equal(first.weather,3);
  assert.equal(first.temperature,2);
  assert.equal(first.temperatureReversed,1);
  assert.equal(first.temperatureMissing,2);
  assert.equal(first.weatherWithCustomer,1);
  assert.equal(report.stores[1].customersPositive,0);
  assert.equal(report.stores[1].customersUncertain,5);
  assert.equal(report.stores[1].categories[0].trips[0].longestGap,null);
});

test('未入力と0、対象外便、非表示カテゴリー、起点日、未来日を取り違えない',()=>{
  const data=sample();
  data.stores.a.salesCounts['2025-08-30']={food:{trips:[{delivery:10,sales:10}]}};
  const report=model.examine(data,{start:'2025-09-01',end:'2025-09-05'});
  assert.equal(report.stores[0].categories[0].trips[0].sales,3);
  assert.equal(report.stores[0].categories[1].hidden,true);
  assert.throws(()=>model.examine(data,{start:'2025-09-32',end:'2025-10-01'}));
  assert.throws(()=>model.examine(data,{start:'2025-10-05',end:'2025-09-05'}));
  const today=model.examine(data);
  assert.equal(today.start,'2025-09-01');
  const formatted=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const todayParts=Object.fromEntries(formatted.map(p=>[p.type,p.value]));
  assert.ok(today.end<[todayParts.year,todayParts.month,todayParts.day].join('-'),'当日の未確定数値を集計しない');
});

function datedSnapshot(start='2026-10-01',days=5){
  const counts={},rows=[];
  for(let i=0;i<days;i++){
    const day=i+1,date=start.slice(0,8)+String(day).padStart(2,'0');
    counts[date]={food:{trips:[{delivery:5,sales:5},
      {delivery:null,sales:null},{delivery:null,sales:null}]}};
    rows.push({d:String(day),客数:10,weather:'晴',tempMaxC:20,tempMinC:10});
  }
  return {schemaVersion:1,current:'a',
    salesCountManagement:{categories:[{id:'food',name:'食品',activeTrips:[true,false,false]}]},
    stores:{a:{name:'A店',data:{2026:{'10月':rows}},salesCounts:counts},
      b:{name:'B店',data:{},salesCounts:{}}}};
}
function reportTrip(s,options={}){
  return model.examine(s,{start:'2026-10-01',end:'2026-10-05',
    today:'2026-10-23',...options}).stores[0].categories[0];
}

test('気温の空白・欠損・非数値・最高最低の逆転を区別し0℃と負値は有効',()=>{
  const s=datedSnapshot();
  const rows=s.stores.a.data[2026]['10月'];
  rows[0].tempMaxC=0;rows[0].tempMinC=-2;
  rows[1].tempMaxC='  ';
  rows[2].tempMaxC='broken';
  rows[3].tempMaxC=0;rows[3].tempMinC=10;
  rows[4].tempMaxC=null;
  const before=JSON.stringify(s);
  const r=model.examine(s,{start:'2026-10-01',end:'2026-10-05',today:'2026-10-23'}).stores[0];
  assert.deepEqual([r.temperature,r.temperatureMissing,r.temperatureInvalid,r.temperatureReversed],
    [1,2,1,1]);
  assert.equal(r.weatherWithCustomer,1);
  assert.equal(JSON.stringify(s),before);
});

test('当月は現在の便設定、過去月は対象便履歴を日別に使用し推定を確定と扱わない',()=>{
  const s=datedSnapshot();
  const now=reportTrip(s);
  assert.equal(now.completeDays,5);
  assert.deepEqual(now.trips.map(x=>x.periodStatus),['all_active','all_inactive','all_inactive']);
  // An earlier month has the same saved values but its inactive-trip inference is tentative.
  const old=datedSnapshot();
  old.stores.a.data[2026]['9月']=old.stores.a.data[2026]['10月'];
  old.stores.a.salesCounts=Object.fromEntries(Object.entries(old.stores.a.salesCounts).map(
    ([day,value])=>[day.replace('2026-10','2026-09'),value]));
  const pending=model.examine(old,{start:'2026-09-01',end:'2026-09-05',
    today:'2026-10-23'}).stores[0].categories[0];
  assert.equal(pending.completeDays,0);
  assert.equal(pending.trips[0].sales,5);
  assert.ok(pending.trips[1].statusDays.unverified>0||pending.trips[1].statusDays.review>0);
  // A confirmed manual exemption for both other trips makes fully entered days complete.
  old.stores.a.tripHistoryOverrides={version:1,categories:{food:{
    '2026-09':{'2':'inactive','3':'inactive'}
  }}};
  const verified=model.examine(old,{start:'2026-09-01',end:'2026-09-05',
    today:'2026-10-23'}).stores[0].categories[0];
  assert.equal(verified.completeDays,5);
  assert.deepEqual(verified.trips.map(x=>x.periodStatus),
    ['all_active','all_inactive','all_inactive']);
});

test('納品だけのobserved_dayは販売入力に変換せず、明示0と競合情報を保存',()=>{
  const s=datedSnapshot();
  s.stores.a.salesCounts['2026-10-01'].food.trips[0]={delivery:0,sales:null};
  const incomplete=reportTrip(s);
  assert.equal(incomplete.trips[0].delivery,5);
  assert.equal(incomplete.trips[0].sales,4);
  assert.equal(incomplete.completeDays,4);
  // Completed past month: an inactive manual override conflicts with saved zero.
  const old=datedSnapshot();
  old.stores.a.data[2026]['9月']=old.stores.a.data[2026]['10月'];
  old.stores.a.salesCounts={'2026-09-01':{food:{trips:[
    {delivery:0,sales:0},{delivery:null,sales:null},{delivery:null,sales:null}
  ]}}};
  old.stores.a.tripHistoryOverrides={version:1,categories:{food:{
    '2026-09':{'1':'inactive','2':'inactive','3':'inactive'}
  }}};
  const before=JSON.stringify(old);
  const result=model.examine(old,{start:'2026-09-01',end:'2026-09-01',
    today:'2026-10-23'}).stores[0].categories[0];
  assert.equal(result.completeDays,0);
  assert.equal(result.trips[0].statusDays.review,1);
  assert.equal(result.trips[0].reviewSaved.sales,1);
  assert.equal(result.trips[0].reviewSaved.delivery,1);
  assert.equal(JSON.stringify(old),before);
});

test('確定対象外日を挟んだ連続欠損を連結せず、対象便未確認日の保存数値を分離',()=>{
  const s=datedSnapshot();
  s.stores.a.salesCounts['2026-10-02'].food.trips[0]={delivery:5,sales:null};
  s.stores.a.salesCounts['2026-10-04'].food.trips[0]={delivery:5,sales:null};
  const resolver={resolveDate(_snapshot,_store,_category,date){
    const inactive=date==='2026-10-03';
    return {trips:[{status:inactive?'inactive':'active',
      source:inactive?'manual':'current',tentative:false,needsDateReview:false},
      {status:'inactive',source:'current',tentative:false,needsDateReview:false},
      {status:'inactive',source:'current',tentative:false,needsDateReview:false}]};
  }};
  const result=reportTrip(s,{resolver});
  assert.equal(result.completeDays,2);
  assert.equal(result.trips[0].periodStatus,'mixed');
  assert.equal(result.trips[0].longestGap,0);
  assert.deepEqual(result.trips[0].statusDays,
    {confirmed_active:4,confirmed_inactive:1,review:0,unverified:0});
  assert.equal(result.trips[0].reviewSaved.both,1);
  assert.equal(result.trips[0].sales,2);
});

test('数量関係は診断情報のみ。納品未入力でも販売有効を維持',()=>{
  const s=datedSnapshot();
  const changes=[
    {delivery:2,sales:2},{delivery:2,sales:7},
    {delivery:6,sales:1},{delivery:null,sales:0},
    {delivery:0,sales:0}
  ];
  Object.keys(s.stores.a.salesCounts).sort().forEach((day,i)=>{
    s.stores.a.salesCounts[day].food.trips[0]=changes[i];
  });
  const result=reportTrip(s);
  assert.deepEqual(result.trips[0].quantityRelation,
    {equal:2,salesAboveDelivery:1,salesBelowDelivery:1});
  assert.equal(result.trips[0].sales,5);
  assert.equal(result.trips[0].delivery,4);
  assert.equal(result.trips[0].zeroSales,2);
  assert.equal(result.completeDays,4);
});

test('全便確定対象外の日は完了扱いにせず、便表は全期間対象外と表示する',()=>{
  const s=datedSnapshot();
  s.salesCountManagement.categories[0].activeTrips=[false,false,false];
  s.stores.a.salesCounts={};
  const category=reportTrip(s);
  assert.equal(category.completeDays,0);
  assert.equal(category.allInactiveDays,5);
  assert.deepEqual(category.trips.map(x=>x.active),[false,false,false]);
  assert.equal(category.trips[0].periodStatus,'all_inactive');
  assert.equal(category.trips[0].longestGap,null);
});

test('ブラウザ読み込み順: Resolverが後から存在しても実行時に取得する',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const js=fs.readFileSync(require.resolve('../insight_prediction_data_health_v1.js'),'utf8');
  const sandbox={window:{}};
  vm.runInNewContext(js,sandbox,{filename:'insight_prediction_data_health_v1.js'});
  assert.ok(sandbox.window.InsightPredictionDataHealth);
  const s=datedSnapshot();
  sandbox.window.InsightTripHistoryResolver={
    resolveDate(){
      return {trips:[{status:'active',source:'current',tentative:false,needsDateReview:false},
        {status:'inactive',source:'current',tentative:false,needsDateReview:false},
        {status:'inactive',source:'current',tentative:false,needsDateReview:false}]};
    }
  };
  const r=sandbox.window.InsightPredictionDataHealth.examine(s,{
    start:'2026-10-01',end:'2026-10-05',today:'2026-10-23'});
  assert.equal(r.stores[0].categories[0].completeDays,5);
});
