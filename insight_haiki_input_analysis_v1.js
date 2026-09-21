/* 廃棄入力専用：既存の廃棄内訳と廃棄分析を追加。既存の入力・集計・保存には介入しない。 */
(function(){
  'use strict';
  var chart=null, mode='amount', queued=false;
  var style=document.createElement('style');
  style.id='haikiInsightStyle';
  style.textContent='\
#pageHaiki .haiki-insight-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-bottom:10px;min-height:0;flex-shrink:0;}\
#pageHaiki .haiki-insight-card{box-sizing:border-box;margin:0;min-width:0;min-height:0;overflow:hidden;padding:9px 12px;display:flex;flex-direction:column;}\
#pageHaiki .haiki-insight-header{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-shrink:0;margin-bottom:4px;}\
#pageHaiki .haiki-insight-month{font-size:10px;color:var(--text4);white-space:nowrap;}\
#pageHaiki .haiki-insight-toggle{display:flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;flex-shrink:0;}\
#pageHaiki .haiki-insight-toggle button{font-family:inherit;font-size:10px;font-weight:700;border:0;padding:4px 9px;cursor:pointer;background:var(--surface);color:var(--text4);}\
#pageHaiki .haiki-insight-toggle button.active{background:var(--text);color:var(--surface);}\
#pageHaiki .haiki-insight-donut{display:flex;flex-direction:row;align-items:center;gap:10px;flex:1;min-height:0;overflow:hidden;}\
#pageHaiki .haiki-insight-chart{position:relative;flex:0 0 auto;width:min(104px,32%);height:min(104px,100%);}\
#pageHaiki .haiki-insight-list{flex:1;min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;}\
#pageHaiki .haiki-insight-list .donut-leg{font-size:10px;padding:3px 0;gap:0;}\
#pageHaiki .haiki-insight-list .donut-dot{width:8px;height:8px;margin-right:5px;}\
#pageHaiki .haiki-insight-list .donut-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\
#pageHaiki .haiki-insight-list .donut-val{font-size:10px;flex-shrink:0;}\
#pageHaiki .haiki-insight-total{display:flex;justify-content:space-between;gap:4px;padding:2px 0 4px;margin-bottom:1px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;}\
#pageHaiki .haiki-insight-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;flex-shrink:0;}\
#pageHaiki .haiki-insight-kpi{padding:4px 6px;background:var(--input-bg);border-radius:7px;min-width:0;}\
#pageHaiki .haiki-insight-kpi-label{font-size:10px;color:var(--text3);white-space:nowrap;}\
#pageHaiki .haiki-insight-kpi-value{font-size:15px;line-height:1.3;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\
#pageHaiki .haiki-insight-kpi-value.negative{color:#b91c1c;}\
#pageHaiki .haiki-insight-ranks{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;flex:1;min-height:0;margin-top:5px;}\
#pageHaiki .haiki-insight-rank{min-width:0;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:7px;padding:4px 6px;display:flex;flex-direction:column;}\
#pageHaiki .haiki-insight-rank-title{font-size:10px;font-weight:700;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\
#pageHaiki .haiki-insight-rank-list{min-height:0;overflow-y:auto;scrollbar-width:thin;}\
#pageHaiki .haiki-insight-rank-item{display:flex;justify-content:space-between;gap:3px;border-bottom:1px solid var(--border2);padding:2px 0;font-size:10px;}\
#pageHaiki .haiki-insight-rank-item:last-child{border:0;}\
#pageHaiki .haiki-insight-rank-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\
#pageHaiki .haiki-insight-rank-value{flex-shrink:0;font-weight:700;white-space:nowrap;}\
#pageHaiki .haiki-insight-empty{color:var(--text4);font-size:10px;padding:6px 0;}\
@media(max-width:720px){#pageHaiki .haiki-insight-row{grid-template-columns:minmax(0,1fr);height:auto!important;}#pageHaiki .haiki-insight-card{height:170px;}#pageHaiki .haiki-insight-chart{width:100px;height:100px;}}';
  document.head.appendChild(style);
  function n(value){var v=Number(value);return Number.isFinite(v)&&v>0?v:0;}
  function yen(value){return '¥'+Math.round(value).toLocaleString();}
  function monthRows(year,month){return store&&store.data&&store.data[year]&&store.data[year][month]||[];}
  function sumCats(rows,limit){
    var totals=HAIKI_CATS.map(function(){return 0;});
    (limit?rows.slice(0,limit):rows).forEach(function(row){
      if(!row)return;
      HAIKI_CATS.forEach(function(name,i){totals[i]+=n(row.haiki&&row.haiki[name]);});
    });
    return totals;
  }
  function totalsData(){
    var y=String(editYear.haiki||''),m=editMonth.haiki;
    var current=typeof todayFY==='function'?todayFY():null;
    var limit=current&&y===String(current.fy)&&m===current.month?current.day:null;
    var rows=Array.isArray(drafts.haiki)?drafts.haiki:monthRows(y,m);
    var values=sumCats(rows,limit),total=values.reduce(function(a,b){return a+b;},0);
    var previous=String(Number(y)-1);
    var hasPrior=!!(store.years&&store.years.some(function(v){return String(v)===previous;}));
    var prevRows=hasPrior?monthRows(previous,m):[];
    var prior=hasPrior?sumCats(prevRows,limit):null;
    var priorTotal=prior?prior.reduce(function(a,b){return a+b;},0):0;
    var sales=(limit?monthRows(y,m).slice(0,limit):monthRows(y,m)).reduce(function(a,r){return a+n(r&&r['売上'])*1000;},0);
    return {year:y,month:m,values:values,total:total,prior:prior,priorTotal:priorTotal,sales:sales};
  }
  function setup(){
    var page=document.getElementById('pageHaiki'),top=document.getElementById('haikiChartCard');
    if(!page||!top)return false;
    var row=document.getElementById('haikiInsightRow');
    if(!row){
      var anchor=top.parentElement;
      row=document.createElement('div');row.id='haikiInsightRow';row.className='haiki-insight-row';
      row.innerHTML='<section class="haiki-chart-card haiki-insight-card" aria-label="廃棄内訳">'+
        '<div class="haiki-insight-header"><div><div class="haiki-chart-title">廃棄内訳</div><div class="haiki-insight-month" id="haikiInsightMonth"></div></div>'+
        '<div class="haiki-insight-toggle"><button type="button" id="haikiInsightAmount" class="active">金額</button><button type="button" id="haikiInsightPercent">割合</button></div></div>'+
        '<div class="haiki-insight-donut"><div class="haiki-insight-chart"><canvas id="haikiInsightCanvas"></canvas></div><div class="donut-legends haiki-insight-list" id="haikiInsightLegends"></div></div></section>'+
        '<section class="haiki-chart-card haiki-insight-card" aria-label="廃棄分析">'+
        '<div class="haiki-insight-header"><div class="haiki-chart-title">廃棄分析</div><div class="haiki-insight-month" id="haikiInsightAnalysisMonth"></div></div>'+
        '<div class="haiki-insight-kpis" id="haikiInsightKpis"></div>'+
        '<div class="haiki-insight-ranks"><div class="haiki-insight-rank"><div class="haiki-insight-rank-title">構成比カテゴリ上位3項目</div><div class="haiki-insight-rank-list" id="haikiInsightTop"></div></div>'+
        '<div class="haiki-insight-rank"><div class="haiki-insight-rank-title">前年比増カテゴリ3項目</div><div class="haiki-insight-rank-list" id="haikiInsightIncrease"></div></div></div></section>';
      anchor.insertAdjacentElement('afterend',row);
      function change(next){mode=next;render();}
      document.getElementById('haikiInsightAmount').addEventListener('click',function(){change('amount');});
      document.getElementById('haikiInsightPercent').addEventListener('click',function(){change('percent');});
    }
    var height=Math.round(top.getBoundingClientRect().height);
    if(height>0)row.style.height=height+'px';
    return true;
  }
  function render(){
    queued=false;
    if(!setup())return;
    var data=totalsData(),total=data.total;
    document.getElementById('haikiInsightMonth').textContent=data.month+' 月合計';
    document.getElementById('haikiInsightAnalysisMonth').textContent=data.month+'実績';
    ['amount','percent'].forEach(function(v){
      var button=document.getElementById(v==='amount'?'haikiInsightAmount':'haikiInsightPercent');
      button.classList.toggle('active',mode===v);
      button.setAttribute('aria-pressed',String(mode===v));
    });
    var canvas=document.getElementById('haikiInsightCanvas');
    if(typeof Chart==='function' && canvas){
      if(chart){chart.destroy();chart=null;}
      chart=new Chart(canvas,{type:'doughnut',
        data:{labels:HAIKI_CATS,datasets:[{data:data.values,backgroundColor:HAIKI_COLORS,borderColor:'#fff',borderWidth:2,hoverOffset:4}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'68%',animation:{duration:300},
          plugins:{legend:{display:false},tooltip:{backgroundColor:'#fff',titleColor:'#111',bodyColor:'#666',borderColor:'#e8e8e8',borderWidth:1,padding:7,
            callbacks:{label:function(c){return c.label+': '+yen(c.parsed)+' ('+(total>0?(c.parsed/total*100).toFixed(1):0)+'%)';}}}}}});
    }
    var legends=document.getElementById('haikiInsightLegends');legends.replaceChildren();
    if(total>0){
      var tr=document.createElement('div');tr.className='haiki-insight-total';
      var tl=document.createElement('span');tl.textContent='合計';var tv=document.createElement('span');tv.textContent=yen(total);
      tr.append(tl,tv);legends.appendChild(tr);
      HAIKI_CATS.forEach(function(name,i){
        if(data.values[i]===0)return;
        var item=document.createElement('div');item.className='donut-leg';
        var dot=document.createElement('span');dot.className='donut-dot';dot.style.background=HAIKI_COLORS[i];
        var label=document.createElement('span');label.className='donut-name';label.textContent=name;
        var value=document.createElement('span');value.className='donut-val';
        value.textContent=mode==='amount'?yen(data.values[i]):(100*data.values[i]/total).toFixed(1)+'%';
        item.append(dot,label,value);legends.appendChild(item);
      });
    }else{var empty=document.createElement('div');empty.className='haiki-insight-empty';empty.textContent='データなし';legends.appendChild(empty);}
    var hasPrior=data.priorTotal>0;
    var rate=data.sales>0?(total/data.sales*100).toFixed(2)+'%':'—';
    var yoy=hasPrior?((total/data.priorTotal-1)*100):null;
    var yoyText=yoy==null?'比較データなし':(yoy>0?'+':'')+yoy.toFixed(1)+'%';
    var kpis=document.getElementById('haikiInsightKpis');kpis.replaceChildren();
    [['廃棄額',yen(total)],['廃棄率',rate],['前年比',yoyText]].forEach(function(pair,i){
      var card=document.createElement('div');card.className='haiki-insight-kpi';
      var title=document.createElement('div');title.className='haiki-insight-kpi-label';title.textContent=pair[0];
      var value=document.createElement('div');value.className='haiki-insight-kpi-value';value.textContent=pair[1];
      if(i===2&&yoy!=null&&yoy>0)value.classList.add('negative');
      card.append(title,value);kpis.appendChild(card);
    });
    function fillList(id,entries,formatter,emptyText){
      var list=document.getElementById(id);list.replaceChildren();
      if(!entries.length){var none=document.createElement('div');none.className='haiki-insight-empty';none.textContent=emptyText;list.appendChild(none);return;}
      entries.slice(0,3).forEach(function(entry,rank){
        var item=document.createElement('div');item.className='haiki-insight-rank-item';
        var name=document.createElement('span');name.className='haiki-insight-rank-name';name.textContent=(rank+1)+'. '+entry.name;
        var value=document.createElement('span');value.className='haiki-insight-rank-value';value.textContent=formatter(entry);
        item.append(name,value);list.appendChild(item);
      });
    }
    var top=HAIKI_CATS.map(function(name,i){return {name:name,amount:data.values[i],index:i};})
      .filter(function(v){return v.amount>0;}).sort(function(a,b){return b.amount-a.amount||a.index-b.index;});
    fillList('haikiInsightTop',top,function(v){return (v.amount/total*100).toFixed(1)+'%';},'データなし');
    var increases=hasPrior?HAIKI_CATS.map(function(name,i){return {name:name,amount:data.values[i],prior:data.prior[i],index:i,delta:data.values[i]-data.prior[i]};})
      .filter(function(v){return v.delta>0;}).sort(function(a,b){return b.delta-a.delta||a.index-b.index;}):[];
    fillList('haikiInsightIncrease',increases,function(v){return v.prior>0?'+'+(v.delta/v.prior*100).toFixed(1)+'%':'新規 '+yen(v.delta);},hasPrior?'増加項目なし':'比較データなし');
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(render);}
  var originalRenderTable=window.renderTable;
  if(typeof originalRenderTable==='function'){
    window.renderTable=function(type){
      var result=originalRenderTable.apply(this,arguments);
      if(type==='haiki')schedule();
      return result;
    };
  }
  var form=document.getElementById('haikiForm');
  if(form){
    form.addEventListener('input',schedule);
    form.addEventListener('change',schedule);
    form.addEventListener('focusout',schedule);
  }
  if(document.getElementById('pageHaiki') && document.getElementById('pageHaiki').classList.contains('show'))schedule();
})();
