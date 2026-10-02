/* Multi-year analysis v1: read-only same-month trend foundation for future AI use. */
(function(root){
  'use strict';
  if(root.InsightMultiYearAnalysis)return;

  var VERSION=1,DEFAULT_MAX_YEARS=5;
  var METRICS={
    salesYen:{label:'売上',mode:'relative',additive:true,flatPct:2},
    customers:{label:'客数',mode:'relative',additive:true,flatPct:2},
    customerUnitPrice:{label:'客単価',mode:'relative',additive:false,flatPct:2},
    items:{label:'買上点数',mode:'relative',additive:true,flatPct:2},
    wasteYen:{label:'廃棄金額',mode:'relative',additive:true,flatPct:2},
    wasteRate:{label:'廃棄率',mode:'point',additive:false,flatPoint:0.1}
  };

  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function monthLabel(month){return String(Number(month))+'月';}
  function clampDay(year,month,day){return Math.max(1,Math.min(lastDay(year,month),Number(day)||lastDay(year,month)));}
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}

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
    var years=Array.isArray(store.years)?store.years:[];
    var seen=new Set(),out=[];
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
      if(env.comparison&&typeof env.comparison.isCompletedMonth==='function'){
        return !!env.comparison.isCompletedMonth(year,monthLabel(month));
      }
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

  function metricValue(context,key,basis,spec){
    if(!context||!context.metrics)return {raw:null,value:null,inputDays:0};
    var raw=finite(context.metrics[key]),days=Number(context.metrics.inputDays)||0;
    if(raw===null||days<=0)return {raw:raw,value:null,inputDays:days};
    var value=spec.additive&&basis==='dailyAverage'?raw/days:raw;
    return {raw:raw,value:finite(value),inputDays:days};
  }

  function stepDirection(previous,current,spec){
    if(previous==null||current==null)return {direction:'unknown',change:null};
    if(spec.mode==='point'){
      var point=current-previous,limit=spec.flatPoint||0;
      return {direction:Math.abs(point)<=limit?'flat':point>0?'up':'down',change:point};
    }
    if(previous===0){
      if(current===0)return {direction:'flat',change:0};
      return {direction:current>0?'up':'down',change:null};
    }
    var pct=(current-previous)/Math.abs(previous)*100,flat=spec.flatPct||0;
    return {direction:Math.abs(pct)<=flat?'flat':pct>0?'up':'down',change:pct};
  }

  function classifySeries(series,spec){
    var available=series.filter(function(point){return point.value!==null;});
    if(available.length<3)return {code:'insufficient',label:'データ不足',continuousYears:false,steps:[]};
    var continuous=available.every(function(point,index){return index===0||point.year===available[index-1].year+1;});
    if(!continuous)return {code:'insufficient',label:'データ不足',continuousYears:false,steps:[]};

    var steps=[];
    for(var i=1;i<available.length;i++){
      var change=stepDirection(available[i-1].value,available[i].value,spec);
      steps.push({
        fromYear:available[i-1].year,toYear:available[i].year,
        direction:change.direction,change:change.change
      });
    }
    var directions=steps.map(function(step){return step.direction;}).filter(function(direction){return direction!=='unknown';});
    var nonFlat=directions.filter(function(direction){return direction!=='flat';});
    if(!nonFlat.length)return {code:'flat',label:'横ばい',continuousYears:true,steps:steps};
    if(nonFlat.every(function(direction){return direction==='up';}))return {code:'up_continuing',label:'上昇継続',continuousYears:true,steps:steps};
    if(nonFlat.every(function(direction){return direction==='down';}))return {code:'down_continuing',label:'下降継続',continuousYears:true,steps:steps};

    var last=nonFlat[nonFlat.length-1],previous=nonFlat.slice(0,-1);
    if(previous.length&&previous[previous.length-1]!==last){
      return {
        code:last==='up'?'up_reversal':'down_reversal',
        label:last==='up'?'上昇転換':'下降転換',
        continuousYears:true,steps:steps
      };
    }
    return {code:'volatile',label:'変動',continuousYears:true,steps:steps};
  }

  function latestChange(series,spec){
    var available=series.filter(function(point){return point.value!==null;});
    if(available.length<2)return null;
    var previous=available[available.length-2],current=available[available.length-1];
    var change=stepDirection(previous.value,current.value,spec);
    return {
      fromYear:previous.year,toYear:current.year,
      direction:change.direction,
      change:change.change,
      mode:spec.mode
    };
  }

  function analyzeMonth(options,overrides){
    options=options||{};
    var year=Number(options.year),month=Number(options.month);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('複数年度分析の対象年月が不正です。');
    var maxYears=Number(options.maxYears||DEFAULT_MAX_YEARS);
    if(!Number.isInteger(maxYears)||maxYears<2||maxYears>10)throw new Error('複数年度分析の対象年数が不正です。');

    var env=environment(overrides);
    if(!env.analysis||typeof env.analysis.buildMonth!=='function')throw new Error('分析コンテキストを利用できません。');
    var selected=storeInfo(env,options.storeId);
    var completed=targetCompleted(env,year,month,options.completed);
    var throughDay=resolveThroughDay(env,year,month,options,completed);
    var basis=completed?'total':'dailyAverage';
    var years=registeredYears(selected.store,year,maxYears);
    var points=[];

    years.forEach(function(targetYear){
      var day=completed?lastDay(targetYear,month):clampDay(targetYear,month,throughDay),context=null,error=null;
      try{context=env.analysis.buildMonth(targetYear,month,day,selected.id,overrides);}catch(err){error=String(err&&err.message?err.message:err);}
      var metrics={},inputDays=context&&context.metrics?Number(context.metrics.inputDays)||0:0;
      Object.keys(METRICS).forEach(function(key){
        var value=metricValue(context,key,basis,METRICS[key]);
        metrics[key]={raw:value.raw,value:value.value};
      });
      points.push({year:targetYear,throughDay:day,inputDays:inputDays,available:inputDays>0,error:error,metrics:metrics});
    });

    var metrics={};
    Object.keys(METRICS).forEach(function(key){
      var spec=METRICS[key],series=points.map(function(point){
        return {
          year:point.year,throughDay:point.throughDay,inputDays:point.inputDays,
          raw:point.metrics[key].raw,value:point.metrics[key].value
        };
      });
      metrics[key]={
        key:key,label:spec.label,mode:spec.mode,
        series:series,
        trend:classifySeries(series,spec),
        latestChange:latestChange(series,spec)
      };
    });

    return {
      version:VERSION,
      store:{id:selected.id,name:String(selected.store.name||selected.id)},
      period:{
        year:year,month:month,throughDay:throughDay,completed:completed,basis:basis,
        label:String(year)+'年'+String(month)+'月'+(completed?'':' '+String(throughDay)+'日まで')
      },
      years:years,
      points:points,
      metrics:metrics,
      source:{savedOnly:true,readOnly:true,externalTransmission:false}
    };
  }

  var model={
    VERSION:VERSION,
    DEFAULT_MAX_YEARS:DEFAULT_MAX_YEARS,
    METRICS:METRICS,
    analyzeMonth:analyzeMonth,
    classifySeries:classifySeries,
    stepDirection:stepDirection,
    registeredYears:registeredYears
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightMultiYearAnalysis=model;
})(typeof window!=='undefined'?window:globalThis);
