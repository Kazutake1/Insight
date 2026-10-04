/* Analysis context v1: read-only normalized data layer for daily/weekly/monthly AI analysis. */
(function(root){
  'use strict';
  if(root.InsightAnalysisContext)return;

  var CONTEXT_VERSION=1;
  var WEEKDAYS=['日','月','火','水','木','金','土'];

  function copy(value){
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function pad(value){return String(value).padStart(2,'0');}

  function parseIso(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    var year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    var date=new Date(0);
    date.setFullYear(year,month-1,day);
    date.setHours(12,0,0,0);
    if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
    return {year:year,month:month,day:day,date:date,iso:year+'-'+pad(month)+'-'+pad(day)};
  }

  function iso(date){
    return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
  }

  function monthNumber(value,months){
    if(Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12)return Number(value);
    var match=/^(\d{1,2})月$/.exec(String(value||''));
    if(match&&Number(match[1])>=1&&Number(match[1])<=12)return Number(match[1]);
    if(Array.isArray(months)){
      var index=months.indexOf(value);
      if(index>=0)return index+1;
    }
    return null;
  }

  function monthLabel(number,months){
    return Array.isArray(months)&&months[number-1]?months[number-1]:String(number)+'月';
  }

  function environment(overrides){
    overrides=overrides||{};
    var stores=overrides.allStores;
    if(stores===undefined){try{if(typeof allStores!=='undefined')stores=allStores;}catch(_){}}
    if(stores===undefined)stores=root.allStores;

    var kpi=overrides.KPIEngine||root.KPIEngine;
    var events=overrides.InsightEvents||root.InsightEvents;
    var salesCount=overrides.InsightSalesCount||root.InsightSalesCount;
    var comparison=overrides.InsightYearComparison||root.InsightYearComparison;
    var months=overrides.MONTHS;
    if(months===undefined){try{if(typeof MONTHS!=='undefined')months=MONTHS;}catch(_){}}
    if(months===undefined)months=root.MONTHS;

    var holiday=overrides.isHoliday;
    if(holiday===undefined){try{if(typeof isHoliday==='function')holiday=isHoliday;}catch(_){}}
    if(holiday===undefined)holiday=root.isHoliday;

    return {
      allStores:stores,
      KPIEngine:kpi,
      InsightEvents:events,
      InsightSalesCount:salesCount,
      InsightYearComparison:comparison,
      MONTHS:months,
      isHoliday:holiday
    };
  }

  function resolveScope(options,env){
    options=options||{};
    if(options.date){
      var one=parseIso(options.date);
      if(!one)throw new Error('分析対象日が不正です。');
      return {kind:'day',startDate:one.iso,endDate:one.iso,year:one.year,month:one.month,throughDay:one.day,isSingleMonth:true};
    }
    if(options.startDate||options.endDate){
      var start=parseIso(options.startDate),end=parseIso(options.endDate||options.startDate);
      if(!start||!end||start.iso>end.iso)throw new Error('分析対象期間が不正です。');
      return {
        kind:start.iso===end.iso?'day':'range',
        startDate:start.iso,endDate:end.iso,
        year:start.year,month:start.month,throughDay:end.day,
        isSingleMonth:start.year===end.year&&start.month===end.month
      };
    }

    var year=Number(options.year);
    var month=monthNumber(options.month,env.MONTHS);
    if(!Number.isInteger(year)||year<1000||!month)throw new Error('分析対象年月が不正です。');
    var lastDay=new Date(year,month,0).getDate();
    var through=options.throughDay==null?lastDay:Number(options.throughDay);
    if(!Number.isInteger(through)||through<1||through>lastDay)throw new Error('分析対象日数が不正です。');
    return {
      kind:'month',
      startDate:year+'-'+pad(month)+'-01',
      endDate:year+'-'+pad(month)+'-'+pad(through),
      year:year,month:month,throughDay:through,
      isSingleMonth:true,
      completeThroughMonth:through===lastDay
    };
  }

  function getStore(env,storeId){
    var all=env.allStores;
    if(!object(all)||!object(all.stores))throw new Error('店舗データを取得できません。');
    var id=storeId||all.current;
    var selected=all.stores[id];
    if(!object(selected))throw new Error('対象店舗を取得できません。');
    return {id:id,store:selected};
  }

  function dayOf(row,index){
    var value=row&&(row.d!==undefined?row.d:row['日']);
    var day=Number(value);
    return Number.isInteger(day)&&day>=1&&day<=31?day:index+1;
  }

  function rowsInScope(env,store,scope){
    var out=[],cursor=parseIso(scope.startDate).date,end=parseIso(scope.endDate).date;
    cursor=new Date(cursor.getFullYear(),cursor.getMonth(),1,12,0,0,0);
    var endMonth=new Date(end.getFullYear(),end.getMonth(),1,12,0,0,0);

    while(cursor<=endMonth){
      var year=cursor.getFullYear(),month=cursor.getMonth()+1,label=monthLabel(month,env.MONTHS);
      var yearData=store.data&&(store.data[String(year)]||store.data[year]);
      var list=yearData&&Array.isArray(yearData[label])?yearData[label]:[];
      list.forEach(function(row,index){
        if(!row)return;
        var day=dayOf(row,index),date=year+'-'+pad(month)+'-'+pad(day);
        if(date>=scope.startDate&&date<=scope.endDate)out.push({date:date,row:row,year:year,month:month,day:day});
      });
      cursor=new Date(year,month,1,12,0,0,0);
    }
    out.sort(function(a,b){return a.date.localeCompare(b.date);});
    return out;
  }

  function rowHasKpi(row){
    if(!row)return false;
    return ['売上','客数','買上点数'].some(function(key){return row[key]!==undefined&&row[key]!==null&&row[key]!=='';}) ||
      Object.keys(row).some(function(key){return /^廃棄/.test(key)&&row[key]!==undefined&&row[key]!==null&&row[key]!=='';});
  }

  function calcMetrics(env,rows){
    var result={salesYen:null,customers:null,customerUnitPrice:null,items:null,wasteYen:null,wasteRate:null,inputDays:0};
    var raw=rows.map(function(item){return item.row;});
    result.inputDays=raw.filter(rowHasKpi).length;
    if(!raw.length||!env.KPIEngine||typeof env.KPIEngine.calc!=='function')return result;
    var k=env.KPIEngine.calc(raw)||{};
    ['salesYen','customers','customerUnitPrice','items','wasteYen','wasteRate'].forEach(function(key){
      var value=finite(k[key]);
      result[key]=value;
    });
    if(k.inputDays!==undefined&&Number.isFinite(Number(k.inputDays)))result.inputDays=Number(k.inputDays);
    return result;
  }

  function eventSnapshot(env,all,storeId,scope){
    if(!env.InsightEvents||typeof env.InsightEvents.list!=='function')return [];
    var list;
    try{list=env.InsightEvents.list(all,storeId,scope.startDate,scope.endDate)||[];}catch(_){return [];}
    return list.map(function(event){
      var summary='';
      try{summary=env.InsightEvents.summary?env.InsightEvents.summary(event.snapshot):String(event.snapshot&&event.snapshot.title||'');}catch(_){}
      return {
        id:event.id||null,
        type:event.type||null,
        scope:event.scope||null,
        startDate:event.startDate||null,
        endDate:event.endDate||null,
        title:event.snapshot&&event.snapshot.title||'',
        summary:summary,
        note:event.snapshot&&event.snapshot.note||'',
        specialDemand:(Array.isArray(event.snapshot&&event.snapshot.specialDemand)?event.snapshot.specialDemand:[]).map(function(item){
          var prepared=item&&item.prepared!==undefined&&item.prepared!==null?finite(item.prepared):null;
          var sold=item&&item.sold!==undefined&&item.sold!==null?finite(item.sold):null;
          return {id:String(item&&item.id||''),name:String(item&&item.name||''),prepared:prepared,sold:sold,sellThrough:prepared!==null&&prepared>0&&sold!==null?sold/prepared*100:null};
        }).filter(function(item){return item.id&&item.name;})
      };
    });
  }

  function conditionFor(env,item,events){
    var dateInfo=parseIso(item.date),row=item.row||{},holiday=false;
    try{if(typeof env.isHoliday==='function')holiday=!!env.isHoliday(dateInfo.year,dateInfo.month,dateInfo.day);}catch(_){}
    var ids=events.filter(function(event){
      return event.startDate&&event.endDate&&event.startDate<=item.date&&event.endDate>=item.date;
    }).map(function(event){return event.id;}).filter(Boolean);
    return {
      date:item.date,
      weekday:dateInfo.date.getDay(),
      weekdayLabel:WEEKDAYS[dateInfo.date.getDay()],
      holiday:holiday,
      weather:row.weather||null,
      tempMaxC:finite(row.tempMaxC),
      tempMinC:finite(row.tempMinC),
      storeMemo:String(row.storeMemo||'').trim(),
      eventIds:ids
    };
  }

  function dailySnapshot(env,items,events){
    return items.map(function(item){
      return {
        date:item.date,
        metrics:calcMetrics(env,[item]),
        conditions:conditionFor(env,item,events)
      };
    });
  }

  function monthlyOps(env,store,scope,metrics){
    var empty={available:false,evaluationReady:false,laborCostYen:null,grossMarginRate:null,laborRate:null,reason:'月次以外の期間では評価しません。'};
    if(scope.kind!=='month')return empty;
    var label=monthLabel(scope.month,env.MONTHS);
    var yearOps=store.monthlyOps&&(store.monthlyOps[String(scope.year)]||store.monthlyOps[scope.year]);
    var ops=yearOps&&yearOps[label];
    if(!object(ops))return Object.assign({},empty,{reason:'月次運営データがありません。'});
    var labor=finite(ops.laborCostYen),gross=finite(ops.grossMarginRate),ready=!!scope.completeThroughMonth;
    try{
      if(env.InsightYearComparison&&typeof env.InsightYearComparison.isCompletedMonth==='function'){
        ready=!!env.InsightYearComparison.isCompletedMonth(scope.year,label);
      }
    }catch(_){}
    return {
      available:labor!==null||gross!==null,
      evaluationReady:ready,
      laborCostYen:labor,
      grossMarginRate:gross,
      laborRate:labor!==null&&metrics.salesYen!==null&&metrics.salesYen>0?labor/metrics.salesYen*100:null,
      reason:ready?'':'人件費の正式評価は月終了後です。'
    };
  }

  function normalizeSalesRecord(env,value){
    if(env.InsightSalesCount&&typeof env.InsightSalesCount.normalizeRecord==='function'){
      try{return env.InsightSalesCount.normalizeRecord(value);}catch(_){}
    }
    var out={trips:[{delivery:null,sales:null},{delivery:null,sales:null},{delivery:null,sales:null}]};
    var trips=value&&Array.isArray(value.trips)?value.trips:[];
    for(var i=0;i<3;i++){
      var trip=trips[i]||{};
      out.trips[i].delivery=trip.delivery===null||trip.delivery===undefined?null:finite(trip.delivery);
      out.trips[i].sales=trip.sales===null||trip.sales===undefined?null:finite(trip.sales);
    }
    return out;
  }

  function totalRecord(record,key,mask){
    mask=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    var indexes=[0,1,2].filter(function(i){return mask[i]!==false;});
    var values=indexes.map(function(i){return record.trips[i][key];});
    return values.every(function(value){return value===null;})?null:values.reduce(function(sum,value){return sum+(value===null?0:value);},0);
  }

  function aggregateSalesRecords(records,key,mask){
    mask=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    var trips=[0,1,2].map(function(index){
      if(mask[index]===false)return {sum:null,count:0,average:null};
      var values=records.map(function(record){return record.trips[index][key];}).filter(function(value){return value!==null;});
      var sum=values.reduce(function(total,value){return total+value;},0);
      return {sum:values.length?sum:null,count:values.length,average:values.length?sum/values.length:null};
    });
    var active=[0,1,2].filter(function(index){return mask[index]!==false;});
    var complete=records.filter(function(record){return active.every(function(index){return record.trips[index][key]!==null;});});
    var totals=complete.map(function(record){return active.reduce(function(sum,index){return sum+record.trips[index][key];},0);});
    var total=totals.reduce(function(sum,value){return sum+value;},0);
    return {trips:trips,total:{sum:totals.length?total:null,count:totals.length,average:totals.length?total/totals.length:null}};
  }

  function salesCountSnapshot(env,all,store,scope){
    var master=all.salesCountManagement&&Array.isArray(all.salesCountManagement.categories)?all.salesCountManagement.categories:[];
    var saved=object(store.salesCounts)?store.salesCounts:{};
    return {
      categories:master.map(function(category){
        var mask=env.InsightSalesCount&&typeof env.InsightSalesCount.activeTrips==='function'?env.InsightSalesCount.activeTrips(category):(Array.isArray(category.activeTrips)&&category.activeTrips.length===3?category.activeTrips.map(function(v){return v!==false;}):[true,true,true]);
        var daily=[],records=[];
        Object.keys(saved).sort().forEach(function(date){
          if(date<scope.startDate||date>scope.endDate)return;
          var value=saved[date]&&saved[date][category.id];
          if(!value)return;
          var record=normalizeSalesRecord(env,value);
          records.push(record);
          daily.push({
            date:date,
            trips:copy(record.trips),
            deliveryTotal:totalRecord(record,'delivery',mask),
            salesTotal:totalRecord(record,'sales',mask)
          });
        });
        return {
          id:category.id,
          name:category.name,
          hidden:!!category.hidden,
          activeTrips:copy(mask),
          inputDays:daily.length,
          delivery:aggregateSalesRecords(records,'delivery',mask),
          sales:aggregateSalesRecords(records,'sales',mask),
          daily:daily
        };
      })
    };
  }

  function build(options,overrides){
    var env=environment(overrides),scope=resolveScope(options,env),selected=getStore(env,options&&options.storeId);
    var items=rowsInScope(env,selected.store,scope);
    var events=eventSnapshot(env,env.allStores,selected.id,scope);
    var metrics=calcMetrics(env,items);
    return {
      version:CONTEXT_VERSION,
      store:{id:selected.id,name:selected.store.name||selected.id},
      scope:copy(scope),
      metrics:metrics,
      profitCost:monthlyOps(env,selected.store,scope,metrics),
      conditions:{daily:items.map(function(item){return conditionFor(env,item,events);}),events:events},
      salesCount:salesCountSnapshot(env,env.allStores,selected.store,scope),
      daily:dailySnapshot(env,items,events),
      source:{
        savedOnly:true,
        storageSchemaVersion:Number.isSafeInteger(Number(env.allStores.schemaVersion))?Number(env.allStores.schemaVersion):0
      }
    };
  }

  function buildDay(date,storeId,overrides){return build({date:date,storeId:storeId},overrides);}
  function buildMonth(year,month,throughDay,storeId,overrides){return build({year:year,month:month,throughDay:throughDay,storeId:storeId},overrides);}
  function buildRange(startDate,endDate,storeId,overrides){return build({startDate:startDate,endDate:endDate,storeId:storeId},overrides);}

  function buildCurrent(overrides){
    var storeId;
    try{if(typeof allStores!=='undefined'&&allStores)storeId=allStores.current;}catch(_){}
    var nav;
    try{if(typeof currentNav!=='undefined')nav=currentNav;}catch(_){}
    if(nav===0&&root.InsightDateContext&&typeof root.InsightDateContext.getSelectedIso==='function'){
      return buildDay(root.InsightDateContext.getSelectedIso(),storeId,overrides);
    }
    var year=null,month=null,throughDay=null;
    try{if(typeof baseYear!=='undefined')year=baseYear;}catch(_){}
    try{if(typeof selMonth!=='undefined')month=selMonth;}catch(_){}
    try{if(typeof getAIAnalysisThroughDay==='function'&&year!=null&&month)throughDay=getAIAnalysisThroughDay(year,month);}catch(_){}
    return buildMonth(year,month,throughDay,storeId,overrides);
  }

  var model={
    CONTEXT_VERSION:CONTEXT_VERSION,
    build:build,
    buildDay:buildDay,
    buildMonth:buildMonth,
    buildRange:buildRange,
    buildCurrent:buildCurrent,
    parseIso:parseIso
  };

  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAnalysisContext=model;
})(typeof window!=='undefined'?window:globalThis);
