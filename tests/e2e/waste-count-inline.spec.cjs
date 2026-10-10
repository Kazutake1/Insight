const {test,expect}=require('@playwright/test');

test('納品・販売・廃棄を同じ日付カードから一括保存し再表示できる',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // ローカルHTTPでのWebKit/Chromium検証ではHTTPS強制だけを除外する。
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);

  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  await expect(card.locator('.sc-trip')).toHaveCount(3);
  await expect(card.locator('.sc-waste-row input')).toHaveCount(3);
  await expect(card.locator('.sc-total-waste')).toHaveText('—');
  await expect(page.locator('.sc-average-card .sc-waste-row')).toHaveCount(0);
  const initial=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {sales:JSON.stringify(store.salesCounts),daily:JSON.stringify(store.data),haiki:JSON.stringify(store.haikibudget||null)};
  });
  const key=await page.evaluate(()=>{
    const p=InsightSalesCount.getPeriod();
    return {date:String(p.year)+'-'+String(p.month).padStart(2,'0')+'-01',categoryId:document.getElementById('scCategory').value,storeId:allStores.current};
  });

  await card.locator('.sc-delivery-row input').first().fill('12');
  await card.locator('.sc-sales-row input').first().fill('8');
  await card.locator('.sc-waste-row input').first().fill('0');
  await card.locator('.sc-waste-row input').nth(1).fill('3');
  await expect(card.locator('.sc-total-waste')).toHaveText('3※');
  await expect(page.locator('#scSave')).toBeEnabled();
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();

  const saved=await page.evaluate(({storeId,date,categoryId})=>{
    const store=allStores.stores[storeId];
    return {daily:JSON.stringify(store.data),haiki:JSON.stringify(store.haikibudget||null),
      sale:store.salesCounts[date][categoryId].trips[0],
      waste:store.wasteCounts[date][categoryId].trips};
  },key);
  expect(saved.daily).toBe(initial.daily);
  expect(saved.haiki).toBe(initial.haiki);
  expect(saved.sale.delivery).toBe(12);
  expect(saved.sale.sales).toBe(8);
  expect(saved.waste).toEqual([0,3,null]);

  // 販売のみ再編集しても保存済み廃棄数は消えない。
  await card.locator('.sc-sales-row input').first().fill('9');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect(await page.evaluate(({storeId,date,categoryId})=>
    allStores.stores[storeId].wasteCounts[date][categoryId].trips,key)).toEqual([0,3,null]);

  await page.reload();
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#scCalendar .sc-waste-row input').first()).toHaveValue('0');
  await expect(page.locator('#scCalendar .sc-waste-row input').nth(1)).toHaveValue('3');
  expect(errors).toEqual([]);
});

test('11インチ相当の画面幅でカレンダーカードの3入力行が切れない',async({page})=>{
  await page.setViewportSize({width:1194,height:834});
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSalesCount').click();
  const geometry=await page.locator('#scCalendar').evaluate(grid=>{
    const card=grid.querySelector('.sc-day:not(.empty)');
    const total=card.querySelector('.sc-total-waste');
    const r=card.getBoundingClientRect(),t=total.getBoundingClientRect();
    return {height:r.height,visible:t.bottom<=r.bottom+1,scrollDiff:grid.scrollWidth-grid.clientWidth};
  });
  expect(geometry.height).toBeGreaterThanOrEqual(240);
  expect(geometry.visible).toBe(true);
  expect(geometry.scrollDiff).toBeLessThanOrEqual(3);
});
