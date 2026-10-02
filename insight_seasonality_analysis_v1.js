/* Seasonality analysis v1: read-only recurring monthly pattern foundation for future AI use. */
(function(root){
  'use strict';
  if(root.InsightSeasonalityAnalysis)return;

  var VERSION=1,DEFAULT_MAX_YEARS=5,MIN_HISTORY_YEARS=2,MIN_REFERENCE_MONTHS=5,MIN_REFERENCE_INPUT_DAYS=14,MIN_TARGET_INPUT_DAYS=3;
  var INDEX_THRESHOLD=5,CURRENT_TOLERANCE=7;
  var METRICS={
    salesYen:{label:'売上',additive:true},
    customers:{label:'客数',additive:true},
    customerUnitPrice:{label:'客単価',additive:false},
    items:{label:'買上点数',additive:true},
    wasteYen:{label:'廃棄金額',additive:true},
    wasteRate:{label:'廃棄率',additive:false}
  };

  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function monthLabel(month){return String(Number(month))+'月';}
  function clampDay(year,month,day){return Math.max(1,Math.min(lastDay(year,month),Number(day)||lastDay(year,month)));}
  function mean(values){return values.length?values.reduce(function(sum,value){return sum+value;},0)/values.length:null;}

  function environment(overrides){
    overrides=overrides||{};
    var all=overrides.allStores;
    if(all===undefined){try{if(typeof allStores!=='undefined')all=allStores;}catch(_){}}
    if(all===undefined)all=root.allStores;
    return {
      allStores:all,
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      comparison:overrides.YearComparison||root.InsightYearComparison,
      throughDay:overrides.getThroughDay||root.getAIAnalysisThroughDay
    };
  }

  function storeInfo(env,storeId){
    var all=env.allStores;
    if(!object(all)||!object(all.stores))throw new Error('店舗データを取得できません。');
    var id=storeId||all.current,store=all.stores[id];
    if(!object(store))throw new Error('対象店舗を取得できません。');
    return {id:id,store:store};
  }

  function registeredYears(store,targetYear,maxYears){
    var years=Array.isArray(store.years)?store.years:[],seen=new Set(),out=[];
    years.forEach(function(value){
      var year=Number(value);
      if(Number.isInteger(year)&&year<=targetYear&&!seen.has(year)){seen.add(year);out.push(year);}
    });
    out.sort(function(a,b){return a-b;});
    return out.slice(-maxYears);
  }

  function targetCompleted(env,year,month,explicit){
    if(typeof explicit==='boolean')return explicit;
    try{
      if(env.comparison&&typeof env.comparison.isCompletedMonth==='function')return !!env.comparison.isCompletedMonth(year,monthLabel(month));
    }catch(_){}
    return false;
  }

  function resolveThroughDay(env,year,month,options,completed){
    if(completed)return lastDay(year,month);
    if(options.throughDay!=null)return clampDay(year,month,options.throughDay);
    try{
      if(typeof env.throughDay==='function'){
        var value=env.throughDay(year,monthLabel(month));
        if(value!=null)return clampDay(year,month,value);
      }
    }catch(_){}
    return lastDay(year,month);
  }

  function metricValue(context,key,spec){
    if(!context||!context.metrics)return null;
    var raw=finite(context.metrics[key]),days=Number(context.metrics.inputDays)||0;
    if(raw===null||days<=0)return null;
    return spec.additive?finite(raw/days):raw;
  }

  function buildMonthPoint(env,storeId,year,month,throughDay,overrides){
    var context=null,error=null;
    try{context=env.analysis.buildMonth(year,month,throughDay,storeId,overrides);}
    catch(err){error=String(err&&err.message?err.message:err);}
    var inputDays=context&&context.metrics?Number(context.metrics.inputDays)||0:0,metrics={};
    Object.keys(METRICS).forEach(function(key){metrics[key]=metricValue(context,key,METRICS[key]);});
    return {year:year,month:month,throughDay:throughDay,inputDays:inputDays,metrics:metrics,error:error};
  }

  function buildYearMatrix(env,storeId,year,targetYear,targetMonth,throughDay,overrides){
    var months=[];
    var maxMonth=year===targetYear?targetMonth:12;
    for(var month=1;month<=maxMonth;month++){
      var day=year===targetYear&&month===targetMonth?throughDay:lastDay(year,month);
      months.push(buildMonthPoint(env,storeId,year,month,day,overrides));
    }
    return {year:year,months:months};
  }

  function pointFor(matrix,month){
    return matrix&&Array.isArray(matrix.months)?matrix.months.find(function(point){return point.month===month;})||null:null;
  }

  function referenceFor(matrix,targetMonth,key,minInputDays){
    var values=(matrix&&Array.isArray(matrix.months)?matrix.months:[]).filter(function(point){
      return point.month!==targetMonth&&point.inputDays>=minInputDays&&finite(point.metrics&&point.metrics[key])!==null;
    }).map(function(point){return point.metrics[key];});
    return {months:values.length,value:values.length>=MIN_REFERENCE_MONTHS?mean(values):null};
  }

  function seasonalPoint(matrix,targetMonth,key,minTargetDays){
    var target=pointFor(matrix,targetMonth),reference=referenceFor(matrix,targetMonth,key,MIN_REFERENCE_INPUT_DAYS);
    if(!target||target.inputDays<minTargetDays)return {available:false,year:matrix.year,month:targetMonth,inputDays:target?target.inputDays:0,value:target&&target.metrics?target.metrics[key]:null,referenceMonths:reference.months,referenceValue:reference.value,index:null};
    var value=finite(target.metrics&&target.metrics[key]);
    if(value===null||reference.value===null||reference.value===0)return {available:false,year:matrix.year,month:targetMonth,inputDays:target.inputDays,value:value,referenceMonths:reference.months,referenceValue:reference.value,index:null};
    return {available:true,year:matrix.year,month:targetMonth,inputDays:target.inputDays,value:value,referenceMonths:reference.months,referenceValue:reference.value,index:value/reference.value*100};
  }

  function indexDirection(index){
    if(index===null||index===undefined||!Number.isFinite(Number(index)))return 'unknown';
    var value=Number(index);
    return value>100+INDEX_THRESHOLD?'high':value<100-INDEX_THRESHOLD?'low':'neutral';
  }

  function classifyHistory(points){
    var available=points.filter(function(point){return point.available&&point.index!==null;});
    if(available.length<MIN_HISTORY_YEARS)return {code:'insufficient',label:'データ不足',sampleYears:available.length,meanIndex:null,consistencyRatio:null,counts:{high:0,neutral:0,low:0}};
    var counts={high:0,neutral:0,low:0};
    available.forEach(function(point){var direction=indexDirection(point.index);if(counts[direction]!==undefined)counts[direction]++;});
    var required=Math.ceil(available.length*2/3),avg=mean(available.map(function(point){return point.index;})),code='mixed',label='年によって変動',dominant=Math.max(counts.high,counts.neutral,counts.low);
    if(counts.high>=required&&avg>100+INDEX_THRESHOLD){code='recurring_high';label='季節的に高い';}
    else if(counts.low>=required&&avg<100-INDEX_THRESHOLD){code='recurring_low';label='季節的に低い';}
    else if(counts.neutral>=required||Math.abs(avg-100)<=INDEX_THRESHOLD){code='neutral';label='明確な季節差なし';}
    return {code:code,label:label,sampleYears:available.length,meanIndex:avg,consistencyRatio:dominant/available.length,counts:counts};
  }

  function currentFit(current,pattern){
    if(!current||!current.available||current.index===null||!pattern||pattern.code==='insufficient'||pattern.meanIndex===null){
      return {code:'insufficient',label:'データ不足',differencePoints:null,currentDirection:current?indexDirection(current.index):'unknown'};
    }
    var difference=current.index-pattern.meanIndex,currentDirection=indexDirection(current.index),historicalDirection=indexDirection(pattern.meanIndex);
    if(Math.abs(difference)<=CURRENT_TOLERANCE)return {code:'aligned',label:'過去の季節傾向の範囲内',differencePoints:difference,currentDirection:currentDirection};
    if((historicalDirection==='high'&&currentDirection==='low')||(historicalDirection==='low'&&currentDirection==='high')){
      return {code:'opposite',label:'過去の季節傾向と逆方向',differencePoints:difference,currentDirection:currentDirection};
    }
    return {code:difference>0?'above_expected':'below_expected',label:difference>0?'季節想定より高い':'季節想定より低い',differencePoints:difference,currentDirection:currentDirection};
  }

  function relationship(pattern,current,fit){
    if(!pattern||pattern.code==='insufficient'||!current||!current.available||!fit||fit.code==='insufficient')return {code:'insufficient',label:'データ不足'};
    var currentDirection=indexDirection(current.index);
    if(pattern.code==='recurring_high'){
      if(currentDirection==='high'&&fit.code!=='opposite')return {code:'recurring_high',label:'例年の季節的な上昇'};
      return {code:'seasonal_high_not_repeated',label:'例年の上昇パターンから外れている'};
    }
    if(pattern.code==='recurring_low'){
      if(currentDirection==='low'&&fit.code!=='opposite')return {code:'recurring_low',label:'例年の季節的な低下'};
      return {code:'seasonal_low_not_repeated',label:'例年の低下パターンから外れている'};
    }
    if((pattern.code==='neutral'||pattern.code==='mixed')&&currentDirection==='high')return {code:'current_only_high',label:'今年だけ高い可能性'};
    if((pattern.code==='neutral'||pattern.code==='mixed')&&currentDirection==='low')return {code:'current_only_low',label:'今年だけ低い可能性'};
    return {code:'no_clear_seasonality',label:'明確な季節性なし'};
  }

  function historyForMonth(matrices,month,key){
    var points=matrices.map(function(matrix){return seasonalPoint(matrix,month,key,MIN_REFERENCE_INPUT_DAYS);});
    return {points:points,pattern:classifyHistory(points)};
  }

  function buildProfile(historyMatrices){
    var profile=[];
    for(var month=1;month<=12;month++){
      var metrics={};
      Object.keys(METRICS).forEach(function(key){
        var history=historyForMonth(historyMatrices,month,key);
        metrics[key]={key:key,label:METRICS[key].label,pattern:history.pattern};
      });
      profile.push({month:month,metrics:metrics});
    }
    return profile;
  }

  function analyze(options,overrides){
    options=options||{};
    var year=Number(options.year),month=Number(options.month);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('季節性分析の対象年月が不正です。');
    var maxYears=Number(options.maxYears||DEFAULT_MAX_YEARS);
    if(!Number.isInteger(maxYears)||maxYears<3||maxYears>10)throw new Error('季節性分析の対象年数が不正です。');

    var env=environment(overrides);
    if(!env.analysis||typeof env.analysis.buildMonth!=='function')throw new Error('分析コンテキストを利用できません。');
    var selected=storeInfo(env,options.storeId),years=registeredYears(selected.store,year,maxYears);
    if(years.indexOf(year)<0)throw new Error('対象年度が登録されていません。');

    var completed=targetCompleted(env,year,month,options.completed),throughDay=resolveThroughDay(env,year,month,options,completed);
    var matrices=years.map(function(targetYear){return buildYearMatrix(env,selected.id,targetYear,year,month,throughDay,overrides);});
    var currentMatrix=matrices.find(function(matrix){return matrix.year===year;});
    var historyMatrices=matrices.filter(function(matrix){return matrix.year<year;});
    var targetMinDays=completed?MIN_REFERENCE_INPUT_DAYS:Math.max(1,Math.min(MIN_TARGET_INPUT_DAYS,throughDay));
    var metrics={};

    Object.keys(METRICS).forEach(function(key){
      var history=historyForMonth(historyMatrices,month,key);
      var current=seasonalPoint(currentMatrix,month,key,targetMinDays);
      current.provisional=!completed||current.inputDays<MIN_REFERENCE_INPUT_DAYS;
      var fit=currentFit(current,history.pattern);
      metrics[key]={
        key:key,label:METRICS[key].label,
        historical:history,
        current:current,
        fit:fit,
        relationship:relationship(history.pattern,current,fit)
      };
    });

    return {
      version:VERSION,
      store:{id:selected.id,name:String(selected.store.name||selected.id)},
      period:{year:year,month:month,throughDay:throughDay,completed:completed,label:String(year)+'年'+String(month)+'月'+(completed?'':' '+String(throughDay)+'日まで')},
      years:years,
      historicalYears:historyMatrices.map(function(matrix){return matrix.year;}),
      policy:{
        indexBase:100,
        historicalMinimumYears:MIN_HISTORY_YEARS,
        minimumReferenceMonths:MIN_REFERENCE_MONTHS,
        minimumReferenceInputDays:MIN_REFERENCE_INPUT_DAYS,
        currentMinimumInputDays:targetMinDays,
        recurringDirectionRule:'twoThirds',
        eventAndHolidayTreatment:'includedAsSeasonality',
        targetMonthExcludedFromReference:true
      },
      metrics:metrics,
      profile:buildProfile(historyMatrices),
      source:{savedOnly:true,readOnly:true,externalTransmission:false}
    };
  }

  var model={
    VERSION:VERSION,DEFAULT_MAX_YEARS:DEFAULT_MAX_YEARS,MIN_HISTORY_YEARS:MIN_HISTORY_YEARS,
    MIN_REFERENCE_MONTHS:MIN_REFERENCE_MONTHS,MIN_REFERENCE_INPUT_DAYS:MIN_REFERENCE_INPUT_DAYS,
    METRICS:METRICS,analyze:analyze,seasonalPoint:seasonalPoint,classifyHistory:classifyHistory,
    currentFit:currentFit,relationship:relationship,indexDirection:indexDirection,registeredYears:registeredYears
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSeasonalityAnalysis=model;
})(typeof window!=='undefined'?window:globalThis);
