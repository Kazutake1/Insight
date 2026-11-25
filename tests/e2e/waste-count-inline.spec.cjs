const {test,expect}=require('@playwright/test');
const {inflateSync}=require('node:zlib');

test('販売数入力の納品・販売・廃棄欄は先頭のゼロを除去し保存後も数値を維持する',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  const delivery=card.locator('.sc-delivery-row input').first();
  const sales=card.locator('.sc-sales-row input').first();
  const waste=card.locator('.sc-waste-row input').first();
  const blank=card.locator('.sc-delivery-row input').nth(1);
  const zeroWaste=card.locator('.sc-waste-row input').nth(1);

  await delivery.fill('00');
  await expect(delivery).toHaveValue('0');
  await sales.fill('010');
  await expect(sales).toHaveValue('10');
  await waste.fill('00025');
  await expect(waste).toHaveValue('25');
  await zeroWaste.fill('000');
  await expect(zeroWaste).toHaveValue('0');
  await blank.fill('00');
  await expect(blank).toHaveValue('0');
  await blank.fill('');
  await expect(blank).toHaveValue('');
  await expect(card.locator('.sc-total-delivery')).toHaveText('0');
  await expect(card.locator('.sc-total-sales')).toHaveText('10');
  await expect(card.locator('.sc-total-waste')).toHaveText('25※');

  const key=await page.evaluate(()=>{
    const period=InsightSalesCount.getPeriod();
    return {
      date:String(period.year)+'-'+String(period.month).padStart(2,'0')+'-01',
      categoryId:document.querySelector('#scCategory').value,
      storeId:allStores.current
    };
  });
  await expect(page.locator('#scSave')).toBeEnabled();
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  const saved=await page.evaluate(({date,categoryId,storeId})=>{
    const store=allStores.stores[storeId];
    return {
      delivery:store.salesCounts[date][categoryId].trips.map(v=>v.delivery),
      sales:store.salesCounts[date][categoryId].trips.map(v=>v.sales),
      waste:store.wasteCounts[date][categoryId].trips
    };
  },key);
  expect(saved.delivery).toEqual([0,null,null]);
  expect(saved.sales).toEqual([10,null,null]);
  expect(saved.waste).toEqual([25,0,null]);

  await page.reload();
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  const again=page.locator('#scCalendar .sc-day:not(.empty)').first();
  await expect(again.locator('.sc-delivery-row input').first()).toHaveValue('0');
  await expect(again.locator('.sc-delivery-row input').nth(1)).toHaveValue('');
  await expect(again.locator('.sc-sales-row input').first()).toHaveValue('10');
  await expect(again.locator('.sc-waste-row input').first()).toHaveValue('25');
  await expect(again.locator('.sc-waste-row input').nth(1)).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('納品・販売・廃棄を同じ日付カードから一括保存し再表示できる',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // ローカルHTTPでのWebKit/Chromium検証ではHTTPS強制だけを除外する。
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);

  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  await expect(card.locator('.sc-trip')).toHaveCount(3);
  await expect(card.locator('.sc-waste-row input')).toHaveCount(3);
  await expect(card.locator('.sc-total-waste')).toHaveText('—');
  await expect(card.locator('.sc-total-waste')).not.toHaveClass(/has-val/);
  await expect(page.locator('.sc-average-card .sc-waste-row')).toHaveCount(0);
  const initial=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {sales:JSON.stringify(store.salesCounts),daily:JSON.stringify(store.data),haiki:JSON.stringify(store.haikibudget||null)};
  });
  const key=await page.evaluate(()=>{
    const p=InsightSalesCount.getPeriod();
    return {date:String(p.year)+'-'+String(p.month).padStart(2,'0')+'-01',categoryId:document.getElementById('scCategory').value,storeId:allStores.current};
  });

  await card.locator('.sc-delivery-row input').first().fill('12');
  await card.locator('.sc-sales-row input').first().fill('8');
  await card.locator('.sc-waste-row input').first().fill('0');
  await card.locator('.sc-waste-row input').nth(1).fill('3');
  await expect(card.locator('.sc-total-waste')).toHaveText('3※');
  await expect(card.locator('.sc-total-waste')).toHaveClass(/has-val/);
  await page.evaluate(()=>{
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
  });
  // The input transitions its foreground for 150ms after entry and theme changes.
  await expect.poll(()=>card.locator('.sc-waste-row input').first()
    .evaluate(input=>getComputedStyle(input).color)).toBe('rgb(37, 99, 235)');
  const blue=await card.evaluate(node=>{
    const color=el=>getComputedStyle(el).color;
    return {
      zero:color(node.querySelector('.sc-waste-row input')),
      positive:color(node.querySelectorAll('.sc-waste-row input')[1]),
      total:color(node.querySelector('.sc-total-waste')),
      deliveryTotal:color(node.querySelector('.sc-total-delivery')),
      salesTotal:color(node.querySelector('.sc-total-sales')),
    };
  });
  expect(blue.zero).toBe('rgb(37, 99, 235)');
  expect(blue.positive).toBe(blue.zero);
  expect(blue.total).toBe(blue.zero);
  expect(blue.deliveryTotal).not.toBe(blue.total);
  expect(blue.salesTotal).not.toBe(blue.total);
  await expect(page.locator('#scSave')).toBeEnabled();
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();

  const saved=await page.evaluate(({storeId,date,categoryId})=>{
    const store=allStores.stores[storeId];
    return {daily:JSON.stringify(store.data),haiki:JSON.stringify(store.haikibudget||null),
      sale:store.salesCounts[date][categoryId].trips[0],
      waste:store.wasteCounts[date][categoryId].trips};
  },key);
  expect(saved.daily).toBe(initial.daily);
  expect(saved.haiki).toBe(initial.haiki);
  expect(saved.sale.delivery).toBe(12);
  expect(saved.sale.sales).toBe(8);
  expect(saved.waste).toEqual([0,3,null]);

  // 販売のみ再編集しても保存済み廃棄数は消えない。
  await card.locator('.sc-sales-row input').first().fill('9');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect(await page.evaluate(({storeId,date,categoryId})=>
    allStores.stores[storeId].wasteCounts[date][categoryId].trips,key)).toEqual([0,3,null]);

  await page.reload();
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#scCalendar .sc-waste-row input').first()).toHaveValue('0');
  await expect(page.locator('#scCalendar .sc-waste-row input').nth(1)).toHaveValue('3');
  expect(errors).toEqual([]);
});

test('11インチ相当の画面幅でカレンダーカードの3入力行が切れない',async({page})=>{
  await page.setViewportSize({width:1194,height:834});
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSalesCount').click();
  const geometry=await page.locator('#scCalendar').evaluate(grid=>{
    const card=grid.querySelector('.sc-day:not(.empty)');
    const total=card.querySelector('.sc-total-waste');
    const r=card.getBoundingClientRect(),t=total.getBoundingClientRect();
    return {height:r.height,visible:t.bottom<=r.bottom+1,scrollDiff:grid.scrollWidth-grid.clientWidth};
  });
  expect(geometry.height).toBeGreaterThanOrEqual(240);
  expect(geometry.visible).toBe(true);
  expect(geometry.scrollDiff).toBeLessThanOrEqual(3);
});


test('対象便を外すと過去日も廃棄は編集不可で保存済みの値は残る',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSalesCount').click();
  const key=await page.evaluate(()=>{
    const categoryId=document.getElementById('scCategory').value;
    const storeId=allStores.current,p=InsightSalesCount.getPeriod(),date=p.year+'-'+String(p.month).padStart(2,'0')+'-01';
    allStores.salesCountManagement.categories.find(c=>c.id===categoryId).activeTrips=[true,false,true];
    const store=allStores.stores[storeId];
    store.wasteCounts=store.wasteCounts||{};
    store.wasteCounts[date]=store.wasteCounts[date]||{};
    store.wasteCounts[date][categoryId]={trips:[null,4,null]};
    InsightSalesCount.reloadFromStore();
    return {storeId,categoryId,date};
  });
  const first=page.locator('#scCalendar .sc-day:not(.empty)').first();
  const second=first.locator('.sc-waste-row input').nth(1);
  await expect(second).toHaveValue('4');
  await expect(second).toHaveAttribute('readonly','');
  await expect(second).toHaveAttribute('aria-label',/保存済み・編集不可/);
  await expect(first.locator('.sc-delivery-row input').nth(1)).toHaveValue('／');
  await expect(first.locator('.sc-sales-row input').nth(1)).toHaveValue('／');
  await expect(first.locator('.sc-waste-row input').first()).toBeEditable();
  const next=page.locator('#scCalendar .sc-day:not(.empty)').nth(1).locator('.sc-waste-row input').nth(1);
  await expect(next).toHaveValue('／');
  await expect(next).toHaveAttribute('readonly','');
  await first.locator('.sc-waste-row input').first().fill('2');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect(await page.evaluate(({storeId,date,categoryId})=>
    allStores.stores[storeId].wasteCounts[date][categoryId].trips,key)).toEqual([2,4,null]);
  await page.evaluate(()=>{
    const id=document.getElementById('scCategory').value;
    allStores.salesCountManagement.categories.find(c=>c.id===id).activeTrips=[true,true,true];
    InsightSalesCount.reloadFromStore();
  });
  await expect(first.locator('.sc-waste-row input').nth(1)).toBeEditable();
  await expect(first.locator('.sc-waste-row input').nth(1)).toHaveValue('4');
});

test('保存後の廃棄入力編集履歴を消し、販売数だけの再保存で別の廃棄数を上書きしない',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');await page.locator('#navSalesCount').click();
  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  const key=await page.evaluate(()=>{
    const p=InsightSalesCount.getPeriod();
    return {date:p.year+'-'+String(p.month).padStart(2,'0')+'-01',storeId:allStores.current,categoryId:document.getElementById('scCategory').value};
  });
  await card.locator('.sc-waste-row input').first().fill('0');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  await page.evaluate(({date,storeId,categoryId})=>{
    allStores.stores[storeId].wasteCounts[date][categoryId].trips[1]=5;
    InsightStorage.writeSnapshot(allStores);
  },key);
  await card.locator('.sc-sales-row input').first().fill('7');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect(await page.evaluate(({date,storeId,categoryId})=>
    allStores.stores[storeId].wasteCounts[date][categoryId].trips,key)).toEqual([0,5,null]);
});


test('セール・イベント・発注予測が共有する読み取りカードは廃棄0と未入力を区別する',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await expect(page.locator('#navSalesCount')).toBeVisible();
  await page.locator('#navSalesCount').click();
  const before=await page.evaluate(()=>{
    const id=allStores.current,store=allStores.stores[id];
    return JSON.stringify(store.wasteCounts||{});
  });
  await page.evaluate(()=>{
    const category=allStores.salesCountManagement.categories.find(c=>!c.hidden);
    const date='2026-10-11',id=allStores.current,store=allStores.stores[id];
    store.wasteCounts=store.wasteCounts||{};
    store.wasteCounts[date]=store.wasteCounts[date]||{};
    store.wasteCounts[date][category.id]={trips:[null,0,3]};
    const raw=store.salesCounts&&store.salesCounts[date]&&store.salesCounts[date][category.id];
    const card=InsightSalesCount.createReadOnlyDayCard(date,raw,category,InsightSalesCount.wasteRecordAt(allStores,id,date,category.id));
    card.id='wasteReadOnlyE2E';document.body.append(card);
  });
  const card=page.locator('#wasteReadOnlyE2E');
  await expect(card.locator('.sc-waste-row input')).toHaveCount(3);
  await expect(card.locator('.sc-waste-row input').nth(0)).toHaveValue('');
  await expect(card.locator('.sc-waste-row input').nth(1)).toHaveValue('0');
  await expect(card.locator('.sc-waste-row input').nth(2)).toHaveValue('3');
  await expect(card.locator('.sc-total-waste')).toHaveText('3※');
  await expect(card.locator('.sc-total-waste')).toHaveAttribute('aria-label',/一部未入力/);
  await expect(page.locator('.sc-average-card .sc-waste-row')).toHaveCount(0);
  const original=await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].wasteCounts||{}));
  await page.locator('#navSaleResults').click();
  await expect(page.locator('#pageSaleResults')).toHaveClass(/show/);
  await page.locator('#navOrderForecast').click();
  await expect(page.locator('#pageOrderForecast')).toHaveClass(/show/);
  expect(await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].wasteCounts||{}))).toBe(original);
  expect(before).not.toBe(original);
});


test('カテゴリー管理で対象便を解除すると廃棄の入力も即座にロックされる',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSalesCount').click();
  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  const before=await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].wasteCounts||{}));
  await page.locator('#scManage').click();
  const dialog=page.locator('dialog.sc-dialog');
  await expect(dialog).toBeVisible();
  const row=dialog.locator('.sc-category-row').first();
  const second=row.locator('.sc-category-trips input[type=checkbox]').nth(1);
  await expect(second).toBeChecked();
  await second.uncheck();
  await dialog.locator('[data-save]').click();
  await expect(dialog).toHaveCount(0);
  for(const selector of ['.sc-delivery-row','.sc-sales-row','.sc-waste-row']){
    const input=card.locator(selector+' input').nth(1);
    await expect(input).toHaveValue('／');
    await expect(input).toHaveAttribute('readonly','');
  }
  await expect(card.locator('.sc-waste-row input').first()).toBeEditable();
  expect(await page.evaluate(()=>JSON.stringify(allStores.stores[allStores.current].wasteCounts||{}))).toBe(before);
});


test('対象便のチェック解除後も納品・販売・廃棄の保存済み数値を表示し編集不可にする',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSalesCount').click();
  const dates=page.locator('#scCalendar .sc-day:not(.empty)');
  const first=dates.nth(0),second=dates.nth(1),third=dates.nth(2);
  const key=await page.evaluate(()=>{
    const p=InsightSalesCount.getPeriod(),prefix=p.year+'-'+String(p.month).padStart(2,'0');
    return {storeId:allStores.current,categoryId:document.getElementById('scCategory').value,dates:[prefix+'-01',prefix+'-02']};
  });
  await first.locator('.sc-delivery-row input').nth(1).fill('12');
  await first.locator('.sc-sales-row input').nth(1).fill('0');
  await first.locator('.sc-waste-row input').nth(1).fill('4');
  await second.locator('.sc-delivery-row input').nth(1).fill('0');
  await second.locator('.sc-sales-row input').nth(1).fill('7');
  await second.locator('.sc-waste-row input').nth(1).fill('0');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  const saved=await page.evaluate(({storeId,categoryId,dates})=>{
    const store=allStores.stores[storeId];
    return dates.map(date=>({
      delivery:store.salesCounts[date][categoryId].trips[1].delivery,
      sales:store.salesCounts[date][categoryId].trips[1].sales,
      waste:store.wasteCounts[date][categoryId].trips[1]
    }));
  },key);
  expect(saved).toEqual([{delivery:12,sales:0,waste:4},{delivery:0,sales:7,waste:0}]);
  const manage=async(check)=>{
    await page.locator('#scManage').click();
    const dialog=page.locator('dialog.sc-dialog');
    const box=dialog.locator('.sc-category-row').first().locator('.sc-category-trips input[type=checkbox]').nth(1);
    if(check)await box.check();else await box.uncheck();
    await dialog.locator('[data-save]').click();
    await expect(dialog).toHaveCount(0);
  };
  await manage(false);
  for(const [day,values] of [[first,['12','0','4']],[second,['0','7','0']]]){
    for(const [i,selector] of ['.sc-delivery-row','.sc-sales-row','.sc-waste-row'].entries()){
      const input=day.locator(selector+' input').nth(1);
      await expect(input).toHaveValue(values[i]);
      await expect(input).toHaveAttribute('readonly','');
      await expect(input).toHaveAttribute('aria-readonly','true');
      await expect(input).toHaveAttribute('aria-label',/対象外.*保存済み・編集不可/);
    }
  }
  for(const selector of ['.sc-delivery-row','.sc-sales-row','.sc-waste-row']){
    const input=third.locator(selector+' input').nth(1);
    await expect(input).toHaveValue('／');
    await expect(input).toHaveAttribute('readonly','');
  }
  await first.locator('.sc-delivery-row input').nth(0).fill('8');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect(await page.evaluate(({storeId,categoryId,dates})=>{
    const store=allStores.stores[storeId];
    return dates.map(date=>({
      delivery:store.salesCounts[date][categoryId].trips[1].delivery,
      sales:store.salesCounts[date][categoryId].trips[1].sales,
      waste:store.wasteCounts[date][categoryId].trips[1]
    }));
  },key)).toEqual(saved);
  await page.reload();
  await page.locator('#navSalesCount').click();
  for(const [selector,value] of [['.sc-delivery-row','12'],['.sc-sales-row','0'],['.sc-waste-row','4']]){
    const input=page.locator('#scCalendar .sc-day:not(.empty)').first().locator(selector+' input').nth(1);
    await expect(input).toHaveValue(value);
    await expect(input).toHaveAttribute('readonly','');
  }
  await manage(true);
  for(const [selector,value] of [['.sc-delivery-row','12'],['.sc-sales-row','0'],['.sc-waste-row','4']]){
    const input=page.locator('#scCalendar .sc-day:not(.empty)').first().locator(selector+' input').nth(1);
    await expect(input).toHaveValue(value);
    await expect(input).toBeEditable();
  }
});

test('カード印刷は店舗と期間とカテゴリーを絞り込み保存済みの実績だけを使う',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSalesCount').click();
  const raw=await page.evaluate(()=>{
    const record=n=>({trips:[{delivery:n,sales:0},{delivery:null,sales:null},{delivery:null,sales:null}]});
    store.name='架空店舗A';
    store.salesCounts={
      '2021-03-20':{cat_onigiri:record(31)},
      '2026-01-30':{cat_onigiri:record(66)},
      '2026-01-31':{cat_onigiri:record(1234),cat_sandwich:record(77)},
      '2026-02-02':{cat_onigiri:record(21),cat_noodles:record(55)},
      '2026-02-03':{cat_onigiri:record(22)},
      '2026-02-04':{cat_onigiri:record(23)},
      '2026-02-05':{cat_onigiri:record(24)}
    };
    for(let offset=0;offset<65;offset++){
      const date=new Date(Date.UTC(2026,1,6+offset)).toISOString().slice(0,10);
      store.salesCounts[date]={cat_onigiri:record(45)};
    }
    store.wasteCounts={'2026-02-01':{cat_onigiri:{trips:[0,null,null]}}};
    allStores.stores['fixture-peer']={...structuredClone(store),name:'架空店舗B',
      salesCounts:{'2026-02-01':{cat_onigiri:record(88)}}};
    return InsightStorage.writeSnapshot(allStores);
  });
  await page.reload();
  await page.locator('#navSalesCount').click();
  const draft=page.locator('#scCalendar .sc-day:not(.empty) .sc-delivery-row input').first();
  await draft.fill('99');
  await page.getByRole('button',{name:'カードを印刷'}).click();
  const dialog=page.getByRole('dialog',{name:'納品・販売・廃棄カード'});
  const from=dialog.getByLabel('開始日'),to=dialog.getByLabel('終了日'),paper=dialog.getByLabel('用紙');
  const onigiri=dialog.getByRole('checkbox',{name:'おにぎり'});
  const sandwich=dialog.getByRole('checkbox',{name:'サンドイッチ'});
  const noodles=dialog.getByRole('checkbox',{name:'麺類'});
  const preview=dialog.getByRole('button',{name:'プレビュー'}),print=dialog.getByRole('button',{name:'印刷',exact:true});
  await expect(paper).toHaveValue('a4');
  await expect(onigiri).toBeChecked();
  await expect(sandwich).not.toBeChecked();
  await expect(dialog.getByText('1件選択',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'全選択'}).click();
  await expect(dialog.getByText('3件選択',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('checkbox',{checked:true})).toHaveCount(3);
  await dialog.getByRole('button',{name:'全解除'}).click();
  await expect(dialog.getByText('0件選択',{exact:true})).toBeVisible();
  await expect(preview).toBeDisabled();
  await expect(print).toBeDisabled();
  await onigiri.check();
  await from.fill('2026-01-31');
  await to.fill('2026-01-30');
  await preview.click();
  await expect(dialog.getByRole('status')).toHaveText('終了日を開始日以降に設定してください。');
  await expect(print).toBeDisabled();

  await to.fill('2026-02-05');
  await preview.click();
  const sheet=dialog.locator('.sc-print-sheet'),cards=sheet.locator('.sc-day');
  await expect(sheet.locator('h2')).toHaveText(['架空店舗A ／ おにぎり']);
  await expect(cards.locator('.sc-day-num')).toHaveText([
    /^2026\/1\/31/,/^2026\/2\/1/,/^2026\/2\/2/,/^2026\/2\/3/,/^2026\/2\/4/,/^2026\/2\/5/
  ]);
  const rows=sheet.locator('.sc-print-row');
  await expect(rows.first().locator('.sc-day')).toHaveCount(5);
  await expect(rows.last().locator('.sc-day')).toHaveCount(1);
  expect(await rows.first().evaluate(row=>getComputedStyle(row).gridTemplateColumns.split(' ').length)).toBe(5);
  await expect(cards.nth(0).locator('.sc-delivery-row .sc-print-value').first()).toHaveText('1234');
  await expect(cards.nth(0).locator('.sc-sales-row .sc-print-value').first()).toHaveText('0');
  await expect(cards.nth(1).locator('.sc-waste-row .sc-print-value').first()).toHaveText('0');
  await expect(sheet).not.toContainText(/55|66|77|88|99/);
  await sandwich.check();
  await expect(print).toBeDisabled();
  await expect(sheet).toHaveCount(0);
  await preview.click();
  const sections=sheet.locator('.sc-print-category');
  await expect(sections.locator('h2')).toHaveText(['架空店舗A ／ おにぎり','架空店舗A ／ サンドイッチ']);
  await expect(sections.nth(0).locator('.sc-day')).toHaveCount(6);
  await expect(sections.nth(1).locator('.sc-day-num')).toHaveText(/^2026\/1\/31/);
  await expect(sections.nth(1).locator('.sc-delivery-row .sc-print-value').first()).toHaveText('77');
  await expect(sections.nth(1)).not.toContainText('1234');

  await page.evaluate(()=>{window.print=()=>{window.fixturePrintCalled=true;};});
  const originalViewport=page.viewportSize();
  const printed=page.locator('#scPrintSheet');
  async function checkCardColors(container,expected){
    const days=await container.locator('.sc-day').evaluateAll(cards=>Object.fromEntries(cards.map(card=>{
      const title=card.querySelector('.sc-day-num');
      const style=getComputedStyle(card);
      return [title.textContent.split('（')[0],[
        getComputedStyle(title).color,...['Top','Right','Bottom','Left'].map(side=>style['border'+side+'Color']),
        style.backgroundColor,getComputedStyle(card.querySelector('.sc-print-value')).color
      ]];
    })));
    for(const [date,ink,border] of expected){
      expect(days[date],date).toEqual([ink,border,border,border,border,'rgb(255, 255, 255)','rgb(17, 17, 17)']);
    }
  }
  async function checkHolidayAlignment(container){
    for(const date of ['2021/3/20','2026/2/11']){
      const row=container.locator('.sc-print-row').filter({has:page.locator('.sc-day-num').filter({hasText:date})});
      await expect(row.locator('.sc-day')).toHaveCount(5);
      await expect(row.locator('.sc-day-title small')).toHaveCount(0);
      const layout=await row.locator('.sc-day').evaluateAll(cards=>cards.map(card=>{
        const heading=card.querySelector('.sc-day-title'),title=heading.querySelector('.sc-day-num');
        const dateRange=document.createRange();
        dateRange.selectNodeContents(title);
        const rect=heading.getBoundingClientRect(),text=dateRange.getBoundingClientRect();
        return {
          dateFits:dateRange.getClientRects().length===1&&text.right<=rect.right+1,
          overflow:card.scrollWidth>card.clientWidth+1,
          tops:[heading,...card.querySelectorAll('.sc-col-head,.sc-trip,.sc-totals')].map(node=>node.getBoundingClientRect().top)
        };
      }));
      expect(layout.every(item=>item.dateFits&&!item.overflow&&
        item.tops.every((top,index)=>Math.abs(top-layout[0].tops[index])<1))).toBe(true);
    }
  }
  const blue='rgb(29, 78, 216)',red='rgb(185, 28, 28)';
  const shortColors=[['2026/1/31',blue,blue],['2026/2/1',red,red],['2026/2/2','rgb(17, 17, 17)','rgb(170, 170, 170)']];
  async function checkPDFPages(pageCount){
    // Link annotations locate the actual printed positions without depending on font encoding.
    // These markers are added to the isolated print copy only.
    const expected=await printed.evaluate(sheet=>{
      function mark(node,key){
        const link=document.createElement('a');
        link.href='https://example.invalid/insight-print/'+key;
        link.append(...node.childNodes);
        node.append(link);
      }
      const rows=[...sheet.querySelectorAll('.sc-print-row')];
      rows.forEach((row,index)=>{
        mark(row.querySelector('.sc-day-num'),'row-'+index+'-start');
        mark(row.querySelector('.sc-day:last-child .sc-total-waste span'),'row-'+index+'-end');
      });
      const starts=[...sheet.querySelectorAll('.sc-print-start')];
      starts.forEach((start,index)=>mark(start.querySelector('h2'),'category-'+index));
      return {rowCount:rows.length,firstRows:starts.map(start=>rows.indexOf(start.querySelector('.sc-print-row')))};
    });
    const pdf=(await page.pdf({preferCSSPageSize:true})).toString('latin1');
    const objects=new Map([...pdf.matchAll(/\b(\d+) 0 obj\s+([\s\S]*?)\s+endobj/g)].map(match=>[match[1],match[2]]));
    const pages=[...objects.values()].filter(object=>/\/Type\s*\/Page\b/.test(object));
    const inks=new Set();
    for(const object of objects.values()){
      const stream=object.match(/^<<([^]*?)>>\s*stream\r?\n/);
      if(!stream||!/\/Filter\s*\/FlateDecode\b/.test(stream[1]))continue;
      const length=Number(stream[1].match(/\/Length\s+(\d+)\s*(?:\/|$)/)?.[1]);
      if(!Number.isFinite(length))continue;
      const bytes=object.slice(stream[0].length,stream[0].length+length);
      const operators=inflateSync(Buffer.from(bytes,'latin1')).toString('latin1');
      for(const [,r,g,b] of operators.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)\b/g)){
        inks.add([r,g,b].map(channel=>Math.round(Number(channel)*255)).join(','));
      }
    }
    expect([...inks]).toEqual(expect.arrayContaining(['29,78,216','185,28,28']));
    if(pageCount===1)expect(pages).toHaveLength(1);
    else expect(pages.length).toBeGreaterThan(1);
    const markerPages=new Map();
    pages.forEach((pageObject,index)=>{
      const refs=pageObject.match(/\/Annots\s*\[([^\]]*)\]/)?.[1]??'';
      for(const [,id] of refs.matchAll(/(\d+) 0 R/g)){
        const marker=objects.get(id)?.match(/example\.invalid\/insight-print\/([a-z0-9-]+)/)?.[1];
        if(marker)markerPages.set(marker,index);
      }
    });
    const pageOf=marker=>{
      const result=markerPages.get(marker);
      expect(result,marker).toBeDefined();
      return result;
    };
    for(let row=0;row<expected.rowCount;row++){
      expect(pageOf('row-'+row+'-start')).toBe(pageOf('row-'+row+'-end'));
    }
    expected.firstRows.forEach((row,index)=>expect(pageOf('category-'+index)).toBe(pageOf('row-'+row+'-start')));
  }
  const a4PreviewWidth=await sheet.evaluate(node=>node.getBoundingClientRect().width);
  for(const {value,width,pageName,size} of [
    {value:'a4',width:718,pageName:'insightSalesCards',size:/^a4 portrait$/i},
    {value:'b5',width:612,pageName:'insightSalesCardsB5',size:/^182mm 257mm$/i}
  ]){
    if(value==='b5'){
      await paper.selectOption(value);
      await expect(print).toBeDisabled();
      await preview.click();
      const b5PreviewWidth=await sheet.evaluate(node=>node.getBoundingClientRect().width);
      expect(b5PreviewWidth).toBeLessThan(a4PreviewWidth);
      expect(await rows.first().evaluate(row=>getComputedStyle(row).gridTemplateColumns.split(' ').length)).toBe(5);
    }
    for(const dark of [false,true]){
      await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      await checkCardColors(sheet,shortColors);
    }
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    await print.click();
    expect(await page.evaluate(()=>window.fixturePrintCalled)).toBe(true);
    // A4 and JIS B5 with 10mm side margins, in CSS pixels.
    await page.setViewportSize({width,height:1046});
    await page.emulateMedia({media:'print'});
    await expect(printed.locator('.sc-day')).toHaveCount(7);
    await expect(printed).toBeVisible();
    const printLayout=await printed.evaluate(sheet=>{
      const rows=[...sheet.querySelectorAll('.sc-print-row')];
      const sections=[...sheet.querySelectorAll('.sc-print-category')];
      const name=getComputedStyle(sheet).getPropertyValue('page');
      const style=[...document.styleSheets].find(item=>item.href?.includes('/insight_payload_core_v1.css?'));
      const pageRule=[...style.cssRules].find(rule=>rule.type===CSSRule.PAGE_RULE&&rule.selectorText===name);
      const headers=[...sheet.querySelector('.sc-col-head').children];
      const values=[...sheet.querySelector('.sc-delivery-row').querySelectorAll('.sc-print-value')];
      const number=sheet.querySelector('.sc-delivery-row .sc-print-value');
      const digitRange=document.createRange();
      digitRange.selectNodeContents(number);
      return {
        name,size:pageRule?.style.getPropertyValue('size'),margin:pageRule?.style.getPropertyValue('margin'),
        columns:getComputedStyle(rows[0]).gridTemplateColumns.split(' ').length,
        tripLabels:headers.map(header=>header.textContent),
        aligned:headers.length===values.length&&headers.every((header,index)=>
          Math.abs(header.getBoundingClientRect().left-values[index].getBoundingClientRect().left)<1),
        categoryStarts:sections.map(section=>getComputedStyle(section).breakBefore),
        keepRows:rows.every(row=>getComputedStyle(row).breakInside==='avoid'),
        keepHeadings:[...sheet.querySelectorAll('.sc-print-start')].every(group=>
          getComputedStyle(group).breakInside==='avoid'&&group.querySelector('h2 + .sc-print-row')),
        wrapped:digitRange.getClientRects().length!==1,
        fits:sheet.scrollWidth<=sheet.clientWidth
      };
    });
    expect(printLayout).toMatchObject({
      name:pageName,size,margin:'10mm',columns:5,categoryStarts:['auto','auto'],keepRows:true,keepHeadings:true,
      tripLabels:['1便','2便','3便'],aligned:true,wrapped:false,fits:true
    });
    await expect(page.locator('#app')).toBeHidden();
    await checkCardColors(printed,shortColors);
    await checkPDFPages(1);
    await page.evaluate(()=>{window.fixturePrintCalled=false;window.dispatchEvent(new Event('afterprint'));});
    await expect(printed).toHaveCount(0);
    await page.emulateMedia({media:'screen'});
    await page.setViewportSize(originalViewport);
  }

  await from.fill('2021-03-20');
  await to.fill('2026-04-20');
  await page.setViewportSize({width:1194,height:834});
  for(const [value,width] of [['a4',718],['b5',612]]){
    await paper.selectOption(value);
    await preview.click();
    for(const dark of [false,true]){
      await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      await checkHolidayAlignment(sheet);
    }
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    await print.click();
    await page.setViewportSize({width,height:1046});
    await page.emulateMedia({media:'print'});
    await expect(printed).toBeVisible();
    await checkCardColors(printed,[['2021/3/20',red,red],['2026/2/11',red,red]]);
    await checkHolidayAlignment(printed);
    await checkPDFPages();
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await expect(printed).toHaveCount(0);
    await page.emulateMedia({media:'screen'});
    await page.setViewportSize({width:1194,height:834});
  }
  await page.setViewportSize(originalViewport);

  // Contiguous print groups omit selected categories with no cards in the period.
  await from.fill('2026-01-31');
  await to.fill('2026-02-01');
  await noodles.check();
  await preview.click();
  await expect(sections.locator('h2')).toHaveText(['架空店舗A ／ おにぎり','架空店舗A ／ サンドイッチ']);
  await expect(dialog.getByRole('status')).toHaveText('保存済みのカードがあるカテゴリーを表示しています。');
  await from.fill('2026-05-01');
  await to.fill('2026-05-01');
  await expect(print).toBeDisabled();
  await preview.click();
  await expect(dialog.getByRole('status')).toHaveText('選択した期間に保存済みのカードはありません。');
  await from.fill('');
  await dialog.getByRole('button',{name:'閉じる'}).click();
  await expect(draft).toHaveValue('99');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  await expect(draft).toHaveValue('99');
});
