const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('IndexedDB integrated pilot verifies the source before activating the first save revision',async({page,context})=>{
  const url='/indexeddb-save-pilot-test';
  const fixture=path.join(__dirname,'../fixtures/indexeddb-save-pilot.js');
  const copyFixture=path.join(__dirname,'../fixtures/indexeddb-copy-pilot.js');
  const storage=path.join(__dirname,'../../insight_storage_v1.js');
  await context.route('**'+url,route=>route.fulfill({
    body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
  }));
  async function loadPilot(target){
    await target.goto(url);
    await target.addScriptTag({path:storage});
    await target.addScriptTag({path:copyFixture});
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
    const readSource=()=>localStorage.getItem(SK);
    // Inject a source change after the first save record's add request succeeds.
    let checks=0;
    let staged=false;
    const copyPilot=InsightIndexedDBCopyPilot;
    const originalCopy=copyPilot.copy;
    copyPilot.copy=async options=>{
      const result=await originalCopy(options);
      staged=true;
      return result;
    };
    const rejected=await pilot.initializeFromSource({readSource(){
      return !staged||++checks<2?readSource():source.replace('456','999');
    }}).then(()=>null,error=>error.message);
    copyPilot.copy=originalCopy;
    const afterAbort=await pilot.load().then(()=>null,error=>error.message);
    const changedCandidate=await pilot.initializeFromSource({
      readSource:()=>source.replace('456','999')
    }).then(()=>null,error=>error.message);
    await pilot.initializeFromSource({readSource});
    await pilot.initializeFromSource({readSource});
    const state=await pilot.load();
    return {missing,rejected,afterAbort,changedCandidate,revision:state.revision,same:state.raw===source};
  },raw);
  expect(initial).toEqual({
    missing:'Pilot stored data missing',rejected:'Pilot source changed',
    afterAbort:'Pilot stored data missing',changedCandidate:'Pilot already contains a different snapshot',revision:0,same:true
  });

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
