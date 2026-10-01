(function(){
  var SECTION_IDS=['aiAnalysisSummary','aiAnalysisGood','aiAnalysisCaution','aiAnalysisChecks'];
  var queued=false;
  var viewState=window.InsightAIViewState||(window.InsightAIViewState={period:null});
  function selectedPeriod(){
    var mode=currentMode();
    if(viewState.period==='today'&&mode!=='daily')return 'month';
    return viewState.period||(mode==='daily'?'today':'month');
  }
  function setPeriod(period){
    viewState.period=period;
    syncWorkspaceState();
    if(typeof window.renderAIAnalysisPanel==='function')window.renderAIAnalysisPanel();
  }

  function createCard(title,id){
    var card=document.createElement('section');
    card.className='ai-analysis-card';
    var heading=document.createElement('div');
    heading.className='ai-analysis-card-title';
    heading.textContent=title;
    var body=document.createElement('div');
    body.id=id;
    card.append(heading,body);
    return card;
  }

  function ensureAnalysisDom(){
    if(document.getElementById('aiAnalysisSummary'))return;
    var legacy=document.getElementById('aiAnalysisComments');
    var legacyCard=legacy&&legacy.closest?legacy.closest('.ai-analysis-card'):null;
    if(!legacyCard||!legacyCard.parentNode)return;

    var frag=document.createDocumentFragment();
    frag.append(
      createCard('今月の要点','aiAnalysisSummary'),
      createCard('良い点','aiAnalysisGood'),
      createCard('注意点','aiAnalysisCaution'),
      createCard('確認事項','aiAnalysisChecks')
    );

    var questionCard=document.createElement('section');
    questionCard.className='ai-analysis-card ai-analysis-question-card';
    var questionTitle=document.createElement('div');
    questionTitle.className='ai-analysis-card-title';
    questionTitle.textContent='自由質問';
    var row=document.createElement('div');
    row.className='ai-analysis-question-row';
    var input=document.createElement('textarea');
    input.id='aiAnalysisQuestion';
    input.className='ai-analysis-question-input';
    input.rows=1;
    input.placeholder='分析AIに質問する…';
    var send=document.createElement('button');
    send.className='ai-analysis-question-send';
    send.type='button';
    send.textContent='質問';
    send.addEventListener('click',function(){
      if(typeof window.askAIAnalysisQuestion==='function')window.askAIAnalysisQuestion();
    });
    row.append(input,send);
    var answer=document.createElement('div');
    answer.id='aiAnalysisAnswer';
    answer.className='ai-analysis-question-answer';
    answer.hidden=true;
    var help=document.createElement('div');
    help.className='ai-analysis-question-help';
    help.textContent='現在入力されているKPI・前年比較・廃棄・人件費・粗利率・店舗メモの範囲で回答します。';
    questionCard.append(questionTitle,row,answer,help);
    frag.appendChild(questionCard);

    legacyCard.parentNode.insertBefore(frag,legacyCard);
    legacyCard.remove();
  }

  function currentMode(){
    try{
      if(window.InsightAIPageComments&&typeof window.InsightAIPageComments.mode==='function'){
        return window.InsightAIPageComments.mode();
      }
    }catch(e){}
    var nav=typeof currentNav==='undefined'?1:currentNav;
    return ({0:'daily',1:'dashboard',2:'sales',3:'customers',4:'waste'})[nav]||'dashboard';
  }

  function createPeriodButton(label,key){
    var button=document.createElement('button');
    button.type='button';
    button.className='ai-workspace-period-btn';
    button.dataset.analysisPeriod=key;
    button.textContent=label;
    return button;
  }

  function cardFor(id){
    var el=document.getElementById(id);
    return el&&el.closest?el.closest('.ai-analysis-card'):null;
  }

  function ensureWorkspace(){
    var panel=document.getElementById('aiAnalysisPanel');
    if(!panel||panel.dataset.workspaceReady==='1')return;

    var period=document.getElementById('aiAnalysisPeriod');
    var summaryCard=cardFor('aiAnalysisSummary');
    var goodCard=cardFor('aiAnalysisGood');
    var cautionCard=cardFor('aiAnalysisCaution');
    var checksCard=cardFor('aiAnalysisChecks');
    var question=document.getElementById('aiAnalysisQuestion');
    var questionCard=question&&question.closest?question.closest('.ai-analysis-card'):null;
    if(!summaryCard||!goodCard||!cautionCard||!checksCard||!questionCard)return;

    [period,summaryCard,goodCard,cautionCard,checksCard,questionCard].forEach(function(node){
      if(node&&node.parentNode)node.parentNode.removeChild(node);
    });

    while(panel.firstChild)panel.removeChild(panel.firstChild);
    panel.dataset.workspaceReady='1';
    panel.classList.add('ai-analysis-workspace');

    var header=document.createElement('header');
    header.className='ai-workspace-header';

    var brand=document.createElement('div');
    brand.className='ai-workspace-brand';
    var title=document.createElement('div');
    title.className='ai-workspace-title';
    title.textContent='分析AI';
    brand.appendChild(title);
    if(period){
      period.classList.add('ai-workspace-period-label');
      brand.appendChild(period);
    }

    var periodTabs=document.createElement('div');
    periodTabs.className='ai-workspace-period-tabs';
    [
      ['今日','today'],
      ['今週','week'],
      ['今月','month'],
      ['履歴','history']
    ].forEach(function(item){
      var button=createPeriodButton(item[0],item[1]);
      if(item[1]==='history'){
        button.disabled=true;
        button.title='後続STEPで利用可能になります';
      }else{
        button.addEventListener('click',function(){
          if(button.disabled)return;
          setPeriod(item[1]);
        });
      }
      periodTabs.appendChild(button);
    });

    var close=document.createElement('button');
    close.type='button';
    close.className='ai-workspace-close';
    close.setAttribute('aria-label','分析AIを閉じる');
    close.textContent='×';
    close.addEventListener('click',function(){
      if(typeof window.closeAIAnalysisPanel==='function')window.closeAIAnalysisPanel();
    });

    header.append(brand,periodTabs,close);

    var grid=document.createElement('div');
    grid.className='ai-workspace-grid';

    var main=document.createElement('main');
    main.className='ai-workspace-main';

    var mainHead=document.createElement('div');
    mainHead.className='ai-workspace-section-head';
    var mainTitle=document.createElement('div');
    mainTitle.className='ai-workspace-section-title';
    mainTitle.textContent='分析サマリー';
    var mainHint=document.createElement('div');
    mainHint.className='ai-workspace-section-hint';
    mainHint.textContent='数値と要点を優先して表示';
    mainHead.append(mainTitle,mainHint);

    summaryCard.classList.add('ai-workspace-summary-card');
    questionCard.classList.add('ai-workspace-question-dock');
    main.append(mainHead,summaryCard,questionCard);

    var right=document.createElement('aside');
    right.className='ai-workspace-right';
    var rightTitle=document.createElement('div');
    rightTitle.className='ai-workspace-side-title';
    rightTitle.textContent='重要ポイント';
    cautionCard.classList.add('ai-workspace-status-card','is-caution');
    goodCard.classList.add('ai-workspace-status-card','is-good');
    checksCard.classList.add('ai-workspace-status-card','is-check');
    right.append(rightTitle,cautionCard,goodCard,checksCard);

    grid.append(main,right);
    panel.append(header,grid);
    syncWorkspaceState();
  }

  function syncWorkspacePosition(){
    var panel=document.getElementById('aiAnalysisPanel');
    var button=document.getElementById('aiAnalysisToggle');
    if(!panel)return;
    var navHost=button&&button.parentElement;
    var left=12;
    if(navHost){
      var rect=navHost.getBoundingClientRect();
      if(rect.width>40&&rect.right>0&&rect.right<window.innerWidth-280)left=Math.round(rect.right+12);
    }
    panel.style.setProperty('--ai-workspace-left',left+'px');
  }

  function syncWorkspaceState(){
    var mode=currentMode();
    var activePeriod=selectedPeriod();
    Array.prototype.forEach.call(document.querySelectorAll('.ai-workspace-period-btn'),function(button){
      if(button.dataset.analysisPeriod==='today')button.disabled=mode!=='daily';
      if(button.dataset.analysisPeriod==='history')button.disabled=true;
      button.classList.toggle('active',button.dataset.analysisPeriod===activePeriod);
    });

    var heading=document.querySelector('.ai-workspace-section-title');
    if(heading){
      var labels={daily:'本日の分析',dashboard:'総合分析',sales:'売上分析',customers:'客数分析',waste:'廃棄分析',salesCounts:'販売・納品分析'};
      var base=labels[mode]||'分析サマリー';
      heading.textContent=activePeriod==='week'?'今週の'+base:activePeriod==='month'&&mode==='daily'?'今月の総合分析':base;
    }
    syncWorkspacePosition();
  }

  function ensureBackdrop(){
    var panel=document.getElementById('aiAnalysisPanel');
    if(!panel)return null;
    var backdrop=document.getElementById('aiAnalysisBackdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.id='aiAnalysisBackdrop';
      backdrop.className='ai-analysis-backdrop';
      backdrop.hidden=true;
      backdrop.setAttribute('aria-hidden','true');
      panel.parentNode.insertBefore(backdrop,panel);
    }
    return backdrop;
  }

  function syncBackdrop(){
    var backdrop=ensureBackdrop();
    if(!backdrop)return;
    backdrop.hidden=true;
    backdrop.setAttribute('aria-hidden','true');
  }

  function ensurePresentationStyle(){
    if(document.getElementById('insightAiPresentationStyle'))return;
    var style=document.createElement('style');
    style.id='insightAiPresentationStyle';
    style.textContent=[
      'body.ai-analysis-open #main{margin-right:0!important}',
      '.ai-analysis-backdrop{display:none!important}',
      '.ai-analysis-panel.ai-analysis-workspace{position:fixed!important;left:var(--ai-workspace-left,12px)!important;right:12px!important;top:12px!important;bottom:0!important;width:auto!important;max-width:none!important;height:auto!important;padding:0!important;overflow:hidden!important;background:#f4f6f8!important;color:#172235!important;--surface:#f4f6f8;--surface2:#fff;--border:#dfe4ea;--text:#172235;--text2:#344054;--text3:#667085;--text4:#8b95a5;--navy:#16283f;--danger:#b42318;--success:#397a56;border:1px solid #d9dee5!important;border-radius:18px!important;box-shadow:0 18px 54px rgba(18,31,49,.18)!important;z-index:10001!important}',
      '.ai-workspace-header{height:68px;box-sizing:border-box;display:grid;grid-template-columns:minmax(180px,1fr) auto minmax(44px,1fr);align-items:center;gap:18px;padding:0 20px;border-bottom:1px solid var(--border);background:#fff}',
      '.ai-workspace-brand{min-width:0}',
      '.ai-workspace-title{font-size:20px;line-height:1.1;font-weight:800;color:var(--navy);letter-spacing:.01em}',
      '.ai-workspace-period-label{margin-top:4px;font-size:10px;line-height:1.2;color:var(--text4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ai-workspace-period-tabs{display:flex;align-items:center;gap:4px;padding:4px;border:1px solid var(--border);border-radius:10px;background:#f7f8fa}',
      '.ai-workspace-period-btn{border:0;border-radius:7px;background:transparent;color:var(--text3);padding:7px 14px;font:700 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:default}',
      '.ai-workspace-period-btn.active{background:var(--navy);color:#fff}',
      '.ai-workspace-period-btn:disabled{opacity:.38}',
      '.ai-workspace-close{justify-self:end;width:34px;height:34px;border:1px solid var(--border);border-radius:9px;background:#fff;color:var(--text2);font-size:23px;line-height:1;cursor:pointer}',
      '.ai-workspace-grid{height:calc(100% - 68px);display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:0;min-height:0}',
      '.ai-workspace-right{min-width:0;overflow:auto;background:#fff;padding:18px 14px;border-left:1px solid var(--border)}',
      '.ai-workspace-side-title{margin:0 8px 10px;font-size:10px;line-height:1.2;font-weight:800;letter-spacing:.08em;color:var(--text4)}',
      '.ai-workspace-main{position:relative;min-width:0;overflow:auto;padding:20px 22px 88px;background:#f4f6f8}',
      '.ai-workspace-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:0 0 12px}',
      '.ai-workspace-section-title{font-size:16px;font-weight:800;color:var(--navy)}',
      '.ai-workspace-section-hint{font-size:9px;color:var(--text4)}',
      '.ai-analysis-workspace .ai-analysis-card{box-sizing:border-box;margin:0 0 12px;padding:14px 15px;border:1px solid var(--border)!important;border-radius:12px!important;background:#fff!important;box-shadow:none!important;color:var(--text)!important}',
      '.ai-analysis-workspace .ai-analysis-card-title{margin:0 0 9px;font-size:11px!important;line-height:1.2;font-weight:800!important;color:var(--text3)!important}',
      '.ai-analysis-workspace .ai-analysis-comment,.ai-analysis-workspace .ai-analysis-empty{margin:5px 0!important;font-size:12px!important;line-height:1.55!important;color:var(--text2)!important}',
      '.ai-workspace-summary-card{min-height:126px}',
      '.ai-workspace-status-card{position:relative;padding-left:16px!important}',
      '.ai-workspace-status-card:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:#9aa4b2}',
      '.ai-workspace-status-card.is-caution:before{background:var(--danger)}',
      '.ai-workspace-status-card.is-good:before{background:var(--success)}',
      '.ai-workspace-status-card.is-check:before{background:var(--navy)}',
      '.ai-workspace-question-dock{position:absolute;left:22px;right:22px;bottom:14px;margin:0!important;z-index:3;padding:10px 12px!important;box-shadow:0 8px 24px rgba(18,31,49,.08)!important}',
      '.ai-workspace-question-dock>.ai-analysis-card-title{display:none}',
      '.ai-analysis-question-row{display:flex;gap:8px;align-items:flex-end}',
      '.ai-analysis-question-input{flex:1;min-width:0;height:38px;min-height:38px;max-height:76px;resize:none;border:1px solid var(--border);border-radius:9px;background:#f8f9fb;color:var(--text);padding:9px 10px;font:500 12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;outline:none}',
      '.ai-analysis-question-input:focus{border-color:#9aa4b2;background:#fff}',
      '.ai-analysis-question-send{height:38px;flex:0 0 auto;border:0;border-radius:9px;background:var(--navy);color:#fff;padding:0 15px;font:800 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}',
      '.ai-analysis-question-answer{margin-top:9px;padding:9px 10px;border-radius:9px;background:#f8f9fb;border:1px solid var(--border);font-size:11px;line-height:1.55;color:var(--text2);white-space:pre-wrap;max-height:126px;overflow:auto}',
      '.ai-analysis-question-help{display:none}',
      '@media(max-width:1180px){.ai-workspace-grid{grid-template-columns:minmax(0,1fr) 218px}.ai-workspace-main{padding-left:16px;padding-right:16px}.ai-workspace-question-dock{left:16px;right:16px}.ai-workspace-period-btn{padding-left:10px;padding-right:10px}}',
      '@media(max-width:920px){.ai-analysis-panel.ai-analysis-workspace{left:8px!important;right:8px!important;top:8px!important;bottom:0!important}.ai-workspace-grid{grid-template-columns:minmax(0,1fr) 190px}.ai-workspace-header{padding:0 14px;gap:10px}.ai-workspace-period-btn{padding:7px 8px}.ai-workspace-section-hint{display:none}}'
    ].join('');
    document.head.appendChild(style);
  }

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
    ensureWorkspace();
    var button=document.getElementById('aiAnalysisToggle');
    if(button){
      button.setAttribute('aria-label','分析AI');
    }
    SECTION_IDS.forEach(normalizeSection);
    syncWorkspaceState();
  }

  function scheduleApply(){
    if(queued)return;
    queued=true;
    if(typeof queueMicrotask==='function')queueMicrotask(applyPresentation);
    else Promise.resolve().then(applyPresentation);
  }

  ensureAnalysisDom();
  ensureBackdrop();
  ensurePresentationStyle();
  ensureWorkspace();

  var backdropObserver=new MutationObserver(function(){
    syncBackdrop();
    syncWorkspaceState();
  });
  backdropObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  syncBackdrop();

  var observer=new MutationObserver(scheduleApply);
  SECTION_IDS.forEach(function(id){
    var el=document.getElementById(id);
    if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
  });

  window.addEventListener('resize',syncWorkspacePosition,{passive:true});
  applyPresentation();
})();

/* 起動ボタンだけを既存ナビへ移動。分析処理には変更を加えない。 */
(function(){
  var button=document.getElementById('aiAnalysisToggle');
  var lastNav=document.getElementById('nav4');
  if(!button||!lastNav)return;

  button.className='nav-btn';
  button.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18M7 14l4-4 4 3 6-8"/></svg><span>分析AI</span>';
  lastNav.insertAdjacentElement('afterend',button);

  if(button.dataset.aiToggleCloseBound!=='1'){
    button.dataset.aiToggleCloseBound='1';
    button.addEventListener('click',function(event){
      if(!document.body.classList.contains('ai-analysis-open'))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(typeof window.closeAIAnalysisPanel==='function')window.closeAIAnalysisPanel();
    },true);
  }

  if(document.body.dataset.aiSidebarAnalysisSync!=='1'){
    document.body.dataset.aiSidebarAnalysisSync='1';
    document.addEventListener('click',function(event){
      if(!document.body.classList.contains('ai-analysis-open'))return;
      var target=event.target&&event.target.closest?event.target.closest('#nav0,#nav1,#nav2,#nav3,#nav4,#navSalesCount'):null;
      if(!target)return;
      if(typeof queueMicrotask==='function')queueMicrotask(function(){
        if(typeof window.renderAIAnalysisPanel==='function')window.renderAIAnalysisPanel();
      });
      else setTimeout(function(){
        if(typeof window.renderAIAnalysisPanel==='function')window.renderAIAnalysisPanel();
      },0);
    });
  }

  function syncSelection(){
    var open=document.body.classList.contains('ai-analysis-open');
    if(button.classList.contains('active')!==open)button.classList.toggle('active',open);
    button.setAttribute('aria-expanded',String(open));
    for(var i=0;i<5;i++){
      var nav=document.getElementById('nav'+i);
      var selected=currentNav===i;
      if(nav&&nav.classList.contains('active')!==selected)nav.classList.toggle('active',selected);
    }
  }
  var selectionObserver=new MutationObserver(syncSelection);
  selectionObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  selectionObserver.observe(lastNav.parentElement,{subtree:true,attributes:true,attributeFilter:['class']});
  syncSelection();
})();
