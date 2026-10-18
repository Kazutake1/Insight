const {test,expect}=require('@playwright/test');

async function openEditor(page,browserName){
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav0')).toBeVisible();
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  const editor=page.locator('dialog.ie-event-add');
  await editor.getByLabel('イベント種別').selectOption('nearby');
  return {editor,errors};
}

test('よく使うカテゴリが先頭で、通常は選択欄1つ・他カテゴリは展開時のみ表示',async({page,browserName})=>{
  const {editor,errors}=await openEditor(page,browserName);
  await page.evaluate(()=>{
    allStores.eventManagement=allStores.eventManagement||{version:1,events:[],presets:[]};
    allStores.eventManagement.demandCategories=[{id:'fav_ui_a',name:'お弁当'},{id:'fav_ui_b',name:'パン'}];
    for(let i=0;i<24;i++)allStores.salesCountManagement.categories.push({id:'ui_other_'+i,name:'大量カテゴリ'+i,activeTrips:[true,true,true]});
  });
  await editor.locator('.ie-demand-head-actions').getByRole('button',{name:'＋追加'}).click();
  const row=editor.locator('.ie-demand-row').first(),trigger=row.locator('.ie-demand-picker-trigger'),panel=row.locator('.ie-demand-picker-panel');
  await expect(trigger).toHaveText('未分類');
  await expect(row.locator('select[aria-label="カテゴリー"]')).toBeHidden();
  await expect(panel).toBeHidden();
  await trigger.click();
  await expect(panel.locator('.ie-demand-picker-heading')).toHaveText('よく使うカテゴリー');
  await expect(panel.locator('.ie-demand-picker-options').first().getByRole('button')).toHaveText(['お弁当','パン']);
  await expect(panel.locator('.ie-demand-picker-others')).toBeHidden();
  await panel.getByRole('button',{name:'お弁当',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveText('お弁当');
  await expect(row.locator('select[aria-label="カテゴリー"]')).toHaveValue('favorite:fav_ui_a');
  await trigger.click();
  await panel.getByRole('button',{name:/その他のカテゴリーを表示/}).click();
  await expect(panel.locator('.ie-demand-picker-others')).toBeVisible();
  await panel.getByRole('button',{name:'大量カテゴリ23',exact:true}).click();
  await expect(trigger).toHaveText('大量カテゴリ23');
  await expect(row.locator('select[aria-label="カテゴリー"]')).toHaveValue('master:ui_other_23');
  await trigger.click();
  await panel.getByRole('button',{name:'自由入力',exact:true}).click();
  await expect(row.getByLabel('独自カテゴリー名')).toBeVisible();
  await row.getByLabel('独自カテゴリー名').fill('限定商品');
  await row.getByLabel('名称',{exact:true}).fill('商品A');
  await editor.getByLabel('イベント名',{exact:true}).fill('E2EカテゴリUI');
  await editor.getByLabel('イベント場所',{exact:true}).fill('会場');
  await editor.getByRole('button',{name:'登録する'}).click();
  await expect(editor).toHaveCount(0);
  const saved=await page.evaluate(()=>{
    const event=allStores.stores[allStores.current].events.find(e=>e.snapshot.title==='E2EカテゴリUI');
    return event&&event.snapshot.specialDemand[0];
  });
  expect(saved.category).toBe('限定商品');expect(saved.categoryId).toBeUndefined();
  expect(errors).toEqual([]);
});

test('イベント・催事の指定説明文だけ削除され編集項目は残る',async({page,browserName})=>{
  const {editor,errors}=await openEditor(page,browserName);
  for(const type of ['nearby','special','other']){
    await editor.getByLabel('イベント種別').selectOption(type);
    for(const pattern of [/現在の店舗：/,/選ぶと名称・補足/,/カテゴリーを選択するか、自由に入力できます/,/チェックしたカテゴリーの実績だけ/]){
      await expect(editor.getByText(pattern)).toHaveCount(0);
    }
    if(type!=='other'){
      await expect(editor.locator('.ie-demand-head')).toBeVisible();
      await expect(editor.locator('.ie-result-category-options')).toBeVisible();
    }
  }
  await editor.getByRole('button',{name:'キャンセル'}).click();
  expect(errors).toEqual([]);
});
