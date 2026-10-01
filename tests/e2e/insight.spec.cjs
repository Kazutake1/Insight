const {test,expect}=require('@playwright/test');
const path=require('node:path');

async function openInsight(page){
  const pakoPath=path.join(process.cwd(),'node_modules','pako','dist','pako.min.js');
  await page.route('https://unpkg.com/pako@2.1.0/dist/pako.min.js',route=>
    route.fulfill({path:pakoPath,contentType:'application/javascript'})
  );
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightPagePeriodSync&&window.InsightSalesCount&&window.InsightAnalysisPeriodLock);
  return errors;
}

async function selectDashboardSeptember(page){
  await page.evaluate(()=>{
    gotoNav(1);
    selMonth='9月';
    refreshDash();
  });
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');
}

test('選択月は主要ページを横断しても維持される',async({page})=>{
  const errors=await openInsight(page);
  await selectDashboardSeptember(page);
  const year=await page.evaluate(()=>String(baseYear));

  await page.locator('#nav2').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.sales)).toBe('9月');

  await page.locator('#nav3').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.kyaku)).toBe('9月');

  await page.locator('#nav4').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.haiki)).toBe('9月');

  await page.locator('#navSalesCount').click();
  await expect.poll(()=>page.evaluate(()=>window.InsightSalesCount.getPeriod().month)).toBe(9);
  await expect.poll(()=>page.evaluate(()=>String(window.InsightSalesCount.getPeriod().year))).toBe(year);

  await page.locator('#nav1').click();
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');
  expect(errors).toEqual([]);
});

test('分析AIを開いてサイドバーを切り替えても分析対象月を維持する',async({page})=>{
  const errors=await openInsight(page);
  await selectDashboardSeptember(page);

  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  await expect.poll(()=>page.evaluate(()=>window.InsightAnalysisPeriodLock.getTarget()&&window.InsightAnalysisPeriodLock.getTarget().month)).toBe(9);

  await page.locator('#nav2').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.sales)).toBe('9月');
  await expect.poll(()=>page.evaluate(()=>window.InsightAnalysisPeriodLock.getTarget().month)).toBe(9);
  await expect(page.locator('#aiAnalysisTarget')).toContainText('9月');
  expect(errors).toEqual([]);
});

test('販売数ページはデータ本体の置換後に古いdraftを残さない',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();

  const result=await page.evaluate(()=>{
    const api=window.InsightSalesCount;
    const category=api.getAnalysisContext().category;
    const year=String(new Date().getFullYear());
    api.setPeriod(year,9);

    function snapshotWithSales(values){
      const next=JSON.parse(JSON.stringify(allStores));
      const id=next.current;
      next.stores[id].salesCounts={};
      next.stores[id].salesCounts[year+'-09-01']={};
      next.stores[id].salesCounts[year+'-09-01'][category.id]={
        trips:values.map(v=>({delivery:v,sales:v}))
      };
      return next;
    }

    allStores=snapshotWithSales([1,2,3]);
    store=allStores.stores[allStores.current];
    api.reloadFromStore();
    const first=api.getAnalysisContext().daily.find(x=>x.date===year+'-09-01');

    allStores=snapshotWithSales([10,20,30]);
    store=allStores.stores[allStores.current];
    api.reloadFromStore();
    const second=api.getAnalysisContext().daily.find(x=>x.date===year+'-09-01');

    return {first:first&&first.sales,second:second&&second.sales};
  });

  expect(result).toEqual({first:6,second:60});
  expect(errors).toEqual([]);
});
