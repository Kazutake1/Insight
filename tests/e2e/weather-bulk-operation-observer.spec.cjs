const {test,expect}=require('@playwright/test');

async function openWeather(page,{observerMissing=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer unavailable'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightWeatherBulk&&
    typeof window.InsightWeatherBulk.getWeatherBulkOperationStatus==='function');
}

async function seedWeather(page,twoGroups=false){
  return page.evaluate(two=>{
    // This browser contains only an isolated fictional weather store;
    // neither production storage nor private store data is imported.
    const saved=JSON.parse(JSON.stringify(allStores));
    const original=JSON.parse(JSON.stringify(saved.stores[saved.current]));
    const data={'2025':{'1月':[{d:'1',weather:'',tempMaxC:null,tempMinC:null}]}};
    if(two)data['2025']['4月']=[{d:'1',weather:'',tempMaxC:null,tempMinC:null}];
    saved.current='fictional_weather_store';
    saved.stores={fictional_weather_store:{
      ...original,name:'FICTIONAL weather store',years:['2025'],data,
      weatherLocation:{latitude:35,longitude:136,timezone:'Asia/Tokyo'}
    }};
    allStores=saved;
    store=allStores.stores[allStores.current];
    return InsightWeatherBulk.scan(allStores).groups.map(group=>group.dates);
  },twoGroups);
}

function mockedWeatherSource(){
  const called=[];
  window.fetch=async url=>{
    called.push(String(url));
    const parameters=new URL(url).searchParams;
    const day=parameters.get('start_date')||'2025-01-01';
    return {ok:true,status:200,json:async()=>({daily:{
      time:[day],weather_code:[1],temperature_2m_max:[23],temperature_2m_min:[12]
    }})};
  };
  return called;
}

test('FICTIONAL weather run remains ACTIVE during pending fetch and storage/live apply',async({page})=>{
  await openWeather(page);
  expect(await seedWeather(page)).toEqual([['2025-01-01']]);
  const started=await page.evaluate(()=>{
    window.__weatherSamples=[];
    const write=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      window.__weatherSamples.push(InsightWeatherBulk.getWeatherBulkOperationStatus());
      const result=write.apply(this,arguments);
      window.__weatherSamples.push(InsightWeatherBulk.getWeatherBulkOperationStatus());
      return result;
    };
    window.__finishWeatherFetch=null;
    window.fetch=()=>new Promise(resolve=>{
      window.__finishWeatherFetch=()=>resolve({ok:true,status:200,
        json:async()=>({daily:{time:['2025-01-01'],weather_code:[1],
          temperature_2m_max:[23],temperature_2m_min:[12]}})});
    });
    window.__weatherPending=InsightWeatherBulk.run();
    return InsightWeatherBulk.getWeatherBulkOperationStatus();
  });
  expect(started.scope).toBe('weather-bulk-run-only');
  expect(started.state).toBe('ACTIVE');
  expect(started.activeCount).toBe(1);
  const finished=await page.evaluate(async()=>{
    window.__finishWeatherFetch();
    const result=await window.__weatherPending;
    return {result,samples:window.__weatherSamples,
      weather:allStores.stores.fictional_weather_store.data['2025']['1月'][0].weather,
      status:InsightWeatherBulk.getWeatherBulkOperationStatus()};
  });
  expect(finished.result.days).toBe(1);
  expect(finished.weather).toBe('晴');
  expect(finished.samples.length).toBe(2);
  expect(finished.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(finished.status.state).toBe('IDLE_OBSERVED');
  expect(finished.status.activeCount).toBe(0);
});

test('FICTIONAL cancellation after one committed group stays HELD, never silently idle',async({page})=>{
  await openWeather(page);
  expect(await seedWeather(page,true)).toEqual([['2025-01-01'],['2025-04-01']]);
  const result=await page.evaluate(async()=>{
    const calls=mockedWeatherSource();
    const before=InsightWeatherBulk.getWeatherBulkOperationStatus();
    const outcome=await InsightWeatherBulk.run(p=>{
      if(p.done===1)InsightWeatherBulk.cancel();
    });
    const months=allStores.stores.fictional_weather_store.data['2025'];
    return {before,outcome,calls:calls.length,
      first:months['1月'][0].weather,second:months['4月'][0].weather,
      final:InsightWeatherBulk.getWeatherBulkOperationStatus()};
  });
  expect(result.before.state).toBe('IDLE_OBSERVED');
  expect(result.outcome.cancelled).toBe(true);
  expect(result.first).toBe('晴');
  expect(result.second).toBe('');
  expect(result.calls).toBe(1);
  expect(result.final.state).toBe('HELD');
  expect(result.final.activeCount).toBe(0);
});

test('FICTIONAL after-write failure preserves rejection and records sticky HELD',async({page})=>{
  await openWeather(page);
  await seedWeather(page);
  const result=await page.evaluate(async()=>{
    const calls=mockedWeatherSource();
    const write=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      write.apply(this,arguments);
      throw new Error('FICTIONAL committed weather write failure');
    };
    let error=null;
    try{await InsightWeatherBulk.run();}
    catch(e){error=e&&e.message;}
    finally{InsightStorage.writeSnapshot=write;}
    const state=InsightWeatherBulk.getWeatherBulkOperationStatus();
    return {error,calls:calls.length,state,
      readback:JSON.parse(localStorage.getItem('insight_v11')).stores.fictional_weather_store
        .data['2025']['1月'][0].weather};
  });
  expect(result.error).toBe('FICTIONAL committed weather write failure');
  expect(result.calls).toBe(1);
  expect(result.readback).toBe('晴');
  expect(result.state.state).toBe('HELD');
  expect(result.state.activeCount).toBe(0);
});

test('FICTIONAL missing observer does not block a successful weather bulk run',async({page})=>{
  await openWeather(page,{observerMissing:true});
  await seedWeather(page);
  const result=await page.evaluate(async()=>{
    mockedWeatherSource();
    const before=InsightWeatherBulk.getWeatherBulkOperationStatus();
    const output=await InsightWeatherBulk.run();
    return {before,output,after:InsightWeatherBulk.getWeatherBulkOperationStatus()};
  });
  expect(result.before.state).toBe('UNAVAILABLE');
  expect(result.output.days).toBe(1);
  expect(result.after.state).toBe('UNAVAILABLE');
});
