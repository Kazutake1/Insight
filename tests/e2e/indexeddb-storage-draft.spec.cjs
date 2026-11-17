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
    await page.waitForFunction(()=>window.InsightMigrationBackupV1&&window.InsightBackupPasswordV1);
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
    localStorage.setItem('insight_v11',raw);
    return raw;
  });
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
  expect(result).toEqual({saved:{revision:1,snapshot:source},conflict:'IndexedDB revision conflict',raw});
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
    writing:{state:'hold',reason:'writing',observedRevision:1},unchanged:true,
    missingMarker:{state:'hold',reason:'marker-missing'},
    missingDatabase:{state:'hold',reason:'database-missing'},
    markerPreserved:true,rawPreserved:true
  });
});
