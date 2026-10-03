/* Sales-count camera capture v1: in-memory image session only. No OCR, persistence, or external transmission. */
(function(root){
  'use strict';
  if(root.InsightSalesCountCamera)return;

  var MAX_FILES=12;
  var MAX_FILE_BYTES=20*1024*1024;
  var POLICY={
    persistImages:false,
    externalTransmission:false,
    autoSave:false,
    unmatchedCategory:'discard'
  };

  function pad(value){return String(value).padStart(2,'0');}
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function validPeriod(period){
    var year=Number(period&&period.year),month=Number(period&&period.month);
    return Number.isInteger(year)&&year>=1000&&Number.isInteger(month)&&month>=1&&month<=12?{year:year,month:month}:null;
  }
  function periodBounds(period){
    period=validPeriod(period);
    if(!period)return null;
    return {
      min:String(period.year)+'-'+pad(period.month)+'-01',
      max:String(period.year)+'-'+pad(period.month)+'-'+pad(lastDay(period.year,period.month))
    };
  }
  function defaultTargetDate(period,now){
    var bounds=periodBounds(period);
    if(!bounds)return '';
    var date=now instanceof Date?now:new Date(now||Date.now());
    if(!Number.isNaN(date.getTime())){
      var current=String(date.getFullYear())+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
      if(current>=bounds.min&&current<=bounds.max)return current;
    }
    return bounds.min;
  }
  function isImageFile(file){
    return !!(file&&typeof file.size==='number'&&file.size>0&&file.size<=MAX_FILE_BYTES&&typeof file.type==='string'&&file.type.indexOf('image/')===0);
  }
  function fileIssue(file){
    if(!file)return '画像を取得できませんでした。';
    if(!(typeof file.type==='string'&&file.type.indexOf('image/')===0))return '画像ファイルのみ追加できます。';
    if(!(typeof file.size==='number'&&file.size>0))return '空の画像は追加できません。';
    if(file.size>MAX_FILE_BYTES)return '1枚20MB以下の画像を使用してください。';
    return null;
  }

  var model={
    VERSION:1,
    MAX_FILES:MAX_FILES,
    MAX_FILE_BYTES:MAX_FILE_BYTES,
    POLICY:POLICY,
    periodBounds:periodBounds,
    defaultTargetDate:defaultTargetDate,
    isImageFile:isImageFile,
    fileIssue:fileIssue
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSalesCountCamera=model;
  if(!root.document)return;

  var doc=root.document;
  var session={targetDate:'',items:[]};
  var dialog=null,list=null,status=null,dateInput=null,cameraInput=null,libraryInput=null;
  var nextId=1;

  function salesApi(){return root.InsightSalesCount;}
  function getPeriod(){
    var api=salesApi();
    return api&&typeof api.getPeriod==='function'?api.getPeriod():null;
  }
  function summary(){
    return {
      targetDate:session.targetDate,
      count:session.items.length,
      totalBytes:session.items.reduce(function(sum,item){return sum+item.file.size;},0),
      names:session.items.map(function(item){return item.file.name||'';})
    };
  }
  function revoke(item){
    if(item&&item.url){
      try{root.URL.revokeObjectURL(item.url);}catch(_){}
      item.url='';
    }
  }
  function clearItems(){
    session.items.forEach(revoke);
    session.items=[];
    renderItems();
  }
  function resetSession(){
    clearItems();
    session.targetDate='';
    if(cameraInput)cameraInput.value='';
    if(libraryInput)libraryInput.value='';
  }
  function addFiles(files){
    var incoming=Array.prototype.slice.call(files||[]);
    var errors=[];
    incoming.forEach(function(file){
      if(session.items.length>=MAX_FILES){errors.push('画像は1回につき最大12枚です。');return;}
      var issue=fileIssue(file);
      if(issue){errors.push(issue);return;}
      var url='';
      try{url=root.URL.createObjectURL(file);}catch(_){}
      session.items.push({id:nextId++,file:file,url:url});
    });
    renderItems();
    if(errors.length)alert(Array.from(new Set(errors)).join('\n'));
    return summary();
  }
  function removeItem(id){
    var index=session.items.findIndex(function(item){return item.id===Number(id);});
    if(index<0)return false;
    revoke(session.items[index]);
    session.items.splice(index,1);
    renderItems();
    return true;
  }
  function currentBounds(){
    return periodBounds(getPeriod());
  }
  function updateTargetDate(){
    if(!dateInput)return;
    var bounds=currentBounds();
    if(!bounds)return;
    dateInput.min=bounds.min;
    dateInput.max=bounds.max;
    session.targetDate=defaultTargetDate(getPeriod());
    dateInput.value=session.targetDate;
  }
  function renderItems(){
    if(!list||!status)return;
    list.replaceChildren();
    if(!session.items.length){
      var empty=doc.createElement('div');
      empty.className='sc-camera-empty';
      empty.textContent='まだ画像は追加されていません。';
      list.append(empty);
    }else{
      session.items.forEach(function(item,index){
        var row=doc.createElement('div');
        row.className='sc-camera-item';
        var thumb=doc.createElement('div');
        thumb.className='sc-camera-thumb';
        if(item.url){
          var img=doc.createElement('img');
          img.src=item.url;
          img.alt='撮影画像 '+String(index+1);
          thumb.append(img);
        }
        var meta=doc.createElement('div');
        meta.className='sc-camera-meta';
        var title=doc.createElement('strong');
        title.textContent='撮影画像 '+String(index+1);
        var size=doc.createElement('span');
        size.textContent=(item.file.size/1024/1024).toFixed(1)+' MB';
        meta.append(title,size);
        var remove=doc.createElement('button');
        remove.type='button';
        remove.className='sc-camera-remove';
        remove.textContent='削除';
        remove.setAttribute('aria-label','撮影画像 '+String(index+1)+' を削除');
        remove.onclick=function(){removeItem(item.id);};
        row.append(thumb,meta,remove);
        list.append(row);
      });
    }
    status.textContent='撮影済み '+String(session.items.length)+' / '+String(MAX_FILES)+'枚';
    var clear=dialog&&dialog.querySelector('#scCameraClear');
    if(clear)clear.disabled=!session.items.length;
  }
  function requestClose(){
    if(session.items.length&&!confirm('撮影済み画像を破棄して閉じますか？'))return;
    if(dialog&&dialog.open)dialog.close();
  }
  function closeAndClear(){
    resetSession();
    if(dialog&&dialog.parentNode)dialog.remove();
    dialog=null;list=null;status=null;dateInput=null;cameraInput=null;libraryInput=null;
  }
  function ensureDialog(){
    if(dialog&&dialog.isConnected)return;
    dialog=doc.createElement('dialog');
    dialog.id='scCameraDialog';
    dialog.className='sc-dialog sc-camera-dialog';
    dialog.innerHTML=
      '<header><div><h2>カメラ読取</h2><p>対象日の画面を撮影・追加します。</p></div><button type="button" id="scCameraClose">閉じる</button></header>'+
      '<section class="sc-camera-body">'+
        '<label class="sc-camera-date">対象日 <input id="scCameraDate" type="date"></label>'+
        '<p class="sc-camera-note">画像はこの画面を閉じるまでブラウザのメモリ上だけで保持します。まだOCR・データ反映は行いません。</p>'+
        '<div class="sc-camera-actions">'+
          '<button type="button" id="scCameraShoot">カメラで撮影</button>'+
          '<button type="button" id="scCameraLibrary">写真から追加</button>'+
          '<button type="button" id="scCameraClear" disabled>全て削除</button>'+
        '</div>'+
        '<input id="scCameraCapture" type="file" accept="image/*" capture="environment" hidden>'+
        '<input id="scCameraFiles" type="file" accept="image/*" multiple hidden>'+
        '<div class="sc-camera-summary"><strong id="scCameraStatus"></strong><span>外部送信なし・自動保存なし</span></div>'+
        '<div id="scCameraList" class="sc-camera-list"></div>'+
        '<div class="sc-camera-next"><button type="button" disabled>OCR読取は次のSTEPで追加します</button></div>'+
      '</section>';
    doc.body.append(dialog);

    list=dialog.querySelector('#scCameraList');
    status=dialog.querySelector('#scCameraStatus');
    dateInput=dialog.querySelector('#scCameraDate');
    cameraInput=dialog.querySelector('#scCameraCapture');
    libraryInput=dialog.querySelector('#scCameraFiles');

    dialog.querySelector('#scCameraClose').onclick=requestClose;
    dialog.querySelector('#scCameraShoot').onclick=function(){cameraInput.click();};
    dialog.querySelector('#scCameraLibrary').onclick=function(){libraryInput.click();};
    dialog.querySelector('#scCameraClear').onclick=function(){
      if(!session.items.length)return;
      if(confirm('撮影済み画像をすべて削除しますか？'))clearItems();
    };
    cameraInput.onchange=function(){addFiles(cameraInput.files);cameraInput.value='';};
    libraryInput.onchange=function(){addFiles(libraryInput.files);libraryInput.value='';};
    dateInput.onchange=function(){
      var bounds=currentBounds(),value=dateInput.value;
      if(!bounds||value<bounds.min||value>bounds.max){
        session.targetDate=defaultTargetDate(getPeriod());
        dateInput.value=session.targetDate;
        alert('対象日は表示中の月から選択してください。');
        return;
      }
      session.targetDate=value;
    };
    dialog.addEventListener('cancel',function(event){event.preventDefault();requestClose();});
    dialog.addEventListener('close',closeAndClear);
  }
  function open(){
    ensureDialog();
    resetSession();
    updateTargetDate();
    renderItems();
    dialog.showModal();
    return summary();
  }
  function ensureButton(){
    var toolbar=doc.querySelector('#pageSalesCount .sc-toolbar');
    if(!toolbar||doc.getElementById('scCameraOpen'))return;
    var button=doc.createElement('button');
    button.id='scCameraOpen';
    button.type='button';
    button.textContent='カメラ読取';
    button.onclick=open;
    toolbar.append(button);
  }
  function init(){
    if(!salesApi()){setTimeout(init,0);return;}
    ensureButton();
  }

  var style=doc.createElement('style');
  style.id='scCameraStyle';
  style.textContent=
    '.sc-camera-dialog{width:min(720px,calc(100vw - 24px))}.sc-camera-dialog header p{margin:3px 0 0;font-size:11px;color:var(--text4)}'+
    '.sc-camera-body{padding-top:14px}.sc-camera-date{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700}.sc-camera-date input{min-width:170px}'+
    '.sc-camera-note{margin:12px 0;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);font-size:11px;line-height:1.6;color:var(--text3)}'+
    '.sc-camera-actions{display:flex;gap:8px;flex-wrap:wrap}.sc-camera-actions button{min-height:40px}.sc-camera-summary{display:flex;justify-content:space-between;gap:10px;margin:14px 0 8px;font-size:11px;color:var(--text3)}'+
    '.sc-camera-list{display:grid;gap:8px}.sc-camera-empty{padding:22px;border:1px dashed var(--border);border-radius:10px;text-align:center;color:var(--text4);font-size:12px}'+
    '.sc-camera-item{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:11px;background:var(--surface2)}'+
    '.sc-camera-thumb{width:76px;height:58px;border-radius:8px;overflow:hidden;background:var(--input-bg)}.sc-camera-thumb img{width:100%;height:100%;object-fit:cover;display:block}'+
    '.sc-camera-meta{display:flex;flex-direction:column;gap:4px;min-width:0}.sc-camera-meta strong{font-size:12px}.sc-camera-meta span{font-size:10px;color:var(--text4)}'+
    '.sc-camera-remove{min-width:58px}.sc-camera-next{margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.sc-camera-next button:disabled{opacity:.5}'+
    '@media(max-width:600px){.sc-camera-summary{flex-direction:column}.sc-camera-item{grid-template-columns:64px minmax(0,1fr) auto}.sc-camera-thumb{width:64px;height:50px}}';
  doc.head.append(style);

  model.open=open;
  model.close=requestClose;
  model.clear=clearItems;
  model.addFiles=addFiles;
  model.removeItem=removeItem;
  model.getSessionSummary=summary;

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
