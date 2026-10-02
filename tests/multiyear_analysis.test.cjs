const test=require('node:test');
const assert=require('node:assert/strict');
const multi=require('../insight_multiyear_analysis_v1.js');

function context(year,month,through,metrics){
  return {
    store:{id:'storeA',name:'A店'},
    scope:{kind:'month',year,month,throughDay:through},
    metrics:Object.assign({salesYen:null,customers:null,customerUnitPrice:null,items:null,wasteYen:null,wasteRate:null,inputDays:0},metrics)
  };
}

function setup(completed=false){
  const allStores={current:'storeA',stores:{storeA:{name:'A店',years:['2023','2024','2025','2026'],data:{}}}};
  const map=new Map();
  function put(year,through,metrics){map.set(year+'-'+through,context(year,10,through,metrics));}

  put(2024,20,{salesYen:1600000,customers:800,customerUnitPrice:2000,items:1200,wasteYen:40000,wasteRate:2.5,inputDays:20});
  put(2025,20,{salesYen:1800000,customers:900,customerUnitPrice:2000,items:1350,wasteYen:35000,wasteRate:1.944,inputDays:20});
  put(2026,20,{salesYen:2000000,customers:1000,customerUnitPrice:2000,items:1500,wasteYen:30000,wasteRate:1.5,inputDays:20});

  put(2024,31,{salesYen:2400000,customers:1200,customerUnitPrice:2000,items:1800,wasteYen:60000,wasteRate:2.5,inputDays:31});
  put(2025,31,{salesYen:2700000,customers:1350,customerUnitPrice:2000,items:2025,wasteYen:52500,wasteRate:1.944,inputDays:31});
  put(2026,31,{salesYen:3000000,customers:1500,customerUnitPrice:2000,items:2250,wasteYen:45000,wasteRate:1.5,inputDays:31});

  return {
    allStores,
    deps:{
      allStores,
      AnalysisContext:{
        buildMonth(year,month,through){
          const key=Number(year)+'-'+Number(through);
          if(!map.has(key))return context(Number(year),Number(month),Number(through),{inputDays:0});
          return JSON.parse(JSON.stringify(map.get(key)));
        }
      },
      YearComparison:{isCompletedMonth(){return completed;}}
    }
  };
}

test('月途中は入力済み1日平均で3年以上の同月推移を比較する',()=>{
  const {deps}=setup(false);
  const result=multi.analyzeMonth({year:2026,month:10,throughDay:20,storeId:'storeA'},deps);
  assert.equal(result.period.basis,'dailyAverage');
  assert.deepEqual(result.years,[2023,2024,2025,2026]);
  assert.deepEqual(result.metrics.salesYen.series.map(p=>p.value),[null,80000,90000,100000]);
  assert.equal(result.metrics.salesYen.trend.label,'上昇継続');
  assert.equal(result.metrics.customers.trend.label,'上昇継続');
  assert.equal(result.metrics.customerUnitPrice.trend.label,'横ばい');
  assert.equal(result.metrics.wasteYen.trend.label,'下降継続');
  assert.equal(result.metrics.wasteRate.trend.label,'下降継続');
  assert.equal(result.source.externalTransmission,false);
});

test('完了月は月合計で複数年度を比較する',()=>{
  const {deps}=setup(true);
  const result=multi.analyzeMonth({year:2026,month:10,throughDay:20,storeId:'storeA'},deps);
  assert.equal(result.period.completed,true);
  assert.equal(result.period.basis,'total');
  assert.equal(result.period.throughDay,31);
  assert.deepEqual(result.metrics.salesYen.series.map(p=>p.value),[null,2400000,2700000,3000000]);
  assert.equal(result.metrics.salesYen.trend.code,'up_continuing');
});

test('直近の方向が過去傾向から反転した場合は転換として判定する',()=>{
  const series=[
    {year:2024,value:100},
    {year:2025,value:120},
    {year:2026,value:105}
  ];
  const trend=multi.classifySeries(series,multi.METRICS.salesYen);
  assert.equal(trend.code,'down_reversal');
  assert.equal(trend.label,'下降転換');
});

test('3年未満または年度に欠落がある場合は継続傾向を断定しない',()=>{
  assert.equal(multi.classifySeries([{year:2025,value:100},{year:2026,value:110}],multi.METRICS.salesYen).code,'insufficient');
  assert.equal(multi.classifySeries([{year:2023,value:90},{year:2025,value:100},{year:2026,value:110}],multi.METRICS.salesYen).code,'insufficient');
});

test('対象年度は正式年度だけを使い最大年数を制限する',()=>{
  const store={years:['2020','2021','2022','2023','2024','2025','2026','2030']};
  assert.deepEqual(multi.registeredYears(store,2026,5),[2022,2023,2024,2025,2026]);
});

test('分析は保存データを書き換えない',()=>{
  const {allStores,deps}=setup(false),before=JSON.stringify(allStores);
  multi.analyzeMonth({year:2026,month:10,throughDay:20,storeId:'storeA'},deps);
  assert.equal(JSON.stringify(allStores),before);
});
