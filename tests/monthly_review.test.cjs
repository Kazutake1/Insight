const test=require('node:test');
const assert=require('node:assert/strict');
const monthly=require('../insight_monthly_review_v1.js');

function ctx(year,month,through,metrics,profitCost={}){
  return {
    store:{id:'storeA',name:'A店'},
    scope:{kind:'month',year,month,throughDay:through,startDate:year+'-'+String(month).padStart(2,'0')+'-01',endDate:year+'-'+String(month).padStart(2,'0')+'-'+String(through).padStart(2,'0')},
    metrics:Object.assign({salesYen:0,customers:0,customerUnitPrice:0,items:0,wasteYen:0,wasteRate:0,inputDays:through},metrics),
    profitCost:Object.assign({available:false,evaluationReady:false,laborCostYen:null,grossMarginRate:null,laborRate:null,reason:''},profitCost),
    conditions:{daily:[],events:[]},
    salesCount:{categories:[]},
    daily:[],
    source:{savedOnly:true,storageSchemaVersion:1}
  };
}

function setup(){
  const map=new Map();
  function put(year,month,through,value){map.set([year,month,through].join('-'),value);}

  put(2026,10,20,ctx(2026,10,20,
    {salesYen:1800000,customers:850,customerUnitPrice:2117.647,wasteYen:30000,wasteRate:1.667,inputDays:20},
    {available:true,evaluationReady:false,laborCostYen:180000,grossMarginRate:29,laborRate:10,reason:'未確定'}
  ));
  put(2025,10,20,ctx(2025,10,20,
    {salesYen:2000000,customers:1000,customerUnitPrice:2000,wasteYen:20000,wasteRate:1,inputDays:20},
    {available:true,evaluationReady:true,laborCostYen:170000,grossMarginRate:31,laborRate:8.5}
  ));
  put(2026,9,20,ctx(2026,9,20,
    {salesYen:1900000,customers:920,customerUnitPrice:2065.217,wasteYen:22000,wasteRate:1.158,inputDays:20},
    {available:true,evaluationReady:true,laborCostYen:210000,grossMarginRate:30,laborRate:11.05}
  ));

  put(2026,7,31,ctx(2026,7,31,
    {salesYen:2970000,customers:1470,customerUnitPrice:2020.408,wasteYen:31500,wasteRate:1.061,inputDays:31},
    {available:true,evaluationReady:true,laborCostYen:215000,grossMarginRate:30.8,laborRate:7.239}
  ));
  put(2025,7,31,ctx(2025,7,31,
    {salesYen:3000000,customers:1500,customerUnitPrice:2000,wasteYen:30000,wasteRate:1,inputDays:31},
    {available:true,evaluationReady:true,laborCostYen:205000,grossMarginRate:31,laborRate:6.833}
  ));
  put(2026,8,31,ctx(2026,8,31,
    {salesYen:2880000,customers:1450,customerUnitPrice:1986.207,wasteYen:33000,wasteRate:1.146,inputDays:31},
    {available:true,evaluationReady:true,laborCostYen:220000,grossMarginRate:30.5,laborRate:7.64}
  ));
  put(2025,8,31,ctx(2025,8,31,
    {salesYen:3000000,customers:1500,customerUnitPrice:2000,wasteYen:30000,wasteRate:1,inputDays:31},
    {available:true,evaluationReady:true,laborCostYen:210000,grossMarginRate:31,laborRate:7}
  ));
  put(2026,9,30,ctx(2026,9,30,
    {salesYen:2790000,customers:1380,customerUnitPrice:2021.739,wasteYen:36000,wasteRate:1.29,inputDays:30},
    {available:true,evaluationReady:true,laborCostYen:240000,grossMarginRate:30,laborRate:8.602}
  ));
  put(2025,9,30,ctx(2025,9,30,
    {salesYen:3000000,customers:1500,customerUnitPrice:2000,wasteYen:30000,wasteRate:1,inputDays:30},
    {available:true,evaluationReady:true,laborCostYen:180000,grossMarginRate:31,laborRate:6}
  ));

  return {
    AnalysisContext:{
      buildMonth(year,month,through){
        const key=[Number(year),Number(month),Number(through)].join('-');
        if(!map.has(key))throw new Error('unexpected month '+key);
        return JSON.parse(JSON.stringify(map.get(key)));
      }
    },
    YearComparison:{
      isCompletedMonth(year,monthLabel){
        const month=Number(String(monthLabel).replace('月',''));
        return Number(year)<2026||(Number(year)===2026&&month<10);
      }
    }
  };
}

test('進行中月は入力済み1日平均で前年同月・前月同期間を比較する',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:10,throughDay:20,compareYear:2025,storeId:'storeA'},deps);
  assert.equal(review.period.completed,false);
  assert.equal(review.period.basis,'dailyAverage');
  assert.equal(review.metrics.sales.yoyPct,-10);
  assert.ok(Math.abs(review.metrics.sales.momPct+5.2631578947)<0.001);
  assert.equal(review.metrics.customers.yoyPct,-15);
  assert.equal(review.metrics.waste.yoyPct,50);
});

test('月次重要項目は売上・客数・廃棄・粗利率を抽出し最大5件',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:10,throughDay:20,compareYear:2025,storeId:'storeA'},deps);
  const keys=review.items.map(i=>i.key);
  assert.ok(keys.includes('sales'));
  assert.ok(keys.includes('customers'));
  assert.ok(keys.includes('waste'));
  assert.ok(keys.includes('grossMargin'));
  assert.ok(review.display.length<=5);
  assert.equal(review.items.some(i=>i.key==='laborRate'),false);
});

test('売上・客数・廃棄の3か月トレンドを判定する',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:10,throughDay:20,compareYear:2025,storeId:'storeA'},deps);
  assert.equal(review.trends.sales.label,'悪化継続');
  assert.equal(review.trends.sales.badStreak,3);
  assert.equal(review.trends.customers.badStreak,3);
  assert.equal(review.trends.waste.badStreak,3);
});

test('結論は最大2文で売上と変動内訳を含める',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:10,throughDay:20,compareYear:2025,storeId:'storeA'},deps);
  assert.equal(review.conclusion.length,2);
  assert.match(review.conclusion[0],/売上/);
  assert.match(review.conclusion[0],/客数/);
  assert.match(review.conclusion[0],/客単価/);
  assert.match(review.conclusion[1],/3か月連続|優先確認/);
});

test('完了月は人件費率・粗利率を正式な月次評価へ含める',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:9,throughDay:30,compareYear:2025,storeId:'storeA'},deps);
  assert.equal(review.period.completed,true);
  assert.equal(review.period.basis,'total');
  assert.ok(review.labor.yoyPoint>1);
  const labor=review.items.find(i=>i.key==='laborRate');
  assert.ok(labor);
  assert.equal(labor.theme,'costs');
  const gross=review.items.find(i=>i.key==='grossMargin');
  assert.ok(gross);
});

test('テーマ別表示では利益・コストを独立して取り出せる',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:9,throughDay:30,compareYear:2025,storeId:'storeA'},deps);
  const costs=review.forTheme('costs');
  assert.ok(costs.length>=1);
  assert.ok(costs.every(i=>i.theme==='costs'));
});

test('比較年なしでは前月比を補助比較として使用する',()=>{
  const deps=setup();
  const review=monthly.review({year:2026,month:10,throughDay:20,compareYear:null,storeId:'storeA'},deps);
  const sales=review.items.find(i=>i.key==='sales');
  assert.ok(sales);
  assert.equal(sales.primaryKind,'前月比');
  assert.match(review.conclusion[0],/前年同月比較は利用できません/);
});

test('3か月トレンドラベルは改善・悪化・転換を区別する',()=>{
  assert.equal(monthly.trendLabel([-8,-5,-2]),'改善継続');
  assert.equal(monthly.trendLabel([2,-1,-4]),'悪化継続');
  assert.equal(monthly.trendLabel([-4,-3,1]),'改善転換');
  assert.equal(monthly.trendLabel([3,2,-2]),'悪化転換');
});

test('月次の売上・客数基準は2/5/8%で段階化する',()=>{
  assert.equal(monthly.metricThreshold('sales',1.9),'internal');
  assert.equal(monthly.metricThreshold('sales',2),'insight');
  assert.equal(monthly.metricThreshold('customers',5),'attention');
  assert.equal(monthly.metricThreshold('sales',8),'important');
  assert.equal(monthly.pointThreshold(0.5),'insight');
  assert.equal(monthly.pointThreshold(1),'attention');
  assert.equal(monthly.pointThreshold(2),'important');
});
