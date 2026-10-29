const {test,expect}=require('@playwright/test');

async function openFictionalDailyClear(page,{observerMissing=false,cancel=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer missing'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightDailyClearObserverV0&&
    typeof window.InsightDailyClearObserverV0.getStatus==='function'&&
    typeof window.clearDayData==='function');
  await page.evaluate(({cancel})=>{
    const template=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    template.name='FICTIONAL Daily Input Store';
    const y=editYear.sales,m=editMonth.sales,hy=editYear.haiki,hm=editMonth.haiki;
    if(!template.data)template.data={};
    if(!template.data[y])template.data[y]={};
    if(!template.data[hy])template.data[hy]={};
    template.data[y][m]=blankMonthData(MONTHS.indexOf(m),y);
    template.data[hy][hm]=blankMonthData(MONTHS.indexOf(hm),hy);
    // Seed both branches independently, including a field each branch must preserve.
    [[y,m],[hy,hm]].forEach(([fy,month])=>{
      const row=template.data[fy][month][0];
      row.売上=42;
      row.買上点数=7;
      row.客数=77;
      row.廃棄金額=900;
      row.haiki[HAIKI_CATS[0]]=900;
      row.storeMemo='FICTIONAL memo';
      row.weather='晴れ';
    });
    allStores={current:'fictional_daily_clear_store',stores:{
      fictional_daily_clear_store:template
    }};
    store=allStores.stores[allStores.current];
    window.salesSelDay=1;
    window.haikiSelDay=1;
    InsightStorage.persistCurrent(allStores);
    window.__dailySamples=[];
    window.__dailyAlerts=[];
    window.confirm=()=>!cancel;
    window.alert=message=>window.__dailyAlerts.push(String(message));
  },{cancel});
}

test('FICTIONAL confirmed sales-day clear keeps customers, waste, memo and ACTIVE boundary',async({page})=>{
  await openFictionalDailyClear(page);
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__dailySamples.push(InsightDailyClearObserverV0.getStatus());
      const value=original.apply(this,arguments);
      window.__dailySamples.push(InsightDailyClearObserverV0.getStatus());
      return value;
    };
    const y=editYear.sales,m=editMonth.sales;
    clearDayData('sales');
    const row=JSON.parse(localStorage.getItem('insight_v11')).stores.fictional_daily_clear_store.data[y][m][0];
    return {samples:window.__dailySamples,
      status:InsightDailyClearObserverV0.getStatus(),
      sales:row.売上,items:row.買上点数,customers:row.客数,
      waste:row.廃棄金額,memo:row.storeMemo,liveCustomers:store.data[y][m][0].客数};
  });
  expect(out.samples).toHaveLength(2);
  expect(out.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
  expect(out.status.scope).toBe('selected-sales-or-waste-day-confirmed-clear-only');
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.status.activeCount).toBe(0);
  expect([out.sales,out.items,out.customers,out.waste,out.liveCustomers]).toEqual([0,0,77,900,77]);
  expect(out.memo).toBe('FICTIONAL memo');
});

test('FICTIONAL confirmed waste-day clear keeps sales and customers',async({page})=>{
  await openFictionalDailyClear(page);
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__dailySamples.push(InsightDailyClearObserverV0.getStatus());
      const val=original.apply(this,arguments);
      window.__dailySamples.push(InsightDailyClearObserverV0.getStatus());
      return val;
    };
    const y=editYear.haiki,m=editMonth.haiki;
    clearDayData('haiki');
    const saved=JSON.parse(localStorage.getItem('insight_v11')).stores.fictional_daily_clear_store.data[y][m][0];
    return {samples:window.__dailySamples,status:InsightDailyClearObserverV0.getStatus(),
      sales:saved.売上,customers:saved.客数,waste:saved.廃棄金額,cat:saved.haiki[HAIKI_CATS[0]],
      memo:saved.storeMemo,liveWaste:store.data[y][m][0].廃棄金額};
  });
  expect(out.samples).toHaveLength(2);
  expect(out.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.status.activeCount).toBe(0);
  expect([out.sales,out.customers,out.waste,out.cat,out.liveWaste]).toEqual([42,77,0,0,0]);
  expect(out.memo).toBe('FICTIONAL memo');
});

test('FICTIONAL postcommit clear error remains HELD and preserves original persist guard',async({page})=>{
  await openFictionalDailyClear(page);
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      const value=original.apply(this,arguments);
      throw new Error('FICTIONAL daily clear postcommit exception');
    };
    let thrown;
    try{clearDayData('sales');}catch(error){thrown=error.name;}
    const y=editYear.sales,m=editMonth.sales;
    const saved=JSON.parse(localStorage.getItem('insight_v11')).stores.fictional_daily_clear_store.data[y][m][0];
    return {thrown,status:InsightDailyClearObserverV0.getStatus(),
      sales:saved.売上,customers:saved.客数,alerts:window.__dailyAlerts};
  });
  expect(out.thrown).toBe('InsightPersistError');
  expect(out.status.state).toBe('HELD');
  expect(out.status.activeCount).toBe(0);
  expect(out.sales).toBe(0);
  expect(out.customers).toBe(77);
  expect(out.alerts.join(' ')).toContain('データを保存できませんでした。');
});

test('FICTIONAL missing observer leaves sales-day clear operational and UNAVAILABLE',async({page})=>{
  await openFictionalDailyClear(page,{observerMissing:true});
  const out=await page.evaluate(()=>{
    const before=InsightDailyClearObserverV0.getStatus();
    clearDayData('sales');
    const y=editYear.sales,m=editMonth.sales;
    const saved=JSON.parse(localStorage.getItem('insight_v11')).stores.fictional_daily_clear_store.data[y][m][0];
    return {before,after:InsightDailyClearObserverV0.getStatus(),sales:saved.売上,customers:saved.客数};
  });
  expect(out.before.state).toBe('UNAVAILABLE');
  expect(out.after.state).toBe('UNAVAILABLE');
  expect(out.sales).toBe(0);
  expect(out.customers).toBe(77);
});

test('FICTIONAL cancelled day clear does not write or register operation',async({page})=>{
  await openFictionalDailyClear(page,{cancel:true});
  const out=await page.evaluate(()=>{
    let calls=0;const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){calls++;return original.apply(this,arguments);};
    clearDayData('haiki');
    const y=editYear.haiki,m=editMonth.haiki;
    const row=JSON.parse(localStorage.getItem('insight_v11')).stores.fictional_daily_clear_store.data[y][m][0];
    return {calls,status:InsightDailyClearObserverV0.getStatus(),waste:row.廃棄金額};
  });
  expect(out.calls).toBe(0);
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.waste).toBe(900);
});

test('FICTIONAL no selected day stays outside registered operation',async({page})=>{
  await openFictionalDailyClear(page);
  const out=await page.evaluate(()=>{
    window.salesSelDay=0;
    let calls=0;const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){calls++;return original.apply(this,arguments);};
    clearDayData('sales');
    return {calls,status:InsightDailyClearObserverV0.getStatus(),alerts:window.__dailyAlerts};
  });
  expect(out.calls).toBe(0);
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.alerts.join(' ')).toContain('日付が選択されていません。');
});
