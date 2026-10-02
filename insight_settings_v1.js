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
        '<section class="insight-settings-section"><h2>表示設定</h2><p>Insightの表示方法を変更します。</p><div id="insightSettingsDisplayActions" class="insight-settings-actions"></div></section>'+
      '</div>';

    main.appendChild(page);
    page.querySelector('#insightSettingsDataActions').append(backup,restore,health,csv,restoreFile,csvFile);
    page.querySelector('#insightSettingsDisplayActions').append(dark);
    sidebarActions.replaceChildren(nav);

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
