/* Dashboard-only layout correction and explicit, guarded fiscal-year deletion. */
(function(){
  'use strict';
  if(window.__insightDashboardYearFixV1)return;
  window.__insightDashboardYearFixV1=true;

  var css=document.createElement('style');
  css.id='insightDashboardYearFixStyle';
  css.textContent=[
    '#kpiRow{padding-left:5px!important;scroll-padding-left:5px}',
    '#insightDeleteYearButton{color:#b42318!important;border-color:#b42318!important}',
    '#insightDeleteYearButton:disabled{cursor:not-allowed}',
    '#insightYearDeleteOverlay{position:fixed;inset:0;z-index:25000;background:rgba(0,0,0,.46);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}',
    '#insightYearDeleteOverlay[hidden]{display:none!important}',
    '#insightYearDeleteDialog{box-sizing:border-box;width:min(100%,410px);padding:22px;border-radius:16px;background:var(--surface,#fff);color:var(--text,#222);box-shadow:0 18px 60px rgba(0,0,0,.25);font-family:inherit}',
    '#insightYearDeleteDialog h2{font-size:18px;line-height:1.45;margin:0 0 15px}',
    '#insightYearDeleteDialog label{display:block;font-size:13px;margin-bottom:6px;font-weight:700}',
    '#insightYearDeleteDialog select{width:100%;padding:11px;border:1px solid var(--border,#ccc);border-radius:8px;background:var(--surface,#fff);color:var(--text,#222);font-size:15px}',
    '#insightYearDeleteQuestion{font-size:15px;font-weight:750;line-height:1.5;margin:17px 0 8px}',
    '#insightYearDeleteWarning{font-size:12px;line-height:1.6;color:#b42318;margin:0 0 19px}',
    '#insightYearDeleteActions{display:flex;justify-content:flex-end;gap:9px}',
    '#insightYearDeleteActions button{font:700 13px/1.2 inherit;font-family:inherit;border-radius:8px;padding:11px 14px;cursor:pointer}',
    '#insightYearDeleteCancel{background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#ccc)}',
    '#insightYearDeleteConfirm{background:#b42318;color:#fff;border:1px solid #b42318}'
  ].join('');
  document.head.appendChild(css);

  var deleteButton=null,overlay=null,select=null,question=null,confirmButton=null;
  function years(){return typeof store!=='undefined'&&store&&Array.isArray(store.years)?store.years:[];}
  function closeDialog(){
    if(!overlay)return;
    overlay.hidden=true;
    if(deleteButton&&deleteButton.isConnected)deleteButton.focus();
  }
  function ensureDialog(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.id='insightYearDeleteOverlay';overlay.hidden=true;
    overlay.innerHTML='<div id="insightYearDeleteDialog" role="dialog" aria-modal="true" aria-labelledby="insightYearDeleteHeading" aria-describedby="insightYearDeleteWarning"><h2 id="insightYearDeleteHeading">年度の削除</h2><label for="insightYearDeleteSelect">削除する年度</label><select id="insightYearDeleteSelect"></select><p id="insightYearDeleteQuestion"></p><p id="insightYearDeleteWarning">この年度の売上・客数・廃棄などの保存データが削除されます。元に戻せません。</p><div id="insightYearDeleteActions"><button type="button" id="insightYearDeleteCancel">キャンセル</button><button type="button" id="insightYearDeleteConfirm">削除する</button></div></div>';
    document.body.appendChild(overlay);
    select=overlay.querySelector('#insightYearDeleteSelect');
    question=overlay.querySelector('#insightYearDeleteQuestion');
    confirmButton=overlay.querySelector('#insightYearDeleteConfirm');
    function updateQuestion(){question.textContent=select.value+'年度を削除しますがよろしいですか？';}
    select.addEventListener('change',updateQuestion);
    overlay.querySelector('#insightYearDeleteCancel').addEventListener('click',closeDialog);
    overlay.addEventListener('click',function(event){if(event.target===overlay)closeDialog();});
    overlay.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();closeDialog();}});
    confirmButton.addEventListener('click',function(){
      var chosen=select.value,list=years();
      var match=list.filter(function(y){return String(y)===chosen;});
      if(list.length<=1||match.length!==1){closeDialog();return;}
      // The selected year is validated again immediately before changing any data.
      var remaining=list.filter(function(y){return String(y)!==chosen;});
      if(!remaining.length){closeDialog();return;}
      store.years=remaining;
      if(store.data)delete store.data[chosen];
      if(store.monthlyOps)delete store.monthlyOps[chosen];
      if(typeof baseYear!=='undefined'&&String(baseYear)===chosen)baseYear=remaining[remaining.length-1];
      if(typeof cmpYear!=='undefined'&&cmpYear!=null&&String(cmpYear)===chosen)cmpYear=null;
      if(typeof editYear!=='undefined'&&editYear){
        ['sales','kyaku','haiki'].forEach(function(type){
          if(editYear[type]!=null&&String(editYear[type])===chosen)editYear[type]=baseYear||remaining[0];
        });
      }
      if(typeof persist==='function')persist();
      closeDialog();
      if(typeof renderYearPills==='function')renderYearPills();
      if(typeof currentNav!=='undefined'&&currentNav===1&&typeof refreshDash==='function')refreshDash();
      else if(typeof currentNav!=='undefined'&&currentNav>1&&typeof initInputPage==='function'){
        var type=['','','sales','kyaku','haiki'][currentNav];if(type)initInputPage(type);
      }
      if(deleteButton)deleteButton.disabled=years().length<=1;
    });
  }
  function openDialog(){
    var list=years();if(list.length<=1)return;
    ensureDialog();select.replaceChildren();
    list.forEach(function(y){var opt=document.createElement('option');opt.value=String(y);opt.textContent=String(y)+'年度';select.appendChild(opt);});
    if(typeof baseYear!=='undefined'&&list.some(function(y){return String(y)===String(baseYear);}))select.value=String(baseYear);
    question.textContent=select.value+'年度を削除しますがよろしいですか？';
    overlay.hidden=false;select.focus();
  }
  function ensureButton(){
    var addButton=Array.prototype.find.call(document.querySelectorAll('button'),function(button){
      return /年度追加/.test(button.textContent||'')&&!button.closest('#insightYearDeleteOverlay');
    });
    if(!addButton)return;
    if(deleteButton&&deleteButton.parentElement!==addButton.parentElement){deleteButton.remove();deleteButton=null;}
    if(!deleteButton){
      deleteButton=document.createElement('button');deleteButton.type='button';
      deleteButton.id='insightDeleteYearButton';deleteButton.className=addButton.className;
      deleteButton.style.cssText=addButton.style.cssText;
      deleteButton.textContent='− 年度削除';deleteButton.title='対象年度を選び、確認して削除します';
      deleteButton.addEventListener('click',openDialog);
      addButton.insertAdjacentElement('afterend',deleteButton);
    }
    deleteButton.disabled=years().length<=1;
  }
  ensureButton();
  var root=document.getElementById('main')||document.body;
  if(typeof MutationObserver!=='undefined')new MutationObserver(ensureButton).observe(root,{subtree:true,childList:true});
})();
