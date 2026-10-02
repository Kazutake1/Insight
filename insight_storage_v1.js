/* Shared storage layer v1: one write path plus top-level schema migration guard. */
(function(root){
  'use strict';
  if(root.InsightStorage)return;

  var CURRENT_SCHEMA_VERSION=1;

  function storageKey(){
    var key=(typeof SK!=='undefined'&&SK)?SK:root.SK;
    if(typeof key!=='string'||!key)throw new Error('Insight storage key is unavailable.');
    return key;
  }

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function schemaVersion(snapshot){
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error('Insight data snapshot is invalid.');
    if(snapshot.schemaVersion===undefined||snapshot.schemaVersion===null)return 0;
    var version=Number(snapshot.schemaVersion);
    if(!Number.isSafeInteger(version)||version<0)throw new Error('Insight schema version is invalid.');
    return version;
  }

  function migrateSnapshot(snapshot){
    var next=clone(snapshot);
    var version=schemaVersion(next);
    if(version>CURRENT_SCHEMA_VERSION)throw new Error('このバックアップは新しいInsightで作成されています。現在のアプリでは読み込めません。');
    if(version===0){
      // v0 = legacy data before a top-level schemaVersion field existed.
      next.schemaVersion=1;
      version=1;
    }
    if(version!==CURRENT_SCHEMA_VERSION)throw new Error('Insight data schema migration is unavailable.');
    next.schemaVersion=CURRENT_SCHEMA_VERSION;
    return next;
  }

  function serialize(snapshot){
    return JSON.stringify(migrateSnapshot(snapshot));
  }

  function writeSnapshot(snapshot){
    var serialized=serialize(snapshot);
    root.localStorage.setItem(storageKey(),serialized);
    return serialized;
  }

  function readSnapshot(){
    var raw=root.localStorage.getItem(storageKey());
    if(raw===null||raw===undefined||raw==='')throw new Error('Insight saved data is unavailable.');
    var parsed;
    try{parsed=JSON.parse(raw);}catch(_){throw new Error('Insight saved data JSON is invalid.');}
    return migrateSnapshot(parsed);
  }

  function writeMetadata(key,value){
    if(typeof key!=='string'||!key)throw new Error('Insight metadata key is invalid.');
    root.localStorage.setItem(key,String(value));
    return true;
  }

  function persistCurrent(snapshot){
    var target=snapshot;
    if(target===undefined){
      try{if(typeof allStores!=='undefined')target=allStores;}catch(_){}
    }
    if(target===undefined)target=root.allStores;
    if(!target||typeof target!=='object'||Array.isArray(target))throw new Error('Insight current data is unavailable.');
    target.schemaVersion=CURRENT_SCHEMA_VERSION;
    writeSnapshot(target);
    return true;
  }

  function transaction(source,mutate,validate,apply){
    if(typeof mutate!=='function')throw new Error('Storage transaction mutate callback is required.');
    var next=migrateSnapshot(source);
    mutate(next);
    next.schemaVersion=CURRENT_SCHEMA_VERSION;
    if(typeof validate==='function')validate(next);
    writeSnapshot(next);
    if(typeof apply==='function')apply(next);
    return next;
  }

  // Existing local data had no top-level schemaVersion. Stamp only in memory;
  // the next normal save/export will persist it without an unsolicited startup write.
  try{
    if(typeof allStores!=='undefined'&&allStores&&typeof allStores==='object'){
      var liveVersion=schemaVersion(allStores);
      if(liveVersion>CURRENT_SCHEMA_VERSION)throw new Error('このデータは新しいInsightで作成されています。');
      if(liveVersion===0)allStores.schemaVersion=CURRENT_SCHEMA_VERSION;
    }
  }catch(e){
    console.warn('Insight schema guard:',e);
  }

  root.InsightStorage={
    CURRENT_SCHEMA_VERSION:CURRENT_SCHEMA_VERSION,
    clone:clone,
    schemaVersion:schemaVersion,
    migrateSnapshot:migrateSnapshot,
    serialize:serialize,
    writeSnapshot:writeSnapshot,
    readSnapshot:readSnapshot,
    writeMetadata:writeMetadata,
    persistCurrent:persistCurrent,
    transaction:transaction
  };
})(typeof window!=='undefined'?window:globalThis);
