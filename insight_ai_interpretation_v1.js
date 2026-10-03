/* 分析AI解釈 v1: 決定論的レビューを「結論・重要ポイント・関連性・確認事項」へ整形 */
(function(root){
  'use strict';
  if(root.InsightAIInterpretation)return;

  var VERSION=1;
  var LEVEL_RANK={internal:0,insight:1,attention:2,important:3};
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}
  function pct(now,prev){return now!=null&&prev!=null&&Number(prev)!==0?(Number(now)-Number(prev))/Number(prev)*100:null;}
  function signed(v){return v==null?'比較不可':(v>0?'+':'')+Number(v).toFixed(1)+'%';}
  function uniq(list){return Array.from(new Set((list||[]).filter(Boolean)));}
  function levelLabel(item){
    if(item&&item.positive)return '改善';
    if(item&&item.state&&(item.state==='improving'||item.state==='resolved'))return '改善';
    return item&&item.level==='important'?'重要':'注意';
  }
  function itemPriority(item){
    if(!item)return 0;
    var level=(LEVEL_RANK[item.level]||0)*10000;
    var score=(Number(item.score)||0)*100;
    var persistence=(Number(item.persistenceMonths)||Number(item.persistenceWeeks)||Number(item.persistenceDays)||1)*10;
    var impact=Math.min(999,Math.round(Number(item.impactYen)||0)/1000);
    return level+score+persistence+impact;
  }
  function pickItems(review,theme){
    var items=[];
    if(review){
      if(theme&&theme!=='dashboard'&&theme!=='daily'&&typeof review.forTheme==='function')items=review.forTheme(theme)||[];
      else items=Array.isArray(review.items)?review.items.slice():(Array.isArray(review.display)?review.display.slice():[]);
    }
    items=items.filter(function(item){return item&&item.level!=='internal';});
    var bad=items.filter(function(item){return !item.positive&&item.state!=='resolved';}).sort(function(a,b){return itemPriority(b)-itemPriority(a);});
    var good=items.filter(function(item){return item.positive||item.state==='improving'||item.state==='resolved';}).sort(function(a,b){return itemPriority(b)-itemPriority(a);});
    var out=bad.slice(0,4);
    if(out.length<5&&good.length)out.push(good[0]);
    return out.slice(0,5);
  }
  function priorityLines(items){
    return items.map(function(item){
      var prefix='【'+levelLabel(item)+'】';
      var state=item.stateLabel&&item.stateLabel!=='継続'?' '+item.stateLabel:'';
      return prefix+item.title+'：'+item.summary+state;
    });
  }
  function ratioMetrics(context){
    var m=context&&context.metrics||{};
    var sales=num(m.salesYen),customers=num(m.customers),items=num(m.items);
    return {
      sales:sales,
      customers:customers,
      unitPrice:num(m.customerUnitPrice)||(sales!=null&&customers>0?sales/customers:null),
      items:items,
      itemsPerCustomer:items!=null&&customers>0?items/customers:null,
      salesPerItem:sales!=null&&items>0?sales/items:null,
      waste:num(m.wasteYen)
    };
  }
  function referenceContext(review,kind){
    if(!review)return null;
    if(kind==='week')return review.previous||null;
    return review.comparisonYear||review.previousMonth||null;
  }
  function comparisonName(review,kind){
    if(kind==='week')return '前週同期間比';
    return review&&review.period&&review.period.yoyLabel?review.period.yoyLabel:'比較期間比';
  }
  function salesRelation(review,kind,relations){
    var current=ratioMetrics(review&&review.current),previous=ratioMetrics(referenceContext(review,kind));
    var salesChange=pct(current.sales,previous.sales),customerChange=pct(current.customers,previous.customers),unitChange=pct(current.unitPrice,previous.unitPrice);
    if(salesChange==null||Math.abs(salesChange)<2)return;
    var label=comparisonName(review,kind),cause='客数・客単価の両方を確認';
    if(customerChange!=null&&unitChange!=null){
      if(salesChange<0&&customerChange<=-2&&unitChange>-2)cause='主因候補は客数。客単価は維持または改善';
      else if(salesChange<0&&unitChange<=-2&&customerChange>-2)cause='主因候補は客単価。客数は大きく崩れていません';
      else if(salesChange<0&&customerChange<=-2&&unitChange<=-2)cause='客数と客単価の双方が低下';
      else if(salesChange>0&&customerChange>=2&&unitChange<2)cause='売上増加には客数増加が関連';
      else if(salesChange>0&&unitChange>=2&&customerChange<2)cause='売上増加には客単価上昇が関連';
    }
    relations.push('【関連】売上 × 客数 × 客単価：'+label+' 売上 '+signed(salesChange)+' / 客数 '+signed(customerChange)+' / 客単価 '+signed(unitChange)+'。'+cause+'。');
  }
  function basketRelation(review,kind,relations){
    var current=ratioMetrics(review&&review.current),previous=ratioMetrics(referenceContext(review,kind));
    var unitChange=pct(current.unitPrice,previous.unitPrice);
    var itemChange=pct(current.itemsPerCustomer,previous.itemsPerCustomer);
    var itemPriceChange=pct(current.salesPerItem,previous.salesPerItem);
    if(unitChange==null||Math.abs(unitChange)<2||itemChange==null||itemPriceChange==null)return;
    var cause=Math.abs(itemChange)>=Math.abs(itemPriceChange)?'買上点数側の変化が大きい':'1点当たり売上側の変化が大きい';
    relations.push('【関連】客単価 × 買上点数 × 1点当たり売上：客単価 '+signed(unitChange)+' / 買上点数 '+signed(itemChange)+' / 1点当たり売上 '+signed(itemPriceChange)+'。'+cause+'。');
  }
  function salesCountTotals(context){
    var cats=context&&context.salesCount&&Array.isArray(context.salesCount.categories)?context.salesCount.categories:[];
    var delivery=0,sales=0,dCount=0,sCount=0;
    cats.forEach(function(c){
      if(!c||c.hidden)return;
      var d=c.delivery&&c.delivery.total&&num(c.delivery.total.average);
      var s=c.sales&&c.sales.total&&num(c.sales.total.average);
      if(d!=null){delivery+=d;dCount++;}
      if(s!=null){sales+=s;sCount++;}
    });
    return {delivery:dCount?delivery:null,sales:sCount?sales:null};
  }
  function wasteSupplyRelation(review,kind,relations){
    var current=ratioMetrics(review&&review.current),previous=ratioMetrics(referenceContext(review,kind));
    var wasteChange=pct(current.waste,previous.waste);
    if(wasteChange==null||wasteChange<5)return;
    var nowCount=salesCountTotals(review.current),prevCount=salesCountTotals(referenceContext(review,kind));
    var deliveryChange=pct(nowCount.delivery,prevCount.delivery),salesChange=pct(nowCount.sales,prevCount.sales);
    if(deliveryChange==null||salesChange==null)return;
    var note='納品と販売のバランスを確認';
    if(deliveryChange>=3&&salesChange<=3)note='納品増に対して販売が追いついていないため、供給量との関係を確認';
    else if(salesChange<=-3)note='販売低下と廃棄増加が同時に発生しているため、納品量との関係を確認';
    relations.push('【関連】納品 × 販売 × 廃棄：廃棄 '+signed(wasteChange)+' / 納品 '+signed(deliveryChange)+' / 販売 '+signed(salesChange)+'。'+note+'。');
  }
  function contextRelation(review,relations){
    var conditions=review&&review.current&&review.current.conditions||{};
    var daily=Array.isArray(conditions.daily)?conditions.daily:[],events=Array.isArray(conditions.events)?conditions.events:[];
    var rainy=daily.filter(function(d){return d&&/雨|雷|雪|みぞれ/.test(String(d.weather||''));}).length;
    if(!rainy&&!events.length)return;
    var parts=[];
    if(rainy)parts.push('雨・雪等 '+rainy+'日');
    if(events.length)parts.push('登録イベント '+events.length+'件');
    relations.push('【関連】天候・イベント：'+parts.join(' / ')+'。売上・客数との因果は断定せず、該当日との重なりを確認。');
  }
  function checksFor(items,review,relations){
    var types=new Set(items.map(function(i){return i.type||i.theme;})),checks=[];
    if(types.has('sales')||types.has('customers')){
      checks.push('曜日別の客数を確認し、天候・イベントが重なった日を照合してください。');
      checks.push('客数と客単価のどちらが継続的に売上へ影響しているか確認してください。');
    }
    if(types.has('waste'))checks.push('廃棄増加カテゴリーと、納品数－販売数の差を確認してください。');
    if(types.has('grossMargin')||types.has('laborRate')||types.has('costs'))checks.push('粗利率・人件費率の前年差と売上変化を合わせて確認してください。');
    if(types.has('salesCount'))checks.push('便別の納品・販売差と曜日別平均を確認してください。');
    if(review&&review.current&&review.current.conditions&&Array.isArray(review.current.conditions.events)&&review.current.conditions.events.length){
      checks.push('イベント実施日の前後で客数・販売数・廃棄がどう動いたか確認してください。');
    }
    if(relations.length)checks.push('上記は関連性・主因候補です。因果関係は断定せず、実績データで確認してください。');
    return uniq(checks).slice(0,4);
  }
  function conclusion(items,kind){
    var bad=items.filter(function(i){return !i.positive&&i.state!=='resolved';});
    var good=items.filter(function(i){return i.positive||i.state==='improving'||i.state==='resolved';});
    var period=kind==='week'?'今週':'今月';
    if(bad.length){
      return ['【結論】'+period+'は「'+bad.slice(0,2).map(function(i){return i.title;}).join('」「')+'」の確認を優先してください。'];
    }
    if(good.length)return ['【結論】'+period+'は優先度の高い悪化がなく、「'+good[0].title+'」が改善側です。'];
    return ['【結論】'+period+'は優先度の高い悪化項目は確認されていません。'];
  }
  function crossEvidence(cross){
    if(!cross)return [];
    var lines=[],weekday=cross.weekday,season=cross.seasonality;
    function add(prefix,text){if(text)lines.push('【'+prefix+'】'+String(text));}
    if(weekday){
      var rows=weekday.rows||weekday.weekdays||weekday.items||[];
      var weak=Array.isArray(rows)?rows.filter(function(row){
        var metrics=row&&row.metrics||{},customer=metrics.customers||metrics.customerCount||null;
        var code=customer&&customer.position&&customer.position.code;
        return code==='low'||customer&&customer.direction==='down';
      }).slice(0,2):[];
      if(weak.length)add('補強',weak.map(function(row){return (row.weekdayLabel||row.label||'特定曜日')+'曜日の客数が弱い';}).join(' / ')+'。');
    }
    if(season&&season.metrics){
      var sales=season.metrics.sales||season.metrics.salesYen,customers=season.metrics.customers;
      [sales,customers].forEach(function(metric){
        if(!metric||!metric.relationship)return;
        var code=metric.relationship.code,label=metric.relationship.label;
        if(code==='current_only_low'||code==='current_only_high')add('説明しにくい要因','現在の変化は例年の季節性だけでは説明しにくい（'+label+'）。');
        else if(code==='recurring_low'||code==='recurring_high')add('補強','例年の季節傾向と同方向（'+label+'）。');
      });
    }
    function impactLines(list,label){
      (Array.isArray(list)?list:[]).forEach(function(entry){
        if(!entry||entry.status!=='ok'||!entry.impact)return;
        var impact=entry.impact,kpi=impact.kpi&&impact.kpi.metrics||{},sales=kpi.sales||kpi.salesYen||kpi.customers;
        var direction=sales&&sales.pattern&&sales.pattern.duringVsBefore&&sales.pattern.duringVsBefore.direction||
          sales&&sales.comparison&&sales.comparison.direction||null;
        if(direction==='up'||direction==='down')add('補強',label+(entry.title?'「'+entry.title+'」':'')+'の実績変化は'+(direction==='up'?'上向き':'下向き')+'。');
      });
    }
    impactLines(cross.saleImpacts,'セール');
    impactLines(cross.eventImpacts,'イベント');
    return uniq(lines).slice(0,3);
  }

  function interpretReview(review,kind,theme,cross){
    var items=pickItems(review,theme),relations=[];
    salesRelation(review,kind,relations);
    basketRelation(review,kind,relations);
    wasteSupplyRelation(review,kind,relations);
    if(theme==='dashboard'||theme==='daily'||!theme)contextRelation(review,relations);
    var evidence=crossEvidence(cross);
    relations=uniq(relations).slice(0,Math.max(0,5-evidence.length)).concat(evidence).slice(0,5);
    var checks=checksFor(items,review,relations);
    return {
      conclusion:conclusion(items,kind),
      priorities:priorityLines(items),
      relations:relations,
      checks:checks
    };
  }
  function monthly(review,theme,cross){return interpretReview(review,'month',theme,cross);}
  function weekly(review,theme,cross){return interpretReview(review,'week',theme,cross);}
  function daily(anomaly,panel){
    var display=anomaly&&Array.isArray(anomaly.display)?anomaly.display:[],opportunities=anomaly&&Array.isArray(anomaly.opportunities)?anomaly.opportunities:[];
    var items=display.slice(0,4);
    if(items.length<5&&opportunities.length)items.push(Object.assign({positive:true},opportunities[0]));
    var priorities=items.map(function(item){
      var positive=!!item.positive||item.direction==='up'&&/増加|改善|機会/.test(String(item.title||''));
      var label=positive?'改善':item.level==='important'?'重要':'注意';
      return '【'+label+'】'+item.title+'：'+item.summary;
    });
    var relations=[],sales=display.find(function(i){return i&&i.key==='sales'&&i.details&&i.details.customerCause;});
    if(sales){
      var cause=sales.details.customerCause;
      if(cause&&cause.deltaPct!=null)relations.push('【関連】売上 × 客数：売上低下の主因候補は客数 '+signed(cause.deltaPct)+'。');
    }
    var target=anomaly&&anomaly.target,day=target&&Array.isArray(target.daily)?target.daily[0]:null;
    if(day&&day.conditions){
      var parts=[];
      if(day.conditions.weather)parts.push('天気 '+day.conditions.weather);
      if(day.conditions.eventIds&&day.conditions.eventIds.length)parts.push('イベント '+day.conditions.eventIds.length+'件');
      if(parts.length)relations.push('【関連】当日の条件：'+parts.join(' / ')+'。数値変化との因果は断定せず照合してください。');
    }
    var checks=[];
    if(display.some(function(i){return i.type==='sales'||i.type==='customers';}))checks.push('同曜日の客数と客単価を比較してください。');
    if(display.some(function(i){return i.type==='waste';}))checks.push('廃棄カテゴリーと納品・販売差を確認してください。');
    if(display.some(function(i){return i.type==='salesCount';}))checks.push('便別の納品・販売差を確認してください。');
    (panel&&panel.checks||[]).filter(function(line){return /店舗メモ|店舗イベント|データ不足/.test(line);}).slice(0,2).forEach(function(line){checks.push(line);});
    if(relations.length)checks.push('関連性は因果関係の断定ではありません。必要な実績を追加確認してください。');
    var conclusionLine=display.length?'【結論】選択日は「'+display.slice(0,2).map(function(i){return i.title;}).join('」「')+'」を優先確認してください。':
      '【結論】選択日に即時対応が必要な大きな異常は確認されていません。';
    return {conclusion:[conclusionLine],priorities:priorities.slice(0,5),relations:uniq(relations).slice(0,4),checks:uniq(checks).slice(0,4)};
  }

  var model={VERSION:VERSION,monthly:monthly,weekly:weekly,daily:daily,pickItems:pickItems,itemPriority:itemPriority,crossEvidence:crossEvidence};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAIInterpretation=model;
})(typeof window!=='undefined'?window:globalThis);
