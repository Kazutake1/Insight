const {test,expect}=require('@playwright/test');

async function openEditor(page,browserName){
  if(browserName==='webkit')await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav0')).toBeVisible();
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  return page.locator('.ie-dialog.ie-event-add');
}

test('イベント基本情報は横向き2列・狭い画面1列で、種別切替後も日付を保持する',async({page,browserName})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const dialog=await openEditor(page,browserName);
  await dialog.getByLabel('開始日',{exact:true}).fill('2026-11-14');
  await dialog.getByLabel('終了日',{exact:true}).fill('2026-11-16');
  await dialog.getByLabel('イベント種別').selectOption('nearby');
  const basic=dialog.locator('.ie-event-basic');
  await expect(basic).toBeVisible();
  await expect(basic.getByLabel('イベント名',{exact:true})).toBeVisible();
  await expect(basic.getByLabel('イベント場所',{exact:true})).toBeVisible();
  const desktop=await basic.evaluate(node=>{
    const bounds=el=>el.getBoundingClientRect();
    const name=bounds(node.querySelector('input[aria-label="イベント名"]'));
    const place=bounds(node.querySelector('input[aria-label="イベント場所"]'));
    const dates=bounds(node.querySelector('.ie-dates'));
    return {sameRow:Math.abs(name.top-place.top)<2,placeRight:place.left>name.right,datesBelow:dates.top>name.bottom,
      overflow:node.scrollWidth-node.clientWidth};
  });
  expect(desktop.sameRow).toBe(true);
  expect(desktop.placeRight).toBe(true);
  expect(desktop.datesBelow).toBe(true);
  expect(desktop.overflow).toBeLessThanOrEqual(1);
  const aligned=await dialog.evaluate(node=>{
    const presets=node.querySelector('.ie-presets').getBoundingClientRect();
    const fields=node.querySelector('.ie-event-basic').getBoundingClientRect();
    const place=node.querySelector('.ie-event-basic-place').getBoundingClientRect();
    const addLocation=node.querySelector('.ie-location-editor > button').getBoundingClientRect();
    return {presetGap:fields.top-presets.bottom,locationRight:Math.abs(addLocation.right-place.right)};
  });
  expect(aligned.presetGap).toBeGreaterThanOrEqual(15);
  expect(aligned.locationRight).toBeLessThanOrEqual(1);
  await dialog.locator('.ie-demand-head-actions').getByRole('button',{name:'＋追加'}).click();
  const demandGap=await dialog.evaluate(node=>{
    const head=node.querySelector('.ie-demand-head').getBoundingClientRect();
    const row=node.querySelector('.ie-demand-row').getBoundingClientRect();
    return row.top-head.bottom;
  });
  expect(demandGap).toBeGreaterThanOrEqual(11);
  await basic.getByRole('button',{name:'＋場所を追加'}).click();
  await expect(basic.getByLabel('イベント場所')).toHaveCount(2);
  await dialog.getByLabel('イベント種別').selectOption('special');
  await expect(dialog.getByLabel('開始日',{exact:true})).toHaveValue('2026-11-14');
  await expect(dialog.getByLabel('終了日',{exact:true})).toHaveValue('2026-11-16');
  await dialog.getByLabel('イベント種別').selectOption('nearby');
  await page.setViewportSize({width:460,height:850});
  const narrow=await dialog.locator('.ie-event-basic').evaluate(node=>{
    const n=node.querySelector('input[aria-label="イベント名"]').getBoundingClientRect();
    const p=node.querySelector('input[aria-label="イベント場所"]').getBoundingClientRect();
    return {stacked:p.top>=n.bottom,overflow:node.scrollWidth-node.clientWidth};
  });
  expect(narrow.stacked).toBe(true);
  expect(narrow.overflow).toBeLessThanOrEqual(1);
  await dialog.getByRole('button',{name:'閉じる'}).click();
  expect(errors).toEqual([]);
});

test('カテゴリー実績は初期折りたたみ・選択件数表示・保存後復元を維持する',async({page,browserName})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const dialog=await openEditor(page,browserName);
  const master=await page.evaluate(()=>allStores.salesCountManagement.categories.filter(c=>!c.hidden).map(c=>({id:c.id,name:c.name})));
  expect(master.length).toBeGreaterThan(1);
  await dialog.getByLabel('イベント種別').selectOption('nearby');
  const details=dialog.locator('details.ie-result-category-options');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open',/.*/);
  await expect(details.locator('summary')).toContainText('すべて表示');
  await expect(details.getByRole('button',{name:'すべて解除'})).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('summary')).toContainText('閉じる（すべて選択中）');
  await details.getByRole('button',{name:'すべて解除'}).click();
  await expect(details.locator('summary')).toContainText('閉じる（0 / '+master.length+'件選択中）');
  await details.getByLabel('実績表示 '+master[0].name).check();
  await expect(details.locator('summary')).toContainText('閉じる（1 / '+master.length+'件選択中）');
  await details.locator('summary').click();
  await expect(details.locator('summary')).toContainText('1 / '+master.length+'件を表示');
  await expect(details).not.toHaveAttribute('open',/.*/);
  await dialog.getByLabel('イベント名',{exact:true}).fill('E2E登録フォーム折りたたみ確認');
  await dialog.getByLabel('イベント場所',{exact:true}).fill('E2Eレイアウト会場');
  await dialog.getByRole('button',{name:'登録する'}).click();
  await expect(dialog).toHaveCount(0);
  const saved=await page.evaluate(()=>{
    const event=allStores.stores[allStores.current].events.find(e=>e.snapshot&&e.snapshot.title==='E2E登録フォーム折りたたみ確認');
    return event&&{ids:event.snapshot.resultCategoryIds,location:event.snapshot.location};
  });
  expect(saved.ids).toEqual([master[0].id]);expect(saved.location).toBe('E2Eレイアウト会場');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav0')).toBeVisible();
  const chip=page.locator('#insightEvents .ie-chip').filter({hasText:'E2E登録フォーム折りたたみ確認'});
  await expect(chip).toHaveCount(1);
  await chip.locator('button.ie-edit').click();
  const restored=page.locator('.ie-dialog.ie-event-add details.ie-result-category-options');
  await expect(restored).not.toHaveAttribute('open',/.*/);
  await expect(restored.locator('summary')).toContainText('1 / '+master.length+'件を表示');
  await restored.locator('summary').click();
  await expect(restored.locator('summary')).toContainText('閉じる（1 / '+master.length+'件選択中）');
  await expect(restored.getByLabel('実績表示 '+master[0].name)).toBeChecked();
  await expect(restored.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await page.locator('.ie-event-add').getByRole('button',{name:'閉じる'}).click();
  expect(errors).toEqual([]);
});
