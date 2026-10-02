/* Sale impact analysis v1: read-only before/during/after comparison for future AI use. */
(function(root){
  'use strict';
  if(root.InsightSaleImpactAnalysis)return;

  var VERSION=1,DEFAULT_WINDOW_WEEKS=4,MIN_CONTROL_PER_WEEKDAY=2;
  var KPI_SPECS={
    salesYen:{label:'売上',mode:'relative',threshold:5},
    customers:{label:'客数',mode:'relative',threshold:5},
    customerUnitPrice:{label:'客単価',mode:'relative',threshold:5},
    items:{label:'買上点数',mode:'relative',threshold:5},
    wasteYen:{label:'廃棄金額',mode:'relative',threshold:5},
    wasteRate:{label:'廃棄率',mode:'point',threshold:0.2}
  };
  var PRODUCT_SPECS={
    averageDelivery:{label:'対象商品 平均納品数',mode:'relative',threshold:5},
    averageSales:{label:'対象商品 平均販売数',mode:'relative',threshold:5},
    sellThrough:{label:'対象商品 消化率',mode:'point',threshold:2}
  };

  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function pad(value){return String(value).padStart(2,'0');}
  function parseIso(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    var date=new Date(0);date.setFullYear(Number(match[1]),Number(match[2])-1,Number(match[3]));date.setHours(12,0,0,0);
    if(date.getFullYear()!==Number(match[1])||date.getMonth()!==Number(match[2])-1||date.getDate()!==Number(match[3]))return null;
    return date;
  }
  function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function shift(value,days){var date=parseIso(value);if(!date)return null;date.setDate(date.getDate()+Number(days||0));return iso(date);}
  function eachDate(start,end){
    var out=[],cursor=start,guard=0;
    while(cursor&&cursor<=end&&guard<3700){out.push(cursor);cursor=shift(cursor,1);guard++;}
    return out;
  }
  function weekday(value){var date=parseIso(value);return date?date.getDay():null;}

  function environment(overrides){
    overrides=overrides||{};
    var all=overrides.allStores;
    if(all===undefined){try{if(typeof allStores!=='undefined')all=allStores;}catch(_){}}
    if(all===undefined)all=root.allStores;
    return {
      allStores:all,
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      events:overrides.Events||root.InsightEvents,
      sales:overrides.SalesCount||root.InsightSalesCount
    };
  }

  function findSale(env,eventId){
    var all=env.allStores,events=all&&all.eventManagement&&Array.isArray(all.eventManagement.events)?all.eventManagement.events:[];
    var event=events.find(function(item){return item&&item.id===eventId;});
    if(!event||event.type!=='sale'||!event.snapshot||!event.snapshot.sale)throw new Error('対象セールを取得できません。');
    if(!parseIso(event.startDate)||!parseIso(event.endDate)||event.startDate>event.endDate)throw new Error('セール開催期間が不正です。');
    return JSON.parse(JSON.stringify(event));
  }

  function eventSummary(env,event){
    try{return env.events&&typeof env.events.summary==='function'?env.events.summary(event.snapshot):String(event.snapshot&&event.snapshot.title||'');}
    catch(_){return String(event.snapshot&&event.snapshot.title||'');}
  }

  function inputDay(day){return !!(day&&day.metrics&&Number(day.metrics.inputDays)>0);}
  function eventIds(day){return day&&day.conditions&&Array.isArray(day.conditions.eventIds)?day.conditions.eventIds:[];}
  function normalControlDay(day,targetWeekdays){
    return inputDay(day)&&day.conditions&&!day.conditions.holiday&&eventIds(day).length===0&&targetWeekdays.has(day.conditions.weekday);
  }

  function aggregateKpis(days){
    days=(days||[]).filter(inputDay);
    function sum(key){
      var values=days.map(function(day){return finite(day.metrics&&day.metrics[key]);}).filter(function(value){return value!==null;});
      return {count:values.length,total:values.reduce(function(total,value){return total+value;},0)};
    }
    var sales=sum('salesYen'),customers=sum('customers'),items=sum('items'),waste=sum('wasteYen');
    return {
      sampleCount:days.length,
      salesYen:sales.count?sales.total/days.length:null,
      customers:customers.count?customers.total/days.length:null,
      customerUnitPrice:sales.count&&customers.count&&customers.total>0?sales.total/customers.total:null,
      items:items.count?items.total/days.length:null,
      wasteYen:waste.count?waste.total/days.length:null,
      wasteRate:sales.count&&waste.count&&sales.total>0?waste.total/sales.total*100:null
    };
  }

  function saleWeekdayWeights(days){
    var weights=[0,0,0,0,0,0,0];
    days.filter(inputDay).forEach(function(day){
      if(day.conditions&&Number.isInteger(day.conditions.weekday))weights[day.conditions.weekday]++;
    });
    return weights;
  }

  function weightedControl(days,weights){
    var totalWeight=weights.reduce(function(sum,value){return sum+value;},0),groups={};
    for(var index=0;index<7;index++){
      if(!weights[index])continue;
      var group=days.filter(function(day){return day.conditions&&day.conditions.weekday===index;}),agg=aggregateKpis(group);
      groups[index]={sampleCount:group.length,weight:weights[index],metrics:agg};
      if(group.length<MIN_CONTROL_PER_WEEKDAY)return {available:false,sampleCount:days.length,requiredWeekday:index,groups:groups,metrics:emptyKpis()};
    }
    if(!totalWeight)return {available:false,sampleCount:days.length,requiredWeekday:null,groups:groups,metrics:emptyKpis()};

    var synth={salesYen:0,customers:0,items:0,wasteYen:0},has={salesYen:true,customers:true,items:true,wasteYen:true};
    Object.keys(groups).forEach(function(key){
      var group=groups[key],weight=group.weight;
      ['salesYen','customers','items','wasteYen'].forEach(function(metric){
        var value=group.metrics[metric];
        if(value===null){has[metric]=false;return;}
        synth[metric]+=value*weight;
      });
    });
    var metrics={
      sampleCount:days.length,
      salesYen:has.salesYen?synth.salesYen/totalWeight:null,
      customers:has.customers?synth.customers/totalWeight:null,
      customerUnitPrice:has.salesYen&&has.customers&&synth.customers>0?synth.salesYen/synth.customers:null,
      items:has.items?synth.items/totalWeight:null,
      wasteYen:has.wasteYen?synth.wasteYen/totalWeight:null,
      wasteRate:has.salesYen&&has.wasteYen&&synth.salesYen>0?synth.wasteYen/synth.salesYen*100:null
    };
    return {available:true,sampleCount:days.length,requiredWeekday:null,groups:groups,metrics:metrics};
  }

  function emptyKpis(){
    return {sampleCount:0,salesYen:null,customers:null,customerUnitPrice:null,items:null,wasteYen:null,wasteRate:null};
  }

  function categoriesForSale(env,event){
    if(!env.sales||typeof env.sales.categoriesForSale!=='function')return [];
    try{return env.sales.categoriesForSale(env.allStores,event.snapshot.sale)||[];}catch(_){return [];}
  }

  function recordTotal(record,key,mask){
    if(!record||!Array.isArray(record.trips))return null;
    var indexes=[0,1,2].filter(function(index){return mask[index]!==false;});
    var values=indexes.map(function(index){var trip=record.trips[index]||{};return trip[key]===undefined?null:trip[key];});
    if(values.some(function(value){return value===null||value===undefined||!Number.isFinite(Number(value));}))return null;
    return values.reduce(function(sum,value){return sum+Number(value);},0);
  }

  function productDay(env,store,date,categories){
    var rows=[],salesComplete=true,deliveryComplete=true,totalSales=0,totalDelivery=0;
    categories.forEach(function(category){
      var raw=store.salesCounts&&store.salesCounts[date]&&store.salesCounts[date][category.id];
      var record=raw&&env.sales&&typeof env.sales.normalizeRecord==='function'?env.sales.normalizeRecord(raw):null;
      var mask=env.sales&&typeof env.sales.activeTrips==='function'?env.sales.activeTrips(category):[true,true,true];
      var sales=recordTotal(record,'sales',mask),delivery=recordTotal(record,'delivery',mask);
      if(sales===null)salesComplete=false;else totalSales+=sales;
      if(delivery===null)deliveryComplete=false;else totalDelivery+=delivery;
      rows.push({categoryId:category.id,name:category.name,sales:sales,delivery:delivery});
    });
    return {
      date:date,weekday:weekday(date),categories:rows,
      sales:salesComplete&&categories.length?totalSales:null,
      delivery:deliveryComplete&&categories.length?totalDelivery:null
    };
  }

  function aggregateProduct(days){
    var sales=days.map(function(day){return finite(day.sales);}).filter(function(value){return value!==null;});
    var delivery=days.map(function(day){return finite(day.delivery);}).filter(function(value){return value!==null;});
    var salesSum=sales.reduce(function(sum,value){return sum+value;},0),deliverySum=delivery.reduce(function(sum,value){return sum+value;},0);
    return {
      sampleCount:days.length,
      salesCount:sales.length,deliveryCount:delivery.length,
      averageSales:sales.length?salesSum/sales.length:null,
      averageDelivery:delivery.length?deliverySum/delivery.length:null,
      sellThrough:sales.length&&delivery.length&&deliverySum>0?salesSum/deliverySum*100:null
    };
  }

  function weightedProductControl(days,weights){
    var totalWeight=weights.reduce(function(sum,value){return sum+value;},0),salesTotal=0,deliveryTotal=0,salesOk=true,deliveryOk=true,groups={};
    if(!totalWeight)return {available:false,sampleCount:days.length,metrics:emptyProduct(),groups:groups};
    for(var index=0;index<7;index++){
      if(!weights[index])continue;
      var group=days.filter(function(day){return day.weekday===index;}),agg=aggregateProduct(group);
      groups[index]={sampleCount:group.length,weight:weights[index],metrics:agg};
      if(group.length<MIN_CONTROL_PER_WEEKDAY||agg.averageSales===null)salesOk=false;
      if(group.length<MIN_CONTROL_PER_WEEKDAY||agg.averageDelivery===null)deliveryOk=false;
      if(agg.averageSales!==null)salesTotal+=agg.averageSales*weights[index];
      if(agg.averageDelivery!==null)deliveryTotal+=agg.averageDelivery*weights[index];
    }
    var metrics={
      sampleCount:days.length,
      salesCount:salesOk?totalWeight:0,
      deliveryCount:deliveryOk?totalWeight:0,
      averageSales:salesOk?salesTotal/totalWeight:null,
      averageDelivery:deliveryOk?deliveryTotal/totalWeight:null,
      sellThrough:salesOk&&deliveryOk&&deliveryTotal>0?salesTotal/deliveryTotal*100:null
    };
    return {available:salesOk||deliveryOk,sampleCount:days.length,metrics:metrics,groups:groups};
  }

  function emptyProduct(){
    return {sampleCount:0,salesCount:0,deliveryCount:0,averageSales:null,averageDelivery:null,sellThrough:null};
  }

  function change(value,baseline,spec){
    if(value===null||baseline===null)return {available:false,direction:'unknown',change:null};
    if(spec.mode==='point'){
      var point=value-baseline,limit=spec.threshold;
      return {available:true,direction:Math.abs(point)<=limit?'flat':point>0?'up':'down',change:point};
    }
    if(baseline===0)return value===0?{available:true,direction:'flat',change:0}:{available:false,direction:'unknown',change:null};
    var pct=(value-baseline)/Math.abs(baseline)*100,threshold=spec.threshold;
    return {available:true,direction:Math.abs(pct)<=threshold?'flat':pct>0?'up':'down',change:pct};
  }

  function phasePattern(before,during,after,spec){
    var duringChange=change(during,before,spec),afterChange=change(after,before,spec);
    if(!duringChange.available||!afterChange.available)return {code:'insufficient',label:'データ不足',duringVsBefore:duringChange,afterVsBefore:afterChange};
    if(duringChange.direction==='up'&&afterChange.direction==='flat')return {code:'temporary_up',label:'期間中のみ上昇',duringVsBefore:duringChange,afterVsBefore:afterChange};
    if(duringChange.direction==='up'&&afterChange.direction==='up')return {code:'sustained_up',label:'終了後も上昇',duringVsBefore:duringChange,afterVsBefore:afterChange};
    if(duringChange.direction==='down'&&afterChange.direction==='flat')return {code:'temporary_down',label:'期間中のみ下降',duringVsBefore:duringChange,afterVsBefore:afterChange};
    if(duringChange.direction==='down'&&afterChange.direction==='down')return {code:'sustained_down',label:'終了後も下降',duringVsBefore:duringChange,afterVsBefore:afterChange};
    if(duringChange.direction==='flat'&&afterChange.direction==='flat')return {code:'no_clear_change',label:'明確な変化なし',duringVsBefore:duringChange,afterVsBefore:afterChange};
    return {code:'mixed',label:'変動',duringVsBefore:duringChange,afterVsBefore:afterChange};
  }

  function buildMetricComparison(before,during,after,specs){
    var out={};
    Object.keys(specs).forEach(function(key){
      out[key]={
        key:key,label:specs[key].label,mode:specs[key].mode,
        before:before[key],during:during[key],after:after[key],
        pattern:phasePattern(before[key],during[key],after[key],specs[key])
      };
    });
    return out;
  }

  function analyzeOccurrence(options,overrides){
    options=options||{};
    var env=environment(overrides);
    if(!object(env.allStores)||!object(env.allStores.stores))throw new Error('店舗データを取得できません。');
    if(!env.analysis||typeof env.analysis.buildRange!=='function')throw new Error('分析コンテキストを利用できません。');
    if(!env.events||typeof env.events.list!=='function')throw new Error('イベント機能を利用できません。');
    if(!env.sales)throw new Error('販売数分析機能を利用できません。');

    var storeId=options.storeId||env.allStores.current,store=env.allStores.stores[storeId];
    if(!object(store))throw new Error('対象店舗を取得できません。');
    var event=findSale(env,options.eventId);
    var windowWeeks=Number(options.windowWeeks||DEFAULT_WINDOW_WEEKS);
    if(!Number.isInteger(windowWeeks)||windowWeeks<1||windowWeeks>12)throw new Error('セール前後の比較期間が不正です。');

    var beforeStart=shift(event.startDate,-7*windowWeeks),beforeEnd=shift(event.startDate,-1);
    var afterStart=shift(event.endDate,1),afterEnd=shift(event.endDate,7*windowWeeks);
    var context=env.analysis.buildRange(beforeStart,afterEnd,storeId,overrides);
    var daily=context&&Array.isArray(context.daily)?context.daily:[];
    var saleDates=new Set(eachDate(event.startDate,event.endDate));
    var duringDays=daily.filter(function(day){return saleDates.has(day.date)&&inputDay(day);});
    var weights=saleWeekdayWeights(duringDays);
    var targetWeekdays=new Set(weights.map(function(weight,index){return weight?index:null;}).filter(function(value){return value!==null;}));

    var beforeDays=daily.filter(function(day){return day.date>=beforeStart&&day.date<=beforeEnd&&normalControlDay(day,targetWeekdays);});
    var afterDays=daily.filter(function(day){return day.date>=afterStart&&day.date<=afterEnd&&normalControlDay(day,targetWeekdays);});
    var beforeControl=weightedControl(beforeDays,weights),afterControl=weightedControl(afterDays,weights),duringMetrics=aggregateKpis(duringDays);

    var categories=categoriesForSale(env,event);
    var saleProductDays=eachDate(event.startDate,event.endDate).map(function(date){return productDay(env,store,date,categories);});
    var productWeights=[0,0,0,0,0,0,0];
    saleProductDays.filter(function(day){return day.sales!==null||day.delivery!==null;}).forEach(function(day){productWeights[day.weekday]++;});
    var productWeekdays=new Set(productWeights.map(function(weight,index){return weight?index:null;}).filter(function(value){return value!==null;}));
    var beforeProductDates=beforeDays.filter(function(day){return productWeekdays.has(day.conditions.weekday);}).map(function(day){return productDay(env,store,day.date,categories);});
    var afterProductDates=afterDays.filter(function(day){return productWeekdays.has(day.conditions.weekday);}).map(function(day){return productDay(env,store,day.date,categories);});
    var beforeProduct=weightedProductControl(beforeProductDates,productWeights),duringProduct=aggregateProduct(saleProductDays),afterProduct=weightedProductControl(afterProductDates,productWeights);

    var otherEventDays=duringDays.filter(function(day){return eventIds(day).some(function(id){return id!==event.id;});});
    var holidayDays=duringDays.filter(function(day){return !!(day.conditions&&day.conditions.holiday);});

    return {
      version:VERSION,
      store:{id:storeId,name:String(store.name||storeId)},
      sale:{
        id:event.id,summary:eventSummary(env,event),startDate:event.startDate,endDate:event.endDate,
        categoryIds:categories.map(function(category){return category.id;}),categoryNames:categories.map(function(category){return category.name;})
      },
      windows:{
        before:{startDate:beforeStart,endDate:beforeEnd,weeks:windowWeeks},
        during:{startDate:event.startDate,endDate:event.endDate},
        after:{startDate:afterStart,endDate:afterEnd,weeks:windowWeeks}
      },
      policy:{
        weekdayMatched:true,
        controlDayDefinition:'sameWeekdayNoEventNoHoliday',
        minimumControlPerWeekday:MIN_CONTROL_PER_WEEKDAY
      },
      samples:{
        saleDays:duringDays.length,
        beforeControlDays:beforeDays.length,
        afterControlDays:afterDays.length,
        weekdayWeights:weights,
        beforeAvailable:beforeControl.available,
        afterAvailable:afterControl.available
      },
      kpi:{
        before:beforeControl.metrics,
        during:duringMetrics,
        after:afterControl.metrics,
        metrics:buildMetricComparison(beforeControl.metrics,duringMetrics,afterControl.metrics,KPI_SPECS)
      },
      product:{
        categories:categories.map(function(category){return {id:category.id,name:category.name};}),
        before:beforeProduct.metrics,
        during:duringProduct,
        after:afterProduct.metrics,
        metrics:buildMetricComparison(beforeProduct.metrics,duringProduct,afterProduct.metrics,PRODUCT_SPECS)
      },
      confounders:{
        holidaySaleDays:holidayDays.map(function(day){return day.date;}),
        otherEventSaleDays:otherEventDays.map(function(day){return {date:day.date,eventIds:eventIds(day).filter(function(id){return id!==event.id;})};})
      },
      source:{savedOnly:true,readOnly:true,externalTransmission:false}
    };
  }

  var model={
    VERSION:VERSION,
    DEFAULT_WINDOW_WEEKS:DEFAULT_WINDOW_WEEKS,
    MIN_CONTROL_PER_WEEKDAY:MIN_CONTROL_PER_WEEKDAY,
    KPI_SPECS:KPI_SPECS,
    PRODUCT_SPECS:PRODUCT_SPECS,
    analyzeOccurrence:analyzeOccurrence,
    aggregateKpis:aggregateKpis,
    weightedControl:weightedControl,
    aggregateProduct:aggregateProduct,
    weightedProductControl:weightedProductControl,
    phasePattern:phasePattern
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSaleImpactAnalysis=model;
})(typeof window!=='undefined'?window:globalThis);
