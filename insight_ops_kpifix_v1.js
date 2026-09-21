(function(){
  var aiButtonStyle=document.getElementById('aiCircularButtonStyle');
  if(!aiButtonStyle){
    aiButtonStyle=document.createElement('style');
    aiButtonStyle.id='aiCircularButtonStyle';
    aiButtonStyle.textContent='.ai-analysis-toggle{width:64px!important;min-width:64px!important;max-width:64px!important;height:64px!important;padding:0 4px!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:0!important;text-align:center!important;white-space:normal!important;line-height:1.15!important;font-size:10px!important;font-weight:800!important;overflow:hidden!important;}';
    document.head.appendChild(aiButtonStyle);
  }

  function getMonthlyOps(year,month){
    var y=String(year!=null?year:(typeof baseYear!=='undefined'?baseYear:''));
    var m=month||(typeof selMonth!=='undefined'?selMonth:'');
    if(typeof store==='undefined'||!store||!m)return {laborCostYen:0,grossMarginRate:0};
    if(!store.monthlyOps)store.monthlyOps={};
    if(!store.monthlyOps[y])store.monthlyOps[y]={};
    if(!store.monthlyOps[y][m])store.monthlyOps[y][m]={laborCostYen:0,grossMarginRate:0};
    return store.monthlyOps[y][m];
  }

  function comparisonPct(now,prev){
    now=Number(now)||0;prev=Number(prev)||0;
    if(prev<=0)return null;
    var pct=(now-prev)/prev*100;
    return {up:pct>=0,str:Math.abs(pct).toFixed(1)+'%'};
  }

  function grossMarginPoint(now,prev){
    now=Number(now)||0;prev=Number(prev)||0;
    if(prev<=0)return null;
    var pt=now-prev;
    return {up:pt>=0,str:Math.abs(pt).toFixed(1)+'pt'};
  }

  function makeCard(type,label,valueHtml,comparison,prevLabel){
    var card=document.createElement('div');
    card.className='kpi-card';
    card.dataset.monthlyOps=type;
    card.title=label+'を編集';
    card.onclick=function(){if(typeof window.editMonthlyOpsKpi==='function')window.editMonthlyOpsKpi(type);};
    var badge='';
    if(comparison){
      var positive=type==='labor'?!comparison.up:comparison.up;
      badge='<div class="kpi-yoy"><span class="kpi-badge '+(positive?'up':'dn')+'">'+(comparison.up?'▲':'▼')+' '+comparison.str+'</span><span class="kpi-prev">'+prevLabel+'</span></div>';
    }
    card.innerHTML='<div class="kpi-label">'+label+' <span style="font-weight:500;font-size:8.5px;color:var(--text5);">'+selMonth+'</span></div><div class="kpi-value">'+valueHtml+'</div>'+badge;
    return card;
  }

  function ensureMonthlyOpsKpis(){
    if(typeof currentNav!=='undefined'&&currentNav!==1)return;
    var row=document.getElementById('kpiRow');
    if(!row||typeof baseYear==='undefined'||typeof selMonth==='undefined')return;

    var existing=row.querySelectorAll('[data-monthly-ops]');
    var correct=existing.length===2;
    if(correct){
      var labels=Array.prototype.map.call(existing,function(el){return el.dataset.monthlyOps;});
      correct=labels.indexOf('labor')>=0&&labels.indexOf('grossMargin')>=0;
    }
    if(correct)return;

    Array.prototype.forEach.call(existing,function(el){el.remove();});
    var current=getMonthlyOps(baseYear,selMonth);
    var prev=null;
    if(typeof cmpYear!=='undefined'&&cmpYear!=null&&store.monthlyOps&&store.monthlyOps[String(cmpYear)]&&store.monthlyOps[String(cmpYear)][selMonth]){
      prev=store.monthlyOps[String(cmpYear)][selMonth];
    }
    var labor=Number(current.laborCostYen)||0;
    var gm=Number(current.grossMarginRate)||0;
    var laborCmp=labor>0&&prev?comparisonPct(labor,prev.laborCostYen):null;
    var gmCmp=gm>0&&prev?grossMarginPoint(gm,prev.grossMarginRate):null;
    var prevLabel=(typeof cmpYear!=='undefined'&&cmpYear!=null)?String(cmpYear)+'年比':'前年比';
    row.appendChild(makeCard('labor','人件費',labor?Math.round(labor/1000).toLocaleString()+'<span class="kpi-unit">千円</span>':'—',laborCmp,prevLabel));
    row.appendChild(makeCard('grossMargin','粗利率',gm?gm.toFixed(1)+'<span class="kpi-unit">%</span>':'—',gmCmp,prevLabel));
  }

  if(typeof window.renderKPI==='function'){
    var originalRenderKPI=window.renderKPI;
    window.renderKPI=function(){
      var result=originalRenderKPI.apply(this,arguments);
      ensureMonthlyOpsKpis();
      return result;
    };
  }

  var observer=new MutationObserver(function(){
    if(typeof currentNav!=='undefined'&&currentNav===1){
      setTimeout(ensureMonthlyOpsKpis,0);
    }
  });
  var target=document.getElementById('kpiRow');
  if(target)observer.observe(target,{childList:true});

  ensureMonthlyOpsKpis();
})();

(function(){
  if(document.getElementById('insightAiOpsV1'))return;
  var script=document.createElement('script');
  script.id='insightAiOpsV1';
  script.src='./insight_ai_ops_v1.js?v=20260907-1';
  script.async=false;
  document.head.appendChild(script);
})();

(function(){
  if(document.getElementById('insightBackupGuardV1'))return;
  var script=document.createElement('script');
  script.id='insightBackupGuardV1';
  script.src='./insight_backup_guard_v1.js?v=20260905-1';
  script.async=false;
  document.head.appendChild(script);
})();

(function(){
  if(document.getElementById('insightWasteInsightsV1Script'))return;
  var script=document.createElement('script');
  script.id='insightWasteInsightsV1Script';
  script.src='./insight_waste_insights_v1.js?v=20260921-5';
  script.async=false;
  script.addEventListener('load',function(){
    if(document.getElementById('insightWasteCompactStyle'))return;
    var compact=document.createElement('style');
    compact.id='insightWasteCompactStyle';
    compact.textContent='#iwcRow .iwc-head>div:first-child{display:flex;align-items:baseline;gap:6px;min-width:0;white-space:nowrap}#iwcRow .iwc-head .iwc-sub{margin-top:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#iwcRow .iwc-card{padding:7px 10px}#iwcRow .iwc-head{margin-bottom:3px}#iwcRow .iwc-kpis{gap:5px;margin-bottom:3px}#iwcRow .iwc-kpi{padding:2px 5px}#iwcRow .iwc-kpi-label{font-size:8px;line-height:1}#iwcRow .iwc-kpi-value{font-size:13px;line-height:1.1}#iwcRow .iwc-rank-grid{gap:3px}#iwcRow .iwc-rank-tabs button{font:700 9px/1.1 -apple-system,BlinkMacSystemFont,sans-serif;font-family:inherit}#iwcRow .iwc-rank{padding:3px 5px;display:flex;flex-direction:column}#iwcRow .iwc-rank-title{font-size:8px;line-height:1.1;margin-bottom:2px;flex-shrink:0}#iwcRow #iwcShare,#iwcRow #iwcIncrease{display:flex;flex-direction:column;flex:1;min-height:0}#iwcRow .iwc-rank-line{font-size:8px;line-height:1.1;padding:1px 0;flex:1;min-height:0}#iwcRow .iwc-legends .donut-leg{padding:2px 0}';
    document.head.appendChild(compact);
  });
  document.head.appendChild(script);
})();

(function(){
  'use strict';
  if(document.getElementById('insightWasteSpacingV1Style'))return;
  var style=document.createElement('style');
  style.id='insightWasteSpacingV1Style';
  style.textContent=[
    '#pageHaiki #iwcRow .iwc-card{height:calc(var(--iwc-height) + 50px)}',
    '#pageHaiki #iwcRow .iwc-kpi{padding:5px 7px}',
    '#pageHaiki #iwcRow .iwc-kpi-label{font-size:9px;line-height:1.2}',
    '#pageHaiki #iwcRow .iwc-kpi-value{font-size:15px;line-height:1.3}',
    '#pageHaiki #iwcRow .iwc-rank-tabs button{font-size:10px;line-height:1.2;padding:5px 3px}',
    '#pageHaiki #iwcRow .iwc-rank-line{font-size:10px;line-height:1.25;padding:3px 0}',
    '#pageHaiki #iwcRow .iwc-rank{padding:5px 8px}',
    '#pageHaiki #iwcSharePanel>.iwc-rank-title,#pageHaiki #iwcIncreasePanel .iwc-increase-head>span{display:none}',
    '#pageHaiki #iwcIncreasePanel .iwc-increase-head{justify-content:flex-end}',
    '#pageHaiki .haiki-day-btn{padding:8px 11px}',
    '#pageHaiki .haiki-form{padding:10px 22px}',
    '#pageHaiki .hf-title{margin-bottom:10px}',
    '#pageHaiki .hf-field{padding:7px 0}',
    '#pageHaiki .hf-input-wrap input{padding:7px 14px}',
    '#pageHaiki .hf-total{margin-top:10px;padding:10px 16px}'
  ].join('');
  document.head.appendChild(style);
  function relabel(){
    var row=document.getElementById('iwcRow');if(!row)return false;
    var share=row.querySelector('#iwcShareTab'),increase=row.querySelector('#iwcIncreaseTab');
    if(!share||!increase)return false;
    share.textContent='構成比 上位3カテゴリ';
    increase.textContent='廃棄増加 上位3カテゴリ';
    return true;
  }
  if(!relabel()){
    var page=document.getElementById('pageHaiki');
    if(page&&typeof MutationObserver!=='undefined'){
      var observer=new MutationObserver(function(){if(relabel())observer.disconnect();});
      observer.observe(page,{childList:true,subtree:true});
    }
  }
})();
