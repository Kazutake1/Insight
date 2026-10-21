/* Saved-point deterministic report. No writes, models, remote requests or raw-data logs. */
(function(root){
  'use strict';
  if(root.InsightReportPreview||!root.document)return;
  var doc=root.document,dialog,button,form,message,body,heading,host=null,sequence=0,tickets=new Map(),lastDay=null;
  var fields={};
  function node(tag,text,className){
    var n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;
  }
  function day(){
    var d=new Date(Date.now()+9*3600000);return d.toISOString().slice(0,10);
  }
  function shift(iso,n){return new Date(Date.parse(iso+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
  function key(){return typeof SK!=='undefined'?SK:root.SK;}
  function saved(){return root.localStorage.getItem(key());}
  function storageState(){
    if(!root.InsightStorage||typeof root.InsightStorage.reportState!=='function')throw Error('report_storage_unavailable');
    var s=root.InsightStorage.reportState();
    if(s.pending||s.held||s.conflict)throw Error('report_storage_unstable');
    return s;
  }
  function paint(){body.textContent=host?host.getState().text:'';}
  function invalidate(text){
    if(host)host.invalidate();
    if(body)paint();
    if(heading)heading.textContent='';
    if(message&&dialog&&dialog.open)message.textContent=text||'内容が変わりました。条件を確認して生成し直してください。';
  }
  function clearHost(){if(host)host.close();host=null;tickets.clear();if(body)body.textContent='';if(heading)heading.textContent='';}
  function addField(id,label,type){
    var wrap=node('label',undefined,'irp-field'),title=node('span',label),input=node(type==='select'?'select':'input');
    input.id='irp-'+id;input.name=id;if(type!=='select')input.type=type;
    input.required=true;fields[id]=input;wrap.append(title,input);form.append(wrap);return input;
  }
  function option(select,value,label){var o=node('option',label);o.value=value;select.append(o);}
  function catalog(){
    var before=saved();if(typeof before!=='string'||before.length>2000000)throw Error('report_snapshot_unavailable');
    var value=JSON.parse(before);
    if(!value||!value.stores||Array.isArray(value.stores)||!value.salesCountManagement||
      !Array.isArray(value.salesCountManagement.categories)||before!==saved())throw Error('report_catalog_unavailable');
    var profile={revision:'saved-preview-'+(++sequence),stores:Object.keys(value.stores).map(function(id){
      return {id:id,name:value.stores[id].name};
    })};
    // The configured reader independently validates the profile and every captured input.
    host=root.InsightReport.createSavedHost(profile);
    fields.store.replaceChildren();option(fields.store,'','店舗を選択');
    profile.stores.forEach(function(s){option(fields.store,s.id,s.name);});
    var selected=doc.getElementById('storeSel');
    fields.store.value=selected&&profile.stores.some(function(s){return s.id===selected.value;})?selected.value:'';
    fields.category.replaceChildren();option(fields.category,'','カテゴリーを選択');
    value.salesCountManagement.categories.forEach(function(c){
      if(c&&typeof c.id==='string'&&typeof c.name==='string')option(fields.category,c.id,c.name);
    });
    fields.category.value=''; // No implicit first-category selection.
  }
  function request(id){
    var s=storageState();
    return JSON.stringify({store_id:fields.store.value,
      period:{start:fields.start.value,end:fields.end.value},
      reference:{start:fields.referenceStart.value,end:fields.referenceEnd.value},
      quantity_day:fields.quantityDay.value,
      quantity_reference:{start:fields.quantityStart.value,end:fields.quantityEnd.value},
      category_id:fields.category.value,as_of:day(),comparison_confirmed:false,
      request_id:id,data_revision:'saved-revision-'+s.revision});
  }
  function generate(){
    invalidate('生成しています。');
    try{
      storageState();
      if(!host||!form.reportValidity())throw Error('report_conditions_required');
      var id='preview-'+(++sequence),captured=request(id);
      var resolver=root.InsightTripHistoryResolver;
      var dependencies={source_revision:'insight-saved-preview-v1'};
      if(resolver&&typeof resolver.resolveDate==='function')
        dependencies.resolver=function(snapshot,store,category,iso,options){return resolver.resolveDate(snapshot,store,category,iso,options);};
      if(!host.capture(saved,function(){return request(id);},dependencies,{focus_limit:3,min_days:2,
        relative_threshold:{numerator:'1',denominator:'10'}}))throw Error('report_capture_rejected');
      // Recheck after capture; notifications and the revision are independent of raw equality.
      if(captured!==request(id))throw Error('report_conditions_changed');
      paint();
      heading.textContent=fields.category.options[fields.category.selectedIndex].textContent+' ／ 取得日時：'+
        new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
      message.textContent='保存済みの値から作成しました。比較条件と祝日確認が未確認の項目は判定を保留しています。';
    }catch(_){
      invalidate('報告を生成できません。店舗・期間・カテゴリーと保存状態を確認してください。保存失敗や別タブ更新後は、未保存の入力を控えてから再読み込みしてください。');
    }finally{paint();}
  }
  function open(){
    clearHost();
    try{
      storageState();catalog();
      var today=day();
      fields.start.value=today;fields.end.value=today;
      fields.referenceStart.value=shift(today,-7);fields.referenceEnd.value=shift(today,-7);
      fields.quantityDay.value=today;fields.quantityStart.value=shift(today,-28);fields.quantityEnd.value=shift(today,-1);
      message.textContent='店舗・期間・カテゴリーを確認して生成してください。未保存の入力は含みません。';
    }catch(_){clearHost();message.textContent='保存済みのデータを確認できません。保存状態を確認し、必要なら未保存の入力を控えてから再読み込みしてください。';}
    if(!dialog.open)dialog.showModal();
  }
  function onStorageUpdate(event){
    if(!host)return;
    try{
      if(event.phase==='begin')tickets.set(event.ticket,host.beginUpdate('storage'));
      else if(event.phase==='finish'){
        var t=tickets.get(event.ticket);tickets.delete(event.ticket);
        if(t)host.finishUpdate(t,event.outcome);
      }else if(event.phase==='external')host.externalChange();
    }finally{
      paint();heading.textContent='';
      if(dialog.open)message.textContent='保存状態が変わったため報告を消しました。処理完了後、条件を確認して生成し直してください。';
    }
  }
  function init(){
    var nav=doc.querySelector('#sidebar .sidebar-btns');if(!nav||!root.InsightReport)return;
    button=node('button','保存時点の定型報告','sidebar-btn');button.id='insightReportOpen';button.type='button';
    button.addEventListener('click',open);nav.prepend(button);
    dialog=node('dialog',undefined,'irp-dialog');dialog.id='insightReportDialog';dialog.setAttribute('aria-labelledby','irp-title');
    var top=node('header',undefined,'irp-head'),title=node('h2','保存時点の定型報告'),close=node('button','閉じる');
    title.id='irp-title';close.type='button';close.addEventListener('click',function(){dialog.close();});
    top.append(title,close);
    var note=node('p','保存済みの値を端末内で集計します。未保存の入力は含めず、通信・モデル呼出し・報告の保存は行いません。','irp-note');
    form=node('form',undefined,'irp-grid');form.id='insightReportConditions';
    addField('store','対象店舗','select');addField('category','数量カテゴリー','select');
    addField('start','対象期間・開始','date');addField('end','対象期間・終了','date');
    addField('referenceStart','比較期間・開始','date');addField('referenceEnd','比較期間・終了','date');
    addField('quantityDay','日合計の対象日','date').parentElement.classList.add('irp-full');
    addField('quantityStart','参考平日平均の期間・開始','date');addField('quantityEnd','参考平日平均の期間・終了','date');
    var actions=node('div',undefined,'irp-actions'),submit=node('button','報告を生成');
    submit.id='insightReportGenerate';submit.type='submit';actions.append(submit);form.append(actions);
    form.addEventListener('submit',function(e){e.preventDefault();generate();});
    form.addEventListener('input',function(){invalidate();});form.addEventListener('change',function(){invalidate();});
    message=node('p','','irp-message');message.id='insightReportStatus';message.setAttribute('role','status');
    heading=node('p','','irp-note');heading.id='insightReportCapturedAt';
    body=node('pre','','irp-output');body.id='insightReportText';
    dialog.append(top,note,form,message,heading,body);doc.body.append(dialog);
    dialog.addEventListener('close',clearHost);dialog.addEventListener('cancel',clearHost);
    function outside(event){if(dialog.open&&!dialog.contains(event.target)&&event.target!==button)invalidate();}
    ['pointerdown','input','change','click'].forEach(function(type){doc.addEventListener(type,outside,true);});
    root.addEventListener('pageshow',function(){invalidate('再表示されたため報告を消しました。生成し直してください。');});
    doc.addEventListener('visibilitychange',function(){invalidate('表示状態が変わったため報告を消しました。生成し直してください。');});
    lastDay=day();
    root.setInterval(function(){var current=day();if(current!==lastDay){lastDay=current;invalidate('日付が変わったため報告を消しました。生成し直してください。');}},1000);
  }
  root.InsightReportPreview=Object.freeze({onStorageUpdate:onStorageUpdate});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
