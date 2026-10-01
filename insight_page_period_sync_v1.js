/* Page period sync v1: keep selected year/month while switching main sidebar pages. */
(function(root){
  'use strict';
  if(root.InsightPagePeriodSync)return;

  var target=null;
  var syncing=false;
  var routeTransition=false;
  var storeTransition=false;
  var scheduled=false;

  function monthNumber(value){
    if(Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12)return Number(value);
    var m=/^(\d{1,2})月$/.exec(String(value||''));
    return m?Number(m[1]):null;
  }
  function monthLabel(value){
    var m=monthNumber(value);
    if(!m)return null;
    try{if(typeof MONTHS!=='undefined'&&Array.isArray(MONTHS)&&MONTHS[m-1])return MONTHS[m-1];}catch(_){}
    return String(m)+'月';
  }
  function validYear(value){
    var y=Number(value);
    return Number.isInteger(y)&&y>=1000?y:null;
  }
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function normalize(spec){
    spec=spec||{};
    var year=validYear(spec.year),month=monthNumber(spec.month);
    if(!year||!month)return null;
    var day=spec.day==null?null:Number(spec.day);
    if(day!=null){
      if(!Number.isInteger(day)||day<1)day=null;
      else day=Math.min(day,lastDay(year,month));
    }
    return {year:year,month:month,monthLabel:monthLabel(month),day:day,source:spec.source||null};
  }
  function currentNavValue(){
    try{return typeof currentNav!=='undefined'?currentNav:1;}catch(_){return 1;}
  }
  function yearsForStore(storeValue){
    return storeValue&&Array.isArray(storeValue.years)?storeValue.years.map(function(y){return String(y);}):[];
  }
  function resolveForStore(value,storeValue){
    value=normalize(value);
    if(!value)return null;
    var years=yearsForStore(storeValue);
    if(!years.length)return value;
    if(years.indexOf(String(value.year))>=0)return value;
    var fallback=validYear(years[years.length-1]);
    if(!fallback)return value;
    return normalize({year:fallback,month:value.month,day:value.day,source:value.source||'storeFallback'});
  }
  function getTarget(){return target?Object.assign({},target):null;}
  function setTarget(spec){
    var next=normalize(spec);
    if(!next)return false;
    target=next;
    return true;
  }

  function captureCurrent(){
    if(syncing||routeTransition||storeTransition)return target;
    var nav=currentNavValue(),spec=null;
    try{
      if(nav==='salesCounts'&&root.InsightSalesCount&&typeof root.InsightSalesCount.getPeriod==='function'){
        var sp=root.InsightSalesCount.getPeriod();
        if(sp)spec={year:sp.year,month:sp.month,source:'salesCounts'};
      }else if(nav===0&&root.InsightDateContext&&typeof root.InsightDateContext.getSelectedInfo==='function'){
        var d=root.InsightDateContext.getSelectedInfo();
        if(d)spec={year:d.fy,month:d.mIdx+1,day:d.day,source:'daily'};
      }else if(nav===1){
        spec={year:baseYear,month:selMonth,source:'dashboard'};
      }else if(nav===2){
        spec={year:editYear.sales,month:editMonth.sales,source:'sales'};
      }else if(nav===3){
        spec={year:editYear.kyaku,month:editMonth.kyaku,source:'customers'};
      }else if(nav===4){
        spec={year:editYear.haiki,month:editMonth.haiki,source:'waste'};
      }
    }catch(_){}
    var next=normalize(spec);
    if(next)target=next;
    return target;
  }

  function analysisTarget(){
    try{
      if(root.InsightAnalysisPeriodLock&&typeof root.InsightAnalysisPeriodLock.isActive==='function'&&
        root.InsightAnalysisPeriodLock.isActive()&&typeof root.InsightAnalysisPeriodLock.getTarget==='function'){
        return normalize(root.InsightAnalysisPeriodLock.getTarget());
      }
    }catch(_){}
    return null;
  }
  function effectiveTarget(){return analysisTarget()||target;}

  function referenceDate(value){
    value=normalize(value);
    if(!value)return null;
    var now=new Date(),day=value.day;
    if(day==null){
      if(now.getFullYear()===value.year&&now.getMonth()+1===value.month)day=now.getDate();
      else day=lastDay(value.year,value.month);
    }
    day=Math.min(day,lastDay(value.year,value.month));
    return new Date(value.year,value.month-1,day,12,0,0,0);
  }

  function syncDashboard(value){
    try{
      baseYear=typeof baseYear==='number'?value.year:String(value.year);
      selMonth=value.monthLabel;
      if(typeof refreshDash==='function')refreshDash();
      return true;
    }catch(_){return false;}
  }
  function syncInput(value,type){
    try{
      if(typeof editYear==='undefined'||typeof editMonth==='undefined')return false;
      editYear[type]=typeof editYear[type]==='number'?value.year:String(value.year);
      editMonth[type]=value.monthLabel;
      if(typeof initInputPage==='function')initInputPage(type);
      return true;
    }catch(_){return false;}
  }
  function syncDaily(value){
    try{
      if(!root.InsightDateContext||typeof root.InsightDateContext.setSelectedDate!=='function')return false;
      var date=referenceDate(value);
      if(!date)return false;
      root.InsightDateContext.setSelectedDate(date);
      if(typeof renderQuickPage==='function')renderQuickPage();
      return true;
    }catch(_){return false;}
  }
  function syncSalesCount(value){
    try{
      return !!(root.InsightSalesCount&&typeof root.InsightSalesCount.setPeriod==='function'&&
        root.InsightSalesCount.setPeriod(value.year,value.month));
    }catch(_){return false;}
  }

  function syncCurrentPage(){
    var value=effectiveTarget();
    if(!value||syncing){
      routeTransition=false;
      return false;
    }
    syncing=true;
    var nav=currentNavValue(),ok=false;
    try{
      if(nav===0)ok=syncDaily(value);
      else if(nav===1)ok=syncDashboard(value);
      else if(nav===2)ok=syncInput(value,'sales');
      else if(nav===3)ok=syncInput(value,'kyaku');
      else if(nav===4)ok=syncInput(value,'haiki');
      else if(nav==='salesCounts')ok=syncSalesCount(value);
      if(ok&&!analysisTarget())target=normalize(value);
    }finally{
      syncing=false;
      routeTransition=false;
    }
    return ok;
  }

  function captureIfUserChanged(){
    if(syncing||routeTransition||storeTransition)return;
    captureCurrent();
  }

  function scheduleRouteSync(){
    if(scheduled)return;
    scheduled=true;
    var run=function(){
      scheduled=false;
      syncCurrentPage();
    };
    if(typeof queueMicrotask==='function')queueMicrotask(run);
    else setTimeout(run,0);
  }

  function reconcileCurrentStore(value){
    var currentStore=null;
    try{currentStore=typeof allStores!=='undefined'&&allStores.stores?allStores.stores[allStores.current]:null;}catch(_){}
    var next=resolveForStore(value||effectiveTarget()||target,currentStore);
    if(!next)return false;
    target=next;
    try{
      if(root.InsightAnalysisPeriodLock&&typeof root.InsightAnalysisPeriodLock.isActive==='function'&&
        root.InsightAnalysisPeriodLock.isActive()&&typeof root.InsightAnalysisPeriodLock.setTarget==='function'){
        var compare=null;
        try{compare=typeof cmpYear!=='undefined'?cmpYear:null;}catch(_){}
        root.InsightAnalysisPeriodLock.setTarget({
          year:next.year,month:next.month,day:next.day,compareYear:compare,source:'storeSwitch'
        });
      }
    }catch(_){}
    return syncCurrentPage();
  }

  function installStoreSwitchBridge(){
    if(typeof root.switchStore!=='function'||root.switchStore.__insightPagePeriodSync)return;
    var original=root.switchStore;
    var wrapped=function(id){
      var before=effectiveTarget()||captureCurrent(),previous=null;
      try{previous=typeof allStores!=='undefined'?allStores.current:null;}catch(_){}
      storeTransition=true;
      var result;
      try{return result=original.apply(this,arguments);}
      finally{
        var changed=false;
        try{changed=typeof allStores!=='undefined'&&allStores.current!==previous&&allStores.current===id;}catch(_){}
        storeTransition=false;
        if(changed)reconcileCurrentStore(before);
      }
    };
    wrapped.__insightPagePeriodSync=true;
    wrapped.__insightOriginal=original;
    root.switchStore=wrapped;
  }

  function install(){
    installStoreSwitchBridge();
    if(root.document&&typeof root.document.addEventListener==='function'){
      root.document.addEventListener('click',function(event){
        var node=event.target&&event.target.closest?
          event.target.closest('#nav0,#nav1,#nav2,#nav3,#nav4,#navSalesCount'):null;
        if(!node)return;
        captureCurrent();
        routeTransition=true;
        scheduleRouteSync();
      },true);
    }

    if(root.InsightHooks){
      root.InsightHooks.on('dashboard:refresh:after','page-period-sync-dashboard',function(){
        if(currentNavValue()===1)captureIfUserChanged();
      },45);
      root.InsightHooks.on('input:table:after','page-period-sync-input',function(){
        var nav=currentNavValue();
        if(nav===2||nav===3||nav===4)captureIfUserChanged();
      },45);
      root.InsightHooks.on('quick:render:after','page-period-sync-daily',function(){
        if(currentNavValue()===0)captureIfUserChanged();
      },45);
    }

    root.addEventListener('insight:sales-count-period-change',function(){
      if(currentNavValue()==='salesCounts')captureIfUserChanged();
    });

    captureCurrent();
  }

  function isTransitioning(){return syncing||routeTransition||storeTransition||scheduled;}

  var model={
    normalize:normalize,
    getTarget:getTarget,
    setTarget:setTarget,
    captureCurrent:captureCurrent,
    effectiveTarget:effectiveTarget,
    syncCurrentPage:syncCurrentPage,
    referenceDate:referenceDate,
    resolveForStore:resolveForStore,
    reconcileCurrentStore:reconcileCurrentStore,
    isTransitioning:isTransitioning
  };

  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightPagePeriodSync=model;

  if(!root.document)return;
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(typeof window!=='undefined'?window:globalThis);
