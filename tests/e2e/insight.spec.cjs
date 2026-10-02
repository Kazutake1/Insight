const {test,expect}=require('@playwright/test');
const path=require('node:path');

async function openInsight(page){
  const pakoPath=path.join(process.cwd(),'node_modules','pako','dist','pako.min.js');
  await page.route('https://unpkg.com/pako@2.1.0/dist/pako.min.js',route=>
    route.fulfill({path:pakoPath,contentType:'application/javascript'})
  );
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightPagePeriodSync&&window.InsightSalesCount&&window.InsightSaleResults&&window.InsightAIVisual&&window.InsightAIInterpretation&&window.InsightAnalysisPeriodLock);
  return errors;
}

async function selectDashboardSeptember(page){
  await page.evaluate(()=>{
    gotoNav(1);
    selMonth='9月';
    refreshDash();
  });
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');
}

test('選択月は主要ページを横断しても維持される',async({page})=>{
  const errors=await openInsight(page);
  await selectDashboardSeptember(page);
  const year=await page.evaluate(()=>String(baseYear));

  await page.locator('#nav2').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.sales)).toBe('9月');

  await page.locator('#nav3').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.kyaku)).toBe('9月');

  await page.locator('#nav4').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.haiki)).toBe('9月');

  await page.locator('#navSalesCount').click();
  await expect.poll(()=>page.evaluate(()=>window.InsightSalesCount.getPeriod().month)).toBe(9);
  await expect.poll(()=>page.evaluate(()=>String(window.InsightSalesCount.getPeriod().year))).toBe(year);

  await page.locator('#nav1').click();
  await expect.poll(()=>page.evaluate(()=>selMonth)).toBe('9月');
  expect(errors).toEqual([]);
});


test('全ページタイトルはダッシュボード位置に揃い追加ページも自動追従する',async({page})=>{
  const errors=await openInsight(page);

  async function titleRect(){
    return page.locator('.page.show > .page-header > .page-title').evaluate(node=>{
      const rect=node.getBoundingClientRect();
      return {left:rect.left,top:rect.top};
    });
  }

  await page.locator('#nav1').click();
  await expect(page.locator('#pageDash > .page-header > .page-title')).toBeVisible();
  const reference=await titleRect();

  for(const selector of ['#nav2','#nav3','#nav4','#navSalesCount','#navSaleResults']){
    await page.locator(selector).click();
    await expect(page.locator('.page.show > .page-header > .page-title')).toBeVisible();
    const current=await titleRect();
    expect(Math.abs(current.left-reference.left),selector+' left').toBeLessThanOrEqual(1);
    expect(Math.abs(current.top-reference.top),selector+' top').toBeLessThanOrEqual(1);
  }

  await page.evaluate(()=>{
    document.querySelectorAll('.page').forEach(node=>node.classList.remove('show'));
    const future=document.createElement('div');
    future.id='e2eFuturePage';
    future.className='page show';
    future.style.padding='7px 11px 12px';
    future.innerHTML='<div class="page-header"><div class="page-title">追加ページ</div></div><div>future</div>';
    document.getElementById('main').appendChild(future);
  });
  await expect(page.locator('#e2eFuturePage > .page-header > .page-title')).toBeVisible();
  await expect.poll(async()=>{
    const current=await page.locator('#e2eFuturePage > .page-header > .page-title').evaluate(node=>{
      const rect=node.getBoundingClientRect();
      return {left:rect.left,top:rect.top};
    });
    return Math.max(Math.abs(current.left-reference.left),Math.abs(current.top-reference.top));
  }).toBeLessThanOrEqual(1);

  await page.evaluate(()=>document.getElementById('e2eFuturePage')?.remove());
  expect(errors).toEqual([]);
});

test('分析AIを開いてサイドバーを切り替えても分析対象月を維持する',async({page})=>{
  const errors=await openInsight(page);
  await selectDashboardSeptember(page);

  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  await expect.poll(()=>page.evaluate(()=>window.InsightAnalysisPeriodLock.getTarget()&&window.InsightAnalysisPeriodLock.getTarget().month)).toBe(9);

  await page.locator('#nav2').click();
  await expect.poll(()=>page.evaluate(()=>editMonth.sales)).toBe('9月');
  await expect.poll(()=>page.evaluate(()=>window.InsightAnalysisPeriodLock.getTarget().month)).toBe(9);
  await expect(page.locator('#aiAnalysisTarget')).toContainText('9月');
  expect(errors).toEqual([]);
});

test('販売数ページはデータ本体の置換後に古いdraftを残さない',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();

  const result=await page.evaluate(()=>{
    const api=window.InsightSalesCount;
    const category=api.getAnalysisContext().category;
    const year=String(new Date().getFullYear());
    api.setPeriod(year,9);

    function snapshotWithSales(values){
      const next=JSON.parse(JSON.stringify(allStores));
      const id=next.current;
      next.stores[id].salesCounts={};
      next.stores[id].salesCounts[year+'-09-01']={};
      next.stores[id].salesCounts[year+'-09-01'][category.id]={
        trips:values.map(v=>({delivery:v,sales:v}))
      };
      return next;
    }

    allStores=snapshotWithSales([1,2,3]);
    store=allStores.stores[allStores.current];
    api.reloadFromStore();
    const first=api.getAnalysisContext().daily.find(x=>x.date===year+'-09-01');

    allStores=snapshotWithSales([10,20,30]);
    store=allStores.stores[allStores.current];
    api.reloadFromStore();
    const second=api.getAnalysisContext().daily.find(x=>x.date===year+'-09-01');

    return {first:first&&first.sales,second:second&&second.sales};
  });

  expect(result).toEqual({first:6,second:60});
  expect(errors).toEqual([]);
});

test('分析AIの上端は左サイドバーの上端と揃う',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);

  const positions=await page.evaluate(()=>{
    const panel=document.getElementById('aiAnalysisPanel');
    const button=document.getElementById('aiAnalysisToggle');
    let sidebar=button.closest&&button.closest('.sidebar');
    if(!sidebar){
      let node=button.parentElement,best=null;
      while(node&&node!==document.body&&node!==document.documentElement){
        const rect=node.getBoundingClientRect();
        if(
          rect.width>=120&&rect.width<=360&&
          rect.height>=Math.max(320,window.innerHeight*.55)&&
          rect.left>=0&&rect.left<80&&rect.top>=0&&rect.top<160
        ){
          if(!best||rect.height>best.rect.height)best={node,rect};
        }
        node=node.parentElement;
      }
      sidebar=best&&best.node;
    }
    return {
      panelTop:panel.getBoundingClientRect().top,
      sidebarTop:sidebar&&sidebar.getBoundingClientRect().top
    };
  });

  expect(positions.sidebarTop).not.toBeNull();
  expect(Math.abs(positions.panelTop-positions.sidebarTop)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('セール実績は内容別に表示し販売数入力と同じカードを7枚ごとに折り返す',async({page})=>{
  const errors=await openInsight(page);

  await page.evaluate(()=>{
    const categoryId='cat_onigiri';
    const storeId=allStores.current;
    if(!allStores.eventManagement)allStores.eventManagement={version:1,presets:[],events:[]};
    allStores.eventManagement.events=(allStores.eventManagement.events||[]).filter(e=>e.id!=='e2e_sale_results');
    allStores.eventManagement.events.push({
      id:'e2e_sale_results',
      type:'sale',
      scope:'global',
      startDate:'2026-09-01',
      endDate:'2026-09-08',
      snapshot:{
        title:'E2Eおにぎりセール',
        sale:{categoryId,category:'おにぎり',method:'amount',params:{amount:20}}
      }
    });
    const store=allStores.stores[storeId];
    if(!store.salesCounts)store.salesCounts={};
    for(let day=1;day<=8;day++){
      const date='2026-09-'+String(day).padStart(2,'0');
      store.salesCounts[date]=store.salesCounts[date]||{};
      store.salesCounts[date][categoryId]={
        trips:[
          {delivery:40+day,sales:36+day},
          {delivery:50+day,sales:46+day},
          {delivery:45+day,sales:41+day}
        ]
      };
    }
    window.InsightSaleResults.render();
  });

  await page.locator('#navSaleResults').click();
  await expect(page.locator('#pageSaleResults')).toHaveClass(/show/);
  await expect(page.locator('.sr-group')).toHaveCount(1);
  await expect(page.locator('.sr-group-head h2')).toContainText('おにぎり 20円引き');
  await expect(page.locator('.sr-group .sc-day')).toHaveCount(8);

  const layout=await page.evaluate(()=>{
    const cards=Array.from(document.querySelectorAll('.sr-group .sc-day'));
    const saleCard=cards[0];
    const inputCard=document.querySelector('#scCalendar .sc-day:not(.empty)');
    return {
      firstTop:cards[0].getBoundingClientRect().top,
      seventhTop:cards[6].getBoundingClientRect().top,
      eighthTop:cards[7].getBoundingClientRect().top,
      saleChildren:Array.from(saleCard.children).map(node=>node.className),
      inputChildren:inputCard?Array.from(inputCard.children).map(node=>node.className):[],
      allReadOnly:Array.from(saleCard.querySelectorAll('input')).every(input=>input.readOnly)
    };
  });

  expect(Math.abs(layout.firstTop-layout.seventhTop)).toBeLessThanOrEqual(1);
  expect(layout.eighthTop).toBeGreaterThan(layout.seventhTop+20);
  expect(layout.saleChildren).toEqual(layout.inputChildren);
  expect(layout.allReadOnly).toBe(true);

  const order=await page.evaluate(()=>({
    afterSales:document.getElementById('navSalesCount').nextElementSibling&&document.getElementById('navSalesCount').nextElementSibling.id,
    afterResults:document.getElementById('navSaleResults').nextElementSibling&&document.getElementById('navSaleResults').nextElementSibling.id
  }));
  expect(order.afterSales).toBe('navSaleResults');
  expect(order.afterResults).toBe('aiAnalysisToggle');
  expect(errors).toEqual([]);
});

test('分析AIコメントは数値カードと簡潔な確認事項として表示する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);

  await page.evaluate(()=>{
    window.InsightAIVisual.renderLines('aiAnalysisSummary',[
      '売上 1,184,000円 / 前年同月比 -5.2% / 前月比 +1.0%。',
      '【継続】客数低下：前年同月比 -6.1%。3か月連続で前年を下回っています。'
    ],'データなし',document);
    window.InsightAIVisual.renderLines('aiAnalysisCaution',[
      '【継続】客数低下：前年同月比 -6.1%。'
    ],'注意点なし',document);
    window.InsightAIVisual.renderLines('aiAnalysisGood',[
      '【改善】廃棄改善：前年同月比 -12.4%。'
    ],'改善なし',document);
    window.InsightAIVisual.renderLines('aiAnalysisChecks',[
      '曜日別客数を確認してください。',
      '販売数との関係を確認してください。'
    ],'確認事項なし',document);
  });

  await expect(page.locator('#aiAnalysisSummary .ai-insight-item')).toHaveCount(2);
  await expect(page.locator('#aiAnalysisSummary .ai-insight-value').first()).toHaveText('-5.2%');
  await expect(page.locator('#aiAnalysisCaution .ai-insight-item')).toHaveClass(/is-danger/);
  await expect(page.locator('#aiAnalysisGood .ai-insight-item')).toHaveClass(/is-success/);
  await expect(page.locator('#aiAnalysisChecks .ai-check-line')).toHaveCount(2);

  const palette=await page.evaluate(()=>({
    danger:getComputedStyle(document.querySelector('#aiAnalysisCaution .ai-insight-value')).color,
    success:getComputedStyle(document.querySelector('#aiAnalysisGood .ai-insight-value')).color,
    neutral:getComputedStyle(document.querySelector('#aiAnalysisSummary .ai-insight-value')).color
  }));
  expect(new Set(Object.values(palette)).size).toBe(3);
  expect(errors).toEqual([]);
});

test('販売数AI分析は入力カードと同じデザインで便別平均と曜日別平均を表示する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  await expect(page.locator('#aiAnalysisSummary .ai-sales-count-visual')).toBeVisible();
  await expect(page.locator('#aiAnalysisSummary .ai-sales-count-overall .sc-day')).toHaveCount(1);
  await expect(page.locator('#aiAnalysisSummary .ai-sales-count-weekdays .sc-day')).toHaveCount(7);

  const structure=await page.evaluate(()=>{
    const inputCard=document.querySelector('#scCalendar .sc-day:not(.empty)');
    const aiCard=document.querySelector('#aiAnalysisSummary .ai-sales-count-overall .sc-day');
    const weekdayCards=Array.from(document.querySelectorAll('#aiAnalysisSummary .ai-sales-count-weekdays .sc-day'));
    return {
      inputChildren:Array.from(inputCard.children).map(node=>node.className),
      aiChildren:Array.from(aiCard.children).map(node=>node.className),
      aiClass:aiCard.className,
      allReadOnly:[aiCard].concat(weekdayCards).every(card=>Array.from(card.querySelectorAll('input')).every(input=>input.readOnly)),
      weekdayTitles:weekdayCards.map(card=>card.querySelector('.sc-day-num').textContent)
    };
  });

  expect(structure.aiChildren).toEqual(structure.inputChildren);
  expect(structure.aiClass).toContain('sc-day');
  expect(structure.allReadOnly).toBe(true);
  expect(structure.weekdayTitles).toEqual(['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日']);
  expect(errors).toEqual([]);
});

test('廃棄のプラス変化だけは分析要約でも赤表示にする',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);

  await page.evaluate(()=>{
    window.InsightAIVisual.renderLines('aiAnalysisSummary',[
      '廃棄額は前年比+12.4%、前年差+2,000円です。',
      '売上は前年比+12.4%、前年差+120,000円です。'
    ],'データなし',document);
  });

  const items=page.locator('#aiAnalysisSummary .ai-insight-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/is-danger/);
  await expect(items.nth(1)).not.toHaveClass(/is-danger/);
  await expect(items.nth(0).locator('.ai-insight-value')).toHaveText('+12.4%');
  await expect(items.nth(1).locator('.ai-insight-value')).toHaveText('+12.4%');

  const colors=await page.evaluate(()=>({
    waste:getComputedStyle(document.querySelector('#aiAnalysisSummary .ai-insight-item:nth-child(1) .ai-insight-value')).color,
    sales:getComputedStyle(document.querySelector('#aiAnalysisSummary .ai-insight-item:nth-child(2) .ai-insight-value')).color
  }));
  expect(colors.waste).not.toBe(colors.sales);
  expect(errors).toEqual([]);
});

test('カテゴリーごとの対象便設定で対象外便を入力漏れ扱いしない',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();
  await page.locator('#scManage').click();
  await expect(page.locator('.sc-dialog')).toBeVisible();

  const firstRow=page.locator('.sc-dialog .sc-category-row').first();
  const checks=firstRow.locator('.sc-category-trips input[type="checkbox"]');
  await expect(checks).toHaveCount(3);
  await checks.nth(0).uncheck();
  await expect(checks.nth(1)).toBeChecked();
  await expect(checks.nth(2)).toBeChecked();
  await page.locator('.sc-dialog [data-save]').click();
  await expect(page.locator('.sc-dialog')).toHaveCount(0);

  const saved=await page.evaluate(()=>{
    const category=allStores.salesCountManagement.categories.find(c=>!c.hidden);
    const card=document.querySelector('#scCalendar .sc-day:not(.empty)');
    const delivery=Array.from(card.querySelectorAll('.sc-delivery-row input')).map(input=>({type:input.type,value:input.value,readOnly:input.readOnly,className:input.className}));
    const sales=Array.from(card.querySelectorAll('.sc-sales-row input')).map(input=>({type:input.type,value:input.value,readOnly:input.readOnly,className:input.className}));
    const context=window.InsightSalesCount.getAnalysisContext();
    return {activeTrips:category.activeTrips,delivery,sales,contextTrips:context.activeTrips};
  });

  expect(saved.activeTrips).toEqual([false,true,true]);
  expect(saved.contextTrips).toEqual([false,true,true]);
  expect(saved.delivery[0].value).toBe('ー');
  expect(saved.sales[0].value).toBe('ー');
  expect(saved.delivery[0].readOnly).toBe(true);
  expect(saved.sales[0].readOnly).toBe(true);
  expect(saved.delivery[0].className).toContain('sc-not-applicable');
  expect(saved.delivery[1].type).toBe('number');
  expect(saved.delivery[2].type).toBe('number');
  const weekdayDelivery=page.locator('#scAverages .sc-average-day').first().locator('.sc-average-delivery b').nth(0);
  const weekdaySales=page.locator('#scAverages .sc-average-day').first().locator('.sc-average-sales b').nth(0);
  await expect(weekdayDelivery).toHaveText('ー');
  await expect(weekdaySales).toHaveText('ー');
  await expect(weekdayDelivery).toHaveClass(/sc-not-applicable/);
  await expect(weekdaySales).toHaveClass(/sc-not-applicable/);

  const grayMatch=await page.evaluate(()=>{
    const calendar=document.querySelector('#scCalendar .sc-day:not(.empty) .sc-delivery-row input.sc-not-applicable');
    const average=document.querySelector('#scAverages .sc-average-day .sc-average-delivery b.sc-not-applicable');
    const calendarStyle=getComputedStyle(calendar),averageStyle=getComputedStyle(average);
    return {
      calendarBackground:calendarStyle.backgroundColor,
      averageBackground:averageStyle.backgroundColor,
      calendarBorder:calendarStyle.borderColor,
      averageBorder:averageStyle.borderColor,
      calendarColor:calendarStyle.color,
      averageColor:averageStyle.color
    };
  });
  expect(grayMatch.averageBackground).toBe(grayMatch.calendarBackground);
  expect(grayMatch.averageBorder).toBe(grayMatch.calendarBorder);
  expect(grayMatch.averageColor).toBe(grayMatch.calendarColor);

  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  await expect(page.locator('#aiAnalysisSummary .ai-sales-count-overall .sc-delivery-row input').nth(0)).toHaveValue('ー');
  await expect(page.locator('#aiAnalysisSummary .ai-sales-count-overall .sc-sales-row input').nth(0)).toHaveValue('ー');
  expect(errors).toEqual([]);
});

test('分析AIは結論・重要ポイント・関連性・次に確認することの4ブロックで表示する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);

  const titles=await page.evaluate(()=>({
    conclusion:document.getElementById('aiAnalysisSummary').parentElement.querySelector('.ai-analysis-card-title').textContent,
    priority:document.getElementById('aiAnalysisCaution').parentElement.querySelector('.ai-analysis-card-title').textContent,
    relation:document.getElementById('aiAnalysisGood').parentElement.querySelector('.ai-analysis-card-title').textContent,
    checks:document.getElementById('aiAnalysisChecks').parentElement.querySelector('.ai-analysis-card-title').textContent
  }));
  expect(titles).toEqual({
    conclusion:'結論',
    priority:'重要ポイント',
    relation:'関連性',
    checks:'次に確認すること'
  });

  const interpreted=await page.evaluate(()=>{
    const current={
      metrics:{salesYen:950000,customers:900,customerUnitPrice:1055.56,items:1800,wasteYen:12000},
      salesCount:{categories:[{id:'cat',name:'商品',hidden:false,delivery:{total:{average:110}},sales:{total:{average:100}}}]},
      conditions:{daily:[{weather:'雨'},{weather:'晴'}],events:[{id:'e1'}]}
    };
    const previous={
      metrics:{salesYen:1000000,customers:1000,customerUnitPrice:1000,items:2000,wasteYen:10000},
      salesCount:{categories:[{id:'cat',name:'商品',hidden:false,delivery:{total:{average:100}},sales:{total:{average:100}}}]},
      conditions:{daily:[],events:[]}
    };
    const items=[
      {type:'customers',theme:'customers',title:'客数低下',summary:'客数 -10.0%',positive:false,level:'important',score:82,persistenceMonths:3,impactYen:100000},
      {type:'waste',theme:'waste',title:'廃棄増加',summary:'廃棄金額 +20.0%',positive:false,level:'attention',score:68,persistenceMonths:2,impactYen:2000}
    ];
    const review={
      period:{yoyLabel:'前年同月比'},
      current,comparisonYear:previous,previousMonth:previous,items,
      forTheme(theme){return this.items.filter(item=>item.theme===theme);}
    };
    return window.InsightAIInterpretation.monthly(review,'dashboard');
  });

  expect(interpreted.conclusion[0]).toContain('確認を優先');
  expect(interpreted.priorities.length).toBeLessThanOrEqual(5);
  expect(interpreted.relations.some(line=>line.includes('主因候補は客数'))).toBe(true);
  expect(interpreted.relations.some(line=>line.includes('納品 × 販売 × 廃棄'))).toBe(true);

  await page.evaluate((result)=>{
    window.InsightAIVisual.renderLines('aiAnalysisSummary',result.conclusion,'',document);
    window.InsightAIVisual.renderLines('aiAnalysisCaution',result.priorities,'',document);
    window.InsightAIVisual.renderLines('aiAnalysisGood',result.relations,'',document);
    window.InsightAIVisual.renderLines('aiAnalysisChecks',result.checks,'',document);
  },interpreted);

  await expect(page.locator('#aiAnalysisSummary .ai-insight-item').first()).toHaveClass(/is-neutral/);
  await expect(page.locator('#aiAnalysisCaution .ai-insight-item').first()).toHaveClass(/is-danger/);
  await expect(page.locator('#aiAnalysisGood .ai-insight-item').first()).toHaveClass(/is-neutral/);
  await expect(page.locator('#aiAnalysisChecks .ai-check-line')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});
