const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
require('./helpers/verified-chart.cjs')(test);

test('manual adoption uses the real encrypted backup confirmation and preserves the legacy source',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  async function open(){
    await page.goto('/Index.html');
    await page.waitForFunction(()=>window.InsightMigrationBackupV1&&window.InsightBackupPasswordV1&&
      window.InsightQuickDateNavV1&&window.InsightSalesCount?.hasUnsavedInput&&window.InsightInputDayNav?.hasUnsavedInput);
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  }
  await open();
  const raw=await page.evaluate(()=>{
    const source=InsightStorage.migrateSnapshot(allStores);
    const first=source.stores[source.current];
    first.name='架空店舗A';
    source.stores['fictional-b']=JSON.parse(JSON.stringify(first));
    source.stores['fictional-b'].name='架空店舗B';
    first.data[first.years.at(-1)]['1月'][0].売上=123;
    const raw=' '+JSON.stringify(source)+'\n';
    allStores=source;
    store=source.stores[source.current];
    localStorage.setItem('insight_v11',raw);
    return raw;
  });
  const divergent=await page.evaluate(async ()=>{
    const name=store.name;
    store.name='画面側だけ変更';
    try{return await InsightIndexedDBStorageV1.migrate().catch(error=>error.message);}
    finally{store.name=name;}
  });
  expect(divergent).toContain('未保存の入力または保存データの変更');
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

  const password='fictional-draft-password';
  const confirm=page.getByRole('button',{name:'保存したファイルを確認した',exact:true});
  async function startBackup(){
    await page.evaluate(()=>{
      window.migrationResult=InsightIndexedDBStorageV1.migrate().catch(error=>error.message);
    });
    await page.locator('#insightBackupPassword').fill(password);
    await page.locator('#insightBackupPasswordConfirm').fill(password);
    const event=page.waitForEvent('download');
    await page.locator('#insightBackupOverlay button[type=submit]').click();
    const download=await event;
    await expect(confirm).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
    return JSON.parse(await fs.readFile(await download.path(),'utf8'));
  }

  await startBackup();
  await page.getByRole('button',{name:'未確認のまま閉じる',exact:true}).click();
  expect(await page.evaluate(()=>migrationResult)).toBe('Backup save was not confirmed');
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

  await startBackup();
  const draftInput=await page.evaluate(()=>{
    const input=document.querySelector('#quickGrid input[type="text"],#quickGrid input[type="number"]');
    input.value='987';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return input.id;
  });
  await confirm.click();
  expect(await page.evaluate(()=>migrationResult)).toContain('未保存の入力または保存データの変更');
  expect(await page.evaluate(id=>document.getElementById(id).value,draftInput)).toBe('987');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
  // Test-only reload after verifying the uncommitted edit was preserved.
  await open();

  const file=await startBackup();
  expect(file.format).toBe('InsightEncryptedBackup');
  const backup=await page.evaluate(({file,password})=>InsightBackupCryptoV1.decrypt(file,password),{file,password});
  const source=JSON.parse(raw);
  expect(backup.data).toEqual(source);
  expect(backup.backupInfo).toMatchObject({
    format:'InsightBackup',formatVersion:2,currentStoreId:source.current,
    storageKey:'insight_v11',storeCount:2,
    stores:Object.entries(source.stores).map(([id,store])=>({
      id,name:store.name,years:store.years.map(String).sort()
    }))
  });
  await confirm.click();
  expect(await page.evaluate(()=>migrationResult)).toEqual({revision:0,snapshot:source});

  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose())).toEqual({state:'active',revision:0});
  const recovered=await page.evaluate(async ()=>{
    const storage=InsightIndexedDBStorageV1,markerKey='insight_indexeddb_adoption_v1';
    const initial=await storage.read(),writeMetadata=InsightStorage.writeMetadata;
    const originalRaw=localStorage.getItem('insight_v11');
    const originalMarker=localStorage.getItem(markerKey);
    let interrupted;
    InsightStorage.writeMetadata=(key,value)=>{
      if(key===markerKey&&JSON.parse(value).state==='active')throw new Error('Fixture lost save acknowledgement');
      return writeMetadata(key,value);
    };
    try{
      initial.snapshot.stores[initial.snapshot.current].name='架空店舗A（更新）';
      interrupted=await storage.save(initial.revision,initial.snapshot).catch(error=>error.message);
    }finally{InsightStorage.writeMetadata=writeMetadata;}
    const held=localStorage.getItem(markerKey);
    const verified=await storage.diagnose({verifyInterrupted:true});
    const stillHeld=held===localStorage.getItem(markerKey);
    const changed=JSON.parse(held);
    changed.operation.digest='0'.repeat(64);
    writeMetadata(markerKey,JSON.stringify(changed));
    const mismatched=await storage.diagnose({verifyInterrupted:true});
    writeMetadata(markerKey,originalMarker); // Fixture only, to continue the existing conflict test.
    return {interrupted,verified,mismatched,stillHeld,sourceUntouched:originalRaw===localStorage.getItem('insight_v11')};
  });
  expect(recovered).toEqual({
    interrupted:'Fixture lost save acknowledgement',
    verified:{state:'hold',reason:'writing',observedRevision:1,recovery:'save-verified'},
    mismatched:{state:'hold',reason:'writing',observedRevision:1,recovery:'unverified'},
    stillHeld:true,sourceUntouched:true
  });
  source.stores[source.current].name='架空店舗A（更新）';

  const result=await page.evaluate(async ()=>{
    const store=InsightIndexedDBStorageV1;
    const initial=await store.read();
    const shop=initial.snapshot.stores[initial.snapshot.current];
    shop.data[shop.years.at(-1)]['1月'][0].売上=456;
    const saved=await store.save(initial.revision,initial.snapshot);
    const conflict=await store.save(initial.revision,initial.snapshot).catch(error=>error.message);
    return {saved,conflict,raw:localStorage.getItem('insight_v11')};
  });
  const shop=source.stores[source.current];
  shop.data[shop.years.at(-1)]['1月'][0].売上=456;
  expect(result).toEqual({saved:{revision:2,snapshot:source},conflict:'IndexedDB revision conflict',raw});
  await open();
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().catch(error=>error.message))).toBe('IndexedDB writes are on hold');
  const diagnostic=await page.evaluate(async ()=>{
    const store=InsightIndexedDBStorageV1;
    const markerKey='insight_indexeddb_adoption_v1';
    const before=localStorage.getItem(markerKey);
    const originalRaw=localStorage.getItem('insight_v11');
    const writing=await store.diagnose();
    const unchanged=before===localStorage.getItem(markerKey);
    localStorage.removeItem(markerKey);
    const missingMarker=await store.diagnose();
    localStorage.setItem(markerKey,before);
    await new Promise((resolve,reject)=>{
      const deletion=indexedDB.deleteDatabase('insight-store-snapshots-v1');
      deletion.onsuccess=resolve;
      deletion.onerror=()=>reject(deletion.error);
      deletion.onblocked=()=>reject(new Error('Fixture database is still in use'));
    });
    const missingDatabase=await store.diagnose();
    return {writing,unchanged,missingMarker,missingDatabase,
      markerPreserved:localStorage.getItem(markerKey)===before,
      rawPreserved:localStorage.getItem('insight_v11')===originalRaw};
  });
  expect(diagnostic).toEqual({
    writing:{state:'hold',reason:'writing',observedRevision:2},unchanged:true,
    missingMarker:{state:'hold',reason:'marker-missing'},
    missingDatabase:{state:'hold',reason:'database-missing'},
    markerPreserved:true,rawPreserved:true
  });
});

for(const inputPage of [
  {nav:'#nav2',type:'sales',field:'#salesForm input[type=text]',save:'#salesSaveBtn'},
  {nav:'#nav3',type:'kyaku',field:'#kyakuGrid input',save:'#kyakuSaveBtn'},
  {nav:'#nav4',type:'haiki',field:'#haikiForm input[type=text]',save:'#haikiSaveBtn'}
]){
  test('migration preserves pending daily input on '+inputPage.nav,async({page})=>{
    await page.route('**/Index.html*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
    });
    await page.goto('/Index.html');
    await page.waitForFunction(()=>window.InsightMigrationBackupV1&&window.InsightQuickDateNavV1&&
      window.InsightSalesCount?.hasUnsavedInput&&window.InsightInputDayNav?.hasUnsavedInput);
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    await page.locator(inputPage.nav).click();
    const field=page.locator(inputPage.field).first();
    const raw=await page.evaluate(()=>{
      const next=InsightStorage.migrateSnapshot(allStores);
      next.stores['fictional-b']=JSON.parse(JSON.stringify(next.stores[next.current]));
      allStores=next;
      store=next.stores[next.current];
      return InsightStorage.writeSnapshot(next);
    });
    await field.fill('987');
    const attempt=()=>page.evaluate(()=>InsightIndexedDBStorageV1.migrate().catch(error=>error.message));
    expect(await attempt()).toContain('未保存の入力または保存データの変更');
    await expect(field).toHaveValue('987');
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

    await page.locator(inputPage.save).click();
    const saved=await page.evaluate(()=>localStorage.getItem('insight_v11'));
    expect(saved).not.toBe(raw);
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);

    async function checkMigrationCanStart(){
      await page.evaluate(()=>{
        window.migrationAfterSave=InsightIndexedDBStorageV1.migrate().catch(error=>error.message);
      });
      await expect(page.locator('#insightBackupPassword')).toBeVisible();
      await page.getByRole('button',{name:'キャンセル',exact:true}).click();
      expect(await page.evaluate(()=>migrationAfterSave)).toBe('Backup save was not confirmed');
    }
    await checkMigrationCanStart();

    {
      await field.fill('654');
      const picker=page.locator('#insightDayNav-'+inputPage.type+' input[type=date]');
      const target=await picker.evaluate(input=>{
        const [year,month]=input.value.split('-').map(Number);
        return year+'-'+(month===1?'02':'01')+'-01';
      });
      const chooseDate=()=>picker.evaluate((input,date)=>{
        input.value=date;
        input.dispatchEvent(new Event('change',{bubbles:true}));
      },target);
      page.once('dialog',dialog=>dialog.dismiss());
      await chooseDate();
      await expect(field).toHaveValue('654');
      expect(await attempt()).toContain('未保存の入力または保存データの変更');
      page.once('dialog',dialog=>dialog.accept());
      await chooseDate();
      expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);
      expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(saved);
      await checkMigrationCanStart();
    }

    if(inputPage.nav==='#nav2'){
      await field.fill('654');
      await page.evaluate(()=>InsightStorage.holdSnapshotWrites());
      await page.locator(inputPage.save).click();
      expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(true);
      expect(await attempt()).toContain('未保存の入力または保存データの変更');
      expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(saved);
    }
  });
}

test('recovery distinguishes an interrupted migration copy, an aborted save and a changed source',async({page})=>{
  await page.route('**/recovery-fixture',route=>route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><title>Fictional recovery fixture</title>'}));
  await page.goto('/recovery-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async ()=>{
    const storage=InsightIndexedDBStorageV1;
    const markerKey='insight_indexeddb_adoption_v1',sourceKey='insight_v11';
    const original={current:'a',stores:{
      a:{years:['2025','2026'],data:{2025:{sales:123},2026:{sales:456}}},
      b:{years:['2025','2026'],data:{2025:{sales:321},2026:{sales:654}}}
    }};
    const raw=JSON.stringify(original);
    localStorage.setItem(sourceKey,raw);
    const writeMetadata=(key,value)=>localStorage.setItem(key,value);
    window.InsightStorage={writeMetadata(key,value){
      if(JSON.parse(value).state==='active')throw new Error('Fixture interrupted adoption');
      writeMetadata(key,value);
    }};
    window.InsightMigrationBackupV1={confirm:async()=>true,assertReady(){}};
    const adoptionError=await storage.migrate().catch(error=>error.message);
    const preparingMarker=localStorage.getItem(markerKey);
    const inspect=()=>storage.diagnose({verifyInterrupted:true});
    const preparing=await inspect();
    const preparingHeld=localStorage.getItem(markerKey)===preparingMarker;

    // Activate only inside the fixture to construct a separate interrupted-write case.
    const {id}=JSON.parse(preparingMarker);
    writeMetadata(markerKey,JSON.stringify({id,state:'active'}));
    InsightStorage.writeMetadata=writeMetadata;
    const put=IDBObjectStore.prototype.put;
    let saveError;
    try{
      IDBObjectStore.prototype.put=function(){throw new DOMException('Fixture quota failure','QuotaExceededError');};
      const candidate=JSON.parse(raw);
      candidate.stores.a.data['2026'].sales=999;
      saveError=await storage.save(0,candidate).catch(error=>error.name);
    }finally{IDBObjectStore.prototype.put=put;}
    const writingMarker=localStorage.getItem(markerKey);
    const writing=await inspect();
    const blocked=await storage.save(0,original).catch(error=>error.message);
    const originalBytesHeld=localStorage.getItem(sourceKey)===raw;
    localStorage.setItem(sourceKey,' '+raw); // Model different bytes written by an older tab.
    const sourceChanged=await inspect();
    return {adoptionError,preparing,preparingHeld,saveError,writing,blocked,originalBytesHeld,sourceChanged,
      markerPreserved:localStorage.getItem(markerKey)===writingMarker,
      changedSourcePreserved:localStorage.getItem(sourceKey)===' '+raw};
  });
  expect(result).toEqual({
    adoptionError:'Fixture interrupted adoption',
    preparing:{state:'hold',reason:'preparing',observedRevision:0,recovery:'migration-copy-verified'},
    preparingHeld:true,
    saveError:'QuotaExceededError',
    writing:{state:'hold',reason:'writing',observedRevision:0,recovery:'prior-save-verified'},
    blocked:'IndexedDB writes are on hold',
    originalBytesHeld:true,
    sourceChanged:{state:'hold',reason:'record-unverified'},
    markerPreserved:true,changedSourcePreserved:true
  });
});
