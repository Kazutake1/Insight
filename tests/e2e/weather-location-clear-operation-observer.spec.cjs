const {test,expect}=require('@playwright/test');

async function withFictionalLocation(page,{observerMissing=false,cancel=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer absent'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightWeatherLocation&&
    typeof window.InsightWeatherLocation.getLocationClearOperationStatus==='function');
  await page.evaluate(({cancel})=>{
    // Create an independent FICTIONAL store in this browser context. Never import real data.
    const template=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    allStores={current:'fictional_location_store',stores:{
      fictional_location_store:{...template,name:'FICTIONAL Location Store',
        weatherLocation:{name:'FICTIONAL Old City',query:'FICTIONAL Old City',
          label:'FICTIONAL Location',latitude:35.25,longitude:136.75,
          timezone:'Asia/Tokyo',source:'fictional'}}
    }};
    store=allStores.stores[allStores.current];
    InsightStorage.persistCurrent(allStores); // Fixture baseline before any observer witness.
    window.__clearSamples=[];
    window.__clearAlerts=[];
    window.prompt=()=> '';
    window.confirm=()=> !cancel;
    window.alert=message=>window.__clearAlerts.push(String(message));
  },{cancel});
}

test('FICTIONAL confirmed clear remains ACTIVE before/after persistence, then IDLE',async({page})=>{
  await withFictionalLocation(page);
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__clearSamples.push(InsightWeatherLocation.getLocationClearOperationStatus());
      const result=original.apply(this,arguments);
      window.__clearSamples.push(InsightWeatherLocation.getLocationClearOperationStatus());
      return result;
    };
  });
  await page.evaluate(()=>InsightWeatherLocation.configure());
  const result=await page.evaluate(()=>{
    const persisted=JSON.parse(localStorage.getItem('insight_v11'));
    return {samples:window.__clearSamples,
      status:InsightWeatherLocation.getLocationClearOperationStatus(),
      setStatus:InsightWeatherLocation.getLocationSaveOperationStatus(),
      liveHasLocation:Object.hasOwn(store,'weatherLocation'),
      savedHasLocation:Object.hasOwn(persisted.stores.fictional_location_store,'weatherLocation'),
      alerts:window.__clearAlerts};
  });
  expect(result.samples.length).toBe(2);
  expect(result.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(result.status.scope).toBe('weather-location-confirmed-clear-only');
  expect(result.status.state).toBe('IDLE_OBSERVED');
  expect(result.status.activeCount).toBe(0);
  expect(result.setStatus.state).toBe('IDLE_OBSERVED');
  expect(result.liveHasLocation).toBe(false);
  expect(result.savedHasLocation).toBe(false);
  expect(result.alerts.join(' ')).toContain('天気地点設定を解除しました');
});

test('FICTIONAL postcommit clear error stays HELD, preserves thrown save error',async({page})=>{
  await withFictionalLocation(page);
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      const result=original.apply(this,arguments);
      throw new Error('FICTIONAL clear postcommit failure');
    };
  });
  const outcome=await page.evaluate(async()=>{
    let thrown;
    try{await InsightWeatherLocation.configure();}catch(error){thrown=error.name;}
    const persisted=JSON.parse(localStorage.getItem('insight_v11'));
    return {thrown,status:InsightWeatherLocation.getLocationClearOperationStatus(),
      savedHasLocation:Object.hasOwn(persisted.stores.fictional_location_store,'weatherLocation'),
      alerts:window.__clearAlerts};
  });
  expect(outcome.thrown).toBe('InsightPersistError');
  expect(outcome.status.state).toBe('HELD');
  expect(outcome.status.activeCount).toBe(0);
  expect(outcome.savedHasLocation).toBe(false);
  expect(outcome.alerts.join(' ')).toContain('保存結果を確認できないため');
});

test('FICTIONAL absent observer keeps successful clear, reports UNAVAILABLE',async({page})=>{
  await withFictionalLocation(page,{observerMissing:true});
  expect((await page.evaluate(()=>InsightWeatherLocation.getLocationClearOperationStatus())).state).toBe('UNAVAILABLE');
  await page.evaluate(()=>InsightWeatherLocation.configure());
  const result=await page.evaluate(()=>{
    const persisted=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightWeatherLocation.getLocationClearOperationStatus(),
      savedHasLocation:Object.hasOwn(persisted.stores.fictional_location_store,'weatherLocation')};
  });
  expect(result.status.state).toBe('UNAVAILABLE');
  expect(result.savedHasLocation).toBe(false);
});

test('FICTIONAL user declines clear; no write and no registered operation',async({page})=>{
  await withFictionalLocation(page,{cancel:true});
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__clearSamples.push('unexpected clear write');
      return original.apply(this,arguments);
    };
  });
  await page.evaluate(()=>InsightWeatherLocation.configure());
  const result=await page.evaluate(()=>{
    const persisted=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightWeatherLocation.getLocationClearOperationStatus(),
      writes:window.__clearSamples.length,
      savedHasLocation:Object.hasOwn(persisted.stores.fictional_location_store,'weatherLocation')};
  });
  expect(result.status.state).toBe('IDLE_OBSERVED');
  expect(result.writes).toBe(0);
  expect(result.savedHasLocation).toBe(true);
});
