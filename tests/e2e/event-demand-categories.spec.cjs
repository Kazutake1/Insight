const {test,expect}=require('@playwright/test');

for(const count of [1,2,3,4])for(const theme of ['light','dark'])for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
  test(`特需カテゴリー ${count}個 ${theme} iPad ${viewport.width}`,async({page,browserName},testInfo)=>{
    await page.setViewportSize(viewport);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // The local server uses HTTP; production Pages uses HTTPS.
    if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
    });
    await page.goto('/Index.html' ,{waitUntil:'domcontentloaded'});
    await expect(page.locator('#nav1')).toBeVisible();
    await page.waitForFunction(()=>window.InsightEventResults&&window.InsightDarkTheme&&window.InsightSalesCount&&window.InsightSaleResults&&window.InsightSettings);
    await expect(page.locator('#navEventResults')).toBeVisible();
    await page.waitForFunction(()=>window.InsightEventResults&&window.InsightDarkTheme);
    await page.evaluate(({count,theme})=>{
      document.documentElement.classList.toggle('dark',theme==='dark');document.body.classList.toggle('dark',theme==='dark');
      const products=[];
      for(let i=0;i<18;i++)products.push({id:'d'+i,name:i===0?'長い商品名・季節限定の特需商品ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789':'商品'+i,category:'カテゴリー1',prepared:i===1?0:60,sold:i===1?0:52});
      // Interleaved input must be grouped, without distributing products across columns.
      for(let c=1;c<count;c++)products.splice(c,0,{id:'extra'+c,name:'別カテゴリー商品'+c,category:c===3?'':'カテゴリー'+(c+1),prepared:null,sold:null});
      allStores.stores[allStores.current].events=allStores.stores[allStores.current].events||[];
      allStores.stores[allStores.current].events.push(
        {id:'demand_layout_old',type:'nearby',scope:'store',startDate:'2025-09-10',endDate:'2025-09-10',snapshot:{version:1,title:'表示検証',location:'検証会場',specialDemand:[{id:'d0',name:products[0].name,prepared:50,sold:45}]}},
        {id:'demand_layout_new',type:'nearby',scope:'store',startDate:'2026-09-10',endDate:'2026-09-10',snapshot:{version:1,title:'表示検証',location:'検証会場',specialDemand:products}}
      );
      window.InsightEventResults.render();
    },{count,theme});
    await page.locator('#navEventResults').click();
    await page.locator('#erLocation').selectOption({label:'検証会場'});
    await page.locator('#erEvent').selectOption({label:'表示検証'});
    await page.locator('.er-occurrence').first().click();
    if(count===4)await page.locator('.er-demand-section').screenshot({path:testInfo.outputPath(`demand-${theme}-${viewport.width}.png`)});
    const before=await page.evaluate(()=>({events:JSON.stringify(allStores.stores[allStores.current].events),saved:localStorage.getItem('insight_v11')}));
    const categories=page.locator('.er-demand-category');
    await expect(categories).toHaveCount(count);
    await expect(categories.locator('h3')).toHaveText(['カテゴリー1','カテゴリー2','カテゴリー3','未分類'].slice(0,count));
    await expect(categories.first().locator('.er-demand-row')).toHaveCount(18);
    await expect(page.locator('.er-demand-row')).toHaveCount(18+count-1);
    await expect(categories.first().locator('.er-demand-name')).toHaveText([ '長い商品名・季節限定の特需商品ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',...Array.from({length:17},(_,i)=>'商品'+(i+1))]);
    await expect(categories.first().locator('.er-demand-previous').first()).toHaveText('前回：用意 50　販売 45　消化率 90.0%');
    await expect(categories.first().locator('.er-demand-row').nth(1).locator('td')).toHaveText(['0','0','—']);
    if(count>1)await expect(categories.nth(1).locator('td')).toHaveText(['—','—','—']);
    const layout=await page.locator('.er-demand-scroll').evaluate(el=>{
      const rect=el.getBoundingClientRect(),groups=[...el.children].map(g=>g.getBoundingClientRect());
      const list=el.querySelector('.er-demand-category-scroll');
      return {width:el.clientWidth,groupWidth:groups[0].width,top:groups.map(g=>g.top),left:groups.map(g=>g.left),right:groups.map(g=>g.right),overflow:el.scrollWidth-el.clientWidth,
        height:list.getBoundingClientRect().height,vertical:list.scrollHeight-list.clientHeight,
        clipped:[...el.querySelectorAll('th,td,.er-demand-name,.er-demand-previous')].some(n=>n.scrollWidth>n.clientWidth+1),
        pageOverflow:document.querySelector('#pageEventResults').scrollWidth-document.querySelector('#pageEventResults').clientWidth};
    });
    expect(layout.groupWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.groupWidth).toBeGreaterThanOrEqual(310);
    expect(layout.height).toBeLessThanOrEqual(400);
    expect(layout.vertical).toBeGreaterThan(0);
    expect(layout.clipped).toBe(false);
    expect(layout.pageOverflow).toBeLessThanOrEqual(1);
    if(viewport.width===1194){
      expect(layout.groupWidth).toBeLessThan(layout.width*.55);
      if(count>=2)expect(layout.right[1]-layout.left[0]).toBeLessThanOrEqual(layout.width+1);
    }
    for(let c=1;c<count;c++){
      expect(layout.top[c]).toBeCloseTo(layout.top[0],0);
      expect(layout.left[c]).toBeGreaterThan(layout.left[c-1]);
      const small=await categories.nth(c).locator('.er-demand-category-scroll').evaluate(el=>el.scrollHeight-el.clientHeight);
      expect(small).toBeLessThanOrEqual(1);
    }
    if(count>=3){
      expect(layout.overflow).toBeGreaterThan(0);
      const bounds=await page.locator('.er-demand-scroll').boundingBox();
      await page.mouse.move(bounds.x+bounds.width/2,bounds.y+20);
      await page.mouse.wheel(500,0);
      await expect.poll(()=>page.locator('.er-demand-scroll').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
      await page.locator('.er-demand-scroll').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
      const end=await page.locator('.er-demand-scroll').evaluate(el=>({left:el.scrollLeft,lastRight:el.lastElementChild.getBoundingClientRect().right,right:el.getBoundingClientRect().right}));
      expect(end.left).toBeGreaterThan(0);expect(end.lastRight).toBeLessThanOrEqual(end.right+1);
      await expect(categories.last().locator('.er-demand-name')).toHaveText('別カテゴリー商品'+(count-1));
    }
    const first=categories.first().locator('.er-demand-category-scroll');
    await first.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const scrolled=await first.evaluate(el=>({top:el.scrollTop,head:el.querySelector('thead th').getBoundingClientRect().top,region:el.getBoundingClientRect().top,last:el.querySelector('tbody tr:last-child').getBoundingClientRect().bottom,bottom:el.getBoundingClientRect().bottom}));
    expect(scrolled.top).toBeGreaterThan(0);expect(Math.abs(scrolled.head-scrolled.region)).toBeLessThanOrEqual(2);expect(scrolled.last).toBeLessThanOrEqual(scrolled.bottom+1);
    expect(await page.evaluate(()=>({events:JSON.stringify(allStores.stores[allStores.current].events),saved:localStorage.getItem('insight_v11')}))).toEqual(before);
    expect(await page.evaluate(()=>InsightDarkTheme.isDark())).toBe(theme==='dark');
    expect(errors).toEqual([]);
  });
}


test('過去便の推定・手動確定はセール実績と単日／複数日イベント実績に同じように反映する',async({page,browserName})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightSaleResults&&window.InsightEventResults&&window.InsightTripHistoryResolver);
  const setup=await page.evaluate(()=>{
    const storeId=allStores.current,store=allStores.stores[storeId];
    const category=allStores.salesCountManagement.categories.find(item=>!item.hidden);
    category.activeTrips=[false,false,true]; // Current settings are deliberately opposite historical evidence.
    store.salesCounts={};
    for(let d=1;d<=20;d++){
      const date='2026-09-'+String(d).padStart(2,'0');
      store.salesCounts[date]={[category.id]:{trips:[
        {delivery:d===15?0:10,sales:d===15?0:8},
        {delivery:20,sales:18},
        {delivery:null,sales:null}
      ]}};
    }
    delete store.tripHistoryOverrides;
    store.events=[
      {id:'historical_trip_event_period',type:'special',scope:'store',startDate:'2026-09-15',endDate:'2026-09-16',
        snapshot:{version:1,title:'歴史便・複数日催事'}},
      {id:'historical_trip_event_single',type:'special',scope:'store',startDate:'2026-09-20',endDate:'2026-09-20',
        snapshot:{version:1,title:'歴史便・単日催事'}}
    ];
    allStores.eventManagement=allStores.eventManagement||{version:1,presets:[],events:[]};
    allStores.eventManagement.events=[
      {id:'historical_trip_sale',type:'sale',scope:'global',startDate:'2026-09-15',endDate:'2026-09-16',
        snapshot:{title:'歴史便検証セール',sale:{categoryId:category.id,category:category.name,
          method:'amount',params:{amount:20}}}}
    ];
    return {storeId,categoryId:category.id,saved:localStorage.getItem('insight_v11')};
  });
  await page.locator('#navSaleResults').click();
  const saleCard=page.locator('#srGroups .sc-day').filter({has:page.locator('.sc-day-num')}).first();
  await expect.poll(()=>saleCard.locator('.sc-delivery-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','20','ー']);
  await expect.poll(()=>saleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','ー']);
  await expect(saleCard.locator('.sc-total-sales')).toHaveText('18');
  await expect(page.locator('#srGroups .sr-stat').nth(1)).toContainText('平均販売');

  await page.evaluate(({storeId,categoryId})=>{
    allStores.stores[storeId].tripHistoryOverrides={version:1,categories:{
      [categoryId]:{'2026-09':{'3':'active'}}
    }};
    InsightSaleResults.render();
  },setup);
  await expect.poll(()=>saleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','']);
  await expect(saleCard.locator('.sc-total-sales')).toHaveText('—');
  await expect(page.locator('#srGroups .sr-stat').nth(1).locator('strong')).toHaveText('—');

  await page.evaluate(({storeId,categoryId})=>{
    allStores.stores[storeId].tripHistoryOverrides.categories[categoryId]['2026-09']['3']='inactive';
    InsightSaleResults.render();
  },setup);
  await expect.poll(()=>saleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','ー']);
  await expect(saleCard.locator('.sc-total-sales')).toHaveText('18');

  await page.locator('#navEventResults').click();
  await page.locator('.er-kind-btn[data-kind="special"]').click();
  await page.locator('#erEvent').selectOption({label:'歴史便・複数日催事'});
  await page.locator('.er-occurrence').first().click();
  const periodCard=page.locator('.er-period-day-grid .sc-day').first();
  await expect.poll(()=>periodCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','ー']);
  await expect(periodCard.locator('.sc-total-sales')).toHaveText('18');
  await expect(page.locator('.er-overview-grid .er-overview-title')).toHaveText(['売上','客数']);

  await page.locator('.er-back').click();
  await page.locator('#erEvent').selectOption({label:'歴史便・単日催事'});
  await page.locator('.er-occurrence').first().click();
  const singleCard=page.locator('.er-category-grid .sc-day').first();
  await expect.poll(()=>singleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['8','18','ー']);
  await expect(singleCard.locator('.sc-total-sales')).toHaveText('26');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(setup.saved);
  expect(errors).toEqual([]);
});


test('セール実績の通常日比は店舗・全店イベントと別カテゴリーのセール日を除外する',async({page,browserName})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightSaleResults&&window.InsightEvents&&window.InsightSalesCount);
  const fixture=await page.evaluate(()=>{
    const storeId=allStores.current,store=allStores.stores[storeId];
    const categories=allStores.salesCountManagement.categories;
    const food=categories.find(item=>!item.hidden),other=categories.find(item=>item.id!==food.id);
    food.activeTrips=[true,true,true];
    store.salesCounts={};store.events=[];
    const row=n=>({trips:Array.from({length:3},()=>({delivery:n,sales:n}))});
    [['2026-09-01',100],['2026-09-08',40],['2026-09-15',30],
     ['2026-09-22',10],['2026-09-29',70]].forEach(([date,value])=>{
      store.salesCounts[date]={[food.id]:row(value)};
    });
    const event=(id,type,scope,date,title,sale)=>({
      id,type,scope,startDate:date,endDate:date,
      snapshot:Object.assign({version:1,title},sale?{sale}:{})
    });
    allStores.eventManagement=allStores.eventManagement||{version:1,presets:[],events:[]};
    allStores.eventManagement.events=[
      event('sr_normal_target','sale','global','2026-09-15','対象セール',
        {categoryId:food.id,category:food.name,method:'amount',params:{amount:20}}),
      event('sr_normal_other','sale','global','2026-09-01','別カテゴリーセール',
        {categoryId:other.id,category:other.name,method:'amount',params:{amount:10}}),
      event('sr_normal_campaign','campaign','global','2026-09-29','全店キャンペーン')
    ];
    store.events=[event('sr_normal_nearby','nearby','store','2026-09-08','近隣イベント')];
    return {storeId,categoryId:food.id,storage:localStorage.getItem('insight_v11')};
  });
  await page.locator('#navSaleResults').click();
  await page.locator('#srCategory').selectOption(fixture.categoryId);
  const line=page.locator('#srListBody tr').first();
  await expect(line.locator('td').nth(6)).toHaveText('+200.0%');
  await expect(line.locator('td').nth(7)).toHaveText('同曜日 1日');
  await expect(line.locator('td').nth(5)).toHaveText('100%');

  await page.evaluate(({storeId})=>{
    allStores.eventManagement.events=allStores.eventManagement.events.filter(item=>item.id==='sr_normal_target');
    allStores.stores[storeId].events=[];
    InsightSaleResults.render();
  },fixture);
  await expect(line.locator('td').nth(6)).toHaveText('-45.5%');
  await expect(line.locator('td').nth(7)).toHaveText('同曜日 4日');
  await expect(line.locator('td').nth(5)).toHaveText('100%');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(fixture.storage);
  expect(errors).toEqual([]);
});
