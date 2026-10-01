/* Page-scoped automatic comments. Free questions remain owned by existing handlers. */
(function(root){
  'use strict';
  if(root.__insightAIPageCommentsV1)return;
  root.__insightAIPageCommentsV1=true;
  var DAYS=['日','月','火','水','木','金','土'];
  function mode(){
    var nav=typeof currentNav==='undefined'?1:currentNav;
    return ({0:'daily',1:'dashboard',2:'sales',3:'customers',4:'waste',salesCounts:'salesCounts'})[nav]||'dashboard';
  }
  function analysisPeriod(m){
    var selected=root.InsightAIViewState&&root.InsightAIViewState.period;
    if(selected==='today'&&m!=='daily')return 'month';
    return selected||(m==='daily'?'today':'month');
  }
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
  function amount(v){return Math.round(num(v)).toLocaleString('ja-JP');}
  function yen(v){return '¥'+amount(v);}
  function signed(v,format){return (v>0?'+':'')+format(v);}
  function short(v){var s=String(v||'').trim();return s.length>80?s.slice(0,80)+'…':s;}
  function pad(v){return String(v).padStart(2,'0');}
  function dateKey(c,day){return c.year+'-'+pad(c.mi+1)+'-'+pad(day);}
  function context(m){
    var type={sales:'sales',customers:'kyaku',waste:'haiki'}[m];
    var year=type?editYear[type]:baseYear,month=type?editMonth[type]:selMonth;
    var day=null;
    if(m==='daily'){
      var selected=root.InsightDateContext&&typeof root.InsightDateContext.getSelectedInfo==='function'?root.InsightDateContext.getSelectedInfo():null;
      if(selected){year=selected.fy;month=selected.month;day=selected.day;}
    }
    var mi=MONTHS.indexOf(month),through=m==='daily'?day:getAIAnalysisThroughDay(year,month);
    return {year:String(year),month:month,mi:mi,day:day,through:through,
      prev:typeof cmpYear!=='undefined'&&cmpYear!=null?String(cmpYear):null};
  }
  function rows(c,year){
    return root.KPIEngine.getRows(year==null?c.year:year,c.month,c.through)||[];
  }
  function dayOf(row,i){return Number(row&&row.d)||i+1;}
  function savedNote(p){p.checks.push('保存済みデータを対象としています。未保存の入力は保存後に再度確認してください。');}
  function panel(c,m){
    return {mode:m,period:c.year+'年 '+c.month+(c.day?' '+c.day+'日':c.through?' '+c.through+'日まで':'')+'（保存済み）',
      summary:[],good:[],caution:[],checks:[]};
  }
  function events(c,day){
    if(!root.InsightEvents)return [];
    var end=day||c.through||new Date(Number(c.year),c.mi+1,0).getDate();
    return root.InsightEvents.list(allStores,allStores.current,dateKey(c,day||1),dateKey(c,end));
  }
  function eventLines(p,c,day){
    var list=events(c,day);
    if(!list.length){if(day)p.summary.push('店舗イベントの登録はありません。');return;}
    p.checks.push('店舗イベント：'+list.slice(0,3).map(function(e){
      return (day?'':e.startDate+'〜'+e.endDate+' ')+root.InsightEvents.summary(e.snapshot)+(e.snapshot.note?'（'+short(e.snapshot.note)+'）':'');
    }).join(' / ')+(list.length>3?' ほか'+(list.length-3)+'件':'')+'。');
    p.checks.push('天気・イベントとの因果関係は断定せず、該当日の売上・客数などと照合してください。');
  }
  function daily(c){
    var p=panel(c,'daily'),r=rows(c).find(function(r,i){return dayOf(r,i)===c.day;})||{};
    var k=root.KPIEngine.calc([r]),missing=[],anomaly=null;
    try{
      if(root.InsightDailyAnomaly&&typeof root.InsightDailyAnomaly.evaluate==='function'){
        anomaly=root.InsightDailyAnomaly.evaluate(dateKey(c,c.day),allStores.current);
      }
    }catch(_){}
    [['売上','売上',yen(k.salesYen)],['客数','客数',amount(k.customers)+'人'],['買上点数','買上点数',num(k.items).toLocaleString('ja-JP')+'点']].forEach(function(x){
      if(num(r[x[0]])>0)p.summary.push(c.day+'日の'+x[1]+'は'+x[2]+'です。');else missing.push(x[1]);
    });
    if(k.wasteYen>0)p.summary.push('廃棄額は'+yen(k.wasteYen)+'です。');
    else p.summary.push('廃棄額の記録は0円または未入力です。');
    if(r.weather)p.summary.push('天気は「'+r.weather+'」が記録されています。');else missing.push('天気');
    var fmt=root.InsightInputWeatherTemp&&root.InsightInputWeatherTemp.fmtTemp;
    function temperature(v){return fmt?fmt(v):(v==null||v===''?'—':String(Math.round(Number(v))));}
    p.summary.push('最高気温 '+temperature(r.tempMaxC)+'℃ / 最低気温 '+temperature(r.tempMinC)+'℃。');
    if(r.tempMaxC==null||r.tempMaxC===''||r.tempMinC==null||r.tempMinC==='')missing.push('気温');
    if(r.storeMemo)p.checks.push('店舗メモ：'+short(r.storeMemo));
    if(anomaly&&anomaly.display&&anomaly.display.length){
      anomaly.display.slice(0,3).forEach(function(item){
        p.caution.push('【'+(item.level==='important'?'重要':'注意')+'】'+item.title+'：'+item.summary);
      });
    }
    if(anomaly&&anomaly.opportunities&&anomaly.opportunities.length){
      var opp=anomaly.opportunities[0];
      p.good.push(opp.title+'：'+opp.summary);
    }
    if(missing.length)p.caution.push(missing.join('・')+'はデータ不足のため評価できません。');
    if(!anomaly||!anomaly.display||!anomaly.display.length)p.good.push('日次の即時警告対象はありません。');
    eventLines(p,c,c.day);savedNote(p);return p;
  }
  function metricRows(list,key){
    return list.filter(function(r){return key==='wasteYen'?root.KPIEngine.getRowWasteYen(r)>0||num(r.売上)>0:num(r[key==='salesYen'?'売上':'客数'])>0;});
  }
  function periodComparison(c){
    if(c.prev==null)return null;
    var result=root.InsightYearComparison.getPeriod(c.year,c.month,c.through,c.prev);
    if(!result.current.inputDays||!result.previous.inputDays)return null;
    return {now:result.current,previous:result.previous,changes:result.comparison,basis:result.basis};
  }
  function comparisonLine(label,change,unit){
    if(!change)return label+'は前年値が0またはデータ不足のため前年比を比較できません。';
    return label+'は前年比'+formatPctForComment(change)+'、前年差'+signed(change.difference,unit)+'です。';
  }
  function weekday(c,list,key){
    var groups=DAYS.map(function(){return [];});
    metricRows(list,key).forEach(function(r,i){
      groups[new Date(Number(c.year),c.mi,dayOf(r,i)).getDay()].push(r);
    });
    return groups.map(function(group,i){
      return {day:DAYS[i],count:group.length,value:group.length?root.KPIEngine.calc(group)[key]/group.length:null};
    });
  }
  function trends(p,c,list,key,label,format){
    var dailyRows=metricRows(list,key).map(function(r,i){return {row:r,day:dayOf(r,i),value:root.KPIEngine.calc([r])[key]};});
    if(dailyRows.length){
      var sorted=dailyRows.slice().sort(function(a,b){return b.value-a.value;});
      if(sorted.length>1&&sorted[0].value!==sorted[sorted.length-1].value){
        var high=sorted[0],low=sorted[sorted.length-1];
        p.summary.push('入力済日の'+label+'：最多 '+high.day+'日 '+format(high.value)+' / 最少 '+low.day+'日 '+format(low.value)+'。');
        if(low.row.weather)p.checks.push(label+'が最少の'+low.day+'日に「'+low.row.weather+'」が記録されています。客数・売上などと合わせて確認してください。');
      }
    }
    var now=weekday(c,list,key),available=now.filter(function(w){return w.count;});
    if(available.length)p.summary.push('曜日別の平均'+label+'：'+available.map(function(w){return w.day+'曜 '+format(w.value)+'（'+w.count+'日）';}).join(' / ')+'。');
    if(c.prev==null)return;
    var prevContext=Object.assign({},c,{year:c.prev}),old=weekday(prevContext,rows(c,c.prev),key);
    var deltas=now.map(function(w,i){return w.value!=null&&old[i].value!=null?{day:w.day,diff:w.value-old[i].value}:null;}).filter(Boolean);
    var up=deltas.filter(function(d){return d.diff>0;}).sort(function(a,b){return b.diff-a.diff;})[0];
    var down=deltas.filter(function(d){return d.diff<0;}).sort(function(a,b){return a.diff-b.diff;})[0];
    if(up)p.good.push('曜日平均'+label+'は'+up.day+'曜日の増加が最大（前年差'+signed(up.diff,format)+'）です。');
    if(down)p.caution.push('曜日平均'+label+'は'+down.day+'曜日の低下が最大（前年差'+signed(down.diff,format)+'）です。');
    if(deltas.length)p.checks.push('曜日比較は各年の入力済日平均です。日数・祝日・イベントの違いも確認してください。');
    else p.caution.push('曜日別の前年データが不足しており、増減を比較できません。');
  }
  function wasteDetails(p,c,list,comparison){
    if(!root.InsightWasteInsights){p.caution.push('カテゴリー別廃棄はデータ不足のため比較できません。');return;}
    var totals=root.InsightWasteInsights.sumCategories(list);
    var ranked=HAIKI_CATS.map(function(name,i){return {name:name,value:totals[i]};}).filter(function(x){return x.value>0;}).sort(function(a,b){return b.value-a.value;});
    if(ranked.length)p.summary.push('カテゴリー別廃棄：'+ranked.slice(0,3).map(function(x){return x.name+' '+yen(x.value);}).join(' / ')+'。');
    else p.caution.push('カテゴリー別廃棄の内訳データがありません。');
    if(!comparison)return;
    var prev=root.InsightWasteInsights.sumCategories(rows(c,c.prev));
    var changes=HAIKI_CATS.map(function(name,i){return {name:name,diff:totals[i]-prev[i]};});
    var rising=changes.filter(function(x){return x.diff>0;}).sort(function(a,b){return b.diff-a.diff;})[0];
    var falling=changes.filter(function(x){return x.diff<0;}).sort(function(a,b){return a.diff-b.diff;})[0];
    if(rising)p.caution.push(rising.name+'の廃棄増加額が最大（前年差'+signed(rising.diff,yen)+'）です。');
    if(falling)p.good.push(falling.name+'の廃棄減少額が最大（前年差'+signed(falling.diff,yen)+'）です。');
    if(rising||falling)p.checks.push('カテゴリー比較は対象期間の記録合計です。入力日数の違いも確認してください。');
  }
  function inputPage(c,m){
    var p=panel(c,m),list=rows(c),k=root.KPIEngine.calc(list);
    var key=m==='sales'?'salesYen':m==='customers'?'customers':'wasteYen';
    var label=m==='sales'?'売上':m==='customers'?'客数':'廃棄額';
    var format=m==='customers'?function(v){return amount(v)+'人';}:yen;
    var currentRows=metricRows(list,key),comparison=periodComparison(c);
    if(currentRows.length)p.summary.push(label+'は'+format(k[key])+'です。');
    else p.caution.push(label+'はデータ不足のため評価できません。');
    if(c.prev==null){
      p.checks.push('前年比較は「なし」のため、前年との比較は行っていません。');
    }else if(comparison){
      p.summary.push(comparisonLine(label,comparison.changes[key],format));
      p.checks.push(comparison.basis==='dailyAverage'?'前年比・前年差は各年の入力済み1日平均同士で比較しています。':'前年比・前年差は月合計同士で比較しています。');
    }else p.caution.push('前年と比較できる入力済み日がありません。現在値を中心に表示しています。');
    if(m==='waste'){
      if(k.salesYen>0){
        var rate='廃棄率は'+k.wasteRate.toFixed(1)+'%';
        if(comparison&&comparison.now.salesYen>0&&comparison.previous.salesYen>0)rate+='、前年差'+formatPointForComment(comparison.changes.wasteRate);
        p.summary.push(rate+'です。対象期間の売上は'+yen(k.salesYen)+'です。');
      }else p.caution.push('売上が未入力または0のため、廃棄率は計算できません。');
      wasteDetails(p,c,list,comparison);p.checks.push('廃棄額・廃棄率と売上推移のバランスを確認してください。');
    }else{
      var supporting=m==='sales'?[['客数',k.customers,'人'],['客単価',k.customerUnitPrice,'円'],['買上点数',k.items,'点']]:[['売上',k.salesYen,'円'],['客単価',k.customerUnitPrice,'円'],['買上点数',k.items,'点']];
      var related=supporting.filter(function(x){return x[1]>0;}).map(function(x){return x[0]+' '+(x[2]==='円'?yen(x[1]):num(x[1]).toLocaleString('ja-JP')+x[2]);});
      if(related.length)p.summary.push('関連指標：'+related.join(' / ')+'。');
      trends(p,c,list,key,label,format);
      eventLines(p,c);
      p.checks.push('売上・客数・客単価・買上点数を合わせて確認してください。');
    }
    savedNote(p);return p;
  }
  function salesCounts(){
    var p={mode:'salesCounts',period:'販売数入力',summary:[],good:[],caution:[],checks:[]};
    var model=root.InsightSalesCount,c=model&&model.getAnalysisContext&&model.getAnalysisContext();
    if(!c||!c.category){p.caution.push('選択カテゴリーまたは販売数データが不足しています。');return p;}
    p.period=c.year+'年 '+c.month+'月 / '+c.category.name;
    function fmt(v){return v==null?'データ不足':Number(v).toFixed(1).replace(/\.0$/,'');}
    p.summary.push(c.category.name+'の入力済み平均（便ごとに集計）：');
    for(var i=0;i<3;i++)p.summary.push((i+1)+'便 納品 '+fmt(c.delivery.trips[i])+' / 販売 '+fmt(c.sales.trips[i])+'。');
    p.summary.push('日合計平均：納品 '+fmt(c.delivery.total)+' / 販売 '+fmt(c.sales.total)+'（3便すべて入力済みの日）。');
    var days=c.daily.filter(function(d){return d.delivery!=null||d.sales!=null;});
    if(days.length)p.summary.push('日合計（直近の入力済み日）：'+days.slice(-3).map(function(d){return d.date.slice(8)+'日 納品 '+fmt(d.delivery)+' / 販売 '+fmt(d.sales);}).join(' / ')+'。');
    else p.caution.push('このカテゴリーの納品数・販売数はデータ不足です。');
    var weekdays=c.weekdays.sales.map(function(s,i){var d=c.weekdays.delivery[i];return s.total!=null||d.total!=null?DAYS[i]+'曜 納品 '+fmt(d.total)+' / 販売 '+fmt(s.total):null;}).filter(Boolean);
    if(weekdays.length)p.summary.push('曜日別の日合計平均：'+weekdays.join(' / ')+'。');
    p.checks.push('セール日平均 / 同曜日通常日平均（保存済み）：');
    for(var t=0;t<3;t++){
      p.checks.push((t+1)+'便 納品 '+fmt(c.sale.delivery.trips[t])+' / '+fmt(c.normal.delivery.trips[t])+'、販売 '+fmt(c.sale.sales.trips[t])+' / '+fmt(c.normal.sales.trips[t])+'。');
    }
    p.checks.push('日合計 納品 '+fmt(c.sale.delivery.total)+' / '+fmt(c.normal.delivery.total)+'、販売 '+fmt(c.sale.sales.total)+' / '+fmt(c.normal.sales.total)+'。');
    var diffs=[0,1,2].map(function(t){return c.sale.sales.trips[t]!=null&&c.normal.sales.trips[t]!=null?{trip:t+1,value:c.sale.sales.trips[t]-c.normal.sales.trips[t]}:null;}).filter(Boolean).sort(function(a,b){return Math.abs(b.value)-Math.abs(a.value);});
    if(diffs.length&&diffs[0].value!==0)p.summary.push('販売数の比較差は'+diffs[0].trip+'便が最大（セール日平均−同曜日通常日平均 '+signed(diffs[0].value,fmt)+'）です。');
    else if(!diffs.length)p.caution.push('セール日と同曜日通常日の比較データが不足しています。');
    var descriptions=Array.from(new Set(c.events.map(function(e){return e.summary;})));
    if(descriptions.length)p.checks.push('対象カテゴリーのイベント：'+descriptions.slice(0,3).join(' / ')+'。');
    p.checks.push('セールとの因果関係は断定せず、比較値として確認してください。販売数は前便の在庫を含む可能性があります。');
    if(c.dirty)p.checks.push('入力済み平均・日合計には未保存の入力を含みます。セール比較は保存済みの値です。');
    return p;
  }
  function weekDateLabel(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    return m?Number(m[2])+'/'+Number(m[3]):value;
  }
  function weeklyThemeLabel(theme){
    return {dashboard:'総合',sales:'売上',customers:'客数',waste:'廃棄',salesCounts:'販売・納品'}[theme]||'総合';
  }
  function weeklyMetricSummary(review,theme){
    var now=review.current.metrics||{},prev=review.previous.metrics||{};
    function change(a,b){return b?((a-b)/b*100):null;}
    function pctText(v){return v==null?'比較不可':(v>0?'+':'')+v.toFixed(1)+'%';}
    if(theme==='sales')return '売上 '+yen(now.salesYen)+' / 前週同期間比 '+pctText(change(now.salesYen,prev.salesYen))+'。';
    if(theme==='customers')return '客数 '+amount(now.customers)+'人 / 前週同期間比 '+pctText(change(now.customers,prev.customers))+'。';
    if(theme==='waste')return '廃棄金額 '+yen(now.wasteYen)+' / 前週同期間比 '+pctText(change(now.wasteYen,prev.wasteYen))+'。';
    if(theme==='salesCounts')return '販売・納品はカテゴリー別の前週同期間比と乖離を確認しています。';
    return review.conclusion[0]||'週次KPIを確認しています。';
  }
  function weeklyPanel(m){
    if(!root.InsightWeeklyReview)throw new Error('週次レビューを利用できません。');
    var theme=m==='daily'?'dashboard':m;
    var reference=root.InsightWeeklyReview.referenceDate();
    var review=root.InsightWeeklyReview.review(reference,allStores.current);
    var items=review.forTheme(theme),p={
      mode:m,
      period:review.period.referenceDate.slice(0,4)+'/'+weekDateLabel(review.period.startDate)+'〜'+weekDateLabel(review.period.endDate)+'（前週同期間比・保存済み）',
      summary:[],good:[],caution:[],checks:[]
    };
    p.summary.push(weeklyMetricSummary(review,theme));
    if(theme==='dashboard'&&review.conclusion[1])p.summary.push(review.conclusion[1]);
    items.slice(0,5).forEach(function(item){
      p.summary.push('【'+item.stateLabel+'】'+item.title+'：'+item.summary);
    });
    var bad=items.filter(function(item){return !item.positive&&item.state!=='resolved';}).slice(0,3);
    bad.forEach(function(item){
      p.caution.push('【'+item.stateLabel+'】'+item.title+'：'+item.summary);
    });
    var positive=items.filter(function(item){return item.positive||item.state==='improving'||item.state==='resolved';}).slice(0,2);
    positive.forEach(function(item){
      p.good.push('【'+item.stateLabel+'】'+item.title+'：'+item.summary);
    });
    if(!items.length)p.good.push(weeklyThemeLabel(theme)+'に大きな週次異常はありません。');
    (review.context||[]).forEach(function(line){p.checks.push(line+'。');});
    p.checks.push('今週は月曜から基準日までを、前週の同じ曜日数と比較しています。');
    p.checks.push('週次の増減だけで因果関係は断定せず、天気・イベント・販売/納品も合わせて確認してください。');
    savedNote(p);
    return p;
  }
  function weeklyQuestionAnswer(q,m){
    if(!root.InsightWeeklyReview)return '週次レビューを利用できません。';
    var theme=m==='daily'?'dashboard':m,review=root.InsightWeeklyReview.review(root.InsightWeeklyReview.referenceDate(),allStores.current);
    var items=review.forTheme(theme),explicit=null;
    if(/売上/.test(q))explicit='sales';
    else if(/客数|来店/.test(q))explicit='customers';
    else if(/廃棄|ロス/.test(q))explicit='waste';
    else if(/販売|納品|発注/.test(q))explicit='salesCounts';
    if(explicit)items=review.forTheme(explicit);
    if(/良い|改善|伸び|増え|機会/.test(q))items=items.filter(function(i){return i.positive||i.state==='improving'||i.state==='resolved';});
    else if(/問題|悪い|注意|課題|下が|減っ/.test(q))items=items.filter(function(i){return !i.positive&&i.state!=='resolved';});
    var out=[];
    if(!explicit&&theme==='dashboard')out=out.concat(review.conclusion);
    if(items.length){
      items.slice(0,5).forEach(function(item){
        out.push('【'+item.stateLabel+'】'+item.title+'：'+item.summary);
        if(/なぜ|原因|理由/.test(q)&&item.details&&item.details.cause&&item.details.cause.label){
          var cause=item.details.cause;
          if(cause.changePct!=null)out.push('主因候補は'+cause.label+' '+(cause.changePct>0?'+':'')+cause.changePct.toFixed(1)+'%です。');
        }
      });
    }else out.push(weeklyThemeLabel(explicit||theme)+'に表示対象となる大きな週次異常はありません。');
    if(review.context&&review.context.length)out.push('関連情報：'+review.context.join(' / ')+'。');
    out.push('比較は今週と前週の同じ曜日数です。因果関係は断定していません。');
    return out.join('\n');
  }
  function monthlyThemeLabel(theme){
    return {dashboard:'総合',sales:'売上',customers:'客数',waste:'廃棄',salesCounts:'販売・納品'}[theme]||'総合';
  }
  function reviewMonthContext(m){
    var c=context(m),monthNumber=c.mi+1;
    if(monthNumber<1||monthNumber>12)throw new Error('対象月を取得できません。');
    return {c:c,monthNumber:monthNumber};
  }
  function monthlyPct(v){return v==null?'比較不可':(v>0?'+':'')+v.toFixed(1)+'%';}
  function monthlyPoint(v){return v==null?'比較不可':(v>0?'+':'')+v.toFixed(1)+'pt';}
  function monthlyMetricSummary(review,theme){
    var m=review.metrics||{},now=review.current.metrics||{},yoy=review.period.yoyLabel||'前年同月比';
    if(theme==='sales')return '売上 '+yen(now.salesYen)+' / '+yoy+' '+monthlyPct(m.sales&&m.sales.yoyPct)+' / 前月比 '+monthlyPct(m.sales&&m.sales.momPct)+'。';
    if(theme==='customers')return '客数 '+amount(now.customers)+'人 / '+yoy+' '+monthlyPct(m.customers&&m.customers.yoyPct)+' / 前月比 '+monthlyPct(m.customers&&m.customers.momPct)+'。';
    if(theme==='waste')return '廃棄金額 '+yen(now.wasteYen)+' / '+yoy+' '+monthlyPct(m.waste&&m.waste.yoyPct)+' / 前月比 '+monthlyPct(m.waste&&m.waste.momPct)+'。';
    return review.conclusion[0]||'月次KPIを確認しています。';
  }
  function monthlyPanel(m){
    if(m==='salesCounts'){
      var salePanel=salesCounts();
      salePanel.summary.unshift('月次の販売・納品実績をカテゴリー別に確認しています。');
      salePanel.checks.push('販売・納品は月次経営評価の補助情報として扱います。');
      return salePanel;
    }
    if(!root.InsightMonthlyReview)throw new Error('月次レビューを利用できません。');
    var info=reviewMonthContext(m),c=info.c,theme=m==='daily'?'dashboard':m;
    var review=root.InsightMonthlyReview.review({
      year:Number(c.year),month:info.monthNumber,throughDay:c.through,compareYear:c.prev,storeId:allStores.current
    });
    var items=review.forTheme(theme),p={
      mode:m,
      period:review.period.label+'（'+(review.period.yoyLabel||'前年比較なし')+'・保存済み）',
      summary:[],good:[],caution:[],checks:[]
    };
    if(theme==='dashboard')p.summary=p.summary.concat(review.conclusion);
    else p.summary.push(monthlyMetricSummary(review,theme));
    items.slice(0,5).forEach(function(item){
      p.summary.push(item.title+'：'+item.summary);
    });
    items.filter(function(item){return !item.positive;}).slice(0,3).forEach(function(item){
      p.caution.push(item.title+'：'+item.summary);
    });
    items.filter(function(item){return item.positive;}).slice(0,2).forEach(function(item){
      p.good.push(item.title+'：'+item.summary);
    });
    if(!items.length)p.good.push(monthlyThemeLabel(theme)+'に優先度の高い月次悪化項目はありません。');

    if(theme==='dashboard'){
      if(review.grossMargin&&review.grossMargin.current!=null){
        var gm='粗利率 '+review.grossMargin.current.toFixed(1)+'%';
        if(review.grossMargin.yoyPoint!=null)gm+=' / '+(review.period.yoyLabel||'同月比')+' '+monthlyPoint(review.grossMargin.yoyPoint);
        p.summary.push(gm+'。');
      }
      if(review.labor&&review.labor.currentRate!=null){
        var lr='人件費率 '+review.labor.currentRate.toFixed(1)+'%';
        if(review.labor.yoyPoint!=null)lr+=' / '+(review.period.yoyLabel||'同月比')+' '+monthlyPoint(review.labor.yoyPoint);
        p.summary.push(lr+'。');
      }else if(!review.period.completed&&review.current.profitCost&&review.current.profitCost.available){
        p.checks.push('人件費は月終了後に正式評価します。');
      }
    }

    p.checks.push(review.period.completed?
      '終了済み月の前年比・前月比は月合計を比較しています。':
      '進行中月の前年比・前月比は入力済み1日平均を比較しています。');
    if(review.period.compareYear==null)p.checks.push('前年比較は「なし」のため、前月比と現在値を中心に評価しています。');
    else p.checks.push('3か月トレンドは各月を比較年同月と照合し、±1.5pt程度の変化は横ばいとして扱います。');
    var events=review.current.conditions&&review.current.conditions.events||[];
    if(events.length)p.checks.push('登録イベント '+events.length+'件。数値変化との因果関係は断定せず照合してください。');
    savedNote(p);
    return p;
  }
  function monthlyQuestionAnswer(q,m){
    if(m==='salesCounts'){
      var salesPanel=salesCounts(),saleLines=[];
      if(/問題|悪い|注意|課題/.test(q))saleLines=salesPanel.caution;
      else if(/確認|見る|すべき/.test(q))saleLines=salesPanel.checks;
      else saleLines=salesPanel.summary.concat(salesPanel.checks.slice(0,2));
      return saleLines.length?saleLines.join('\n'):'販売・納品の月次データが不足しています。';
    }
    if(!root.InsightMonthlyReview)return '月次レビューを利用できません。';
    var info=reviewMonthContext(m),c=info.c,theme=m==='daily'?'dashboard':m;
    var review=root.InsightMonthlyReview.review({
      year:Number(c.year),month:info.monthNumber,throughDay:c.through,compareYear:c.prev,storeId:allStores.current
    });
    var explicit=null;
    if(/人件費|人件費率|粗利|利益|コスト/.test(q))explicit='costs';
    else if(/売上/.test(q))explicit='sales';
    else if(/客数|来店/.test(q))explicit='customers';
    else if(/廃棄|ロス/.test(q))explicit='waste';
    var items=review.forTheme(explicit||theme),out=[];
    if(!explicit&&theme==='dashboard')out=out.concat(review.conclusion);
    if(/3か月|トレンド|傾向/.test(q)){
      var names={sales:'売上',customers:'客数',waste:'廃棄'};
      Object.keys(names).forEach(function(key){
        var t=review.trends[key];
        if(t&&t.label!=='データ不足')out.push(names[key]+'：3か月 '+t.label+(t.badStreak>=2?'（悪化側 '+t.badStreak+'か月継続）':''));
      });
    }
    if(/なぜ|原因|理由/.test(q)&&(/売上/.test(q)||(!explicit&&theme==='sales'))){
      var customer=review.metrics.customers&&review.metrics.customers.yoyPct;
      var unit=review.metrics.customerUnitPrice&&review.metrics.customerUnitPrice.yoyPct;
      if(customer!=null||unit!=null)out.push('売上の変動内訳：客数 '+monthlyPct(customer)+' / 客単価 '+monthlyPct(unit)+'。');
    }
    if(explicit==='costs'){
      if(review.grossMargin.current!=null)out.push('粗利率は'+review.grossMargin.current.toFixed(1)+'%'+(review.grossMargin.yoyPoint!=null?'、'+(review.period.yoyLabel||'同月比')+' '+monthlyPoint(review.grossMargin.yoyPoint):'')+'。');
      if(review.labor.currentRate!=null)out.push('人件費率は'+review.labor.currentRate.toFixed(1)+'%'+(review.labor.yoyPoint!=null?'、'+(review.period.yoyLabel||'同月比')+' '+monthlyPoint(review.labor.yoyPoint):'')+'。');
      else if(!review.period.completed)out.push('人件費は月終了後に正式評価します。');
    }
    if(/良い|改善|伸び|機会/.test(q))items=items.filter(function(i){return i.positive;});
    else if(/問題|悪い|注意|課題|下が|減っ/.test(q))items=items.filter(function(i){return !i.positive;});
    items.slice(0,5).forEach(function(item){out.push(item.title+'：'+item.summary);});
    if(!out.length)out.push(monthlyThemeLabel(explicit||theme)+'に表示対象となる大きな月次変化はありません。');
    out.push(review.period.completed?'比較基準は月合計です。':'進行中月の比較基準は入力済み1日平均です。');
    return Array.from(new Set(out)).join('\n');
  }
  function build(m){
    m=m||mode();
    if(m==='salesCounts')return salesCounts();
    var c=context(m);
    return m==='daily'?daily(c):inputPage(c,m);
  }
  function append(id,lines,fallback){
    var el=document.getElementById(id);if(!el)return;
    el.innerHTML='';
    var unique=Array.from(new Set(lines));
    (unique.length?unique:[fallback]).forEach(function(text){
      var node=document.createElement('p');node.className=unique.length?'ai-analysis-comment':'ai-analysis-empty';
      node.textContent=text;el.appendChild(node);
    });
  }
  function heading(text){
    var summary=document.getElementById('aiAnalysisSummary');
    var title=summary&&summary.parentElement&&summary.parentElement.querySelector('.ai-analysis-card-title');
    if(title)title.textContent=text;
  }
  function install(){
    if(!root.InsightHooks)return;
    root.InsightHooks.on('ai:render:before','page-ai-route',function(ctx){
      var m=mode(),periodMode=analysisPeriod(m);
      if(periodMode==='week'){
        var weekly;
        try{weekly=weeklyPanel(m);}catch(e){weekly={period:'週次データを取得できません',summary:[],good:[],caution:['週次レビューに必要なデータを取得できません。'],checks:[]};}
        heading('今週の'+weeklyThemeLabel(m==='daily'?'dashboard':m));
        var weeklyPeriod=document.getElementById('aiAnalysisPeriod');if(weeklyPeriod)weeklyPeriod.textContent=weekly.period;
        append('aiAnalysisSummary',weekly.summary,'今週のデータが不足しています。');
        append('aiAnalysisGood',weekly.good,'今週の改善・機会は確認されていません。');
        append('aiAnalysisCaution',weekly.caution,'今週の重要な注意点は確認されていません。');
        append('aiAnalysisChecks',weekly.checks,'週次データを確認してください。');
        ctx.cancel=true;
        return false;
      }
      if(periodMode==='month'){
        var monthly;
        try{monthly=monthlyPanel(m);}catch(e){monthly={period:'月次データを取得できません',summary:[],good:[],caution:['月次レビューに必要なデータを取得できません。'],checks:[]};}
        heading('今月の'+monthlyThemeLabel(m==='daily'?'dashboard':m));
        var monthlyPeriod=document.getElementById('aiAnalysisPeriod');if(monthlyPeriod)monthlyPeriod.textContent=monthly.period;
        append('aiAnalysisSummary',monthly.summary,'今月のデータが不足しています。');
        append('aiAnalysisGood',monthly.good,'今月の改善・機会は確認されていません。');
        append('aiAnalysisCaution',monthly.caution,'今月の重要な注意点は確認されていません。');
        append('aiAnalysisChecks',monthly.checks,'月次データを確認してください。');
        ctx.cancel=true;
        return false;
      }
      if(m==='dashboard'){heading('今月の要点');return;}
      var p;
      try{p=build(m);}catch(e){p={period:'対象データを取得できません',summary:[],good:[],caution:['データ不足のため分析できません。対象期間の入力を確認してください。'],checks:[]};}
      heading(m==='daily'?'選択日の要点':'対象期間の要点');
      var period=document.getElementById('aiAnalysisPeriod');if(period)period.textContent=p.period;
      append('aiAnalysisSummary',p.summary,'この対象のデータが不足しています。');
      append('aiAnalysisGood',p.good,'改善を判断できる比較結果はありません。');
      append('aiAnalysisCaution',p.caution,'入力済みデータから追加の注意点は確認できません。');
      append('aiAnalysisChecks',p.checks,'対象期間の入力データを確認してください。');
      ctx.cancel=true;
      return false;
    },1);

    root.InsightHooks.on('ai:question:before','page-ai-week-question',function(ctx){
      var m=mode();
      if(analysisPeriod(m)!=='week')return;
      var q=String(ctx.args[0]||'').trim();
      if(!q){ctx.result='質問を入力してください。';ctx.cancel=true;return false;}
      try{ctx.result=weeklyQuestionAnswer(q,m);}
      catch(e){ctx.result='週次レビューに必要なデータを取得できません。';}
      ctx.cancel=true;
      return false;
    },1);

    root.InsightHooks.on('ai:question:before','page-ai-month-question',function(ctx){
      var m=mode();
      if(analysisPeriod(m)!=='month')return;
      var q=String(ctx.args[0]||'').trim();
      if(!q){ctx.result='質問を入力してください。';ctx.cancel=true;return false;}
      try{ctx.result=monthlyQuestionAnswer(q,m);}
      catch(e){ctx.result='月次レビューに必要なデータを取得できません。';}
      ctx.cancel=true;
      return false;
    },1);
  }
  root.InsightAIPageComments={mode:mode,analysisPeriod:analysisPeriod,build:build,weeklyPanel:weeklyPanel,monthlyPanel:monthlyPanel};
  if(document.readyState==='complete')install();else root.addEventListener('load',install,{once:true});
})(window);
