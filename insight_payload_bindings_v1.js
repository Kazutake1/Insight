/* Canonical payload bindings v1.
 * Replaces static inline onclick/onchange attributes with CSP-compatible listeners.
 */
(function(root){
'use strict';
if(root.InsightPayloadBindings)return;
var doc=root.document;
if(!doc)return;

function byId(id){return doc.getElementById(id);}
function on(id,type,handler){
  var node=byId(id);
  if(node)node.addEventListener(type,handler);
}
function invoke(name,args){
  var fn=root[name];
  if(typeof fn!=='function')throw new Error('Insight handler is unavailable: '+name);
  return fn.apply(root,args||[]);
}


// Registered user store selector change only. Not store menu add/remove/rename
// nor programmatic switchStore calls; never certifies app-wide cleanliness.
var selectorObserver=null,selectorFault=false,selectorActive=0,selectorInitClosed=false;
var selectorScope='store-selector-change-sync-chain-only';
function selectorStatus(){
  if(selectorFault)return Object.freeze({scope:selectorScope,state:'HELD',activeCount:null,epoch:null});
  if(!selectorObserver)return Object.freeze({scope:selectorScope,state:'UNAVAILABLE',activeCount:null,epoch:null});
  try{
    var s=selectorObserver.status();
    if(!s||s.scope!=='registered-operations-only'||
      ['IDLE_OBSERVED','ACTIVE','HELD'].indexOf(s.state)<0||
      !Number.isSafeInteger(s.activeCount)||s.activeCount<0||
      !Number.isSafeInteger(s.epoch)||s.epoch<1||
      s.activeCount<selectorActive||
      (s.state==='IDLE_OBSERVED'&&s.activeCount!==0)||
      (s.state==='ACTIVE'&&s.activeCount===0)||
      (selectorActive>0&&s.state!=='ACTIVE'&&s.state!=='HELD'))
      throw new Error('invalid store selector observer status');
    return Object.freeze({scope:selectorScope,state:s.state,activeCount:s.activeCount,epoch:s.epoch});
  }catch(_){selectorFault=true;return Object.freeze({scope:selectorScope,state:'HELD',activeCount:null,epoch:null});}
}
function initSelectorObserver(){
  if(selectorObserver||selectorFault||selectorInitClosed)return;
  try{
    var factory=root.InsightOperationObserverV0&&root.InsightOperationObserverV0.createOperationObserver;
    if(typeof factory!=='function')return;
    var candidate=factory();
    if(!candidate||['initialize','begin','end','invalidate','status'].some(function(k){
      return typeof candidate[k]!=='function';
    })||candidate.initialize()!==true){selectorFault=true;return;}
    selectorObserver=candidate;
    var status=selectorStatus();
    if(status.state!=='IDLE_OBSERVED'||status.activeCount!==0)selectorFault=true;
  }catch(_){selectorFault=true;}
}
function selectorTargetState(target){
  try{
    if(typeof allStores==='undefined'||!allStores||
      !allStores.stores||typeof allStores.current!=='string')return null;
    return {current:allStores.current,valid:Object.prototype.hasOwnProperty.call(allStores.stores,target)};
  }catch(_){return null;}
}
function observeStoreSelection(target,action){
  var before=selectorTargetState(target);
  // An unchanged selector or unknown store is not a confirmed business switch.
  if(before&&(!before.valid||before.current===target))return action();
  initSelectorObserver();
  // A factory appearing after the first unobserved call cannot produce a false IDLE.
  selectorInitClosed=true;
  var ref=selectorObserver,token=null,registered=false,outcome='unknown';
  if(ref&&!selectorFault){
    try{
      token=ref.begin('store_selector_change');
      if(!token||typeof token!=='object'||selectorActive>=Number.MAX_SAFE_INTEGER){
        selectorFault=true;
      }else{
        registered=true;selectorActive++;
        if(selectorStatus().state!=='ACTIVE')selectorFault=true;
      }
    }catch(_){selectorFault=true;}
  }
  try{
    var result=action();
    var after=selectorTargetState(target);
    // A rejected dirty-input confirmation has no explicit success signal.
    // HOLD rather than treat an unchanged current store as proven clean.
    if(before&&after&&before.valid&&before.current!==target&&after.current===target)
      outcome='completed';
    return result;
  }finally{
    if(registered){
      try{if(ref.end(token,outcome)!==true)selectorFault=true;}
      catch(_){selectorFault=true;}
      selectorActive--;
      if(!selectorFault)selectorStatus();
    }
  }
}
// Status only; no IDs, storage access, or AI authorization.
root.InsightStoreSelectorObserverV0=Object.freeze({getStatus:function(){
  initSelectorObserver();return selectorStatus();
}});

on('storeSel','change',function(event){
  var id=event.currentTarget.value;
  return observeStoreSelection(id,function(){return invoke('switchStore',[id]);});
});
on('storeMenuBtn','click',function(){invoke('showStoreMenu');});
[0,1,2,3,4].forEach(function(index){on('nav'+index,'click',function(){invoke('gotoNav',[index]);});});

on('backupBtn','click',function(){invoke('backupData');});
on('restoreBtn','click',function(){var input=byId('restoreFile');if(input)input.click();});
on('darkModeBtn','click',function(){invoke('toggleDarkMode');});
on('csvImportBtn','click',function(){var input=byId('csvImportFile');if(input)input.click();});
on('restoreFile','change',function(event){invoke('restoreData',[event]);});
on('csvImportFile','change',function(event){invoke('importCSV',[event]);});

Array.prototype.forEach.call(doc.querySelectorAll('.wx-btn[data-wx]'),function(button){
  button.addEventListener('click',function(){invoke('setWeather',[button.getAttribute('data-wx')]);});
});
on('autoWxBtn','click',function(){invoke('fetchWeather');});
on('quickClearBtn','click',function(){invoke('clearTodayData');});
on('quickSaveBtn','click',function(){invoke('saveQuick');});

on('baseYearSel','change',function(event){invoke('onBaseYearChange',[event.currentTarget.value]);});
on('cmpYearSel','change',function(event){invoke('onCmpYearChange',[event.currentTarget.value]);});
on('addYearBtn','click',function(){invoke('showAddYear');});

on('tabDay','click',function(){invoke('setView',['日']);});
on('tabMonth','click',function(){invoke('setView',['月']);});
on('donutBtnAmt','click',function(){invoke('setDonutMode',['amount']);});
on('donutBtnPct','click',function(){invoke('setDonutMode',['percent']);});
on('donutDaySelect','change',function(){invoke('refreshDonut');});
Array.prototype.forEach.call(doc.querySelectorAll('.wd-period-btn[data-months]'),function(button){
  button.addEventListener('click',function(){invoke('setWdPeriod',[Number(button.getAttribute('data-months'))]);});
});

on('salesClearBtn','click',function(){invoke('clearDayData',['sales']);});
on('salesSaveBtn','click',function(){invoke('saveInput',['sales']);});
on('kyakuClearBtn','click',function(){invoke('clearKyakuMonth');});
on('kyakuSaveBtn','click',function(){invoke('saveInput',['kyaku']);});
on('haikiClearBtn','click',function(){invoke('clearDayData',['haiki']);});
on('haikiSaveBtn','click',function(){invoke('saveInput',['haiki']);});

on('budgetCancelBtn','click',function(){invoke('closeBudgetModal');});
on('budgetSaveBtn','click',function(){invoke('saveBudget');});
on('yearDeleteCancelBtn','click',function(){invoke('closeModal');});
on('yearDeleteConfirmBtn','click',function(){invoke('confirmDeleteYear');});

on('aiAnalysisToggle','click',function(){invoke('openAIAnalysisPanel');});
on('aiAnalysisClose','click',function(){invoke('closeAIAnalysisPanel');});


doc.addEventListener('keydown',function(event){
  var target=event.target;
  if(!target||target.id!=='ayInput')return;
  if(event.key==='Enter'){var input=byId('ayInput');invoke('addYear',[input?input.value:'']);}
  else if(event.key==='Escape'){
    var wrap=byId('addYearInlineWrap');
    if(wrap)wrap.innerHTML='';
  }
});

doc.addEventListener('click',function(event){
  var target=event.target&&event.target.closest?event.target.closest('#ayAddBtn,#haikiBudgetEditBtn,[data-sales-weather][data-ri],#installBannerAddBtn,#installBannerCloseBtn,#iosHintCloseBtn'):null;
  if(!target)return;
  if(target.id==='ayAddBtn'){
    var input=byId('ayInput');
    invoke('addYear',[input?input.value:'']);
    return;
  }
  if(target.id==='haikiBudgetEditBtn'){invoke('openBudgetModal');return;}
  if(target.hasAttribute('data-sales-weather')&&target.hasAttribute('data-ri')){
    invoke('setSalesWeather',[Number(target.getAttribute('data-ri')),target.getAttribute('data-sales-weather')]);
    return;
  }
  if(target.id==='installBannerAddBtn'){invoke('doInstall');return;}
  if(target.id==='installBannerCloseBtn'){
    var banner=target.closest('#installBanner');
    if(banner)banner.remove();
    return;
  }
  if(target.id==='iosHintCloseBtn'){
    var hint=target.closest('#iosHint');
    if(hint)hint.remove();
  }
});

root.InsightPayloadBindings={VERSION:1};
})(typeof window!=='undefined'?window:globalThis);
