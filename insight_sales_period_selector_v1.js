/* Sales period selector v1: compact year/month navigation for the sales input page only. */
(function(root){
  'use strict';
  if(root.InsightSalesPeriodSelector)return;

  function monthNumber(value){
    if(Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12)return Number(value);
    var m=/^(\d{1,2})月$/.exec(String(value||''));
    if(!m)return null;
    var month=Number(m[1]);
    return month>=1&&month<=12?month:null;
  }
  function validYear(value){
    var year=Number(value);
    return Number.isInteger(year)&&year>=1000&&year<=9999?year:null;
  }
  function normalizeYears(values){
    var out=[],seen={};
    (Array.isArray(values)?values:[]).forEach(function(value){
      var year=validYear(value);
      if(year&&!seen[year]){seen[year]=true;out.push(year);}
    });
    return out.sort(function(a,b){return a-b;});
  }
  function adjacentPeriod(year,month,delta,years){
    year=validYear(year);month=monthNumber(month);delta=Number(delta);
    if(!year||!month||(delta!==-1&&delta!==1))return null;
    var nextMonth=month+delta,nextYear=year;
    if(nextMonth<1){nextMonth=12;nextYear--;}
    if(nextMonth>12){nextMonth=1;nextYear++;}
    return normalizeYears(years).indexOf(nextYear)>=0?{year:nextYear,month:nextMonth}:null;
  }

  var model={
    VERSION:1,
    monthNumber:monthNumber,
    validYear:validYear,
    normalizeYears:normalizeYears,
    adjacentPeriod:adjacentPeriod
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSalesPeriodSelector=model;
  if(!root.document)return;

  var doc=root.document,page=doc.getElementById('pageSales');
  if(!page)return;

  var css=doc.createElement('style');
  css.id='insightSalesPeriodSelectorStyle';
  css.textContent=[
    '#pageSales #insightSalesPeriodBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 16px;min-height:42px}',
    '#pageSales #insightSalesPeriodBar button{font:700 14px/1.2 inherit;font-family:inherit;min-height:40px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;box-sizing:border-box}',
    '#pageSales #insightSalesPeriodPrev,#pageSales #insightSalesPeriodNext{width:42px;padding:0;font-size:22px;font-weight:500}',
    '#pageSales #insightSalesPeriodCurrent{min-width:160px;padding:0 18px;background:#1d1d1f;color:#fff;border-color:#1d1d1f;font-size:15px;letter-spacing:.01em}',
    '.dark #pageSales #insightSalesPeriodCurrent{background:#5a3038;border-color:#5a3038;color:#fff}',
    '#pageSales #insightSalesPeriodToday{padding:0 15px;color:var(--text2)}',
    '#pageSales #insightSalesPeriodBar button:disabled{opacity:.32;cursor:not-allowed}',
    '#pageSales .insight-sales-period-legacy-hidden{display:none!important}',
    '#insightSalesPeriodOverlay{position:fixed;inset:0;z-index:26000;background:rgba(0,0,0,.46);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}',
    '#insightSalesPeriodOverlay[hidden]{display:none!important}',
    '#insightSalesPeriodDialog{width:min(100%,430px);box-sizing:border-box;padding:22px;border-radius:18px;background:var(--surface,#fff);color:var(--text,#222);box-shadow:0 22px 70px rgba(0,0,0,.28);font-family:inherit}',
    '#insightSalesPeriodDialog h2{margin:0 0 18px;font-size:19px;line-height:1.4}',
    '#insightSalesPeriodDialog label{display:block;margin:0 0 6px;font-size:12px;font-weight:750;color:var(--text3,#666)}',
    '#insightSalesPeriodYear{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--border,#ccc);border-radius:10px;background:var(--surface2,#fff);color:var(--text,#222);font:700 15px/1.2 inherit;font-family:inherit}',
    '#insightSalesPeriodMonths{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:18px 0}',
    '#insightSalesPeriodMonths button{min-height:42px;border:1px solid var(--border,#ccc);border-radius:10px;background:var(--surface2,#fff);color:var(--text,#222);font:700 14px/1.2 inherit;font-family:inherit;cursor:pointer}',
    '#insightSalesPeriodMonths button.is-selected{background:#1d1d1f;color:#fff;border-color:#1d1d1f}',
    '.dark #insightSalesPeriodMonths button.is-selected{background:#5a3038;border-color:#5a3038}',
    '#insightSalesPeriodAddToggle{border:0;background:transparent;color:var(--text2,#555);font:700 13px/1.2 inherit;font-family:inherit;padding:5px 0;cursor:pointer}',
    '#insightSalesPeriodAddWrap{display:flex;gap:8px;margin-top:10px}',
    '#insightSalesPeriodAddWrap[hidden]{display:none!important}',
    '#insightSalesPeriodAddInput{min-width:0;flex:1;padding:10px 11px;border:1px solid var(--border,#ccc);border-radius:9px;background:var(--surface2,#fff);color:var(--text,#222);font:600 14px/1.2 inherit;font-family:inherit}',
    '#insightSalesPeriodAddButton{padding:0 14px;border:1px solid var(--border,#ccc);border-radius:9px;background:var(--surface2,#fff);color:var(--text,#222);font:700 13px/1.2 inherit;font-family:inherit;cursor:pointer}',
    '#insightSalesPeriodActions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}',
    '#insightSalesPeriodActions button{min-height:40px;padding:0 15px;border-radius:10px;font:700 13px/1.2 inherit;font-family:inherit;cursor:pointer}',
    '#insightSalesPeriodCancel{background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#ccc)}',
    '#insightSalesPeriodApply{background:#1d1d1f;color:#fff;border:1px solid #1d1d1f}',
    '.dark #insightSalesPeriodApply{background:#5a3038;border-color:#5a3038}',
    '@media(max-width:600px){#pageSales #insightSalesPeriodBar{gap:6px;margin-bottom:12px}#pageSales #insightSalesPeriodCurrent{min-width:145px;padding:0 12px}#pageSales #insightSalesPeriodToday{padding:0 10px}#insightSalesPeriodDialog{padding:18px}}'
  ].join('');
  doc.head.appendChild(css);

  var bar=null,overlay=null,yearSelect=null,monthGrid=null,addWrap=null,addInput=null;
  var modalYear=null,modalMonth=null,scheduled=false;

  function currentStore(){
    try{return typeof allStores!=='undefined'&&allStores&&allStores.stores?allStores.stores[allStores.current]:null;}catch(_){return null;}
  }
  function years(){var value=currentStore();return normalizeYears(value&&value.years);}
  function currentPeriod(){
    try{
      var y=validYear(editYear&&editYear.sales),m=monthNumber(editMonth&&editMonth.sales);
      return y&&m?{year:y,month:m}:null;
    }catch(_){return null;}
  }
  function monthLabel(month){
    try{if(typeof MONTHS!=='undefined'&&Array.isArray(MONTHS)&&MONTHS[month-1])return MONTHS[month-1];}catch(_){}
    return String(month)+'月';
  }
  function applyPeriod(year,month){
    year=validYear(year);month=monthNumber(month);
    if(!year||!month||years().indexOf(year)<0)return false;
    if(root.InsightPagePeriodSync&&typeof root.InsightPagePeriodSync.setTarget==='function'&&typeof root.InsightPagePeriodSync.syncCurrentPage==='function'){
      root.InsightPagePeriodSync.setTarget({year:year,month:month,source:'salesPeriodSelector'});
      root.InsightPagePeriodSync.syncCurrentPage();
    }else{
      try{
        editYear.sales=typeof editYear.sales==='number'?year:String(year);
        editMonth.sales=monthLabel(month);
        if(typeof initInputPage==='function')initInputPage('sales');
      }catch(_){return false;}
    }
    scheduleSync();
    return true;
  }

  function commonParent(nodes){
    if(!nodes.length)return null;
    var parent=nodes[0].parentElement;
    return parent&&nodes.every(function(node){return node.parentElement===parent;})?parent:null;
  }
  function buttonText(node){return String(node&&node.textContent||'').trim();}
  function legacyButtons(regex){
    return Array.prototype.filter.call(page.querySelectorAll('button,[role="button"]'),function(node){
      return !node.closest('#insightSalesPeriodBar')&&!node.closest('#insightSalesPeriodOverlay')&&regex.test(buttonText(node));
    });
  }
  function markHidden(node){
    if(node&&node!==page&&!node.classList.contains('page-header'))node.classList.add('insight-sales-period-legacy-hidden');
  }
  function hideLegacyControls(){
    var yButtons=legacyButtons(/^\d{4}年$/),mButtons=legacyButtons(/^(?:[1-9]|1[0-2])月$/);
    var yp=commonParent(yButtons),mp=commonParent(mButtons);
    if(yp&&mp&&yp!==mp&&!yp.contains(mp)&&!mp.contains(yp)){
      markHidden(yp);markHidden(mp);
    }else{
      yButtons.forEach(markHidden);mButtons.forEach(markHidden);
      Array.prototype.forEach.call(page.querySelectorAll('input'),function(input){
        var hint=String(input.placeholder||'')+' '+String(input.getAttribute('aria-label')||'');
        if(/年度/.test(hint))markHidden(input);
      });
      Array.prototype.forEach.call(page.querySelectorAll('button'),function(button){
        var text=buttonText(button);
        if(/年度追加/.test(text)||(text==='追加'&&button.parentElement&&button.parentElement.querySelector('input')))markHidden(button);
      });
    }
  }

  function ensureBar(){
    if(bar&&bar.isConnected)return true;
    var header=page.querySelector(':scope > .page-header')||page.querySelector('.page-header');
    if(!header)return false;
    bar=doc.createElement('div');bar.id='insightSalesPeriodBar';bar.setAttribute('aria-label','売上入力の対象年月');
    bar.innerHTML='<button type="button" id="insightSalesPeriodPrev" aria-label="前月へ">‹</button><button type="button" id="insightSalesPeriodCurrent" aria-haspopup="dialog"></button><button type="button" id="insightSalesPeriodNext" aria-label="次月へ">›</button><button type="button" id="insightSalesPeriodToday">今月へ</button>';
    header.insertAdjacentElement('afterend',bar);
    bar.querySelector('#insightSalesPeriodPrev').addEventListener('click',function(){var p=currentPeriod(),next=p&&adjacentPeriod(p.year,p.month,-1,years());if(next)applyPeriod(next.year,next.month);});
    bar.querySelector('#insightSalesPeriodNext').addEventListener('click',function(){var p=currentPeriod(),next=p&&adjacentPeriod(p.year,p.month,1,years());if(next)applyPeriod(next.year,next.month);});
    bar.querySelector('#insightSalesPeriodCurrent').addEventListener('click',openDialog);
    bar.querySelector('#insightSalesPeriodToday').addEventListener('click',function(){
      var now=new Date(),year=now.getFullYear();
      if(years().indexOf(year)>=0)applyPeriod(year,now.getMonth()+1);
    });
    return true;
  }

  function syncBar(){
    if(!ensureBar())return;
    var p=currentPeriod(),list=years();
    if(!p)return;
    var current=bar.querySelector('#insightSalesPeriodCurrent');
    var label=String(p.year)+'年 '+String(p.month)+'月 ▼';
    if(current.textContent!==label)current.textContent=label;
    bar.querySelector('#insightSalesPeriodPrev').disabled=!adjacentPeriod(p.year,p.month,-1,list);
    bar.querySelector('#insightSalesPeriodNext').disabled=!adjacentPeriod(p.year,p.month,1,list);
    var now=new Date();
    var today=bar.querySelector('#insightSalesPeriodToday');
    today.disabled=list.indexOf(now.getFullYear())<0;
    today.title=today.disabled?'現在の年度が登録されていません':'現在の年月へ移動';
  }

  function refreshYearOptions(selected){
    if(!yearSelect)return;
    var list=years();
    yearSelect.replaceChildren();
    list.forEach(function(year){
      var option=doc.createElement('option');option.value=String(year);option.textContent=String(year)+'年';yearSelect.appendChild(option);
    });
    if(list.indexOf(Number(selected))>=0)yearSelect.value=String(selected);
  }
  function refreshMonthButtons(){
    if(!monthGrid)return;
    Array.prototype.forEach.call(monthGrid.querySelectorAll('button[data-month]'),function(button){
      var selected=Number(button.dataset.month)===Number(modalMonth);
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',selected?'true':'false');
    });
  }
  function closeDialog(){
    if(!overlay)return;
    overlay.hidden=true;
    if(bar&&bar.isConnected)bar.querySelector('#insightSalesPeriodCurrent').focus();
  }
  function ensureDialog(){
    if(overlay)return;
    overlay=doc.createElement('div');overlay.id='insightSalesPeriodOverlay';overlay.hidden=true;
    overlay.innerHTML='<div id="insightSalesPeriodDialog" role="dialog" aria-modal="true" aria-labelledby="insightSalesPeriodHeading"><h2 id="insightSalesPeriodHeading">年月を選択</h2><label for="insightSalesPeriodYear">年</label><select id="insightSalesPeriodYear"></select><div id="insightSalesPeriodMonths" aria-label="月を選択"></div><button type="button" id="insightSalesPeriodAddToggle">＋ 年度追加</button><div id="insightSalesPeriodAddWrap" hidden><input id="insightSalesPeriodAddInput" type="text" inputmode="numeric" maxlength="4" placeholder="例：2027" aria-label="追加する年度"><button type="button" id="insightSalesPeriodAddButton">追加</button></div><div id="insightSalesPeriodActions"><button type="button" id="insightSalesPeriodCancel">キャンセル</button><button type="button" id="insightSalesPeriodApply">この年月を表示</button></div></div>';
    doc.body.appendChild(overlay);
    yearSelect=overlay.querySelector('#insightSalesPeriodYear');
    monthGrid=overlay.querySelector('#insightSalesPeriodMonths');
    addWrap=overlay.querySelector('#insightSalesPeriodAddWrap');
    addInput=overlay.querySelector('#insightSalesPeriodAddInput');

    for(var month=1;month<=12;month++){
      var button=doc.createElement('button');button.type='button';button.dataset.month=String(month);button.textContent=String(month)+'月';
      button.addEventListener('click',function(){modalMonth=Number(this.dataset.month);refreshMonthButtons();});
      monthGrid.appendChild(button);
    }
    yearSelect.addEventListener('change',function(){modalYear=Number(yearSelect.value);});
    overlay.querySelector('#insightSalesPeriodAddToggle').addEventListener('click',function(){
      addWrap.hidden=!addWrap.hidden;
      if(!addWrap.hidden){addInput.value='';addInput.focus();}
    });
    overlay.querySelector('#insightSalesPeriodAddButton').addEventListener('click',function(){
      var year=validYear(addInput.value);
      if(!year){alert('4桁の西暦を入力してください');return;}
      if(typeof root.addYear!=='function'){alert('年度追加機能を初期化できませんでした。');return;}
      if(root.addYear(String(year))){
        modalYear=year;refreshYearOptions(year);addWrap.hidden=true;
        scheduleSync();
      }
    });
    overlay.querySelector('#insightSalesPeriodCancel').addEventListener('click',closeDialog);
    overlay.querySelector('#insightSalesPeriodApply').addEventListener('click',function(){
      if(applyPeriod(modalYear,modalMonth))closeDialog();
    });
    overlay.addEventListener('click',function(event){if(event.target===overlay)closeDialog();});
    overlay.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();closeDialog();}});
  }
  function openDialog(){
    var p=currentPeriod();if(!p)return;
    ensureDialog();modalYear=p.year;modalMonth=p.month;
    refreshYearOptions(modalYear);refreshMonthButtons();addWrap.hidden=true;overlay.hidden=false;yearSelect.focus();
  }

  function sync(){
    hideLegacyControls();
    syncBar();
  }
  function scheduleSync(){
    if(scheduled)return;
    scheduled=true;
    var run=function(){scheduled=false;sync();};
    if(typeof queueMicrotask==='function')queueMicrotask(run);else setTimeout(run,0);
  }

  if(root.InsightHooks){
    root.InsightHooks.on('input:table:after','sales-period-selector',function(ctx){if(ctx.args[0]==='sales')scheduleSync();},60);
  }
  var observerRoot=page;
  if(typeof MutationObserver!=='undefined')new MutationObserver(scheduleSync).observe(observerRoot,{subtree:true,childList:true});

  model.applyPeriod=applyPeriod;
  model.sync=sync;
  model.openDialog=openDialog;

  sync();
})(typeof window!=='undefined'?window:globalThis);
