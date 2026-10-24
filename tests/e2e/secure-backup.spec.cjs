'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');

test('optional encrypted backup exports ciphertext, rejects wrong passphrase and safely restores via legacy flow',async({page})=>{
  const csp=[],failures=[],networkSensitive=[];
  const pass='test-fictional-passphrase-2026!';
  page.on('console',msg=>{
    if(/content security policy|refused to (execute|load|apply)/i.test(msg.text()))csp.push(msg.text());
    if(msg.text().includes(pass))networkSensitive.push('console');
  });
  page.on('pageerror',err=>failures.push(err.message));
  page.on('request',request=>{
    if(request.url().includes(pass)||(request.postData()||'').includes(pass))
      networkSensitive.push('network');
  });
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'');
    await route.fulfill({response,body});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#navSettings')).toBeVisible();
  await page.locator('#navSettings').click();
  await expect(page.locator('#insightEncryptedBackup')).toBeVisible();
  await expect(page.locator('#insightSecureExport')).toBeVisible();
  await expect(page.locator('#insightSecureRestore')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.InsightSecureBackupCrypto&&window.InsightBackupGuard))).toBe(true);
  await page.locator('#insightSecureExportPass').fill(pass);
  await page.locator('#insightSecureExportConfirm').fill(pass);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#insightSecureExport').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.insight\.enc\.json$/);
  const contents=await fs.readFile(await download.path(),'utf8');
  const envelope=JSON.parse(contents);
  expect(envelope.format).toBe('insight-encrypted-backup');
  expect(envelope.encryption).toBe('AES-256-GCM');
  expect(contents).not.toContain('"stores"');
  await expect(page.locator('#insightSecureExportPass')).toHaveValue('');
  await expect(page.locator('#insightSecureExportConfirm')).toHaveValue('');
  const existing=await page.evaluate(()=>localStorage.getItem('insight_v11'));
  const originalStoreName=await page.evaluate(()=>allStores.stores[allStores.current].name);
  const encryptedUpload={name:'test.insight.enc.json',mimeType:'application/json',buffer:Buffer.from(contents,'utf8')};

  await page.locator('#insightSecureRestoreFile').setInputFiles(encryptedUpload);
  await page.locator('#insightSecureRestorePass').fill('incorrect passphrase testing 2026');
  await page.locator('#insightSecureRestore').click();
  await expect(page.locator('#insightSecureRestoreStatus')).toContainText('復号できません');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(existing);
  await expect(page.locator('#insightSecureRestorePass')).toHaveValue('');

  const corrupted={...envelope,ciphertext:(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1)};
  await page.locator('#insightSecureRestoreFile').setInputFiles({
    name:'tampered.insight.enc.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(corrupted),'utf8')
  });
  await page.locator('#insightSecureRestorePass').fill(pass);
  await page.locator('#insightSecureRestore').click();
  await expect(page.locator('#insightSecureRestoreStatus')).toContainText('復号できません');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(existing);

  // Change only the isolated Playwright fixture, proving restore actually recovers prior data.
  const changedName='架空テスト・復元前に変更した店舗名';
  await page.evaluate(name=>{
    allStores.stores[allStores.current].name=name;
    window.InsightStorage.persistCurrent(allStores);
  },changedName);
  await expect.poll(()=>page.evaluate(()=>{
    const snapshot=window.InsightStorage.readSnapshot();
    return snapshot.stores[snapshot.current].name;
  })).toBe(changedName);

  const dialogs=[];
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  await page.locator('#insightSecureRestoreFile').setInputFiles(encryptedUpload);
  await page.locator('#insightSecureRestorePass').fill(pass);
  const beforeRestoreDownload=page.waitForEvent('download');
  await page.locator('#insightSecureRestore').click();
  const safeguard=await beforeRestoreDownload;
  expect(safeguard.suggestedFilename()).toMatch(/^Insight_pre_restore_\d{8}_\d{6}\.json$/);
  const plainPreRestore=JSON.parse(await fs.readFile(await safeguard.path(),'utf8'));
  expect(plainPreRestore.backupInfo.backupType).toBe('preRestore');
  expect(plainPreRestore.data.stores[plainPreRestore.data.current].name).toBe(changedName);
  expect(dialogs.length).toBe(2);
  expect(dialogs[0]).toContain('平文JSON');
  expect(dialogs[1]).toContain('現在の全データは上書き');
  await expect(page.locator('#insightSecureRestorePass')).toHaveValue('');
  await expect.poll(()=>page.evaluate(()=>{
    const snapshot=window.InsightStorage.readSnapshot();
    return snapshot.stores[snapshot.current].name;
  })).toBe(originalStoreName);
  expect(networkSensitive).toEqual([]);
  expect(csp).toEqual([]);
  expect(failures).toEqual([]);
});


test('encrypted backup controls fit 11-inch iPad landscape/portrait in both themes',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  // Local HTTP must not be upgraded to HTTPS by the production CSP.
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#navSettings').click();
  const section=page.locator('#insightEncryptedBackup');
  await expect(section).toBeVisible();

  for(const viewport of [{width:1194,height:834},{width:834,height:1194}]){
    await page.setViewportSize(viewport);
    for(const dark of [false,true]){
      await page.evaluate(enabled=>{
        document.documentElement.classList.toggle('dark',enabled);
        document.body.classList.toggle('dark',enabled);
      },dark);
      await section.scrollIntoViewIfNeeded();
      const result=await section.evaluate(node=>{
        const sectionBounds=node.getBoundingClientRect();
        const fields=Array.from(node.querySelectorAll('input,button')).map(el=>{
          const bounds=el.getBoundingClientRect();
          return {height:bounds.height,left:bounds.left,right:bounds.right,display:getComputedStyle(el).display};
        });
        return {
          viewportWidth:window.innerWidth,
          left:sectionBounds.left,right:sectionBounds.right,
          overflow:node.scrollWidth-node.clientWidth,
          groupOverflow:Array.from(node.querySelectorAll('.insight-secure-group'))
            .map(el=>el.scrollWidth-el.clientWidth),
          fields
        };
      });
      expect(result.left).toBeGreaterThanOrEqual(-1);
      expect(result.right).toBeLessThanOrEqual(result.viewportWidth+1);
      expect(result.overflow).toBeLessThanOrEqual(1);
      for(const overflow of result.groupOverflow)expect(overflow).toBeLessThanOrEqual(1);
      expect(result.fields.length).toBe(7);
      for(const field of result.fields){
        expect(field.height).toBeGreaterThanOrEqual(44);
        expect(field.left).toBeGreaterThanOrEqual(result.left-1);
        expect(field.right).toBeLessThanOrEqual(result.right+1);
        expect(field.display).not.toBe('none');
      }
    }
  }
  expect(pageErrors).toEqual([]);
});
