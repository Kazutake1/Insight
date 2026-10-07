const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

async function openInsight(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightPagePeriodSync&&window.InsightInputPeriodControls&&window.InsightSalesPeriodSelector&&window.InsightSalesCount&&window.InsightSaleResults&&window.InsightHourlyCustomers&&window.InsightEventResults&&window.InsightAIVisual&&window.InsightAIInterpretation&&window.InsightAnalysisPeriodLock&&window.InsightMultiYearAnalysis&&window.InsightWeekdayAnalysis&&window.InsightSaleImpactAnalysis&&window.InsightEventImpactAnalysis&&window.InsightSeasonalityAnalysis&&window.InsightAnomalyExplanation&&window.InsightAnalysisBundle&&window.InsightSettings&&window.InsightDarkTheme&&window.InsightReadability&&document.getElementById('navSettings')&&document.getElementById('pageSettings'));
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

test('売上・客数・廃棄は販売数入力と同じ前月・年月・翌月の操作に統一される',async({page})=>{
  const errors=await openInsight(page);
  const legacyRenderer=await page.evaluate(()=>initInputPage.__insightOriginal.toString());
  expect(legacyRenderer).toContain('salesYearRow');
  expect(legacyRenderer).toContain('salesMonthTabs');
  expect(legacyRenderer).toContain('renderTable(type)');
  expect(await page.evaluate(()=>window.InsightInputPeriodControls.legacyCleanupMode)).toBe('runtime');
  expect(await page.evaluate(()=>window.initInputPage.__insightInputPeriodControls===true)).toBe(true);

  const year=await page.evaluate(()=>Number(allStores.stores[allStores.current].years.map(Number).sort((a,b)=>a-b).slice(-1)[0]));

  for(const spec of [
    {nav:'#nav2',type:'sales',page:'#pageSales'},
    {nav:'#nav3',type:'kyaku',page:'#pageKyaku'},
    {nav:'#nav4',type:'haiki',page:'#pageHaiki'}
  ]){
    await page.locator(spec.nav).click();
    await page.evaluate(({type,year})=>{
      InsightPagePeriodSync.setTarget({year,month:9,source:'e2eInputPeriod'});
      InsightPagePeriodSync.syncCurrentPage();
    },{type:spec.type,year});
    const toolbar=page.locator(spec.page+' .insight-input-period-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('button').nth(0)).toHaveText('‹ 前月');
    await expect(toolbar.locator('[data-period-current]')).toHaveText(String(year)+'年 9月');
    await expect(toolbar.locator('button').nth(1)).toHaveText('翌月 ›');
    await expect(toolbar).toHaveClass(/sc-toolbar/);
    await toolbar.locator('button').nth(1).click();
    await expect.poll(()=>page.evaluate(type=>editMonth[type],spec.type)).toBe('10月');
    await expect(toolbar.locator('[data-period-current]')).toHaveText(String(year)+'年 10月');

    const legacyVisible=await page.evaluate(pageSelector=>{
      const root=document.querySelector(pageSelector);
      return Array.from(root.querySelectorAll('button,[role="button"]')).filter(node=>{
        if(node.closest('.insight-input-period-toolbar'))return false;
        const text=(node.textContent||'').trim();
        return (/^\d{4}年$/.test(text)||/^(?:[1-9]|1[0-2])月$/.test(text))&&node.offsetParent!==null;
      }).length;
    },spec.page);
    expect(legacyVisible).toBe(0);
    const oldContainers=await page.evaluate(type=>{
      const ids=type==='sales'?['salesYearRow','salesMonthTabs']:type==='kyaku'?['kyakuYearRow','kyakuMonthTabs']:['haikiYearRow','haikiMonthTabs'];
      return ids.filter(id=>document.getElementById(id)).length;
    },spec.type);
    expect(oldContainers).toBe(0);
  }

  await page.locator('#navSalesCount').click();
  const salesCountToolbar=page.locator('#pageSalesCount .sc-toolbar');
  await expect(salesCountToolbar.locator('#scPrev')).toHaveText('‹ 前月');
  await expect(salesCountToolbar.locator('#scNext')).toHaveText('翌月 ›');

  await expect(page.locator('#insightSalesPeriodOverlay')).toHaveCount(0);
  await expect(page.locator('#insightSalesPeriodToday')).toHaveCount(0);
  expect(errors).toEqual([]);
});

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


test('売上・客数・廃棄の曜日別グラフ下部余白を統一して詰める',async({page})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=await openInsight(page);
  const checks=[['#nav2','#salesWdChart'],['#nav3','#kyakuWdChart'],['#nav4','#haikiWdChart']];
  for(const [nav,canvas] of checks){
    await page.locator(nav).click();
    await page.waitForFunction(sel=>{const node=document.querySelector(sel);return node&&Chart.getChart(node)&&Math.abs(node.getBoundingClientRect().height-node.parentElement.getBoundingClientRect().height)<2;},canvas);
    await expect.poll(()=>page.locator(canvas).evaluate(node=>{
      const gap=Math.round(node.parentElement.parentElement.getBoundingClientRect().bottom-node.getBoundingClientRect().bottom);
      return gap>=0&&gap<=12;
    })).toBe(true);
    const spacing=await page.locator(canvas).evaluate(node=>({
      canvasMarginBottom:getComputedStyle(node).marginBottom,
      parentPaddingBottom:getComputedStyle(node.parentElement).paddingBottom,
      parentMarginBottom:getComputedStyle(node.parentElement).marginBottom,
      bottomGap:Math.round(node.parentElement.parentElement.getBoundingClientRect().bottom-node.getBoundingClientRect().bottom)
    }));
    expect(spacing).toMatchObject({canvasMarginBottom:'0px',parentPaddingBottom:'0px',parentMarginBottom:'0px'});
    expect(spacing.bottomGap).toBeGreaterThanOrEqual(0);
    expect(spacing.bottomGap).toBeLessThanOrEqual(12);
  }
  expect(errors).toEqual([]);
});

test('入力変更で3つの曜日別グラフが即時更新され売上Y軸は万円換算する',async({page})=>{
  const errors=await openInsight(page);

  await page.locator('#nav2').click();
  await page.waitForFunction(()=>window.InsightWeekdayChartFix&&window.Chart&&typeof Chart.getChart==='function'&&Chart.getChart(document.getElementById('salesWdChart')));
  const salesBefore=await page.evaluate(()=>{
    const input=document.querySelector('#salesForm input[data-k="売上"]');
    const ri=Number(input.dataset.ri);
    const wd=getWeekday(editYear.sales,MONTHS.indexOf(editMonth.sales),ri+1);
    const chart=Chart.getChart(document.getElementById('salesWdChart'));
    const before=chart.data.datasets[0].data[wd];
    input.value='987654';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return {wd,before};
  });
  await page.waitForFunction(({wd,before})=>{
    const chart=Chart.getChart(document.getElementById('salesWdChart'));
    return chart&&chart.data.datasets[0].data[wd]!==before;
  },salesBefore);
  const salesAxis=await page.evaluate(()=>{
    const chart=Chart.getChart(document.getElementById('salesWdChart'));
    const callback=chart.options.scales.y.ticks.callback;
    return {v500:callback(500),v1000:callback(1000)};
  });
  expect(salesAxis).toEqual({v500:'50万',v1000:'100万'});

  await page.locator('#nav3').click();
  await page.waitForFunction(()=>Chart.getChart(document.getElementById('kyakuWdChart')));
  const kyakuBefore=await page.evaluate(()=>{
    const input=document.querySelector('#kyakuGrid input.kyaku-input');
    const ri=Number(input.dataset.ri);
    const wd=getWeekday(editYear.kyaku,MONTHS.indexOf(editMonth.kyaku),ri+1);
    const chart=Chart.getChart(document.getElementById('kyakuWdChart'));
    const before=chart.data.datasets[0].data[wd];
    input.value='98765';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return {wd,before};
  });
  await page.waitForFunction(({wd,before})=>{
    const chart=Chart.getChart(document.getElementById('kyakuWdChart'));
    return chart&&chart.data.datasets[0].data[wd]!==before;
  },kyakuBefore);

  await page.locator('#nav4').click();
  await page.waitForFunction(()=>Chart.getChart(document.getElementById('haikiWdChart')));
  await page.evaluate(()=>{
    window.__haikiWdRefreshCalls=0;
    const original=window.refreshHaikiWdChart;
    window.refreshHaikiWdChart=function(){
      window.__haikiWdRefreshCalls++;
      return original.apply(this,arguments);
    };
    const input=document.querySelector('#haikiForm input[data-hc]');
    input.value='987654';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(()=>window.__haikiWdRefreshCalls>0);

  expect(errors).toEqual([]);
});

test('廃棄曜日平均は過去日の未入力を0円として含め今日以降を除外する',async({page})=>{
  const errors=await openInsight(page);
  await page.waitForFunction(()=>window.InsightWeekdayChartFix&&typeof window.InsightWeekdayChartFix.computeWasteWeekdayAverage==='function');

  const result=await page.evaluate(()=>{
    const empty=()=>Object.fromEntries(HAIKI_CATS.map(cat=>[cat,0]));
    const withValue=value=>{
      const h=empty();
      h[HAIKI_CATS[0]]=value;
      return h;
    };
    const rows=[
      {d:'1',haiki:withValue(1000)},
      {d:'8',haiki:empty()},
      {d:'9',haiki:withValue(9000)},
      {d:'15',haiki:withValue(9000)}
    ];
    return InsightWeekdayChartFix.computeWasteWeekdayAverage(
      rows,
      '2026',
      9,
      new Date(2026,9,9,12,0,0)
    );
  });

  // 2026-10-01/08 are both Thursday: (1000 + 0) / 2 = 500.
  // 10/09 is today and 10/15 is future, so both must be excluded.
  expect(result).toEqual([0,0,0,0,500,0,0]);
  expect(errors).toEqual([]);
});

test('売上・客数・廃棄の日別グラフは指定された補助文だけを表示しない',async({page})=>{
  const errors=await openInsight(page);

  await page.locator('#nav2').click();
  await expect(page.locator('#pageSales')).toHaveClass(/show/);
  await expect(page.locator('#pageSales').getByText('月合計',{exact:true})).toHaveCount(0);
  await expect(page.locator('#pageSales').getByText('グラフをタップで日付選択',{exact:true})).toHaveCount(0);

  await page.locator('#nav3').click();
  await expect(page.locator('#pageKyaku')).toHaveClass(/show/);
  await expect(page.locator('#pageKyaku').getByText('月合計',{exact:true})).toHaveCount(0);

  await page.locator('#nav4').click();
  await expect(page.locator('#pageHaiki')).toHaveClass(/show/);
  await expect(page.locator('#pageHaiki').getByText('月合計',{exact:true})).toHaveCount(0);
  await expect(page.locator('#pageHaiki').getByText('棒をタップで日付選択',{exact:true})).toBeVisible();

  expect(errors).toEqual([]);
});

test('旧コア配色補正は外部CSSで適用しruntime CSSOM mutationを使わない',async({page})=>{
  const errors=await openInsight(page);
  const state=await page.evaluate(()=>{
    const toggle=document.querySelector('#aiAnalysisToggle.nav-btn');
    const style=toggle?getComputedStyle(toggle):null;
    return {background:style&&style.backgroundColor,color:style&&style.color,compat:window.InsightLegacyStyleCompat};
  });
  expect(state.background).not.toBeNull();
  expect(state.color).not.toBeNull();
  expect(state.compat&&state.compat.matched).toBe(0);
  expect(errors).toEqual([]);
});

test('共通persistはruntime guardから共有Storageへ委譲する',async({page})=>{
  const errors=await openInsight(page);
  const result=await page.evaluate(()=>{
    const writer=window.InsightStorage.persistCurrent;
    let calls=0,same=false;
    window.InsightStorage.persistCurrent=function(value){calls++;same=value===allStores;return true;};
    try{
      return {
        installed:!!(window.persist&&window.persist.__insightPersistGuard),
        hasOriginal:typeof window.persist.__insightOriginal==='function',
        value:window.persist(),
        calls:calls,
        same:same
      };
    }finally{
      window.InsightStorage.persistCurrent=writer;
    }
  });
  expect(result).toEqual({installed:true,hasOriginal:true,value:true,calls:1,same:true});
  expect(errors).toEqual([]);
});

test('トップページは外部shellと機能manifestの最新版確認をno-storeで行う',async({page})=>{
  const errors=await openInsight(page);
  const sources=await page.evaluate(()=>Promise.all([
    fetch('/Index.html?e2e-shell-check=1',{cache:'no-store'}).then(r=>r.text()),
    fetch('/insight_shell_boot_v1.js?e2e-shell-check=1',{cache:'no-store'}).then(r=>r.text()),
    fetch('/insight_shell_loader_v1.js?e2e-shell-check=1',{cache:'no-store'}).then(r=>r.text()),
    fetch('/insight_payload_source_v1.html?e2e-shell-check=1',{cache:'no-store'}).then(r=>r.text())
  ]));
  const [source,boot,loader,payload]=sources;
  expect(source).toContain('name="insight-shell-version" content="20261006-csp-style-shell-1"');
  expect(source).toContain('insight_shell_boot_v1.js?v=20261006-csp-style-shell-1');
  expect(source).toContain('insight_shell_loader_v1.js?v=20261006-csp-style-shell-1');
  expect(source).toContain('insight_shell_v1.css?v=20261006-csp-style-shell-1');
  expect(source).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(source).not.toMatch(/<style\b/i);
  expect(source).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(source).toMatch(/style-src 'self';/);
  expect(source).not.toMatch(/style-src[^;]*'unsafe-inline'/);
  expect(boot).toContain("fetch('./Index.html?insight_probe='+Date.now(),{cache:'no-store'})");
  expect(loader).toContain("fetch('./insight_shell_loader_v1.js?insight_manifest_probe='+Date.now(),{cache:'no-store'})");
  expect(loader).toContain("fetch('./insight_payload_source_v1.html?v=20261006-static-styles-1',{cache:'no-store'})");
  expect(loader).toContain('function featureSignature(entries)');
  expect(source).toContain('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js');
  expect(source).toContain('integrity="sha512-CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw=="');
  expect(loader).not.toContain('stripPayloadChartScript');
  expect(payload).toContain('insight_payload_core_v1.css?v=20261007-step3-donut-mode-css-1');
  expect(payload).toContain('insight_payload_core_v1.js?v=20261007-step4-ai-position-css-1');
  expect(payload).toContain('insight_payload_ai_legacy_v1.js?v=20261006-payload-assets-1');
  expect(payload).toContain('insight_payload_bindings_v1.js?v=20261006-inline-bindings-1');
  expect(payload).not.toMatch(/\son(?:click|change)\s*=/i);
  expect(await page.evaluate(()=>!!window.InsightPayloadBindings)).toBe(true);
  expect(payload).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(payload).not.toMatch(/<style\b/i);
  expect(payload).not.toMatch(/\sstyle\s*=/i);
  expect(source+loader).not.toContain('insight_bootstrap_patches_v1.js');
  expect(source+loader).not.toContain('InsightBootstrapPatches');
  expect(await page.evaluate(()=>typeof Chart)).not.toBe('undefined');
  expect(await page.evaluate(()=>({
    fog:WX_ICONS['霧'],
    freezing:WX_ICONS['凍雨'],
    thunder:WX_ICONS['雷雨'],
    runtime:!!window.InsightWeatherIconCompat
  }))).toEqual({fog:'🌫️',freezing:'🧊',thunder:'🌩️',runtime:true});
  expect(await page.evaluate(()=>({
    keys:Array.from(WX_KEYS),
    runtime:!!window.InsightWeatherKeysCompat
  }))).toEqual({keys:['快晴','晴','晴曇','曇','小雨','雨','大雨','みぞれ','雪','霧','凍雨','雷雨'],runtime:true});
  expect(boot).toContain("location.replace('./Index.html?insight_build='+encodeURIComponent(m[1]))");
  expect(loader).toContain("'&insight_manifest='+encodeURIComponent(remoteFeatureSignature)");
  const storeMenu=page.locator('#storeMenu');
  await expect(storeMenu).toBeHidden();
  await page.locator('#storeMenuBtn').click();
  await expect(storeMenu).toHaveClass(/is-open/);
  await expect(storeMenu).toBeVisible();
  expect(await storeMenu.evaluate(node=>getComputedStyle(node).display)).toBe('block');
  await page.waitForTimeout(75);
  await page.locator('#main').click({position:{x:200,y:200}});
  await expect(storeMenu).not.toHaveClass(/is-open/);
  await expect(storeMenu).toBeHidden();
  expect(errors).toEqual([]);
});

test('サイドバー下部は設定だけを表示し管理項目は設定ページへ集約する',async({page})=>{
  const errors=await openInsight(page);
  const sidebar=page.locator('.sidebar-btns');
  await expect(sidebar.locator('#navSettings')).toBeVisible();
  await expect(sidebar.locator('button')).toHaveCount(1);
  await expect(sidebar.locator('#backupBtn')).toHaveCount(0);
  await expect(sidebar.locator('#darkModeBtn')).toHaveCount(0);
  await expect(sidebar.locator('#insightDataHealthButton')).toHaveCount(0);

  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);
  await expect(page.locator('#pageSettings > .page-header > .page-title')).toHaveText('設定');
  await expect(page.locator('#insightSettingsDataActions #backupBtn')).toBeVisible();
  await expect(page.locator('#insightSettingsDataActions')).toContainText('データ復元');
  await expect(page.locator('#insightSettingsDataActions #insightDataHealthButton')).toBeVisible();
  await expect(page.locator('#insightSettingsDataActions')).toContainText('CSVインポート');
  await expect(page.locator('#insightSettingsDisplayActions')).toHaveCount(0);
  await expect(page.locator('#pageSettings #darkModeBtn')).toHaveCount(0);
  await expect(page.locator('#insightThemeBridge #darkModeBtn')).toBeHidden();
  const legacyThemeState=await page.evaluate(()=>({
    bridgeClass:document.getElementById('insightThemeBridge').className,
    bridgeStyle:document.getElementById('insightThemeBridge').getAttribute('style'),
    darkClass:document.getElementById('darkModeBtn').className,
    darkStyle:document.getElementById('darkModeBtn').getAttribute('style')
  }));
  expect(legacyThemeState.bridgeClass).toContain('insight-settings-legacy-hidden');
  expect(legacyThemeState.darkClass).toContain('insight-settings-legacy-hidden');
  expect(legacyThemeState.bridgeStyle).toBeNull();
  expect(legacyThemeState.darkStyle).toBeNull();
  await expect(sidebar.locator('.insight-theme-toggle')).toBeVisible();
  expect(errors).toEqual([]);
});

test('年間サマリーは買上点数を表示せず残り項目の縦可読性を上げる',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav1').click();
  await page.waitForFunction(()=>window.InsightAnnualSummaryDisplay&&window.InsightAnnualSummaryDisplay.getState().found);
  await expect.poll(()=>page.evaluate(()=>window.InsightAnnualSummaryDisplay.getState())).toEqual({found:true,removed:true,metricCount:3});
  const annual=page.locator('.insight-annual-summary-enhanced');
  await expect(annual).toBeVisible();
  await expect(annual.getByText(/買上点数/)).toHaveCount(0);
  const typography=await annual.evaluate(node=>{
    const label=node.querySelector('.insight-annual-summary-metric-label');
    const value=node.querySelector('.insight-annual-summary-metric-value');
    const title=node.querySelector('.insight-annual-summary-title');
    const metric=node.querySelector('.insight-annual-summary-metric');
    return {
      title:title?getComputedStyle(title).fontSize:null,
      label:label?getComputedStyle(label).fontSize:null,
      value:value?getComputedStyle(value).fontSize:null,
      paddingTop:metric?getComputedStyle(metric).paddingTop:null,
      paddingBottom:metric?getComputedStyle(metric).paddingBottom:null
    };
  });
  expect(typography.title).toBe('16px');
  expect(typography.label).toBe('13px');
  expect(typography.value).toBe('18px');
  expect(typography.paddingTop).toBe('6px');
  expect(typography.paddingBottom).toBe('6px');
  expect(errors).toEqual([]);
});

test('STEP17の文字階層をダッシュボード・入力・販売数・分析AI・設定へ横展開する',async({page})=>{
  const errors=await openInsight(page);

  await page.locator('#nav1').click();
  await expect(page.locator('#pageDash .kpi-label').first()).toBeVisible();
  await expect(page.locator('#pageDash .kpi-label>span')).toHaveCount(0);
  const dashboardType=await page.evaluate(()=>{
    const label=document.querySelector('#pageDash .kpi-label');
    const cards=Array.from(document.querySelectorAll('#pageDash .kpi-card'));
    return {
      kpiLabel:getComputedStyle(label).fontSize,
      cards:cards.map(card=>{
        const value=card.querySelector('.kpi-value');
        const yoy=card.querySelector('.kpi-yoy');
        const label=card.querySelector('.kpi-label');
        return {
          height:getComputedStyle(card).height,
          boxSizing:getComputedStyle(card).boxSizing,
          position:getComputedStyle(card).position,
          client:card.clientHeight,
          scroll:card.scrollHeight,
          text:String(card.innerText||''),
          labelPosition:label?getComputedStyle(label).position:null,
          cardStyle:{
            overflow:getComputedStyle(card).overflow,
            borderRadius:getComputedStyle(card).borderRadius,
            backgroundColor:getComputedStyle(card).backgroundColor,
            boxShadow:getComputedStyle(card).boxShadow
          },
          value:value?{
            position:getComputedStyle(value).position,
            left:getComputedStyle(value).left,
            top:getComputedStyle(value).top,
            textAlign:getComputedStyle(value).textAlign,
            transform:getComputedStyle(value).transform,
            fontSize:getComputedStyle(value).fontSize,
            fontWeight:getComputedStyle(value).fontWeight
          }:null,
          yoy:yoy?(()=>{
            const badge=yoy.querySelector('.kpi-badge');
            const prev=yoy.querySelector('.kpi-prev');
            const yr=yoy.getBoundingClientRect();
            const br=badge?badge.getBoundingClientRect():null;
            const pr=prev?prev.getBoundingClientRect():null;
            return {
              position:getComputedStyle(yoy).position,
              left:getComputedStyle(yoy).left,
              right:getComputedStyle(yoy).right,
              bottom:getComputedStyle(yoy).bottom,
              height:getComputedStyle(yoy).height,
              justifyContent:getComputedStyle(yoy).justifyContent,
              flexWrap:getComputedStyle(yoy).flexWrap,
              columnGap:getComputedStyle(yoy).columnGap,
              paddingLeft:getComputedStyle(yoy).paddingLeft,
              paddingRight:getComputedStyle(yoy).paddingRight,
              overflow:getComputedStyle(yoy).overflow,
              backgroundColor:getComputedStyle(yoy).backgroundColor,
              borderTopWidth:getComputedStyle(yoy).borderTopWidth,
              prevText:prev?prev.textContent:'',
              prevFontSize:prev?getComputedStyle(prev).fontSize:null,
              badgeFontSize:badge?getComputedStyle(badge).fontSize:null,
              badgeWhiteSpace:badge?getComputedStyle(badge).whiteSpace:null,
              prevWhiteSpace:prev?getComputedStyle(prev).whiteSpace:null,
              badgeRect:br?{left:br.left,right:br.right,top:br.top,bottom:br.bottom,height:br.height}:null,
              prevRect:pr?{left:pr.left,right:pr.right,top:pr.top,bottom:pr.bottom,height:pr.height}:null,
              yoyRect:{left:yr.left,right:yr.right,top:yr.top,bottom:yr.bottom,height:yr.height}
            };
          })():null
        };
      })
    };
  });
  expect(dashboardType.kpiLabel).toBe('13px');
  expect(dashboardType.cards.length).toBeGreaterThan(0);
  const primaryKpiColorStates=await page.evaluate(()=>Array.from(document.querySelectorAll('#pageDash #kpiRow .kpi-card[data-key]')).map(card=>{
    const value=card.querySelector('.kpi-value');
    return {
      key:card.dataset.key||'',
      inlineColor:value?value.style.color:'',
      normal:value?value.classList.contains('insight-kpi-value-normal'):false,
      alert:value?value.classList.contains('insight-kpi-value-alert'):false,
      computedColor:value?getComputedStyle(value).color:null
    };
  }));
  expect(primaryKpiColorStates.length).toBeGreaterThan(0);
  primaryKpiColorStates.forEach(item=>{
    expect(item.inlineColor).toBe('');
    expect(Number(item.normal)+Number(item.alert)).toBe(1);
    expect(['rgb(26, 26, 26)','rgb(220, 38, 38)']).toContain(item.computedColor);
  });

  dashboardType.cards.forEach(card=>{
    expect(card.height).toBe('110px');
    expect(card.boxSizing).toBe('border-box');
    expect(card.position).toBe('relative');
    expect(card.scroll).toBeLessThanOrEqual(card.client+2);
    expect(card.labelPosition).toBe('absolute');
    expect(card.cardStyle.overflow).toBe('hidden');
    expect(card.cardStyle.borderRadius).toBe('16px');
    expect(card.cardStyle.boxShadow).not.toBe('none');
    expect(card.value).not.toBeNull();
    expect(card.value.position).toBe('absolute');
    expect(card.value.left).toBe('16px');
    expect(card.value.top).toBe('39px');
    expect(card.value.textAlign).toBe('left');
    expect(card.value.transform).toBe('none');
    expect(card.value.fontSize).toBe('24px');
    expect(Number(card.value.fontWeight)).toBeGreaterThanOrEqual(700);
    if(card.yoy){
      expect(card.yoy.position).toBe('absolute');
      expect(card.yoy.left).toBe('0px');
      expect(card.yoy.right).toBe('0px');
      expect(card.yoy.bottom).toBe('0px');
      expect(card.yoy.height).toBe('31px');
      expect(card.yoy.justifyContent).toBe('space-between');
      expect(card.yoy.flexWrap).toBe('nowrap');
      expect(card.yoy.columnGap).toBe('6px');
      expect(card.yoy.paddingLeft).toBe('10px');
      expect(card.yoy.paddingRight).toBe('10px');
      expect(card.yoy.overflow).toBe('hidden');
      expect(card.yoy.borderTopWidth).toBe('1px');
      expect(card.yoy.prevText).toMatch(/^\d{4}年比$/);
      expect(card.yoy.prevFontSize).toBe('11px');
      expect(card.yoy.badgeFontSize).toBe('11.5px');
      expect(card.yoy.badgeWhiteSpace).toBe('nowrap');
      expect(card.yoy.prevWhiteSpace).toBe('nowrap');
      expect(card.yoy.badgeRect.left).toBeGreaterThanOrEqual(card.yoy.yoyRect.left+9);
      expect(card.yoy.prevRect.right).toBeLessThanOrEqual(card.yoy.yoyRect.right-9);
      expect(card.yoy.badgeRect.right).toBeLessThanOrEqual(card.yoy.prevRect.left-5);
      expect(card.yoy.badgeRect.height).toBeLessThanOrEqual(14);
      expect(card.yoy.prevRect.height).toBeLessThanOrEqual(14);
    }
    expect(card.text).not.toMatch(/\d{1,2}月1日平均/);
    expect(card.text.split('\n').map(line=>line.trim())).not.toContainEqual(expect.stringMatching(/^\d{1,2}月$/));
  });

  await page.locator('#nav2').click();
  await expect(page.locator('#pageSales #issRow .iss-card')).toBeVisible();
  const salesType=await page.evaluate(()=>{
    const table=document.querySelector('#pageSales .table-card');
    const control=table&&table.querySelector('input,select,button');
    return {
      title:getComputedStyle(document.querySelector('#pageSales #issRow .iss-title')).fontSize,
      label:getComputedStyle(document.querySelector('#pageSales #issRow .iss-stat')).fontSize,
      value:getComputedStyle(document.querySelector('#pageSales #issRow .iss-stat strong')).fontSize,
      note:getComputedStyle(document.querySelector('#pageSales #issRow .iss-note')).fontSize,
      dailyAverage:getComputedStyle(document.querySelector('#pageSales #issDailyAverage')).fontSize,
      table:table?getComputedStyle(table).fontSize:null,
      control:control?getComputedStyle(control).fontSize:null
    };
  });
  expect(salesType).toEqual({title:'15px',label:'13px',value:'20px',note:'12px',dailyAverage:'12.5px',table:'13px',control:'13px'});

  await page.locator('#nav3').click();
  await expect(page.locator('#pageKyaku #ikyRow .iky-card')).toBeVisible();
  const customerType=await page.evaluate(()=>({
    title:getComputedStyle(document.querySelector('#pageKyaku #ikyRow .iky-title')).fontSize,
    label:getComputedStyle(document.querySelector('#pageKyaku #ikyRow .iky-stat')).fontSize,
    value:getComputedStyle(document.querySelector('#pageKyaku #ikyRow .iky-stat strong')).fontSize,
    note:getComputedStyle(document.querySelector('#pageKyaku #ikyRow .iky-note')).fontSize,
    dailyAverage:getComputedStyle(document.querySelector('#pageKyaku #ikyDailyAverage')).fontSize
  }));
  expect(customerType).toEqual({title:'15px',label:'13px',value:'20px',note:'12px',dailyAverage:'12.5px'});

  await page.locator('#nav4').click();
  await expect(page.locator('#iwcRow .iwc-card')).toHaveCount(2);
  const wasteType=await page.evaluate(()=>({
    title:getComputedStyle(document.querySelector('#iwcRow .iwc-title')).fontSize,
    kpiLabel:getComputedStyle(document.querySelector('#iwcRow .iwc-kpi-label')).fontSize,
    kpiValue:getComputedStyle(document.querySelector('#iwcRow .iwc-kpi-value')).fontSize,
    cards:Array.from(document.querySelectorAll('#iwcRow .iwc-card')).map(card=>({client:card.clientHeight,scroll:card.scrollHeight}))
  }));
  expect(wasteType.title).toBe('14px');
  expect(wasteType.kpiLabel).toBe('11.5px');
  expect(wasteType.kpiValue).toBe('16px');
  wasteType.cards.forEach(card=>expect(card.scroll).toBeLessThanOrEqual(card.client+2));

  await page.locator('#navSalesCount').click();
  const salesCountType=await page.evaluate(()=>{
    const calendar=document.querySelector('#pageSalesCount .sc-calendar');
    const averageGrid=document.querySelector('#pageSalesCount .sc-average-grid');
    const day=document.querySelector('#pageSalesCount .sc-day:not(.empty)');
    const averageDay=document.querySelector('#pageSalesCount .sc-average-day');
    return {
      toolbar:getComputedStyle(document.querySelector('#pageSalesCount .sc-toolbar')).fontSize,
      tripLabel:getComputedStyle(document.querySelector('#pageSalesCount .sc-col-head')).fontSize,
      input:getComputedStyle(document.querySelector('#pageSalesCount .sc-trip input')).fontSize,
      averageTitle:getComputedStyle(document.querySelector('#pageSalesCount .sc-average-title')).fontSize,
      calendarGap:getComputedStyle(calendar).columnGap,
      averageGap:getComputedStyle(averageGrid).columnGap,
      dayWidth:day.getBoundingClientRect().width,
      averageDayWidth:averageDay.getBoundingClientRect().width
    };
  });
  expect(salesCountType.toolbar).toBe('13.5px');
  expect(salesCountType.tripLabel).toBe('12.5px');
  expect(salesCountType.input).toBe('13.5px');
  expect(salesCountType.averageTitle).toBe('16px');
  expect(salesCountType.calendarGap).toBe('8px');
  expect(salesCountType.averageGap).toBe('8px');
  expect(salesCountType.dayWidth).toBeGreaterThanOrEqual(160);
  expect(salesCountType.averageDayWidth).toBeGreaterThanOrEqual(160);

  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  const aiType=await page.evaluate(()=>({
    cardTitle:getComputedStyle(document.querySelector('.ai-analysis-workspace .ai-analysis-card-title')).fontSize,
    period:getComputedStyle(document.querySelector('.ai-workspace-period-btn')).fontSize,
    question:getComputedStyle(document.querySelector('.ai-analysis-question-input')).fontSize
  }));
  expect(aiType).toEqual({cardTitle:'13px',period:'13px',question:'14px'});
  await page.locator('.ai-workspace-close').click();

  await page.locator('#navSettings').click();
  const settingsType=await page.evaluate(()=>({
    heading:getComputedStyle(document.querySelector('#pageSettings .insight-settings-section h2')).fontSize,
    help:getComputedStyle(document.querySelector('#pageSettings .insight-settings-section>p')).fontSize,
    action:getComputedStyle(document.querySelector('#pageSettings .insight-settings-actions .sidebar-btn')).fontSize
  }));
  expect(settingsType).toEqual({heading:'17px',help:'13px',action:'14px'});
  expect(errors).toEqual([]);
});

test('販売数入力カレンダーは11インチiPad横幅で親領域から見切れない',async({page})=>{
  await page.setViewportSize({width:1194,height:834});
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();
  await expect(page.locator('#pageSalesCount .sc-calendar')).toBeVisible();
  const layout=await page.evaluate(()=>{
    const main=document.getElementById('main');
    const pageRoot=document.getElementById('pageSalesCount');
    const calendar=document.querySelector('#pageSalesCount .sc-calendar');
    const averageGrid=document.querySelector('#pageSalesCount .sc-average-grid');
    function read(grid,cardSelector){
      const cards=Array.from(grid.querySelectorAll(cardSelector)).filter(node=>!node.classList.contains('empty'));
      const gridRect=grid.getBoundingClientRect();
      const first=cards[0]&&cards[0].getBoundingClientRect();
      const last=cards.length&&cards[cards.length-1].getBoundingClientRect();
      return {
        clientWidth:grid.clientWidth,
        scrollWidth:grid.scrollWidth,
        gap:getComputedStyle(grid).columnGap,
        template:getComputedStyle(grid).gridTemplateColumns,
        firstLeft:first?first.left:null,
        lastRight:last?last.right:null,
        gridLeft:gridRect.left,
        gridRight:gridRect.right
      };
    }
    const mainRect=main.getBoundingClientRect();
    const pageRect=pageRoot.getBoundingClientRect();
    return {
      main:{
        left:mainRect.left,
        right:mainRect.right,
        clientWidth:main.clientWidth,
        scrollWidth:main.scrollWidth,
        paddingLeft:getComputedStyle(main).paddingLeft,
        paddingRight:getComputedStyle(main).paddingRight,
        boxSizing:getComputedStyle(main).boxSizing
      },
      page:{left:pageRect.left,right:pageRect.right,clientWidth:pageRoot.clientWidth,scrollWidth:pageRoot.scrollWidth,boxSizing:getComputedStyle(pageRoot).boxSizing},
      calendar:read(calendar,'.sc-day'),
      average:read(averageGrid,'.sc-average-day')
    };
  });
  expect(layout.main.paddingLeft).toBe('0px');
  expect(layout.main.paddingRight).toBe('0px');
  expect(layout.main.boxSizing).toBe('border-box');
  expect(layout.page.boxSizing).toBe('border-box');
  expect(layout.page.right).toBeLessThanOrEqual(layout.main.right+1);
  expect(layout.page.scrollWidth).toBeLessThanOrEqual(layout.page.clientWidth+1);
  for(const item of [layout.calendar,layout.average]){
    expect(item.gap).toBe('6px');
    expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth+1);
    expect(item.firstLeft).toBeGreaterThanOrEqual(item.gridLeft-1);
    expect(item.lastRight).toBeLessThanOrEqual(item.gridRight+1);
    expect(item.gridRight).toBeLessThanOrEqual(layout.page.right+1);
  }
  expect(errors).toEqual([]);
});

test('設定ボタンは他のサイドバーナビと文字・アイコン配置を揃える',async({page})=>{
  const errors=await openInsight(page);
  const styles=await page.evaluate(()=>{
    function read(id){
      const button=document.getElementById(id);
      const icon=button&&button.querySelector('.nav-icon');
      if(!button||!icon)return null;
      const cs=getComputedStyle(button),is=getComputedStyle(icon);
      return {
        fontSize:cs.fontSize,
        fontWeight:cs.fontWeight,
        lineHeight:cs.lineHeight,
        letterSpacing:cs.letterSpacing,
        gap:cs.gap,
        alignItems:cs.alignItems,
        paddingTop:cs.paddingTop,
        paddingRight:cs.paddingRight,
        paddingBottom:cs.paddingBottom,
        paddingLeft:cs.paddingLeft,
        iconWidth:is.width,
        iconHeight:is.height
      };
    }
    return {settings:read('navSettings'),reference:read('navSalesCount')};
  });
  expect(styles.settings).not.toBeNull();
  expect(styles.reference).not.toBeNull();
  expect(styles.settings).toEqual(styles.reference);
  expect(errors).toEqual([]);
});

test('クイック入力の最高・最低気温は表示され入力に応じて平均気温を更新する',async({page})=>{
  const errors=await openInsight(page);
  const max=page.locator('#qi_tempMaxC');
  const min=page.locator('#qi_tempMinC');
  const avg=page.locator('#qi_tempAvgC');

  await expect(max).toBeVisible();
  await expect(min).toBeVisible();
  await expect(max).toBeEnabled();
  await expect(min).toBeEnabled();

  await max.fill('30');
  await min.fill('20');
  await expect(avg).toHaveText('25.0℃');
  expect(errors).toEqual([]);
});

test('クイック入力の天気ポップアップは表示・選択・既存天気状態との同期を維持する',async({page})=>{
  const errors=await openInsight(page);
  const trigger=page.locator('#qWeatherCompactTrigger');
  const menu=page.locator('#qWeatherCompactMenu');
  await expect(trigger).toBeVisible();
  await expect(page.locator('#qWeatherSel')).toBeHidden();

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded','true');

  await menu.locator('.qwc-option[data-wx="晴"]').click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded','false');
  await expect(trigger.locator('.qwc-label')).toHaveText('晴');
  await expect(page.locator('#qWeatherSel .wx-btn[data-wx="晴"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('ライトモードの基準年selectは黒背景でも標準矢印を見える配色で描画する',async({page})=>{
  const errors=await openInsight(page);
  const toggle=page.locator('.insight-theme-switch-track');
  const wasDark=await page.evaluate(()=>document.documentElement.classList.contains('dark')||document.body.classList.contains('dark'));
  if(wasDark){
    await toggle.click();
    await page.waitForFunction(()=>!(document.documentElement.classList.contains('dark')||document.body.classList.contains('dark')));
  }
  const style=await page.evaluate(()=>{
    const select=document.getElementById('baseYearSel');
    const cs=getComputedStyle(select);
    return {
      background:cs.backgroundColor,
      color:cs.color,
      colorScheme:cs.colorScheme
    };
  });
  expect(style.background).toBe('rgb(26, 26, 26)');
  expect(style.color).toBe('rgb(255, 255, 255)');
  expect(style.colorScheme).toContain('dark');
  expect(errors).toEqual([]);
});

test('ダークモードはFirefox系のプラム・紫・ワイン配色を使う',async({page})=>{
  const errors=await openInsight(page);
  const toggle=page.locator('.insight-theme-switch-track');
  const wasDark=await page.evaluate(()=>document.documentElement.classList.contains('dark')||document.body.classList.contains('dark'));
  if(wasDark){
    await toggle.click();
    await page.waitForFunction(()=>!(document.documentElement.classList.contains('dark')||document.body.classList.contains('dark')));
  }
  await toggle.click();
  await page.waitForFunction(()=>document.documentElement.classList.contains('dark')||document.body.classList.contains('dark'));
  const palette=await page.evaluate(()=>({
    bg:getComputedStyle(document.body).getPropertyValue('--bg').trim(),
    surface:getComputedStyle(document.body).getPropertyValue('--surface').trim(),
    surface2:getComputedStyle(document.body).getPropertyValue('--surface2').trim(),
    border:getComputedStyle(document.body).getPropertyValue('--border').trim(),
    text:getComputedStyle(document.body).getPropertyValue('--text').trim(),
    meta:document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    theme:window.InsightDarkTheme.palette
  }));
  expect(palette.bg).toBe('#251b26');
  expect(palette.surface).toBe('#2f2942');
  expect(palette.surface2).toBe('#342c45');
  expect(palette.border).toBe('#554a5e');
  expect(palette.text).toBe('#e2e2ea');
  expect(palette.meta).toBe('#251b26');
  expect(palette.theme.wine).toBe('#432325');
  expect(errors).toEqual([]);
});

test('バックアップ経過表示はinline色ではなく状態classで切り替える',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSettings').click();
  await expect(page.locator('#backupDaysLabel')).toBeAttached();
  async function read(){
    return page.locator('#backupDaysLabel').evaluate(node=>({text:node.textContent,className:node.className,color:getComputedStyle(node).color,inlineColor:node.style.color}));
  }
  await page.evaluate(()=>{localStorage.removeItem('insight_last_backup');updateBackupDaysLabel();});
  expect(await read()).toMatchObject({text:'未バックアップ',color:'rgb(220, 38, 38)',inlineColor:''});
  await page.evaluate(()=>{localStorage.setItem('insight_last_backup',String(Date.now()));updateBackupDaysLabel();});
  expect(await read()).toMatchObject({text:'今日バックアップ済',color:'rgb(21, 128, 61)',inlineColor:''});
  await page.evaluate(()=>{localStorage.setItem('insight_last_backup',String(Date.now()-3*24*60*60*1000));updateBackupDaysLabel();});
  expect(await read()).toMatchObject({text:'3日前',color:'rgb(136, 136, 136)',inlineColor:''});
  await page.evaluate(()=>{localStorage.setItem('insight_last_backup',String(Date.now()-8*24*60*60*1000));updateBackupDaysLabel();});
  expect(await read()).toMatchObject({text:'8日経過 ⚠️',color:'rgb(220, 38, 38)',inlineColor:''});
  expect(errors).toEqual([]);
});

test('通常バックアップはメタ情報を含み復元前に内容と検査結果を確認できる',async({page})=>{
  const errors=await openInsight(page);
  const expected=await page.evaluate(()=>({
    storeCount:Object.keys(allStores.stores).length,
    years:Array.from(new Set(Object.values(allStores.stores).flatMap(st=>st.years.map(String)))).sort()
  }));

  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#backupBtn').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Insight_backup_all_stores_\d{8}_\d{6}\.json$/);
  const downloadPath=await download.path();
  const backup=JSON.parse(fs.readFileSync(downloadPath,'utf8'));
  expect(backup.backupInfo.format).toBe('InsightBackup');
  expect(backup.backupInfo.formatVersion).toBe(2);
  expect(Number.isFinite(Date.parse(backup.backupInfo.createdAt))).toBe(true);
  expect(backup.backupInfo.storeCount).toBe(expected.storeCount);
  expect(backup.backupInfo.years).toEqual(expected.years);
  expect(backup.backupInfo.stores).toHaveLength(expected.storeCount);
  expect(backup.data&&backup.data.stores).toBeTruthy();

  const dialogPromise=page.waitForEvent('dialog');
  const setFile=page.locator('#restoreFile').setInputFiles(downloadPath);
  const dialog=await dialogPromise;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toContain('バックアップ日時：');
  expect(dialog.message()).toContain('店舗数：'+expected.storeCount);
  expect(dialog.message()).toContain('対象年度：'+expected.years.join(' / '));
  expect(dialog.message()).toContain('復元前検査：正常');
  await dialog.dismiss();
  await setFile;
  expect(errors).toEqual([]);
});

test('復元確定時は上書き前のデータを自動ダウンロードして設定ページを維持する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);

  const manualDownloadPromise=page.waitForEvent('download');
  await page.locator('#backupBtn').click();
  const manualDownload=await manualDownloadPromise;
  const restorePath=await manualDownload.path();
  const before=await page.evaluate(()=>JSON.parse(JSON.stringify(allStores)));

  const dialogPromise=page.waitForEvent('dialog');
  const fileAction=page.locator('#restoreFile').setInputFiles(restorePath);
  const dialog=await dialogPromise;
  expect(dialog.type()).toBe('confirm');

  const safetyDownloadPromise=page.waitForEvent('download');
  await dialog.accept();
  const safetyDownload=await safetyDownloadPromise;
  await fileAction;

  expect(safetyDownload.suggestedFilename()).toMatch(/^Insight_pre_restore_\d{8}_\d{6}\.json$/);
  const safetyPath=await safetyDownload.path();
  const safety=JSON.parse(fs.readFileSync(safetyPath,'utf8'));
  expect(safety.backupInfo.format).toBe('InsightBackup');
  expect(safety.backupInfo.formatVersion).toBe(2);
  expect(safety.backupInfo.backupType).toBe('preRestore');
  expect(safety.data.stores).toEqual(before.stores);
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);
  await expect(page.locator('#navSettings')).toHaveClass(/active/);
  await expect(page.getByText('データを復元しました（整合性確認済み）')).toBeVisible();
  expect(errors).toEqual([]);
});

test('復元後検査で異常を検出した場合は復元前データへ自動で戻す',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSettings').click();

  const backupDownloadPromise=page.waitForEvent('download');
  await page.locator('#backupBtn').click();
  const targetBackup=await backupDownloadPromise;
  const targetPath=await targetBackup.path();

  await page.evaluate(()=>{
    const st=allStores.stores[allStores.current];
    const year=String(st.years[0]),month='1月';
    st.data[year][month][0].storeMemo='E2E自動ロールバック保持';
    persist();
  });
  const rawBefore=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(rawBefore).toContain('E2E自動ロールバック保持');

  await page.evaluate(()=>{
    const original=window.InsightStorage.readSnapshot.bind(window.InsightStorage);
    let reads=0;
    window.InsightStorage.readSnapshot=function(){
      reads++;
      const value=original();
      if(reads===1)value.current='__e2e_invalid_store__';
      return value;
    };
  });

  const confirmPromise=page.waitForEvent('dialog');
  const fileAction=page.locator('#restoreFile').setInputFiles(targetPath);
  const confirmDialog=await confirmPromise;
  expect(confirmDialog.type()).toBe('confirm');

  const safetyDownloadPromise=page.waitForEvent('download');
  const rollbackAlertPromise=page.waitForEvent('dialog');
  await confirmDialog.accept();
  const safetyDownload=await safetyDownloadPromise;
  expect(safetyDownload.suggestedFilename()).toMatch(/^Insight_pre_restore_\d{8}_\d{6}\.json$/);

  const rollbackAlert=await rollbackAlertPromise;
  expect(rollbackAlert.type()).toBe('alert');
  expect(rollbackAlert.message()).toContain('復元前の状態へ自動で戻しました');
  await rollbackAlert.accept();
  await fileAction;

  const rawAfter=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(rawAfter).toBe(rawBefore);
  expect(rawAfter).toContain('E2E自動ロールバック保持');
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);
  expect(errors).toEqual([]);
});

test('保存したデータはページ再読込後も復元される',async({page})=>{
  const errors=await openInsight(page);
  const expected=await page.evaluate(()=>{
    const storeId=allStores.current;
    const st=allStores.stores[storeId];
    const year=String(st.years[0]);
    const month='1月';
    if(!st.data[year]||!st.data[year][month])throw new Error('fixture month unavailable');
    st.data[year][month][0].storeMemo='E2E再読込保持';
    st.hourlyCustomers=st.hourlyCustomers||{};
    st.hourlyCustomers['2026-10-02']=Array.from({length:24},(_,hour)=>hour);
    allStores.eventManagement=allStores.eventManagement||{version:1,presets:[],events:[]};
    allStores.eventManagement.specialPresets=[{id:'reload_preset',snapshot:{version:1,title:'E2E再読込催事',note:'保持確認'}}];
    persist();
    return {storeId,year};
  });

  const rawBefore=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(rawBefore).toContain('E2E再読込保持');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightStorage&&window.InsightHourlyCustomers&&window.InsightEvents);

  const restored=await page.evaluate(({storeId,year})=>{
    const st=allStores.stores[storeId];
    return {
      memo:st.data[year]['1月'][0].storeMemo,
      hourly:st.hourlyCustomers['2026-10-02'],
      preset:allStores.eventManagement.specialPresets[0].snapshot.title,
      raw:localStorage.getItem('insight_v11')
    };
  },expected);
  expect(restored.memo).toBe('E2E再読込保持');
  expect(restored.hourly).toHaveLength(24);
  expect(restored.hourly[23]).toBe(23);
  expect(restored.preset).toBe('E2E再読込催事');
  expect(restored.raw).toBe(rawBefore);
  expect(errors).toEqual([]);
});

test('年度一覧にない古い疎データは起動を妨げず正式年度を復元する',async({page})=>{
  const errors=await openInsight(page);
  const expected=await page.evaluate(()=>{
    const storeId=allStores.current;
    const st=allStores.stores[storeId];
    const activeYear=String(st.years[st.years.length-1]);
    st.data['1999']={'8月':[null,null,{d:'3',売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:{},weather:'晴'}]};
    if(st.years.includes('1999'))st.years=st.years.filter(y=>y!=='1999');
    st.data[activeYear]['1月'][0].storeMemo='E2E正式年度保持';
    persist();
    return {storeId,activeYear};
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await expect(page.locator('#insightStorageLoadError')).toHaveCount(0);
  const restored=await page.evaluate(({storeId,activeYear})=>{
    const st=allStores.stores[storeId];
    return {
      memo:st.data[activeYear]['1月'][0].storeMemo,
      orphan:st.data['1999']['8月'],
      years:st.years.slice()
    };
  },expected);
  expect(restored.memo).toBe('E2E正式年度保持');
  expect(restored.years).not.toContain('1999');
  expect(restored.orphan[0]).toBeNull();
  expect(restored.orphan[1]).toBeNull();
  expect(errors).toEqual([]);
});

test('データ状態チェックは未登録年度を要確認表示し保存内容を変更しない',async({page})=>{
  const errors=await openInsight(page);
  await page.waitForFunction(()=>window.InsightDataHealth&&document.getElementById('insightDataHealthButton'));
  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings')).toHaveClass(/show/);
  await expect(page.locator('#insightDataHealthButton')).toBeVisible();

  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    store.data['1999']={'8月':[null,null,{d:'3',売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:{},weather:'晴'}]};
    store.years=store.years.filter(y=>String(y)!=='1999');
    store.monthlyOps=store.monthlyOps||{};
    store.monthlyOps['1999']={'8月':{laborCostYen:1,grossMarginRate:1}};
    store.salesCounts=store.salesCounts||{};
    store.salesCounts['1999-08-03']={};
    store.hourlyCustomers=store.hourlyCustomers||{};
    store.hourlyCustomers['1999-08-03']=Array(24).fill(null);
    persist();
    window.InsightDataHealth.refresh();
  });

  const rawBefore=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  await expect(page.locator('#insightDataHealthButton')).toContainText('データ状態：要確認');
  await expect(page.locator('#insightDataHealthButton')).toHaveClass(/insight-health-status-error/);
  expect(await page.locator('#insightDataHealthButton').evaluate(node=>getComputedStyle(node).color)).toBe('rgb(180, 35, 24)');
  await page.locator('#insightDataHealthButton').click();
  await expect(page.locator('#insightDataHealthOverlay')).toBeVisible();
  await expect(page.locator('#insightDataHealthSummary')).toContainText('要確認');
  await expect(page.locator('#insightDataHealthSummary')).toHaveClass(/insight-health-status-error/);
  expect(await page.locator('#insightDataHealthSummary').evaluate(node=>getComputedStyle(node).color)).toBe('rgb(180, 35, 24)');
  await expect(page.locator('#insightDataHealthIssues')).toContainText('1999年度');
  await expect(page.locator('#insightDataHealthIssues')).toContainText('正式年度一覧にない');
  const report=await page.evaluate(()=>window.InsightDataHealth.getLastReport());
  expect(report.issues.some(item=>item.code==='orphan_data_year')).toBe(true);
  expect(report.issues.some(item=>item.code==='sales_unregistered_year')).toBe(true);
  expect(report.issues.some(item=>item.code==='hourly_unregistered_year')).toBe(true);
  const rawAfter=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(rawAfter).toBe(rawBefore);
  expect(errors).toEqual([]);
});


test('保存済みデータが壊れている場合は空データで起動せず保存データを保持する',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('insight_v11','{"current":"broken","stores":'));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#insightStorageLoadError')).toBeVisible();
  await expect(page.locator('#insightStorageLoadError')).toContainText('空のデータでは起動していません');
  await expect(page.locator('#insightStorageLoadReason')).toContainText('読込エラー');
  await expect(page.locator('#insightStorageExportRaw')).toBeVisible();
  await expect(page.locator('#nav1')).toHaveCount(0);
  const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  expect(raw).toBe('{"current":"broken","stores":');
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
  const mainSpacing=await page.locator('#main').evaluate(node=>({
    left:getComputedStyle(node).paddingLeft,
    right:getComputedStyle(node).paddingRight,
    boxSizing:getComputedStyle(node).boxSizing
  }));
  expect(mainSpacing).toEqual({left:'0px',right:'0px',boxSizing:'border-box'});
  const dashboardSpacing=await page.locator('#pageDash').evaluate(node=>({
    left:getComputedStyle(node).paddingLeft,
    right:getComputedStyle(node).paddingRight
  }));
  expect(dashboardSpacing).toEqual({left:'12px',right:'12px'});

  for(const selector of ['#nav2','#nav3','#nav4','#navSalesCount','#navSaleResults','#navEventResults']){
    await page.locator(selector).click();
    await expect(page.locator('.page.show > .page-header > .page-title')).toBeVisible();
    const current=await titleRect();
    expect(Math.abs(current.left-reference.left),selector+' left').toBeLessThanOrEqual(1);
    expect(Math.abs(current.top-reference.top),selector+' top').toBeLessThanOrEqual(1);
    const spacing=await page.locator('.page.show').evaluate(node=>({
      left:getComputedStyle(node).paddingLeft,
      right:getComputedStyle(node).paddingRight,
      boxSizing:getComputedStyle(node).boxSizing,
      maxWidth:getComputedStyle(node).maxWidth
    }));
    expect(spacing.left,selector+' padding-left').toBe('12px');
    expect(spacing.right,selector+' padding-right').toBe('12px');
    expect(spacing.boxSizing,selector+' box-sizing').toBe('border-box');
    expect(spacing.maxWidth,selector+' max-width').toBe('100%');
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
  const futureSpacing=await page.locator('#e2eFuturePage').evaluate(node=>({
    left:getComputedStyle(node).paddingLeft,
    right:getComputedStyle(node).paddingRight
  }));
  expect(futureSpacing).toEqual({left:'12px',right:'12px'});
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
  await expect(page.locator('.ai-workspace-title')).toHaveText('分析AI');
  await expect(page.locator('#aiAnalysisPeriod')).toBeHidden();
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

test('セール実績は内容別に表示し開催回ごとに行を分けて7枚ごとに折り返す',async({page})=>{
  const errors=await openInsight(page);

  await page.evaluate(()=>{
    const categoryId='cat_onigiri';
    const storeId=allStores.current;
    if(!allStores.eventManagement)allStores.eventManagement={version:1,presets:[],events:[]};
    allStores.eventManagement.events=(allStores.eventManagement.events||[]).filter(e=>!String(e.id||'').startsWith('e2e_sale_results'));
    allStores.eventManagement.events.push(
      {
        id:'e2e_sale_results_sep',
        type:'sale',
        scope:'global',
        startDate:'2026-09-01',
        endDate:'2026-09-08',
        snapshot:{
          title:'E2Eおにぎりセール',
          note:'対象商品限定\n数量限定 <補足>',
          sale:{categoryId,category:'おにぎり',method:'amount',params:{amount:20}}
        }
      },
      {
        id:'e2e_sale_results_aug',
        type:'sale',
        scope:'global',
        startDate:'2026-08-20',
        endDate:'2026-08-22',
        snapshot:{
          title:'E2Eおにぎりセール',
          note:'対象商品限定\n数量限定 <補足>',
          sale:{categoryId,category:'おにぎり',method:'amount',params:{amount:20}}
        }
      }
    );
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
    for(let day=20;day<=22;day++){
      const date='2026-08-'+String(day).padStart(2,'0');
      store.salesCounts[date]=store.salesCounts[date]||{};
      store.salesCounts[date][categoryId]={
        trips:[
          {delivery:30+day,sales:26+day},
          {delivery:35+day,sales:31+day},
          {delivery:40+day,sales:36+day}
        ]
      };
    }
    window.InsightSaleResults.render();
  });

  await page.locator('#navSaleResults').click();
  await expect(page.locator('#pageSaleResults')).toHaveClass(/show/);
  await expect(page.locator('.sr-group')).toHaveCount(1);
  await expect(page.locator('.sr-group-head h2')).toContainText('おにぎり 20円引き');
  await expect(page.locator('.sr-group-heading .sr-sale-note')).toHaveCount(1);
  await expect(page.locator('.sr-group-heading .sr-sale-note')).toHaveText('対象商品限定\n数量限定 <補足>');
  const saleTypography=await page.locator('.sr-group').first().evaluate(group=>{
    const heading=group.querySelector('.sr-group-head h2');
    const stats=group.querySelector('.sr-group-stats');
    return {
      heading:getComputedStyle(heading).fontSize,
      statLabel:getComputedStyle(group.querySelector('.sr-stat span')).fontSize,
      statValue:getComputedStyle(group.querySelector('.sr-stat strong')).fontSize,
      headAlignItems:getComputedStyle(group.querySelector('.sr-group-head')).alignItems,
      headingTop:heading.getBoundingClientRect().top,
      statsTop:stats.getBoundingClientRect().top
    };
  });
  expect(saleTypography.heading).toBe('17px');
  expect(saleTypography.statLabel).toBe('12px');
  expect(saleTypography.statValue).toBe('16px');
  expect(saleTypography.headAlignItems).toBe('flex-start');
  expect(Math.abs(saleTypography.headingTop-saleTypography.statsTop)).toBeLessThanOrEqual(1);
  const stats=page.locator('.sr-group-stats .sr-stat');
  await expect(stats).toHaveCount(3);
  await expect(stats).toHaveText([/平均納品/,/平均販売/,/消化率/]);
  await expect(page.locator('.sr-group-stats')).not.toContainText('開催日数');
  const statGridColumns=await page.locator('.sr-group-stats').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(statGridColumns).toBe(3);
  await expect(page.locator('.sr-group .sr-day-grid')).toHaveCount(2);
  await expect(page.locator('.sr-group .sr-day-grid').nth(0).locator('.sc-day')).toHaveCount(8);
  await expect(page.locator('.sr-group .sr-day-grid').nth(1).locator('.sc-day')).toHaveCount(3);
  await expect(page.locator('.sr-group .sc-day')).toHaveCount(11);
  const saleResultTotalFont=await page.locator('.sr-group .sc-totals b').first().evaluate(el=>getComputedStyle(el).fontSize);
  expect(saleResultTotalFont).toBe('14px');

  const layout=await page.evaluate(()=>{
    const grids=Array.from(document.querySelectorAll('.sr-group .sr-day-grid'));
    const firstCards=Array.from(grids[0].querySelectorAll('.sc-day'));
    const secondCards=Array.from(grids[1].querySelectorAll('.sc-day'));
    const saleCard=firstCards[0];
    const inputCard=document.querySelector('#scCalendar .sc-day:not(.empty)');
    const gridRect=grids[0].getBoundingClientRect();
    const seventhRect=firstCards[6].getBoundingClientRect();
    return {
      firstTop:firstCards[0].getBoundingClientRect().top,
      seventhTop:seventhRect.top,
      eighthTop:firstCards[7].getBoundingClientRect().top,
      secondOccurrenceTop:secondCards[0].getBoundingClientRect().top,
      seventhRight:seventhRect.right,
      gridRight:gridRect.right,
      gridScrollWidth:grids[0].scrollWidth,
      gridClientWidth:grids[0].clientWidth,
      saleChildren:Array.from(saleCard.children).map(node=>node.className),
      inputChildren:inputCard?Array.from(inputCard.children).map(node=>node.className):[],
      allReadOnly:Array.from(saleCard.querySelectorAll('input')).every(input=>input.readOnly)
    };
  });

  expect(Math.abs(layout.firstTop-layout.seventhTop)).toBeLessThanOrEqual(1);
  expect(layout.eighthTop).toBeGreaterThan(layout.seventhTop+20);
  expect(layout.secondOccurrenceTop).toBeGreaterThan(layout.eighthTop+20);
  expect(layout.seventhRight).toBeLessThanOrEqual(layout.gridRight+1);
  expect(layout.gridScrollWidth).toBeLessThanOrEqual(layout.gridClientWidth+1);
  expect(layout.saleChildren).toEqual(layout.inputChildren);
  expect(layout.allReadOnly).toBe(true);

  const order=await page.evaluate(()=>({
    afterSales:document.getElementById('navSalesCount').nextElementSibling&&document.getElementById('navSalesCount').nextElementSibling.id,
    afterResults:document.getElementById('navSaleResults').nextElementSibling&&document.getElementById('navSaleResults').nextElementSibling.id,
    afterEventResults:document.getElementById('navEventResults').nextElementSibling&&document.getElementById('navEventResults').nextElementSibling.id
  }));
  expect(order.afterSales).toBe('navSaleResults');
  expect(order.afterResults).toBe('navEventResults');
  expect(order.afterEventResults).toBe('aiAnalysisToggle');
  expect(errors).toEqual([]);
});


test('年度管理ボタンは設定へ移動し月ボタンは年度選択行へ配置する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav1').click();
  await page.waitForFunction(()=>window.InsightYearControlsLayout&&window.InsightYearControlsLayout.getState().moved&&window.InsightYearControlsLayout.getState().monthsInline);
  await expect(page.locator('#pageDash').getByRole('button',{name:/年度追加/})).toHaveCount(0);
  await expect(page.locator('#pageDash #insightDeleteYearButton')).toHaveCount(0);
  await expect(page.locator('#modalBg')).toHaveCount(0);
  await expect(page.locator('.btn-del-year')).toHaveCount(0);

  const layout=await page.evaluate(()=>{
    const dash=document.getElementById('pageDash');
    const row=dash.querySelector('.insight-dashboard-year-row');
    const monthRow=row&&Array.from(row.children).find(node=>node.classList.contains('insight-dashboard-inline-months'));
    const months=monthRow?Array.from(monthRow.children).filter(node=>node.tagName==='BUTTON'&&/^(?:[1-9]|1[0-2])月$/.test(node.textContent.trim())):[];
    return {
      selectCount:row?row.querySelectorAll('select').length:0,
      monthCount:months.length,
      monthLabels:months.map(node=>node.textContent.trim()),
      monthRowInside:!!(row&&monthRow&&monthRow.parentElement===row),
      backgrounds:months.map(node=>getComputedStyle(node).backgroundColor),
      colors:months.map(node=>getComputedStyle(node).color),
      selectedLabel:typeof selMonth!=='undefined'?String(selMonth):'',
      selectedCount:months.filter(node=>node.classList.contains('insight-dashboard-selected-month')).length,
      selectedBorderColor:(()=>{const node=months.find(node=>node.classList.contains('insight-dashboard-selected-month'));return node?getComputedStyle(node).borderColor:null;})(),
      selectedBorderWidth:(()=>{const node=months.find(node=>node.classList.contains('insight-dashboard-selected-month'));return node?getComputedStyle(node).borderWidth:null;})(),
      selectedBorderStyle:(()=>{const node=months.find(node=>node.classList.contains('insight-dashboard-selected-month'));return node?getComputedStyle(node).borderStyle:null;})(),
      firstMonthMarginLeft:months[0]?getComputedStyle(months[0]).marginLeft:null
    };
  });
  expect(layout.selectCount).toBeGreaterThanOrEqual(2);
  expect(layout.monthCount).toBe(12);
  expect(layout.monthLabels).toEqual(Array.from({length:12},(_,index)=>String(index+1)+'月'));
  expect(layout.monthRowInside).toBe(true);
  expect(layout.backgrounds).toEqual(Array(12).fill('rgb(255, 255, 255)'));
  expect(new Set(layout.colors).size).toBe(1);
  expect(layout.colors[0]).toBe('rgb(26, 26, 26)');
  expect(layout.selectedCount).toBe(1);
  expect(layout.monthLabels).toContain(layout.selectedLabel);
  expect(layout.selectedBorderColor).toBe('rgb(0, 0, 0)');
  expect(layout.selectedBorderWidth).toBe('2px');
  expect(layout.selectedBorderStyle).toBe('solid');
  expect(layout.firstMonthMarginLeft).toBe('12px');

  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings #insightSettingsYearSection')).toBeVisible();
  await expect(page.locator('#pageSettings').getByRole('button',{name:/年度追加/})).toBeVisible();
  await expect(page.locator('#pageSettings #insightDeleteYearButton')).toBeVisible();
  const settingsPlacement=await page.evaluate(()=>{
    const section=document.getElementById('insightSettingsYearSection');
    const actions=document.getElementById('insightSettingsYearActions');
    const add=Array.from(actions.querySelectorAll('button')).find(button=>/年度追加/.test(button.textContent||''));
    const del=document.getElementById('insightDeleteYearButton');
    const wrap=document.getElementById('addYearInlineWrap');
    return {
      addInside:!!(add&&add.parentElement===actions),
      deleteInside:!!(del&&del.parentElement===actions),
      inlineWrapInside:!wrap||section.contains(wrap)
    };
  });
  expect(settingsPlacement).toEqual({addInside:true,deleteInside:true,inlineWrapInside:true});
  expect(errors).toEqual([]);
});


test('年度削除は年度直結データだけを削除しイベント履歴と他年度を保持する',async({page})=>{
  const errors=await openInsight(page);
  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    if(!store.data['2024'])store.data['2024']=blankYearData('2024');
    if(!store.data['2025'])store.data['2025']=blankYearData('2025');
    if(!store.data['2026'])store.data['2026']=blankYearData('2026');
    store.years=['2024','2025','2026'];
    store.data['2024']['8月'][2].売上=444;
    store.monthlyOps=store.monthlyOps||{};
    store.monthlyOps['2024']={'8月':{laborCostYen:123456,grossMarginRate:31.5}};
    store.monthlyOps['2025']={'8月':{laborCostYen:222222,grossMarginRate:32.5}};
    window.InsightSalesCount.ensure(allStores);
    const category=allStores.salesCountManagement.categories.find(c=>!c.hidden);
    store.salesCounts=store.salesCounts||{};
    store.salesCounts['2024-08-03']={};
    store.salesCounts['2024-08-03'][category.id]={trips:[{delivery:10,sales:9},{delivery:20,sales:18},{delivery:30,sales:27}]};
    store.salesCounts['2025-08-03']={};
    store.salesCounts['2025-08-03'][category.id]={trips:[{delivery:11,sales:10},{delivery:21,sales:19},{delivery:31,sales:28}]};
    store.hourlyCustomers=store.hourlyCustomers||{};
    store.hourlyCustomers['2024-08-03']=Array.from({length:24},(_,i)=>i);
    store.hourlyCustomers['2025-08-03']=Array.from({length:24},(_,i)=>i+1);
    store.events=(store.events||[]).filter(e=>!String(e.id||'').startsWith('e2e_year_delete_'));
    store.events.push({id:'e2e_year_delete_local',type:'special',scope:'store',startDate:'2024-08-03',endDate:'2024-08-03',snapshot:{version:1,title:'削除年度でも保持する催事',note:''}});
    allStores.eventManagement=allStores.eventManagement||{version:1,presets:[],events:[]};
    allStores.eventManagement.events=(allStores.eventManagement.events||[]).filter(e=>e.id!=='e2e_year_delete_global');
    allStores.eventManagement.events.push({id:'e2e_year_delete_global',type:'sale',scope:'global',startDate:'2024-08-03',endDate:'2024-08-03',snapshot:{version:1,title:'削除年度でも保持する共通セール',note:'',sale:{categoryId:category.id,category:category.name,method:'amount',params:{amount:10}}}});
    baseYear='2026';
    cmpYear='2025';
    editYear={sales:'2026',kyaku:'2026',haiki:'2026'};
    InsightStorage.persistCurrent(allStores);
    renderYearPills();
    refreshDash();
  });

  await page.locator('#navSettings').click();
  await expect(page.locator('#pageSettings #insightDeleteYearButton')).toBeVisible();
  await page.locator('#pageSettings #insightDeleteYearButton').click();
  await expect(page.locator('#insightYearDeleteOverlay')).toBeVisible();
  await page.locator('#insightYearDeleteSelect').selectOption('2024');
  await expect(page.locator('#insightYearDeleteWarning')).toContainText('販売数/納品数');
  await expect(page.locator('#insightYearDeleteWarning')).toContainText('イベント・催事の開催記録と店舗設定は削除しません');
  await page.locator('#insightYearDeleteConfirm').click();

  await expect(page.locator('#insightYearDeleteOverlay')).toBeHidden();
  const state=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {
      years:store.years.slice(),
      hasData:Object.prototype.hasOwnProperty.call(store.data,'2024'),
      hasMonthly:!!(store.monthlyOps&&store.monthlyOps['2024']),
      oldSales:!!(store.salesCounts&&store.salesCounts['2024-08-03']),
      keepSales:!!(store.salesCounts&&store.salesCounts['2025-08-03']),
      oldHourly:!!(store.hourlyCustomers&&store.hourlyCustomers['2024-08-03']),
      keepHourly:!!(store.hourlyCustomers&&store.hourlyCustomers['2025-08-03']),
      localEvent:(store.events||[]).some(e=>e.id==='e2e_year_delete_local'),
      globalEvent:(allStores.eventManagement.events||[]).some(e=>e.id==='e2e_year_delete_global'),
      base:String(baseYear),
      compare:cmpYear==null?null:String(cmpYear)
    };
  });
  expect(state.years).toEqual(['2025','2026']);
  expect(state.hasData).toBe(false);
  expect(state.hasMonthly).toBe(false);
  expect(state.oldSales).toBe(false);
  expect(state.keepSales).toBe(true);
  expect(state.oldHourly).toBe(false);
  expect(state.keepHourly).toBe(true);
  expect(state.localEvent).toBe(true);
  expect(state.globalEvent).toBe(true);
  expect(state.base).toBe('2026');
  expect(state.compare).toBe('2025');

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  const restored=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {
      years:store.years.slice(),
      hasData:Object.prototype.hasOwnProperty.call(store.data,'2024'),
      oldSales:!!(store.salesCounts&&store.salesCounts['2024-08-03']),
      oldHourly:!!(store.hourlyCustomers&&store.hourlyCustomers['2024-08-03']),
      localEvent:(store.events||[]).some(e=>e.id==='e2e_year_delete_local'),
      globalEvent:(allStores.eventManagement.events||[]).some(e=>e.id==='e2e_year_delete_global')
    };
  });
  expect(restored.years).toEqual(['2025','2026']);
  expect(restored.hasData).toBe(false);
  expect(restored.oldSales).toBe(false);
  expect(restored.oldHourly).toBe(false);
  expect(restored.localEvent).toBe(true);
  expect(restored.globalEvent).toBe(true);
  expect(errors).toEqual([]);
});


test('販売数入力で未登録の過年度へ移動すると年度を正式追加し疎データを補完する',async({page})=>{
  const errors=await openInsight(page);
  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    store.years=['2025','2026'];
    store.data['2024']={'8月':[null,null,{d:'3',売上:321,客数:654,買上点数:12.34,廃棄金額:100,haiki:blankHaiki(),weather:'晴',storeMemo:'E2E過年度保持'}]};
    store.hourlyCustomers=store.hourlyCustomers||{};
    store.hourlyCustomers['2024-08-03']=Array.from({length:24},(_,i)=>i);
    window.InsightSalesCount.ensure(allStores);
    const category=allStores.salesCountManagement.categories.find(c=>!c.hidden);
    store.salesCounts=store.salesCounts||{};
    store.salesCounts['2024-08-03']={};
    store.salesCounts['2024-08-03'][category.id]={trips:[{delivery:10,sales:9},{delivery:20,sales:18},{delivery:30,sales:27}]};
    InsightStorage.persistCurrent(allStores);
  });

  await page.locator('#navSalesCount').click();
  await page.evaluate(()=>window.InsightSalesCount.setPeriod(2025,1));
  let dialogMessage='';
  page.once('dialog',dialog=>{dialogMessage=dialog.message();dialog.accept();});
  await page.locator('#scPrev').click();
  expect(dialogMessage).toContain('2024年度はダッシュボードに登録されていません');
  await expect.poll(()=>page.evaluate(()=>window.InsightSalesCount.getPeriod())).toEqual({year:'2024',month:12});

  const promoted=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    const category=allStores.salesCountManagement.categories.find(c=>!c.hidden);
    return {
      years:store.years.slice(),
      monthCount:Object.keys(store.data['2024']).length,
      febDays:store.data['2024']['2月'].length,
      augDays:store.data['2024']['8月'].length,
      firstDay:store.data['2024']['8月'][0],
      preserved:store.data['2024']['8月'][2],
      salesCount:store.salesCounts['2024-08-03'][category.id],
      hourly:store.hourlyCustomers['2024-08-03']
    };
  });
  expect(promoted.years).toContain('2024');
  expect(promoted.monthCount).toBe(12);
  expect(promoted.febDays).toBe(29);
  expect(promoted.augDays).toBe(31);
  expect(promoted.firstDay).not.toBeNull();
  expect(promoted.firstDay.d).toBe('1');
  expect(promoted.preserved.売上).toBe(321);
  expect(promoted.preserved.客数).toBe(654);
  expect(promoted.preserved.storeMemo).toBe('E2E過年度保持');
  expect(promoted.salesCount.trips[0].delivery).toBe(10);
  expect(promoted.hourly).toHaveLength(24);

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  const afterReload=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {
      years:store.years.slice(),
      value:store.data['2024']['8月'][2].売上,
      firstDayIsObject:!!store.data['2024']['8月'][0]&&typeof store.data['2024']['8月'][0]==='object'
    };
  });
  expect(afterReload.years).toContain('2024');
  expect(afterReload.value).toBe(321);
  expect(afterReload.firstDayIsObject).toBe(true);
  expect(errors).toEqual([]);
});


test('今日の入力の保存完了フィードバックはclass状態で2秒後に戻る',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  const button=page.locator('#quickSaveBtn');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('保存する');
  await button.click();
  await expect(button).toHaveText('✓ 保存しました');
  await expect(button).toHaveClass(/is-saved-feedback/);
  await expect.poll(()=>button.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(22, 163, 74)');
  await expect(button).toHaveText('保存する',{timeout:3500});
  await expect(button).not.toHaveClass(/is-saved-feedback/);
  expect(errors).toEqual([]);
});

test('今日の入力の日付ピッカーは年月変更でも入力要素を維持する',async({page})=>{
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
    input.__insightPickerIdentity='preserved';
    input.value=value;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },target);
  await expect.poll(()=>page.evaluate(()=>window.InsightDateContext.getSelectedIso())).toBe(target);
  const state=await page.locator('#iqdDateInput').evaluate(input=>({
    identity:input.__insightPickerIdentity,
    value:input.value,
    label:document.querySelector('#qNavRow .iqd-date-main').textContent
  }));
  expect(state.identity).toBe('preserved');
  expect(state.value).toBe(target);
  expect(state.label).toContain(target.slice(0,4)+'年'+Number(target.slice(5,7))+'月');
  expect(errors).toEqual([]);
});

test('今日の入力で未登録の過年度日付を選ぶと年度を正式追加し既存データを保持する',async({page})=>{
  const errors=await openInsight(page);
  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    store.years=['2025','2026'];
    store.data['2024']={'8月':[null,null,{d:'3',売上:456,客数:123,買上点数:7.89,廃棄金額:90,haiki:blankHaiki(),weather:'晴',storeMemo:'E2E今日過年度保持'}]};
    InsightStorage.persistCurrent(allStores);
  });

  await page.locator('#nav0').click();
  await expect(page.locator('#iqdDateInput')).toBeAttached();
  const before=await page.evaluate(()=>window.InsightDateContext.getSelectedIso());

  const cancelDialogPromise=page.waitForEvent('dialog');
  const cancelChange=page.locator('#iqdDateInput').evaluate(input=>{
    input.value='2023-08-03';
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const cancelDialog=await cancelDialogPromise;
  expect(cancelDialog.message()).toContain('2023年度はダッシュボードに登録されていません');
  await cancelDialog.dismiss();
  await cancelChange;
  await expect.poll(()=>page.evaluate(()=>window.InsightDateContext.getSelectedIso())).toBe(before);
  expect(await page.evaluate(()=>allStores.stores[allStores.current].years.includes('2023'))).toBe(false);

  const acceptDialogPromise=page.waitForEvent('dialog');
  const acceptChange=page.locator('#iqdDateInput').evaluate(input=>{
    input.value='2024-08-03';
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const acceptDialog=await acceptDialogPromise;
  expect(acceptDialog.message()).toContain('2024年度はダッシュボードに登録されていません');
  await acceptDialog.accept();
  await acceptChange;

  await expect.poll(()=>page.evaluate(()=>window.InsightDateContext.getSelectedIso())).toBe('2024-08-03');
  const promoted=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {
      years:store.years.slice(),
      monthCount:Object.keys(store.data['2024']).length,
      febDays:store.data['2024']['2月'].length,
      augDays:store.data['2024']['8月'].length,
      firstDay:store.data['2024']['8月'][0],
      preserved:store.data['2024']['8月'][2]
    };
  });
  expect(promoted.years).toContain('2024');
  expect(promoted.monthCount).toBe(12);
  expect(promoted.febDays).toBe(29);
  expect(promoted.augDays).toBe(31);
  expect(promoted.firstDay).not.toBeNull();
  expect(promoted.firstDay.d).toBe('1');
  expect(promoted.preserved.売上).toBe(456);
  expect(promoted.preserved.客数).toBe(123);
  expect(promoted.preserved.storeMemo).toBe('E2E今日過年度保持');

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  const afterReload=await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    return {
      years:store.years.slice(),
      value:store.data['2024']['8月'][2].売上,
      firstDayIsObject:!!store.data['2024']['8月'][0]&&typeof store.data['2024']['8月'][0]==='object'
    };
  });
  expect(afterReload.years).toContain('2024');
  expect(afterReload.value).toBe(456);
  expect(afterReload.firstDayIsObject).toBe(true);
  expect(errors).toEqual([]);
});


test('今日の入力で時間帯別客数を途中保存し24時間入力を完了できる',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  await expect(page.locator('#hourlyCustomersQuick')).toBeVisible();
  await expect(page.locator('#insightEvents')).toBeVisible();
  const opsType=await page.evaluate(()=>({
    title:getComputedStyle(document.querySelector('#opsDailyWrap .ops-field-title')).fontSize,
    memo:getComputedStyle(document.querySelector('#opsDailyWrap .ops-memo')).fontSize
  }));
  expect(opsType).toEqual({title:'13px',memo:'14px'});
  const initialOrder=await page.evaluate(()=>Array.from(document.getElementById('opsDailyWrap').children).map(node=>node.id));
  expect(initialOrder.indexOf('hourlyCustomersQuick')).toBeLessThan(initialOrder.indexOf('insightEvents'));
  const hourlyQuickType=await page.evaluate(()=>({
    status:getComputedStyle(document.querySelector('#hourlyCustomersQuick .hourly-quick-status')).fontSize,
    button:getComputedStyle(document.querySelector('#hourlyCustomersQuick .hourly-quick-button')).fontSize
  }));
  expect(hourlyQuickType).toEqual({status:'12.5px',button:'13px'});

  await page.locator('#hourlyCustomersQuick .hourly-quick-button').click();
  await expect(page.locator('.hourly-dialog')).toBeVisible();
  await expect(page.locator('.hourly-dialog .hourly-help')).toHaveCount(0);
  const hourlyDialogType=await page.evaluate(()=>({
    dialog:getComputedStyle(document.querySelector('.hourly-dialog')).fontSize,
    heading:getComputedStyle(document.querySelector('.hourly-dialog h2')).fontSize,
    groupTitle:getComputedStyle(document.querySelector('.hourly-input-group h3')).fontSize,
    label:getComputedStyle(document.querySelector('.hourly-input-group label span')).fontSize,
    input:getComputedStyle(document.querySelector('.hourly-input-group input')).fontSize,
    summary:getComputedStyle(document.querySelector('.hourly-dialog-summary')).fontSize
  }));
  expect(hourlyDialogType).toEqual({dialog:'14px',heading:'18px',groupTitle:'13px',label:'13px',input:'14px',summary:'14px'});
  const inputs=page.locator('.hourly-dialog .hourly-input-group input');
  await expect(inputs).toHaveCount(24);
  await inputs.nth(0).fill('0');
  await inputs.nth(1).fill('12');
  await page.locator('.hourly-dialog .hourly-primary').click();
  await expect(page.locator('#hourlyCustomersQuick .hourly-quick-status')).toContainText('途中 2/24');
  await expect(page.locator('#hourlyCustomersQuick .hourly-quick-status')).toContainText('合計 12人');
  const orderAfterPartialSave=await page.evaluate(()=>Array.from(document.getElementById('opsDailyWrap').children).map(node=>node.id));
  expect(orderAfterPartialSave.indexOf('hourlyCustomersQuick')).toBeLessThan(orderAfterPartialSave.indexOf('insightEvents'));

  const partial=await page.evaluate(()=>{
    const date=window.InsightDateContext.getSelectedIso();
    return window.InsightHourlyCustomers.status(allStores,allStores.current,date);
  });
  expect(partial.count).toBe(2);
  expect(partial.complete).toBe(false);
  expect(partial.hours[0]).toBe(0);
  expect(partial.hours[2]).toBeNull();

  await page.locator('#hourlyCustomersQuick .hourly-quick-button').click();
  await page.evaluate(()=>{
    const inputs=Array.from(document.querySelectorAll('.hourly-dialog .hourly-input-group input'));
    inputs.forEach((input,index)=>{
      if(input.value==='')input.value=String(index+1);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
  });
  await expect(page.locator('.hourly-dialog-summary')).toContainText('入力 24/24');
  await page.locator('.hourly-dialog .hourly-primary').click();
  await expect(page.locator('#hourlyCustomersQuick .hourly-quick-status')).toContainText('入力済み 24/24');
  await expect(page.locator('.hourly-dialog')).toHaveCount(0);
  const orderAfterCompleteSave=await page.evaluate(()=>Array.from(document.getElementById('opsDailyWrap').children).map(node=>node.id));
  expect(orderAfterCompleteSave.indexOf('hourlyCustomersQuick')).toBeLessThan(orderAfterCompleteSave.indexOf('insightEvents'));

  const complete=await page.evaluate(()=>{
    const date=window.InsightDateContext.getSelectedIso();
    return window.InsightHourlyCustomers.status(allStores,allStores.current,date);
  });
  expect(complete.complete).toBe(true);
  expect(complete.count).toBe(24);
  expect(errors).toEqual([]);
});

test('イベント実績は過去開催→複数日→時間帯グラフ→カテゴリー便別実績を表示する',async({page})=>{
  const errors=await openInsight(page);
  await page.evaluate(()=>{
    const storeId=allStores.current;
    const store=allStores.stores[storeId];
    store.events=(store.events||[]).filter(event=>!String(event.id||'').startsWith('e2e_event_results_'));
    store.events.push(
      {id:'e2e_event_results_old',type:'nearby',scope:'store',startDate:'2025-09-10',endDate:'2025-09-10',snapshot:{version:1,title:'E2Eコンサート',note:'前年',location:'E2E文化フォーラム',specialDemand:[{id:'dmd_e2e_ice',name:'低価格アイス',prepared:50,sold:45}]}},
      {id:'e2e_event_results_new',type:'nearby',scope:'store',startDate:'2026-09-12',endDate:'2026-09-13',snapshot:{version:1,title:'E2Eコンサート',note:'2日開催',location:'E2E文化フォーラム',specialDemand:[{id:'dmd_e2e_ice',name:'低価格アイス',prepared:60,sold:52},{id:'dmd_e2e_drink',name:'冷たい飲料',prepared:40,sold:35}]}}
    );

    function metricsFor(date){
      const day=Number(date.slice(-2));
      const salesYen=100000+day*1000+987;
      return {salesYen,customers:90+day,customerUnitPrice:salesYen/(90+day),items:200+day/100,inputDays:1};
    }
    window.InsightAnalysisContext.buildDay=function(date){
      return {metrics:metricsFor(date),conditions:{daily:[]}};
    };
    window.InsightAnalysisContext.buildRange=function(start,end){
      const startDay=Number(start.slice(-2)),endDay=Number(end.slice(-2));
      let sales=0,customers=0,items=0,count=0;
      for(let day=startDay;day<=endDay;day++){
        const date=start.slice(0,8)+String(day).padStart(2,'0');
        const m=metricsFor(date);sales+=m.salesYen;customers+=m.customers;items+=m.items;count++;
      }
      return {metrics:{salesYen:sales,customers,customerUnitPrice:sales/customers,items,inputDays:count}};
    };

    store.hourlyCustomers=store.hourlyCustomers||{};
    store.hourlyCustomers['2026-09-12']=Array.from({length:24},(_,hour)=>hour===18?186:20+hour);
    store.hourlyCustomers['2026-09-13']=Array.from({length:24},(_,hour)=>hour<8?10+hour:null);

    window.InsightSalesCount.ensure(allStores);
    const categories=allStores.salesCountManagement.categories.filter(category=>!category.hidden).slice(0,2);
    store.salesCounts=store.salesCounts||{};
    store.salesCounts['2026-09-12']=store.salesCounts['2026-09-12']||{};
    categories.forEach((category,index)=>{
      store.salesCounts['2026-09-12'][category.id]={
        trips:[
          {delivery:40+index,sales:36+index},
          {delivery:50+index,sales:46+index},
          {delivery:45+index,sales:41+index}
        ]
      };
    });
    window.InsightEventResults.render();
  });

  await expect(page.locator('#navEventResults')).toContainText('イベント・催事');
  await page.locator('#navEventResults').click();
  await expect(page.locator('#pageEventResults')).toHaveClass(/show/);
  await expect(page.locator('#pageEventResults > .page-header > .page-title')).toHaveText('イベント・催事実績');
  await expect(page.locator('#erEvent')).toBeDisabled();
  await page.locator('#erLocation').selectOption({label:'E2E文化フォーラム'});
  await expect(page.locator('#erEvent')).toBeEnabled();
  await page.locator('#erEvent').selectOption({label:'E2Eコンサート'});

  await expect(page.locator('.er-occurrence')).toHaveCount(2);
  await expect(page.locator('.er-occurrence').first()).toContainText('2026/9/12');
  await expect(page.locator('.er-occurrence').first()).toContainText('9/13');
  await expect(page.locator('.er-occurrence').first()).toContainText('売上 226千円');
  await expect(page.locator('.er-occurrence').first()).toContainText('客数 205人');
  const eventHistoryTypography=await page.locator('.er-occurrence').first().evaluate(card=>({
    date:getComputedStyle(card.querySelector('.er-occurrence-date')).fontSize,
    metrics:getComputedStyle(card.querySelector('.er-occurrence-metrics')).fontSize
  }));
  expect(eventHistoryTypography).toEqual({date:'14px',metrics:'13px'});

  await page.locator('.er-occurrence').first().click();
  const overviewCards=page.locator('.er-overview-grid .er-overview-card');
  await expect(overviewCards).toHaveCount(2);
  await expect(overviewCards.nth(0)).toHaveText(/売上\s*期間合計\s*226千円\s*1日平均\s*113千円/);
  await expect(overviewCards.nth(1)).toHaveText(/客数\s*期間合計\s*205人\s*1日平均\s*103人/);
  await expect(overviewCards.locator('.er-overview-value')).toHaveCount(4);
  const overviewLayout=await page.locator('.er-overview-grid').evaluate(el=>({
    columns:getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
    innerColumns:getComputedStyle(el.querySelector('.er-overview-values')).gridTemplateColumns.split(' ').filter(Boolean).length
  }));
  expect(overviewLayout).toEqual({columns:2,innerColumns:2});
  const eventDetailTypography=await page.evaluate(()=>({
    detailTitle:getComputedStyle(document.querySelector('.er-detail-title h2')).fontSize,
    sectionTitle:getComputedStyle(document.querySelector('.er-sales-section > h2')).fontSize,
    metricLabel:getComputedStyle(document.querySelector('.er-overview-value span')).fontSize,
    metricValue:getComputedStyle(document.querySelector('.er-overview-value strong')).fontSize
  }));
  expect(eventDetailTypography).toEqual({detailTitle:'20px',sectionTitle:'17px',metricLabel:'12.5px',metricValue:'18px'});
  await expect(page.locator('.er-overview-grid')).not.toContainText('客単価');
  await expect(page.locator('.er-overview-grid')).not.toContainText('買上点数');
  await expect(page.locator('.er-daily-summary')).toHaveCount(0);
  await expect(page.locator('.er-day-tab')).toHaveCount(2);
  await expect(page.locator('.er-day-tab').first()).toHaveClass(/active/);
  const dayCardStyle=await page.locator('.er-day-tab').first().evaluate(card=>({
    width:getComputedStyle(card).width,
    padding:getComputedStyle(card).padding,
    dateFont:getComputedStyle(card.querySelector('strong')).fontSize,
    metricFont:getComputedStyle(card.querySelector('span')).fontSize
  }));
  expect(dayCardStyle).toEqual({width:'210px',padding:'13px 15px',dateFont:'15px',metricFont:'13.5px'});
  await expect(page.locator('.er-hourly-section')).toBeVisible();
  await expect(page.locator('.er-peak')).toContainText('18時台 186人');
  await expect(page.locator('.er-hour-item')).toHaveCount(24);
  await expect(page.locator('.er-hour-item>strong')).toHaveCount(0);
  await expect(page.locator('.er-hour-plot')).toHaveCount(24);
  await expect(page.locator('.er-hour-value:visible')).toHaveCount(0);
  const hourlyBarColor=await page.locator('.er-hour-bar').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(hourlyBarColor).toBe('rgb(59, 130, 246)');
  const timeFontSize=await page.locator('.er-hour-item>span').first().evaluate(el=>getComputedStyle(el).fontSize);
  expect(timeFontSize).toBe('13px');
  const hourlyGap=await page.locator('.er-hour-chart').evaluate(el=>getComputedStyle(el).gap);
  expect(hourlyGap).toBe('2px');
  await expect(page.locator('.er-hour-plot').nth(18)).toHaveAttribute('aria-label','18時台 186人');
  await page.locator('.er-hour-plot').first().click();
  await expect(page.locator('.er-hour-value:visible')).toHaveText('20人');
  await expect(page.locator('.er-hour-plot').first()).toHaveAttribute('aria-pressed','true');
  await page.locator('.er-hour-plot').nth(18).click();
  await expect(page.locator('.er-hour-value:visible')).toHaveCount(1);
  await expect(page.locator('.er-hour-value:visible')).toHaveText('186人');
  await expect(page.locator('.er-hour-plot').first()).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.er-hour-plot').nth(18)).toHaveAttribute('aria-pressed','true');

  const horizontal=await page.evaluate(()=>{
    const scroll=document.querySelector('.er-hour-scroll');
    const chart=document.querySelector('.er-hour-chart');
    const last=document.querySelector('.er-hour-item:last-child');
    const chartRect=chart.getBoundingClientRect(),lastRect=last.getBoundingClientRect();
    return {
      scrollWidth:scroll.scrollWidth,
      clientWidth:scroll.clientWidth,
      minWidth:getComputedStyle(chart).minWidth,
      rightGap:Math.round(chartRect.right-lastRect.right)
    };
  });
  expect(horizontal.scrollWidth).toBeLessThanOrEqual(horizontal.clientWidth+1);
  expect(horizontal.minWidth).toBe('0px');
  expect(horizontal.rightGap).toBeLessThanOrEqual(7);
  const originalViewport=page.viewportSize();
  for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
    await page.setViewportSize(viewport);
    const fit=await page.locator('.er-hour-scroll').evaluate(scroll=>{
      const items=Array.from(scroll.querySelectorAll('.er-hour-item'));
      const widths=items.map(item=>item.getBoundingClientRect().width);
      return {overflow:scroll.scrollWidth-scroll.clientWidth,count:items.length,variation:Math.max(...widths)-Math.min(...widths)};
    });
    expect(fit.count).toBe(24);
    expect(fit.overflow).toBeLessThanOrEqual(1);
    expect(fit.variation).toBeLessThan(1);
    await page.locator('.er-hour-plot').last().click();
    await expect(page.locator('.er-hour-plot').last()).toHaveAttribute('aria-pressed','true');
    await page.locator('.er-hour-plot').last().click();
  }
  await page.setViewportSize(originalViewport);


  await expect(page.locator('.er-sales-section > h2')).toHaveText('カテゴリー実績');
  await expect(page.locator('.er-category-card')).toHaveCount(2);
  await expect(page.locator('.er-category-card .sc-day')).toHaveCount(2);
  const categoryGrid=await page.locator('.er-category-grid').evaluate(grid=>({
    columns:getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
    width:Math.round(grid.getBoundingClientRect().width)
  }));
  expect(categoryGrid.columns).toBe(4);
  const eventTotalFont=await page.locator('.er-category-card .sc-totals b').first().evaluate(el=>getComputedStyle(el).fontSize);
  expect(eventTotalFont).toBe('14px');
  const readOnly=await page.locator('.er-category-card input').evaluateAll(inputs=>inputs.every(input=>input.readOnly));
  expect(readOnly).toBe(true);
  await expect(page.locator('.er-demand-section')).toBeVisible();
  await expect(page.locator('.er-demand-card')).toHaveCount(2);
  await expect(page.locator('.er-demand-card').first()).toContainText('低価格アイス');
  await expect(page.locator('.er-demand-card').first()).toContainText('60');
  await expect(page.locator('.er-demand-card').first()).toContainText('52');
  await expect(page.locator('.er-demand-card').first()).toContainText('86.7%');
  await expect(page.locator('.er-demand-card').first()).toContainText('前回：用意 50　販売 45　消化率 90.0%');
  const cardTypography=await page.evaluate(()=>({
    category:getComputedStyle(document.querySelector('.er-category-card > h3')).fontSize,
    demand:getComputedStyle(document.querySelector('.er-demand-card > h3')).fontSize,
    previous:getComputedStyle(document.querySelector('.er-demand-previous')).fontSize
  }));
  expect(cardTypography).toEqual({category:'14px',demand:'14.5px',previous:'12px'});

  await page.locator('.er-day-tab').nth(1).click();
  await expect(page.locator('.er-day-tab').nth(1)).toHaveClass(/active/);
  await expect(page.locator('.er-hourly-section')).toHaveCount(0);
  await expect(page.locator('.er-category-card')).toHaveCount(0);

  await page.locator('.er-back').click();
  await page.locator('.er-occurrence').nth(1).click();
  await expect(page.locator('.er-overview-grid')).not.toContainText('1日平均');
  await expect(page.locator('.er-overview-grid')).not.toContainText('期間合計');
  await expect(page.locator('.er-overview-grid .er-overview-value')).toHaveCount(2);
  await expect(page.locator('.er-overview-grid .er-overview-title')).toHaveText(['売上','客数']);
  const singleLayout=await page.locator('.er-overview-values').first().evaluate(el=>({
    columns:getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
    align:getComputedStyle(el).textAlign
  }));
  expect(singleLayout).toEqual({columns:1,align:'center'});
  await expect(page.locator('.er-day-tabs')).toHaveCount(0);
  await expect(page.locator('.er-daily-summary')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('イベント実績の催事は場所選択なしで過去開催を参照できる',async({page})=>{
  const errors=await openInsight(page);
  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    store.events=(store.events||[]).filter(event=>!String(event.id||'').startsWith('e2e_special_day_'));
    store.events.push(
      {id:'e2e_special_day_old',type:'special',scope:'store',startDate:'2025-12-24',endDate:'2025-12-25',snapshot:{version:1,title:'E2Eクリスマス',note:'前年'}},
      {id:'e2e_special_day_new',type:'special',scope:'store',startDate:'2026-12-24',endDate:'2026-12-25',snapshot:{version:1,title:'E2Eクリスマス',note:'今年'}}
    );
    function metricsFor(date){
      const day=Number(date.slice(-2));
      return {salesYen:200000+day*1000,customers:150+day,customerUnitPrice:(200000+day*1000)/(150+day),items:300+day/100,inputDays:1};
    }
    window.InsightAnalysisContext.buildDay=function(date){
      return {metrics:metricsFor(date),conditions:{daily:[]}};
    };
    window.InsightAnalysisContext.buildRange=function(start,end){
      const dates=[start];
      if(end!==start)dates.push(end);
      const rows=dates.map(metricsFor);
      const sales=rows.reduce((sum,row)=>sum+row.salesYen,0);
      const customers=rows.reduce((sum,row)=>sum+row.customers,0);
      const items=rows.reduce((sum,row)=>sum+row.items,0);
      return {metrics:{salesYen:sales,customers,customerUnitPrice:sales/customers,items,inputDays:rows.length}};
    };
    window.InsightEventResults.render();
  });

  await page.locator('#navEventResults').click();
  await page.locator('.er-kind-btn[data-kind="special"]').click();
  await expect(page.locator('.er-kind-btn[data-kind="special"]')).toHaveClass(/active/);
  await expect(page.locator('#erLocationField')).toBeHidden();
  await expect(page.locator('#erEventFieldLabel')).toHaveText('催事名');
  await expect(page.locator('#erEvent')).toBeEnabled();
  await page.locator('#erEvent').selectOption({label:'E2Eクリスマス'});
  await expect(page.locator('.er-occurrence')).toHaveCount(2);
  await expect(page.locator('.er-occurrence').first()).toContainText('2026/12/24');
  await expect(page.locator('.er-occurrence').first()).toContainText('12/25');
  await page.locator('.er-occurrence').first().click();
  await expect(page.locator('.er-detail-title h2')).toHaveText('E2Eクリスマス');
  await expect(page.locator('.er-day-tab')).toHaveCount(2);
  await page.locator('.er-back').click();
  await page.locator('.er-kind-btn[data-kind="nearby"]').click();
  await expect(page.locator('#erLocationField')).toBeVisible();
  expect(errors).toEqual([]);
});

test('セール追加ダイアログは補足文を省きプリセット一覧に余白を設ける',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  const eventDialog=page.locator('.ie-dialog.ie-event-add');
  await expect(eventDialog).toBeVisible();
  await expect(eventDialog.getByLabel('イベント種別')).toHaveValue('sale');
  const saleTargets=eventDialog.locator('.ie-sale-target');
  expect(await saleTargets.count()).toBeGreaterThan(1);
  const firstTarget=saleTargets.nth(0);
  const secondTarget=saleTargets.nth(1);
  await expect(firstTarget.locator('.ie-sale-target-body')).toBeVisible();
  await expect(secondTarget.locator('.ie-sale-target-body')).toBeHidden();
  await expect(secondTarget.locator('.ie-sale-target-body')).toHaveClass(/ie-sale-target-body-hidden/);
  await secondTarget.locator('.ie-sale-target-head input[type="checkbox"]').check();
  await expect(secondTarget.locator('.ie-sale-target-body')).toBeVisible();
  await expect(secondTarget.locator('.ie-sale-target-body')).not.toHaveClass(/ie-sale-target-body-hidden/);

  await eventDialog.getByLabel('開始日',{exact:true}).fill('2025-10-06');
  await eventDialog.getByLabel('開始日',{exact:true}).blur();
  await expect(eventDialog.getByLabel('終了日',{exact:true})).toHaveValue('2025-10-06');
  await eventDialog.getByLabel('終了日',{exact:true}).fill('2025-10-10');
  await eventDialog.getByLabel('開始日',{exact:true}).fill('2025-09-01');
  await eventDialog.getByLabel('開始日',{exact:true}).blur();
  await expect(eventDialog.getByLabel('終了日',{exact:true})).toHaveValue('2025-09-01');
  const dateLayout=await eventDialog.locator('.ie-dates').evaluate(grid=>{
    const inputs=Array.from(grid.querySelectorAll('input'));
    const rects=inputs.map(input=>input.getBoundingClientRect());
    const gridRect=grid.getBoundingClientRect();
    return {gap:rects[1].left-rects[0].right,widthDifference:Math.abs(rects[0].width-rects[1].width),rightOverflow:rects[1].right-gridRect.right};
  });
  expect(dateLayout.gap).toBeGreaterThanOrEqual(9);
  expect(dateLayout.widthDifference).toBeLessThan(1);
  expect(dateLayout.rightOverflow).toBeLessThanOrEqual(1);

  await expect(eventDialog.getByText('全店舗共通・指定期間の各日に表示します。',{exact:true})).toHaveCount(0);
  await expect(eventDialog.getByText('選ぶと上記の期間で登録します。個別の条件は下で入力できます。',{exact:true})).toHaveCount(0);
  await expect(eventDialog.getByText(/同じカテゴリー内に複数の値引きパターンがある場合は/)).toHaveCount(0);
  await expect(eventDialog.getByText('イベントは登録時に保存されます。日次の「クリア」では削除されません。',{exact:true})).toHaveCount(0);
  const presetMargin=await eventDialog.locator('.ie-presets').evaluate(node=>getComputedStyle(node).marginTop);
  expect(presetMargin).toBe('10px');
  await eventDialog.getByRole('button',{name:'閉じる'}).click();
  expect(errors).toEqual([]);
});

test('よく使うイベントの特需商品は自由名で登録・編集でき次回開催へ自動継承する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    store.events=(store.events||[]).filter(event=>!(event.type==='nearby'&&event.snapshot&&event.snapshot.title==='E2E夏祭り'));
    if(!allStores.eventManagement)allStores.eventManagement={version:1,presets:[],events:[]};
    allStores.eventManagement.nearbyPresets=(allStores.eventManagement.nearbyPresets||[]).filter(item=>item.snapshot&&item.snapshot.title!=='E2E夏祭り');
  });

  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  let eventDialog=page.locator('.ie-dialog.ie-event-add');
  await eventDialog.getByLabel('イベント種別').selectOption('nearby');
  await expect(eventDialog.getByText('よく使うイベント',{exact:true})).toBeVisible();
  await eventDialog.getByRole('button',{name:'編集'}).click();

  let presetDialog=page.locator('.ie-dialog.ie-preset-editor').last();
  await expect(presetDialog.getByRole('heading',{name:'よく使うイベントを編集'})).toBeVisible();
  await presetDialog.getByRole('button',{name:'＋よく使うイベントを追加'}).click();
  await presetDialog.getByLabel('イベント場所').fill('E2E文化フォーラム');
  await presetDialog.getByRole('button',{name:'＋場所を追加',exact:true}).click();
  await presetDialog.getByLabel('イベント場所').nth(1).fill('E2E駅前広場');
  await presetDialog.getByLabel('イベント名').fill('E2E夏祭り');
  await presetDialog.locator('.ie-demand-editor').getByRole('button',{name:'＋追加'}).click();
  await presetDialog.locator('.ie-demand-row').first().getByLabel('名称').fill('低価格アイス');
  await presetDialog.getByRole('button',{name:'保存する'}).click();
  await expect(presetDialog.getByText('E2E夏祭り（E2E文化フォーラム・E2E駅前広場）',{exact:true})).toBeVisible();
  await presetDialog.getByRole('button',{name:'閉じる'}).click();

  eventDialog=page.locator('.ie-dialog.ie-event-add');
  await eventDialog.getByRole('button',{name:'E2E夏祭り'}).click();
  await expect(eventDialog.getByLabel('イベント場所')).toHaveCount(2);
  await expect(eventDialog.getByLabel('イベント場所').nth(0)).toHaveValue('E2E文化フォーラム');
  await expect(eventDialog.getByLabel('イベント場所').nth(1)).toHaveValue('E2E駅前広場');
  await eventDialog.getByRole('button',{name:'＋場所を追加',exact:true}).click();
  await eventDialog.getByLabel('イベント場所').nth(2).fill('削除対象');
  await eventDialog.locator('.ie-location-row').nth(2).getByRole('button',{name:'この場所を削除'}).click();
  await expect(eventDialog.getByLabel('イベント場所')).toHaveCount(2);
  await expect(eventDialog.getByLabel('イベント名')).toHaveValue('E2E夏祭り');
  await expect(eventDialog.locator('.ie-demand-row')).toHaveCount(1);
  await expect(eventDialog.locator('.ie-demand-row').first().getByLabel('名称')).toHaveValue('低価格アイス');
  await eventDialog.locator('.ie-demand-row').first().getByLabel('用意数').fill('60');
  await eventDialog.locator('.ie-demand-row').first().getByLabel('販売数').fill('52');
  await eventDialog.locator('.ie-demand-editor').getByRole('button',{name:'＋追加'}).click();
  await eventDialog.locator('.ie-demand-row').nth(1).getByLabel('名称').fill('氷');
  await eventDialog.locator('.ie-demand-row').nth(1).getByLabel('用意数').fill('30');
  await eventDialog.locator('.ie-demand-row').nth(1).getByLabel('販売数').fill('27');
  await eventDialog.getByRole('button',{name:'登録する'}).click();
  await expect(eventDialog).toHaveCount(0);

  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  eventDialog=page.locator('.ie-dialog.ie-event-add');
  await eventDialog.getByLabel('イベント種別').selectOption('nearby');
  await eventDialog.getByRole('button',{name:'E2E夏祭り'}).click();
  await expect(eventDialog.getByLabel('イベント場所')).toHaveCount(2);
  await expect(eventDialog.getByLabel('イベント場所').nth(1)).toHaveValue('E2E駅前広場');
  const nearbySaved=await page.evaluate(()=>allStores.stores[allStores.current].events.filter(event=>event.type==='nearby'&&event.snapshot.title==='E2E夏祭り'));
  expect(nearbySaved).toHaveLength(1);
  expect(nearbySaved[0].snapshot.location).toBe('E2E文化フォーラム\nE2E駅前広場');
  await expect(eventDialog.locator('.ie-demand-row')).toHaveCount(2);
  await expect(eventDialog.locator('.ie-demand-row').nth(0).getByLabel('名称')).toHaveValue('低価格アイス');
  await expect(eventDialog.locator('.ie-demand-row').nth(1).getByLabel('名称')).toHaveValue('氷');
  await expect(eventDialog.locator('.ie-demand-row').nth(0).getByLabel('用意数')).toHaveValue('');
  await expect(eventDialog.locator('.ie-demand-row').nth(0).getByLabel('販売数')).toHaveValue('');
  await eventDialog.locator('.ie-demand-row').nth(1).getByRole('button',{name:'削除'}).click();
  await expect(eventDialog.locator('.ie-demand-row')).toHaveCount(1);
  await eventDialog.getByRole('button',{name:'キャンセル'}).click();
  expect(errors).toEqual([]);
});

test('よく使う催事を登録して選択でき、同名同期間は重複警告する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#nav0').click();
  await page.evaluate(()=>{
    const store=allStores.stores[allStores.current];
    store.events=(store.events||[]).filter(event=>!(event.type==='special'&&event.snapshot&&event.snapshot.title==='E2E催事'));
    if(!allStores.eventManagement)allStores.eventManagement={version:1,presets:[],events:[]};
    allStores.eventManagement.specialPresets=(allStores.eventManagement.specialPresets||[]).filter(item=>item.snapshot&&item.snapshot.title!=='E2E催事');
  });

  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  let eventDialog=page.locator('.ie-dialog.ie-event-add');
  await eventDialog.getByLabel('イベント種別').selectOption('special');
  await expect(eventDialog.getByText('よく使う催事',{exact:true})).toBeVisible();
  await eventDialog.getByRole('button',{name:'編集'}).click();

  let presetDialog=page.locator('.ie-dialog.ie-preset-editor').last();
  await expect(presetDialog.getByRole('heading',{name:'よく使う催事を編集'})).toBeVisible();
  await presetDialog.getByRole('button',{name:'＋よく使う催事を追加'}).click();
  await presetDialog.getByLabel('催事名').fill('E2E催事');
  await presetDialog.getByLabel('補足（任意）').fill('毎年確認');
  await presetDialog.locator('.ie-demand-editor').getByRole('button',{name:'＋追加'}).click();
  await presetDialog.locator('.ie-demand-row').first().getByLabel('名称').fill('羊羹');
  await presetDialog.getByRole('button',{name:'保存する'}).click();
  await expect(presetDialog.getByText('E2E催事',{exact:true})).toBeVisible();
  await presetDialog.getByRole('button',{name:'閉じる'}).click();

  eventDialog=page.locator('.ie-dialog.ie-event-add');
  await expect(eventDialog.getByRole('button',{name:'E2E催事'})).toBeVisible();
  await eventDialog.getByRole('button',{name:'E2E催事'}).click();
  await expect(eventDialog.getByLabel('催事名')).toHaveValue('E2E催事');
  await expect(eventDialog.getByLabel('補足（任意）')).toHaveValue('毎年確認');
  await expect(eventDialog.locator('.ie-demand-row')).toHaveCount(1);
  await expect(eventDialog.locator('.ie-demand-row').first().getByLabel('名称')).toHaveValue('羊羹');
  await eventDialog.getByRole('button',{name:'登録する'}).click();
  await expect(eventDialog).toHaveCount(0);

  await page.getByRole('button',{name:'＋イベントを追加'}).click();
  eventDialog=page.locator('.ie-dialog.ie-event-add');
  await eventDialog.getByLabel('イベント種別').selectOption('special');
  await eventDialog.getByRole('button',{name:'E2E催事'}).click();
  let duplicateMessage='';
  page.once('dialog',async dialog=>{
    duplicateMessage=dialog.message();
    await dialog.dismiss();
  });
  await eventDialog.getByRole('button',{name:'登録する'}).click();
  await expect.poll(()=>duplicateMessage).toContain('同じ店舗に同じ催事名・同じ期間の登録があります。');
  await expect(eventDialog).toBeVisible();
  await eventDialog.getByRole('button',{name:'キャンセル'}).click();
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
      weekdayTitles:weekdayCards.map(card=>card.querySelector('.sc-day-num').textContent),
      inputTotalFont:getComputedStyle(inputCard.querySelector('.sc-totals b')).fontSize,
      weekdayAverageTotalFont:getComputedStyle(document.querySelector('#scAverages .sc-average-totals b')).fontSize,
      aiTotalFont:getComputedStyle(aiCard.querySelector('.sc-totals b')).fontSize
    };
  });

  expect(structure.aiChildren).toEqual(structure.inputChildren);
  expect(structure.aiClass).toContain('sc-day');
  expect(structure.allReadOnly).toBe(true);
  expect(structure.weekdayTitles).toEqual(['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日']);
  expect(structure.inputTotalFont).toBe('14px');
  expect(structure.weekdayAverageTotalFont).toBe('14px');
  expect(structure.aiTotalFont).toBe('14px');
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
  await expect(page.locator('#aiAnalysisSummary .ai-insight-title')).toHaveCount(0);
  await expect(page.locator('#aiAnalysisSummary .ai-insight-state')).toHaveCount(0);
  await expect(page.locator('#aiAnalysisSummary .ai-insight-detail')).toHaveText(interpreted.conclusion[0].replace(/^【結論】/,''));
  const originalViewport=page.viewportSize();
  for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
    await page.setViewportSize(viewport);
    const balance=await page.locator('.ai-workspace-grid').evaluate(grid=>{
      const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat);
      return {ratio:columns[0]/columns[1],overflow:grid.scrollWidth-grid.clientWidth};
    });
    expect(balance.ratio).toBeCloseTo(1.5,1);
    expect(balance.overflow).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize(originalViewport);

  await expect(page.locator('#aiAnalysisCaution .ai-insight-item').first()).toHaveClass(/is-danger/);
  await expect(page.locator('#aiAnalysisGood .ai-insight-item').first()).toHaveClass(/is-neutral/);
  await expect(page.locator('#aiAnalysisChecks .ai-check-line')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('販売数入力の平日・日祝平均は保存済み通常日を分類し比較カードを2種だけ表示する',async({page})=>{
  const errors=await openInsight(page);
  await page.locator('#navSalesCount').click();
  await page.evaluate(()=>{
    store.years=Array.from(new Set(store.years.concat(['2026'])));
    const categoryId=allStores.salesCountManagement.categories.find(c=>!c.hidden).id;
    store.salesCounts={};
    const values={'01':10,'05':20,'06':30,'20':0,'21':40,'22':500,'23':600,'27':700};
    Object.entries(values).forEach(([day,value])=>{
      store.salesCounts['2026-09-'+day]={[categoryId]:{trips:[0,1,2].map(()=>({delivery:value,sales:value}))}};
    });
    store.salesCounts['2026-09-03']={[categoryId]:{trips:[{delivery:0,sales:0},{delivery:null,sales:null},{delivery:0,sales:0}]}};
    store.salesCounts['2026-08-31']={[categoryId]:{trips:[0,1,2].map(()=>({delivery:999,sales:999}))}};
    allStores.eventManagement=allStores.eventManagement||{version:1,presets:[],events:[]};
    allStores.eventManagement.events=[{id:'unrelated-sale',type:'sale',scope:'global',startDate:'2026-09-22',endDate:'2026-09-22',snapshot:{version:1,note:'',title:'別カテゴリー',sale:{categoryId:'cat_other',category:'その他',method:'amount',params:{amount:20}}}}];
    store.events=[{id:'local-special',type:'special',scope:'store',startDate:'2026-09-23',endDate:'2026-09-23',snapshot:{version:1,note:'',title:'催事'}},{id:'local-nearby',type:'nearby',scope:'store',startDate:'2026-09-27',endDate:'2026-09-27',snapshot:{version:1,note:'',title:'近隣イベント'}}];
    InsightSalesCount.setPeriod(2026,9);
    InsightSalesCount.reloadFromStore();
  });
  const cards=page.locator('#scAnalysis .sc-comparisons > section');
  await expect(cards).toHaveCount(2);
  await expect(cards.locator('h3')).toHaveText(['平日平均','日曜日・祝日平均']);
  await expect(page.locator('#scAnalysis h3',{hasText:'セール実績'})).toHaveCount(0);
  await expect(page.locator('#scAnalysis h3',{hasText:'セール日平均'})).toHaveCount(0);
  await expect(page.locator('#scAnalysis h3',{hasText:'同曜日・通常日平均'})).toHaveCount(0);
  await expect(page.locator('#scAnalysis .sc-day-type-note')).toHaveCount(0);
  expect(await page.locator('#scAnalysis').innerText()).not.toContain('選択月の保存済み実績');
  const weekday=cards.nth(0),holiday=cards.nth(1);
  await expect(weekday).toHaveClass(/sc-day-type-card/);
  await expect(holiday).toHaveClass(/sc-day-type-card/);
  await expect(weekday.locator('thead th')).toHaveText(['','1便','2便','3便','1日合計']);
  for(const row of [0,1]){
    await expect(weekday.locator('tbody tr').nth(row).locator('td')).toHaveText(['5','10','5','30']);
    await expect(holiday.locator('tbody tr').nth(row).locator('td')).toHaveText(['23.3','23.3','23.3','70']);
  }
  const spacing=await weekday.evaluate(card=>({
    paddingBottom:getComputedStyle(card).paddingBottom,
    titleMarginBottom:getComputedStyle(card.querySelector('h3')).marginBottom
  }));
  expect(spacing).toEqual({paddingBottom:'12px',titleMarginBottom:'8px'});
  await weekday.scrollIntoViewIfNeeded();
  await expect(weekday).toBeVisible();
  await page.screenshot({path:'test-results/day-type-averages-desktop.png',fullPage:true});
  await page.getByLabel('2026-09-01 1便 販売数',{exact:true}).fill('100');
  await expect(weekday.locator('tbody tr').nth(1).locator('td')).toHaveText(['5','10','5','30']);
  await page.locator('#scSave').click();
  await expect(weekday.locator('tbody tr').nth(1).locator('td')).toHaveText(['50','10','5','120']);
  await page.evaluate(()=>{
    const category=allStores.salesCountManagement.categories.find(c=>!c.hidden);
    category.activeTrips=[false,true,true];
    InsightSalesCount.reloadFromStore();
  });
  await expect(weekday.locator('tbody tr').nth(1).locator('td')).toHaveText(['ー','10','5','20']);
  await page.setViewportSize({width:768,height:1024});
  await holiday.scrollIntoViewIfNeeded();
  expect(await page.locator('#scAnalysis .sc-comparisons').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.screenshot({path:'test-results/day-type-averages-tablet.png',fullPage:true});
  await page.locator('#scCategory').selectOption('cat_sandwich');
  await expect(weekday.locator('tbody tr').nth(1).locator('td')).toHaveText(['—','—','—','—']);
  await page.locator('#scNext').click();
  await expect(holiday.locator('tbody tr').nth(1).locator('td')).toHaveText(['—','—','—','—']);
  expect(errors).toEqual([]);
});
