const {test,expect}=require('@playwright/test');

async function fictionalBudget(page,{observerMissing=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(observerMissing){
    await page.route('**/insight_operation_observer_v0.js*',route=>
      route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL observer absent'}));
  }
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof saveBudget==='function'&&
    typeof InsightWasteBudgetSaveObserverV0!=='undefined'&&
    typeof InsightWasteBudgetSaveObserverV0.getStatus==='function');
  await page.evaluate(()=>{
    // Fully FICTIONAL, browser-only store, never load any production backup.
    const template=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    const cats={};
    HAIKI_CATS.forEach(c=>cats[c]=0);
    allStores={current:'fictional_budget_store',stores:{
      fictional_budget_store:{...template,name:'FICTIONAL Waste Budget Store',
        haikibudget:{total:900,cats}}
    }};
    store=allStores.stores[allStores.current];
    InsightStorage.persistCurrent(allStores);
    window.haikiSelDay=0; // Avoid unrelated form render; this spec covers saveBudget only.
    window.__budgetSamples=[];
    window.__budgetAlerts=[];
    window.alert=message=>window.__budgetAlerts.push(String(message));
    openBudgetModal();
    document.getElementById('be_total').value='7,200';
    document.getElementById('be_'+HAIKI_CATS[0]).value='1,800';
  });
}

test('FICTIONAL waste budget save stays ACTIVE before/after persistence, then IDLE',async({page})=>{
  await fictionalBudget(page);
  await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      window.__budgetSamples.push(InsightWasteBudgetSaveObserverV0.getStatus());
      const value=original.apply(this,arguments);
      window.__budgetSamples.push(InsightWasteBudgetSaveObserverV0.getStatus());
      return value;
    };
    saveBudget();
  });
  const outcome=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightWasteBudgetSaveObserverV0.getStatus(),
      samples:window.__budgetSamples,
      total:saved.stores.fictional_budget_store.haikibudget.total,
      cat:saved.stores.fictional_budget_store.haikibudget.cats[HAIKI_CATS[0]],
      live:store.haikibudget.total,
      modalOpen:document.getElementById('budgetModalBg').classList.contains('show')};
  });
  expect(outcome.samples.length).toBe(2);
  expect(outcome.samples.every(s=>s.state==='ACTIVE'&&s.activeCount===1)).toBe(true);
  expect(outcome.status.scope).toBe('waste-budget-dialog-save-only');
  expect(outcome.status.state).toBe('IDLE_OBSERVED');
  expect(outcome.status.activeCount).toBe(0);
  expect(outcome.total).toBe(7200);
  expect(outcome.cat).toBe(1800);
  expect(outcome.live).toBe(7200);
  expect(outcome.modalOpen).toBe(false);
});

test('FICTIONAL postcommit budget exception preserves existing error and HELD',async({page})=>{
  await fictionalBudget(page);
  const outcome=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    InsightStorage.persistCurrent=function(){
      const result=original.apply(this,arguments);
      throw new Error('FICTIONAL budget postcommit failure');
    };
    let thrown;
    try{saveBudget();}catch(e){thrown=e.name;}
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {thrown,status:InsightWasteBudgetSaveObserverV0.getStatus(),
      total:saved.stores.fictional_budget_store.haikibudget.total,
      alerts:window.__budgetAlerts,
      modalOpen:document.getElementById('budgetModalBg').classList.contains('show')};
  });
  expect(outcome.thrown).toBe('InsightPersistError');
  expect(outcome.status.state).toBe('HELD');
  expect(outcome.status.activeCount).toBe(0);
  expect(outcome.total).toBe(7200);
  expect(outcome.modalOpen).toBe(true);
  expect(outcome.alerts.join(' ')).toContain('保存結果を確認できないため');
});

test('FICTIONAL observer missing never prevents existing budget save',async({page})=>{
  await fictionalBudget(page,{observerMissing:true});
  expect((await page.evaluate(()=>InsightWasteBudgetSaveObserverV0.getStatus())).state).toBe('UNAVAILABLE');
  await page.evaluate(()=>saveBudget());
  const outcome=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {status:InsightWasteBudgetSaveObserverV0.getStatus(),
      total:saved.stores.fictional_budget_store.haikibudget.total};
  });
  expect(outcome.status.state).toBe('UNAVAILABLE');
  expect(outcome.total).toBe(7200);
});

test('FICTIONAL cancel does not invoke saveBudget observation or persist',async({page})=>{
  await fictionalBudget(page);
  const outcome=await page.evaluate(()=>{
    const original=InsightStorage.persistCurrent;
    let writes=0;
    InsightStorage.persistCurrent=function(){writes++;return original.apply(this,arguments);};
    closeBudgetModal();
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {writes,status:InsightWasteBudgetSaveObserverV0.getStatus(),
      total:saved.stores.fictional_budget_store.haikibudget.total};
  });
  expect(outcome.writes).toBe(0);
  expect(outcome.status.state).toBe('IDLE_OBSERVED');
  expect(outcome.total).toBe(900);
});
