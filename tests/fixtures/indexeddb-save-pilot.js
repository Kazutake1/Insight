// Test-only adapter. The Insight application shell does not load it.
(function(root){
  'use strict';
  const name='insight-test-only-save-pilot-v1';
  const store='state';
  const key='dashboard';

  function open(){
    return new Promise((resolve,reject)=>{
      const request=root.indexedDB.open(name,1);
      let blocked=false;
      request.onupgradeneeded=()=>request.result.createObjectStore(store);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>{
        blocked=true;
        reject(new Error('Pilot database open blocked'));
      };
      request.onsuccess=()=>{
        const db=request.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>db.close();
        resolve(db);
      };
    });
  }

  async function transact(mode,operation){
    const db=await open();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(store,mode);
        const records=tx.objectStore(store);
        const read=records.get(key);
        let result;
        let failure;
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(failure||tx.error||new Error('Pilot transaction aborted'));
        function abort(error){
          failure=error;
          tx.abort();
        }
        read.onsuccess=()=>{
          try{result=operation(read.result,records,abort);}
          catch(error){abort(error);}
        };
      });
    }finally{
      db.close();
    }
  }

  function initialize(raw){
    // Preserve the verified source exactly in the initial record.
    root.InsightStorage.migrateSnapshot(JSON.parse(raw));
    return transact('readwrite',(current,records)=>{
      if(current){
        if(current.revision===0&&current.raw===raw)return current;
        throw new Error('Pilot already initialized');
      }
      const initial={revision:0,raw,previous:null};
      records.add(initial,key);
      return initial;
    });
  }

  function load(){
    return transact('readonly',current=>{
      if(!current)throw new Error('Pilot stored data missing');
      return current;
    });
  }

  function save(revision,snapshot,{beforeWrite,afterWrite}={}){
    const raw=root.InsightStorage.serialize(snapshot);
    return transact('readwrite',(current,records,abort)=>{
      if(!current||current.revision!==revision)throw new Error('Pilot revision conflict');
      const next={revision:revision+1,raw,previous:{revision,raw:current.raw}};
      beforeWrite?.();
      const write=records.put(next,key);
      if(afterWrite){
        write.onsuccess=()=>{
          try{afterWrite();}
          catch(error){abort(error);}
        };
      }
      return next;
    });
  }

  root.InsightIndexedDBSavePilot={initialize,load,save};
})(globalThis);
