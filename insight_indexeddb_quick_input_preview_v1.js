/* One-day Quick input for the isolated IndexedDB Draft. The ordinary loader does not include it. */
(function(root){
  'use strict';
  const doc=root.document;
  const dateContext=root.InsightDateContext;
  let session;

  function readInputs(){
    const items=doc.getElementById('qi_買上点数');
    const itemsValue=items.dataset.insightItemsRaw??items.value;
    const integers=['qi_売上','qi_客数',...HAIKI_CATS.map(category=>'qi_h_'+category)];
    const validIntegers=integers.every(id=>{
      const value=doc.getElementById(id).value.replace(/,/g,'').trim();
      return value===''||(/^[+-]?\d+$/.test(value)&&Number.isSafeInteger(Number(value)));
    });
    const points=itemsValue.trim();
    if(!validIntegers||(points!==''&&(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(points)||!Number.isFinite(Number(points))))){
      throw new Error('売上・客数・買上点数・廃棄の入力を確認してください。');
    }
    const values=readQuickValues(itemsValue);
    if(!Number.isSafeInteger(values.廃棄金額)||!WX_KEYS.includes(values.weather))
      throw new Error('廃棄合計または天気の入力を確認してください。');
    return {
      values,
      memo:doc.getElementById('qi_storeMemo').value,
      temperatures:root.InsightTemperature.readQuickInputs()
    };
  }

  async function connect(){
    if(session||currentNav!==0||root.InsightIndexedDBSalesInputPreviewV1?.getConnectedStatus()||
       root.InsightWeatherTemperatureAuto.hasPendingFetch()){
      throw new Error('Quick input preview cannot start in this session');
    }
    const storeId=allStores.current;
    const api=root.InsightIndexedDBStorageV1;
    const button=doc.getElementById('quickSaveBtn');
    const page=doc.getElementById('pageQuick');
    const selector=doc.getElementById('storeSel');
    const serialize=root.InsightStorage.serialize;
    let committed=await api.read();
    let busy=false,held=false,noticeTimer;
    function matchesBaseline(){
      return currentNav===0&&allStores.current===storeId&&store===allStores.stores[storeId]&&
        serialize(allStores)===serialize(committed.snapshot);
    }
    if(session||!matchesBaseline()||root.InsightWeatherTemperatureAuto.hasPendingFetch())
      throw new Error('Quick input preview does not match the committed store');

    const status=doc.createElement('span');
    status.setAttribute('role','status');
    button.after(status);
    function stop(){
      held=true;
      button.disabled=true;
      status.textContent='保存結果を確認できないため、追加の保存を停止しました。';
    }
    function getStatus(){
      return {
        state:held?'HELD':busy?'ACTIVE':'IDLE_OBSERVED',
        hasUnsavedInput:busy||held||root.InsightQuickDateNavV1.hasUnsavedInput()
      };
    }
    function matchesDate(iso){
      return dateContext.getSelectedIso()===iso&&doc.getElementById('iqdDateInput')?.value===iso;
    }
    function supports(date){
      const info=dateContext.info(date);
      const shop=committed.snapshot.stores[storeId];
      return info&&!dateContext.isFuture(date)&&shop.years.some(year=>String(year)===info.fy)&&
        shop.data?.[info.fy]?.[info.month]?.[info.day-1];
    }
    function allowDateChange(date){
      if(busy||held)return false;
      if(supports(date))return true;
      status.textContent='試験用の保存は登録済み年度の当日・過去日に限ります。';
      return false;
    }

    function finishFeedback(){
      clearTimeout(noticeTimer);
      button.textContent='保存する';
      button.classList.remove('is-saved-feedback');
    }

    async function save(target,inputs,baseline){
      const wasInert=doc.body.inert;
      doc.body.inert=true;
      try{
        const {fy,month,day,iso}=target;
        const candidate=JSON.parse(JSON.stringify(baseline.snapshot));
        const shop=candidate.stores[storeId];
        const row=shop.data[fy][month][day-1];
        Object.assign(row,inputs.values,{storeMemo:inputs.memo});
        updateSharedWeather(candidate,fy,month,day,inputs.values.weather);
        root.InsightTemperature.applyQuickTemperatures(candidate,shop,fy,month,day,row,inputs.temperatures);
        const unchanged=()=>matchesBaseline()&&matchesDate(iso)&&
          JSON.stringify(readInputs())===JSON.stringify(inputs);
        if(!unchanged())throw new Error('Quick input changed before save');
        const result=await api.save(baseline.revision,candidate);
        if(!unchanged())throw new Error('Quick input changed during save');
        allStores=JSON.parse(JSON.stringify(result.snapshot));
        store=allStores.stores[storeId];
        committed=result;
        root.InsightHooks.emit('quick:preview:committed',{});
        updateMissingBadge();
        button.textContent='✓ 保存しました';
        button.classList.add('is-saved-feedback');
        status.textContent='今日の入力を保存しました。';
        noticeTimer=root.setTimeout(finishFeedback,2000);
        return 'completed';
      }catch(_){
        stop();
        return 'unknown';
      }finally{
        busy=false;
        button.disabled=held;
        doc.body.inert=wasInert;
      }
    }

    root.InsightHooks.on('quick:save:before','indexeddb-quick-input-preview',ctx=>{
      if(busy||held)return false;
      finishFeedback();
      const target=dateContext.getSelectedInfo();
      if(!supports(target.date)){
        allowDateChange(target.date);
        return false;
      }
      if(!matchesBaseline()||!matchesDate(target.iso)){
        ctx.runIndexedDBPreview=()=>{stop();return 'unknown';};
        return false;
      }
      let inputs;
      try{inputs=readInputs();}
      catch(error){
        status.textContent=error.message;
        return false;
      }
      const baseline=committed;
      busy=true;
      button.disabled=true;
      status.textContent='保存を確認しています。';
      ctx.runIndexedDBPreview=()=>save(target,inputs,baseline);
      return false;
    },-1000);

    // Other write entrances are outside this one-screen preview.
    function blockUnsupported(){
      if(!busy&&!held)status.textContent='この試験では今日の入力の保存と日付移動を行えます。';
      return false;
    }
    root.addEventListener('click',event=>{
      if(!busy&&!held&&page.contains(event.target)&&!event.target.closest('#quickClearBtn,#autoWxBtn'))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      blockUnsupported();
    },true);
    root.addEventListener('change',event=>{
      if(!busy&&!held&&page.contains(event.target))return;
      if(event.target===selector)selector.value=storeId;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
    root.addEventListener('beforeunload',event=>{
      if(!getStatus().hasUnsavedInput)return;
      event.preventDefault();
      event.returnValue='';
    });
    root.gotoNav=root.switchStore=root.showStoreMenu=root.clearTodayData=root.fetchWeather=blockUnsupported;
    session={getStatus,allowDateChange};
    return Object.freeze({getStatus});
  }

  root.InsightIndexedDBQuickInputPreviewV1=Object.freeze({
    connect,
    allowDateChange:date=>session?.allowDateChange(date)??true
  });
})(globalThis);
