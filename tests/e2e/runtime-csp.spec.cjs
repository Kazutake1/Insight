const {test,expect}=require('@playwright/test');

test('実際の画面操作でCSP違反が出ず、禁止されたinline scriptとhandlerはブロックされる',async({page})=>{
  // document.open() in the production shell clears document/window listeners.
  // Browser console diagnostics survive that replacement and cover startup.
  const startupCspErrors=[];
  page.on('console',message=>{
    if(/content security policy|refused to (?:execute|load|apply)/i.test(message.text())){
      startupCspErrors.push(message.text());
    }
  });

  // The deployed site is HTTPS; the test server is HTTP. Match the existing
  // WebKit smoke test by removing only the localhost-incompatible upgrade rule.
  // All other CSP directives are exercised unchanged.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    await route.fulfill({response,body});
  });

  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>
    window.InsightPagePeriodSync&&window.InsightSalesCount&&
    document.getElementById('navSalesCount')&&document.getElementById('pageSettings')
  );

  // Attach the CSP event listener after document.open()/document.write().
  // Registering it through addInitScript would be erased during shell loading.
  await page.evaluate(()=>{
    window.__insightCspViolations=[];
    document.addEventListener('securitypolicyviolation',event=>{
      window.__insightCspViolations.push({
        directive:event.effectiveDirective,
        blockedURI:event.blockedURI,
        disposition:event.disposition,
        sourceFile:event.sourceFile,
        lineNumber:event.lineNumber
      });
    },true);
  });

  // Read-only navigation in a clean Playwright browser context. Do not write
  // sales, orders, settings or any persisted store data.
  for(const [nav,screen] of [
    ['#nav1','#pageDash'],
    ['#nav2','#pageSales'],
    ['#nav3','#pageKyaku'],
    ['#nav4','#pageHaiki'],
    ['#navSalesCount','#pageSalesCount'],
    ['#navSettings','#pageSettings']
  ]){
    await page.locator(nav).click();
    await expect(page.locator(screen)).toHaveClass(/show/);
  }
  await page.waitForTimeout(200);
  const natural=await page.evaluate(()=>window.__insightCspViolations.slice());
  expect(natural,'CSP violation during read-only navigation').toEqual([]);
  expect(startupCspErrors,'browser-reported CSP errors during startup/navigation').toEqual([]);

  // A negative-control probe proves the listener is effective and the policy
  // really blocks injected inline execution, not merely absent violations.
  await page.evaluate(()=>{
    window.__insightCspScriptProbeExecuted=false;
    const script=document.createElement('script');
    script.textContent='window.__insightCspScriptProbeExecuted=true';
    script.dataset.insightCspProbe='script';
    document.head.appendChild(script);
  });
  const scriptViolations=()=>page.evaluate(()=>
    window.__insightCspViolations.filter(event=>
      event.disposition==='enforce'&&/^script-src(?:-|$)/.test(event.directive)&&
      event.blockedURI==='inline'
    ).length
  );
  await expect.poll(scriptViolations).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__insightCspScriptProbeExecuted)).toBe(false);
  const beforeHandler=await scriptViolations();

  await page.evaluate(()=>{
    window.__insightCspHandlerProbeExecuted=false;
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('onclick','window.__insightCspHandlerProbeExecuted=true');
    button.dataset.insightCspProbe='handler';
    document.body.appendChild(button);
    button.click();
  });
  await expect.poll(scriptViolations).toBeGreaterThan(beforeHandler);
  expect(await page.evaluate(()=>window.__insightCspHandlerProbeExecuted)).toBe(false);
  await page.evaluate(()=>{
    document.querySelectorAll('[data-insight-csp-probe]').forEach(node=>node.remove());
  });
});


test('CSPを監視しながら実画面の天気・年度・廃棄予算・分析AI・発注予測を操作する',async({page})=>{
  const diagnostics={consoleCsp:[],javascript:[],network:[]};
  page.on('console',message=>{
    if(/content security policy|refused to (?:execute|load|apply)/i.test(message.text()))
      diagnostics.consoleCsp.push(message.text());
  });
  page.on('pageerror',error=>diagnostics.javascript.push(error.message));
  page.on('requestfailed',request=>diagnostics.network.push({
    url:request.url(),failure:request.failure()?.errorText||'request failed'
  }));

  // The production CSP is tested unchanged except localhost-incompatible
  // upgrade-insecure-requests, matching the existing browser smoke tests.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    await route.fulfill({response,body});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>
    window.InsightSalesCount&&window.InsightPagePeriodSync&&
    document.querySelector('#navOrderForecast')&&document.querySelector('#navSettings')
  );

  // The shell replaces the document, so attach the event listener after boot.
  await page.evaluate(()=>{
    window.__insightActionCsp=[];
    document.addEventListener('securitypolicyviolation',event=>{
      window.__insightActionCsp.push({
        directive:event.effectiveDirective,blockedURI:event.blockedURI,
        disposition:event.disposition,sourceFile:event.sourceFile,
        lineNumber:event.lineNumber
      });
    },true);
  });

  // The E2E browser context is isolated from production storage. Do not submit
  // saves, add a year, change budgets, or write any actual store data.
  await page.locator('#nav0').click();
  await page.locator('#qWeatherCompactTrigger').click();
  await page.locator('#qWeatherCompactMenu [data-wx="晴"]').click();
  await expect(page.locator('#qWeatherCompactTrigger .qwc-label')).toHaveText('晴');

  await page.locator('#navSettings').click();
  await page.locator('#pageSettings #addYearBtn').click();
  await expect(page.locator('#ayInput')).toBeVisible();
  await page.locator('#ayInput').press('Escape');
  await expect(page.locator('#ayInput')).toHaveCount(0);

  await page.locator('#nav4').click();
  await page.locator('#haikiBudgetEditBtn').click();
  await expect(page.locator('#budgetModalBg')).toHaveClass(/show/);
  await page.locator('#budgetCancelBtn').click();
  await expect(page.locator('#budgetModalBg')).not.toHaveClass(/show/);

  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('body')).toHaveClass(/ai-analysis-open/);
  await page.locator('.ai-workspace-close').click();
  await expect(page.locator('body')).not.toHaveClass(/ai-analysis-open/);

  await page.locator('#navOrderForecast').click();
  await expect(page.locator('#pageOrderForecast')).toHaveClass(/show/);
  await expect(page.locator('#ofWeather .of-weather-card')).toHaveCount(7);

  await page.waitForTimeout(200);
  const eventViolations=await page.evaluate(()=>window.__insightActionCsp.slice());
  // Network failures (JMA/Open-Meteo/CDN) and unrelated JS errors are
  // recorded separately, never reclassified as CSP violations.
  const context=JSON.stringify({
    violations:eventViolations,
    cspConsole:diagnostics.consoleCsp,
    javascriptErrors:diagnostics.javascript,
    requestFailures:diagnostics.network
  },null,2);
  expect(eventViolations,'CSP violation events during real UI actions:\n'+context).toEqual([]);
  expect(diagnostics.consoleCsp,'Console CSP errors during real UI actions:\n'+context).toEqual([]);
});

test('保存容量は操作時に保存文字列を参照し、保存内容を変更しない',async({page})=>{
  await page.setViewportSize({width:1194,height:834});
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  await page.locator('#navSettings').click();
  const button=page.getByRole('button',{name:'保存容量を確認',exact:true});
  const result=page.locator('#insightStorageUsage');
  await expect(result).toBeEmpty();
  await page.evaluate(()=>{
    const proto=Storage.prototype;
    const set=proto.setItem;
    const get=proto.getItem;
    const remove=proto.removeItem;
    // Use an isolated context with fictional UTF-16 text, never real data.
    for(const key of Object.keys(localStorage))if(key.startsWith('insight_'))remove.call(localStorage,key);
    set.call(localStorage,'insight_v11','架😀'.repeat(10000));
    set.call(localStorage,'insight_fixture','日'.repeat(10000));
    set.call(localStorage,'unrelated_fixture','X'.repeat(60000));
    window.__capacityWrites=[];
    window.__updateCapacityFixture=()=>set.call(localStorage,'insight_fixture','日'.repeat(20000));
    window.__removePrimaryFixture=()=>remove.call(localStorage,'insight_v11');
    window.__denyCapacityRead=()=>{
      proto.getItem=function(key){
        if(this===localStorage&&key==='insight_fixture')throw new Error('Fictional denied read');
        return get.call(this,key);
      };
    };
    for(const method of ['setItem','removeItem','clear']){
      const original=proto[method];
      proto[method]=function(...args){
        if(this===localStorage)window.__capacityWrites.push(method);
        return original.apply(this,args);
      };
    }
  });
  await button.click();
  await expect(result.locator('div')).toHaveText([
    '店舗データ（全店舗）：0.057 MiB','その他のInsight設定：0.019 MiB','合計（概算）：0.076 MiB'
  ]);
  await page.evaluate(()=>window.__updateCapacityFixture());
  await expect(result).toContainText('合計（概算）：0.076 MiB');
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await button.click();
  await expect(result).toContainText('合計（概算）：0.095 MiB');
  const controlBox=await button.boundingBox();
  const resultBox=await result.boundingBox();
  expect(resultBox.y-controlBox.y-controlBox.height).toBeGreaterThanOrEqual(7);
  await page.evaluate(()=>window.__removePrimaryFixture());
  await button.click();
  await expect(result).toContainText('店舗データ（全店舗）：未保存');
  await page.evaluate(()=>window.__denyCapacityRead());
  await button.click();
  await expect(result).toHaveText('保存容量を計測できません。');
  expect(await page.evaluate(()=>window.__capacityWrites)).toEqual([]);
});
