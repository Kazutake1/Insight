/* Canonical payload bindings v1.
 * Replaces payload inline event attributes with CSP-compatible listeners.
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

on('storeSel','change',function(event){invoke('switchStore',[event.currentTarget.value]);});
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
  if(event.key==='Enter')invoke('addYear',[target.value]);
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
  if(target.hasAttribute('data-sales-weather')){
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
