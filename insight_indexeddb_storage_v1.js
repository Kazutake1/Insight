/* IndexedDB storage for the Insight migration and adopted data. */
(function(root){
  'use strict';
  const database='insight-store-snapshots-v1';
  const historyDatabase='insight-migration-history-v1';
  const markerKey='insight_indexeddb_adoption_v1';
  const sourceKey='insight_v11';
  const recordKey='current';
  const storeName='snapshots';
  // Pin the version exercised by the Draft migration. It must be updated with the release that enables it.
  const migrationBuild='20261125-print-weekday-build-133';
  const migrationFeatures='5bc54595';

  function parse(raw){
    const snapshot=JSON.parse(raw);
    if(!snapshot||!snapshot.stores||Array.isArray(snapshot.stores)||
       typeof snapshot.current!=='string'||!Object.hasOwn(snapshot.stores,snapshot.current)||
       !snapshot.stores[snapshot.current])throw new Error('Invalid Insight snapshot');
    return snapshot;
  }

  function marker(){
    const raw=root.localStorage.getItem(markerKey);
    return raw===null?null:JSON.parse(raw);
  }

  function writeMarker(state,id,operation){
    const raw=JSON.stringify({state,id,operation});
    root.InsightStorage.writeMetadata(markerKey,raw);
    if(root.localStorage.getItem(markerKey)!==raw)throw new Error('Adoption state could not be verified');
  }

  function exclusive(operation){
    if(!root.navigator.locks)throw new Error('Exclusive IndexedDB operations are unavailable');
    return root.navigator.locks.request(database,{ifAvailable:true},lock=>{
      if(!lock)throw new Error('Another Insight operation is in progress');
      return operation();
    });
  }

  class MissingDatabaseError extends Error {}

  function open(create,name){
    return new Promise((resolve,reject)=>{
      const request=root.indexedDB.open(name,1);
      let blocked=false;
      let missing=false;
      request.onupgradeneeded=()=>{
        if(create)request.result.createObjectStore(storeName);
        else {missing=true;request.transaction.abort();}
      };
      request.onerror=()=>reject(missing?new MissingDatabaseError('IndexedDB snapshot database is missing',{cause:request.error}):request.error);
      request.onblocked=()=>{
        blocked=true;
        reject(new Error('IndexedDB open is blocked'));
      };
      request.onsuccess=()=>{
        const db=request.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>db.close();
        resolve(db);
      };
    });
  }

  async function transact(mode,operation,create=false,name=database){
    const db=await open(create,name);
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(storeName,mode);
        const records=tx.objectStore(storeName);
        const request=records.get(recordKey);
        let value;
        let failure;
        tx.oncomplete=()=>resolve(value);
        tx.onabort=()=>reject(failure||tx.error||new Error('IndexedDB transaction aborted'));
        request.onsuccess=()=>{
          try{value=operation(request.result,records);}
          catch(error){failure=error;tx.abort();}
        };
      });
    }finally{db.close();}
  }

  function readRecord(){return transact('readonly',record=>record);}

  async function requireFirstMigration(){
    for(const name of [historyDatabase,database]){
      try{await transact('readonly',record=>record,false,name);}
      catch(error){
        if(error instanceof MissingDatabaseError)continue;
        throw error;
      }
      throw new Error('Existing migration requires review');
    }
  }

  async function recordMigrationAttempt(id){
    await transact('readwrite',(existing,records)=>{
      if(existing)throw new Error('Existing migration requires review');
      records.add({id},recordKey);
    },true,historyDatabase);
    const saved=await transact('readonly',record=>record,false,historyDatabase);
    if(saved?.id!==id)throw new Error('Migration history could not be verified');
  }


  // Read-only evidence. A missing or corrupt history must never authorize writes.
  async function migrationHistory(){
    try{
      const record=await transact('readonly',value=>value,false,historyDatabase);
      return record&&typeof record.id==='string'&&record.id?
        {kind:'recorded',id:record.id}:{kind:'unverified'};
    }catch(error){
      return {kind:error instanceof MissingDatabaseError?'missing':'unavailable'};
    }
  }

  async function requireHistory(id){
    const history=await migrationHistory();
    if(history.kind!=='recorded'||history.id!==id)
      throw new Error('Migration history requires review');
  }

  function sourceMatches(record){
    const expected=record.sourceRaw;
    return expected===root.localStorage.getItem(sourceKey)&&
      (typeof expected==='string'||(expected===null&&!hasOlderSource()));
  }

  function validateRecord(record,id){
    if(!record||record.id!==id||!sourceMatches(record)||
       !Number.isSafeInteger(record.revision)||record.revision<0){
      throw new Error('Insight data requires recovery');
    }
    parse(record.raw);
    return record;
  }

  function verify(record,expected){
    validateRecord(record,expected.id);
    if(record.revision!==expected.revision||record.raw!==expected.raw)
      throw new Error('IndexedDB commit could not be verified');
    return record;
  }

  function activeMarker(){
    const adopted=marker();
    if(adopted?.state!=='active')throw new Error('IndexedDB writes are on hold');
    return adopted;
  }

  function checkActiveSource(record,adopted,markerRaw){
    if(root.localStorage.getItem(markerKey)!==markerRaw)
      throw new Error('IndexedDB adoption state changed');
    if(record?.id===adopted.id&&!sourceMatches(record)){
      writeMarker('source-conflict',adopted.id);
      throw new Error('Legacy Insight storage changed; IndexedDB writes are on hold');
    }
  }

  async function checkMigrationEnvironment({expectedBuild,expectedFeatures,legacyClientsClosed,requireManualMigration=false}={}){
    const hold=reason=>({state:'hold',reason});
    if(legacyClientsClosed!==true)return hold('legacy-client-confirmation-required');
    const matchesLoadedVersion=()=>root.__INSIGHT_SHELL_VERSION__===expectedBuild&&
      root.__INSIGHT_FEATURE_SIGNATURE__===expectedFeatures;
    if(!expectedBuild||!expectedFeatures||!matchesLoadedVersion())return hold('build-mismatch');
    if(root.navigator.onLine!==true)return hold('offline');

    try{
      const workers=root.navigator.serviceWorker;
      if(typeof workers?.getRegistration!=='function')return hold('worker-state-unavailable');
      const hasWorker=async ()=>{
        const registration=await workers.getRegistration(root.location.href);
        return Boolean(workers.controller||registration);
      };
      if(await hasWorker())return hold('service-worker-present');

      const probe=new URL('Index.html',root.location.href);
      probe.searchParams.set('insight_migration_probe',root.crypto.randomUUID());
      const response=await root.fetch(probe,{cache:'no-store',redirect:'error'});
      if(!response.ok)return hold('build-check-unavailable');
      const html=await response.text();
      const document=new DOMParser().parseFromString(html,'text/html');
      const serverBuild=document.querySelector('meta[name="insight-shell-version"]')?.content;
      if(!serverBuild)return hold('build-check-unavailable');
      if(await hasWorker())return hold('service-worker-present');
      if(serverBuild!==expectedBuild||!matchesLoadedVersion())return hold('build-mismatch');
      if(requireManualMigration&&root.location.origin==='https://kazutake1.github.io'&&
         !document.querySelector('script[data-indexeddb-migration="manual"]'))return hold('manual-migration-disabled');
      if(root.navigator.onLine!==true)return hold('offline');
      return {state:'ready'};
    }catch(_){
      return hold('build-check-unavailable');
    }
  }

  async function requireMigrationEnvironment(legacyClientsClosed,{requireManualMigration=false}={}){
    const result=await checkMigrationEnvironment({
      expectedBuild:migrationBuild,expectedFeatures:migrationFeatures,legacyClientsClosed,requireManualMigration
    });
    if(result.state!=='ready')throw new Error('Migration environment requires review: '+result.reason);
  }

  // Called only from a user-driven migration flow.
  async function migrate({legacyClientsClosed,selectVerifiedBackup}={}){
    if(legacyClientsClosed!==true)
      throw new Error('Migration environment requires review: legacy-client-confirmation-required');
    return exclusive(async ()=>{
      if(marker()!==null)throw new Error('Existing migration requires review');
      await requireFirstMigration();
      const raw=root.localStorage.getItem(sourceKey);
      if(raw===null)throw new Error('Legacy Insight data is missing');
      parse(raw);
      root.InsightMigrationBackupV1.assertReady(raw);
      await requireMigrationEnvironment(legacyClientsClosed,{requireManualMigration:true});
      root.InsightMigrationBackupV1.assertReady(raw);
      if(typeof selectVerifiedBackup!=='function')throw new Error('A verified backup file is required');
      if(await root.InsightMigrationBackupV1.confirm(raw)!==true)throw new Error('Backup save was not confirmed');
      root.InsightMigrationBackupV1.assertReady(raw);
      const selected=await selectVerifiedBackup();
      if(!(selected?.file instanceof root.Blob))throw new Error('Backup save was not confirmed');
      await root.InsightMigrationBackupV1.verify(selected.file,selected.password,raw);
      await requireMigrationEnvironment(legacyClientsClosed,{requireManualMigration:true});
      await requireFirstMigration();
      root.InsightMigrationBackupV1.assertReady(raw);
      if(marker()!==null)throw new Error('Existing migration requires review');
      const id=root.crypto.randomUUID();
      await recordMigrationAttempt(id);
      root.InsightMigrationBackupV1.assertReady(raw);
      if(marker()!==null)throw new Error('Existing migration requires review');
      writeMarker('preparing',id);
      const initial={id,sourceRaw:raw,raw,revision:0,previous:null};
      await transact('readwrite',(existing,records)=>{
        if(existing)throw new Error('An IndexedDB snapshot already exists');
        root.InsightMigrationBackupV1.assertReady(raw);
        validateRecord(initial,id);
        records.add(initial,recordKey);
      },true);
      const committed=await readRecord();
      await requireHistory(id);
      verify(committed,initial);
      writeMarker('active',id);
      return {revision:0,snapshot:parse(raw)};
    });
  }

  async function read(){
    return exclusive(async ()=>{
      const markerRaw=root.localStorage.getItem(markerKey);
      const adopted=activeMarker();
      const record=await readRecord();
      await requireHistory(adopted.id);
      checkActiveSource(record,adopted,markerRaw);
      const current=validateRecord(record,adopted.id);
      return {revision:current.revision,snapshot:parse(current.raw)};
    });
  }

  async function digest(raw){
    const bytes=new TextEncoder().encode(raw);
    const hash=await root.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function activeEvidence(){
    const markerRaw=root.localStorage.getItem(markerKey);
    const adopted=activeMarker();
    await requireHistory(adopted.id);
    const record=await readRecord();
    checkActiveSource(record,adopted,markerRaw);
    return {markerRaw,adopted,record:validateRecord(record,adopted.id)};
  }

  async function commitSnapshot({markerRaw,adopted,record:baseline},expectedRevision,snapshot){
    const raw=JSON.stringify(snapshot);
    parse(raw);
    // Record both versions before opening the write transaction.
    const [candidateDigest,baselineDigest]=await Promise.all([digest(raw),digest(baseline.raw)]);
    const operation={id:root.crypto.randomUUID(),expectedRevision,digest:candidateDigest,
      baselineDigest,baselineWriteId:baseline.writeId??null};
    checkActiveSource(baseline,adopted,markerRaw);
    // Leave a persistent hold if the browser exits or the outcome is unclear.
    writeMarker('writing',adopted.id,operation);
    const writingMarker=root.localStorage.getItem(markerKey);
    const next=await transact('readwrite',(record,records)=>{
      const current=verify(record,baseline);
      if(root.localStorage.getItem(markerKey)!==writingMarker||
         current.revision!==expectedRevision||current.revision>=Number.MAX_SAFE_INTEGER||
         current.writeId!==baseline.writeId)
        throw new Error('IndexedDB revision conflict');
      const candidate={...current,raw,revision:current.revision+1,writeId:operation.id,
        previous:{revision:current.revision,raw:current.raw}};
      records.put(candidate,recordKey);
      return candidate;
    });
    const committed=await readRecord();
    await requireHistory(adopted.id);
    verify(committed,next);
    if(root.localStorage.getItem(markerKey)!==writingMarker||
       JSON.stringify(committed)!==JSON.stringify(next))
      throw new Error('IndexedDB commit could not be verified');
    writeMarker('active',adopted.id);
    return {revision:next.revision,snapshot:parse(next.raw)};
  }

  async function save(expectedRevision,snapshot){
    return exclusive(async ()=>commitSnapshot(await activeEvidence(),expectedRevision,snapshot));
  }

  // Check whether an interrupted operation produced a complete snapshot.
  // Older markers without an operation ID carry no evidence of a save.
  async function inspectHeldRecord(adopted,record){
    if(adopted.state==='preparing'){
      if(record.revision!==0||record.previous!==null)return 'unverified';
      if(record.sourceRaw===null){
        return adopted.operation?.recoveryDigest===await digest(record.raw)?
          'backup-restore-verified':'unverified';
      }
      return record.raw===record.sourceRaw?'migration-copy-verified':'unverified';
    }
    const operation=adopted.operation;
    if(!operation||typeof operation.id!=='string'||!Number.isSafeInteger(operation.expectedRevision)||
       typeof operation.baselineDigest!=='string')return 'unverified';
    if(record.revision===operation.expectedRevision&&record.writeId!==operation.id&&
       (record.writeId??null)===operation.baselineWriteId){
      return await digest(record.raw)===operation.baselineDigest?'prior-save-verified':'unverified';
    }
    if(record.writeId!==operation.id||record.revision!==operation.expectedRevision+1||
       record.previous?.revision!==operation.expectedRevision||
       typeof record.previous.raw!=='string')return 'unverified';
    parse(record.previous.raw);
    const [currentDigest,previousDigest]=await Promise.all([digest(record.raw),digest(record.previous.raw)]);
    return currentDigest===operation.digest&&previousDigest===operation.baselineDigest?
      'save-verified':'unverified';
  }

  function hasOlderSource(){
    return ['insight_v9','insight_v8'].some(key=>root.localStorage.getItem(key)!==null);
  }

  // A diagnostic never promotes a record or clears a persistent hold.
  async function inspectStorage(verifyInterrupted,beforeStartup){
    return exclusive(async ()=>{
      const before=root.localStorage.getItem(markerKey);
      const source=root.localStorage.getItem(sourceKey);
      const olderSource=source===null&&hasOlderSource();
      let adopted;
      try{adopted=JSON.parse(before);}
      catch(_){return {state:'hold',reason:'invalid-marker'};}
      if(before!==null&&(!adopted||typeof adopted.id!=='string'||!adopted.id||
         !['active','preparing','writing','source-conflict'].includes(adopted.state))){
        return {state:'hold',reason:'invalid-marker'};
      }
      const history=await migrationHistory();
      let record, databaseMissing=false;
      try{record=await readRecord();}
      catch(error){
        if(!(error instanceof MissingDatabaseError))return {state:'hold',reason:'database-unavailable'};
        databaseMissing=true;
      }
      if(before!==root.localStorage.getItem(markerKey)||source!==root.localStorage.getItem(sourceKey)||
         (source===null&&olderSource!==hasOlderSource())){
        return {state:'hold',reason:'state-changed'};
      }
      if(databaseMissing){
        if(!adopted&&history.kind==='recorded')return {state:'hold',reason:'history-only'};
        if(!adopted&&history.kind==='missing'){
          if(beforeStartup&&(source!==null||olderSource))return {state:'legacy'};
          if(source===null)return {state:'hold',reason:olderSource?'older-source-present':'storage-history-unknown'};
        }
        return {state:'hold',reason:'database-missing'};
      }
      if(!adopted)return {state:'hold',reason:history.kind==='recorded'&&!record?'history-only':'marker-missing'};
      if(adopted.state==='source-conflict')return {state:'hold',reason:'source-conflict'};
      try{validateRecord(record,adopted.id);}
      catch(_){return {state:'hold',reason:'record-unverified'};}
      if(history.kind!=='recorded'||history.id!==adopted.id){
        return {state:'hold',reason:history.kind==='recorded'?'history-mismatch':
          history.kind==='missing'?'history-missing':'history-unverified'};
      }
      if(adopted.state!=='active'){
        const diagnostic={state:'hold',reason:adopted.state,observedRevision:record.revision};
        if(verifyInterrupted){
          try{
            diagnostic.recovery=await inspectHeldRecord(adopted,record);
            const reread=await readRecord();
            if(!reread||JSON.stringify(reread)!==JSON.stringify(record))return {state:'hold',reason:'state-changed'};
          }catch(_){diagnostic.recovery='unverified';}
          if(before!==root.localStorage.getItem(markerKey)||source!==root.localStorage.getItem(sourceKey)){
            return {state:'hold',reason:'state-changed'};
          }
        }
        return diagnostic;
      }
      return {state:'active',revision:record.revision};
    });
  }

  function diagnose({verifyInterrupted=false}={}){
    return inspectStorage(verifyInterrupted,false);
  }

  async function diagnoseStartup(){
    try{
      const result=await inspectStorage(false,true);
      // The legacy shell must not start while IndexedDB is the adopted source.
      return result.state==='active'?{state:'hold',reason:'indexeddb-adopted'}:result;
    }catch(_){
      return {state:'hold',reason:'startup-check-unavailable'};
    }
  }

  async function recoveryEvidence(){
    const markerRaw=root.localStorage.getItem(markerKey);
    const adopted=JSON.parse(markerRaw);
    if(!['preparing','writing'].includes(adopted?.state))
      throw new Error('No held migration or save to review');
    await requireHistory(adopted.id);
    const record=validateRecord(await readRecord(),adopted.id);
    const outcome=await inspectHeldRecord(adopted,record);
    if(outcome==='unverified')throw new Error('Recovery could not be verified');
    const frozenRecord=JSON.stringify(record);
    const reread=await readRecord();
    await requireHistory(adopted.id);
    if(JSON.stringify(reread)!==frozenRecord||
       root.localStorage.getItem(markerKey)!==markerRaw||
       !sourceMatches(record)){
      throw new Error('Recovery data changed');
    }
    const snapshot=parse(record.raw);
    const stores=Object.entries(snapshot.stores).map(([id,store])=>({
      id,name:store.name??id,years:Array.isArray(store.years)?store.years:[]
    }));
    return {adopted,record,markerRaw,frozenRecord,review:{
      outcome,revision:record.revision,previousRevision:record.previous?.revision??null,stores
    }};
  }

  // The draft exercises confirmation and revalidation, without activating writes.
  async function reviewRecovery(confirm){
    const before=await exclusive(recoveryEvidence);
    if(await confirm(before.review)!==true)return {state:'hold',review:'cancelled'};
    return exclusive(async ()=>{
      const after=await recoveryEvidence();
      if(after.markerRaw!==before.markerRaw||after.frozenRecord!==before.frozenRecord)
        throw new Error('Recovery data changed');
      return {state:'hold',review:'confirmed',revision:after.review.revision};
    });
  }

  async function resumeRecovery({file,password,confirm,legacyClientsClosed}){
    await requireMigrationEnvironment(legacyClientsClosed);
    const before=await exclusive(recoveryEvidence);
    const codec=root.InsightMigrationBackupV1;
    let backup;
    if(before.review.outcome==='backup-restore-verified'){
      const target=await codec.readRestoreCandidate(file,password);
      if(JSON.stringify(target.snapshot)!==before.record.raw)
        throw new Error('The backup does not match the prepared recovery');
      backup=target.summary;
    }else{
      backup=await codec.verify(file,password,before.record.raw);
    }
    if(await confirm({...before.review,backup})!==true)return {state:'hold',review:'cancelled'};
    return exclusive(async ()=>{
      await requireMigrationEnvironment(legacyClientsClosed);
      const after=await recoveryEvidence();
      if(after.markerRaw!==before.markerRaw||after.frozenRecord!==before.frozenRecord)
        throw new Error('Recovery data changed');
      writeMarker('active',after.adopted.id);
      return {state:'active',revision:after.review.revision};
    });
  }

  async function restoreBackup({file,password,safetyFile,safetyPassword,confirm,legacyClientsClosed}){
    await requireMigrationEnvironment(legacyClientsClosed);
    const before=await exclusive(activeEvidence);
    const backup=root.InsightMigrationBackupV1;
    const safety=await backup.verify(safetyFile,safetyPassword,before.record.raw);
    const target=await backup.readRestoreCandidate(file,password);
    if(await confirm({revision:before.record.revision,safety,target:target.summary})!==true)
      return {state:'active',review:'cancelled',revision:before.record.revision};
    return exclusive(async ()=>{
      await requireMigrationEnvironment(legacyClientsClosed);
      const after=await activeEvidence();
      if(after.markerRaw!==before.markerRaw||JSON.stringify(after.record)!==JSON.stringify(before.record))
        throw new Error('Recovery data changed');
      return commitSnapshot(after,after.record.revision,target.snapshot);
    });
  }

  async function downloadCommittedBackup(password,container){
    const before=await exclusive(activeEvidence);
    const backup=root.InsightMigrationBackupV1;
    const file=await backup.encodeCommitted(parse(before.record.raw),password);
    return exclusive(async ()=>{
      const after=await activeEvidence();
      if(after.markerRaw!==before.markerRaw||JSON.stringify(after.record)!==JSON.stringify(before.record))
        throw new Error('Backup data changed');
      backup.downloadEncrypted(file.encrypted,file.filename,container);
      return after.record.revision;
    });
  }

  async function historyOnlyEvidence(){
    const raw=root.localStorage.getItem(sourceKey);
    const history=await migrationHistory();
    let record;
    try{record=await readRecord();}
    catch(error){if(!(error instanceof MissingDatabaseError))throw error;}
    if(raw===null||history.kind!=='recorded'||record||
       root.localStorage.getItem(markerKey)!==null||root.localStorage.getItem(sourceKey)!==raw)
      throw new Error('History-only recovery could not be verified');
    parse(raw);
    return {raw,id:history.id};
  }

  // The actual backup file is verified without resuming or restoring data.
  async function reviewHistoryOnlyBackup(file,password,confirm){
    const before=await exclusive(historyOnlyEvidence);
    const summary=await root.InsightMigrationBackupV1.verify(file,password,before.raw);
    if(await confirm(summary)!==true)return {state:'hold',review:'cancelled'};
    return exclusive(async ()=>{
      const after=await historyOnlyEvidence();
      if(after.raw!==before.raw||after.id!==before.id)throw new Error('Recovery data changed');
      return {state:'hold',review:'confirmed'};
    });
  }

  async function assertMissingStorage(){
    if((await diagnose()).reason!=='storage-history-unknown')
      throw new Error('Missing storage recovery state could not be verified');
  }

  async function reviewMissingStorageBackup(file,password,confirm){
    await assertMissingStorage();
    const summary=await root.InsightMigrationBackupV1.inspectMissingStorage(file,password);
    await assertMissingStorage();
    if(await confirm(summary)!==true)return {state:'hold',review:'cancelled'};
    await assertMissingStorage();
    return {state:'hold',review:'confirmed'};
  }

  async function restoreMissingStorage({file,password,confirm,legacyClientsClosed}){
    await requireMigrationEnvironment(legacyClientsClosed,{requireManualMigration:true});
    await assertMissingStorage();
    const target=await root.InsightMigrationBackupV1.readRestoreCandidate(file,password);
    await assertMissingStorage();
    if(await confirm(target.summary)!==true)return {state:'hold',review:'cancelled'};

    return exclusive(async ()=>{
      await requireMigrationEnvironment(legacyClientsClosed,{requireManualMigration:true});
      await requireFirstMigration();
      const raw=JSON.stringify(target.snapshot);
      parse(raw);
      const initial={id:root.crypto.randomUUID(),sourceRaw:null,raw,revision:0,previous:null};
      const recoveryDigest=await digest(raw);
      function requireUnchanged(markerRaw){
        if(root.localStorage.getItem(markerKey)!==markerRaw||!sourceMatches(initial))
          throw new Error('Recovery data changed');
      }
      requireUnchanged(null);
      await recordMigrationAttempt(initial.id);
      requireUnchanged(null);
      writeMarker('preparing',initial.id,{recoveryDigest});
      const preparing=root.localStorage.getItem(markerKey);
      await transact('readwrite',(record,records)=>{
        requireUnchanged(preparing);
        if(record)throw new Error('Existing recovery data requires review');
        records.add(initial,recordKey);
      },true);
      const saved=await readRecord();
      await requireHistory(initial.id);
      verify(saved,initial);
      requireUnchanged(preparing);
      if(JSON.stringify(saved)!==JSON.stringify(initial))throw new Error('Recovery could not be verified');
      writeMarker('active',initial.id);
      return {revision:0};
    });
  }

  root.InsightIndexedDBStorageV1=Object.freeze({
    migrate,read,save,diagnose,diagnoseStartup,checkMigrationEnvironment,reviewRecovery,reviewHistoryOnlyBackup,reviewMissingStorageBackup,restoreMissingStorage,restoreBackup,resumeRecovery,downloadCommittedBackup
  });
})(globalThis);
