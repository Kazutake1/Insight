const {test,expect}=require('@playwright/test');
async function openInsight(page){
  // Production is HTTPS. The local test server is HTTP, so remove only the
  // upgrade-insecure-requests directive to stop WebKit upgrading localhost to HTTPS.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    await route.fulfill({response,body});
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>
    window.InsightDateContext&&
    window.InsightPagePeriodSync&&
    window.InsightSalesCount&&
    window.InsightYearControlsLayout&&
    document.getElementById('navSalesCount')
  );
  return errors;
}

test('WebKitで起動し主要入力ページを移動できる',async({page})=>{
  const errors=await openInsight(page);
  await expect.poll(()=>page.evaluate(()=>!!(window.persist&&window.persist.__insightPersistGuard))).toBe(true);

  await page.locator('#nav1').click();
  await expect(page.locator('#pageDash')).toHaveClass(/show/);

  await page.locator('#nav2').click();
  await expect(page.locator('#pageSales')).toHaveClass(/show/);

  await page.locator('#nav3').click();
  await expect(page.locator('#pageKyaku')).toHaveClass(/show/);

  await page.locator('#nav4').click();
  await expect(page.locator('#pageHaiki')).toHaveClass(/show/);

  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);
  await expect(page.locator('#scCalendar .sc-day:not(.empty)').first().locator('.sc-trip')).toHaveCount(3);

  expect(errors).toEqual([]);
});

test.describe('iPad相当のタッチ操作',()=>{
  test.use({hasTouch:true});
  test('WebKitで数字入力後にカテゴリー管理を開きチェック・保存を指のタップ位置で操作できる',async({page})=>{
    const errors=await openInsight(page);
    await page.setViewportSize({width:1194,height:834});
    await page.locator('#navSalesCount').click();
    const number=page.locator('#scCalendar .sc-day:not(.empty) .sc-sales-row input[inputmode="numeric"]:not([readonly])').first();
    await number.fill('19');
    await expect(number).toBeFocused();
    const tap=async locator=>{
      const bounds=await locator.boundingBox();
      expect(bounds).not.toBeNull();
      await page.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    };
    await tap(page.locator('#scManage'));
    const dialog=page.locator('dialog.sc-dialog');
    await expect(dialog).toBeVisible();
    await expect(number).not.toBeFocused();

    // Keep the first trip active so the earlier sales value stays visible.
    const label=dialog.locator('.sc-category-row').first().locator('.sc-category-trips label').nth(1);
    const checkbox=label.locator('input[type="checkbox"]');
    const original=await checkbox.isChecked();
    await tap(label);
    if(original)await expect(checkbox).not.toBeChecked();
    else await expect(checkbox).toBeChecked();
    const save=dialog.locator('[data-save]');
    await save.scrollIntoViewIfNeeded();
    await tap(save);
    await expect(dialog).toHaveCount(0);
    await expect(number).toHaveValue('19');
    await expect(page.locator('#scSave')).toBeEnabled();

    await tap(page.locator('#scManage'));
    await expect(dialog).toBeVisible();
    await tap(dialog.locator('header button'));
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test('WebKitでダッシュボード選択月の黒枠とページ間の月維持を確認する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav1').click();
  await page.waitForFunction(()=>window.InsightYearControlsLayout.getState().monthsInline);

  const september=page.locator('#pageDash .insight-dashboard-inline-months').getByRole('button',{name:'9月',exact:true});
  await expect(september).toBeVisible();
  await september.click();
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');

  const selected=page.locator('#pageDash .insight-dashboard-selected-month');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveText('9月');
  await expect.poll(()=>selected.evaluate(node=>getComputedStyle(node).borderColor)).toBe('rgb(0, 0, 0)');
  const border=await selected.evaluate(node=>({
    width:getComputedStyle(node).borderWidth,
    style:getComputedStyle(node).borderStyle
  }));
  expect(border).toEqual({width:'2px',style:'solid'});

  await page.locator('#nav2').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.sales)).toBe('9月');
  await page.locator('#nav3').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.kyaku)).toBe('9月');
  await page.locator('#nav4').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.haiki)).toBe('9月');

  await page.locator('#nav1').click();
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');
  expect(errors).toEqual([]);
});

test('WebKitで日付の年月変更後も日付入力要素を維持する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  await expect(page.locator('#iqdDateInput')).toBeAttached();

  const before=await page.evaluate(()=>window.InsightDateContext.getSelectedIso());
  const target=await page.evaluate(iso=>{
    const year=Number(iso.slice(0,4));
    const month=Number(iso.slice(5,7));
    const day=Math.min(Number(iso.slice(8,10)),28);
    const targetMonth=month===12?11:month+1;
    return year+'-'+String(targetMonth).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  },before);

  await page.locator('#iqdDateInput').evaluate((input,value)=>{
    input.__webkitPickerIdentity='preserved';
    input.value=value;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },target);

  await expect.poll(()=>page.evaluate(()=>window.InsightDateContext.getSelectedIso())).toBe(target);
  const state=await page.locator('#iqdDateInput').evaluate(input=>({
    identity:input.__webkitPickerIdentity,
    value:input.value,
    label:document.querySelector('#qNavRow .iqd-date-main').textContent
  }));
  expect(state.identity).toBe('preserved');
  expect(state.value).toBe(target);
  expect(state.label).toContain(target.slice(0,4)+'年'+Number(target.slice(5,7))+'月');
  expect(errors).toEqual([]);
});

test('WebKitで販売数を保存し再読込後も保持する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount')).toHaveClass(/show/);

  const input=page.locator('#scCalendar input[inputmode="numeric"]:not([readonly])').first();
  await expect(input).toBeVisible();
  const label=await input.getAttribute('aria-label');
  expect(label).toBeTruthy();

  await input.fill('321');
  await expect(page.locator('#scSave')).toBeEnabled();
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();

  const rawBefore=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(rawBefore).toContain('321');

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightSalesCount&&document.getElementById('navSalesCount'));
  await page.locator('#navSalesCount').click();

  const restored=page.getByLabel(label,{exact:true});
  await expect(restored).toHaveValue('321');
  expect(errors).toEqual([]);
});

test('WebKitで分析AIの左側をスクロールして末尾まで確認できる',async({page})=>{
  const errors=await openInsight(page);
  await page.setViewportSize({width:1194,height:834});
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  const result=await page.evaluate(()=>{
    const host=document.getElementById('aiAnalysisSummary');
    host.replaceChildren();
    for(let i=0;i<70;i++){
      const p=document.createElement('p');
      p.textContent='スクロール確認用の長い分析コメント '+i;
      p.className='ai-analysis-comment';
      host.appendChild(p);
    }
    const scroller=document.querySelector('.ai-workspace-main-scroll');
    const question=document.querySelector('.ai-workspace-question-dock');
    const questionBefore=question.getBoundingClientRect().top;
    scroller.scrollTop=scroller.scrollHeight;
    const bounds=scroller.getBoundingClientRect();
    const last=host.lastElementChild.getBoundingClientRect();
    return {
      scrollable:scroller.scrollHeight>scroller.clientHeight,
      scrolled:scroller.scrollTop>0,
      endVisible:last.bottom<=bounds.bottom+1&&last.top>=bounds.top-1,
      dockFixed:Math.abs(questionBefore-question.getBoundingClientRect().top)<=1
    };
  });
  expect(result).toEqual({scrollable:true,scrolled:true,endVisible:true,dockFixed:true});
  expect(errors).toEqual([]);
});


test('WebKitで対象外便の廃棄入力はロックされ保存済み値が維持される',async({page})=>{
  const errors=await openInsight(page);
  await page.setViewportSize({width:1194,height:834});
  await page.locator('#navSalesCount').click();
  const before=await page.evaluate(()=>{
    const categoryId=document.getElementById('scCategory').value;
    const storeId=allStores.current,p=InsightSalesCount.getPeriod();
    const date=p.year+'-'+String(p.month).padStart(2,'0')+'-01';
    allStores.salesCountManagement.categories.find(c=>c.id===categoryId).activeTrips=[true,false,true];
    const store=allStores.stores[storeId];
    store.wasteCounts=store.wasteCounts||{};
    store.wasteCounts[date]=store.wasteCounts[date]||{};
    store.wasteCounts[date][categoryId]={trips:[0,7,null]};
    InsightSalesCount.reloadFromStore();
    return {storeId,date,categoryId};
  });
  const card=page.locator('#scCalendar .sc-day:not(.empty)').first();
  await expect(card.locator('.sc-waste-row input').nth(1)).toHaveValue('7');
  await expect(card.locator('.sc-waste-row input').nth(1)).toHaveAttribute('readonly','');
  await expect(card.locator('.sc-delivery-row input').nth(1)).toHaveValue('／');
  await expect(card.locator('.sc-sales-row input').nth(1)).toHaveValue('／');
  await expect(card.locator('.sc-waste-row input').first()).toBeEditable();
  await card.locator('.sc-waste-row input').first().fill('3');
  await page.locator('#scSave').click();
  await expect(page.locator('#scSave')).toBeDisabled();
  expect(await page.evaluate(({storeId,date,categoryId})=>
    allStores.stores[storeId].wasteCounts[date][categoryId].trips,before)).toEqual([3,7,null]);
  expect(errors).toEqual([]);
});


test('WebKit 11インチiPadの縦横とライト・ダークで主要ページの枠とタイトルを維持する',async({page})=>{
  test.setTimeout(90000);
  const errors=await openInsight(page);
  const toggle=page.locator('.insight-theme-switch-track');
  const pages=[
    ['#nav1','#pageDash'],
    ['#nav2','#pageSales'],
    ['#nav3','#pageKyaku'],
    ['#nav4','#pageHaiki'],
    ['#navSalesCount','#pageSalesCount'],
    ['#navSaleResults','#pageSaleResults'],
    ['#navEventResults','#pageEventResults'],
    ['#navSettings','#pageSettings']
  ];
  const surfaces=[];
  for(const dark of [false,true]){
    const initial=await page.evaluate(()=>document.documentElement.classList.contains('dark')||document.body.classList.contains('dark'));
    if(initial!==dark){
      await toggle.click();
      await page.waitForFunction(expected=>(
        document.documentElement.classList.contains('dark')||document.body.classList.contains('dark')
      )===expected,dark);
    }
    surfaces.push(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--surface').trim()));
    for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
      await page.setViewportSize(viewport);
      for(const [nav,rootSelector] of pages){
        await page.locator(nav).click();
        const root=page.locator(rootSelector);
        await expect(root).toHaveClass(/show/);
        const layout=await root.evaluate(node=>{
          const rect=node.getBoundingClientRect();
          const main=document.getElementById('main').getBoundingClientRect();
          const heading=node.querySelector(':scope > .page-header > .page-title');
          const h=heading?heading.getBoundingClientRect():null;
          return {
            left:rect.left,right:rect.right,width:rect.width,display:getComputedStyle(node).display,
            mainLeft:main.left,mainRight:main.right,
            heading:h?{left:h.left,right:h.right,width:h.width}:null,
            viewportWidth:window.innerWidth,
            dark:document.documentElement.classList.contains('dark')||document.body.classList.contains('dark')
          };
        });
        const context=nav+' / '+viewport.width+'x'+viewport.height+' / dark='+dark;
        expect(layout.dark,context+' theme').toBe(dark);
        expect(layout.display,context+' display').not.toBe('none');
        expect(layout.width,context+' page width').toBeGreaterThan(0);
        expect(layout.left,context+' left edge').toBeGreaterThanOrEqual(layout.mainLeft-1);
        expect(layout.right,context+' right edge').toBeLessThanOrEqual(layout.mainRight+1);
        if(layout.heading){
          expect(layout.heading.width,context+' heading width').toBeGreaterThan(0);
          expect(layout.heading.left,context+' heading left').toBeGreaterThanOrEqual(layout.left-1);
          expect(layout.heading.right,context+' heading right').toBeLessThanOrEqual(layout.right+1);
        }
      }
    }
  }
  expect(surfaces.every(Boolean)).toBe(true);
  expect(surfaces[0]).not.toBe(surfaces[1]);
  expect(errors).toEqual([]);
});
