/* 廃棄入力ページ専用。既存データとダッシュボードの廃棄カテゴリ・配色を共用する。 */
(function(){
  'use strict';
  if(window.__insightWasteInsightsV1)return;
  window.__insightWasteInsightsV1=true;
  var chart=null,mode='amount';
  var style=document.createElement('style');
  style.id='insightWasteInsightsStyle';
  style.textContent=`
    #iwcRow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px;flex-shrink:0;min-width:0;--iwc-height:148px;}
    #iwcRow .iwc-card{box-sizing:border-box;height:var(--iwc-height);min-width:0;min-height:0;overflow:hidden;background:var(--surface);border-radius:14px;padding:9px 12px;box-shadow:0 2px 10px rgba(0,0,0,.07);display:flex;flex-direction:column;}
    #iwcRow .iwc-head{display:flex;align-items:start;justify-content:space-between;gap:6px;flex:0 0 auto;margin-bottom:5px;}
    #iwcRow .iwc-title{font-size:12px;font-weight:750;color:var(--text);}
    #iwcRow .iwc-sub{font-size:9px;color:var(--text4);margin-top:2px;}
    #iwcRow .iwc-switch{display:flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;flex-shrink:0;}
    #iwcRow .iwc-switch button{border:0;padding:4px 8px;font:700 10px/1.1 -apple-system,BlinkMacSystemFont,sans-serif;font-family:inherit;cursor:pointer;background:var(--surface);color:var(--text4);}
    #iwcRow .iwc-switch button.active{background:var(--text);color:var(--surface);}
    #iwcRow .iwc-donut-inner{display:grid;grid-template-columns:minmax(90px,35%) minmax(0,1fr);gap:9px;align-items:center;flex:1;min-height:0;}
    #iwcRow .iwc-donut-wrap{position:relative;width:min(100%,110px);height:min(100%,110px);aspect-ratio:1;margin:auto;}
    #iwcRow .iwc-donut-wrap canvas{display:block;width:100%!important;height:100%!important;}
    #iwcRow .iwc-legends{height:100%;min-height:0;min-width:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}
    #iwcRow .iwc-legends .donut-leg{font-size:10px;padding:3px 0;}
    #iwcRow .iwc-legends .donut-dot{width:8px;height:8px;margin-right:5px;}
    #iwcRow .iwc-legends .donut-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    #iwcRow .iwc-legends .donut-val{white-space:nowrap;margin-left:4px;font-size:10px;}
    #iwcRow .iwc-total{display:flex;justify-content:space-between;align-items:center;padding:2px 0 4px;border-bottom:2px solid var(--border);font-size:10px;font-weight:750;color:var(--text3);}
    #iwcRow .iwc-total strong{color:#b91c1c;font-size:11px;}
    #iwcRow .iwc-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:6px;flex:0 0 auto;}
    #iwcRow .iwc-kpi{border:1px solid var(--border);border-radius:8px;padding:5px 7px;min-width:0;}
    #iwcRow .iwc-kpi-label{font-size:9px;font-weight:700;color:var(--text3);}
    #iwcRow .iwc-kpi-value{font-size:15px;font-weight:800;white-space:nowrap;color:var(--text);line-height:1.35;}
    #iwcRow .iwc-kpi-value.up{color:#b91c1c;}#iwcRow .iwc-kpi-value.down{color:#15803d;}
    #iwcRow .iwc-rank-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;flex:1;min-height:0;}
    #iwcRow .iwc-rank{min-width:0;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:8px;padding:4px 6px;}
    #iwcRow .iwc-rank-title{font-size:9px;font-weight:750;white-space:nowrap;color:var(--text);margin-bottom:2px;}
    #iwcRow .iwc-rank-line{display:flex;align-items:center;gap:4px;justify-content:space-between;font-size:9px;line-height:1.25;min-width:0;padding:2px 0;border-top:1px solid var(--border2);}
    #iwcRow .iwc-rank-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text3);}
    #iwcRow .iwc-rank-value{flex-shrink:0;font-weight:750;color:var(--text);white-space:nowrap;}
    #iwcRow .iwc-rank-value.up{color:#b91c1c;}
    #iwcRow .iwc-empty{font-size:10px;color:var(--text4);padding:7px 2px;}
    @media(max-width:800px){#iwcRow{grid-template-columns:1fr;}#iwcRow .iwc-card{height:var(--iwc-height);}}
  `;
  document.head.appendChild(style);
  function number(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function yen(v){return '¥'+Math.round(v).toLocaleString('ja-JP');}
  function cats(){return typeof HAIKI_CATS==='undefined'?[]:HAIKI_CATS;}
  function colors(){return typeof HAIKI_COLORS==='undefined'?[]:HAIKI_COLORS;}
  function sums(rows){
    var totals=cats().map(function(){return 0;});
    (rows||[]).forEach(function(row){cats().forEach(function(cat,i){totals[i]+=number(row&&row.haiki&&row.haiki[cat]);});});
    return totals;
  }
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
      current:kpi(year),previous:prevRows?kpi(previousYear):null,
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
      var line=el('div','donut-leg'),dot=el('span','donut-dot');dot.style.background=colors()[i];
      var name=el('span','donut-name',cat);name.title=cat;
      var value=el('span','donut-val',mode==='amount'?yen(c.values[i]):(c.values[i]/total*100).toFixed(1)+'%');
      line.append(dot,name,value);root.appendChild(line);
    });
  }
  function graph(c){
    var canvas=document.getElementById('iwcDonut');if(!canvas||typeof Chart==='undefined')return;
    if(chart){chart.data.datasets[0].data=c.values;chart.update('none');return;}
    chart=new Chart(canvas,{type:'doughnut',
      data:{labels:cats(),datasets:[{data:c.values,backgroundColor:colors(),borderColor:'#fff',borderWidth:2,hoverOffset:4}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'68%',animation:{duration:300},plugins:{legend:{display:false},tooltip:{backgroundColor:'#fff',titleColor:'#111',bodyColor:'#666',borderColor:'#e8e8e8',borderWidth:1,padding:7,
        callbacks:{label:function(t){var total=t.chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);return t.label+': '+yen(t.parsed)+' ('+(total?t.parsed/total*100:0).toFixed(1)+'%)';}}}}}
    });
  }
  function text(id,value,cls){var n=document.getElementById(id);if(!n)return;n.textContent=value;n.classList.remove('up','down');if(cls)n.classList.add(cls);}
  function ranks(id,items,format,empty){
    var root=document.getElementById(id);if(!root)return;root.replaceChildren();
    if(!items.length){root.appendChild(el('div','iwc-empty',empty));return;}
    items.slice(0,3).forEach(function(item,i){
      var line=el('div','iwc-rank-line');var name=el('span','iwc-rank-name',(i+1)+'. '+item.name);name.title=item.name;
      var value=el('span','iwc-rank-value'+(item.increase?' up':''),format(item));if(item.title)value.title=item.title;
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
        title:'前年 '+yen(old)+' → 今年 '+yen(cur)+' / 増加額 '+yen(diff),
        display:'+'+yen(diff)};
    }).filter(function(item){return item.diff>0;}).sort(function(a,b){return b.diff-a.diff||a.index-b.index;});}
    ranks('iwcIncrease',rising,function(item){return item.display;},prevOK?(curOK?'増加カテゴリなし':'当年データなし'):'前年の比較データなし');
  }
  function syncHeight(){
    var bar=document.getElementById('haikiChartCard'),row=document.getElementById('iwcRow');if(!bar||!row)return;
    var height=bar.getBoundingClientRect().height;
    if(height>=110)row.style.setProperty('--iwc-height',Math.round(height)+'px');
    if(chart)chart.resize();
  }
  function mount(){
    var page=document.getElementById('pageHaiki'),form=page&&page.querySelector('.table-card');if(!form)return false;
    if(document.getElementById('iwcRow'))return true;
    var row=el('div');row.id='iwcRow';
    row.innerHTML=`<section class="iwc-card" aria-label="廃棄内訳"><div class="iwc-head"><div><div class="iwc-title">廃棄内訳</div><div class="iwc-sub" id="iwcMonth">月合計（保存済み）</div></div><div class="iwc-switch"><button type="button" data-iwc-mode="amount" class="active">金額</button><button type="button" data-iwc-mode="percent">割合</button></div></div><div class="iwc-donut-inner"><div class="iwc-donut-wrap"><canvas id="iwcDonut" role="img" aria-label="カテゴリ別廃棄内訳"></canvas></div><div id="iwcLegend" class="iwc-legends"></div></div></section>
    <section class="iwc-card" aria-label="廃棄分析"><div class="iwc-head"><div class="iwc-title">廃棄分析</div><div class="iwc-sub" id="iwcAnalysisSub"></div></div><div class="iwc-kpis"><div class="iwc-kpi"><div class="iwc-kpi-label">廃棄額</div><div id="iwcWasteAmount" class="iwc-kpi-value">—</div></div><div class="iwc-kpi"><div class="iwc-kpi-label">廃棄率</div><div id="iwcWasteRate" class="iwc-kpi-value">—</div></div><div class="iwc-kpi"><div class="iwc-kpi-label">前年比</div><div id="iwcWasteYoy" class="iwc-kpi-value">—</div></div></div><div class="iwc-rank-grid"><div class="iwc-rank"><div class="iwc-rank-title">構成比カテゴリ上位3項目</div><div id="iwcShare"></div></div><div class="iwc-rank"><div class="iwc-rank-title">廃棄額増加 上位3カテゴリ</div><div id="iwcIncrease"></div></div></div></section>`;
    form.parentNode.insertBefore(row,form);
    row.querySelectorAll('[data-iwc-mode]').forEach(function(button){button.addEventListener('click',function(){
      mode=button.dataset.iwcMode;
      row.querySelectorAll('[data-iwc-mode]').forEach(function(other){other.classList.toggle('active',other===button);});
      if(typeof editYear!=='undefined'&&editYear.haiki)legend(context());
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
  if(typeof window.renderTable==='function'){
    var oldRender=window.renderTable;
    window.renderTable=function(type){var result=oldRender.apply(this,arguments);if(type==='haiki')refresh();return result;};
  }
  if(typeof window.saveInput==='function'){
    var oldSave=window.saveInput;
    window.saveInput=function(type){var result=oldSave.apply(this,arguments);if(type==='haiki')refresh();return result;};
  }
  if(typeof currentNav!=='undefined'&&currentNav===4)refresh();
})();