/* Monthly review v1: deterministic management review built on InsightAnalysisContext. */
(function(root){
  'use strict';
  if(root.InsightMonthlyReview)return;

  var VERSION=1;
  var LEVEL_RANK={internal:0,insight:1,attention:2,important:3};
  var METRIC_WEIGHT={sales:20,waste:19,customers:18,grossMargin:13,laborRate:10};

  function finite(v){var n=Number(v);return Number.isFinite(n)?n:null;}
  function pad(v){return String(v).padStart(2,'0');}
  function monthLabel(month){return String(month)+'月';}
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function clampDay(year,month,day){return Math.max(1,Math.min(lastDay(year,month),Number(day)||lastDay(year,month)));}
  function shiftMonth(year,month,offset){
    var d=new Date(Number(year),Number(month)-1+Number(offset||0),1,12,0,0,0);
    return {year:d.getFullYear(),month:d.getMonth()+1};
  }
  function pct(now,prev){return now!=null&&prev!=null&&prev!==0?(now-prev)/prev*100:null;}
  function point(now,prev){return now!=null&&prev!=null?now-prev:null;}
  function signedPct(v){return v==null?'比較不可':(v>0?'+':'')+v.toFixed(1)+'%';}
  function signedPoint(v){return v==null?'比較不可':(v>0?'+':'')+v.toFixed(1)+'pt';}
  function abs(v){return Math.abs(Number(v)||0);}
  function maxLevel(a,b){return LEVEL_RANK[a]>=LEVEL_RANK[b]?a:b;}

  function env(overrides){
    overrides=overrides||{};
    return {
      analysis:overrides.AnalysisContext||root.InsightAnalysisContext,
      comparison:overrides.YearComparison||root.InsightYearComparison
    };
  }

  function completed(e,year,month){
    try{
      if(e.comparison&&typeof e.comparison.isCompletedMonth==='function'){
        return !!e.comparison.isCompletedMonth(year,monthLabel(month));
      }
    }catch(_){}
    return false;
  }

  function buildMonth(e,year,month,throughDay,storeId,overrides){
    if(!e.analysis||typeof e.analysis.buildMonth!=='function')throw new Error('分析データ基盤を利用できません。');
    return e.analysis.buildMonth(year,month,clampDay(year,month,throughDay),storeId,overrides);
  }

  function metricValue(context,key,basis){
    if(!context||!context.metrics)return null;
    var value=finite(context.metrics[key]);
    if(value==null)return null;
    if(basis==='dailyAverage'&&['salesYen','customers','items','wasteYen'].indexOf(key)>=0){
      var days=Number(context.metrics.inputDays)||0;
      return days>0?value/days:null;
    }
    return value;
  }

  function confidence(current,previous,expectedDays){
    var a=current&&current.metrics?Number(current.metrics.inputDays)||0:0;
    var b=previous&&previous.metrics?Number(previous.metrics.inputDays)||0:0;
    var denom=Math.max(1,Number(expectedDays)||1);
    var ratio=Math.min(a/denom,b/denom);
    if(ratio>=0.85)return 'high';
    if(ratio>=0.6)return 'medium';
    if(ratio>0)return 'low';
    return 'none';
  }

  function comparisonName(year,compareYear){
    return Number(compareYear)===Number(year)-1?'前年同月比':String(compareYear)+'年同月比';
  }

  function metricThreshold(type,magnitude){
    if(type==='sales'||type==='customers'){
      if(magnitude>=8)return 'important';
      if(magnitude>=5)return 'attention';
      if(magnitude>=2)return 'insight';
      return 'internal';
    }
    if(type==='waste'){
      if(magnitude>=20)return 'important';
      if(magnitude>=10)return 'attention';
      if(magnitude>=5)return 'insight';
      return 'internal';
    }
    return 'internal';
  }

  function pointThreshold(magnitude){
    if(magnitude>=2)return 'important';
    if(magnitude>=1)return 'attention';
    if(magnitude>=0.5)return 'insight';
    return 'internal';
  }

  function abnormalPoints(level,magnitude){
    if(level==='important')return 25;
    if(level==='attention')return 18;
    if(level==='insight')return 10;
    if(magnitude>0)return 5;
    return 0;
  }
  function impactPoints(yen,scale){
    if(!(yen>0))return 0;
    if(!(scale>0))return 3;
    var ratio=yen/scale*100;
    if(ratio<0.5)return 3;
    if(ratio<1)return 7;
    if(ratio<2)return 12;
    if(ratio<4)return 18;
    return 25;
  }
  function persistencePoints(months){return months>=3?15:months===2?10:5;}
  function confidencePoints(level){return level==='high'?10:level==='medium'?6:level==='low'?2:0;}
  function actionability(type){return type==='waste'?5:type==='sales'||type==='customers'?3:2;}
  function scoreLevel(score){return score>=75?'important':score>=60?'attention':score>=40?'insight':'internal';}

  function trendLabel(values){
    var valid=values.filter(function(v){return v!=null;});
    if(valid.length<2)return 'データ不足';
    var last=valid[valid.length-1],prev=valid[valid.length-2],older=valid.length>=3?valid[valid.length-3]:null;
    var diff2=last-prev,diff1=older==null?null:prev-older,flat=1.5;
    if(older!=null&&diff1<-flat&&diff2<-flat)return '悪化継続';
    if(older!=null&&diff1>flat&&diff2>flat)return '改善継続';
    if(prev<0&&last>=0)return '改善転換';
    if(prev>=0&&last<0)return '悪化転換';
    if(valid.length>=3&&valid.every(function(v){return v<-2;})&&Math.abs(diff2)<=flat&&(diff1==null||Math.abs(diff1)<=flat))return '低調継続';
    if(Math.abs(diff2)<=flat)return last<-2?'低調継続':'横ばい';
    return diff2>0?'改善傾向':'悪化傾向';
  }

  function streak(values,positiveGood){
    var count=0;
    for(var i=values.length-1;i>=0;i--){
      var v=values[i];
      if(v==null)break;
      var bad=positiveGood?v<-2:v>2;
      if(!bad)break;
      count++;
    }
    return count;
  }

  function trendMetric(e,year,month,throughDay,compareYear,storeId,key,positiveGood,overrides){
    if(compareYear==null)return {values:[],health:[],label:'データ不足',badStreak:0};
    var gap=Number(year)-Number(compareYear),points=[];
    for(var offset=-2;offset<=0;offset++){
      var ref=shiftMonth(year,month,offset);
      var comp={year:ref.year-gap,month:ref.month};
      var isDone=completed(e,ref.year,ref.month);
      var day=offset===0&&!isDone?clampDay(ref.year,ref.month,throughDay):lastDay(ref.year,ref.month);
      var compDay=isDone?lastDay(comp.year,comp.month):clampDay(comp.year,comp.month,day);
      var current=buildMonth(e,ref.year,ref.month,day,storeId,overrides);
      var previous=buildMonth(e,comp.year,comp.month,compDay,storeId,overrides);
      var basis=isDone?'total':'dailyAverage';
      var delta=pct(metricValue(current,key,basis),metricValue(previous,key,basis));
      points.push({year:ref.year,month:ref.month,value:delta});
    }
    var values=points.map(function(p){return p.value;});
    var health=values.map(function(v){return v==null?null:(positiveGood?v:-v);});
    return {points:points,values:values,health:health,label:trendLabel(health),badStreak:streak(health,true)};
  }

  function monthInputs(year,month,throughDay,compareYear,storeId,overrides){
    var e=env(overrides),isDone=completed(e,year,month);
    var day=isDone?lastDay(year,month):clampDay(year,month,throughDay);
    var current=buildMonth(e,year,month,day,storeId,overrides);
    var basis=isDone?'total':'dailyAverage';
    var yoy=null,yoyBasisName=null;
    if(compareYear!=null){
      var compareDay=isDone?lastDay(compareYear,month):clampDay(compareYear,month,day);
      yoy=buildMonth(e,compareYear,month,compareDay,storeId,overrides);
      yoyBasisName=comparisonName(year,compareYear);
    }
    var prevRef=shiftMonth(year,month,-1);
    var prevDay=isDone?lastDay(prevRef.year,prevRef.month):clampDay(prevRef.year,prevRef.month,day);
    var previousMonth=buildMonth(e,prevRef.year,prevRef.month,prevDay,storeId,overrides);
    return {
      env:e,year:Number(year),month:Number(month),throughDay:day,completed:isDone,basis:basis,
      current:current,yoy:yoy,yoyLabel:yoyBasisName,previousMonth:previousMonth,previousMonthRef:prevRef
    };
  }

  function metricComparison(input,key){
    var now=metricValue(input.current,key,input.basis);
    var yoy=input.yoy?metricValue(input.yoy,key,input.basis):null;
    var mom=metricValue(input.previousMonth,key,input.basis);
    return {
      current:now,
      yoyValue:yoy,
      yoyPct:pct(now,yoy),
      momValue:mom,
      momPct:pct(now,mom),
      confidence:input.yoy?confidence(input.current,input.yoy,input.throughDay):confidence(input.current,input.previousMonth,input.throughDay)
    };
  }

  function grossMarginComparison(input){
    var now=input.current.profitCost&&finite(input.current.profitCost.grossMarginRate);
    var yoy=input.yoy&&input.yoy.profitCost?finite(input.yoy.profitCost.grossMarginRate):null;
    var mom=input.completed&&input.previousMonth.profitCost?finite(input.previousMonth.profitCost.grossMarginRate):null;
    return {current:now,yoyPoint:point(now,yoy),momPoint:point(now,mom),confidence:now!=null&&yoy!=null?'high':'none'};
  }

  function laborComparison(input){
    var currentReady=!!(input.current.profitCost&&input.current.profitCost.evaluationReady);
    var yoyReady=!!(input.yoy&&input.yoy.profitCost&&input.yoy.profitCost.evaluationReady);
    var momReady=!!(input.previousMonth.profitCost&&input.previousMonth.profitCost.evaluationReady);
    var nowRate=currentReady?finite(input.current.profitCost.laborRate):null;
    var yoyRate=yoyReady?finite(input.yoy.profitCost.laborRate):null;
    var momRate=input.completed&&momReady?finite(input.previousMonth.profitCost.laborRate):null;
    var nowCost=currentReady?finite(input.current.profitCost.laborCostYen):null;
    var yoyCost=yoyReady?finite(input.yoy.profitCost.laborCostYen):null;
    var momCost=input.completed&&momReady?finite(input.previousMonth.profitCost.laborCostYen):null;
    return {
      currentRate:nowRate,yoyRate:yoyRate,yoyPoint:point(nowRate,yoyRate),momRate:momRate,momPoint:point(nowRate,momRate),
      currentCost:nowCost,yoyCost:yoyCost,yoyCostPct:pct(nowCost,yoyCost),momCost:momCost,momCostPct:pct(nowCost,momCost),
      confidence:nowRate!=null&&yoyRate!=null?'high':'none'
    };
  }

  function makeIssue(spec){
    var magnitude=abs(spec.primaryChange);
    var score=(METRIC_WEIGHT[spec.type]||10)
      +abnormalPoints(spec.rawLevel,magnitude)
      +impactPoints(spec.impactYen,spec.salesScale)
      +persistencePoints(spec.persistenceMonths||1)
      +confidencePoints(spec.confidence)
      +actionability(spec.type);
    return {
      key:spec.key,type:spec.type,theme:spec.theme||spec.type,title:spec.title,summary:spec.summary,
      positive:!!spec.positive,rawLevel:spec.rawLevel,level:maxLevel(spec.rawLevel,scoreLevel(score)),
      score:Math.min(100,Math.round(score)),primaryChange:spec.primaryChange,primaryKind:spec.primaryKind,
      yoy:spec.yoy,mom:spec.mom,trend:spec.trend||null,persistenceMonths:spec.persistenceMonths||1,
      impactYen:Math.max(0,spec.impactYen||0),confidence:spec.confidence||'none',details:spec.details||{}
    };
  }

  function metricIssue(input,type,label,key,positiveHigher,trend,comparison){
    var primary=comparison.yoyPct!=null?comparison.yoyPct:comparison.momPct;
    var primaryKind=comparison.yoyPct!=null?(input.yoyLabel||'同月比'):'前月比';
    if(primary==null)return null;
    var raw=metricThreshold(type,abs(primary));
    if(raw==='internal')return null;
    var positive=positiveHigher?primary>0:primary<0;
    var currentTotal=finite(input.current.metrics[key])||0;
    var compareTotal=input.yoy?finite(input.yoy.metrics[key]):finite(input.previousMonth.metrics[key]);
    var impact=compareTotal==null?0:Math.abs(currentTotal-compareTotal);
    if(type==='customers'){
      var unit=finite(input.current.metrics.customerUnitPrice)||0;
      impact=Math.abs(currentTotal-(compareTotal||0))*unit;
    }
    var summary=label+' '+primaryKind+' '+signedPct(primary);
    if(comparison.momPct!=null&&primaryKind!=='前月比')summary+=' / 前月比 '+signedPct(comparison.momPct);
    if(trend&&trend.label!=='データ不足')summary+=' / 3か月 '+trend.label;
    return makeIssue({
      key:type,type:type,theme:type,title:positive?label+'改善':label+'悪化',
      summary:summary,positive:positive,rawLevel:raw,primaryChange:primary,primaryKind:primaryKind,
      yoy:comparison.yoyPct,mom:comparison.momPct,trend:trend,
      persistenceMonths:trend&&trend.badStreak?trend.badStreak:1,
      impactYen:impact,salesScale:finite(input.current.metrics.salesYen)||0,confidence:comparison.confidence,
      details:{current:comparison.current,yoyValue:comparison.yoyValue,momValue:comparison.momValue}
    });
  }

  function costIssues(input,gross,labor){
    var out=[],sales=finite(input.current.metrics.salesYen)||0;
    var grossPrimary=gross.yoyPoint!=null?gross.yoyPoint:gross.momPoint;
    var grossKind=gross.yoyPoint!=null?(input.yoyLabel||'同月比'):'前月比';
    if(grossPrimary!=null){
      var level=pointThreshold(abs(grossPrimary));
      if(level!=='internal')out.push(makeIssue({
        key:'grossMargin',type:'grossMargin',theme:'costs',
        title:grossPrimary>0?'粗利率改善':'粗利率低下',
        summary:'粗利率 '+grossKind+' '+signedPoint(grossPrimary)+(gross.momPoint!=null&&grossKind!=='前月比'?' / 前月差 '+signedPoint(gross.momPoint):''),
        positive:grossPrimary>0,rawLevel:level,primaryChange:grossPrimary,primaryKind:grossKind,
        yoy:gross.yoyPoint,mom:gross.momPoint,persistenceMonths:1,
        impactYen:sales*abs(grossPrimary)/100,salesScale:sales,confidence:gross.confidence,
        details:{current:gross.current}
      }));
    }
    var laborPrimary=labor.yoyPoint!=null?labor.yoyPoint:labor.momPoint;
    var laborKind=labor.yoyPoint!=null?(input.yoyLabel||'同月比'):'前月差';
    if(laborPrimary!=null){
      var laborLevel=pointThreshold(abs(laborPrimary));
      if(laborLevel!=='internal')out.push(makeIssue({
        key:'laborRate',type:'laborRate',theme:'costs',
        title:laborPrimary<0?'人件費率改善':'人件費率上昇',
        summary:'人件費率 '+laborKind+' '+signedPoint(laborPrimary)+(labor.yoyCostPct!=null?' / 人件費額 '+(input.yoyLabel||'同月比')+' '+signedPct(labor.yoyCostPct):''),
        positive:laborPrimary<0,rawLevel:laborLevel,primaryChange:laborPrimary,primaryKind:laborKind,
        yoy:labor.yoyPoint,mom:labor.momPoint,persistenceMonths:1,
        impactYen:sales*abs(laborPrimary)/100,salesScale:sales,confidence:labor.confidence,
        details:{currentRate:labor.currentRate,currentCost:labor.currentCost,yoyCostPct:labor.yoyCostPct}
      }));
    }
    return out;
  }

  function priority(item){
    return (LEVEL_RANK[item.level]||0)*1000+item.score*10+(METRIC_WEIGHT[item.type]||10);
  }

  function selectDisplay(items){
    var problems=items.filter(function(i){return !i.positive&&i.level!=='internal';}).sort(function(a,b){return priority(b)-priority(a);});
    var positives=items.filter(function(i){return i.positive&&i.level!=='internal';}).sort(function(a,b){return priority(b)-priority(a);});
    var out=problems.slice(0,5);
    if(out.length<5&&positives.length)out.push(positives[0]);
    return out.slice(0,5);
  }

  function conclusion(input,metrics,trends,items){
    var lines=[],sales=metrics.sales,customers=metrics.customers,unit=metricComparison(input,'customerUnitPrice');
    if(sales.yoyPct!=null){
      var first='売上は'+(input.yoyLabel||'同月比')+signedPct(sales.yoyPct)+'。';
      if(customers.yoyPct!=null&&unit.yoyPct!=null){
        first+='変動内訳は客数'+signedPct(customers.yoyPct)+'、客単価'+signedPct(unit.yoyPct)+'です。';
      }else if(customers.yoyPct!=null)first+='客数は'+signedPct(customers.yoyPct)+'です。';
      lines.push(first);
    }else if(sales.momPct!=null){
      lines.push('売上は前月比'+signedPct(sales.momPct)+'。前年同月比較は利用できません。');
    }else{
      lines.push('売上の月次比較に必要なデータが不足しています。');
    }

    if(trends.customers&&trends.customers.badStreak>=3){
      lines.push('客数は3か月連続で比較年同月を下回っています。');
    }else{
      var serious=items.filter(function(i){return !i.positive&&(i.level==='important'||i.level==='attention');}).sort(function(a,b){return priority(b)-priority(a);});
      if(serious.length)lines.push('優先確認は'+serious.slice(0,2).map(function(i){return i.title;}).join('、')+'です。');
      else lines.push('月次で優先度の高い悪化項目は確認されていません。');
    }
    return lines.slice(0,2);
  }

  function themeItems(review,theme){
    if(!theme||theme==='dashboard'||theme==='daily')return review.display.slice();
    if(theme==='salesCounts')return [];
    var mapped=theme==='costs'?'costs':theme;
    return review.items.filter(function(i){return i.theme===mapped;}).sort(function(a,b){return priority(b)-priority(a);}).slice(0,5);
  }

  function review(options,overrides){
    options=options||{};
    var year=Number(options.year),month=Number(options.month),compareYear=options.compareYear==null?null:Number(options.compareYear);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('月次レビュー対象年月が不正です。');
    var input=monthInputs(year,month,options.throughDay,compareYear,options.storeId,overrides);
    var metrics={
      sales:metricComparison(input,'salesYen'),
      customers:metricComparison(input,'customers'),
      waste:metricComparison(input,'wasteYen'),
      customerUnitPrice:metricComparison(input,'customerUnitPrice')
    };
    var trends={
      sales:trendMetric(input.env,year,month,input.throughDay,compareYear,options.storeId,'salesYen',true,overrides),
      customers:trendMetric(input.env,year,month,input.throughDay,compareYear,options.storeId,'customers',true,overrides),
      waste:trendMetric(input.env,year,month,input.throughDay,compareYear,options.storeId,'wasteYen',false,overrides)
    };
    var gross=grossMarginComparison(input),labor=laborComparison(input);
    var issues=[
      metricIssue(input,'sales','売上','salesYen',true,trends.sales,metrics.sales),
      metricIssue(input,'customers','客数','customers',true,trends.customers,metrics.customers),
      metricIssue(input,'waste','廃棄金額','wasteYen',false,trends.waste,metrics.waste)
    ].filter(Boolean).concat(costIssues(input,gross,labor));
    var display=selectDisplay(issues);
    var result={
      version:VERSION,
      store:input.current.store,
      period:{
        year:year,month:month,throughDay:input.throughDay,completed:input.completed,basis:input.basis,
        compareYear:compareYear,yoyLabel:input.yoyLabel,
        label:String(year)+'年 '+monthLabel(month)+(input.completed?'':' '+input.throughDay+'日まで')
      },
      current:input.current,
      comparisonYear:input.yoy,
      previousMonth:input.previousMonth,
      metrics:metrics,
      grossMargin:gross,
      labor:labor,
      trends:trends,
      items:issues.sort(function(a,b){return priority(b)-priority(a);}),
      display:display
    };
    result.conclusion=conclusion(input,metrics,trends,issues);
    result.forTheme=function(theme){return themeItems(result,theme);};
    return result;
  }

  var model={
    VERSION:VERSION,
    review:review,
    shiftMonth:shiftMonth,
    trendLabel:trendLabel,
    metricThreshold:metricThreshold,
    pointThreshold:pointThreshold
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightMonthlyReview=model;
})(typeof window!=='undefined'?window:globalThis);
