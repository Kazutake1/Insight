const {test,expect}=require('@playwright/test');
test('予測用データ品質チェックは設定画面から開け、データを変更しない',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect(page.locator('#insightPredictionDataButton')).toHaveCount(1);
  const before=await page.evaluate(()=>JSON.stringify(allStores));
  await page.locator('#insightPredictionDataButton').click();
  await expect(page.locator('#insightPredictionDataOverlay')).toBeVisible();
  await expect(page.locator('#ipdhHeading')).toHaveText('予測用データ品質チェック');
  await expect(page.locator('.ipdh-period')).toContainText('2025-09-01');
  await expect(page.locator('.ipdh-store').first()).toBeVisible();
  await expect(page.locator('.ipdh-table tbody tr').first()).toBeAttached();
  for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
    await page.setViewportSize(viewport);
    const bounds=await page.locator('.ipdh-dialog').evaluate(node=>{
      const r=node.getBoundingClientRect();
      return {left:r.left,right:r.right,screen:window.innerWidth,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};
    });
    expect(bounds.left).toBeGreaterThanOrEqual(-1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.screen+1);
    expect(bounds.scrollWidth-bounds.clientWidth).toBeLessThanOrEqual(2);
    await expect(page.locator('.ipdh-table-scroll')).toBeVisible();
  }
  await page.locator('.ipdh-close').click();
  await expect(page.locator('#insightPredictionDataOverlay')).toBeHidden();
  expect(await page.evaluate(()=>JSON.stringify(allStores))).toEqual(before);
  expect(errors).toEqual([]);
});
