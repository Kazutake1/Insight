const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('adoption history blocks automatic migration when IndexedDB or its marker disappears',async({page})=>{
  await page.route('**/indexeddb-adoption-fixture',route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  async function open(){
    await page.goto('/indexeddb-adoption-fixture');
    for(const file of ['../../insight_storage_v1.js','../fixtures/indexeddb-verified-restart.js']){
      await page.addScriptTag({path:path.join(__dirname,file)});
    }
  }
  await open();
  const result=await page.evaluate(async ()=>{
    const marker='insight_test_only_adoption';
    const source=JSON.stringify({current:'a',stores:{a:{years:['2025'],data:{2025:{}}}}});
    localStorage.setItem(SK,source);
    const gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));

    async function startup(){
      try{
        const recorded=localStorage.getItem(marker);
        const record=await gate.inspect();
        if(!record&&!recorded)return 'manual migration only';
        if(!record||record.status!=='active'||!record.sourceMatches||recorded!==record.id)return 'hold';
        const loaded=await gate.load();
        return loaded.id===recorded&&localStorage.getItem(marker)===recorded?'active':'hold';
      }catch(_){return 'hold';}
    }

    const fresh=await startup();
    const afterFresh=await gate.inspect();
    const id=await gate.prepare();
    const interrupted=await startup();
    await gate.activate(id);
    const missingMarker=await startup();
    localStorage.setItem(marker,'unrelated-id');
    const wrongMarker=await startup();
    localStorage.setItem(marker,id);
    const active=await startup();
    await new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase('insight-test-only-verified-restart-v1');
      request.onsuccess=()=>resolve();
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Test DB deletion blocked'));
    });
    const missingDb=await startup();
    const afterLoss=await gate.inspect();
    const markerUnchanged=localStorage.getItem(marker)===id;
    localStorage.removeItem(marker);
    const bothMissing=await startup();
    return {fresh,afterFresh,interrupted,missingMarker,wrongMarker,active,missingDb,afterLoss,markerUnchanged,bothMissing,
      afterBoth:await gate.inspect(),sourceUnchanged:localStorage.getItem(SK)===source};
  });
  expect(result).toEqual({
    fresh:'manual migration only',afterFresh:null,interrupted:'hold',missingMarker:'hold',wrongMarker:'hold',
    active:'active',missingDb:'hold',afterLoss:null,markerUnchanged:true,
    bothMissing:'manual migration only',afterBoth:null,sourceUnchanged:true
  });
});
