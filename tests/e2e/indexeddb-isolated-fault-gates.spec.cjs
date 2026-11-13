const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const adapter=fs.readFileSync(path.join(__dirname,'../fixtures/indexeddb-verified-restart.js'),'utf8');

test('FICTIONAL complete 2-store / 2-year data survives quota abort and old-tab conflict',async({page})=>{
  await page.route('**/isolated-idb-faults',route=>route.fulfill({
    body:'<!doctype html><html><title>Fictional isolated gate</title></html>',contentType:'text/html'
  }));
  await page.goto('/isolated-idb-faults');
  await page.addScriptTag({content:adapter});
  const out=await page.evaluate(async()=>{
    const months={};
    function fullYear(year,seed){
      const data={};
      for(let month=1;month<=12;month++){
        const days=new Date(year,month,0).getDate();
        data[month+'月']=Array.from({length:days},(_,i)=>({
          d:String(i+1),売上:seed+month+i,客数:20+i,weather:'晴',
          storeMemo:'FICTIONAL retained memo',stockout:'なし',
          legacyExtension:{source:'FICTIONAL',month,day:i+1}
        }));
      }
      return data;
    }
    function store(name,seed){
      return {name,years:['2025','2026'],
        data:{2025:fullYear(2025,seed),2026:fullYear(2026,seed+1000)},
        extension:{source:'FICTIONAL',tag:name}};
    }
    const initial={current:'a',stores:{
      a:store('FICTIONAL store A',100),b:store('FICTIONAL store B',200)
    },sharedWeather:{'2025-1月-1':'晴'},legacyMetadata:{type:'FICTIONAL'}};
    const originalRaw=' '+JSON.stringify(initial)+'\n';
    localStorage.setItem('insight_v11',originalRaw);
    window.InsightStorage={migrateSnapshot:s=>s,serialize:s=>JSON.stringify(s)};
    const gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem('insight_v11'));
    await gate.activate(await gate.prepare());
    const candidate=structuredClone(initial);
    candidate.stores.a.data['2025']['1月'][0].売上=777;
    const saved=await gate.save(0,candidate);
    const afterSave=await gate.load();
    const expected=structuredClone(initial);
    expected.stores.a.data['2025']['1月'][0].売上=777;
    const dataPreserved=JSON.stringify(JSON.parse(afterSave.raw))===JSON.stringify(expected);
    const originalPut=IDBObjectStore.prototype.put;
    let quotaName=null;
    try{
      IDBObjectStore.prototype.put=function(){
        throw new DOMException('FICTIONAL quota failure','QuotaExceededError');
      };
      const attempt=structuredClone(candidate);
      attempt.stores.a.data['2025']['1月'][0].売上=888;
      await gate.save(saved.revision,attempt);
    }catch(e){quotaName=e.name;}
    finally{IDBObjectStore.prototype.put=originalPut;}
    const afterAbort=await gate.load();
    const originalPreserved=localStorage.getItem('insight_v11')===originalRaw;
    const changedSource=JSON.parse(originalRaw);
    changedSource.stores.b.data['2026']['12月'][30].売上=9999;
    localStorage.setItem('insight_v11',JSON.stringify(changedSource));
    let staleReason=null;
    try{await gate.load();}catch(e){staleReason=e.message;}
    const evidence=await gate.readConflictForRecovery(afterAbort.id,afterAbort.revision);
    return {
      totalRows:Object.values(initial.stores).reduce((sum,s)=>sum+
        Object.values(s.data).reduce((ysum,yd)=>ysum+
          Object.values(yd).reduce((dsum,rows)=>dsum+rows.length,0),0),0),
      dataPreserved,quotaName,revisionAfterAbort:afterAbort.revision,
      committedUnchanged:afterAbort.raw===afterSave.raw,
      previousPreserved:afterAbort.previous.raw===originalRaw,
      originalPreserved,staleReason,
      evidenceReadOnly:evidence.indexedDBRaw===afterAbort.raw&&
        evidence.previousRaw===originalRaw&&
        evidence.sourceRaw===JSON.stringify(changedSource)
    };
  });
  expect(out.totalRows).toBe(1460);
  expect(out.dataPreserved).toBe(true);
  expect(out.quotaName).toBe('QuotaExceededError');
  expect(out.revisionAfterAbort).toBe(1);
  expect(out.committedUnchanged).toBe(true);
  expect(out.previousPreserved).toBe(true);
  expect(out.originalPreserved).toBe(true);
  expect(out.staleReason).toBe('Pilot source changed');
  expect(out.evidenceReadOnly).toBe(true);
});

test('FICTIONAL Insight input does not acknowledge save while IndexedDB commit is pending',async({page,context})=>{
  const source=' '+JSON.stringify({current:'a',stores:{
    a:{name:'FICTIONAL store A',years:['2025','2026'],
      data:{2025:{'1月':[{d:'1',売上:123,storeMemo:'keep'}]},2026:{}}},
    b:{name:'FICTIONAL store B',years:['2025','2026'],
      data:{2025:{'1月':[{d:'1',売上:321}]},2026:{}}}
  }})+'\n';
  const seed=await context.newPage();
  await seed.route('**/isolated-idb-ui-seed',route=>route.fulfill({
    body:'<!doctype html><title>FICTIONAL seed</title>',contentType:'text/html'
  }));
  await seed.goto('/isolated-idb-ui-seed');
  await seed.addScriptTag({content:adapter});
  await seed.evaluate(async raw=>{
    localStorage.setItem('insight_v11',raw);
    window.InsightStorage={migrateSnapshot:s=>s};
    window.gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem('insight_v11'));
    await gate.activate(await gate.prepare());
  },source);
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.route('**/insight_payload_core_v1.js*',async route=>{
    const response=await route.fetch(),original=await response.text();
    const body=original.replace('const current=localStorage.getItem(SK);',
      'const current=window.fixtureSnapshot.raw;')
      .replace('if(msg){msg.classList.add("is-visible");',
        'if(msg&&!window.fixtureSaving){msg.classList.add("is-visible");');
    if(body===original||!body.includes('msg&&!window.fixtureSaving'))
      throw new Error('FICTIONAL fixture incompatible with Insight');
    const snapshot=await seed.evaluate(()=>gate.load());
    const setup=adapter+
      '\nwindow.fixtureStore=InsightIndexedDBRestartGate.create(()=>localStorage.getItem("insight_v11"));\n'+
      'const oldSetItem=Storage.prototype.setItem;\n'+
      'Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==="insight_v11")throw Error("FICTIONAL legacy write");return oldSetItem.call(this,k,v);};\n';
    await route.fulfill({response,body:setup+'window.fixtureSnapshot='+JSON.stringify(snapshot)+';\n'+body});
  });
  await page.goto('/Index.html');
  await page.waitForFunction(()=>window.InsightInputSaveObserverV0&&window.InsightSettings);
  await page.locator('#nav2').click();
  await page.evaluate(()=>{
    editYear.sales='2025';editMonth.sales='1月';window.salesSelDay=1;renderTable('sales');
    window.fixtureSaving=false;window.fixturePhase='idle';
    window.fixtureAttempts=0;
    window.fixtureSaveError=null;
    window.fixtureDeferred=new Promise(resolve=>{window.fixtureRelease=resolve;});
    document.addEventListener('click',async event=>{
      if(!event.target.closest('#salesSaveBtn'))return;
      event.stopImmediatePropagation();event.preventDefault();
      if(window.fixtureSaving)return;
      window.fixtureAttempts++;
      window.fixtureSaving=true;
      const storage=InsightStorage,originalPersist=storage.persistCurrent;
      const prior=JSON.stringify(allStores);
      const banner=document.getElementById('savedSales');
      banner.classList.remove('is-visible');
      let staged;
      try{
        storage.persistCurrent=s=>{staged=storage.clone(s);return true;};
        try{saveInput('sales');}
        finally{storage.persistCurrent=originalPersist;}
        if(!staged)throw Error('FICTIONAL no staged data');
        window.fixturePhase='pending';
        window.fixtureObserverAfterStage=InsightInputSaveObserverV0.getStatus().state;
        await window.fixtureDeferred;
        window.fixtureSnapshot=await fixtureStore.save(fixtureSnapshot.revision,staged);
        window.fixturePhase='committed';
        banner.classList.add('is-visible');
      }catch(error){
        allStores=JSON.parse(prior);store=allStores.stores[allStores.current];
        window.fixtureSaveError=error.name;
        window.fixturePhase='failed';
      }finally{
        storage.persistCurrent=originalPersist;
        window.fixtureSaving=false;
      }
    },true);
  });
  const input=page.locator('#sf_売上');
  await expect(input).toHaveValue('123');
  await input.fill('456');
  await page.locator('#salesSaveBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.fixturePhase)).toBe('pending');
  const held=await page.evaluate(async()=>{
    const atPending={
      attempts:window.fixtureAttempts,
      observer:window.fixtureObserverAfterStage,
      success:document.getElementById('savedSales').classList.contains('is-visible'),
      revision:(await fixtureStore.load()).revision
    };
    document.getElementById('salesSaveBtn').click();
    return {...atPending,attemptsAfterSecondClick:window.fixtureAttempts};
  });
  expect(held.attempts).toBe(1);
  expect(held.attemptsAfterSecondClick).toBe(1);
  expect(held.success).toBe(false);
  expect(held.revision).toBe(0);
  // The synchronous observer is already IDLE, even though the IndexedDB write has not begun.
  expect(held.observer).toBe('IDLE_OBSERVED');

  await page.evaluate(()=>window.fixtureRelease());
  await expect.poll(()=>page.evaluate(()=>window.fixturePhase)).toBe('committed');
  await expect(page.locator('#savedSales')).toHaveClass(/is-visible/);
  const after=await page.evaluate(async()=>({
    revision:(await fixtureStore.load()).revision,
    saved:JSON.parse((await fixtureStore.load()).raw).stores.a.data['2025']['1月'][0].売上,
    originalStillIntact:localStorage.getItem('insight_v11')===window.fixtureSnapshot.sourceRaw
  }));
  expect(after).toEqual({revision:1,saved:456,originalStillIntact:true});
});
