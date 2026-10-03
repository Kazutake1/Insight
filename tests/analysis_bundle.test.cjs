const test=require('node:test');
const assert=require('node:assert/strict');
const bundle=require('../insight_analysis_bundle_v1.js');

function context(kind='month'){
  return {
    store:{id:'a',name:'A店'},
    scope:{kind,year:2026,month:10,startDate:'2026-10-01',endDate:'2026-10-03'},
    metrics:{salesYen:300000,customers:300,customerUnitPrice:1000,items:450,wasteYen:6000,wasteRate:2,inputDays:3},
    profitCost:{available:false},conditions:{daily:[],events:[]},salesCount:{categories:[]},
    source:{savedOnly:true,storageSchemaVersion:1}
  };
}
function deps(options={}){
  const allStores={
    schemaVersion:1,current:'a',
    eventManagement:{events:[
      {id:'sale1',type:'sale',scope:'global',startDate:'2026-10-02',endDate:'2026-10-02',snapshot:{title:'セール',sale:{}}},
      {id:'futureSale',type:'sale',scope:'global',startDate:'2026-10-10',endDate:'2026-10-10',snapshot:{title:'未来セール',sale:{}}}
    ]},
    stores:{a:{name:'A店',years:['2024','2025','2026'],events:[
      {id:'event1',type:'nearby',scope:'store',startDate:'2026-10-03',endDate:'2026-10-03',snapshot:{title:'近隣イベント'}},
      {id:'futureEvent',type:'special',scope:'store',startDate:'2026-10-20',endDate:'2026-10-20',snapshot:{title:'未来催事'}}
    ]}}
  };
  const weeklyReview={
    version:1,store:{id:'a',name:'A店'},period:{startDate:'2026-09-28',endDate:'2026-10-03'},
    current:context('range'),previous:context('range'),conclusion:['週次結論'],context:['晴れ'],
    items:[{key:'w1',level:'attention',score:60,title:'週次注意',summary:'週次'}],
    display:[{key:'w1',level:'attention',score:60,title:'週次注意',summary:'週次'}]
  };
  const monthlyReview={
    version:1,store:{id:'a',name:'A店'},period:{year:2026,month:10,throughDay:3},
    current:context(),comparisonYear:context(),previousMonth:context(),metrics:{},grossMargin:null,labor:null,trends:{},
    conclusion:['月次結論'],items:[{key:'m1',level:'important',score:80,title:'月次重要',summary:'月次'}],
    display:[{key:'m1',level:'important',score:80,title:'月次重要',summary:'月次'}]
  };
  const daily={
    version:1,date:'2026-10-03',store:{id:'a',name:'A店'},baseline:{},
    findings:[{key:'d1',level:'important',score:90,title:'日次異常',summary:'日次',explanation:{status:'unexplained'}}],
    display:[{key:'d1',level:'important',score:90,title:'日次異常',summary:'日次',explanation:{status:'unexplained'}}],
    opportunities:[],hasAlert:true,explanationContext:{large:'duplicate'},explanationSummary:{unexplained:1},
    investigation:[],explainedAlerts:[]
  };
  return {
    allStores,
    AnalysisContext:{buildMonth(){return context();}},
    MultiYearAnalysis:{analyzeMonth(){return {marker:'multiyear'};}},
    WeekdayAnalysis:{analyze(){if(options.weekdayFails)throw new Error('weekday failed');return {marker:'weekday'};}},
    SeasonalityAnalysis:{analyze(){return {marker:'seasonality'};}},
    DailyAnomaly:{evaluate(){return daily;}},
    SaleImpactAnalysis:{analyzeOccurrence(input){return {marker:'sale',id:input.eventId};}},
    EventImpactAnalysis:{analyzeOccurrence(input){return {marker:'event',id:input.eventId};}},
    WeeklyReview:{review(){return weeklyReview;}},
    MonthlyReview:{review(){return monthlyReview;}},
    AnalysisHistory:{build(input){return {version:1,kind:input.kind,entries:[{id:input.kind+':1',kind:input.kind,sortDate:'2026-10-03',label:'履歴',items:[],display:[],conclusion:['履歴結論'],review:{ignored:true}}],traces:[{key:'trace'}],getEntry(){}};}},
    YearComparison:{isCompletedMonth(){return false;}},
    getAIAnalysisThroughDay(){return 3;},
    now:new Date('2026-10-03T00:00:00Z')
  };
}

test('全分析を1つの読み取り専用コンテキストへ統合する',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,compareYear:2025,storeId:'a'},deps());
  assert.equal(result.meta.contract,'InsightAnalysisBundle');
  assert.equal(result.meta.aiConnected,false);
  assert.equal(result.store.name,'A店');
  assert.equal(result.period.referenceDate,'2026-10-03');
  assert.equal(result.analysis.multiyear.marker,'multiyear');
  assert.equal(result.analysis.weekday.marker,'weekday');
  assert.equal(result.analysis.seasonality.marker,'seasonality');
  assert.equal(result.analysis.anomaly.hasAlert,true);
  assert.equal(result.analysis.anomaly.explanationContext,undefined);
  assert.equal(result.analysis.saleImpacts.length,1);
  assert.equal(result.analysis.saleImpacts[0].id,'sale1');
  assert.equal(result.analysis.eventImpacts.length,1);
  assert.equal(result.analysis.eventImpacts[0].id,'event1');
  assert.equal(result.reviews.weekly.conclusion[0],'週次結論');
  assert.equal(result.reviews.monthly.conclusion[0],'月次結論');
  assert.equal(result.reviews.history.weekly.entries.length,1);
  assert.equal(result.source.readOnly,true);
  assert.equal(result.source.externalTransmission,false);
});

test('基準日より未来のセール・イベントは影響分析へ入れない',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,storeId:'a'},deps());
  assert.deepEqual(result.analysis.saleImpacts.map(x=>x.id),['sale1']);
  assert.deepEqual(result.analysis.eventImpacts.map(x=>x.id),['event1']);
});

test('一部分析が失敗しても他の分析結果を保持しdiagnosticsへ記録する',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,storeId:'a'},deps({weekdayFails:true}));
  assert.equal(result.analysis.weekday,null);
  assert.equal(result.analysis.multiyear.marker,'multiyear');
  assert.equal(result.diagnostics.partial,true);
  assert.equal(result.diagnostics.modules.weekday.status,'error');
  assert.match(result.diagnostics.modules.weekday.error,/weekday failed/);
});

test('日次・週次・月次の優先シグナルを重要度順に統合する',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,storeId:'a'},deps());
  assert.equal(result.signals.items[0].level,'important');
  assert.equal(result.signals.items[0].source,'daily');
  assert.equal(result.signals.counts.important,2);
  assert.equal(result.signals.counts.attention,1);
  assert.equal(result.signals.counts.unexplained,1);
});

test('履歴の関数や重いreview本体を統合契約へ持ち込まない',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,storeId:'a'},deps());
  const entry=result.reviews.history.weekly.entries[0];
  assert.equal(entry.review,undefined);
  assert.equal(typeof result.reviews.history.weekly.getEntry,'undefined');
});

test('統合処理は保存データを書き換えない',()=>{
  const d=deps(),before=JSON.stringify(d.allStores);
  bundle.build({year:2026,month:10,throughDay:3,storeId:'a'},d);
  assert.equal(JSON.stringify(d.allStores),before);
});


test('AI Provider非依存の標準Evidence契約を追加する',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,compareYear:2025,storeId:'a'},deps());
  assert.equal(result.evidence.version,1);
  assert.equal(result.evidence.contract,'InsightAIEvidence');
  assert.equal(result.evidence.policy.providerNeutral,true);
  assert.equal(result.evidence.policy.authoritativeKpi,false);
  assert.equal(result.evidence.policy.causality,'association_only');
  assert.ok(Array.isArray(result.evidence.items));
  assert.ok(result.evidence.items.length>=3);
  const daily=result.evidence.items.find(x=>x.origin==='daily');
  assert.equal(daily.source,'signal');
  assert.equal(daily.causality,'association_only');
  assert.equal(daily.quality.status,'ok');
  assert.equal(result.evidence.quality.partial,false);
});

test('Evidenceは分析失敗を欠損と混同せずqualityへ保持する',()=>{
  const result=bundle.build({year:2026,month:10,throughDay:3,storeId:'a'},deps({weekdayFails:true}));
  assert.equal(result.evidence.quality.partial,true);
  assert.equal(result.evidence.quality.modules.weekday.status,'error');
  assert.match(result.evidence.quality.modules.weekday.error,/weekday failed/);
});
