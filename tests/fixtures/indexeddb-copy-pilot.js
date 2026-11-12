// Test-only prototype. The application shell does not load this file.
(function(root){
  'use strict';
  const databaseName='insight-test-only-copy-pilot-v1';
  const storeName='snapshots';
  const snapshotKey='candidate';

  function openDatabase(indexedDB){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(databaseName,1);
      let blocked=false;
      request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
      request.onblocked=()=>{
        blocked=true;
        reject(new Error('Pilot database open was blocked'));
      };
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>db.close();
        resolve(db);
      };
    });
  }

  function readCandidate(db){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readonly');
      const request=tx.objectStore(storeName).get(snapshotKey);
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error||new Error('Pilot read aborted'));
    });
  }

  function stageCandidate(db,raw,assertSource,signal){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readwrite');
      const records=tx.objectStore(storeName);
      let failure;
      let copied=false;
      function abort(error){
        failure=error;
        // An external notification can arrive after commit but before oncomplete.
        // The final source check still rejects a changed source in that case.
        try{tx.abort();}catch(abortError){
          if(abortError.name!=='InvalidStateError')throw abortError;
        }
      }
      function onSourceChange(){abort(new Error('Pilot source changed'));}
      function checkSource(){
        try{assertSource();}catch(error){abort(error);return false;}
        return true;
      }
      tx.oncomplete=()=>{
        signal?.removeEventListener('abort',onSourceChange);
        resolve(copied);
      };
      tx.onabort=()=>{
        signal?.removeEventListener('abort',onSourceChange);
        reject(failure||tx.error||new Error('Pilot write aborted'));
      };
      signal?.addEventListener('abort',onSourceChange,{once:true});
      const get=records.get(snapshotKey);
      get.onsuccess=()=>{
        if(!checkSource())return;
        if(get.result===raw)return;
        if(get.result!==undefined){
          abort(new Error('Pilot already contains a different snapshot'));
          return;
        }
        const write=records.add(raw,snapshotKey);
        write.onsuccess=()=>{
          if(checkSource())copied=true;
        };
      };
    });
  }

  async function copy({indexedDB,readSource,signal}){
    const raw=readSource();
    if(typeof raw!=='string')throw new Error('Pilot source is missing');
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||!parsed.stores||typeof parsed.stores!=='object'||Array.isArray(parsed.stores)||
       typeof parsed.current!=='string'||!Object.hasOwn(parsed.stores,parsed.current)){
      throw new Error('Pilot source is not a multi-store snapshot');
    }
    function assertSource(){
      if(signal?.aborted||readSource()!==raw)throw new Error('Pilot source changed');
    }
    assertSource();
    const db=await openDatabase(indexedDB);
    try{
      assertSource();
      const copied=await stageCandidate(db,raw,assertSource,signal);
      if(await readCandidate(db)!==raw)throw new Error('Pilot readback differs from source');
      assertSource();
      return copied?'copied':'already-copied';
    }finally{
      db.close();
    }
  }

  root.InsightIndexedDBCopyPilot={copy};
})(globalThis);
