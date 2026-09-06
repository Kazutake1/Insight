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
  script.src='./insight_ai_ops_v1.js?v=20260905-4';
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
  if(document.getElementById('insightStockoutFixV1'))return;
  var script=document.createElement('script');
  script.id='insightStockoutFixV1';
  script.src='./insight_stockout_fix_v1.js?v=20260905-1';
  script.async=false;
  document.head.appendChild(script);
})();
