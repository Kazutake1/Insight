/* Weekday analysis v1: read-only normal-day weekday tendencies for future AI use. */
(function(root){
  'use strict';
  if(root.InsightWeekdayAnalysis)return;

  var VERSION=1,DEFAULT_LOOKBACK_DAYS=84,MIN_SAMPLE=3,WEEKDAYS=['日','月','火','水','木','金','土'];
  var METRICS={
    salesYen:{label:'売上',mode:'relative',thresholdPct:5},
    customers:{label:'客数',mode:'relative',thresholdPct:5},
    customerUnitPrice:{label:'客単価',mode:'relative',thresholdPct:5},
    wasteYen:{label:'廃棄金額',mode:'relative',thresholdPct:5},
    wasteRate:{label:'廃棄率',mode:'point',thresholdPoint:0.2}
  };

  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function pad(value){return String(value).padStart(2,'0');}
  function parseIso(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var d=new Date(0);d.setFullYear(Number(m[1]),Number(m[2])-1,Number(m[3]));d.setHours(12,0,0,0);
    return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;
  }
  function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function shiftDate(value,days){var d=parseIso(value);if(!d)return null;d.setDate(d.getDate()+Number(days||0));return iso(d);}
  function monthEndIso(year,month,throughDay){
    var last=new Date(Number(year),Number(month),0).getDate(),day=Math.max(1,Math.min(last,Number(throughDay)||last));
    return Number(year)+'-'+pad(month)+'-'+pad(day);
  }
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}

  function environment(overrides){
    overrides=overrides||{};
    var all=overrides.allStores;
    if(all===undefined){try{if(typeof allStores!=='undefined')all=allStores;}catch(_){}}
    if(all===undefined)all=root.allStores;
    return {
      allStores:all,
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      throughDay:overrides.getThroughDay||root.getAIAnalysisThroughDay
    };
  }

  function resolveEndDate(options,env){
    if(options.endDate){
      if(!parseIso(options.endDate))throw new Error('曜日分析の終了日が不正です。');
      return String(options.endDate);
    }
    var year=Number(options.year),month=Number(options.month);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('曜日分析の対象年月が不正です。');
    var through=options.throughDay;
    if(through==null&&typeof env.throughDay==='function'){
      try{through=env.throughDay(year,String(month)+'月');}catch(_){}
    }
    return monthEndIso(year,month,through);
  }

  function resolveRange(options,env){
    var end=resolveEndDate(options,env),lookback=Number(options.lookbackDays||DEFAULT_LOOKBACK_DAYS),start;
    if(!Number.isInteger(lookback)||lookback<14||lookback>366)throw new Error('曜日分析の参照日数が不正です。');
    if(options.startDate){
      if(!parseIso(options.startDate)||String(options.startDate)>end)throw new Error('曜日分析の開始日が不正です。');
      start=String(options.startDate);
    }else start=shiftDate(end,-(lookback-1));
    return {startDate:start,endDate:end,lookbackDays:lookback};
  }

  function dayHasData(day){
    return !!(day&&day.metrics&&Number(day.metrics.inputDays)>0);
  }
  function isEventDay(day){
    return !!(day&&day.conditions&&Array.isArray(day.conditions.eventIds)&&day.conditions.eventIds.length);
  }
  function isHoliday(day){return !!(day&&day.conditions&&day.conditions.holiday);}

  function normalDays(context){
    var daily=context&&Array.isArray(context.daily)?context.daily:[];
    return daily.filter(function(day){return dayHasData(day)&&!isHoliday(day)&&!isEventDay(day);});
  }

  function aggregate(days){
    days=Array.isArray(days)?days:[];
    function values(key){
      return days.map(function(day){return finite(day.metrics&&day.metrics[key]);}).filter(function(value){return value!==null;});
    }
    function mean(list){return list.length?list.reduce(function(sum,value){return sum+value;},0)/list.length:null;}
    var sales=values('salesYen'),customers=values('customers'),waste=values('wasteYen');
    var salesSum=sales.reduce(function(sum,value){return sum+value;},0);
    var customerSum=customers.reduce(function(sum,value){return sum+value;},0);
    var wasteSum=waste.reduce(function(sum,value){return sum+value;},0);
    return {
      sampleCount:days.length,
      salesYen:mean(sales),
      customers:mean(customers),
      customerUnitPrice:sales.length&&customers.length&&customerSum>0?salesSum/customerSum:null,
      wasteYen:mean(waste),
      wasteRate:salesSum>0&&waste.length?wasteSum/salesSum*100:null
    };
  }

  function relativeIndex(value,baseline){
    return value!==null&&baseline!==null&&baseline!==0?value/baseline*100:null;
  }
  function metricPosition(value,baseline,spec,sampleCount){
    if(sampleCount<MIN_SAMPLE||value===null||baseline===null)return {code:'insufficient',label:'データ不足',difference:null,index:null};
    if(spec.mode==='point'){
      var diff=value-baseline,limit=spec.thresholdPoint||0;
      return {code:Math.abs(diff)<=limit?'normal':diff>0?'high':'low',label:Math.abs(diff)<=limit?'平均圏':diff>0?'高め':'低め',difference:diff,index:null};
    }
    var index=relativeIndex(value,baseline);
    if(index===null)return {code:'insufficient',label:'データ不足',difference:null,index:null};
    var delta=index-100,threshold=spec.thresholdPct||0;
    return {code:Math.abs(delta)<=threshold?'normal':delta>0?'high':'low',label:Math.abs(delta)<=threshold?'平均圏':delta>0?'高め':'低め',difference:delta,index:index};
  }

  function recentTrend(days,key,spec){
    var usable=days.filter(function(day){return finite(day.metrics&&day.metrics[key])!==null;});
    if(usable.length<6)return {code:'insufficient',label:'データ不足',recentCount:0,previousCount:0,change:null};
    var recent=usable.slice(-3),previous=usable.slice(-6,-3),recentAgg=aggregate(recent),previousAgg=aggregate(previous);
    var current=recentAgg[key],prior=previousAgg[key];
    if(current===null||prior===null)return {code:'insufficient',label:'データ不足',recentCount:recent.length,previousCount:previous.length,change:null};
    if(spec.mode==='point'){
      var point=current-prior,limit=spec.thresholdPoint||0;
      return {code:Math.abs(point)<=limit?'flat':point>0?'up':'down',label:Math.abs(point)<=limit?'横ばい':point>0?'上昇':'下降',recentCount:recent.length,previousCount:previous.length,change:point};
    }
    if(prior===0)return {code:'insufficient',label:'データ不足',recentCount:recent.length,previousCount:previous.length,change:null};
    var pct=(current-prior)/Math.abs(prior)*100,threshold=spec.thresholdPct||0;
    return {code:Math.abs(pct)<=threshold?'flat':pct>0?'up':'down',label:Math.abs(pct)<=threshold?'横ばい':pct>0?'上昇':'下降',recentCount:recent.length,previousCount:previous.length,change:pct};
  }

  function analyze(options,overrides){
    options=options||{};
    var env=environment(overrides);
    if(!env.analysis||typeof env.analysis.buildRange!=='function')throw new Error('分析コンテキストを利用できません。');
    if(!object(env.allStores)||!object(env.allStores.stores))throw new Error('店舗データを取得できません。');
    var storeId=options.storeId||env.allStores.current,store=env.allStores.stores[storeId];
    if(!object(store))throw new Error('対象店舗を取得できません。');

    var range=resolveRange(options,env),context=env.analysis.buildRange(range.startDate,range.endDate,storeId,overrides);
    var daily=context&&Array.isArray(context.daily)?context.daily.filter(dayHasData):[];
    var normal=normalDays(context),baseline=aggregate(normal);

    var weekdays=WEEKDAYS.map(function(label,index){
      var allForWeekday=daily.filter(function(day){return day.conditions&&day.conditions.weekday===index;});
      var normalForWeekday=normal.filter(function(day){return day.conditions&&day.conditions.weekday===index;});
      var eventDays=allForWeekday.filter(isEventDay),holidayDays=allForWeekday.filter(isHoliday);
      var stats=aggregate(normalForWeekday),metrics={};
      Object.keys(METRICS).forEach(function(key){
        metrics[key]={
          key:key,label:METRICS[key].label,value:stats[key],baseline:baseline[key],
          position:metricPosition(stats[key],baseline[key],METRICS[key],stats.sampleCount),
          recentTrend:recentTrend(normalForWeekday,key,METRICS[key])
        };
      });
      return {
        weekday:index,weekdayLabel:label,
        sampleCount:stats.sampleCount,
        totalDataDays:allForWeekday.length,
        excluded:{eventDays:eventDays.length,holidayDays:holidayDays.length,specialDates:Array.from(new Set(eventDays.concat(holidayDays).map(function(day){return day.date;}))).sort()},
        metrics:metrics
      };
    });

    return {
      version:VERSION,
      store:{id:storeId,name:String(store.name||storeId)},
      period:range,
      policy:{normalDayDefinition:'noEventAndNoHoliday',minimumSample:MIN_SAMPLE,recentWindowOccurrences:3},
      baseline:{sampleCount:baseline.sampleCount,metrics:{
        salesYen:baseline.salesYen,customers:baseline.customers,customerUnitPrice:baseline.customerUnitPrice,wasteYen:baseline.wasteYen,wasteRate:baseline.wasteRate
      }},
      exclusions:{
        eventDays:daily.filter(isEventDay).length,
        holidayDays:daily.filter(isHoliday).length,
        specialDates:Array.from(new Set(daily.filter(function(day){return isEventDay(day)||isHoliday(day);}).map(function(day){return day.date;}))).sort()
      },
      weekdays:weekdays,
      source:{savedOnly:true,readOnly:true,externalTransmission:false}
    };
  }

  var model={
    VERSION:VERSION,
    DEFAULT_LOOKBACK_DAYS:DEFAULT_LOOKBACK_DAYS,
    MIN_SAMPLE:MIN_SAMPLE,
    WEEKDAYS:WEEKDAYS,
    METRICS:METRICS,
    analyze:analyze,
    aggregate:aggregate,
    normalDays:normalDays,
    metricPosition:metricPosition,
    recentTrend:recentTrend
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightWeekdayAnalysis=model;
})(typeof window!=='undefined'?window:globalThis);
