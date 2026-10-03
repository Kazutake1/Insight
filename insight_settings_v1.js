/* Settings page v1: move sidebar utility actions into one dedicated page without changing their behavior. */
(function(root){
  'use strict';
  if(root.InsightSettings)return;

  var model={};
  root.InsightSettings=model;
  if(!root.document)return;

  var doc=root.document;

  function byText(container,pattern){
    if(!container)return null;
    return Array.prototype.slice.call(container.querySelectorAll('button,label,a')).find(function(node){
      return pattern.test(String(node.textContent||''));
    })||null;
  }

  function addStyle(){
    if(doc.getElementById('insightSettingsStyle'))return;
    var style=doc.createElement('style');
    style.id='insightSettingsStyle';
    style.textContent=[
      '.sidebar-btn.insight-settings-nav.active{background:var(--text);color:#fff}',
      '.sidebar-btn.insight-settings-nav.active .nav-icon{opacity:1}',
      '.dark .sidebar-btn.insight-settings-nav.active{background:#e0e0e8;color:#111}',
      '.insight-settings-page{overflow:auto}',
      '.insight-settings-content{display:grid;gap:14px;max-width:760px;width:100%}',
      '.insight-settings-section{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:16px}',
      '.insight-settings-section h2{margin:0 0 5px;font-size:15px;color:var(--text)}',
      '.insight-settings-section>p{margin:0 0 12px;color:var(--text4);font-size:11px;line-height:1.55}',
      '.insight-settings-actions{display:grid;gap:8px}',
      '.insight-settings-actions .sidebar-btn,#pageSettings #insightDataHealthButton{display:flex;width:100%;box-sizing:border-box;align-items:center;gap:9px;margin:0;padding:11px 12px;border:1px solid var(--border);border-radius:11px;background:var(--surface2);color:var(--text3);font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;text-align:left;cursor:pointer}',
      '.insight-settings-actions .sidebar-btn:hover,#pageSettings #insightDataHealthButton:hover{background:var(--surface3)}',
      '#pageSettings #insightDataHealthButton{color:#15803d}',
      '.dark #pageSettings #insightDataHealthButton{color:#86efac}',
      '.insight-settings-actions .sidebar-btn-sub{font-size:9px;color:var(--text5)}',
      '.insight-theme-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 8px;border:0;background:transparent;color:var(--text3);font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif}',
      '.insight-theme-icon{display:block;width:18px;height:18px;flex:0 0 18px}',
      '.insight-theme-switch{position:relative;width:42px;height:24px;flex:0 0 auto}',
      '.insight-theme-switch input{position:absolute;opacity:0;pointer-events:none}',
      '.insight-theme-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--border);transition:.18s ease;cursor:pointer}',
      '.insight-theme-switch-track:after{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:var(--surface);box-shadow:0 1px 3px rgba(0,0,0,.22);transition:.18s ease}',
      '.insight-theme-switch input:checked+.insight-theme-switch-track{background:var(--text)}',
      '.insight-theme-switch input:checked+.insight-theme-switch-track:after{transform:translateX(18px)}',
      '.insight-theme-switch input:focus-visible+.insight-theme-switch-track{outline:2px solid var(--text3);outline-offset:2px}',
      '@media(max-width:800px){.insight-settings-content{max-width:none}.insight-settings-section{padding:13px}}'
    ].join('');
    doc.head.appendChild(style);
  }

  function build(){
    var sidebarActions=doc.querySelector('.sidebar-btns');
    var main=doc.getElementById('main');
    if(!sidebarActions||!main)return false;

    var backup=doc.getElementById('backupBtn');
    var restore=byText(sidebarActions,/データ復元/);
    var health=doc.getElementById('insightDataHealthButton');
    var dark=doc.getElementById('darkModeBtn');
    var csv=byText(sidebarActions,/CSVインポート/);
    var restoreFile=doc.getElementById('restoreFile');
    var csvFile=doc.getElementById('csvImportFile');
    if(!backup||!restore||!health||!dark||!csv||!restoreFile||!csvFile)return false;

    addStyle();

    var nav=doc.createElement('button');
    nav.id='navSettings';
    nav.type='button';
    nav.className='sidebar-btn nav-btn insight-settings-nav';
    nav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h-.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.08.36.29.69.6 1 .3.3.69.52 1.1.6h.1v4h-.1c-.41.08-.8.3-1.1.6-.31.31-.52.64-.6 1z"/></svg><span>設定</span>';
    nav.onclick=function(){root.gotoNav('settings');};

    var page=doc.createElement('div');
    page.id='pageSettings';
    page.className='page insight-settings-page';
    page.innerHTML='<div class="page-header"><div class="page-title">設定</div></div>'+
      '<div class="insight-settings-content">'+
        '<section class="insight-settings-section"><h2>データ管理</h2><p>バックアップ、復元、保存データの状態確認、CSVインポートを管理します。</p><div id="insightSettingsDataActions" class="insight-settings-actions"></div></section>'+
      '</div>';

    main.appendChild(page);
    page.querySelector('#insightSettingsDataActions').append(backup,restore,health,csv,restoreFile,csvFile);
    var themeWrap=doc.createElement('div');
    themeWrap.className='insight-theme-toggle';
    themeWrap.innerHTML='<svg class="insight-theme-icon insight-theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg><label class="insight-theme-switch" aria-label="ライト／ダークモード"><input id="insightThemeToggle" type="checkbox" role="switch"><span class="insight-theme-switch-track"></span></label><svg class="insight-theme-icon insight-theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    var themeInput=themeWrap.querySelector('#insightThemeToggle');
    function syncThemeToggle(){
      themeInput.checked=doc.documentElement.classList.contains('dark')||!!(doc.body&&doc.body.classList.contains('dark'));
    }
    syncThemeToggle();
    themeInput.addEventListener('change',function(){
      var before=doc.documentElement.classList.contains('dark')||!!(doc.body&&doc.body.classList.contains('dark'));
      if(themeInput.checked!==before)dark.click();
      setTimeout(syncThemeToggle,0);
    });
    var themeObserver=new MutationObserver(syncThemeToggle);
    themeObserver.observe(doc.documentElement,{attributes:true,attributeFilter:['class']});
    if(doc.body)themeObserver.observe(doc.body,{attributes:true,attributeFilter:['class']});
    dark.hidden=true;
    dark.setAttribute('aria-hidden','true');
    page.append(dark);
    sidebarActions.replaceChildren(themeWrap,nav);

    var originalGoto=root.gotoNav;
    root.gotoNav=function(target){
      if(target==='settings'){
        if(typeof currentNav!=='undefined'&&currentNav==='salesCounts'&&root.InsightSalesCount&&root.InsightSalesCount.confirmLeave&&!root.InsightSalesCount.confirmLeave())return;
        doc.querySelectorAll('.nav-btn').forEach(function(node){node.classList.remove('active');});
        doc.querySelectorAll('.page').forEach(function(node){node.classList.remove('show');});
        nav.classList.add('active');
        page.classList.add('show');
        currentNav='settings';
        if(root.InsightDataHealth&&typeof root.InsightDataHealth.refresh==='function')root.InsightDataHealth.refresh();
        return;
      }
      if(typeof currentNav!=='undefined'&&currentNav==='settings'){
        nav.classList.remove('active');
        page.classList.remove('show');
      }
      return originalGoto.apply(this,arguments);
    };

    var originalSwitch=root.switchStore;
    root.switchStore=function(id){
      if(typeof currentNav==='undefined'||currentNav!=='settings')return originalSwitch.apply(this,arguments);
      var result;
      currentNav=1;
      try{result=originalSwitch.apply(this,arguments);}
      finally{currentNav='settings';}
      doc.querySelectorAll('.nav-btn').forEach(function(node){node.classList.remove('active');});
      doc.querySelectorAll('.page').forEach(function(node){node.classList.remove('show');});
      nav.classList.add('active');
      page.classList.add('show');
      if(root.InsightDataHealth&&typeof root.InsightDataHealth.refresh==='function')root.InsightDataHealth.refresh();
      return result;
    };

    model.open=function(){root.gotoNav('settings');};
    model.page=page;
    model.nav=nav;
    return true;
  }

  function init(){
    if(build())return;
    var attempts=0,timer=setInterval(function(){attempts++;if(build()||attempts>=50)clearInterval(timer);},100);
  }

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
