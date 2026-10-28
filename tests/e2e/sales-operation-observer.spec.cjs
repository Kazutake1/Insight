const {test,expect}=require('@playwright/test');

async function openSales(page,{observerMissing=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'observer unavailable'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.waitForFunction(()=>window.InsightSalesCount&&
    typeof window.InsightSalesCount.getForecastOperationStatus==='function');
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);
}

function getStatus(page){return page.evaluate(()=>window.InsightSalesCount.getForecastOperationStatus());}

test('fictional sales save observes the whole save callback, not just storage write',async({page})=>{
  await openSales(page);
  expect((await getStatus(page)).state).toBe('IDLE_OBSERVED');
  await page.evaluate(()=>{
    window.__operationSamples=[];
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      const serialized=original(snapshot);
      // Storage has committed, but the outer business callback has not yet applied its live state.
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      return serialized;
    };
  });
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('17');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  const statuses=await page.evaluate(()=>window.__operationSamples);
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every(s=>s.state==='ACTIVE'&&s.scope==='registered-operations-only'&&s.activeCount>=1)).toBe(true);
  expect((await getStatus(page)).state).toBe('IDLE_OBSERVED');
  expect((await getStatus(page)).activeCount).toBe(0);
});

test('fictional category save observes the outer dialog save callback',async({page})=>{
  await openSales(page);
  await page.evaluate(()=>{
    window.__operationSamples=[];
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      const serialized=original(snapshot);
      // Storage has committed, but the outer business callback has not yet applied its live state.
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      return serialized;
    };
  });
  await page.locator('#scManage').click();
  const dialog=page.locator('dialog.sc-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-save]').click();
  await expect(dialog).toHaveCount(0);
  const samples=await page.evaluate(()=>window.__operationSamples);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect((await getStatus(page)).state).toBe('IDLE_OBSERVED');
});

test('postcommit exception leaves observer HELD and keeps original save error handling',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  await openSales(page);
  await page.evaluate(()=>{
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(next){
      original(next); // FICTIONAL successful disk write, followed by a failure before memory apply.
      throw new Error('FICTIONAL after-write apply failure');
    };
    window.alertMessages=[];
    window.alert=message=>window.alertMessages.push(String(message));
  });
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('233');
  await page.locator('#scSave').click();
  const result=await page.evaluate(()=>{
    const s=InsightSalesCount.getForecastOperationStatus();
    return {state:s.state,activeCount:s.activeCount,
      persisted:localStorage.getItem('insight_v11')?.includes('233'),
      alerts:window.alertMessages,
      buttonDisabled:document.getElementById('scSave').disabled};
  });
  expect(result.state).toBe('HELD');
  expect(result.activeCount).toBe(0);
  expect(result.persisted).toBe(true);
  expect(result.buttonDisabled).toBe(false);
  expect(result.alerts.join(' ')).toContain('FICTIONAL after-write apply failure');
  expect(errors).toEqual([]);
});

test('missing observer script cannot prevent existing fictional sales saving',async({page})=>{
  await openSales(page,{observerMissing:true});
  expect((await getStatus(page)).state).toBe('UNAVAILABLE');
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('41');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect((await getStatus(page)).state).toBe('UNAVAILABLE');
});

test('invalid category input causes sticky HELD while the original dialog remains open',async({page})=>{
  const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());return d.accept();});
  await openSales(page);
  await page.locator('#scManage').click();
  const d=page.locator('dialog.sc-dialog');
  await expect(d).toBeVisible();
  const names=d.locator('.sc-category-row input[aria-label="カテゴリー名"]');
  await expect(names).toHaveCount(3);
  await names.nth(1).fill(await names.nth(0).inputValue());
  await d.locator('[data-save]').click();
  expect(dialogs.join(' ')).toContain('同じカテゴリー名');
  expect((await getStatus(page)).state).toBe('HELD');
  await expect(d).toBeVisible();
});
