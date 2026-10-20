const {test,expect}=require('@playwright/test');

test('販売数入力への反復移動で年度追加の誤警告を表示せず未登録年度だけ保護する',async({page})=>{
  // Local HTTP and WebKit: disable only the production HTTPS-upgrade directive.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    await route.fulfill({response,body});
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.waitForFunction(()=>window.InsightSalesCount&&
    typeof window.InsightSalesCount.setPeriod==='function'&&
    window.InsightPagePeriodSync&&
    window.InsightYearManager&&
    typeof window.InsightYearManager.promoteCurrent==='function');

  const registered=await page.evaluate(()=>{
    const current=allStores.stores[allStores.current];
    const year=String(current.years[current.years.length-1]);
    const month=InsightSalesCount.getPeriod().month;
    if(!InsightSalesCount.setPeriod(year,month))throw new Error('registered year initialization failed');
    baseYear=year;
    selMonth=String(month)+'月';
    InsightPagePeriodSync.setTarget({year,month,source:'dashboard'});
    // Simulate an unavailable year-manager feature: viewing an already
    // registered period must work, while adding an unregistered year must not.
    window.__yearManagerForTest=window.InsightYearManager;
    window.InsightYearManager=undefined;
    window.__yearWarnings=[];
    window.alert=message=>window.__yearWarnings.push(String(message));
    return {year,month};
  });

  for(let i=0;i<3;i++){
    await page.locator('#nav1').click();
    await page.locator('#navSalesCount').click();
    await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);
    expect(await page.evaluate(()=>window.__yearWarnings)).toEqual([]);
  }
  const result=await page.evaluate(({year,month})=>{
    const same=InsightSalesCount.setPeriod(year,month);
    const anotherMonth=month===12?11:month+1;
    const registeredSwitch=InsightSalesCount.setPeriod(year,anotherMonth);
    const unregistered=InsightSalesCount.setPeriod(2099,anotherMonth);
    return {same,registeredSwitch,unregistered,
      warnings:window.__yearWarnings.slice(),
      years:allStores.stores[allStores.current].years.map(String)};
  },registered);
  expect(result.same).toBe(true);
  expect(result.registeredSwitch).toBe(true);
  expect(result.unregistered).toBe(false);
  expect(result.warnings).toEqual(['この年度を追加する機能を使用できません。']);
  expect(result.years).toContain(registered.year);
  expect(result.years).not.toContain('2099');
  expect(errors).toEqual([]);
});
