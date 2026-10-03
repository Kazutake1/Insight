/* AI context v1: stable, read-only handoff contract for future on-device/external AI adapters. */
(function(root){
  'use strict';
  if(root.InsightAIContext)return;

  var CONTEXT_VERSION=1;
  var REQUEST_VERSION=1;
  var PERIODS=['today','week','month','history'];
  var THEMES=['dashboard','sales','customers','waste','salesCounts','costs'];

  function copy(value){
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function pad(value){return String(value).padStart(2,'0');}
  function parseIso(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(0);
    date.setFullYear(y,mo-1,d);date.setHours(12,0,0,0);
    if(date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d)return null;
    return {year:y,month:mo,day:d,iso:y+'-'+pad(mo)+'-'+pad(d)};
  }
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function monthNumber(value){
    if(Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12)return Number(value);
    var m=/^(\d{1,2})月$/.exec(String(value||''));
    return m?Number(m[1]):null;
  }
  function themeFromNav(nav){
    return ({0:'dashboard',1:'dashboard',2:'sales',3:'customers',4:'waste',salesCounts:'salesCounts'})[nav]||'dashboard';
  }
  function env(overrides){
    overrides=overrides||{};
    var stores=overrides.allStores;
    if(stores===undefined){try{if(typeof allStores!=='undefined')stores=allStores;}catch(_){}}
    var nav=overrides.currentNav;
    if(nav===undefined){try{if(typeof currentNav!=='undefined')nav=currentNav;}catch(_){}}
    var view=overrides.viewState||root.InsightAIViewState||{};
    var through=overrides.getAIAnalysisThroughDay;
    if(through===undefined){try{if(typeof getAIAnalysisThroughDay==='function')through=getAIAnalysisThroughDay;}catch(_){}}
    return {
      stores:stores,
      nav:nav,
      view:view,
      periodLock:overrides.PeriodLock||root.InsightAnalysisPeriodLock,
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      daily:overrides.DailyAnomaly||root.InsightDailyAnomaly,
      weekly:overrides.WeeklyReview||root.InsightWeeklyReview,
      monthly:overrides.MonthlyReview||root.InsightMonthlyReview,
      history:overrides.AnalysisHistory||root.InsightAnalysisHistory,
      bundle:overrides.AnalysisBundle||root.InsightAnalysisBundle,
      getThroughDay:through,
      now:overrides.now||new Date()
    };
  }

  function resolveTarget(options,e){
    options=options||{};
    var locked=options.target||null;
    if(!locked&&e.periodLock&&typeof e.periodLock.getTarget==='function'){
      try{locked=e.periodLock.getTarget();}catch(_){}
    }
    locked=locked||{};
    var year=Number(locked.year||options.year),month=monthNumber(locked.month||options.month),day=locked.day==null?options.day:Number(locked.day);
    if(!Number.isInteger(year)||!month)throw new Error('AI分析対象年月を取得できません。');
    if(day!=null){
      day=Number(day);
      if(!Number.isInteger(day)||day<1)day=null;
      else day=Math.min(day,lastDay(year,month));
    }
    var compareYear=locked.compareYear==null?options.compareYear:locked.compareYear;
    compareYear=compareYear==null?null:Number(compareYear);
    if(compareYear!=null&&!Number.isInteger(compareYear))compareYear=null;

    var referenceDate=options.referenceDate||null;
    if(!referenceDate&&e.periodLock&&typeof e.periodLock.referenceDate==='function'){
      try{referenceDate=e.periodLock.referenceDate();}catch(_){}
    }
    if(!referenceDate){
      var now=e.now,refDay=day;
      if(refDay==null){
        refDay=now&&now.getFullYear()===year&&now.getMonth()+1===month?now.getDate():lastDay(year,month);
      }
      referenceDate=year+'-'+pad(month)+'-'+pad(Math.min(refDay,lastDay(year,month)));
    }
    var parsed=parseIso(referenceDate);
    if(!parsed)throw new Error('AI分析基準日が不正です。');

    var throughDay=options.throughDay;
    if(throughDay==null&&e.periodLock&&typeof e.periodLock.getContext==='function'){
      try{
        var lockedContext=e.periodLock.getContext('month');
        if(lockedContext&&lockedContext.through!=null)throughDay=lockedContext.through;
      }catch(_){}
    }
    if(throughDay==null&&typeof e.getThroughDay==='function'){
      try{throughDay=e.getThroughDay(year,String(month)+'月');}catch(_){}
    }
    if(throughDay==null)throughDay=parsed.year===year&&parsed.month===month?parsed.day:lastDay(year,month);
    throughDay=Math.max(1,Math.min(lastDay(year,month),Number(throughDay)||lastDay(year,month)));

    var storeId=options.storeId||(e.stores&&e.stores.current)||null;
    if(!storeId)throw new Error('AI分析対象店舗を取得できません。');
    var storeName=e.stores&&e.stores.stores&&e.stores.stores[storeId]&&e.stores.stores[storeId].name||String(storeId);
    var period=options.period||e.view.period||(e.nav===0?'today':'month');
    if(PERIODS.indexOf(period)<0)period='month';
    var theme=options.theme||themeFromNav(e.nav);
    if(THEMES.indexOf(theme)<0)theme='dashboard';
    var historyKind=options.historyKind||e.view.historyKind||'week';
    if(historyKind!=='month')historyKind='week';
    var selectedMap=e.view.historySelected||{};
    return {
      store:{id:storeId,name:storeName},
      period:period,
      theme:theme,
      year:year,
      month:month,
      day:day,
      throughDay:throughDay,
      compareYear:compareYear,
      referenceDate:referenceDate,
      historyKind:historyKind,
      historyEntryId:options.historyEntryId||selectedMap[historyKind]||null
    };
  }

  function compactItem(item){
    if(!item)return null;
    var out={};
    [
      'key','type','theme','title','summary','level','rawLevel','direction','positive',
      'state','stateLabel','score','confidence','persistenceDays','persistenceWeeks',
      'persistenceMonths','changePct','primaryChange','primaryKind','impactYen'
    ].forEach(function(key){if(item[key]!==undefined)out[key]=copy(item[key]);});
    if(item.details!==undefined)out.details=copy(item.details);
    return out;
  }
  function compactItems(items,limit){
    return (Array.isArray(items)?items:[]).slice(0,limit||5).map(compactItem).filter(Boolean);
  }
  function compactSalesCount(salesCount){
    var categories=salesCount&&Array.isArray(salesCount.categories)?salesCount.categories:[];
    return categories.filter(function(c){return !c.hidden||Number(c.inputDays)>0;}).map(function(c){
      return {
        id:c.id,name:c.name,hidden:!!c.hidden,inputDays:Number(c.inputDays)||0,
        delivery:copy(c.delivery||null),sales:copy(c.sales||null),
        daily:(Array.isArray(c.daily)?c.daily:[]).slice(-31).map(function(d){
          return {
            date:d.date,
            deliveryTotal:d.deliveryTotal==null?null:Number(d.deliveryTotal),
            salesTotal:d.salesTotal==null?null:Number(d.salesTotal),
            trips:copy(d.trips||[])
          };
        })
      };
    });
  }
  function compactFacts(context){
    context=context||{};
    var conditions=context.conditions||{},daily=Array.isArray(conditions.daily)?conditions.daily:[];
    return {
      store:copy(context.store||null),
      scope:copy(context.scope||null),
      metrics:copy(context.metrics||null),
      profitCost:copy(context.profitCost||null),
      conditions:{
        daily:daily.map(function(d){
          return {
            date:d.date,weekday:d.weekday,weekdayLabel:d.weekdayLabel,holiday:!!d.holiday,
            weather:d.weather||null,tempMaxC:finite(d.tempMaxC),tempMinC:finite(d.tempMinC),
            storeMemo:String(d.storeMemo||''),eventIds:copy(d.eventIds||[])
          };
        }),
        events:(Array.isArray(conditions.events)?conditions.events:[]).map(function(e){
          return {
            id:e.id||null,type:e.type||null,scope:e.scope||null,startDate:e.startDate||null,endDate:e.endDate||null,
            title:e.title||'',summary:e.summary||'',note:e.note||''
          };
        })
      },
      salesCount:{categories:compactSalesCount(context.salesCount)}
    };
  }

  function dailyAnalysis(target,e,overrides){
    if(!e.analysis||typeof e.analysis.buildDay!=='function')throw new Error('日次分析データを利用できません。');
    var facts=e.analysis.buildDay(target.referenceDate,target.store.id,overrides);
    var result=e.daily&&typeof e.daily.evaluate==='function'?e.daily.evaluate(target.referenceDate,target.store.id,overrides):null;
    return {
      facts:compactFacts(facts),
      deterministic:{
        kind:'daily',
        baseline:copy(result&&result.baseline||null),
        findings:compactItems(result&&result.display,3),
        allFindings:compactItems(result&&result.findings,12),
        opportunities:compactItems(result&&result.opportunities,3),
        hasAlert:!!(result&&result.hasAlert)
      }
    };
  }

  function weeklyAnalysis(target,e,overrides){
    if(!e.weekly||typeof e.weekly.review!=='function')throw new Error('週次レビューを利用できません。');
    var review=e.weekly.review(target.referenceDate,target.store.id,overrides);
    var items=typeof review.forTheme==='function'?review.forTheme(target.theme):review.display;
    return {
      facts:compactFacts(review.current),
      deterministic:{
        kind:'weekly',
        period:copy(review.period||null),
        conclusion:copy(review.conclusion||[]),
        findings:compactItems(items,5),
        allFindings:compactItems(review.items,12),
        relatedContext:copy(review.context||[])
      }
    };
  }

  function compactCrossAnalysis(bundle){
    if(!bundle)return null;
    var analysis=bundle.analysis||{};
    return {
      period:copy(bundle.period||null),
      signals:copy(bundle.signals||null),
      weekday:copy(analysis.weekday||null),
      seasonality:copy(analysis.seasonality||null),
      anomaly:copy(analysis.anomaly||null),
      saleImpacts:copy(analysis.saleImpacts||[]),
      eventImpacts:copy(analysis.eventImpacts||[]),
      diagnostics:copy(bundle.diagnostics||null),
      policy:{
        role:'supportingEvidenceForInterpretation',
        causality:'notAsserted',
        authoritativeKpi:false
      }
    };
  }

  function monthlyAnalysis(target,e,overrides){
    if(!e.monthly||typeof e.monthly.review!=='function')throw new Error('月次レビューを利用できません。');
    var review=e.monthly.review({
      year:target.year,month:target.month,throughDay:target.throughDay,
      compareYear:target.compareYear,storeId:target.store.id
    },overrides);
    var items=typeof review.forTheme==='function'?review.forTheme(target.theme):review.display;
    var cross=null;
    if(e.bundle&&typeof e.bundle.build==='function'){
      try{
        cross=compactCrossAnalysis(e.bundle.build({
          year:target.year,month:target.month,throughDay:target.throughDay,
          compareYear:target.compareYear,storeId:target.store.id,referenceDate:target.referenceDate
        },overrides));
      }catch(_){cross=null;}
    }
    return {
      facts:compactFacts(review.current),
      deterministic:{
        kind:'monthly',
        period:copy(review.period||null),
        conclusion:copy(review.conclusion||[]),
        findings:compactItems(items,5),
        allFindings:compactItems(review.items,12),
        trends:copy(review.trends||{}),
        grossMargin:copy(review.grossMargin||null),
        labor:copy(review.labor||null),
        crossAnalysis:cross
      }
    };
  }

  function historyAnalysis(target,e,overrides){
    if(!e.history||typeof e.history.build!=='function')throw new Error('分析履歴を利用できません。');
    var history;
    if(target.historyKind==='month'){
      history=e.history.build({
        kind:'month',year:target.year,month:target.month,throughDay:target.throughDay,
        compareYear:target.compareYear,storeId:target.store.id,count:12
      },overrides);
    }else{
      history=e.history.build({
        kind:'week',referenceDate:target.referenceDate,storeId:target.store.id,count:12
      },overrides);
    }
    var selected=history.getEntry?history.getEntry(target.historyEntryId):history.entries&&history.entries[0];
    var review=selected&&selected.review;
    var items=[];
    if(review){
      if(target.theme==='dashboard')items=review.display||[];
      else if(typeof review.forTheme==='function')items=review.forTheme(target.theme);
      else items=(review.items||[]).filter(function(i){return i.theme===target.theme;});
    }
    var facts=review&&review.current?compactFacts(review.current):{
      store:copy(target.store),scope:null,metrics:null,profitCost:null,conditions:{daily:[],events:[]},salesCount:{categories:[]}
    };
    return {
      facts:facts,
      deterministic:{
        kind:'history',
        historyKind:target.historyKind,
        selected:selected?{
          id:selected.id,label:selected.label,sortDate:selected.sortDate,
          conclusion:copy(selected.conclusion||[]),findings:compactItems(items,5)
        }:null,
        traces:(history.tracesForEntry&&selected?history.tracesForEntry(selected):[]).slice(0,8).map(function(t){
          return {
            key:t.key,title:t.title,type:t.type,theme:t.theme,startLabel:t.startLabel,lastLabel:t.lastLabel,
            periods:t.periods,status:t.status,statusLabel:t.statusLabel,resolvedLabel:t.resolvedLabel||null
          };
        }),
        recent:(history.entries||[]).slice(0,12).map(function(entry){
          return {
            id:entry.id,label:entry.label,sortDate:entry.sortDate,
            conclusion:copy(entry.conclusion||[]),findings:compactItems(entry.display,5)
          };
        })
      }
    };
  }

  function build(options,overrides){
    options=options||{};
    var e=env(overrides),target=resolveTarget(options,e),body;
    if(target.period==='today')body=dailyAnalysis(target,e,overrides);
    else if(target.period==='week')body=weeklyAnalysis(target,e,overrides);
    else if(target.period==='history')body=historyAnalysis(target,e,overrides);
    else body=monthlyAnalysis(target,e,overrides);

    return {
      schemaVersion:CONTEXT_VERSION,
      generatedAt:new Date().toISOString(),
      contract:{
        sourceOfTruth:'insight_deterministic_engine',
        aiRole:'interpret_explain_summarize_only',
        authoritativeArithmetic:true,
        rules:[
          'Do not replace or recalculate authoritative KPI values.',
          'Separate observed facts from hypotheses.',
          'Do not claim causation from weather, events, or correlations without evidence.',
          'Respect confidence and data-availability fields.',
          'Prefer concise operational explanations and concrete checks.'
        ]
      },
      target:copy(target),
      facts:body.facts,
      analysis:body.deterministic,
      provenance:{
        savedOnly:true,
        engines:[
          'InsightAnalysisContext',
          target.period==='today'?'InsightDailyAnomaly':
          target.period==='week'?'InsightWeeklyReview':
          target.period==='history'?'InsightAnalysisHistory':'InsightMonthlyReview',
          target.period==='month'&&body.deterministic.crossAnalysis?'InsightAnalysisBundle':null
        ].filter(Boolean)
      },
      privacy:{
        localContext:true,
        containsFreeText:body.facts.conditions.daily.some(function(d){return !!d.storeMemo;})||
          body.facts.conditions.events.some(function(e){return !!e.note;}),
        externalTransmission:false
      }
    };
  }

  function stripFreeText(context){
    var out=copy(context);
    if(out&&out.facts&&out.facts.conditions){
      (out.facts.conditions.daily||[]).forEach(function(d){delete d.storeMemo;});
      (out.facts.conditions.events||[]).forEach(function(e){delete e.note;});
    }
    if(out&&out.privacy){
      out.privacy.containsFreeText=false;
      out.privacy.freeTextIncluded=false;
    }
    return out;
  }

  function toTransportPayload(context,options){
    options=options||{};
    var out=copy(context);
    if(!options.includeFreeText)out=stripFreeText(out);
    if(out&&out.privacy){
      out.privacy.localContext=false;
      out.privacy.preparedForTransport=true;
      out.privacy.externalTransmission=false;
      out.privacy.freeTextIncluded=!!options.includeFreeText;
    }
    return out;
  }

  function createRequest(question,options,overrides){
    options=options||{};
    var context=options.context||build(options,overrides);
    var payload=toTransportPayload(context,{includeFreeText:!!options.includeFreeText});
    return {
      protocolVersion:REQUEST_VERSION,
      task:'interpret_insight_management_data',
      question:String(question||'').trim(),
      analysisContext:payload,
      responseContract:{
        language:'ja',
        factsFirst:true,
        separateHypotheses:true,
        noUnsupportedCausation:true,
        doNotRecalculateAuthoritativeMetrics:true
      }
    };
  }

  function buildCurrent(overrides){return build({},overrides);}

  var model={
    CONTEXT_VERSION:CONTEXT_VERSION,
    REQUEST_VERSION:REQUEST_VERSION,
    build:build,
    buildCurrent:buildCurrent,
    createRequest:createRequest,
    toTransportPayload:toTransportPayload,
    stripFreeText:stripFreeText,
    resolveTarget:resolveTarget,
    compactFacts:compactFacts,
    compactCrossAnalysis:compactCrossAnalysis
  };

  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAIContext=model;
})(typeof window!=='undefined'?window:globalThis);
