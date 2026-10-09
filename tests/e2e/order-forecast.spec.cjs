const {test,expect}=require('@playwright/test');
async function open(page,failed=false){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/Index.html*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});});
  let calls=0;
  await page.route('https://www.jma.go.jp/bosai/**',async route=>{
    const url=route.request().url();
    if(failed){await route.fulfill({status:503,body:'unavailable'});return;}
    let json;
    if(url.endsWith('/area.json'))json={class20s:{'23220':{name:'稲沢市',parent:'230011'}},class15s:{'230011':{parent:'230010'}},class10s:{'230010':{name:'西部',parent:'230000'}},offices:{'230000':{name:'愛知県'}}};
    else if(url.endsWith('/amedastable.json'))json={'51106':{lat:[35,10],lon:[136,58]}};
    else {calls++;const start=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const times=Array.from({length:7},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10)+'T00:00:00+09:00');json=[{reportDatetime:start+'T17:00:00+09:00',timeSeries:[{timeDefines:times,areas:[{area:{code:'230010',name:'西部'},weatherCodes:times.map(()=> '101'),pops:times.map(()=> '20')}]},{timeDefines:times,areas:[{area:{code:'51106',name:'名古屋'},tempsMin:times.map(()=> '18'),tempsMax:times.map(()=> '28')}]}]}];}
    await route.fulfill({json});
  });
  await page.goto('/Index.html');await page.waitForFunction(()=>document.getElementById('navOrderForecast'));
  await page.evaluate(()=>{
    gotoNav(1); // Initialize existing dashboard defaults before the protection baseline.
    const id=allStores.current,base=allStores.stores[id];
    base.weatherLocation={name:'稲沢市',admin1:'愛知県',latitude:35.25,longitude:136.8};
    const cat=allStores.salesCountManagement.categories[0];cat.activeTrips=[true,false,true];
    const make=(value)=>({trips:[{delivery:value,sales:value},{delivery:100,sales:100},{delivery:null,sales:null}]});
    base.salesCounts={};for(const date of ['2026-10-11','2026-10-12','2026-10-15','2026-10-16','2026-10-17','2026-09-20','2026-09-27','2026-10-04'])base.salesCounts[date]={[cat.id]:make(date==='2026-10-11'?0:date==='2026-10-12'?null:12)};
    allStores.stores.ofTestStore=JSON.parse(JSON.stringify(base));allStores.stores.ofTestStore.name='テスト店舗';allStores.stores.ofTestStore.salesCounts['2026-10-11'][cat.id].trips[0].delivery=42;
    window.__ofBefore=JSON.stringify(allStores);window.__ofStored=localStorage.getItem('insight_v11');
  });
  return {errors,calls:()=>calls};
}
test('発注予測は閲覧専用・実績と平均・店舗カテゴリー切替・選択維持・保存保護',async({page})=>{
  const result=await open(page);await page.setViewportSize({width:1194,height:834});
  await page.locator('#navOrderForecast').click();await expect(page.locator('#pageOrderForecast')).toHaveClass(/show/);
  const initial=await page.evaluate(()=>InsightOrderForecast.addDays(InsightOrderForecast.today(),2));await expect(page.locator('#ofDelivery')).toHaveValue(initial);
  await expect(page.locator('#ofWeather .sc-day')).toHaveCount(7);await expect(page.locator('#ofWeather .of-selected')).toHaveCount(1);
  await page.locator('#ofDelivery').fill('2026-10-18');await page.locator('#ofDelivery').dispatchEvent('change');
  await expect(page.locator('#ofYearCards .sc-day')).toHaveCount(7);await expect(page.locator('#ofWeekCards .sc-day')).toHaveCount(5);await expect(page.locator('#ofRecentCards .sc-day')).toHaveCount(2);
  await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-delivery-row input').first()).toHaveValue('0');
  await expect(page.locator('#ofRecentCards [data-date="2026-10-16"]')).toHaveCount(0);await expect(page.locator('#ofRecentCards [data-date="2026-10-17"]')).toHaveCount(0);
  await expect(page.locator('#ofWeekCards .sc-average-card .sc-delivery-row input').first()).toHaveValue('9');await expect(page.locator('#ofWeekCards .sc-average-card .sc-delivery-row input').nth(1)).toHaveValue('ー');
  expect(await page.locator('#pageOrderForecast .sc-trip input').evaluateAll(inputs=>inputs.every(i=>i.readOnly))).toBe(true);
  const widths=await page.evaluate(()=>({year:document.querySelector('#ofYearCards .sc-day').getBoundingClientRect().width,week:document.querySelector('#ofWeekCards .sc-day').getBoundingClientRect().width,recent:document.querySelector('#ofRecentCards .sc-day').getBoundingClientRect().width,right:document.querySelector('#ofYearCards .sc-day:last-child').getBoundingClientRect().right,page:document.querySelector('#pageOrderForecast').getBoundingClientRect().right}));
  expect(Math.abs(widths.year-widths.week)).toBeLessThan(1);expect(Math.abs(widths.year-widths.recent)).toBeLessThan(1);expect(widths.right).toBeLessThanOrEqual(widths.page);
  await page.locator('#ofStore').selectOption('ofTestStore');await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-delivery-row input').first()).toHaveValue('42');
  const cats=await page.locator('#ofCategory option').evaluateAll(nodes=>nodes.map(n=>n.value));await page.locator('#ofCategory').selectOption(cats[1]);await expect(page.locator('#ofRecentCards .sc-day')).toHaveCount(0);
  await page.locator('#nav1').click();await expect(page.locator('#pageOrderForecast')).not.toHaveClass(/show/);await expect(page.locator('#pageDash')).toHaveClass(/show/);
  await page.locator('#navOrderForecast').click();await expect(page.locator('#ofDelivery')).toHaveValue('2026-10-18');await expect(page.locator('#ofCategory')).toHaveValue(cats[1]);await expect(page.locator('#ofStore')).toHaveValue('ofTestStore');
  const protection=await page.evaluate(()=>({memory:JSON.stringify(allStores)===window.__ofBefore,differences:(function diff(a,b,path){if(JSON.stringify(a)===JSON.stringify(b))return [];if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],path+'.'+k));return [path];})(JSON.parse(window.__ofBefore),allStores,'allStores'),storage:localStorage.getItem('insight_v11')===window.__ofStored}));expect(protection).toEqual({memory:true,differences:[],storage:true});expect(result.errors).toEqual([]);
});
test('予報の更新連打を抑えライト/ダーク双方で選択日を強調する',async({page})=>{
  const result=await open(page);await page.locator('#navOrderForecast').click();await expect(page.locator('#ofWeather .sc-day')).toHaveCount(7);
  await expect(page.locator('#ofRefresh')).toBeEnabled();const before=result.calls();await page.locator('#ofRefresh').click();await expect(page.locator('#ofRefresh')).toBeEnabled();expect(result.calls()).toBe(before);
  for(const dark of [false,true]){await page.evaluate(d=>{document.documentElement.classList.toggle('dark',d);document.body.classList.toggle('dark',d);},dark);const colors=await page.locator('#ofWeather .of-selected').evaluate(n=>{const s=getComputedStyle(n);return {outline:s.outlineColor,background:s.backgroundColor};});expect(colors.outline).not.toBe(colors.background);}
  expect(result.errors).toEqual([]);
});
test('予報通信エラーでも実績は表示し未保存入力の離脱確認を維持する',async({page})=>{
  const result=await open(page,true);await page.locator('#navSalesCount').click();await page.locator('#scCalendar input:not([readonly])').first().fill('5');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#navOrderForecast').click();await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);await expect(page.locator('#pageOrderForecast')).not.toHaveClass(/show/);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#navOrderForecast').click();await expect(page.locator('#ofWeatherStatus')).toContainText('取得できません');await expect(page.locator('#ofYearCards .sc-day')).toHaveCount(7);await expect(page.locator('#ofRefresh')).toBeEnabled();expect(result.errors).toEqual([]);
});
