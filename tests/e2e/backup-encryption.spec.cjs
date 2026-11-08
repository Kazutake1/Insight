const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
require('./helpers/verified-chart.cjs')(test);
test.use({viewport:{width:1194,height:834}});
const PASSWORD='FICTIONAL-file-password-2026';
const SAFETY='FICTIONAL-distinct-safety-2026';
async function setup(page,{missingGuard=false}={}){
  if(missingGuard)await page.route('**/insight_backup_guard_v1.js*',route=>route.fulfill({status:404,body:'FICTIONAL missing backup guard'}));
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightBackupCryptoV1&&window.InsightBackupPasswordV1&&window.InsightDataHealth&&window.InsightSettings&&window.InsightReportPreview);
  await page.evaluate(()=>{
    const snapshot=JSON.parse(JSON.stringify(allStores));
    const id=snapshot.current,other='FICTIONAL-other-store';
    snapshot.stores[id].name='架空店舗A';
    snapshot.stores[other]=JSON.parse(JSON.stringify(snapshot.stores[id]));snapshot.stores[other].name='架空店舗B';
    const year=snapshot.stores[id].years.at(-1);
    snapshot.stores[id].data[year]['1月'][0].売上=123;
    snapshot.stores[other].data[year]['1月'][0].売上=456;
    allStores=snapshot;store=snapshot.stores[id];InsightStorage.persistCurrent(allStores);
    window.__backupAlerts=[];window.__backupCsp=[];
    const nativeAlert=window.alert;window.alert=message=>{__backupAlerts.push(String(message));nativeAlert(message);};
    document.addEventListener('securitypolicyviolation',e=>__backupCsp.push(e.violatedDirective));
    gotoNav('settings');
  });
  page.on('dialog',d=>d.accept());
}
async function password(page,value,confirm=true){
  await expect(page.locator('#insightBackupPassword')).toBeVisible();
  await page.locator('#insightBackupPassword').fill(value);
  if(confirm)await page.locator('#insightBackupPasswordConfirm').fill(value);
  await page.locator('#insightBackupOverlay button[type=submit]').click();
}
async function upload(page,file){await page.locator('#restoreFile').setInputFiles({name:'FICTIONAL.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});}
async function confirmSaved(page){
  await expect(page.getByRole('button',{name:'保存したファイルを確認した',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'保存したファイルを確認した',exact:true}).click();
}
async function enableSafetyBackup(page){
  if(!await page.locator('#insightRestoreSafetyBackup').isChecked())await page.locator('.insight-restore-safety-switch-track').click();
  await expect(page.locator('#insightRestoreSafetyBackup')).toBeChecked();
}
async function downloaded(event){return JSON.parse(fs.readFileSync(await event.path(),'utf8'));}
test('FICTIONAL real modal: centered light/dark spacing, mismatch, encrypted two-store download',async({page})=>{
  await setup(page);
  const before=await page.evaluate(()=>JSON.parse(JSON.stringify(allStores)));
  await page.locator('#backupBtn').click();
  for(const dark of [false,true]){
    await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
    const box=await page.locator('.insight-backup-panel').boundingBox(),viewport=page.viewportSize();
    expect(Math.abs(box.x+box.width/2-viewport.width/2)).toBeLessThan(2);
    expect(Math.abs(box.y+box.height/2-viewport.height/2)).toBeLessThan(2);
    const a=await page.locator('#insightBackupPassword').boundingBox(),b=await page.locator('#insightBackupPasswordConfirm').boundingBox();
    expect(b.y-a.y-a.height).toBeGreaterThan(16);
    expect(b.y+b.height).toBeLessThan(box.y+box.height-40);
    const colors=await page.locator('#insightBackupPassword').evaluate(n=>({bg:getComputedStyle(n).backgroundColor,fg:getComputedStyle(n).color}));
    expect(colors.bg).not.toBe(colors.fg);
  }
  await page.locator('#insightBackupPassword').fill(PASSWORD);
  await page.locator('#insightBackupPasswordConfirm').fill('FICTIONAL-mismatch-password');
  await page.locator('#insightBackupOverlay button[type=submit]').click();
  await expect(page.getByRole('alert')).toContainText('一致しません');
  const event=page.waitForEvent('download');await password(page,PASSWORD);
  const file=await downloaded(await event);
  expect(file.format).toBe('InsightEncryptedBackup');expect(file.data).toBeUndefined();
  const payload=await page.evaluate(({file,PASSWORD})=>InsightBackupCryptoV1.decrypt(file,PASSWORD),{file,PASSWORD});
  expect(payload.data).toEqual(before);
  await expect(page.locator('#backupDaysLabel')).toContainText('保存未確認');
  expect(await page.evaluate(()=>localStorage.getItem('insight_backup_confirmed_v1'))).toBeNull();
  await confirmSaved(page);
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).not.toContain(PASSWORD);
  expect(await page.evaluate(()=>__backupCsp)).toEqual([]);
});

for(const mode of ['unavailable','safety-failure']){
  test('FICTIONAL '+mode+' stops legacy restore before any snapshot write or plaintext download',async({page})=>{
    await setup(page);await enableSafetyBackup(page);const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
    const downloads=[];page.on('download',event=>downloads.push(event));
    await page.evaluate(mode=>{
      if(mode==='unavailable')InsightBackupCryptoV1=undefined;
      else InsightBackupCryptoV1={...InsightBackupCryptoV1,encrypt:async()=>{throw new Error('FICTIONAL crypto failure');}};
    },mode);
    await upload(page,JSON.parse(raw));
    if(mode==='safety-failure')await password(page,SAFETY);
    await expect.poll(()=>page.evaluate(()=>__backupAlerts.length)).toBe(1);
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
    expect(downloads).toHaveLength(0);
  });
}
for(const initialized of [false,true]){
  test('FICTIONAL backup rejection preserves '+(initialized?'idle':'unavailable')+' restore observation and permits later restore',async({page})=>{
    await setup(page);await enableSafetyBackup(page);
    if(initialized){
      const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
      const initialDownload=page.waitForEvent('download');
      await upload(page,JSON.parse(raw));await password(page,SAFETY);await initialDownload;await confirmSaved(page);
      await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    }
    const before=await page.evaluate(()=>({raw:localStorage.getItem('insight_v11'),live:JSON.stringify(allStores),observer:InsightRestoreOperationObserverV0.getStatus()}));
    expect(before.observer.state).toBe(initialized?'IDLE_OBSERVED':'UNAVAILABLE');
    const downloads=[];page.on('download',event=>downloads.push(event));
    await page.evaluate(()=>{
      const original=InsightBackupCryptoV1;window.__originalBackupCrypto=original;
      InsightBackupCryptoV1={...original,encrypt:(...args)=>new Promise(resolve=>{window.__releaseCrypto=async()=>resolve(await original.encrypt(...args));})};
    });
    await page.locator('#backupBtn').click();await password(page,PASSWORD);
    await page.waitForFunction(()=>typeof __releaseCrypto==='function');
    await page.evaluate(()=>restoreData({target:{value:'selected',files:[{name:'FICTIONAL.json',size:1}]}}));
    expect(await page.evaluate(()=>({raw:localStorage.getItem('insight_v11'),live:JSON.stringify(allStores),observer:InsightRestoreOperationObserverV0.getStatus()}))).toEqual(before);
    await page.getByRole('button',{name:'キャンセル',exact:true}).click();
    await page.evaluate(()=>__releaseCrypto());
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>({raw:localStorage.getItem('insight_v11'),live:JSON.stringify(allStores),observer:InsightRestoreOperationObserverV0.getStatus()}))).toEqual(before);
    expect(await page.evaluate(()=>localStorage.getItem('insight_last_backup'))).toBeNull();
    expect(downloads).toHaveLength(0);
    await page.evaluate(()=>{InsightBackupCryptoV1=__originalBackupCrypto;});
    const target=JSON.parse(before.raw);
    for(const st of Object.values(target.stores))st.data[st.years.at(-1)]['1月'][0].売上=987;
    await upload(page,target);await password(page,SAFETY);await confirmSaved(page);
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>InsightRestoreOperationObserverV0.getStatus().state)).toBe('IDLE_OBSERVED');
    expect(await page.evaluate(()=>Object.values(InsightStorage.readSnapshot().stores).map(st=>st.data[st.years.at(-1)]['1月'][0].売上))).toEqual([987,987]);
    expect(downloads).toHaveLength(1); // Only the later confirmed restore's encrypted safety backup.
  });
}
test('FICTIONAL encrypted restore uses a separately entered safety password and persists across reload',async({page})=>{
  await setup(page);await enableSafetyBackup(page);
  const original=await page.evaluate(()=>JSON.parse(JSON.stringify(allStores)));
  const file=await page.evaluate(async PASSWORD=>{
    const target=JSON.parse(JSON.stringify(allStores));for(const st of Object.values(target.stores))st.data[st.years.at(-1)]['1月'][0].売上=789;
    return InsightBackupCryptoV1.encrypt(target,PASSWORD);
  },PASSWORD);
  await upload(page,file);await password(page,PASSWORD,false);
  await expect(page.locator('#insightBackupTitle')).toContainText('復元直前');
  const event=page.waitForEvent('download');await password(page,SAFETY);
  const safety=await downloaded(await event);
  const restoredBefore=await page.evaluate(({safety,SAFETY})=>InsightBackupCryptoV1.decrypt(safety,SAFETY),{safety,SAFETY});
  expect(restoredBefore.data).toEqual(original);
  expect(await page.evaluate(()=>InsightStorage.readSnapshot())).toEqual(original);
  await confirmSaved(page);
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>__backupAlerts)).toEqual([]);
  await page.reload();await page.waitForFunction(()=>window.InsightStorage);
  expect(await page.evaluate(()=>Object.values(InsightStorage.readSnapshot().stores).map(st=>st.data[st.years.at(-1)]['1月'][0].売上))).toEqual([789,789]);
});
for(const safetyBackup of [false,true]){
test('FICTIONAL safety '+(safetyBackup?'ON':'OFF')+' cancel/wrong password/tamper/unknown encryption never changes current bytes',async({page})=>{
  await setup(page);if(safetyBackup)await enableSafetyBackup(page);
  const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  const file=await page.evaluate(PASSWORD=>InsightBackupCryptoV1.encrypt(JSON.parse(JSON.stringify(allStores)),PASSWORD),PASSWORD);
  for(const mode of ['cancel','wrong','tamper','version']){
    const input=JSON.parse(JSON.stringify(file));
    if(mode==='tamper')input.ciphertext=(input.ciphertext[0]==='A'?'B':'A')+input.ciphertext.slice(1);
    if(mode==='version')input.formatVersion=999;
    await upload(page,input);
    if(mode==='cancel')await page.getByRole('button',{name:'キャンセル',exact:true}).click();
    else await password(page,mode==='wrong'?SAFETY:PASSWORD,false);
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  }
});
}
test('FICTIONAL legacy plaintext imports but safety encryption cancellation preserves bytes',async({page})=>{
  await setup(page);await enableSafetyBackup(page);const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  await upload(page,JSON.parse(raw));
  await expect(page.locator('#insightBackupTitle')).toContainText('復元直前');
  await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
});
test('FICTIONAL maximum 15MiB plaintext produces a restorable envelope above old 20MiB file limit',async({page})=>{
  test.setTimeout(90000);await setup(page);
  const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  const file=await page.evaluate(async PASSWORD=>{
    const snapshot=JSON.parse(JSON.stringify(allStores));
    snapshot.fictionalPadding='';
    snapshot.fictionalPadding='A'.repeat(15*1024*1024-new TextEncoder().encode(JSON.stringify(snapshot)).length);
    return InsightBackupCryptoV1.encrypt(snapshot,PASSWORD);
  },PASSWORD);
  expect(Buffer.byteLength(JSON.stringify(file))).toBeGreaterThan(20*1024*1024);
  expect(Buffer.byteLength(JSON.stringify(file))).toBeLessThan(21*1024*1024);
  // Cancel at the normal restore confirmation: exercising file/decrypt/preflight
  // limits must not require an oversized localStorage write on this browser.
  page.removeAllListeners('dialog');let confirmed=false;
  page.on('dialog',async d=>{expect(d.type()).toBe('confirm');confirmed=true;await d.dismiss();});
  await upload(page,file);await password(page,PASSWORD,false);
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);expect(confirmed).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
});

test('FICTIONAL pre-v10 single-store JSON remains importable with encrypted safety backup',async({page})=>{
  await setup(page);await enableSafetyBackup(page);
  const legacy=await page.evaluate(()=>{
    const st=JSON.parse(JSON.stringify(allStores.stores[allStores.current]));
    st.data[st.years.at(-1)]['1月'][0].売上=654;
    return {years:st.years,data:st.data};
  });
  await upload(page,legacy);
  await expect(page.locator('#insightBackupTitle')).toContainText('復元直前');
  const event=page.waitForEvent('download');await password(page,SAFETY);
  expect((await downloaded(await event)).format).toBe('InsightEncryptedBackup');
  await confirmSaved(page);
  await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
  expect(await page.evaluate(()=>{
    const saved=InsightStorage.readSnapshot();return {count:Object.keys(saved.stores).length,sales:saved.stores.store_1.data[saved.stores.store_1.years.at(-1)]['1月'][0].売上};
  })).toEqual({count:1,sales:654});
});

test('FICTIONAL missing backup guard leaves fail-closed bootstrap entry points, never plaintext fallback',async({page})=>{
  await setup(page,{missingGuard:true});
  const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  const downloads=[];page.on('download',event=>downloads.push(event));
  await page.locator('#backupBtn').click();await upload(page,JSON.parse(raw));
  expect(await page.evaluate(()=>__backupAlerts.length)).toBe(2);
  expect(await page.evaluate(()=>__backupAlerts.join(' '))).toContain('初期化が完了していません');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  expect(await page.evaluate(()=>localStorage.getItem('insight_last_backup'))).toBeNull();
  expect(downloads).toHaveLength(0);
});

async function seedConfirmationHistory(page){
  return page.evaluate(()=>{
    const at=Date.now()-86400000;
    const old=JSON.stringify({version:1,id:'a'.repeat(32),kind:'normal',startedAt:at,confirmedAt:at,confirmation:'user'});
    localStorage.setItem('insight_last_backup','1700000000000');localStorage.setItem('insight_backup_confirmed_v1',old);updateBackupDaysLabel();
    return {raw:localStorage.getItem('insight_v11'),old};
  });
}
async function beginConfirmedDownload(page,kind,raw){
  const event=page.waitForEvent('download');
  if(kind==='normal'){await page.locator('#backupBtn').click();await password(page,PASSWORD);}
  else{
    await enableSafetyBackup(page);
    const target=JSON.parse(raw);for(const st of Object.values(target.stores))st.data[st.years.at(-1)]['1月'][0].売上=852;
    await upload(page,target);await password(page,SAFETY);
  }
  await event;
  await expect(page.getByRole('button',{name:'保存したファイルを確認した',exact:true})).toBeVisible();
}
for(const kind of ['normal','preRestore']){
  for(const choice of ['close','reload','confirm']){
    test('FICTIONAL '+kind+' file verification '+choice+' preserves history and gates primary writes',async({page})=>{
      await setup(page);const before=await seedConfirmationHistory(page);
      await beginConfirmedDownload(page,kind,before.raw);
      expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(before.raw);
      expect(await page.evaluate(()=>localStorage.getItem('insight_backup_confirmed_v1'))).toBe(before.old);
      await expect(page.locator('#backupDaysLabel')).toContainText('保存未確認');
      await expect(page.getByRole('dialog')).toContainText('アプリによる端末ファイルの検証ではありません');
      if(kind==='preRestore')expect(await page.evaluate(()=>InsightRestoreOperationObserverV0.getStatus().state)).toBe('UNAVAILABLE');
      // The confirmation modal remains a single owner, including duplicate clicks.
      await page.evaluate(()=>backupData());
      expect(await page.evaluate(()=>localStorage.getItem('insight_backup_confirmed_v1'))).toBe(before.old);
      for(const dark of [false,true]){
        await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
        const panel=await page.locator('.insight-backup-panel').boundingBox(),viewport=page.viewportSize();
        expect(Math.abs(panel.x+panel.width/2-viewport.width/2)).toBeLessThan(2);
        expect(Math.abs(panel.y+panel.height/2-viewport.height/2)).toBeLessThan(2);
        const buttons=await page.locator('.insight-backup-actions button').all();
        const a=await buttons[0].boundingBox(),b=await buttons[1].boundingBox();
        expect(a.x).toBeGreaterThanOrEqual(panel.x+20);expect(b.x+b.width).toBeLessThanOrEqual(panel.x+panel.width-20);
        expect(Math.abs(a.y-b.y)<2?b.x-a.x-a.width:b.y-a.y-a.height).toBeGreaterThanOrEqual(12);
      }
      if(choice==='confirm')await confirmSaved(page);
      else if(choice==='close')await page.getByRole('button',{name:kind==='normal'?'未確認のまま閉じる':'復元を中止',exact:true}).click();
      else{
        await page.reload();await page.waitForFunction(()=>window.InsightReportPreview);await page.evaluate(()=>gotoNav('settings'));
      }
      await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
      expect(await page.evaluate(()=>localStorage.getItem('insight_last_backup'))).toBe('1700000000000');
      if(choice==='confirm'){
        const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('insight_backup_confirmed_v1')));
        expect(record.confirmation).toBe('user');expect(record.kind).toBe(kind);expect(record.id).not.toBe('a'.repeat(32));
        await expect(page.locator('#backupDaysLabel')).toContainText('保存確認（本人申告）');
        if(kind==='preRestore'){
          expect(await page.evaluate(()=>Object.values(InsightStorage.readSnapshot().stores).map(st=>st.data[st.years.at(-1)]['1月'][0].売上))).toEqual([852,852]);
        }else expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(before.raw);
      }else{
        expect(await page.evaluate(()=>localStorage.getItem('insight_backup_confirmed_v1'))).toBe(before.old);
        expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(before.raw);
        await expect(page.locator('#backupDaysLabel')).toContainText('保存未確認');
      }
      if(choice!=='reload')expect(await page.evaluate(()=>__backupCsp)).toEqual([]);
    });
  }
  for(const change of ['download','snapshot']){
    test('FICTIONAL '+kind+' confirmation rejects other-tab '+change+' changes',async({page,context})=>{
      await setup(page);const before=await seedConfirmationHistory(page);await beginConfirmedDownload(page,kind,before.raw);
      const other=await context.newPage();await other.goto('/');
      const expectedRaw=await other.evaluate(({change,raw})=>{
        if(change==='download')localStorage.setItem('insight_backup_download_v1',JSON.stringify({version:1,id:'b'.repeat(32),kind:'normal',startedAt:Date.now()}));
        else{const data=JSON.parse(raw);data.stores[data.current].data[data.stores[data.current].years.at(-1)]['1月'][0].売上=963;localStorage.setItem('insight_v11',JSON.stringify(data));}
        return localStorage.getItem('insight_v11');
      },{change,raw:before.raw});
      await other.close();await confirmSaved(page);
      await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
      expect(await page.evaluate(()=>localStorage.getItem('insight_backup_confirmed_v1'))).toBe(before.old);
      expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(expectedRaw);
      expect(await page.evaluate(()=>__backupAlerts.join(' '))).toMatch(/別のバックアップ処理|処理中にデータが変更/);
    });
  }
}

// Real browser/modal coverage of the new initial-OFF path. These cases must
// never inherit enableSafetyBackup() from the legacy safety-download tests.
for(const encrypted of [false,true]){
  test('FICTIONAL initial safety OFF restores '+(encrypted?'encrypted':'legacy')+' two-store file without extra password or download',async({page})=>{
    await setup(page);
    await expect(page.locator('#insightRestoreSafetyBackup')).not.toBeChecked();
    const target=await page.evaluate(()=>{
      const data=JSON.parse(JSON.stringify(allStores));
      for(const st of Object.values(data.stores))st.data[st.years.at(-1)]['1月'][0].売上=741;
      return data;
    });
    const file=encrypted?await page.evaluate(({target,PASSWORD})=>InsightBackupCryptoV1.encrypt(target,PASSWORD),{target,PASSWORD}):target;
    const downloads=[],dialogs=[];page.on('download',d=>downloads.push(d));
    page.removeAllListeners('dialog');
    page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});await d.accept();});
    await upload(page,file);
    if(encrypted)await password(page,PASSWORD,false);
    await page.waitForFunction(()=>document.getElementById('restoreFile').value==='');
    expect(await page.evaluate(()=>InsightStorage.readSnapshot())).toEqual(target);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].type).toBe('confirm');
    expect(dialogs[0].message).toContain('現在の全データは上書きされます');
    expect(dialogs[0].message).toContain('安全バックアップは作成しません');
    expect(downloads).toHaveLength(0);
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('insight_backup_download_v1'))).toBeNull();
    expect(await page.evaluate(()=>InsightStorage.snapshotWritesHeld())).toBe(false);
    await page.reload();await page.waitForFunction(()=>window.InsightReportPreview);
    expect(await page.evaluate(()=>InsightStorage.readSnapshot())).toEqual(target);
    await expect(page.locator('#insightRestoreSafetyBackup')).not.toBeChecked();
  });
}

test('FICTIONAL optional safety switch stays independent of theme with light/dark spacing and resets after reload',async({page})=>{
  await setup(page);
  const safety=page.locator('#insightRestoreSafetyBackup');
  const theme=page.locator('.insight-theme-switch-track');
  await expect(theme).toHaveCount(1);
  for(const dark of [false,true]){
    await page.evaluate(dark=>{document.documentElement.classList.toggle('dark',dark);document.body.classList.toggle('dark',dark);},dark);
    await expect(page.locator('#insightThemeToggle')).toBeChecked({checked:dark});
    await page.locator('.insight-restore-safety-switch-track').click();
    await expect(safety).toBeChecked({checked:!dark});
    await expect(page.locator('#insightThemeToggle')).toBeChecked({checked:dark});
    const row=await safety.locator('xpath=../..').boundingBox();
    const restore=await page.locator('#restoreBtn').boundingBox();
    const health=await page.locator('#insightDataHealthButton').boundingBox();
    expect(row.y).toBeGreaterThanOrEqual(restore.y+restore.height);
    expect(health.y).toBeGreaterThanOrEqual(row.y+row.height);
    const track=await page.locator('.insight-restore-safety-switch-track').evaluate(n=>({width:n.getBoundingClientRect().width,bg:getComputedStyle(n).backgroundColor}));
    expect(track.width).toBeGreaterThan(30);expect(track.bg).not.toBe('rgba(0, 0, 0, 0)');
  }
  await enableSafetyBackup(page);
  await theme.click();await expect(safety).toBeChecked();
  await page.reload();await page.waitForFunction(()=>window.InsightReportPreview);
  await expect(safety).not.toBeChecked();
});

for(const mode of ['cancel','invalid','quota','rollback','rollback-failure','postcommit','uncertain']){
  test('FICTIONAL initial safety OFF '+mode+' preserves recovery and accurate no-file warning',async({page})=>{
    await setup(page);await expect(page.locator('#insightRestoreSafetyBackup')).not.toBeChecked();
    const raw=await page.evaluate(()=>localStorage.getItem('insight_v11'));
    const target=JSON.parse(raw);for(const st of Object.values(target.stores))st.data[st.years.at(-1)]['1月'][0].売上=852;
    const downloads=[];page.on('download',d=>downloads.push(d));
    if(mode==='cancel'){
      page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());
    }
    await page.evaluate(mode=>{
      const write=InsightStorage.writeSnapshot,read=InsightStorage.readSnapshot;
      window.__optionalWrites=0;
      InsightStorage.writeSnapshot=function(...args){
        __optionalWrites++;
        if(mode==='quota')throw new DOMException('FICTIONAL quota','QuotaExceededError');
        if(mode==='rollback-failure'&&__optionalWrites===2)throw Error('FICTIONAL rollback failed');
        const result=write.apply(this,args);
        if(mode==='postcommit'||mode==='uncertain')throw Error('FICTIONAL postcommit failure');
        return result;
      };
      InsightStorage.readSnapshot=function(...args){
        if(mode==='uncertain'&&__optionalWrites)throw Error('FICTIONAL unreadable storage');
        const data=read.apply(this,args);
        if((mode==='rollback'||mode==='rollback-failure')&&__optionalWrites===1)data.current='FICTIONAL-invalid';
        return data;
      };
    },mode);
    await upload(page,mode==='invalid'?{stores:{},current:'missing'}:target);
    await page.waitForFunction(()=>document.getElementById('restoreFile').value==='');
    expect(downloads).toHaveLength(0);
    await expect(page.locator('#insightBackupOverlay')).toHaveCount(0);
    const state=await page.evaluate(()=>({raw:localStorage.getItem('insight_v11'),alerts:__backupAlerts.join(' '),held:InsightStorage.snapshotWritesHeld()}));
    if(['cancel','invalid','quota','rollback'].includes(mode))expect(state.raw).toBe(raw);
    const held=['rollback-failure','postcommit','uncertain'].includes(mode);
    expect(state.held).toBe(held);
    if(['rollback','rollback-failure','postcommit','uncertain'].includes(mode)){
      expect(state.alerts).toContain('安全バックアップは作成していません');
      expect(state.alerts).not.toMatch(/Insight_pre_restore_.*保管|ダウンロード処理は開始済み|復元直前バックアップを保管してから/);
    }
    if(mode==='quota')expect(state.alerts).toContain('保存容量が不足');
    if(mode==='rollback')expect(state.alerts).toContain('自動で戻しました');
    if(mode==='rollback-failure')expect(state.alerts).toContain('自動復旧にも失敗');
    if(mode==='postcommit')expect(state.alerts).toContain('保存領域に復元対象と一致');
    if(mode==='uncertain')expect(state.alerts).toContain('現在の保存状態を確認できません');
    if(held){
      const blocked=await page.evaluate(()=>{
        const before=localStorage.getItem('insight_v11');let error='';
        try{InsightStorage.persistCurrent(allStores);}catch(e){error=e.name;}
        return {error,unchanged:before===localStorage.getItem('insight_v11')};
      });
      expect(blocked).toEqual({error:'InsightStorageRestoreHoldError',unchanged:true});
    }
  });
}

test('FICTIONAL capacity confirmation uses normalized sizes without storage writes and cancellation preserves all keys',async({page})=>{
  await setup(page);
  const fixture=await page.evaluate(()=>{
    const target=JSON.parse(JSON.stringify(allStores));
    for(const st of Object.values(target.stores))for(const year of st.years)for(const rows of Object.values(st.data[year]))for(const row of rows)delete row.haiki;
    for(const st of Object.values(target.stores))st.data[st.years.at(-1)]['1月'][0].売上=741;
    window.__capacityCandidates=[];
    const serialize=InsightStorage.serialize;
    InsightStorage.serialize=function(value){
      const raw=serialize.apply(this,arguments);
      const st=value.stores[value.current];
      if(st.data[st.years.at(-1)]['1月'][0].売上===741)__capacityCandidates.push({units:raw.length,haiki:st.data[st.years.at(-1)]['1月'][0].haiki});
      return raw;
    };
    const before=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
    window.__capacityWrites=0;
    for(const method of ['setItem','removeItem','clear']){
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args){__capacityWrites++;return original.apply(this,args);};
    }
    return {target,before};
  });
  page.removeAllListeners('dialog');
  const confirmation=page.waitForEvent('dialog');
  const action=upload(page,fixture.target);
  const dialog=await confirmation;
  expect(dialog.type()).toBe('confirm');
  const candidates=await page.evaluate(()=>__capacityCandidates);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].haiki).toBeTruthy();
  expect(dialog.message()).toContain('復元後：'+(candidates[0].units*2/1048576).toFixed(2)+' MiB');
  expect(dialog.message()).toContain('端末の空き容量・保存可能量ではありません');
  expect(dialog.message()).toContain('現在の全データは上書きされます');
  expect(await page.evaluate(()=>__capacityWrites)).toBe(0);
  await dialog.dismiss();await action;
  await page.waitForFunction(()=>document.getElementById('restoreFile').value==='');
  expect(await page.evaluate(()=>__capacityWrites)).toBe(0);
  expect(await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))).toEqual(fixture.before);
});
