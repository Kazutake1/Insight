/* Draft-only connection to the existing sales input screen. */
(function(root){
  'use strict';

  let connectedStatus=null;

  async function connect(){
    if(connectedStatus)throw new Error('Sales preview already connected');
    const doc=root.document;
    const button=doc.getElementById('salesSaveBtn');
    const notice=doc.getElementById('savedSales');
    if(!button||!notice||currentNav!==2)throw new Error('Open the sales input screen first');

    const api=root.InsightIndexedDBStorageV1;
    let committed=await api.read();
    const target={storeId:allStores.current,year:editYear.sales,month:editMonth.sales};
    function matchesPeriod(){
      return currentNav===2&&allStores.current===target.storeId&&
        editYear.sales===target.year&&editMonth.sales===target.month;
    }
    function matchesScreen(){
      return matchesPeriod()&&
        root.InsightStorage.serialize(allStores)===root.InsightStorage.serialize(committed.snapshot);
    }
    function rows(snapshot,storeId){
      return snapshot.stores[storeId]?.data?.[target.year]?.[target.month];
    }
    function changes(){
      const saved=rows(committed.snapshot,target.storeId);
      if(!Array.isArray(saved)||saved.length!==drafts.sales.length)
        throw new Error('Sales month is incomplete');
      const edited=[];
      drafts.sales.forEach((draft,index)=>{
        const before=saved[index];
        const day=index+1;
        const sales=Number(draft.売上),items=Number(draft.買上点数),weather=draft.weather||'';
        if(Number(draft.d)!==day||Number(before?.d)!==day||
           !Number.isSafeInteger(sales)||sales<0||!Number.isFinite(items)||items<0)
          throw new Error('Sales input is invalid');
        const fields={};
        if(sales!==Number(before.売上||0))fields.売上=sales;
        if(items!==Number(before.買上点数||0))fields.買上点数=items;
        if(weather!==(before.weather||'')){
          if(!WX_KEYS.includes(weather))throw new Error('Sales weather is invalid');
          fields.weather=weather;
        }
        if(Object.keys(fields).length)edited.push({day,fields});
      });
      return edited;
    }
    function apply(snapshot,edited){
      for(const {day,fields} of edited){
        const row=rows(snapshot,target.storeId)[day-1];
        Object.assign(row,fields);
        if(!Object.hasOwn(fields,'weather'))continue;
        snapshot.sharedWeather??={};
        snapshot.sharedWeather[wxKey(target.year,target.month,day)]=fields.weather;
        for(const id of Object.keys(snapshot.stores)){
          const peer=rows(snapshot,id)?.[day-1];
          if(Number(peer?.d)===day)peer.weather=fields.weather;
        }
      }
    }
    if(!matchesScreen())throw new Error('The displayed month is not the committed snapshot');
    changes();

    const status=doc.createElement('p');
    status.setAttribute('role','status');
    button.parentNode.insertBefore(status,button.nextSibling);
    let held=false,busy=false,timer;
    const getStatus=()=>{
      let dirty=true;
      try{dirty=!matchesScreen()||changes().length>0;}catch(_){}
      return {state:held?'HELD':busy?'ACTIVE':'IDLE_OBSERVED',hasUnsavedInput:dirty};
    };
    function stop(message){
      held=true;
      button.disabled=true;
      status.textContent=message;
    }

    async function save(){
      if(held||busy)return 'cancelled_before_mutation';
      clearTimeout(timer);
      notice.classList.remove('is-visible');
      if(!matchesScreen()){
        stop('表示中の店舗・日付または保存済みデータが変わったため、保存を停止しました。');
        return 'unknown';
      }

      let edited;
      try{edited=changes();}
      catch(_){
        status.textContent='売上・買上点数・天気の入力を確認してください。';
        return 'cancelled_before_mutation';
      }
      if(!edited.length){
        status.textContent='保存する変更はありません。';
        return 'cancelled_before_mutation';
      }
      const candidate=JSON.parse(JSON.stringify(committed.snapshot));
      apply(candidate,edited);
      const body=doc.body;
      const wasInert=body.inert;
      busy=true;
      button.disabled=true;
      body.inert=true;
      status.textContent='保存を確認しています。';
      try{
        const result=await api.save(committed.revision,candidate);
        if(!matchesScreen()||JSON.stringify(changes())!==JSON.stringify(edited)){
          stop('表示中の店舗・日付または保存済みデータが変わりました。保存済みの内容を確認してください。');
          return 'unknown';
        }
        apply(allStores,edited);
        committed=result;
        updateMissingBadge();
        status.textContent='';
        notice.classList.add('is-visible');
        timer=root.setTimeout(()=>notice.classList.remove('is-visible'),3000);
        return 'completed';
      }catch(_){
        stop('保存結果を確認できないため、追加の保存を停止しました。');
        return 'unknown';
      }finally{
        busy=false;
        body.inert=wasInert;
        button.disabled=held;
      }
    }

    // Cancel the synchronous core and its after-save writers in the isolated sales screen.
    root.InsightHooks.on('input:save:before','indexeddb-sales-input-preview',ctx=>{
      if(ctx.args[0]!=='sales')return;
      if(!held&&!busy)ctx.runIndexedDBPreview=save;
      return false;
    },-1000);
    const gotoNav=root.gotoNav;
    root.gotoNav=function(){
      if(currentNav===2){
        const current=getStatus();
        if(current.state!=='IDLE_OBSERVED')return false;
        if(matchesPeriod()&&current.hasUnsavedInput&&
           !root.confirm('未保存の入力があります。\n保存せずに画面を移動しますか？'))return false;
      }
      return gotoNav.apply(this,arguments);
    };
    connectedStatus=getStatus;
    return Object.freeze({getStatus});
  }

  root.InsightIndexedDBSalesInputPreviewV1=Object.freeze({connect,getConnectedStatus:()=>connectedStatus?.()??null});
})(globalThis);
