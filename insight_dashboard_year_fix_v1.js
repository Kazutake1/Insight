/* Dashboard-only layout correction and explicit, guarded fiscal-year deletion. */
(function(){
  'use strict';
  if(window.__insightDashboardYearFixV1)return;
  window.__insightDashboardYearFixV1=true;

  function removeLegacyYearDeleteUi(){
    var modal=document.getElementById('modalBg');
    if(modal&&modal.parentNode)modal.parentNode.removeChild(modal);
    Array.prototype.forEach.call(document.querySelectorAll('.btn-del-year'),function(button){
      if(button&&button.parentNode)button.parentNode.removeChild(button);
    });
  }
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
    overlay.innerHTML='<div id="insightYearDeleteDialog" role="dialog" aria-modal="true" aria-labelledby="insightYearDeleteHeading" aria-describedby="insightYearDeleteWarning"><h2 id="insightYearDeleteHeading">年度の削除</h2><label for="insightYearDeleteSelect">削除する年度</label><select id="insightYearDeleteSelect"></select><p id="insightYearDeleteQuestion"></p><p id="insightYearDeleteWarning">この年度の売上・客数・買上点数・廃棄・店舗メモ・天気/気温・人件費/粗利率・販売数/納品数・時間帯別客数を削除します。イベント・催事の開催記録と店舗設定は削除しません。元に戻せません。</p><div id="insightYearDeleteActions"><button type="button" id="insightYearDeleteCancel">キャンセル</button><button type="button" id="insightYearDeleteConfirm">削除する</button></div></div>';
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
      if(!window.InsightYearManager||typeof window.InsightYearManager.removeCurrent!=='function'){
        alert('年度削除機能を初期化できませんでした。');return;
      }
      var oldBase=typeof baseYear!=='undefined'?baseYear:null;
      var oldCompare=typeof cmpYear!=='undefined'?cmpYear:null;
      try{
        var result=window.InsightYearManager.removeCurrent(chosen);
        var remaining=result.remaining||[];
        var resolved=window.InsightYearManager.resolveSelection(remaining,oldBase,oldCompare);
        if(typeof baseYear!=='undefined')baseYear=typeof oldBase==='number'?Number(resolved.baseYear):resolved.baseYear;
        if(typeof cmpYear!=='undefined')cmpYear=resolved.compareYear==null?null:(typeof oldCompare==='number'?Number(resolved.compareYear):resolved.compareYear);
        if(typeof editYear!=='undefined'&&editYear){
          ['sales','kyaku','haiki'].forEach(function(type){
            if(editYear[type]==null||remaining.indexOf(String(editYear[type]))<0){
              editYear[type]=typeof editYear[type]==='number'?Number(resolved.baseYear):resolved.baseYear;
            }
          });
        }
        if(window.InsightDateContext&&typeof window.InsightDateContext.getSelectedInfo==='function'){
          var info=window.InsightDateContext.getSelectedInfo();
          if(info&&String(info.fy)===chosen&&resolved.baseYear!=null){
            var last=new Date(Number(resolved.baseYear),info.mIdx+1,0).getDate();
            var nextDate=new Date(0);
            nextDate.setFullYear(Number(resolved.baseYear),info.mIdx,Math.min(info.day,last));
            nextDate.setHours(0,0,0,0);
            window.InsightDateContext.setSelectedDate(nextDate);
          }
        }
        closeDialog();
        if(typeof renderYearPills==='function')renderYearPills();
        if(typeof currentNav!=='undefined'&&currentNav===1&&typeof refreshDash==='function')refreshDash();
        else if(typeof currentNav!=='undefined'&&currentNav>1&&typeof initInputPage==='function'){
          var type=['','','sales','kyaku','haiki'][currentNav];if(type)initInputPage(type);
        }
        if(window.InsightPagePeriodSync&&typeof window.InsightPagePeriodSync.reconcileCurrentStore==='function'){
          window.InsightPagePeriodSync.reconcileCurrentStore();
        }
        if(typeof showToast==='function')showToast('✓ '+chosen+'年度を削除しました','#b42318','#fef2f2');
        if(deleteButton)deleteButton.disabled=years().length<=1;
      }catch(error){
        alert('年度を削除できませんでした。\n'+(error&&error.message?error.message:error));
      }
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
    removeLegacyYearDeleteUi();
    var addButton=document.getElementById('addYearBtn')||Array.prototype.find.call(document.querySelectorAll('button'),function(button){
      return /年度追加/.test(button.textContent||'')&&!button.closest('#insightYearDeleteOverlay');
    });
    if(!addButton)return;
    if(deleteButton&&deleteButton.parentElement!==addButton.parentElement){deleteButton.remove();deleteButton=null;}
    if(!deleteButton){
      deleteButton=document.createElement('button');deleteButton.type='button';
      deleteButton.id='insightDeleteYearButton';deleteButton.className=addButton.className;
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
