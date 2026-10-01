const test=require('node:test');
const assert=require('node:assert/strict');
const anomaly=require('../insight_daily_anomaly_v1.js');

function day(date,{sales=100000,customers=100,unit=1000,waste=1000,wasteRate=1,weather='晴',events=[]}={}){
  const d=new Date(date+'T12:00:00');
  return {
    date,
    metrics:{salesYen:sales,customers,customerUnitPrice:unit,items:150,wasteYen:waste,wasteRate,inputDays:1},
    conditions:{date,weekday:d.getDay(),weekdayLabel:'',holiday:false,weather,tempMaxC:25,tempMinC:18,storeMemo:'',eventIds:events}
  };
}

function salesCategory(date,delivery,sales,id='cat_onigiri',name='おにぎり'){
  return {id,name,hidden:false,inputDays:1,delivery:{},sales:{},daily:[{
    date,
    trips:[
      {delivery,sales},
      {delivery:null,sales:null},
      {delivery:null,sales:null}
    ],
    deliveryTotal:delivery,
    salesTotal:sales
  }]};
}

function context(date,daily,categories=[]){
  return {
    version:1,
    store:{id:'storeA',name:'A店'},
    scope:{kind:'day',startDate:date,endDate:date},
    metrics:daily&&daily.metrics||{salesYen:null,customers:null,wasteYen:null},
    conditions:{daily:daily?[daily.conditions]:[],events:[]},
    salesCount:{categories},
    daily:daily?[daily]:[],
    source:{savedOnly:true,storageSchemaVersion:1}
  };
}

const THURSDAYS=[
  '2026-08-06','2026-08-13','2026-08-20','2026-08-27',
  '2026-09-03','2026-09-10','2026-09-17','2026-09-24'
];

function fakeAnalysis(options={}){
  const targetDate=options.targetDate||'2026-10-01';
  const historyDates=options.historyDates||THURSDAYS;
  const historyDays=historyDates.map(d=>day(d,options.historyDay||{}));
  const historyCats=historyDates.map(d=>salesCategory(d,100,90));
  const targetDay=options.targetDay===null?null:day(targetDate,options.targetDay||{});
  const targetCats=options.targetCategories||[];
  return {
    buildDay(date){
      if(date===targetDate)return context(date,targetDay,targetCats);
      return context(date,null,[]);
    },
    buildRange(start,end){
      const days=historyDays.filter(d=>d.date>=start&&d.date<=end);
      const catDaily=historyCats.flatMap(c=>c.daily).filter(d=>d.date>=start&&d.date<=end);
      return {
        version:1,
        store:{id:'storeA',name:'A店'},
        scope:{kind:'range',startDate:start,endDate:end},
        metrics:{},
        conditions:{daily:days.map(d=>d.conditions),events:[]},
        salesCount:{categories:[{id:'cat_onigiri',name:'おにぎり',hidden:false,daily:catDaily}]},
        daily:days,
        source:{savedOnly:true,storageSchemaVersion:1}
      };
    }
  };
}

test('売上重要異常は客数低下を主因候補として統合し即時表示する',()=>{
  const AnalysisContext=fakeAnalysis({
    targetDay:{sales:70000,customers:70,unit:1000,waste:1000,wasteRate:1}
  });
  const result=anomaly.evaluate('2026-10-01','storeA',{AnalysisContext,nowIso:'2026-10-01'});
  assert.equal(result.baseline.sampleCount,8);
  assert.equal(result.baseline.confidence,'high');
  assert.equal(result.display.length,1);
  assert.equal(result.display[0].key,'sales');
  assert.equal(result.display[0].rawSeverity,'important');
  assert.match(result.display[0].summary,/主因候補：客数/);
  assert.ok(!result.findings.some(f=>f.key==='customers'));
});

test('単日の注意レベルは内部評価しても即時警告にはしない',()=>{
  const AnalysisContext=fakeAnalysis({
    targetDay:{sales:80000,customers:100,unit:800,waste:1000,wasteRate:1.25}
  });
  const result=anomaly.evaluate('2026-10-01','storeA',{AnalysisContext,nowIso:'2026-10-01'});
  const sales=result.findings.find(f=>f.key==='sales');
  assert.ok(sales);
  assert.equal(sales.rawSeverity,'attention');
  assert.equal(sales.persistenceDays,1);
  assert.equal(sales.alertNow,false);
  assert.equal(result.display.length,0);
});

test('廃棄+50%以上は高信頼なら単日でも重要警告にする',()=>{
  const AnalysisContext=fakeAnalysis({
    targetDay:{sales:100000,customers:100,unit:1000,waste:1600,wasteRate:1.6}
  });
  const result=anomaly.evaluate('2026-10-01','storeA',{AnalysisContext,nowIso:'2026-10-01'});
  const waste=result.findings.find(f=>f.key==='waste');
  assert.ok(waste);
  assert.equal(waste.rawSeverity,'important');
  assert.equal(waste.alertNow,true);
  assert.equal(result.display[0].key,'waste');
});

test('低信頼の想定値は極端でも原則通知しない',()=>{
  const AnalysisContext=fakeAnalysis({
    historyDates:['2026-09-17','2026-09-24'],
    targetDay:{sales:50000,customers:50,unit:1000,waste:1000,wasteRate:2}
  });
  const result=anomaly.evaluate('2026-10-01','storeA',{AnalysisContext,nowIso:'2026-10-01'});
  assert.equal(result.baseline.confidence,'low');
  assert.ok(result.findings.some(f=>f.rawSeverity==='important'));
  assert.equal(result.display.length,0);
});

test('納品が通常より大幅増で販売が増えていない場合は納品過多候補を検出する',()=>{
  const AnalysisContext=fakeAnalysis({
    targetDay:{sales:100000,customers:100,unit:1000,waste:1000,wasteRate:1},
    targetCategories:[salesCategory('2026-10-01',160,90)]
  });
  const result=anomaly.evaluate('2026-10-01','storeA',{AnalysisContext,nowIso:'2026-10-01'});
  const sc=result.findings.find(f=>f.type==='salesCount');
  assert.ok(sc);
  assert.match(sc.title,/納品過多候補/);
  assert.equal(sc.rawSeverity,'important');
  assert.equal(sc.alertNow,true);
});

test('過去日の主要入力欠落は入力確認として表示する',()=>{
  const AnalysisContext=fakeAnalysis({targetDay:null});
  const result=anomaly.evaluate('2026-10-01','storeA',{AnalysisContext,nowIso:'2026-10-02'});
  assert.equal(result.display.length,1);
  assert.equal(result.display[0].type,'input');
  assert.match(result.display[0].summary,/未入力/);
});

test('イベント日比較は3件で中信頼、5件で高信頼にする',()=>{
  assert.equal(anomaly.confidence(3,true),'medium');
  assert.equal(anomaly.confidence(5,true),'high');
  assert.equal(anomaly.confidence(8,false),'high');
});

test('通常ブレ幅は5%未満・15%超に広がらない',()=>{
  assert.equal(anomaly.bandPct([100,100,100],100),5);
  assert.equal(anomaly.bandPct([10,190],100),15);
});
