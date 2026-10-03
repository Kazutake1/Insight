/* Analysis bundle v1: unified, read-only pre-AI analysis contract. */
(function(root){
  'use strict';
  if(root.InsightAnalysisBundle)return;

  var VERSION=1,DEFAULT_HISTORY_COUNT=12,DEFAULT_IMPACT_WEEKS=4;
  var LEVEL_RANK={internal:0,insight:1,attention:2,important:3};

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function copy(value){
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function pad(value){return String(value).padStart(2,'0');}
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function iso(year,month,day){return String(year)+'-'+pad(month)+'-'+pad(day);}
  function overlap(event,start,end){
    return !!(event&&event.startDate&&event.endDate&&event.startDate<=end&&event.endDate>=start);
  }
  function nowIso(value){
    var d=value instanceof Date?value:new Date(value||Date.now());
    return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();
  }

  function environment(overrides){
    overrides=overrides||{};
    var all=overrides.allStores;
    if(all===undefined){try{if(typeof allStores!=='undefined')all=allStores;}catch(_){}}
    if(all===undefined)all=root.allStores;
    var compareYear=overrides.compareYear;
    if(compareYear===undefined){try{if(typeof compYear!=='undefined')compareYear=compYear;}catch(_){}}
    return {
      allStores:all,
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      multiyear:overrides.MultiYearAnalysis||root.InsightMultiYearAnalysis,
      weekday:overrides.WeekdayAnalysis||root.InsightWeekdayAnalysis,
      saleImpact:overrides.SaleImpactAnalysis||root.InsightSaleImpactAnalysis,
      eventImpact:overrides.EventImpactAnalysis||root.InsightEventImpactAnalysis,
      seasonality:overrides.SeasonalityAnalysis||root.InsightSeasonalityAnalysis,
      daily:overrides.DailyAnomaly||root.InsightDailyAnomaly,
      weekly:overrides.WeeklyReview||root.InsightWeeklyReview,
      monthly:overrides.MonthlyReview||root.InsightMonthlyReview,
      history:overrides.AnalysisHistory||root.InsightAnalysisHistory,
      comparison:overrides.YearComparison||root.InsightYearComparison,
      getThroughDay:overrides.getAIAnalysisThroughDay||root.getAIAnalysisThroughDay,
      compareYear:compareYear,
      now:overrides.now
    };
  }

  function storeInfo(env,storeId){
    var all=env.allStores;
    if(!object(all)||!object(all.stores))throw new Error('店舗データを取得できません。');
    var id=storeId||all.current,store=all.stores[id];
    if(!object(store))throw new Error('対象店舗を取得できません。');
    return {id:id,store:store};
  }

  function resolvePeriod(options,env){
    options=options||{};
    var year=Number(options.year),month=Number(options.month);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('統合分析の対象年月が不正です。');
    var max=lastDay(year,month),through=options.throughDay;
    if(through==null&&typeof env.getThroughDay==='function'){
      try{through=env.getThroughDay(year,String(month)+'月');}catch(_){}
    }
    through=Math.max(1,Math.min(max,Number(through)||max));
    var completed=false;
    try{
      if(env.comparison&&typeof env.comparison.isCompletedMonth==='function')completed=!!env.comparison.isCompletedMonth(year,String(month)+'月');
      else completed=through>=max;
    }catch(_){completed=through>=max;}
    var startDate=iso(year,month,1),endDate=iso(year,month,through),referenceDate=String(options.referenceDate||endDate);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)||referenceDate<startDate||referenceDate>endDate)referenceDate=endDate;
    var compareYear=options.compareYear==null?env.compareYear:Number(options.compareYear);
    compareYear=Number.isInteger(Number(compareYear))?Number(compareYear):null;
    return {
      year:year,month:month,throughDay:through,completed:completed,
      startDate:startDate,endDate:endDate,referenceDate:referenceDate,compareYear:compareYear,
      label:String(year)+'年'+String(month)+'月'+(completed?'':' '+String(through)+'日まで')
    };
  }

  function moduleDiagnostics(){return {modules:{},partial:false};}
  function mark(diagnostics,name,status,error,extra){
    diagnostics.modules[name]=Object.assign({status:status,error:error||null},extra||{});
    if(status!=='ok')diagnostics.partial=true;
  }
  function run(diagnostics,name,api,method,fn){
    if(!api||typeof api[method]!=='function'){
      mark(diagnostics,name,'unavailable','module unavailable');
      return null;
    }
    try{
      var value=fn();
      mark(diagnostics,name,'ok',null);
      return copy(value);
    }catch(err){
      mark(diagnostics,name,'error',String(err&&err.message?err.message:err));
      return null;
    }
  }

  function compactContext(context){
    if(!context)return null;
    return {
      store:copy(context.store||null),
      scope:copy(context.scope||null),
      metrics:copy(context.metrics||null),
      profitCost:copy(context.profitCost||null),
      conditions:copy(context.conditions||null),
      salesCount:copy(context.salesCount||null),
      source:copy(context.source||null)
    };
  }

  function compactDaily(result){
    if(!result)return null;
    return {
      version:result.version,date:result.date,store:copy(result.store||null),
      baseline:copy(result.baseline||null),findings:copy(result.findings||[]),
      display:copy(result.display||[]),opportunities:copy(result.opportunities||[]),
      hasAlert:!!result.hasAlert,explanationSummary:copy(result.explanationSummary||null),
      investigation:copy(result.investigation||[]),explainedAlerts:copy(result.explainedAlerts||[])
    };
  }

  function compactReview(review,kind){
    if(!review)return null;
    if(kind==='weekly'){
      return {
        version:review.version,store:copy(review.store||null),period:copy(review.period||null),
        current:compactContext(review.current),previous:compactContext(review.previous),
        conclusion:copy(review.conclusion||[]),context:copy(review.context||[]),
        items:copy(review.items||[]),display:copy(review.display||[])
      };
    }
    return {
      version:review.version,store:copy(review.store||null),period:copy(review.period||null),
      current:compactContext(review.current),comparisonYear:compactContext(review.comparisonYear),
      previousMonth:compactContext(review.previousMonth),metrics:copy(review.metrics||null),
      grossMargin:copy(review.grossMargin||null),labor:copy(review.labor||null),
      trends:copy(review.trends||null),conclusion:copy(review.conclusion||[]),
      items:copy(review.items||[]),display:copy(review.display||[])
    };
  }

  function compactHistory(history){
    if(!history)return null;
    return {
      version:history.version,kind:history.kind,
      entries:(Array.isArray(history.entries)?history.entries:[]).map(function(entry){
        return {
          id:entry.id,kind:entry.kind,sortDate:entry.sortDate,label:entry.label,
          items:copy(entry.items||[]),display:copy(entry.display||[]),conclusion:copy(entry.conclusion||[])
        };
      }),
      traces:copy(history.traces||[])
    };
  }

  function eventMeta(event){
    return {
      id:event.id,type:event.type||null,startDate:event.startDate||null,endDate:event.endDate||null,
      title:String(event.snapshot&&event.snapshot.title||''),scope:event.scope||null
    };
  }

  function impactEntries(events,api,storeId,weeks,overrides){
    return events.map(function(event){
      var item=eventMeta(event);
      item.status='ok';item.error=null;item.impact=null;
      try{item.impact=copy(api.analyzeOccurrence({eventId:event.id,storeId:storeId,windowWeeks:weeks},overrides));}
      catch(err){item.status='error';item.error=String(err&&err.message?err.message:err);}
      return item;
    });
  }

  function collectImpacts(env,period,selected,weeks,diagnostics,overrides){
    var all=env.allStores,store=selected.store;
    var sales=(all.eventManagement&&Array.isArray(all.eventManagement.events)?all.eventManagement.events:[]).filter(function(event){
      return event&&event.type==='sale'&&event.startDate<=period.referenceDate&&overlap(event,period.startDate,period.endDate);
    });
    var events=(Array.isArray(store.events)?store.events:[]).filter(function(event){
      return event&&['nearby','special'].indexOf(event.type)>=0&&event.startDate<=period.referenceDate&&overlap(event,period.startDate,period.endDate);
    });

    var saleItems=[];
    if(!env.saleImpact||typeof env.saleImpact.analyzeOccurrence!=='function')mark(diagnostics,'saleImpact','unavailable','module unavailable',{count:sales.length,errors:sales.length});
    else{
      saleItems=impactEntries(sales,env.saleImpact,selected.id,weeks,overrides);
      var saleErrors=saleItems.filter(function(item){return item.status==='error';}).length;
      mark(diagnostics,'saleImpact',saleErrors?'partial':'ok',saleErrors?'some occurrences failed':null,{count:saleItems.length,errors:saleErrors});
    }

    var eventItems=[];
    if(!env.eventImpact||typeof env.eventImpact.analyzeOccurrence!=='function')mark(diagnostics,'eventImpact','unavailable','module unavailable',{count:events.length,errors:events.length});
    else{
      eventItems=impactEntries(events,env.eventImpact,selected.id,weeks,overrides);
      var eventErrors=eventItems.filter(function(item){return item.status==='error';}).length;
      mark(diagnostics,'eventImpact',eventErrors?'partial':'ok',eventErrors?'some occurrences failed':null,{count:eventItems.length,errors:eventErrors});
    }
    return {sales:saleItems,events:eventItems};
  }

  function signal(source,item){
    if(!item)return null;
    var explanation=item.explanation||null;
    return {
      source:source,key:item.key||null,type:item.type||null,theme:item.theme||null,
      level:item.level||item.rawLevel||'insight',title:item.title||'',summary:item.summary||'',
      score:item.score==null?null:Number(item.score),
      explanationStatus:explanation&&explanation.status||null,
      confidence:item.confidence||explanation&&explanation.confidence||null
    };
  }

  function signalsFrom(daily,weekly,monthly){
    var items=[];
    (daily&&Array.isArray(daily.display)?daily.display:[]).forEach(function(item){var s=signal('daily',item);if(s)items.push(s);});
    (weekly&&Array.isArray(weekly.display)?weekly.display:[]).forEach(function(item){var s=signal('weekly',item);if(s)items.push(s);});
    (monthly&&Array.isArray(monthly.display)?monthly.display:[]).forEach(function(item){var s=signal('monthly',item);if(s)items.push(s);});
    items.sort(function(a,b){
      var ar=LEVEL_RANK[a.level]||0,br=LEVEL_RANK[b.level]||0;
      if(br!==ar)return br-ar;
      return (b.score||0)-(a.score||0);
    });
    var counts={important:0,attention:0,insight:0,internal:0,unexplained:0};
    items.forEach(function(item){
      if(counts[item.level]!==undefined)counts[item.level]++;
      if(item.explanationStatus==='unexplained')counts.unexplained++;
    });
    return {count:items.length,counts:counts,items:items.slice(0,12)};
  }

  function build(options,overrides){
    options=options||{};overrides=overrides||{};
    var env=environment(overrides),selected=storeInfo(env,options.storeId),period=resolvePeriod(options,env);
    if(!env.analysis||typeof env.analysis.buildMonth!=='function')throw new Error('分析コンテキストを利用できません。');
    var diagnostics=moduleDiagnostics();
    var core=env.analysis.buildMonth(period.year,period.month,period.throughDay,selected.id,overrides);
    mark(diagnostics,'analysisContext','ok',null);

    var multiyear=run(diagnostics,'multiyear',env.multiyear,'analyzeMonth',function(){
      return env.multiyear.analyzeMonth({year:period.year,month:period.month,throughDay:period.throughDay,completed:period.completed,storeId:selected.id},overrides);
    });
    var weekday=run(diagnostics,'weekday',env.weekday,'analyze',function(){
      return env.weekday.analyze({endDate:period.referenceDate,lookbackDays:Number(options.weekdayLookbackDays)||84,storeId:selected.id},overrides);
    });
    var seasonality=run(diagnostics,'seasonality',env.seasonality,'analyze',function(){
      return env.seasonality.analyze({year:period.year,month:period.month,throughDay:period.throughDay,completed:period.completed,storeId:selected.id},overrides);
    });
    var dailyRaw=run(diagnostics,'dailyAnomaly',env.daily,'evaluate',function(){
      return env.daily.evaluate(period.referenceDate,selected.id,overrides);
    });
    var daily=compactDaily(dailyRaw);

    var weeks=Number(options.impactWindowWeeks)||DEFAULT_IMPACT_WEEKS;
    if(!Number.isInteger(weeks)||weeks<1||weeks>12)weeks=DEFAULT_IMPACT_WEEKS;
    var impacts=collectImpacts(env,period,selected,weeks,diagnostics,overrides);

    var weeklyRaw=run(diagnostics,'weeklyReview',env.weekly,'review',function(){
      return env.weekly.review(period.referenceDate,selected.id,overrides);
    });
    var monthlyRaw=run(diagnostics,'monthlyReview',env.monthly,'review',function(){
      return env.monthly.review({year:period.year,month:period.month,throughDay:period.throughDay,compareYear:period.compareYear,storeId:selected.id},overrides);
    });
    var historyCount=Number(options.historyCount)||DEFAULT_HISTORY_COUNT;
    if(!Number.isInteger(historyCount)||historyCount<1||historyCount>24)historyCount=DEFAULT_HISTORY_COUNT;
    var weeklyHistoryRaw=run(diagnostics,'weeklyHistory',env.history,'build',function(){
      return env.history.build({kind:'week',referenceDate:period.referenceDate,storeId:selected.id,count:historyCount},overrides);
    });
    var monthlyHistoryRaw=run(diagnostics,'monthlyHistory',env.history,'build',function(){
      return env.history.build({kind:'month',year:period.year,month:period.month,throughDay:period.throughDay,compareYear:period.compareYear,storeId:selected.id,count:historyCount},overrides);
    });

    var weekly=compactReview(weeklyRaw,'weekly'),monthly=compactReview(monthlyRaw,'monthly');
    return {
      version:VERSION,
      meta:{contract:'InsightAnalysisBundle',generatedAt:nowIso(env.now),aiConnected:false},
      store:{id:selected.id,name:String(selected.store.name||selected.id)},
      period:period,
      kpi:copy(core.metrics||null),
      facts:compactContext(core),
      analysis:{
        multiyear:multiyear,weekday:weekday,seasonality:seasonality,anomaly:daily,
        saleImpacts:impacts.sales,eventImpacts:impacts.events
      },
      reviews:{
        weekly:weekly,monthly:monthly,
        history:{weekly:compactHistory(weeklyHistoryRaw),monthly:compactHistory(monthlyHistoryRaw)}
      },
      signals:signalsFrom(daily,weekly,monthly),
      diagnostics:diagnostics,
      source:{
        savedOnly:true,readOnly:true,externalTransmission:false,
        storageSchemaVersion:core&&core.source?core.source.storageSchemaVersion||0:0
      }
    };
  }

  var model={
    VERSION:VERSION,DEFAULT_HISTORY_COUNT:DEFAULT_HISTORY_COUNT,DEFAULT_IMPACT_WEEKS:DEFAULT_IMPACT_WEEKS,
    build:build,resolvePeriod:resolvePeriod,compactContext:compactContext,compactDaily:compactDaily,
    compactReview:compactReview,compactHistory:compactHistory,signalsFrom:signalsFrom
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAnalysisBundle=model;
})(typeof window!=='undefined'?window:globalThis);
