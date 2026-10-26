'use strict';
/* STEP4 P4d-10: browser-only observation of reviewed actual editor APIs.
 * A new Playwright browser context has no user's existing Insight data.
 * Never save, promote source completeness, wire an AI/model or publish.
 */
const {test,expect}=require('@playwright/test');

async function open(page){
  // Like existing WebKit tests: local HTTP cannot honor HTTPS-only upgrade.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())
      .replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav0')).toBeVisible();
  await page.waitForFunction(()=>window.InsightStorage?.reportState&&
    window.InsightSalesCount?.getForecastDraftStatus&&
    window.InsightQuickDaily?.getForecastDraftStatus&&
    window.InsightInputDayNav?.getForecastDraftStatus&&
    window.InsightHourlyCustomers?.getForecastDraftStatus&&
    window.InsightEvents?.getForecastDraftStatus);
  return errors;
}
async function status(page,key){
  return page.evaluate(key=>{
    const callbacks={
      sales_count:()=>window.InsightSalesCount.getForecastDraftStatus(),
      quick_daily:()=>window.InsightQuickDaily.getForecastDraftStatus(),
      daily_sales:()=>window.InsightInputDayNav.getForecastDraftStatus('sales'),
      daily_customers:()=>window.InsightInputDayNav.getForecastDraftStatus('kyaku'),
      daily_waste:()=>window.InsightInputDayNav.getForecastDraftStatus('haiki'),
      hourly_customers:()=>window.InsightHourlyCustomers.getForecastDraftStatus(),
      events_and_promotions:()=>window.InsightEvents.getForecastDraftStatus()
    };
    const v=callbacks[key]();
    // The test deliberately transfers ONLY the non-sensitive status fields.
    return {initialized:v.initialized,dirty:v.dirty,epoch:v.epoch,
      frozen:Object.isFrozen(v),keys:Object.keys(v).sort()};
  },key);
}
async function savedState(page){
  return page.evaluate(()=>({
    raw:localStorage.getItem('insight_v11'),
    report:window.InsightStorage.reportState()
  }));
}
function assertNonAuthorizingShape(s){
  expect(s.frozen).toBe(true);
  expect(s.keys).toEqual(['dirty','epoch','initialized']);
  expect(typeof s.initialized).toBe('boolean');
  expect(s.dirty===null||typeof s.dirty==='boolean').toBe(true);
  expect(s.epoch===null||Number.isSafeInteger(s.epoch)).toBe(true);
}

test('P4d10 B01: real browser loads all seven draft status APIs without reading actual records',async({page})=>{
  const errors=await open(page);
  const before=await savedState(page);
  for(const key of ['sales_count','quick_daily','daily_sales','daily_customers',
    'daily_waste','hourly_customers','events_and_promotions']){
    assertNonAuthorizingShape(await status(page,key));
  }
  const after=await savedState(page);
  expect(after.raw).toBe(before.raw);
  expect(after.report.revision).toBe(before.report.revision);
  expect(after.report.pending).toBe(0);
  expect(errors).toEqual([]);
});

test('P4d10 B02: actual QuickDaily numeric input is observed DIRTY without saving',async({page})=>{
  const errors=await open(page);
  await page.locator('#nav0').click();
  await expect(page.locator('#pageQuick')).toHaveClass(/show/);
  const before=await savedState(page);
  const input=page.locator('#qi_売上');
  await expect(input).toBeVisible();
  await input.fill('42');
  const s=await status(page,'quick_daily');
  assertNonAuthorizingShape(s);
  expect(s.initialized).toBe(true);
  expect(s.dirty).toBe(true);
  const after=await savedState(page);
  expect(after.raw).toBe(before.raw);
  expect(after.report.revision).toBe(before.report.revision);
  expect(errors).toEqual([]);
});

test('P4d10 B03: sales-count real numeric edit is observed DIRTY without saving',async({page})=>{
  const errors=await open(page);
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);
  const input=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
  await expect(input).toBeVisible();
  const before=await savedState(page);
  await input.fill('42');
  const s=await status(page,'sales_count');
  assertNonAuthorizingShape(s);
  expect(s.initialized).toBe(true);
  expect(s.dirty).toBe(true);
  const after=await savedState(page);
  expect(after.raw).toBe(before.raw);
  expect(after.report.revision).toBe(before.report.revision);
  expect(errors).toEqual([]);
});

test('P4d10 B04: real event editor DIRTY is lost on close, never certified CLEAN',async({page})=>{
  const errors=await open(page);
  await page.locator('#nav0').click();
  const before=await savedState(page);
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  const dialog=page.locator('.ie-dialog.ie-event-add');
  await expect(dialog).toBeVisible();
  // The initial sale form does not show the general event-name field.
  await dialog.getByLabel('イベント種別').selectOption('nearby');
  await dialog.getByLabel('イベント名',{exact:true}).fill('架空の未保存イベント');
  const dirty=await status(page,'events_and_promotions');
  assertNonAuthorizingShape(dirty);
  expect(dirty.initialized).toBe(true);
  expect(dirty.dirty).toBe(true);
  await dialog.getByRole('button',{name:'閉じる'}).click();
  await expect(dialog).toHaveCount(0);
  const closed=await status(page,'events_and_promotions');
  assertNonAuthorizingShape(closed);
  expect(closed.initialized).toBe(false);
  expect(closed.dirty).toBe(null);
  const after=await savedState(page);
  expect(after.raw).toBe(before.raw);
  expect(after.report.revision).toBe(before.report.revision);
  expect(errors).toEqual([]);
});


/* P4d-11: Four additional REAL editor user-input paths. New independent
 * Playwright browser contexts contain only app fixture data. The traffic
 * fence allows localhost and the pinned Chart.js CDN needed for bootstrap,
 * and rejects every other external HTTP(S) request. This is NOT offline
 * mode and not an assertion of zero remote traffic.
 */
async function installDataApiFence(page){
  const rejected=[];
  const chartScript='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  await page.route('**/*',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    if(url.protocol!=='http:'&&url.protocol!=='https:'){
      await route.abort('blockedbyclient');return;
    }
    if(url.hostname==='127.0.0.1'||url.hostname==='localhost'){
      await route.continue();return;
    }
    if(url.href===chartScript&&request.method()==='GET'){
      await route.continue();return;
    }
    rejected.push(url.origin);
    await route.abort('blockedbyclient');
  });
  return ()=>rejected.slice();
}
async function captureLocalStorageBaseline(page){
  await page.evaluate(()=>{
    // Never return raw bytes to the Node test runner, even for fake data.
    window.__p4d11Witness={
      raw:localStorage.getItem('insight_v11'),
      revision:window.InsightStorage.reportState().revision
    };
  });
}
async function assertLocalNoSave(page){
  const witness=await page.evaluate(()=>{
    const state=window.InsightStorage.reportState();
    return {
      sameRaw:localStorage.getItem('insight_v11')===window.__p4d11Witness.raw,
      sameRevision:state.revision===window.__p4d11Witness.revision,
      pending:state.pending
    };
  });
  expect(witness).toEqual({sameRaw:true,sameRevision:true,pending:0});
}
async function assertPositiveLocalDirty(page,key,baselineEpoch){
  const result=await status(page,key);
  assertNonAuthorizingShape(result);
  expect(result.initialized).toBe(true);
  expect(result.dirty).toBe(true);
  expect(Number.isSafeInteger(result.epoch)).toBe(true);
  if(Number.isSafeInteger(baselineEpoch))expect(result.epoch).toBeGreaterThan(baselineEpoch);
}

test('P4d11 B05: real sales input sets positive DIRTY without a Storage save',async({page})=>{
  const rejected=await installDataApiFence(page);
  const errors=await open(page);
  await page.locator('#nav2').click();
  await expect(page.locator('#pageSales')).toHaveClass(/show/);
  const input=page.locator('#salesForm input[data-k="売上"]').first();
  await expect(input).toBeVisible();
  const prior=await status(page,'daily_sales');
  await captureLocalStorageBaseline(page);
  await input.fill('42');
  await assertPositiveLocalDirty(page,'daily_sales',prior.epoch);
  await assertLocalNoSave(page);
  expect(rejected().every(origin=>origin!=='https://cdnjs.cloudflare.com')).toBe(true);
  expect(errors).toEqual([]);
});

test('P4d11 B06: real daily customers input sets positive DIRTY without save',async({page})=>{
  const rejected=await installDataApiFence(page);
  const errors=await open(page);
  await page.locator('#nav3').click();
  await expect(page.locator('#pageKyaku')).toHaveClass(/show/);
  const input=page.locator('#kyakuGrid input.kyaku-input').first();
  await expect(input).toBeVisible();
  const prior=await status(page,'daily_customers');
  await captureLocalStorageBaseline(page);
  await input.fill('42');
  await assertPositiveLocalDirty(page,'daily_customers',prior.epoch);
  await assertLocalNoSave(page);
  expect(rejected().every(origin=>origin!=='https://cdnjs.cloudflare.com')).toBe(true);
  expect(errors).toEqual([]);
});

test('P4d11 B07: real waste amount edit sets positive DIRTY without save',async({page})=>{
  const rejected=await installDataApiFence(page);
  const errors=await open(page);
  await page.locator('#nav4').click();
  await expect(page.locator('#pageHaiki')).toHaveClass(/show/);
  const input=page.locator('#haikiForm input[data-hc]').first();
  await expect(input).toBeVisible();
  const prior=await status(page,'daily_waste');
  await captureLocalStorageBaseline(page);
  await input.fill('42');
  await assertPositiveLocalDirty(page,'daily_waste',prior.epoch);
  await assertLocalNoSave(page);
  expect(rejected().every(origin=>origin!=='https://cdnjs.cloudflare.com')).toBe(true);
  expect(errors).toEqual([]);
});

test('P4d11 B08: real hourly dialog edit is DIRTY and discard returns local idle',async({page})=>{
  const rejected=await installDataApiFence(page);
  const errors=await open(page);
  await page.locator('#nav0').click();
  await expect(page.locator('#pageQuick')).toHaveClass(/show/);
  const opener=page.locator('#hourlyCustomersQuick .hourly-quick-button');
  await expect(opener).toBeVisible();
  await captureLocalStorageBaseline(page);
  await opener.click();
  const dialog=page.locator('dialog.hourly-dialog');
  await expect(dialog).toBeVisible();
  const opened=await status(page,'hourly_customers');
  assertNonAuthorizingShape(opened);
  // This local editor can report false while open; it is not full-app CLEAN.
  expect(opened.initialized).toBe(true);
  expect(opened.dirty).toBe(false);
  await dialog.locator('input[data-hour="0"]').fill('42');
  await assertPositiveLocalDirty(page,'hourly_customers',opened.epoch);
  await dialog.getByRole('button',{name:'閉じる'}).click();
  await expect(dialog).toHaveCount(0);
  const closed=await status(page,'hourly_customers');
  assertNonAuthorizingShape(closed);
  expect(closed.dirty).toBe(false);
  await assertLocalNoSave(page);
  expect(rejected().every(origin=>origin!=='https://cdnjs.cloudflare.com')).toBe(true);
  expect(errors).toEqual([]);
});
