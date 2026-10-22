const {test,expect}=require('@playwright/test');

test('天気選択肢の全11種類は独立したSVGで表示され選択も維持される',async({page,browserName})=>{
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  // Manual picker checks must not depend on live external weather API timing.
  // The deferred-response behavior is tested in weather_fetch_race.test.cjs.
  await page.route(/^https:\/\/(?:www\.jma\.go\.jp|api\.open-meteo\.com|historical-forecast-api\.open-meteo\.com)\//,route=>route.abort());
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
  const choices=['快晴','晴','晴曇','曇','小雨','雨','大雨','みぞれ','雪','大雪','雷雨'];
  // 天気名の文字数が変わっても気温欄と自動取得の位置は動かない。
  const layout=()=>page.evaluate(()=>{
    const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,width:r.width};};
    const trigger=document.querySelector('#qWeatherCompactTrigger');
    return {
      weather:rect('#qWeatherCompact'),
      temperature:rect('#qTemperatureInputs'),
      autoFetch:rect('#autoWxBtn'),
      triggerFits:trigger.scrollWidth<=trigger.clientWidth+1
    };
  });
  const initialLayout=await layout();
  expect(initialLayout.temperature.x).toBeGreaterThan(initialLayout.weather.right);
  expect(initialLayout.autoFetch.x).toBeGreaterThan(initialLayout.temperature.right);
  const icons=[];
  for(const weather of choices){
    const option=page.locator('#qWeatherCompactMenu .qwc-option[data-wx="'+weather+'"]');
    const svg=option.locator('svg.iwx-weather-svg');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('aria-label',weather);
    icons.push(await svg.evaluate(el=>el.outerHTML));
  }
  expect(new Set(icons).size).toBe(11);
  expect(icons[choices.indexOf('大雨')]).not.toContain('l-6 7');
  expect(icons[choices.indexOf('雷雨')]).toContain('l-6 7');
  for(const weather of choices){
    await page.locator('#qWeatherCompactMenu .qwc-option[data-wx="'+weather+'"]').click();
    await expect(trigger.locator('.qwc-label')).toHaveText(weather);
    await expect(trigger.locator('svg.iwx-weather-svg')).toBeVisible();
    const currentLayout=await layout();
    expect(currentLayout.triggerFits,'天気名が切れないこと: '+weather).toBe(true);
    for(const name of ['temperature','autoFetch']){
      expect(Math.abs(currentLayout[name].x-initialLayout[name].x),'横位置: '+weather+' '+name).toBeLessThanOrEqual(1);
      expect(Math.abs(currentLayout[name].y-initialLayout[name].y),'縦位置: '+weather+' '+name).toBeLessThanOrEqual(1);
    }
    await trigger.click();
    await expect(page.locator('#qWeatherCompactMenu .qwc-option[data-wx="'+weather+'"]')).toHaveClass(/active/);
  }
  expect(errors).toEqual([]);
});
