/* Draft-only connection to the existing sales input screen. */
(function(root){
  'use strict';

  async function connect(){
    const doc=root.document;
    const button=doc.getElementById('salesSaveBtn');
    const notice=doc.getElementById('savedSales');
    if(!button||!notice||currentNav!==2)throw new Error('Open the sales input screen first');

    const api=root.InsightIndexedDBStorageV1;
    let committed=await api.read();
    const target={storeId:allStores.current,year:editYear.sales,month:editMonth.sales,day:root.salesSelDay};
    function matchesScreen(){
      return currentNav===2&&allStores.current===target.storeId&&editYear.sales===target.year&&
        editMonth.sales===target.month&&root.salesSelDay===target.day&&
        root.InsightStorage.serialize(allStores)===root.InsightStorage.serialize(committed.snapshot);
    }
    function row(snapshot){
      return snapshot.stores[target.storeId]?.data?.[target.year]?.[target.month]?.[target.day-1];
    }
    if(!matchesScreen()||Number(row(committed.snapshot)?.d)!==target.day)
      throw new Error('The displayed day is not the committed snapshot');

    const status=doc.createElement('p');
    status.setAttribute('role','status');
    button.parentNode.insertBefore(status,button.nextSibling);
    let held=false,busy=false,timer;
    function stop(message){
      held=true;
      button.disabled=true;
      status.textContent=message;
    }

    async function save(){
      if(held||busy)return;
      clearTimeout(timer);
      notice.classList.remove('is-visible');
      if(!matchesScreen()){
        stop('表示中の店舗・日付または保存済みデータが変わったため、保存を停止しました。');
        return;
      }

      const draft=drafts.sales[target.day-1];
      const sales=Number(draft.売上);
      const items=Number(draft.買上点数);
      if(!Number.isSafeInteger(sales)||sales<0||!Number.isFinite(items)||items<0){
        status.textContent='売上と買上点数を確認してください。';
        return;
      }
      const candidate=JSON.parse(JSON.stringify(committed.snapshot));
      Object.assign(row(candidate),{売上:sales,買上点数:items});
      const body=doc.body;
      const wasInert=body.inert;
      busy=true;
      button.disabled=true;
      body.inert=true;
      status.textContent='保存を確認しています。';
      try{
        const result=await api.save(committed.revision,candidate);
        if(!matchesScreen()){
          stop('表示中の店舗・日付または保存済みデータが変わりました。保存済みの内容を確認してください。');
          return;
        }
        Object.assign(row(allStores),row(result.snapshot));
        committed=result;
        updateMissingBadge();
        status.textContent='';
        notice.classList.add('is-visible');
        timer=root.setTimeout(()=>notice.classList.remove('is-visible'),3000);
      }catch(_){
        stop('保存結果を確認できないため、追加の保存を停止しました。');
      }finally{
        busy=false;
        body.inert=wasInert;
        button.disabled=held;
      }
    }

    // Cancel the synchronous core and its after-save writers in the isolated sales screen.
    root.InsightHooks.on('input:save:before','indexeddb-sales-input-preview',ctx=>{
      if(ctx.args[0]!=='sales')return;
      ctx.result=save();
      return false;
    },-1000);
  }

  root.InsightIndexedDBSalesInputPreviewV1=Object.freeze({connect});
})(globalThis);
