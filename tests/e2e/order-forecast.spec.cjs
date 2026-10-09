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
    else {calls++;const start=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const times=Array.from({length:7},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10)+'T00:00:00+09:00');json=[{reportDatetime:start+'T17:00:00+09:00',timeSeries:[{timeDefines:times,areas:[{area:{code:'230010',name:'西部'},weatherCodes:times.map((_,i)=>['100','101','112','200','202','300','400'][i]),pops:times.map(()=> '20')}]},{timeDefines:times,areas:[{area:{code:'51106',name:'名古屋'},tempsMin:times.map(()=> '18'),tempsMax:times.map(()=> '28')}]}]}];}
    await route.fulfill({json});
  });
  await page.goto('/Index.html');await page.waitForFunction(()=>document.getElementById('navOrderForecast'));
  await page.evaluate(()=>{
    gotoNav(1); // Initialize existing dashboard defaults before the protection baseline.
    const id=allStores.current,base=allStores.stores[id];
    base.weatherLocation={name:'稲沢市',admin1:'愛知県',latitude:35.25,longitude:136.8};
    const cat=allStores.salesCountManagement.categories[0];cat.activeTrips=[true,false,true];
    const make=(value)=>({trips:[{delivery:value,sales:value},{delivery:100,sales:100},{delivery:null,sales:null}]});
    base.data=base.data||{};base.data['2026']=base.data['2026']||{};base.data['2026']['10月']=base.data['2026']['10月']||[];base.data['2026']['10月'][10]=Object.assign({},base.data['2026']['10月'][10],{d:'11',weather:'雨',tempMaxC:25.9,tempMinC:15.2});
    base.salesCounts={};for(const date of ['2026-10-11','2026-10-12','2026-10-15','2026-10-16','2026-10-17','2026-09-20','2026-09-27','2026-10-04'])base.salesCounts[date]={[cat.id]:make(date==='2026-10-11'?0:date==='2026-10-12'?null:12)};
    const date='2026-10-11';
    allStores.eventManagement=allStores.eventManagement||{version:1,presets:[],events:[]};
    allStores.eventManagement.events=(allStores.eventManagement.events||[]).filter(e=>!String(e.id||'').startsWith('of_e2e_'));
    allStores.eventManagement.events.push(
      {id:'of_e2e_sale1',type:'sale',scope:'global',startDate:date,endDate:date,snapshot:{title:'おにぎりセール',sale:{method:'amount',params:{amount:20}}}},
      {id:'of_e2e_sale2',type:'sale',scope:'global',startDate:date,endDate:date,snapshot:{title:'サンドイッチ2個割引'}}
    );
    base.events=(base.events||[]).filter(e=>!String(e.id||'').startsWith('of_e2e_'));
    base.events.push(
      {id:'of_e2e_nearby',type:'nearby',scope:'store',startDate:date,endDate:date,snapshot:{title:'秋まつり'}},
      {id:'of_e2e_special',type:'special',scope:'store',startDate:date,endDate:date,snapshot:{title:'創業記念日'}}
    );
    allStores.stores.ofTestStore=JSON.parse(JSON.stringify(base));allStores.stores.ofTestStore.name='テスト店舗';allStores.stores.ofTestStore.events=[{id:'of_e2e_second_only',type:'nearby',scope:'store',startDate:'2026-10-11',endDate:'2026-10-11',snapshot:{title:'テスト店舗限定のお祭り'}},{id:'of_e2e_single_only',type:'nearby',scope:'store',startDate:'2026-10-12',endDate:'2026-10-12',snapshot:{title:'単独イベント'}}];allStores.stores.ofTestStore.salesCounts['2026-10-11'][cat.id].trips[0].delivery=42;allStores.stores.ofTestStore.data['2026']['10月'][10]=Object.assign({},allStores.stores.ofTestStore.data['2026']['10月'][10],{weather:'晴',tempMaxC:23.3,tempMinC:14.8});renderStoreSel();
    window.__ofBefore=JSON.stringify(allStores);window.__ofStored=localStorage.getItem('insight_v11');
  });
  return {errors,calls:()=>calls};
}
test('発注予測は閲覧専用・実績と平均・店舗カテゴリー切替・選択維持・保存保護',async({page})=>{
  const result=await open(page);await page.setViewportSize({width:1194,height:834});
  await page.locator('#navOrderForecast').click();await expect(page.locator('#pageOrderForecast')).toHaveClass(/show/);
  const initial=await page.evaluate(()=>InsightOrderForecast.addDays(InsightOrderForecast.today(),2));await expect(page.locator('#ofDelivery')).toHaveValue(initial);
  await page.locator('#ofDelivery').fill('2026-10-11');await page.locator('#ofDelivery').dispatchEvent('change');await expect(page.locator('#ofSchedule')).toHaveCount(0);
  await expect(page.locator('#ofWeather .sc-day')).toHaveCount(7);await expect(page.locator('#ofWeather .of-selected')).toHaveCount(1);const dimensions=await page.locator('#ofWeather .of-weather-card').first().evaluate(card=>{const cardRect=card.getBoundingClientRect(),iconRect=card.querySelector('.of-weather-symbol').getBoundingClientRect();return {height:cardRect.height,iconWidth:iconRect.width,iconHeight:iconRect.height,iconInside:iconRect.bottom<=cardRect.bottom&&iconRect.top>=cardRect.top};});expect(dimensions.height).toBeGreaterThanOrEqual(145);expect(dimensions.height).toBeLessThanOrEqual(160);expect(dimensions.iconWidth).toBeGreaterThanOrEqual(34);expect(dimensions.iconHeight).toBeGreaterThanOrEqual(34);expect(dimensions.iconInside).toBe(true);await expect(page.locator('#ofWeather .of-temp-max')).toHaveCount(7);await expect(page.locator('#ofWeather .of-temp-min')).toHaveCount(7);await expect(page.locator('#ofWeather .of-weather-symbol')).toHaveCount(7);await expect(page.locator('#ofWeather .of-weather-symbol[aria-hidden="true"]')).toHaveCount(7);await expect(page.locator('#ofWeatherStatus')).toBeHidden();await expect(page.locator('#ofWeather .of-weather-card small').first()).toContainText('降水');await expect(page.locator('#ofWeather a.of-source')).toHaveCount(0);await expect(page.locator('.of-source-description')).toBeHidden();await page.locator('.of-source-info summary').click();await expect(page.locator('.of-source-description')).toBeVisible();await expect(page.locator('.of-source-description')).toContainText('気象庁ホームページ');await page.locator('.of-source-info summary').click();await expect(page.locator('.of-source-description')).toBeHidden();
  await page.locator('#ofDelivery').fill('2026-10-18');await page.locator('#ofDelivery').dispatchEvent('change');
  await expect(page.locator('#ofYearCards .sc-day')).toHaveCount(7);await expect(page.locator('#ofWeekCards .sc-day')).toHaveCount(5);await expect(page.locator('#ofRecentCards .sc-day')).toHaveCount(2);
  await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-delivery-row input').first()).toHaveValue('0');await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-history-weather')).toContainText('25°');await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-history-icon')).toHaveText('🌧️');
  const historic=page.locator('#ofRecentCards [data-date="2026-10-11"]');
  await expect(historic.locator('.of-event-trigger')).toHaveText(['セール','イベント']);
  const eventFit=await historic.evaluate(card=>{
    const bounds=card.getBoundingClientRect(),buttons=Array.from(card.querySelectorAll('.of-event-trigger'));
    return {overflow:card.scrollHeight-card.clientHeight,buttons:buttons.map(button=>{const rect=button.getBoundingClientRect();return {left:rect.left-bounds.left,right:bounds.right-rect.right,bottom:bounds.bottom-rect.bottom,top:rect.top,width:rect.width,absoluteRight:rect.right,absoluteLeft:rect.left};})};
  });
  expect(eventFit.overflow).toBeLessThanOrEqual(1);
  for(const bounds of eventFit.buttons){expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeGreaterThanOrEqual(0);expect(bounds.bottom).toBeGreaterThanOrEqual(5);}
  expect(eventFit.buttons).toHaveLength(2);
  expect(Math.abs(eventFit.buttons[0].top-eventFit.buttons[1].top)).toBeLessThanOrEqual(1);
  expect(eventFit.buttons[0].absoluteRight).toBeLessThanOrEqual(eventFit.buttons[1].absoluteLeft+1);
  await historic.locator('.of-event-trigger').filter({hasText:'セール'}).click();
  await expect(page.locator('#ofEventDialog')).toBeVisible();
  await expect(page.locator('#ofEventDialogTitle')).toContainText('セール');
  const checkCentered=async()=>{
    const position=await page.locator('#ofEventDialog').evaluate(dialog=>{
      const box=dialog.getBoundingClientRect();
      return {x:box.left+box.width/2,y:box.top+box.height/2,
        viewportWidth:document.documentElement.clientWidth,viewportHeight:window.innerHeight,
        computedPosition:getComputedStyle(dialog).position};
    });
    expect(position.computedPosition).toBe('fixed');
    expect(Math.abs(position.x-position.viewportWidth/2)).toBeLessThanOrEqual(3);
    expect(Math.abs(position.y-position.viewportHeight/2)).toBeLessThanOrEqual(3);
  };
  await checkCentered();
  await expect(page.locator('#ofEventDialog .of-event-dialog-list li')).toHaveText(['おにぎりセール','サンドイッチ2個割引']);
  await page.locator('.of-event-dialog-close').click();
  await expect(page.locator('#ofEventDialog')).toBeHidden();
  await historic.locator('.of-event-trigger').filter({hasText:'イベント'}).click();
  await expect(page.locator('#ofEventDialog .of-event-dialog-list li')).toHaveText(['秋まつり','創業記念日']);
  await checkCentered();
  await page.setViewportSize({width:768,height:1024});
  await checkCentered();
  const portraitButtons=await historic.locator('.of-event-trigger').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:b.scrollWidth,clientWidth:b.clientWidth};}));
  expect(portraitButtons).toHaveLength(2);
  expect(Math.abs(portraitButtons[0].top-portraitButtons[1].top)).toBeLessThanOrEqual(1);
  expect(portraitButtons[0].right).toBeLessThanOrEqual(portraitButtons[1].left+1);
  expect(portraitButtons.every(b=>b.scrollWidth<=b.clientWidth+1)).toBe(true);
  await page.setViewportSize({width:1194,height:834});
  await page.keyboard.press('Escape');
  await expect(page.locator('#ofEventDialog')).toBeHidden();
  await expect(page.locator('#ofRecentCards [data-date="2026-10-16"]')).toHaveCount(0);await expect(page.locator('#ofRecentCards [data-date="2026-10-17"]')).toHaveCount(0);
  const averageTone=await page.locator('#ofWeekCards .sc-average-card').evaluate(card=>({
    average:getComputedStyle(card).backgroundColor,
    expected:getComputedStyle(card).getPropertyValue('--surface2').trim(),
    normal:getComputedStyle(card.parentElement.querySelector('.sc-day:not(.sc-average-card)')).backgroundColor
  }));
  expect(averageTone.average).not.toBe(averageTone.normal);
  await expect(page.locator('#ofWeekCards .sc-average-card .sc-delivery-row input').first()).toHaveValue('9');await expect(page.locator('#ofWeekCards .sc-average-card .sc-delivery-row input').nth(1)).toHaveValue('ー');
  expect(await page.locator('#pageOrderForecast .sc-trip input').evaluateAll(inputs=>inputs.every(i=>i.readOnly))).toBe(true);
  const widths=await page.evaluate(()=>({year:document.querySelector('#ofYearCards .sc-day').getBoundingClientRect().width,week:document.querySelector('#ofWeekCards .sc-day').getBoundingClientRect().width,recent:document.querySelector('#ofRecentCards .sc-day').getBoundingClientRect().width,right:document.querySelector('#ofYearCards .sc-day:last-child').getBoundingClientRect().right,page:document.querySelector('#pageOrderForecast').getBoundingClientRect().right}));
  expect(Math.abs(widths.year-widths.week)).toBeLessThan(1);expect(Math.abs(widths.year-widths.recent)).toBeLessThan(1);expect(widths.right).toBeLessThanOrEqual(widths.page);
  await expect(page.locator('#ofStore')).toHaveCount(0);await page.locator('#storeSel').selectOption('ofTestStore');await expect(page.locator('#storeSel')).toHaveValue('ofTestStore');await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-delivery-row input').first()).toHaveValue('42');await expect(page.locator('#ofRecentCards [data-date="2026-10-11"] .sc-history-icon')).toHaveText('🌤️');
  const singleAction=page.locator('#ofRecentCards [data-date="2026-10-12"] .of-event-actions');
  await expect(singleAction.locator('.of-event-trigger')).toHaveCount(1);
  const singleFit=await singleAction.evaluate(action=>({container:action.getBoundingClientRect().width,button:action.querySelector('button').getBoundingClientRect().width}));
  expect(Math.abs(singleFit.container-singleFit.button)).toBeLessThanOrEqual(1);
  await page.locator('#ofRecentCards [data-date="2026-10-11"] .of-event-trigger').filter({hasText:'イベント'}).click();
  await expect(page.locator('#ofEventDialog .of-event-dialog-list li')).toHaveText(['テスト店舗限定のお祭り']);
  await page.locator('.of-event-dialog-close').click();
  const cats=await page.locator('#ofCategory option').evaluateAll(nodes=>nodes.map(n=>n.value));await page.locator('#ofCategory').selectOption(cats[1]);await expect(page.locator('#ofRecentCards .sc-day')).toHaveCount(0);
  await page.locator('#nav1').click();await expect(page.locator('#pageOrderForecast')).not.toHaveClass(/show/);await expect(page.locator('#pageDash')).toHaveClass(/show/);
  await page.locator('#navOrderForecast').click();await expect(page.locator('#ofDelivery')).toHaveValue('2026-10-18');await expect(page.locator('#ofCategory')).toHaveValue(cats[1]);await expect(page.locator('#storeSel')).toHaveValue('ofTestStore');
  const protection=await page.evaluate(()=>{const before=JSON.parse(window.__ofBefore),stored=JSON.parse(localStorage.getItem('insight_v11'));before.current='ofTestStore';return {memory:JSON.stringify(allStores)===JSON.stringify(before),storage:JSON.stringify(stored)===JSON.stringify(allStores)};});expect(protection).toEqual({memory:true,storage:true});expect(result.errors).toEqual([]);
});
test('予報の更新連打を抑えライト/ダーク双方で選択日を強調する',async({page})=>{
  const result=await open(page);await page.locator('#navOrderForecast').click();await expect(page.locator('#ofWeather .sc-day')).toHaveCount(7);const symbols=await page.locator('#ofWeather .of-weather-card').evaluateAll(cards=>cards.map(card=>card.querySelector('svg')&&card.querySelector('svg').querySelectorAll('path,circle,line').length));expect(symbols.every(count=>count>0)).toBe(true);
  await expect(page.locator('#ofRefresh')).toBeEnabled();const before=result.calls();await page.locator('#ofRefresh').click();await expect(page.locator('#ofRefresh')).toBeEnabled();expect(result.calls()).toBe(before);
  const dayColors=await page.locator('#ofWeather .of-weather-card').evaluateAll(cards=>cards.map(c=>({date:c.dataset.date,cls:c.querySelector('.sc-day-num').className})));expect(dayColors.some(x=>x.cls.includes('sun'))).toBe(true);expect(dayColors.some(x=>x.cls.includes('sat'))).toBe(true);
  const temperatureColors=await page.locator('#ofWeather .of-weather-card').first().evaluate(card=>({max:getComputedStyle(card.querySelector('.of-temp-max')).color,min:getComputedStyle(card.querySelector('.of-temp-min')).color}));expect(temperatureColors.max).not.toBe(temperatureColors.min);
  for(const dark of [false,true]){await page.evaluate(d=>{document.documentElement.classList.toggle('dark',d);document.body.classList.toggle('dark',d);},dark);const colors=await page.locator('#ofWeather .of-selected').evaluate(n=>{const s=getComputedStyle(n);return {outline:s.outlineColor,background:s.backgroundColor};});expect(colors.outline).not.toBe(colors.background);}
  expect(result.errors).toEqual([]);
});
test('予報通信エラーでも実績は表示し未保存入力の離脱確認を維持する',async({page})=>{
  const result=await open(page,true);await page.locator('#navSalesCount').click();await page.locator('#scCalendar input:not([readonly])').first().fill('5');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#navOrderForecast').click();await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);await expect(page.locator('#pageOrderForecast')).not.toHaveClass(/show/);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#navOrderForecast').click();await expect(page.locator('#ofWeatherStatus')).toContainText('取得できません');await expect(page.locator('#ofWeatherStatus')).toBeVisible();await expect(page.locator('#ofYearCards .sc-day')).toHaveCount(7);await expect(page.locator('#ofRefresh')).toBeEnabled();expect(result.errors).toEqual([]);
});
