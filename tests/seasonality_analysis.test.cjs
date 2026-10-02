const test=require('node:test');
const assert=require('node:assert/strict');
const season=require('../insight_seasonality_analysis_v1.js');

function makeContext(year,month,throughDay,daily,overrides={}){
  const inputDays=overrides.inputDays===undefined?throughDay:overrides.inputDays;
  return {metrics:{
    salesYen:daily.salesYen*inputDays,
    customers:daily.customers*inputDays,
    customerUnitPrice:daily.customerUnitPrice,
    items:daily.items*inputDays,
    wasteYen:daily.wasteYen*inputDays,
    wasteRate:daily.wasteRate,
    inputDays
  }};
}
function fixture(mode='recurring'){
  const years=['2023','2024','2025','2026'];
  const allStores={current:'a',stores:{a:{name:'A店',years}}};
  function daily(year,month){
    let sales=100,customers=100,unit=1000,items=150,waste=2,wasteRate=2;
    if(mode==='recurring'&&month===10&&year<2026){sales=120;customers=118;items=117;}
    if(mode==='recurring'&&month===10&&year===2026){sales=121;customers=119;items=118;}
    if(mode==='currentOnly'&&month===10&&year===2026){sales=130;customers=128;items=129;}
    if(mode==='recurringLow'&&month===10&&year<2026){sales=80;customers=82;items=83;}
    if(mode==='recurringLow'&&month===10&&year===2026){sales=81;customers=83;items=84;}
    return {salesYen:sales,customers,customerUnitPrice:unit,items,wasteYen:waste,wasteRate};
  }
  const AnalysisContext={
    buildMonth(year,month,throughDay){
      const max=new Date(year,month,0).getDate();
      const days=Math.min(Number(throughDay)||max,max);
      return makeContext(year,month,days,daily(year,month));
    }
  };
  return {allStores,AnalysisContext,getThroughDay(){return 10;},YearComparison:{isCompletedMonth(){return false;}}};
}

test('過去年度で繰り返す10月上昇を季節性として判定する',()=>{
  const deps=fixture('recurring');
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  const sales=result.metrics.salesYen;
  assert.equal(sales.historical.pattern.code,'recurring_high');
  assert.equal(sales.historical.pattern.sampleYears,3);
  assert.ok(sales.historical.pattern.meanIndex>105);
  assert.equal(sales.fit.code,'aligned');
  assert.equal(sales.relationship.code,'recurring_high');
  assert.equal(result.profile[9].metrics.salesYen.pattern.code,'recurring_high');
});

test('過去に季節差がないのに今年だけ高い場合を分離する',()=>{
  const deps=fixture('currentOnly');
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  const sales=result.metrics.salesYen;
  assert.equal(sales.historical.pattern.code,'neutral');
  assert.equal(sales.current.index>105,true);
  assert.equal(sales.fit.code,'above_expected');
  assert.equal(sales.relationship.code,'current_only_high');
});

test('例年低い月も季節的な低下として識別する',()=>{
  const deps=fixture('recurringLow');
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  assert.equal(result.metrics.salesYen.historical.pattern.code,'recurring_low');
  assert.equal(result.metrics.salesYen.relationship.code,'recurring_low');
});

test('月の日数差ではなく入力済み1日平均で季節指数を作る',()=>{
  const deps=fixture('currentOnly');
  const result=season.analyze({year:2026,month:3,throughDay:10,storeId:'a'},deps);
  const history=result.metrics.salesYen.historical;
  assert.equal(history.pattern.code,'neutral');
  history.points.forEach(point=>{if(point.available)assert.ok(Math.abs(point.index-100)<1e-9);});
});

test('年内基準となる月が5か月未満ならその年度は季節判定に使わない',()=>{
  const deps=fixture('recurring');
  const original=deps.AnalysisContext.buildMonth;
  deps.AnalysisContext.buildMonth=(year,month,throughDay)=>{
    if(year===2024&&month<=8&&month!==10)return makeContext(year,month,throughDay,{salesYen:100,customers:100,customerUnitPrice:1000,items:150,wasteYen:2,wasteRate:2},{inputDays:5});
    return original(year,month,throughDay);
  };
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  const point2024=result.metrics.salesYen.historical.points.find(point=>point.year===2024);
  assert.equal(point2024.available,false);
  assert.equal(result.metrics.salesYen.historical.pattern.sampleYears,2);
});

test('対象月自身を年内基準から除外する',()=>{
  const deps=fixture('recurring');
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  assert.equal(result.policy.targetMonthExcludedFromReference,true);
  assert.equal(result.metrics.salesYen.current.referenceMonths,9);
});

test('祝日・イベントを季節性から自動除外しない契約を持つ',()=>{
  const deps=fixture('recurring');
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  assert.equal(result.policy.eventAndHolidayTreatment,'includedAsSeasonality');
});

test('分析は保存データを書き換えず外部通信しない',()=>{
  const deps=fixture('recurring'),before=JSON.stringify(deps.allStores);
  const result=season.analyze({year:2026,month:10,throughDay:10,storeId:'a'},deps);
  assert.equal(JSON.stringify(deps.allStores),before);
  assert.equal(result.source.readOnly,true);
  assert.equal(result.source.externalTransmission,false);
});
