const {test,expect}=require('@playwright/test');

async function openSales(page,{observerMissing=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'observer unavailable'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.waitForFunction(()=>window.InsightSalesCount&&
    typeof window.InsightSalesCount.getForecastOperationStatus==='function');
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);
}

function getStatus(page){return page.evaluate(()=>window.InsightSalesCount.getForecastOperationStatus());}

test('fictional sales save observes the whole save callback, not just storage write',async({page})=>{
  await openSales(page);
  expect((await getStatus(page)).state).toBe('IDLE_OBSERVED');
  await page.evaluate(()=>{
    window.__operationSamples=[];
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      const serialized=original(snapshot);
      // Storage has committed, but the outer business callback has not yet applied its live state.
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      return serialized;
    };
  });
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('17');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  const statuses=await page.evaluate(()=>window.__operationSamples);
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every(s=>s.state==='ACTIVE'&&s.scope==='registered-operations-only'&&s.activeCount>=1)).toBe(true);
  expect((await getStatus(page)).state).toBe('IDLE_OBSERVED');
  expect((await getStatus(page)).activeCount).toBe(0);
});

test('fictional category save observes the outer dialog save callback',async({page})=>{
  await openSales(page);
  await page.evaluate(()=>{
    window.__operationSamples=[];
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      const serialized=original(snapshot);
      // Storage has committed, but the outer business callback has not yet applied its live state.
      window.__operationSamples.push(InsightSalesCount.getForecastOperationStatus());
      return serialized;
    };
  });
  await page.locator('#scManage').click();
  const dialog=page.locator('dialog.sc-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-save]').click();
  await expect(dialog).toHaveCount(0);
  const samples=await page.evaluate(()=>window.__operationSamples);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect((await getStatus(page)).state).toBe('IDLE_OBSERVED');
});

test('postcommit exception leaves observer HELD and keeps original save error handling',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  await openSales(page);
  await page.evaluate(()=>{
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(next){
      original(next); // FICTIONAL successful disk write, followed by a failure before memory apply.
      throw new Error('FICTIONAL after-write apply failure');
    };
    window.alertMessages=[];
    window.alert=message=>window.alertMessages.push(String(message));
  });
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('233');
  await page.locator('#scSave').click();
  const result=await page.evaluate(()=>{
    const s=InsightSalesCount.getForecastOperationStatus();
    return {state:s.state,activeCount:s.activeCount,
      persisted:localStorage.getItem('insight_v11')?.includes('233'),
      alerts:window.alertMessages,
      buttonDisabled:document.getElementById('scSave').disabled};
  });
  expect(result.state).toBe('HELD');
  expect(result.activeCount).toBe(0);
  expect(result.persisted).toBe(true);
  expect(result.buttonDisabled).toBe(false);
  expect(result.alerts.join(' ')).toContain('FICTIONAL after-write apply failure');
  expect(errors).toEqual([]);
});

test('missing observer script cannot prevent existing fictional sales saving',async({page})=>{
  await openSales(page,{observerMissing:true});
  expect((await getStatus(page)).state).toBe('UNAVAILABLE');
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('41');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect((await getStatus(page)).state).toBe('UNAVAILABLE');
});

test('invalid category input causes sticky HELD while the original dialog remains open',async({page})=>{
  const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());return d.accept();});
  await openSales(page);
  await page.locator('#scManage').click();
  const d=page.locator('dialog.sc-dialog');
  await expect(d).toBeVisible();
  const names=d.locator('.sc-category-row input[aria-label="カテゴリー名"]');
  await expect(names).toHaveCount(3);
  await names.nth(1).fill(await names.nth(0).inputValue());
  await d.locator('[data-save]').click();
  expect(dialogs.join(' ')).toContain('同じカテゴリー名');
  expect((await getStatus(page)).state).toBe('HELD');
  await expect(d).toBeVisible();
});

/*
 * FICTIONAL fault-injection cases for the registered sales-save adapter.
 * An invalid observer must never suppress an otherwise valid legacy save.
 */
async function saveWithFaultyObserver(page,mode){
  const injected = `(function(){
    const fault=${JSON.stringify(mode)};
    let count=0,epoch=1;
    const witness={
      initialize:()=>true,
      begin:()=>{
        if(fault==='begin-throws')throw new Error('fictional begin fault');
        count+=1;epoch+=1;
        return fault==='bad-ticket'?1:Object.freeze({});
      },
      end:()=>{
        if(fault==='end-throws')throw new Error('fictional end fault');
        count-=1;epoch+=1;return true;
      },
      invalidate:()=>true,
      status:()=>{
        if(fault==='status-throws'&&count>0)throw new Error('fictional status fault');
        if(fault==='idle-with-active'&&count>0)
          return {scope:'registered-operations-only',state:'IDLE_OBSERVED',activeCount:0,epoch};
        return {scope:'registered-operations-only',
          state:count?'ACTIVE':'IDLE_OBSERVED',activeCount:count,epoch};
      }
    };
    window.InsightOperationObserverV0={createOperationObserver:()=>witness};
  })();`;
  await page.route('**/insight_operation_observer_v0.js*',route=>route.fulfill({
    status:200,contentType:'application/javascript',body:injected
  }));
  await openSales(page);
  await page.evaluate(()=>{
    window.__fictionalFaultSave={writes:0,during:null};
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(snapshot){
      window.__fictionalFaultSave.writes+=1;
      window.__fictionalFaultSave.during=InsightSalesCount.getForecastOperationStatus();
      return original.apply(this,arguments);
    };
  });
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await input.fill('71');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  return page.evaluate(()=>({
    writes:window.__fictionalFaultSave.writes,
    during:window.__fictionalFaultSave.during,
    final:InsightSalesCount.getForecastOperationStatus()
  }));
}

for(const fault of ['bad-ticket','idle-with-active','begin-throws','end-throws','status-throws']){
  test('fictional broken observer '+fault+' keeps one save and never reports false idle',async({page})=>{
    const result=await saveWithFaultyObserver(page,fault);
    expect(result.writes).toBe(1);
    expect(result.final.scope).toBe('registered-operations-only');
    expect(result.final.state).toBe('HELD');
    // A throwing end can still be ACTIVE during the saved write; it becomes HELD afterward.
    if(fault!=='end-throws')expect(result.during.state).toBe('HELD');
    else expect(result.during.state).toBe('ACTIVE');
    expect((await getStatus(page)).state).toBe('HELD');
  });
}

test('fictional registered-year sales period change stays ACTIVE through its UI notification',async({page})=>{
  await openSales(page);
  const result=await page.evaluate(()=>{
    const first=InsightSalesCount.getPeriod();
    const otherMonth=first.month===12?11:first.month+1;
    const samples=[];
    const before=window.dispatchEvent;
    window.dispatchEvent=function(evt){
      if(evt.type==='insight:sales-count-period-change')
        samples.push(InsightSalesCount.getForecastOperationStatus());
      return before.apply(this,arguments);
    };
    try{
      const ok=InsightSalesCount.setPeriod(first.year,otherMonth);
      return {ok,period:InsightSalesCount.getPeriod(),samples,
        final:InsightSalesCount.getForecastOperationStatus()};
    }finally{window.dispatchEvent=before;}
  });
  expect(result.ok).toBe(true);
  expect(result.period.month).not.toBe(0);
  expect(result.samples.length).toBe(1);
  expect(result.samples[0].state).toBe('ACTIVE');
  expect(result.samples[0].activeCount).toBe(1);
  expect(result.final.state).toBe('IDLE_OBSERVED');
});

test('fictional unregistered-year promotion remains ACTIVE during write and post-write',async({page})=>{
  await openSales(page);
  const result=await page.evaluate(()=>{
    const existing=allStores.stores[allStores.current].years.map(Number);
    const newYear=String(Math.max(...existing)+1);
    const samples=[];
    const confirmBefore=window.confirm,setItemBefore=Storage.prototype.setItem;
    window.confirm=()=>true;
    // YearManager.transaction uses the module-private writeSnapshot closure,
    // not the public InsightStorage.writeSnapshot property. Intercept only
    // this fictional browser's native write boundary; do not inspect data.
    Storage.prototype.setItem=function(key){
      if(key==='insight_v11')samples.push(InsightSalesCount.getForecastOperationStatus());
      const committed=setItemBefore.apply(this,arguments);
      if(key==='insight_v11')samples.push(InsightSalesCount.getForecastOperationStatus());
      return committed;
    };
    try{
      const ok=InsightSalesCount.setPeriod(newYear,1);
      return {ok,samples,year:InsightSalesCount.getPeriod().year,
        registered:allStores.stores[allStores.current].years.map(String).includes(newYear),
        final:InsightSalesCount.getForecastOperationStatus()};
    }finally{window.confirm=confirmBefore;Storage.prototype.setItem=setItemBefore;}
  });
  expect(result.ok).toBe(true);
  expect(result.registered).toBe(true);
  expect(result.samples.length).toBeGreaterThanOrEqual(2);
  expect(result.samples.every(s=>s.state==='ACTIVE'&&s.activeCount>=1)).toBe(true);
  expect(result.final.state).toBe('IDLE_OBSERVED');
});

test('fictional after-year-write UI failure remains HELD without masking the original error',async({page})=>{
  await openSales(page);
  const result=await page.evaluate(()=>{
    const existing=allStores.stores[allStores.current].years.map(Number);
    const newYear=String(Math.max(...existing)+1);
    const confirmBefore=window.confirm,replaceBefore=Element.prototype.replaceChildren;
    window.confirm=()=>true;
    Element.prototype.replaceChildren=function(){
      if(this.id==='scAverages')throw new Error('FICTIONAL period render failure');
      return replaceBefore.apply(this,arguments);
    };
    let error=null;
    try{InsightSalesCount.setPeriod(newYear,1);}
    catch(e){error=e&&e.message;}
    finally{window.confirm=confirmBefore;Element.prototype.replaceChildren=replaceBefore;}
    return {error,registered:allStores.stores[allStores.current].years.map(String).includes(newYear),
      final:InsightSalesCount.getForecastOperationStatus()};
  });
  expect(result.error).toBe('FICTIONAL period render failure');
  expect(result.registered).toBe(true);
  expect(result.final.state).toBe('HELD');
  expect(result.final.activeCount).toBe(0);
});
