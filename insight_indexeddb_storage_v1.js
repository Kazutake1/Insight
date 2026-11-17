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

  function open(create){
    return new Promise((resolve,reject)=>{
      const request=root.indexedDB.open(database,1);
      let blocked=false;
      request.onupgradeneeded=()=>{
        if(create)request.result.createObjectStore(storeName);
        else request.transaction.abort();
      };
      request.onerror=()=>reject(request.error);
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

  // Called only from a user-driven migration flow. That flow supplies the
  // existing download and confirmation UI and returns whether they completed.
  async function migrate({password,downloadAndConfirm}){
    return exclusive(async ()=>{
      if(marker()!==null)throw new Error('Existing migration requires review');
      const raw=root.localStorage.getItem(sourceKey);
      if(raw===null)throw new Error('Legacy Insight data is missing');
      const snapshot=parse(raw);
      const codec=root.InsightBackupCryptoV1;
      const encrypted=await codec.encrypt(snapshot,password);
      if(await downloadAndConfirm(encrypted)!==true)throw new Error('Backup save was not confirmed');
      if(root.localStorage.getItem(sourceKey)!==raw)throw new Error('Legacy Insight data changed');
      const id=root.crypto.randomUUID();
      writeMarker('preparing',id);
      const initial={id,sourceRaw:raw,raw,revision:0,previous:null};
      await transact('readwrite',(existing,records)=>{
        if(existing)throw new Error('An IndexedDB snapshot already exists');
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

  root.InsightIndexedDBStorageV1=Object.freeze({migrate,read,save});
})(globalThis);
