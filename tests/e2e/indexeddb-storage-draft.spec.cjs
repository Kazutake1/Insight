const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
require('./helpers/verified-chart.cjs')(test);
test.beforeEach(async({page})=>{
  await page.addInitScript(({build,features})=>{
    if(!location.pathname.endsWith('-fixture'))return;
    window.__INSIGHT_SHELL_VERSION__=build;
    window.__INSIGHT_FEATURE_SIGNATURE__=features;
  },{build:'20261125-print-holiday-build-134',features:'2a1f565f'});
  await page.route(/https:\/\/(www\.jma\.go\.jp|[^/]*api\.open-meteo\.com)\//,route=>route.abort());
});
// The fixture server uses HTTP; keep the rest of the shell's CSP in effect.
const allowFixtureHttp=html=>html.replace(/;?\s*upgrade-insecure-requests/g,'');
async function routeMigrationPage(page,pattern='**/Index.html*'){
  await page.route(pattern,async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:allowFixtureHttp(await response.text())});
  });
}
async function waitForMigrationChecks(page){
  await page.waitForFunction(()=>window.InsightMigrationBackupV1&&window.InsightBackupPasswordV1&&
    window.InsightQuickDateNavV1&&window.InsightSalesCount?.hasUnsavedInput&&window.InsightInputDayNav?.hasUnsavedInput&&
    window.InsightWeatherLocation?.hasPendingSearch&&window.InsightWeatherBulk?.getWeatherBulkOperationStatus&&
    window.InsightWeatherTemperatureAuto?.hasPendingFetch()===false);
}



async function quickInputBlocksUnload(page){
  return page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})));
}

const quickDraftChanges={
  'weather only':[['#qWeatherCompactTrigger .qwc-label','雨']],
  'maximum temperature only':[['#qi_tempMaxC','25']],
  'minimum temperature only':[['#qi_tempMinC','7']],
  'memo only':[['#qi_storeMemo','変更した架空メモ']],
  'sales only':[['#qi_売上','456']],
  'customer count only':[['#qi_客数','222']],
  'items per customer only':[['#qi_買上点数','3.75']],
  'waste only':[['waste','123']],
  'multiple fields':[['#qWeatherCompactTrigger .qwc-label','雨'],['#qi_tempMinC','7'],['#qi_storeMemo','変更した架空メモ']]
};

for(const [name,fields] of Object.entries(quickDraftChanges)){
  test('isolated Quick draft guards date changes and unload with '+name,async({page})=>{
    const seed=await openQuickInputPreview(page);
    const selectedDate=page.locator('#iqdDateInput');
    await expect(selectedDate).toHaveValue(seed.iso);
    expect(await quickInputBlocksUnload(page)).toBe(false);
    await page.evaluate(()=>{
      window.quickDateDecisions=[];
      window.allowQuickDateChange=false;
      window.confirm=message=>{quickDateDecisions.push(message);return allowQuickDateChange;};
    });
    for(const [field,value] of fields){
      if(field.startsWith('#qWeatherCompactTrigger')){
        await page.locator('#qWeatherCompactTrigger').click();
        await page.locator('#qWeatherCompactMenu [data-wx="'+value+'"]').click();
      }else{
        const selector=field==='waste'?'[id="qi_h_'+seed.category+'"]':field;
        await page.locator(selector).fill(value);
      }
    }
    expect.soft(await quickInputBlocksUnload(page)).toBe(true);
    await page.locator('#iqdPrev').click();
    expect(await page.evaluate(()=>quickDateDecisions)).toEqual([
      '未保存の入力があります。\n保存せずに別の日付へ移動しますか？'
    ]);
    await expect(selectedDate).toHaveValue(seed.iso);
    for(const [field,value] of fields){
      const selector=field==='waste'?'[id="qi_h_'+seed.category+'"]':field;
      const input=page.locator(selector);
      if(field.startsWith('#qWeatherCompactTrigger'))await expect(input).toHaveText(value);
      else await expect(input).toHaveValue(value);
    }

    await page.evaluate(()=>{allowQuickDateChange=true;});
    await page.locator('#iqdPrev').click();
    await expect(selectedDate).toHaveValue(seed.year+'-06-11');
    expect(await quickInputBlocksUnload(page)).toBe(false);
    expect(await page.evaluate(()=>quickDateDecisions.length)).toBe(2);
    await selectedDate.fill(seed.iso);
    await expect(selectedDate).toHaveValue(seed.iso);
    expect(await page.evaluate(()=>quickDateDecisions.length)).toBe(2);
    expect(await quickInputBlocksUnload(page)).toBe(false);
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read()))
      .toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

test('isolated Quick draft is clean after reverting and protects a draft that cannot be read',async({page})=>{
  await openQuickInputPreview(page);
  const trigger=page.locator('#qWeatherCompactTrigger');
  await trigger.click();
  await page.locator('#qWeatherCompactMenu [data-wx="雨"]').click();
  expect(await quickInputBlocksUnload(page)).toBe(true);
  await trigger.click();
  await page.locator('#qWeatherCompactMenu [data-wx="曇"]').click();
  expect(await quickInputBlocksUnload(page)).toBe(false);
  await page.evaluate(()=>document.getElementById('qi_storeMemo').remove());
  expect(await quickInputBlocksUnload(page)).toBe(true);
  expect(await page.evaluate(()=>InsightQuickDateNavV1.hasUnsavedInput())).toBe(true);
});


async function fillCombinedInput(input,value){
  await input.click();
  await input.fill(value);
}

function committedInput(page){
  return page.evaluate(()=>InsightIndexedDBStorageV1.read());
}

test('combined input session shares four saves and guards both destinations and the store change',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
  const expected=quickExpectedSnapshot(seed,true);
  const row=expected.stores[seed.active].data[seed.year][seed.month][seed.day-1];
  const quickStatus=page.locator('#quickSaveBtn + [role=status]');
  await editQuickInput(page,seed.category);
  await page.evaluate(()=>{
    window.combinedPrompts=[];
    window.approveCombinedNavigation=false;
    window.confirm=msg=>{combinedPrompts.push(msg);return approveCombinedNavigation;};
  });
  await page.locator('#nav2').click();
  await expect(page.locator('#pageQuick')).toHaveClass(/show/);
  await expect(page.locator('#qi_storeMemo')).toHaveValue('架空の入力メモ');
  await expect(page.locator('#qWeatherCompactTrigger .qwc-label')).toHaveText('雨');
  expect(await page.evaluate(()=>combinedPrompts)).toEqual(['未保存の入力があります。\n保存せずに画面を移動しますか？']);
  expect(await quickInputBlocksUnload(page)).toBe(true);

  await page.locator('#quickSaveBtn').click();
  await expect(page.locator('#quickSaveBtn')).toBeEnabled();
  await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
  await expect(quickStatus).toBeEmpty();
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await page.locator('#nav2').click();
  await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
  const sales=page.locator('#sf_売上');
  await expect(sales).toHaveValue('456');
  await fillCombinedInput(sales,'777');
  await page.locator('#nav0').click();
  await expect(page.locator('#pageSales')).toHaveClass(/show/);
  await expect(sales).toHaveValue('777');
  expect(await page.evaluate(()=>combinedPrompts.length)).toBe(2);
  expect(await quickInputBlocksUnload(page)).toBe(true);

  await page.evaluate(()=>{
    const digest=crypto.subtle.digest,resume=[];
    window.combinedDigests=resume;
    crypto.subtle.digest=async function(...args){
      await new Promise(resolve=>resume.push(resolve));
      return digest.apply(this,args);
    };
    window.resumeCombinedSave=()=>{
      crypto.subtle.digest=digest;
      resume.forEach(resolve=>resolve());
    };
  });
  const reservation=await page.evaluate(()=>{
    window.combinedSave=saveInput('sales');
    const state=combinedPreview.getStatus().state;
    const route=gotoNav(0);
    const save=saveQuick();
    return {state,route,otherSave:save===undefined};
  });
  expect(reservation).toEqual({state:'ACTIVE',route:false,otherSave:true});
  await page.waitForFunction(()=>combinedDigests.length===2);
  await expect(page.locator('#salesSaveBtn')).toBeDisabled();
  expect(await page.evaluate(peer=>switchStore(peer),seed.peer)).toBe(false);
  expect(await page.evaluate(()=>InsightIndexedDBQuickInputPreviewV1.getStatus().state)).toBe('ACTIVE');
  await page.evaluate(()=>resumeCombinedSave());
  await expect(page.locator('#salesSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedSales')).toHaveCount(0);
  row.売上=777;
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});

  await page.locator('#nav3').click();
  const customer=page.locator('.kyaku-input[data-ri="'+(seed.day-1)+'"]');
  await expect(customer).toHaveValue('222');
  await fillCombinedInput(customer,'303');
  await page.locator('#kyakuSaveBtn').click();
  await expect(page.locator('#kyakuSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedKyaku')).toHaveCount(0);
  row.客数=303;
  expect(await committedInput(page)).toEqual({revision:3,snapshot:expected});

  await page.locator('#nav4').click();
  await page.evaluate(iso=>InsightInputDayNav.select('haiki',iso),seed.iso);
  const waste=page.locator('#haikiForm [data-hc="'+seed.category+'"]');
  await expect(waste).toHaveValue('123');
  await fillCombinedInput(waste,'404');
  await page.locator('#haikiSaveBtn').click();
  await expect(page.locator('#haikiSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedHaiki')).toHaveCount(0);
  row.haiki[seed.category]=404;
  row.廃棄金額=404;
  expect(await committedInput(page)).toEqual({revision:4,snapshot:expected});

  await page.locator('#nav0').click();
  await expect(page.locator('#iqdDateInput')).toHaveValue(seed.iso);
  await expect(page.locator('#qi_売上')).toHaveValue('777');
  await expect(page.locator('#qi_客数')).toHaveValue('303');
  await expect(page.locator('[id="qi_h_'+seed.category+'"]')).toHaveValue('404');
  await expect(page.locator('#qi_storeMemo')).toHaveValue('架空の入力メモ');
  expect(await quickInputBlocksUnload(page)).toBe(false);
  await page.locator('#storeSel').selectOption(seed.peer);
  await expect(page.locator('#storeSel')).toHaveValue(seed.active);
  await expect(page.locator('#storeSel + [role=status]')).toHaveText('試験用の店舗切替は月次入力画面で行ってください。');
  expect(await committedInput(page)).toEqual({revision:4,snapshot:expected});

  await page.locator('#nav2').click();
  await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
  await fillCombinedInput(sales,'999');
  await page.locator('#storeSel').selectOption(seed.peer);
  await expect(page.locator('#storeSel')).toHaveValue(seed.active);
  await expect(sales).toHaveValue('999');
  expect(await committedInput(page)).toEqual({revision:4,snapshot:expected});

  await page.evaluate(()=>{approveCombinedNavigation=true;});
  await page.locator('#storeSel').selectOption(seed.peer);
  await expect(page.locator('#storeSel')).toBeEnabled();
  await expect(page.locator('#storeSel')).toHaveValue(seed.peer);
  await expect(page.locator('#storeSel + [role=status]')).toBeEmpty();
  expected.current=seed.peer;
  expect(await committedInput(page)).toEqual({revision:5,snapshot:expected});
  await page.locator('#nav0').click();
  await page.locator('#iqdDateInput').fill(seed.iso);
  await expect(page.locator('#qi_売上')).toHaveValue('87');
  await expect(page.locator('#qi_storeMemo')).toHaveValue('別店舗の元メモ');
  expect(await quickInputBlocksUnload(page)).toBe(false);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('combined input session keeps a monthly draft and holds Quick after a competing revision',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
  await editQuickInput(page,seed.category);
  await page.locator('#quickSaveBtn').click();
  await expect(page.locator('#quickSaveBtn')).toBeEnabled();
  await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
  await expect(page.locator('#quickSaveBtn + [role=status]')).toBeEmpty();
  const expected=quickExpectedSnapshot(seed,true);
  await page.locator('#nav2').click();
  await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
  const sales=page.locator('#sf_売上');
  await fillCombinedInput(sales,'777');
  const other=await openStoreSwitchPeer(context);
  try{
    await other.evaluate(async peer=>{
      const api=InsightIndexedDBStorageV1,current=await api.read();
      current.snapshot.stores[peer].name='別タブの確定済み店舗名';
      await api.save(current.revision,current.snapshot);
    },seed.peer);
    await page.locator('#salesSaveBtn').click();
    await expect(page.locator('#salesSaveBtn + [role=status]'))
      .toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
    await expect(sales).toHaveValue('777');
    expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
    expect(await page.evaluate(()=>InsightIndexedDBQuickInputPreviewV1.getStatus().state)).toBe('HELD');
    expect(await page.evaluate(()=>gotoNav(0))).toBe(false);
    expect(await page.evaluate(peer=>switchStore(peer),seed.peer)).toBe(false);
    expect(await quickInputBlocksUnload(page)).toBe(true);
    await page.evaluate(()=>saveQuick());
    expect(await other.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
      .toMatchObject({state:'hold',observedRevision:2});
    expected.stores[seed.peer].name='別タブの確定済み店舗名';
    const record=await readStoreSwitchRecord(other);
    expect(record.revision).toBe(2);
    expect(JSON.parse(record.raw)).toEqual(expected);
    expect(JSON.parse(record.previous.raw)).toEqual(quickExpectedSnapshot(seed,true));
    expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await other.close();}
});

test('combined input session holds the monthly screens when Quick loses its save confirmation',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
  await page.locator('#nav2').click();
  await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
  await fillCombinedInput(page.locator('#sf_売上'),'777');
  await page.locator('#salesSaveBtn').click();
  await expect(page.locator('#salesSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedSales')).toHaveCount(0);
  const prior=JSON.parse(seed.raw);
  prior.stores[seed.active].data[seed.year][seed.month][seed.day-1].売上=777;
  expect(await committedInput(page)).toEqual({revision:1,snapshot:prior});
  await page.locator('#nav0').click();
  await expect(page.locator('#qi_売上')).toHaveValue('777');
  await editQuickInput(page,seed.category);
  await page.evaluate(()=>{
    const write=InsightStorage.writeMetadata;
    InsightStorage.writeMetadata=(key,value)=>{
      if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='active')
        throw new Error('Fictional lost Quick save confirmation');
      return write(key,value);
    };
  });
  await page.locator('#quickSaveBtn').click();
  await expect(page.locator('#quickSaveBtn + [role=status]'))
    .toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
  await expect(page.locator('#qi_売上')).toHaveValue('456');
  await expect(page.locator('#qi_storeMemo')).toHaveValue('架空の入力メモ');
  expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
  expect(await page.evaluate(()=>gotoNav(2))).toBe(false);
  expect(await page.evaluate(peer=>switchStore(peer),seed.peer)).toBe(false);
  await page.evaluate(()=>saveInput('sales'));
  const other=await openStoreSwitchPeer(context);
  try{
    expect(await other.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
      .toMatchObject({state:'hold',observedRevision:2,recovery:'save-verified'});
    const record=await readStoreSwitchRecord(other);
    expect(record.revision).toBe(2);
    expect(JSON.parse(record.raw)).toEqual(quickExpectedSnapshot(seed,true));
    expect(JSON.parse(record.previous.raw)).toEqual(prior);
    expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await other.close();}
});


test('combined input session preserves the draft at month and year boundaries',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
  await page.locator('#nav2').click();
  await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
  const sales=page.locator('#sf_売上'),button=page.locator('#salesSaveBtn');
  const status=page.locator('#salesSaveBtn + [role=status]');
  await button.click();
  await expect(status).toHaveText('保存する変更はありません。');
  await fillCombinedInput(sales,'9007199254740992');
  await button.click();
  await expect(status).toHaveText('売上の入力を確認してください。');
  await fillCombinedInput(sales,'777');
  await page.evaluate(()=>{
    window.periodPrompts=[];
    window.approvePeriodChange=false;
    window.confirm=message=>{periodPrompts.push(message);return approvePeriodChange;};
  });
  const choose=async(year,month)=>page.evaluate(([year,month])=>
    InsightInputPeriodControls.apply({type:'sales',pageId:'pageSales',label:'売上'},year,month),[year,month]);
  expect(await choose(Number(seed.year)-30,6)).toBe(false);
  await expect(status).toHaveText('試験中は登録済みの年度だけを表示できます。');
  expect(await choose(Number(seed.year),6)).toBe(true);
  await expect(sales).toHaveValue('777');
  expect(await page.evaluate(()=>periodPrompts)).toEqual([]);
  expect(await choose(Number(seed.year),7)).toBe(false);
  expect(await choose(Number(seed.year)+1,6)).toBe(false);
  expect(await page.evaluate(()=>periodPrompts.length)).toBe(2);
  await expect(sales).toHaveValue('777');

  await page.evaluate(()=>{approvePeriodChange=true;});
  expect(await choose(Number(seed.year),7)).toBe(true);
  await fillCombinedInput(sales,'888');
  await button.click();
  await expect(status).toHaveText('この期間は試験用の売上保存の対象外です。');
  expect(await choose(Number(seed.year)+1,6)).toBe(true);
  expect(await choose(Number(seed.year),6)).toBe(true);
  await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
  await expect(sales).toHaveValue('47');
  await page.locator('#nav0').click();
  await expect(page.locator('#iqdDateInput')).toHaveValue(seed.iso);
  const temp=page.locator('#qi_tempMinC');
  await temp.fill('');
  expect(await quickInputBlocksUnload(page)).toBe(true);
  await page.evaluate(()=>{approvePeriodChange=false;});
  await page.locator('#nav3').click();
  await expect(page.locator('#pageQuick')).toHaveClass(/show/);
  await expect(temp).toHaveValue('');
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const failure of ['quota','readback','tab close']){
  test('combined monthly save preserves recovery data after '+failure,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
    await page.locator('#nav2').click();
    await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
    const sales=page.locator('#sf_売上');
    await fillCombinedInput(sales,'777');
    const peer=await openStoreSwitchPeer(context);
    try{
      await page.evaluate(failure=>{
        if(failure==='quota'){
          const put=IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put=function(){
            IDBObjectStore.prototype.put=put;
            throw new DOMException('Fictional quota error','QuotaExceededError');
          };
          return;
        }
        const write=InsightStorage.writeMetadata;
        let writing=false;
        InsightStorage.writeMetadata=(key,value)=>{
          if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='writing')writing=true;
          return write(key,value);
        };
        const get=IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get=function(...args){
          const request=get.apply(this,args),tx=this.transaction;
          if(writing&&tx.mode==='readonly'&&tx.db.name==='insight-store-snapshots-v1'){
            IDBObjectStore.prototype.get=get;
            if(failure==='readback')request.addEventListener('success',()=>tx.abort());
            else{
              const oncomplete=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
              Object.defineProperty(tx,'oncomplete',{
                set(){oncomplete.set.call(this,()=>{window.combinedReadbackPaused=true;});}
              });
            }
          }
          return request;
        };
      },failure);
      const button=page.locator('#salesSaveBtn');
      await button.click();
      if(failure==='tab close')await page.waitForFunction(()=>window.combinedReadbackPaused===true);
      else await expect(page.locator('#salesSaveBtn + [role=status]'))
        .toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(sales).toHaveValue('777');
      await expect(button).toBeDisabled();
      expect(await page.evaluate(()=>combinedPreview.getStatus()))
        .toEqual({state:failure==='tab close'?'ACTIVE':'HELD',hasUnsavedInput:true});
      expect(await page.evaluate(()=>gotoNav(0))).toBe(false);
      expect(await page.evaluate(()=>InsightInputPeriodControls.apply(
        {type:'sales',pageId:'pageSales',label:'売上'},2030,6))).toBe(false);
      expect(await quickInputBlocksUnload(page)).toBe(true);
      const closed=failure==='tab close';
      if(closed)await page.close();
      const saved=failure!=='quota';
      await expect.poll(()=>peer.evaluate(async closed=>{
        try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
        catch(error){
          if(closed&&error.message==='Another Insight operation is in progress')return {state:'lock-busy'};
          throw error;
        }
      },closed),{timeout:10000}).toMatchObject({
        state:'hold',observedRevision:saved?1:0,recovery:saved?'save-verified':'prior-save-verified'
      });
      const before=JSON.parse(seed.raw), expected=JSON.parse(seed.raw);
      if(saved)expected.stores[seed.active].data[seed.year][seed.month][seed.day-1].売上=777;
      const record=await readStoreSwitchRecord(peer);
      expect(record.revision).toBe(saved?1:0);
      expect(JSON.parse(record.raw)).toEqual(expected);
      if(saved){
        expect(record.previous.revision).toBe(0);
        expect(JSON.parse(record.previous.raw)).toEqual(before);
      }
      expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await peer.close();}
  });
}

for(const outcome of ['success','quota']){
  test('combined input session uses the shared revision for hourly customers with '+outcome,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
    const baseline=JSON.parse(seed.raw);
    const button=page.locator('#hourlyCustomersQuick button');
    const dialog=page.locator('.hourly-dialog');
    await button.click();
    await expect(dialog).toBeVisible();
    const hourly=dialog.getByRole('spinbutton',{name:'0時台の客数',exact:true});
    await hourly.fill('12');
    expect(await quickInputBlocksUnload(page)).toBe(true);
    await dialog.getByRole('button',{name:'キャンセル'}).click();
    await expect(dialog).toHaveCount(0);
    expect(await quickInputBlocksUnload(page)).toBe(false);
    expect(await committedInput(page)).toEqual({revision:0,snapshot:baseline});

    await button.click();
    await hourly.fill('-1');
    await dialog.getByRole('button',{name:'保存する'}).click();
    await expect(dialog).toBeVisible();
    expect(await committedInput(page)).toEqual({revision:0,snapshot:baseline});
    await hourly.fill('0');
    await dialog.getByRole('spinbutton',{name:'23時台の客数'}).fill('18');
    await page.evaluate(outcome=>{
      if(outcome==='quota'){
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(){
          IDBObjectStore.prototype.put=put;
          throw new DOMException('Fictional quota error','QuotaExceededError');
        };
        return;
      }
      const digest=crypto.subtle.digest,resume=[];
      window.hourlyDigests=resume;
      crypto.subtle.digest=async function(...args){
        await new Promise(resolve=>resume.push(resolve));
        return digest.apply(this,args);
      };
      window.resumeHourlySave=()=>{
        crypto.subtle.digest=digest;
        resume.forEach(resolve=>resolve());
      };
    },outcome);
    await dialog.getByRole('button',{name:'保存する'}).click();
    if(outcome==='success'){
      await page.waitForFunction(()=>hourlyDigests.length===2);
      await expect(dialog.getByRole('status')).toBeEmpty();
      expect(await page.evaluate(()=>InsightHourlyCustomers.getHourlySaveOperationStatus()))
        .toMatchObject({state:'ACTIVE',activeCount:1});
      expect(await page.evaluate(()=>gotoNav(2))).toBe(false);
      expect(await page.evaluate(()=>saveQuick())).toBeUndefined();
      await page.evaluate(()=>resumeHourlySave());
      await expect(dialog).toHaveCount(0);
      const expected=JSON.parse(seed.raw);
      const hours=Array(24).fill(null);hours[0]=0;hours[23]=18;
      expected.stores[seed.active].hourlyCustomers??={};
      expected.stores[seed.active].hourlyCustomers[seed.iso]=hours;
      expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
      await expect(page.locator('#hourlyCustomersQuick')).toContainText('途中 2/24');
      await page.locator('#qi_客数').fill('123');
      await page.locator('#quickSaveBtn').click();
      await expect(page.locator('#quickSaveBtn')).toBeEnabled();
      await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
      await expect(page.locator('#quickSaveBtn + [role=status]')).toBeEmpty();
      const row=expected.stores[seed.active].data[seed.year][seed.month][seed.day-1];
      row.客数=123;
      const peer=expected.stores[seed.peer].data[seed.year][seed.month][seed.day-1];
      peer.weather=row.weather;peer.tempMaxC=row.tempMaxC;peer.tempMinC=row.tempMinC;
      expected.sharedWeather??={};
      expected.sharedWeather[seed.year+'-'+seed.month+'-'+seed.day]=row.weather;
      expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
    }else{
      await expect(dialog.getByRole('status')).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(hourly).toHaveValue('0');
      await expect(dialog.getByRole('spinbutton',{name:'23時台の客数'})).toHaveValue('18');
      expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
      expect(await page.evaluate(()=>gotoNav(2))).toBe(false);
      const peer=await openStoreSwitchPeer(context);
      try{
        const record=await readStoreSwitchRecord(peer);
        expect(record.revision).toBe(0);
        expect(JSON.parse(record.raw)).toEqual(baseline);
      }finally{await peer.close();}
    }
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

test('combined hourly save deletes only the selected day when all hours are cleared',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedHours:true});
  const expected=JSON.parse(seed.raw),button=page.locator('#hourlyCustomersQuick button');
  const dialog=page.locator('.hourly-dialog');
  await button.click();
  const inputs=dialog.getByRole('spinbutton');
  for(let i=0;i<24;i++)await inputs.nth(i).fill(String(i));
  await dialog.getByRole('button',{name:'保存する'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#hourlyCustomersQuick')).toContainText('入力済み 24/24');
  expected.stores[seed.active].hourlyCustomers??={};
  expected.stores[seed.active].hourlyCustomers[seed.iso]=Array.from({length:24},(_,i)=>i);
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await button.click();
  expect(await page.evaluate(()=>{
    document.getElementById('iqdPrev').click();
    return InsightDateContext.getSelectedIso();
  })).toBe(seed.iso);
  for(let i=0;i<24;i++)await inputs.nth(i).fill('');
  await dialog.getByRole('button',{name:'保存する'}).click();
  await expect(dialog).toHaveCount(0);
  delete expected.stores[seed.active].hourlyCustomers[seed.iso];
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const failure of ['competing revision','readback failure','lost acknowledgement','changed date','changed store']){
  test('combined hourly save holds the draft after '+failure,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true});
    await page.locator('#hourlyCustomersQuick button').click();
    const dialog=page.locator('.hourly-dialog');
    const input=dialog.getByRole('spinbutton',{name:'0時台の客数',exact:true});
    await input.fill('19');
    const peer=await openStoreSwitchPeer(context);
    const expected=JSON.parse(seed.raw);
    try{
      if(failure==='competing revision'){
        await peer.evaluate(async id=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[id].name='別タブで保存した架空店舗';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
        expected.stores[seed.peer].name='別タブで保存した架空店舗';
      }else if(failure==='lost acknowledgement'||failure==='readback failure'){
        await page.evaluate(failure=>{
          const write=InsightStorage.writeMetadata;
          let writing=false;
          InsightStorage.writeMetadata=(key,value)=>{
            if(key==='insight_indexeddb_adoption_v1'){
              const state=JSON.parse(value).state;
              if(state==='writing')writing=true;
              if(state==='active'&&failure==='lost acknowledgement')
                throw new Error('Fictional lost hourly acknowledgement');
            }
            return write(key,value);
          };
          if(failure==='readback failure'){
            const get=IDBObjectStore.prototype.get;
            IDBObjectStore.prototype.get=function(...args){
              const request=get.apply(this,args),tx=this.transaction;
              if(writing&&tx.mode==='readonly'&&tx.db.name==='insight-store-snapshots-v1'){
                IDBObjectStore.prototype.get=get;
                request.addEventListener('success',()=>tx.abort());
              }
              return request;
            };
          }
        },failure);
        const wanted=Array(24).fill(null);wanted[0]=19;
        expected.stores[seed.active].hourlyCustomers??={};
        expected.stores[seed.active].hourlyCustomers[seed.iso]=wanted;
      }else{
        await page.evaluate(({failure,peer})=>{
          if(failure==='changed store')allStores.current=peer;
          else{
            const date=InsightDateContext.getSelectedDate();
            date.setDate(date.getDate()-1);
            InsightDateContext.setSelectedDate(date);
          }
        },{failure,peer:seed.peer});
      }
      await dialog.getByRole('button',{name:'保存する'}).click();
      await expect(dialog.getByRole('status')).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(input).toHaveValue('19');
      expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
      expect(await page.evaluate(()=>gotoNav(2))).toBe(false);
      const record=await readStoreSwitchRecord(peer);
      expect(record.revision).toBe(failure.startsWith('changed')?0:1);
      expect(JSON.parse(record.raw)).toEqual(expected);
      if(failure==='lost acknowledgement'||failure==='readback failure'){
        expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
        expect(await peer.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
          .toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
      }
      expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await peer.close();}
  });
}

for(const outcome of ['success','conflict','quota']){
  test('combined sales count protects other periods, stores and trips on '+outcome,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
    await page.locator('#navSalesCount').click();
    await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);
    const field=label=>page.locator('#scCalendar').getByLabel(seed.iso+' '+label,{exact:true});
    const delivery=field('1便 納品数'),sales=field('1便 販売数');
    const waste=field('1便 廃棄数'),third=field('3便 販売数');
    const button=page.locator('#scSave'),status=page.locator('#scDirty');
    await expect(delivery).toHaveValue('8');
    await expect(field('2便 納品数 対象外（保存済み・編集不可）')).toHaveValue('22');
    await expect(field('2便 廃棄 対象外（保存済み・編集不可）')).toHaveValue('2');
    const expected=JSON.parse(seed.raw);
    const target=expected.stores[seed.active];
    const count=target.salesCounts[seed.iso][seed.countCategory];
    const wasted=target.wasteCounts[seed.iso][seed.countCategory];
    await delivery.fill('14');
    await sales.fill('0');
    await third.fill('');
    await waste.fill('4');
    await page.evaluate(()=>{window.confirm=()=>false;});
    await page.locator('#nav0').click();
    await expect(delivery).toHaveValue('14');
    expect(await quickInputBlocksUnload(page)).toBe(true);
    if(outcome==='success'){
      expect(await page.evaluate(year=>InsightSalesCount.setPeriod(Number(year)-30,6),seed.year)).toBe(false);
      await page.locator('#scCategory').selectOption(seed.otherCategory);
      await expect(page.locator('#scCategory')).toHaveValue(seed.countCategory);
      await delivery.fill('1000');
      await button.click();
      await expect(status).toHaveText('未保存の変更があります');
      expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
      await delivery.fill('14');
      await button.click();
      await expect(status).toHaveText('保存済み');
      count.trips[0]={delivery:14,sales:0};count.trips[2].sales=null;wasted.trips[0]=4;
      expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
      await page.locator('#nav0').click();
      await expect(page.locator('#pageQuick')).toHaveClass(/show/);
      await expect(page.locator('#qi_客数')).toHaveValue('62');
    }else{
      const peer=await openStoreSwitchPeer(context);
      try{
        if(outcome==='conflict'){
          await peer.evaluate(async id=>{
            const api=InsightIndexedDBStorageV1,record=await api.read();
            record.snapshot.stores[id].name='別タブで確定';
            await api.save(record.revision,record.snapshot);
          },seed.peer);
          expected.stores[seed.peer].name='別タブで確定';
        }else{
          await page.evaluate(()=>{
            const put=IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put=function(){
              IDBObjectStore.prototype.put=put;
              throw new DOMException('Fictional quota error','QuotaExceededError');
            };
          });
        }
        await button.click();
        await expect(status).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
        await expect(delivery).toHaveValue('14');
        await expect(sales).toHaveValue('0');
        await expect(waste).toHaveValue('4');
        await expect(button).toBeDisabled();
        expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
        expect(await page.evaluate(()=>gotoNav(0))).toBe(false);
        const record=await readStoreSwitchRecord(peer);
        expect(record.revision).toBe(outcome==='conflict'?1:0);
        expect(JSON.parse(record.raw)).toEqual(expected);
      }finally{await peer.close();}
    }
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}


function countField(page,seed,label){
  return page.locator('#scCalendar').getByLabel(seed.iso+' '+label,{exact:true});
}

async function interruptCountReadback(page,mode){
  await page.evaluate(mode=>{
    const write=InsightStorage.writeMetadata;
    let writing=false;
    InsightStorage.writeMetadata=(key,value)=>{
      if(key==='insight_indexeddb_adoption_v1'){
        const state=JSON.parse(value).state;
        if(state==='writing')writing=true;
        if(state==='active'&&mode==='lost acknowledgement')throw new Error('Fictional lost acknowledgement');
      }
      return write(key,value);
    };
    if(mode==='lost acknowledgement')return;
    const get=IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get=function(...args){
      const request=get.apply(this,args),tx=this.transaction;
      if(writing&&tx.mode==='readonly'&&tx.db.name==='insight-store-snapshots-v1'){
        IDBObjectStore.prototype.get=get;
        if(mode==='readback failure')request.addEventListener('success',()=>tx.abort());
        else{
          const handler=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
          Object.defineProperty(tx,'oncomplete',{
            set(){handler.set.call(this,()=>{window.countReadbackPaused=true;});}
          });
        }
      }
      return request;
    };
  },mode);
}

for(const mode of ['readback failure','lost acknowledgement','tab close']){
  test('combined sales count retains verified revisions after '+mode,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
    await page.locator('#navSalesCount').click();
    const delivery=countField(page,seed,'1便 納品数');
    await delivery.fill('');
    const other=await openStoreSwitchPeer(context);
    try{
      await interruptCountReadback(page,mode);
      await page.locator('#scSave').click();
      const closed=mode==='tab close';
      if(closed)await page.waitForFunction(()=>window.countReadbackPaused===true);
      else await expect(page.locator('#scDirty')).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(delivery).toHaveValue('');
      expect(await page.evaluate(()=>combinedPreview.getStatus()))
        .toEqual({state:closed?'ACTIVE':'HELD',hasUnsavedInput:true});
      expect(await page.evaluate(async ({year,peer})=>({
        period:InsightSalesCount.setPeriod(year,5),store:await switchStore(peer),route:gotoNav(0)
      }),seed))
        .toEqual({period:false,store:false,route:false});
      if(closed)await page.close();
      await expect.poll(()=>other.evaluate(async closed=>{
        try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
        catch(error){
          if(closed&&error.message==='Another Insight operation is in progress')return {state:'lock-busy'};
          throw error;
        }
      },closed),{timeout:10000}).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
      const expected=JSON.parse(seed.raw);
      expected.stores[seed.active].salesCounts[seed.iso][seed.countCategory].trips[0].delivery=null;
      const record=await readStoreSwitchRecord(other);
      expect(record.revision).toBe(1);
      expect(JSON.parse(record.raw)).toEqual(expected);
      expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await other.close();}
  });
}

test('combined sales count rejects a period change during large-value approval',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
  await page.locator('#navSalesCount').click();
  await countField(page,seed,'1便 納品数').fill('1000');
  await page.evaluate(year=>{
    window.confirm=message=>{
      if(message.startsWith('4桁以上'))InsightSalesCount.setPeriod(year,5);
      return true;
    };
  },seed.year);
  await page.locator('#scSave').click();
  await expect(page.locator('#scDirty')).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
  expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
  const other=await openStoreSwitchPeer(context);
  try{
    const record=await readStoreSwitchRecord(other);
    expect(record.revision).toBe(0);
    expect(JSON.parse(record.raw)).toEqual(JSON.parse(seed.raw));
    expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await other.close();}
});

test('combined category changes preserve count drafts and require approval before switching',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
  const expected=JSON.parse(seed.raw),categories=expected.salesCountManagement.categories;
  const originalName=categories[0].name;
  await page.locator('#navSalesCount').click();
  const delivery=countField(page,seed,'1便 納品数');
  await delivery.fill('17');
  const dialog=page.locator('dialog.sc-dialog');
  async function manage(){
    await page.locator('#scManage').click();
    await expect(dialog).toBeVisible();
  }
  await manage();
  const first=dialog.getByLabel('カテゴリー名',{exact:true}).first();
  await first.fill(categories[1].name);
  await dialog.getByRole('button',{name:'保存する'}).click();
  await expect(dialog.getByRole('status')).toHaveText('同じカテゴリー名は使用できません');
  expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
  await first.fill('架空カテゴリの新名称');
  await dialog.getByRole('checkbox',{name:originalName+' 3便を対象にする',exact:true}).uncheck();
  expect(await page.evaluate(()=>gotoNav(0))).toBe(false);
  await dialog.getByRole('button',{name:'保存する'}).click();
  await expect(dialog).toHaveCount(0);
  categories[0].name='架空カテゴリの新名称';categories[0].aliases.push(originalName);
  categories[0].activeTrips[2]=false;
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await expect(delivery).toHaveValue('17');

  await manage();
  await dialog.getByRole('button',{name:'非表示にする',exact:true}).first().click();
  await page.evaluate(()=>{window.confirm=()=>false;});
  await dialog.getByRole('button',{name:'保存する'}).click();
  await expect(dialog).toBeVisible();
  await expect(delivery).toHaveValue('17');
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await page.evaluate(()=>{window.confirm=()=>true;});
  await dialog.getByRole('button',{name:'保存する'}).click();
  await expect(dialog).toHaveCount(0);
  categories[0].hidden=true;
  await expect(page.locator('#scCategory')).toHaveValue(seed.otherCategory);
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const mode of ['conflict','quota','readback failure']){
  test('combined category save holds its dialog and count draft on '+mode,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
    const expected=JSON.parse(seed.raw);
    await page.locator('#navSalesCount').click();
    const delivery=countField(page,seed,'1便 納品数');
    await delivery.fill('17');
    await page.locator('#scManage').click();
    const dialog=page.locator('dialog.sc-dialog');
    const name=dialog.getByLabel('カテゴリー名',{exact:true}).first();
    await name.fill('架空カテゴリの新名称');
    const other=await openStoreSwitchPeer(context);
    try{
      if(mode==='conflict'){
        await other.evaluate(async peer=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[peer].name='別タブで確定';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
        expected.stores[seed.peer].name='別タブで確定';
      }else if(mode==='quota'){
        await page.evaluate(()=>{
          const put=IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put=function(){
            IDBObjectStore.prototype.put=put;
            throw new DOMException('Fictional quota error','QuotaExceededError');
          };
        });
      }else{
        await interruptCountReadback(page,mode);
        const category=expected.salesCountManagement.categories[0];
        category.aliases.push(category.name);category.name='架空カテゴリの新名称';
      }
      await dialog.getByRole('button',{name:'保存する'}).click();
      await expect(dialog.getByRole('status')).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(name).toHaveValue('架空カテゴリの新名称');
      await expect(delivery).toHaveValue('17');
      expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
      await dialog.getByRole('button',{name:'閉じる'}).press('Escape');
      await expect(dialog).toBeVisible();
      const record=await readStoreSwitchRecord(other);
      expect(record.revision).toBe(mode==='quota'?0:1);
      expect(JSON.parse(record.raw)).toEqual(expected);
      if(mode==='readback failure')expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await other.close();}
  });
}


test('combined category creation, reordering and visibility preserve all store records',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
  const expected=JSON.parse(seed.raw),categories=expected.salesCountManagement.categories;
  await page.locator('#navSalesCount').click();
  const dialog=page.locator('dialog.sc-dialog'),button=dialog.getByRole('button',{name:'保存する'});
  await page.locator('#scManage').click();
  await dialog.getByRole('button',{name:categories[1].name+'を上へ移動',exact:true}).click();
  await dialog.getByRole('button',{name:'＋ カテゴリーを追加',exact:true}).click();
  await dialog.getByLabel('カテゴリー名',{exact:true}).last().fill('架空の新規カテゴリー');
  await button.click();
  await expect(dialog).toHaveCount(0);
  const first=await committedInput(page);
  const added=first.snapshot.salesCountManagement.categories.find(c=>c.name==='架空の新規カテゴリー');
  expect(added).toEqual({id:expect.stringMatching(/^cat_/),name:'架空の新規カテゴリー',hidden:false,aliases:[],activeTrips:[true,true,true]});
  [categories[0],categories[1]]=[categories[1],categories[0]];
  categories.push(added);
  expect(first).toEqual({revision:1,snapshot:expected});

  await page.locator('#scManage').click();
  await dialog.getByRole('button',{name:'非表示にする',exact:true}).first().click();
  await button.click();
  await expect(dialog).toHaveCount(0);
  categories[0].hidden=true;
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  await page.locator('#scManage').click();
  await dialog.getByRole('button',{name:'再表示する',exact:true}).first().click();
  await button.click();
  await expect(dialog).toHaveCount(0);
  categories[0].hidden=false;
  expect(await committedInput(page)).toEqual({revision:3,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('combined category validation rejects historical aliases, duplicate IDs and exclusive masks',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
  const expected=JSON.parse(seed.raw),categories=expected.salesCountManagement.categories;
  await page.locator('#navSalesCount').click();
  const dialog=page.locator('dialog.sc-dialog'),save=dialog.getByRole('button',{name:'保存する'});
  await page.locator('#scManage').click();
  const names=dialog.getByLabel('カテゴリー名',{exact:true});
  const original=categories[0].name;
  await names.first().fill('架空新名称');
  await save.click();
  await expect(dialog).toHaveCount(0);
  categories[0].name='架空新名称';categories[0].aliases.push(original);
  await page.locator('#scManage').click();
  await names.nth(1).fill(original);
  await save.click();
  await expect(dialog.getByRole('status')).toHaveText('現在名または過去名と重複するカテゴリー名は使用できません');
  await names.nth(1).fill(categories[1].name);
  const firstRow=dialog.locator('.sc-category-row').first();
  for(const box of await firstRow.getByRole('checkbox').all())await box.uncheck();
  await save.click();
  await expect(dialog.getByRole('status')).toContainText('対象便を1つ以上選択してください');
  await firstRow.getByRole('checkbox').first().check();
  const hide=dialog.getByRole('button',{name:'非表示にする',exact:true});
  while(await hide.count())await hide.first().click();
  await save.click();
  await expect(dialog.getByRole('status')).toHaveText('表示するカテゴリーを1件以上残してください');
  await dialog.getByRole('button',{name:'再表示する',exact:true}).first().click();
  await page.evaluate(()=>{
    const now=Date.now,random=Math.random;
    Date.now=()=>1730000000000;Math.random=()=>0.25;
    document.querySelector('dialog.sc-dialog [data-add]').click();
    document.querySelector('dialog.sc-dialog [data-add]').click();
    Date.now=now;Math.random=random;
  });
  await dialog.locator('.sc-category-group.is-visible').getByLabel('カテゴリー名').nth(1).fill('架空A');
  await dialog.locator('.sc-category-group.is-visible').getByLabel('カテゴリー名').nth(2).fill('架空B');
  await save.click();
  await expect(dialog.getByRole('status')).toHaveText('販売数カテゴリーが不正です');
  await dialog.getByRole('button',{name:'閉じる'}).click();
  await expect(dialog).toHaveCount(0);
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const failure of ['lost acknowledgement','tab close']){
  test('combined category save preserves the full revision after '+failure,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
    await page.locator('#navSalesCount').click();
    await page.locator('#scManage').click();
    const dialog=page.locator('dialog.sc-dialog');
    const name=dialog.getByLabel('カテゴリー名',{exact:true}).first();
    await name.fill('架空新名称');
    const observer=await openStoreSwitchPeer(context);
    try{
      const closed=failure==='tab close';
      await interruptCountReadback(page,failure);
      await dialog.getByRole('button',{name:'保存する'}).click();
      if(closed)await page.waitForFunction(()=>window.countReadbackPaused===true);
      else await expect(dialog.getByRole('status')).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(name).toHaveValue('架空新名称');
      expect(await page.evaluate(async peer=>({nav:gotoNav(0),store:await switchStore(peer)}),seed.peer))
        .toEqual({nav:false,store:false});
      if(closed)await page.close();
      await expect.poll(()=>observer.evaluate(async closed=>{
        try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
        catch(error){
          if(closed&&error.message==='Another Insight operation is in progress')return null;
          throw error;
        }
      },closed),{timeout:10000}).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
      const expected=JSON.parse(seed.raw),category=expected.salesCountManagement.categories[0];
      category.aliases.push(category.name);category.name='架空新名称';
      const record=await readStoreSwitchRecord(observer);
      expect(JSON.parse(record.raw)).toEqual(expected);
      expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await observer.close();}
  });
}

for(const outcome of ['success','quota','conflict','readback failure','lost acknowledgement','tab close','changed confirmation']){
  test('combined customer month clear keeps other columns and dates on '+outcome,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true});
    await page.locator('#nav3').click();
    const input=page.locator('.kyaku-input[data-ri="'+(seed.day-1)+'"]');
    await expect(input).toHaveValue('62');
    await fillCombinedInput(input,'123');
    const button=page.locator('#kyakuClearBtn');
    await page.evaluate(()=>{window.confirm=()=>false;});
    await button.click();
    await expect(input).toHaveValue('123');
    const expected=JSON.parse(seed.raw);
    expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
    await page.evaluate(outcome=>{window.confirm=()=>{
      if(outcome==='changed confirmation')drafts.kyaku[0].客数=1234;
      return true;
    };},outcome);
    const observer=await openStoreSwitchPeer(context);
    try{
      if(outcome==='conflict'){
        await observer.evaluate(async peer=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[peer].name='月次クリアより前に確定';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
        expected.stores[seed.peer].name='月次クリアより前に確定';
      }
      const interrupted=['readback failure','lost acknowledgement','tab close'].includes(outcome);
      if(interrupted)await interruptCountReadback(page,outcome);
      if(outcome==='quota')await page.evaluate(()=>{
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(){
          IDBObjectStore.prototype.put=put;
          throw new DOMException('Fictional quota error','QuotaExceededError');
        };
      });
      await button.click();
      const status=page.locator('#kyakuSaveBtn + [role=status]');
      const applyClear=()=>expected.stores[seed.active].data[seed.year][seed.month].forEach(row=>{if(row)row.客数=0;});
      if(outcome==='success'){
        await expect(page.locator('#kyakuSaveBtn')).toBeEnabled();
        await expect(status).toBeEmpty();
        applyClear();
        await page.evaluate(()=>{window.confirm=()=>{throw new Error('Zero month unexpectedly requested confirmation');};});
        await button.click();
        expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'IDLE_OBSERVED',hasUnsavedInput:false});
        expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
      }else{
        const closed=outcome==='tab close';
        if(closed)await page.waitForFunction(()=>window.countReadbackPaused===true);
        else await expect(status).toHaveText('客数クリアの結果を確認できないため、追加の保存を停止しました。');
        await expect(input).toHaveValue('123');
        expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:closed?'ACTIVE':'HELD',hasUnsavedInput:true});
        expect(await page.evaluate(()=>gotoNav(0))).toBe(false);
        if(closed)await page.close();
        if(interrupted){
          await expect.poll(()=>observer.evaluate(async closed=>{
            try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
            catch(error){
              if(closed&&error.message==='Another Insight operation is in progress')return null;
              throw error;
            }
          },closed)).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
          applyClear();
        }
        const record=await readStoreSwitchRecord(observer);
        expect(record.revision).toBe(interrupted||outcome==='conflict'?1:0);
        expect(JSON.parse(record.raw)).toEqual(expected);
        if(record.revision===1)expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      }
      expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await observer.close();}
  });
}

const dailyClearScreens=[
  {name:'quick',button:'quickClearBtn',save:'quickSaveBtn',input:'#qi_売上',
    outcomes:['success','readback failure','conflict','quota','lost acknowledgement','date changed in confirmation','draft changed in confirmation']},
  {name:'sales',nav:'nav2',button:'salesClearBtn',save:'salesSaveBtn',input:'#sf_売上',
    outcomes:['success','conflict','readback failure','period changed in confirmation']},
  {name:'haiki',nav:'nav4',button:'haikiClearBtn',save:'haikiSaveBtn',
    outcomes:['success','quota','tab close','store changed after write']}
];
for(const screen of dailyClearScreens){
  for(const outcome of screen.outcomes){
    test('combined daily clear preserves fields outside '+screen.name+' on '+outcome,async({page,context})=>{
      const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,seedCounts:true,seedHours:true,seedDailyClear:true});
      if(screen.nav){
        await page.locator('#'+screen.nav).click();
        await page.evaluate(({type,iso})=>InsightInputDayNav.select(type,iso),{type:screen.name,iso:seed.iso});
      }
      const input=page.locator(screen.input??'#haikiForm [data-hc="'+seed.category+'"]');
      await fillCombinedInput(input,'123');
      const button=page.locator('#'+screen.button);
      await page.evaluate(()=>{window.confirm=()=>false;});
      await button.click();
      await expect(input).toHaveValue('123');
      const expected=JSON.parse(seed.raw);
      expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
      const interrupted=['readback failure','lost acknowledgement','tab close'].includes(outcome);
      const changedAfterWrite=outcome==='store changed after write';
      const changedDuringConfirmation=outcome.endsWith('in confirmation');
      await page.evaluate(outcome=>{window.confirm=()=>{
        if(outcome==='date changed in confirmation'){
          document.getElementById('iqdDateInput').value='2020-06-11';
        }else if(outcome==='draft changed in confirmation'){
          document.getElementById('qi_売上').value='124';
        }else if(outcome==='period changed in confirmation'){
          editMonth.sales='5月';
        }
        return true;
      };},outcome);
      const observer=await openStoreSwitchPeer(context);
      try{
        if(outcome==='conflict'){
          await observer.evaluate(async id=>{
            const api=InsightIndexedDBStorageV1,record=await api.read();
            record.snapshot.stores[id].name='日次クリアより前に確定';
            await api.save(record.revision,record.snapshot);
          },seed.peer);
          expected.stores[seed.peer].name='日次クリアより前に確定';
        }
        if(outcome==='quota')await page.evaluate(()=>{
          const put=IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put=function(){
            IDBObjectStore.prototype.put=put;
            throw new DOMException('Fictional quota error','QuotaExceededError');
          };
        });
        if(interrupted)await interruptCountReadback(page,outcome);
        if(changedAfterWrite)await page.evaluate(peer=>{
          const write=InsightStorage.writeMetadata;
          InsightStorage.writeMetadata=(key,value)=>{
            const result=write(key,value);
            if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='active'){
              allStores.current=peer;
            }
            return result;
          };
        },seed.peer);
        await button.click();
        const status=page.locator('#'+screen.save+' + [role=status]');
        if(outcome==='success'){
          await expect(status).toBeEmpty();
          await expect(input).toHaveValue('');
          expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:'IDLE_OBSERVED',hasUnsavedInput:false});
          const nextScreen=screen.nav?'nav0':'nav2';
          await page.locator('#'+nextScreen).click();
          await page.locator('#'+(screen.nav??'nav0')).click();
          if(screen.nav)await page.evaluate(({type,iso})=>InsightInputDayNav.select(type,iso),{type:screen.name,iso:seed.iso});
          await expect(input).toHaveValue('');
        }else{
          const closed=outcome==='tab close';
          if(closed)await page.waitForFunction(()=>window.countReadbackPaused===true);
          else await expect(status).toHaveText(/追加の保存を停止しました/);
          await expect(input).toHaveValue(outcome==='draft changed in confirmation'?'124':'123');
          expect(await page.evaluate(()=>combinedPreview.getStatus())).toEqual({state:closed?'ACTIVE':'HELD',hasUnsavedInput:true});
          expect(await page.evaluate(async()=>[
            await clearTodayData(),await clearDayData('sales'),await clearDayData('haiki'),await clearKyakuMonth()
          ])).toEqual([false,false,false,false]);
          if(closed)await page.close();
          if(interrupted)await expect.poll(()=>observer.evaluate(async closed=>{
            try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
            catch(error){
              if(closed&&error.message==='Another Insight operation is in progress')return null;
              throw error;
            }
          },closed)).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
        }
        if(outcome==='success'||interrupted||changedAfterWrite){
          const row=expected.stores[seed.active].data[seed.year][seed.month][seed.day-1];
          if(screen.name!=='haiki')Object.assign(row,{売上:0,買上点数:0});
          if(screen.name!=='sales'){
            row.廃棄金額=0;
            for(const category of Object.keys(row.haiki))row.haiki[category]=0;
          }
          if(screen.name==='quick'){
            row.客数=0;
            delete row.storeMemo;
          }
        }
        const record=await readStoreSwitchRecord(observer);
        expect(record.revision).toBe(outcome==='quota'||changedDuringConfirmation?0:1);
        expect(JSON.parse(record.raw)).toEqual(expected);
        if(record.revision===1)expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
        expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
      }finally{await observer.close();}
    });
  }
}

test('isolated quick clear respects the year boundary and repeating a clear keeps the same data',async({page})=>{
  const seed=await openQuickInputPreview(page,{seedYearBoundary:true});
  const boundary=seed.year+'-01-01';
  const previous=(Number(seed.year)-1)+'-12-31';
  await page.evaluate(()=>{window.confirm=()=>true;});
  const date=page.locator('#iqdDateInput');
  await date.fill(boundary);
  await page.locator('#iqdPrev').click();
  await expect(date).toHaveValue(previous);
  await expect(page.locator('#qi_売上')).toHaveValue('71');
  await page.locator('#iqdNext').click();
  await expect(date).toHaveValue(boundary);
  await expect(page.locator('#qi_売上')).toHaveValue('81');
  await page.evaluate(()=>{
    const date=document.getElementById('iqdDateInput');
    date.value='2025-02-30';
    date.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await expect(date).toHaveValue(boundary);
  const expected=JSON.parse(seed.raw);
  expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
  expected.stores[seed.active].data[seed.year]['1月'][0].売上=0;
  for(const revision of [1,2]){
    expect(await page.evaluate(()=>clearTodayData())).toBe(true);
    await expect(date).toHaveValue(boundary);
    await expect(page.locator('#qi_売上')).toHaveValue('');
    expect(await committedInput(page)).toEqual({revision,snapshot:expected});
  }
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const operation of ['store','year']){
  for(const failure of ['quota','lost acknowledgement']){
    test('isolated management deletion preserves the prior snapshot for '+operation+' on '+failure,async({page,context})=>{
      const seed=await openQuickInputPreview(page,{seedCounts:true,seedHours:true,seedManagement:true});
      const observer=await openStoreSwitchPeer(context);
      try{
        if(failure==='lost acknowledgement')await interruptCountReadback(page,failure);
        const result=await page.evaluate(async ({operation,failure,active,peer,year})=>{
          const api=InsightIndexedDBStorageV1,baseline=await api.read();
          const candidate=structuredClone(baseline.snapshot);
          if(operation==='year'){
            InsightYearManager.removeYear(candidate,active,year);
          }else{
            delete candidate.stores[active];
            candidate.current=peer;
            applySharedWeatherToStore(candidate.stores[peer],candidate);
          }
          if(failure==='quota'){
            const put=IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put=function(){
              IDBObjectStore.prototype.put=put;
              throw new DOMException('Fictional quota error','QuotaExceededError');
            };
          }
          try{
            await api.save(baseline.revision,candidate);
            return {failure:null};
          }catch(error){
            return {failure:error.message,live:InsightStorage.serialize(allStores)};
          }
        },{operation,failure,active:seed.active,peer:seed.peer,year:seed.year});
        expect(result.failure).toContain(failure==='quota'?'Fictional quota error':'Fictional lost acknowledgement');
        expect(JSON.parse(result.live)).toEqual(JSON.parse(seed.raw));
        const record=await readStoreSwitchRecord(observer);
        const prior=JSON.parse(seed.raw);
        const saved=failure==='lost acknowledgement';
        const expected=JSON.parse(seed.raw);
        if(saved&&operation==='store'){
          delete expected.stores[seed.active];
          expected.current=seed.peer;
          expected.stores[seed.peer].data[seed.year][seed.month][seed.day].weather='雨';
        }else if(saved){
          const shop=expected.stores[seed.active];
          shop.years=shop.years.filter(year=>year!==seed.year);
          delete shop.data[seed.year];
          delete shop.monthlyOps[seed.year];
          for(const key of ['salesCounts','wasteCounts','hourlyCustomers']){
            for(const date of Object.keys(shop[key])){
              if(date.startsWith(seed.year+'-'))delete shop[key][date];
            }
          }
        }
        expect(record.revision).toBe(saved?1:0);
        expect(JSON.parse(record.raw)).toEqual(expected);
        if(saved)expect(JSON.parse(record.previous.raw)).toEqual(prior);
        else expect(record.previous).toBeNull();
        expect(await observer.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
          .toMatchObject({state:'hold',observedRevision:saved?1:0,recovery:saved?'save-verified':'prior-save-verified'});
        expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
      }finally{await observer.close();}
    });
  }
}

test('management preview saves a store rename, add and delete as separate revisions',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  const expected=JSON.parse(seed.raw);
  await page.locator('#nav2').click();
  const menu=page.locator('#storeMenu');
  const open=()=>page.locator('#storeMenuBtn').click();
  const status=page.locator('#storeSel + [role=status]');

  await open();
  page.once('dialog',dialog=>dialog.accept('架空の名称変更'));
  await menu.getByRole('button',{name:/店舗名を変更/}).click();
  await expect(status).toHaveText('保存しました。');
  expected.stores[seed.active].name='架空の名称変更';
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});

  await open();
  page.once('dialog',dialog=>dialog.accept('架空の追加店舗'));
  await menu.getByRole('button',{name:/新しい店舗を追加/}).click();
  await expect(page.locator('#storeSel option:checked')).toHaveText('架空の追加店舗');
  const id=await page.locator('#storeSel').inputValue();
  expect(id).not.toBe(seed.active);
  const added=await page.evaluate(()=>({year:todayFY().fy,data:blankYearData(todayFY().fy)}));
  expected.current=id;
  expected.stores[id]={name:'架空の追加店舗',years:[added.year],data:{[added.year]:added.data},salesCounts:{}};
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  expect(await page.evaluate(()=>allStores)).toEqual(expected);

  await open();
  page.once('dialog',dialog=>dialog.dismiss());
  await menu.getByRole('button',{name:/この店舗を削除/}).click();
  await expect.poll(()=>page.evaluate(()=>combinedPreview.getStatus().state)).toBe('IDLE_OBSERVED');
  await expect(menu).not.toHaveClass(/is-open/);
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  await open();
  page.once('dialog',dialog=>dialog.accept());
  await menu.getByRole('button',{name:/この店舗を削除/}).click();
  await expect(page.locator('#storeSel')).toHaveValue(seed.active);
  delete expected.stores[id];
  expected.current=seed.active;
  expected.stores[seed.active].data[seed.year][seed.month][seed.day].weather='雨';
  expect(await committedInput(page)).toEqual({revision:3,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('store deletion from the dashboard stops if another tab saves after the menu opens',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  const peer=await openStoreSwitchPeer(context);
  try{
    await page.locator('#nav1').click();
    await page.locator('#storeMenuBtn').click();
    const before=await readStoreSwitchRecord(peer);
    const other=await peer.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1;
      const {revision,snapshot}=await api.read();
      snapshot.stores[snapshot.current].name='別タブで保存した店舗';
      return api.save(revision,snapshot);
    });
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#storeMenu').getByRole('button',{name:/この店舗を削除/}).click();
    await expect(page.locator('#insightIndexedDBStoreStatus')).toContainText('追加の保存を停止しました');
    expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe('HELD');
    expect(await page.evaluate(()=>allStores.current)).toBe(seed.active);
    const record=await readStoreSwitchRecord(peer);
    expect(record.revision).toBe(other.revision);
    expect(JSON.parse(record.raw)).toEqual(other.snapshot);
    expect(record.previous.raw).toBe(before.raw);
    expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await peer.close();}
});

test('management preview adds and deletes a year through the existing settings controls',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,
    seedManagement:true,seedCounts:true,seedHours:true});
  await page.locator('#navSettings').click();
  const added=String(Number(seed.year)-2);
  await page.locator('#addYearBtn').click();
  await page.locator('#ayInput').fill(added);
  await page.locator('#ayAddBtn').click();
  await expect(page.locator('#insightSettingsYearSection [role=status]')).toHaveText('保存しました。');
  const expected=JSON.parse(seed.raw);
  const shop=expected.stores[seed.active];
  shop.years=[...shop.years,added].sort();
  shop.data[added]=await page.evaluate(year=>blankYearData(year),added);
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});

  const overlay=page.locator('#insightYearDeleteOverlay');
  await page.locator('#insightDeleteYearButton').click();
  await overlay.locator('select').selectOption(seed.year);
  await overlay.getByRole('button',{name:'キャンセル'}).click();
  await expect(overlay).toBeHidden();
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await page.locator('#insightDeleteYearButton').click();
  await overlay.locator('select').selectOption(seed.year);
  await overlay.getByRole('button',{name:'削除する'}).click();
  await expect(overlay).toBeHidden();
  shop.years=shop.years.filter(year=>year!==seed.year);
  delete shop.data[seed.year];
  delete shop.monthlyOps[seed.year];
  for(const key of ['salesCounts','wasteCounts','hourlyCustomers']){
    for(const date of Object.keys(shop[key])){
      if(date.startsWith(seed.year+'-'))delete shop[key][date];
    }
  }
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  expect(await page.evaluate(()=>InsightDateContext.getSelectedIso())).not.toBe(seed.iso);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const entrance of ['quick','sales','salesCounts']){
  test('management preview registers an unregistered year from '+entrance,async({page})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
    const year=String(Number(seed.year)-2);
    if(entrance==='sales')await page.locator('#nav2').click();
    if(entrance==='salesCounts')await page.locator('#navSalesCount').click();
    const picker=page.locator(entrance==='quick'?'#iqdDateInput':'#insightDayNav-'+entrance+' .iqd-date-input');
    const apply=()=>picker.fill(year+'-06-12');
    await page.evaluate(()=>{window.confirm=()=>false;});
    await apply();
    const expected=JSON.parse(seed.raw);
    expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
    await page.evaluate(()=>{window.confirm=()=>true;});
    await apply();
    await expect(page.locator('#storeSel + [role=status]')).toHaveText('保存しました。');
    const shop=expected.stores[seed.active];
    shop.years=[...shop.years,year].sort();
    shop.data[year]=await page.evaluate(year=>blankYearData(year),year);
    expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
    await expect.poll(()=>page.evaluate(entrance=>{
      if(entrance==='sales')return String(editYear.sales);
      if(entrance==='salesCounts')return InsightSalesCount.getPeriod().year;
      return InsightDateContext.getSelectedIso().slice(0,4);
    },entrance)).toBe(year);
    await expect(picker).toHaveValue(year+'-06-12');
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

for(const [operation,failure] of [
  ['store','quota'],['store','conflict'],['store','changed confirmation'],
  ['year','readback failure'],['year','tab close']
]){
  test('management preview stops '+operation+' deletion on '+failure,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,
      seedManagement:true,seedCounts:true,seedHours:true});
    const observer=await openStoreSwitchPeer(context);
    const expected=JSON.parse(seed.raw);
    const closed=failure==='tab close';
    const written=closed||failure==='readback failure';
    try{
      if(failure==='conflict'){
        await observer.evaluate(async id=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[id].name='削除より先に別タブで保存';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
        expected.stores[seed.peer].name='削除より先に別タブで保存';
      }
      if(written)await interruptCountReadback(page,failure);
      if(failure==='quota')await page.evaluate(()=>{
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(){
          IDBObjectStore.prototype.put=put;
          throw new DOMException('Fictional management quota error','QuotaExceededError');
        };
      });
      if(operation==='store'){
        await page.locator('#nav2').click();
        await page.evaluate(iso=>InsightInputDayNav.select('sales',iso),seed.iso);
        const sales=page.locator('#sf_売上');
        await fillCombinedInput(sales,'123');
        await page.locator('#storeMenuBtn').click();
        await page.evaluate(failure=>{window.confirm=message=>{
          if(failure==='changed confirmation'&&message.includes('すべて消えます')){
            const input=document.getElementById('sf_売上');
            input.value='124';
            input.dispatchEvent(new Event('input',{bubbles:true}));
          }
          return true;
        };},failure);
        await page.locator('#storeMenu').getByRole('button',{name:/この店舗を削除/}).click();
        await expect(page.locator('#storeSel + [role=status]')).toHaveText(/追加の保存を停止しました/);
        await expect(sales).toHaveValue(failure==='changed confirmation'?'124':'123');
      }else{
        await page.locator('#navSettings').click();
        await page.locator('#insightDeleteYearButton').click();
        const dialog=page.locator('#insightYearDeleteDialog');
        await dialog.locator('select').selectOption(seed.year);
        await dialog.getByRole('button',{name:'削除する'}).click();
        if(closed)await page.waitForFunction(()=>window.countReadbackPaused===true);
        else await expect(dialog.getByRole('status')).toHaveText(/追加の保存を停止しました/);
        await expect(dialog.locator('select')).toHaveValue(seed.year);
      }
      expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe(closed?'ACTIVE':'HELD');
      expect(await page.locator('#storeSel').inputValue()).toBe(seed.active);
      if(closed)await page.close();
      if(written){
        await expect.poll(()=>observer.evaluate(async closed=>{
          try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
          catch(error){
            if(closed&&error.message==='Another Insight operation is in progress')return null;
            throw error;
          }
        },closed)).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
        const shop=expected.stores[seed.active];
        shop.years=shop.years.filter(year=>year!==seed.year);
        delete shop.data[seed.year];
        delete shop.monthlyOps[seed.year];
        for(const key of ['salesCounts','wasteCounts','hourlyCustomers']){
          for(const date of Object.keys(shop[key])){
            if(date.startsWith(seed.year+'-'))delete shop[key][date];
          }
        }
      }
      const record=await readStoreSwitchRecord(observer);
      expect(record.revision).toBe(written||failure==='conflict'?1:0);
      expect(JSON.parse(record.raw)).toEqual(expected);
      if(record.revision===1)expect(record.previous.raw).toBe(seed.raw);
      expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await observer.close();}
  });
}

function csvFixture(text){
  return {name:'fictional-insight.csv',mimeType:'text/csv',buffer:Buffer.from(text)};
}

test('CSV preview confirms the store, years and duplicates before a single commit',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedCSV:true});
  await page.locator('#navSettings').click();
  const oldYear=String(Number(seed.year)-2);
  const file=csvFixture('日付,売上,客数,買上点数,FFおでん,FFフライヤー\n'+
    seed.iso+',170,22,+3.25,100,200\n'+seed.iso+',+180,0,,,\n'+
    oldYear+'-01-02,90,0,,,\n'+oldYear+'-02-30,999,0,,,');
  await page.evaluate(()=>{window.csvPrompts=[];window.allowCsv=false;window.confirm=message=>{
    csvPrompts.push(message);
    return allowCsv;
  };});
  const status=page.locator('#insightCSVImportStatus');
  const input=page.locator('#csvImportFile');
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#csvImportBtn').click()]);
  await chooser.setFiles(file);
  await expect(status).toHaveText('CSV取り込みをキャンセルしました。');
  const expected=JSON.parse(seed.raw);
  expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
  expect(await page.evaluate(()=>csvPrompts[0])).toContain('取込先: '+expected.stores[seed.active].name);
  expect(await page.evaluate(()=>csvPrompts[0])).toContain('対象年度: '+oldYear+', '+seed.year);
  expect(await page.evaluate(()=>csvPrompts[0])).toContain('同じ日付の行: 1件');
  expect(await page.evaluate(()=>csvPrompts[0])).toContain('対象外の行: 1件');
  await page.evaluate(()=>{window.allowCsv=true;});
  await input.setInputFiles(file);
  await expect(status).toHaveText('保存しました。');
  const shop=expected.stores[seed.active];
  const row=shop.data[seed.year][seed.month][seed.day-1];
  Object.assign(row,{売上:180,客数:22,買上点数:3.25,廃棄金額:300});
  row.haiki.FF=300;
  shop.years=[...shop.years,oldYear].sort();
  const oldRow=shop.data[oldYear]['1月'][0];
  shop.data[oldYear]=await page.evaluate(year=>blankYearData(year),oldYear);
  shop.data[oldYear]['1月'][0]=oldRow;
  shop.data[oldYear]['1月'][1].売上=90;
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await input.setInputFiles(file);
  await expect(status).toHaveText('取り込む変更がありません。');
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await expect(input).toHaveValue('');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('CSV preview rejects malformed numbers without changing the stored revision',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  await page.locator('#navSettings').click();
  await page.evaluate(()=>{window.csvConfirmed=false;window.confirm=()=>{csvConfirmed=true;return true;};});
  const file=page.locator('#csvImportFile');
  for(const [fields,values,error] of [
    ['売上','123abc',/取り込めない数値/],
    ['売上,客数','-10,22',/取り込めない数値/],
    ['客数,買上点数','22,-3.2',/取り込めない数値/],
    ['売上,廃棄金額','22,-100',/取り込めない数値/],
    ['FFおでん,FFフライヤー','-100,200',/取り込めない数値/],
    ['売上','9007199254740992',/取り込めない数値/],
    ['FFおでん,FFフライヤー','9007199254740991,1',/内訳が範囲/],
    ['FF,米飯','9007199254740991,1',/廃棄金額が範囲/]
  ]){
    await file.setInputFiles(csvFixture('日付,'+fields+'\n'+seed.iso+','+values));
    await expect(page.locator('#insightCSVImportStatus')).toHaveText(error);
    await expect(file).toHaveValue('');
    expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
  }
  expect(await page.evaluate(()=>({confirmed:csvConfirmed,raw:localStorage.getItem('insight_v11')})))
    .toEqual({confirmed:false,raw:seed.raw});
  expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe('IDLE_OBSERVED');
});

for(const fault of ['changed store while reading','conflict','quota','readback failure','lost acknowledgement','tab close']){
  test('CSV preview protects the original snapshot on '+fault,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
    await page.locator('#navSettings').click();
    const observer=await openStoreSwitchPeer(context);
    const expected=JSON.parse(seed.raw);
    try{
      await page.evaluate(fault=>{
        window.csvConfirmations=0;
        window.confirm=()=>{csvConfirmations++;return true;};
        if(fault==='changed store while reading'){
          const text=File.prototype.text;
          File.prototype.text=function(){
            return new Promise(resolve=>{window.resumeCsvRead=()=>resolve(text.call(this));});
          };
        }else if(fault==='quota'){
          const put=IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put=function(){
            IDBObjectStore.prototype.put=put;
            throw new DOMException('Fictional CSV quota error','QuotaExceededError');
          };
        }
      },fault);
      if(fault==='conflict'){
        await observer.evaluate(async id=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[id].name='別タブで保存';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
        expected.stores[seed.peer].name='別タブで保存';
      }
      const interrupted=['readback failure','lost acknowledgement','tab close'].includes(fault);
      if(interrupted)await interruptCountReadback(page,fault);
      await page.locator('#csvImportFile').setInputFiles(csvFixture('日付,売上\n'+seed.iso+',180'));
      if(fault==='changed store while reading'){
        await page.waitForFunction(()=>typeof window.resumeCsvRead==='function');
        expect(await page.evaluate(async()=>({
          state:combinedPreview.getStatus().state,nav:gotoNav(0),switched:await switchStore('nonexistent')
        }))).toEqual({state:'ACTIVE',nav:false,switched:false});
        await page.evaluate(id=>{allStores.current=id;resumeCsvRead();},seed.peer);
      }
      if(fault==='tab close'){
        await page.waitForFunction(()=>window.countReadbackPaused===true);
        expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe('ACTIVE');
        await page.close();
      }else{
        await expect(page.locator('#insightCSVImportStatus')).toContainText('追加の保存を停止しました');
        expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe('HELD');
        if(fault==='changed store while reading')expect(await page.evaluate(()=>csvConfirmations)).toBe(0);
      }
      if(interrupted){
        await expect.poll(()=>observer.evaluate(async()=>{
          try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
          catch(error){
            if(error.message==='Another Insight operation is in progress')return null;
            throw error;
          }
        })).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
        expected.stores[seed.active].data[seed.year][seed.month][seed.day-1].売上=180;
      }
      const record=await readStoreSwitchRecord(observer);
      const wrote=fault==='conflict'||interrupted;
      expect(record.revision).toBe(wrote?1:0);
      expect(JSON.parse(record.raw)).toEqual(expected);
      if(wrote)expect(record.previous.raw).toBe(seed.raw);
      expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await observer.close();}
  });
}

test('ordinary CSV keeps its existing signed-number import behavior',async({page})=>{
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  const seed=await page.evaluate(()=>{
    const info=InsightDateContext.getSelectedInfo();
    const row=store.data[info.fy][info.month][info.day-1];
    row.売上=40;
    window.confirm=()=>true;
    return {...info,storeId:allStores.current};
  });
  await page.locator('#navSettings').click();
  await page.locator('#csvImportFile').setInputFiles(csvFixture('日付,売上,客数\n'+seed.iso+',-10,+22'));
  await expect.poll(()=>page.evaluate(seed=>{
    const row=JSON.parse(localStorage.getItem('insight_v11')||'{}').stores?.[seed.storeId]?.data?.[seed.fy]?.[seed.month]?.[seed.day-1];
    return row?[row.売上,row.客数]:null;
  },seed)).toEqual([40,22]);
});

async function openIsolatedEvent(page,type,title){
  await page.locator('#insightEvents').getByRole('button',{name:'＋イベントを追加'}).click();
  const dialog=page.locator('.ie-event-add');
  await dialog.getByLabel('イベント種別').selectOption(type);
  if(title)await dialog.getByLabel(type==='special'?'催事名':'イベント名',{exact:true}).fill(title);
  return dialog;
}

test('event preview saves scoped records and shared presets across years on separate revisions',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  const expected=JSON.parse(seed.raw);
  const local=expected.stores[seed.active].events;
  const editor=await openIsolatedEvent(page,'special','架空の年またぎ催事');
  const start=seed.year+'-01-01',end=String(Number(seed.year)+1)+'-01-01';
  await editor.getByLabel('開始日',{exact:true}).fill(start);
  await editor.getByLabel('終了日',{exact:true}).fill(end);
  await editor.getByRole('button',{name:'登録する',exact:true}).click();
  await expect(editor).toHaveCount(0);
  const first=await committedInput(page);
  const created=first.snapshot.stores[seed.active].events.at(-1);
  expect(created).toMatchObject({type:'special',scope:'store',startDate:start,endDate:end,snapshot:{title:'架空の年またぎ催事'}});
  local.push(created);
  expected.eventManagement={version:1,presets:[],events:[],demandCategories:[]};
  expect(first).toEqual({revision:1,snapshot:expected});

  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.locator('#insightEvents').getByRole('button',{name:/架空の年またぎ催事.*を編集/}).click();
  await editor.getByLabel('催事名',{exact:true}).fill('架空の編集済み催事');
  await editor.getByRole('button',{name:'変更を保存'}).click();
  await expect(editor).toHaveCount(0);
  created.snapshot.title='架空の編集済み催事';
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});

  await openIsolatedEvent(page,'sale');
  await editor.getByRole('button',{name:'編集',exact:true}).click();
  const presets=page.locator('dialog.ie-preset-editor');
  await presets.getByRole('button',{name:'＋よく使うセールを追加'}).click();
  await presets.getByLabel('値引き額（円）',{exact:true}).first().fill('50');
  await presets.getByRole('button',{name:'保存する',exact:true}).click();
  await expect(presets.getByRole('button',{name:'＋よく使うセールを追加'})).toBeVisible();
  const third=await committedInput(page);
  const preset=third.snapshot.eventManagement.presets[0];
  expect(preset.snapshot.sale.params.amount).toBe(50);
  expected.eventManagement.presets.push(preset);
  expect(third).toEqual({revision:3,snapshot:expected});
  await presets.getByRole('button',{name:'閉じる',exact:true}).click();
  await editor.getByRole('button',{name:/50円引き/}).click();
  await expect(editor).toHaveCount(0);
  const fourth=await committedInput(page);
  const sale=fourth.snapshot.eventManagement.events[0];
  expect(sale).toMatchObject({type:'sale',scope:'global',presetId:preset.id,snapshot:preset.snapshot});
  expect(await page.evaluate(({peer,iso,id})=>InsightEvents.list(allStores,peer,iso).some(event=>event.id===id),
    {peer:seed.peer,iso:seed.iso,id:sale.id})).toBe(true);
  expected.eventManagement.events.push(sale);
  expect(fourth).toEqual({revision:4,snapshot:expected});
  await page.locator('#insightEvents').getByRole('button',{name:/架空の編集済み催事.*を削除/}).click();
  await expect(page.locator('#insightEvents').getByRole('button',{name:/架空の編集済み催事.*を削除/})).toHaveCount(0);
  local.pop();
  expect(await committedInput(page)).toEqual({revision:5,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('event preview retains the editing dialog and previous version when readback is interrupted',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  const dialog=await openIsolatedEvent(page,'nearby','架空の近隣イベント');
  await dialog.getByLabel('イベント場所',{exact:true}).fill('架空の会場');
  const observer=await openStoreSwitchPeer(context);
  try{
    await interruptCountReadback(page,'readback failure');
    await dialog.getByRole('button',{name:'登録する',exact:true}).click();
    await expect(dialog.locator('.ie-preview-save-status')).toContainText('追加の保存を停止しました');
    await expect(dialog.getByLabel('イベント名',{exact:true})).toHaveValue('架空の近隣イベント');
    expect(await page.evaluate(()=>({state:combinedPreview.getStatus().state,events:store.events})))
      .toEqual({state:'HELD',events:JSON.parse(seed.raw).stores[seed.active].events});
    const record=await readStoreSwitchRecord(observer);
    const expected=JSON.parse(seed.raw);
    const event=JSON.parse(record.raw).stores[seed.active].events.at(-1);
    expect(event).toMatchObject({type:'nearby',scope:'store',snapshot:{title:'架空の近隣イベント',location:'架空の会場'}});
    expected.stores[seed.active].events=[...(expected.stores[seed.active].events??[]),event];
    expected.eventManagement={version:1,presets:[],events:[],demandCategories:[]};
    expect(record.revision).toBe(1);
    expect(JSON.parse(record.raw)).toEqual(expected);
    expect(record.previous.raw).toBe(seed.raw);
    expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await observer.close();}
});

for(const fault of ['conflict','quota','lost acknowledgement','tab close']){
  test('event preview protects snapshots on '+fault,async({page,context})=>{
    const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
    const dialog=await openIsolatedEvent(page,'nearby','架空の確認用イベント');
    await dialog.getByLabel('イベント場所',{exact:true}).fill('架空の会場');
    const observer=await openStoreSwitchPeer(context);
    const expected=JSON.parse(seed.raw);
    const interrupted=fault==='lost acknowledgement'||fault==='tab close';
    try{
      if(fault==='conflict'){
        expected.stores[seed.peer].name='別タブの店名';
        await observer.evaluate(async id=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[id].name='別タブの店名';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
      }else if(fault==='quota'){
        await page.evaluate(()=>{
          const put=IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put=function(){
            IDBObjectStore.prototype.put=put;
            throw new DOMException('Fictional event quota error','QuotaExceededError');
          };
        });
      }else await interruptCountReadback(page,fault);

      await dialog.getByRole('button',{name:'登録する',exact:true}).click();
      if(fault==='tab close'){
        await page.waitForFunction(()=>window.countReadbackPaused===true);
        await page.close();
      }else{
        await expect(dialog.locator('.ie-preview-save-status')).toContainText('追加の保存を停止しました');
        await expect(dialog.getByLabel('イベント名',{exact:true})).toHaveValue('架空の確認用イベント');
        expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe('HELD');
      }

      if(interrupted){
        await expect.poll(()=>observer.evaluate(async()=>{
          try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
          catch(error){
            if(error.message==='Another Insight operation is in progress')return null;
            throw error;
          }
        })).toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
      }
      const record=await readStoreSwitchRecord(observer);
      const actual=JSON.parse(record.raw);
      if(interrupted){
        const event=actual.stores[seed.active].events.at(-1);
        expect(event).toMatchObject({type:'nearby',scope:'store',snapshot:{title:'架空の確認用イベント',location:'架空の会場'}});
        expected.stores[seed.active].events=[...(expected.stores[seed.active].events??[]),event];
        expected.eventManagement={version:1,presets:[],events:[],demandCategories:[]};
      }
      expect(record.revision).toBe(fault==='quota'?0:1);
      expect(actual).toEqual(expected);
      if(fault!=='quota')expect(record.previous.raw).toBe(seed.raw);
      expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await observer.close();}
  });
}

test('event preview keeps a cancelled deletion and saves shared demand categories in order',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  const expected=JSON.parse(seed.raw);
  await page.evaluate(()=>{window.confirm=()=>false;});
  await page.locator('#insightEvents').getByRole('button',{name:/架空の催事.*を削除/}).click();
  expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
  const editor=await openIsolatedEvent(page,'special','架空のカテゴリー確認');
  await editor.getByRole('button',{name:'カテゴリー管理'}).click();
  const manager=page.locator('dialog.ie-preset-editor');
  const names=manager.getByLabel('カテゴリー名',{exact:true});
  const add=manager.getByRole('button',{name:'＋ カテゴリーを追加'});
  await add.click();
  await names.nth(0).fill('架空の惣菜');
  await add.click();
  await names.nth(1).fill('架空のお菓子');
  await manager.locator('.ie-demand-favorite-row').nth(1).getByRole('button',{name:/を上へ移動$/}).click();
  await manager.getByRole('button',{name:'保存する'}).click();
  await expect(manager).toHaveCount(0);
  const current=await committedInput(page);
  const categories=current.snapshot.eventManagement.demandCategories;
  expect(categories.map(category=>category.name)).toEqual(['架空のお菓子','架空の惣菜']);
  expected.eventManagement={version:1,presets:[],events:[],demandCategories:categories};
  expect(current).toEqual({revision:1,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

const fictionalWeatherLocation={name:'架空町',query:'架空町',label:'架空町 / 架空県',
  latitude:35.1,longitude:136.8,timezone:'Asia/Tokyo',admin1:'架空県',admin2:'',admin3:'',admin4:'',
  source:'open-meteo-geocoding'};

async function mockPreviewWeather(page){
  await page.evaluate(location=>{
    const realFetch=window.fetch;
    window.previewWeatherQuery=location.query;
    window.previewWeatherConfirmations=0;
    window.prompt=()=>previewWeatherQuery;
    window.confirm=()=>{previewWeatherConfirmations++;return true;};
    window.alert=()=>{};
    window.fetch=(input,...args)=>{
      const url=new URL(input,document.baseURI);
      if(url.hostname==='geocoding-api.open-meteo.com'){
        return new Promise(resolve=>{
          window.finishPreviewLocation=()=>resolve(new Response(JSON.stringify({results:[location]})));
        });
      }
      if(url.hostname==='historical-forecast-api.open-meteo.com'){
        return new Promise(resolve=>{
          window.finishPreviewWeather=()=>resolve(new Response(JSON.stringify({daily:{
            time:[url.searchParams.get('start_date')],weather_code:[63],temperature_2m_max:[27],temperature_2m_min:[13]
          }})));
        });
      }
      return realFetch(input,...args);
    };
  },fictionalWeatherLocation);
}

async function openPreviewLocation(page){
  await page.locator('#storeMenuBtn').click();
  await page.locator('#weatherLocationMenuItem').click();
}

test('weather location saves only the selected store and preserves the prior revision when cleared',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  await mockPreviewWeather(page);
  await openPreviewLocation(page);
  await page.waitForFunction(()=>typeof window.finishPreviewLocation==='function');
  await page.evaluate(()=>finishPreviewLocation());
  await expect(page.locator('#storeSel + [role=status]')).toHaveText('保存しました。');
  const expected=JSON.parse(seed.raw);
  expected.stores[seed.active].weatherLocation=fictionalWeatherLocation;
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  const prior=await committedInput(page);
  await page.evaluate(()=>{window.previewWeatherQuery='';});
  await openPreviewLocation(page);
  await page.waitForFunction(()=>combinedPreview.getStatus().state==='IDLE_OBSERVED');
  delete expected.stores[seed.active].weatherLocation;
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  const observer=await openStoreSwitchPeer(context);
  try{
    expect(JSON.parse((await readStoreSwitchRecord(observer)).previous.raw)).toEqual(prior.snapshot);
    expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await observer.close();}
});

test('a delayed location search cannot update a different store',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  await mockPreviewWeather(page);
  await openPreviewLocation(page);
  await page.waitForFunction(()=>typeof window.finishPreviewLocation==='function');
  await page.locator('#nav2').click();
  await page.locator('#storeSel').selectOption(seed.peer);
  await expect(page.locator('#storeSel')).toBeEnabled();
  await expect(page.locator('#storeSel')).toHaveValue(seed.peer);
  await expect(page.locator('#storeSel + [role=status]')).toBeEmpty();
  const switched=await committedInput(page);
  expect(switched.revision).toBe(1);
  await page.evaluate(()=>finishPreviewLocation());
  await page.waitForFunction(()=>!InsightWeatherLocation.hasPendingSearch());
  expect(await committedInput(page)).toEqual(switched);
  expect(switched.snapshot.stores[seed.active].weatherLocation).toEqual(JSON.parse(seed.raw).stores[seed.active].weatherLocation);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('weather location holds on an interrupted readback and keeps the previous version',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  await mockPreviewWeather(page);
  const observer=await openStoreSwitchPeer(context);
  try{
    await interruptCountReadback(page,'readback failure');
    await openPreviewLocation(page);
    await page.waitForFunction(()=>typeof window.finishPreviewLocation==='function');
    await page.evaluate(()=>finishPreviewLocation());
    await expect(page.locator('#storeSel + [role=status]')).toContainText('追加の保存を停止しました');
    expect(await page.evaluate(()=>({status:combinedPreview.getStatus().state,location:store.weatherLocation})))
      .toEqual({status:'HELD',location:JSON.parse(seed.raw).stores[seed.active].weatherLocation});
    const record=await readStoreSwitchRecord(observer);
    const expected=JSON.parse(seed.raw);
    expected.stores[seed.active].weatherLocation=fictionalWeatherLocation;
    expect(record.revision).toBe(1);
    expect(JSON.parse(record.raw)).toEqual(expected);
    expect(record.previous.raw).toBe(seed.raw);
    expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await observer.close();}
});

test('explicit automatic weather fills only the draft and ignores manual changes and stale dates',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  await mockPreviewWeather(page);
  await openPreviewLocation(page);
  await page.waitForFunction(()=>typeof window.finishPreviewLocation==='function');
  await page.evaluate(()=>finishPreviewLocation());
  await expect(page.locator('#storeSel + [role=status]')).toHaveText('保存しました。');
  const baseline=await committedInput(page);
  const maximum=page.locator('#qi_tempMaxC');
  async function start(){
    await page.evaluate(()=>{delete window.finishPreviewWeather;});
    await page.locator('#autoWxBtn').click();
    await page.waitForFunction(()=>typeof window.finishPreviewWeather==='function');
  }
  async function finish(){
    await page.evaluate(()=>finishPreviewWeather());
    await page.waitForFunction(()=>!InsightWeatherTemperatureAuto.hasPendingFetch());
  }
  await start();
  await maximum.fill('24');
  await finish();
  await expect(maximum).toHaveValue('24');
  await start();
  await page.locator('#qWeatherCompactTrigger').click();
  await page.locator('#qWeatherCompactMenu [data-wx="晴"]').click();
  await finish();
  await expect(page.locator('#qWeatherCompactTrigger .qwc-label')).toHaveText('晴');
  await start();
  await page.locator('#iqdDateInput').fill(seed.year+'-06-11');
  await finish();
  await expect(maximum).toHaveValue('');
  expect(await committedInput(page)).toEqual(baseline);

  await page.locator('#iqdDateInput').fill(seed.iso);
  await start();
  await finish();
  await expect(maximum).toHaveValue('27');
  await expect(page.locator('#qi_tempMinC')).toHaveValue('13');
  await expect(page.locator('#qWeatherCompactTrigger .qwc-label')).toHaveText('雨');
  expect(await committedInput(page)).toEqual(baseline);
  await page.locator('#quickSaveBtn').click();
  await expect(page.locator('#quickSaveBtn')).toBeEnabled();
  await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
  await expect(page.locator('#quickSaveBtn + [role=status]')).toBeEmpty();
  const expected=baseline.snapshot;
  Object.assign(expected.stores[seed.active].data[seed.year][seed.month][seed.day-1],{weather:'雨',tempMaxC:27,tempMinC:13});
  expected.stores[seed.peer].data[seed.year][seed.month][seed.day-1].weather='雨';
  expected.sharedWeather={...expected.sharedWeather,[seed.year+'-'+seed.month+'-'+seed.day]:'雨'};
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

async function openBulkWeatherPreview(page){
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedBulk:true});
  await mockPreviewWeather(page);
  await page.evaluate(()=>{
    const fetchOther=window.fetch;
    window.bulkRequests=[];
    window.fetch=(input,...args)=>{
      const url=new URL(input,document.baseURI);
      if(url.hostname!=='historical-forecast-api.open-meteo.com')return fetchOther(input,...args);
      return new Promise(resolve=>{
        const date=url.searchParams.get('start_date'),latitude=url.searchParams.get('latitude');
        bulkRequests.push({date,latitude,reply(){
          resolve(new Response(JSON.stringify({daily:{
            time:[date],weather_code:[63],temperature_2m_max:[28],temperature_2m_min:[7]
          }})));
        }});
      });
    };
  });
  await page.locator('#navSettings').click();
  return seed;
}

async function expectBulkRequest(page,index,date,latitude){
  await expect.poll(()=>page.evaluate(index=>{
    const pending=bulkRequests[index];
    return pending?[pending.date,pending.latitude]:null;
  },index)).toEqual([date,latitude]);
}

test('bulk weather resumes only missing intervals after cancelling and preserves the previous revision',async({page,context})=>{
  const seed=await openBulkWeatherPreview(page);
  const start=page.locator('#insightWeatherBulkStart'),status=page.locator('#insightWeatherBulkStatus');
  const expected=JSON.parse(seed.raw);
  await start.click();
  await expectBulkRequest(page,0,seed.iso,'35.1');
  await page.evaluate(()=>bulkRequests[0].reply());
  await expectBulkRequest(page,1,seed.year+'-07-01','35.1');
  expected.stores[seed.active].data[seed.year]['6月'][seed.day-1].tempMaxC=28;
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await page.locator('#insightWeatherBulkCancel').click();
  await page.evaluate(()=>bulkRequests[1].reply());
  await expect(status).toContainText('中止しました');
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});

  await start.click();
  await expectBulkRequest(page,2,seed.year+'-07-01','35.1');
  await page.evaluate(()=>bulkRequests[2].reply());
  await expectBulkRequest(page,3,seed.year+'-05-01','36.2');
  expected.stores[seed.active].data[seed.year]['7月'][0].weather='雨';
  const prior=JSON.stringify(expected);
  await page.evaluate(()=>bulkRequests[3].reply());
  await expect(status).toContainText('取得が終了しました');
  expected.stores[seed.peer].data[seed.year]['5月'][0].tempMinC=7;
  expect(await committedInput(page)).toEqual({revision:3,snapshot:expected});
  const observer=await openStoreSwitchPeer(context);
  try{
    expect(JSON.parse((await readStoreSwitchRecord(observer)).previous.raw)).toEqual(JSON.parse(prior));
    expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await observer.close();}
});

for(const cause of ['changed location','competing revision','interrupted readback']){
  test('bulk weather protects data after '+cause,async({page,context})=>{
    const seed=await openBulkWeatherPreview(page);
    const expected=JSON.parse(seed.raw);
    const observer=await openStoreSwitchPeer(context);
    try{
      await page.locator('#insightWeatherBulkStart').click();
      await expectBulkRequest(page,0,seed.iso,'35.1');
      if(cause==='changed location'){
        await openPreviewLocation(page);
        await page.waitForFunction(()=>typeof window.finishPreviewLocation==='function');
        await page.evaluate(()=>finishPreviewLocation());
        await expect(page.locator('#storeSel + [role=status]')).toHaveText('保存しました。');
        expected.stores[seed.active].weatherLocation=fictionalWeatherLocation;
      }else if(cause==='competing revision'){
        await observer.evaluate(async id=>{
          const api=InsightIndexedDBStorageV1,record=await api.read();
          record.snapshot.stores[id].name='別タブで保存';
          await api.save(record.revision,record.snapshot);
        },seed.peer);
        expected.stores[seed.peer].name='別タブで保存';
      }else{
        await interruptCountReadback(page,'readback failure');
        expected.stores[seed.active].data[seed.year]['6月'][seed.day-1].tempMaxC=28;
      }
      await page.evaluate(()=>bulkRequests[0].reply());
      await expect(page.locator('#insightWeatherBulkStatus')).toContainText('取得を中断しました');
      expect(await page.evaluate(()=>combinedPreview.getStatus().state)).toBe(
        cause==='changed location'?'IDLE_OBSERVED':'HELD');
      expect(await page.evaluate(()=>bulkRequests.length)).toBe(1);
      const record=await readStoreSwitchRecord(observer);
      expect(record.revision).toBe(1);
      expect(JSON.parse(record.raw)).toEqual(expected);
      expect(record.previous.raw).toBe(seed.raw);
      expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await observer.close();}
  });
}

test('monthly KPIs and waste budget update only the selected store and scope',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  const expected=JSON.parse(seed.raw);
  await page.locator('#nav1').click();
  const {year,month}=await page.evaluate(()=>({year:String(baseYear),month:selMonth}));
  expect(await page.evaluate(()=>InsightStorage.serialize(allStores))).toBe(seed.raw);
  expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
  const labor=page.locator('[data-monthly-ops="labor"]');
  const grossMargin=page.locator('[data-monthly-ops="grossMargin"]');
  const status=page.locator('#insightMonthlyOpsPreviewStatus');
  await page.evaluate(()=>{window.prompt=()=>null;});
  await labor.click();
  expect(await committedInput(page)).toEqual({revision:0,snapshot:expected});
  await page.evaluate(()=>{window.prompt=()=>'42,000';});
  await labor.click();
  await expect(status).toHaveText('保存しました。');
  const ops=expected.stores[seed.active].monthlyOps;
  ops[year]??={};
  ops[year][month]={laborCostYen:42000,grossMarginRate:0,...ops[year][month]};
  ops[year][month].laborCostYen=42000;
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await page.evaluate(()=>{window.prompt=()=>'19.5';});
  await grossMargin.click();
  await expect(grossMargin).toContainText('19.5');
  ops[year][month].grossMarginRate=19.5;
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});

  await page.locator('#nav4').click();
  const edit=page.locator('#haikiBudgetEditBtn');
  const budget=page.locator('#budgetModalBg');
  await edit.click();
  await budget.locator('#be_total').fill('10000');
  await budget.getByRole('button',{name:'キャンセル'}).click();
  expect(await committedInput(page)).toEqual({revision:2,snapshot:expected});
  await edit.click();
  await budget.locator('#be_total').fill('30000');
  await budget.locator('[id="be_'+seed.category+'"]').fill('10000');
  await budget.getByRole('button',{name:'保存する'}).click();
  await expect(budget).not.toHaveClass(/show/);
  const shop=expected.stores[seed.active];
  shop.haikibudget={...shop.haikibudget,total:30000,cats:{
    ...(shop.haikibudget?.cats??await page.evaluate(()=>blankHaiki())),[seed.category]:10000
  }};
  expect(await committedInput(page)).toEqual({revision:3,snapshot:expected});

  const observer=await openStoreSwitchPeer(context);
  try{
    const record=await readStoreSwitchRecord(observer);
    const beforeBudget=structuredClone(expected);
    const prior=JSON.parse(seed.raw).stores[seed.active].haikibudget;
    if(prior)beforeBudget.stores[seed.active].haikibudget=prior;
    else delete beforeBudget.stores[seed.active].haikibudget;
    expect(JSON.parse(record.previous.raw)).toEqual(beforeBudget);
    expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await observer.close();}
});

test('monthly KPI conflict preserves the competing revision and its prior snapshot',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true,seedManagement:true});
  await page.locator('#nav1').click();
  const peer=await openStoreSwitchPeer(context);
  try{
    const expected=JSON.parse(seed.raw);
    expected.stores[seed.peer].name='別タブの確定値';
    await peer.evaluate(snapshot=>InsightIndexedDBStorageV1.save(0,snapshot),expected);
    await page.evaluate(()=>{window.prompt=()=>'42000';});
    await page.locator('[data-monthly-ops="labor"]').click();
    await expect(page.locator('#insightMonthlyOpsPreviewStatus')).toContainText('追加の保存を停止');
    const record=await readStoreSwitchRecord(peer);
    expect(record.revision).toBe(1);
    expect(JSON.parse(record.raw)).toEqual(expected);
    expect(record.previous.raw).toBe(seed.raw);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await peer.close();}
});

test('waste budget holds its edit and does not acknowledge an uncertain readback',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  await page.locator('#nav4').click();
  const budget=page.locator('#budgetModalBg');
  await page.locator('#haikiBudgetEditBtn').click();
  await budget.locator('#be_total').fill('32000');
  await interruptCountReadback(page,'readback failure');
  await budget.getByRole('button',{name:'保存する'}).click();
  await expect(budget).toBeVisible();
  await expect(budget.locator('#be_total')).toHaveValue('32,000');
  await expect(page.locator('#insightBudgetPreviewStatus')).toContainText('追加の保存を停止');
  const expected=JSON.parse(seed.raw);
  const cats=await page.evaluate(()=>blankHaiki());
  const shop=expected.stores[seed.active];
  shop.haikibudget={...shop.haikibudget,total:32000,cats:{...shop.haikibudget?.cats,...cats}};
  const peer=await openStoreSwitchPeer(context);
  try{
    const record=await readStoreSwitchRecord(peer);
    expect(record.revision).toBe(1);
    expect(JSON.parse(record.raw)).toEqual(expected);
    expect(record.previous.raw).toBe(seed.raw);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await peer.close();}
});

test('isolated theme remains device-local without creating a business data revision',async({page})=>{
  const seed=await openQuickInputPreview(page,{followMonthlyInputs:true,manageStoresAndYears:true});
  await page.locator('#navSettings').click();
  const checkbox=page.locator('#insightThemeToggle');
  const checked=await checkbox.isChecked();
  await checkbox.setChecked(!checked,{force:true});
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('insight_dark'))).toBe(checked?'0':'1');
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

test('manual adoption uses the real encrypted backup confirmation and preserves the legacy source',async({page})=>{
  await routeMigrationPage(page);
  async function open(){
    await page.goto('/Index.html');
    await waitForMigrationChecks(page);
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  }
  await open();
  const raw=await page.evaluate(()=>{
    const source=InsightStorage.migrateSnapshot(allStores);
    const first=source.stores[source.current];
    first.name='架空店舗A';
    source.stores['fictional-b']=JSON.parse(JSON.stringify(first));
    source.stores['fictional-b'].name='架空店舗B';
    first.data[first.years.at(-1)]['1月'][0].売上=123;
    const raw=' '+JSON.stringify(source)+'\n';
    allStores=source;
    store=source.stores[source.current];
    localStorage.setItem('insight_v11',raw);
    return raw;
  });
  const divergent=await page.evaluate(async ()=>{
    const name=store.name;
    store.name='画面側だけ変更';
    try{return await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);}
    finally{store.name=name;}
  });
  expect(divergent).toContain('未保存の入力または保存データの変更');
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

  const password='Fit123';
  const confirm=page.getByRole('button',{name:'保存したファイルを確認した',exact:true});
  async function startBackup(){
    await page.evaluate(()=>{
      window.migrationResult=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,
        selectVerifiedBackup:()=>({file:new Blob([JSON.stringify(window.migrationDownloadedFile)]),password:'Fit123'})
      }).catch(error=>error.message);
    });
    await page.locator('#insightBackupPassword').fill(password);
    await page.locator('#insightBackupPasswordConfirm').fill(password);
    const event=page.waitForEvent('download');
    await page.locator('#insightBackupOverlay button[type=submit]').click();
    const download=await event;
    await expect(confirm).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
    const file=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    await page.evaluate(file=>{window.migrationDownloadedFile=file;},file);
    return file;
  }

  await startBackup();
  await page.getByRole('button',{name:'未確認のまま閉じる',exact:true}).click();
  expect(await page.evaluate(()=>migrationResult)).toBe('Backup save was not confirmed');
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

  await startBackup();
  const draftInput=await page.evaluate(()=>{
    const input=document.querySelector('#quickGrid input[type="text"],#quickGrid input[type="number"]');
    input.value='987';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return input.id;
  });
  await confirm.click();
  expect(await page.evaluate(()=>migrationResult)).toContain('未保存の入力または保存データの変更');
  expect(await page.evaluate(id=>document.getElementById(id).value,draftInput)).toBe('987');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
  // Test-only reload after verifying the uncommitted edit was preserved.
  await open();

  const file=await startBackup();
  expect(file.format).toBe('InsightEncryptedBackup');
  const backup=await page.evaluate(({file,password})=>InsightBackupCryptoV1.decrypt(file,password),{file,password});
  const source=JSON.parse(raw);
  expect(backup.data).toEqual(source);
  expect(backup.backupInfo).toMatchObject({
    format:'InsightBackup',formatVersion:2,currentStoreId:source.current,
    storageKey:'insight_v11',storeCount:2,
    stores:Object.entries(source.stores).map(([id,store])=>({
      id,name:store.name,years:store.years.map(String).sort()
    }))
  });
  await confirm.click();
  expect(await page.evaluate(()=>migrationResult)).toEqual({revision:0,snapshot:source});

  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose())).toEqual({state:'active',revision:0});
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnoseStartup()))
    .toEqual({state:'hold',reason:'indexeddb-adopted'});
  const recovered=await page.evaluate(async ()=>{
    const storage=InsightIndexedDBStorageV1,markerKey='insight_indexeddb_adoption_v1';
    const initial=await storage.read(),writeMetadata=InsightStorage.writeMetadata;
    const originalRaw=localStorage.getItem('insight_v11');
    const originalMarker=localStorage.getItem(markerKey);
    let interrupted;
    InsightStorage.writeMetadata=(key,value)=>{
      if(key===markerKey&&JSON.parse(value).state==='active')throw new Error('Fixture lost save acknowledgement');
      return writeMetadata(key,value);
    };
    try{
      initial.snapshot.stores[initial.snapshot.current].name='架空店舗A（更新）';
      interrupted=await storage.save(initial.revision,initial.snapshot).catch(error=>error.message);
    }finally{InsightStorage.writeMetadata=writeMetadata;}
    const held=localStorage.getItem(markerKey);
    const verified=await storage.diagnose({verifyInterrupted:true});
    const stillHeld=held===localStorage.getItem(markerKey);
    const changed=JSON.parse(held);
    changed.operation.digest='0'.repeat(64);
    writeMetadata(markerKey,JSON.stringify(changed));
    const mismatched=await storage.diagnose({verifyInterrupted:true});
    writeMetadata(markerKey,originalMarker); // Fixture only, to continue the existing conflict test.
    return {interrupted,verified,mismatched,stillHeld,sourceUntouched:originalRaw===localStorage.getItem('insight_v11')};
  });
  expect(recovered).toEqual({
    interrupted:'Fixture lost save acknowledgement',
    verified:{state:'hold',reason:'writing',observedRevision:1,recovery:'save-verified'},
    mismatched:{state:'hold',reason:'writing',observedRevision:1,recovery:'unverified'},
    stillHeld:true,sourceUntouched:true
  });
  source.stores[source.current].name='架空店舗A（更新）';

  const result=await page.evaluate(async ()=>{
    const store=InsightIndexedDBStorageV1;
    const initial=await store.read();
    const shop=initial.snapshot.stores[initial.snapshot.current];
    shop.data[shop.years.at(-1)]['1月'][0].売上=456;
    const saved=await store.save(initial.revision,initial.snapshot);
    const conflict=await store.save(initial.revision,initial.snapshot).catch(error=>error.message);
    return {saved,conflict,raw:localStorage.getItem('insight_v11')};
  });
  const shop=source.stores[source.current];
  shop.data[shop.years.at(-1)]['1月'][0].売上=456;
  expect(result).toEqual({saved:{revision:2,snapshot:source},conflict:'IndexedDB revision conflict',raw});
  await open();
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().catch(error=>error.message))).toBe('IndexedDB writes are on hold');
  const diagnostic=await page.evaluate(async ({file,password})=>{
    const store=InsightIndexedDBStorageV1;
    const markerKey='insight_indexeddb_adoption_v1';
    const before=localStorage.getItem(markerKey);
    const originalRaw=localStorage.getItem('insight_v11');
    const writing=await store.diagnose();
    const unchanged=before===localStorage.getItem(markerKey);
    localStorage.removeItem(markerKey);
    const missingMarker=await store.diagnose();
    localStorage.setItem(markerKey,before);
    await new Promise((resolve,reject)=>{
      const deletion=indexedDB.deleteDatabase('insight-store-snapshots-v1');
      deletion.onsuccess=resolve;
      deletion.onerror=()=>reject(deletion.error);
      deletion.onblocked=()=>reject(new Error('Fixture database is still in use'));
    });
    const missingDatabase=await store.diagnose();
    localStorage.removeItem(markerKey);
    const bothMissing=await store.diagnose({verifyInterrupted:true});
    const wrongPassword=await store.reviewHistoryOnlyBackup(file,'Wrong6',()=>true)
      .then(()=>false,()=>true);
    localStorage.setItem('insight_v11',originalRaw.replace('"売上":123','"売上":124'));
    const wrongBackup=await store.reviewHistoryOnlyBackup(file,password,()=>true).catch(error=>error.message);
    localStorage.setItem('insight_v11',originalRaw);
    const cancelled=await store.reviewHistoryOnlyBackup(file,password,()=>false);
    let reviewedStores;
    const confirmed=await store.reviewHistoryOnlyBackup(file,password,summary=>{
      reviewedStores=summary.stores.map(shop=>shop.name);
      return true;
    });
    const changed=await store.reviewHistoryOnlyBackup(file,password,()=>{
      localStorage.setItem('insight_v11',' '+originalRaw);
      return true;
    }).catch(error=>error.message);
    localStorage.setItem('insight_v11',originalRaw);
    const repeatedMigration=await store.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
    const markerStillMissing=localStorage.getItem(markerKey)===null;
    const stillMissing=await store.diagnose();
    localStorage.setItem(markerKey,before);
    return {writing,unchanged,missingMarker,missingDatabase,bothMissing,wrongPassword,wrongBackup,cancelled,confirmed,reviewedStores,changed,repeatedMigration,markerStillMissing,stillMissing,
      markerPreserved:localStorage.getItem(markerKey)===before,
      rawPreserved:localStorage.getItem('insight_v11')===originalRaw};
  },{file,password});
  expect(diagnostic).toEqual({
    writing:{state:'hold',reason:'writing',observedRevision:2},unchanged:true,
    missingMarker:{state:'hold',reason:'marker-missing'},
    missingDatabase:{state:'hold',reason:'database-missing'},
    bothMissing:{state:'hold',reason:'history-only'},
    wrongPassword:true,
    wrongBackup:'バックアップと移行元のデータが一致しません。',
    cancelled:{state:'hold',review:'cancelled'},
    confirmed:{state:'hold',review:'confirmed'},
    reviewedStores:['架空店舗A','架空店舗B'],
    changed:'Recovery data changed',
    repeatedMigration:'Existing migration requires review',
    markerStillMissing:true,
    stillMissing:{state:'hold',reason:'history-only'},
    markerPreserved:true,rawPreserved:true
  });
});

test('missing storage keeps migration stopped and only previews a selected encrypted backup',async({page})=>{
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.addScriptTag({url:'/insight_indexeddb_recovery_preview_v1.js'});
  const result=await page.evaluate(async ()=>{
    const api=InsightIndexedDBStorageV1,sourceKey='insight_v11';
    const markerKey='insight_indexeddb_adoption_v1';
    const snapshot=InsightStorage.migrateSnapshot(allStores);
    snapshot.stores[snapshot.current].name='架空店舗';
    const store=snapshot.stores[snapshot.current];
    const years=store.years.map(String).sort();
    const createdAt='2026-11-19T00:00:00.000Z',password='Fit123';
    const envelope=await InsightBackupCryptoV1.encrypt({
      backupInfo:{
        format:'InsightBackup',formatVersion:2,createdAt,storageKey:sourceKey,
        schemaVersion:snapshot.schemaVersion,storeCount:1,currentStoreId:snapshot.current,years,
        stores:[{id:snapshot.current,name:store.name,years}]
      },
      data:snapshot
    },password);
    const file=new File([JSON.stringify(envelope)],'Insight_261119_0900.json');
    localStorage.removeItem(sourceKey);

    const initial=await api.diagnose();
    const olderSources=[];
    for(const key of ['insight_v9','insight_v8']){
      localStorage.setItem(key,'{"years":["2025"],"data":{}}');
      const diagnostic=await api.diagnose();
      const blocked=await api.reviewMissingStorageBackup(file,password,()=>true).catch(error=>error.message);
      olderSources.push({diagnostic,blocked,preserved:localStorage.getItem(key)==='{"years":["2025"],"data":{}}'});
      localStorage.removeItem(key);
    }
    const legacyAppeared=await api.reviewMissingStorageBackup(file,password,()=>{
      localStorage.setItem('insight_v8','{"years":["2025"],"data":{}}');
      return true;
    }).catch(error=>error.message);
    const legacyPreserved=localStorage.getItem('insight_v8')==='{"years":["2025"],"data":{}}';
    localStorage.removeItem('insight_v8');
    const migration=await api.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
    const invalidFile=await api.reviewMissingStorageBackup(new File(['{'],'invalid.json'),password,()=>true)
      .catch(error=>error.message);
    const badPassword=await api.reviewMissingStorageBackup(file,'Wrong6',()=>true)
      .catch(error=>error.message);
    const cancelled=await api.reviewMissingStorageBackup(file,password,()=>false);
    let summary;
    const confirmed=await api.reviewMissingStorageBackup(file,password,info=>{summary=info;return true;});
    const withoutWrites=localStorage.getItem(sourceKey)===null&&localStorage.getItem(markerKey)===null;
    const after=await api.diagnose();
    const appeared=await api.reviewMissingStorageBackup(file,password,()=>{
      localStorage.setItem(sourceKey,JSON.stringify(snapshot));
      return true;
    }).catch(error=>error.message);
    const preservedNewSource=localStorage.getItem(sourceKey)===JSON.stringify(snapshot);
    localStorage.removeItem(sourceKey);
    const screen=document.createElement('div');
    screen.id='fictionalRecoveryScreen';
    document.body.append(screen);
    InsightIndexedDBRecoveryPreviewV1.mount(screen);
    return {initial,migration,invalidFile,badPassword,cancelled,confirmed,summary,withoutWrites,after,
      appeared,preservedNewSource,olderSources,legacyAppeared,legacyPreserved,envelope:JSON.stringify(envelope)};
  });
  const {envelope,...diagnostic}=result;
  expect(diagnostic).toEqual({
    initial:{state:'hold',reason:'storage-history-unknown'},
    olderSources:Array.from({length:2},()=>({
      diagnostic:{state:'hold',reason:'older-source-present'},
      blocked:'Missing storage recovery state could not be verified',
      preserved:true
    })),
    legacyAppeared:'Missing storage recovery state could not be verified',
    legacyPreserved:true,
    migration:'Legacy Insight data is missing',
    invalidFile:'バックアップファイルを読み込めませんでした。',
    badPassword:'復号できませんでした。パスワードまたはバックアップファイルを確認してください。',
    cancelled:{state:'hold',review:'cancelled'},
    confirmed:{state:'hold',review:'confirmed'},
    summary:{createdAt:'2026-11-19T00:00:00.000Z',stores:[{
      id:expect.any(String),name:'架空店舗',years:expect.arrayContaining([expect.stringMatching(/^\d{4}$/)])
    }]},
    withoutWrites:true,
    after:{state:'hold',reason:'storage-history-unknown'},
    appeared:'Missing storage recovery state could not be verified',
    preservedNewSource:true
  });
  const screen=page.locator('#fictionalRecoveryScreen');
  const file=screen.getByLabel('暗号化バックアップ',{exact:true});
  const password=screen.getByLabel('バックアップのパスワード');
  for(const [button,message] of [
    ['取り消す','確認を取り消しました。保存は停止したままです。'],
    ['確認済みにする','バックアップを確認しました。保存は停止したままです。']
  ]){
    await file.setInputFiles({name:'Insight_261119_0900.json',mimeType:'application/json',buffer:Buffer.from(envelope)});
    await password.fill('Fit123');
    await screen.getByRole('button',{name:'内容を表示'}).click();
    await expect(screen.getByText(/架空店舗/)).toBeVisible();
    await expect(password).toHaveValue('');
    await screen.getByRole('button',{name:button}).click();
    await expect(screen.getByRole('status')).toHaveText(message);
  }
  expect(await page.evaluate(async ()=>({
    source:localStorage.getItem('insight_v11'),
    marker:localStorage.getItem('insight_indexeddb_adoption_v1'),
    diagnostic:await InsightIndexedDBStorageV1.diagnose()
  }))).toEqual({source:null,marker:null,diagnostic:{state:'hold',reason:'storage-history-unknown'}});
});

test('startup diagnosis preserves legacy data and refuses uncertain or adopted storage',async({page,context})=>{
  await page.route('**/startup-diagnosis-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional startup diagnosis fixture</title>'
  }));
  await page.goto('/startup-diagnosis-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const initial=await page.evaluate(async ()=>{
    const api=InsightIndexedDBStorageV1;
    const empty=await api.diagnoseStartup();
    const existing=[];
    for(const key of ['insight_v11','insight_v9','insight_v8']){
      localStorage.setItem(key,'fictional legacy data');
      existing.push([await api.diagnoseStartup(),localStorage.getItem(key)]);
      localStorage.removeItem(key);
    }
    return {empty,existing,keys:localStorage.length};
  });
  expect(initial).toEqual({
    empty:{state:'hold',reason:'storage-history-unknown'},
    existing:Array.from({length:3},()=>[{state:'legacy'},'fictional legacy data']),
    keys:0
  });

  const other=await context.newPage();
  try{
    await other.route('**/startup-diagnosis-fixture',route=>route.fulfill({
      contentType:'text/html',body:'<!doctype html><title>Fictional other tab</title>'
    }));
    await other.goto('/startup-diagnosis-fixture');
    await other.evaluate(()=>{
      localStorage.setItem('insight_v11','fictional data from another tab');
      localStorage.setItem('insight_indexeddb_adoption_v1','{"state":"active","id":"fixture"}');
    });
    const blocked=await page.evaluate(async ()=>({
      diagnostic:await InsightIndexedDBStorageV1.diagnoseStartup(),
      raw:localStorage.getItem('insight_v11'),
      marker:localStorage.getItem('insight_indexeddb_adoption_v1')
    }));
    expect(blocked).toEqual({
      diagnostic:{state:'hold',reason:'database-missing'},
      raw:'fictional data from another tab',
      marker:'{"state":"active","id":"fixture"}'
    });
  }finally{
    await other.close();
  }

  const unavailable=await page.evaluate(async ()=>{
    let release;
    let entered;
    const locked=new Promise(resolve=>{entered=resolve;});
    const holding=navigator.locks.request('insight-store-snapshots-v1',async lock=>{
      await new Promise(resolve=>{release=resolve;entered();});
    });
    await locked;
    try{return await InsightIndexedDBStorageV1.diagnoseStartup();}
    finally{release();await holding;}
  });
  expect(unavailable).toEqual({state:'hold',reason:'startup-check-unavailable'});
});

test('a tab with the current storage guard stops legacy writes once it observes migration',async({context,page})=>{
  await context.route('**/guarded-storage-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional guarded storage fixture</title>'
  }));
  await page.goto('/guarded-storage-fixture');
  await page.evaluate(()=>{window.SK='insight_v11';});
  await page.addScriptTag({url:'/insight_storage_v1.js'});
  const original=await page.evaluate(()=>InsightStorage.writeSnapshot({fictional:123}));
  expect(JSON.parse(original)).toEqual({fictional:123,schemaVersion:1});

  const other=await context.newPage();
  try{
    await other.goto('/guarded-storage-fixture');
    await page.evaluate(()=>{
      window.markerCleared=new Promise(resolve=>{
        window.addEventListener('storage',function observed(event){
          if(event.key==='insight_indexeddb_adoption_v1'&&event.newValue===null){
            window.removeEventListener('storage',observed);
            resolve();
          }
        });
      });
    });
    await other.evaluate(()=>{
      const key='insight_indexeddb_adoption_v1';
      localStorage.setItem(key,'{"state":"preparing","id":"fictional"}');
      localStorage.removeItem(key);
    });
    const result=await page.evaluate(async ()=>{
      await window.markerCleared;
      const store=InsightStorage;
      const target={fictional:999};
      const failures=[];
      let mutated=false;
      for(const attempt of [
        ()=>store.writeSnapshot(target),
        ()=>store.persistCurrent(target),
        ()=>store.transaction(target,()=>{mutated=true;})
      ]){
        try{attempt();}
        catch(error){failures.push(error.name);}
      }
      return {failures,mutated,target,raw:localStorage.getItem('insight_v11')};
    });
    expect(result).toEqual({
      failures:Array(3).fill('InsightStorageConflictError'),
      mutated:false,
      target:{fictional:999},
      raw:original
    });
  }finally{
    await other.close();
  }

  // Reload a separate fixture with a malformed marker already present.
  await page.evaluate(()=>localStorage.setItem('insight_indexeddb_adoption_v1','{invalid'));
  await page.reload();
  await page.evaluate(()=>{window.SK='insight_v11';});
  await page.addScriptTag({url:'/insight_storage_v1.js'});
  const atStartup=await page.evaluate(()=>{
    try{InsightStorage.writeSnapshot({fictional:456});}
    catch(error){
      return {code:error.name,raw:localStorage.getItem('insight_v11'),
        marker:localStorage.getItem('insight_indexeddb_adoption_v1')};
    }
  });
  expect(atStartup).toEqual({code:'InsightStorageConflictError',raw:original,marker:'{invalid'});
});

for(const operation of ['read','save']){
  test('an unguarded legacy tab change leaves a persistent hold on '+operation,async({context,page})=>{
    await context.route('**/legacy-conflict-fixture',route=>route.fulfill({
      contentType:'text/html',body:'<!doctype html><title>Fictional legacy conflict fixture</title>'
    }));
    await page.goto('/legacy-conflict-fixture');
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    const original=await page.evaluate(async ()=>{
      const source={current:'fictional',stores:{fictional:{value:1}}};
      const raw=JSON.stringify(source);
      localStorage.setItem('insight_v11',raw);
      window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
      window.InsightMigrationBackupV1={verify(){},confirm:async()=>true,assertReady(){}};
      await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
      await InsightIndexedDBStorageV1.save(0,{...source,stores:{fictional:{value:2}}});
      return raw;
    });

    const other=await context.newPage();
    try{
      await other.goto('/legacy-conflict-fixture');
      const conflicting=await other.evaluate(()=>{
        const raw=JSON.stringify({current:'fictional',stores:{fictional:{value:3}}});
        localStorage.setItem('insight_v11',raw);
        return raw;
      });
      const observed=await page.evaluate(async operation=>{
        const api=InsightIndexedDBStorageV1;
        const rejected=await (operation==='read'?api.read():
          api.save(1,{current:'fictional',stores:{fictional:{value:4}}})).catch(error=>error.message);
        const record=await new Promise((resolve,reject)=>{
          const request=indexedDB.open('insight-store-snapshots-v1');
          request.onerror=()=>reject(request.error);
          request.onsuccess=()=>{
            const db=request.result;
            const tx=db.transaction('snapshots','readonly');
            const get=tx.objectStore('snapshots').get('current');
            tx.oncomplete=()=>{db.close();resolve(get.result);};
            tx.onabort=()=>{db.close();reject(tx.error);};
          };
        });
        return {rejected,diagnostic:await api.diagnose(),raw:localStorage.getItem('insight_v11'),
          initial:record.sourceRaw,prior:JSON.parse(record.previous.raw).stores.fictional.value,
          current:JSON.parse(record.raw).stores.fictional.value,revision:record.revision};
      },operation);
      expect(observed).toEqual({
        rejected:'Legacy Insight storage changed; IndexedDB writes are on hold',
        diagnostic:{state:'hold',reason:'source-conflict'},raw:conflicting,initial:original,
        prior:1,current:2,revision:1
      });

      // Simulate the legacy tab returning the original bytes. A reload must still hold.
      await other.evaluate(raw=>localStorage.setItem('insight_v11',raw),original);
      await page.reload();
      await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
      expect(await page.evaluate(async ()=>({
        diagnostic:await InsightIndexedDBStorageV1.diagnoseStartup(),
        read:await InsightIndexedDBStorageV1.read().catch(error=>error.message)
      }))).toEqual({
        diagnostic:{state:'hold',reason:'source-conflict'},read:'IndexedDB writes are on hold'
      });
    }finally{
      await other.close();
    }
  });
}

test('migration startup gate requires a confirmed restart and a fresh build without a service worker',async({page})=>{
  const fixture='/migration-gate-fixture';
  await page.route('**'+fixture,route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional migration gate fixture</title>'
  }));
  let serverBuild='fictional-current',unreachable=false,workerAppears=false;
  await page.route('**/Index.html?insight_migration_probe=*',async route=>{
    if(unreachable)return route.abort();
    if(workerAppears)await page.evaluate(()=>{window.workerState='registered';});
    return route.fulfill({contentType:'text/html',body:
      '<!doctype html><meta name="insight-shell-version" content="'+serverBuild+'">'});
  });
  await page.addInitScript(()=>{
    window.__INSIGHT_SHELL_VERSION__='fictional-current';
    window.__INSIGHT_FEATURE_SIGNATURE__='fictional-features';
    window.workerState='none';
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{
      get controller(){return window.workerState==='controlling'?{}:null;},
      async getRegistration(){return window.workerState==='registered'?{}:undefined;}
    }});
  });
  await page.goto(fixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const check=(legacyClientsClosed=true)=>page.evaluate(closed=>
    InsightIndexedDBStorageV1.checkMigrationEnvironment({
      expectedBuild:'fictional-current',expectedFeatures:'fictional-features',legacyClientsClosed:closed
    }),legacyClientsClosed);
  expect(await check(false)).toEqual({state:'hold',reason:'legacy-client-confirmation-required'});
  expect(await check()).toEqual({state:'ready'});
  await page.evaluate(()=>{window.__INSIGHT_FEATURE_SIGNATURE__='fictional-stale-features';});
  expect(await check()).toEqual({state:'hold',reason:'build-mismatch'});

  serverBuild='fictional-newer';
  await page.reload();
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  expect(await check()).toEqual({state:'hold',reason:'build-mismatch'});
  serverBuild='fictional-current';

  unreachable=true;
  expect(await check()).toEqual({state:'hold',reason:'build-check-unavailable'});
  unreachable=false;
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:false}));
  expect(await check()).toEqual({state:'hold',reason:'offline'});
  await page.evaluate(()=>{delete navigator.onLine;});

  await page.evaluate(()=>{window.workerState='controlling';});
  expect(await check()).toEqual({state:'hold',reason:'service-worker-present'});
  await page.evaluate(()=>{window.workerState='none';});
  workerAppears=true;
  expect(await check()).toEqual({state:'hold',reason:'service-worker-present'});

  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});

test('encrypted restore keeps the pre-restore revision and resumes only the verified committed copy',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{useRealBackupAfterMigration:true});
  const observer=await openStoreSwitchPeer(context);
  try{
    const result=await page.evaluate(async seed=>{
      const api=InsightIndexedDBStorageV1,password='Backup37';
      async function backupFile(data){
        const stores=Object.entries(data.stores).map(([id,shop])=>({id,name:shop.name,years:shop.years.map(String).sort()}));
        const years=[...new Set(stores.flatMap(shop=>shop.years))].sort();
        const backupInfo={format:'InsightBackup',formatVersion:2,storageKey:'insight_v11',
          createdAt:'2026-11-19T00:00:00.000Z',schemaVersion:data.schemaVersion,storeCount:stores.length,
          currentStoreId:data.current,years,stores};
        const envelope=await InsightBackupCryptoV1.encrypt({data,backupInfo},password);
        return new File([JSON.stringify(envelope)],'Insight_261119_0900.json');
      }
      const before=await api.read();
      const candidate=structuredClone(before.snapshot);
      candidate.stores[seed.peer].name='架空の復元先名';
      for(const shop of Object.values(candidate.stores)){
        Object.assign(shop.weatherLocation,{latitude:35.1,longitude:136.8,timezone:'Asia/Tokyo'});
        shop.data[seed.year][seed.month][seed.day-1].stockout='なし';
      }
      const safetyFile=await backupFile(before.snapshot),file=await backupFile(candidate);
      const args={file,password,safetyFile,safetyPassword:password,legacyClientsClosed:true};
      const markerKey='insight_indexeddb_adoption_v1';
      const marker=localStorage.getItem(markerKey);
      const mismatch=await api.restoreBackup({...args,safetyFile:file,confirm:()=>{throw new Error('unexpected confirmation');}})
        .catch(error=>error.message);
      const cancelled=await api.restoreBackup({...args,confirm:()=>false});
      const changed=await api.restoreBackup({...args,confirm:()=>{
        localStorage.setItem('insight_v11',' '+seed.raw);
        return true;
      }}).catch(error=>error.message);
      const conflictingSource=localStorage.getItem('insight_v11')===' '+seed.raw;
      const conflict=await api.diagnose();
      // Restore only the fixture's deliberately altered source and marker for the independent interruption case.
      localStorage.setItem('insight_v11',seed.raw);
      InsightStorage.writeMetadata(markerKey,marker);
      const unchanged=await api.read();
      const write=InsightStorage.writeMetadata;
      InsightStorage.writeMetadata=(key,value)=>{
        if(key===markerKey&&JSON.parse(value).state==='active')throw new Error('Fictional restore acknowledgement lost');
        return write(key,value);
      };
      let confirmation,interrupted;
      try{
        interrupted=await api.restoreBackup({...args,confirm:info=>{confirmation=info;return true;}})
          .catch(error=>error.message);
      }finally{InsightStorage.writeMetadata=write;}
      const diagnostic=await api.diagnose({verifyInterrupted:true});
      const waiting=await api.read().catch(error=>error.message);
      const verifiedFile=await backupFile((await InsightMigrationBackupV1.readRestoreCandidate(file,password)).snapshot);
      let recovery;
      const recoveryArgs={file:verifiedFile,password,legacyClientsClosed:true};
      const resumeMismatch=await api.resumeRecovery({...recoveryArgs,file:safetyFile,confirm:()=>true}).catch(error=>error.message);
      const resumeCancelled=await api.resumeRecovery({...recoveryArgs,confirm:()=>false});
      const resumed=await api.resumeRecovery({...recoveryArgs,confirm:info=>{recovery=info;return true;}});
      const after=await api.read();
      return {mismatch,cancelled,changed,conflict,conflictingSource,unchanged,interrupted,confirmation,
        diagnostic,waiting,resumeMismatch,resumeCancelled,resumed,recovery,after,source:localStorage.getItem('insight_v11')};
    },seed);
    expect(result.mismatch).toBe('バックアップと移行元のデータが一致しません。');
    expect(result.cancelled).toEqual({state:'active',review:'cancelled',revision:0});
    expect(result.changed).toContain('Legacy Insight storage changed');
    expect(result.conflict).toEqual({state:'hold',reason:'source-conflict'});
    expect(result.conflictingSource).toBe(true);
    expect(result.unchanged).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
    expect(result.interrupted).toBe('Fictional restore acknowledgement lost');
    expect(result.confirmation.target.stores.some(shop=>shop.name==='架空の復元先名')).toBe(true);
    expect(result.diagnostic).toEqual({state:'hold',reason:'writing',observedRevision:1,recovery:'save-verified'});
    expect(result.waiting).toBe('IndexedDB writes are on hold');
    expect(result.resumeMismatch).toBe('バックアップと移行元のデータが一致しません。');
    expect(result.resumeCancelled).toEqual({state:'hold',review:'cancelled'});
    expect(result.resumed).toEqual({state:'active',revision:1});
    expect(result.recovery).toMatchObject({outcome:'save-verified',revision:1,previousRevision:0});
    expect(result.after.revision).toBe(1);
    expect(result.after.snapshot.stores[seed.peer].name).toBe('架空の復元先名');
    expect(result.source).toBe(seed.raw);
    const record=await readStoreSwitchRecord(observer);
    expect(record.previous).toEqual({revision:0,raw:seed.raw});
    expect(JSON.parse(record.raw)).toEqual(result.after.snapshot);
    await observer.reload();
    await observer.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    expect(await observer.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual(result.after);
  }finally{await observer.close();}
});

async function openRealRecoveryForm(page){
  const seed=await openQuickInputPreview(page,{useRealBackupAfterMigration:true,connectQuick:false});
  await page.addScriptTag({url:'/insight_indexeddb_recovery_preview_v1.js'});
  await page.addScriptTag({url:'/insight_indexeddb_migration_preview_v1.js'});
  await page.route('**/reopened-recovery-fixture',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><meta charset="utf-8"><output></output><script src="/insight_indexeddb_storage_v1.js"></script>'+
    '<script>InsightIndexedDBStorageV1.read().then(result=>document.querySelector("output").textContent=result.revision);</script>'}));
  await page.evaluate(()=>{
    const screen=document.createElement('section');
    screen.id='recoveryFixture';
    document.body.replaceChildren(screen);
    document.body.inert=false;
    window.mountRecoveryMode=mode=>{
      screen.replaceChildren();
      const preview=InsightIndexedDBRecoveryPreviewV1;
      const restart=()=>location.replace('/reopened-recovery-fixture');
      if(mode==='export')preview.mountExport(screen);
      else if(mode==='resume')return InsightIndexedDBMigrationPreviewV1.start(screen,
        ()=>{throw new Error('Unexpected legacy load');},()=>{throw new Error('Unexpected adopted load');},{restart});
      else preview.mount(screen,{mode,onCommitted:restart});
    };
  });
  return seed;
}

async function writeFictionalRecoveryFile(page,seed,password){
  return page.evaluate(async ({seed,password})=>{
    const data=JSON.parse(seed.raw);
    data.stores[seed.peer].name='架空の復元対象';
    for(const shop of Object.values(data.stores)){
      Object.assign(shop.weatherLocation,{latitude:35.1,longitude:136.8,timezone:'Asia/Tokyo'});
      shop.data[seed.year][seed.month][seed.day-1].stockout='なし';
    }
    return JSON.stringify((await InsightMigrationBackupV1.encodeCommitted(data,password)).encrypted);
  },{seed,password});
}

test('real backup export and restore form verify files, cancel and reopen the committed revision',async({page})=>{
  const seed=await openRealRecoveryForm(page),password='FictionalBackup37';
  const target=await writeFictionalRecoveryFile(page,seed,password);
  const file=(content,name='Insight_261119_0900.json')=>({name,mimeType:'application/json',buffer:Buffer.from(content)});
  await page.evaluate(()=>mountRecoveryMode('export'));
  const exportForm=page.getByRole('group',{name:'確定版の暗号化バックアップ'});
  await exportForm.getByLabel('バックアップ用パスワード').fill(password);
  await exportForm.getByLabel('パスワードの確認').fill(password);
  const started=page.waitForEvent('download');
  await exportForm.getByRole('button',{name:'暗号化してダウンロード'}).click();
  const download=await started;
  await expect(page.getByRole('status')).toContainText('確定版 0');
  expect(download.suggestedFilename()).toMatch(/^Insight_\d{6}_\d{4}\.json$/);
  const safety=await fs.readFile(await download.path(),'utf8');
  const decoded=await page.evaluate(({safety,password})=>
    InsightBackupCryptoV1.decrypt(JSON.parse(safety),password),{safety,password});
  expect(decoded.data).toEqual(JSON.parse(seed.raw));
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});

  await page.evaluate(()=>mountRecoveryMode('restore'));
  const screen=page.locator('#recoveryFixture');
  const closed=screen.getByLabel('旧版のInsightをすべて閉じました');
  const review=screen.getByRole('button',{name:'内容を表示'});
  const approve=screen.getByRole('button',{name:'この内容を復元する'});
  async function fill(targetPassword){
    await screen.getByLabel('復元する暗号化バックアップ',{exact:true}).setInputFiles(file(target));
    await screen.getByLabel('復元するバックアップのパスワード',{exact:true}).fill(targetPassword);
    await screen.getByLabel('現在の確定版の暗号化バックアップ',{exact:true}).setInputFiles(file(safety));
    await screen.getByLabel('現在の確定版のパスワード',{exact:true}).fill(password);
  }
  await fill('WrongFictional37');
  await review.click();
  await expect(approve).toHaveCount(0);
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
  await closed.check();
  await review.click();
  await expect(screen.getByRole('status')).toContainText('確認できませんでした');
  await fill(password);
  await closed.check();
  await review.click();
  await expect(approve).toBeFocused();
  await expect(review).toBeDisabled();
  await screen.getByRole('button',{name:'取り消す'}).click();
  await expect(screen.getByRole('status')).toHaveText('取り消しました。');
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
  await fill(password);
  await closed.check();
  await review.click();
  await expect(screen.getByText(/架空の復元対象/)).toBeVisible();
  await approve.click();
  await expect(page.locator('output')).toHaveText('1');
  const restored=await committedInput(page);
  expect(restored.snapshot.stores[seed.peer].name).toBe('架空の復元対象');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

for(const outcome of ['close','confirm']){
  test('resume form after cancelling handles '+outcome,async({page,context})=>{
  const seed=await openRealRecoveryForm(page),password='FictionalResume37';
  const held=await page.evaluate(async password=>{
    const api=InsightIndexedDBStorageV1,write=InsightStorage.writeMetadata;
    const before=await api.read();
    const file=await InsightMigrationBackupV1.encodeCommitted(before.snapshot,password);
    InsightStorage.writeMetadata=(key,value)=>{
      if(JSON.parse(value).state==='active')throw new Error('Fictional save acknowledgement lost');
      return write(key,value);
    };
    try{await api.save(0,before.snapshot).catch(()=>{});}
    finally{InsightStorage.writeMetadata=write;}
    await mountRecoveryMode('resume');
    return JSON.stringify(file.encrypted);
  },password);
  const screen=page.locator('#recoveryFixture');
  const begin=async ()=>{
    await screen.getByLabel('暗号化バックアップ',{exact:true}).setInputFiles({
      name:'Insight_261119_0900.json',mimeType:'application/json',buffer:Buffer.from(held)
    });
    await screen.getByLabel('バックアップのパスワード',{exact:true}).fill(password);
    await screen.getByLabel('旧版のInsightをすべて閉じました').check();
    await screen.getByRole('button',{name:'内容を表示'}).click();
    await expect(screen.getByRole('button',{name:'この版で保存を再開する'})).toBeFocused();
  };
  await begin();
  await screen.getByRole('button',{name:'取り消す'}).click();
  await expect(screen.getByRole('status')).toHaveText('取り消しました。');
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
    .toMatchObject({state:'hold',reason:'writing',observedRevision:1,recovery:'save-verified'});
  await begin();
  const peer=await openStoreSwitchPeer(context);
  try{
    if(outcome==='close'){
      await page.close();
      expect(await peer.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
        .toMatchObject({state:'hold',reason:'writing',observedRevision:1});
    }else{
      await screen.getByRole('button',{name:'この版で保存を再開する'}).click();
      await expect(page.locator('output')).toHaveText('1');
      expect(await peer.evaluate(()=>InsightIndexedDBStorageV1.diagnose()))
        .toEqual({state:'active',revision:1});
    }
    const record=await readStoreSwitchRecord(peer);
    expect(record.raw).toBe(seed.raw);
    expect(record.previous.raw).toBe(seed.raw);
  }finally{await peer.close();}
  });
}

test('adopted settings opens only isolated backup controls and reloads after restoration',async({page,context})=>{
  const seed=await openQuickInputPreview(page,{useRealBackupAfterMigration:true,connectQuick:false});
  await page.waitForSelector('#insightSettingsYearSection',{state:'attached'});
  for(const src of ['insight_indexeddb_recovery_preview_v1.js','insight_indexeddb_migration_preview_v1.js',
    'insight_indexeddb_sales_input_preview_v1.js'])await page.addScriptTag({url:'/'+src});
  await page.route('**/adopted-settings-result-fixture',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><output></output><script src="/insight_indexeddb_storage_v1.js"></script>'+
    '<script>InsightIndexedDBStorageV1.read().then(result=>document.querySelector("output").textContent=result.revision);</script>'}));
  await page.evaluate(async ()=>{
    const status=document.createElement('div');
    await InsightIndexedDBMigrationPreviewV1.start(status,()=>{throw new Error('Legacy loader called');},
      async (_record,recoverySettings)=>{
        window.settingsPreview=await InsightIndexedDBSalesInputPreviewV1.connect('sales',{
          followInputScreens:true,followQuickInput:true,manageStoresAndYears:true,recoverySettings
        });
      },{restart:()=>location.replace('/adopted-settings-result-fixture')});
  });
  await page.locator('#navSettings').click();
  expect(await page.locator('#restoreFile').count()).toBe(0);
  const password='FictionalSettings37';
  const target=await writeFictionalRecoveryFile(page,seed,password);
  const dialog=page.locator('dialog#insightIndexedDBBackupDialog');
  await page.locator('#backupBtn').click();
  await dialog.getByLabel('バックアップ用パスワード').fill(password);
  await dialog.getByLabel('パスワードの確認').fill(password);
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    (async ()=>{
      await dialog.getByRole('button',{name:'暗号化してダウンロード'}).click();
      await expect(dialog.getByRole('status')).toContainText('確定版 0');
    })()
  ]);
  const safety=await fs.readFile(await download.path(),'utf8');
  await dialog.getByRole('button',{name:'閉じる'}).click();
  await expect(dialog).not.toBeVisible();

  const file=content=>({name:'Insight_261119_0900.json',mimeType:'application/json',buffer:Buffer.from(content)});
  const restore=async ()=>{
    await dialog.getByLabel('復元する暗号化バックアップ',{exact:true}).setInputFiles(file(target));
    await dialog.getByLabel('現在の確定版の暗号化バックアップ',{exact:true}).setInputFiles(file(safety));
    await dialog.getByLabel('復元するバックアップのパスワード',{exact:true}).fill(password);
    await dialog.getByLabel('現在の確定版のパスワード',{exact:true}).fill(password);
    await dialog.getByLabel('旧版のInsightをすべて閉じました').check();
    await dialog.getByRole('button',{name:'内容を表示'}).click();
  };
  await page.locator('#restoreBtn').click();
  await restore();
  expect(await page.evaluate(()=>{gotoNav(0);return currentNav;})).toBe('settings');
  await dialog.getByRole('button',{name:'取り消す'}).click();
  await expect(dialog.getByRole('status')).toHaveText('取り消しました。');
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
  await restore();
  await dialog.getByRole('button',{name:'この内容を復元する'}).click();
  await expect(page.locator('output')).toHaveText('1');
  const peer=await openStoreSwitchPeer(context);
  try{
    const record=await readStoreSwitchRecord(peer);
    expect(record.revision).toBe(1);
    expect(JSON.parse(record.raw).stores[seed.peer].name).toBe('架空の復元対象');
    expect(record.previous.raw).toBe(seed.raw);
    expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await peer.close();}
});

test('offline migration does not request a backup or create an adoption marker',async({page,context})=>{
  await page.route('**/offline-migration-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional offline migration</title>'
  }));
  await page.goto('/offline-migration-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const raw='{"current":"fictional","stores":{"fictional":{"value":10}}}';
  await page.evaluate(raw=>{
    localStorage.setItem('insight_v11',raw);
    window.backupRequested=false;
    window.InsightMigrationBackupV1={verify(){},
      assertReady(){},
      confirm(){window.backupRequested=true;return true;}
    };
  },raw);
  await context.setOffline(true);
  try{
    const result=await page.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1;
      let networkRejected=false;
      try{await fetch('/Index.html',{cache:'no-store'});}
      catch(_){networkRejected=true;}
      return {networkRejected,status:await api.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message),
        backup:backupRequested,marker:localStorage.getItem('insight_indexeddb_adoption_v1'),
        startup:await api.diagnoseStartup(),raw:localStorage.getItem('insight_v11')};
    });
    expect(result).toMatchObject({networkRejected:true,backup:false,marker:null,startup:{state:'legacy'},raw});
    expect(result.status).toMatch(/^Migration environment requires review: (offline|build-check-unavailable)$/);
  }finally{await context.setOffline(false);}
});

test('a fully restarted browser keeps the adopted revision and holds the legacy shell',async({browserName,baseURL},info)=>{
  const browserType=require('@playwright/test')[browserName];
  const userDir=info.outputPath('restart-profile');
  const url=new URL('/restart-migration-fixture',baseURL).href;
  const raw='{"current":"fictional","stores":{"fictional":{"value":10}}}';
  const snapshot={current:'fictional',stores:{fictional:{value:20}}};
  async function openProfile(){
    const context=await browserType.launchPersistentContext(userDir,{headless:true});
    try{
      await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fictional browser restart</title>'}));
      const page=context.pages()[0]??await context.newPage();
      await page.goto(url);
      await page.evaluate(()=>{
        window.__INSIGHT_SHELL_VERSION__='20261125-print-holiday-build-134';
        window.__INSIGHT_FEATURE_SIGNATURE__='2a1f565f';
      });
      await page.addScriptTag({url:new URL('/insight_indexeddb_storage_v1.js',url).href});
      return {context,page};
    }catch(error){
      await context.close();
      throw error;
    }
  }
  const initial=await openProfile();
  try{
    expect(await initial.page.evaluate(async ({raw,snapshot})=>{
      localStorage.setItem('insight_v11',raw);
      window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
      window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
      const api=InsightIndexedDBStorageV1;
      await api.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
      return api.save(0,snapshot);
    },{raw,snapshot})).toEqual({revision:1,snapshot});
  }finally{await initial.context.close();}
  const restarted=await openProfile();
  try{
    expect(await restarted.page.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1;
      return {startup:await api.diagnoseStartup(),current:await api.read(),raw:localStorage.getItem('insight_v11')};
    })).toEqual({startup:{state:'hold',reason:'indexeddb-adopted'},current:{revision:1,snapshot},raw});
  }finally{await restarted.context.close();}
});

const legacyPwaFixture='/tests/e2e/fixtures/legacy-pwa-fixture';
async function openLegacyPwaFixture(page){
  const fixtureRoute='**'+legacyPwaFixture;
  await page.route(fixtureRoute,route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional online migration page</title>'
  }));
  await page.route('**/tests/e2e/fixtures/Index.html?insight_migration_probe=*',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><meta name="insight-shell-version" content="20261125-print-holiday-build-134">'
  }));
  await page.goto(legacyPwaFixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  return fixtureRoute;
}

async function registerLegacyPwaWorker(page){
  const scope=await page.evaluate(async ()=>{
    const registration=await navigator.serviceWorker.register('./legacy-pwa-worker.js');
    return registration.scope;
  });
  expect(new URL(scope).pathname).toBe('/tests/e2e/fixtures/');
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
}

async function withCachedLegacyPwa(page,context,browserName,fixtureRoute,visit){
  // The origin has no file at this URL once the online fixture route is removed.
  await page.unroute(fixtureRoute);
  // WebKit CI reports an internal navigation error with offline emulation.
  const emulateOffline=browserName==='chromium';
  const reopened=await context.newPage();
  try{
    if(emulateOffline)await context.setOffline(true);
    await reopened.goto(legacyPwaFixture);
    await expect(reopened).toHaveTitle('Fictional cached legacy PWA');
    await visit(reopened);
  }finally{
    await reopened.close();
    if(emulateOffline)await context.setOffline(false);
  }
}

test('a real legacy service worker stops migration during backup and serves a cached reopen',async({page,context,browserName})=>{
  const fixtureRoute=await openLegacyPwaFixture(page);
  const raw=await page.evaluate(()=>{
    const source=JSON.stringify({current:'fictional',stores:{fictional:{value:1}}});
    localStorage.setItem('insight_v11',source);
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={verify(){},
      assertReady(){},
      confirm(){return new Promise(resolve=>{window.finishFictionalBackup=resolve;});}
    };
    window.migrationOutcome=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).then(
      ()=>null,error=>error.message
    );
    return source;
  });
  await page.waitForFunction(()=>typeof window.finishFictionalBackup==='function');
  await registerLegacyPwaWorker(page);
  expect(await page.evaluate(async ()=>{
    window.finishFictionalBackup(true);
    return {
      result:await window.migrationOutcome,
      source:localStorage.getItem('insight_v11'),
      marker:localStorage.getItem('insight_indexeddb_adoption_v1'),
      startup:await InsightIndexedDBStorageV1.diagnoseStartup()
    };
  })).toEqual({
    result:'Migration environment requires review: service-worker-present',
    source:raw,marker:null,startup:{state:'legacy'}
  });

  await withCachedLegacyPwa(page,context,browserName,fixtureRoute,async reopened=>{
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
  });
});

test('a cached legacy PWA writing after adoption preserves both copies and stops recovery',async({page,context,browserName})=>{
  const fixtureRoute=await openLegacyPwaFixture(page);
  const original=await page.evaluate(async ()=>{
    const source={current:'fictional',stores:{fictional:{value:1}}};
    const raw=JSON.stringify(source);
    localStorage.setItem('insight_v11',raw);
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={verify(){},confirm:async()=>true,assertReady(){}};
    await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
    await InsightIndexedDBStorageV1.save(0,{...source,stores:{fictional:{value:2}}});
    return raw;
  });
  await registerLegacyPwaWorker(page);
  let legacyEdit;
  await withCachedLegacyPwa(page,context,browserName,fixtureRoute,async reopened=>{
    expect(await reopened.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(original);
    legacyEdit=await reopened.evaluate(()=>{
      const raw=JSON.stringify({current:'fictional',stores:{fictional:{value:3}}});
      // Old code can still write directly to the legacy key.
      localStorage.setItem('insight_v11',raw);
      return raw;
    });
  });

  const result=await page.evaluate(async ()=>{
    const api=InsightIndexedDBStorageV1;
    const startupBeforeRead=await api.diagnoseStartup();
    const read=await api.read().catch(error=>error.message);
    let confirmationOffered=false;
    const recovery=await api.reviewRecovery(()=>{
      confirmationOffered=true;
      return true;
    }).catch(error=>error.message);
    const save=await api.save(1,{current:'fictional',stores:{fictional:{value:4}}}).catch(error=>error.message);
    const record=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('insight-store-snapshots-v1');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction('snapshots','readonly');
        const get=tx.objectStore('snapshots').get('current');
        tx.oncomplete=()=>{db.close();resolve(get.result);};
        tx.onabort=()=>{db.close();reject(tx.error);};
      };
    });
    return {startupBeforeRead,read,recovery,confirmationOffered,save,
      startupAfterConflict:await api.diagnoseStartup(),
      legacyRaw:localStorage.getItem('insight_v11'),
      sourceRaw:record.sourceRaw,currentRaw:record.raw,previousRaw:record.previous.raw,
      revision:record.revision
    };
  });
  expect(result).toEqual({
    startupBeforeRead:{state:'hold',reason:'record-unverified'},
    read:'Legacy Insight storage changed; IndexedDB writes are on hold',
    recovery:'No held migration or save to review',confirmationOffered:false,
    save:'IndexedDB writes are on hold',startupAfterConflict:{state:'hold',reason:'source-conflict'},
    legacyRaw:legacyEdit,sourceRaw:original,
    currentRaw:JSON.stringify({current:'fictional',stores:{fictional:{value:2}}}),
    previousRaw:original,revision:1
  });
});

test('cached legacy shell runs with its origin unavailable and adopted startup stops on an old write',async({page,context})=>{
  const http=require('node:http');
  const path=require('node:path');
  const worker=await fs.readFile(path.join(__dirname,'fixtures/legacy-pwa-worker.js'));
  const storageScript=await fs.readFile(path.join(__dirname,'../../insight_indexeddb_storage_v1.js'),'utf8');
  const shell=await fs.readFile(path.join(__dirname,'../../insight_indexeddb_migration_preview_v1.js'),'utf8');
  const entryFiles=['Index.html','insight_shell_boot_v1.js','insight_shell_loader_v1.js'];
  const entryAssets=new Map(await Promise.all(entryFiles.map(async name=>[
    '/'+name,await fs.readFile(path.join(__dirname,'../..',name))
  ])));
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname==='/legacy-pwa-worker.js'){
      response.setHeader('Content-Type','application/javascript');
      response.end(worker);
    }else if(entryAssets.has(url.pathname)){
      response.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/html');
      const asset=entryAssets.get(url.pathname);
      response.end(url.pathname==='/Index.html'?allowFixtureHttp(asset.toString('utf8')):asset);
    }else if(url.pathname==='/legacy-pwa-fixture'){
      response.setHeader('Content-Type','text/html');
      response.end('<!doctype html><title>Fictional online migration page</title>');
    }else{response.statusCode=404;response.end();}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin='http://localhost:'+server.address().port;
  const url=origin+'/legacy-pwa-fixture';
  const stopServer=async ()=>{
    if(!server.listening)return;
    await new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve());
      server.closeAllConnections();
    });
  };
  try{
    await page.goto(url);
    await page.addScriptTag({content:storageScript});
    await page.addScriptTag({content:shell});
    const seed=await page.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1;
      const snapshot={current:'fictional',stores:{fictional:{value:1}}};
      const raw=JSON.stringify(snapshot);
      localStorage.setItem('insight_v11',raw);
      window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
      window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
      await api.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
      snapshot.stores.fictional.value=2;
      await api.save(0,snapshot);
      return {raw,snapshot};
    });
    await page.evaluate(async ()=>navigator.serviceWorker.register('/legacy-pwa-worker.js'));
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    const guarded=await context.newPage();
    try{
      await guarded.goto(origin+'/Index.html');
      await expect(guarded.getByRole('status')).toContainText('旧版のキャッシュ状態を確認できないため、起動と保存を停止しています。');
      await expect(guarded.locator('#quickGrid')).toHaveCount(0);
    }finally{await guarded.close();}
    await stopServer();

    const reopened=await context.newPage();
    try{
      await reopened.goto(url);
      await expect(reopened).toHaveTitle('Fictional cached legacy PWA');
      expect(await reopened.evaluate(async ()=>{
        try{await fetch('/offline-proof',{cache:'no-store'});return false;}
        catch(_){return true;}
      })).toBe(true);
      expect(await reopened.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
      const edited=await reopened.evaluate(()=>{
        const raw=JSON.stringify({current:'fictional',stores:{fictional:{value:3}}});
        localStorage.setItem('insight_v11',raw);
        return raw;
      });
      const result=await page.evaluate(async ()=>{
        let loadCount=0;
        const container=document.createElement('main');
        await InsightIndexedDBMigrationPreviewV1.start(container,()=>loadCount++,()=>loadCount++,
          {restart:()=>{throw new Error('Unexpected restart');}});
        return {text:container.textContent,loadCount,old:localStorage.getItem('insight_v11')};
      });
      expect(result).toEqual({text:'保存状態を確認できないため、起動と保存を停止しています。',loadCount:0,old:edited});
      const record=await readStoreSwitchRecord(reopened);
      expect(JSON.parse(record.raw)).toEqual(seed.snapshot);
      expect(record.previous.raw).toBe(seed.raw);
    }finally{await reopened.close();}
  }finally{await stopServer();}
});

test('migration enforces the pinned environment before and after backup confirmation',async({page})=>{
  const fixture='/forced-migration-gate-fixture',build='20261125-print-holiday-build-134';
  await page.route('**'+fixture,route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional forced migration fixture</title>'
  }));
  let serverBuild=build;
  await page.route('**/Index.html?insight_migration_probe=*',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><meta name="insight-shell-version" content="'+serverBuild+'">'
  }));
  await page.goto(fixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.evaluate(()=>{
    window.confirmations=0;
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={verify(){},
      confirm:async()=>{
        window.confirmations++;
        return await new Promise(resolve=>{window.finishBackup=resolve;});
      },
      assertReady(raw){
        if(localStorage.getItem('insight_v11')!==raw)throw new Error('Fictional source changed');
      }
    };
    localStorage.setItem('insight_v11','{"current":"fictional","stores":{"fictional":{"value":1}}}');
  });
  const attempt=(options)=>page.evaluate(options=>
    InsightIndexedDBStorageV1.migrate(options).catch(error=>error.message),options);
  expect(await attempt({})).toContain('legacy-client-confirmation-required');

  // Values provided by the caller cannot bypass the pin.
  await page.evaluate(()=>{window.__INSIGHT_SHELL_VERSION__='fictional-other-build';});
  serverBuild='fictional-other-build';
  expect(await attempt({legacyClientsClosed:true,expectedBuild:serverBuild})).toContain('build-mismatch');
  await page.evaluate(build=>{window.__INSIGHT_SHELL_VERSION__=build;},build);
  serverBuild=build;
  expect(await page.evaluate(()=>window.confirmations)).toBe(0);
  expect(await attempt({legacyClientsClosed:true})).toBe('A verified backup file is required');
  expect(await page.evaluate(()=>({confirmations,marker:localStorage.getItem('insight_indexeddb_adoption_v1')})))
    .toEqual({confirmations:0,marker:null});

  for(const scenario of ['server-changed','source-changed','ready']){
    await page.evaluate(()=>{
      window.finishBackup=null;
      window.attemptResult=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})})
        .catch(error=>error.message);
    });
    await page.waitForFunction(()=>typeof window.finishBackup==='function');
    if(scenario==='server-changed')serverBuild='fictional-new-build';
    if(scenario==='source-changed')await page.evaluate(()=>{
      localStorage.setItem('insight_v11','{"current":"fictional","stores":{"fictional":{"value":2}}}');
    });
    await page.evaluate(()=>window.finishBackup(true));
    const actual=await page.evaluate(()=>window.attemptResult);
    if(scenario==='ready'){
      expect(actual).toEqual({revision:0,snapshot:{current:'fictional',stores:{fictional:{value:2}}}});
    }else{
      expect(actual).toContain(scenario==='server-changed'?'build-mismatch':'Fictional source changed');
      expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();
    }
    serverBuild=build;
  }
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11')))
    .toBe('{"current":"fictional","stores":{"fictional":{"value":2}}}');
});

for(const inputPage of [
  {nav:'#nav2',type:'sales',field:'#salesForm input[type=text]',save:'#salesSaveBtn'},
  {nav:'#nav3',type:'kyaku',field:'#kyakuGrid input',save:'#kyakuSaveBtn'},
  {nav:'#nav4',type:'haiki',field:'#haikiForm input[type=text]',save:'#haikiSaveBtn'}
]){
  test('migration preserves pending daily input on '+inputPage.nav,async({page})=>{
    await routeMigrationPage(page);
    await page.goto('/Index.html');
    await waitForMigrationChecks(page);
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    await page.locator(inputPage.nav).click();
    const field=page.locator(inputPage.field).first();
    const raw=await page.evaluate(()=>{
      const next=InsightStorage.migrateSnapshot(allStores);
      next.stores['fictional-b']=JSON.parse(JSON.stringify(next.stores[next.current]));
      allStores=next;
      store=next.stores[next.current];
      return InsightStorage.writeSnapshot(next);
    });
    await field.fill('987');
    const attempt=()=>page.evaluate(()=>InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message));
    expect(await attempt()).toContain('未保存の入力または保存データの変更');
    await expect(field).toHaveValue('987');
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBeNull();

    await page.locator(inputPage.save).click();
    const saved=await page.evaluate(()=>localStorage.getItem('insight_v11'));
    expect(saved).not.toBe(raw);
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);

    async function checkMigrationCanStart(){
      await page.evaluate(()=>{
        window.migrationAfterSave=InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
      });
      await expect(page.locator('#insightBackupPassword')).toBeVisible();
      await page.getByRole('button',{name:'キャンセル',exact:true}).click();
      expect(await page.evaluate(()=>migrationAfterSave)).toBe('Backup save was not confirmed');
    }
    await checkMigrationCanStart();

    {
      await field.fill('654');
      const picker=page.locator('#insightDayNav-'+inputPage.type+' input[type=date]');
      const target=await picker.evaluate(input=>{
        const [year,month]=input.value.split('-').map(Number);
        return year+'-'+(month===1?'02':'01')+'-01';
      });
      const chooseDate=()=>picker.evaluate((input,date)=>{
        input.value=date;
        input.dispatchEvent(new Event('change',{bubbles:true}));
      },target);
      page.once('dialog',dialog=>dialog.dismiss());
      await chooseDate();
      await expect(field).toHaveValue('654');
      expect(await attempt()).toContain('未保存の入力または保存データの変更');
      page.once('dialog',dialog=>dialog.accept());
      await chooseDate();
      expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);
      expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(saved);
      await checkMigrationCanStart();
    }

    if(inputPage.nav==='#nav2'){
      await field.fill('654');
      await page.evaluate(()=>InsightStorage.holdSnapshotWrites());
      await page.locator(inputPage.save).click();
      expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(true);
      expect(await attempt()).toContain('編集中または処理中の操作');
      expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(saved);
    }
  });
}

test('recovery distinguishes an interrupted migration copy, an aborted save and a changed source',async({page})=>{
  await page.route('**/recovery-fixture',route=>route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><title>Fictional recovery fixture</title>'}));
  await page.goto('/recovery-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async ()=>{
    const storage=InsightIndexedDBStorageV1;
    const markerKey='insight_indexeddb_adoption_v1',sourceKey='insight_v11';
    const original={current:'a',stores:{
      a:{years:['2025','2026'],data:{2025:{sales:123},2026:{sales:456}}},
      b:{years:['2025','2026'],data:{2025:{sales:321},2026:{sales:654}}}
    }};
    const raw=JSON.stringify(original);
    localStorage.setItem(sourceKey,raw);
    const writeMetadata=(key,value)=>localStorage.setItem(key,value);
    window.InsightStorage={writeMetadata(key,value){
      if(JSON.parse(value).state==='active')throw new Error('Fixture interrupted adoption');
      writeMetadata(key,value);
    }};
    window.InsightMigrationBackupV1={verify(){},confirm:async()=>true,assertReady(){}};
    const adoptionError=await storage.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
    const preparingMarker=localStorage.getItem(markerKey);
    const inspect=()=>storage.diagnose({verifyInterrupted:true});
    const preparing=await inspect();
    const preparingHeld=localStorage.getItem(markerKey)===preparingMarker;

    // Activate only inside the fixture to construct a separate interrupted-write case.
    const {id}=JSON.parse(preparingMarker);
    writeMetadata(markerKey,JSON.stringify({id,state:'active'}));
    InsightStorage.writeMetadata=writeMetadata;
    const put=IDBObjectStore.prototype.put;
    let saveError;
    try{
      IDBObjectStore.prototype.put=function(){throw new DOMException('Fixture quota failure','QuotaExceededError');};
      const candidate=JSON.parse(raw);
      candidate.stores.a.data['2026'].sales=999;
      saveError=await storage.save(0,candidate).catch(error=>error.name);
    }finally{IDBObjectStore.prototype.put=put;}
    const writingMarker=localStorage.getItem(markerKey);
    const writing=await inspect();
    const repeated=await inspect();
    let displayed;
    const cancelled=await storage.reviewRecovery(summary=>{displayed=summary;return false;});
    const confirmed=await storage.reviewRecovery(()=>true);
    const race=await storage.reviewRecovery(()=>{
      const changed=JSON.parse(writingMarker);
      changed.reviewChanged=true;
      writeMetadata(markerKey,JSON.stringify(changed));
      return true;
    }).catch(error=>error.message);
    writeMetadata(markerKey,writingMarker);
    const nativeDigest=crypto.subtle.digest;
    let changedDuringCheck;
    crypto.subtle.digest=function(...args){
      writeMetadata(markerKey,JSON.stringify({...JSON.parse(writingMarker),id:'different-adoption'}));
      return nativeDigest.apply(this,args);
    };
    try{changedDuringCheck=await inspect();}
    finally{crypto.subtle.digest=nativeDigest;}
    writeMetadata(markerKey,'{invalid');
    const invalidMarker=await inspect();
    writeMetadata(markerKey,JSON.stringify({...JSON.parse(writingMarker),id:'different-adoption'}));
    const wrongAdoption=await inspect();
    writeMetadata(markerKey,writingMarker);
    const blocked=await storage.save(0,original).catch(error=>error.message);
    const originalBytesHeld=localStorage.getItem(sourceKey)===raw;
    localStorage.setItem(sourceKey,' '+raw); // Model different bytes written by an older tab.
    const sourceChanged=await inspect();
    return {adoptionError,preparing,preparingHeld,saveError,writing,repeated,displayed,cancelled,confirmed,race,changedDuringCheck,invalidMarker,wrongAdoption,blocked,originalBytesHeld,sourceChanged,
      markerPreserved:localStorage.getItem(markerKey)===writingMarker,
      changedSourcePreserved:localStorage.getItem(sourceKey)===' '+raw};
  });
  expect(result).toEqual({
    adoptionError:'Fixture interrupted adoption',
    preparing:{state:'hold',reason:'preparing',observedRevision:0,recovery:'migration-copy-verified'},
    preparingHeld:true,
    saveError:'QuotaExceededError',
    writing:{state:'hold',reason:'writing',observedRevision:0,recovery:'prior-save-verified'},
    repeated:{state:'hold',reason:'writing',observedRevision:0,recovery:'prior-save-verified'},
    displayed:{outcome:'prior-save-verified',revision:0,previousRevision:null,stores:[
      {id:'a',name:'a',years:['2025','2026']},{id:'b',name:'b',years:['2025','2026']}
    ]},
    cancelled:{state:'hold',review:'cancelled'},
    confirmed:{state:'hold',review:'confirmed',revision:0},
    race:'Recovery data changed',
    changedDuringCheck:{state:'hold',reason:'state-changed'},
    invalidMarker:{state:'hold',reason:'invalid-marker'},
    wrongAdoption:{state:'hold',reason:'record-unverified'},
    blocked:'IndexedDB writes are on hold',
    originalBytesHeld:true,
    sourceChanged:{state:'hold',reason:'record-unverified'},
    markerPreserved:true,changedSourcePreserved:true
  });
});


test('history-only migration attempt stays held after reload with two-store source untouched',async({page})=>{
  await page.route('**/history-only-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!DOCTYPE html><title>Fictional history-only recovery fixture</title>'
  }));
  await page.goto('/history-only-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const first=await page.evaluate(async ()=>{
    const snapshot={current:'a',stores:{
      a:{name:'架空店舗A',years:['2025','2026'],data:{2025:{sales:123},2026:{sales:456}}},
      b:{name:'架空店舗B',years:['2025','2026'],data:{2025:{sales:321},2026:{sales:654}}}
    }};
    const raw=JSON.stringify(snapshot);
    localStorage.setItem('insight_v11',raw);
    window.InsightMigrationBackupV1={verify(){},confirm:async()=>true,assertReady(){}};
    window.InsightStorage={writeMetadata(key,value){
      if(JSON.parse(value).state==='preparing')throw new Error('Fixture interrupted before marker');
      localStorage.setItem(key,value);
    }};
    const storage=InsightIndexedDBStorageV1;
    const interrupted=await storage.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
    const diagnosis=await storage.diagnose({verifyInterrupted:true});
    const rejected=await storage.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
    const review=await storage.reviewRecovery(()=>true).catch(error=>error.message);
    return {interrupted,diagnosis,rejected,review,rawIntact:localStorage.getItem('insight_v11')===raw,
      markerMissing:localStorage.getItem('insight_indexeddb_adoption_v1')===null};
  });
  expect(first).toEqual({
    interrupted:'Fixture interrupted before marker',
    diagnosis:{state:'hold',reason:'history-only'},
    rejected:'Existing migration requires review',
    review:'No held migration or save to review',
    rawIntact:true,markerMissing:true
  });
  await page.reload();
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const afterReload=await page.evaluate(async()=>({
    diagnosis:await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true}),
    retry:await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message),
    original:JSON.parse(localStorage.getItem('insight_v11')).stores.b.data['2026'].sales,
    marker:localStorage.getItem('insight_indexeddb_adoption_v1')
  }));
  expect(afterReload).toEqual({
    diagnosis:{state:'hold',reason:'history-only'},retry:'Existing migration requires review',
    original:654,marker:null
  });
});

test('lost or mismatched migration history blocks reads and saves without changing snapshot or marker',async({page})=>{
  await page.route('**/history-guard-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!DOCTYPE html><title>Fictional history guard fixture</title>'
  }));
  await page.goto('/history-guard-fixture');
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async()=>{
    const snapshot={current:'a',stores:{a:{name:'架空店舗A',years:['2026'],data:{2026:{sales:123}}}}};
    const raw=JSON.stringify(snapshot);
    localStorage.setItem('insight_v11',raw);
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={verify(){},confirm:async()=>true,assertReady(){}};
    const storage=InsightIndexedDBStorageV1;
    await storage.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
    const marker=localStorage.getItem('insight_indexeddb_adoption_v1');
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('insight-migration-history-v1',1);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('snapshots','readwrite');
      tx.objectStore('snapshots').put({id:'other-fixture-id'},'current');
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
    });
    db.close();
    const mismatched=await storage.diagnose();
    const mismatchRead=await storage.read().catch(error=>error.message);
    const mismatchSave=await storage.save(0,snapshot).catch(error=>error.message);
    await new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase('insight-migration-history-v1');
      request.onsuccess=resolve;
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('History deletion was blocked in fixture'));
    });
    const missing=await storage.diagnose();
    const missingRead=await storage.read().catch(error=>error.message);
    const missingSave=await storage.save(0,snapshot).catch(error=>error.message);
    return {mismatched,mismatchRead,mismatchSave,missing,missingRead,missingSave,
      markerUnchanged:localStorage.getItem('insight_indexeddb_adoption_v1')===marker,
      rawUnchanged:localStorage.getItem('insight_v11')===raw};
  });
  expect(result).toEqual({
    mismatched:{state:'hold',reason:'history-mismatch'},
    mismatchRead:'Migration history requires review',
    mismatchSave:'Migration history requires review',
    missing:{state:'hold',reason:'history-missing'},
    missingRead:'Migration history requires review',
    missingSave:'Migration history requires review',
    markerUnchanged:true,rawUnchanged:true
  });
});

test('migration pauses while a dialog, CSV import or weather fetch is pending',async({page})=>{
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  const result=await page.evaluate(async ()=>{
    const attempt=()=>InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})}).catch(error=>error.message);
    const raw=InsightStorage.writeSnapshot(allStores);
    const editor=document.createElement('dialog');
    document.body.append(editor);
    editor.showModal();
    const dialog=await attempt();
    editor.close();
    editor.remove();

    const readAsText=FileReader.prototype.readAsText;
    let reader;
    FileReader.prototype.readAsText=function(){reader=this;};
    try{importCSV({target:{files:[new File(['日付,売上\n2026-01-01,123'],'fictional.csv')]}});}
    finally{FileReader.prototype.readAsText=readAsText;}
    const csv=await attempt();
    reader.dispatchEvent(new Event('loadend'));

    const nativeFetch=window.fetch;
    let finishFetch;
    const pending=new Promise((_,reject)=>{finishFetch=()=>reject(new Error('Fixture stops weather fetch'));});
    window.fetch=()=>pending;
    let weather;
    try{
      const weatherOperation=fetchWeather();
      weather=await attempt();
      finishFetch();
      await weatherOperation;
    }finally{window.fetch=nativeFetch;}
    return {dialog,csv,weather,pendingCSV:hasPendingCSVImport(),
      pendingWeather:InsightWeatherTemperatureAuto.hasPendingFetch(),
      rawPreserved:localStorage.getItem('insight_v11')===raw,
      marker:localStorage.getItem('insight_indexeddb_adoption_v1')};
  });
  const message='編集中または処理中の操作があるため、移行を中止しました。';
  expect(result).toEqual({
    dialog:message,csv:message,weather:message,pendingCSV:false,pendingWeather:false,rawPreserved:true,marker:null
  });
});

for(const connectionFails of [false,true]){
  test('isolated candidate handles a late shell '+(connectionFails?'with a connection failure':'after DOMContentLoaded'),async({page})=>{
    await page.route('**/late-adopted-start-fixture',route=>route.fulfill({contentType:'text/html',body:
      '<!doctype html><meta charset="utf-8"><div id="loading"></div><main>架空店舗A</main>'}));
    await page.route('**/late-adopted-shell.js',route=>route.fulfill({contentType:'application/javascript',body:
      `const section=document.createElement('section');
      section.id='insightSettingsYearSection';
      document.body.append(section);
      window.InsightHourlyCustomers={connectIndexedDBPreview(){}};
      window.shellReadyState=document.readyState;
      window.lateSnapshot=InsightIndexedDBCandidateV1.initializeAdopted();`}));
    await page.route(/\/insight_indexeddb_(quick_input|sales_input|recovery)_preview_v1\.js\?v=20261125-input-backup-1$/,route=>route.fulfill({
      contentType:'application/javascript',
      body:new URL(route.request().url()).pathname.endsWith('/insight_indexeddb_sales_input_preview_v1.js')
        ?`window.InsightIndexedDBSalesInputPreviewV1={async connect(){
          window.connectionCount=(window.connectionCount??0)+1;
          await new Promise(resolve=>{window.finishConnection=resolve;});
          if(${connectionFails})throw new Error('Simulated connection failure');
        }};`:''
    }));
    await page.goto('/late-adopted-start-fixture');
    await page.addScriptTag({url:'/draft/insight_indexeddb_candidate_v1.js'});
    await page.evaluate(async ()=>{
      window.InsightIndexedDBMigrationPreviewV1={start:(_container,_legacy,adopt)=>adopt({
        snapshot:{current:'fictional',stores:{fictional:{name:'架空店舗A'}}}
      })};
      await InsightIndexedDBCandidateV1.start(document.getElementById('loading'),()=>new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='/late-adopted-shell.js';
        script.onload=resolve;
        script.onerror=reject;
        document.body.append(script);
      }));
    });
    await page.waitForFunction(()=>typeof window.finishConnection==='function');
    expect(await page.evaluate(()=>({ready:window.shellReadyState,inert:document.body.inert,
      snapshot:window.lateSnapshot}))).toEqual({ready:'complete',inert:true,
      snapshot:{current:'fictional',stores:{fictional:{name:'架空店舗A'}}}});
    await page.evaluate(()=>window.finishConnection());
    if(connectionFails){
      await expect(page.getByRole('status')).toHaveText('確定版で画面を開けないため、起動と保存を停止しています。');
      await expect(page.locator('main')).toHaveCount(0);
    }else{
      await page.waitForFunction(()=>!document.body.inert);
      await expect(page.locator('main')).toHaveText('架空店舗A');
    }
    expect(await page.evaluate(()=>window.connectionCount)).toBe(1);
  });
}

const httpsTest=test.extend({
  ignoreHTTPSErrors:true,
  hasTouch:true,
  httpsInsight:async ({},use)=>require('./helpers/https-insight.cjs')(use)
});
async function checkSettingsBackupLayout(page,dialog){
  const originalViewport=page.viewportSize();
  const originalDark=await page.evaluate(()=>document.documentElement.classList.contains('dark'));
  for(const viewport of [{width:1194,height:834},{width:834,height:1194},{width:390,height:320}]){
    await page.setViewportSize(viewport);
    for(const dark of [false,true]){
      await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      const layout=await dialog.evaluate(node=>{
        const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
        const controls=[...node.querySelectorAll('input,button')];
        const color=document.createElement('canvas').getContext('2d');
        color.fillStyle=style.backgroundColor;
        const background=color.fillStyle;
        color.fillStyle=style.getPropertyValue('--surface').trim();
        return {
          offset:Math.max(Math.abs(rect.left+rect.width/2-innerWidth/2),Math.abs(rect.top+rect.height/2-innerHeight/2)),
          inside:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,
          fit:node.scrollWidth===node.clientWidth,
          scroll:style.overflowY,
          background,surface:color.fillStyle,
          touch:controls.every(control=>control.getBoundingClientRect().height>=44)
        };
      });
      expect(layout.offset).toBeLessThanOrEqual(2);
      expect(layout).toMatchObject({inside:true,fit:true,scroll:'auto',touch:true});
      expect(layout.background).toBe(layout.surface);
      if(dark)expect(layout.background).not.toBe('#ffffff');
    }
  }
  await page.setViewportSize(originalViewport);
  await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),originalDark);
}

httpsTest('Draft Index rehearses migration, editing and recovery at the release HTTPS URL',async({page,context,httpsInsight})=>{
  test.setTimeout(90000);
  await page.clock.setFixedTime(new Date('2026-11-23T03:00:00Z'));
  await page.route('https://www.jma.go.jp/bosai/**',async route=>{
    const url=route.request().url();
    if(url.endsWith('/area.json'))return route.fulfill({json:{class20s:{23220:{name:'稲沢市',parent:'230011'}},
      class15s:{230011:{parent:'230010'}},class10s:{230010:{name:'西部',parent:'230000'}},offices:{230000:{name:'愛知県'}}}});
    if(url.endsWith('/amedastable.json'))return route.fulfill({json:{51106:{lat:[35,10],lon:[136,58]}}});
    const times=Array.from({length:7},(_,i)=>'2026-11-'+(23+i)+'T00:00:00+09:00');
    await route.fulfill({json:[{reportDatetime:'2026-11-23T11:00:00+09:00',timeSeries:[
      {timeDefines:times,areas:[{area:{code:'230010',name:'西部'},weatherCodes:times.map(()=> '100'),pops:times.map(()=> '20')}]},
      {timeDefines:times,areas:[{area:{code:'51106',name:'名古屋'},tempsMin:times.map(()=> '18'),tempsMax:times.map(()=> '28')}]}
    ]}]});
  });
  await routeMigrationPage(page,'http://127.0.0.1:4173/Index.html*');
  const release='https://kazutake1.github.io/Insight';
  const fixture=release+'/Index.html';
  let manualMigration=false;
  await context.route(release+'/**',async route=>{
    const url=new URL(route.request().url());
    const path=url.pathname.slice('/Insight/'.length)||'Index.html';
    // Serve the Draft files from the test fixture and never contact GitHub Pages.
    const response=await route.fetch({url:httpsInsight+'/'+path+url.search,maxRedirects:0});
    if(path!=='Index.html'||manualMigration)return route.fulfill({response});
    await route.fulfill({response,body:(await response.text()).replace(' data-indexeddb-migration="manual"','')});
  });
  await page.goto(fixture);
  expect(await page.evaluate(()=>({origin:location.origin,protocol:location.protocol,secure:isSecureContext,
    csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]').content})))
    .toMatchObject({origin:'https://kazutake1.github.io',protocol:'https:',secure:true,csp:expect.stringContaining('upgrade-insecure-requests')});
  await expect(page.getByRole('status')).toHaveText('保存状態を確認できないため、起動と保存を停止しています。');
  await expect(page.locator('#quickGrid')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBeNull();
  const blockedRestore=await page.evaluate(async ()=>{
    try{
      await InsightIndexedDBStorageV1.restoreMissingStorage({legacyClientsClosed:true});
      return null;
    }catch(error){return error.message;}
  });
  expect(blockedRestore).toContain('manual-migration-disabled');
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose()))
    .toEqual({state:'hold',reason:'storage-history-unknown'});

  // Seed the isolated origin with the snapshot written by the existing app on the regular test origin.
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  expect(await page.evaluate(()=>typeof InsightIndexedDBCandidateV1)).toBe('undefined');
  const seed=await page.evaluate(()=>{
    store.name='架空店舗A';
    store.years.unshift('2020');
    store.data['2020']=blankYearData('2020');
    store.weatherLocation={name:'稲沢市',admin1:'愛知県',latitude:35.25,longitude:136.8};
    const {fy,month,day}=todayFY();
    Object.assign(store.data[fy][month][day-1],{売上:123,客数:10,weather:'晴'});
    store.salesCounts={'2026-11-23':{
      cat_onigiri:{trips:[{delivery:12,sales:9},{delivery:null,sales:null},{delivery:null,sales:null}]},
      cat_sandwich:{trips:[{delivery:6,sales:3},{delivery:null,sales:null},{delivery:null,sales:null}]}
    }};
    allStores.stores['fixture-peer']={...structuredClone(store),name:'架空店舗B'};
    allStores.stores['fixture-peer'].data[fy][month][day-1].売上=999;
    return {raw:InsightStorage.writeSnapshot(allStores),fy,month,day,id:allStores.current};
  });
  const raw=seed.raw;
  await page.locator('#navSettings').click();
  await page.locator('#backupBtn').tap();
  const legacyBackup=page.getByRole('dialog',{name:'バックアップ用パスワード'});
  await expect(legacyBackup).toBeVisible();
  await checkSettingsBackupLayout(page,legacyBackup);
  await page.keyboard.press('Escape');
  await expect(legacyBackup).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  await page.goto(fixture);
  await expect(page.getByRole('status')).toHaveText('保存状態を確認できないため、起動と保存を停止しています。');
  await page.evaluate(raw=>localStorage.setItem('insight_v11',raw),raw);
  await page.reload();
  await waitForMigrationChecks(page);
  await expect(page.locator('#quickGrid')).toBeAttached();
  const checkbox=page.getByRole('checkbox',{name:'Insightの他のタブとホーム画面から開いたアプリを閉じました'});
  const button=page.getByRole('button',{name:'バックアップを作成して移行'});
  const marker=()=>page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'));
  await page.goto(fixture+'?indexeddb-migration=manual');
  await waitForMigrationChecks(page);
  await expect(page.locator('#qi_売上')).toHaveValue('123');
  await page.locator('#navSettings').click();
  await expect(button).toHaveCount(0);
  const capacity=page.getByRole('button',{name:'保存容量を確認'});
  const capacityResult=page.locator('#insightStorageUsage');
  const safetyToggle=page.locator('#insightRestoreSafetyBackup');
  await capacity.tap();
  await expect(capacityResult).toContainText('店舗データ（全店舗）：');
  await page.locator('label').filter({has:safetyToggle}).tap();
  await expect(safetyToggle).toBeChecked();
  const migrationEnvironment=await page.evaluate(()=>InsightIndexedDBStorageV1.checkMigrationEnvironment({
    expectedBuild:window.__INSIGHT_SHELL_VERSION__,expectedFeatures:window.__INSIGHT_FEATURE_SIGNATURE__,
    legacyClientsClosed:true,requireManualMigration:true
  }));
  expect(migrationEnvironment).toEqual({state:'hold',reason:'manual-migration-disabled'});
  expect(await marker()).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);

  manualMigration=true;
  await page.goto(release+'/');
  await waitForMigrationChecks(page);
  await page.locator('#navSettings').click();
  await expect(button).toBeDisabled();
  expect(await marker()).toBeNull();
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnoseStartup())).toEqual({state:'legacy'});

  const password='Fit123';
  async function start(){
    await checkbox.check();
    await button.click();
    await expect(button).toBeDisabled();
    await page.locator('#insightBackupPassword').fill(password);
    await page.locator('#insightBackupPasswordConfirm').fill(password);
    const download=page.waitForEvent('download');
    await page.locator('#insightBackupOverlay button[type=submit]').click();
    return download;
  }
  await start();
  await page.getByRole('button',{name:'未確認のまま閉じる',exact:true}).click();
  await expect(page.getByText('バックアップの確認を取り消しました。')).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  expect(await marker()).toBeNull();

  const downloaded=async download=>({name:download.suggestedFilename(),mimeType:'application/json',
    buffer:await fs.readFile(await download.path())});
  const verifyDialog=page.getByRole('dialog',{name:'保存したバックアップの照合'});
  const confirmSaved=()=>page.getByRole('button',{name:'保存したファイルを確認した',exact:true}).click();
  const verify=verifyDialog.getByRole('button',{name:'照合して移行'});
  async function selectFile(file,passphrase){
    await verifyDialog.getByLabel('保存した暗号化バックアップ').setInputFiles(file);
    await verifyDialog.getByLabel('バックアップ照合用パスワード').fill(passphrase);
    await verify.click();
  }
  const wrongTry=await downloaded(await start());
  await confirmSaved();
  await expect(verifyDialog).toBeVisible();
  await verify.click();
  await expect(verifyDialog).toBeVisible();
  expect(await marker()).toBeNull();
  await selectFile(wrongTry,'Wrong123');
  await expect(page.getByText('移行を中止しました。バックアップのファイルとパスワード、起動環境を確認してください。')).toBeVisible();
  expect(await marker()).toBeNull();
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnoseStartup())).toEqual({state:'legacy'});

  const file=await downloaded(await start());
  expect(JSON.parse(file.buffer.toString()).format).toBe('InsightEncryptedBackup');
  await confirmSaved();
  await selectFile(file,password);
  await expect(button).toHaveCount(0);
  await waitForMigrationChecks(page);
  await page.waitForFunction(()=>InsightIndexedDBCandidateV1.isAdopted()&&!document.body.inert&&
    !!document.getElementById('insightIndexedDBBackupDialog'));
  expect(JSON.parse(await marker()).state).toBe('active');
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(raw)});
  await expect(page.locator('#storeSel')).toHaveValue(seed.id);
  await expect(page.locator('#qi_売上')).toHaveValue('123');
  await page.evaluate(()=>{window.confirm=()=>true;});

  await page.locator('#navSalesCount').click();
  await page.getByRole('button',{name:'カードを印刷'}).click();
  const printDialog=page.getByRole('dialog',{name:'納品・販売・廃棄カード'});
  const originalViewport=page.viewportSize();
  await page.setViewportSize({width:1194,height:834});
  const originalDark=await page.evaluate(()=>document.documentElement.classList.contains('dark'));
  const checkPrintLayout=async ()=>{
    for(const dark of [false,true]){
      await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      const layout=await printDialog.evaluate(dialog=>{
        const bounds=dialog.getBoundingClientRect(),fields=dialog.querySelector('.sc-print-fields');
        const actions=dialog.querySelector('.sc-print-actions'),style=getComputedStyle(dialog);
        const categories=dialog.querySelector('.sc-print-categories');
        const labels=Array.from(fields.querySelectorAll('label'),node=>node.getBoundingClientRect());
        const controls=[...dialog.querySelectorAll('.sc-print-fields input,select,button,.sc-print-category-options label')];
        return {
          offset:Math.max(Math.abs(bounds.left+bounds.width/2-innerWidth/2),
            Math.abs(bounds.top+bounds.height/2-innerHeight/2)),
          fits:bounds.width<innerWidth&&bounds.height<innerHeight&&dialog.scrollWidth===dialog.clientWidth,
          spacing:labels.slice(1).every((label,i)=>label.left-labels[i].right>=8)&&
            categories.getBoundingClientRect().top-fields.getBoundingClientRect().bottom>=8&&
            actions.getBoundingClientRect().top-categories.getBoundingClientRect().bottom>=8,
          touch:controls.every(node=>node.getBoundingClientRect().height>=44),
          readable:style.color!==style.backgroundColor
        };
      });
      expect(layout.offset).toBeLessThanOrEqual(1);
      expect(layout).toMatchObject({fits:true,spacing:true,touch:true,readable:true});
    }
  };
  await checkPrintLayout();
  await printDialog.getByLabel('開始日').fill('2026-11-23');
  await printDialog.getByLabel('終了日').fill('2026-11-23');
  await expect(printDialog.getByRole('checkbox',{name:'おにぎり'})).toBeChecked();
  await printDialog.getByRole('checkbox',{name:'サンドイッチ'}).check();
  await printDialog.getByLabel('用紙').selectOption('b5');
  await printDialog.getByRole('button',{name:'プレビュー'}).click();
  const printSheet=printDialog.locator('.sc-print-sheet');
  await expect(printSheet).toHaveClass(/sc-print-b5/);
  await expect(printSheet.locator('.sc-print-start > h2')).toHaveText(['架空店舗A ／ おにぎり','架空店舗A ／ サンドイッチ']);
  await expect(printSheet.locator('.sc-day-num')).toHaveText([/^2026\/11\/23/,/^2026\/11\/23/]);
  await expect(printSheet.locator('.sc-day-num').first()).toHaveCSS('color','rgb(185, 28, 28)');
  await expect(printSheet.locator('.sc-day').first()).toHaveCSS('border-top-color','rgb(185, 28, 28)');
  await expect(printSheet.locator('.sc-day-title small')).toHaveCount(0);
  await expect(printSheet.locator('.sc-col-head').first().locator('span')).toHaveText(['1便','2便','3便']);
  expect(await printSheet.locator('.sc-col-head span').first().evaluate(span=>getComputedStyle(span).gridColumnStart)).toBe('2');
  expect(await printSheet.locator('.sc-print-row').evaluateAll(rows=>
    rows.map(row=>getComputedStyle(row).gridTemplateColumns.split(' ').length))).toEqual([5,5]);
  await expect(printSheet.locator('.sc-print-category').nth(1).locator('.sc-delivery-row .sc-print-value').first()).toHaveText('6');
  await expect(printDialog.locator('.sc-delivery-row .sc-print-value').first()).toHaveText('12');
  await expect(printDialog.locator('.sc-sales-row .sc-print-value').first()).toHaveText('9');
  await checkPrintLayout();
  await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),originalDark);
  await page.setViewportSize(originalViewport);
  await printDialog.getByRole('button',{name:'閉じる'}).click();
  expect(await committedInput(page)).toEqual({revision:0,snapshot:JSON.parse(raw)});
  await page.locator('#nav0').click();
  await page.locator('#qi_売上').fill('321');
  await page.locator('#quickSaveBtn').click();
  await expect(page.locator('#quickSaveBtn')).toBeEnabled();
  await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
  await expect(page.locator('#quickSaveBtn + [role=status]')).toBeEmpty();
  const edited=await committedInput(page);
  expect(edited.revision).toBe(1);
  expect(edited.snapshot.stores[seed.id].data[seed.fy][seed.month][seed.day-1].売上).toBe(321);
  expect(edited.snapshot.stores['fixture-peer']).toEqual(JSON.parse(raw).stores['fixture-peer']);
  await page.locator('#nav2').click();
  await page.locator('#storeSel').selectOption('fixture-peer');
  await expect(page.locator('#storeSel')).toHaveValue('fixture-peer');
  expect((await committedInput(page)).revision).toBe(2);
  // Populate a fictional historical year so the two sources differ after MiB rounding.
  await page.evaluate(async id=>{
    const api=InsightIndexedDBStorageV1;
    const {revision,snapshot}=await api.read();
    for(const month of Object.values(snapshot.stores[id].data['2020'])){
      for(const day of month)day.売上=12345678;
    }
    await api.save(revision,snapshot);
  },seed.id);
  await page.reload();
  await page.waitForFunction(()=>InsightIndexedDBCandidateV1.isAdopted()&&!document.body.inert&&
    !!document.getElementById('insightIndexedDBBackupDialog'));
  const beforeRestore=await committedInput(page);
  expect(beforeRestore.revision).toBe(3);
  await page.locator('#navSettings').click();
  const capacityBefore=await page.evaluate(()=>({
    legacy:localStorage.getItem('insight_v11'),
    adoption:localStorage.getItem('insight_indexeddb_adoption_v1'),
    settingsUnits:Object.keys(localStorage).filter(key=>key.startsWith('insight_')&&key!=='insight_v11')
      .reduce((sum,key)=>sum+localStorage.getItem(key).length,0)
  }));
  const formatMiB=length=>(length*2/1048576).toFixed(3)+' MiB';
  const committedLength=JSON.stringify(beforeRestore.snapshot).length;
  expect(formatMiB(committedLength)).not.toBe(formatMiB(capacityBefore.legacy.length));
  await capacity.tap();
  await expect(capacityResult.locator('div')).toHaveText([
    '店舗データ（全店舗）：'+formatMiB(committedLength),
    'その他のInsight設定：'+formatMiB(capacityBefore.settingsUnits),
    '合計（概算）：'+formatMiB(committedLength+capacityBefore.settingsUnits)
  ]);
  expect(await page.evaluate(()=>({
    legacy:localStorage.getItem('insight_v11'),
    adoption:localStorage.getItem('insight_indexeddb_adoption_v1')
  }))).toEqual({legacy:capacityBefore.legacy,adoption:capacityBefore.adoption});
  await expect(safetyToggle).toHaveCount(0);
  expect(await committedInput(page)).toEqual(beforeRestore);
  await page.locator('#backupBtn').tap();
  const settings=page.locator('#insightIndexedDBBackupDialog');
  await expect(settings).toBeVisible();
  await checkSettingsBackupLayout(page,settings);
  await settings.getByLabel('バックアップ用パスワード').fill(password);
  await settings.getByLabel('パスワードの確認').fill('Mismatch123');
  await settings.getByRole('button',{name:'暗号化してダウンロード'}).click();
  await expect(settings.getByRole('status')).toHaveText('パスワードが一致しません。');
  expect(await committedInput(page)).toEqual(beforeRestore);
  await settings.getByLabel('バックアップ用パスワード').fill(password);
  await settings.getByLabel('パスワードの確認').fill(password);
  const [exported]=await Promise.all([page.waitForEvent('download'),
    settings.getByRole('button',{name:'暗号化してダウンロード'}).click()]);
  const safety=await downloaded(exported);
  await expect(settings.getByRole('status')).toContainText('確定版 3');
  await settings.getByRole('button',{name:'閉じる'}).click();
  await page.locator('#restoreBtn').tap();
  await expect(settings).not.toHaveClass(/insight-backup-export/);
  await settings.getByLabel('復元する暗号化バックアップ',{exact:true}).setInputFiles(file);
  const restoreSafetyFile=settings.getByLabel('現在の確定版の暗号化バックアップ',{exact:true});
  await expect(restoreSafetyFile).toHaveAttribute('required','');
  await restoreSafetyFile.setInputFiles(safety);
  await settings.getByLabel('復元するバックアップのパスワード',{exact:true}).fill(password);
  await settings.getByLabel('現在の確定版のパスワード',{exact:true}).fill(password);
  await settings.getByLabel('旧版のInsightをすべて閉じました').check();
  await settings.getByRole('button',{name:'内容を表示'}).click();
  await expect(settings.getByText(/架空店舗A/)).toBeVisible();
  await settings.getByRole('button',{name:'この内容を復元する'}).click();
  await expect(page.locator('#qi_売上')).toHaveValue('123');
  await expect(page.locator('#storeSel')).toHaveValue(seed.id);
  await page.waitForFunction(()=>InsightIndexedDBCandidateV1.isAdopted()&&!document.body.inert&&
    !!document.getElementById('insightIndexedDBBackupDialog'));
  const readback=await committedInput(page);
  expect(readback.revision).toBe(4);
  expect(readback.snapshot.stores[seed.id].years).toEqual(JSON.parse(raw).stores[seed.id].years);
  expect(readback.snapshot.stores['fixture-peer'].data[seed.fy][seed.month][seed.day-1].売上).toBe(999);
  const peer=await openStoreSwitchPeer(context,release);
  try{
    let record=await readStoreSwitchRecord(peer);
    expect(JSON.parse(record.previous.raw)).toEqual(beforeRestore.snapshot);
    expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);

    await page.locator('#qi_売上').fill('432');
    page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('#storeSel').selectOption('fixture-peer');
    await expect(page.locator('#qi_売上')).toHaveValue('432');
    await expect(page.locator('#storeSel')).toHaveValue(seed.id);
    expect(await readStoreSwitchRecord(peer)).toEqual(record);

    let expected=readback;
    for(const [nav,screen] of [
      ['#nav0','#pageQuick'],['#nav1','#pageDash'],['#navSalesCount','#pageSalesCount'],
      ['#navSaleResults','#pageSaleResults'],['#navEventResults','#pageEventResults'],
      ['#navOrderForecast','#pageOrderForecast'],['#navSettings','#insightSettingsYearSection']
    ]){
      if(nav!=='#nav0')await page.locator(nav).click();
      await expect(page.locator(screen)).toBeVisible();
      const id=expected.snapshot.current===seed.id?'fixture-peer':seed.id;
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('#storeSel').selectOption(id);
      await expect(page.locator('#storeSel')).toBeEnabled();
      await expect(page.locator('#storeSel')).toHaveValue(id);
      await expect(page.locator('#insightIndexedDBStoreStatus')).toBeEmpty();
      await expect(page.locator(screen)).toBeVisible();
      if(nav==='#nav0')await expect(page.locator('#qi_売上')).toHaveValue('999');
      if(nav==='#navOrderForecast'){
        expect(await page.evaluate(()=>InsightOrderForecast.getState().storeId)).toBe(id);
        await expect(page.locator('#ofWeather .of-weather-card')).toHaveCount(7);
        await page.getByRole('button',{name:'この納品日の比較用記録を保存'}).click();
        await expect(page.getByText('比較用の記録を保存しました。',{exact:true})).toBeVisible();
      }
      const previous=expected.snapshot;
      expected={revision:expected.revision+1,snapshot:{...previous,current:id}};
      expect(await committedInput(page)).toEqual(expected);
      record=await readStoreSwitchRecord(peer);
      expect(JSON.parse(record.raw)).toEqual(expected.snapshot);
      expect(JSON.parse(record.previous.raw)).toEqual(previous);
      expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    }
    const analysisRequests=[];
    const watchAnalysisRequest=request=>{
      if(new URL(request.url()).origin!==new URL(release).origin)analysisRequests.push(request.url());
    };
    page.on('request',watchAnalysisRequest);
    const diagnostics=page.locator('#insightWeatherSalesDiagnosticsOverlay');
    const trends=page.locator('#insightWeatherSalesViewOverlay');
    const prediction=page.getByRole('dialog',{name:'予測用データ品質チェック'});
    const predictionButton=page.locator('#insightPredictionDataButton');
    await page.locator('#insightWeatherSalesDiagnosticsButton').tap();
    await expect(diagnostics).toBeVisible();
    await page.evaluate(()=>{
      document.getElementById('insightWeatherSalesViewButton').click();
      document.getElementById('insightPredictionDataButton').click();
      gotoNav(1);
      switchStore(allStores.current==='fixture-peer'?
        Object.keys(allStores.stores).find(id=>id!=='fixture-peer'):'fixture-peer');
    });
    await expect(trends).toBeHidden();
    await expect(prediction).toBeHidden();
    await expect(page.locator('#pageSettings')).toBeVisible();
    await expect(page.locator('#storeSel')).toHaveValue(expected.snapshot.current);
    await diagnostics.getByRole('button',{name:'閉じる'}).tap();
    await expect(diagnostics).toBeHidden();
    await page.locator('#insightWeatherSalesDiagnosticsButton').tap();
    await diagnostics.tap({position:{x:3,y:3}});
    await expect(diagnostics).toBeHidden();

    await page.locator('#insightWeatherSalesViewButton').tap();
    await expect(trends).toBeVisible();
    await page.locator('#iwsvDays').selectOption('168');
    await expect(trends.locator('.iwsv-period')).toContainText('168日');
    await page.locator('#iwsvStore').selectOption('fixture-peer');
    await expect(page.locator('#iwsvStore')).toHaveValue('fixture-peer');
    await page.locator('#iwsvCategory').selectOption({index:1});
    await page.locator('#iwsvTrip').selectOption('2');
    await expect(page.locator('#iwsvTrip')).toHaveValue('2');
    await trends.getByRole('button',{name:'閉じる'}).tap();
    await expect(trends).toBeHidden();

    await predictionButton.tap();
    await expect(prediction.getByRole('heading',{name:'架空店舗A'})).toBeVisible();
    await expect(prediction.getByRole('heading',{name:'架空店舗B'})).toBeVisible();
    await expect(prediction.getByText('客数が正の値').first()).toBeVisible();
    await page.evaluate(()=>{
      document.getElementById('nav1').click();
      document.getElementById('insightDataHealthButton').click();
      document.getElementById('storeMenuBtn').click();
      gotoNav(1);
      showStoreMenu();
      return switchStore(allStores.current==='fixture-peer'?
        Object.keys(allStores.stores).find(id=>id!=='fixture-peer'):'fixture-peer');
    });
    await expect(page.locator('#pageSettings')).toBeVisible();
    await expect(page.locator('#storeSel')).toHaveValue(expected.snapshot.current);
    await expect(page.locator('#storeMenu')).not.toHaveClass(/is-open/);
    await expect(page.locator('#insightDataHealthDialog')).toBeHidden();
    await prediction.getByRole('button',{name:'閉じる'}).tap();
    await expect(prediction).toBeHidden();
    await expect(predictionButton).toBeFocused();
    await predictionButton.tap();
    await page.keyboard.press('Escape');
    await expect(prediction).toBeHidden();
    await predictionButton.tap();
    await page.locator('#insightPredictionDataOverlay').tap({position:{x:3,y:3}});
    await expect(prediction).toBeHidden();
    expect(await committedInput(page)).toEqual(expected);
    page.off('request',watchAnalysisRequest);
    expect(analysisRequests).toEqual([]);
    expect(await readStoreSwitchRecord(peer)).toEqual(record);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);

    await page.locator('#insightDataHealthButton').click();
    await expect(page.locator('#insightDataHealthDialog')).toBeVisible();
    await page.locator('#insightDataHealthClose').click();
    await expect(page.locator('#insightDataHealthDialog')).toBeHidden();
    await page.locator('#insightReportOpen').click();
    await expect(page.locator('#insightReportDialog')).toBeVisible();
    await expect(page.locator('#irp-store')).toHaveValue(expected.snapshot.current);
    await page.locator('#irp-category').selectOption({index:1});
    await page.locator('#insightReportGenerate').click();
    await expect(page.locator('#insightReportText')).toContainText('架空店舗B');
    await expect(page.locator('#insightReportText')).toContainText('999000円');
    await page.locator('#insightReportDialog').getByRole('button',{name:'閉じる'}).click();
    await page.locator('#nav1').click();
    await page.locator('#aiAnalysisToggle').click();
    await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
    await page.locator('#aiAnalysisToggle').click();
    await expect(page.locator('body')).not.toHaveClass(/ai-analysis-open/);

    const menu=page.locator('#storeMenu');
    const openMenu=()=>page.locator('#storeMenuBtn').click();
    const menuStatus=page.locator('#insightIndexedDBStoreStatus');
    async function checkManagementSnapshot(snapshot){
      const previous=expected;
      expected={revision:previous.revision+1,snapshot};
      await expect(menuStatus).toHaveText('保存しました。');
      await expect(menu).not.toHaveClass(/is-open/);
      expect(await committedInput(page)).toEqual(expected);
      record=await readStoreSwitchRecord(peer);
      expect(JSON.parse(record.raw)).toEqual(snapshot);
      expect(JSON.parse(record.previous.raw)).toEqual(previous.snapshot);
      expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    }

    await openMenu();
    page.once('dialog',dialog=>dialog.accept('架空の追加店舗'));
    await menu.getByRole('button',{name:/新しい店舗を追加/}).click();
    await expect(page.locator('#storeSel option:checked')).toHaveText('架空の追加店舗');
    const id=await page.locator('#storeSel').inputValue();
    const yearData=await page.evaluate(()=>({year:todayFY().fy,data:blankYearData(todayFY().fy)}));
    const added={...expected.snapshot,current:id,stores:{...expected.snapshot.stores,
      [id]:{name:'架空の追加店舗',years:[yearData.year],data:{[yearData.year]:yearData.data},salesCounts:{}}}};
    await checkManagementSnapshot(added);

    await page.locator('#navEventResults').click();
    await openMenu();
    page.once('dialog',dialog=>dialog.accept('架空の名称変更'));
    await menu.getByRole('button',{name:/店舗名を変更/}).click();
    const renamed=structuredClone(expected.snapshot);
    renamed.stores[id].name='架空の名称変更';
    await checkManagementSnapshot(renamed);
    await mockPreviewWeather(page);
    await openPreviewLocation(page);
    await page.waitForFunction(()=>typeof window.finishPreviewLocation==='function');
    await page.evaluate(()=>finishPreviewLocation());
    const located=structuredClone(expected.snapshot);
    located.stores[id].weatherLocation=fictionalWeatherLocation;
    await page.waitForFunction(()=>!InsightWeatherLocation.hasPendingSearch());
    await checkManagementSnapshot(located);
    manualMigration=false;
    await page.reload();
    const startup=await page.waitForFunction(()=>document.querySelector('[data-indexeddb-startup-stage]')?.dataset.indexeddbStartupStage||
      (window.InsightIndexedDBCandidateV1?.isAdopted()&&!document.body.inert&&
        !!document.getElementById('insightIndexedDBBackupDialog')?'ready':false));
    const startupStage=await startup.jsonValue();
    const startupSnapshot=await page.evaluate(()=>JSON.parse(InsightStorage.serialize(allStores)));
    function firstSnapshotDifference(actual,expected,path='snapshot'){
      if(JSON.stringify(actual)===JSON.stringify(expected))return null;
      if(!actual||!expected||typeof actual!=='object'||typeof expected!=='object')return path;
      for(const key of new Set([...Object.keys(actual),...Object.keys(expected)])){
        const changed=firstSnapshotDifference(actual[key],expected[key],path+'.'+key);
        if(changed)return changed;
      }
      return path+' (key order)';
    }
    expect({stage:startupStage,changedPath:firstSnapshotDifference(startupSnapshot,expected.snapshot)})
      .toEqual({stage:'ready',changedPath:null});
    expect(await committedInput(page)).toEqual(expected);
    expect(await readStoreSwitchRecord(peer)).toEqual(record);

    await page.locator('#navSaleResults').click();
    await openMenu();
    page.once('dialog',dialog=>dialog.dismiss());
    await menu.getByRole('button',{name:/この店舗を削除/}).click();
    await expect(menu).not.toHaveClass(/is-open/);
    expect(await readStoreSwitchRecord(peer)).toEqual(record);
    await openMenu();
    page.once('dialog',dialog=>dialog.accept());
    await menu.getByRole('button',{name:/この店舗を削除/}).click();
    const removed=structuredClone(expected.snapshot);
    removed.current=Object.keys(removed.stores).find(key=>key!==id);
    delete removed.stores[id];
    await checkManagementSnapshot(removed);
    await expect(page.locator('#pageSaleResults')).toBeVisible();

    for(const brokenMarker of [null,'{']){
      await peer.evaluate(value=>{
        const key='insight_indexeddb_adoption_v1';
        if(value===null)localStorage.removeItem(key);
        else localStorage.setItem(key,value);
      },brokenMarker);
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('保存状態を確認できないため、起動と保存を停止しています。');
      await expect(page.locator('#quickGrid')).toHaveCount(0);
      expect(await readStoreSwitchRecord(peer)).toEqual(record);
      expect(await peer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    }
  }finally{await peer.close();}

  // A separate HTTPS origin has no legacy data, migration history or adopted copy.
  await page.goto(httpsInsight+'/Index.html');
  const recovery=page.locator('#loading');
  await expect(recovery.getByRole('heading',{name:'暗号化バックアップから復元'})).toBeVisible();
  const confirmRestore=recovery.getByRole('button',{name:'この内容を復元する'});
  async function previewBackup(passphrase){
    await recovery.getByLabel('暗号化バックアップ',{exact:true}).setInputFiles(safety);
    await recovery.getByLabel('バックアップのパスワード').fill(passphrase);
    await recovery.getByLabel('旧版のInsightをすべて閉じました').check();
    await recovery.getByRole('button',{name:'内容を表示'}).click();
  }
  function recoveryState(){
    return page.evaluate(async ()=>({state:await InsightIndexedDBStorageV1.diagnose(),
      legacy:localStorage.getItem('insight_v11'),marker:localStorage.getItem('insight_indexeddb_adoption_v1')}));
  }
  const absent={state:{state:'hold',reason:'storage-history-unknown'},legacy:null,marker:null};
  await previewBackup('Wrong123');
  await expect(recovery.getByRole('status')).toHaveText('確認できませんでした。ファイル、パスワード、保存状態を確認してください。');
  expect(await recoveryState()).toEqual(absent);
  await previewBackup(password);
  await expect(recovery.getByText(/架空店舗B/)).toBeVisible();
  await recovery.getByRole('button',{name:'取り消す',exact:true}).click();
  await expect(recovery.getByRole('status')).toHaveText('取り消しました。');
  expect(await recoveryState()).toEqual(absent);
  await previewBackup(password);
  await expect(confirmRestore).toBeVisible();
  await page.evaluate(raw=>localStorage.setItem('insight_v11',raw),raw);
  await confirmRestore.click();
  await expect(recovery.getByRole('status')).toContainText('確認できませんでした');
  expect(await page.evaluate(()=>({legacy:localStorage.getItem('insight_v11'),
    marker:localStorage.getItem('insight_indexeddb_adoption_v1')}))).toEqual({legacy:raw,marker:null});
  await page.evaluate(()=>localStorage.removeItem('insight_v11'));
  await previewBackup(password);
  await confirmRestore.click();
  await page.waitForFunction(()=>window.InsightIndexedDBCandidateV1?.isAdopted()&&!document.body.inert&&
    !!document.getElementById('insightIndexedDBBackupDialog'));
  expect(await committedInput(page)).toEqual({revision:0,snapshot:beforeRestore.snapshot});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBeNull();
  await expect(page.locator('#qi_売上')).toHaveValue('999');
  await page.locator('#qi_売上').fill('876');
  await page.locator('#quickSaveBtn').click();
  await expect(page.locator('#quickSaveBtn')).toBeEnabled();
  await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
  await expect(page.locator('#quickSaveBtn + [role=status]')).toBeEmpty();
  await page.reload();
  await expect(page.locator('#qi_売上')).toHaveValue('876');
  await page.waitForFunction(()=>window.InsightIndexedDBCandidateV1?.isAdopted()&&!document.body.inert);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBeNull();
});

test('isolated startup removes only future weather, and holds the screen on uncertain readback',async({page,context})=>{
  const fixture='/future-weather-startup-fixture';
  await page.route('**'+fixture,route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><meta charset="utf-8"><main></main>'}));
  await page.goto(fixture);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.addScriptTag({url:'/insight_indexeddb_migration_preview_v1.js'});
  const seed=await page.evaluate(async ()=>{
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
    const dates=[-1,0,1].map(offset=>{
      const date=new Date();
      date.setDate(date.getDate()+offset);
      return [String(date.getFullYear()),(date.getMonth()+1)+'月',date.getDate()];
    });
    const source={current:'a',stores:{a:{data:{}},b:{data:{}}},sharedWeather:{unrecognized:'保持'}};
    for(const [year,month,day] of dates){
      for(const shop of Object.values(source.stores)){
        shop.data[year]??={};
        shop.data[year][month]??=[];
        shop.data[year][month].push({d:day,weather:'曇',tempMaxC:20,tempMinC:5,売上:100,storeMemo:'保持'});
      }
      source.sharedWeather[year+'-'+month+'-'+day]='曇';
    }
    const raw=JSON.stringify(source);
    localStorage.setItem('insight_v11',raw);
    await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
    window.tryStartup=()=>InsightIndexedDBMigrationPreviewV1.start(
      document.querySelector('main'),()=>{throw new Error('Legacy shell opened');},result=>{
        document.querySelector('main').textContent='採用済み '+result.revision;
      }
    );
    return {source,raw,future:dates[2]};
  });
  const expected=structuredClone(seed.source),[year,month,day]=seed.future;
  for(const shop of Object.values(expected.stores)){
    const row=shop.data[year][month].find(row=>row.d===day);
    row.weather='';
    delete row.tempMaxC;
    delete row.tempMinC;
  }
  delete expected.sharedWeather[year+'-'+month+'-'+day];
  await page.evaluate(()=>tryStartup());
  await expect(page.locator('main')).toHaveText('採用済み 1');
  expect(await committedInput(page)).toEqual({revision:1,snapshot:expected});
  await page.evaluate(()=>tryStartup());
  await expect(page.locator('main')).toHaveText('採用済み 1');

  await page.evaluate(source=>InsightIndexedDBStorageV1.save(1,source),seed.source);
  await interruptCountReadback(page,'readback failure');
  await page.evaluate(()=>tryStartup());
  await expect(page.getByRole('status')).toContainText('起動時の保存を確認できない');
  const observer=await openStoreSwitchPeer(context);
  try{
    const record=await readStoreSwitchRecord(observer);
    expect(record.revision).toBe(3);
    expect(JSON.parse(record.raw)).toEqual(expected);
    expect(record.previous.raw).toBe(seed.raw);
    expect(await observer.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await observer.close();}
});

test('adopted loader keeps editing closed with missing or corrupted adoption evidence',async({page})=>{
  const fixture='/adopted-evidence-guard-fixture';
  await page.route('**'+fixture,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main></main>'}));
  await page.goto(fixture);
  for(const src of ['insight_indexeddb_storage_v1.js','insight_indexeddb_recovery_preview_v1.js',
    'insight_indexeddb_migration_preview_v1.js'])await page.addScriptTag({url:'/'+src});
  const result=await page.evaluate(async ()=>{
    const api=InsightIndexedDBStorageV1,marker='insight_indexeddb_adoption_v1';
    const raw=JSON.stringify({current:'fictional',stores:{fictional:{value:1}}});
    localStorage.setItem('insight_v11',raw);
    window.InsightStorage={writeMetadata(key,value){localStorage.setItem(key,value);}};
    window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
    await api.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
    const adopted=localStorage.getItem(marker),host=document.querySelector('main');
    let opened=0;
    const cases=[];
    async function inspect(){
      const before=localStorage.getItem(marker);
      await InsightIndexedDBMigrationPreviewV1.start(host,()=>opened++,()=>opened++,{restart:()=>opened++});
      cases.push({reason:(await api.diagnoseStartup()).reason,form:!!host.querySelector('form'),
        markerPreserved:before===localStorage.getItem(marker),sourcePreserved:raw===localStorage.getItem('insight_v11')});
    }
    function remove(name){
      return new Promise((resolve,reject)=>{
        const request=indexedDB.deleteDatabase(name);
        request.onsuccess=resolve;
        request.onerror=()=>reject(request.error);
      });
    }
    localStorage.setItem(marker,'{破損');
    await inspect();
    localStorage.removeItem(marker);
    await inspect();
    localStorage.setItem(marker,adopted);
    await remove('insight-migration-history-v1');
    await inspect();
    await remove('insight-store-snapshots-v1');
    await inspect();
    return {cases,opened,text:host.textContent};
  });
  expect(result).toEqual({
    cases:['invalid-marker','marker-missing','history-missing','database-missing'].map(reason=>({
      reason,form:false,markerPreserved:true,sourcePreserved:true
    })),opened:0,text:'保存状態を確認できないため、起動と保存を停止しています。'
  });
});

test('isolated adopted startup saves a single sales day after readback and stops on uncertain commit',async({page})=>{
  const fixture='/isolated-adopted-sales-fixture';
  await page.route('**'+fixture,route=>route.fulfill({
    contentType:'text/html',
    body:`<!doctype html><meta charset="utf-8"><main id="sales-fixture"></main>
      <script>window.SK='insight_v11';</script>
      <script src="/insight_storage_v1.js"></script>
      <script src="/insight_indexeddb_storage_v1.js"></script>
      <script src="/insight_indexeddb_migration_preview_v1.js"></script>
      <script src="/insight_indexeddb_sales_preview_v1.js"></script>
      <script>
        const pane=document.getElementById('sales-fixture');
        InsightIndexedDBMigrationPreviewV1.start(pane,
          ()=>{pane.textContent='旧方式の起動';},
          ()=>InsightIndexedDBSalesPreviewV1.open(pane,{year:'2026',month:'4月',day:1}));
      </script>`
  }));
  await page.goto(fixture);
  const status=page.getByRole('status');
  await expect(status).toHaveText('保存状態を確認できないため、起動と保存を停止しています。');
  const source={
    current:'a',stores:{
      a:{name:'架空店舗A',years:['2025','2026'],data:{
        2025:{'4月':[{d:1,売上:100}]},2026:{'4月':[{d:1,売上:123,客数:10,weather:'晴'},{d:2,売上:234}]}
      }},
      b:{name:'架空店舗B',years:['2025','2026'],data:{
        2025:{'4月':[{d:1,売上:300}]},2026:{'4月':[{d:1,売上:345}]}
      }}
    }
  };
  const raw=JSON.stringify(source);
  await page.evaluate(async raw=>{
    localStorage.setItem('insight_v11',raw);
    window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
    await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
  },raw);
  await page.reload();
  await expect(page.getByText('架空店舗A 2026年度 4月1日')).toBeVisible();
  const input=page.getByRole('spinbutton',{name:'売上（円）'});
  const save=page.getByRole('button',{name:'売上を保存'});
  await expect(input).toHaveValue('123');
  const confirmed=page.getByText(/^確定済みの売上 /);

  // Delay the committed record readback while the real IndexedDB transaction runs.
  await page.evaluate(()=>{
    const writeMetadata=InsightStorage.writeMetadata;
    let delayRead=false;
    InsightStorage.writeMetadata=(key,value)=>{
      const result=writeMetadata(key,value);
      if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='writing')delayRead=true;
      return result;
    };
    const get=IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get=function(...args){
      const request=get.apply(this,args);
      if(delayRead&&this.transaction.mode==='readonly'&&this.transaction.db.name==='insight-store-snapshots-v1'){
        delayRead=false;
        const transaction=this.transaction;
        const oncomplete=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
        Object.defineProperty(transaction,'oncomplete',{
          set(listener){
            oncomplete.set.call(this,event=>{
              window.releaseSalesReadback=()=>listener.call(this,event);
            });
          }
        });
      }
      return request;
    };
    window.restoreSalesHooks=()=>{
      InsightStorage.writeMetadata=writeMetadata;
      IDBObjectStore.prototype.get=get;
    };
  });
  await input.fill('456');
  await save.click();
  await page.waitForFunction(()=>typeof window.releaseSalesReadback==='function');
  await expect(status).toHaveText('保存を確認しています。');
  await expect(save).toBeDisabled();
  await expect(input).toHaveValue('456');
  await expect(confirmed).toHaveText('確定済みの売上 123円');
  await page.evaluate(()=>{window.restoreSalesHooks();window.releaseSalesReadback();});
  await expect(status).toHaveText('売上を保存しました。');
  await expect(confirmed).toHaveText('確定済みの売上 456円');

  const saved=JSON.parse(raw);
  saved.stores.a.data['2026']['4月'][0].売上=456;
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:1,snapshot:saved});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  await page.reload();
  await expect(input).toHaveValue('456');

  await page.evaluate(()=>{
    const writeMetadata=InsightStorage.writeMetadata;
    InsightStorage.writeMetadata=(key,value)=>{
      if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='active')
        throw new Error('Fixture lost commit acknowledgement');
      return writeMetadata(key,value);
    };
  });
  await input.fill('789');
  await save.click();
  await expect(status).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
  await expect(input).toHaveValue('789');
  await expect(confirmed).toHaveText('確定済みの売上 456円');
  await expect(save).toBeDisabled();
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
    .toEqual({state:'hold',reason:'writing',observedRevision:2,recovery:'save-verified'});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  await page.reload();
  await expect(status).toHaveText('保存状態を確認できないため、起動と保存を停止しています。');
  await expect(save).toHaveCount(0);
});

async function openMonthlySalesPreview(page,{followInputScreens=false}={}){
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  // Initialize the existing dashboard before capturing the fixture's committed baseline.
  await page.locator('#nav1').click();
  await expect(page.locator('#pageDash')).toHaveClass(/show/);
  if(followInputScreens){
    await page.locator('#nav3').click();
    await page.locator('#nav4').click();
  }
  await page.locator('#nav2').click();
  await page.waitForFunction(()=>window.InsightInputDayNav?.getSelectedIso('sales')&&
    document.getElementById('sf_売上'));
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.addScriptTag({url:'/insight_indexeddb_sales_input_preview_v1.js'});
  return page.evaluate(async followInputScreens=>{
    const year=editYear.sales,month=editMonth.sales,day=window.salesSelDay;
    const active=allStores.current;
    const row=store.data[year][month][day-1];
    row.売上=42;
    row.買上点数=7;
    row.客数=77;
    row.storeMemo='FICTIONAL memo';
    row.tempMaxC=30;
    allStores.stores['fictional-second-shop']=JSON.parse(JSON.stringify(store));
    allStores.stores['fictional-second-shop'].name='架空の別店舗';
    drafts.sales[day-1]=JSON.parse(JSON.stringify(row));
    renderSalesForm(year,MONTHS.indexOf(month),day);
    const raw=InsightStorage.writeSnapshot(allStores);
    window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
    await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
    window.fixtureSalesPreview=await InsightIndexedDBSalesInputPreviewV1.connect('sales',{followInputScreens});
    return {year,month,day,active,raw,weather:WX_KEYS.find(key=>key!==(row.weather||''))};
  },followInputScreens);
}

for(const failure of ['stale revision','quota failure','draft changed during save']){
  test('monthly sales and weather use one revision, with '+failure+' stopping the next save',async({page})=>{
    const seed=await openMonthlySalesPreview(page);
    const expected=JSON.parse(seed.raw);
    const getRow=snapshot=>snapshot.stores[seed.active].data[seed.year][seed.month][seed.day-1];
    const save=page.locator('#salesSaveBtn');
    const notice=page.locator('#savedSales');
    const status=page.locator('#salesSaveBtn + [role=status]');
    const sales=page.locator('#sf_売上');
    const count=page.locator('#sf_買上点数');
    const readMonitor=()=>page.evaluate(()=>({
      observed:InsightInputSaveObserverV0.getStatus(),
      dirty:InsightInputDayNav.hasUnsavedInput()
    }));
    await save.click();
    await expect(status).toHaveText('保存する変更はありません。');
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().then(value=>value.revision))).toBe(0);
    expect(await readMonitor()).toMatchObject({observed:{state:'IDLE_OBSERVED',activeCount:0},dirty:false});

    await page.evaluate(()=>{
      const digest=crypto.subtle.digest;
      crypto.subtle.digest=async function(...args){
        await new Promise(resolve=>{
          window.resumeFixtureSave=window.resumeFixtureSave??[];
          window.resumeFixtureSave.push(resolve);
        });
        return digest.apply(this,args);
      };
      window.restoreFixtureDigest=()=>{crypto.subtle.digest=digest;};
    });
    await sales.fill('456');
    await count.click();
    await count.fill('8.25');
    await expect(count).toHaveValue('8.25');
    await page.evaluate(()=>{
      window.fixtureWarnings=[];
      window.confirm=message=>{window.fixtureWarnings.push(message);return false;};
    });
    await page.locator('#nav1').click();
    await expect(page.locator('#pageSales')).toHaveClass(/show/);
    expect(await readMonitor()).toMatchObject({dirty:true});
    expect(await page.evaluate(()=>{
      const next=new Date(Number(editYear.sales),MONTHS.indexOf(editMonth.sales)+1,1);
      return InsightInputDayNav.select('sales',
        next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-01');
    })).toBe(false);
    await expect(page.locator('#pageSales')).toHaveClass(/show/);
    await expect(count).toHaveValue('8.25');
    expect(await page.evaluate(()=>window.fixtureWarnings)).toEqual([
      '未保存の入力があります。\n保存せずに画面を移動しますか？',
      '未保存の入力があります。\n保存せずに別の日付へ移動しますか？'
    ]);
    const siblingDay=seed.day===1?2:1;
    await page.locator('#salesDayList button').nth(siblingDay-1).click();
    await sales.click();
    await sales.fill('222');
    await page.locator('#salesDayList button').nth(seed.day-1).click();
    // The existing sales page displays weather as a reference; stage the linked input in the fixture.
    await page.evaluate(({day,weather})=>{drafts.sales[day-1].weather=weather;},seed);
    expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
      .toEqual({state:'IDLE_OBSERVED',hasUnsavedInput:true});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().then(value=>value.revision))).toBe(0);
    await save.click();
    await page.waitForFunction(()=>window.resumeFixtureSave?.length===2);
    await expect(save).toBeDisabled();
    expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
      .toEqual({state:'ACTIVE',hasUnsavedInput:true});
    expect(await readMonitor()).toMatchObject({observed:{state:'ACTIVE',activeCount:1},dirty:true});
    expect(await page.evaluate(()=>gotoNav(1))).toBe(false);
    await expect(status).toBeEmpty();
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(()=>store.data[editYear.sales][editMonth.sales][window.salesSelDay-1].売上)).toBe(42);
    await page.evaluate(()=>{
      window.restoreFixtureDigest();
      window.resumeFixtureSave.forEach(resolve=>resolve());
    });
    await expect(save).toBeEnabled();
    await expect(notice).toHaveCount(0);
    Object.assign(getRow(expected),{売上:456,買上点数:8.25,weather:seed.weather});
    expected.stores[seed.active].data[seed.year][seed.month][siblingDay-1].売上=222;
    expected.stores['fictional-second-shop'].data[seed.year][seed.month][seed.day-1].weather=seed.weather;
    expected.sharedWeather={...expected.sharedWeather,[seed.year+'-'+seed.month+'-'+seed.day]:seed.weather};
    expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
      .toEqual({state:'IDLE_OBSERVED',hasUnsavedInput:false});
    expect(await readMonitor()).toMatchObject({observed:{state:'IDLE_OBSERVED',activeCount:0},dirty:false});
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:1,snapshot:expected});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);

    if(failure==='stale revision'){
      // Advance the committed revision without updating the open editor.
      await page.evaluate(async ()=>{
        const api=InsightIndexedDBStorageV1;
        const current=await api.read();
        current.snapshot.stores['fictional-second-shop'].name='別の画面で変更済み';
        await api.save(current.revision,current.snapshot);
      });
    }else if(failure==='quota failure'){
      await page.evaluate(()=>{
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(){
          IDBObjectStore.prototype.put=put;
          throw new DOMException('Fictional storage quota exceeded','QuotaExceededError');
        };
      });
    }
    if(failure==='draft changed during save'){
      await page.evaluate(()=>{
        const native=crypto.subtle.digest;
        const resumes=[];
        window.secondSaveDigests=resumes;
        crypto.subtle.digest=async function(...args){
          await new Promise(resolve=>resumes.push(resolve));
          return native.apply(this,args);
        };
        window.restoreSecondDigest=()=>{crypto.subtle.digest=native;};
      });
    }
    await sales.click();
    await sales.fill('789');
    await expect(sales).toHaveValue('789');
    await save.click();
    if(failure==='draft changed during save'){
      await page.waitForFunction(()=>window.secondSaveDigests.length===2);
      await page.evaluate(()=>{
        drafts.sales[window.salesSelDay-1].weather=WX_KEYS.find(key=>key!==drafts.sales[window.salesSelDay-1].weather);
        window.restoreSecondDigest();
        window.secondSaveDigests.forEach(resolve=>resolve());
      });
      await expect(status).toHaveText('表示中の店舗・日付または保存済みデータが変わりました。保存済みの内容を確認してください。');
    }else{
      await expect(status).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
    }
    await expect(sales).toHaveValue('789');
    expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
      .toEqual({state:'HELD',hasUnsavedInput:true});
    expect(await readMonitor()).toMatchObject({observed:{state:'HELD',activeCount:0},dirty:true});
    expect(await page.evaluate(()=>gotoNav(1))).toBe(false);
    await expect(save).toBeDisabled();
    await expect(notice).toHaveCount(0);
    if(failure==='draft changed during save'){
      const actual=await page.evaluate(()=>InsightIndexedDBStorageV1.read());
      getRow(expected).売上=789;
      expect(actual).toEqual({revision:2,snapshot:expected});
    }else{
      expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
        .toMatchObject(failure==='stale revision'
          ?{state:'hold',observedRevision:2}
          :{state:'hold',observedRevision:1,recovery:'prior-save-verified'});
    }
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

for(const navigation of ['sidebar','programmatic','period']){
  test('unsaved sales navigation warns once and discards only on approval via '+navigation,async({page})=>{
    const seed=await openMonthlySalesPreview(page);
    const sales=page.locator('#sf_売上');
    const status=page.locator('#salesSaveBtn + [role=status]');
    const iso=seed.year+'-'+String(Number.parseInt(seed.month)).padStart(2,'0')+'-'+String(seed.day).padStart(2,'0');
    await page.evaluate(()=>{
      window.navigationWarnings=[];
      window.approveNavigation=false;
      window.confirm=message=>{window.navigationWarnings.push(message);return window.approveNavigation;};
    });
    await sales.click();
    await sales.fill('456');
    async function navigate(){
      if(navigation==='sidebar')await page.locator('#nav1').click();
      else if(navigation==='programmatic')await page.evaluate(()=>gotoNav(1));
      else await page.evaluate(()=>{
        const next=new Date(Number(editYear.sales),MONTHS.indexOf(editMonth.sales)+1,1);
        InsightInputPeriodControls.apply({type:'sales',label:'売上'},next.getFullYear(),next.getMonth()+1);
      });
    }
    await navigate();
    await expect(page.locator('#pageSales')).toHaveClass(/show/);
    await expect(sales).toHaveValue('456');
    expect(await page.evaluate(()=>navigationWarnings.length)).toBe(1);
    await page.evaluate(()=>{window.approveNavigation=true;});
    await navigate();
    if(navigation==='period'){
      await expect.poll(()=>page.evaluate(()=>editMonth.sales)).not.toBe(seed.month);
      await page.locator('#salesSaveBtn').click();
      await expect(status).toHaveText('この期間は試験用の売上保存の対象外です。');
    }else{
      await expect(page.locator('#pageDash')).toHaveClass(/show/);
      await page.locator('#nav2').click();
    }
    await page.evaluate(date=>{InsightInputDayNav.select('sales',date);},iso);
    await expect(sales).toHaveValue('42');
    expect(await page.evaluate(()=>navigationWarnings.length)).toBe(2);
    const reopened=await page.evaluate(async ()=>{
      const committed=(await InsightIndexedDBStorageV1.read()).snapshot;
      const live=JSON.parse(InsightStorage.serialize(allStores));
      const changedKeys=[...new Set([...Object.keys(live),...Object.keys(committed)])].filter(key=>
        JSON.stringify(live[key])!==JSON.stringify(committed[key]));
      return {dirty:InsightInputDayNav.hasUnsavedInput(),changedKeys};
    });
    expect(reopened).toEqual({dirty:false,changedKeys:[]});
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().then(value=>value.revision))).toBe(0);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    await page.locator('#salesSaveBtn').click();
    await expect(status).toHaveText('保存する変更はありません。');
  });
}

for(const navigation of ['sidebar','programmatic','period']){
  test('sales edits outside the preview month remain protected via '+navigation,async({page})=>{
    const seed=await openMonthlySalesPreview(page);
    const baseline=JSON.parse(seed.raw);
    const sales=page.locator('#sf_売上');
    const status=page.locator('#salesSaveBtn + [role=status]');
    const activeMonth=Number.parseInt(seed.month);
    const otherMonth=activeMonth===1?2:activeMonth-1;
    const otherIso=seed.year+'-'+String(otherMonth).padStart(2,'0')+'-01';
    const activeIso=seed.year+'-'+String(activeMonth).padStart(2,'0')+'-'+String(seed.day).padStart(2,'0');
    await page.evaluate(()=>{
      window.otherMonthWarnings=[];
      window.approveOtherMonth=false;
      window.confirm=message=>{otherMonthWarnings.push(message);return approveOtherMonth;};
    });

    // Approve discard of a draft in the connected month, then edit in another month.
    await sales.click();
    await sales.fill('456');
    await page.evaluate(date=>{
      window.approveOtherMonth=true;
      InsightInputDayNav.select('sales',date);
    },otherIso);
    await expect.poll(()=>page.evaluate(()=>InsightInputDayNav.getSelectedIso('sales'))).toBe(otherIso);
    const originalValue=await sales.inputValue();
    await expect.poll(()=>page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);
    await sales.click();
    await sales.fill('987');
    await page.evaluate(()=>{window.approveOtherMonth=false;});
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(true);
    await page.locator('#salesSaveBtn').click();
    await expect(status).toHaveText('この期間は試験用の売上保存の対象外です。');
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(true);

    async function leave(){
      if(navigation==='sidebar')await page.locator('#nav1').click();
      else if(navigation==='programmatic')await page.evaluate(()=>gotoNav(1));
      else await page.evaluate(date=>InsightInputDayNav.select('sales',date),activeIso);
    }
    await leave();
    await expect(page.locator('#pageSales')).toHaveClass(/show/);
    await expect(sales).toHaveValue('987');
    expect(await page.evaluate(()=>InsightInputDayNav.getSelectedIso('sales'))).toBe(otherIso);
    expect(await page.evaluate(()=>otherMonthWarnings.length)).toBe(2);

    await page.evaluate(()=>{window.approveOtherMonth=true;});
    await leave();
    if(navigation==='period'){
      await expect.poll(()=>page.evaluate(()=>InsightInputDayNav.getSelectedIso('sales'))).toBe(activeIso);
    }else{
      await expect(page.locator('#pageDash')).toHaveClass(/show/);
      await page.locator('#nav2').click();
    }
    await page.evaluate(date=>InsightInputDayNav.select('sales',date),otherIso);
    await expect.poll(()=>page.evaluate(()=>InsightInputDayNav.getSelectedIso('sales'))).toBe(otherIso);
    await expect(sales).toHaveValue(originalValue);
    expect(await page.evaluate(()=>otherMonthWarnings.length)).toBe(3);
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:0,snapshot:baseline});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

for(const config of [
  {type:'kyaku',route:3,button:'#kyakuSaveBtn',notice:'#savedKyaku',field:'.kyaku-input[data-ri]',failure:'revision'},
  {type:'haiki',route:4,button:'#haikiSaveBtn',notice:'#savedHaiki',field:'#haikiForm input[data-hc]',failure:'quota'}
]){
  test('isolated '+config.type+' monthly save protects other data and stops on '+config.failure,async({page})=>{
    await routeMigrationPage(page);
    await page.goto('/Index.html');
    await waitForMigrationChecks(page);
    await page.locator('#nav1').click();
    await page.locator('#nav'+config.route).click();
    await expect(page.locator(config.button)).toBeVisible();
    await page.waitForFunction(type=>window.InsightInputDayNav?.getSelectedIso(type),config.type);
    await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    await page.addScriptTag({url:'/insight_indexeddb_sales_input_preview_v1.js'});
    const seed=await page.evaluate(async type=>{
      const year=editYear[type],month=editMonth[type];
      const prior=String(Number(year)-1);
      store.data[prior]??=JSON.parse(JSON.stringify(store.data[year]));
      if(!store.years.includes(prior))store.years.unshift(prior);
      const current=allStores.current,day=type==='haiki'?window.haikiSelDay:1;
      const category=HAIKI_CATS[0],otherCategory=HAIKI_CATS[1];
      const row=store.data[year][month][day-1];
      Object.assign(row,{売上:42,客数:10,買上点数:7,weather:'晴',storeMemo:'保持するメモ',tempMaxC:30});
      row.haiki={...row.haiki,[category]:20,[otherCategory]:30,customCarry:9};
      row.廃棄金額=50;
      const peer=JSON.parse(JSON.stringify(store));
      peer.name='架空の別店舗';
      allStores.stores['fictional-other-store']=peer;
      drafts[type][day-1]=JSON.parse(JSON.stringify(row));
      if(type==='haiki')renderHaikiForm(year,MONTHS.indexOf(month),day);
      else renderKyakuGrid(year,MONTHS.indexOf(month));
      const raw=InsightStorage.writeSnapshot(allStores);
      window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
      await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
      await InsightIndexedDBSalesInputPreviewV1.connect(type);
      return {raw,current,year,month,day,category};
    },config.type);
    const save=page.locator(config.button),notice=page.locator(config.notice);
    const status=page.locator(config.button+' + [role=status]');
    const field=config.type==='haiki'
      ? page.locator(config.field+'[data-hc="'+seed.category+'"]')
      : page.locator(config.field+'[data-ri="'+(seed.day-1)+'"]');
    await field.click();
    await field.fill('123');
    await expect(field).toHaveValue('123');
    await page.evaluate(()=>{
      window.confirm=()=>{window.fixtureRejectedLeave=true;return false;};
    });
    await page.locator('#nav1').click();
    expect(await page.evaluate(()=>fixtureRejectedLeave)).toBe(true);
    await expect(field).toHaveValue('123');
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(true);

    await page.evaluate(()=>{
      const digest=crypto.subtle.digest,resume=[];
      window.fixtureDigests=resume;
      crypto.subtle.digest=async function(...args){
        await new Promise(resolve=>resume.push(resolve));
        return digest.apply(this,args);
      };
      window.resumeFixtureCommit=()=>{
        crypto.subtle.digest=digest;
        resume.forEach(resolve=>resolve());
      };
    });
    await save.click();
    await page.waitForFunction(()=>fixtureDigests.length===2);
    await expect(status).toBeEmpty();
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(()=>InsightInputSaveObserverV0.getStatus()))
      .toMatchObject({state:'ACTIVE',activeCount:1});
    await page.evaluate(()=>resumeFixtureCommit());
    await expect(save).toBeEnabled();
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(false);
    const snapshot=JSON.parse(seed.raw),row=snapshot.stores[seed.current].data[seed.year][seed.month][seed.day-1];
    if(config.type==='kyaku')row.客数=123;
    else{
      row.haiki[seed.category]=123;
      row.廃棄金額=153;
    }
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:1,snapshot});

    await page.evaluate(async failure=>{
      if(failure==='revision'){
        const api=InsightIndexedDBStorageV1,current=await api.read();
        current.snapshot.stores['fictional-other-store'].name='別操作で更新';
        await api.save(current.revision,current.snapshot);
        return;
      }
      const put=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(){
        IDBObjectStore.prototype.put=put;
        throw new DOMException('Fictional quota error','QuotaExceededError');
      };
    },config.failure);
    await field.click();
    await field.fill('333');
    await save.click();
    await expect(status).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
    await expect(field).toHaveValue('333');
    await expect(save).toBeDisabled();
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(()=>InsightInputSaveObserverV0.getStatus()))
      .toMatchObject({state:'HELD',activeCount:0});
    expect(await page.evaluate(()=>InsightInputDayNav.hasUnsavedInput())).toBe(true);
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true}))).toMatchObject(
      config.failure==='quota'?{state:'hold',observedRevision:1,recovery:'prior-save-verified'}:{state:'hold',observedRevision:2});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

test('sales, customer and waste screens share one committed revision when switched in the same tab',async({page,context})=>{
  const seed=await openMonthlySalesPreview(page,{followInputScreens:true});
  const getRevision=()=>page.evaluate(()=>InsightIndexedDBStorageV1.read().then(value=>value.revision));
  const sales=page.locator('#sf_売上');
  const kyaku=page.locator('.kyaku-input[data-ri="'+(seed.day-1)+'"]');
  await sales.click();
  await sales.fill('456');
  await page.locator('#salesSaveBtn').click();
  await expect(page.locator('#salesSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedSales')).toHaveCount(0);
  expect(await getRevision()).toBe(1);

  await page.locator('#nav3').click();
  await expect(kyaku).toBeVisible();
  await kyaku.click();
  await kyaku.fill('123');
  await page.evaluate(()=>{
    window.fixtureLeaveWarnings=0;
    window.confirm=()=>{fixtureLeaveWarnings++;return false;};
  });
  await page.locator('#nav4').click();
  await expect(page.locator('#pageKyaku')).toHaveClass(/show/);
  await expect(kyaku).toHaveValue('123');
  expect(await page.evaluate(()=>fixtureLeaveWarnings)).toBe(1);
  await page.locator('#kyakuSaveBtn').click();
  await expect(page.locator('#kyakuSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedKyaku')).toHaveCount(0);
  expect(await getRevision()).toBe(2);

  await page.locator('#nav4').click();
  const categories=await page.evaluate(()=>HAIKI_CATS);
  const category=categories[0];
  const waste=page.locator('#haikiForm [data-hc="'+category+'"]');
  const date=seed.year+'-'+String(Number.parseInt(seed.month)).padStart(2,'0')+'-'+String(seed.day).padStart(2,'0');
  await page.evaluate(date=>InsightInputDayNav.select('haiki',date),date);
  await expect.poll(()=>page.evaluate(()=>window.haikiSelDay)).toBe(seed.day);
  await waste.click();
  await waste.fill('123');
  await page.evaluate(()=>{
    const digest=crypto.subtle.digest,resume=[];
    window.multiScreenDigests=resume;
    crypto.subtle.digest=async function(...args){
      await new Promise(resolve=>resume.push(resolve));
      return digest.apply(this,args);
    };
    window.resumeMultiScreenSave=()=>{
      crypto.subtle.digest=digest;
      resume.forEach(resolve=>resolve());
    };
  });
  await page.locator('#haikiSaveBtn').click();
  await page.waitForFunction(()=>multiScreenDigests.length===2);
  expect(await page.evaluate(()=>gotoNav(3))).toBe(false);
  await page.evaluate(()=>saveInput('kyaku'));
  expect(await page.evaluate(()=>InsightInputSaveObserverV0.getStatus()))
    .toMatchObject({state:'ACTIVE',activeCount:1});
  await expect(page.locator('#savedHaiki')).toHaveCount(0);
  await page.evaluate(()=>resumeMultiScreenSave());
  await expect(page.locator('#haikiSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedHaiki')).toHaveCount(0);
  const expected=JSON.parse(seed.raw);
  const row=expected.stores[seed.active].data[seed.year][seed.month][seed.day-1];
  row.売上=456;
  row.客数=123;
  row.haiki={...row.haiki,[category]:123};
  row.廃棄金額=categories.reduce((sum,key)=>sum+Number(row.haiki[key]??0),0);
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:3,snapshot:expected});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);

  await page.locator('#nav2').click();
  await expect(sales).toHaveValue('456');
  expect(await page.evaluate(()=>fixtureLeaveWarnings)).toBe(1);
  await page.locator('#salesSaveBtn').click();
  await expect(page.locator('#salesSaveBtn + [role=status]')).toHaveText('保存する変更はありません。');
  expect(await getRevision()).toBe(3);
  for(const button of ['#salesSaveBtn','#kyakuSaveBtn','#haikiSaveBtn'])
    await expect(page.locator(button+' + [role=status]')).toHaveCount(1);

  const other=await context.newPage();
  try{
    await other.route('**/monthly-concurrent-fixture',route=>route.fulfill({
      contentType:'text/html',body:'<!doctype html><title>Fictional concurrent save</title>'
    }));
    await other.goto('/monthly-concurrent-fixture');
    await other.evaluate(()=>{window.SK='insight_v11';});
    await other.addScriptTag({url:'/insight_storage_v1.js'});
    await other.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
    await other.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1,current=await api.read();
      current.snapshot.stores['fictional-second-shop'].name='別タブで確定';
      await api.save(current.revision,current.snapshot);
    });
    await sales.click();
    await sales.fill('789');
    await page.locator('#salesSaveBtn').click();
    await expect(page.locator('#salesSaveBtn + [role=status]'))
      .toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
    await expect(sales).toHaveValue('789');
    expect(await page.evaluate(()=>gotoNav(3))).toBe(false);
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
      .toMatchObject({state:'hold',observedRevision:4});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  }finally{await other.close();}
});

test('isolated store selection keeps drafts on cancellation and changes the save target only after commit',async({page})=>{
  const seed=await openMonthlySalesPreview(page,{followInputScreens:true});
  const sales=page.locator('#sf_売上'),save=page.locator('#salesSaveBtn'),selector=page.locator('#storeSel');
  const peer='fictional-second-shop';
  await page.evaluate(()=>{renderStoreSel();});
  await sales.click();
  await sales.fill('891');
  await page.evaluate(()=>{
    window.storeDecisions=[];
    window.approveStoreSwitch=false;
    window.confirm=message=>{storeDecisions.push(message);return approveStoreSwitch;};
  });
  await selector.selectOption(peer);
  await expect(selector).toHaveValue(seed.active);
  await expect(sales).toHaveValue('891');
  expect(await page.evaluate(()=>storeDecisions)).toEqual(['未保存の入力があります。\n保存せずに店舗を切り替えますか？']);
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().then(value=>value.revision))).toBe(0);

  await page.evaluate(()=>{
    window.approveStoreSwitch=true;
    const digest=crypto.subtle.digest,resume=[];
    window.storeSwitchDigests=resume;
    crypto.subtle.digest=async function(...args){
      await new Promise(resolve=>resume.push(resolve));
      return digest.apply(this,args);
    };
    window.resumeStoreSwitch=()=>{
      crypto.subtle.digest=digest;
      resume.forEach(resolve=>resolve());
    };
  });
  await selector.selectOption(peer);
  await page.waitForFunction(()=>storeSwitchDigests.length===2);
  await expect(selector).toHaveValue(seed.active);
  await expect(save).toBeDisabled();
  expect(await page.evaluate(()=>allStores.current)).toBe(seed.active);
  expect(await page.evaluate(()=>switchStore('fictional-second-shop'))).toBe(false);
  expect(await page.evaluate(()=>gotoNav(3))).toBe(false);
  expect(await page.evaluate(()=>showStoreMenu())).toBe(false);
  expect(await page.evaluate(()=>document.body.inert)).toBe(true);
  expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
    .toEqual({state:'ACTIVE',hasUnsavedInput:true});
  await page.evaluate(()=>resumeStoreSwitch());
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveValue(peer);
  await expect(page.locator('#storeSel + [role=status]')).toBeEmpty();
  expect(await page.evaluate(()=>storeDecisions.length)).toBe(2);
  const expected=JSON.parse(seed.raw);
  expected.current=peer;
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:1,snapshot:expected});

  const date=seed.year+'-'+String(Number.parseInt(seed.month)).padStart(2,'0')+'-'+String(seed.day).padStart(2,'0');
  await page.evaluate(date=>InsightInputDayNav.select('sales',date),date);
  await expect(sales).toHaveValue('42');
  await sales.click();
  await sales.fill('789');
  await save.click();
  await expect(page.locator('#salesSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedSales')).toHaveCount(0);
  expected.stores[peer].data[seed.year][seed.month][seed.day-1].売上=789;
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:2,snapshot:expected});

  await page.locator('#nav3').click();
  const customer=page.locator('.kyaku-input[data-ri="'+(seed.day-1)+'"]');
  await customer.click();
  await customer.fill('678');
  await page.locator('#kyakuSaveBtn').click();
  await expect(page.locator('#kyakuSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedKyaku')).toHaveCount(0);
  const peerRow=expected.stores[peer].data[seed.year][seed.month][seed.day-1];
  peerRow.客数=678;
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:3,snapshot:expected});

  await page.locator('#nav4').click();
  const categories=await page.evaluate(()=>HAIKI_CATS);
  const category=categories[0];
  const waste=page.locator('#haikiForm [data-hc="'+category+'"]');
  await page.evaluate(date=>InsightInputDayNav.select('haiki',date),date);
  await waste.click();
  await waste.fill('321');
  await page.locator('#haikiSaveBtn').click();
  await expect(page.locator('#haikiSaveBtn')).toBeEnabled();
  await expect(page.locator('#savedHaiki')).toHaveCount(0);
  peerRow.haiki={...peerRow.haiki,[category]:321};
  peerRow.廃棄金額=categories.reduce((sum,key)=>sum+Number(peerRow.haiki[key]??0),0);
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:4,snapshot:expected});

  await page.locator('#nav2').click();
  await page.evaluate(date=>InsightInputDayNav.select('sales',date),date);
  await expect(sales).toHaveValue('789');
  await sales.click();
  await sales.fill('999');
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(){
      IDBObjectStore.prototype.put=put;
      throw new DOMException('Fictional quota error','QuotaExceededError');
    };
  });
  await selector.selectOption(seed.active);
  await expect(page.locator('#storeSel + [role=status]'))
    .toHaveText('店舗切替の結果を確認できないため、追加の保存を停止しました。');
  await expect(selector).toHaveValue(peer);
  await expect(sales).toHaveValue('999');
  await expect(save).toBeDisabled();
  expect(await page.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
    .toMatchObject({state:'hold',observedRevision:4,recovery:'prior-save-verified'});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
});

async function openStoreSwitchPeer(context,origin=''){
  const peer=await context.newPage();
  await peer.route('**/store-switch-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional store switch peer</title>'
  }));
  await peer.goto(origin+'/store-switch-fixture');
  await peer.evaluate(()=>{window.SK='insight_v11';});
  await peer.addScriptTag({url:origin+'/insight_storage_v1.js'});
  await peer.addScriptTag({url:origin+'/insight_indexeddb_storage_v1.js'});
  return peer;
}

function readStoreSwitchRecord(page){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('insight-store-snapshots-v1',1);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const tx=db.transaction('snapshots','readonly');
      const get=tx.objectStore('snapshots').get('current');
      tx.oncomplete=()=>{db.close();resolve(get.result);};
      tx.onabort=()=>{db.close();reject(tx.error);};
    };
  }));
}

for(const overlap of ['previously saved','save in progress']){
  test('isolated store switch preserves both shops when a different tab has '+overlap,async({page,context})=>{
    const seed=await openMonthlySalesPreview(page,{followInputScreens:true});
    const other=await openStoreSwitchPeer(context);
    try{
      await page.evaluate(()=>{renderStoreSel();window.confirm=()=>true;});
      const expected=JSON.parse(seed.raw);
      expected.stores[seed.active].name='確定した店舗A';
      expected.stores['fictional-second-shop'].name='確定した店舗B';
      await other.evaluate(async hold=>{
        const api=InsightIndexedDBStorageV1;
        const current=await api.read();
        if(hold){
          const digest=crypto.subtle.digest,resume=[];
          window.peerSaveDigests=resume;
          crypto.subtle.digest=async function(...args){
            await new Promise(resolve=>resume.push(resolve));
            return digest.apply(this,args);
          };
          window.resumePeerSave=()=>{
            crypto.subtle.digest=digest;
            resume.forEach(resolve=>resolve());
          };
        }
        current.snapshot.stores[current.snapshot.current].name='確定した店舗A';
        current.snapshot.stores['fictional-second-shop'].name='確定した店舗B';
        window.peerWrite=api.save(current.revision,current.snapshot);
        if(!hold)await peerWrite;
      },overlap==='save in progress');
      if(overlap==='save in progress')await other.waitForFunction(()=>peerSaveDigests.length===2);

      const sales=page.locator('#sf_売上'),selector=page.locator('#storeSel');
      await sales.click();
      await sales.fill('875');
      await selector.selectOption('fictional-second-shop');
      await expect(page.locator('#storeSel + [role=status]'))
        .toHaveText('店舗切替の結果を確認できないため、追加の保存を停止しました。');
      await expect(selector).toHaveValue(seed.active);
      await expect(sales).toHaveValue('875');
      await expect(page.locator('#salesSaveBtn')).toBeDisabled();
      expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
        .toEqual({state:'HELD',hasUnsavedInput:true});
      expect(await page.evaluate(()=>gotoNav(3))).toBe(false);
      if(overlap==='save in progress'){
        await other.evaluate(async ()=>{resumePeerSave();await peerWrite;});
        expect(await other.evaluate(()=>InsightIndexedDBStorageV1.read()))
          .toEqual({revision:1,snapshot:expected});
      }else{
        expect(await other.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
          .toMatchObject({state:'hold',reason:'writing',observedRevision:1});
      }
      const record=await readStoreSwitchRecord(other);
      expect(record.revision).toBe(1);
      expect(JSON.parse(record.raw)).toEqual(expected);
      expect(record.previous).toMatchObject({revision:0});
      expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await other.close();}
  });
}

for(const failure of ['readback abort','acknowledgement lost','tab closed during readback']){
  test('isolated store switch leaves a recoverable committed snapshot after '+failure,async({page,context})=>{
    const seed=await openMonthlySalesPreview(page,{followInputScreens:true});
    const other=await openStoreSwitchPeer(context);
    try{
      await page.evaluate(failure=>{
        renderStoreSel();
        window.confirm=()=>true;
        const write=InsightStorage.writeMetadata;
        let writing=false;
        InsightStorage.writeMetadata=(key,value)=>{
          if(key==='insight_indexeddb_adoption_v1'){
            const state=JSON.parse(value).state;
            if(state==='writing')writing=true;
            if(writing&&state==='active'&&failure==='acknowledgement lost')
              throw new Error('Fictional store switch acknowledgement lost');
          }
          return write(key,value);
        };
        if(failure==='acknowledgement lost')return;
        const get=IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get=function(...args){
          const request=get.apply(this,args);
          const tx=this.transaction;
          if(writing&&tx.mode==='readonly'&&tx.db.name==='insight-store-snapshots-v1'){
            IDBObjectStore.prototype.get=get;
            if(failure==='readback abort'){
              request.addEventListener('success',()=>tx.abort());
            }else{
              const oncomplete=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
              Object.defineProperty(tx,'oncomplete',{
                set(){oncomplete.set.call(this,()=>{window.storeReadbackPaused=true;});}
              });
            }
          }
          return request;
        };
      },failure);

      const sales=page.locator('#sf_売上'),selector=page.locator('#storeSel');
      await sales.click();
      await sales.fill('876');
      await selector.selectOption('fictional-second-shop');
      if(failure==='tab closed during readback'){
        await page.waitForFunction(()=>window.storeReadbackPaused===true);
        await expect(page.locator('#storeSel + [role=status]')).toBeEmpty();
        await expect(selector).toBeDisabled();
        expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
          .toEqual({state:'ACTIVE',hasUnsavedInput:true});
      }else{
        await expect(page.locator('#storeSel + [role=status]'))
          .toHaveText('店舗切替の結果を確認できないため、追加の保存を停止しました。');
        expect(await page.evaluate(()=>fixtureSalesPreview.getStatus()))
          .toEqual({state:'HELD',hasUnsavedInput:true});
      }
      await expect(selector).toHaveValue(seed.active);
      await expect(sales).toHaveValue('876');
      await expect(page.locator('#salesSaveBtn')).toBeDisabled();
      const closed=failure==='tab closed during readback';
      if(closed)await page.close();

      await expect.poll(()=>other.evaluate(async closed=>{
        try{return await InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true});}
        catch(error){
          // Chromium can finish closing the page before releasing its Web Lock.
          if(closed&&error.message==='Another Insight operation is in progress')return {state:'lock-busy'};
          throw error;
        }
      },closed),{timeout:10000})
        .toMatchObject({state:'hold',reason:'writing',observedRevision:1,recovery:'save-verified'});
      const expected=JSON.parse(seed.raw);
      expected.current='fictional-second-shop';
      const record=await readStoreSwitchRecord(other);
      expect(record.revision).toBe(1);
      expect(JSON.parse(record.raw)).toEqual(expected);
      expect(record.previous).toMatchObject({revision:0});
      expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await other.close();}
  });
}

async function openQuickInputPreview(page,{sameMunicipality=true,followMonthlyInputs=false,seedCounts=false,
  seedHours=false,seedDailyClear=false,seedYearBoundary=false,seedManagement=false,manageStoresAndYears=false,seedCSV=false,seedBulk=false,useRealBackupAfterMigration=false,connectQuick=true}={}){
  await routeMigrationPage(page);
  await page.goto('/Index.html');
  await waitForMigrationChecks(page);
  await page.addScriptTag({url:'/insight_indexeddb_storage_v1.js'});
  await page.addScriptTag({url:'/insight_indexeddb_quick_input_preview_v1.js'});
  if(followMonthlyInputs){
    await page.waitForFunction(()=>typeof InsightHourlyCustomers?.connectIndexedDBPreview==='function');
    if(manageStoresAndYears)await page.waitForSelector('#insightSettingsYearSection',{state:'attached'});
    await page.addScriptTag({url:'/insight_indexeddb_sales_input_preview_v1.js'});
  }
  return page.evaluate(async ({sameMunicipality,followMonthlyInputs,seedCounts,seedHours,seedDailyClear,seedYearBoundary,seedManagement,manageStoresAndYears,seedCSV,seedBulk,useRealBackupAfterMigration,connectQuick})=>{
    const year=String(Number(todayFY().fy)-1),month='6月',day=12;
    const iso=year+'-06-12',active=allStores.current,peer='fictional-quick-peer';
    store.data[year]=blankYearData(year);
    store.years=[...new Set([...store.years,year])].sort();
    store.weatherLocation={name:'架空市',admin1:'架空県'};
    const row=store.data[year][month][day-1];
    Object.assign(row,{売上:47,客数:62,買上点数:2.5,storeMemo:'架空の元メモ',weather:'曇',
      tempMaxC:21,tempMinC:9,stockout:{fictional:1}});
    allStores.stores[peer]=JSON.parse(JSON.stringify(store));
    const second=allStores.stores[peer];
    second.name='架空の別店舗';
    second.weatherLocation.name=sameMunicipality?'架空市':'別の架空市';
    Object.assign(second.data[year][month][day-1],{売上:87,客数:69,storeMemo:'別店舗の元メモ',
      tempMaxC:18,tempMinC:8});
    const [countCategory,otherCategory]=allStores.salesCountManagement.categories;
    if(seedHours){
      const hours=Array(24).fill(null);hours[0]=35;
      store.hourlyCustomers={[year+'-06-11']:hours};
      second.hourlyCustomers={[iso]:hours};
    }
    if(seedCounts){
      store.data[year]['5月'][0].客数=41;
      store.data[year]['6月'][0].客数=83;
      second.data[year]['6月'][0].客数=81;
      countCategory.activeTrips=[true,false,true];
      const count={trips:[{delivery:8,sales:6},{delivery:22,sales:20},{delivery:3,sales:1}]};
      const waste={trips:[2,2,2]};
      for(const date of [iso,year+'-05-12',String(Number(year)+1)+'-06-12']){
        store.salesCounts[date]={[countCategory.id]:count,[otherCategory.id]:count};
        store.wasteCounts??={};
        store.wasteCounts[date]={[countCategory.id]:waste,[otherCategory.id]:waste};
      }
      second.salesCounts[iso]={[countCategory.id]:count};
    }
    if(seedDailyClear){
      const values={廃棄金額:14,haiki:{...blankHaiki(),[HAIKI_CATS[0]]:14}};
      Object.assign(row,values);
      Object.assign(store.data[year][month][day-2],values);
      Object.assign(second.data[year][month][day-1],values);
      Object.assign(store.data[todayFY().fy][month][day-1],values);
      store.hourlyCustomers[iso]=Array(24).fill(12);
    }
    if(seedYearBoundary){
      const previous=String(Number(year)-1);
      store.data[previous]=blankYearData(previous);
      store.years=[...store.years,previous].sort();
      store.data[previous]['12月'][30].売上=71;
      store.data[year]['1月'][0].売上=81;
    }
    if(seedManagement){
      allStores.sharedWeather={...allStores.sharedWeather,[wxKey(year,month,day+1)]:'雨'};
      store.monthlyOps={[year]:{'6月':{laborK:14}}};
      store.events=[{id:'fictional-management-event',type:'nearby',scope:'store',startDate:iso,endDate:iso,
        snapshot:{version:1,title:'架空の催事',note:'',location:'架空の会場'}}];
    }
    if(seedBulk){
      for(const [shop,latitude] of [[store,35.1],[second,36.2]]){
        Object.assign(shop.weatherLocation,{latitude,longitude:136.8,timezone:'Asia/Tokyo'});
        for(const months of Object.values(shop.data)){
          for(const rows of Object.values(months)){
            for(const day of rows)Object.assign(day,{weather:'晴',tempMaxC:21,tempMinC:0});
          }
        }
      }
      delete store.data[year]['6月'][day-1].tempMaxC;
      store.data[year]['7月'][0].weather='';
      delete second.data[year]['5月'][0].tempMinC;
    }
    if(seedCSV){
      store.data[String(Number(year)-2)]={'1月':[{...blankRow(1),売上:55,storeMemo:'架空の既存実績'}]};
    }
    renderStoreSel();
    InsightDateContext.setSelectedDate(InsightDateContext.parseIso(iso));
    renderQuickNav();
    renderQuickPage();
    const raw=InsightStorage.writeSnapshot(allStores);
    const realBackup=window.InsightMigrationBackupV1;
    window.InsightMigrationBackupV1={verify(){},assertReady(){},confirm:async()=>true};
    await InsightIndexedDBStorageV1.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:new Blob(['fictional-test-backup']),password:'Fixture123'})});
    if(useRealBackupAfterMigration)window.InsightMigrationBackupV1=realBackup;
    if(followMonthlyInputs){
      window.combinedPreview=await InsightIndexedDBSalesInputPreviewV1.connect('sales',{
        followInputScreens:true,followQuickInput:true,manageStoresAndYears
      });
    }else if(connectQuick)window.quickPreview=await InsightIndexedDBQuickInputPreviewV1.connect();
    return {year,month,day,iso,active,peer,raw,category:HAIKI_CATS[0],countCategory:countCategory.id,otherCategory:otherCategory.id};
  },{sameMunicipality,followMonthlyInputs,seedCounts,seedHours,seedDailyClear,seedYearBoundary,seedManagement,manageStoresAndYears,seedCSV,seedBulk,useRealBackupAfterMigration,connectQuick});
}

async function editQuickInput(page,category){
  await page.locator('#qi_売上').fill('456');
  await page.locator('#qi_客数').fill('222');
  await page.locator('#qi_買上点数').fill('3.125');
  await page.locator('[id="qi_h_'+category+'"]').fill('123');
  await page.locator('#qi_storeMemo').fill('架空の入力メモ');
  await page.locator('#qi_tempMaxC').fill('23.75');
  await page.locator('#qi_tempMinC').fill('');
  await page.locator('#qWeatherCompactTrigger').click();
  await page.locator('#qWeatherCompactMenu [data-wx="雨"]').click();
}

function quickExpectedSnapshot(seed,sameMunicipality){
  const expected=JSON.parse(seed.raw);
  const row=expected.stores[seed.active].data[seed.year][seed.month][seed.day-1];
  Object.assign(row,{売上:456,客数:222,買上点数:3.125,廃棄金額:123,storeMemo:'架空の入力メモ',weather:'雨',
    tempMaxC:23.75});
  row.haiki[seed.category]=123;
  delete row.tempMinC;
  const peer=expected.stores[seed.peer].data[seed.year][seed.month][seed.day-1];
  peer.weather='雨';
  if(sameMunicipality){
    peer.tempMaxC=23.75;
    delete peer.tempMinC;
  }
  expected.sharedWeather??={};
  expected.sharedWeather={...expected.sharedWeather,[seed.year+'-'+seed.month+'-'+seed.day]:'雨'};
  return expected;
}

for(const sameMunicipality of [true,false]){
  test('isolated Quick input commits one day and respects '+(sameMunicipality?'shared':'different')+
    ' municipality temperatures',async({page})=>{
    const seed=await openQuickInputPreview(page,{sameMunicipality});
    const button=page.locator('#quickSaveBtn'),status=page.locator('#quickSaveBtn + [role=status]');
    const memo=page.locator('#qi_storeMemo');
    await editQuickInput(page,seed.category);
    await page.evaluate(()=>{
      window.quickDiscardPrompts=[];
      window.confirm=message=>{quickDiscardPrompts.push(message);return false;};
    });
    await page.locator('#iqdPrev').click();
    await expect(page.locator('#iqdDateInput')).toHaveValue(seed.iso);
    await expect(memo).toHaveValue('架空の入力メモ');
    expect(await page.evaluate(()=>quickDiscardPrompts)).toEqual([
      '未保存の入力があります。\n保存せずに別の日付へ移動しますか？'
    ]);

    await page.locator('#iqdDateInput').fill(String(Number(seed.year)-30)+'-06-12');
    await expect(page.locator('#iqdDateInput')).toHaveValue(seed.iso);
    await expect(status).toHaveText('試験用の保存は登録済み年度の当日・過去日に限ります。');
    await page.locator('#quickClearBtn').click();
    await page.locator('#autoWxBtn').click();
    await page.locator('#storeSel').selectOption(seed.peer);
    await expect(page.locator('#storeSel')).toHaveValue(seed.active);
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toEqual({revision:0,snapshot:JSON.parse(seed.raw)});
    await expect(memo).toHaveValue('架空の入力メモ');

    await page.locator('#qi_客数').fill('9007199254740992');
    await expect(page.locator('#qi_客数')).toHaveValue('9007199254740992');
    await button.click();
    await expect(status).toHaveText('売上・客数・買上点数・廃棄の入力を確認してください。');
    await page.locator('#qi_客数').fill('222');
    await page.locator('#qi_tempMinC').fill('30');
    await button.click();
    await expect(status).toHaveText('最高気温は最低気温以上になるように入力してください。');
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read())).toMatchObject({revision:0});
    await page.locator('#qi_tempMinC').fill('');

    await page.evaluate(()=>{
      const digest=crypto.subtle.digest,resume=[];
      window.quickSaveDigests=resume;
      crypto.subtle.digest=async function(...args){
        await new Promise(resolve=>resume.push(resolve));
        return digest.apply(this,args);
      };
      window.resumeQuickSave=()=>{
        crypto.subtle.digest=digest;
        resume.forEach(resolve=>resolve());
      };
    });
    await button.click();
    await page.waitForFunction(()=>quickSaveDigests.length===2);
    await expect(button).toBeDisabled();
    await expect(button).not.toHaveClass(/is-saved-feedback/);
    await expect(status).toBeEmpty();
    expect(await page.evaluate(()=>InsightQuickSaveObserverV0.getStatus()))
      .toMatchObject({scope:'quick-save-including-indexeddb-preview',state:'ACTIVE',activeCount:1});
    expect(await page.evaluate(()=>gotoNav(1))).toBe(false);
    expect(await page.evaluate(()=>clearTodayData())).toBe(false);
    await page.evaluate(()=>{
      document.getElementById('iqdPrev').click();
      resumeQuickSave();
    });

    await expect(page.locator('#quickSaveBtn')).toBeEnabled();
    await expect(page.locator('#quickSaveBtn')).toHaveText('保存する');
    await expect(page.locator('#quickSaveBtn + [role=status]')).toBeEmpty();
    await expect(page.locator('#iqdDateInput')).toHaveValue(seed.iso);
    expect(await page.evaluate(()=>quickPreview.getStatus())).toEqual({state:'IDLE_OBSERVED',hasUnsavedInput:false});
    expect(await quickInputBlocksUnload(page)).toBe(false);
    expect(await page.evaluate(()=>InsightQuickSaveObserverV0.getStatus())).toMatchObject({state:'IDLE_OBSERVED',activeCount:0});
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read()))
      .toEqual({revision:1,snapshot:quickExpectedSnapshot(seed,sameMunicipality)});
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
  });
}

for(const failure of ['stale revision','quota error','readback aborted','changed input','date mismatch before saving']){
  test('isolated Quick input retains the draft and stops on '+failure,async({page,context})=>{
    const seed=await openQuickInputPreview(page);
    const other=await openStoreSwitchPeer(context);
    try{
      await editQuickInput(page,seed.category);
      const expected=quickExpectedSnapshot(seed,true);
      if(failure==='stale revision'){
        await other.evaluate(async peer=>{
          const api=InsightIndexedDBStorageV1,current=await api.read();
          current.snapshot.stores[peer].name='別タブで確定した名称';
          await api.save(current.revision,current.snapshot);
        },seed.peer);
      }
      await page.evaluate(failure=>{
        if(failure==='date mismatch before saving'){
          const date=InsightDateContext.getSelectedDate();
          date.setDate(date.getDate()+1);
          InsightDateContext.setSelectedDate(date);
        }
        if(failure==='quota error'){
          const put=IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put=function(){
            IDBObjectStore.prototype.put=put;
            throw new DOMException('Fictional quota error','QuotaExceededError');
          };
        }
        if(failure==='readback aborted'){
          const write=InsightStorage.writeMetadata,get=IDBObjectStore.prototype.get;
          let writing=false;
          InsightStorage.writeMetadata=(key,value)=>{
            if(key==='insight_indexeddb_adoption_v1'&&JSON.parse(value).state==='writing')writing=true;
            return write(key,value);
          };
          IDBObjectStore.prototype.get=function(...args){
            const request=get.apply(this,args);
            const tx=this.transaction;
            if(writing&&tx.mode==='readonly'&&tx.db.name==='insight-store-snapshots-v1'){
              IDBObjectStore.prototype.get=get;
              request.addEventListener('success',()=>tx.abort());
            }
            return request;
          };
        }
        if(failure==='changed input'){
          const digest=crypto.subtle.digest,resume=[];
          window.quickSaveDigests=resume;
          crypto.subtle.digest=async function(...args){
            await new Promise(resolve=>resume.push(resolve));
            return digest.apply(this,args);
          };
          window.resumeQuickSave=()=>{
            crypto.subtle.digest=digest;
            resume.forEach(resolve=>resolve());
          };
        }
      },failure);

      const button=page.locator('#quickSaveBtn'),status=page.locator('#quickSaveBtn + [role=status]');
      await button.click();
      if(failure==='changed input'){
        await page.waitForFunction(()=>quickSaveDigests.length===2);
        await page.evaluate(()=>{
          document.getElementById('qi_storeMemo').value='途中で変わった下書き';
          resumeQuickSave();
        });
      }
      await expect(status).toHaveText('保存結果を確認できないため、追加の保存を停止しました。');
      await expect(button).toBeDisabled();
      await expect(button).not.toHaveClass(/is-saved-feedback/);
      await expect(page.locator('#iqdDateInput')).toHaveValue(seed.iso);
      await expect(page.locator('#qi_売上')).toHaveValue('456');
      await expect(page.locator('#qi_storeMemo'))
        .toHaveValue(failure==='changed input'?'途中で変わった下書き':'架空の入力メモ');
      expect(await page.evaluate(()=>quickPreview.getStatus())).toEqual({state:'HELD',hasUnsavedInput:true});
      expect(await page.evaluate(()=>InsightQuickSaveObserverV0.getStatus())).toMatchObject({state:'HELD',activeCount:0});
      expect(await page.evaluate(()=>gotoNav(1))).toBe(false);
      expect(await page.evaluate(year=>store.data[year]['6月'][11].売上,seed.year)).toBe(47);

      const record=await readStoreSwitchRecord(other);
      if(failure==='stale revision'){
        const otherExpected=JSON.parse(seed.raw);
        otherExpected.stores[seed.peer].name='別タブで確定した名称';
        expect(record.revision).toBe(1);
        expect(JSON.parse(record.raw)).toEqual(otherExpected);
      }else if(failure==='quota error'||failure==='date mismatch before saving'){
        expect(record.revision).toBe(0);
        expect(JSON.parse(record.raw)).toEqual(JSON.parse(seed.raw));
      }else{
        expect(record.revision).toBe(1);
        expect(JSON.parse(record.raw)).toEqual(expected);
        expect(record.previous.revision).toBe(0);
        expect(JSON.parse(record.previous.raw)).toEqual(JSON.parse(seed.raw));
      }
      if(failure==='readback aborted'){
        expect(await other.evaluate(()=>InsightIndexedDBStorageV1.diagnose({verifyInterrupted:true})))
          .toMatchObject({state:'hold',observedRevision:1,recovery:'save-verified'});
      }
      expect(await other.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(seed.raw);
    }finally{await other.close();}
  });
}
