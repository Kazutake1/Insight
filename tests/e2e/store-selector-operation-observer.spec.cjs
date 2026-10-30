const {test,expect}=require('@playwright/test');

async function fictionalStoreSelector(page,{missingObserver=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(missingObserver)await page.route('**/insight_operation_observer_v0.js*',route=>
    route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL missing observer'}));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightStoreSelectorObserverV0&&
    window.InsightSalesCount&&window.InsightSettings&&
    document.getElementById('navSettings')&&document.getElementById('navSalesCount'));
  await page.evaluate(()=>{
    const template=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    const a=JSON.parse(JSON.stringify(template)),b=JSON.parse(JSON.stringify(template));
    a.name='FICTIONAL A';b.name='FICTIONAL B';
    const year=String(a.years[a.years.length-1]),month='1月';
    if(!a.data[year])a.data[year]=blankYearData(year);
    if(!b.data[year])b.data[year]=blankYearData(year);
    a.data[year][month][0].売上=111;
    b.data[year][month][0].売上=222;
    allStores={current:'fictional_a',stores:{fictional_a:a,fictional_b:b}};
    store=allStores.stores[allStores.current];
    baseYear=year;
    cmpYear=a.years.length>1?a.years[a.years.length-2]:null;
    editYear={sales:year,kyaku:year,haiki:year};
    InsightStorage.persistCurrent(allStores);
    renderStoreSel();
    window.__selectorFixture={year,month};
    window.__selectorSamples=[];
    window.__selectorWrites=0;
    window.__selectorAlerts=[];
    window.alert=message=>window.__selectorAlerts.push(String(message));
  });
}
async function instrumentation(page){
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__selectorWrites++;
      window.__selectorSamples.push(InsightStoreSelectorObserverV0.getStatus());
      const result=original.apply(this,arguments);
      window.__selectorSamples.push(InsightStoreSelectorObserverV0.getStatus());
      return result;
    };
  });
}
async function snapshot(page){
  return page.evaluate(()=>{
    const f=window.__selectorFixture;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightStoreSelectorObserverV0.getStatus(),
      writes:window.__selectorWrites,samples:window.__selectorSamples,
      current:allStores.current,savedCurrent:saved.current,
      nav:currentNav,selected:document.getElementById('storeSel').value,
      a:saved.stores.fictional_a.data[f.year][f.month][0].売上,
      b:saved.stores.fictional_b.data[f.year][f.month][0].売上,
      alerts:window.__selectorAlerts};
  });
}
for(const [name,nav,visible] of [
  ['dashboard','#nav1','#pageDash'],
  ['sales counts','#navSalesCount','#pageSalesCount'],
  ['settings','#navSettings','#pageSettings']
]){
  test('FICTIONAL '+name+' effective store selector encloses persistence and render',async({page})=>{
    await fictionalStoreSelector(page);
    await page.locator(nav).click();
    await expect(page.locator(visible)).toHaveClass(/show/);
    await instrumentation(page);
    await page.locator('#storeSel').selectOption('fictional_b');
    const s=await snapshot(page);
    expect(s.current).toBe('fictional_b');
    expect(s.savedCurrent).toBe('fictional_b');
    expect(s.selected).toBe('fictional_b');
    expect([s.a,s.b]).toEqual([111,222]);
    expect(s.writes).toBe(1);
    expect(s.samples).toHaveLength(2);
    expect(s.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
    expect(s.status).toMatchObject({scope:'store-selector-change-sync-chain-only',state:'IDLE_OBSERVED',activeCount:0});
    await expect(page.locator(visible)).toHaveClass(/show/);
    if(name==='settings')expect(s.nav).toBe('settings');
    if(name==='sales counts')expect(s.nav).toBe('salesCounts');
  });
}
test('FICTIONAL dirty sales-count cancellation preserves store and conservatively HELD',async({page})=>{
  await fictionalStoreSelector(page);
  await page.locator('#navSalesCount').click();
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('17');
  await expect(page.locator('#scSave')).toBeEnabled();
  page.on('dialog',dialog=>dialog.dismiss());
  await instrumentation(page);
  await page.locator('#storeSel').selectOption('fictional_b');
  const s=await snapshot(page);
  expect(s.current).toBe('fictional_a');
  expect(s.savedCurrent).toBe('fictional_a');
  expect(s.selected).toBe('fictional_a');
  expect(s.writes).toBe(0);
  expect(s.status).toMatchObject({state:'HELD',activeCount:0});
  await expect(page.locator('#scSave')).toBeEnabled();
});
test('FICTIONAL postcommit persist failure leaves original guard warning and HELD',async({page})=>{
  await fictionalStoreSelector(page);
  await page.locator('#nav1').click();
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__selectorWrites++;
      const result=original.apply(this,arguments);
      throw Error('FICTIONAL postcommit persist failure');
    };
  });
  await page.locator('#storeSel').selectOption('fictional_b');
  const s=await snapshot(page);
  expect(s.writes).toBe(1);
  expect(s.current).toBe('fictional_b');
  expect(s.savedCurrent).toBe('fictional_b');
  expect(s.status).toMatchObject({state:'HELD',activeCount:0});
  expect(s.alerts.join(' ')).toContain('保存結果を確認できないため');
});
test('FICTIONAL settings after-save render error leaves HELD with committed store',async({page})=>{
  await fictionalStoreSelector(page);
  await page.locator('#navSettings').click();
  await page.evaluate(()=>{
    const original=InsightDataHealth.refresh;
    InsightDataHealth.refresh=function(){
      if(allStores.current==='fictional_b')throw Error('FICTIONAL settings refresh failure');
      return original.apply(this,arguments);
    };
  });
  await instrumentation(page);
  await page.locator('#storeSel').selectOption('fictional_b');
  const s=await snapshot(page);
  expect(s.current).toBe('fictional_b');
  expect(s.savedCurrent).toBe('fictional_b');
  expect(s.writes).toBe(1);
  expect(s.samples.every(x=>x.state==='ACTIVE')).toBe(true);
  expect(s.status).toMatchObject({state:'HELD',activeCount:0});
  expect(s.nav).toBe('settings');
});
test('FICTIONAL absent observer script cannot block existing store selector saving',async({page})=>{
  await fictionalStoreSelector(page,{missingObserver:true});
  await page.locator('#nav1').click();
  await instrumentation(page);
  await page.locator('#storeSel').selectOption('fictional_b');
  const s=await snapshot(page);
  expect(s.status.state).toBe('UNAVAILABLE');
  expect(s.writes).toBe(1);
  expect(s.savedCurrent).toBe('fictional_b');
  expect([s.a,s.b]).toEqual([111,222]);
});
test('FICTIONAL identical store change event does not register a switch',async({page})=>{
  await fictionalStoreSelector(page);
  await instrumentation(page);
  const result=await page.evaluate(()=>{
    const before=InsightStoreSelectorObserverV0.getStatus();
    document.getElementById('storeSel').dispatchEvent(new Event('change',{bubbles:true}));
    return {before,after:InsightStoreSelectorObserverV0.getStatus(),writes:window.__selectorWrites};
  });
  // Existing switchStore() persists even when selecting the current store;
  // do not change business behavior just to suppress the observer token.
  expect(result.writes).toBe(1);
  expect(result.after.epoch).toBe(result.before.epoch);
  expect(result.after.state).toBe('IDLE_OBSERVED');
});
