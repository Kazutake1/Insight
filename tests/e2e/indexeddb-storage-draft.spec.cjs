const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('manual adoption, encrypted backup confirmation and durable write hold',async({page})=>{
  const fixture='/indexeddb-storage-draft-fixture';
  await page.route('**'+fixture,route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));
  async function open(){
    await page.goto(fixture);
    for(const file of ['insight_backup_crypto_v1.js','insight_indexeddb_storage_v1.js']){
      await page.addScriptTag({path:path.join(__dirname,'../../',file)});
    }
  }
  await open();
  const result=await page.evaluate(async ()=>{
    const store=InsightIndexedDBStorageV1;
    const source={current:'a',stores:{a:{sales:123},b:{sales:321}},legacy:{memo:'架空'}};
    const raw=' '+JSON.stringify(source)+'\n';
    localStorage.setItem('insight_v11',raw);
    const error=promise=>promise.then(()=>null,e=>e.message);
    const before=await error(store.read());
    const password='fictional-draft-password';
    const denied=await error(store.migrate({password,downloadAndConfirm:async()=>false}));
    const noMarker=localStorage.getItem('insight_indexeddb_adoption_v1')===null;
    let backupMatches=false;
    const initial=await store.migrate({password,downloadAndConfirm:async envelope=>{
      const backup=await InsightBackupCryptoV1.decrypt(envelope,password);
      backupMatches=JSON.stringify(backup)===JSON.stringify(source);
      return true;
    }});
    const updated=JSON.parse(JSON.stringify(initial.snapshot));
    updated.stores.a.sales=456;
    const saved=await store.save(initial.revision,updated);
    const conflict=await error(store.save(initial.revision,source));
    return {before,denied,noMarker,backupMatches,initial,saved,conflict,
      originalMatches:localStorage.getItem('insight_v11')===raw};
  });
  expect(result).toMatchObject({
    before:'IndexedDB writes are on hold',denied:'Backup save was not confirmed',noMarker:true,
    backupMatches:true,initial:{revision:0},saved:{revision:1,snapshot:{stores:{a:{sales:456},b:{sales:321}}}},
    conflict:'IndexedDB revision conflict',originalMatches:true
  });
  await open();
  const stopped=await page.evaluate(async ()=>{
    const store=InsightIndexedDBStorageV1;
    const error=promise=>promise.then(()=>null,e=>e.message);
    return [await error(store.read()),await error(store.save(1,{}))];
  });
  expect(stopped).toEqual(['IndexedDB writes are on hold','IndexedDB writes are on hold']);
});
