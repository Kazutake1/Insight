const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const adapter=fs.readFileSync(path.join(__dirname,'../fixtures/indexeddb-verified-restart.js'),'utf8');

test('isolated Insight boots and saves fictional sales through IndexedDB',async({page})=>{
  const source=' '+JSON.stringify({current:'a',stores:{
    a:{name:'架空店A',years:['2025','2026'],data:{2025:{'1月':[{d:'1',売上:123,storeMemo:'保持'}]},2026:{}}},
    b:{name:'架空店B',years:['2025','2026'],data:{2025:{'1月':[{d:'1',売上:321}]},2026:{}}}
  }})+'\n';
  await page.route('**/indexeddb-app-seed',route=>route.fulfill({body:'<!doctype html><title>Fixture seed</title>',contentType:'text/html'}));
  await page.goto('/indexeddb-app-seed');
  await page.addScriptTag({content:adapter});
  await page.evaluate(async raw=>{
    localStorage.setItem('insight_v11',raw);
    window.InsightStorage={migrateSnapshot:snapshot=>snapshot};
    const pilot=InsightIndexedDBRestartGate.create(()=>localStorage.getItem('insight_v11'));
    await pilot.activate(await pilot.prepare());
  },source);
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.route('**/insight_shell_loader_v1.js*',async route=>{
    const response=await route.fetch();
    const body=await response.text();
    await route.fulfill({response,body:adapter+`
(async function(){
  window.fixtureStore=InsightIndexedDBRestartGate.create(()=>localStorage.getItem('insight_v11'));
  const write=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key==='insight_v11')throw new Error('Legacy write blocked in fixture');
    return write.call(this,key,value);
  };
  try{window.fixtureSnapshot=await fixtureStore.load();}
  catch(error){document.body.textContent='Fixture startup blocked: '+error.message;return;}
  `+body+'\\n})();'});
  });
  await page.route('**/insight_payload_core_v1.js*',async route=>{
    const response=await route.fetch();
    const original=await response.text();
    const body=original.replace('const current=localStorage.getItem(SK);','const current=window.fixtureSnapshot.raw;')
      .replace('if(msg){msg.classList.add("is-visible");','if(msg&&!window.fixtureSaving){msg.classList.add("is-visible");');
    if(body===original||!body.includes('msg&&!window.fixtureSaving'))throw new Error('Fixture patch no longer matches Insight');
    await route.fulfill({response,body});
  });
  async function openSales(){
    await page.goto('/Index.html');
    await page.waitForFunction(()=>window.InsightInputSaveObserverV0&&window.InsightSettings);
    await page.locator('#nav2').click();
    await page.evaluate(()=>{
      editYear.sales='2025';
      editMonth.sales='1月';
      window.salesSelDay=1;
      renderTable('sales');
    });
  }
  await openSales();
  const input=page.locator('[id="sf_売上"]');
  await expect(input).toHaveValue('123');
  await page.evaluate(()=>{
    document.addEventListener('click',async event=>{
      if(!event.target.closest('#salesSaveBtn'))return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if(window.fixtureSaving)return;
      window.fixtureSaving=true;
      const storage=InsightStorage;
      const persist=storage.persistCurrent;
      const before=JSON.stringify(allStores);
      document.getElementById('savedSales').classList.remove('is-visible');
      let staged;
      try{
        // Run the real synchronous handler and its hooks as one staged operation.
        storage.persistCurrent=snapshot=>{staged=storage.clone(snapshot);return true;};
        try{saveInput('sales');}finally{storage.persistCurrent=persist;}
        if(!staged)throw new Error('Save did not stage a snapshot');
        window.fixtureSnapshot=await fixtureStore.save(fixtureSnapshot.revision,staged);
        document.getElementById('savedSales').classList.add('is-visible');
      }catch(error){
        allStores=JSON.parse(before);
        store=allStores.stores[allStores.current];
        window.fixtureSaveError=error.message;
      }finally{window.fixtureSaving=false;}
    },true);
  });
  await input.fill('456');
  await page.locator('#salesSaveBtn').click();
  await expect(page.locator('#savedSales')).toHaveClass(/is-visible/);
  expect(await page.evaluate(()=>fixtureSnapshot.revision)).toBe(1);

  await page.evaluate(async ()=>{
    const state=await fixtureStore.load();
    await fixtureStore.save(state.revision,JSON.parse(state.raw));
  });
  await input.fill('999');
  await page.locator('#salesSaveBtn').click();
  await expect.poll(()=>page.evaluate(()=>fixtureSaveError)).toBe('Pilot revision conflict');
  await expect(page.locator('#savedSales')).not.toHaveClass(/is-visible/);

  await openSales();
  await expect(input).toHaveValue('456');
  const result=await page.evaluate(raw=>({
    revision:fixtureSnapshot.revision,
    sourceMatches:localStorage.getItem('insight_v11')===raw,
    memo:allStores.stores.a.data[2025]['1月'][0].storeMemo,
    other:allStores.stores.b.data[2025]['1月'][0].売上
  }),source);
  expect(result).toEqual({revision:2,sourceMatches:true,memo:'保持',other:321});
});
