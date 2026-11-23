/* Isolated deployment candidate. Loaded only by an explicitly selected test host. */
(function(root){
  'use strict';
  const document=root.document;
  const container=document.getElementById('loading');
  const loader=document.currentScript.dataset.loader;
  let adopted=false;
  let verifiedSnapshot=null;

  function halt(){
    document.body.inert=false;
    const status=document.createElement('p');
    status.setAttribute('role','status');
    status.textContent='確定版で画面を開けないため、起動と保存を停止しています。';
    document.body.replaceChildren(status);
  }

  function loadScript(url){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=url;
      script.onload=resolve;
      script.onerror=reject;
      document.body.append(script);
    });
  }

  async function connectAdopted(){
    try{
      for(let attempt=0;!document.getElementById('insightSettingsYearSection')||
        typeof root.InsightHourlyCustomers?.connectIndexedDBPreview!=='function';attempt++){
        if(attempt>=100)throw new Error('Adopted controls did not load');
        await new Promise(resolve=>root.setTimeout(resolve,50));
      }
      await Promise.all([
        './insight_indexeddb_quick_input_preview_v1.js',
        './insight_indexeddb_sales_input_preview_v1.js',
        './insight_indexeddb_recovery_preview_v1.js'
      ].map(loadScript));
      await root.InsightIndexedDBSalesInputPreviewV1.connect('sales',{
        followInputScreens:true,followQuickInput:true,manageStoresAndYears:true,
        recoverySettings:{restart:()=>root.location.reload()}
      });
      document.body.inert=false;
    }catch(_){halt();}
  }

  root.InsightIndexedDBCandidateV1=Object.freeze({
    isAdopted:()=>adopted,
    initializeAdopted(){
      document.body.inert=true;
      if(!adopted||!verifiedSnapshot)throw new Error('A verified adopted snapshot is required');
      root.persist=()=>{throw new Error('Legacy storage is unavailable after adoption');};
      const snapshot=verifiedSnapshot;
      verifiedSnapshot=null;
      document.addEventListener('DOMContentLoaded',connectAdopted,{once:true});
      return snapshot;
    }
  });

  function loadShell(){return loadScript(loader).catch(halt);}
  root.InsightIndexedDBMigrationPreviewV1.start(container,loadShell,result=>{
    adopted=true;
    verifiedSnapshot=result.snapshot;
    return loadShell();
  },{restart:()=>root.location.reload()}).catch(halt);
})(globalThis);
