/* 「今日の入力」日付ナビ専用。入力画面の既存の描画・保存処理は再利用する。 */
(function(){
  'use strict';
  if(window.__insightQuickDateNavV1)return;
  var page=document.getElementById('pageQuick');
  var nav=document.getElementById('qNavRow');
  var grid=document.getElementById('quickGrid');
  var dateContext=window.InsightDateContext;
  if(!page||!nav||!grid||!dateContext||typeof window.renderQuickPage!=='function'||typeof window.saveQuick!=='function')return;
  window.__insightQuickDateNavV1=true;

  var selectedStore=allStores.current;
  var dirty=false;
  var week=['日','月','火','水','木','金','土'];
  var style=document.createElement('style');
  style.id='insightQuickDateNavStyle';
  style.textContent=[
    '#pageQuick #qNavRow{display:flex;align-items:center;gap:7px;margin-left:auto;margin-bottom:0;flex-shrink:0}',
    '#pageQuick #qNavRow .iqd-btn{height:42px;box-sizing:border-box;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);box-shadow:0 1px 4px var(--shadow2);font-family:inherit;cursor:pointer}',
    '#pageQuick #qNavRow .iqd-arrow{display:flex;align-items:center;justify-content:center;width:42px;flex-shrink:0;padding:0;font-size:25px;font-weight:400}',
    '#pageQuick #qNavRow .iqd-date{position:relative;display:flex;align-items:center;justify-content:center;gap:9px;width:218px;padding:3px 9px;overflow:hidden}',
    '#pageQuick #qNavRow .iqd-date-icon{width:20px;height:20px;flex-shrink:0;color:var(--text4)}',
    '#pageQuick #qNavRow .iqd-date-text{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0}',
    '#pageQuick #qNavRow .iqd-date-main{font-size:12px;line-height:1.25;font-weight:800;white-space:nowrap;color:var(--text)}',
    '#pageQuick #qNavRow .iqd-date-sub{font-size:9px;line-height:1.2;font-weight:500;white-space:nowrap;color:var(--text4)}',
    '#pageQuick #qNavRow .iqd-date-input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:1}',
    '#pageQuick #qNavRow .iqd-today{padding:0 14px;font-size:12px;font-weight:800;white-space:nowrap;flex-shrink:0}',
    '#pageQuick #qNavRow .iqd-btn:active{background:var(--surface2)}',
    '#pageQuick #qNavRow .iqd-date:focus-within{outline:2px solid var(--text4);outline-offset:2px}',
    '@media(max-width:850px){#pageQuick #qNavRow{margin-left:0}#pageQuick #qNavRow .iqd-date{width:195px}#pageQuick #qNavRow .iqd-arrow{width:36px}#pageQuick #qNavRow .iqd-today{padding:0 10px}}',
    '@media(max-width:450px){#pageQuick #qNavRow{gap:4px}#pageQuick #qNavRow .iqd-date{width:175px}#pageQuick #qNavRow .iqd-arrow{width:32px}#pageQuick #qNavRow .iqd-today{padding:0 8px;font-size:11px}#pageQuick #qNavRow .iqd-date-main{font-size:10px}}'
  ].join('');
  document.head.appendChild(style);

  function selectedDate(){return dateContext.getSelectedDate();}
  function todaySelected(){return dateContext.isToday();}
  function ensureRegisteredYear(date){
    if(!date||typeof date.getFullYear!=='function'||!Number.isFinite(date.getTime()))return false;
    var year=String(date.getFullYear()),manager=window.InsightYearManager;
    if(manager&&typeof manager.isCurrentRegistered==='function'&&manager.isCurrentRegistered(year))return true;
    if(!manager||typeof manager.promoteCurrent!=='function'){
      window.alert('この年度を追加する機能を使用できません。');
      return false;
    }
    if(!window.confirm(year+'年度はダッシュボードに登録されていません。\n年度を追加してこの日付を入力しますか？\n\n既にある過去データは保持したまま、未入力日を正常な空データで補完します。'))return false;
    try{
      manager.promoteCurrent(year);
      if(typeof renderYearPills==='function')renderYearPills();
      if(typeof showToast==='function')showToast('✓ '+year+'年度を追加しました','#15803d','#f0fdf4');
      return true;
    }catch(error){
      window.alert('年度を追加できませんでした。\n'+(error&&error.message?error.message:error));
      return false;
    }
  }
  function selectDate(date){
    if(!date||typeof date.getTime!=='function'||!Number.isFinite(date.getTime())||dateContext.iso(date)===dateContext.getSelectedIso())return;
    if(dirty&&!window.confirm('未保存の入力があります。\n保存せずに別の日付へ移動しますか？'))return;
    if(!ensureRegisteredYear(date))return;
    dateContext.setSelectedDate(date);
    quickEditDay=dateContext.getSelectedInfo().day;
    window.renderQuickNav();
    window.renderQuickPage();
    dirty=false;
  }
  window.renderQuickNav=function(){
    var date=selectedDate();
    var dateLabel=date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日（'+week[date.getDay()]+'）';
    nav.innerHTML='<button type="button" class="iqd-btn iqd-arrow" id="iqdPrev" aria-label="前日へ">‹</button>'+
      '<div class="iqd-btn iqd-date">'+
        '<svg class="iqd-date-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></svg>'+
        '<div class="iqd-date-text"><span class="iqd-date-main">'+dateLabel+'</span><span class="iqd-date-sub">タップして日付を選択</span></div>'+
        '<input id="iqdDateInput" class="iqd-date-input" type="date" value="'+dateContext.iso(date)+'" aria-label="入力する日付を選択">'+
      '</div>'+
      '<button type="button" class="iqd-btn iqd-arrow" id="iqdNext" aria-label="翌日へ">›</button>'+
      '<button type="button" class="iqd-btn iqd-today" id="iqdToday">今日に戻る</button>';
    document.getElementById('iqdPrev').onclick=function(){var date=selectedDate();selectDate(new Date(date.getFullYear(),date.getMonth(),date.getDate()-1));};
    document.getElementById('iqdNext').onclick=function(){var date=selectedDate();selectDate(new Date(date.getFullYear(),date.getMonth(),date.getDate()+1));};
    document.getElementById('iqdToday').onclick=function(){selectDate(new Date());};
    document.getElementById('iqdDateInput').addEventListener('change',function(){
      var date=dateContext.parseIso(this.value);
      if(date)selectDate(date);
      this.value=dateContext.getSelectedIso();
    });
  };
  window.initQuickPage=function(){
    todayInfo=todayFY();
    if(selectedStore!==allStores.current){
      selectedStore=allStores.current;
      dateContext.resetToToday();
      dirty=false;
    }
    quickEditDay=dateContext.getSelectedInfo().day;
    document.getElementById('todayBadge').textContent='今日';
    window.renderQuickNav();
    window.renderQuickPage();
    if(todaySelected()){
      var t=todayFY(),row=store.data[t.fy]&&store.data[t.fy][t.month]&&store.data[t.fy][t.month][t.day-1];
      if(!row||!row.weather)fetchWeather();
    }
  };
  grid.addEventListener('input',function(){dirty=true;});
  grid.addEventListener('change',function(){dirty=true;});
  page.addEventListener('click',function(event){
    if(event.target&&event.target.closest&&event.target.closest('.wx-btn,#autoWxBtn'))dirty=true;
  });
  if(window.InsightHooks){
    window.InsightHooks.on('quick:save:after','quick-date-clear-dirty',function(){dirty=false;},30);
  }
  window.clearTodayData=function(){
    var t=dateContext.getSelectedInfo(),rows=store.data[t.fy]&&store.data[t.fy][t.month];
    var target=t.fy+'年'+t.month+t.day+'日';
    if(!window.confirm(store.name+' の '+target+'の入力データを削除します。\n売上・客数・買上点数・廃棄・店舗メモをクリアし、天気・店舗イベント（共通セールを含む）は保持します。\n\nこの操作は元に戻せません。よろしいですか？'))return;
    if(!rows||!rows[t.day-1])return;
    var row=rows[t.day-1];
    row.売上=0;row.客数=0;row.買上点数=0;row.廃棄金額=0;
    row.haiki=blankHaiki();delete row.storeMemo;
    persist();dirty=false;
    window.renderQuickNav();window.renderQuickPage();updateMissingBadge();
    showToast('🗑 '+target+'の入力データをクリアしました','#dc2626','#fef2f2');
  };
  if(typeof currentNav!=='undefined'&&currentNav===0)window.renderQuickNav();
})();
