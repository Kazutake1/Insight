/* Stage 1: read-only eligibility for comparing saved weather/temperature with per-trip sales.
 * No inference about weather, missing input, inactive trips, or causal relationships.
 * This module is not wired into the UI or persistence until a separate review.
 */
(function(root){
  'use strict';
  if(root.InsightWeatherSalesReadiness)return;
  var analysisDefault=typeof module!=='undefined'&&module.exports?
    require('./insight_analysis_context_v1.js'):root.InsightAnalysisContext;
  var resolverDefault=typeof module!=='undefined'&&module.exports?
    require('./insight_trip_history_resolver_v1.js'):root.InsightTripHistoryResolver;
  var DEFAULT_DAYS=84,MAX_DAYS=366,MIN_COHORT=3;
  var REASONS=['eligible','inactiveTrip','tentativeInactiveTrip','unknownTrip','reviewTrip','missingDailyRow',
    'missingConditions','eventDay','missingWeather','missingTemperature','missingSales'];

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function parseDate(value){
    if(typeof value!=='string'||!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value))return null;
    var parts=value.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    if(date.getUTCFullYear()!==parts[0]||date.getUTCMonth()+1!==parts[1]||date.getUTCDate()!==parts[2])return null;
    return date;
  }
  function iso(date){return date.toISOString().slice(0,10);}
  function shift(date,days){var value=parseDate(date);if(!value)return null;value.setUTCDate(value.getUTCDate()+days);return iso(value);}
  function localToday(){
    var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    var obj={};parts.forEach(function(item){obj[item.type]=item.value;});
    return obj.year+'-'+obj.month+'-'+obj.day;
  }
  function datesBetween(start,end){
    var result=[],cursor=parseDate(start),limit=parseDate(end);
    if(!cursor||!limit||cursor>limit)throw new Error('分析対象期間が不正です。');
    for(;cursor<=limit;cursor.setUTCDate(cursor.getUTCDate()+1)){
      result.push(iso(cursor));
      if(result.length>MAX_DAYS)throw new Error('分析期間は最大366日です。');
    }
    return result;
  }
  function validTemp(value){
    return value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
  }
  function rowAt(store,date){
    var year=date.slice(0,4),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
    var list=store.data&&store.data[year]&&store.data[year][month+'月'];
    var row=Array.isArray(list)?list[day-1]:null;
    if(!object(row)||(row.d!=null&&Number(row.d)!==day))return null;
    return row;
  }
  function dayType(day,holiday){
    if(holiday||day===0)return 'sundayHoliday';
    return day===6?'saturday':'weekday';
  }
  function emptyCounts(){
    var counts={};REASONS.forEach(function(reason){counts[reason]=0;});return counts;
  }
  function classify(snapshot,store,storeId,categoryId,index,date,conditions,resolver,cache,today){
    var decision;
    try{decision=resolver.resolveDate(snapshot,storeId,categoryId,date,{today:today,monthCache:cache});}
    catch(_){return {reason:'unknownTrip'};}
    var trip=decision&&decision.trips&&decision.trips[index];
    if(!trip||trip.status==='unknown')return {reason:'unknownTrip'};
    if(trip.status==='inactive')return {reason:trip.tentative?'tentativeInactiveTrip':'inactiveTrip'};
    if(trip.status!=='active'||trip.conflict||trip.needsDateReview)return {reason:'reviewTrip'};
    var row=rowAt(store,date);
    if(!row)return {reason:'missingDailyRow'};
    if(!conditions||typeof conditions.holiday!=='boolean'||!Number.isInteger(conditions.weekday)||
      conditions.weekday<0||conditions.weekday>6||!Array.isArray(conditions.eventIds))return {reason:'missingConditions'};
    if(conditions.eventIds.length)return {reason:'eventDay'};
    var weather=typeof row.weather==='string'?row.weather.trim():'';
    if(!weather)return {reason:'missingWeather'};
    if(!validTemp(row.tempMaxC)||!validTemp(row.tempMinC)||Number(row.tempMaxC)<Number(row.tempMinC))return {reason:'missingTemperature'};
    var record=store.salesCounts&&store.salesCounts[date]&&store.salesCounts[date][categoryId];
    var value=record&&Array.isArray(record.trips)&&record.trips[index]&&record.trips[index].sales;
    if(!Number.isSafeInteger(value)||value<0)return {reason:'missingSales'};
    return {reason:'eligible',sample:{
      date:date,weekday:conditions.weekday,dayType:dayType(conditions.weekday,conditions.holiday),
      weather:weather,tempMaxC:Number(row.tempMaxC),tempMinC:Number(row.tempMinC),sales:value
    }};
  }
  function examine(snapshot,options,deps){
    options=options||{};deps=deps||{};
    if(!object(snapshot)||!object(snapshot.stores)||!object(snapshot.salesCountManagement)||
      !Array.isArray(snapshot.salesCountManagement.categories))throw new Error('分析元の店舗・カテゴリー情報が不正です。');
    var storeId=options.storeId||snapshot.current,store=snapshot.stores[storeId];
    if(!object(store))throw new Error('分析対象店舗がありません。');
    var today=options.today||localToday();
    if(!parseDate(today))throw new Error('基準日が不正です。');
    var end=options.endDate||shift(today,-1),lookback=options.lookbackDays===undefined?DEFAULT_DAYS:options.lookbackDays;
    if(!Number.isInteger(lookback)||lookback<1||lookback>MAX_DAYS||!parseDate(end)||end>=today)
      throw new Error('終了日または分析日数が不正です（当日・未来日は対象外）。');
    var start=options.startDate||shift(end,-(lookback-1)),dates=datesBetween(start,end);
    var analysis=deps.analysis||analysisDefault,resolver=deps.resolver||resolverDefault;
    if(!analysis||typeof analysis.buildRange!=='function'||!resolver||typeof resolver.resolveDate!=='function')
      throw new Error('分析データ・過去便判定を利用できません。');
    var context=analysis.buildRange(start,end,storeId,Object.assign({},deps.analysisOverrides,{allStores:snapshot}));
    var dayIndex=new Map();
    (Array.isArray(context&&context.daily)?context.daily:[]).forEach(function(day){
      if(day&&parseDate(day.date))dayIndex.set(day.date,day.conditions);
    });
    var cache=new Map(),categories=snapshot.salesCountManagement.categories.map(function(category){
      if(!object(category)||typeof category.id!=='string'||!category.id)return null;
      var trips=[0,1,2].map(function(index){
        var counts=emptyCounts(),samples=[],cohortCounts={};
        dates.forEach(function(date){
          var result=classify(snapshot,store,storeId,category.id,index,date,dayIndex.get(date),resolver,cache,today);
          counts[result.reason]++;
          if(!result.sample)return;
          samples.push(result.sample);
          var key=result.sample.dayType+'|'+result.sample.weather;
          cohortCounts[key]=(cohortCounts[key]||0)+1;
        });
        var cohorts=Object.keys(cohortCounts).sort().map(function(key){
          var pos=key.indexOf('|'),count=cohortCounts[key];
          return {dayType:key.slice(0,pos),weather:key.slice(pos+1),count:count,
            minimumMet:count>=MIN_COHORT};
        });
        return {trip:index+1,eligibleDays:samples.length,counts:counts,cohorts:cohorts,samples:samples};
      });
      return {id:category.id,name:String(category.name||category.id),hidden:!!category.hidden,trips:trips};
    }).filter(Boolean);
    return {version:1,store:{id:storeId,name:String(store.name||storeId)},
      period:{startDate:start,endDate:end,days:dates.length},
      policy:{savedOnly:true,excludeEvents:true,segregateDayTypes:true,
        historicalTripResolver:true,includeZeroSales:true,minimumCohortDays:MIN_COHORT,
        status:'input-readiness-only-not-a-demand-forecast'},
      categories:categories};
  }
  var api={examine:examine,REASONS:REASONS.slice(),DEFAULT_DAYS:DEFAULT_DAYS,
    MIN_COHORT:MIN_COHORT,dayType:dayType,validTemp:validTemp};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.InsightWeatherSalesReadiness=api;
})(typeof window!=='undefined'?window:globalThis);
