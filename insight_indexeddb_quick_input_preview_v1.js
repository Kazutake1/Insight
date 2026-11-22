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

  async function connect({sharedState}={}){
    if(session||currentNav!==0||(!sharedState&&root.InsightIndexedDBSalesInputPreviewV1?.getConnectedStatus())||
       root.InsightWeatherTemperatureAuto.hasPendingFetch()){
      throw new Error('Quick input preview cannot start in this session');
    }
    const api=root.InsightIndexedDBStorageV1;
    const button=doc.getElementById('quickSaveBtn');
    const page=doc.getElementById('pageQuick');
    const selector=doc.getElementById('storeSel');
    const serialize=root.InsightStorage.serialize;
    const state=sharedState??{storeId:allStores.current,committed:await api.read(),busy:false,held:false};
    let noticeTimer;
    let baselineDraft=null;
    function matchesBaseline(){
      return currentNav===0&&allStores.current===state.storeId&&store===allStores.stores[state.storeId]&&
        serialize(allStores)===serialize(state.committed.snapshot);
    }
    if(session||!matchesBaseline()||root.InsightWeatherTemperatureAuto.hasPendingFetch())
      throw new Error('Quick input preview does not match the committed store');

    const status=doc.createElement('span');
    status.setAttribute('role','status');
    button.after(status);
    function stop(){
      state.held=true;
      button.disabled=true;
      status.textContent='保存結果を確認できないため、追加の保存を停止しました。';
    }
    function rememberDraft(iso,inputs){
      baselineDraft={iso,values:JSON.stringify(inputs)};
    }
    function rememberRenderedDraft(){
      if(state.busy||state.held||dateContext.getSelectedIso()===baselineDraft?.iso)return;
      baselineDraft=null;
      try{
        const {date,iso}=dateContext.getSelectedInfo();
        if(matchesBaseline()&&supports(date)&&matchesDate(iso))rememberDraft(iso,readInputs());
      }catch(_){
        // Without a complete baseline the draft is treated as unsaved.
      }
    }
    function hasUnsavedInput(){
      if(state.busy||state.held||state.pending||state.hourly?.hasUnsavedInput())return true;
      if(sharedState&&currentNav!==0)return false;
      if(!baselineDraft)return true;
      // The date input may already contain a new choice while its change event is being handled.
      if(currentNav!==0||allStores.current!==state.storeId||store!==allStores.stores[state.storeId]||
         dateContext.getSelectedIso()!==baselineDraft.iso)return true;
      try{return JSON.stringify(readInputs())!==baselineDraft.values;}
      catch(_){return true;}
    }
    function getStatus(){
      return {state:state.held?'HELD':(state.busy||state.pending)?'ACTIVE':'IDLE_OBSERVED',hasUnsavedInput:hasUnsavedInput()};
    }
    function matchesDate(iso){
      return dateContext.getSelectedIso()===iso&&doc.getElementById('iqdDateInput')?.value===iso;
    }
    function supports(date){
      const info=dateContext.info(date);
      const shop=state.committed.snapshot.stores[state.storeId];
      return info&&!dateContext.isFuture(date)&&shop.years.some(year=>String(year)===info.fy)&&
        shop.data?.[info.fy]?.[info.month]?.[info.day-1];
    }
    function allowDateChange(date){
      if(state.busy||state.held||state.pending||state.hourly?.dialog()?.open)return false;
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
        const shop=candidate.stores[state.storeId];
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
        store=allStores.stores[state.storeId];
        state.committed=result;
        rememberDraft(iso,inputs);
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
        state.busy=false;
        button.disabled=state.held;
        doc.body.inert=wasInert;
      }
    }

    root.InsightHooks.on('quick:save:before','indexeddb-quick-input-preview',ctx=>{
      if(currentNav!==0||state.busy||state.held||state.pending||state.hourly?.dialog()?.open)return false;
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
      const baseline=state.committed;
      state.busy=true;
      button.disabled=true;
      status.textContent='保存を確認しています。';
      ctx.runIndexedDBPreview=()=>save(target,inputs,baseline);
      return false;
    },-1000);

    // Other write entrances are outside this one-screen preview.
    function blockUnsupported(){
      if(!state.busy&&!state.held&&!state.pending)status.textContent='この試験では今日の入力の保存と日付移動を行えます。';
      return false;
    }
    if(!sharedState){
      root.addEventListener('click',event=>{
        if(!state.busy&&!state.held&&page.contains(event.target)&&!event.target.closest('#quickClearBtn,#autoWxBtn'))return;
        event.preventDefault();
        event.stopImmediatePropagation();
        blockUnsupported();
      },true);
      root.addEventListener('change',event=>{
        if(!state.busy&&!state.held&&page.contains(event.target))return;
        if(event.target===selector)selector.value=state.storeId;
        event.preventDefault();
        event.stopImmediatePropagation();
      },true);
      root.addEventListener('beforeunload',event=>{
        if(!getStatus().hasUnsavedInput)return;
        event.preventDefault();
        event.returnValue='';
      });
      root.gotoNav=root.switchStore=root.showStoreMenu=blockUnsupported;
    }
    root.clearTodayData=root.fetchWeather=blockUnsupported;
    function onEnter(){
      baselineDraft=null;
      finishFeedback();
      status.textContent='';
      rememberRenderedDraft();
    }
    rememberRenderedDraft();
    session={getStatus,allowDateChange,rememberRenderedDraft};
    return Object.freeze({getStatus,onEnter});
  }

  root.InsightIndexedDBQuickInputPreviewV1=Object.freeze({
    connect,
    getStatus:()=>session?.getStatus()??null,
    allowDateChange:date=>session?.allowDateChange(date)??true,
    dateChanged:()=>session?.rememberRenderedDraft()
  });
})(globalThis);
