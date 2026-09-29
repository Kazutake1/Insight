/* Input weather/temperature reference v1: read-only weather + high/low on sales/customer pages. */
(function(root){
  'use strict';
  if(root.__insightInputWeatherTempV1)return;
  root.__insightInputWeatherTempV1=true;

  function finite(value){
    if(value===null||value===undefined||value==='')return null;
    var n=Number(value);
    return Number.isFinite(n)?n:null;
  }

  function fmtTemp(value){
    var n=finite(value);
    if(n===null)return '—';
    return Number.isInteger(n)?String(n):String(Math.round(n*10)/10);
  }

  function iconFor(row){
    var wx=row&&row.weather?String(row.weather):'';
    try{return (WX_ICONS&&WX_ICONS[wx])||'';}catch(_){return '';}
  }

  function tempPair(row,spaced){
    var max=fmtTemp(row&&row.tempMaxC);
    var min=fmtTemp(row&&row.tempMinC);
    return spaced?(max+' / '+min+'℃'):(max+'/'+min+'℃');
  }

  function displayText(row,spaced){
    var icon=iconFor(row);
    var pair=tempPair(row,!!spaced);
    return (icon?icon+' ':'')+pair;
  }

  function ensureStyle(){
    if(document.getElementById('insightInputWeatherTempV1Style'))return;
    var style=document.createElement('style');
    style.id='insightInputWeatherTempV1Style';
    style.textContent=[
      '.iwt-ref{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text2);font-size:13px;font-weight:700;white-space:nowrap}',
      '.iwt-ref .iwt-icon{font-size:18px;line-height:1}',
      '.iwt-ref .iwt-temp{font-variant-numeric:tabular-nums}',
      '.iwt-sales-list{font-size:9.5px;font-weight:700;color:var(--text4);white-space:nowrap;margin-left:3px;vertical-align:1px}',
      '.haiki-day-btn.sel .iwt-sales-list{color:rgba(255,255,255,.72)}',
      '.kyaku-wx.iwt-kyaku{display:flex;align-items:center;justify-content:center;gap:3px;font-size:12px;white-space:nowrap}',
      '.kyaku-wx.iwt-kyaku .iwt-icon{font-size:14px;line-height:1}',
      '.kyaku-wx.iwt-kyaku .iwt-temp{font-size:9.5px;font-weight:700;color:var(--text4);font-variant-numeric:tabular-nums}',
      '@media(max-width:700px){.iwt-sales-list{font-size:9px}.kyaku-wx.iwt-kyaku .iwt-temp{font-size:9px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function decorateSalesList(){
    var list=document.getElementById('salesDayList');
    if(!list||typeof drafts==='undefined'||!drafts.sales)return;
    Array.prototype.forEach.call(list.querySelectorAll('.haiki-day-btn'),function(btn,ri){
      var row=drafts.sales[ri]||{};
      var num=btn.querySelector('.hdb-num');
      if(!num)return;
      var day=(row.d!=null?String(row.d):String(ri+1))+'日';
      var icon=iconFor(row);
      num.innerHTML=day+
        (icon?' <span class="iwt-icon">'+icon+'</span>':'')+
        ' <span class="iwt-sales-list">'+tempPair(row,false)+'</span>';
    });
  }

  function decorateSalesForm(day){
    var form=document.getElementById('salesForm');
    if(!form||typeof drafts==='undefined'||!drafts.sales)return;
    var ri=Math.max(0,(Number(day)||Number(root.salesSelDay)||1)-1);
    var row=drafts.sales[ri]||{};
    var firstWeatherButton=form.querySelector('[id^="swx_"]');
    var section=firstWeatherButton&&firstWeatherButton.parentElement&&firstWeatherButton.parentElement.parentElement;
    if(!section)return;
    var icon=iconFor(row);
    section.innerHTML=
      '<div class="iwt-ref" aria-label="天気と最高最低気温">'+
        (icon?'<span class="iwt-icon">'+icon+'</span>':'')+
        '<span class="iwt-temp">'+tempPair(row,true)+'</span>'+
      '</div>';
  }

  function decorateKyakuGrid(){
    var grid=document.getElementById('kyakuGrid');
    if(!grid||typeof drafts==='undefined'||!drafts.kyaku)return;
    Array.prototype.forEach.call(grid.querySelectorAll('.kyaku-day-card:not(.empty)'),function(card){
      var input=card.querySelector('input.kyaku-input');
      if(!input)return;
      var ri=Number(input.dataset.ri);
      if(!Number.isFinite(ri))return;
      var row=drafts.kyaku[ri]||{};
      var wx=card.querySelector('.kyaku-wx');
      if(!wx)return;
      var icon=iconFor(row);
      wx.classList.add('iwt-kyaku');
      wx.innerHTML=
        (icon?'<span class="iwt-icon">'+icon+'</span>':'')+
        '<span class="iwt-temp">'+tempPair(row,false)+'</span>';
    });
  }

  ensureStyle();

  var oldSalesList=root.renderSalesDayList;
  if(typeof oldSalesList==='function'){
    root.renderSalesDayList=function(){
      var result=oldSalesList.apply(this,arguments);
      decorateSalesList();
      return result;
    };
  }

  var oldSalesForm=root.renderSalesForm;
  if(typeof oldSalesForm==='function'){
    root.renderSalesForm=function(fy,mi,day){
      var result=oldSalesForm.apply(this,arguments);
      decorateSalesForm(day);
      return result;
    };
  }

  var oldKyakuGrid=root.renderKyakuGrid;
  if(typeof oldKyakuGrid==='function'){
    root.renderKyakuGrid=function(){
      var result=oldKyakuGrid.apply(this,arguments);
      decorateKyakuGrid();
      return result;
    };
  }

  root.InsightInputWeatherTemp={
    fmtTemp:fmtTemp,
    tempPair:tempPair,
    displayText:displayText,
    decorateSalesList:decorateSalesList,
    decorateSalesForm:decorateSalesForm,
    decorateKyakuGrid:decorateKyakuGrid
  };
})(typeof window!=='undefined'?window:globalThis);
