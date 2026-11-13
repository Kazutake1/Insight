const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('IndexedDB restart gate blocks stale candidates and recovers only after explicit discard',async({page,context})=>{
  const url='/indexeddb-verified-restart-test';
  await context.route('**'+url,route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  async function open(target){
    await target.goto(url);
    await target.addScriptTag({path:path.join(__dirname,'../../insight_storage_v1.js')});
    await target.addScriptTag({path:path.join(__dirname,'../fixtures/indexeddb-verified-restart.js')});
    await target.evaluate(()=>{
      globalThis.pilot=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));
      globalThis.rejection=promise=>promise.then(()=>null,error=>error.message);
    });
  }

  const original={
    current:'a',
    stores:{
      a:{name:'架空店A',years:['2025','2026'],data:{2025:{'1月':[{売上:123}]},2026:{'2月':[{客数:19}]}}},
      b:{name:'架空店B',years:['2024','2026'],data:{2024:{'1月':[{売上:321}]},2026:{'2月':[{廃棄金額:70}]}}}
    },
    sharedWeather:{'2025-1月-1':'晴れ'},
    legacyExtension:{memo:'架空🍙'}
  };
  const first=' '+JSON.stringify(original)+'\n';
  const updated=structuredClone(original);
  updated.stores.a.data[2025]['1月'][0].売上=456;
  const changed=' '+JSON.stringify(updated)+'\n';
  await open(page);
  const other=await context.newPage();
  await open(other);
  await page.exposeBinding('changeSourceAfterCopyCommit',()=>other.evaluate(raw=>localStorage.setItem(SK,raw),changed));
  const interrupted=await page.evaluate(async raw=>{
    localStorage.setItem(SK,raw);
    const failure=await rejection(pilot.prepare(changeSourceAfterCopyCommit));
    return {failure,state:await pilot.inspect()};
  },first);
  expect(interrupted.failure).toBe('Pilot source changed');
  expect(interrupted.state).toMatchObject({status:'pending',sourceMatches:false});
  const oldId=interrupted.state.id;
  await open(page);
  const stopped=await page.evaluate(async id=>({
    state:await pilot.inspect(),
    load:await rejection(pilot.load()),
    activate:await rejection(pilot.activate(id)),
    prepare:await rejection(pilot.prepare())
  }),oldId);
  expect(stopped).toEqual({
    state:{id:oldId,status:'pending',sourceMatches:false},
    load:'Pilot data is not active',activate:'Pilot copied original does not match',prepare:'Pilot source changed'
  });

  const recovered=await page.evaluate(async ({id,source})=>{
    await pilot.discardPending(id);
    const newId=await pilot.prepare();
    if(await pilot.prepare()!==newId)throw new Error('Same source produced a different candidate');
    const staleDiscard=await rejection(pilot.discardPending(id));
    await pilot.activate(newId);
    const current=await pilot.load();
    if(current.raw!==source)throw new Error('Initial raw snapshot changed');
    const snapshot=JSON.parse(current.raw);
    snapshot.stores.a.data[2025]['1月'][0].売上=789;
    await pilot.save(current.revision,snapshot);
    return {newId,staleDiscard,activeDiscard:await rejection(pilot.discardPending(newId))};
  },{id:oldId,source:changed});
  expect(recovered.newId).not.toBe(oldId);
  expect(recovered.staleDiscard).toBe('Pilot pending candidate mismatch');
  expect(recovered.activeDiscard).toBe('Pilot pending candidate mismatch');
  await other.evaluate(()=>{
    // Capture the revision before the first tab saves again.
    globalThis.staleState=pilot.load();
  });
  await other.evaluate(async ()=>{await staleState;});
  await page.evaluate(async ()=>{
    const current=await pilot.load();
    const snapshot=JSON.parse(current.raw);
    snapshot.stores.b.data[2024]['1月'][0].売上=654;
    await pilot.save(current.revision,snapshot);
  });
  expect(await other.evaluate(async ()=>{
    const state=await staleState;
    return rejection(pilot.save(state.revision,JSON.parse(state.raw)));
  })).toBe('Pilot revision conflict');
  await open(page);
  const expected=JSON.parse(changed);
  expected.schemaVersion=1;
  expected.stores.a.data[2025]['1月'][0].売上=789;
  const previous=structuredClone(expected);
  expected.stores.b.data[2024]['1月'][0].売上=654;
  const loaded=await page.evaluate(async raw=>{
    const current=await pilot.load();
    return {revision:current.revision,data:JSON.parse(current.raw),
      previous:JSON.parse(current.previous.raw),sourceMatches:localStorage.getItem(SK)===raw};
  },changed);
  expect(loaded).toEqual({revision:2,data:expected,previous,sourceMatches:true});

  await other.evaluate(raw=>localStorage.setItem(SK,raw),first);
  await open(page);
  const activeMismatch=await page.evaluate(async ()=>({
    load:await rejection(pilot.load()),save:await rejection(pilot.save(2,{stores:{}}))
  }));
  expect(activeMismatch).toEqual({load:'Pilot source changed',save:'Pilot source changed'});
  const evidence=await page.evaluate(async ({id,first})=>{
    const stale=await rejection(pilot.readConflictForRecovery(id,1));
    const conflict=await pilot.readConflictForRecovery(id,2);
    const current=JSON.parse(conflict.indexedDBRaw);
    return {stale,revision:conflict.revision,data:current,
      previous:JSON.parse(conflict.previousRaw),sourceMatches:conflict.sourceRaw===first,
      sourceUnchanged:localStorage.getItem(SK)===first,stillBlocked:await rejection(pilot.load())};
  },{id:recovered.newId,first});
  expect(evidence).toEqual({stale:'Pilot recovery state changed',revision:2,data:expected,
    previous,sourceMatches:true,sourceUnchanged:true,stillBlocked:'Pilot source changed'});
});
