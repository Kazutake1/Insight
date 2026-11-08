const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const REPO=path.join(__dirname,'..','..');
const OLD=path.join(REPO,'tests','fixtures','cache-main-90e');
const ORIGIN='https://insight-cache.test';
const readCurrent=name=>fs.readFileSync(path.join(REPO,name));
const readOld=name=>{
  const encoded=path.join(OLD,name+'.b64');
  return fs.existsSync(encoded)?Buffer.from(fs.readFileSync(encoded,'utf8').trim(),'base64'):fs.readFileSync(path.join(OLD,name));
};
const indexSource=readCurrent('Index.html').toString();
const loaderSource=readCurrent('insight_shell_loader_v1.js').toString();
const BUILD=indexSource.match(/insight-shell-version" content="([^"]+)/)[1];
const oldGuard=readOld('insight_backup_guard_v1.js');
const oldCoreEntries=readOld('insight_payload_core_backup_restore_declarations.js');
if(crypto.createHash('sha256').update(oldCoreEntries).digest('hex')!=='44f8f9ceeeae5ed86d21416aed491919af9b13675b79594151bb2652cb344fba')
  throw new Error('main 90e backup/restore declaration fixture mismatch');
const productionCsp=indexSource.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
const fallbackHtml='<!DOCTYPE html><html><head><meta charset="UTF-8">'+productionCsp+'</head><body>'+
  '<button id="backupBtn" type="button">backup</button><input id="restoreFile" type="file">'+
  '<script src="/fallback-old-core-entry.js"></scr'+'ipt><script src="/fallback-capture-before.js"></scr'+'ipt>'+
  '<script src="/fallback-new-guard.js"></scr'+'ipt><script src="/fallback-capture-after.js"></scr'+'ipt>'+
  '<script src="/fallback-old-guard.js"></scr'+'ipt></body></html>';
const impossibleHtml='<!DOCTYPE html><html><head><meta charset="UTF-8">'+productionCsp+'</head><body>'+
  '<button id="backupBtn" type="button">backup</button><input id="restoreFile" type="file">'+
  '<script src="/fallback-impossible-core.js"></scr'+'ipt><script src="/fallback-new-guard.js"></scr'+'ipt></body></html>';

function featureSignature(source){
  const start=source.indexOf('var orderedFeatureLoads=['),end=source.indexOf('];',start);
  const entries=[];
  source.slice(start,end+2).replace(/'([^']+)'/g,(_match,entry)=>{entries.push(entry);return _match;});
  let hash=2166136261;
  for(const code of entries.join('\n'))for(let i=0;i<code.length;i++){hash^=code.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return ('00000000'+(hash>>>0).toString(16)).slice(-8);
}
const FEATURE_SIGNATURE=featureSignature(loaderSource);

function deferred(){let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve};}
function contentType(name){return name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html';}

async function installNetwork(context,mode){
  const probes=deferred(),oldGuardRequested=deferred(),oldGuardRelease=deferred();
  const trace=[];
  let phase=mode==='fresh'?'new':'initial',navigations=0;
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==ORIGIN){trace.push({url:request.url(),source:'external-blocked'});return route.abort();}
    const name=url.pathname.slice(1)||'Index.html';
    const probe=url.searchParams.has('insight_probe')||url.searchParams.has('insight_manifest_probe');
    if(request.isNavigationRequest()){
      navigations++;
      if(navigations>4)return route.abort();
      if(navigations>1)phase='new';
    }
    if(name==='fallback.html')return route.fulfill({body:fallbackHtml,contentType:'text/html'});
    if(name==='fallback-impossible.html')return route.fulfill({body:impossibleHtml,contentType:'text/html'});
    if(name==='fallback-old-core-entry.js')return route.fulfill({body:oldCoreEntries,contentType:'application/javascript'});
    if(name==='fallback-new-guard.js')return route.fulfill({body:readCurrent('insight_backup_guard_v1.js'),contentType:'application/javascript'});
    if(name==='fallback-old-guard.js')return route.fulfill({body:oldGuard,contentType:'application/javascript'});
    if(name==='fallback-capture-before.js')return route.fulfill({contentType:'application/javascript',body:Buffer.from(
      'window.__oldBackupDescriptor=Object.getOwnPropertyDescriptor(window,"backupData");'+
      'window.__oldRestoreDescriptor=Object.getOwnPropertyDescriptor(window,"restoreData");')});
    if(name==='fallback-capture-after.js')return route.fulfill({contentType:'application/javascript',body:Buffer.from(
      'window.__fallbackBackup=backupData;window.__fallbackRestore=restoreData;'+
      'window.__fallbackBackupDescriptor=Object.getOwnPropertyDescriptor(window,"backupData");'+
      'window.__fallbackRestoreDescriptor=Object.getOwnPropertyDescriptor(window,"restoreData");'+
      'document.getElementById("backupBtn").addEventListener("click",function(){backupData();});'+
      'document.getElementById("restoreFile").addEventListener("change",function(event){restoreData(event);});')});
    if(name==='fallback-impossible-core.js')return route.fulfill({contentType:'application/javascript',body:Buffer.from(
      'Object.defineProperty(window,"backupData",{value:function(){return "plaintext";},writable:false,configurable:false});'+
      'Object.defineProperty(window,"restoreData",{value:function(){return "unguarded";},writable:false,configurable:false});')});
    if(name==='test-old-guard-late.js')return route.fulfill({body:oldGuard,contentType:'application/javascript'});
    let source='new',cached=false;
    if(phase==='initial'){
      if(name==='Index.html'&&!probe){source='old';cached=true;}
      if(['shell','guard-race'].includes(mode)&&!probe&&['insight_shell_boot_v1.js','insight_shell_loader_v1.js'].includes(name)){source='old';cached=true;}
      if(['shell','guard-race'].includes(mode)&&name==='insight_backup_guard_v1.js'&&!probe&&
        url.searchParams.get('v')==='20261011-restore-error-state-1'){source='old';cached=true;}
      if(mode==='feature'&&name==='insight_legacy_style_compat_v1.js'){source='old';cached=true;}
    }
    trace.push({url:url.pathname+url.search,source:probe?'origin-new':source,cached,probe});
    if(probe&&phase==='initial'&&['shell','guard-race'].includes(mode))await probes.promise;
    if(mode==='guard-race'&&name==='insight_backup_guard_v1.js'&&source==='old'){
      oldGuardRequested.resolve();await oldGuardRelease.promise;
    }
    let body;
    try{body=source==='old'?readOld(name):readCurrent(name);}catch(_){return route.fulfill({status:404,body:'fixture not found'});}
    try{return await route.fulfill({body,contentType:contentType(name)});}catch(error){
      if(!/closed|disposed|intercepted|canceled/i.test(error.message))throw error;
    }
  });
  return {
    trace,
    get navigations(){return navigations;},
    releaseProbes(){phase='new';probes.resolve();},
    oldGuardRequested:oldGuardRequested.promise,
    releaseOldGuard(){oldGuardRelease.resolve();}
  };
}

async function newContext(browser,mode,raw){
  const context=await browser.newContext();
  const network=await installNetwork(context,mode);
  // The transition fixture exercises shell/cache/backup code, not chart
  // rendering.  Preinstall a compatible shape and block every external host so
  // the test cannot depend on the CDN or weaken the production CSP/SRI.
  await context.addInitScript(raw=>{
    function TestChart(_canvas,config){this.data=config&&config.data||{};this.options=config&&config.options||{};}
    TestChart.defaults={color:'#000'};TestChart.getChart=function(){return null;};
    TestChart.prototype.update=function(){};TestChart.prototype.destroy=function(){};
    window.Chart=TestChart;
    if(raw&&!sessionStorage.getItem('cacheFixtureSeeded')){
      localStorage.setItem('insight_v11',raw);sessionStorage.setItem('cacheFixtureSeeded','yes');
    }
  },raw||null);
  const page=await context.newPage(),errors=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{dialogs.push(dialog.message());dialog.accept();});
  return {context,network,page,errors,dialogs};
}

let rawSnapshot;
test.beforeAll(async({browser})=>{
  const fixture=await newContext(browser,'fresh');
  try{
    await fixture.page.goto(ORIGIN+'/Index.html');
    await fixture.page.waitForFunction(()=>window.InsightReportPreview&&window.InsightStorage);
    rawSnapshot=await fixture.page.evaluate(()=>{
      const value=InsightStorage.migrateSnapshot(allStores),id=value.current,year=value.stores[id].years.at(-1);
      value.stores[id].name='FICTIONAL cache A';value.stores[id].data[year]['1月'][0].売上=111;
      value.stores['fixture-b']=JSON.parse(JSON.stringify(value.stores[id]));
      value.stores['fixture-b'].name='FICTIONAL cache B';
      value.stores['fixture-b'].data[year]['1月'][0].売上=222;
      value.appSettings={...(value.appSettings||{}),cacheFixture:'FICTIONAL common setting'};
      return JSON.stringify(value);
    });
  }finally{await fixture.context.close();}
});

async function waitForCurrent(page){
  await page.waitForFunction(build=>window.__INSIGHT_SHELL_VERSION__===build&&
    window.InsightReportPreview&&window.InsightBackupCryptoV1&&
    window.InsightBackupEntrypointsV1&&window.InsightBackupEntrypointsV1.status()==='ready',BUILD);
}

async function assertCurrentAndEncrypted(fixture){
  await waitForCurrent(fixture.page);
  expect(await fixture.page.evaluate(()=>window.__INSIGHT_FEATURE_SIGNATURE__)).toBe(FEATURE_SIGNATURE);
  expect(fixture.network.navigations).toBeLessThanOrEqual(3);
  expect(fixture.errors).toEqual([]);
  expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(rawSnapshot);
  expect(await fixture.page.evaluate(()=>Object.values(allStores.stores).map(store=>store.data[store.years.at(-1)]['1月'][0].売上))).toEqual([111,222]);

  await fixture.page.evaluate(()=>gotoNav('settings'));
  await expect(fixture.page.locator('#backupBtn')).toBeVisible();
  const download=fixture.page.waitForEvent('download');
  await fixture.page.locator('#backupBtn').click();
  await fixture.page.locator('#insightBackupPassword').fill('FICTIONAL-cache-password');
  await fixture.page.locator('#insightBackupPasswordConfirm').fill('FICTIONAL-cache-password');
  await fixture.page.locator('#insightBackupOverlay button[type=submit]').click();
  const file=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
  expect(file.format).toBe('InsightEncryptedBackup');expect(file.data).toBeUndefined();
  await expect(fixture.page.getByRole('button',{name:'保存したファイルを確認した',exact:true})).toBeVisible();
  expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_backup_confirmed_v1'))).toBeNull();
  await fixture.page.getByRole('button',{name:'未確認のまま閉じる',exact:true}).click();
  expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(rawSnapshot);
}

for(const mode of ['index','shell','feature'])test('FICTIONAL same-origin old cache converges safely: '+mode,async({browser},testInfo)=>{
  const fixture=await newContext(browser,mode,rawSnapshot);
  try{
    const navigation=fixture.page.goto(ORIGIN+'/Index.html');
    if(mode==='shell'){
      await navigation;await fixture.page.waitForFunction(()=>window.InsightReportPreview);fixture.network.releaseProbes();
    }else await navigation;
    await assertCurrentAndEncrypted(fixture);
    fs.writeFileSync(testInfo.outputPath('cache-trace.json'),JSON.stringify(fixture.network.trace,null,2));
  }finally{fixture.network.releaseProbes();fixture.network.releaseOldGuard();await fixture.context.close();}
});

test('FICTIONAL old guard cannot replace fail-closed or registered encrypted entry points',async({browser},testInfo)=>{
  const fixture=await newContext(browser,'guard-race',rawSnapshot);
  try{
    const navigation=fixture.page.goto(ORIGIN+'/Index.html');
    await fixture.network.oldGuardRequested;
    const initialBackup=fixture.page.waitForEvent('dialog');
    await fixture.page.evaluate(()=>{backupData();});await initialBackup;
    expect(fixture.dialogs.at(-1)).toContain('初期化が完了していません');
    const before=await fixture.page.evaluate(()=>({
      backupDescriptor:Object.getOwnPropertyDescriptor(window,'backupData'),
      restoreDescriptor:Object.getOwnPropertyDescriptor(window,'restoreData')}));
    expect(before.backupDescriptor.configurable).toBe(false);expect(before.restoreDescriptor.configurable).toBe(false);

    fixture.network.releaseOldGuard();await navigation;
    const oldBackup=fixture.page.waitForEvent('dialog');await fixture.page.evaluate(()=>{backupData();});await oldBackup;
    expect(fixture.dialogs.at(-1)).toContain('初期化が完了していません');
    const input=fixture.page.locator('#restoreFile');
    const oldRestore=fixture.page.waitForEvent('dialog');
    await input.setInputFiles({name:'FICTIONAL-legacy.json',mimeType:'application/json',buffer:Buffer.from('{}')});await oldRestore;
    expect(fixture.dialogs.at(-1)).toContain('復元機能の初期化が完了していません');
    expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(rawSnapshot);

    fixture.network.releaseProbes();await assertCurrentAndEncrypted(fixture);
    await fixture.page.evaluate(()=>{window.__readyBackupRef=backupData;window.__readyRestoreRef=restoreData;});
    await fixture.page.evaluate(()=>new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/test-old-guard-late.js';
      script.onload=resolve;script.onerror=()=>reject(new Error('late old guard failed to load'));document.body.appendChild(script);
    }));
    expect(await fixture.page.evaluate(()=>backupData===window.__readyBackupRef&&restoreData===window.__readyRestoreRef)).toBe(true);
    await fixture.page.locator('#backupBtn').click();
    await expect(fixture.page.locator('#insightBackupPassword')).toBeVisible();
    await fixture.page.getByRole('button',{name:'キャンセル',exact:true}).click();
    expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(rawSnapshot);
    fs.writeFileSync(testInfo.outputPath('cache-trace.json'),JSON.stringify(fixture.network.trace,null,2));
  }finally{fixture.network.releaseProbes();fixture.network.releaseOldGuard();await fixture.context.close();}
});

test('FICTIONAL actual main old core fallback becomes non-writable before actual old guard arrives',async({browser},testInfo)=>{
  const fixture=await newContext(browser,'fresh',rawSnapshot);
  try{
    await fixture.page.goto(ORIGIN+'/fallback.html');
    const state=await fixture.page.evaluate(()=>({
      oldBackup:{configurable:__oldBackupDescriptor.configurable,writable:__oldBackupDescriptor.writable},
      oldRestore:{configurable:__oldRestoreDescriptor.configurable,writable:__oldRestoreDescriptor.writable},
      lockedBackup:{configurable:__fallbackBackupDescriptor.configurable,writable:__fallbackBackupDescriptor.writable},
      lockedRestore:{configurable:__fallbackRestoreDescriptor.configurable,writable:__fallbackRestoreDescriptor.writable},
      backupPreserved:backupData===__fallbackBackup,restorePreserved:restoreData===__fallbackRestore
    }));
    expect(state).toEqual({
      oldBackup:{configurable:false,writable:true},oldRestore:{configurable:false,writable:true},
      lockedBackup:{configurable:false,writable:false},lockedRestore:{configurable:false,writable:false},
      backupPreserved:true,restorePreserved:true
    });
    const directBackup=fixture.page.waitForEvent('dialog');await fixture.page.evaluate(()=>backupData());await directBackup;
    expect(fixture.dialogs.at(-1)).toContain('平文では保存しません');
    const uiBackup=fixture.page.waitForEvent('dialog');await fixture.page.locator('#backupBtn').click();await uiBackup;
    expect(fixture.dialogs.at(-1)).toContain('平文では保存しません');
    const uiRestore=fixture.page.waitForEvent('dialog');
    await fixture.page.locator('#restoreFile').setInputFiles({name:'FICTIONAL.json',mimeType:'application/json',buffer:Buffer.from('{}')});
    await uiRestore;expect(fixture.dialogs.at(-1)).toContain('現在のデータは変更されていません');
    expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(rawSnapshot);
    expect(fixture.errors).toEqual([]);
    fs.writeFileSync(testInfo.outputPath('fallback-trace.json'),JSON.stringify(fixture.network.trace,null,2));
  }finally{await fixture.context.close();}
});

test('FICTIONAL unreplaceable foreign entries produce a terminal fail-closed page',async({browser})=>{
  const fixture=await newContext(browser,'fresh',rawSnapshot);
  try{
    await fixture.page.goto(ORIGIN+'/fallback-impossible.html');
    await expect(fixture.page.locator('body')).toContainText('安全に初期化できませんでした');
    await expect(fixture.page.locator('#backupBtn,#restoreFile')).toHaveCount(0);
    expect(await fixture.page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(rawSnapshot);
    expect(fixture.errors).toEqual([]);
  }finally{await fixture.context.close();}
});
