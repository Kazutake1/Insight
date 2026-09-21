(function(){
  var SECTION_IDS=['aiAnalysisSummary','aiAnalysisGood','aiAnalysisCaution'];
  var queued=false;

  function conciseEnding(text){
    return String(text||'')
      .replace(/で低下しています。$/,'（低下）')
      .replace(/で上昇しています。$/,'（上昇）')
      .replace(/で改善しています。$/,'（改善）')
      .replace(/日減っています。$/,'日減少')
      .replace(/入力されています。$/,'入力済み')
      .replace(/記録されています。$/,'記録')
      .replace(/されています。$/,'')
      .replace(/しています。$/,'')
      .replace(/です。$/,'');
  }

  function normalizeSection(id){
    var el=document.getElementById(id);
    if(!el)return;
    Array.prototype.forEach.call(el.querySelectorAll('p'),function(p){
      var before=String(p.textContent||'');
      var after=conciseEnding(before);
      if(after!==before)p.textContent=after;
    });
  }

  function applyPresentation(){
    queued=false;
    var button=document.getElementById('aiAnalysisToggle');
    if(button){
      if(button.textContent.trim()!=='分析AI')button.textContent='分析AI';
      button.setAttribute('aria-label','分析AI');
    }
    SECTION_IDS.forEach(normalizeSection);
  }

  function scheduleApply(){
    if(queued)return;
    queued=true;
    if(typeof queueMicrotask==='function')queueMicrotask(applyPresentation);
    else Promise.resolve().then(applyPresentation);
  }

  var observer=new MutationObserver(scheduleApply);
  SECTION_IDS.forEach(function(id){
    var el=document.getElementById(id);
    if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
  });

  applyPresentation();
})();

/* 廃棄入力ページ専用の追加表示。既存の分析AIの挙動は変更しない。 */
(function(){
  if(document.getElementById('insightHaikiInputAnalysisV1'))return;
  var script=document.createElement('script');
  script.id='insightHaikiInputAnalysisV1';
  script.src='./insight_haiki_input_analysis_v1.js?v=20260921-1';
  script.async=false;
  document.head.appendChild(script);
})();
