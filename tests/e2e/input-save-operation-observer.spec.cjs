const {test,expect}=require('@playwright/test');

async function openFictionalInput(page,{type='sales',missingObserver=false,weather=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(missingObserver){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer missing'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightInputSaveObserverV0&&
    typeof window.InsightInputSaveObserverV0.getStatus==='function'&&
    typeof window.saveInput==='function'&&window.InsightEvents);
  await page.locator(type==='sales'?'#nav2':type==='kyaku'?'#nav3':'#nav4').click();
  await page.evaluate(({type,weather})=>{
    const year=editYear[type],month=editMonth[type],mIdx=MONTHS.indexOf(month);
    const template=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    template.name='FICTIONAL Input Save Store';
    if(!template.data)template.data={};
    if(!template.data[year])template.data[year]={};
    template.data[year][month]=blankMonthData(mIdx,year);
    const rows=template.data[year][month],target=rows[0],other=rows[1];
    target.売上=42;target.客数=77;target.買上点数=7;
    target.廃棄金額=900;target.haiki[HAIKI_CATS[0]]=900;
    target.storeMemo='FICTIONAL memo';target.stockout=true;
    target.tempMaxC=32;target.tempMinC=20;
    other.売上=99;other.客数=88;other.買上点数=9;
    const localEvent={id:'fictional_local_evt',type:'nearby',scope:'store',
      startDate:'2026-10-01',endDate:'2026-10-01',
      snapshot:{version:1,title:'FICTIONAL nearby',note:'local-only'}};
    const globalEvent={id:'fictional_global_evt',type:'sale',scope:'global',
      startDate:'2026-10-01',endDate:'2026-10-01',
      snapshot:{version:1,title:'FICTIONAL sale',note:'global-only',
        sale:{category:'おにぎり',method:'amount',params:{amount:50}}}};
    template.events=[localEvent];
    allStores={current:'fictional_input_store',stores:{fictional_input_store:template},
      eventManagement:{version:1,presets:[],events:[globalEvent]}};
    store=allStores.stores[allStores.current];
    InsightEvents.validate(allStores);
    InsightStorage.persistCurrent(allStores);
    drafts[type]=JSON.parse(JSON.stringify(rows));
    if(type==='sales')drafts[type][0].売上=123;
    if(type==='kyaku')drafts[type][0].客数=456;
    if(type==='haiki')drafts[type][0].haiki[HAIKI_CATS[0]]=30;
    if(weather)drafts[type][0].weather='晴';
    window.__inputFixture={type,year,month,other:JSON.parse(JSON.stringify(other)),
      local:JSON.parse(JSON.stringify(template.events)),
      global:JSON.parse(JSON.stringify(allStores.eventManagement.events))};
    window.__inputWrites=0;
    window.__inputSamples=[];
    window.__inputAlerts=[];
    window.alert=message=>window.__inputAlerts.push(String(message));
  },{type,weather});
}

async function readInput(page){
  return page.evaluate(()=>{
    const f=window.__inputFixture,snapshot=JSON.parse(localStorage.getItem('insight_v11'));
    const s=snapshot.stores.fictional_input_store;
    return {status:InsightInputSaveObserverV0.getStatus(),
      samples:window.__inputSamples,writes:window.__inputWrites,
      alerts:window.__inputAlerts,
      row:s.data[f.year][f.month][0],other:s.data[f.year][f.month][1],
      local:s.events,global:snapshot.eventManagement.events,
      live:store.data[f.year][f.month][0]};
  });
}

for(const [type,button] of [['sales','#salesSaveBtn'],['kyaku','#kyakuSaveBtn'],['haiki','#haikiSaveBtn']]){
  test('FICTIONAL '+type+' actual button observes both input save writes and preserved fields',async({page})=>{
    await openFictionalInput(page,{type});
    const baseline=await page.evaluate(()=>window.__inputFixture);
    await page.evaluate(()=>{
      const original=InsightStorage.persistCurrent;
      InsightStorage.persistCurrent=function(){
        window.__inputWrites++;
        window.__inputSamples.push(InsightInputSaveObserverV0.getStatus());
        const value=original.apply(this,arguments);
        window.__inputSamples.push(InsightInputSaveObserverV0.getStatus());
        return value;
      };
    });
    await page.locator(button).click();
    const out=await readInput(page);
    expect(out.writes).toBe(2);
    expect(out.samples).toHaveLength(4);
    expect(out.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
    expect(out.status).toMatchObject({scope:'input-month-save-core-and-sync-after-hooks-only',state:'IDLE_OBSERVED',activeCount:0});
    expect(out.row.storeMemo).toBe('FICTIONAL memo');
    expect(out.row.stockout).toBe(true);
    expect([out.row.tempMaxC,out.row.tempMinC]).toEqual([32,20]);
    expect(out.row.売上).toBe(type==='sales'?123:42);
    expect(out.row.客数).toBe(type==='kyaku'?456:77);
    expect(out.row.廃棄金額).toBe(type==='haiki'?30:900);
    expect(out.other).toEqual(baseline.other);
    expect(out.local).toEqual(baseline.local);
    expect(out.global).toEqual(baseline.global);
  });
}

test('FICTIONAL shared weather adds a write but stays inside the same save operation',async({page})=>{
  await openFictionalInput(page,{type:'sales',weather:true});
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__inputWrites++;
      window.__inputSamples.push(InsightInputSaveObserverV0.getStatus());
      const value=original.apply(this,arguments);
      window.__inputSamples.push(InsightInputSaveObserverV0.getStatus());
      return value;
    };
  });
  await page.locator('#salesSaveBtn').click();
  const out=await readInput(page);
  expect(out.writes).toBe(3);
  expect(out.samples).toHaveLength(6);
  expect(out.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(out.row.weather).toBe('晴');
  expect(out.status.state).toBe('IDLE_OBSERVED');
});

for(const failureWrite of [1,2]){
  test('FICTIONAL postcommit failure at input write '+failureWrite+' remains HELD without retry',async({page})=>{
    await openFictionalInput(page,{type:'sales'});
    const result=await page.evaluate(({failureWrite})=>{
      const original=InsightStorage.persistCurrent;
      InsightStorage.persistCurrent=function(){
        window.__inputWrites++;
        const value=original.apply(this,arguments);
        if(window.__inputWrites===failureWrite)throw Error('FICTIONAL input postcommit failure');
        return value;
      };
      let errorName=null;
      try{saveInput('sales');}catch(e){errorName=e.name;}
      return {errorName,status:InsightInputSaveObserverV0.getStatus()};
    },{failureWrite});
    expect(result.errorName).toBe('InsightPersistError');
    expect(result.status).toMatchObject({state:'HELD',activeCount:0});
    const out=await readInput(page);
    expect(out.writes).toBe(failureWrite);
    expect(out.row.売上).toBe(123);
    expect(out.alerts.join(' ')).toContain('保存結果を確認できないため');
  });
}

test('FICTIONAL before hook cancel never starts input saving',async({page})=>{
  await openFictionalInput(page,{type:'sales'});
  const outcome=await page.evaluate(()=>{
    const before=InsightInputSaveObserverV0.getStatus();
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){window.__inputWrites++;return original.apply(this,arguments);};
    InsightHooks.on('input:save:before','fictional-stop',ctx=>{ctx.result='cancelled';return false;},1);
    const value=saveInput('sales'),after=InsightInputSaveObserverV0.getStatus();
    return {value,before,after,writes:window.__inputWrites};
  });
  expect(outcome.value).toBe('cancelled');
  expect(outcome.writes).toBe(0);
  expect(outcome.after.epoch).toBe(outcome.before.epoch);
  expect(outcome.after.state).toBe('IDLE_OBSERVED');
});

test('FICTIONAL observer 404 does not stop the two existing input writes',async({page})=>{
  await openFictionalInput(page,{type:'kyaku',missingObserver:true});
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){window.__inputWrites++;return original.apply(this,arguments);};
  });
  await page.locator('#kyakuSaveBtn').click();
  const out=await readInput(page);
  expect(out.status.state).toBe('UNAVAILABLE');
  expect(out.writes).toBe(2);
  expect(out.row.客数).toBe(456);
  expect(out.row.storeMemo).toBe('FICTIONAL memo');
});

test('FICTIONAL actual input save button opens native guarded postcommit warning and reloads bytes',async({page})=>{
  // Capture browser alert before the fictional input fixture installs its spy.
  // Unlike #302, this uses an actual user-facing Playwright dialog event.
  await page.addInitScript(()=>{
    window.__fictionalNativeAlert=window.alert.bind(window);
  });
  await openFictionalInput(page,{type:'sales'});
  const dialogs=[];
  page.on('dialog',async dialog=>{
    dialogs.push({type:dialog.type(),message:dialog.message()});
    await dialog.accept();
  });
  const baseline=await page.evaluate(()=>{
    window.alert=window.__fictionalNativeAlert;
    const raw=localStorage.getItem('insight_v11');
    const nativeSetItem=Storage.prototype.setItem;
    window.__fictionalDialogPrimaryWrites=0;
    let throwOnce=true;
    Storage.prototype.setItem=function(key,value){
      const result=nativeSetItem.call(this,key,value);
      if(key==='insight_v11'){
        window.__fictionalDialogPrimaryWrites++;
        if(throwOnce){
          throwOnce=false;
          throw Error('FICTIONAL input button postcommit failure');
        }
      }
      return result;
    };
    return raw;
  });
  // Click the actual Sales input save button; no direct persist/saveInput API call.
  await page.locator('#salesSaveBtn').click();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0].type).toBe('alert');
  expect(dialogs[0].message).toContain('保存結果を確認できないため');
  expect(dialogs[0].message).toContain('追加編集・再保存は控えてください');
  expect(dialogs[0].message).toContain('入力内容を控えてからInsightを手動で再読み込み');
  expect(dialogs[0].message).not.toContain('現在の変更は保存されていません');
  const fault=await page.evaluate(()=>{
    const f=window.__inputFixture;
    const raw=localStorage.getItem('insight_v11');
    const persisted=JSON.parse(raw).stores.fictional_input_store;
    return {
      raw,writes:window.__fictionalDialogPrimaryWrites,
      guardInstalled:window.persist.__insightPersistGuard===true,
      saved:persisted.data[f.year][f.month][0].売上,
      other:persisted.data[f.year][f.month][1].売上,
      status:InsightInputSaveObserverV0.getStatus(),
      report:InsightStorage.reportState(),
      restoreHeld:InsightStorage.snapshotWritesHeld()
    };
  });
  expect(fault.raw).not.toBe(baseline);
  expect(fault).toMatchObject({
    writes:1,guardInstalled:true,saved:123,other:99,
    status:{state:'HELD',activeCount:0},
    report:{held:true,conflict:true},restoreHeld:false
  });
  // A manual document reload must not re-run the fixture or overwrite saved 123.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightStorage&&
    typeof allStores!=='undefined'&&allStores&&
    allStores.stores&&allStores.stores.fictional_input_store);
  const recovered=await page.evaluate(({year,month})=>{
    const raw=localStorage.getItem('insight_v11');
    return {
      raw,
      saved:InsightStorage.readSnapshot().stores.fictional_input_store.data[year][month][0].売上,
      live:allStores.stores.fictional_input_store.data[year][month][0].売上,
      report:InsightStorage.reportState(),
      restoreHeld:InsightStorage.snapshotWritesHeld()
    };
  },{year:await page.evaluate(()=>editYear.sales),month:await page.evaluate(()=>editMonth.sales)});
  expect(recovered).toMatchObject({
    raw:fault.raw,saved:123,live:123,
    report:{held:false,conflict:false},restoreHeld:false
  });
});
