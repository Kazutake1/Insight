const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
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

for(const scenario of ['success','unknown','newer revision']){
  test('FICTIONAL IndexedDB restore UI: '+scenario,async({page})=>{
    await page.route('**/insight_backup_guard_v1.js*',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      for(const [from,to] of [
        ['function verifyRestoredSnapshot(expected)', 'async function verifyRestoredSnapshot(expected)'],
        ['var persisted=window.InsightStorage.readSnapshot();','var persisted=await window.restoreFixture.read();'],
        ['window.InsightStorage.writeSnapshot(newAll);writeCompleted=true;','await window.restoreFixture.write(newAll);writeCompleted=true;'],
        ['verifiedRestore=verifyRestoredSnapshot(newAll);','verifiedRestore=await verifyRestoredSnapshot(newAll);'],
        ['restoreWriteCheck=classifyInterruptedRestoreWrite(newAll,preRestoreMemorySnapshot);','restoreWriteCheck=await window.restoreFixture.classify();'],
        ['rollbackPreRestoreSnapshot();','await window.restoreFixture.rollback(preRestoreMemorySnapshot);']
      ]){
        if(!body.includes(from))throw new Error('Restore boundary changed: '+from);
        body=body.replace(from,to);
      }
      await route.fulfill({response,body});
    });
    await setup(page);
    await page.evaluate(fs.readFileSync(path.join(__dirname,'../fixtures/indexeddb-verified-restart.js'),'utf8'));
    const file=await page.evaluate(async ({scenario,PASSWORD})=>{
      const source=localStorage.getItem('insight_v11');
      const gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem('insight_v11'));
      await gate.activate(await gate.prepare());
      const before=await gate.load();
      const target=JSON.parse(before.raw), id=target.current, year=target.stores[id].years.at(-1);
      target.stores[id].data[year]['1月'][0].売上=789;
      let committed;
      window.restoreFixture={
        started:false,done:false,source,gate,id,year,rollbacks:0,
        async write(snapshot){
          await new Promise(resolve=>{this.release=resolve;this.started=true;});
          committed=await gate.save(before.revision,snapshot);
          if(scenario==='unknown')throw new Error('FICTIONAL commit response lost');
        },
        async read(){
          if(scenario==='newer revision'){
            const newer=JSON.parse(committed.raw);
            newer.stores[id].data[year]['1月'][0].売上=654;
            await gate.save(committed.revision,newer);
          }
          return JSON.parse((await gate.load()).raw);
        },
        async classify(){
          const read=()=>Promise.reject(new Error('FICTIONAL readback unavailable'));
          try{await read();}catch(_){return 'uncertain';}
          throw new Error('Fault injection did not run');
        },
        async rollback(snapshot){
          this.rollbacks++;
          await gate.save(committed.revision,snapshot);
        }
      };
      const notify=showToast;
      window.__restoreSuccess=false;
      window.showToast=function(message,...args){
        if(String(message).includes('整合性確認済み'))window.__restoreSuccess=true;
        return notify(message,...args);
      };
      return InsightBackupCryptoV1.encrypt(target,PASSWORD);
    },{scenario,PASSWORD});
    await enableSafetyBackup(page);
    await upload(page,file);
    await password(page,PASSWORD,false);
    const downloadPromise=page.waitForEvent('download');
    await password(page,SAFETY);
    const download=await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^Insight_pre_/);
    expect(JSON.parse(fs.readFileSync(await download.path(),'utf8')).format).toBe('InsightEncryptedBackup');
    expect(await page.evaluate(()=>restoreFixture.started)).toBe(false);
    await confirmSaved(page);
    await expect.poll(()=>page.evaluate(()=>restoreFixture.started)).toBe(true);
    expect(await page.evaluate(async ()=>({
      revision:(await restoreFixture.gate.load()).revision,success:__restoreSuccess
    }))).toEqual({revision:0,success:false});
    await page.evaluate(()=>restoreFixture.release());
    if(scenario==='success'){
      await expect.poll(()=>page.evaluate(()=>__restoreSuccess)).toBe(true);
    }else{
      await expect.poll(()=>page.evaluate(()=>__backupAlerts.join('\n'))).toContain(
        scenario==='unknown'?'現在の保存状態を確認できませんでした':'Pilot revision conflict');
    }
    const final=await page.evaluate(async ()=>{
      const f=restoreFixture, state=await f.gate.load();
      return {revision:state.revision,value:JSON.parse(state.raw).stores[f.id].data[f.year]['1月'][0].売上,
        live:allStores.stores[f.id].data[f.year]['1月'][0].売上,
        source:localStorage.getItem('insight_v11')===f.source,rollbacks:f.rollbacks,success:__restoreSuccess};
    });
    const expected={
      success:{revision:1,value:789,live:789,rollbacks:0,success:true},
      unknown:{revision:1,value:789,live:123,rollbacks:0,success:false},
      'newer revision':{revision:2,value:654,live:123,rollbacks:1,success:false}
    };
    expect(final).toEqual({...expected[scenario],source:true});
  });
}
