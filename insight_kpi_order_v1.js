(function(){
  var TARGET_ORDER=['客単価','廃棄率','人件費','粗利率'];
  var queued=false;

  function cardLabel(card){
    if(!card)return '';
    if(card.dataset&&card.dataset.monthlyOps==='labor')return '人件費';
    if(card.dataset&&card.dataset.monthlyOps==='grossMargin')return '粗利率';
    var label=card.querySelector('.kpi-label');
    if(!label)return '';
    var text=String(label.textContent||'').trim();
    if(text.indexOf('客単価')===0)return '客単価';
    if(text.indexOf('廃棄率')===0)return '廃棄率';
    return '';
  }

  function normalizeKpiOrder(){
    queued=false;
    if(typeof currentNav!=='undefined'&&currentNav!==1)return;
    var row=document.getElementById('kpiRow');
    if(!row)return;

    var found={};
    Array.prototype.forEach.call(row.querySelectorAll('.kpi-card'),function(card){
      var label=cardLabel(card);
      if(label&&!found[label])found[label]=card;
    });
    if(TARGET_ORDER.some(function(label){return !found[label];}))return;

    var children=Array.prototype.slice.call(row.children);
    var tail=children.slice(-TARGET_ORDER.length);
    var alreadyStable=TARGET_ORDER.every(function(label,index){return tail[index]===found[label];});
    if(alreadyStable)return;

    TARGET_ORDER.forEach(function(label){row.appendChild(found[label]);});
  }

  function scheduleNormalize(){
    if(queued)return;
    queued=true;
    if(typeof queueMicrotask==='function')queueMicrotask(normalizeKpiOrder);
    else Promise.resolve().then(normalizeKpiOrder);
  }

  var row=document.getElementById('kpiRow');
  if(row){
    var observer=new MutationObserver(scheduleNormalize);
    observer.observe(row,{childList:true});
  }

  if(typeof window.refreshDash==='function'){
    var originalRefreshDash=window.refreshDash;
    window.refreshDash=function(){
      var result=originalRefreshDash.apply(this,arguments);
      scheduleNormalize();
      return result;
    };
  }

  scheduleNormalize();
  window.InsightKPIOrder={normalize:normalizeKpiOrder};
})();
