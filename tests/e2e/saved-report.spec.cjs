'use strict';
const {test,expect}=require('@playwright/test');
const {reportFixture}=require('../report_fixture.cjs');
async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.addInitScript(snapshot=>localStorage.setItem('insight_v11',JSON.stringify(snapshot)),reportFixture());
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#insightReportOpen')).toBeAttached();
  await page.waitForFunction(()=>window.InsightTripHistoryResolver&&window.InsightStorage&&window.InsightReportPreview);
  return errors;
}
async function open(page){
  await page.locator('#insightReportOpen').click();await expect(page.locator('#insightReportDialog')).toBeVisible();
}
async function conditions(page,store='store_a'){
  await page.locator('#irp-store').selectOption(store);await page.locator('#irp-category').selectOption('food');
  for(const [id,value] of Object.entries({start:'2026-10-19',end:'2026-10-19',referenceStart:'2026-10-12',referenceEnd:'2026-10-12',
    quantityDay:'2026-10-19',quantityStart:'2026-09-28',quantityEnd:'2026-09-29'}))
    await page.locator('#irp-'+id).fill(value);
}
async function generate(page){
  await page.locator('#insightReportGenerate').click();
  await expect(page.locator('#insightReportText')).toContainText('対象期間：2026-10-19');
}
test('明示カテゴリーで保存済み報告を生成し、通信・保存・未保存live混入を起こさない',async({page})=>{
  const errors=await boot(page);
  const before=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  await open(page);await expect(page.locator('#irp-category')).toHaveValue('');
  await page.locator('#insightReportGenerate').click();await expect(page.locator('#insightReportText')).toBeEmpty();
  await conditions(page);
  const counters=await page.evaluate(()=>{
    const originalWrite=Storage.prototype.setItem,originalFetch=window.fetch;let writes=0,requests=0;
    allStores.stores.store_a.data['2026']['10月'][18].売上=1;
    Storage.prototype.setItem=function(){writes++;throw Error('report_must_not_write');};
    window.fetch=function(){requests++;throw Error('report_must_not_fetch');};
    try{document.getElementById('insightReportConditions').requestSubmit();return {writes,requests};}
    finally{Storage.prototype.setItem=originalWrite;window.fetch=originalFetch;}
  });
  expect(counters).toEqual({writes:0,requests:0});
  const output=page.locator('#insightReportText');
  await expect(output).toContainText('80000円');await expect(output).toContainText('日合計0個で確定');
  await expect(output).toContainText('保存値0');await expect(output).toContainText('判定できません');
  await expect(output).not.toContainText('1000円');await expect(output).toContainText('確認情報（非選択も全件保持）');
  await expect(output).toContainText('不足情報（非選択も全件保持）');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(before);
  expect(errors).toEqual([]);
});
test('店舗・期間・カテゴリーの変更で消去し店舗を混同しない',async({page})=>{
  const errors=await boot(page);await open(page);await conditions(page);await generate(page);
  await page.locator('#irp-store').selectOption('store_b');await expect(page.locator('#insightReportText')).toBeEmpty();
  await generate(page);await expect(page.locator('#insightReportText')).toContainText('架空店舗B');
  await expect(page.locator('#insightReportText')).toContainText('40000円');
  await expect(page.locator('#insightReportText')).not.toContainText('80000円');
  await page.locator('#irp-end').fill('2026-10-20');await expect(page.locator('#insightReportText')).toBeEmpty();
  await conditions(page);await generate(page);await page.locator('#irp-category').selectOption('');
  await expect(page.locator('#insightReportText')).toBeEmpty();expect(errors).toEqual([]);
});
test('private writerからapply完了まで報告を消し完了後の保存値を読む',async({page})=>{
  const errors=await boot(page);await open(page);await conditions(page);await generate(page);
  const result=await page.evaluate(()=>{
    const original=Storage.prototype.setItem;let duringWrite=false,duringApply=false,blocked=false;
    Storage.prototype.setItem=function(key,value){
      if(key==='insight_v11'){
        duringWrite=document.getElementById('insightReportText').textContent===''&&InsightStorage.reportState().pending>0;
        document.getElementById('insightReportConditions').requestSubmit();
        blocked=document.getElementById('insightReportText').textContent==='';
      }
      return original.call(this,key,value);
    };
    try{
      InsightStorage.transaction(allStores,next=>{next.stores.store_a.data['2026']['10月'][18].売上=70;},null,next=>{
        duringApply=document.getElementById('insightReportText').textContent===''&&InsightStorage.reportState().pending>0;
        allStores=next;
      });
      return {duringWrite,duringApply,blocked,pending:InsightStorage.reportState().pending};
    }finally{Storage.prototype.setItem=original;}
  });
  expect(result).toEqual({duringWrite:true,duringApply:true,blocked:true,pending:0});
  await expect(page.locator('#insightReportText')).toBeEmpty();
  await generate(page);await expect(page.locator('#insightReportText')).toContainText('70000円');
  expect(errors).toEqual([]);
});
test('保存失敗後は閉じて開き直しても生成せず保存内容を保持する',async({page})=>{
  const errors=await boot(page);await open(page);await conditions(page);await generate(page);
  const outcome=await page.evaluate(()=>{
    const before=localStorage.getItem('insight_v11'),original=Storage.prototype.setItem;let caught=false;
    Storage.prototype.setItem=function(key,value){if(key==='insight_v11')throw Error('fictional quota');return original.call(this,key,value);};
    try{allStores.stores.store_a.data['2026']['10月'][18].売上=70;InsightStorage.persistCurrent(allStores);}catch(_){caught=true;}
    finally{Storage.prototype.setItem=original;}
    return {caught,held:InsightStorage.reportState().held,unchanged:localStorage.getItem('insight_v11')===before};
  });
  expect(outcome).toEqual({caught:true,held:true,unchanged:true});
  await expect(page.locator('#insightReportText')).toBeEmpty();
  await page.locator('#insightReportDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await open(page);await page.locator('#insightReportGenerate').click();
  await expect(page.locator('#insightReportText')).toBeEmpty();
  await expect(page.locator('#insightReportStatus')).toContainText('保存');
  expect(errors).toEqual([]);
});
test('別タブ更新とpageshow通知で旧本文を保持しない',async({page})=>{
  const errors=await boot(page);await open(page);await conditions(page);await generate(page);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await expect(page.locator('#insightReportText')).toBeEmpty();await generate(page);
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'insight_v11',newValue:null})));
  await expect(page.locator('#insightReportText')).toBeEmpty();
  await page.locator('#insightReportGenerate').click();await expect(page.locator('#insightReportText')).toBeEmpty();
  expect(errors).toEqual([]);
});
test('通常の保存で旧報告を消し、閉じると既存分析AIを操作できる',async({page})=>{
  const errors=await boot(page);await open(page);await conditions(page);await generate(page);
  await page.evaluate(()=>InsightStorage.persistCurrent(allStores));
  await expect(page.locator('#insightReportText')).toBeEmpty();await generate(page);
  await page.locator('#insightReportDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await expect(page.locator('#insightReportDialog')).not.toBeVisible();
  await expect(page.locator('#insightReportText')).toBeEmpty();
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('#aiAnalysisToggle')).toHaveAttribute('aria-expanded','true');
  await page.locator('#aiAnalysisClose').click();
  await expect(page.locator('#aiAnalysisToggle')).toHaveAttribute('aria-expanded','false');
  expect(errors).toEqual([]);
});
test('HTML風店舗名を文字として表示し、iPad横向きのライトとダークで横にはみ出さない',async({page})=>{
  await page.setViewportSize({width:1194,height:834});const errors=await boot(page);
  await page.evaluate(()=>{
    const next=InsightStorage.readSnapshot();next.stores.store_a.name='<img src=x onerror=alert(1)>架空店舗A';
    InsightStorage.writeSnapshot(next);
  });
  await open(page);await conditions(page);await generate(page);
  const output=page.locator('#insightReportText');
  await expect(output).toContainText('<img src=x onerror=alert(1)>架空店舗A');
  await expect(output.locator('img,script,iframe')).toHaveCount(0);
  for(const dark of [false,true]){
    await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
    for(const width of [1194,834]){
      await page.setViewportSize({width,height:834});
      const bounds=await page.locator('#insightReportDialog').evaluate(dialog=>{
        const rect=dialog.getBoundingClientRect(),style=getComputedStyle(dialog);
        return {inside:rect.left>=0&&rect.right<=innerWidth,overflow:dialog.scrollWidth>dialog.clientWidth,
          background:style.backgroundColor,color:style.color,
          inputs:[...dialog.querySelectorAll('input,select,button')].every(n=>n.getBoundingClientRect().height>=44)};
      });
      expect(bounds.inside).toBe(true);expect(bounds.overflow).toBe(false);expect(bounds.inputs).toBe(true);
      expect(bounds.background).toBe(dark?'rgb(37, 37, 37)':'rgb(255, 255, 255)');
      expect(bounds.color).toBe(dark?'rgb(238, 238, 238)':'rgb(34, 34, 34)');
    }
  }
  expect(errors).toEqual([]);
});
