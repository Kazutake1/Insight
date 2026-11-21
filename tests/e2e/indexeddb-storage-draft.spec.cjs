const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
require('./helpers/verified-chart.cjs')(test);
test.beforeEach(async({page})=>{
  await page.addInitScript(({build,features})=>{
    if(!location.pathname.endsWith('-fixture'))return;
    window.__INSIGHT_SHELL_VERSION__=build;
    window.__INSIGHT_FEATURE_SIGNATURE__=features;
  },{build:'20261113-daily-bar-build-112',features:'8b6a11f7'});
  await page.route(/https:\/\/(www\.jma\.go\.jp|[^/]*api\.open-meteo\.com)\//,route=>route.abort());
});
async function routeMigrationPage(page){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
}
async function waitForMigrationChecks(page){
  await page.waitForFunction(()=>window.InsightMigrationBackupV1&&window.InsightBackupPasswordV1&&
    window.InsightQuickDateNavV1&&window.InsightSalesCount?.hasUnsavedInput&&window.InsightInputDayNav?.hasUnsavedInput&&
    window.InsightWeatherLocation?.hasPendingSearch&&window.InsightWeatherBulk?.getWeatherBulkOperationStatus&&
    window.InsightWeatherTemperatureAuto?.hasPendingFetch()===false);
}


test('manual adoption uses the real encrypted backup confirmation and preserves the legacy source',async({page})=>{
  await routeMigrationPage(page);
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
    try{return await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).catch(error=>error.message);}
    finally{store.name=name;}
  });
  expect(divergent).toContain('未保存の入力または保存データの変更');
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

  const password='Fit123';
  const confirm=page.getByRole('button',{name:'保存したファイルを確認した',exact:true});
  async function startBackup(){
    await page.evaluate(()=>{
      window.migrationResult=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).catch(error=>error.message);
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
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnoseStartup()))
    .toEqual({state:'hold',reason:'indexeddb-adopted'});
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
  const diagnostic=await page.evaluate(async ({file,password})=>{
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
    const wrongPassword=await store.reviewHistoryOnlyBackup(file,'Wrong6',()=>true)
      .then(()=>false,()=>true);
    localStorage.setItem('insight_v11',originalRaw.replace('"売上":123','"売上":124'));
    const wrongBackup=await store.reviewHistoryOnlyBackup(file,password,()=>true).catch(error=>error.message);
    localStorage.setItem('insight_v11',originalRaw);
    const cancelled=await store.reviewHistoryOnlyBackup(file,password,()=>false);
    let reviewedStores;
    const confirmed=await store.reviewHistoryOnlyBackup(file,password,summary=>{
      reviewedStores=summary.stores.map(shop=>shop.name);
      return true;
    });
    const changed=await store.reviewHistoryOnlyBackup(file,password,()=>{
      localStorage.setItem('insight_v11',' '+originalRaw);
      return true;
    }).catch(error=>error.message);
    localStorage.setItem('insight_v11',originalRaw);
    const repeatedMigration=await store.migrate({legacyClientsClosed:true}).catch(error=>error.message);
    const markerStillMissing=localStorage.getItem(markerKey)===null;
    const stillMissing=await store.diagnose();
    localStorage.setItem(markerKey,before);
    return {writing,unchanged,missingMarker,missingDatabase,bothMissing,wrongPassword,wrongBackup,cancelled,confirmed,reviewedStores,changed,repeatedMigration,markerStillMissing,stillMissing,
      markerPreserved:localStorage.getItem(markerKey)===before,
      rawPreserved:localStorage.getItem('insight_v11')===originalRaw};
  },{file,password});
  expect(diagnostic).toEqual({
    writing:{state:'hold',reason:'writing',observedRevision:2},unchanged:true,
    missingMarker:{state:'hold',reason:'marker-missing'},
    missingDatabase:{state:'hold',reason:'database-missing'},
    bothMissing:{state:'hold',reason:'history-only'},
    wrongPassword:true,
    wrongBackup:'バックアップと移行元のデータが一致しません。',
    cancelled:{state:'hold',review:'cancelled'},
    confirmed:{state:'hold',review:'confirmed'},
    reviewedStores:['架空店舗A','架空店舗B'],
    changed:'Recovery data changed',
    repeatedMigration:'Existing migration requires review',
    markerStillMissing:true,
    stillMissing:{state:'hold',reason:'history-only'},
    markerPreserved:true,rawPreserved:true
  });
});

test('missing storage keeps migration stopped and only previews a selected encrypted backup',async({page})=>{
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.addScriptTag({url:'/insight_indexeddb_recovery_preview_v1.js'});
  const result=await page.evaluate(async ()=>{
    const api=InsightIndexedDBStorageV1,sourceKey='insight_v11';
    const markerKey='insight_indexeddb_adoption_v1';
    const snapshot=InsightStorage.migrateSnapshot(allStores);
    snapshot.stores[snapshot.current].name='架空店舗';
    const store=snapshot.stores[snapshot.current];
    const years=store.years.map(String).sort();
    const createdAt='2026-11-19T00:00:00.000Z',password='Fit123';
    const envelope=await InsightBackupCryptoV1.encrypt({
      backupInfo:{
        format:'InsightBackup',formatVersion:2,createdAt,storageKey:sourceKey,
        schemaVersion:snapshot.schemaVersion,storeCount:1,currentStoreId:snapshot.current,years,
        stores:[{id:snapshot.current,name:store.name,years}]
      },
      data:snapshot
    },password);
    const file=new File([JSON.stringify(envelope)],'Insight_261119_0900.json');
    localStorage.removeItem(sourceKey);

    const initial=await api.diagnose();
    const olderSources=[];
    for(const key of ['insight_v9','insight_v8']){
      localStorage.setItem(key,'{"years":["2025"],"data":{}}');
      const diagnostic=await api.diagnose();
      const blocked=await api.reviewMissingStorageBackup(file,password,()=>true).catch(error=>error.message);
      olderSources.push({diagnostic,blocked,preserved:localStorage.getItem(key)==='{"years":["2025"],"data":{}}'});
      localStorage.removeItem(key);
    }
    const legacyAppeared=await api.reviewMissingStorageBackup(file,password,()=>{
      localStorage.setItem('insight_v8','{"years":["2025"],"data":{}}');
      return true;
    }).catch(error=>error.message);
    const legacyPreserved=localStorage.getItem('insight_v8')==='{"years":["2025"],"data":{}}';
    localStorage.removeItem('insight_v8');
    const migration=await api.migrate({legacyClientsClosed:true}).catch(error=>error.message);
    const invalidFile=await api.reviewMissingStorageBackup(new File(['{'],'invalid.json'),password,()=>true)
      .catch(error=>error.message);
    const badPassword=await api.reviewMissingStorageBackup(file,'Wrong6',()=>true)
      .catch(error=>error.message);
    const cancelled=await api.reviewMissingStorageBackup(file,password,()=>false);
    let summary;
    const confirmed=await api.reviewMissingStorageBackup(file,password,info=>{summary=info;return true;});
    const withoutWrites=localStorage.getItem(sourceKey)===null&&localStorage.getItem(markerKey)===null;
    const after=await api.diagnose();
    const appeared=await api.reviewMissingStorageBackup(file,password,()=>{
      localStorage.setItem(sourceKey,JSON.stringify(snapshot));
      return true;
    }).catch(error=>error.message);
    const preservedNewSource=localStorage.getItem(sourceKey)===JSON.stringify(snapshot);
    localStorage.removeItem(sourceKey);
    const screen=document.createElement('div');
    screen.id='fictionalRecoveryScreen';
    document.body.append(screen);
    InsightIndexedDBRecoveryPreviewV1.mount(screen);
    return {initial,migration,invalidFile,badPassword,cancelled,confirmed,summary,withoutWrites,after,
      appeared,preservedNewSource,olderSources,legacyAppeared,legacyPreserved,envelope:JSON.stringify(envelope)};
  });
  const {envelope,...diagnostic}=result;
  expect(diagnostic).toEqual({
    initial:{state:'hold',reason:'storage-history-unknown'},
    olderSources:Array.from({length:2},()=>({
      diagnostic:{state:'hold',reason:'older-source-present'},
      blocked:'Missing storage recovery state could not be verified',
      preserved:true
    })),
    legacyAppeared:'Missing storage recovery state could not be verified',
    legacyPreserved:true,
    migration:'Legacy Insight data is missing',
    invalidFile:'バックアップファイルを読み込めませんでした。',
    badPassword:'復号できませんでした。パスワードまたはバックアップファイルを確認してください。',
    cancelled:{state:'hold',review:'cancelled'},
    confirmed:{state:'hold',review:'confirmed'},
    summary:{createdAt:'2026-11-19T00:00:00.000Z',stores:[{
      id:expect.any(String),name:'架空店舗',years:expect.arrayContaining([expect.stringMatching(/^\d{4}$/)])
    }]},
    withoutWrites:true,
    after:{state:'hold',reason:'storage-history-unknown'},
    appeared:'Missing storage recovery state could not be verified',
    preservedNewSource:true
  });
  const screen=page.locator('#fictionalRecoveryScreen');
  const file=screen.getByLabel('暗号化バックアップ',{exact:true});
  const password=screen.getByLabel('バックアップのパスワード');
  for(const [button,message] of [
    ['取り消す','確認を取り消しました。保存は停止したままです。'],
    ['確認済みにする','バックアップを確認しました。保存は停止したままです。']
  ]){
    await file.setInputFiles({name:'Insight_261119_0900.json',mimeType:'application/json',buffer:Buffer.from(envelope)});
    await password.fill('Fit123');
    await screen.getByRole('button',{name:'内容を表示'}).click();
    await expect(screen.getByText(/架空店舗/)).toBeVisible();
    await expect(password).toHaveValue('');
    await screen.getByRole('button',{name:button}).click();
    await expect(screen.getByRole('status')).toHaveText(message);
  }
  expect(await page.evaluate(async ()=>({
    source:localStorage.getItem('insight_v11'),
    marker:localStorage.getItem('insight_indexeddb_adoption_v1'),
    diagnostic:await InsightIndexedDBStorageV1.diagnose()
  }))).toEqual({source:null,marker:null,diagnostic:{state:'hold',reason:'storage-history-unknown'}});
});

test('startup diagnosis preserves legacy data and refuses uncertain or adopted storage',async({page,context})=>{
  await page.route('**/startup-diagnosis-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional startup diagnosis fixture</title>'
  }));
  await page.goto('/startup-diagnosis-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const initial=await page.evaluate(async ()=>{
    const api=InsightIndexedDBStorageV1;
    const empty=await api.diagnoseStartup();
    const existing=[];
    for(const key of ['insight_v11','insight_v9','insight_v8']){
      localStorage.setItem(key,'fictional legacy data');
      existing.push([await api.diagnoseStartup(),localStorage.getItem(key)]);
      localStorage.removeItem(key);
    }
    return {empty,existing,keys:localStorage.length};
  });
  expect(initial).toEqual({
    empty:{state:'hold',reason:'storage-history-unknown'},
    existing:Array.from({length:3},()=>[{state:'legacy'},'fictional legacy data']),
    keys:0
  });

  const other=await context.newPage();
  try{
    await other.route('**/startup-diagnosis-fixture',route=>route.fulfill({
      contentType:'text/html',body:'<!doctype html><title>Fictional other tab</title>'
    }));
    await other.goto('/startup-diagnosis-fixture');
    await other.evaluate(()=>{
      localStorage.setItem('insight_v11','fictional data from another tab');
      localStorage.setItem('insight_indexeddb_adoption_v1','{"state":"active","id":"fixture"}');
    });
    const blocked=await page.evaluate(async ()=>({
      diagnostic:await InsightIndexedDBStorageV1.diagnoseStartup(),
      raw:localStorage.getItem('insight_v11'),
      marker:localStorage.getItem('insight_indexeddb_adoption_v1')
    }));
    expect(blocked).toEqual({
      diagnostic:{state:'hold',reason:'database-missing'},
      raw:'fictional data from another tab',
      marker:'{"state":"active","id":"fixture"}'
    });
  }finally{
    await other.close();
  }

  const unavailable=await page.evaluate(async ()=>{
    let release;
    let entered;
    const locked=new Promise(resolve=>{entered=resolve;});
    const holding=navigator.locks.request('insight-store-snapshots-v1',async lock=>{
      await new Promise(resolve=>{release=resolve;entered();});
    });
    await locked;
    try{return await InsightIndexedDBStorageV1.diagnoseStartup();}
    finally{release();await holding;}
  });
  expect(unavailable).toEqual({state:'hold',reason:'startup-check-unavailable'});
});

test('a tab with the current storage guard stops legacy writes once it observes migration',async({context,page})=>{
  await context.route('**/guarded-storage-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional guarded storage fixture</title>'
  }));
  await page.goto('/guarded-storage-fixture');
  await page.evaluate(()=>{window.SK='insight_v11';});
  await page.addScriptTag({url:'/insight_storage_v1.js'});
  const original=await page.evaluate(()=>InsightStorage.writeSnapshot({fictional:123}));
  expect(JSON.parse(original)).toEqual({fictional:123,schemaVersion:1});

  const other=await context.newPage();
  try{
    await other.goto('/guarded-storage-fixture');
    await page.evaluate(()=>{
      window.markerCleared=new Promise(resolve=>{
        window.addEventListener('storage',function observed(event){
          if(event.key==='insight_indexeddb_adoption_v1'&&event.newValue===null){
            window.removeEventListener('storage',observed);
            resolve();
          }
        });
      });
    });
    await other.evaluate(()=>{
      const key='insight_indexeddb_adoption_v1';
      localStorage.setItem(key,'{"state":"preparing","id":"fictional"}');
      localStorage.removeItem(key);
    });
    const result=await page.evaluate(async ()=>{
      await window.markerCleared;
      const store=InsightStorage;
      const target={fictional:999};
      const failures=[];
      let mutated=false;
      for(const attempt of [
        ()=>store.writeSnapshot(target),
        ()=>store.persistCurrent(target),
        ()=>store.transaction(target,()=>{mutated=true;})
      ]){
        try{attempt();}
        catch(error){failures.push(error.name);}
      }
      return {failures,mutated,target,raw:localStorage.getItem('insight_v11')};
    });
    expect(result).toEqual({
      failures:Array(3).fill('InsightStorageConflictError'),
      mutated:false,
      target:{fictional:999},
      raw:original
    });
  }finally{
    await other.close();
  }

  // Reload a separate fixture with a malformed marker already present.
  await page.evaluate(()=>localStorage.setItem('insight_indexeddb_adoption_v1','{invalid'));
  await page.reload();
  await page.evaluate(()=>{window.SK='insight_v11';});
  await page.addScriptTag({url:'/insight_storage_v1.js'});
  const atStartup=await page.evaluate(()=>{
    try{InsightStorage.writeSnapshot({fictional:456});}
    catch(error){
      return {code:error.name,raw:localStorage.getItem('insight_v11'),
        marker:localStorage.getItem('insight_indexeddb_adoption_v1')};
    }
  });
  expect(atStartup).toEqual({code:'InsightStorageConflictError',raw:original,marker:'{invalid'});
});

for(const operation of ['read','save']){
  test('an unguarded legacy tab change leaves a persistent hold on '+operation,async({context,page})=>{
    await context.route('**/legacy-conflict-fixture',route=>route.fulfill({
      contentType:'text/html',body:'<!doctype html><title>Fictional legacy conflict fixture</title>'
    }));
    await page.goto('/legacy-conflict-fixture');
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    const original=await page.evaluate(async ()=>{
      const source={current:'fictional',stores:{fictional:{value:1}}};
      const raw=JSON.stringify(source);
      localStorage.setItem('insight_v11',raw);
      window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
      window.InsightMigrationBackupV1={confirm:async()=>true,assertReady(){}};
      await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true});
      await InsightIndexedDBStorageV1.save(0,{...source,stores:{fictional:{value:2}}});
      return raw;
    });

    const other=await context.newPage();
    try{
      await other.goto('/legacy-conflict-fixture');
      const conflicting=await other.evaluate(()=>{
        const raw=JSON.stringify({current:'fictional',stores:{fictional:{value:3}}});
        localStorage.setItem('insight_v11',raw);
        return raw;
      });
      const observed=await page.evaluate(async operation=>{
        const api=InsightIndexedDBStorageV1;
        const rejected=await (operation==='read'?api.read():
          api.save(1,{current:'fictional',stores:{fictional:{value:4}}})).catch(error=>error.message);
        const record=await new Promise((resolve,reject)=>{
          const request=indexedDB.open('insight-store-snapshots-v1');
          request.onerror=()=>reject(request.error);
          request.onsuccess=()=>{
            const db=request.result;
            const tx=db.transaction('snapshots','readonly');
            const get=tx.objectStore('snapshots').get('current');
            tx.oncomplete=()=>{db.close();resolve(get.result);};
            tx.onabort=()=>{db.close();reject(tx.error);};
          };
        });
        return {rejected,diagnostic:await api.diagnose(),raw:localStorage.getItem('insight_v11'),
          initial:record.sourceRaw,prior:JSON.parse(record.previous.raw).stores.fictional.value,
          current:JSON.parse(record.raw).stores.fictional.value,revision:record.revision};
      },operation);
      expect(observed).toEqual({
        rejected:'Legacy Insight storage changed; IndexedDB writes are on hold',
        diagnostic:{state:'hold',reason:'source-conflict'},raw:conflicting,initial:original,
        prior:1,current:2,revision:1
      });

      // Simulate the legacy tab returning the original bytes. A reload must still hold.
      await other.evaluate(raw=>localStorage.setItem('insight_v11',raw),original);
      await page.reload();
      await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
      expect(await page.evaluate(async ()=>({
        diagnostic:await InsightIndexedDBStorageV1.diagnoseStartup(),
        read:await InsightIndexedDBStorageV1.read().catch(error=>error.message)
      }))).toEqual({
        diagnostic:{state:'hold',reason:'source-conflict'},read:'IndexedDB writes are on hold'
      });
    }finally{
      await other.close();
    }
  });
}

test('migration startup gate requires a confirmed restart and a fresh build without a service worker',async({page})=>{
  const fixture='/migration-gate-fixture';
  await page.route('**'+fixture,route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional migration gate fixture</title>'
  }));
  let serverBuild='fictional-current',unreachable=false,workerAppears=false;
  await page.route('**/Index.html?insight_migration_probe=*',async route=>{
    if(unreachable)return route.abort();
    if(workerAppears)await page.evaluate(()=>{window.workerState='registered';});
    return route.fulfill({contentType:'text/html',body:
      '<!doctype html><meta name="insight-shell-version" content="'+serverBuild+'">'});
  });
  await page.addInitScript(()=>{
    window.__INSIGHT_SHELL_VERSION__='fictional-current';
    window.__INSIGHT_FEATURE_SIGNATURE__='fictional-features';
    window.workerState='none';
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{
      get controller(){return window.workerState==='controlling'?{}:null;},
      async getRegistration(){return window.workerState==='registered'?{}:undefined;}
    }});
  });
  await page.goto(fixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const check=(legacyClientsClosed=true)=>page.evaluate(closed=>
    InsightIndexedDBStorageV1.checkMigrationEnvironment({
      expectedBuild:'fictional-current',expectedFeatures:'fictional-features',legacyClientsClosed:closed
    }),legacyClientsClosed);
  expect(await check(false)).toEqual({state:'hold',reason:'legacy-client-confirmation-required'});
  expect(await check()).toEqual({state:'ready'});
  await page.evaluate(()=>{window.__INSIGHT_FEATURE_SIGNATURE__='fictional-stale-features';});
  expect(await check()).toEqual({state:'hold',reason:'build-mismatch'});

  serverBuild='fictional-newer';
  await page.reload();
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  expect(await check()).toEqual({state:'hold',reason:'build-mismatch'});
  serverBuild='fictional-current';

  unreachable=true;
  expect(await check()).toEqual({state:'hold',reason:'build-check-unavailable'});
  unreachable=false;
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:false}));
  expect(await check()).toEqual({state:'hold',reason:'offline'});
  await page.evaluate(()=>{delete navigator.onLine;});

  await page.evaluate(()=>{window.workerState='controlling';});
  expect(await check()).toEqual({state:'hold',reason:'service-worker-present'});
  await page.evaluate(()=>{window.workerState='none';});
  workerAppears=true;
  expect(await check()).toEqual({state:'hold',reason:'service-worker-present'});

  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});

test('a real legacy service worker stops migration during backup and serves a cached reopen',async({page,context,browserName})=>{
  const fixture='/tests/e2e/fixtures/legacy-pwa-fixture';
  const fixtureRoute='**'+fixture;
  await page.route(fixtureRoute,route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional online migration page</title>'
  }));
  await page.route('**/tests/e2e/fixtures/Index.html?insight_migration_probe=*',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><meta name="insight-shell-version" content="20261113-daily-bar-build-112">'
  }));
  await page.goto(fixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const raw=await page.evaluate(()=>{
    const source=JSON.stringify({current:'fictional',stores:{fictional:{value:1}}});
    localStorage.setItem('insight_v11',source);
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={
      assertReady(){},
      confirm(){return new Promise(resolve=>{window.finishFictionalBackup=resolve;});}
    };
    window.migrationOutcome=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).then(
      ()=>null,error=>error.message
    );
    return source;
  });
  await page.waitForFunction(()=>typeof window.finishFictionalBackup==='function');
  const scope=await page.evaluate(async ()=>{
    const registration=await navigator.serviceWorker.register('./legacy-pwa-worker.js');
    return registration.scope;
  });
  expect(new URL(scope).pathname).toBe('/tests/e2e/fixtures/');
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  expect(await page.evaluate(async ()=>{
    window.finishFictionalBackup(true);
    return {
      result:await window.migrationOutcome,
      source:localStorage.getItem('insight_v11'),
      marker:localStorage.getItem('insight_indexeddb_adoption_v1'),
      startup:await InsightIndexedDBStorageV1.diagnoseStartup()
    };
  })).toEqual({
    result:'Migration environment requires review: service-worker-present',
    source:raw,marker:null,startup:{state:'legacy'}
  });

  // The origin has no file at this URL once the online fixture route is removed.
  await page.unroute(fixtureRoute);
  // The WebKit CI browser reports an internal navigation error with offline emulation.
  // Still require a cached reopen there, with the origin reachable but no page to serve.
  const emulateOffline=browserName==='chromium';
  const reopened=await context.newPage();
  try{
    if(emulateOffline)await context.setOffline(true);
    await reopened.goto(fixture);
    await expect(reopened).toHaveTitle('Fictional cached legacy PWA');
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
  }finally{
    await reopened.close();
    if(emulateOffline)await context.setOffline(false);
  }
});

test('migration enforces the pinned environment before and after backup confirmation',async({page})=>{
  const fixture='/forced-migration-gate-fixture',build='20261113-daily-bar-build-112';
  await page.route('**'+fixture,route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional forced migration fixture</title>'
  }));
  let serverBuild=build;
  await page.route('**/Index.html?insight_migration_probe=*',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><meta name="insight-shell-version" content="'+serverBuild+'">'
  }));
  await page.goto(fixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.evaluate(()=>{
    window.confirmations=0;
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={
      confirm:async()=>{
        window.confirmations++;
        return await new Promise(resolve=>{window.finishBackup=resolve;});
      },
      assertReady(raw){
        if(localStorage.getItem('insight_v11')!==raw)throw new Error('Fictional source changed');
      }
    };
    localStorage.setItem('insight_v11','{"current":"fictional","stores":{"fictional":{"value":1}}}');
  });
  const attempt=(options)=>page.evaluate(options=>
    InsightIndexedDBStorageV1.migrate(options).catch(error=>error.message),options);
  expect(await attempt({})).toContain('legacy-client-confirmation-required');

  // Values provided by the caller cannot bypass the pin.
  await page.evaluate(()=>{window.__INSIGHT_SHELL_VERSION__='fictional-other-build';});
  serverBuild='fictional-other-build';
  expect(await attempt({legacyClientsClosed:true,expectedBuild:serverBuild})).toContain('build-mismatch');
  await page.evaluate(build=>{window.__INSIGHT_SHELL_VERSION__=build;},build);
  serverBuild=build;
  expect(await page.evaluate(()=>window.confirmations)).toBe(0);

  for(const scenario of ['server-changed','source-changed','ready']){
    await page.evaluate(()=>{
      window.finishBackup=null;
      window.attemptResult=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true})
        .catch(error=>error.message);
    });
    await page.waitForFunction(()=>typeof window.finishBackup==='function');
    if(scenario==='server-changed')serverBuild='fictional-new-build';
    if(scenario==='source-changed')await page.evaluate(()=>{
      localStorage.setItem('insight_v11','{"current":"fictional","stores":{"fictional":{"value":2}}}');
    });
    await page.evaluate(()=>window.finishBackup(true));
    const actual=await page.evaluate(()=>window.attemptResult);
    if(scenario==='ready'){
      expect(actual).toEqual({revision:0,snapshot:{current:'fictional',stores:{fictional:{value:2}}}});
    }else{
      expect(actual).toContain(scenario==='server-changed'?'build-mismatch':'Fictional source changed');
      expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
    }
    serverBuild=build;
  }
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11')))
    .toBe('{"current":"fictional","stores":{"fictional":{"value":2}}}');
});

for(const inputPage of [
  {nav:'#nav2',type:'sales',field:'#salesForm input[type=text]',save:'#salesSaveBtn'},
  {nav:'#nav3',type:'kyaku',field:'#kyakuGrid input',save:'#kyakuSaveBtn'},
  {nav:'#nav4',type:'haiki',field:'#haikiForm input[type=text]',save:'#haikiSaveBtn'}
]){
  test('migration preserves pending daily input on '+inputPage.nav,async({page})=>{
    await routeMigrationPage(page);
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
    const attempt=()=>page.evaluate(()=>InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).catch(error=>error.message));
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
        window.migrationAfterSave=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).catch(error=>error.message);
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
    const adoptionError=await storage.migrate({legacyClientsClosed:true}).catch(error=>error.message);
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
    const interrupted=await storage.migrate({legacyClientsClosed:true}).catch(error=>error.message);
    const diagnosis=await storage.diagnose({verifyInterrupted:true});
    const rejected=await storage.migrate({legacyClientsClosed:true}).catch(error=>error.message);
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
    retry:await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).catch(error=>error.message),
    original:JSON.parse(localStorage.getItem('insight_v11')).stores.b.data['2026'].sales,
    marker:localStorage.getItem('insight_indexeddb_adoption_v1')
  }));
  expect(afterReload).toEqual({
    diagnosis:{state:'hold',reason:'history-only'},retry:'Existing migration requires review',
    original:654,marker:null
  });
});

test('lost or mismatched migration history blocks reads and saves without changing snapshot or marker',async({page})=>{
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
    await storage.migrate({legacyClientsClosed:true});
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
    const mismatchRead=await storage.read().catch(error=>error.message);
    const mismatchSave=await storage.save(0,snapshot).catch(error=>error.message);
    await new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase('insight-migration-history-v1');
      request.onsuccess=resolve;
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('History deletion was blocked in fixture'));
    });
    const missing=await storage.diagnose();
    const missingRead=await storage.read().catch(error=>error.message);
    const missingSave=await storage.save(0,snapshot).catch(error=>error.message);
    return {mismatched,mismatchRead,mismatchSave,missing,missingRead,missingSave,
      markerUnchanged:localStorage.getItem('insight_indexeddb_adoption_v1')===marker,
      rawUnchanged:localStorage.getItem('insight_v11')===raw};
  });
  expect(result).toEqual({
    mismatched:{state:'hold',reason:'history-mismatch'},
    mismatchRead:'Migration history requires review',
    mismatchSave:'Migration history requires review',
    missing:{state:'hold',reason:'history-missing'},
    missingRead:'Migration history requires review',
    missingSave:'Migration history requires review',
    markerUnchanged:true,rawUnchanged:true
  });
});

test('migration pauses while a dialog, CSV import or weather fetch is pending',async({page})=>{
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async ()=>{
    const attempt=()=>InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true}).catch(error=>error.message);
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

test('isolated startup and migration button gate the real shell and encrypted backup',async({page})=>{
  await page.route('**/isolated-migration-start.js',route=>route.fulfill({
    contentType:'application/javascript',
    body:`const container=document.getElementById('loading');
      InsightIndexedDBMigrationPreviewV1.start(container,()=>{
        const loader=document.createElement('script');
        loader.src=container.dataset.loader;
        document.body.append(loader);
      });`
  }));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    let body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    if(new URL(route.request().url()).searchParams.has('isolated-migration-fixture')){
      const loader=body.match(/<script src="([^"]*insight_shell_loader_v1[^"]*)"><\/script>/);
      if(!loader)throw new Error('The isolated startup fixture could not find the shell loader');
      body=body.replace('id="loading"','id="loading" data-loader="'+loader[1]+'"')
        .replace(loader[0],[
          'insight_indexeddb_storage_v1.js',
          'insight_indexeddb_migration_preview_v1.js',
          'isolated-migration-start.js'
        ].map(path=>'<script src="./'+path+'"></script>').join(''));
    }
    await route.fulfill({response,body});
  });

  const fixture='/Index.html?isolated-migration-fixture=1';
  await page.goto(fixture);
  await expect(page.getByRole('status')).toHaveText('保存状態を確認できないため、起動と保存を停止しています。');
  await expect(page.locator('#quickGrid')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBeNull();

  // Create the fictional source with the normal storage format before entering the fixture.
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  const raw=await page.evaluate(()=>{
    store.name='架空店舗';
    return InsightStorage.writeSnapshot(allStores);
  });
  await page.goto(fixture);
  await waitForMigrationChecks(page);
  await page.evaluate(()=>{
    const container=document.createElement('aside');
    document.body.prepend(container);
    InsightIndexedDBMigrationPreviewV1.mount(container);
  });
  await expect(page.locator('#quickGrid')).toBeAttached();
  const checkbox=page.getByRole('checkbox',{name:'Insightの他のタブとホーム画面から開いたアプリを閉じました'});
  const button=page.getByRole('button',{name:'バックアップを作成して移行'});
  const marker=()=>page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'));
  await expect(button).toBeDisabled();
  expect(await marker()).toBeNull();

  const password='Fit123';
  async function start(){
    await checkbox.check();
    await button.click();
    await expect(button).toBeDisabled();
    await page.locator('#insightBackupPassword').fill(password);
    await page.locator('#insightBackupPasswordConfirm').fill(password);
    const download=page.waitForEvent('download');
    await page.locator('#insightBackupOverlay button[type=submit]').click();
    return download;
  }
  await start();
  await page.getByRole('button',{name:'未確認のまま閉じる',exact:true}).click();
  await expect(page.getByText('バックアップの確認を取り消しました。')).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  expect(await marker()).toBeNull();

  const download=await start();
  const file=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  expect(file.format).toBe('InsightEncryptedBackup');
  expect(await marker()).toBeNull();
  await page.getByRole('button',{name:'保存したファイルを確認した',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('IndexedDBにコピーを確認しました。保存を停止しています。');
  await expect(page.locator('#quickGrid')).toHaveCount(0);
  await expect(button).toHaveCount(0);
  expect(JSON.parse(await marker()).state).toBe('active');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({
    revision:0,snapshot:JSON.parse(raw)
  });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('IndexedDBにコピーを確認しました。保存を停止しています。');
  await expect(page.locator('#quickGrid')).toHaveCount(0);
});
