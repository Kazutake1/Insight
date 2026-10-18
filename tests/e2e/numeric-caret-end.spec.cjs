const {test,expect}=require('@playwright/test');

async function openInsight(page,browserName){
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSalesCount')).toBeVisible();
  return errors;
}

async function checkTapAtLeftMovesCaretToRight(input,value){
  await input.fill(value);
  await expect(input).toHaveValue(value);
  await input.evaluate(element=>element.setSelectionRange(0,0));
  await input.click({position:{x:3,y:8}});
  const state=await input.evaluate(element=>({
    type:element.type,inputMode:element.inputMode,selectionStart:element.selectionStart,
    selectionEnd:element.selectionEnd,length:element.value.length,focused:document.activeElement===element
  }));
  expect(state).toMatchObject({type:'text',focused:true,selectionStart:value.length,selectionEnd:value.length,length:value.length});
  expect(['numeric','decimal']).toContain(state.inputMode);
  await input.evaluate(element=>element.blur());
}

test('販売数入力の納品・販売・廃棄は左側タップでもカーソルが数値末尾になる',async({page,browserName})=>{
  const errors=await openInsight(page,browserName);
  await page.locator('#navSalesCount').click();
  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  for(const [selector,value] of [['.sc-delivery-row','27'],['.sc-sales-row','45'],['.sc-waste-row','12']]){
    const input=card.locator(selector+' input[inputmode="numeric"]:not([readonly])').first();
    await checkTapAtLeftMovesCaretToRight(input,value);
  }
  const delivery=card.locator('.sc-delivery-row input[inputmode="numeric"]:not([readonly])').first();
  await delivery.fill('15x');
  await expect(delivery).not.toBeValid();
  await delivery.fill('027');
  await expect(delivery).toHaveValue('27');
  await expect(delivery).toBeValid();
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  const values=await page.evaluate(()=>{
    const p=InsightSalesCount.getPeriod(),key=String(p.year)+'-'+String(p.month).padStart(2,'0')+'-01';
    const store=allStores.stores[allStores.current],category=document.getElementById('scCategory').value;
    return {trips:store.salesCounts[key][category].trips,waste:store.wasteCounts[key][category].trips};
  });
  expect(values.trips[0].delivery).toBe(27);
  expect(values.trips[0].sales).toBe(45);
  expect(values.waste[0]).toBe(12);
  expect(errors).toEqual([]);
});

test('客数と特需商品の数量入力も左タップ時に末尾へ移動する',async({page,browserName})=>{
  const errors=await openInsight(page,browserName);
  await page.locator('#nav2').click();
  const visitor=page.locator('#kyakuGrid input.kyaku-input').first();
  await expect(visitor).toBeVisible();
  await checkTapAtLeftMovesCaretToRight(visitor,'125');

  await page.locator('#nav0').click();
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  const dialog=page.locator('dialog.ie-event-add');
  await dialog.getByLabel('イベント種別').selectOption('special');
  await dialog.locator('.ie-demand-head-actions').getByRole('button',{name:'＋追加'}).click();
  const row=dialog.locator('.ie-demand-row').first();
  await checkTapAtLeftMovesCaretToRight(row.getByLabel('用意数'),'37');
  await checkTapAtLeftMovesCaretToRight(row.getByLabel('販売数'),'25');
  await dialog.getByRole('button',{name:'キャンセル'}).click();
  expect(errors).toEqual([]);
});
