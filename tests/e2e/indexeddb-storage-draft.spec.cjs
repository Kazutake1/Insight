const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
require('./helpers/verified-chart.cjs')(test);
test.beforeEach(async({page})=>{
  await page.route(/https:\/\/(www\.jma\.go\.jp|[^/]*api\.open-meteo\.com)\//,route=>route.abort());
});
async function waitForMigrationChecks(page){
  await page.waitForFunction(()=>window.InsightMigrationBackupV1&&window.InsightBackupPasswordV1&&
    window.InsightQuickDateNavV1&&window.InsightSalesCount?.hasUnsavedInput&&window.InsightInputDayNav?.hasUnsavedInput&&
    window.InsightWeatherLocation?.hasPendingSearch&&window.InsightWeatherBulk?.getWeatherBulkOperationStatus&&
    window.InsightWeatherTemperatureAuto?.hasPendingFetch()===false);
}


test('manual adoption uses the real encrypted backup confirmation and preserves the legacy source',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  async function open(){
    await page.goto('/Index.html');
    await waitForMigrationChecks(page);
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
    localStorage.removeItem(markerKey);
    const bothMissing=await store.diagnose({verifyInterrupted:true});
    const repeatedMigration=await store.migrate().catch(error=>error.message);
    const markerStillMissing=localStorage.getItem(markerKey)===null;
    const stillMissing=await store.diagnose();
    localStorage.setItem(markerKey,before);
    return {writing,unchanged,missingMarker,missingDatabase,bothMissing,repeatedMigration,markerStillMissing,stillMissing,
      markerPreserved:localStorage.getItem(markerKey)===before,
      rawPreserved:localStorage.getItem('insight_v11')===originalRaw};
  });
  expect(diagnostic).toEqual({
    writing:{state:'hold',reason:'writing',observedRevision:2},unchanged:true,
    missingMarker:{state:'hold',reason:'marker-missing'},
    missingDatabase:{state:'hold',reason:'database-missing'},
    bothMissing:{state:'hold',reason:'history-only'},
    repeatedMigration:'Existing migration requires review',
    markerStillMissing:true,
    stillMissing:{state:'hold',reason:'history-only'},
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
    await waitForMigrationChecks(page);
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
      expect(await attempt()).toContain('編集中または処理中の操作');
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
    const repeated=await inspect();
    let displayed;
    const cancelled=await storage.reviewRecovery(summary=>{displayed=summary;return false;});
    const confirmed=await storage.reviewRecovery(()=>true);
    const race=await storage.reviewRecovery(()=>{
      const changed=JSON.parse(writingMarker);
      changed.reviewChanged=true;
      writeMetadata(markerKey,JSON.stringify(changed));
      return true;
    }).catch(error=>error.message);
    writeMetadata(markerKey,writingMarker);
    const nativeDigest=crypto.subtle.digest;
    let changedDuringCheck;
    crypto.subtle.digest=function(...args){
      writeMetadata(markerKey,JSON.stringify({...JSON.parse(writingMarker),id:'different-adoption'}));
      return nativeDigest.apply(this,args);
    };
    try{changedDuringCheck=await inspect();}
    finally{crypto.subtle.digest=nativeDigest;}
    writeMetadata(markerKey,'{invalid');
    const invalidMarker=await inspect();
    writeMetadata(markerKey,JSON.stringify({...JSON.parse(writingMarker),id:'different-adoption'}));
    const wrongAdoption=await inspect();
    writeMetadata(markerKey,writingMarker);
    const blocked=await storage.save(0,original).catch(error=>error.message);
    const originalBytesHeld=localStorage.getItem(sourceKey)===raw;
    localStorage.setItem(sourceKey,' '+raw); // Model different bytes written by an older tab.
    const sourceChanged=await inspect();
    return {adoptionError,preparing,preparingHeld,saveError,writing,repeated,displayed,cancelled,confirmed,race,changedDuringCheck,invalidMarker,wrongAdoption,blocked,originalBytesHeld,sourceChanged,
      markerPreserved:localStorage.getItem(markerKey)===writingMarker,
      changedSourcePreserved:localStorage.getItem(sourceKey)===' '+raw};
  });
  expect(result).toEqual({
    adoptionError:'Fixture interrupted adoption',
    preparing:{state:'hold',reason:'preparing',observedRevision:0,recovery:'migration-copy-verified'},
    preparingHeld:true,
    saveError:'QuotaExceededError',
    writing:{state:'hold',reason:'writing',observedRevision:0,recovery:'prior-save-verified'},
    repeated:{state:'hold',reason:'writing',observedRevision:0,recovery:'prior-save-verified'},
    displayed:{outcome:'prior-save-verified',revision:0,previousRevision:null,stores:[
      {id:'a',name:'a',years:['2025','2026']},{id:'b',name:'b',years:['2025','2026']}
    ]},
    cancelled:{state:'hold',review:'cancelled'},
    confirmed:{state:'hold',review:'confirmed',revision:0},
    race:'Recovery data changed',
    changedDuringCheck:{state:'hold',reason:'state-changed'},
    invalidMarker:{state:'hold',reason:'invalid-marker'},
    wrongAdoption:{state:'hold',reason:'record-unverified'},
    blocked:'IndexedDB writes are on hold',
    originalBytesHeld:true,
    sourceChanged:{state:'hold',reason:'record-unverified'},
    markerPreserved:true,changedSourcePreserved:true
  });
});


test('history-only migration attempt stays held after reload with two-store source untouched',async({page})=>{
  await page.route('**/history-only-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!DOCTYPE html><title>Fictional history-only recovery fixture</title>'
  }));
  await page.goto('/history-only-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const first=await page.evaluate(async ()=>{
    const snapshot={current:'a',stores:{
      a:{name:'架空店舗A',years:['2025','2026'],data:{2025:{sales:123},2026:{sales:456}}},
      b:{name:'架空店舗B',years:['2025','2026'],data:{2025:{sales:321},2026:{sales:654}}}
    }};
    const raw=JSON.stringify(snapshot);
    localStorage.setItem('insight_v11',raw);
    window.InsightMigrationBackupV1={confirm:async()=>true,assertReady(){}};
    window.InsightStorage={writeMetadata(key,value){
      if(JSON.parse(value).state==='preparing')throw new Error('Fixture interrupted before marker');
      localStorage.setItem(key,value);
    }};
    const storage=InsightIndexedDBStorageV1;
    const interrupted=await storage.migrate().catch(error=>error.message);
    const diagnosis=await storage.diagnose({verifyInterrupted:true});
    const rejected=await storage.migrate().catch(error=>error.message);
    const review=await storage.reviewRecovery(()=>true).catch(error=>error.message);
    return {interrupted,diagnosis,rejected,review,rawIntact:localStorage.getItem('insight_v11')===raw,
      markerMissing:localStorage.getItem('insight_indexeddb_adoption_v1')===null};
  });
  expect(first).toEqual({
    interrupted:'Fixture interrupted before marker',
    diagnosis:{state:'hold',reason:'history-only'},
    rejected:'Existing migration requires review',
    review:'No held migration or save to review',
    rawIntact:true,markerMissing:true
  });
  await page.reload();
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const afterReload=await page.evaluate(async()=>({
    diagnosis:await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true}),
    retry:await InsightIndexedDBStorageV1.migrate().catch(error=>error.message),
    original:JSON.parse(localStorage.getItem('insight_v11')).stores.b.data['2026'].sales,
    marker:localStorage.getItem('insight_indexeddb_adoption_v1')
  }));
  expect(afterReload).toEqual({
    diagnosis:{state:'hold',reason:'history-only'},retry:'Existing migration requires review',
    original:654,marker:null
  });
});

test('lost or mismatched migration history blocks saves without changing snapshot or marker',async({page})=>{
  await page.route('**/history-guard-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!DOCTYPE html><title>Fictional history guard fixture</title>'
  }));
  await page.goto('/history-guard-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async()=>{
    const snapshot={current:'a',stores:{a:{name:'架空店舗A',years:['2026'],data:{2026:{sales:123}}}}};
    const raw=JSON.stringify(snapshot);
    localStorage.setItem('insight_v11',raw);
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={confirm:async()=>true,assertReady(){}};
    const storage=InsightIndexedDBStorageV1;
    await storage.migrate();
    const marker=localStorage.getItem('insight_indexeddb_adoption_v1');
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('insight-migration-history-v1',1);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('snapshots','readwrite');
      tx.objectStore('snapshots').put({id:'other-fixture-id'},'current');
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
    });
    db.close();
    const mismatched=await storage.diagnose();
    const mismatchSave=await storage.save(0,snapshot).catch(error=>error.message);
    await new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase('insight-migration-history-v1');
      request.onsuccess=resolve;
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('History deletion was blocked in fixture'));
    });
    const missing=await storage.diagnose();
    const missingSave=await storage.save(0,snapshot).catch(error=>error.message);
    return {mismatched,mismatchSave,missing,missingSave,
      markerUnchanged:localStorage.getItem('insight_indexeddb_adoption_v1')===marker,
      rawUnchanged:localStorage.getItem('insight_v11')===raw};
  });
  expect(result).toEqual({
    mismatched:{state:'hold',reason:'history-mismatch'},
    mismatchSave:'Migration history requires review',
    missing:{state:'hold',reason:'history-missing'},
    missingSave:'Migration history requires review',
    markerUnchanged:true,rawUnchanged:true
  });
});

test('migration pauses while a dialog, CSV import or weather fetch is pending',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async ()=>{
    const attempt=()=>InsightIndexedDBStorageV1.migrate().catch(error=>error.message);
    const raw=InsightStorage.writeSnapshot(allStores);
    const editor=document.createElement('dialog');
    document.body.append(editor);
    editor.showModal();
    const dialog=await attempt();
    editor.close();
    editor.remove();

    const readAsText=FileReader.prototype.readAsText;
    let reader;
    FileReader.prototype.readAsText=function(){reader=this;};
    try{importCSV({target:{files:[new File(['日付,売上\n2026-01-01,123'],'fictional.csv')]}});}
    finally{FileReader.prototype.readAsText=readAsText;}
    const csv=await attempt();
    reader.dispatchEvent(new Event('loadend'));

    const nativeFetch=window.fetch;
    let finishFetch;
    const pending=new Promise((_,reject)=>{finishFetch=()=>reject(new Error('Fixture stops weather fetch'));});
    window.fetch=()=>pending;
    let weather;
    try{
      const weatherOperation=fetchWeather();
      weather=await attempt();
      finishFetch();
      await weatherOperation;
    }finally{window.fetch=nativeFetch;}
    return {dialog,csv,weather,pendingCSV:hasPendingCSVImport(),
      pendingWeather:InsightWeatherTemperatureAuto.hasPendingFetch(),
      rawPreserved:localStorage.getItem('insight_v11')===raw,
      marker:localStorage.getItem('insight_indexeddb_adoption_v1')};
  });
  const message='編集中または処理中の操作があるため、移行を中止しました。';
  expect(result).toEqual({
    dialog:message,csv:message,weather:message,pendingCSV:false,pendingWeather:false,rawPreserved:true,marker:null
  });
});
