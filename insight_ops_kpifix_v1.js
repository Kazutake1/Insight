(function(){
  function getMonthlyOps(year,month){
    var y=String(year!=null?year:(typeof baseYear!=='undefined'?baseYear:''));
    var m=month||(typeof selMonth!=='undefined'?selMonth:'');
    if(typeof store==='undefined'||!store||!m)return {laborCostYen:0,grossMarginRate:0};
    if(!store.monthlyOps)store.monthlyOps={};
    if(!store.monthlyOps[y])store.monthlyOps[y]={};
    if(!store.monthlyOps[y][m])store.monthlyOps[y][m]={laborCostYen:0,grossMarginRate:0};
    return store.monthlyOps[y][m];
  }

  function monthlyComparisonDisplay(change,kind){
    if(!change)return null;
    var value=kind==='point'?Number(change.point):Number(change.pct);
    if(!Number.isFinite(value))return null;
    return {up:value>=0,str:Math.abs(value).toFixed(1)+(kind==='point'?'pt':'%')};
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
    card.innerHTML='<div class="kpi-label">'+label+' <span class="monthly-ops-kpi-month">'+selMonth+'</span></div><div class="kpi-value">'+valueHtml+'</div>'+badge;
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
    var labor=Number(current.laborCostYen)||0;
    var gm=Number(current.grossMarginRate)||0;
    var comparison=(window.InsightYearComparison&&typeof window.InsightYearComparison.monthly==='function')
      ?window.InsightYearComparison.monthly(baseYear,selMonth,typeof cmpYear!=='undefined'?cmpYear:null)
      :{laborCostYen:null,grossMarginRate:null};
    var laborCmp=monthlyComparisonDisplay(comparison.laborCostYen,'pct');
    var gmCmp=monthlyComparisonDisplay(comparison.grossMarginRate,'point');
    var prevLabel=(typeof cmpYear!=='undefined'&&cmpYear!=null)?String(cmpYear)+'年比':'前年比';
    row.appendChild(makeCard('labor','人件費',labor?Math.round(labor/1000).toLocaleString()+'<span class="kpi-unit">千円</span>':'—',laborCmp,prevLabel));
    row.appendChild(makeCard('grossMargin','粗利率',gm?gm.toFixed(1)+'<span class="kpi-unit">%</span>':'—',gmCmp,prevLabel));
  }

  if(window.InsightHooks){
    window.InsightHooks.on('dashboard:kpi:after','monthly-ops-kpi',function(){ensureMonthlyOpsKpis();},20);
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
















