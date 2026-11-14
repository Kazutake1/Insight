const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('encrypted IndexedDB restore rolls back only its own committed revision',async({page})=>{
  await page.route('**/indexeddb-restore-fixture',route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  await page.goto('/indexeddb-restore-fixture');
  for(const file of ['../../insight_storage_v1.js','../../insight_backup_crypto_v1.js','../fixtures/indexeddb-verified-restart.js']){
    await page.addScriptTag({path:path.join(__dirname,file)});
  }
  const outcome=await page.evaluate(async ()=>{
    const source={current:'a',stores:{
      a:{years:['2025'],data:{2025:{'1月':[{売上:123}]}}},
      b:{years:['2025'],data:{2025:{'1月':[{売上:321}]}}}
    }};
    const originalRaw=' '+JSON.stringify(source)+'\n';
    localStorage.setItem(SK,originalRaw);
    const gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));
    await gate.activate(await gate.prepare());

    source.stores.a.data[2025]['1月'][0].売上=456;
    const baseline=await gate.save(0,source);
    const codec=InsightBackupCryptoV1;
    const password='fictional-passphrase';
    const backupData=JSON.parse(baseline.raw);
    backupData.stores.a.data[2025]['1月'][0].売上=789;
    const frozenRaw=InsightStorage.serialize(backupData);
    const file=JSON.stringify(await codec.encrypt({data:backupData},password));
    const wrongPassword=await codec.decrypt(JSON.parse(file),'fictional-wrong').then(()=>false,()=>true);
    const remained=await gate.load();
    const restoredData=(await codec.decrypt(JSON.parse(file),password)).data;

    async function restoreThenVerify(before,verify){
      const safetyFile=JSON.stringify(await codec.encrypt({data:JSON.parse(before.raw)},password));
      const committed=await gate.save(before.revision,restoredData);
      try{
        await verify(committed);
        return 'verified';
      }catch(_){
        // The revision precondition protects writes that race with recovery.
        const safetyData=(await codec.decrypt(JSON.parse(safetyFile),password)).data;
        return gate.save(committed.revision,safetyData).then(()=> 'rolled back',error=>error.message);
      }
    }

    const verified=await restoreThenVerify(baseline,async committed=>{
      const readback=await gate.load();
      if(readback.revision!==committed.revision||readback.raw!==frozenRaw)throw new Error('Readback mismatch');
    });
    const first=await gate.load();
    const beforeFailure=await gate.save(first.revision,JSON.parse(baseline.raw));
    const rolledBack=await restoreThenVerify(beforeFailure,async ()=>{throw new Error('Injected verification failure');});
    const recovered=await gate.load();
    const newer=JSON.parse(baseline.raw);
    newer.stores.b.data[2025]['1月'][0].売上=654;
    const stopped=await restoreThenVerify(recovered,async committed=>{
      await gate.save(committed.revision,newer);
      throw new Error('Injected verification failure after another save');
    });
    const final=await gate.load();
    return {
      encrypted:codec.isEncryptedEnvelope(JSON.parse(file)),
      wrongPassword,unchangedAfterWrongPassword:remained.revision===1&&remained.raw===baseline.raw,
      verified,verifiedRaw:first.raw===frozenRaw,
      rolledBack,recoveredRaw:recovered.raw===baseline.raw,
      stopped,finalRevision:final.revision,finalRaw:final.raw===InsightStorage.serialize(newer),
      previousRaw:final.previous.raw===frozenRaw,sourceUnchanged:localStorage.getItem(SK)===originalRaw
    };
  });
  expect(outcome).toEqual({
    encrypted:true,wrongPassword:true,unchangedAfterWrongPassword:true,
    verified:'verified',verifiedRaw:true,rolledBack:'rolled back',recoveredRaw:true,
    stopped:'Pilot revision conflict',finalRevision:7,finalRaw:true,previousRaw:true,sourceUnchanged:true
  });
});
