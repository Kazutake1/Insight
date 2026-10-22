const {test,expect}=require('@playwright/test');

test('STEP3: 店舗保存データの分析可否をiPad内で診断し、閉じてもデータを変更しない',async({page})=>{
  const errors=[],externalRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect(page.locator('#insightWeatherSalesDiagnosticsButton')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>!!(window.InsightWeatherSalesReadiness&&
    window.InsightWeatherSalesTrends&&window.InsightWeatherSalesDiagnostics))).toBe(true);
  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);
  await expect(page.locator('#insightSettingsDataActions #insightWeatherSalesDiagnosticsButton')).toBeVisible();
  await expect(page.locator('#insightSettingsDataActions #insightPredictionDataButton')).toBeVisible();

  const before=await page.evaluate(()=>({
    snapshot:JSON.stringify(allStores),
    saved:window.localStorage.getItem('insight_v11')
  }));
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin!==new URL(page.url()).origin)externalRequests.push(url.origin);
  });

  await page.locator('#insightWeatherSalesDiagnosticsButton').click();
  await expect(page.locator('#insightWeatherSalesDiagnosticsOverlay')).toBeVisible();
  await expect(page.locator('#iwsdHeading')).toHaveText('天気・気温の分析可否チェック');
  await expect(page.locator('#insightWeatherSalesDiagnosticsOverlay .ipdh-note').first()).toContainText('直近84日');
  await expect(page.locator('.iwsd-store').first()).toBeVisible();
  await expect(page.locator('.iwsd-table thead')).toContainText('有効日数');
  await expect(page.locator('.iwsd-table thead')).toContainText('天気比較');
  await expect(page.locator('.iwsd-table thead')).toContainText('気温比較');
  await expect(page.locator('.iwsd-table tbody tr').first()).toBeAttached();

  for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
    await page.setViewportSize(viewport);
    const bounds=await page.locator('.iwsd-dialog').evaluate(node=>{
      const r=node.getBoundingClientRect(),scroll=node.querySelector('.ipdh-table-scroll');
      return {left:r.left,right:r.right,screen:innerWidth,dialogOverflow:node.scrollWidth-node.clientWidth,
        tableOverflow:scroll.scrollWidth>=scroll.clientWidth};
    });
    expect(bounds.left).toBeGreaterThanOrEqual(-1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.screen+1);
    expect(bounds.dialogOverflow).toBeLessThanOrEqual(2);
    expect(bounds.tableOverflow).toBe(true);
  }
  await page.locator('.iwsd-dialog .ipdh-close').click();
  await expect(page.locator('#insightWeatherSalesDiagnosticsOverlay')).toBeHidden();
  expect(await page.evaluate(()=>({
    snapshot:JSON.stringify(allStores),
    saved:window.localStorage.getItem('insight_v11')
  }))).toEqual(before);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
