const {test,expect}=require('@playwright/test');

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
