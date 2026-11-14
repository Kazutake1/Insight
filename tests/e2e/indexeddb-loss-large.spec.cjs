const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('large IndexedDB snapshots fail closed after legacy writes and database loss',async({page,context})=>{
  const url='/indexeddb-loss-fixture';
  await context.route('**'+url,route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  async function open(target){
    await target.goto(url);
    await target.addScriptTag({path:path.join(__dirname,'../../insight_storage_v1.js')});
    await target.addScriptTag({path:path.join(__dirname,'../fixtures/indexeddb-verified-restart.js')});
    await target.evaluate(()=>{
      window.gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));
      window.rejectMessage=promise=>promise.then(()=>null,error=>error.message);
    });
  }
  await open(page);
  const legacy=await context.newPage();
  await legacy.goto(url);
  const committed=await page.evaluate(async ()=>{
    const data={current:'a',stores:{
      a:{years:['2025','2026'],data:{2025:{'1月':[{売上:123}]},2026:{}}},
      b:{years:['2025','2026'],data:{2025:{'1月':[{売上:321}]},2026:{}}}
    }};
    const source=JSON.stringify(data);
    localStorage.setItem(SK,source);
    await gate.activate(await gate.prepare());
    data.stores.a.data[2025]['1月'][0].売上=456;
    data.extension='';
    data.extension='x'.repeat(2600000-new TextEncoder().encode(InsightStorage.serialize(data)).length);
    const first=await gate.save(0,data);
    data.stores.b.data[2025]['1月'][0].売上=654;
    const second=await gate.save(1,data);
    return {source,current:second.raw,previous:first.raw};
  });
  expect(Buffer.byteLength(committed.current)).toBe(2600000);
  await open(page);
  expect(await page.evaluate(async ({source,current,previous})=>{
    const state=await gate.load();
    return state.revision===2&&state.raw===current&&state.previous.raw===previous&&localStorage.getItem(SK)===source;
  },committed)).toBe(true);

  const legacyRaw=committed.source.replace('"売上":123','"売上":789');
  await legacy.evaluate(raw=>localStorage.setItem(SK,raw),legacyRaw);
  await open(page);
  expect(await page.evaluate(()=>rejectMessage(gate.load()))).toBe('Pilot source changed');

  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.deleteDatabase('insight-test-only-verified-restart-v1');
    request.onsuccess=()=>resolve();
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Fixture database deletion blocked'));
  }));
  await open(page);
  expect(await page.evaluate(async raw=>({
    load:await rejectMessage(gate.load()),
    save:await rejectMessage(gate.save(2,JSON.parse(raw))),
    record:await gate.inspect(),
    sourceMatches:localStorage.getItem(SK)===raw
  }),legacyRaw)).toEqual({
    load:'Pilot data is not active',save:'Pilot data is not active',record:null,sourceMatches:true
  });
});
