const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('IndexedDB save pilot commits one revision and retains the last revision on failure',async({page,context})=>{
  const url='/indexeddb-save-pilot-test';
  const fixture=path.join(__dirname,'../fixtures/indexeddb-save-pilot.js');
  const storage=path.join(__dirname,'../../insight_storage_v1.js');
  await context.route('**'+url,route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  async function loadPilot(target){
    await target.goto(url);
    await target.addScriptTag({path:storage});
    await target.addScriptTag({path:fixture});
  }
  await loadPilot(page);
  const raw=' '+JSON.stringify({
    current:'store_1',
    stores:{
      store_1:{name:'架空店1🍙',years:['2024','2025'],data:{2024:{'1月':[{売上:123}]},2025:{}}},
      store_2:{name:'架空店2',years:['2024','2025'],data:{2024:{'1月':[{売上:456}]},2025:{}}}
    },
    sharedWeather:{'2024-1月-1':'晴れ'},
    legacyField:'旧形式の追加項目'
  })+'\n';
  const initial=await page.evaluate(async source=>{
    const pilot=InsightIndexedDBSavePilot;
    const missing=await pilot.load().then(()=>null,error=>error.message);
    localStorage.setItem(SK,source);
    await pilot.initialize(source);
    await pilot.initialize(source);
    const state=await pilot.load();
    return {missing,revision:state.revision,same:state.raw===source};
  },raw);
  expect(initial).toEqual({missing:'Pilot stored data missing',revision:0,same:true});

  const other=await context.newPage();
  await loadPilot(other);
  async function edit(target,value){
    return target.evaluate(async sales=>{
      const pilot=InsightIndexedDBSavePilot;
      const current=await pilot.load();
      const snapshot=JSON.parse(current.raw);
      snapshot.stores.store_1.data[2024]['1月'][0].売上=sales;
      snapshot.largeTestField='x'.repeat(2_600_000);
      return {revision:current.revision,snapshot};
    },value);
  }
  const [first,stale]=await Promise.all([edit(page,789),edit(other,999)]);
  await page.evaluate(async ({revision,snapshot})=>{
    await InsightIndexedDBSavePilot.save(revision,snapshot);
  },first);
  const conflict=await other.evaluate(({revision,snapshot})=>
    InsightIndexedDBSavePilot.save(revision,snapshot).then(()=>null,error=>error.message),stale);
  expect(conflict).toBe('Pilot revision conflict');

  const failures=await page.evaluate(async ()=>{
    const pilot=InsightIndexedDBSavePilot;
    const current=await pilot.load();
    const snapshot=JSON.parse(current.raw);
    snapshot.stores.store_1.data[2024]['1月'][0].売上=999;
    const fault=async options=>pilot.save(current.revision,snapshot,options)
      .then(()=>null,error=>error.name);
    return [
      await fault({beforeWrite(){throw new DOMException('Injected quota failure','QuotaExceededError');}}),
      await fault({afterWrite(){throw new DOMException('Injected transaction abort','AbortError');}})
    ];
  });
  expect(failures).toEqual(['QuotaExceededError','AbortError']);

  await loadPilot(page);
  const reopened=await page.evaluate(async source=>{
    const state=await InsightIndexedDBSavePilot.load();
    const data=JSON.parse(state.raw);
    return {
      revision:state.revision,prior:state.previous.revision,priorMatches:state.previous.raw===source,
      stores:[data.stores.store_1.data[2024]['1月'][0].売上,data.stores.store_2.data[2024]['1月'][0].売上],
      legacyMatches:data.legacyField===JSON.parse(source).legacyField,
      largeFieldSize:data.largeTestField.length,
      sourceMatches:localStorage.getItem(SK)===source
    };
  },raw);
  expect(reopened).toEqual({revision:1,prior:0,priorMatches:true,stores:[789,456],legacyMatches:true,largeFieldSize:2_600_000,sourceMatches:true});
});
