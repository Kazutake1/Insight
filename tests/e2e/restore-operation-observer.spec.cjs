const {test,expect}=require('@playwright/test');

// All browser state and imported files are FICTIONAL, created in a fresh
// Playwright context. Never inspect a real user's stored Insight records.
async function setup(page,{missingObserver=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(missingObserver)await page.route('**/insight_operation_observer_v0.js*',route=>
    route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL missing observer'}));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightRestoreOperationObserverV0&&window.InsightStorage&&
    window.InsightDataHealth&&document.getElementById('restoreFile'));
  const fixture=await page.evaluate(()=>{
    const original=InsightStorage.migrateSnapshot(JSON.parse(JSON.stringify(allStores)));
    const id=original.current;
    const year=String(original.stores[id].years.at(-1)),month='1月';
    original.stores[id].data[year][month][0].売上=111;
    const target=JSON.parse(JSON.stringify(original));
    target.stores[id].data[year][month][0].売上=777;
    allStores=original;
    store=allStores.stores[id];
    baseYear=year;
    InsightStorage.persistCurrent(allStores);
    window.__restoreSamples=[];
    window.__restoreWrites=0;
    window.__restoreAlerts=[];
    window.alert=message=>window.__restoreAlerts.push(String(message));
    const originalWrite=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(){
      window.__restoreSamples.push(InsightRestoreOperationObserverV0.getStatus());
      window.__restoreWrites++;
      const value=originalWrite.apply(this,arguments);
      window.__restoreSamples.push(InsightRestoreOperationObserverV0.getStatus());
      return value;
    };
    return {json:JSON.stringify(target),id,year,month};
  });
  page.on('dialog',dialog=>dialog.accept());
  return fixture;
}
async function upload(page,json){
  await page.locator('#restoreFile').setInputFiles({
    name:'FICTIONAL_backup.json',mimeType:'application/json',buffer:Buffer.from(json)
  });
}
async function snapshot(page,fixture){
  return page.evaluate(({id,year,month})=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {
      status:InsightRestoreOperationObserverV0.getStatus(),
      saved:saved.stores[id].data[year][month][0].売上,
      live:allStores.stores[id].data[year][month][0].売上,
      writes:window.__restoreWrites,samples:window.__restoreSamples,
      alerts:window.__restoreAlerts,inputValue:document.getElementById('restoreFile').value
    };
  },fixture);
}
async function endState(page,writes,state){
  await page.waitForFunction(({writes,state})=>{
    const status=window.InsightRestoreOperationObserverV0.getStatus();
    return window.__restoreWrites===writes&&status.state===state&&status.activeCount===0;
  },{writes,state});
}
test('FICTIONAL native FileReader completes confirmed write and sync UI observation',async({page})=>{
  const f=await setup(page);
  expect((await snapshot(page,f)).status.state).toBe('UNAVAILABLE');
  await upload(page,f.json);
  await endState(page,1,'IDLE_OBSERVED');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.samples).toHaveLength(2);
  expect(s.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
  expect(s.inputValue).toBe('');
  expect(s.alerts).toEqual([]);
});
test('FICTIONAL user cancellation does not begin restore write observation',async({page})=>{
  const f=await setup(page);
  page.removeAllListeners('dialog');
  page.on('dialog',dialog=>dialog.dismiss());
  await upload(page,f.json);
  await page.waitForFunction(()=>document.getElementById('restoreFile').value==='');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([111,111,0]);
  expect(s.status.state).toBe('UNAVAILABLE');
});
test('FICTIONAL postflight mismatch rolls back saved bytes and stays HELD',async({page})=>{
  const f=await setup(page);
  await page.evaluate(({id,year,month})=>{
    const prior=InsightStorage.readSnapshot;
    let corruptOnce=true;
    InsightStorage.readSnapshot=function(){
      const value=prior.apply(this,arguments);
      if(window.__restoreWrites===1&&corruptOnce){
        corruptOnce=false;
        value.stores[id].data[year][month][0].売上+=1;
      }
      return value;
    };
  },f);
  await upload(page,f.json);
  await endState(page,2,'HELD');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([111,111,2]);
  expect(s.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
  expect(s.alerts.join(' ')).toContain('自動で戻しました');
});
test('FICTIONAL committed restore keeps saved bytes after a sync UI exception',async({page})=>{
  const f=await setup(page);
  await page.evaluate(()=>{
    InsightDataHealth.refresh=function(){throw Error('FICTIONAL late UI failure');};
  });
  await upload(page,f.json);
  await endState(page,1,'HELD');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.alerts.join(' ')).toContain('復元したデータは保存されています');
  expect(s.samples.every(x=>x.state==='ACTIVE')).toBe(true);
});
test('FICTIONAL missing observer script never blocks original native restore',async({page})=>{
  const f=await setup(page,{missingObserver:true});
  await upload(page,f.json);
  await page.waitForFunction(()=>window.__restoreWrites===1&&document.getElementById('restoreFile').value==='');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.status.state).toBe('UNAVAILABLE');
});
