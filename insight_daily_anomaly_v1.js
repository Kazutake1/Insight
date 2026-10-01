/* Daily anomaly detector v1: read-only warnings built on InsightAnalysisContext. */
(function(root){
  'use strict';
  if(root.InsightDailyAnomaly)return;

  var VERSION=1;
  var LOOKBACK_DAYS=84;
  var ITEM_WEIGHT={sales:20,waste:19,customers:18,salesCount:14,input:12};
  var LEVEL_RANK={internal:0,insight:1,attention:2,important:3};

  function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function mean(values){return values.length?values.reduce(function(s,v){return s+v;},0)/values.length:null;}
  function pad(v){return String(v).padStart(2,'0');}
  function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function parse(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var d=new Date(0);d.setFullYear(Number(m[1]),Number(m[2])-1,Number(m[3]));d.setHours(12,0,0,0);
    return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;
  }
  function shift(value,days){var d=parse(value);if(!d)return '';d.setDate(d.getDate()+days);return iso(d);}
  function pct(actual,expected){return expected&&actual!=null?(actual-expected)/expected*100:null;}
  function weatherGroup(value){
    var v=String(value||'');
    if(!v)return '';
    if(/雷|雨|凍雨|みぞれ/.test(v))return 'rain';
    if(/雪/.test(v))return 'snow';
    if(/曇|霧/.test(v))return 'cloud';
    if(/晴|快晴/.test(v))return 'clear';
    return v;
  }
  function bandPct(values,expected){
    if(!values.length||!expected||expected<=0)return 10;
    var mad=mean(values.map(function(v){return Math.abs(v-expected);}));
    return clamp(mad/expected*100,5,15);
  }
  function confidence(count,eventAdjusted){
    if(count<=0)return 'none';
    if(eventAdjusted)return count>=5?'high':count>=3?'medium':'low';
    return count>=8?'high':count>=4?'medium':'low';
  }
  function downgrade(level){
    return level==='high'?'medium':level==='medium'?'low':level;
  }
  function anomalyPoints(ratio){
    if(ratio==null||ratio<1)return 0;
    if(ratio<1.5)return 5;
    if(ratio<2)return 10;
    if(ratio<2.5)return 18;
    return 25;
  }
  function persistencePoints(days){
    if(days>=21)return 15;
    if(days>=14)return 13;
    if(days>=7)return 10;
    if(days>=3)return 7;
    if(days>=2)return 4;
    return 2;
  }
  function confidencePoints(level){return level==='high'?10:level==='medium'?6:level==='low'?2:0;}
  function impactPoints(yen,expectedSales){
    if(!(yen>0))return 0;
    if(!(expectedSales>0))return 3;
    var ratio=yen/expectedSales*100;
    if(ratio<0.5)return 3;
    if(ratio<1)return 7;
    if(ratio<2)return 12;
    if(ratio<4)return 18;
    return 25;
  }
  function improvementPoints(type){return type==='waste'||type==='salesCount'||type==='input'?5:type==='sales'||type==='customers'?3:1;}
  function scoreLevel(score){return score>=75?'important':score>=60?'attention':score>=40?'insight':'internal';}
  function maxLevel(a,b){return LEVEL_RANK[a]>=LEVEL_RANK[b]?a:b;}

  function env(overrides){
    overrides=overrides||{};
    return {
      context:overrides.AnalysisContext||root.InsightAnalysisContext,
      nowIso:overrides.nowIso||iso(new Date())
    };
  }

  function findDay(context,date){
    return context&&Array.isArray(context.daily)?context.daily.find(function(d){return d.date===date;}):null;
  }
  function comparable(history,targetDay){
    var weekday=targetDay.conditions.weekday;
    var candidates=(history.daily||[]).filter(function(day){
      return day.date<targetDay.date&&day.conditions&&day.conditions.weekday===weekday&&day.metrics&&day.metrics.customers>0;
    });
    var targetHasEvent=targetDay.conditions.eventIds&&targetDay.conditions.eventIds.length>0;
    var eventMatched=candidates.filter(function(day){
      var has=day.conditions.eventIds&&day.conditions.eventIds.length>0;
      return has===targetHasEvent;
    });
    var eventAdjusted=false,eventFallback=false;
    if(targetHasEvent){
      if(eventMatched.length){candidates=eventMatched;eventAdjusted=true;}
      else eventFallback=true;
    }else if(eventMatched.length>=4)candidates=eventMatched;

    var wg=weatherGroup(targetDay.conditions.weather);
    var weatherAdjusted=false;
    if(wg){
      var weatherMatched=candidates.filter(function(day){return weatherGroup(day.conditions.weather)===wg;});
      var minimum=eventAdjusted?3:4;
      if(weatherMatched.length>=minimum){candidates=weatherMatched;weatherAdjusted=true;}
    }
    return {days:candidates,eventAdjusted:eventAdjusted,eventFallback:eventFallback,weatherAdjusted:weatherAdjusted};
  }

  function baseline(history,targetDay){
    var selected=comparable(history,targetDay),days=selected.days;
    var customers=days.map(function(d){return d.metrics.customers;}).filter(function(v){return v>0;});
    var unitPrices=days.map(function(d){return d.metrics.customerUnitPrice;}).filter(function(v){return v>0;});
    var sales=days.map(function(d){return d.metrics.salesYen;}).filter(function(v){return v>0;});
    var waste=days.map(function(d){return d.metrics.wasteYen;}).filter(function(v){return v!=null&&v>=0;});
    var wasteRates=days.map(function(d){return d.metrics.wasteRate;}).filter(function(v){return v!=null&&v>=0;});
    var expectedCustomers=mean(customers),expectedUnitPrice=mean(unitPrices);
    var expectedSales=expectedCustomers&&expectedUnitPrice?expectedCustomers*expectedUnitPrice:mean(sales);
    var level=confidence(days.length,selected.eventAdjusted);
    if(selected.eventFallback)level=downgrade(level);
    return {
      sampleCount:days.length,
      confidence:level,
      eventAdjusted:selected.eventAdjusted,
      eventFallback:selected.eventFallback,
      weatherAdjusted:selected.weatherAdjusted,
      dates:days.map(function(d){return d.date;}),
      customers:{expected:expectedCustomers,bandPct:bandPct(customers,expectedCustomers)},
      unitPrice:{expected:expectedUnitPrice,bandPct:bandPct(unitPrices,expectedUnitPrice)},
      sales:{expected:expectedSales,bandPct:bandPct(sales,expectedSales)},
      waste:{expected:mean(waste),bandPct:bandPct(waste,mean(waste))},
      wasteRate:{expected:mean(wasteRates)}
    };
  }

  function salesCountBaselines(history,targetDay){
    var targetDate=targetDay.date,weekday=targetDay.conditions.weekday;
    var result={};
    var categories=history.salesCount&&Array.isArray(history.salesCount.categories)?history.salesCount.categories:[];
    categories.forEach(function(category){
      var comparableDays=(category.daily||[]).filter(function(day){
        var d=parse(day.date);
        return day.date<targetDate&&d&&d.getDay()===weekday;
      });
      var delivery=comparableDays.map(function(d){return d.deliveryTotal;}).filter(function(v){return v!=null;});
      var sales=comparableDays.map(function(d){return d.salesTotal;}).filter(function(v){return v!=null;});
      var ed=mean(delivery),es=mean(sales);
      result[category.id]={
        count:Math.min(delivery.length,sales.length),
        confidence:confidence(Math.min(delivery.length,sales.length),false),
        deliveryExpected:ed,deliveryBandPct:bandPct(delivery,ed),
        salesExpected:es,salesBandPct:bandPct(sales,es)
      };
    });
    return result;
  }

  function makeFinding(spec){
    return {
      key:spec.key,
      type:spec.type,
      rawSeverity:spec.rawSeverity||'attention',
      direction:spec.direction||'down',
      title:spec.title,
      summary:spec.summary,
      confidence:spec.confidence||'none',
      deviationRatio:spec.deviationRatio==null?null:spec.deviationRatio,
      impactYen:spec.impactYen||0,
      expectedSales:spec.expectedSales||0,
      details:spec.details||{},
      persistenceDays:1,
      score:0,
      level:'internal',
      alertNow:false
    };
  }

  function metricFindings(target,base){
    var findings=[],day=target.day,actual=day.metrics||{},conf=base.confidence;
    if(!day)return findings;

    if(actual.salesYen>0&&base.sales.expected>0){
      var salesPct=pct(actual.salesYen,base.sales.expected);
      if(salesPct<=-15){
        findings.push(makeFinding({
          key:'sales',type:'sales',direction:'down',
          rawSeverity:salesPct<=-25?'important':'attention',
          title:'売上低下',
          summary:'売上 '+salesPct.toFixed(1)+'%（想定比）',
          confidence:conf,
          deviationRatio:Math.abs(salesPct)/base.sales.bandPct,
          impactYen:Math.max(0,base.sales.expected-actual.salesYen),
          expectedSales:base.sales.expected,
          details:{actual:actual.salesYen,expected:base.sales.expected,deltaPct:salesPct}
        }));
      }
    }

    if(actual.customers>0&&base.customers.expected>0){
      var customerPct=pct(actual.customers,base.customers.expected);
      var customerRatio=Math.abs(customerPct)/base.customers.bandPct;
      if(customerPct<0&&customerRatio>=1.5){
        findings.push(makeFinding({
          key:'customers',type:'customers',direction:'down',
          rawSeverity:customerRatio>=2.5?'important':'attention',
          title:'客数低下',
          summary:'客数 '+customerPct.toFixed(1)+'% / 通常ブレ幅 '+customerRatio.toFixed(1)+'倍',
          confidence:conf,
          deviationRatio:customerRatio,
          impactYen:base.sales.expected>0?Math.max(0,base.sales.expected*Math.abs(customerPct)/100):0,
          expectedSales:base.sales.expected,
          details:{actual:actual.customers,expected:base.customers.expected,deltaPct:customerPct,bandPct:base.customers.bandPct}
        }));
      }else if(customerPct>0&&customerRatio>=1.5){
        findings.push(makeFinding({
          key:'customers-up',type:'customers',direction:'up',
          rawSeverity:'attention',
          title:'客数増加',
          summary:'客数 +'+customerPct.toFixed(1)+'% / 通常ブレ幅 '+customerRatio.toFixed(1)+'倍',
          confidence:conf,
          deviationRatio:customerRatio,
          details:{actual:actual.customers,expected:base.customers.expected,deltaPct:customerPct,bandPct:base.customers.bandPct}
        }));
      }
    }

    if(actual.wasteYen!=null&&base.waste.expected!=null&&base.waste.expected>=0){
      var wastePct=base.waste.expected>0?pct(actual.wasteYen,base.waste.expected):null;
      var rateDelta=actual.wasteRate!=null&&base.wasteRate.expected!=null?actual.wasteRate-base.wasteRate.expected:null;
      var attention=(wastePct!=null&&wastePct>=30)||(rateDelta!=null&&rateDelta>=0.5);
      var important=(wastePct!=null&&wastePct>=50)||(rateDelta!=null&&rateDelta>=1);
      if(attention){
        var parts=[];
        if(wastePct!=null)parts.push('廃棄 '+(wastePct>=0?'+':'')+wastePct.toFixed(1)+'%');
        if(rateDelta!=null)parts.push('廃棄率 '+(rateDelta>=0?'+':'')+rateDelta.toFixed(2)+'pt');
        findings.push(makeFinding({
          key:'waste',type:'waste',direction:'up',
          rawSeverity:important?'important':'attention',
          title:'廃棄増加',
          summary:parts.join(' / '),
          confidence:conf,
          deviationRatio:wastePct!=null&&base.waste.bandPct?Math.abs(wastePct)/base.waste.bandPct:(rateDelta!=null?rateDelta/0.5:null),
          impactYen:Math.max(0,actual.wasteYen-(base.waste.expected||0)),
          expectedSales:base.sales.expected,
          details:{actual:actual.wasteYen,expected:base.waste.expected,deltaPct:wastePct,wasteRateDeltaPt:rateDelta}
        }));
      }
    }
    return findings;
  }

  function salesCountFindings(target,history,targetDay){
    var result=[],bases=salesCountBaselines(history,targetDay);
    var categories=target.salesCount&&Array.isArray(target.salesCount.categories)?target.salesCount.categories:[];
    categories.forEach(function(category){
      var current=(category.daily||[]).find(function(day){return day.date===targetDay.date;});
      var base=bases[category.id];
      if(!current||!base||base.confidence==='none'||base.deliveryExpected==null||base.salesExpected==null)return;
      var deliveryPct=pct(current.deliveryTotal,base.deliveryExpected),salesPct=pct(current.salesTotal,base.salesExpected);
      if(deliveryPct==null||salesPct==null)return;
      var threshold=Math.max(30,2*base.deliveryBandPct);
      var importantThreshold=Math.max(50,2.5*base.deliveryBandPct);
      var over=deliveryPct>=threshold&&salesPct<=15;
      var under=deliveryPct<=-threshold&&salesPct>=-15;
      if(!over&&!under)return;
      var raw=(Math.abs(deliveryPct)>=importantThreshold)?'important':'attention';
      result.push(makeFinding({
        key:'salesCount:'+category.id+':' +(over?'over':'under'),
        type:'salesCount',
        direction:over?'up':'down',
        rawSeverity:raw,
        title:category.name+(over?' 納品過多候補':' 納品不足候補'),
        summary:'納品 '+(deliveryPct>=0?'+':'')+deliveryPct.toFixed(1)+'% / 販売 '+(salesPct>=0?'+':'')+salesPct.toFixed(1)+'%',
        confidence:base.confidence,
        deviationRatio:Math.abs(deliveryPct)/base.deliveryBandPct,
        expectedSales:0,
        details:{
          categoryId:category.id,category:category.name,
          deliveryActual:current.deliveryTotal,deliveryExpected:base.deliveryExpected,deliveryDeltaPct:deliveryPct,
          salesActual:current.salesTotal,salesExpected:base.salesExpected,salesDeltaPct:salesPct
        }
      }));
    });
    return result;
  }

  function inputFindings(target,targetDate,nowIso){
    var findings=[],day=findDay(target,targetDate),past=targetDate<nowIso;
    if(!day){
      if(past)findings.push(makeFinding({
        key:'input:core',type:'input',rawSeverity:'attention',title:'入力確認',
        summary:'売上・客数などの日次データが未入力です',confidence:'high',deviationRatio:2.5
      }));
      return findings;
    }
    var missing=[];
    if(!(day.metrics&&day.metrics.salesYen>0))missing.push('売上');
    if(!(day.metrics&&day.metrics.customers>0))missing.push('客数');
    if(past&&missing.length)findings.push(makeFinding({
      key:'input:core',type:'input',rawSeverity:'attention',title:'入力確認',
      summary:missing.join('・')+'が未入力または0です',confidence:'high',deviationRatio:2.5
    }));

    var categories=target.salesCount&&Array.isArray(target.salesCount.categories)?target.salesCount.categories:[];
    var large=[];
    categories.forEach(function(category){
      var current=(category.daily||[]).find(function(d){return d.date===targetDate;});
      if(!current)return;
      (current.trips||[]).forEach(function(trip,index){
        ['delivery','sales'].forEach(function(key){
          var value=trip[key];
          if(value!=null&&value>=1000)large.push(category.name+' '+(index+1)+'便 '+(key==='delivery'?'納品':'販売')+' '+value);
        });
      });
    });
    if(large.length)findings.push(makeFinding({
      key:'input:large',type:'input',rawSeverity:'important',title:'4桁入力確認',
      summary:large.slice(0,2).join(' / ')+(large.length>2?' ほか'+(large.length-2)+'件':''),
      confidence:'high',deviationRatio:2.5,details:{items:large}
    }));
    return findings;
  }

  function mergeSalesCustomer(findings){
    var sales=findings.find(function(f){return f.key==='sales';});
    var customers=findings.find(function(f){return f.key==='customers';});
    if(!sales||!customers)return findings;
    sales.rawSeverity=maxLevel(sales.rawSeverity,customers.rawSeverity);
    sales.deviationRatio=Math.max(sales.deviationRatio||0,customers.deviationRatio||0);
    sales.confidence=LEVEL_RANK[sales.confidence]===undefined?sales.confidence:
      (customers.confidence==='high'||sales.confidence==='high'?'high':customers.confidence==='medium'||sales.confidence==='medium'?'medium':'low');
    sales.details.customerCause=customers.details;
    sales.summary+=' / 主因候補：客数 '+customers.details.deltaPct.toFixed(1)+'%';
    return findings.filter(function(f){return f!==customers;});
  }

  function evaluateCore(date,storeId,overrides){
    var e=env(overrides),analysis=e.context;
    if(!analysis||typeof analysis.buildDay!=='function'||typeof analysis.buildRange!=='function')throw new Error('分析データ基盤を利用できません。');
    var target=analysis.buildDay(date,storeId,overrides),targetDay=findDay(target,date);
    var targetDate=parse(date);
    if(!targetDate)throw new Error('日次異常検知の日付が不正です。');
    if(date>e.nowIso)return {date:date,target:target,baseline:null,findings:[],opportunities:[]};

    var historyEnd=shift(date,-1),historyStart=shift(date,-LOOKBACK_DAYS);
    var history=historyEnd>=historyStart?analysis.buildRange(historyStart,historyEnd,storeId,overrides):{daily:[],salesCount:{categories:[]}};
    var base=targetDay?baseline(history,targetDay):null;
    var findings=inputFindings(target,date,e.nowIso),opportunities=[];
    if(targetDay&&base&&base.sampleCount){
      metricFindings({day:targetDay},base).forEach(function(f){
        if(f.direction==='up'&&f.key==='customers-up')opportunities.push(f);else findings.push(f);
      });
      findings=findings.concat(salesCountFindings(target,history,targetDay));
    }
    findings=mergeSalesCustomer(findings);
    return {date:date,target:target,history:history,baseline:base,findings:findings,opportunities:opportunities};
  }

  function persistenceFor(finding,date,storeId,overrides){
    if(finding.type==='input')return 1;
    var count=1;
    for(var i=1;i<=2;i++){
      var previous=evaluateCore(shift(date,-i),storeId,overrides);
      if(previous.findings.some(function(f){return f.key===finding.key;}))count++;
      else break;
    }
    return count;
  }

  function finalize(finding,persistenceDays){
    finding.persistenceDays=persistenceDays||1;
    var weight=ITEM_WEIGHT[finding.type]||10;
    var score=weight+
      anomalyPoints(finding.deviationRatio)+
      impactPoints(finding.impactYen,finding.expectedSales)+
      persistencePoints(finding.persistenceDays)+
      confidencePoints(finding.confidence)+
      improvementPoints(finding.type);
    finding.score=Math.min(100,Math.round(score));
    finding.level=scoreLevel(finding.score);
    if(finding.rawSeverity==='important')finding.level='important';
    var confidenceOk=finding.confidence!=='low'&&finding.confidence!=='none';
    finding.alertNow=confidenceOk&&(
      finding.rawSeverity==='important' ||
      (finding.persistenceDays>=2&&finding.score>=60) ||
      finding.type==='input'
    );
    return finding;
  }

  function priority(finding){
    var type={sales:5,waste:4.8,customers:4.5,salesCount:3.5,input:3}[finding.type]||1;
    return (LEVEL_RANK[finding.level]||0)*1000+finding.score*10+type;
  }

  function evaluate(date,storeId,overrides){
    var core=evaluateCore(date,storeId,overrides);
    var findings=core.findings.map(function(f){
      return finalize(f,persistenceFor(f,date,storeId,overrides));
    }).sort(function(a,b){return priority(b)-priority(a);});
    var opportunities=core.opportunities.map(function(f){return finalize(f,1);}).filter(function(f){return f.confidence!=='low'&&f.confidence!=='none';});
    var display=findings.filter(function(f){return f.alertNow;}).slice(0,3);
    return {
      version:VERSION,
      date:date,
      store:core.target&&core.target.store?core.target.store:null,
      baseline:core.baseline,
      findings:findings,
      display:display,
      opportunities:opportunities,
      hasAlert:display.length>0
    };
  }

  var model={
    VERSION:VERSION,
    LOOKBACK_DAYS:LOOKBACK_DAYS,
    evaluate:evaluate,
    evaluateCore:evaluateCore,
    bandPct:bandPct,
    confidence:confidence
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightDailyAnomaly=model;
})(typeof window!=='undefined'?window:globalThis);
