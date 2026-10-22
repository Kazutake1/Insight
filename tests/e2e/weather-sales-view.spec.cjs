const {test,expect}=require('@playwright/test');

test('販売傾向の確認：期間選択・画面配置・既存保存データの保護',async({page})=>{
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect.poll(()=>page.evaluate(()=>!!(window.InsightWeatherSalesTrends&&window.InsightWeatherSalesView))).toBe(true);
  await page.locator('#navSettings').click();
  await expect(page.locator('#insightWeatherSalesViewButton')).toBeVisible();
  const before=await page.evaluate(()=>({
    snapshot:JSON.stringify(allStores),saved:localStorage.getItem('insight_v11')
  }));
  page.on('request',request=>{
    if(new URL(request.url()).origin!==new URL(page.url()).origin)external.push(request.url());
  });
  await page.locator('#insightWeatherSalesViewButton').click();
  const overlay=page.locator('#insightWeatherSalesViewOverlay');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#iwsvHeading')).toHaveText('販売傾向の確認');
  await expect(page.locator('#iwsvDays option')).toHaveCount(3);
  await expect(page.locator('#iwsvStore option')).not.toHaveCount(0);
  for(const days of ['84','168','366']){
    await page.locator('#iwsvDays').selectOption(days);
    await expect(page.locator('#iwsvDays')).toHaveValue(days);
  }
  for(const size of [{width:1194,height:834},{width:834,height:1194}]){
    await page.setViewportSize(size);
    const r=await page.locator('.iwsv-dialog').evaluate(node=>{
      const rect=node.getBoundingClientRect();
      return {left:rect.left,right:rect.right,width:innerWidth,overflow:node.scrollWidth-node.clientWidth};
    });
    expect(r.left).toBeGreaterThanOrEqual(-1);
    expect(r.right).toBeLessThanOrEqual(r.width+1);
    expect(r.overflow).toBeLessThanOrEqual(2);
  }
  await page.locator('.iwsv-dialog .ipdh-close').click();
  await expect(overlay).toBeHidden();
  expect(await page.evaluate(()=>({
    snapshot:JSON.stringify(allStores),saved:localStorage.getItem('insight_v11')
  }))).toEqual(before);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('同曜日の条件別平均と基準0、データ不足を区別して表示する',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect.poll(()=>page.evaluate(()=>!!window.InsightWeatherSalesView)).toBe(true);
  await page.locator('#navSettings').click();
  await page.evaluate(()=>{
    window.InsightWeatherSalesTrends.analyze=(snapshot,options)=>({
      store:{id:options.storeId,name:snapshot.stores[options.storeId].name||options.storeId},
      period:{startDate:'2026-05-07',endDate:'2026-10-21',days:options.lookbackDays},
      categories:[{id:'onigiri',name:'おにぎり',hidden:false,trips:[
        {trip:1,eligibleDays:7,byCalendar:[{weekday:1,dayType:'weekday',
          weather:{cohorts:[
            {key:'晴',label:'晴',sampleCount:3,sufficient:true,meanSales:0},
            {key:'雨',label:'雨',sampleCount:3,sufficient:true,meanSales:12},
            {key:'曇',label:'曇',sampleCount:1,sufficient:false,meanSales:null}
          ],comparisons:[
            {leftKey:'晴',rightKey:'雨',difference:12,changePercent:null,status:'zero_baseline'},
            {leftKey:'晴',rightKey:'曇',status:'insufficient_samples'}
          ]},
          temperature:{cohorts:[{key:'20to30',label:'20℃以上30℃未満',
            sampleCount:3,sufficient:true,meanSales:0}],comparisons:[]}
        }]},
        {trip:2,eligibleDays:0,byCalendar:[]},{trip:3,eligibleDays:0,byCalendar:[]}
      ]}]
    });
  });
  await page.locator('#insightWeatherSalesViewButton').click();
  await expect(page.locator('#iwsvCategory')).toHaveValue('onigiri');
  await expect(page.locator('#iwsvWeekday option')).toContainText(['月曜日（通常平日）']);
  await expect(page.locator('.iwsv-details')).toContainText('0.0個');
  await expect(page.locator('.iwsv-details')).toContainText('—（3日未満）');
  await expect(page.locator('.iwsv-details')).toContainText('12.0個');
  await expect(page.locator('.iwsv-details')).toContainText('—（基準0）');
  await page.locator('#iwsvTrip').selectOption('2');
  await expect(page.locator('.iwsv-details')).toContainText('この曜日の有効データはありません。');
});
