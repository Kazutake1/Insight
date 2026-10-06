const {test,expect}=require('@playwright/test');
async function openInsight(page){
  // Production is HTTPS. The local test server is HTTP, so remove only the
  // upgrade-insecure-requests directive to stop WebKit upgrading localhost to HTTPS.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    await route.fulfill({response,body});
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>
    window.InsightDateContext&&
    window.InsightPagePeriodSync&&
    window.InsightSalesCount&&
    window.InsightYearControlsLayout&&
    document.getElementById('navSalesCount')
  );
  return errors;
}

test('WebKitで起動し主要入力ページを移動できる',async({page})=>{
  const errors=await openInsight(page);
  await expect.poll(()=>page.evaluate(()=>!!(window.persist&&window.persist.__insightPersistGuard))).toBe(true);

  await page.locator('#nav1').click();
  await expect(page.locator('#pageDash')).toHaveClass(/show/);

  await page.locator('#nav2').click();
  await expect(page.locator('#pageSales')).toHaveClass(/show/);

  await page.locator('#nav3').click();
  await expect(page.locator('#pageKyaku')).toHaveClass(/show/);

  await page.locator('#nav4').click();
  await expect(page.locator('#pageHaiki')).toHaveClass(/show/);

  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);

  expect(errors).toEqual([]);
});

test('WebKitでダッシュボード選択月の黒枠とページ間の月維持を確認する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav1').click();
  await page.waitForFunction(()=>window.InsightYearControlsLayout.getState().monthsInline);

  const september=page.locator('#pageDash .insight-dashboard-inline-months').getByRole('button',{name:'9月',exact:true});
  await expect(september).toBeVisible();
  await september.click();
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');

  const selected=page.locator('#pageDash .insight-dashboard-selected-month');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveText('9月');
  await expect.poll(()=>selected.evaluate(node=>getComputedStyle(node).borderColor)).toBe('rgb(0, 0, 0)');
  const border=await selected.evaluate(node=>({
    width:getComputedStyle(node).borderWidth,
    style:getComputedStyle(node).borderStyle
  }));
  expect(border).toEqual({width:'2px',style:'solid'});

  await page.locator('#nav2').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.sales)).toBe('9月');
  await page.locator('#nav3').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.kyaku)).toBe('9月');
  await page.locator('#nav4').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.haiki)).toBe('9月');

  await page.locator('#nav1').click();
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');
  expect(errors).toEqual([]);
});

test('WebKitで日付の年月変更後も日付入力要素を維持する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  await expect(page.locator('#iqdDateInput')).toBeAttached();

  const before=await page.evaluate(()=>window.InsightDateContext.getSelectedIso());
  const target=await page.evaluate(iso=>{
    const year=Number(iso.slice(0,4));
    const month=Number(iso.slice(5,7));
    const day=Math.min(Number(iso.slice(8,10)),28);
    const targetMonth=month===12?11:month+1;
    return year+'-'+String(targetMonth).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  },before);

  await page.locator('#iqdDateInput').evaluate((input,value)=>{
    input.__webkitPickerIdentity='preserved';
    input.value=value;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },target);

  await expect.poll(()=>page.evaluate(()=>window.InsightDateContext.getSelectedIso())).toBe(target);
  const state=await page.locator('#iqdDateInput').evaluate(input=>({
    identity:input.__webkitPickerIdentity,
    value:input.value,
    label:document.querySelector('#qNavRow .iqd-date-main').textContent
  }));
  expect(state.identity).toBe('preserved');
  expect(state.value).toBe(target);
  expect(state.label).toContain(target.slice(0,4)+'年'+Number(target.slice(5,7))+'月');
  expect(errors).toEqual([]);
});

test('WebKitで販売数を保存し再読込後も保持する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);

  const input=page.locator('#scCalendar input[type="number"]:not([readonly])').first();
  await expect(input).toBeVisible();
  const label=await input.getAttribute('aria-label');
  expect(label).toBeTruthy();

  await input.fill('321');
  await expect(page.locator('#scSave')).toBeEnabled();
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();

  const rawBefore=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(rawBefore).toContain('321');

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightSalesCount&&document.getElementById('navSalesCount'));
  await page.locator('#navSalesCount').click();

  const restored=page.getByLabel(label,{exact:true});
  await expect(restored).toHaveValue('321');
  expect(errors).toEqual([]);
});
