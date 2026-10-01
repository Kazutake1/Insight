const test=require('node:test');
const assert=require('node:assert/strict');
const weekly=require('../insight_weekly_review_v1.js');

function metricContext(start,end,metrics,categories=[],events=[]){
  return {
    store:{id:'storeA',name:'A店'},
    scope:{kind:'range',startDate:start,endDate:end},
    metrics:Object.assign({
      salesYen:0,customers:0,customerUnitPrice:0,items:0,wasteYen:0,wasteRate:0,inputDays:4
    },metrics),
    profitCost:{available:false},
    conditions:{
      daily:[
        {date:start,weather:'晴',eventIds:[]},
        {date:end,weather:'晴',eventIds:events.length?['evt1']:[]}
      ],
      events:events
    },
    salesCount:{categories:categories},
    daily:[]
  };
}

function category(id,name,inputDays,deliveryAvg,salesAvg){
  return {
    id,name,hidden:false,inputDays,
    delivery:{total:{average:deliveryAvg}},
    sales:{total:{average:salesAvg}},
    daily:[]
  };
}

function setupContexts(){
  const ranges={
    '2026-09-28|2026-10-01':metricContext(
      '2026-09-28','2026-10-01',
      {salesYen:729000,customers:368,customerUnitPrice:1981,wasteYen:12000,wasteRate:1.65,inputDays:4},
      [category('cat_onigiri','おにぎり',4,120,100)],
      [{summary:'おにぎりセール',title:'おにぎりセール'}]
    ),
    '2026-09-21|2026-09-24':metricContext(
      '2026-09-21','2026-09-24',
      {salesYen:810000,customers:400,customerUnitPrice:2025,wasteYen:11111,wasteRate:1.37,inputDays:4},
      [category('cat_onigiri','おにぎり',4,100,100)]
    ),
    '2026-09-14|2026-09-17':metricContext(
      '2026-09-14','2026-09-17',
      {salesYen:900000,customers:400,customerUnitPrice:2250,wasteYen:9259,wasteRate:1.03,inputDays:4},
      [category('cat_onigiri','おにぎり',4,100,100)]
    ),
    '2026-09-07|2026-09-10':metricContext(
      '2026-09-07','2026-09-10',
      {salesYen:1000000,customers:400,customerUnitPrice:2500,wasteYen:7716,wasteRate:0.77,inputDays:4},
      [category('cat_onigiri','おにぎり',4,100,100)]
    )
  };
  return {
    buildRange(start,end){
      const key=start+'|'+end;
      if(!ranges[key])throw new Error('unexpected range '+key);
      return JSON.parse(JSON.stringify(ranges[key]));
    }
  };
}

test('今週は月曜から基準日まで、前週は同じ曜日数で比較する',()=>{
  const w=weekly.weekWindow('2026-10-01');
  assert.deepEqual(w,{
    referenceDate:'2026-10-01',
    startDate:'2026-09-28',
    endDate:'2026-10-01',
    elapsedDays:4,
    previousStartDate:'2026-09-21',
    previousEndDate:'2026-09-24'
  });
});

test('週次レビューは新規・継続・改善を判定する',()=>{
  const review=weekly.review('2026-10-01','storeA',{AnalysisContext:setupContexts()});
  const sales=review.items.find(i=>i.key==='sales');
  const customers=review.items.find(i=>i.key==='customers');
  const waste=review.items.find(i=>i.key==='waste');

  assert.ok(sales);
  assert.equal(sales.state,'continuing');
  assert.equal(sales.persistenceWeeks,3);
  assert.match(sales.summary,/主因候補/);

  assert.ok(customers);
  assert.equal(customers.state,'new');

  assert.ok(waste);
  assert.equal(waste.state,'improving');
  assert.equal(waste.persistenceWeeks,3);
});

test('週次重要項目は最大5件で、テーマ別に絞り込める',()=>{
  const review=weekly.review('2026-10-01','storeA',{AnalysisContext:setupContexts()});
  assert.ok(review.display.length<=5);
  const salesOnly=review.forTheme('sales');
  assert.ok(salesOnly.length>=1);
  assert.ok(salesOnly.every(i=>i.theme==='sales'));
  const wasteOnly=review.forTheme('waste');
  assert.ok(wasteOnly.every(i=>i.theme==='waste'));
});

test('販売増に納品が追随していない場合は需要増加候補を作る',()=>{
  const AnalysisContext=setupContexts();
  const original=AnalysisContext.buildRange;
  AnalysisContext.buildRange=function(start,end){
    const ctx=original(start,end);
    if(start==='2026-09-28')ctx.salesCount.categories=[category('cat_onigiri','おにぎり',4,102,115)];
    if(start==='2026-09-21')ctx.salesCount.categories=[category('cat_onigiri','おにぎり',4,100,100)];
    return ctx;
  };
  const review=weekly.review('2026-10-01','storeA',{AnalysisContext});
  const demand=review.items.find(i=>i.key==='salesCount:cat_onigiri:demand');
  assert.ok(demand);
  assert.equal(demand.theme,'salesCounts');
  assert.equal(demand.positive,true);
});

test('主要KPIが2日以上不足すると週次入力不足を出す',()=>{
  const AnalysisContext=setupContexts();
  const original=AnalysisContext.buildRange;
  AnalysisContext.buildRange=function(start,end){
    const ctx=original(start,end);
    if(start==='2026-09-28')ctx.metrics.inputDays=2;
    return ctx;
  };
  const review=weekly.review('2026-10-01','storeA',{AnalysisContext});
  const missing=review.items.find(i=>i.key==='input:week');
  assert.ok(missing);
  assert.equal(missing.details.missingDays,2);
});

test('週次変化の重要度帯は5/8/12%で段階化する',()=>{
  assert.equal(weekly.levelForMagnitude(4.9),'internal');
  assert.equal(weekly.levelForMagnitude(5),'insight');
  assert.equal(weekly.levelForMagnitude(8),'attention');
  assert.equal(weekly.levelForMagnitude(12),'important');
});

test('週次結論には売上・客数・廃棄の前週同期間比を含める',()=>{
  const review=weekly.review('2026-10-01','storeA',{AnalysisContext:setupContexts()});
  assert.equal(review.conclusion.length,2);
  assert.match(review.conclusion[0],/売上/);
  assert.match(review.conclusion[0],/客数/);
  assert.match(review.conclusion[0],/廃棄/);
  assert.match(review.context.join(' '),/イベント/);
});
