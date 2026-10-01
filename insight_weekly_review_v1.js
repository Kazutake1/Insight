/* Weekly review v1: deterministic operational review built on InsightAnalysisContext. */
(function(root){
  'use strict';
  if(root.InsightWeeklyReview)return;

  var VERSION=1;
  var METRIC_WEIGHT={sales:20,waste:19,customers:18,salesCount:14,input:12};
  var LEVEL_RANK={internal:0,insight:1,attention:2,important:3};
  var STATE_LABEL={new:'新規',continuing:'継続',improving:'改善',resolved:'解消'};

  function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}
  function pad(v){return String(v).padStart(2,'0');}
  function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function parse(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var d=new Date(0);d.setFullYear(Number(m[1]),Number(m[2])-1,Number(m[3]));d.setHours(12,0,0,0);
    return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;
  }
  function shift(value,days){var d=parse(value);if(!d)return '';d.setDate(d.getDate()+days);return iso(d);}
  function pct(now,prev){return prev!=null&&prev!==0&&now!=null?(now-prev)/prev*100:null;}
  function signed(v,digits){if(v==null)return null;return (v>0?'+':'')+v.toFixed(digits==null?1:digits)+'%';}
  function levelForMagnitude(abs){
    if(abs>=12)return 'important';
    if(abs>=8)return 'attention';
    if(abs>=5)return 'insight';
    return 'internal';
  }
  function abnormalPoints(abs){
    if(abs>=12)return 25;
    if(abs>=8)return 18;
    if(abs>=5)return 10;
    if(abs>=3)return 5;
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
  function confidencePoints(level){return level==='high'?10:level==='medium'?6:level==='low'?2:0;}
  function persistencePoints(weeks){return weeks>=3?15:weeks===2?13:10;}
  function actionability(type){return type==='waste'||type==='salesCount'||type==='input'?5:3;}
  function scoreLevel(score){return score>=75?'important':score>=60?'attention':score>=40?'insight':'internal';}
  function maxLevel(a,b){return LEVEL_RANK[a]>=LEVEL_RANK[b]?a:b;}

  function weekWindow(referenceIso){
    var ref=parse(referenceIso);
    if(!ref)throw new Error('週次レビュー基準日が不正です。');
    var weekday=ref.getDay();
    var mondayOffset=weekday===0?-6:1-weekday;
    var start=new Date(ref);start.setDate(ref.getDate()+mondayOffset);
    var elapsed=Math.floor((ref-start)/86400000)+1;
    var previousStart=new Date(start);previousStart.setDate(start.getDate()-7);
    var previousEnd=new Date(previousStart);previousEnd.setDate(previousStart.getDate()+elapsed-1);
    return {
      referenceDate:iso(ref),
      startDate:iso(start),
      endDate:iso(ref),
      elapsedDays:elapsed,
      previousStartDate:iso(previousStart),
      previousEndDate:iso(previousEnd)
    };
  }

  function priorWindow(window,weeksBack){
    var offset=-7*weeksBack;
    return {
      startDate:shift(window.startDate,offset),
      endDate:shift(window.endDate,offset),
      elapsedDays:window.elapsedDays
    };
  }

  function coverage(context,days){
    var input=context&&context.metrics?Number(context.metrics.inputDays)||0:0;
    return days>0?Math.min(1,input/days):0;
  }
  function confidence(current,previous,days){
    var ratio=Math.min(coverage(current,days),coverage(previous,days));
    if(ratio>=0.85)return 'high';
    if(ratio>=0.6)return 'medium';
    if(ratio>0)return 'low';
    return 'none';
  }
  function salesCountConfidence(currentCategory,previousCategory,days){
    var ratio=Math.min(
      Math.min(1,(currentCategory&&currentCategory.inputDays||0)/days),
      Math.min(1,(previousCategory&&previousCategory.inputDays||0)/days)
    );
    if(ratio>=0.85)return 'high';
    if(ratio>=0.6)return 'medium';
    if(ratio>0)return 'low';
    return 'none';
  }

  function causeForSales(current,previous){
    var cm=current.metrics||{},pm=previous.metrics||{};
    if(!(pm.customers>0&&pm.customerUnitPrice>0&&cm.customers>0&&cm.customerUnitPrice>0))return null;
    var customerEffect=(cm.customers-pm.customers)*pm.customerUnitPrice;
    var unitEffect=(cm.customerUnitPrice-pm.customerUnitPrice)*cm.customers;
    var customerPct=pct(cm.customers,pm.customers),unitPct=pct(cm.customerUnitPrice,pm.customerUnitPrice);
    if(Math.abs(customerEffect)>=Math.abs(unitEffect)){
      return {driver:'customers',label:'客数',changePct:customerPct,effectYen:customerEffect};
    }
    return {driver:'unitPrice',label:'客単価',changePct:unitPct,effectYen:unitEffect};
  }

  function issue(spec){
    return {
      key:spec.key,
      type:spec.type,
      theme:spec.theme||spec.type,
      direction:spec.direction,
      title:spec.title,
      summary:spec.summary,
      changePct:spec.changePct,
      magnitude:Math.abs(spec.changePct||0),
      rawLevel:spec.rawLevel||levelForMagnitude(Math.abs(spec.changePct||0)),
      impactYen:Math.max(0,spec.impactYen||0),
      salesScale:spec.salesScale||0,
      confidence:spec.confidence||'none',
      details:spec.details||{},
      state:'new',
      stateLabel:STATE_LABEL.new,
      persistenceWeeks:1,
      score:0,
      level:'internal',
      positive:!!spec.positive
    };
  }

  function metricIssues(current,previous,days){
    var out=[],cm=current.metrics||{},pm=previous.metrics||{},conf=confidence(current,previous,days);
    var salesChange=pct(cm.salesYen,pm.salesYen);
    if(salesChange!=null&&Math.abs(salesChange)>=5){
      var cause=causeForSales(current,previous);
      var summary='売上 '+signed(salesChange,1)+'（前週同期間比）';
      if(cause&&cause.changePct!=null)summary+=' / 主因候補：'+cause.label+' '+signed(cause.changePct,1);
      out.push(issue({
        key:'sales',type:'sales',theme:'sales',
        direction:salesChange<0?'down':'up',
        title:salesChange<0?'売上低下':'売上増加',
        summary:summary,changePct:salesChange,confidence:conf,
        impactYen:Math.abs((cm.salesYen||0)-(pm.salesYen||0)),
        salesScale:Math.max(cm.salesYen||0,pm.salesYen||0),
        positive:salesChange>0,
        details:{current:cm.salesYen,previous:pm.salesYen,cause:cause}
      }));
    }

    var customerChange=pct(cm.customers,pm.customers);
    if(customerChange!=null&&Math.abs(customerChange)>=5){
      var unit=(cm.customerUnitPrice||pm.customerUnitPrice||0);
      out.push(issue({
        key:'customers',type:'customers',theme:'customers',
        direction:customerChange<0?'down':'up',
        title:customerChange<0?'客数低下':'客数増加',
        summary:'客数 '+signed(customerChange,1)+'（前週同期間比）',
        changePct:customerChange,confidence:conf,
        impactYen:Math.abs((cm.customers||0)-(pm.customers||0))*unit,
        salesScale:Math.max(cm.salesYen||0,pm.salesYen||0),
        positive:customerChange>0,
        details:{current:cm.customers,previous:pm.customers}
      }));
    }

    var wasteChange=pct(cm.wasteYen,pm.wasteYen);
    if(wasteChange!=null&&Math.abs(wasteChange)>=5){
      out.push(issue({
        key:'waste',type:'waste',theme:'waste',
        direction:wasteChange>0?'up':'down',
        title:wasteChange>0?'廃棄増加':'廃棄改善',
        summary:'廃棄金額 '+signed(wasteChange,1)+'（前週同期間比）',
        changePct:wasteChange,confidence:conf,
        impactYen:Math.abs((cm.wasteYen||0)-(pm.wasteYen||0)),
        salesScale:Math.max(cm.salesYen||0,pm.salesYen||0),
        positive:wasteChange<0,
        details:{current:cm.wasteYen,previous:pm.wasteYen,wasteRateCurrent:cm.wasteRate,wasteRatePrevious:pm.wasteRate}
      }));
    }
    return out;
  }

  function categoryMap(context){
    var map={};
    var list=context&&context.salesCount&&Array.isArray(context.salesCount.categories)?context.salesCount.categories:[];
    list.forEach(function(c){map[c.id]=c;});
    return map;
  }
  function totalAverage(category,key){
    var obj=category&&category[key]&&category[key].total;
    return obj&&obj.average!=null?Number(obj.average):null;
  }
  function salesCountIssues(current,previous,days){
    var out=[],currentMap=categoryMap(current),previousMap=categoryMap(previous);
    Object.keys(currentMap).forEach(function(id){
      var c=currentMap[id],p=previousMap[id];
      if(!p||c.hidden)return;
      var conf=salesCountConfidence(c,p,days);
      if(conf==='none')return;
      var cd=totalAverage(c,'delivery'),pd=totalAverage(p,'delivery'),cs=totalAverage(c,'sales'),ps=totalAverage(p,'sales');
      var deliveryChange=pct(cd,pd),salesChange=pct(cs,ps);
      if(deliveryChange==null||salesChange==null)return;

      if(deliveryChange>=8&&salesChange<=3){
        out.push(issue({
          key:'salesCount:'+id+':excess',type:'salesCount',theme:'salesCounts',
          direction:'up',title:c.name+' 納品過多候補',
          summary:'納品 '+signed(deliveryChange,1)+' / 販売 '+signed(salesChange,1),
          changePct:deliveryChange,confidence:conf,positive:false,
          details:{categoryId:id,category:c.name,deliveryChangePct:deliveryChange,salesChangePct:salesChange}
        }));
      }else if(salesChange>=8&&deliveryChange<=3){
        out.push(issue({
          key:'salesCount:'+id+':demand',type:'salesCount',theme:'salesCounts',
          direction:'up',title:c.name+' 需要増加候補',
          summary:'販売 '+signed(salesChange,1)+' / 納品 '+signed(deliveryChange,1),
          changePct:salesChange,confidence:conf,positive:true,
          details:{categoryId:id,category:c.name,deliveryChangePct:deliveryChange,salesChangePct:salesChange}
        }));
      }
    });
    return out;
  }

  function inputIssue(current,days){
    var missing=Math.max(0,days-(current&&current.metrics?Number(current.metrics.inputDays)||0:0));
    if(missing<2)return [];
    return [issue({
      key:'input:week',type:'input',theme:'dashboard',direction:'down',
      title:'週次入力不足',summary:missing+'日分の主要KPIが不足しています',
      changePct:Math.min(100,missing/days*100),rawLevel:missing>=3?'attention':'insight',
      confidence:'high',positive:false,details:{missingDays:missing,elapsedDays:days}
    })];
  }

  function rawIssues(current,previous,days){
    return metricIssues(current,previous,days)
      .concat(salesCountIssues(current,previous,days))
      .concat(inputIssue(current,days));
  }

  function contextLines(current){
    var conditions=current&&current.conditions||{},daily=Array.isArray(conditions.daily)?conditions.daily:[],events=Array.isArray(conditions.events)?conditions.events:[];
    var weatherCounts={};
    daily.forEach(function(d){if(d.weather)weatherCounts[d.weather]=(weatherCounts[d.weather]||0)+1;});
    var weather=Object.keys(weatherCounts).sort(function(a,b){return weatherCounts[b]-weatherCounts[a];})[0];
    var lines=[];
    if(weather)lines.push('最多天気：'+weather+' '+weatherCounts[weather]+'日');
    if(events.length){
      var names=Array.from(new Set(events.map(function(e){return e.summary||e.title;}).filter(Boolean)));
      if(names.length)lines.push('イベント：'+names.slice(0,3).join(' / ')+(names.length>3?' ほか'+(names.length-3)+'件':''));
    }
    return lines;
  }

  function score(item,weeks){
    var score=(METRIC_WEIGHT[item.type]||10)
      +abnormalPoints(item.magnitude)
      +impactPoints(item.impactYen,item.salesScale)
      +persistencePoints(weeks)
      +confidencePoints(item.confidence)
      +actionability(item.type);
    item.persistenceWeeks=weeks;
    item.score=Math.min(100,Math.round(score));
    item.level=maxLevel(item.rawLevel,scoreLevel(item.score));
    return item;
  }

  function detect(analysis,window,storeId,overrides){
    var current=analysis.buildRange(window.startDate,window.endDate,storeId,overrides);
    var previous=analysis.buildRange(window.previousStartDate||shift(window.startDate,-7),window.previousEndDate||shift(window.endDate,-7),storeId,overrides);
    return {current:current,previous:previous,issues:rawIssues(current,previous,window.elapsedDays)};
  }

  function findByKey(list,key){return list.find(function(item){return item.key===key;})||null;}

  function stateful(currentIssues,previousIssues,olderIssues){
    var result=[];
    currentIssues.forEach(function(item){
      var prev=findByKey(previousIssues,item.key),older=findByKey(olderIssues,item.key),weeks=1;
      if(prev)weeks=older?3:2;
      if(!prev){
        item.state='new';
      }else if(item.magnitude<=prev.magnitude*0.7){
        item.state='improving';
      }else{
        item.state='continuing';
      }
      item.stateLabel=STATE_LABEL[item.state];
      result.push(score(item,weeks));
    });

    previousIssues.forEach(function(prev){
      if(findByKey(currentIssues,prev.key))return;
      if(prev.rawLevel!=='attention'&&prev.rawLevel!=='important'&&prev.magnitude<8)return;
      var resolved=issue({
        key:prev.key,type:prev.type,theme:prev.theme,direction:prev.direction,
        title:prev.title,summary:'前週の異常は今週の基準では解消',
        changePct:0,rawLevel:'insight',confidence:prev.confidence,
        positive:true,details:{previous:prev.details}
      });
      resolved.state='resolved';
      resolved.stateLabel=STATE_LABEL.resolved;
      resolved.persistenceWeeks=1;
      resolved.score=40;
      resolved.level='insight';
      result.push(resolved);
    });
    return result;
  }

  function priority(item){
    var severity=(LEVEL_RANK[item.level]||0)*1000;
    var weight=(METRIC_WEIGHT[item.type]||10)*10;
    var state=item.state==='new'?30:item.state==='continuing'?25:item.state==='improving'?15:0;
    return severity+item.score*10+weight+state;
  }

  function selectDisplay(items){
    var problems=items.filter(function(i){return !i.positive&&i.state!=='resolved'&&i.level!=='internal';})
      .sort(function(a,b){return priority(b)-priority(a);});
    var improving=items.filter(function(i){return i.state==='improving'||i.state==='resolved';})
      .sort(function(a,b){return priority(b)-priority(a);});
    var positives=items.filter(function(i){return i.positive&&i.state!=='resolved'&&i.level!=='internal';})
      .sort(function(a,b){return priority(b)-priority(a);});
    var out=problems.slice(0,5);
    if(out.length<5&&improving.length)out.push(improving[0]);
    if(out.length<5&&positives.length&&!out.some(function(i){return i.positive&&i.state!=='resolved';}))out.push(positives[0]);
    return out.slice(0,5);
  }

  function conclusion(current,previous,items){
    var c=current.metrics||{},p=previous.metrics||{};
    var sales=pct(c.salesYen,p.salesYen),customers=pct(c.customers,p.customers),waste=pct(c.wasteYen,p.wasteYen);
    var parts=[];
    if(sales!=null)parts.push('売上 '+signed(sales,1));
    if(customers!=null)parts.push('客数 '+signed(customers,1));
    if(waste!=null)parts.push('廃棄 '+signed(waste,1));
    var first=parts.length?'前週同期間比：'+parts.join(' / ')+'。':'比較できる週次KPIが不足しています。';
    var serious=items.filter(function(i){return !i.positive&&i.state!=='resolved'&&(i.level==='attention'||i.level==='important');});
    var second=serious.length?'優先確認は'+serious.slice(0,2).map(function(i){return i.title;}).join('、')+'です。':'大きな週次異常は確認されていません。';
    return [first,second];
  }

  function themeItems(review,theme){
    if(!theme||theme==='dashboard'||theme==='daily')return review.display.slice();
    var key=theme==='salesCounts'?'salesCounts':theme;
    return review.items.filter(function(item){return item.theme===key;}).sort(function(a,b){return priority(b)-priority(a);}).slice(0,5);
  }

  function review(referenceIso,storeId,overrides){
    overrides=overrides||{};
    var analysis=overrides.AnalysisContext||root.InsightAnalysisContext;
    if(!analysis||typeof analysis.buildRange!=='function')throw new Error('分析データ基盤を利用できません。');
    var window=weekWindow(referenceIso);
    var current=detect(analysis,window,storeId,overrides);
    var prevWindow=priorWindow(window,1);
    prevWindow.previousStartDate=shift(prevWindow.startDate,-7);
    prevWindow.previousEndDate=shift(prevWindow.endDate,-7);
    var previous=detect(analysis,prevWindow,storeId,overrides);
    var olderWindow=priorWindow(window,2);
    olderWindow.previousStartDate=shift(olderWindow.startDate,-7);
    olderWindow.previousEndDate=shift(olderWindow.endDate,-7);
    var older=detect(analysis,olderWindow,storeId,overrides);
    var items=stateful(current.issues,previous.issues,older.issues);
    var display=selectDisplay(items);
    return {
      version:VERSION,
      store:current.current.store,
      period:window,
      current:current.current,
      previous:current.previous,
      conclusion:conclusion(current.current,current.previous,items),
      context:contextLines(current.current),
      items:items.sort(function(a,b){return priority(b)-priority(a);}),
      display:display,
      forTheme:function(theme){return themeItems({display:display,items:items},theme);}
    };
  }

  function referenceDate(){
    try{
      if(root.InsightDateContext&&typeof root.InsightDateContext.getSelectedIso==='function'&&typeof currentNav!=='undefined'&&currentNav===0){
        return root.InsightDateContext.getSelectedIso();
      }
    }catch(_){}
    return iso(new Date());
  }

  var model={
    VERSION:VERSION,
    review:review,
    weekWindow:weekWindow,
    referenceDate:referenceDate,
    levelForMagnitude:levelForMagnitude,
    STATE_LABEL:STATE_LABEL
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightWeeklyReview=model;
})(typeof window!=='undefined'?window:globalThis);
