/* IndexedDB storage for the unpublished migration draft. The shell does not load it yet. */
(function(root){
  'use strict';
  const database='insight-store-snapshots-v1';
  const markerKey='insight_indexeddb_adoption_v1';
  const sourceKey='insight_v11';
  const recordKey='current';
  const storeName='snapshots';

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

  function writeMarker(state,id){
    const raw=JSON.stringify({state,id});
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

  function open(create){
    return new Promise((resolve,reject)=>{
      const request=root.indexedDB.open(database,1);
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

  async function transact(mode,operation,create=false){
    const db=await open(create);
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

  function validateRecord(record,id){
    if(!record||record.id!==id||typeof record.sourceRaw!=='string'||
       record.sourceRaw!==root.localStorage.getItem(sourceKey)||
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

  // Called only from a user-driven migration flow.
  async function migrate(){
    return exclusive(async ()=>{
      if(marker()!==null)throw new Error('Existing migration requires review');
      const raw=root.localStorage.getItem(sourceKey);
      if(raw===null)throw new Error('Legacy Insight data is missing');
      parse(raw);
      if(await root.InsightMigrationBackupV1.confirm(raw)!==true)throw new Error('Backup save was not confirmed');
      root.InsightMigrationBackupV1.assertReady(raw);
      const id=root.crypto.randomUUID();
      writeMarker('preparing',id);
      const initial={id,sourceRaw:raw,raw,revision:0,previous:null};
      await transact('readwrite',(existing,records)=>{
        if(existing)throw new Error('An IndexedDB snapshot already exists');
        root.InsightMigrationBackupV1.assertReady(raw);
        validateRecord(initial,id);
        records.add(initial,recordKey);
      },true);
      verify(await readRecord(),initial);
      writeMarker('active',id);
      return {revision:0,snapshot:parse(raw)};
    });
  }

  async function read(){
    return exclusive(async ()=>{
      const adopted=activeMarker();
      const current=validateRecord(await readRecord(),adopted.id);
      return {revision:current.revision,snapshot:parse(current.raw)};
    });
  }

  async function save(expectedRevision,snapshot){
    return exclusive(async ()=>{
      const adopted=activeMarker();
      const raw=JSON.stringify(snapshot);
      parse(raw);
      // Leave a persistent hold if the browser exits or the outcome is unclear.
      writeMarker('writing',adopted.id);
      const next=await transact('readwrite',(record,records)=>{
        const current=validateRecord(record,adopted.id);
        if(current.revision!==expectedRevision||current.revision>=Number.MAX_SAFE_INTEGER)
          throw new Error('IndexedDB revision conflict');
        const candidate={...current,raw,revision:current.revision+1,
          previous:{revision:current.revision,raw:current.raw}};
        records.put(candidate,recordKey);
        return candidate;
      });
      verify(await readRecord(),next);
      writeMarker('active',adopted.id);
      return {revision:next.revision,snapshot:parse(next.raw)};
    });
  }

  // A diagnostic never promotes a record or clears a persistent hold.
  async function diagnose(){
    return exclusive(async ()=>{
      const before=root.localStorage.getItem(markerKey);
      const source=root.localStorage.getItem(sourceKey);
      let adopted;
      try{adopted=JSON.parse(before);}
      catch(_){return {state:'hold',reason:'invalid-marker'};}
      if(before!==null&&(!adopted||typeof adopted.id!=='string'||!adopted.id||
         !['active','preparing','writing'].includes(adopted.state))){
        return {state:'hold',reason:'invalid-marker'};
      }
      let record;
      try{record=await readRecord();}
      catch(error){
        return {state:'hold',reason:error instanceof MissingDatabaseError?'database-missing':'database-unavailable'};
      }
      if(before!==root.localStorage.getItem(markerKey)||source!==root.localStorage.getItem(sourceKey)){
        return {state:'hold',reason:'state-changed'};
      }
      if(!adopted)return {state:'hold',reason:'marker-missing'};
      try{validateRecord(record,adopted.id);}
      catch(_){return {state:'hold',reason:'record-unverified'};}
      if(adopted.state!=='active'){
        return {state:'hold',reason:adopted.state,observedRevision:record.revision};
      }
      return {state:'active',revision:record.revision};
    });
  }

  root.InsightIndexedDBStorageV1=Object.freeze({migrate,read,save,diagnose});
})(globalThis);
