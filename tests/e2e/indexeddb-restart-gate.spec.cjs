const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('IndexedDB restart gate blocks stale candidates and recovers only after explicit discard',async({page,context})=>{
  const url='/indexeddb-restart-gate-test';
  await context.route('**'+url,route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  async function open(target){
    await target.goto(url);
    await target.addScriptTag({path:path.join(__dirname,'../../insight_storage_v1.js')});
    await target.addScriptTag({path:path.join(__dirname,'../fixtures/indexeddb-restart-gate.js')});
    await target.evaluate(()=>{
      globalThis.pilot=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));
      globalThis.rejection=promise=>promise.then(()=>null,error=>error.message);
    });
  }
  const first=' {"current":"a","stores":{"a":{"years":["2025"],"data":{"2025":{"1月":[{"売上":123}]}}}}}\n';
  const changed=first.replace('123','456');
  await open(page);
  const oldId=await page.evaluate(async raw=>{
    localStorage.setItem(SK,raw);
    const id=await pilot.prepare();
    if(await pilot.prepare()!==id)throw new Error('Same source produced a different candidate');
    return id;
  },first);

  const other=await context.newPage();
  await open(other);
  await other.evaluate(raw=>localStorage.setItem(SK,raw),changed);
  await open(page);
  const stopped=await page.evaluate(async id=>({
    state:await pilot.inspect(),
    load:await rejection(pilot.load()),
    activate:await rejection(pilot.activate(id)),
    prepare:await rejection(pilot.prepare())
  }),oldId);
  expect(stopped).toEqual({
    state:{id:oldId,status:'pending',sourceMatches:false},
    load:'Pilot data is not active',activate:'Pilot source changed',prepare:'Pilot source changed'
  });

  const recovered=await page.evaluate(async id=>{
    await pilot.discardPending(id);
    const newId=await pilot.prepare();
    const staleDiscard=await rejection(pilot.discardPending(id));
    await pilot.activate(newId);
    const current=await pilot.load();
    const snapshot=JSON.parse(current.raw);
    snapshot.stores.a.data[2025]['1月'][0].売上=789;
    await pilot.save(current.revision,snapshot);
    return {newId,staleDiscard,activeDiscard:await rejection(pilot.discardPending(newId))};
  },oldId);
  expect(recovered.newId).not.toBe(oldId);
  expect(recovered.staleDiscard).toBe('Pilot pending candidate mismatch');
  expect(recovered.activeDiscard).toBe('Pilot pending candidate mismatch');
  await open(page);
  const loaded=await page.evaluate(async raw=>{
    const current=await pilot.load();
    return {revision:current.revision,edited:JSON.parse(current.raw).stores.a.data[2025]['1月'][0].売上,
      previousMatches:current.previous.raw===raw,sourceMatches:localStorage.getItem(SK)===raw};
  },changed);
  expect(loaded).toEqual({revision:1,edited:789,previousMatches:true,sourceMatches:true});

  await other.evaluate(raw=>localStorage.setItem(SK,raw),first);
  await open(page);
  const activeMismatch=await page.evaluate(async ()=>({
    load:await rejection(pilot.load()),save:await rejection(pilot.save(1,{stores:{}}))
  }));
  expect(activeMismatch).toEqual({load:'Pilot source changed',save:'Pilot source changed'});
});
