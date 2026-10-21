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

async function checkReportSpacing(page){
  const layout=await page.locator('#insightReportDialog').evaluate(dialog=>{
    const bounds=n=>n.getBoundingClientRect(),control=id=>dialog.querySelector('#irp-'+id);
    const pairs=[['start','end'],['referenceStart','referenceEnd'],['quantityStart','quantityEnd']].map(ids=>{
      const controls=ids.map(control),a=bounds(controls[0]),b=bounds(controls[1]);
      return {gap:b.left-a.right,aligned:Math.abs(a.top-b.top),
        contained:controls.every(n=>{const r=bounds(n),p=bounds(n.parentElement);return r.left>=p.left-1&&r.right<=p.right+1;})};
    });
    const rows=[['store','category'],['start','end'],['referenceStart','referenceEnd'],['quantityDay'],['quantityStart','quantityEnd']]
      .map(ids=>ids.map(id=>bounds(control(id).parentElement)));
    const vertical=rows.slice(1).map((row,i)=>Math.min(...row.map(r=>r.top))-Math.max(...rows[i].map(r=>r.bottom)));
    const labels=[...dialog.querySelectorAll('.irp-field')].map(label=>{
      return bounds(label.querySelector('input,select')).top-bounds(label.querySelector('span')).bottom;
    });
    return {pairs,vertical,labels,groups:dialog.querySelectorAll('fieldset,legend').length,
      buttonGap:bounds(dialog.querySelector('#insightReportGenerate')).top-bounds(control('quantityEnd')).bottom};
  });
  expect(layout.groups).toBe(0);
  expect(layout.pairs).toHaveLength(3);
  for(const pair of layout.pairs){expect(pair.gap).toBeGreaterThanOrEqual(23);expect(pair.aligned).toBeLessThanOrEqual(1);expect(pair.contained).toBe(true);}
  for(const gap of layout.vertical)expect(gap).toBeGreaterThanOrEqual(23);
  for(const gap of layout.labels)expect(gap).toBeGreaterThanOrEqual(7);
  expect(layout.buttonGap).toBeGreaterThanOrEqual(23);
}

async function checkReportTheme(page){
  const differences=await page.locator('#insightReportDialog').evaluate(dialog=>{
    // Compare with the actual existing event-dialog rules, not another report-only palette.
    const reference=document.createElement('dialog');reference.className='ie-dialog';reference.hidden=true;
    const heading=document.createElement('h2'),input=document.createElement('input'),secondary=document.createElement('button'),
      primary=document.createElement('button');input.type='date';primary.className='ie-primary';
    reference.append(heading,input,secondary,primary);document.body.append(reference);
    try{
      const pairs=[
        [dialog,reference,['backgroundColor','color','borderColor','borderRadius','boxShadow','fontFamily','fontSize']],
        [dialog.querySelector('h2'),heading,['fontSize','fontWeight','color']],
        [dialog.querySelector('input'),input,['backgroundColor','color','borderColor','borderRadius','fontFamily','fontSize']],
        [dialog.querySelector('.irp-head button'),secondary,['backgroundColor','color','borderColor','borderRadius','fontFamily','fontSize']],
        [dialog.querySelector('#insightReportGenerate'),primary,['backgroundColor','color','borderColor','borderRadius','fontFamily','fontSize']]
      ];
      return pairs.flatMap(([actual,expected,properties],index)=>{
        const a=getComputedStyle(actual),b=getComputedStyle(expected);
        return properties.filter(key=>a[key]!==b[key]).map(key=>({index,key,actual:a[key],expected:b[key]}));
      });
    }finally{reference.remove();}
  });
  expect(differences).toEqual([]);
}

async function open(page){
  await page.locator('#insightReportOpen').click();await expect(page.locator('#insightReportDialog')).toBeVisible();
  await expect.poll(()=>page.locator('#insightReportDialog').evaluate(dialog=>{
    const r=dialog.getBoundingClientRect();return Math.max(Math.abs(r.left+r.width/2-innerWidth/2),Math.abs(r.top+r.height/2-innerHeight/2));
  })).toBeLessThanOrEqual(1);
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
  await page.locator('#aiAnalysisToggle').click();
  await expect(page.locator('#aiAnalysisToggle')).toHaveAttribute('aria-expanded','false');
  expect(errors).toEqual([]);
});
test('HTML風店舗名を文字として表示し、iPad相当のライトとダークで中央に収まり見切れない',async({page})=>{
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
    for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
      await page.setViewportSize(viewport);
      const bounds=await page.locator('#insightReportDialog').evaluate(dialog=>{
        const rect=dialog.getBoundingClientRect(),style=getComputedStyle(dialog);
        return {centerX:Math.abs(rect.left+rect.width/2-innerWidth/2),centerY:Math.abs(rect.top+rect.height/2-innerHeight/2),
          inside:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,overflow:dialog.scrollWidth>dialog.clientWidth,
          background:style.backgroundColor,color:style.color,
          inputs:[...dialog.querySelectorAll('input,select,button')].every(n=>n.getBoundingClientRect().height>=44)};
      });
      await checkReportSpacing(page);await checkReportTheme(page);
      expect(bounds.centerX).toBeLessThanOrEqual(1);expect(bounds.centerY).toBeLessThanOrEqual(1);
      expect(bounds.inside).toBe(true);expect(bounds.overflow).toBe(false);expect(bounds.inputs).toBe(true);
      expect(bounds.background).toBe(dark?'rgb(28, 28, 34)':'rgb(255, 255, 255)');
      expect(bounds.color).toBe(dark?'rgb(240, 240, 244)':'rgb(26, 26, 26)');
    }
  }
  expect(errors).toEqual([]);
});

test('初回表示でも既存イベント画面のデザインに揃い、期間枠と項目・ボタンに余白がある',async({page})=>{
  const errors=await boot(page);await open(page);
  for(const dark of [false,true]){
    await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
    for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
      await page.setViewportSize(viewport);await checkReportSpacing(page);await checkReportTheme(page);
    }
  }
  expect(errors).toEqual([]);
});
