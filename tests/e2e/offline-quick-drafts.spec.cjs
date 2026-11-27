const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');

const before={売上:250,客数:90,廃棄金額:12,haiki:{米飯:10,FF:2}};
const after={売上:255,客数:0,廃棄金額:14,haiki:{FF:2,米飯:12}};
const draft={shopId:'fictional-shop-a',day:'2026-11-24',before,after,
  basis:{build:'20261127-quick-future-date-build-142',features:'f0fcd0ba',sourceIdentity:'fixture-adoption',mode:'indexeddb',revision:4}};

async function openFixture(page){
  await page.route('**/offline-quick-drafts-fixture',route=>route.fulfill({
    contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset=utf-8><title>Fictional quick drafts</title>'
  }));
  await page.goto('/offline-quick-drafts-fixture');
  await page.evaluate(async ()=>{
    window.drafts=await import('/draft/insight_offline_quick_drafts_v1.mjs');
  });
}

test('isolated draft survives offline edits and reload, without sharing slots or overwriting newer drafts',async({page,context})=>{
  await openFixture(page);
  const peer=await context.newPage();
  await openFixture(peer);
  await context.setOffline(true);
  const result=await page.evaluate(data=>drafts.saveDraft(data),draft);
  await context.setOffline(false);
  await page.reload();
  await page.evaluate(async ()=>{
    window.drafts=await import('/draft/insight_offline_quick_drafts_v1.mjs');
  });
  expect(await page.evaluate(({shopId,day})=>drafts.loadDraft(shopId,day),draft)).toEqual(result);
  expect(await page.evaluate(({shopId,day})=>drafts.loadDraft(shopId,'2026-11-25'),draft)).toBeNull();
  expect(await page.evaluate(({day})=>drafts.loadDraft('fictional-shop-b',day),draft)).toBeNull();
  const fresh=await peer.evaluate(({draft,token})=>drafts.saveDraft({...draft,after:{...draft.after,売上:260}},token),
    {draft,token:result.token});
  await expect(page.evaluate(({draft,token})=>drafts.saveDraft(draft,token),{draft,token:result.token}))
    .rejects.toThrow('Draft changed in another tab');
  expect(await page.evaluate(({shopId,day})=>drafts.loadDraft(shopId,day),draft)).toEqual(fresh);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBeNull();
});

test('explicit claim rejects changed authority and only a confirmed receipt clears the pending draft',async({page})=>{
  await openFixture(page);
  const results=await page.evaluate(async ({shopId,day,basis,before,after})=>{
    const saved=await drafts.saveDraft({shopId,day,basis,before,after});
    const current={shopId,day,basis,values:before};
    const claim=comparison=>drafts.claimDraft(shopId,day,saved.token,comparison);
    const wrongTarget=await claim({...current,shopId:'fictional-shop-b'});
    const changed=await claim({...current,values:{...before,客数:91}});
    const revision=await claim({...current,basis:{...basis,revision:5}});
    const version=await claim({...current,basis:{...basis,build:'fixture-143'}});
    const source=await claim({...current,basis:{...basis,sourceIdentity:'different-adoption'}});
    const pending=await drafts.loadDraft(shopId,day);
    const ready=await claim(current);
    const duplicate=await claim(current);
    const unknown=await Promise.resolve().then(()=>drafts.finishDraft(shopId,day,saved.token,'unknown'))
      .then(()=>false,()=>true);
    const applying=await drafts.loadDraft(shopId,day);
    const oldReceipt=await drafts.finishDraft(shopId,day,'wrong-token','confirmed');
    const released=await drafts.finishDraft(shopId,day,saved.token,'not-started');
    const retry=await drafts.loadDraft(shopId,day);
    const obsolete=await drafts.finishDraft(shopId,day,saved.token,'confirmed');
    const secondClaim=await drafts.claimDraft(shopId,day,retry.token,current);
    const confirmed=await drafts.finishDraft(shopId,day,retry.token,'confirmed');
    const deleted=await drafts.loadDraft(shopId,day);
    return {wrongTarget,changed,revision,version,source,pending,ready,duplicate,unknown,applying,oldReceipt,released,retry,
      obsolete,secondClaim,confirmed,deleted};
  },draft);
  expect(results.wrongTarget).toEqual({state:'wrong-target'});
  for(const key of ['changed','revision','version','source']) expect(results[key].state).toBe('conflict');
  expect(results.pending.state).toBe('pending');
  expect(results.ready).toEqual({state:'ready',proposed:after});
  expect(results.duplicate.state).toBe('unavailable');
  expect(results.unknown).toBe(true);
  expect(results.applying.state).toBe('applying');
  expect(results.oldReceipt).toBe(false);
  expect(results.released).toBe(true);
  expect(results.retry.state).toBe('pending');
  expect(results.obsolete).toBe(false);
  expect(results.secondClaim.state).toBe('ready');
  expect(results.confirmed).toBe(true);
  expect(results.deleted).toBeNull();
});

test('a failed draft transaction retains the prior draft and the legacy source',async({page})=>{
  await openFixture(page);
  const result=await page.evaluate(async draft=>{
    const raw='{"fixture":true}';
    localStorage.setItem('insight_v11',raw);
    const legacy={...draft,basis:{...draft.basis,mode:'legacy',revision:null,sourceIdentity:'fixture-digest'}};
    const original=await drafts.saveDraft(legacy);
    const put=IDBObjectStore.prototype.put;
    let failure;
    try{
      IDBObjectStore.prototype.put=()=>{throw new DOMException('Fixture quota failure','QuotaExceededError');};
      failure=await drafts.saveDraft({...legacy,after:{...legacy.after,売上:270}},original.token)
        .catch(error=>error.name);
    }finally{IDBObjectStore.prototype.put=put;}
    const stored=await drafts.loadDraft(draft.shopId,draft.day);
    const differentRaw=await drafts.claimDraft(draft.shopId,draft.day,stored.token,{
      shopId:draft.shopId,day:draft.day,values:draft.before,basis:{...legacy.basis,sourceIdentity:'changed-digest'}
    });
    return {failure,stored,original,differentRaw,raw:localStorage.getItem('insight_v11')};
  },draft);
  expect(result.failure).toBe('QuotaExceededError');
  expect(result.stored).toEqual(result.original);
  expect(result.differentRaw.state).toBe('conflict');
  expect(result.raw).toBe('{"fixture":true}');
});

async function openAdoptedFixture(page){
  await openFixture(page);
  await page.evaluate(({build,features})=>{
    window.SK='insight_v11';
    window.__INSIGHT_SHELL_VERSION__=build;
    window.__INSIGHT_FEATURE_SIGNATURE__=features;
  },draft.basis);
  await page.addScriptTag({url:'/insight_storage_v1.js'});
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='/insight_indexeddb_storage_v1.js';
    script.dataset.insightQuickDraftFixture='true';
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error('Fixture writer did not load'));
    document.head.append(script);
  }));
  await page.evaluate(async ()=>{
    window.quickApply=await import('/draft/insight_offline_quick_apply_v1.mjs');
  });
}

async function seedAdoptedFixture(page,draft,sourceIdentity=draft.basis.sourceIdentity){
  return page.evaluate(async ({draft,sourceIdentity})=>{
    const days=Array.from({length:24},(_,index)=>({d:String(index+1)}));
    days[23]={...draft.before,d:'24',買上点数:1.7,storeMemo:'架空メモ',weather:'曇',tempMaxC:21,tempMinC:10};
    const snapshot={current:draft.shopId,stores:{
      [draft.shopId]:{years:['2026'],data:{2026:{'11月':days}}},
      'fictional-shop-b':{years:['2026'],data:{2026:{'11月':[ {d:'1',売上:100} ]}}}
    }};
    const raw=JSON.stringify(snapshot);
    localStorage.setItem('insight_v11',raw);
    localStorage.setItem('insight_indexeddb_adoption_v1',JSON.stringify({state:'active',id:sourceIdentity}));
    async function seed(name,value){
      await new Promise((resolve,reject)=>{
        const request=indexedDB.open(name,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result;
          const tx=db.transaction('snapshots','readwrite');
          tx.objectStore('snapshots').add(value,'current');
          tx.oncomplete=()=>{db.close();resolve();};
          tx.onabort=()=>{db.close();reject(tx.error);};
        };
      });
    }
    await seed('insight-migration-history-v1',{id:sourceIdentity});
    await seed('insight-store-snapshots-v1',{id:sourceIdentity,raw,sourceRaw:raw,revision:draft.basis.revision});
    return {snapshot,raw};
  },{draft,sourceIdentity});
}

test('editing an existing draft cannot replace its original values or basis',async({page})=>{
  await openFixture(page);
  const actual=await page.evaluate(async draft=>{
    const first=await drafts.saveDraft(draft);
    const updates=[{...draft,basis:{...draft.basis,revision:5}},{...draft,before:{...draft.before,客数:89}}];
    const errors=[];
    for(const update of updates)
      errors.push(await drafts.saveDraft(update,first.token).catch(error=>error.message));
    return {first,errors,again:await drafts.loadDraft(draft.shopId,draft.day)};
  },draft);
  expect(actual.errors).toEqual(['Draft basis cannot change during an edit','Draft basis cannot change during an edit']);
  expect(actual.again).toEqual(actual.first);
});

test('real writer rejects a different source with the same revision before claiming the draft',async({page})=>{
  await openAdoptedFixture(page);
  const seed=await seedAdoptedFixture(page,draft,'replacement-adoption');
  const result=await page.evaluate(async ({shopId,day,basis,...rest})=>{
    const saved=await drafts.saveDraft({shopId,day,basis,...rest});
    const storage=InsightIndexedDBStorageV1;
    const reply=await quickApply.applyIndexedDBQuickDraft({shopId,day,storage});
    return {reply,unchanged:await storage.read(),pending:(await drafts.loadDraft(shopId,day)).token===saved.token};
  },draft);
  expect(result).toEqual({reply:{state:'not-started'},unchanged:{revision:4,snapshot:seed.snapshot},pending:true});
});

test('real confirmed write survives interrupted draft cleanup and can be identified after reopening',async({page,context})=>{
  await openAdoptedFixture(page);
  const seed=await seedAdoptedFixture(page,draft);
  const first=await page.evaluate(async ({shopId,day,basis,...rest})=>{
    const saved=await drafts.saveDraft({shopId,day,basis,...rest});
    const remove=IDBObjectStore.prototype.delete;
    let receipt;
    try{
      IDBObjectStore.prototype.delete=()=>{throw new Error('Interrupted draft cleanup fixture');};
      receipt=await quickApply.applyIndexedDBQuickDraft({shopId,day,storage:InsightIndexedDBStorageV1});
    }finally{IDBObjectStore.prototype.delete=remove;}
    return {token:saved.token,receipt,state:(await drafts.loadDraft(shopId,day)).state};
  },draft);
  expect(first).toMatchObject({receipt:{state:'confirmed',revision:5,cleanup:'pending'},state:'applying'});
  await page.close();
  const reopened=await context.newPage();
  await openAdoptedFixture(reopened);
  const result=await reopened.evaluate(async ({shopId,day})=>{
    const storage=InsightIndexedDBStorageV1;
    const record=await storage.readQuickDraftEvidence();
    const outcome=await quickApply.recoverIndexedDBQuickDraft({shopId,day,storage});
    return {record,outcome,remaining:await drafts.loadDraft(shopId,day),raw:localStorage.getItem('insight_v11')};
  },draft);
  Object.assign(seed.snapshot.stores[draft.shopId].data['2026']['11月'][23],draft.after);
  expect(result).toEqual({
    record:{sourceIdentity:draft.basis.sourceIdentity,revision:5,writeId:first.token,snapshot:seed.snapshot},
    outcome:{state:'confirmed',revision:5,cleanup:'cleared'},remaining:null,raw:seed.raw
  });
});

test('an unacknowledged real write leaves the draft on hold after reopening',async({page,context})=>{
  await openAdoptedFixture(page);
  const seed=await seedAdoptedFixture(page,draft);
  const error=await page.evaluate(async draft=>{
    await drafts.saveDraft(draft);
    const {shopId,day}=draft;
    const write=InsightStorage.writeMetadata;
    InsightStorage.writeMetadata=(key,raw)=>{
      if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(raw).state==='active')
        throw new Error('Fixture lost save acknowledgement');
      return write(key,raw);
    };
    try{
      return await quickApply.applyIndexedDBQuickDraft({
        shopId,day,storage:InsightIndexedDBStorageV1
      });
    }finally{InsightStorage.writeMetadata=write;}
  },draft);
  expect(error).toEqual({state:'unknown'});
  await page.close();
  const reopened=await context.newPage();
  await openAdoptedFixture(reopened);
  const state=await reopened.evaluate(async ({shopId,day})=>{
    const storage=InsightIndexedDBStorageV1;
    const retry=await quickApply.applyIndexedDBQuickDraft({shopId,day,storage});
    const recovery=await quickApply.recoverIndexedDBQuickDraft({shopId,day,storage}).catch(error=>error.message);
    const pending=await drafts.loadDraft(shopId,day);
    return {retry,recovery,pending,diagnosis:await storage.diagnose({verifyInterrupted:true}),
      raw:localStorage.getItem('insight_v11')};
  },draft);
  expect(state).toMatchObject({retry:{state:'unavailable'},recovery:{state:'unconfirmed'},
    pending:{state:'applying'},diagnosis:{state:'hold',reason:'writing',observedRevision:5,recovery:'save-verified'},raw:seed.raw});
});

test('draft-only write API is absent from the regular storage module',async({page})=>{
  await openFixture(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  expect(await page.evaluate(()=>['saveQuickDraft','readQuickDraftEvidence']
    .every(key=>!(key in InsightIndexedDBStorageV1)))).toBe(true);
});

test('network request failure and a stale feature list both stop before writing',async({page})=>{
  await openAdoptedFixture(page);
  const seed=await seedAdoptedFixture(page,draft);
  await page.evaluate(input=>drafts.saveDraft(input),draft);
  const apply=()=>page.evaluate(({shopId,day})=>quickApply.applyIndexedDBQuickDraft({
    shopId,day,storage:InsightIndexedDBStorageV1
  }),draft);

  await page.route('**/Index.html?insight_migration_probe=*',route=>route.abort());
  expect(await apply()).toEqual({state:'not-started',reason:'build-check-unavailable'});
  await page.unroute('**/Index.html?insight_migration_probe=*');
  await page.route('**/insight_shell_loader_v1.js?insight_draft_probe=*',route=>route.fulfill({
    contentType:'text/javascript',body:"var orderedFeatureLoads=['./stale.js'];"
  }));
  expect(await apply()).toEqual({state:'not-started',reason:'build-mismatch'});
  const state=await page.evaluate(async ({shopId,day})=>({
    draft:(await drafts.loadDraft(shopId,day)).state,record:await InsightIndexedDBStorageV1.read()
  }),draft);
  expect(state).toEqual({draft:'pending',record:{revision:4,snapshot:seed.snapshot}});
});

test('verified quick-entry fixture reopens offline and restores input made when the network drops',async({page,context})=>{
  const directory=path.join(__dirname,'fixtures/offline-quick-start');
  const assetFiles={
    'index.html':path.join(directory,'index.html'),
    'entry.mjs':path.join(directory,'entry.mjs'),
    'drafts.mjs':path.join(__dirname,'../../draft/insight_offline_quick_drafts_v1.mjs')
  };
  const assets=new Map(await Promise.all(Object.entries(assetFiles).map(async ([name,file])=>[name,await fs.readFile(file)])));
  const manifest=Object.fromEntries(Array.from(assets,([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')]));
  const source=await fs.readFile(path.join(directory,'worker.js'),'utf8');
  assets.set('worker.js',source.replace('/* fixture-manifest */ null',JSON.stringify(manifest)));
  const scope='/isolated-quick-start/';
  let disconnected=false;
  const server=http.createServer((req,res)=>{
    if(disconnected){res.destroy();return;}
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/Insight/Index.html'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><title>Normal-entry fixture</title>');
      return;
    }
    const name=url.pathname.startsWith(scope)?url.pathname.slice(scope.length)||'index.html':'';
    if(!assets.has(name)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store'}).end(assets.get(name));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    await page.goto(origin+'/Insight/Index.html');
    await page.evaluate(()=>localStorage.setItem('insight_v11','{"fictional":true}'));
    await page.goto(origin+scope);
    const sales=page.getByRole('spinbutton',{name:'売上（千円）'});
    await expect(sales).toHaveValue('250');
    await expect(sales).toBeEnabled();
    disconnected=true;
    await sales.fill('267');
    await expect(page.getByRole('status')).toHaveText('下書きを保存しました。');
    await page.close();

    const reopened=await context.newPage();
    await reopened.goto(origin+scope);
    await expect(reopened.getByRole('status')).toHaveText('下書きを復元しました。');
    await expect(reopened.getByRole('spinbutton',{name:'売上（千円）'})).toHaveValue('267');
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_v11'))).toBe('{"fictional":true}');
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
    expect(await reopened.evaluate(()=>navigator.serviceWorker.getRegistration('/Insight/Index.html').then(Boolean))).toBe(false);
    const normal=await context.newPage();
    expect(await normal.goto(origin+'/Insight/Index.html').then(()=>false,()=>true)).toBe(true);
    await reopened.evaluate(async ()=>{
      const [name]=await caches.keys();
      const cache=await caches.open(name);
      await cache.delete('entry.mjs');
    });
    expect((await reopened.reload()).status()).toBe(503);
  }finally{
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  }
});

test('loss of connectivity after version verification but before the write marker leaves the draft pending',async({page,context})=>{
  await openAdoptedFixture(page);
  const seed=await seedAdoptedFixture(page,draft);
  await page.evaluate(async draft=>{
    await drafts.saveDraft(draft);
    const digest=crypto.subtle.digest;
    crypto.subtle.digest=function(...args){
      return new Promise(resolve=>{
        (window.fixtureDigestResumes??=[]).push(()=>resolve(digest.apply(this,args)));
      });
    };
    const {shopId,day}=draft;
    window.fixtureAttempt=quickApply.applyIndexedDBQuickDraft({shopId,day,storage:InsightIndexedDBStorageV1});
  },draft);
  await page.waitForFunction(()=>window.fixtureDigestResumes?.length===2);
  await context.setOffline(true);
  await page.waitForFunction(()=>navigator.onLine===false);
  await page.evaluate(()=>fixtureDigestResumes.forEach(resume=>resume()));
  expect(await page.evaluate(()=>fixtureAttempt)).toEqual({state:'not-started',reason:'offline',draftPending:true});
  await context.setOffline(false);
  const result=await page.evaluate(async ({shopId,day})=>({
    draft:(await drafts.loadDraft(shopId,day)).state,
    record:await InsightIndexedDBStorageV1.read()
  }),draft);
  expect(result).toEqual({draft:'pending',record:{revision:4,snapshot:seed.snapshot}});
});

test('connectivity loss at the write marker does not interrupt local readback',async({page})=>{
  await openAdoptedFixture(page);
  const seed=await seedAdoptedFixture(page,draft);
  const result=await page.evaluate(async draft=>{
    await drafts.saveDraft(draft);
    const {shopId,day}=draft;
    const storage=InsightIndexedDBStorageV1;
    const metadata=InsightStorage.writeMetadata;
    let changed=false;
    InsightStorage.writeMetadata=(key,value)=>{
      const result=metadata(key,value);
      if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='writing'){
        Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
        changed=true;
      }
      return result;
    };
    try{
      const reply=await quickApply.applyIndexedDBQuickDraft({shopId,day,storage});
      return {reply,changed,record:await storage.read(),raw:localStorage.getItem('insight_v11')};
    }finally{
      InsightStorage.writeMetadata=metadata;
      delete navigator.onLine;
    }
  },draft);
  Object.assign(seed.snapshot.stores[draft.shopId].data['2026']['11月'][23],draft.after);
  expect(result).toEqual({reply:{state:'confirmed',revision:5,cleanup:'cleared'},changed:true,
    record:{revision:5,snapshot:seed.snapshot},raw:seed.raw});
});
