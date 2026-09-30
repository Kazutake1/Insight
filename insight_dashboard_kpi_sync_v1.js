/* Dashboard KPI sync v1: keep dashboard display, share KPI/YoY calculations with Analysis AI. */
(function(root){
  'use strict';
  if(root.__insightDashboardKpiSyncV1)return;
  root.__insightDashboardKpiSyncV1=true;

  function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
  function context(){
    var year=typeof baseYear!=='undefined'?baseYear:null;
    var month=typeof selMonth==='string'?selMonth:'';
    var compare=typeof cmpYear!=='undefined'?cmpYear:null;
    var throughDay=null;
    try{
      if(typeof getAIAnalysisThroughDay==='function'&&year!=null&&month)throughDay=getAIAnalysisThroughDay(year,month);
    }catch(_){}
    if(!root.KPIEngine||typeof root.KPIEngine.getPeriod!=='function'||year==null||!month)return null;
    var shared=null;
    if(compare!=null&&root.InsightYearComparison&&typeof root.InsightYearComparison.getPeriod==='function'){
      shared=root.InsightYearComparison.getPeriod(year,month,throughDay,compare);
    }
    var current=shared&&shared.current?shared.current:root.KPIEngine.getPeriod(year,month,throughDay);
    var previous=shared&&shared.previous?shared.previous:null;
    var comparison=shared&&shared.comparison?shared.comparison:null;
    return {year:year,month:month,compare:compare,throughDay:throughDay,current:current,previous:previous,comparison:comparison};
  }

  var metricMap={
    '売上':{field:'salesYen',goodUp:true,display:function(k){return Math.round(num(k.avgDailySalesYen)/1000);}},
    '客数':{field:'customers',goodUp:true,display:function(k){return Math.round(num(k.avgDailyCustomers));}},
    '買上点数':{field:'items',goodUp:true,display:function(k){return num(k.avgDailyItems);}},
    '廃棄金額':{field:'wasteYen',goodUp:false,display:function(k){return Math.round(num(k.avgDailyWasteYen));}}
  };

  function metricDefinition(key){
    try{
      if(typeof METRICS!=='undefined'&&Array.isArray(METRICS))return METRICS.find(function(m){return m.key===key;})||null;
    }catch(_){}
    return null;
  }

  function pctText(change){
    if(!change||change.pct==null||!Number.isFinite(Number(change.pct)))return null;
    var v=Number(change.pct),sign=v>0?'+':'';
    return {up:v>=0,text:sign+v.toFixed(1)+'%'};
  }

  function pointText(change){
    if(!change||change.point==null||!Number.isFinite(Number(change.point)))return null;
    var v=Number(change.point),sign=v>0?'+':'';
    return {up:v>=0,text:sign+v.toFixed(1)+'pt'};
  }

  function replaceBadge(card,display,goodUp,compareYear){
    var old=card.querySelector('.kpi-yoy');
    if(old)old.remove();
    if(!display||compareYear==null)return;
    var positive=goodUp?display.up:!display.up;
    var box=document.createElement('div');box.className='kpi-yoy';
    var badge=document.createElement('span');badge.className='kpi-badge '+(positive?'up':'dn');
    badge.textContent=(display.up?'▲':'▼')+' '+display.text;
    var prev=document.createElement('span');prev.className='kpi-prev';prev.textContent=String(compareYear)+'年比';
    box.append(badge,prev);card.appendChild(box);
  }

  function patchPrimaryCards(c){
    var row=document.getElementById('kpiRow');if(!row||!c)return;
    Object.keys(metricMap).forEach(function(key){
      var card=row.querySelector('.kpi-card[data-key="'+key+'"]');if(!card)return;
      var cfg=metricMap[key],def=metricDefinition(key),value=cfg.display(c.current),valueEl=card.querySelector('.kpi-value');
      if(valueEl){
        if(def&&typeof def.short==='function')valueEl.innerHTML=def.short(value);
        else valueEl.textContent=String(value);
      }
      var ch=c.comparison?c.comparison[cfg.field]:null;
      var display=pctText(ch);
      replaceBadge(card,display,cfg.goodUp,c.compare);
      if(valueEl&&display)valueEl.style.color=(display.up||!cfg.goodUp)?'#1a1a1a':'#dc2626';
    });
  }

  function cardByLabel(label){
    var row=document.getElementById('kpiRow');if(!row)return null;
    var cards=row.querySelectorAll('.kpi-card');
    for(var i=0;i<cards.length;i++){
      var l=cards[i].querySelector('.kpi-label');
      if(l&&String(l.textContent||'').trim().indexOf(label)===0)return cards[i];
    }
    return null;
  }

  function patchDerivedCards(c){
    if(!c)return;
    var monthly=root.InsightYearComparison.monthly(c.year,c.month,c.compare);
    var laborCard=cardByLabel('人件費'),grossCard=cardByLabel('粗利率');
    if(laborCard)replaceBadge(laborCard,pctText(monthly.laborCostYen),false,c.compare);
    if(grossCard)replaceBadge(grossCard,pointText(monthly.grossMarginRate),true,c.compare);
    var unitCard=cardByLabel('客単価');
    if(unitCard){
      var unitValue=unitCard.querySelector('.kpi-value');
      if(unitValue)unitValue.innerHTML='¥'+Math.round(num(c.current.customerUnitPrice)).toLocaleString()+'<span class="kpi-unit">円</span>';
      replaceBadge(unitCard,pctText(c.comparison&&c.comparison.customerUnitPrice),true,c.compare);
    }
    var wasteCard=cardByLabel('廃棄率');
    if(wasteCard){
      var wasteValue=wasteCard.querySelector('.kpi-value');
      if(wasteValue)wasteValue.innerHTML=num(c.current.wasteRate).toFixed(2)+'<span class="kpi-unit">%</span>';
      replaceBadge(wasteCard,pointText(c.comparison&&c.comparison.wasteRate),false,c.compare);
    }
  }

  function patch(){
    if(typeof currentNav!=='undefined'&&currentNav!==1)return;
    var c=context();if(!c)return;
    patchPrimaryCards(c);
    patchDerivedCards(c);
  }

  if(typeof root.renderKPI==='function'){
    var oldRenderKPI=root.renderKPI;
    root.renderKPI=function(){
      var result=oldRenderKPI.apply(this,arguments);
      var c=context();
      patchPrimaryCards(c);
      patchDerivedCards(c);
      return result;
    };
  }

  if(typeof root.renderDerived==='function'){
    var oldRenderDerived=root.renderDerived;
    root.renderDerived=function(){
      var result=oldRenderDerived.apply(this,arguments);
      patchDerivedCards(context());
      return result;
    };
  }

  if(typeof root.refreshDash==='function'){
    var oldRefreshDash=root.refreshDash;
    root.refreshDash=function(){
      var result=oldRefreshDash.apply(this,arguments);
      patch();
      return result;
    };
  }

  root.InsightDashboardKPISync={
    getCurrent:context,
    refresh:patch
  };

  patch();
})(typeof window!=='undefined'?window:globalThis);
