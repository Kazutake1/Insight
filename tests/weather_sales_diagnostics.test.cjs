const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const diagnosis=require('../insight_weather_sales_diagnostics_v1.js');
const trend=require('../insight_weather_sales_trends_v1.js');

function pair(status){return {status};}
function trip(index,eligible,weather,temperature,missing={}){
  return {trip:index,eligibleDays:eligible,excludedCounts:missing,
    byCalendar:[{weekday:1,dayType:'weekday',weather:{comparisons:weather.map(pair)},
      temperature:{comparisons:temperature.map(pair)}}]};
}
function fakeTrends(){
  const stores={
    a:{store:{id:'a',name:'A店'},categories:[
      {id:'food',name:'おにぎり',hidden:false,trips:[
        trip(1,9,['ready','zero_baseline'],['insufficient_samples'],{missingWeather:4,unknownTrip:2}),
        trip(2,3,['insufficient_samples'],['zero_baseline'],{tentativeInactiveTrip:7}),
        trip(3,0,[],[],{missingSales:84})
      ]},
      {id:'sweet',name:'スイーツ',hidden:true,trips:[
        trip(1,2,[],[],{eventDay:3}),
        trip(2,0,[],[],{}),
        trip(3,0,[],[],{})
      ]}
    ]},
    b:{store:{id:'b',name:'B店'},categories:[
      {id:'food',name:'おにぎり',hidden:false,trips:[
        trip(1,0,[],[],{missingDailyRow:84}),
        trip(2,0,[],[],{}),
        trip(3,0,[],[],{})
      ]}
    ]}
  };
  return {analyze(snapshot,options){
    assert.equal(options.lookbackDays,84);
    assert.equal(snapshot.current,'a');
    return {store:stores[options.storeId].store,
      period:{startDate:'2026-07-30',endDate:'2026-10-21',days:84},
      categories:stores[options.storeId].categories};
  }};
}

test('店舗とカテゴリーを分け、成立条件数・平均差のみ可・除外理由を診断する',()=>{
  const snapshot={current:'a',stores:{a:{name:'A店'},b:{name:'B店'}}};
  const before=JSON.stringify(snapshot),result=diagnosis.examine(snapshot,{today:'2026-10-22'},{trends:fakeTrends()});
  assert.equal(result.localOnly,true);
  assert.equal(result.readOnly,true);
  assert.equal(result.lookbackDays,84);
  assert.equal(result.stores.length,2);
  assert.equal(result.stores[0].readyCategories,1);
  assert.equal(result.stores[1].readyCategories,0);
  const category=result.stores[0].categories[0];
  assert.equal(category.id,'food');
  assert.equal(category.trips[0].status,'comparison_available');
  assert.equal(category.trips[0].eligibleDays,9);
  assert.equal(category.trips[0].weatherPairs,2);
  assert.equal(category.trips[0].weatherRatePairs,1);
  assert.equal(category.trips[0].temperaturePairs,0);
  assert.deepEqual(category.trips[0].issues.map(x=>x.code),['unknownTrip','missingWeather']);
  assert.equal(category.trips[1].status,'difference_only');
  assert.equal(category.trips[1].temperatureRatePairs,0);
  assert.equal(category.trips[2].status,'no_samples');
  assert.equal(result.stores[0].categories[1].hidden,true);
  assert.equal(result.stores[0].categories[1].trips[0].status,'insufficient_pairs');
  assert.equal(JSON.stringify(snapshot),before);
});

test('一方の店舗で分析不能でも別店舗の診断を妨げない',()=>{
  const original=fakeTrends();
  const snapshot={current:'a',stores:{a:{name:'A店'},b:{name:'B店'}}};
  const output=diagnosis.examine(snapshot,{}, {trends:{analyze(s,o){
    if(o.storeId==='b')throw Error('保存済みデータ形式不整合');
    return original.analyze(s,o);
  }}});
  assert.equal(output.stores[0].error,null);
  assert.match(output.stores[1].error,/保存済みデータ形式不整合/);
  assert.deepEqual(output.stores[1].categories,[]);
});

test('不正な参照期間と、分析モジュール不足を区別してエラーにする',()=>{
  const snapshot={current:'a',stores:{a:{name:'A店'}}};
  assert.throws(()=>diagnosis.examine(snapshot,{lookbackDays:0},{trends:fakeTrends()}),/期間/);
  assert.throws(()=>diagnosis.examine(snapshot,{lookbackDays:367},{trends:fakeTrends()}),/期間/);
  assert.throws(()=>diagnosis.examine(null,{}, {trends:fakeTrends()}),/店舗データ/);
  assert.throws(()=>diagnosis.examine(snapshot,{}, {trends:{}}),/モジュール/);
});

test('前段の天気傾向集計結果から、同曜日・祝日区分の条件比較だけを集約',()=>{
  const samples=['晴','晴','晴','雨','雨','雨'].map((weather,i)=>({
    date:'2026-09-'+String(i+1).padStart(2,'0'),
    weekday:1,dayType:'weekday',weather,tempMaxC:i<3?25:7,tempMinC:0,
    sales:i<3?10:20
  }));
  const readiness={examine(_snapshot,options){
    return {store:{id:options.storeId,name:'A店'},period:{startDate:'2026-09-01',endDate:'2026-09-06',days:6},
      policy:{savedOnly:true,historicalTripResolver:true,excludeEvents:true,
        segregateDayTypes:true,minimumCohortDays:3},
      categories:[{id:'food',name:'おにぎり',hidden:false,trips:[
        {trip:1,counts:{eligible:6},samples},
        {trip:2,counts:{unknownTrip:6},samples:[]},
        {trip:3,counts:{inactiveTrip:6},samples:[]}
      ]}]};
  }};
  const snapshot={current:'a',stores:{a:{name:'A店'}}};
  const before=JSON.stringify(snapshot);
  const result=diagnosis.examine(snapshot,{}, {trends:trend,readiness});
  const first=result.stores[0].categories[0].trips[0];
  assert.equal(first.status,'comparison_available');
  assert.equal(first.eligibleDays,6);
  assert.equal(first.weatherPairs,1);
  assert.equal(first.temperaturePairs,1);
  assert.equal(result.stores[0].categories[0].trips[1].issues[0].code,'unknownTrip');
  assert.equal(JSON.stringify(snapshot),before);
});

test('保存・通信を行うAPIを呼ばず、シェルの依存順を維持する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../insight_weather_sales_diagnostics_v1.js'),'utf8');
  const loader=fs.readFileSync(path.join(__dirname,'../insight_shell_loader_v1.js'),'utf8');
  for(const forbidden of [/localStorage\./,/sessionStorage\./,/\.setItem\(/,/fetch\(/,/XMLHttpRequest/,/sendBeacon\(/,/\.save\(/]){
    assert.doesNotMatch(source,forbidden);
  }
  const scripts=['insight_analysis_context_v1.js','insight_weather_sales_readiness_v1.js',
    'insight_weather_sales_trends_v1.js','insight_weather_sales_diagnostics_v1.js'];
  let previous=-1;
  scripts.forEach(name=>{
    const pos=loader.indexOf("'./"+name+'?v=');
    assert.ok(pos>previous,name+' の読込順が不正です');
    previous=pos;
  });
});
