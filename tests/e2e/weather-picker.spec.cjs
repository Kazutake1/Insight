const {test,expect}=require('@playwright/test');

test('天気選択肢と大雨・雷雨・雪・大雪のSVGは明確に異なる',async({page,browserName})=>{
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#nav0').click();
  const trigger=page.locator('#qWeatherCompactTrigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const options=page.locator('#qWeatherCompactMenu .qwc-option');
  await expect(options).toHaveCount(11);
  await expect(page.locator('#qWeatherCompactMenu .qwc-option[data-wx="霧"]')).toHaveCount(0);
  await expect(page.locator('#qWeatherCompactMenu .qwc-option[data-wx="凍雨"]')).toHaveCount(0);
  const icons=[];
  for(const weather of ['大雨','雷雨','雪','大雪']){
    const option=page.locator('#qWeatherCompactMenu .qwc-option[data-wx="'+weather+'"]');
    const svg=option.locator('svg.iwx-weather-svg');
    await expect(svg).toBeVisible();
    icons.push(await svg.evaluate(el=>el.outerHTML));
  }
  expect(new Set(icons).size).toBe(4);
  expect(icons[0]).not.toContain('l-6 7');
  expect(icons[1]).toContain('l-6 7');
  await page.locator('#qWeatherCompactMenu .qwc-option[data-wx="大雪"]').click();
  await expect(trigger.locator('.qwc-label')).toHaveText('大雪');
  await expect(trigger.locator('svg.iwx-weather-svg')).toBeVisible();
  await trigger.click();
  await expect(page.locator('#qWeatherCompactMenu .qwc-option[data-wx="大雪"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});
