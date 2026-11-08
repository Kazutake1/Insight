const {test,expect}=require('@playwright/test');

async function openHourly(page,{observerMissing=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer unavailable'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightHourlyCustomers&&
    typeof window.InsightHourlyCustomers.getHourlySaveOperationStatus==='function'&&
    typeof window.InsightHourlyCustomers.renderQuick==='function');
  await page.evaluate(()=>{
    // Isolated browser-only FICTIONAL data, not read from real store backups.
    const source=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    allStores={current:'fictional_hourly_store',stores:{
      fictional_hourly_store:{...source,name:'FICTIONAL hourly store',hourlyCustomers:{}}
    }};
    store=allStores.stores[allStores.current];
    currentNav=0;
    InsightHourlyCustomers.renderQuick();
    window.__hourlySamples=[];
    window.alertMessages=[];
    window.alert=message=>window.alertMessages.push(String(message));
  });
  await expect(page.locator('#hourlyCustomersQuick .hourly-quick-button')).toBeVisible();
}
async function openDialog(page){
  await page.locator('#hourlyCustomersQuick .hourly-quick-button').click();
  const dialog=page.locator('dialog.hourly-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('FICTIONAL hourly save stays ACTIVE across transaction and render, then returns IDLE_OBSERVED',async({page})=>{
  await openHourly(page);
  const before=await page.evaluate(()=>InsightHourlyCustomers.getHourlySaveOperationStatus());
  expect(before.state).toBe('IDLE_OBSERVED');
  await page.evaluate(()=>{
    const original=InsightStorage.transaction;
    InsightStorage.transaction=function(){
      window.__hourlySamples.push(InsightHourlyCustomers.getHourlySaveOperationStatus());
      const result=original.apply(this,arguments);
      window.__hourlySamples.push(InsightHourlyCustomers.getHourlySaveOperationStatus());
      return result;
    };
  });
  const dialog=await openDialog(page);
  await dialog.locator('input[data-hour="0"]').fill('17');
  await dialog.locator('.hourly-primary').click();
  await expect(dialog).toHaveCount(0);
  const output=await page.evaluate(()=>{
    const state=InsightHourlyCustomers.getHourlySaveOperationStatus();
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {state,samples:window.__hourlySamples,
      value:saved.stores.fictional_hourly_store.hourlyCustomers[InsightDateContext.getSelectedIso()][0],
      alerts:window.alertMessages};
  });
  expect(output.value).toBe(17);
  expect(output.samples.length).toBe(2);
  expect(output.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(output.state.scope).toBe('hourly-dialog-save-only');
  expect(output.state.state).toBe('IDLE_OBSERVED');
  expect(output.state.activeCount).toBe(0);
  expect(output.alerts).toEqual([]);
});

test('FICTIONAL failure after committed write remains HELD with unchanged original alert',async({page})=>{
  await openHourly(page);
  await page.evaluate(()=>{
    const original=InsightStorage.transaction;
    InsightStorage.transaction=function(){
      const result=original.apply(this,arguments);
      throw new Error('FICTIONAL after-hourly-write error');
    };
  });
  const dialog=await openDialog(page);
  await dialog.locator('input[data-hour="1"]').fill('23');
  await dialog.locator('.hourly-primary').click();
  const output=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {state:InsightHourlyCustomers.getHourlySaveOperationStatus(),
      saved:saved.stores.fictional_hourly_store.hourlyCustomers[InsightDateContext.getSelectedIso()][1],
      alerts:window.alertMessages};
  });
  expect(output.saved).toBe(23);
  expect(output.state.state).toBe('HELD');
  expect(output.state.activeCount).toBe(0);
  expect(output.alerts.join(' ')).toContain('FICTIONAL after-hourly-write error');
});

test('FICTIONAL missing observer preserves existing hourly save and exposes UNAVAILABLE',async({page})=>{
  await openHourly(page,{observerMissing:true});
  expect((await page.evaluate(()=>InsightHourlyCustomers.getHourlySaveOperationStatus())).state).toBe('UNAVAILABLE');
  const dialog=await openDialog(page);
  await dialog.locator('input[data-hour="2"]').fill('41');
  await dialog.locator('.hourly-primary').click();
  await expect(dialog).toHaveCount(0);
  const output=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {state:InsightHourlyCustomers.getHourlySaveOperationStatus(),
      value:saved.stores.fictional_hourly_store.hourlyCustomers[InsightDateContext.getSelectedIso()][2]};
  });
  expect(output.value).toBe(41);
  expect(output.state.state).toBe('UNAVAILABLE');
});
