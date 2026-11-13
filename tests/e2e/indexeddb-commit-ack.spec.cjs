const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('IndexedDB preserves committed revisions when save acknowledgement and readback fail',async({page})=>{
  await page.route('**/indexeddb-commit-fixture',route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  await page.goto('/indexeddb-commit-fixture');
  await page.addScriptTag({path:path.join(__dirname,'../../insight_storage_v1.js')});
  await page.addScriptTag({path:path.join(__dirname,'../fixtures/indexeddb-verified-restart.js')});

  const actual=await page.evaluate(async ()=>{
    const source=JSON.stringify({current:'a',stores:{
      a:{years:['2025'],data:{2025:{'1月':[{売上:123}]}}},
      b:{years:['2025'],data:{2025:{'1月':[{売上:321}]}}}
    }});
    localStorage.setItem(SK,source);
    const gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));
    await gate.activate(await gate.prepare());
    const before=await gate.load();
    const proposed=JSON.parse(before.raw);
    proposed.stores.a.data[2025]['1月'][0].売上=456;
    const expectedRaw=InsightStorage.serialize(proposed);

    // Lose the response only after the real IndexedDB transaction has completed.
    const outcome=await (async ()=>{
      await gate.save(before.revision,proposed);
      throw new Error('Injected acknowledgement loss');
    })().then(()=> 'acknowledged',error=>error.message);

    async function classify(read){
      try{
        const record=await read();
        if(record.revision===before.revision+1&&record.raw===expectedRaw)return 'committed';
        if(record.revision===before.revision&&record.raw===before.raw)return 'unchanged';
        return 'conflict';
      }catch(_){return 'unknown';}
    }
    const unknown=await classify(()=>Promise.reject(new Error('Injected read failure')));
    const confirmed=await classify(()=>gate.load());
    const newer=JSON.parse(expectedRaw);
    newer.stores.b.data[2025]['1月'][0].売上=654;
    await gate.save(1,newer);
    const conflict=await classify(()=>gate.load());
    const retry=await gate.save(before.revision,proposed).then(()=>null,error=>error.message);
    const last=await gate.load();
    return {outcome,unknown,confirmed,conflict,retry,revision:last.revision,
      newestMatches:last.raw===InsightStorage.serialize(newer),
      previousMatches:last.previous.revision===1&&last.previous.raw===expectedRaw,
      sourceMatches:localStorage.getItem(SK)===source};
  });
  expect(actual).toEqual({
    outcome:'Injected acknowledgement loss',unknown:'unknown',confirmed:'committed',conflict:'conflict',
    retry:'Pilot revision conflict',revision:2,newestMatches:true,previousMatches:true,sourceMatches:true
  });
});
