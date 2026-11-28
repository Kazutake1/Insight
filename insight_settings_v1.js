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

  function addStyle(){ /* Static rules live in insight_payload_core_v1.css for CSP. */ }

  function measureSettingsUnits(storage){
    var settingsUnits=0;
    var keyCount=storage.length;
    for(var i=0;i<keyCount;i++){
      var key=storage.key(i);
      if(key===null)throw new Error('Storage changed during measurement');
      if(key==='insight_v11'||!key.startsWith('insight_'))continue;
      var value=storage.getItem(key);
      if(value===null)throw new Error('Storage changed during measurement');
      settingsUnits+=value.length;
    }
    return settingsUnits;
  }

  function appendBackupCapacity(result,snapshot,adopted){
    var section=doc.createElement('section');
    section.className='insight-backup-usage';
    var title=doc.createElement('strong');
    title.textContent='バックアップ容量（暗号化前）';
    section.append(title);
    function line(text){
      var element=doc.createElement('p');
      element.textContent=text;
      section.append(element);
    }
    if(snapshot===null){
      line('店舗データが未保存です。');
    }else{
      var usage=root.InsightBackupCapacityV1.measure(snapshot,adopted);
      var bytes=usage.bytes,limit=usage.limit,ratio=bytes/limit;
      var used=bytes===limit?'100':(ratio*100).toFixed(2);
      var status=bytes>limit?'exceeded':bytes===limit?'full':bytes*5>=limit*4?'near':'normal';
      function formatBytes(value){
        return value>0&&value<1048.576?'0.001 MiB未満':(value/1048576).toFixed(3)+' MiB';
      }
      line('使用量 '+formatBytes(bytes)+' / '+formatBytes(limit)+'（'+used+'%）');
      line('残り '+formatBytes(Math.max(0,limit-bytes)));
      var bar=doc.createElement('progress');
      bar.setAttribute('aria-label','バックアップ容量の使用率');
      bar.dataset.status=status;
      bar.max=limit;
      bar.value=Math.min(bytes,limit);
      section.append(bar);
      if(status==='near')line('注意：バックアップ上限の80%以上を使用しています。');
      if(status==='full')line('バックアップ上限に達しています。容量上は作成できます。');
      if(status==='exceeded')line('警告：バックアップ上限を超えているため、作成できません。');
    }
    result.append(section);
  }

  function addCapacityCheck(actions){
    var button=doc.createElement('button');
    button.type='button';
    button.className='sidebar-btn';
    button.textContent='保存容量を確認';
    button.setAttribute('aria-controls','insightStorageUsage');
    var result=doc.createElement('div');
    result.id='insightStorageUsage';
    result.setAttribute('role','status');
    var estimate=doc.createElement('details');
    estimate.className='insight-settings-disclosure insight-capacity-estimate';
    var summary=doc.createElement('summary');
    summary.textContent='容量の詳細（概算）';
    var estimateBody=doc.createElement('div');
    var estimateNote=doc.createElement('small');
    estimateNote.textContent='概算値です。端末の空き容量・予測用記録は含みません。';
    estimate.append(summary,estimateBody,estimateNote);
    estimate.hidden=true;
    var scope=doc.createElement('small');
    scope.textContent='端末の空き容量やIndexedDBの保存可能量は含みません。';
    var adopted=root.InsightIndexedDBCandidateV1?.isAdopted()===true;

    function appendUnsavedNotice(){
      var dirty=root.InsightQuickDateNavV1?.hasUnsavedInput?.()||
        root.InsightSalesCount?.hasUnsavedInput?.()||root.InsightInputDayNav?.hasUnsavedInput?.()||
        root.InsightIndexedDBSalesInputPreviewV1?.getConnectedStatus?.()?.hasUnsavedInput;
      if(dirty){
        var notice=doc.createElement('p');
        notice.textContent='未保存の入力があります。計測対象は保存済みデータです。';
        result.append(notice);
      }
    }

    function format(units){
      return (units*2/1048576).toFixed(3)+' MiB';
    }
    var measuring=false;
    button.addEventListener('click',async function(){
      if(measuring)return;
      measuring=true;
      try{
        var storage=root.localStorage;
        var raw,snapshot;
        if(adopted){
          var committed=await root.InsightIndexedDBSalesInputPreviewV1.readCommittedView();
          snapshot=committed.snapshot;
          raw=root.InsightStorage.serialize(snapshot);
        }else{
          raw=storage.getItem('insight_v11');
        }
        var primary=raw===null?null:raw.length;
        var settingsUnits=measureSettingsUnits(storage);
        var labels=[
          '店舗データ（全店舗）：'+(primary===null?'未保存':format(primary)),
          'その他の設定：'+format(settingsUnits),
          '合計（概算）：'+format((primary===null?0:primary)+settingsUnits)
        ];
        result.replaceChildren();
        try{
          if(!adopted&&raw!==null){
            snapshot=JSON.parse(raw);
            if(snapshot===null)throw new Error('Invalid saved snapshot');
          }
          appendBackupCapacity(result,raw===null?null:snapshot,adopted);
        }catch(_){
          var unavailable=doc.createElement('p');
          unavailable.textContent='バックアップ容量を計測できません。';
          result.append(unavailable);
        }
        appendUnsavedNotice();
        estimateBody.replaceChildren(...labels.map(function(label){
          var line=doc.createElement('div');
          line.textContent=label;
          return line;
        }));
        estimate.hidden=false;
      }catch(_){
        result.textContent='容量を確認できません。';
        estimate.hidden=true;
        appendUnsavedNotice();
      }finally{
        measuring=false;
      }
    });
    actions.append(button,result,scope,estimate);
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
        '<section class="insight-settings-section"><h2>データ管理</h2><div id="insightSettingsDataActions" class="insight-settings-actions"></div></section>'+
        '<div><details class="insight-settings-section insight-settings-disclosure" id="insightSettingsDetails">'+
          '<summary>詳細設定</summary><div id="insightSettingsDetailContent">'+
            '<div id="insightSettingsDetailActions" class="insight-settings-actions"></div>'+
          '</div>'+
        '</details><div id="insightSettingsDetailStatus"></div></div>'+
      '</div>';

    main.appendChild(page);
    var restoreSafety=doc.createElement('label');
    restoreSafety.className='insight-theme-toggle';
    restoreSafety.innerHTML='<span>復元直前の安全バックアップを保存する（任意）</span><span class="insight-theme-switch"><input id="insightRestoreSafetyBackup" type="checkbox" role="switch"><span class="insight-restore-safety-switch-track"></span></span>';
    // Always start unchecked; never persist this optional choice across visits.
    restoreSafety.querySelector('#insightRestoreSafetyBackup').checked=false;
    page.querySelector('#insightSettingsDataActions').append(backup,restore,restoreSafety,health,restoreFile);
    page.querySelector('#insightSettingsDetailActions').append(csv);
    page.querySelector('#insightSettingsDetailStatus').append(csvFile);
    addCapacityCheck(page.querySelector('#insightSettingsDataActions'));
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
    dark.tabIndex=-1;
    dark.classList.add('insight-settings-legacy-hidden');
    var themeBridge=doc.createElement('div');
    themeBridge.id='insightThemeBridge';
    themeBridge.hidden=true;
    themeBridge.setAttribute('aria-hidden','true');
    themeBridge.classList.add('insight-settings-legacy-hidden');
    themeBridge.append(dark);
    doc.body.append(themeBridge);
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
