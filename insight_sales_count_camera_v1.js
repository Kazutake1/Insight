/* Sales-count camera capture v2: same-origin local OCR, in-memory results only. */
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
  var OCR_POLICY={
    engine:'Tesseract.js',
    version:'7.0.0',
    language:'jpn',
    assetOrigin:'same-origin',
    cacheMethod:'none',
    workerBlobURL:false
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
  function normalizeText(value){
    var text=String(value==null?'':value);
    try{text=text.normalize('NFKC');}catch(_){}
    return text.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();
  }
  function compactForMatch(value){
    return normalizeText(value).replace(/\s+/g,'');
  }
  function bboxOf(value){
    var box=value&&value.bbox;
    if(!box||typeof box!=='object')return null;
    var x0=Number(box.x0!=null?box.x0:box.left);
    var y0=Number(box.y0!=null?box.y0:box.top);
    var x1=Number(box.x1!=null?box.x1:(box.left!=null&&box.width!=null?Number(box.left)+Number(box.width):NaN));
    var y1=Number(box.y1!=null?box.y1:(box.top!=null&&box.height!=null?Number(box.top)+Number(box.height):NaN));
    if([x0,y0,x1,y1].some(function(v){return !Number.isFinite(v);}))return null;
    return {x0:x0,y0:y0,x1:x1,y1:y1};
  }
  function wordFrom(value){
    if(!value||typeof value!=='object')return null;
    var text=normalizeText(value.text);
    if(!text)return null;
    var confidence=Number(value.confidence);
    return {
      text:text,
      confidence:Number.isFinite(confidence)?confidence:null,
      bbox:bboxOf(value)
    };
  }
  function extractLayout(blocks){
    var lines=[];
    function addLine(line){
      if(!line||typeof line!=='object')return;
      var words=Array.isArray(line.words)?line.words.map(wordFrom).filter(Boolean):[];
      var text=normalizeText(line.text||words.map(function(word){return word.text;}).join(' '));
      if(!text)return;
      var confidence=Number(line.confidence);
      lines.push({
        index:lines.length,
        text:text,
        confidence:Number.isFinite(confidence)?confidence:null,
        bbox:bboxOf(line),
        words:words
      });
    }
    function visit(node){
      if(!node)return;
      if(Array.isArray(node)){node.forEach(visit);return;}
      if(typeof node!=='object')return;
      if(Array.isArray(node.lines)){node.lines.forEach(addLine);return;}
      if(Array.isArray(node.paragraphs)){node.paragraphs.forEach(visit);return;}
      if(Array.isArray(node.blocks)){node.blocks.forEach(visit);return;}
      if(Array.isArray(node.words)){addLine(node);}
    }
    visit(blocks);
    return lines;
  }
  function validIso(year,month,day){
    year=Number(year);month=Number(month);day=Number(day);
    if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||year<1000||month<1||month>12||day<1)return null;
    var date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return String(year)+'-'+pad(month)+'-'+pad(day);
  }
  function extractDateCandidates(text,targetDate){
    text=normalizeText(text);
    var target=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(targetDate||''));
    var fallbackYear=target?Number(target[1]):new Date().getFullYear();
    var found=[];
    function add(year,month,day,raw){
      var iso=validIso(year,month,day);
      if(iso&&!found.some(function(item){return item.iso===iso;}))found.push({iso:iso,raw:normalizeText(raw)});
    }
    var full=/(\d{4})\s*(?:年|[\/.\-])\s*(\d{1,2})\s*(?:月|[\/.\-])\s*(\d{1,2})\s*日?/g;
    var match;
    while((match=full.exec(text)))add(match[1],match[2],match[3],match[0]);
    var japanese=/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
    while((match=japanese.exec(text)))add(fallbackYear,match[1],match[2],match[0]);
    var shortDate=/(?:^|[^\d])(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?!\d)/g;
    while((match=shortDate.exec(text)))add(fallbackYear,match[1],match[2],match[0]);
    return found;
  }
  function textLines(text){
    return String(text==null?'':text).replace(/\r/g,'').split('\n').map(function(line){return normalizeText(line);}).filter(Boolean);
  }
  function fallbackLines(text,confidence){
    return textLines(text).map(function(line,index){
      return {index:index,text:line,confidence:Number.isFinite(Number(confidence))?Number(confidence):null,bbox:null,words:[]};
    });
  }
  function candidateKind(line,start,end){
    var before=line.slice(Math.max(0,start-2),start);
    var after=line.slice(end,end+2);
    if(/便/.test(after))return 'trip_label';
    if(/[年月日\/.\-]/.test(before+after))return 'date';
    return 'value';
  }
  function extractNumberCandidates(lines,text){
    var sourceLines=Array.isArray(lines)&&lines.length?lines:fallbackLines(text,null);
    var out=[];
    sourceLines.forEach(function(line,lineIndex){
      var source=normalizeText(line&&line.text);
      var rx=/\d[\d,]*/g,match;
      while((match=rx.exec(source))){
        var raw=match[0],value=Number(raw.replace(/,/g,''));
        if(!Number.isSafeInteger(value)||value<0)continue;
        out.push({
          value:value,
          raw:raw,
          kind:candidateKind(source,match.index,match.index+raw.length),
          lineIndex:line&&Number.isInteger(line.index)?line.index:lineIndex,
          confidence:line&&Number.isFinite(Number(line.confidence))?Number(line.confidence):null,
          bbox:null
        });
      }
    });
    return out;
  }
  function matchCategories(text,lines,categories){
    var combined=compactForMatch([text].concat((lines||[]).map(function(line){return line.text;})).join('\n'));
    var out=[];
    (Array.isArray(categories)?categories:[]).forEach(function(category){
      if(!category||category.hidden===true||typeof category.id!=='string'||!category.id)return;
      var labels=[category.name].concat(Array.isArray(category.aliases)?category.aliases:[]).filter(function(label){return typeof label==='string'&&label.trim();});
      var matched=labels.find(function(label){
        var needle=compactForMatch(label);
        return !!needle&&combined.indexOf(needle)>=0;
      });
      if(matched)out.push({id:category.id,name:String(category.name||matched),matchedLabel:matched});
    });
    return out;
  }
  function detectLabels(text,lines){
    var source=normalizeText([text].concat((lines||[]).map(function(line){return line.text;})).join('\n'));
    function indexes(rx){
      var list=[];
      (lines||[]).forEach(function(line,index){if(rx.test(normalizeText(line.text))){list.push(Number.isInteger(line.index)?line.index:index);}rx.lastIndex=0;});
      return list;
    }
    return {
      delivery:{found:/納\s*品(?:\s*数)?/.test(source),lineIndexes:indexes(/納\s*品(?:\s*数)?/)},
      sales:{found:/販\s*売(?:\s*数)?/.test(source),lineIndexes:indexes(/販\s*売(?:\s*数)?/)},
      trips:[1,2,3].map(function(trip){
        var rx=new RegExp(String(trip)+'\\s*便');
        return {trip:trip,found:rx.test(source),lineIndexes:indexes(rx)};
      })
    };
  }
  function analyzeOcrData(data,categories,targetDate){
    data=data&&typeof data==='object'?data:{};
    var text=normalizeText(data.text||'');
    var lines=extractLayout(data.blocks);
    if(!lines.length)lines=fallbackLines(data.text||'',data.confidence);
    var dates=extractDateCandidates(text,targetDate);
    var numbers=extractNumberCandidates(lines,text).filter(function(candidate){return candidate.kind==='value';});
    var matched=matchCategories(text,lines,categories);
    var confidence=Number(data.confidence);
    return {
      text:text,
      confidence:Number.isFinite(confidence)?confidence:null,
      lines:lines,
      numberCandidates:numbers,
      matchedCategories:matched,
      dateCandidates:dates,
      targetDateMatched:dates.length?dates.some(function(item){return item.iso===targetDate;}):null,
      labels:detectLabels(text,lines)
    };
  }
  function localOcrAssets(baseHref){
    var base=new URL('./vendor/ocr/',baseHref);
    return {
      base:base.href,
      workerPath:new URL('worker.min.js',base).href,
      corePath:base.href.replace(/\/$/,''),
      langPath:new URL('lang',base).href.replace(/\/$/,'')
    };
  }

  var model={
    VERSION:2,
    MAX_FILES:MAX_FILES,
    MAX_FILE_BYTES:MAX_FILE_BYTES,
    POLICY:POLICY,
    OCR_POLICY:OCR_POLICY,
    periodBounds:periodBounds,
    defaultTargetDate:defaultTargetDate,
    isImageFile:isImageFile,
    fileIssue:fileIssue,
    normalizeText:normalizeText,
    extractLayout:extractLayout,
    extractDateCandidates:extractDateCandidates,
    extractNumberCandidates:extractNumberCandidates,
    matchCategories:matchCategories,
    detectLabels:detectLabels,
    analyzeOcrData:analyzeOcrData,
    localOcrAssets:localOcrAssets
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSalesCountCamera=model;
  if(!root.document)return;

  var doc=root.document;
  var session={targetDate:'',items:[],processing:false,engineStatus:''};
  var dialog=null,list=null,status=null,ocrStatus=null,dateInput=null,cameraInput=null,libraryInput=null;
  var nextId=1;

  function salesApi(){return root.InsightSalesCount;}
  function getPeriod(){
    var api=salesApi();
    return api&&typeof api.getPeriod==='function'?api.getPeriod():null;
  }
  function storesState(){
    try{if(typeof allStores!=='undefined')return allStores;}catch(_){}
    return root.allStores||null;
  }
  function categories(){
    var all=storesState();
    return all&&all.salesCountManagement&&Array.isArray(all.salesCountManagement.categories)?all.salesCountManagement.categories:[];
  }
  function summary(){
    var done=0,errors=0,matchedIds=new Set(),numberCount=0;
    session.items.forEach(function(item){
      if(item.ocr&&item.ocr.status==='done'){
        done++;
        (item.ocr.matchedCategories||[]).forEach(function(category){matchedIds.add(category.id);});
        numberCount+=(item.ocr.numberCandidates||[]).length;
      }else if(item.ocr&&item.ocr.status==='error')errors++;
    });
    return {
      targetDate:session.targetDate,
      count:session.items.length,
      totalBytes:session.items.reduce(function(sum,item){return sum+item.file.size;},0),
      names:session.items.map(function(item){return item.file.name||'';}),
      processing:session.processing,
      ocrDone:done,
      ocrErrors:errors,
      ocrPending:Math.max(0,session.items.length-done-errors),
      matchedCategories:matchedIds.size,
      numberCandidates:numberCount
    };
  }
  function revoke(item){
    if(item&&item.url){
      try{root.URL.revokeObjectURL(item.url);}catch(_){}
      item.url='';
    }
  }
  function clearItems(){
    if(session.processing)return summary();
    session.items.forEach(revoke);
    session.items=[];
    session.engineStatus='';
    renderItems();
    return summary();
  }
  function resetSession(){
    session.processing=false;
    clearItems();
    session.targetDate='';
    session.engineStatus='';
    if(cameraInput)cameraInput.value='';
    if(libraryInput)libraryInput.value='';
  }
  function addFiles(files){
    if(session.processing)return summary();
    var incoming=Array.prototype.slice.call(files||[]);
    var errors=[];
    incoming.forEach(function(file){
      if(session.items.length>=MAX_FILES){errors.push('画像は1回につき最大12枚です。');return;}
      var issue=fileIssue(file);
      if(issue){errors.push(issue);return;}
      var url='';
      try{url=root.URL.createObjectURL(file);}catch(_){}
      session.items.push({id:nextId++,file:file,url:url,ocr:null});
    });
    renderItems();
    if(errors.length)alert(Array.from(new Set(errors)).join('\n'));
    return summary();
  }
  function removeItem(id){
    if(session.processing)return false;
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
  function refreshDateMatches(){
    session.items.forEach(function(item){
      if(!item.ocr||item.ocr.status!=='done')return;
      item.ocr.dateCandidates=extractDateCandidates(item.ocr.text,session.targetDate);
      item.ocr.targetDateMatched=item.ocr.dateCandidates.length?item.ocr.dateCandidates.some(function(candidate){return candidate.iso===session.targetDate;}):null;
    });
  }
  function renderControls(){
    if(!dialog)return;
    var processing=session.processing,hasItems=session.items.length>0;
    ['#scCameraShoot','#scCameraLibrary','#scCameraClear','#scCameraRead'].forEach(function(selector){
      var button=dialog.querySelector(selector);
      if(!button)return;
      if(selector==='#scCameraClear'||selector==='#scCameraRead')button.disabled=processing||!hasItems;
      else button.disabled=processing;
    });
    if(dateInput)dateInput.disabled=processing;
    dialog.querySelectorAll('.sc-camera-remove').forEach(function(button){button.disabled=processing;});
  }
  function itemStatus(item){
    if(!item.ocr)return '未読取';
    if(item.ocr.status==='processing')return '読取中 '+Math.round((item.ocr.progress||0)*100)+'%';
    if(item.ocr.status==='error')return 'OCR失敗';
    if(item.ocr.status==='done')return '完了: カテゴリー候補 '+(item.ocr.matchedCategories||[]).length+'件 / 数字候補 '+(item.ocr.numberCandidates||[]).length+'件';
    return '未読取';
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
        var state=doc.createElement('span');
        state.className='sc-camera-ocr-state '+(item.ocr&&item.ocr.status==='error'?'is-error':'');
        state.textContent=itemStatus(item);
        meta.append(title,size,state);
        if(item.ocr&&item.ocr.status==='done'&&item.ocr.targetDateMatched===false){
          var warn=doc.createElement('span');
          warn.className='sc-camera-warning';
          warn.textContent='対象日と画像内の日付候補が一致しません';
          meta.append(warn);
        }
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
    var result=summary();
    status.textContent='撮影済み '+String(session.items.length)+' / '+String(MAX_FILES)+'枚';
    if(ocrStatus){
      if(session.processing)ocrStatus.textContent=session.engineStatus||'OCR処理中…';
      else if(result.ocrDone||result.ocrErrors)ocrStatus.textContent='OCR完了 '+result.ocrDone+'件 / エラー '+result.ocrErrors+'件 / カテゴリー候補 '+result.matchedCategories+'件 / 数字候補 '+result.numberCandidates+'件';
      else ocrStatus.textContent='OCRはまだ実行していません';
    }
    renderControls();
  }
  function requestClose(){
    if(session.processing){alert('画像を読み取り中です。完了してから閉じてください。');return;}
    if(session.items.length&&!confirm('撮影済み画像とOCR結果を破棄して閉じますか？'))return;
    if(dialog&&dialog.open)dialog.close();
  }
  function closeAndClear(){
    resetSession();
    if(dialog&&dialog.parentNode)dialog.remove();
    dialog=null;list=null;status=null;ocrStatus=null;dateInput=null;cameraInput=null;libraryInput=null;
  }
  function ocrOptions(logger){
    var assets=localOcrAssets(doc.baseURI||root.location.href);
    return {
      workerPath:assets.workerPath,
      corePath:assets.corePath,
      langPath:assets.langPath,
      cacheMethod:'none',
      workerBlobURL:false,
      logger:logger
    };
  }
  async function readImages(){
    if(session.processing||!session.items.length)return summary();
    if(!root.Tesseract||typeof root.Tesseract.createWorker!=='function'){
      alert('ローカルOCRを初期化できませんでした。');
      return summary();
    }
    session.processing=true;
    session.engineStatus='OCRエンジンを準備中…';
    session.items.forEach(function(item){item.ocr=null;});
    renderItems();

    var activeItem=null,worker=null;
    try{
      var options=ocrOptions(function(message){
        if(activeItem&&activeItem.ocr&&activeItem.ocr.status==='processing'&&message&&Number.isFinite(Number(message.progress))){
          activeItem.ocr.progress=Math.max(0,Math.min(1,Number(message.progress)));
        }else if(message&&message.status){
          session.engineStatus=String(message.status);
        }
        renderItems();
      });
      worker=await root.Tesseract.createWorker('jpn',1,options);
      if(worker&&typeof worker.setParameters==='function'){
        var psm=root.Tesseract.PSM&&root.Tesseract.PSM.SPARSE_TEXT!=null?root.Tesseract.PSM.SPARSE_TEXT:'11';
        await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1'});
      }
      for(var i=0;i<session.items.length;i++){
        activeItem=session.items[i];
        activeItem.ocr={status:'processing',progress:0};
        session.engineStatus='画像 '+(i+1)+' / '+session.items.length+' を読み取り中';
        renderItems();
        try{
          var result=await worker.recognize(activeItem.file,{rotateAuto:true},{text:true,blocks:true});
          var analyzed=analyzeOcrData(result&&result.data||{},categories(),session.targetDate);
          activeItem.ocr=Object.assign({status:'done',progress:1},analyzed);
        }catch(error){
          activeItem.ocr={status:'error',progress:0,error:error&&error.message?String(error.message):String(error)};
        }
        renderItems();
      }
      session.engineStatus='OCR処理が完了しました';
    }catch(error){
      session.engineStatus='OCRエンジンを初期化できませんでした';
      session.items.forEach(function(item){
        if(!item.ocr||item.ocr.status==='processing')item.ocr={status:'error',progress:0,error:error&&error.message?String(error.message):String(error)};
      });
      alert('画像を読み取れませんでした。\n'+(error&&error.message?error.message:error));
    }finally{
      activeItem=null;
      if(worker&&typeof worker.terminate==='function'){try{await worker.terminate();}catch(_){}}
      session.processing=false;
      renderItems();
    }
    return summary();
  }
  function ensureDialog(){
    if(dialog&&dialog.isConnected)return;
    dialog=doc.createElement('dialog');
    dialog.id='scCameraDialog';
    dialog.className='sc-dialog sc-camera-dialog';
    dialog.innerHTML=
      '<header><div><h2>カメラ読取</h2><p>対象日の画面を撮影し、端末内で文字と数字を読み取ります。</p></div><button type="button" id="scCameraClose">閉じる</button></header>'+
      '<section class="sc-camera-body">'+
        '<label class="sc-camera-date">対象日 <input id="scCameraDate" type="date"></label>'+
        '<p class="sc-camera-note">画像は外部OCRサービスへ送信しません。画像とOCR結果はこの画面を閉じるまでメモリ上だけで保持し、販売数入力への反映・保存はまだ行いません。</p>'+
        '<div class="sc-camera-actions">'+
          '<button type="button" id="scCameraShoot">カメラで撮影</button>'+
          '<button type="button" id="scCameraLibrary">写真から追加</button>'+
          '<button type="button" id="scCameraClear" disabled>全て削除</button>'+
        '</div>'+
        '<input id="scCameraCapture" type="file" accept="image/*" capture="environment" hidden>'+
        '<input id="scCameraFiles" type="file" accept="image/*" multiple hidden>'+
        '<div class="sc-camera-summary"><strong id="scCameraStatus"></strong><span>外部OCR送信なし・自動保存なし</span></div>'+
        '<div id="scCameraList" class="sc-camera-list"></div>'+
        '<div id="scCameraOcrStatus" class="sc-camera-ocr-summary">OCRはまだ実行していません</div>'+
        '<div class="sc-camera-next"><button id="scCameraRead" type="button" disabled>画像を読み取る</button></div>'+
      '</section>';
    doc.body.append(dialog);

    list=dialog.querySelector('#scCameraList');
    status=dialog.querySelector('#scCameraStatus');
    ocrStatus=dialog.querySelector('#scCameraOcrStatus');
    dateInput=dialog.querySelector('#scCameraDate');
    cameraInput=dialog.querySelector('#scCameraCapture');
    libraryInput=dialog.querySelector('#scCameraFiles');

    dialog.querySelector('#scCameraClose').onclick=requestClose;
    dialog.querySelector('#scCameraShoot').onclick=function(){cameraInput.click();};
    dialog.querySelector('#scCameraLibrary').onclick=function(){libraryInput.click();};
    dialog.querySelector('#scCameraClear').onclick=function(){
      if(session.processing||!session.items.length)return;
      if(confirm('撮影済み画像とOCR結果をすべて削除しますか？'))clearItems();
    };
    dialog.querySelector('#scCameraRead').onclick=readImages;
    cameraInput.onchange=function(){addFiles(cameraInput.files);cameraInput.value='';};
    libraryInput.onchange=function(){addFiles(libraryInput.files);libraryInput.value='';};
    dateInput.onchange=function(){
      var bounds=currentBounds(),value=dateInput.value;
      if(!bounds||value<bounds.min||value>bounds.max){
        session.targetDate=defaultTargetDate(getPeriod());
        dateInput.value=session.targetDate;
        alert('対象日は表示中の月から選択してください。');
        refreshDateMatches();
        renderItems();
        return;
      }
      session.targetDate=value;
      refreshDateMatches();
      renderItems();
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
    '.sc-camera-ocr-state.is-error,.sc-camera-warning{color:#b45309!important;font-weight:700}.sc-camera-ocr-summary{margin-top:10px;padding:9px 11px;border-radius:9px;background:var(--surface2);font-size:11px;color:var(--text3)}'+
    '.sc-camera-remove{min-width:58px}.sc-camera-next{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.sc-camera-next button{min-height:40px}.sc-camera-next button:disabled{opacity:.5}'+
    '@media(max-width:600px){.sc-camera-summary{flex-direction:column}.sc-camera-item{grid-template-columns:64px minmax(0,1fr) auto}.sc-camera-thumb{width:64px;height:50px}}';
  doc.head.append(style);

  model.open=open;
  model.close=requestClose;
  model.clear=clearItems;
  model.addFiles=addFiles;
  model.removeItem=removeItem;
  model.readImages=readImages;
  model.getSessionSummary=summary;

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
