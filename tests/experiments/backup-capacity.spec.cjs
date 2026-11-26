'use strict';
const {test,expect}=require('@playwright/test');
const {candidateSource,MiB,plaintextLimit,encryptedFileLimit}=require('./backup-capacity-source.cjs');

const fixture='/__fictional_backup_capacity_fixture__';
const moduleNames=['insight_storage_v1.js','insight_data_health_v1.js','insight_sales_count_v1.js',
  'insight_backup_crypto_v1.js','insight_backup_guard_v1.js','insight_indexeddb_storage_v1.js'];

async function setup(page){
  await page.route('**'+fixture,route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8">
<script>
window.SK='insight_v11';
window.__INSIGHT_SHELL_VERSION__='20261125-print-holiday-build-134';
window.__INSIGHT_FEATURE_SIGNATURE__='2a1f565f';
window.MONTHS=Array.from({length:12},(_,i)=>(i+1)+'月');
window.DAYS_IN_MONTH=[31,28,31,30,31,30,31,31,30,31,30,31];
window.HAIKI_CATS=['米飯','調理パン','麺類・その他','デリカテッセン','スイーツ','FF','その他デイリー','パン・ペストリー'];
window.InsightBackupEntrypointsV1={version:1,register(){return true;}};
window.InsightBackupPasswordV1={};
</script>
${moduleNames.map(name=>'<script src="/'+name+'"'+
  (name==='insight_sales_count_v1.js'?' data-insight-recovery-model="true"':'')+'></script>').join('')}
<input id="backupFile" type="file" aria-label="架空バックアップ">`}));
  for(const name of ['insight_backup_crypto_v1.js','insight_backup_guard_v1.js']){
    await page.route('**/'+name,route=>route.fulfill({contentType:'application/javascript',body:candidateSource(name)}));
  }
  await page.goto(fixture);
}

for(const sizeMiB of [25,50,100]){
  test('FICTIONAL '+sizeMiB+' MiB backup round-trip, safety and restore',async({page,browserName},info)=>{
    await setup(page);
    const saved=await page.evaluate(async wanted=>{
      const api=InsightIndexedDBStorageV1,backup=InsightMigrationBackupV1,password='Fictional-capacity-only-2026';
      const data={schemaVersion:1,current:'fictional',stores:{fictional:{name:'架空容量店舗',years:['2025'],data:{'2025':{}}}}};
      const shop=data.stores.fictional;
      MONTHS.forEach((month,index)=>{
        shop.data['2025'][month]=Array.from({length:DAYS_IN_MONTH[index]},(_,i)=>({
          d:String(i+1),売上:0,客数:0,買上点数:0,廃棄金額:0,
          haiki:Object.fromEntries(HAIKI_CATS.map(category=>[category,0])),weather:''
        }));
      });
      InsightSalesCount.ensure(data);
      const raw=InsightStorage.serialize(data);
      localStorage.setItem('insight_v11',raw);
      const tiny=await backup.encodeCommitted(data,password);
      const tinyFile=new File([JSON.stringify(tiny.encrypted)],tiny.filename);
      window.InsightMigrationBackupV1={...backup,assertReady(){},confirm:async()=>true};
      try{await api.migrate({legacyClientsClosed:true,selectVerifiedBackup:()=>({file:tinyFile,password})});}
      finally{window.InsightMigrationBackupV1=backup;}
      const shape=await InsightBackupCryptoV1.decrypt(tiny.encrypted,password);
      const row=shop.data['2025']['1月'][0];
      row.storeMemo='';
      shape.data=data;
      const emptyBytes=new TextEncoder().encode(JSON.stringify(shape)).length;
      const padding=wanted-emptyBytes;
      row.storeMemo='架'.repeat(Math.floor(padding/3))+'A'.repeat(padding%3);
      if(new TextEncoder().encode(JSON.stringify(shape)).length!==wanted)throw new Error('Wrong plaintext size');
      const t=performance.now();
      const result=await api.save(0,data);
      const saveMs=Math.round(performance.now()-t);
      const start=performance.now();
      const readback=await api.read();
      const readMs=Math.round(performance.now()-start);
      const matches=readback.snapshot.stores.fictional.data['2025']['1月'][0].storeMemo===row.storeMemo;
      return {saveRevision:result.revision,readRevision:readback.revision,matches,memoLength:row.storeMemo.length,
        legacyBytes:raw.length,saveMs,readMs,heapSampleBytes:performance.memory?.usedJSHeapSize??null};
    },sizeMiB*MiB);
    expect(saved).toMatchObject({saveRevision:1,readRevision:1,matches:true});
    console.log(JSON.stringify({engine:browserName,sizeMiB,phase:'indexeddb',...saved}));

    await page.reload();
    const downloadPath=info.outputPath('fictional-capacity-backup.json');
    const start=Date.now();
    const [download,downloadRevision]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>
      InsightIndexedDBStorageV1.downloadCommittedBackup('Fictional-capacity-only-2026'))]);
    await download.saveAs(downloadPath);
    const downloadMs=Date.now()-start;
    expect(downloadRevision).toBe(1);
    await page.locator('#backupFile').setInputFiles(downloadPath);

    const validation=await page.evaluate(async ({legacyBytes,checkPlaintextLimit,maxPlaintext,maxFile})=>{
      const api=InsightIndexedDBStorageV1,backup=InsightMigrationBackupV1,password='Fictional-capacity-only-2026';
      const selected=document.querySelector('#backupFile').files[0];
      const raw=localStorage.getItem('insight_v11');
      const small=await backup.encodeCommitted(JSON.parse(raw),password);
      const file=new File([JSON.stringify(small.encrypted)],small.filename);
      const markerKey='insight_indexeddb_adoption_v1',marker=localStorage.getItem(markerKey);
      const opts={file,password,safetyFile:selected,safetyPassword:password,legacyClientsClosed:true};
      const time=performance.now();
      const cancelled=await api.restoreBackup({...opts,confirm:()=>false});
      const cancelMs=Math.round(performance.now()-time);
      const unchanged=(await api.read()).revision===1&&localStorage.getItem(markerKey)===marker;
      const wrong=await backup.readRestoreCandidate(file,'Wrong-fictional-key').catch(e=>e.message);
      const damaged=structuredClone(small.encrypted);
      damaged.ciphertext=(damaged.ciphertext[0]==='A'?'B':'A')+damaged.ciphertext.slice(1);
      const corrupt=await backup.readRestoreCandidate(new Blob([JSON.stringify(damaged)]),password).catch(e=>e.message);
      const tooLarge=await backup.readRestoreCandidate(new Blob([new Uint8Array(maxFile+1)]),password).catch(e=>e.message);
      if(checkPlaintextLimit){
        const object={fictional:''};
        const empty=new TextEncoder().encode(JSON.stringify(object)).length;
        object.fictional='A'.repeat(maxPlaintext-empty+1);
        await InsightBackupCryptoV1.encrypt(object,password).then(()=>{throw new Error('Oversized plaintext accepted');},e=>{
          if(!e.message.includes('大きすぎます'))throw e;
        });
      }

      const write=InsightStorage.writeMetadata;
      InsightStorage.writeMetadata=(key,value)=>{
        if(key===markerKey&&JSON.parse(value).state==='active')throw new Error('Fictional interruption after readback');
        return write(key,value);
      };
      let interrupted;
      const restoreStart=performance.now();
      try{await api.restoreBackup({...opts,confirm:()=>true});}
      catch(error){interrupted=error.message;}
      finally{InsightStorage.writeMetadata=write;}
      const restoreMs=Math.round(performance.now()-restoreStart);
      const hold=await api.diagnose({verifyInterrupted:true});
      const blocked=await api.read().catch(error=>error.message);
      const target=await backup.readRestoreCandidate(file,password);
      const resumeFile=await backup.encodeCommitted(target.snapshot,password);
      const resumed=await api.resumeRecovery({file:new File([JSON.stringify(resumeFile.encrypted)],resumeFile.filename),
        password,legacyClientsClosed:true,confirm:()=>true});
      const final=await api.read();
      if(final.revision!==2)throw new Error('Unexpected recovered revision');
      return {cancelled,unchanged,wrong,corrupt,tooLarge,interrupted,hold,blocked,resumed,
        finalRevision:final.revision,restoredSmall:final.snapshot.stores.fictional.data['2025']['1月'][0].storeMemo===undefined,
        legacyUnchanged:raw.length===legacyBytes&&localStorage.getItem('insight_v11')===raw,selectedBytes:selected.size,
        cancelMs,restoreMs,heapSampleBytes:performance.memory?.usedJSHeapSize??null};
    },{legacyBytes:saved.legacyBytes,checkPlaintextLimit:sizeMiB===100,maxPlaintext:plaintextLimit,maxFile:encryptedFileLimit});
    expect(validation).toMatchObject({
      cancelled:{state:'active',review:'cancelled',revision:1},unchanged:true,
      wrong:expect.stringContaining('復号できません'),corrupt:expect.stringContaining('復号できません'),
      tooLarge:expect.stringContaining('136MiB'),interrupted:'Fictional interruption after readback',
      hold:{state:'hold',reason:'writing',observedRevision:2,recovery:'save-verified'},
      blocked:'IndexedDB writes are on hold',resumed:{state:'active',revision:2},
      finalRevision:2,restoredSmall:true,legacyUnchanged:true
    });
    expect(validation.selectedBytes).toBeLessThanOrEqual(encryptedFileLimit);
    await page.reload();
    expect(await page.evaluate(()=>InsightIndexedDBStorageV1.read().then(({revision})=>revision))).toBe(2);
    if(sizeMiB===25){
      const quota=await page.evaluate(async ()=>{
        const api=InsightIndexedDBStorageV1,backup=InsightMigrationBackupV1,password='Fictional-capacity-only-2026';
        const before=await api.read();
        const original=JSON.stringify(before.snapshot);
        const encoded=await backup.encodeCommitted(before.snapshot,password);
        const recoveryFile=new File([JSON.stringify(encoded.encrypted)],encoded.filename);
        const raw=localStorage.getItem('insight_v11');
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=()=>{throw new DOMException('Fictional quota failure','QuotaExceededError');};
        let failure;
        try{await api.save(before.revision,before.snapshot);}
        catch(error){failure=error.name;}
        finally{IDBObjectStore.prototype.put=put;}
        const hold=await api.diagnose({verifyInterrupted:true});
        const blocked=await api.read().catch(error=>error.message);
        await api.resumeRecovery({file:recoveryFile,password,legacyClientsClosed:true,confirm:()=>true});
        const after=await api.read();
        return {failure,hold:hold.state,blocked,unchanged:after.revision===before.revision&&
          JSON.stringify(after.snapshot)===original&&localStorage.getItem('insight_v11')===raw};
      });
      expect(quota).toEqual({failure:'QuotaExceededError',hold:'hold',
        blocked:'IndexedDB writes are on hold',unchanged:true});
    }
    await page.locator('#backupFile').setInputFiles(downloadPath);
    const largeRestore=await page.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1,backup=InsightMigrationBackupV1,password='Fictional-capacity-only-2026';
      const file=document.querySelector('#backupFile').files[0];
      const before=await api.read();
      const safety=await backup.encodeCommitted(before.snapshot,password);
      const safetyFile=new File([JSON.stringify(safety.encrypted)],safety.filename);
      const raw=localStorage.getItem('insight_v11');
      const start=performance.now();
      const result=await api.restoreBackup({file,password,safetyFile,safetyPassword:password,legacyClientsClosed:true,confirm:()=>true});
      return {revision:result.revision,legacyUnchanged:localStorage.getItem('insight_v11')===raw,
        restoreMs:Math.round(performance.now()-start),heapSampleBytes:performance.memory?.usedJSHeapSize??null};
    });
    expect(largeRestore).toMatchObject({revision:3,legacyUnchanged:true});
    await page.reload();
    const restarted=await page.evaluate(async ()=>{
      const {revision,snapshot}=await InsightIndexedDBStorageV1.read();
      const memo=snapshot.stores.fictional.data['2025']['1月'][0].storeMemo;
      return {revision,length:memo.length,first:memo[0],prefix:/[^架]/.test(memo.slice(0,-3))};
    });
    expect(restarted).toEqual({revision:3,length:saved.memoLength,first:'架',prefix:false});
    const consecutive=await page.evaluate(async ()=>{
      const api=InsightIndexedDBStorageV1;
      const before=await api.read();
      const raw=localStorage.getItem('insight_v11');
      const row=before.snapshot.stores.fictional.data['2025']['1月'][0];
      row.売上=1;
      const start=performance.now();
      const after=await api.save(before.revision,before.snapshot);
      return {revision:after.revision,legacyUnchanged:localStorage.getItem('insight_v11')===raw,
        saveMs:Math.round(performance.now()-start),heapSampleBytes:performance.memory?.usedJSHeapSize??null};
    });
    expect(consecutive).toMatchObject({revision:4,legacyUnchanged:true});
    await page.reload();
    expect(await page.evaluate(async ()=>{
      const {revision,snapshot}=await InsightIndexedDBStorageV1.read();
      const row=snapshot.stores.fictional.data['2025']['1月'][0];
      return {revision,sales:row.売上,memoLength:row.storeMemo.length};
    })).toEqual({revision:4,sales:1,memoLength:saved.memoLength});
    console.log(JSON.stringify({engine:browserName,sizeMiB,phase:'backup-restore',downloadMs,
      fileBytes:validation.selectedBytes,cancelMs:validation.cancelMs,restoreMs:validation.restoreMs,
      largeRestoreMs:largeRestore.restoreMs,consecutiveSaveMs:consecutive.saveMs,
      heapSampleBytes:Math.max(validation.heapSampleBytes??0,largeRestore.heapSampleBytes??0,consecutive.heapSampleBytes??0)||null}));
  });
}
