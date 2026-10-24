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
  await page.waitForFunction(()=>window.InsightSaleResults&&window.InsightEventResults&&window.InsightTripHistoryResolver&&typeof allStores!=='undefined'&&allStores?.salesCountManagement?.categories?.length&&typeof window.InsightEventResults.render==='function');
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
  await expect.poll(()=>saleCard.locator('.sc-delivery-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','20','／']);
  await expect.poll(()=>saleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','／']);
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
  await expect.poll(()=>saleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','／']);
  await expect(saleCard.locator('.sc-total-sales')).toHaveText('18');

  await page.locator('#navEventResults').click();
  await page.locator('.er-kind-btn[data-kind="special"]').click();
  await page.locator('#erEvent').selectOption({label:'歴史便・複数日催事'});
  await page.locator('.er-occurrence').first().click();
  const periodCard=page.locator('.er-period-day-grid .sc-day').first();
  await expect.poll(()=>periodCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['0','18','／']);
  await expect(periodCard.locator('.sc-total-sales')).toHaveText('18');
  await expect(page.locator('.er-overview-grid .er-overview-title')).toHaveText(['売上','客数']);

  await page.locator('.er-back').click();
  await page.locator('#erEvent').selectOption({label:'歴史便・単日催事'});
  await page.locator('.er-occurrence').first().click();
  const singleCard=page.locator('.er-category-grid .sc-day').first();
  await expect.poll(()=>singleCard.locator('.sc-sales-row input').evaluateAll(inputs=>inputs.map(i=>i.value))).toEqual(['8','18','／']);
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
  await page.waitForFunction(()=>window.InsightSaleResults&&window.InsightEvents&&window.InsightSalesCount&&typeof allStores!=='undefined'&&allStores?.salesCountManagement?.categories?.length);
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


test('近隣イベントは共通名で開催履歴を集約し補足の演者名・演目名を一覧と詳細に表示する',async({page,browserName})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightEventResults&&window.InsightAnalysisContext&&typeof allStores!=='undefined'&&allStores?.stores?.[allStores.current]&&typeof window.InsightEventResults.render==='function');
  const saved=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    const mk=(id,title,note,date)=>({
      id,type:'nearby',scope:'store',startDate:date,endDate:date,
      snapshot:{version:1,title,note,location:'検証用大ホール'}
    });
    store.events=store.events||[];
    store.events.push(
      mk('event_note_live_a','ライブ・コンサート','アーティストA\n全国ツアー','2026-09-20'),
      mk('event_note_live_b','ライブ・コンサート','アーティストB','2026-09-13'),
      mk('event_note_live_empty','ライブ・コンサート','  ','2026-09-06'),
      mk('event_note_stage','舞台・演劇','演目C','2026-09-27')
    );
    window.InsightEventResults.render();
    return localStorage.getItem('insight_v11');
  });
  await page.locator('#navEventResults').click();
  await page.locator('#erLocation').selectOption({label:'検証用大ホール'});
  await page.locator('#erEvent').selectOption({label:'ライブ・コンサート'});
  const rows=page.locator('.er-occurrence');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('.er-occurrence-note')).toHaveText('アーティストA\n全国ツアー');
  await expect(rows.nth(1).locator('.er-occurrence-note')).toHaveText('アーティストB');
  await expect(rows.nth(2).locator('.er-occurrence-note')).toHaveCount(0);
  await expect(rows.nth(0).locator('.er-occurrence-metrics')).toContainText('売上');
  await expect(rows.nth(0).locator('.er-occurrence-metrics')).toContainText('客数');
  await rows.nth(0).click();
  await expect(page.locator('.er-detail-title h2')).toHaveText('ライブ・コンサート');
  await expect(page.locator('.er-detail-note')).toHaveText('補足：アーティストA\n全国ツアー');
  await page.locator('.er-back').click();
  await rows.nth(2).click();
  await expect(page.locator('.er-detail-note')).toHaveCount(0);
  await page.locator('.er-back').click();
  await page.locator('#erEvent').selectOption({label:'舞台・演劇'});
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.er-occurrence-note')).toHaveText('演目C');
  await rows.first().click();
  await expect(page.locator('.er-detail-note')).toHaveText('補足：演目C');
  const overflow=await page.locator('#pageEventResults').evaluate(node=>node.scrollWidth-node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(saved);
  expect(errors).toEqual([]);
});


test('納品販売廃棄の対象外は／・未確認はー・未入力は空欄とする',async({page,browserName})=>{
  await page.clock.setFixedTime(new Date('2026-10-13T03:00:00Z'));
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightSalesCount&&document.getElementById('navSalesCount'));
  await page.locator('#navSalesCount').click();
  const baseline=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  await page.evaluate(()=>{
    const category=Object.assign({},allStores.salesCountManagement.categories[0],{activeTrips:[true,false,true]});
    const empty=InsightSalesCount.emptyRecord();
    const history=InsightSalesCount.createReadOnlyDayCard('2026-09-01',empty,category,
      {trips:[null,null,0]},[true,null,true]);
    history.id='wasteSlashHistoryE2E';document.body.append(history);
    const saved=InsightSalesCount.createReadOnlyDayCard('2026-09-08',empty,category,
      {trips:[null,4,0]},[true,null,true]);
    saved.id='wasteSlashSavedE2E';document.body.append(saved);
    const inactive=InsightSalesCount.createReadOnlyDayCard('2026-10-13',empty,category,
      {trips:[null,null,0]},[true,false,true]);
    inactive.id='wasteSlashInactiveE2E';document.body.append(inactive);
    const previouslySaved=InsightSalesCount.createReadOnlyDayCard('2026-10-01',
      {trips:[{delivery:null,sales:null},{delivery:0,sales:15},{delivery:null,sales:null}]},
      category,{trips:[null,4,null]},[true,false,true]);
    previouslySaved.id='excludedSavedReadOnlyE2E';document.body.append(previouslySaved);
    const partiallySaved=InsightSalesCount.createReadOnlyDayCard('2026-10-02',
      {trips:[{delivery:null,sales:null},{delivery:8,sales:null},{delivery:null,sales:null}]},
      category,{trips:[null,null,null]},[true,false,true]);
    partiallySaved.id='excludedPartialReadOnlyE2E';document.body.append(partiallySaved);
    const average=InsightSalesCount.createAverageCard('6週平均',
      {trips:[0,null,null],total:null},{trips:[null,null,null],total:null},
      null,category,[true,null,false]);
    average.id='unknownTripAverageE2E';document.body.append(average);
  });
  const history=page.locator('#wasteSlashHistoryE2E');
  await expect(history.locator('.sc-waste-row input')).toHaveCount(3);
  await expect(history.locator('.sc-waste-row input').nth(0)).toHaveValue('');
  const slash=history.locator('.sc-waste-row input').nth(1);
  await expect(slash).toHaveValue('ー');
  await expect(slash).toHaveClass(/sc-waste-unverified/);
  await expect(slash).toHaveAttribute('readonly','');
  await expect(slash).toHaveAttribute('aria-label',/過去の対象便は未確認/);
  await expect(history.locator('.sc-waste-row input').nth(2)).toHaveValue('0');
  await expect(history.locator('.sc-delivery-row input').nth(1)).toHaveValue('ー');
  await expect(history.locator('.sc-sales-row input').nth(1)).toHaveValue('ー');
  await expect(history.locator('.sc-delivery-row input').nth(0)).toHaveValue('');
  await expect(history.locator('.sc-sales-row input').nth(0)).toHaveValue('');
  await expect(history.locator('.sc-delivery-row input').nth(2)).toHaveValue('');
  await expect(history.locator('.sc-sales-row input').nth(2)).toHaveValue('');
  const average=page.locator('#unknownTripAverageE2E');
  await expect(average.locator('.sc-delivery-row input').nth(0)).toHaveValue('0');
  await expect(average.locator('.sc-sales-row input').nth(0)).toHaveValue('');
  await expect(average.locator('.sc-delivery-row input').nth(1)).toHaveValue('ー');
  await expect(average.locator('.sc-sales-row input').nth(1)).toHaveValue('ー');
  await expect(average.locator('.sc-delivery-row input').nth(2)).toHaveValue('／');
  await expect(average.locator('.sc-sales-row input').nth(2)).toHaveValue('／');
  const sizes=await history.locator('.sc-waste-row').evaluate(row=>{
    const inputs=row.querySelectorAll('input');
    return {slash:parseFloat(getComputedStyle(inputs[1]).fontSize),
      number:parseFloat(getComputedStyle(inputs[2]).fontSize),
      color:getComputedStyle(inputs[1]).color,numberColor:getComputedStyle(inputs[2]).color};
  });
  expect(sizes.slash).toBe(sizes.number);
  expect(sizes.color).not.toBe(sizes.numberColor);
  const styling=await history.locator('.sc-waste-row').evaluate(row=>{
    const inputs=row.querySelectorAll('input');
    const unknown=getComputedStyle(inputs[1]),ordinary=getComputedStyle(inputs[0]);
    return {background:unknown.backgroundColor,normalBackground:ordinary.backgroundColor,border:unknown.borderStyle};
  });
  expect(styling.background).toBe(styling.normalBackground);
  expect(styling.border).toBe('solid');
  // Stored 0 and positive waste counts, including the total, use the theme-specific blue.
  // Unknown/excluded symbols remain muted, and normal missing entries remain blank.
  for(const [isDark,expected] of [[false,'rgb(37, 99, 235)'],[true,'rgb(147, 197, 253)']]){
    await page.evaluate(dark=>{
      document.documentElement.classList.toggle('dark',dark);
      document.body.classList.toggle('dark',dark);
    },isDark);
    // Input CSS has a 150ms transition: check the settled color, not an intermediate frame.
    await expect.poll(()=>page.locator('#wasteSlashHistoryE2E .sc-waste-row input').nth(2)
      .evaluate(input=>getComputedStyle(input).color)).toBe(expected);
    const colors=await page.evaluate(()=>{
      const card=document.getElementById('wasteSlashHistoryE2E');
      const saved=document.getElementById('wasteSlashSavedE2E');
      const inactive=document.getElementById('wasteSlashInactiveE2E');
      const color=(node)=>getComputedStyle(node).color;
      return {
        zero:color(card.querySelectorAll('.sc-waste-row input')[2]),
        saved:color(saved.querySelectorAll('.sc-waste-row input')[1]),
        total:color(card.querySelector('.sc-total-waste')),
        totalNumeric:card.querySelector('.sc-total-waste').classList.contains('has-val'),
        missingTotalNumeric:inactive.querySelector('.sc-total-waste').classList.contains('has-val'),
        unknown:color(card.querySelectorAll('.sc-waste-row input')[1]),
        excluded:color(inactive.querySelectorAll('.sc-waste-row input')[1])
      };
    });
    expect(colors.zero).toBe(expected);
    expect(colors.saved).toBe(expected);
    expect(colors.totalNumeric).toBe(true);
    expect(colors.total).toBe(expected);
    expect(colors.unknown).not.toBe(expected);
    expect(colors.excluded).not.toBe(expected);
  }
  await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.body.classList.remove('dark');});
  await expect(page.locator('#wasteSlashSavedE2E .sc-waste-row input').nth(1)).toHaveValue('4');
  await expect(page.locator('#wasteSlashInactiveE2E .sc-waste-row input').nth(1)).toHaveValue('／');
  const excluded=page.locator('#excludedSavedReadOnlyE2E');
  for(const [selector,value] of [['.sc-delivery-row','0'],['.sc-sales-row','15'],['.sc-waste-row','4']]){
    const input=excluded.locator(selector+' input').nth(1);
    await expect(input).toHaveValue(value);
    await expect(input).toHaveAttribute('readonly','');
    await expect(input).toHaveAttribute('aria-readonly','true');
  }
  await expect(excluded.locator('.sc-delivery-row input').nth(1)).toHaveAttribute('aria-label',/対象外.*保存済み・編集不可/);
  await expect(excluded.locator('.sc-sales-row input').nth(1)).toHaveAttribute('aria-label',/対象外.*保存済み・編集不可/);
  const partial=page.locator('#excludedPartialReadOnlyE2E');
  await expect(partial.locator('.sc-delivery-row input').nth(1)).toHaveValue('8');
  await expect(partial.locator('.sc-sales-row input').nth(1)).toHaveValue('／');
  await expect(partial.locator('.sc-waste-row input').nth(1)).toHaveValue('ー');
  await expect(partial.locator('.sc-sales-row input').nth(1)).toHaveAttribute('readonly','');

  await expect(page.locator('#pageSalesCount .sc-legend')).not.toContainText('過去の対象便未確認');
  await expect(page.locator('#pageSalesCount .sc-legend')).not.toContainText('／');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(baseline);
  expect(errors).toEqual([]);
});

test('イベント・催事は開催回ごとの指定カテゴリーだけを表示し既存開催は従来どおり',async({page,browserName})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navEventResults')).toBeVisible();
  const cats=await page.evaluate(()=>{
    const categories=allStores.salesCountManagement.categories.filter(c=>!c.hidden).slice(0,2);
    if(categories.length<2)throw new Error('テスト用のカテゴリーが2つ必要です');
    const store=allStores.stores[allStores.current],ids=categories.map(c=>c.id);
    store.events=store.events||[];
    const events=[
      {id:'e2e_filter_near_new',type:'nearby',scope:'store',startDate:'2026-09-10',endDate:'2026-09-10',snapshot:{version:1,title:'E2E実績表示イベント',note:'当年',location:'E2E選択会場',resultCategoryIds:[ids[0]]}},
      {id:'e2e_filter_near_old',type:'nearby',scope:'store',startDate:'2025-09-10',endDate:'2025-09-10',snapshot:{version:1,title:'E2E実績表示イベント',note:'前年',location:'E2E選択会場'}},
      {id:'e2e_filter_special_new',type:'special',scope:'store',startDate:'2026-09-11',endDate:'2026-09-12',snapshot:{version:1,title:'E2E実績表示催事',note:'2日間',resultCategoryIds:[ids[1]]}},
      {id:'e2e_filter_special_old',type:'special',scope:'store',startDate:'2025-09-11',endDate:'2025-09-11',snapshot:{version:1,title:'E2E実績表示催事',note:'前年'}}
    ];
    store.events.push(...events);
    store.salesCounts=store.salesCounts||{};
    for(const date of ['2026-09-10','2025-09-10','2026-09-11','2026-09-12','2025-09-11']){
      store.salesCounts[date]=store.salesCounts[date]||{};
      categories.forEach((c,index)=>{store.salesCounts[date][c.id]={trips:[{delivery:index+10,sales:index+5},{delivery:null,sales:null},{delivery:null,sales:null}]};});
    }
    InsightEventResults.render();
    return categories.map(c=>({id:c.id,name:c.name}));
  });
  const before=await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].salesCounts));
  await page.locator('#navEventResults').click();
  await page.locator('#erLocation').selectOption({label:'E2E選択会場'});
  await page.locator('#erEvent').selectOption({label:'E2E実績表示イベント'});
  await expect(page.locator('.er-occurrence')).toHaveCount(2);
  await page.locator('.er-occurrence').first().click();
  await expect(page.locator('.er-category-card > h3')).toHaveText([cats[0].name]);
  await page.locator('.er-back').click();
  await page.locator('.er-occurrence').nth(1).click();
  await expect(page.locator('.er-category-card > h3')).toHaveText(cats.map(c=>c.name));
  await page.locator('.er-kind-btn[data-kind="special"]').click();
  await page.locator('#erEvent').selectOption({label:'E2E実績表示催事'});
  await page.locator('.er-occurrence').first().click();
  await expect(page.locator('.er-period-category > h3')).toHaveText([cats[1].name]);
  await expect(page.locator('.er-period-day-grid .sc-day')).toHaveCount(2);
  await page.locator('.er-back').click();
  await page.locator('.er-occurrence').nth(1).click();
  await expect(page.locator('.er-category-card > h3')).toHaveText(cats.map(c=>c.name));
  expect(await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].salesCounts))).toBe(before);
  expect(errors).toEqual([]);
});

test('イベントと催事の登録画面で実績表示カテゴリーを選択し保存後も維持する',async({page,browserName})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#nav0').click();
  const master=await page.evaluate(()=>allStores.salesCountManagement.categories.filter(c=>!c.hidden).map(c=>({id:c.id,name:c.name})));
  expect(master.length).toBeGreaterThan(1);
  for(const spec of [
    {type:'nearby',label:'イベント名',title:'E2E表示選択・近隣',location:true},
    {type:'special',label:'催事名',title:'E2E表示選択・催事',location:false}
  ]){
    await page.getByRole('button',{name:'＋イベントを追加'}).click();
    const dialog=page.locator('.ie-dialog.ie-event-add');
    await dialog.getByLabel('イベント種別').selectOption(spec.type);
    const fieldset=dialog.locator('.ie-result-category-options');
    await expect(fieldset).toBeVisible();
    await expect(fieldset).not.toHaveAttribute('open',/.*/);
    await expect(fieldset.locator('summary')).toContainText('すべて表示');
    await fieldset.locator('summary').click();
    await expect(fieldset).toHaveAttribute('open','');
    await expect(fieldset.locator('input[type="checkbox"]')).toHaveCount(master.length);
    await expect(fieldset.locator('input[type="checkbox"]:checked')).toHaveCount(master.length);
    await fieldset.getByRole('button',{name:'すべて解除'}).click();
    await dialog.getByLabel('実績表示 '+master[0].name).check();
    await dialog.getByLabel(spec.label,{exact:true}).fill(spec.title);
    if(spec.location)await dialog.getByLabel('イベント場所').first().fill('E2E選択登録会場');
    await dialog.getByRole('button',{name:'登録する'}).click();
    await expect(dialog).toHaveCount(0);
    const saved=await page.evaluate(title=>{
      const found=allStores.stores[allStores.current].events.find(e=>e.snapshot&&e.snapshot.title===title);
      return found&&{type:found.type,ids:found.snapshot.resultCategoryIds,location:found.snapshot.location};
    },spec.title);
    expect(saved.type).toBe(spec.type);
    expect(saved.ids).toEqual([master[0].id]);
    if(spec.location)expect(saved.location).toBe('E2E選択登録会場');
  }
  const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(raw).toContain('E2E表示選択・近隣');
  expect(raw).toContain('E2E表示選択・催事');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSalesCount')).toBeVisible();
  const restored=await page.evaluate(()=>{
    const evts=allStores.stores[allStores.current].events;
    return ['E2E表示選択・近隣','E2E表示選択・催事'].map(title=>evts.find(e=>e.snapshot&&e.snapshot.title===title)?.snapshot.resultCategoryIds);
  });
  expect(restored).toEqual([[master[0].id],[master[0].id]]);
  expect(errors).toEqual([]);
});


test('特需カテゴリーの名前を変更しても開いている催事のカテゴリーID選択を維持する',async({page,browserName})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav0')).toBeVisible();
  await page.locator('#nav0').click();
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  const editor=page.locator('dialog.ie-event-add');
  await editor.locator('select[aria-label="イベント種別"]').selectOption('special');
  await editor.locator('input[aria-label="催事名"]').fill('E2E未保存の催事');
  await editor.locator('.ie-demand-head-actions').getByRole('button',{name:'＋追加'}).click();
  await editor.locator('.ie-demand-row input[aria-label="名称"]').fill('E2E未保存の商品');

  const manager=page.locator('dialog.ie-preset-editor').filter({has:page.locator('.ie-demand-category-manager')});
  await editor.getByRole('button',{name:'カテゴリー管理'}).click();
  await expect(manager).toBeVisible();
  await manager.getByRole('button',{name:'＋ カテゴリーを追加'}).click();
  const originalName='E2E特需カテゴリー名称変更前';
  await manager.locator('.ie-demand-favorite-row input').last().fill(originalName);
  await manager.getByRole('button',{name:'保存する'}).click();
  await expect(manager).toHaveCount(0);
  const categoryId=await page.evaluate(name=>{
    const category=InsightEvents.demandCategories(allStores).find(item=>item.name===name);
    return category&&category.id;
  },originalName);
  expect(categoryId).toBeTruthy();
  const selector=editor.locator('.ie-demand-row select[aria-label="カテゴリー"]');
  await editor.locator('.ie-demand-row').first().locator('.ie-demand-picker-trigger').click();
  await editor.locator('.ie-demand-row').first().locator('.ie-demand-picker-panel').getByRole('button',{name:originalName,exact:true}).click();
  await expect(selector).toHaveValue('favorite:'+categoryId);

  await editor.getByRole('button',{name:'カテゴリー管理'}).click();
  await expect(manager).toBeVisible();
  const renamed='E2E特需カテゴリー名称変更後';
  await manager.locator('.ie-demand-favorite-row input').last().fill(renamed);
  await manager.getByRole('button',{name:'保存する'}).click();
  await expect(manager).toHaveCount(0);
  await expect(selector).toHaveValue('favorite:'+categoryId);
  await expect(selector.locator('option:checked')).toHaveText(renamed);
  await expect(editor.locator('input[aria-label="催事名"]')).toHaveValue('E2E未保存の催事');
  await expect(editor.locator('.ie-demand-row input[aria-label="名称"]')).toHaveValue('E2E未保存の商品');
  const shared=await page.evaluate(id=>({
    matching:InsightEvents.demandCategories(allStores).filter(c=>c.id===id),
    originalStore:allStores.current
  }),categoryId);
  expect(shared.matching).toEqual([{id:categoryId,name:renamed}]);
  await editor.getByRole('button',{name:'キャンセル'}).click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightEvents&&typeof allStores==='object');
  expect(await page.evaluate(id=>InsightEvents.demandCategories(allStores).find(c=>c.id===id)?.name,categoryId)).toBe(renamed);
  expect(errors).toEqual([]);
});


test('削除された特需カテゴリーは自由入力に退避し既存イベントを変更しない',async({page,browserName})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav0')).toBeVisible();
  await page.locator('#nav0').click();
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  const editor=page.locator('dialog.ie-event-add');
  await editor.getByLabel('イベント種別').selectOption('special');
  await editor.getByRole('button',{name:'カテゴリー管理'}).click();
  const manager=page.locator('dialog.ie-preset-editor').filter({has:page.locator('.ie-demand-category-manager')});
  await manager.getByRole('button',{name:'＋ カテゴリーを追加'}).click();
  await manager.getByLabel('カテゴリー名').first().fill('E2E削除対象');
  await manager.getByRole('button',{name:'＋ カテゴリーを追加'}).click();
  await manager.getByLabel('カテゴリー名').nth(1).fill('E2E残す対象');
  await manager.getByRole('button',{name:'保存する'}).click();
  await expect(manager).toHaveCount(0);
  const ids=await page.evaluate(()=>InsightEvents.demandCategories(allStores).map(c=>({id:c.id,name:c.name})));
  expect(ids.map(c=>c.name)).toEqual(['E2E削除対象','E2E残す対象']);

  await editor.getByLabel('催事名').fill('E2E過去イベント保持');
  await editor.locator('.ie-demand-editor').getByRole('button',{name:'＋追加'}).click();
  await editor.locator('.ie-demand-row input[aria-label="名称"]').fill('保存済み特需商品');
  await editor.locator('.ie-demand-row .ie-demand-picker-trigger').click();
  await editor.locator('.ie-demand-row .ie-demand-picker-panel').getByRole('button',{name:'E2E削除対象',exact:true}).click();
  await editor.getByRole('button',{name:'登録する'}).click();
  await expect(editor).toHaveCount(0);
  const storedEventsBefore=await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].events));

  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  await editor.getByLabel('イベント種別').selectOption('nearby');
  await editor.getByLabel('イベント名').fill('E2E編集中の近隣イベント');
  await editor.getByLabel('イベント場所').first().fill('E2E会場');
  await editor.locator('.ie-demand-editor').getByRole('button',{name:'＋追加'}).click();
  await editor.locator('.ie-demand-row input[aria-label="名称"]').fill('編集中の特需商品');
  const selector=editor.locator('.ie-demand-row select[aria-label="カテゴリー"]');
  await editor.locator('.ie-demand-row .ie-demand-picker-trigger').click();
  await editor.locator('.ie-demand-row .ie-demand-picker-panel').getByRole('button',{name:'E2E削除対象',exact:true}).click();

  await editor.getByRole('button',{name:'カテゴリー管理'}).click();
  await expect(manager).toBeVisible();
  await manager.locator('.ie-demand-favorite-row').first().getByRole('button',{name:'削除',exact:true}).click();
  await expect(manager.locator('.ie-demand-favorite-row')).toHaveCount(1);
  await manager.getByRole('button',{name:'保存する'}).click();
  await expect(manager).toHaveCount(0);
  await expect(selector).toHaveValue('custom');
  await expect(editor.locator('.ie-demand-row input[aria-label="独自カテゴリー名"]')).toHaveValue('E2E削除対象');
  await expect(editor.getByLabel('イベント名')).toHaveValue('E2E編集中の近隣イベント');
  expect(await page.evaluate(()=>InsightEvents.demandCategories(allStores))).toEqual([ids[1]]);
  expect(await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].events))).toBe(storedEventsBefore);
  await editor.getByRole('button',{name:'キャンセル'}).click();

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightEvents&&typeof allStores==='object');
  expect(await page.evaluate(()=>InsightEvents.demandCategories(allStores))).toEqual([ids[1]]);
  expect(await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].events))).toBe(storedEventsBefore);
  expect(errors).toEqual([]);
});
