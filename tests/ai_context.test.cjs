const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ai=require('../insight_ai_context_v1.js');

function facts(kind='month'){
  return {
    version:1,
    store:{id:'storeA',name:'A店'},
    scope:{kind,startDate:'2026-09-01',endDate:'2026-09-30',year:2026,month:9,throughDay:30,isSingleMonth:true},
    metrics:{salesYen:3000000,customers:1500,customerUnitPrice:2000,items:2300,wasteYen:30000,wasteRate:1,inputDays:30},
    profitCost:{available:true,evaluationReady:true,laborCostYen:240000,grossMarginRate:31,laborRate:8,reason:''},
    conditions:{
      daily:[{date:'2026-09-30',weekday:3,weekdayLabel:'水',holiday:false,weather:'晴',tempMaxC:28,tempMinC:20,storeMemo:'店長だけのメモ',eventIds:['evt1']}],
      events:[{id:'evt1',type:'sale',scope:'store',startDate:'2026-09-30',endDate:'2026-09-30',title:'セール',summary:'おにぎりセール',note:'内部備考'}]
    },
    salesCount:{categories:[{
      id:'cat1',name:'おにぎり',hidden:false,inputDays:2,
      delivery:{total:{sum:200,count:2,average:100}},
      sales:{total:{sum:180,count:2,average:90}},
      daily:[
        {date:'2026-09-29',deliveryTotal:100,salesTotal:90,trips:[{delivery:40,sales:35}]},
        {date:'2026-09-30',deliveryTotal:100,salesTotal:90,trips:[{delivery:40,sales:35}]}
      ]
    }]},
    daily:[],
    source:{savedOnly:true,storageSchemaVersion:1}
  };
}

function deps(view={period:'month'}){
  const allStores={current:'storeA',stores:{storeA:{name:'A店'}}};
  const PeriodLock={
    getTarget(){return {year:2026,month:9,day:null,compareYear:2025};},
    referenceDate(){return '2026-09-30';},
    getContext(){return {year:'2026',month:'9月',mi:8,day:null,through:30,prev:'2025'};}
  };
  return {
    allStores,
    currentNav:1,
    viewState:view,
    PeriodLock,
    AnalysisContext:{
      buildDay(){return facts('day');}
    },
    DailyAnomaly:{
      evaluate(){return {
        baseline:{sampleCount:8,confidence:'high'},
        display:[{key:'sales',type:'sales',title:'売上低下',summary:'想定比 -25%',level:'important',confidence:'high',score:80,details:{actual:75000,expected:100000}}],
        findings:[{key:'sales',type:'sales',title:'売上低下',summary:'想定比 -25%',level:'important',confidence:'high',score:80}],
        opportunities:[],
        hasAlert:true
      };}
    },
    WeeklyReview:{
      review(){return {
        period:{referenceDate:'2026-09-30',startDate:'2026-09-28',endDate:'2026-09-30'},
        current:facts('range'),
        conclusion:['売上 -8.0%。','優先確認は売上低下です。'],
        context:['最多天気：晴 3日'],
        items:[{key:'sales',type:'sales',theme:'sales',title:'売上低下',summary:'前週比 -8.0%',level:'attention',positive:false,state:'continuing',stateLabel:'継続',score:66}],
        display:[{key:'sales',type:'sales',theme:'sales',title:'売上低下',summary:'前週比 -8.0%',level:'attention',positive:false,state:'continuing',stateLabel:'継続',score:66}],
        forTheme(theme){return theme==='sales'?this.items:this.display;}
      };}
    },
    MonthlyReview:{
      review(){return {
        period:{year:2026,month:9,throughDay:30,completed:true,basis:'total',compareYear:2025,yoyLabel:'前年同月比'},
        current:facts('month'),
        conclusion:['売上は前年同月比-5.0%。','優先確認は客数低下です。'],
        items:[{key:'customers',type:'customers',theme:'customers',title:'客数悪化',summary:'前年同月比 -6.0%',level:'attention',positive:false,score:62}],
        display:[{key:'customers',type:'customers',theme:'customers',title:'客数悪化',summary:'前年同月比 -6.0%',level:'attention',positive:false,score:62}],
        trends:{sales:{label:'悪化継続'},customers:{label:'悪化継続'},waste:{label:'横ばい'}},
        grossMargin:{current:31,yoyPoint:-1},
        labor:{currentRate:8,yoyPoint:0.5},
        forTheme(theme){return theme==='customers'?this.items:this.display;}
      };}
    },
    AnalysisBundle:{
      build(){return {
        period:{year:2026,month:9,throughDay:30},
        signals:{count:2,counts:{important:1,attention:1},items:[{source:'monthly',key:'customers',level:'attention',title:'客数悪化'}]},
        analysis:{
          weekday:{summary:'水曜日の客数が弱い'},
          seasonality:{summary:'例年の季節性では説明しにくい'},
          anomaly:{hasAlert:true},
          saleImpacts:[{id:'sale1',status:'ok',impact:{summary:'影響あり'}}],
          eventImpacts:[{id:'event1',status:'ok',impact:{summary:'影響小'}}]
        },
        diagnostics:{partial:false,modules:{}},
        evidence:{
          version:1,contract:'InsightAIEvidence',
          policy:{providerNeutral:true,authoritativeKpi:false,causality:'association_only'},
          items:[{id:'signal:monthly:customers',source:'signal',metric:'customers',direction:'down',importance:'attention',confidence:null,summary:'客数悪化',causality:'association_only',quality:{status:'ok',error:null}}],
          quality:{partial:false,modules:{}}
        }
      };}
    },
    AnalysisHistory:{
      build(){
        const entry={
          id:'month:2026-09',label:'2026年9月',sortDate:'2026-09-30',
          review:{
            current:facts('month'),
            display:[{key:'sales',type:'sales',theme:'sales',title:'売上低下',summary:'前年比 -5%',level:'attention',positive:false}],
            items:[{key:'sales',type:'sales',theme:'sales',title:'売上低下',summary:'前年比 -5%',level:'attention',positive:false}],
            forTheme(theme){return theme==='sales'?this.items:this.display;}
          },
          conclusion:['月次結論']
        };
        return {
          entries:[entry],
          traces:[{key:'sales',title:'売上低下',type:'sales',theme:'sales',startLabel:'7月',lastLabel:'9月',periods:3,status:'continuing',statusLabel:'継続'}],
          getEntry(){return entry;},
          tracesForEntry(){return this.traces;}
        };
      }
    },
    now:new Date('2026-10-01T12:00:00+09:00')
  };
}

test('共通AIコンテキストは決定論的数値を正として月次レビューを構造化する',()=>{
  const context=ai.build({period:'month',theme:'customers'},deps({period:'month'}));
  assert.equal(context.schemaVersion,1);
  assert.equal(context.contract.sourceOfTruth,'insight_deterministic_engine');
  assert.equal(context.contract.authoritativeArithmetic,true);
  assert.equal(context.target.year,2026);
  assert.equal(context.target.month,9);
  assert.equal(context.analysis.kind,'monthly');
  assert.equal(context.analysis.findings[0].key,'customers');
  assert.equal(context.facts.metrics.salesYen,3000000);
  assert.equal(context.analysis.crossAnalysis.signals.count,2);
  assert.match(context.analysis.crossAnalysis.weekday.summary,/水曜日/);
  assert.equal(context.analysis.crossAnalysis.saleImpacts[0].id,'sale1');
  assert.equal(context.analysis.crossAnalysis.policy.causality,'notAsserted');
  assert.equal(context.analysis.evidence.contract,'InsightAIEvidence');
  assert.equal(context.analysis.evidence.policy.providerNeutral,true);
  assert.equal(context.analysis.evidence.items[0].metric,'customers');
  assert.equal(context.analysis.evidence.items[0].causality,'association_only');
  assert.ok(context.provenance.engines.includes('InsightAnalysisBundle'));
  assert.deepEqual(JSON.parse(JSON.stringify(context)),context);
});

test('日次コンテキストは即時警告と基準信頼度を含む',()=>{
  const context=ai.build({period:'today',theme:'dashboard'},deps({period:'today'}));
  assert.equal(context.analysis.kind,'daily');
  assert.equal(context.analysis.hasAlert,true);
  assert.equal(context.analysis.findings.length,1);
  assert.equal(context.analysis.baseline.confidence,'high');
});

test('週次コンテキストは結論・重要項目・関連情報を渡す',()=>{
  const context=ai.build({period:'week',theme:'sales'},deps({period:'week'}));
  assert.equal(context.analysis.kind,'weekly');
  assert.equal(context.analysis.findings[0].key,'sales');
  assert.match(context.analysis.conclusion.join(' '),/売上/);
  assert.match(context.analysis.relatedContext.join(' '),/晴/);
});

test('履歴コンテキストは選択期間と異常の継続履歴を含む',()=>{
  const context=ai.build({period:'history',theme:'sales',historyKind:'month'},deps({period:'history',historyKind:'month',historySelected:{month:'month:2026-09'}}));
  assert.equal(context.analysis.kind,'history');
  assert.equal(context.analysis.selected.id,'month:2026-09');
  assert.equal(context.analysis.traces[0].periods,3);
  assert.equal(context.analysis.traces[0].status,'continuing');
});

test('自由記述はローカルコンテキストには保持しtransport標準では除外する',()=>{
  const context=ai.build({period:'month'},deps({period:'month'}));
  assert.equal(context.facts.conditions.daily[0].storeMemo,'店長だけのメモ');
  assert.equal(context.facts.conditions.events[0].note,'内部備考');
  assert.equal(context.privacy.containsFreeText,true);

  const transport=ai.toTransportPayload(context);
  assert.equal('storeMemo' in transport.facts.conditions.daily[0],false);
  assert.equal('note' in transport.facts.conditions.events[0],false);
  assert.equal(transport.privacy.freeTextIncluded,false);
  assert.equal(transport.privacy.externalTransmission,false);
  assert.equal(transport.privacy.preparedForTransport,true);
});

test('明示指定時だけtransportへ自由記述を含められる',()=>{
  const context=ai.build({period:'month'},deps({period:'month'}));
  const transport=ai.toTransportPayload(context,{includeFreeText:true});
  assert.equal(transport.facts.conditions.daily[0].storeMemo,'店長だけのメモ');
  assert.equal(transport.facts.conditions.events[0].note,'内部備考');
  assert.equal(transport.privacy.freeTextIncluded,true);
});

test('将来AI用requestは回答制約とanalysisContextを一体化する',()=>{
  const request=ai.createRequest('売上が下がった理由は？',{period:'month',theme:'sales'},deps({period:'month'}));
  assert.equal(request.protocolVersion,1);
  assert.equal(request.task,'interpret_insight_management_data');
  assert.equal(request.question,'売上が下がった理由は？');
  assert.equal(request.responseContract.doNotRecalculateAuthoritativeMetrics,true);
  assert.equal(request.analysisContext.contract.authoritativeArithmetic,true);
});

test('AI接続準備モジュール自身は通信・保存処理を持たない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_ai_context_v1.js'),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotMatch(source,/https?:\/\//);
  assert.match(source,/externalTransmission:false/);
});


test('横断分析が失敗しても既存の月次AIコンテキストは維持する',()=>{
  const d=deps({period:'month'});
  d.AnalysisBundle={build(){throw new Error('bundle failed');}};
  const context=ai.build({period:'month',theme:'customers'},d);
  assert.equal(context.analysis.kind,'monthly');
  assert.equal(context.analysis.findings[0].key,'customers');
  assert.equal(context.analysis.crossAnalysis,null);
  assert.equal(context.analysis.evidence,null);
});

test('Evidence契約が不正でも既存の横断分析コンテキストを維持する',()=>{
  const d=deps({period:'month'});
  const original=d.AnalysisBundle.build;
  d.AnalysisBundle={build(){const value=original();value.evidence={contract:'unknown',items:[]};return value;}};
  const context=ai.build({period:'month',theme:'customers'},d);
  assert.equal(context.analysis.evidence,null);
  assert.equal(context.analysis.crossAnalysis.signals.count,2);
});
