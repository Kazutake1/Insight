const {test,expect}=require('@playwright/test');

async function openFictionalQuickSave(page,{missingObserver=false,cancel=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(missingObserver){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL operation observer missing'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightQuickSaveObserverV0&&
    typeof window.InsightQuickSaveObserverV0.getStatus==='function'&&
    typeof window.saveQuick==='function'&&window.InsightEvents&&window.InsightDateContext);
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

async function prepareForm(page,options={}){
  await openFictionalQuickSave(page,options);
  await page.locator('#nav0').click();
  await page.evaluate(()=>{
    const v=window.__quickFictional;
    InsightDateContext.setSelectedDate(InsightDateContext.parseIso(v.date));
    quickEditDay=v.day;
    renderQuickNav();renderQuickPage();
    document.getElementById('qi_売上').value='123';
    document.getElementById('qi_客数').value='456';
    const items=document.getElementById('qi_買上点数');
    items.value='8';items.dispatchEvent(new Event('input',{bubbles:true}));
    HAIKI_CATS.forEach((c,i)=>{document.getElementById('qi_h_'+c).value=i===0?'10':'0';});
    document.getElementById('qi_storeMemo').value='FICTIONAL saved memo';
    for(const [id,value] of [['qi_tempMaxC','25'],['qi_tempMinC','15']]){
      const el=document.getElementById(id);el.value=value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }
    setWeather('晴');
    window.__saveWrites=0;
    window.__saveSamples=[];
  });
}

async function readSave(page){
  return page.evaluate(()=>{
    const v=window.__quickFictional,saved=JSON.parse(localStorage.getItem('insight_v11'));
    const s=saved.stores.fictional_quick_store;
    return {status:InsightQuickSaveObserverV0.getStatus(),samples:window.__saveSamples,
      writes:window.__saveWrites,alerts:window.__quickAlerts,
      row:s.data[v.fy][v.month][v.day-1],
      other:s.data[v.fy][v.month][v.otherIndex],local:s.events,global:saved.eventManagement.events};
  });
}

test('FICTIONAL actual Quick save button stays ACTIVE across shared weather/core/memo/temperature writes',async({page})=>{
  await prepareForm(page);
  const initial=await page.evaluate(()=>window.__quickFictional);
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__saveWrites++;
      window.__saveSamples.push(InsightQuickSaveObserverV0.getStatus());
      const value=original.apply(this,arguments);
      window.__saveSamples.push(InsightQuickSaveObserverV0.getStatus());
      return value;
    };
  });
  await page.locator('#quickSaveBtn').click();
  const out=await readSave(page);
  expect(out.writes).toBe(4);
  expect(out.samples).toHaveLength(8);
  expect(out.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(out.status).toMatchObject({scope:'quick-save-core-and-sync-after-hooks-only',state:'IDLE_OBSERVED',activeCount:0});
  expect([out.row.売上,out.row.客数,out.row.買上点数,out.row.廃棄金額]).toEqual([123,456,8,10]);
  expect([out.row.tempMaxC,out.row.tempMinC,out.row.storeMemo]).toEqual([25,15,'FICTIONAL saved memo']);
  expect(out.other).toEqual(initial.initialOther);
  expect(out.local).toEqual(initial.localEvents);
  expect(out.global).toEqual(initial.globalEvents);
});

test('FICTIONAL temperature postcommit error retains handled warning and sticky HELD without retry',async({page})=>{
  await prepareForm(page);
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__saveWrites++;
      const value=original.apply(this,arguments);
      if(window.__saveWrites===4)throw Error('FICTIONAL final temperature postcommit error');
      return value;
    };
    let thrown=null;
    try{saveQuick();}catch(error){thrown=error.name;}
    return {thrown,status:InsightQuickSaveObserverV0.getStatus()};
  });
  expect(out.thrown).toBeNull();
  expect(out.status).toMatchObject({state:'HELD',activeCount:0});
  const saved=await readSave(page);
  expect(saved.writes).toBe(4);
  expect(saved.row.tempMaxC).toBe(25);
  expect(saved.alerts.join(' ')).toContain('気温データを保存できませんでした。');
  await page.evaluate(()=>{saveQuick();});
  expect((await readSave(page)).status.state).toBe('HELD');
});

test('FICTIONAL second core write failure preserves original persist guard propagation',async({page})=>{
  await prepareForm(page);
  const out=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__saveWrites++;
      const value=original.apply(this,arguments);
      if(window.__saveWrites===2)throw Error('FICTIONAL core postcommit error');
      return value;
    };
    let name;
    try{saveQuick();}catch(error){name=error.name;}
    return {name,status:InsightQuickSaveObserverV0.getStatus()};
  });
  expect(out.name).toBe('InsightPersistError');
  expect(out.status).toMatchObject({state:'HELD',activeCount:0});
  const saved=await readSave(page);
  expect(saved.writes).toBe(2);
  expect(saved.row.売上).toBe(123);
  expect(saved.row.storeMemo).toBe('FICTIONAL remove memo');
  expect(saved.alerts.join(' ')).toContain('データを保存できませんでした。');
});

test('FICTIONAL invalid temperature cancels before any save observation or persistence',async({page})=>{
  await prepareForm(page);
  const before=await page.evaluate(()=>InsightQuickSaveObserverV0.getStatus());
  await page.evaluate(()=>{
    const el=document.getElementById('qi_tempMaxC');el.value='1';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){window.__saveWrites++;return original.apply(this,arguments);};
  });
  await page.locator('#quickSaveBtn').click();
  const out=await readSave(page);
  expect(out.writes).toBe(0);
  expect(out.status.epoch).toBe(before.epoch);
  expect(out.status.state).toBe('IDLE_OBSERVED');
  expect(out.row.売上).toBe(42);
  expect(out.alerts.join(' ')).toContain('最高気温は最低気温以上');
});

test('FICTIONAL absent observer leaves original multi-stage saving available',async({page})=>{
  await prepareForm(page,{missingObserver:true});
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){window.__saveWrites++;return original.apply(this,arguments);};
  });
  await page.locator('#quickSaveBtn').click();
  const out=await readSave(page);
  expect(out.status.state).toBe('UNAVAILABLE');
  expect(out.writes).toBe(4);
  expect(out.row.売上).toBe(123);
  expect(out.row.tempMinC).toBe(15);
  expect(out.row.storeMemo).toBe('FICTIONAL saved memo');
});
