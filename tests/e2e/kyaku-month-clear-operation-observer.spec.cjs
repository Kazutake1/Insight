const {test,expect}=require('@playwright/test');

async function openFictionalKyaku(page,{observerMissing=false,cancel=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer unavailable'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof clearKyakuMonth==='function'&&
    typeof InsightKyakuMonthClearObserverV0!=='undefined'&&
    typeof InsightKyakuMonthClearObserverV0.getStatus==='function');
  await page.evaluate(({cancel})=>{
    const initial=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    const y=editYear.kyaku,m=editMonth.kyaku;
    initial.name='FICTIONAL Customer Month Store';
    if(!initial.data)initial.data={};
    if(!initial.data[y])initial.data[y]={};
    initial.data[y][m]=blankMonthData(MONTHS.indexOf(m),y);
    initial.data[y][m][0].客数=77;
    initial.data[y][m][0].売上=42;
    allStores={current:'fictional_kyaku_store',stores:{fictional_kyaku_store:initial}};
    store=allStores.stores[allStores.current];
    InsightStorage.persistCurrent(allStores);
    window.__kyakuSamples=[];
    window.__kyakuAlerts=[];
    window.confirm=()=>!cancel;
    window.alert=message=>window.__kyakuAlerts.push(String(message));
  },{cancel});
}

test('FICTIONAL confirmed month clear ACTIVE across storage then IDLE, readback',async({page})=>{
  await openFictionalKyaku(page);
  const outcome=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__kyakuSamples.push(InsightKyakuMonthClearObserverV0.getStatus());
      const value=original.apply(this,arguments);
      window.__kyakuSamples.push(InsightKyakuMonthClearObserverV0.getStatus());
      return value;
    };
    const y=editYear.kyaku,m=editMonth.kyaku;
    clearKyakuMonth();
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {samples:window.__kyakuSamples,
      status:InsightKyakuMonthClearObserverV0.getStatus(),
      savedCustomers:saved.stores.fictional_kyaku_store.data[y][m][0].客数,
      liveCustomers:store.data[y][m][0].客数,
      savedLength:saved.stores.fictional_kyaku_store.data[y][m].length};
  });
  expect(outcome.samples).toHaveLength(2);
  expect(outcome.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(outcome.status.scope).toBe('kyaku-month-confirmed-clear-only');
  expect(outcome.status.state).toBe('IDLE_OBSERVED');
  expect(outcome.status.activeCount).toBe(0);
  expect(outcome.savedCustomers).toBe(0);
  expect(outcome.liveCustomers).toBe(0);
  expect(outcome.savedLength).toBeGreaterThan(25);
});

test('FICTIONAL postcommit exception keeps original throw and HELD',async({page})=>{
  await openFictionalKyaku(page);
  const outcome=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      const value=original.apply(this,arguments);
      throw new Error('FICTIONAL month clear postcommit failure');
    };
    const y=editYear.kyaku,m=editMonth.kyaku;
    let errorName;
    try{clearKyakuMonth();}catch(error){errorName=error.name;}
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {errorName,
      status:InsightKyakuMonthClearObserverV0.getStatus(),
      savedCustomers:saved.stores.fictional_kyaku_store.data[y][m][0].客数,
      alerts:window.__kyakuAlerts};
  });
  expect(outcome.errorName).toBe('InsightPersistError');
  expect(outcome.status.state).toBe('HELD');
  expect(outcome.status.activeCount).toBe(0);
  expect(outcome.savedCustomers).toBe(0);
  expect(outcome.alerts.join(' ')).toContain('データを保存できませんでした。');
});

test('FICTIONAL missing observer still clears month, reports UNAVAILABLE',async({page})=>{
  await openFictionalKyaku(page,{observerMissing:true});
  const outcome=await page.evaluate(()=>{
    const before=InsightKyakuMonthClearObserverV0.getStatus();
    clearKyakuMonth();
    const y=editYear.kyaku,m=editMonth.kyaku;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {before,state:InsightKyakuMonthClearObserverV0.getStatus(),
      savedCustomers:saved.stores.fictional_kyaku_store.data[y][m][0].客数};
  });
  expect(outcome.before.state).toBe('UNAVAILABLE');
  expect(outcome.state.state).toBe('UNAVAILABLE');
  expect(outcome.savedCustomers).toBe(0);
});

test('FICTIONAL cancel leaves month unchanged and does not persist',async({page})=>{
  await openFictionalKyaku(page,{cancel:true});
  const outcome=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    let writes=0;
    InsightStorage.persistCurrent=function(){writes++;return original.apply(this,arguments);};
    clearKyakuMonth();
    const y=editYear.kyaku,m=editMonth.kyaku;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {writes,status:InsightKyakuMonthClearObserverV0.getStatus(),
      savedCustomers:saved.stores.fictional_kyaku_store.data[y][m][0].客数};
  });
  expect(outcome.writes).toBe(0);
  expect(outcome.status.state).toBe('IDLE_OBSERVED');
  expect(outcome.savedCustomers).toBe(77);
});
