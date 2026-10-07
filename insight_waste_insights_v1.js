/* 廃棄入力ページ専用。既存データとダッシュボードの廃棄カテゴリ・配色を共用する。 */
(function(){
  'use strict';
  if(window.__insightWasteInsightsV1)return;
  window.__insightWasteInsightsV1=true;
  var chart=null,mode='amount',rankTab='share';

  function number(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function yen(v){return '¥'+Math.round(v).toLocaleString('ja-JP');}
  function cats(){return typeof HAIKI_CATS==='undefined'?[]:HAIKI_CATS;}
  function colors(){return typeof HAIKI_COLORS==='undefined'?[]:HAIKI_COLORS;}
  function sums(rows){
    var totals=cats().map(function(){return 0;});
    (rows||[]).forEach(function(row){cats().forEach(function(cat,i){totals[i]+=number(row&&row.haiki&&row.haiki[cat]);});});
    return totals;
  }
  window.InsightWasteInsights={sumCategories:sums};

  function context(){
    var year=String(editYear.haiki||''),month=editMonth.haiki||'',previousYear=String(Number(year)-1);
    var rows=store.data&&store.data[year]&&store.data[year][month]||[];
    var prevRows=store.data&&store.data[previousYear]&&store.data[previousYear][month]||null;
    var throughDay=null;
    if(typeof todayFY==='function'){
      var t=todayFY();if(String(t.fy)===year&&t.month===month)throughDay=t.day;
    }
    function kpi(y){return window.KPIEngine&&window.KPIEngine.getPeriod?window.KPIEngine.getPeriod(y,month,throughDay):null;}
    return {year:year,month:month,values:sums(rows),previousYear:previousYear,
      current:kpi(year),previous:prevRows? kpi(previousYear):null,
      compareCurrent:sums(throughDay==null?rows:rows.slice(0,throughDay)),
      comparePrevious:prevRows?sums(throughDay==null?prevRows:prevRows.slice(0,throughDay)):null,
      throughDay:throughDay};
  }
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function legend(c){
    var root=document.getElementById('iwcLegend');if(!root)return;
    root.replaceChildren();var total=c.values.reduce(function(a,b){return a+b;},0);
    if(!total){root.appendChild(el('div','iwc-empty','データなし'));return;}
    var header=el('div','iwc-total');header.append(el('span','','合計'),el('strong','',yen(total)));root.appendChild(header);
    cats().forEach(function(cat,i){
      if(c.values[i]===0)return;
      var line=el('div','donut-leg'),dot=el('span','donut-dot iwc-donut-color-'+(i%8));
      var name=el('span','donut-name',cat);name.title=cat;
      var value=el('span','donut-val',mode==='amount'?yen(c.values[i]):(c.values[i]/total*100).toFixed(1)+'%');
      line.append(dot,name,value);root.appendChild(line);
    });
  }
  function graph(c){
    var canvas=document.getElementById('iwcDonut');if(!canvas||typeof Chart==='undefined')return;
    if(chart){chart.destroy();chart=null;}
    chart=new Chart(canvas,{type:'doughnut',
      data:{labels:cats(),datasets:[{data:c.values,backgroundColor:colors(),borderColor:'#fff',borderWidth:2,hoverOffset:4}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'68%',animation:{duration:300,animateRotate:true,animateScale:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#fff',titleColor:'#111',bodyColor:'#666',borderColor:'#e8e8e8',borderWidth:1,padding:7,
        callbacks:{label:function(t){var total=t.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);return t.label+': '+yen(t.parsed)+' ('+(total?t.parsed/total*100:0).toFixed(1)+'%)';}}}}}
    });
  }
  function text(id,value,cls){var n=document.getElementById(id);if(!n)return;n.textContent=value;n.classList.remove('up','down');if(cls)n.classList.add(cls);}
  function ranks(id,items,format,empty){
    var root=document.getElementById(id);if(!root)return;root.replaceChildren();
    if(!items.length){root.appendChild(el('div','iwc-empty',empty));return;}
    items.slice(0,3).forEach(function(item,i){
      var line=el('div','iwc-rank-line');var name=el('span','iwc-rank-name',(i+1)+'. '+item.name);name.title=item.name;
      var value=el('span','iwc-rank-value'+(item.increase?' up':''),format(item));
      if(item.increase)value.appendChild(el('span','iwc-increase-percent',' ('+item.displayPercent+')'));
      if(item.title)value.title=item.title;
      line.append(name,value);root.appendChild(line);
    });
  }
  function analysis(c){
    var total=c.values.reduce(function(a,b){return a+b;},0),now=c.current,amount=now?number(now.wasteYen):total;
    text('iwcWasteAmount',yen(amount));
    text('iwcWasteRate',now&&number(now.salesYen)>0?(amount/now.salesYen*100).toFixed(1)+'%':'—');
    var prevOK=!!(c.previous&&c.previous.inputDays>0),curOK=!!(now&&now.inputDays>0);
    var prev=prevOK?number(c.previous.wasteYen):0;
    var yoy=prevOK&&curOK&&prev>0?(amount-prev)/prev*100:null;
    text('iwcWasteYoy',yoy==null?'—':(yoy>0?'+':'')+yoy.toFixed(1)+'%',yoy>0?'up':yoy<0?'down':'');
    var note=c.throughDay!=null?'前年同月'+c.throughDay+'日までと比較':'前年同月比';
    if(!prevOK)note='前年の比較データなし';else if(prev===0)note='前年廃棄額0円：前年比算出不可';
    var subtitle=document.getElementById('iwcAnalysisSub');if(subtitle)subtitle.textContent=note;
    var leaders=cats().map(function(name,i){return {name:name,index:i,value:c.values[i]};})
      .filter(function(item){return item.value>0;}).sort(function(a,b){return b.value-a.value||a.index-b.index;});
    ranks('iwcShare',leaders,function(item){return (item.value/total*100).toFixed(1)+'%';},'データなし');
    var rising=[];
    if(prevOK&&curOK){rising=cats().map(function(name,i){
      var cur=c.compareCurrent[i],old=c.comparePrevious[i],diff=cur-old;
      return {name:name,index:i,increase:true,diff:diff,
        title:'前年 '+yen(old)+' → 今年 '+yen(cur)+' / 増加額 '+yen(diff)+(old>0?' / 増加率 +'+(diff/old*100).toFixed(1)+'%':' / 前年0円：増加率算出不可'),
        displayAmount:'+'+yen(diff),displayPercent:old>0?'+'+(diff/old*100).toFixed(1)+'%':'前年0円'};
    }).filter(function(item){return item.diff>0;}).sort(function(a,b){return b.diff-a.diff||a.index-b.index;});}
    ranks('iwcIncrease',rising,function(item){return item.displayAmount;},prevOK?(curOK?'増加カテゴリなし':'当年データなし'):'前年の比較データなし');
  }
  function syncHeight(){
    var bar=document.getElementById('haikiChartCard'),row=document.getElementById('iwcRow');if(!bar||!row)return;
    var height=bar.getBoundingClientRect().height;
    row.classList.toggle('iwc-height-tall',height>=198);
    if(chart)chart.resize();
  }
  function mount(){
    var page=document.getElementById('pageHaiki'),form=page&&page.querySelector('.table-card');if(!form)return false;
    if(document.getElementById('iwcRow'))return true;
    var row=el('div');row.id='iwcRow';
    row.innerHTML=`<section class="iwc-card" aria-label="廃棄内訳"><div class="iwc-head"><div><div class="iwc-title">廃棄内訳</div><div class="iwc-sub" id="iwcMonth">月合計（保存済み）</div></div><div class="iwc-switch"><button type="button" data-iwc-mode="amount" class="active">金額</button><button type="button" data-iwc-mode="percent">割合</button></div></div><div class="iwc-donut-inner"><div class="iwc-donut-wrap"><canvas id="iwcDonut" role="img" aria-label="カテゴリ別廃棄内訳"></canvas></div><div id="iwcLegend" class="iwc-legends"></div></div></section>
    <section class="iwc-card" aria-label="廃棄分析"><div class="iwc-head"><div class="iwc-title">廃棄分析</div><div class="iwc-sub" id="iwcAnalysisSub"></div></div><div class="iwc-kpis"><div class="iwc-kpi"><div class="iwc-kpi-label">廃棄額</div><div id="iwcWasteAmount" class="iwc-kpi-value">—</div></div><div class="iwc-kpi"><div class="iwc-kpi-label">廃棄率</div><div id="iwcWasteRate" class="iwc-kpi-value">—</div></div><div class="iwc-kpi"><div class="iwc-kpi-label">前年比</div><div id="iwcWasteYoy" class="iwc-kpi-value">—</div></div></div><div class="iwc-rank-grid"><div class="iwc-rank-tabs" role="tablist" aria-label="廃棄カテゴリのランキング"><button type="button" id="iwcShareTab" data-iwc-rank-tab="share" role="tab" aria-selected="true" aria-controls="iwcSharePanel" class="active">構成比 上位3</button><button type="button" id="iwcIncreaseTab" data-iwc-rank-tab="increase" role="tab" aria-selected="false" aria-controls="iwcIncreasePanel">廃棄額増加 上位3</button></div><div class="iwc-rank" id="iwcSharePanel" data-iwc-rank-panel="share" role="tabpanel" aria-labelledby="iwcShareTab"><div class="iwc-rank-title">構成比カテゴリ上位3項目</div><div id="iwcShare" class="iwc-rank-lines"></div></div><div class="iwc-rank" id="iwcIncreasePanel" data-iwc-rank-panel="increase" role="tabpanel" aria-labelledby="iwcIncreaseTab" hidden><div id="iwcIncrease" class="iwc-rank-lines"></div></div></div></section>`;
    form.parentNode.insertBefore(row,form);
    row.querySelectorAll('[data-iwc-mode]').forEach(function(button){button.addEventListener('click',function(){
      mode=button.dataset.iwcMode;
      row.querySelectorAll('[data-iwc-mode]').forEach(function(other){other.classList.toggle('active',other===button);});
      if(typeof editYear!=='undefined'&&editYear.haiki)legend(context());
    });});
    row.querySelectorAll('[data-iwc-rank-tab]').forEach(function(button){button.addEventListener('click',function(){
      rankTab=button.dataset.iwcRankTab;
      row.querySelectorAll('[data-iwc-rank-tab]').forEach(function(other){
        var active=other===button;other.classList.toggle('active',active);other.setAttribute('aria-selected',String(active));
      });
      row.querySelectorAll('[data-iwc-rank-panel]').forEach(function(panel){panel.hidden=panel.dataset.iwcRankPanel!==rankTab;});
    });});
    var bar=document.getElementById('haikiChartCard');if(bar&&typeof ResizeObserver!=='undefined')new ResizeObserver(syncHeight).observe(bar);
    return true;
  }
  function refresh(){
    if(typeof store==='undefined'||typeof editYear==='undefined'||!editYear.haiki||!editMonth.haiki||!mount())return;
    var data=context(),subtitle=document.getElementById('iwcMonth');if(subtitle)subtitle.textContent=data.month+' 月合計（保存済み）';
    legend(data);analysis(data);
    requestAnimationFrame(function(){syncHeight();graph(data);});
  }
  if(window.InsightHooks){
    window.InsightHooks.on('input:table:after','waste-insights-table',function(ctx){if(ctx.args[0]==='haiki')refresh();},40);
    window.InsightHooks.on('input:save:after','waste-insights-save',function(ctx){if(ctx.args[0]==='haiki')refresh();},40);
  }
  if(typeof currentNav!=='undefined'&&currentNav===4)refresh();
})();