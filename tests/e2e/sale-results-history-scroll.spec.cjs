const {test,expect}=require('@playwright/test');
require('./helpers/verified-chart.cjs')(test);
test.use({viewport:{width:1194,height:834}});

test('FICTIONAL all-period sale history shows twenty rows with scrolling and keeps details always visible',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.waitForFunction(()=>window.InsightSaleResults?.getState&&window.InsightEvents&&
    window.InsightSalesCount?.createReadOnlyDayCard&&window.InsightTripHistoryResolver);
  const initial=await page.evaluate(()=>{
    const raw=localStorage.getItem('insight_v11');
    window.__saleResultsOriginalRaw=raw;
    const category=allStores.salesCountManagement.categories.find(item=>!item.hidden);
    if(!allStores.eventManagement)allStores.eventManagement={version:1,presets:[],events:[]};
    allStores.eventManagement.events=[];
    allStores.stores[allStores.current].events=[];
    const now=new Date();
    for(let i=0;i<27;i++){
      const date=new Date(now.getFullYear(),now.getMonth()-26+i,1);
      const value=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-01';
      allStores.eventManagement.events.push({
        id:'FICTIONAL_sale_'+i,type:'sale',scope:'global',
        startDate:value,endDate:value,
        snapshot:{title:'架空のセール'+i,sale:{
          categoryId:category.id,category:category.name,method:'amount',
          params:{amount:i%2===0?20:30}
        }}
      });
    }
    gotoNav('saleResults');
    return {period:InsightSaleResults.getState().period,events:allStores.eventManagement.events.length};
  });
  expect(initial).toEqual({period:'12',events:27});
  await expect(page.locator('#pageSaleResults.show')).toBeVisible();
  await expect(page.locator('#srListBody tr')).toHaveCount(12);
  await expect(page.locator('#srGroups .sr-group-toggle')).toHaveCount(0);
  await expect(page.locator('#srGroups .sr-day-grid')).toHaveCount(12);
  await expect(page.locator('#srGroups .sc-day')).toHaveCount(12);
  await expect(page.locator('#srGroups .sr-occurrence-grids').first()).toBeVisible();

  await page.locator('#srPeriodTabs button[data-period="all"]').click();
  await expect(page.locator('#srListBody tr')).toHaveCount(27);
  await expect(page.locator('#srListCount')).toHaveText('全27件');
  const dimensions=await page.evaluate(()=>{
    const scroller=document.querySelector('#pageSaleResults .sr-table-scroll');
    const table=scroller.querySelector('table'),rows=table.tBodies[0].rows;
    const bottom=scroller.getBoundingClientRect().bottom;
    return {
      maxHeight:scroller.style.maxHeight,
      scrollable:scroller.scrollHeight>scroller.clientHeight,
      row20Bottom:rows[19].getBoundingClientRect().bottom,
      row21Top:rows[20].getBoundingClientRect().top,
      bottom,
      label:scroller.getAttribute('aria-label'),
      tabindex:scroller.tabIndex
    };
  });
  expect(dimensions.scrollable).toBe(true);
  expect(dimensions.maxHeight).not.toBe('');
  expect(dimensions.row20Bottom).toBeLessThanOrEqual(dimensions.bottom+3);
  expect(dimensions.row21Top).toBeGreaterThanOrEqual(dimensions.bottom-3);
  expect(dimensions.label).toContain('全27件');
  expect(dimensions.tabindex).toBe(0);

  const scroller=page.locator('#pageSaleResults .sr-table-scroll');
  await scroller.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  expect(await page.evaluate(()=>{
    const area=document.querySelector('#pageSaleResults .sr-table-scroll').getBoundingClientRect();
    const last=document.querySelector('#srListBody').rows[26].getBoundingClientRect();
    return last.bottom<=area.bottom+2&&last.top>=area.top-2;
  })).toBe(true);

  await expect(page.locator('#srGroups .sr-group')).toHaveCount(2);
  await expect(page.locator('#srGroups .sr-group-toggle')).toHaveCount(0);
  await expect(page.locator('#srGroups .sr-day-grid')).toHaveCount(27);
  await expect(page.locator('#srGroups .sc-day')).toHaveCount(27);
  await expect(page.locator('#srGroups .sr-occurrence-grids').first()).toBeVisible();
  await expect(page.locator('#srGroups .sr-occurrence-grids').nth(1)).toBeVisible();

  await page.locator('#srPeriodTabs button[data-period="12"]').click();
  await expect(page.locator('#srListBody tr')).toHaveCount(12);
  await expect(page.locator('#srGroups .sr-day-grid')).toHaveCount(12);
  await expect(scroller).not.toHaveAttribute('tabindex');
  expect(await scroller.evaluate(node=>node.style.maxHeight)).toBe('');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11')===window.__saleResultsOriginalRaw)).toBe(true);
});
