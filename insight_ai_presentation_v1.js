(function(){
  var SECTION_IDS=['aiAnalysisSummary','aiAnalysisGood','aiAnalysisCaution'];
  var queued=false;

  function ensurePresentationStyle(){
    if(document.getElementById('insightAiPresentationStyle'))return;
    var style=document.createElement('style');
    style.id='insightAiPresentationStyle';
    style.textContent=[
      'body.ai-analysis-open #main{margin-right:0!important}',
      '.ai-analysis-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(142,142,147,.18);opacity:0;pointer-events:none;transition:opacity .24s ease}',
      'body.ai-analysis-open .ai-analysis-backdrop{opacity:1;pointer-events:auto}',
      '.ai-analysis-panel{top:14px!important;right:14px!important;bottom:14px!important;width:390px!important;max-width:42vw!important;background:#f2f2f7!important;color:#1a1a1a!important;--surface:#f2f2f7;--surface2:#fff;--border:#d1d1d6;--text:#1a1a1a;--text2:#3a3a3c;--text3:#636366;--text4:#8e8e93;--text5:#aeaeb2;border:1px solid rgba(60,60,67,.16)!important;border-left:1px solid rgba(60,60,67,.16)!important;border-radius:24px!important;box-shadow:0 14px 44px rgba(0,0,0,.22)!important}',
      '.ai-analysis-question-row{display:flex;gap:8px;align-items:flex-end}',
      '.ai-analysis-question-input{flex:1;min-width:0;min-height:38px;max-height:96px;resize:vertical;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text);padding:9px 10px;font:500 12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;outline:none}',
      '.ai-analysis-question-input:focus{border-color:var(--text4)}',
      '.ai-analysis-question-send{height:38px;flex:0 0 auto;border:0;border-radius:11px;background:#1a1a1a;color:#fff;padding:0 13px;font:800 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}',
      '.ai-analysis-question-answer{margin-top:10px;padding:10px 11px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);font-size:12px;line-height:1.65;color:var(--text);white-space:pre-wrap}',
      '.ai-analysis-question-help{margin-top:8px;font-size:10px;line-height:1.5;color:var(--text4)}',
      '@media(max-width:900px){.ai-analysis-panel{width:min(390px,88vw)!important;max-width:none!important;top:12px!important;right:12px!important;bottom:12px!important;border-radius:22px!important}}',
      '@media(max-width:520px){.ai-analysis-panel{width:calc(100vw - 24px)!important;max-width:none!important;top:12px!important;right:12px!important;bottom:12px!important;border-radius:22px!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  ensurePresentationStyle();

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
