/* Analysis period lock v1: keep AI target period stable while switching sidebar themes. */
(function(root){
  'use strict';
  if(root.InsightAnalysisPeriodLock)return;

  var target=null;
  var lastOpen=false;

  function pad(v){return String(v).padStart(2,'0');}
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
  function validYear(value){var y=Number(value);return Number.isInteger(y)&&y>=1000?y:null;}
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
    return {
      year:year,
      month:month,
      monthLabel:monthLabel(month),
      day:day,
      compareYear:spec.compareYear==null?null:validYear(spec.compareYear),
      source:spec.source||null
    };
  }
  function currentNavValue(){
    try{return typeof currentNav!=='undefined'?currentNav:1;}catch(_){return 1;}
  }
  function compareYear(){
    try{return typeof cmpYear!=='undefined'&&cmpYear!=null?cmpYear:null;}catch(_){return null;}
  }
  function pageTransitioning(){
    try{return !!(root.InsightPagePeriodSync&&typeof root.InsightPagePeriodSync.isTransitioning==='function'&&root.InsightPagePeriodSync.isTransitioning());}
    catch(_){return false;}
  }
  function captureCurrent(){
    if(pageTransitioning())return target;
    var nav=currentNavValue(),spec=null;
    try{
      if(nav==='salesCounts'&&root.InsightSalesCount&&typeof root.InsightSalesCount.getPeriod==='function'){
        var sp=root.InsightSalesCount.getPeriod();
        if(sp)spec={year:sp.year,month:sp.month,compareYear:compareYear(),source:'salesCounts'};
      }else if(nav===0&&root.InsightDateContext&&typeof root.InsightDateContext.getSelectedInfo==='function'){
        var d=root.InsightDateContext.getSelectedInfo();
        if(d)spec={year:d.fy,month:d.mIdx+1,day:d.day,compareYear:compareYear(),source:'daily'};
      }else if(nav===1){
        spec={year:baseYear,month:selMonth,compareYear:compareYear(),source:'dashboard'};
      }else if(nav===2){
        spec={year:editYear.sales,month:editMonth.sales,compareYear:compareYear(),source:'sales'};
      }else if(nav===3){
        spec={year:editYear.kyaku,month:editMonth.kyaku,compareYear:compareYear(),source:'customers'};
      }else if(nav===4){
        spec={year:editYear.haiki,month:editMonth.haiki,compareYear:compareYear(),source:'waste'};
      }
    }catch(_){}
    var next=normalize(spec);
    if(next)target=next;
    refreshLabel();
    return target;
  }
  function isOpen(){
    return !!(root.document&&root.document.body&&root.document.body.classList.contains('ai-analysis-open'));
  }
  function isActive(){return isOpen()&&!!target;}
  function getTarget(){return target?Object.assign({},target):null;}
  function setTarget(spec){
    var next=normalize(spec);
    if(!next)return false;
    target=next;
    refreshLabel();
    return true;
  }
  function clear(){target=null;refreshLabel();}

  function referenceDate(){
    if(!target)return null;
    var now=new Date(),day=target.day;
    if(day==null){
      if(now.getFullYear()===target.year&&now.getMonth()+1===target.month)day=now.getDate();
      else day=lastDay(target.year,target.month);
    }
    day=Math.min(day,lastDay(target.year,target.month));
    return target.year+'-'+pad(target.month)+'-'+pad(day);
  }

  function throughDay(){
    if(!target)return null;
    if(target.day!=null)return target.day;
    try{
      if(typeof getAIAnalysisThroughDay==='function')return getAIAnalysisThroughDay(target.year,target.monthLabel);
    }catch(_){}
    return lastDay(target.year,target.month);
  }

  function getContext(mode){
    if(!isActive())return null;
    var day=mode==='daily'?(target.day!=null?target.day:Number(referenceDate().slice(8,10))):null;
    return {
      year:String(target.year),
      month:target.monthLabel,
      mi:target.month-1,
      day:day,
      through:mode==='daily'?day:throughDay(),
      prev:target.compareYear==null?null:String(target.compareYear)
    };
  }

  function syncCurrentPage(){
    if(!isActive())return false;
    if(root.InsightPagePeriodSync&&typeof root.InsightPagePeriodSync.syncCurrentPage==='function'){
      return root.InsightPagePeriodSync.syncCurrentPage();
    }
    return false;
  }

  function refreshLabel(){
    if(!root.document)return;
    var el=root.document.getElementById('aiAnalysisTarget');
    if(!el)return;
    el.textContent=target&&isOpen()?'分析対象：'+target.year+'年'+target.month+'月':'';
    el.hidden=!(target&&isOpen());
  }

  function recaptureIfUserChanged(){
    if(!isOpen()||pageTransitioning())return;
    captureCurrent();
    if(typeof root.renderAIAnalysisPanel==='function')root.renderAIAnalysisPanel();
  }

  function installHooks(){
    if(root.InsightHooks){
      root.InsightHooks.on('dashboard:refresh:after','analysis-period-lock-dashboard',function(){
        if(currentNavValue()===1)recaptureIfUserChanged();
      },50);
      root.InsightHooks.on('input:table:after','analysis-period-lock-input',function(){
        var nav=currentNavValue();
        if(nav===2||nav===3||nav===4)recaptureIfUserChanged();
      },50);
      root.InsightHooks.on('quick:render:after','analysis-period-lock-daily',function(){
        if(currentNavValue()===0)recaptureIfUserChanged();
      },50);
    }
    root.addEventListener('insight:sales-count-period-change',function(){
      if(currentNavValue()==='salesCounts')recaptureIfUserChanged();
    });
  }

  function observeOpenState(){
    if(!root.document||!root.document.body)return;
    lastOpen=isOpen();
    var observer=new MutationObserver(function(){
      var open=isOpen();
      if(open&&!lastOpen)captureCurrent();
      else if(!open&&lastOpen)clear();
      lastOpen=open;
      refreshLabel();
    });
    observer.observe(root.document.body,{attributes:true,attributeFilter:['class']});
  }

  var model={
    normalize:normalize,
    captureCurrent:captureCurrent,
    getTarget:getTarget,
    setTarget:setTarget,
    clear:clear,
    isActive:isActive,
    getContext:getContext,
    referenceDate:referenceDate,
    syncCurrentPage:syncCurrentPage,
    refreshLabel:refreshLabel
  };
  root.InsightAnalysisPeriodLock=model;

  if(!root.document){
    if(typeof module!=='undefined'&&module.exports)module.exports=model;
    return;
  }
  installHooks();
  if(root.document.readyState==='loading'){
    root.document.addEventListener('DOMContentLoaded',function(){observeOpenState();refreshLabel();},{once:true});
  }else{
    observeOpenState();refreshLabel();
  }
})(typeof window!=='undefined'?window:globalThis);
