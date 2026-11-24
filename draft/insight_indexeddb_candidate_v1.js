/* Startup candidate used by the Draft shell on its isolated test origin. */
(function(root){
  'use strict';
  const document=root.document;
  const version='20261124-indexeddb-preview-7';
  let adopted=false;
  let verifiedSnapshot=null;

  function halt(stage){
    document.body.inert=false;
    const status=document.createElement('p');
    status.setAttribute('role','status');
    status.dataset.indexeddbStartupStage=stage;
    status.textContent='確定版で画面を開けないため、起動と保存を停止しています。';
    document.body.replaceChildren(status);
  }

  function loadScript(url){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=url+'?v='+version;
      script.onload=resolve;
      script.onerror=reject;
      document.body.append(script);
    });
  }

  async function connectAdopted(){
    let stage='controls';
    try{
      for(let attempt=0;!document.getElementById('insightSettingsYearSection')||
        typeof root.InsightHourlyCustomers?.connectIndexedDBPreview!=='function';attempt++){
        if(attempt>=100)throw new Error('Adopted controls did not load');
        await new Promise(resolve=>root.setTimeout(resolve,50));
      }
      stage='modules';
      await Promise.all([
        './insight_indexeddb_quick_input_preview_v1.js',
        './insight_indexeddb_sales_input_preview_v1.js',
        './insight_indexeddb_recovery_preview_v1.js'
      ].map(loadScript));
      stage='storage-connection';
      await root.InsightIndexedDBSalesInputPreviewV1.connect('sales',{
        followInputScreens:true,followQuickInput:true,manageStoresAndYears:true,
        recoverySettings:{restart:()=>root.location.reload()}
      });
      document.body.inert=false;
    }catch(error){
      const reason={
        'Quick input preview cannot start in this session':'quick-session',
        'Quick input preview does not match the committed store':'quick-snapshot',
        'Another Insight operation is in progress':'storage-lock',
        'Missing isolated settings controls':'settings-controls',
        'Open the corresponding input screen first':'input-screen',
        'The management controls are unavailable':'management-controls'
      }[error?.message];
      halt(reason??stage);
    }
  }

  function mountMigration(){
    const actions=document.getElementById('insightSettingsDataActions');
    if(!actions)throw new Error('Migration settings did not load');
    const panel=document.createElement('section');
    panel.id='insightIndexedDBMigration';
    actions.after(panel);
    root.InsightIndexedDBMigrationPreviewV1.mount(panel);
  }

  async function waitForShell(){
    if(document.readyState==='loading'){
      await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    }
    await new Promise(resolve=>root.setTimeout(resolve,0));
  }

  root.InsightIndexedDBCandidateV1=Object.freeze({
    start(container,loadShell,{allowMigration=false,prepareRecovery}={}){
      return root.InsightIndexedDBMigrationPreviewV1.start(container,async ()=>{
        await loadShell();
        if(allowMigration){
          await waitForShell();
          mountMigration();
        }
      },async result=>{
        adopted=true;
        verifiedSnapshot=result.snapshot;
        await loadShell();
        await waitForShell();
        if(verifiedSnapshot)throw new Error('The adopted snapshot was not initialized');
      },{restart:()=>root.location.reload(),prepareRecovery,allowMissingRestore:allowMigration}).catch(()=>halt('shell'));
    },
    isAdopted:()=>adopted,
    initializeAdopted(){
      document.body.inert=true;
      if(!adopted||!verifiedSnapshot)throw new Error('A verified adopted snapshot is required');
      root.persist=()=>{throw new Error('Legacy storage is unavailable after adoption');};
      const snapshot=verifiedSnapshot;
      verifiedSnapshot=null;
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',connectAdopted,{once:true});
      }else{
        queueMicrotask(connectAdopted);
      }
      return snapshot;
    }
  });

})(globalThis);
