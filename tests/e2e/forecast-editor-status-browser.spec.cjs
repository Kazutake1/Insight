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
