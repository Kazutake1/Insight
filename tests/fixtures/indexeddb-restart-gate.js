// Test-only adapter. The Insight application shell does not load it.
(function(root){
  'use strict';
  const name='insight-test-only-restart-gate-v1';
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

  function create(readSource){
    function checkSource(candidate){
      if(readSource()!==candidate.sourceRaw)throw new Error('Pilot source changed');
    }

    function putChecked(records,candidate,abort,method='put'){
      const write=records[method](candidate,key);
      write.onsuccess=()=>{
        try{checkSource(candidate);}
        catch(error){abort(error);}
      };
    }

    async function prepare(){
      const sourceRaw=readSource();
      if(typeof sourceRaw!=='string')throw new Error('Pilot source missing');
      root.InsightStorage.migrateSnapshot(JSON.parse(sourceRaw));
      const prepared=await transact('readwrite',(current,records,abort)=>{
        if(current){
          checkSource(current);
          if(current.status!=='pending')throw new Error('Pilot already active');
          return current;
        }
        const candidate={id:root.crypto.randomUUID(),status:'pending',sourceRaw,revision:0,raw:sourceRaw,previous:null};
        checkSource(candidate);
        putChecked(records,candidate,abort,'add');
        return candidate;
      });
      checkSource(prepared);
      return prepared.id;
    }

    function inspect(){
      return transact('readonly',current=>current?{
        id:current.id,status:current.status,sourceMatches:readSource()===current.sourceRaw
      }:null);
    }

    async function activate(id){
      const active=await transact('readwrite',(current,records,abort)=>{
        if(!current||current.id!==id)throw new Error('Pilot candidate mismatch');
        checkSource(current);
        if(current.status==='active')return current;
        if(current.status!=='pending'||current.revision!==0||current.raw!==current.sourceRaw)
          throw new Error('Pilot candidate invalid');
        const next={...current,status:'active'};
        putChecked(records,next,abort);
        return next;
      });
      checkSource(active);
      return active;
    }

    function discardPending(id){
      return transact('readwrite',(current,records)=>{
        if(!current||current.id!==id||current.status!=='pending')
          throw new Error('Pilot pending candidate mismatch');
        records.delete(key);
      });
    }

    function requireActive(current){
      if(!current||current.status!=='active')throw new Error('Pilot data is not active');
      checkSource(current);
    }

    async function load(){
      const current=await transact('readonly',value=>value);
      requireActive(current);
      return current;
    }

    async function save(revision,snapshot){
      const raw=root.InsightStorage.serialize(snapshot);
      const saved=await transact('readwrite',(current,records,abort)=>{
        requireActive(current);
        if(current.revision!==revision)throw new Error('Pilot revision conflict');
        const next={...current,revision:revision+1,raw,previous:{revision,raw:current.raw}};
        putChecked(records,next,abort);
        return next;
      });
      checkSource(saved);
      return saved;
    }

    return {prepare,inspect,activate,discardPending,load,save};
  }

  root.InsightIndexedDBRestartGate={create};
})(globalThis);
