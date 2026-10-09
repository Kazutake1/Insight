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
