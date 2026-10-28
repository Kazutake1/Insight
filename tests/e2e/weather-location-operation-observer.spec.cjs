const {test,expect}=require('@playwright/test');

async function openLocation(page,{observerMissing=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer missing'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightWeatherLocation&&
    typeof window.InsightWeatherLocation.getLocationSaveOperationStatus==='function');
  await page.evaluate(()=>{
    // Entirely FICTIONAL browser-only store, no production backup or data access.
    const template=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    delete template.weatherLocation;
    allStores={current:'fictional_location_store',stores:{
      fictional_location_store:{...template,name:'FICTIONAL Location Store'}
    }};
    store=allStores.stores[allStores.current];
    window.__locationSamples=[];
    window.__locationAlerts=[];
    window.prompt=()=> '架空市';
    window.confirm=()=> true;
    window.alert=message=>window.__locationAlerts.push(String(message));
    window.fetch=async url=>{
      window.__locationFetch=String(url);
      return {ok:true,json:async()=>({results:[{
        name:'FICTIONAL City',latitude:35.25,longitude:136.75,
        timezone:'Asia/Tokyo',admin1:'FICTIONAL Prefecture'
      }]})};
    };
  });
}

test('FICTIONAL confirmed setting stays ACTIVE around persist, then IDLE_OBSERVED',async({page})=>{
  await openLocation(page);
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__locationSamples.push(InsightWeatherLocation.getLocationSaveOperationStatus());
      const result=original.apply(this,arguments);
      window.__locationSamples.push(InsightWeatherLocation.getLocationSaveOperationStatus());
      return result;
    };
  });
  await page.evaluate(()=>InsightWeatherLocation.configure());
  const result=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {samples:window.__locationSamples,
      status:InsightWeatherLocation.getLocationSaveOperationStatus(),
      location:saved.stores.fictional_location_store.weatherLocation,
      alerts:window.__locationAlerts,requested:window.__locationFetch};
  });
  expect(result.samples.length).toBe(2);
  expect(result.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(result.status.scope).toBe('weather-location-confirmed-set-only');
  expect(result.status.state).toBe('IDLE_OBSERVED');
  expect(result.status.activeCount).toBe(0);
  expect(result.location.latitude).toBe(35.25);
  expect(result.requested).toContain('geocoding-api.open-meteo.com');
  expect(result.alerts.join(' ')).toContain('設定しました');
});

test('FICTIONAL postcommit save error yields HELD and preserves existing alert handler',async({page})=>{
  await openLocation(page);
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      const result=original.apply(this,arguments);
      throw new Error('FICTIONAL location postcommit failure');
    };
  });
  await page.evaluate(()=>InsightWeatherLocation.configure());
  const result=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightWeatherLocation.getLocationSaveOperationStatus(),
      persisted:saved.stores.fictional_location_store.weatherLocation.latitude,
      alerts:window.__locationAlerts};
  });
  expect(result.status.state).toBe('HELD');
  expect(result.status.activeCount).toBe(0);
  expect(result.persisted).toBe(35.25);
  expect(result.alerts.join(' ')).toContain('FICTIONAL location postcommit failure');
});

test('FICTIONAL missing observer keeps original successful save and UNAVAILABLE status',async({page})=>{
  await openLocation(page,{observerMissing:true});
  expect((await page.evaluate(()=>InsightWeatherLocation.getLocationSaveOperationStatus())).state).toBe('UNAVAILABLE');
  await page.evaluate(()=>InsightWeatherLocation.configure());
  const result=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightWeatherLocation.getLocationSaveOperationStatus(),
      persisted:saved.stores.fictional_location_store.weatherLocation.longitude};
  });
  expect(result.status.state).toBe('UNAVAILABLE');
  expect(result.persisted).toBe(136.75);
});
