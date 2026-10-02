/* Anomaly explanation v1: read-only context layer for daily anomaly findings. */
(function(root){
  'use strict';
  if(root.InsightAnomalyExplanation)return;

  var VERSION=1;
  var METRIC_BY_TYPE={sales:'salesYen',customers:'customers',waste:'wasteYen'};
  var LABEL_BY_TYPE={sale:'セール',nearby:'近隣イベント',special:'催事'};

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function pad(value){return String(value).padStart(2,'0');}
  function parseIso(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var d=new Date(0);d.setFullYear(Number(m[1]),Number(m[2])-1,Number(m[3]));d.setHours(12,0,0,0);
    return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;
  }
  function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function shift(value,days){var d=parseIso(value);if(!d)return null;d.setDate(d.getDate()+Number(days||0));return iso(d);}
  function metricForFinding(finding){return finding&&METRIC_BY_TYPE[finding.type]||null;}
  function directionMatches(direction,finding){return direction==='up'||direction==='down'?direction===finding.direction:false;}

  function env(overrides){
    overrides=overrides||{};
    var all=overrides.allStores;
    if(all===undefined){try{if(typeof allStores!=='undefined')all=allStores;}catch(_){}}
    if(all===undefined)all=root.allStores;
    return {
      allStores:all,
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      events:overrides.Events||root.InsightEvents,
      weekday:overrides.WeekdayAnalysis||root.InsightWeekdayAnalysis,
      saleImpact:overrides.SaleImpactAnalysis||root.InsightSaleImpactAnalysis,
      eventImpact:overrides.EventImpactAnalysis||root.InsightEventImpactAnalysis,
      seasonality:overrides.SeasonalityAnalysis||root.InsightSeasonalityAnalysis
    };
  }

  function targetDayFor(e,date,storeId,provided,overrides){
    if(provided)return provided;
    if(!e.analysis||typeof e.analysis.buildDay!=='function')return null;
    try{
      var context=e.analysis.buildDay(date,storeId,overrides);
      return context&&Array.isArray(context.daily)?context.daily.find(function(day){return day.date===date;})||null:null;
    }catch(_){return null;}
  }

  function activeEvents(e,date,storeId,targetDay){
    var listed=[];
    try{
      if(e.events&&typeof e.events.list==='function'&&object(e.allStores))listed=e.events.list(e.allStores,storeId,date,date)||[];
    }catch(_){}
    var ids=targetDay&&targetDay.conditions&&Array.isArray(targetDay.conditions.eventIds)?targetDay.conditions.eventIds:[];
    if(ids.length)listed=listed.filter(function(event){return ids.indexOf(event.id)>=0;});
    return listed.filter(function(event){return event&&['sale','nearby','special'].indexOf(event.type)>=0;});
  }

  function buildWeekday(e,date,storeId,overrides){
    if(!e.weekday||typeof e.weekday.analyze!=='function')return {available:false,error:'unavailable'};
    var parsed=parseIso(date),end=shift(date,-1);
    if(!parsed||!end)return {available:false,error:'invalid_date'};
    try{
      var result=e.weekday.analyze({endDate:end,lookbackDays:84,storeId:storeId},overrides);
      var row=result&&Array.isArray(result.weekdays)?result.weekdays[parsed.getDay()]:null;
      return {available:!!row,result:result,row:row,error:null};
    }catch(err){return {available:false,result:null,row:null,error:String(err&&err.message?err.message:err)};}
  }

  function buildSeasonality(e,date,storeId,overrides){
    if(!e.seasonality||typeof e.seasonality.analyze!=='function')return {available:false,error:'unavailable'};
    var parsed=parseIso(date);
    if(!parsed)return {available:false,error:'invalid_date'};
    try{
      var result=e.seasonality.analyze({
        year:parsed.getFullYear(),month:parsed.getMonth()+1,throughDay:parsed.getDate(),completed:false,storeId:storeId
      },overrides);
      return {available:true,result:result,error:null};
    }catch(err){return {available:false,result:null,error:String(err&&err.message?err.message:err)};}
  }

  function buildEventImpacts(e,events,storeId,overrides){
    return events.map(function(event){
      var base={id:event.id,type:event.type,label:LABEL_BY_TYPE[event.type]||event.type,title:String(event.snapshot&&event.snapshot.title||''),impact:null,error:null};
      try{
        if(event.type==='sale'&&e.saleImpact&&typeof e.saleImpact.analyzeOccurrence==='function'){
          base.impact=e.saleImpact.analyzeOccurrence({eventId:event.id,storeId:storeId,windowWeeks:4},overrides);
        }else if((event.type==='nearby'||event.type==='special')&&e.eventImpact&&typeof e.eventImpact.analyzeOccurrence==='function'){
          base.impact=e.eventImpact.analyzeOccurrence({eventId:event.id,storeId:storeId,windowWeeks:4},overrides);
        }
      }catch(err){base.error=String(err&&err.message?err.message:err);}
      return base;
    });
  }

  function buildContext(date,storeId,targetDay,overrides){
    var e=env(overrides);
    if(!object(e.allStores)||!object(e.allStores.stores))return {version:VERSION,date:date,storeId:storeId,available:false,error:'店舗データを取得できません。',weekday:null,seasonality:null,events:[]};
    var id=storeId||e.allStores.current,day=targetDayFor(e,date,id,targetDay,overrides),events=activeEvents(e,date,id,day);
    return {
      version:VERSION,date:date,storeId:id,available:true,error:null,targetDay:day,
      weekday:buildWeekday(e,date,id,overrides),
      seasonality:buildSeasonality(e,date,id,overrides),
      events:buildEventImpacts(e,events,id,overrides),
      policy:{
        weekdayRole:'contextOnlyBecauseCoreBaselineAlreadyWeekdayMatched',
        causality:'notAsserted',
        externalTransmission:false,
        readOnly:true
      }
    };
  }

  function weekdayFactor(context,finding,metric){
    var row=context&&context.weekday&&context.weekday.row,data=row&&row.metrics&&row.metrics[metric];
    if(!data||!data.position)return null;
    var code=data.position.code,direction=code==='high'?'up':code==='low'?'down':code==='normal'?'flat':'unknown';
    return {
      kind:'weekday',label:'曜日傾向',relation:'context',strength:'context',direction:direction,
      supportsFinding:directionMatches(direction,finding),
      text:row.weekdayLabel+'曜日は通常'+(data.position.label||'データ不足'),
      details:{weekday:row.weekday,weekdayLabel:row.weekdayLabel,position:data.position,sampleCount:row.sampleCount}
    };
  }

  function seasonalityFactor(context,finding,metric){
    var result=context&&context.seasonality&&context.seasonality.result,data=result&&result.metrics&&result.metrics[metric];
    if(!data)return null;
    var relationship=data.relationship&&data.relationship.code||'insufficient';
    var direction=data.fit&&data.fit.currentDirection||'unknown';
    var relation='context',strength='context',supports=false;
    if((relationship==='recurring_high'&&finding.direction==='up')||(relationship==='recurring_low'&&finding.direction==='down')){
      relation='supports';strength='strong';supports=true;
    }else if((relationship==='current_only_high'&&finding.direction==='up')||(relationship==='current_only_low'&&finding.direction==='down')){
      relation='unexpected';strength='strong';
    }else if((relationship==='recurring_high'&&finding.direction==='down')||(relationship==='recurring_low'&&finding.direction==='up')){
      relation='opposes';strength='medium';
    }
    return {
      kind:'seasonality',label:'季節性',relation:relation,strength:strength,direction:direction,supportsFinding:supports,
      text:data.relationship&&data.relationship.label||'データ不足',
      details:{historical:data.historical&&data.historical.pattern||null,current:data.current||null,fit:data.fit||null,relationship:data.relationship||null}
    };
  }

  function impactDirection(eventInfo,metric){
    var impact=eventInfo&&eventInfo.impact;
    if(!impact||!metric)return 'unknown';
    if(eventInfo.type==='sale'){
      var saleMetric=impact.kpi&&impact.kpi.metrics&&impact.kpi.metrics[metric];
      return saleMetric&&saleMetric.pattern&&saleMetric.pattern.duringVsBefore?saleMetric.pattern.duringVsBefore.direction:'unknown';
    }
    var eventMetric=impact.kpi&&impact.kpi.metrics&&impact.kpi.metrics[metric];
    return eventMetric&&eventMetric.comparison?eventMetric.comparison.direction:'unknown';
  }

  function eventFactor(eventInfo,finding,metric){
    var direction=impactDirection(eventInfo,metric),supports=directionMatches(direction,finding);
    var relation=supports?'supports':(direction==='up'||direction==='down'?'opposes':'context');
    var strength=supports?'strong':eventInfo.impact?'medium':'context';
    if(finding.type==='salesCount'&&eventInfo.type==='sale'){relation='context';strength='medium';supports=false;}
    return {
      kind:eventInfo.type==='sale'?'sale':'event',subtype:eventInfo.type,id:eventInfo.id,label:eventInfo.label,title:eventInfo.title,
      relation:relation,strength:strength,direction:direction,supportsFinding:supports,
      text:(eventInfo.label||'イベント')+(eventInfo.title?'「'+eventInfo.title+'」':'')+(supports?'の影響方向と一致':''),
      details:{impactAvailable:!!eventInfo.impact,error:eventInfo.error||null}
    };
  }

  function classify(finding,factors){
    if(!finding||finding.type==='input')return {status:'not_applicable',label:'対象外',confidence:'none',causalClaim:false};
    var strong=factors.filter(function(f){return f.relation==='supports'&&f.strength==='strong';});
    var contextual=factors.filter(function(f){return (f.kind==='sale'||f.kind==='event')&&f.relation==='context';});
    var unexpected=factors.filter(function(f){return f.relation==='unexpected'||f.relation==='opposes';});
    if(strong.length)return {status:'explained',label:'説明要因あり',confidence:'high',causalClaim:false};
    if(contextual.length)return {status:'partial',label:'一部説明要因あり',confidence:'medium',causalClaim:false};
    return {status:'unexplained',label:'説明要因未特定',confidence:unexpected.length?'high':'medium',causalClaim:false};
  }

  function annotate(finding,context){
    if(!finding)return finding;
    var copy=Object.assign({},finding),metric=metricForFinding(finding),factors=[];
    if(metric){
      var weekday=weekdayFactor(context,finding,metric),season=seasonalityFactor(context,finding,metric);
      if(weekday)factors.push(weekday);
      if(season)factors.push(season);
    }
    (context&&Array.isArray(context.events)?context.events:[]).forEach(function(eventInfo){factors.push(eventFactor(eventInfo,finding,metric));});
    var classification=classify(finding,factors);
    copy.explanation={
      status:classification.status,label:classification.label,confidence:classification.confidence,causalClaim:false,
      factors:factors,
      supportingFactors:factors.filter(function(f){return f.relation==='supports';}),
      opposingFactors:factors.filter(function(f){return f.relation==='opposes'||f.relation==='unexpected';}),
      note:'比較上の説明要因候補であり、因果関係を断定するものではありません。'
    };
    return copy;
  }

  function enrich(findings,context){
    var list=Array.isArray(findings)?findings:[],enriched=list.map(function(finding){return annotate(finding,context);});
    var counts={explained:0,partial:0,unexplained:0,not_applicable:0};
    enriched.forEach(function(finding){
      var status=finding.explanation&&finding.explanation.status||'unexplained';
      if(counts[status]===undefined)counts[status]=0;
      counts[status]++;
    });
    return {findings:enriched,counts:counts};
  }

  var model={VERSION:VERSION,buildContext:buildContext,annotate:annotate,enrich:enrich,metricForFinding:metricForFinding};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAnomalyExplanation=model;
})(typeof window!=='undefined'?window:globalThis);
