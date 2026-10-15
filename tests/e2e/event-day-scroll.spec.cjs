const {test,expect}=require('@playwright/test');

for(const count of [3,7,10,14])test(`日付カードのスクロール保持 ${count}日開催`,async({page,browserName})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navEventResults')).toBeVisible();
  await page.evaluate(count=>{
    const st=allStores.stores[allStores.current];
    st.events=st.events||[];st.hourlyCustomers=st.hourlyCustomers||{};
    for(const title of ['スクロール確認','切替先'])st.events.push({
      id:title,type:'nearby',scope:'store',startDate:'2026-09-01',endDate:`2026-09-${String(count).padStart(2,'0')}`,
      snapshot:{version:1,title,location:'スクロール会場',resultCategoryIds:[]}
    });
    for(let day=1;day<=count;day++)st.hourlyCustomers[`2026-09-${String(day).padStart(2,'0')}`]=Array(24).fill(day);
    InsightEventResults.render();
  },count);
  const saved=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  await page.locator('#navEventResults').click();
  await page.locator('#erLocation').selectOption({label:'スクロール会場'});
  await page.locator('#erEvent').selectOption({label:'スクロール確認'});
  await page.locator('.er-occurrence').first().click();
  const tabs=page.locator('.er-day-tabs');
  await expect(tabs.locator('.er-day-tab')).toHaveCount(count);
  for(const day of count>=7?[7,...(count>=8?[8]:[]),count]:[2,3]){
    const button=tabs.locator('.er-day-tab').nth(day-1);
    // Scroll first so Playwright's click cannot hide a reset by auto-scrolling.
    await button.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
    const before=await tabs.evaluate(el=>el.scrollLeft);
    if(count>=7)expect(before).toBeGreaterThan(0);
    await button.click();
    await expect(tabs.locator('.active')).toHaveAttribute('data-date',`2026-09-${String(day).padStart(2,'0')}`);
    const after=await tabs.evaluate(el=>{
      const viewport=el.getBoundingClientRect(),active=el.querySelector('.active').getBoundingClientRect();
      return {left:el.scrollLeft,visible:active.left>=viewport.left-1&&active.right<=viewport.right+1};
    });
    expect(Math.abs(after.left-before)).toBeLessThanOrEqual(1);
    expect(after.visible).toBe(true);
    await expect(page.locator('.er-hour-plot').first()).toHaveAttribute('aria-label',`0時台 ${day}人`);
  }
  await page.locator('#erEvent').selectOption({label:'切替先'});
  await page.locator('.er-occurrence').first().click();
  expect(await tabs.evaluate(el=>el.scrollLeft)).toBe(0);
  await expect(tabs.locator('.active')).toHaveAttribute('data-date','2026-09-01');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(saved);
  expect(errors).toEqual([]);
});
