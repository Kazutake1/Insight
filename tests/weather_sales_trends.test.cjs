const test=require('node:test');
const assert=require('node:assert/strict');
const trends=require('../insight_weather_sales_trends_v1.js');
const history=require('../insight_trip_history_resolver_v1.js');
const readiness=require('../insight_weather_sales_readiness_v1.js');

function sample(date,weekday,weather,sales,max=24,min=0,dayType='weekday'){
  return {date,weekday,weather,sales,tempMaxC:max,tempMinC:min,dayType};
}
function report(samples,opts={}){
  return {store:{id:'A',name:'A店'},period:{startDate:'2026-09-01',endDate:'2026-10-19',days:49},
    policy:{savedOnly:true,historicalTripResolver:true,excludeEvents:true,
      segregateDayTypes:true,minimumCohortDays:3},
    categories:[{id:'food',name:'おにぎり',hidden:false,trips:[
      {trip:1,counts:{missingSales:opts.missingSales||0,eligible:samples.length},samples},
      {trip:2,counts:{inactiveTrip:49},samples:[]}
    ]}]
  };
}
function mondaySix(){
  return [
    sample('2026-09-07',1,'晴',100,22),
    sample('2026-09-14',1,'晴',110,23),
    sample('2026-09-21',1,'晴',90,24),
    sample('2026-09-28',1,'雨',70,8),
    sample('2026-10-05',1,'雨',80,7),
    sample('2026-10-12',1,'雨',60,9)
  ];
}
function mon(result){return result.categories[0].trips[0].byCalendar.find(c=>c.dayType==='weekday'&&c.weekday===1);}
function weatherPair(group){return group.weather.comparisons[0];}
function tempPair(group){return group.temperature.comparisons[0];}

test('同じ曜日の晴3日と雨3日の販売平均を比較し、右－左で増減率を算出',()=>{
  const input=report(mondaySix(),{missingSales:2});
  const before=JSON.stringify(input),out=trends.summarize(input),group=mon(out);
  assert.equal(group.sampleCount,6);
  assert.deepEqual(group.weather.cohorts.map(x=>[x.key,x.sampleCount,x.meanSales]),[
    ['晴',3,100],['雨',3,70]
  ]);
  assert.deepEqual({...weatherPair(group)},{
    leftKey:'晴',rightKey:'雨',leftCount:3,rightCount:3,leftMean:100,
    rightMean:70,difference:-30,changePercent:-30,status:'ready'
  });
  assert.equal(out.categories[0].trips[0].excludedCounts.missingSales,2);
  assert.equal(out.policy.status,'descriptive-only-not-causal-or-a-forecast');
  assert.equal(out.categories[0].trips[1].byCalendar.length,0);
  assert.equal(JSON.stringify(input),before);
});

test('同曜日の最高気温帯で平均・件数・差額・増減率を算出',()=>{
  const group=mon(trends.summarize(report(mondaySix())));
  assert.deepEqual(group.temperature.cohorts.map(x=>[x.key,x.sampleCount,x.meanSales]),[
    ['below10',3,70],['20to30',3,100]
  ]);
  const pair=tempPair(group);
  assert.equal(pair.leftMean,70);
  assert.equal(pair.rightMean,100);
  assert.equal(pair.difference,30);
  assert.ok(Math.abs(pair.changePercent-42.85714285714286)<1e-10);
  assert.equal(pair.status,'ready');
});

test('曜日が違えば天気が同じでも同じ比較母集団に混ぜない',()=>{
  const extra=[
    sample('2026-09-08',2,'晴',999),sample('2026-09-15',2,'雨',1),
    sample('2026-09-01',2,'晴',999)
  ];
  const result=trends.summarize(report([...mondaySix(),...extra]));
  assert.equal(mon(result).weather.cohorts[0].meanSales,100);
  const tue=result.categories[0].trips[0].byCalendar.find(x=>x.weekday===2);
  assert.equal(tue.sampleCount,3);
  assert.equal(tue.weather.comparisons[0].status,'insufficient_samples');
});

test('通常の月曜日と祝日の月曜日、日曜日を分ける',()=>{
  const extras=[
    sample('2026-09-07',1,'晴',99,20,10,'sundayHoliday'),
    sample('2026-09-14',1,'雨',99,20,10,'sundayHoliday'),
    sample('2026-09-06',0,'雨',99,20,10,'sundayHoliday')
  ];
  // Keep holiday Mondays distinct from regular Mondays within the reporting period.
  extras[0].date='2026-10-19';
  extras[1].date='2026-10-26';
  const fixture=report([...mondaySix(),...extras]);
  fixture.period.endDate='2026-10-26';
  fixture.period.days=56;
  const result=trends.summarize(fixture);
  const groups=result.categories[0].trips[0].byCalendar;
  assert.equal(mon(result).sampleCount,6);
  assert.equal(groups.filter(x=>x.dayType==='sundayHoliday').length,2);
  assert.equal(groups.find(x=>x.dayType==='sundayHoliday'&&x.weekday===1).sampleCount,2);
});

test('サンプル2件以下は平均を確定せず増減率を作らない',()=>{
  const rows=[...mondaySix().slice(0,2),...mondaySix().slice(3)];
  const group=mon(trends.summarize(report(rows)));
  assert.equal(group.weather.cohorts[0].sampleCount,2);
  assert.equal(group.weather.cohorts[0].sufficient,false);
  assert.equal(group.weather.cohorts[0].meanSales,null);
  assert.equal(weatherPair(group).status,'insufficient_samples');
  assert.equal(weatherPair(group).changePercent,null);
  assert.equal(weatherPair(group).difference,null);
});

test('有効0個を含め、基準平均が0なら変化率は算出しない',()=>{
  const zeros=mondaySix().map((s,i)=>({...s,sales:i<3?0:5}));
  const group=mon(trends.summarize(report(zeros)));
  assert.equal(group.weather.cohorts[0].meanSales,0);
  assert.equal(group.weather.cohorts[1].meanSales,5);
  const pair=weatherPair(group);
  assert.equal(pair.status,'zero_baseline');
  assert.equal(pair.leftMean,0);
  assert.equal(pair.rightMean,5);
  assert.equal(pair.difference,5);
  assert.equal(pair.changePercent,null);
});

test('最高気温の境界値は0℃や負の値も含めて4区分に分類',()=>{
  assert.equal(trends.bandFor(-9),'below10');
  assert.equal(trends.bandFor(0),'below10');
  assert.equal(trends.bandFor(9.99),'below10');
  assert.equal(trends.bandFor(10),'10to20');
  assert.equal(trends.bandFor(19.99),'10to20');
  assert.equal(trends.bandFor(20),'20to30');
  assert.equal(trends.bandFor(29.99),'20to30');
  assert.equal(trends.bandFor(30),'30plus');
  assert.throws(()=>trends.bandFor(NaN),/不正/);
});

test('不正なサンプル、同一日の重複、実績の不明なデータを静かに取り込まない',()=>{
  const duplicate=[...mondaySix(),{...mondaySix()[0]}];
  assert.throws(()=>trends.summarize(report(duplicate)),/重複/);
  for(const field of [
    {sales:null},{sales:-1},{sales:2.5},{tempMaxC:null},{tempMinC:999},
    {weather:''},{weekday:8},{dayType:'weekday',weekday:0}
  ]){
    assert.throws(()=>trends.summarize(report([{...mondaySix()[0],...field}])),/不正値/);
  }
  const unsafe=report(mondaySix());unsafe.policy.historicalTripResolver=false;
  assert.throws(()=>trends.summarize(unsafe),/判定結果/);
});

test('前段の保存済みデータ判定を呼び出し、イベント日・天気なし・販売未入力を除外',()=>{
  const mondays=[
    {date:'2026-09-07',weather:'晴',sales:100,temp:24},
    {date:'2026-09-14',weather:'晴',sales:110,temp:23},
    {date:'2026-09-21',weather:'晴',sales:90,temp:22},
    {date:'2026-09-28',weather:'雨',sales:70,temp:8},
    {date:'2026-10-05',weather:'雨',sales:80,temp:7},
    {date:'2026-10-12',weather:'雨',sales:60,temp:9},
    {date:'2026-10-19',weather:'晴',sales:999,temp:23}
  ];
  const monthRows={'9月':[],'10月':[]},salesCounts={};
  mondays.forEach(item=>{
    const month=item.date.slice(5,7)==='09'?'9月':'10月',d=Number(item.date.slice(-2));
    monthRows[month][d-1]={d:String(d),weather:item.weather,tempMaxC:item.temp,tempMinC:5};
    salesCounts[item.date]={food:{trips:[
      {delivery:100,sales:item.sales},{delivery:null,sales:null},{delivery:null,sales:null}
    ]}};
  });
  const snapshot={current:'A',stores:{A:{name:'A店',data:{2026:monthRows},salesCounts}},
    salesCountManagement:{categories:[{id:'food',name:'おにぎり',activeTrips:[true,false,false],hidden:false}]}};
  const original=JSON.stringify(snapshot);
  const analysis={buildRange(){
    return {daily:mondays.map(item=>({date:item.date,conditions:{
      weekday:1,holiday:false,eventIds:item.date==='2026-10-19'?['sale']:[],
      weather:item.weather
    }}))};
  }};
  const out=trends.analyze(snapshot,{
    today:'2026-10-22',startDate:'2026-09-07',endDate:'2026-10-19'
  },{analysis,resolver:history,readiness});
  const first=out.categories[0].trips[0];
  assert.equal(first.eligibleDays,6);
  assert.equal(first.excludedCounts.eventDay,1);
  assert.equal(weatherPair(mon(out)).changePercent,-30);
  assert.equal(JSON.stringify(snapshot),original);
});
