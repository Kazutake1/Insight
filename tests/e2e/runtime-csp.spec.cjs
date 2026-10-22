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
