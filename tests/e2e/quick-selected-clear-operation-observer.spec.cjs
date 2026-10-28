const {test,expect}=require('@playwright/test');

async function openFictionalQuick(page,{missingObserver=false,cancel=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(missingObserver){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL operation observer missing'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightQuickClearObserverV0&&
    typeof window.InsightQuickClearObserverV0.getStatus==='function'&&
    typeof window.clearTodayData==='function'&&window.InsightEvents&&window.InsightDateContext);
  await page.evaluate(({cancel})=>{
    const current=InsightDateContext.getSelectedInfo();
    const selectedDay=current.day===1?2:1;
    InsightDateContext.setSelectedDate(new Date(Number(current.fy),current.mIdx,selectedDay));
    const t=InsightDateContext.getSelectedInfo();
    const initial=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    initial.name='FICTIONAL Quick Selected Day Store';
    if(!initial.data)initial.data={};
    if(!initial.data[t.fy])initial.data[t.fy]={};
    initial.data[t.fy][t.month]=blankMonthData(t.mIdx,t.fy);
    const row=initial.data[t.fy][t.month][t.day-1];
    const other=initial.data[t.fy][t.month][2];
    row.売上=42;row.客数=77;row.買上点数=7;row.廃棄金額=900;
    row.haiki[HAIKI_CATS[0]]=900;
    row.storeMemo='FICTIONAL remove memo';
    row.weather='晴';row.tempMaxC=32;row.tempMinC=20;
    other.売上=99;other.客数=88;other.weather='雨';
    const localEvent={
      id:'fictional_local_evt',type:'nearby',scope:'store',
      startDate:t.iso,endDate:t.iso,
      snapshot:{version:1,title:'FICTIONAL nearby event',note:'local-only'}
    };
    const globalEvent={
      id:'fictional_global_evt',type:'sale',scope:'global',
      startDate:t.iso,endDate:t.iso,
      snapshot:{version:1,title:'FICTIONAL sale',note:'global-only',
        sale:{category:'おにぎり',method:'amount',params:{amount:50}}}
    };
    initial.events=[localEvent];
    allStores={current:'fictional_quick_store',
      stores:{fictional_quick_store:initial},
      eventManagement:{version:1,presets:[],events:[globalEvent]}};
    store=allStores.stores[allStores.current];
    InsightEvents.validate(allStores);
    todayInfo={fy:t.fy,mIdx:t.mIdx,month:t.month,day:t.day};
    quickEditDay=t.day;
    InsightStorage.persistCurrent(allStores);
    window.__quickFictional={date:t.iso,fy:t.fy,month:t.month,day:t.day,
      otherIndex:2,initialRow:JSON.parse(JSON.stringify(row)),
      initialOther:JSON.parse(JSON.stringify(other)),
      localEvents:JSON.parse(JSON.stringify(initial.events)),
      globalEvents:JSON.parse(JSON.stringify(allStores.eventManagement.events))};
    window.__quickSamples=[];
    window.__quickAlerts=[];
    window.confirm=()=>!cancel;
    window.alert=value=>window.__quickAlerts.push(String(value));
  },{cancel});
}

test('FICTIONAL non-today Quick clear via actual button observes ACTIVE, preserves events/weather/other day',async({page})=>{
  await openFictionalQuick(page);
  await page.locator('#nav0').click();
  await page.evaluate(()=>{
    // Navigating to Quick may reset the selected date on store switch.
    const v=window.__quickFictional;
    InsightDateContext.setSelectedDate(InsightDateContext.parseIso(v.date));
    todayInfo={fy:v.fy,mIdx:MONTHS.indexOf(v.month),month:v.month,day:v.day};
    quickEditDay=v.day;
    window.renderQuickNav();
    window.renderQuickPage();
  });
  const shown=await page.locator('#qDate').textContent();
  const target=await page.evaluate(()=>window.__quickFictional);
  expect(shown).toContain(target.month+' '+target.day+'日');
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__quickSamples.push(InsightQuickClearObserverV0.getStatus());
      const value=original.apply(this,arguments);
      window.__quickSamples.push(InsightQuickClearObserverV0.getStatus());
      return value;
    };
    return true;
  });
  expect(out).toBe(true);
  await page.locator('#quickClearBtn').click();
  const outcome=await page.evaluate(()=>{
    const v=window.__quickFictional;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    const s=saved.stores.fictional_quick_store;
    return {samples:window.__quickSamples,
      status:InsightQuickClearObserverV0.getStatus(),
      row:s.data[v.fy][v.month][v.day-1],
      liveRow:store.data[v.fy][v.month][v.day-1],
      other:s.data[v.fy][v.month][v.otherIndex],
      local:s.events,global:saved.eventManagement.events,
      wasToday:v.date===InsightDateContext.iso(new Date())};
  });
  expect(outcome.wasToday).toBe(false);
  expect(outcome.samples).toHaveLength(2);
  expect(outcome.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(outcome.status).toMatchObject({scope:'quick-selected-date-confirmed-clear-only',
    state:'IDLE_OBSERVED',activeCount:0});
  expect([outcome.row.売上,outcome.row.客数,outcome.row.買上点数,outcome.row.廃棄金額])
    .toEqual([0,0,0,0]);
  expect(Object.values(outcome.row.haiki).every(value=>value===0)).toBe(true);
  expect(outcome.row).not.toHaveProperty('storeMemo');
  expect([outcome.row.weather,outcome.row.tempMaxC,outcome.row.tempMinC])
    .toEqual(['晴',32,20]);
  expect(outcome.liveRow.weather).toBe('晴');
  expect(outcome.other).toEqual(target.initialOther);
  expect(outcome.local).toEqual(target.localEvents);
  expect(outcome.global).toEqual(target.globalEvents);
});

test('FICTIONAL postcommit exception is propagated unchanged and leaves HELD',async({page})=>{
  await openFictionalQuick(page);
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      const saved=original.apply(this,arguments);
      throw new Error('FICTIONAL Quick clear postcommit failure');
    };
    let errorName;
    try{clearTodayData();}catch(error){errorName=error.name;}
    const v=window.__quickFictional;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {errorName,status:InsightQuickClearObserverV0.getStatus(),
      row:saved.stores.fictional_quick_store.data[v.fy][v.month][v.day-1],
      local:saved.stores.fictional_quick_store.events,
      global:saved.eventManagement.events,
      alerts:window.__quickAlerts};
  });
  expect(out.errorName).toBe('InsightPersistError');
  expect(out.status.state).toBe('HELD');
  expect(out.status.activeCount).toBe(0);
  expect(out.row.売上).toBe(0);
  expect(out.row.weather).toBe('晴');
  const events=await page.evaluate(()=>window.__quickFictional);
  expect(out.local).toEqual(events.localEvents);
  expect(out.global).toEqual(events.globalEvents);
  expect(out.alerts.join(' ')).toContain('データを保存できませんでした。');
});

test('FICTIONAL missing observer does not stop the original Quick clear',async({page})=>{
  await openFictionalQuick(page,{missingObserver:true});
  const out=await page.evaluate(()=>{
    const before=InsightQuickClearObserverV0.getStatus();
    clearTodayData();
    const v=window.__quickFictional;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {before,status:InsightQuickClearObserverV0.getStatus(),
      row:saved.stores.fictional_quick_store.data[v.fy][v.month][v.day-1]};
  });
  expect(out.before.state).toBe('UNAVAILABLE');
  expect(out.status.state).toBe('UNAVAILABLE');
  expect(out.row.客数).toBe(0);
  expect(out.row.weather).toBe('晴');
});

test('FICTIONAL cancel does not mutate or write',async({page})=>{
  await openFictionalQuick(page,{cancel:true});
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    let writes=0;
    InsightStorage.persistCurrent=function(){writes++;return original.apply(this,arguments);};
    clearTodayData();
    const v=window.__quickFictional;
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {writes,status:InsightQuickClearObserverV0.getStatus(),
      row:saved.stores.fictional_quick_store.data[v.fy][v.month][v.day-1]};
  });
  expect(out.writes).toBe(0);
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.row.売上).toBe(42);
  expect(out.row.storeMemo).toBe('FICTIONAL remove memo');
});

test('FICTIONAL missing selected row remains outside the registered operation',async({page})=>{
  await openFictionalQuick(page);
  const out=await page.evaluate(()=>{
    const v=window.__quickFictional;
    store.data[v.fy][v.month][v.day-1]=null;
    const original=InsightStorage.persistCurrent;
    let writes=0;
    InsightStorage.persistCurrent=function(){writes++;return original.apply(this,arguments);};
    clearTodayData();
    return {writes,status:InsightQuickClearObserverV0.getStatus(),
      row:store.data[v.fy][v.month][v.day-1]};
  });
  expect(out.writes).toBe(0);
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.row).toBeNull();
});
