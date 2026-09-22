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

/* 起動ボタンだけを既存ナビへ移動。分析パネル・分析処理には変更を加えない。 */
(function(){
  var button=document.getElementById('aiAnalysisToggle');
  var lastNav=document.getElementById('nav4');
  if(!button||!lastNav)return;

  button.className='nav-btn';
  button.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18M7 14l4-4 4 3 6-8"/></svg><span>分析AI</span>';
  lastNav.insertAdjacentElement('afterend',button);

  function syncSelection(){
    var open=document.body.classList.contains('ai-analysis-open');
    if(button.classList.contains('active')!==open)button.classList.toggle('active',open);
    button.setAttribute('aria-expanded',String(open));
    for(var i=0;i<5;i++){
      var nav=document.getElementById('nav'+i);
      var selected=!open&&currentNav===i;
      if(nav&&nav.classList.contains('active')!==selected)nav.classList.toggle('active',selected);
    }
  }
  var selectionObserver=new MutationObserver(syncSelection);
  selectionObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  selectionObserver.observe(lastNav.parentElement,{subtree:true,attributes:true,attributeFilter:['class']});
  syncSelection();
})();
