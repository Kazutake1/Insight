(function(){
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
  function yen(v){return '¥'+Math.round(num(v)).toLocaleString();}
  function pct(v){return num(v).toFixed(1)+'%';}
  function signedPct(v){var n=num(v);return (n>0?'+':'')+n.toFixed(1)+'%';}
  function signedPt(v){var n=num(v);return (n>0?'+':'')+n.toFixed(1)+'pt';}
  function getContext(){
    var year=typeof baseYear!=='undefined'?baseYear:null;
    var month=typeof selMonth==='string'?selMonth:'';
    var prevYear=typeof cmpYear!=='undefined'?cmpYear:null;
    var throughDay=null;
    try{if(typeof getAIAnalysisThroughDay==='function'&&year!=null&&month)throughDay=getAIAnalysisThroughDay(year,month);}catch(e){}
    return {year:year,month:month,prevYear:prevYear,throughDay:throughDay};
  }
  function isCompletedMonth(year,month){
    try{
      if(typeof todayFY!=='function')return false;
      var t=todayFY();
      var y=Number(year),ty=Number(t&&t.fy);
      var mi=typeof MONTHS!=='undefined'&&Array.isArray(MONTHS)?MONTHS.indexOf(month):-1;
      if(!Number.isFinite(y)||!Number.isFinite(ty)||mi<0||!t||typeof t.mIdx!=='number')return false;
      return y<ty||(y===ty&&mi<t.mIdx);
    }catch(e){return false;}
  }
  function getMonthlyOps(year,month){
    try{
      if(typeof store==='undefined'||!store||!store.monthlyOps)return null;
      var y=store.monthlyOps[String(year)];
      return y&&y[month]?y[month]:null;
    }catch(e){return null;}
  }
  function getRows(year,month,throughDay){
    var rows=[];
    try{
      if(typeof store!=='undefined'&&store&&store.data&&store.data[year]&&Array.isArray(store.data[year][month]))rows=store.data[year][month];
    }catch(e){}
    var limit=throughDay?Math.min(Number(throughDay)||0,rows.length):rows.length;
    return rows.slice(0,limit||rows.length);
  }
  function getCurrentKPI(a){
    try{
      if(window.KPIEngine&&typeof window.KPIEngine.getPeriod==='function')return window.KPIEngine.getPeriod(a.context.year,a.context.month,a.context.throughDay);
    }catch(e){}
    return null;
  }
  function getSalesYen(year,month,throughDay,rows){
    try{
      if(window.KPIEngine&&typeof window.KPIEngine.getPeriod==='function'){
        var k=window.KPIEngine.getPeriod(year,month,throughDay);
        if(k&&num(k.salesYen)>0)return num(k.salesYen);
      }
    }catch(e){}
    return (rows||[]).reduce(function(sum,row){return sum+num(row&&row['売上'])*1000;},0);
  }
  function statusSummary(rows){
    var out={recorded:0,none:0,few:0,many:0,manyDays:[],memos:[]};
    (rows||[]).forEach(function(row,index){
      if(!row)return;
      var day=num(row['日'])||index+1;
      var s=String(row.stockout||'');
      if(s==='なし'||s==='少ない'||s==='多い'){
        out.recorded++;
        if(s==='なし')out.none++;
        if(s==='少ない')out.few++;
        if(s==='多い'){out.many++;out.manyDays.push(day);}
      }
      var memo=String(row.storeMemo||'').trim();
      if(memo)out.memos.push({day:day,text:memo});
    });
    return out;
  }
  function buildAnalysis(){
    var c=getContext();
    var rows=getRows(c.year,c.month,c.throughDay);
    var prevRows=c.prevYear!=null?getRows(c.prevYear,c.month,c.throughDay):[];
    var ops=getMonthlyOps(c.year,c.month);
    var prevOps=c.prevYear!=null?getMonthlyOps(c.prevYear,c.month):null;
    var sales=getSalesYen(c.year,c.month,c.throughDay,rows);
    var prevSales=c.prevYear!=null?getSalesYen(c.prevYear,c.month,c.throughDay,prevRows):0;
    var labor=ops?num(ops.laborCostYen):0;
    var prevLabor=prevOps?num(prevOps.laborCostYen):0;
    var gm=ops?num(ops.grossMarginRate):0;
    var prevGm=prevOps?num(prevOps.grossMarginRate):0;
    var completed=isCompletedMonth(c.year,c.month);
    var laborRate=completed&&labor>0&&sales>0?labor/sales*100:null;
    var prevLaborRate=completed&&prevLabor>0&&prevSales>0?prevLabor/prevSales*100:null;
    return {
      context:c,completed:completed,rows:rows,prevRows:prevRows,ops:ops,prevOps:prevOps,sales:sales,prevSales:prevSales,
      labor:labor,prevLabor:prevLabor,laborRate:laborRate,prevLaborRate:prevLaborRate,
      laborCostChange:completed&&prevLabor>0&&labor>0?(labor-prevLabor)/prevLabor*100:null,
      laborRatePoint:laborRate!=null&&prevLaborRate!=null?laborRate-prevLaborRate:null,
      grossMarginRate:gm,prevGrossMarginRate:prevGm,grossMarginPoint:completed&&gm>0&&prevGm>0?gm-prevGm:null,
      status:statusSummary(rows),prevStatus:statusSummary(prevRows)
    };
  }
  function addLine(el,text,empty){
    if(!el||!text)return;
    var p=document.createElement('p');
    p.className=empty?'ai-analysis-empty':'ai-analysis-comment';
    p.textContent=text;
    el.appendChild(p);
  }
  function removeExact(el,text){
    if(!el)return;
    Array.prototype.slice.call(el.querySelectorAll('p')).forEach(function(p){if(p.textContent===text)p.remove();});
  }
  function summaryLines(a){
    var out=[];
    if(a.completed&&a.labor>0){
      if(a.laborRate!=null)out.push('人件費は'+yen(a.labor)+'、人件費率は'+pct(a.laborRate)+'です。');
      else out.push('人件費は'+yen(a.labor)+'入力されています。');
    }
    if(a.completed&&a.grossMarginRate>0){
      var g='粗利率は'+pct(a.grossMarginRate);
      if(a.grossMarginPoint!=null)g+='、前年差'+signedPt(a.grossMarginPoint);
      out.push(g+'です。');
    }
    if(a.status.recorded>0)out.push('欠品記録は'+a.status.recorded+'日分で、「多い」'+a.status.many+'日、「少ない」'+a.status.few+'日です。');
    if(a.status.memos.length>0)out.push('店舗メモは'+a.status.memos.length+'件記録されています。');
    return out;
  }
  function goodLines(a){
    var out=[];
    if(a.laborRatePoint!=null&&a.laborRatePoint<0)out.push('人件費率は前年差'+signedPt(a.laborRatePoint)+'で低下しています。');
    if(a.grossMarginPoint!=null&&a.grossMarginPoint>0)out.push('粗利率は前年差'+signedPt(a.grossMarginPoint)+'で改善しています。');
    if(a.prevStatus.recorded>0&&a.status.recorded>0&&a.status.many<a.prevStatus.many)out.push('欠品「多い」の記録は前年同期間より'+(a.prevStatus.many-a.status.many)+'日減っています。');
    return out;
  }
  function cautionLines(a){
    var out=[];
    if(a.laborRatePoint!=null&&a.laborRatePoint>0)out.push('人件費率は前年差'+signedPt(a.laborRatePoint)+'で上昇しています。');
    if(a.grossMarginPoint!=null&&a.grossMarginPoint<0)out.push('粗利率は前年差'+signedPt(a.grossMarginPoint)+'で低下しています。');
    if(a.status.many>0){
      var s='欠品「多い」が'+a.status.many+'日記録されています。';
      if(a.prevStatus.recorded>0){
        var diff=a.status.many-a.prevStatus.many;
        if(diff!==0)s+=' 前年同期間比'+(diff>0?'+':'')+diff+'日です。';
      }
      out.push(s);
    }
    return out;
  }
  function checkLines(a){
    var out=[];
    if(a.laborRatePoint!=null&&a.laborRatePoint>0)out.push('人件費率の上昇について、人件費の増加と売上の変化のどちらの影響が大きいか確認してください。');
    if(a.grossMarginPoint!=null&&a.grossMarginPoint<0)out.push('粗利率低下の要因を確認してください。');
    if(a.status.manyDays.length>0)out.push('欠品「多い」の記録日（'+a.status.manyDays.join('日、')+'日）について、売上・客数との関係を確認してください。');
    if(a.status.memos.length>0){
      var memoText=a.status.memos.slice(0,3).map(function(m){var t=m.text.length>38?m.text.slice(0,38)+'…':m.text;return m.day+'日「'+t+'」';}).join(' / ');
      out.push('店舗メモ：'+memoText+(a.status.memos.length>3?' ほか'+(a.status.memos.length-3)+'件':'')+'。数値変化の背景確認に利用してください。');
    }
    return out;
  }
  function currentOnlyLines(a){
    var out=[];
    var k=getCurrentKPI(a);
    if(k){
      if(num(k.salesYen)>0)out.push('売上は'+yen(k.salesYen)+'です。');
      if(num(k.customers)>0)out.push('客数は'+Math.round(num(k.customers)).toLocaleString()+'人です。');
      if(num(k.customerUnitPrice)>0)out.push('客単価は'+yen(k.customerUnitPrice)+'です。');
      if(num(k.items)>0)out.push('買上点数は'+Math.round(num(k.items)).toLocaleString()+'点です。');
      if(num(k.wasteYen)>0)out.push('廃棄額は'+yen(k.wasteYen)+'です。');
      if(num(k.wasteRate)>0)out.push('廃棄率は'+pct(k.wasteRate)+'です。');
    }
    return out.concat(summaryLines(a));
  }
  function renderNoComparisonPanel(a){
    var period=document.getElementById('aiAnalysisPeriod');
    var summary=document.getElementById('aiAnalysisSummary');
    var good=document.getElementById('aiAnalysisGood');
    var caution=document.getElementById('aiAnalysisCaution');
    var checks=document.getElementById('aiAnalysisChecks');
    if(period)period.textContent=[a.context.year!=null?a.context.year+'年度':null,a.context.month||null,a.context.throughDay?a.context.throughDay+'日まで':null,'（前年比較なし）'].filter(Boolean).join(' ');
    [summary,good,caution,checks].forEach(function(el){if(el)el.innerHTML='';});
    var lines=currentOnlyLines(a);
    if(lines.length)lines.forEach(function(t){addLine(summary,t,false);});
    else addLine(summary,'この期間の入力済みデータはまだありません。',true);
    addLine(good,'前年比較なしのため、前年との差による改善判定は行っていません。',true);
    addLine(caution,'前年比較なしのため、前年との差による注意判定は行っていません。',true);
    var k=checkLines(a);
    if(k.length)k.forEach(function(t){addLine(checks,t,false);});
    else addLine(checks,'現在の入力データを確認してください。',true);
  }
  function integratePanel(){
    var a=buildAnalysis();
    var summary=document.getElementById('aiAnalysisSummary');
    var good=document.getElementById('aiAnalysisGood');
    var caution=document.getElementById('aiAnalysisCaution');
    var checks=document.getElementById('aiAnalysisChecks');
    var s=summaryLines(a),g=goodLines(a),c=cautionLines(a),k=checkLines(a);
    if(g.length)removeExact(good,'前年を上回る改善項目は現在の比較データからは確認できません。');
    if(c.length)removeExact(caution,'前年を下回る主要項目は現在の比較データからは確認できません。');
    if(k.length)removeExact(checks,'現在の比較結果を継続して確認してください。');
    s.forEach(function(t){addLine(summary,t,false);});
    g.forEach(function(t){addLine(good,t,false);});
    c.forEach(function(t){addLine(caution,t,false);});
    k.forEach(function(t){addLine(checks,t,false);});
  }
  function laborAnswer(a){
    if(!a.completed)return 'この月は未確定のため、人件費は月次未確定として経営評価から除外しています。入力値がある場合も、月終了後に正式評価します。';
    if(a.labor<=0)return 'この月の人件費はまだ入力されていません。';
    var out=['人件費は'+yen(a.labor)+'です。'];
    if(a.laborCostChange!=null)out.push('人件費額は前年比'+signedPct(a.laborCostChange)+'です。');
    if(a.laborRate!=null){
      out.push('人件費率は'+pct(a.laborRate)+'です。');
      if(a.laborRatePoint!=null)out.push('人件費率は前年差'+signedPt(a.laborRatePoint)+'です。');
    }
    return out.join('\n');
  }
  function grossMarginAnswer(a){
    if(!a.completed)return 'この月は未確定のため、粗利率は月次未確定として経営評価から除外しています。入力値がある場合も、月終了後に正式評価します。';
    if(a.grossMarginRate<=0)return 'この月の粗利率はまだ入力されていません。';
    var out=['粗利率は'+pct(a.grossMarginRate)+'です。'];
    if(a.grossMarginPoint!=null)out.push('前年差は'+signedPt(a.grossMarginPoint)+'です。');
    return out.join('\n');
  }
  function stockoutAnswer(a){
    if(a.status.recorded<=0)return 'この期間の欠品記録はまだありません。';
    var out=['欠品記録は'+a.status.recorded+'日分で、「多い」'+a.status.many+'日、「少ない」'+a.status.few+'日です。'];
    if(a.prevStatus.recorded>0)out.push('「多い」の記録は前年同期間'+a.prevStatus.many+'日に対して、今年は'+a.status.many+'日です。');
    if(a.status.manyDays.length)out.push('「多い」の記録日：'+a.status.manyDays.join('日、')+'日。');
    out.push('欠品が売上に与えた影響は、この記録だけでは断定できません。該当日の売上・客数と併せて確認してください。');
    return out.join('\n');
  }
  function memoAnswer(a){
    if(!a.status.memos.length)return 'この期間の店舗メモはまだありません。';
    var out=['店舗メモは'+a.status.memos.length+'件あります。'];
    a.status.memos.slice(0,5).forEach(function(m){out.push(m.day+'日：'+m.text);});
    if(a.status.memos.length>5)out.push('ほか'+(a.status.memos.length-5)+'件あります。');
    out.push('メモの内容と数値変化の因果関係は断定せず、該当日の売上・客数などと照合してください。');
    return out.join('\n');
  }
  function currentOnlyAnswer(q,a){
    var k=getCurrentKPI(a);
    if(/前年|去年|比較|前年差|前年比/.test(q))return '前年比較は「なし」に設定されています。現在のAIは前年データを使用していません。比較する場合は比較対象年度を選択してください。';
    if(!k){
      var fallback=currentOnlyLines(a);
      return fallback.length?fallback.join('\n'):'この期間の入力済みデータはまだありません。';
    }
    if(/廃棄|ロス/.test(q))return num(k.wasteYen)>0?'廃棄額は'+yen(k.wasteYen)+(num(k.wasteRate)>0?'、廃棄率は'+pct(k.wasteRate):'')+'です。':'この期間の廃棄データはまだありません。';
    if(/客数|来店/.test(q))return num(k.customers)>0?'客数は'+Math.round(num(k.customers)).toLocaleString()+'人です。':'この期間の客数データはまだありません。';
    if(/客単価/.test(q))return num(k.customerUnitPrice)>0?'客単価は'+yen(k.customerUnitPrice)+'です。':'この期間の客単価を計算できるデータがありません。';
    if(/買上|点数/.test(q))return num(k.items)>0?'買上点数は'+Math.round(num(k.items)).toLocaleString()+'点です。':'この期間の買上点数データはまだありません。';
    if(/売上/.test(q))return num(k.salesYen)>0?'売上は'+yen(k.salesYen)+'です。':'この期間の売上データはまだありません。';
    var lines=currentOnlyLines(a);
    if(lines.length)lines.push('前年比較は「なし」のため、前年比・前年差による評価は行っていません。');
    return lines.length?lines.join('\n'):'この期間の入力済みデータはまだありません。';
  }
  function extraByIntent(q,a){
    var lines=[];
    if(/良い|改善|伸び|上が/.test(q))lines=goodLines(a);
    else if(/問題|悪い|注意|課題|下が/.test(q))lines=cautionLines(a);
    else if(/確認|何を|見る|すべき/.test(q))lines=checkLines(a);
    else if(/前年|去年|比較|今月|全体|状況|どう/.test(q))lines=summaryLines(a);
    return lines;
  }
  var oldRender=window.renderAIAnalysisPanel;
  window.renderAIAnalysisPanel=function(){
    var a=buildAnalysis();
    if(a.context.prevYear==null){renderNoComparisonPanel(a);return;}
    if(typeof oldRender==='function')oldRender.apply(this,arguments);
    integratePanel();
  };
  var oldBuild=window.buildAIQuestionAnswer;
  window.buildAIQuestionAnswer=function(q){
    q=String(q||'').trim();
    if(!q)return '質問を入力してください。';
    var a=buildAnalysis();
    if(a.context.prevYear==null&&/前年|去年|比較|前年差|前年比/.test(q))return currentOnlyAnswer(q,a);
    if(/人件費|人件費率|労務費|労働コスト/.test(q))return laborAnswer(a);
    if(/粗利|荒利|利益率/.test(q))return grossMarginAnswer(a);
    if(/欠品|品切れ/.test(q))return stockoutAnswer(a);
    if(/店舗メモ|メモ|出来事|イベント|故障|大量注文/.test(q))return memoAnswer(a);
    if(a.context.prevYear==null)return currentOnlyAnswer(q,a);
    var base=typeof oldBuild==='function'?oldBuild(q):'';
    var extra=extraByIntent(q,a);
    if(extra.length)return (base?base+'\n\n':'')+'追加データ：\n'+extra.join('\n');
    return base||'現在入力されているデータの範囲で回答します。';
  };
  var help=document.querySelector('.ai-analysis-question-help');
  if(help)help.textContent='現在入力されているKPI・前年比較・廃棄・人件費・粗利率・欠品・店舗メモの範囲で回答します。';
  window.ManagementOpsAnalysis={getCurrent:buildAnalysis};
})();