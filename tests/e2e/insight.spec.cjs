const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');

async function openInsight(page){
  const pakoPath=path.join(process.cwd(),'node_modules','pako','dist','pako.min.js');
  await page.route('https://unpkg.com/pako@2.1.0/dist/pako.min.js',route=>
    route.fulfill({path:pakoPath,contentType:'application/javascript'})
  );
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>window.InsightPagePeriodSync&&window.InsightSalesCount&&window.InsightSaleResults&&window.InsightHourlyCustomers&&window.InsightEventResults&&window.InsightAIVisual&&window.InsightAIInterpretation&&window.InsightAnalysisPeriodLock&&window.InsightMultiYearAnalysis&&window.InsightWeekdayAnalysis&&window.InsightSettings&&document.getElementById('navSettings')&&document.getElementById('pageSettings'));
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


test('トップページはビルド番号を持ち最新版確認をno-storeで行う',async({page})=>{
  const errors=await openInsight(page);
  const source=await page.evaluate(()=>fetch('/Index.html?e2e-shell-check=1',{cache:'no-store'}).then(r=>r.text()));
  expect(source).toContain('name="insight-shell-version" content="20261003-weekday-analysis-1"');
  expect(source).toContain("fetch('./Index.html?insight_probe='+Date.now(),{cache:'no-store'})");
  expect(source).toContain("location.replace('./Index.html?insight_build='+encodeURIComponent(m[1]))");
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
  await expect(page.locator('#insightSettingsDisplayActions #darkModeBtn')).toBeVisible();
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
  await page.locator('#insightDataHealthButton').click();
  await expect(page.locator('#insightDataHealthOverlay')).toBeVisible();
  await expect(page.locator('#insightDataHealthSummary')).toContainText('要確認');
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
  const pakoPath=path.join(process.cwd(),'node_modules','pako','dist','pako.min.js');
  await page.route('https://unpkg.com/pako@2.1.0/dist/pako.min.js',route=>
    route.fulfill({path:pakoPath,contentType:'application/javascript'})
  );
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

  for(const selector of ['#nav2','#nav3','#nav4','#navSalesCount','#navSaleResults','#navEventResults']){
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
    const grid=document.querySelector('.sr-day-grid');
    const gridRect=grid.getBoundingClientRect();
    const seventhRect=cards[6].getBoundingClientRect();
    return {
      firstTop:cards[0].getBoundingClientRect().top,
      seventhTop:seventhRect.top,
      eighthTop:cards[7].getBoundingClientRect().top,
      seventhRight:seventhRect.right,
      gridRight:gridRect.right,
      gridScrollWidth:grid.scrollWidth,
      gridClientWidth:grid.clientWidth,
      saleChildren:Array.from(saleCard.children).map(node=>node.className),
      inputChildren:inputCard?Array.from(inputCard.children).map(node=>node.className):[],
      allReadOnly:Array.from(saleCard.querySelectorAll('input')).every(input=>input.readOnly)
    };
  });

  expect(Math.abs(layout.firstTop-layout.seventhTop)).toBeLessThanOrEqual(1);
  expect(layout.eighthTop).toBeGreaterThan(layout.seventhTop+20);
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

  await page.locator('#nav1').click();
  await expect(page.locator('#insightDeleteYearButton')).toBeVisible();
  await page.locator('#insightDeleteYearButton').click();
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
  const initialOrder=await page.evaluate(()=>Array.from(document.getElementById('opsDailyWrap').children).map(node=>node.id));
  expect(initialOrder.indexOf('hourlyCustomersQuick')).toBeLessThan(initialOrder.indexOf('insightEvents'));

  await page.locator('#hourlyCustomersQuick .hourly-quick-button').click();
  await expect(page.locator('.hourly-dialog')).toBeVisible();
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
      {id:'e2e_event_results_old',type:'nearby',scope:'store',startDate:'2025-09-10',endDate:'2025-09-10',snapshot:{version:1,title:'E2Eコンサート',note:'前年',location:'E2E文化フォーラム'}},
      {id:'e2e_event_results_new',type:'nearby',scope:'store',startDate:'2026-09-12',endDate:'2026-09-13',snapshot:{version:1,title:'E2Eコンサート',note:'2日開催',location:'E2E文化フォーラム'}}
    );

    function metricsFor(date){
      const day=Number(date.slice(-2));
      return {salesYen:100000+day*1000,customers:90+day,customerUnitPrice:(100000+day*1000)/(90+day),items:200+day/100,inputDays:1};
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
  await expect(page.locator('.er-occurrence').first()).toContainText('売上 225,000円');
  await expect(page.locator('.er-occurrence').first()).toContainText('客数 205人');

  await page.locator('.er-occurrence').first().click();
  await expect(page.locator('.er-overview-grid .er-summary-card')).toHaveCount(4);
  await expect(page.locator('.er-daily-summary')).toBeVisible();
  await expect(page.locator('.er-day-tab')).toHaveCount(2);
  await expect(page.locator('.er-day-tab').first()).toHaveClass(/active/);
  await expect(page.locator('.er-hourly-section')).toBeVisible();
  await expect(page.locator('.er-peak')).toContainText('18時台 186人');
  await expect(page.locator('.er-hour-item')).toHaveCount(24);
  await expect(page.locator('.er-hour-item>strong')).toHaveCount(0);
  await expect(page.locator('.er-hour-plot')).toHaveCount(24);
  await expect(page.locator('.er-hour-value:visible')).toHaveCount(0);
  const hourlyBarColor=await page.locator('.er-hour-bar').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(hourlyBarColor).toBe('rgb(59, 130, 246)');
  const timeFontSize=await page.locator('.er-hour-item>span').first().evaluate(el=>getComputedStyle(el).fontSize);
  expect(timeFontSize).toBe('11.5px');
  const hourlyGap=await page.locator('.er-hour-chart').evaluate(el=>getComputedStyle(el).gap);
  expect(hourlyGap).toBe('4px');
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
  expect(horizontal.scrollWidth).toBeGreaterThan(horizontal.clientWidth);
  expect(horizontal.minWidth).toBe('1340px');
  expect(horizontal.rightGap).toBeLessThanOrEqual(7);

  await expect(page.locator('.er-category-card')).toHaveCount(2);
  await expect(page.locator('.er-category-card .sc-day')).toHaveCount(2);
  const readOnly=await page.locator('.er-category-card input').evaluateAll(inputs=>inputs.every(input=>input.readOnly));
  expect(readOnly).toBe(true);

  await page.locator('.er-day-tab').nth(1).click();
  await expect(page.locator('.er-day-tab').nth(1)).toHaveClass(/active/);
  await expect(page.locator('.er-hourly-section')).toHaveCount(0);
  await expect(page.locator('.er-category-card')).toHaveCount(0);

  await page.locator('.er-back').click();
  await page.locator('.er-occurrence').nth(1).click();
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
  await presetDialog.getByRole('button',{name:'保存する'}).click();
  await expect(presetDialog.getByText('E2E催事',{exact:true})).toBeVisible();
  await presetDialog.getByRole('button',{name:'閉じる'}).click();

  eventDialog=page.locator('.ie-dialog.ie-event-add');
  await expect(eventDialog.getByRole('button',{name:'E2E催事'})).toBeVisible();
  await eventDialog.getByRole('button',{name:'E2E催事'}).click();
  await expect(eventDialog.getByLabel('催事名')).toHaveValue('E2E催事');
  await expect(eventDialog.getByLabel('補足（任意）')).toHaveValue('毎年確認');
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
