(function(){
  var SECTION_IDS=['aiAnalysisSummary','aiAnalysisGood','aiAnalysisCaution','aiAnalysisChecks'];
  var queued=false;
  var viewState=window.InsightAIViewState||(window.InsightAIViewState={period:null});
  if(!viewState.historyKind)viewState.historyKind='week';
  if(!viewState.historySelected)viewState.historySelected={week:null,month:null};
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
      createCard('結論','aiAnalysisSummary'),
      createCard('関連性','aiAnalysisGood'),
      createCard('重要ポイント','aiAnalysisCaution'),
      createCard('次に確認すること','aiAnalysisChecks')
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
    var targetLabel=document.createElement('div');
    targetLabel.id='aiAnalysisTarget';
    targetLabel.className='ai-workspace-target-label';
    targetLabel.hidden=true;
    brand.append(title,targetLabel);
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
      button.addEventListener('click',function(){
        if(button.disabled)return;
        setPeriod(item[1]);
      });
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
    mainHead.append(mainTitle);

    var historyToolbar=document.createElement('section');
    historyToolbar.id='aiHistoryToolbar';
    historyToolbar.className='ai-history-toolbar';
    historyToolbar.hidden=true;

    var historyModes=document.createElement('div');
    historyModes.className='ai-history-modes';
    [['週次','week'],['月次','month']].forEach(function(item){
      var historyButton=document.createElement('button');
      historyButton.type='button';
      historyButton.className='ai-history-mode-btn';
      historyButton.dataset.historyKind=item[1];
      historyButton.textContent=item[0];
      historyButton.addEventListener('click',function(){
        if(viewState.historyKind===item[1])return;
        viewState.historyKind=item[1];
        viewState.historySelected[item[1]]=null;
        if(typeof window.renderAIAnalysisPanel==='function')window.renderAIAnalysisPanel();
        syncWorkspaceState();
      });
      historyModes.appendChild(historyButton);
    });
    var historyList=document.createElement('div');
    historyList.id='aiHistoryPeriodList';
    historyList.className='ai-history-period-list';
    historyToolbar.append(historyModes,historyList);

    summaryCard.classList.add('ai-workspace-summary-card');
    questionCard.classList.add('ai-workspace-question-dock');
    main.append(mainHead,historyToolbar,summaryCard,questionCard);

    var right=document.createElement('aside');
    right.className='ai-workspace-right';
    var rightTitle=document.createElement('div');
    rightTitle.className='ai-workspace-side-title';
    rightTitle.textContent='';
    rightTitle.hidden=true;
    cautionCard.classList.add('ai-workspace-status-card','is-caution');
    goodCard.classList.add('ai-workspace-status-card','is-good');
    checksCard.classList.add('ai-workspace-status-card','is-check');
    right.append(rightTitle,cautionCard,goodCard,checksCard);

    grid.append(main,right);
    panel.append(header,grid);
    syncWorkspaceState();
  }

  function syncWorkspacePosition(){
    /* Position is fully owned by external CSS for CSP compatibility. */
  }

  function syncWorkspaceState(){
    var mode=currentMode();
    var activePeriod=selectedPeriod();
    Array.prototype.forEach.call(document.querySelectorAll('.ai-workspace-period-btn'),function(button){
      if(button.dataset.analysisPeriod==='today')button.disabled=mode!=='daily';
      button.classList.toggle('active',button.dataset.analysisPeriod===activePeriod);
    });

    var historyToolbar=document.getElementById('aiHistoryToolbar');
    if(historyToolbar)historyToolbar.hidden=activePeriod!=='history';
    Array.prototype.forEach.call(document.querySelectorAll('.ai-history-mode-btn'),function(button){
      button.classList.toggle('active',button.dataset.historyKind===viewState.historyKind);
    });

    var heading=document.querySelector('.ai-workspace-section-title');
    if(heading){
      var labels={daily:'本日の分析',dashboard:'総合分析',sales:'売上分析',customers:'客数分析',waste:'廃棄分析',salesCounts:'販売・納品分析'};
      var base=labels[mode]||'分析サマリー';
      if(activePeriod==='week')heading.textContent='今週の'+base;
      else if(activePeriod==='month')heading.textContent=mode==='daily'?'今月の総合分析':'今月の'+base;
      else if(activePeriod==='history')heading.textContent=(viewState.historyKind==='month'?'月次履歴':'週次履歴');
      else heading.textContent=base;
    }
    if(window.InsightAnalysisPeriodLock&&typeof window.InsightAnalysisPeriodLock.refreshLabel==='function')window.InsightAnalysisPeriodLock.refreshLabel();
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
      function syncAndRender(){
        if(!window.InsightPagePeriodSync&&window.InsightAnalysisPeriodLock&&typeof window.InsightAnalysisPeriodLock.syncCurrentPage==='function'){
          window.InsightAnalysisPeriodLock.syncCurrentPage();
        }
        if(typeof window.renderAIAnalysisPanel==='function')window.renderAIAnalysisPanel();
      }
      if(window.InsightPagePeriodSync)setTimeout(syncAndRender,0);
      else if(typeof queueMicrotask==='function')queueMicrotask(syncAndRender);
      else setTimeout(syncAndRender,0);
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
