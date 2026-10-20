/* Shared storage layer v1: one write path plus top-level schema migration guard. */
(function(root){
  'use strict';
  if(root.InsightStorage)return;

  var CURRENT_SCHEMA_VERSION=1;
  // Report-only observation. No saved schema fields and no effect on save results.
  var reportRevision=0,reportPending=0,reportHeld=false,reportConflict=false;
  function notifyReport(event){
    try{
      var preview=root.InsightReportPreview;
      if(preview&&typeof preview.onStorageUpdate==='function')preview.onStorageUpdate(event);
    }catch(_){ /* Optional reporting must never break existing saves. */ }
  }
  function withReportUpdate(operation){
    var ticket=Object.freeze({}),outcome='failed';
    reportRevision++;reportPending++;
    notifyReport({phase:'begin',ticket:ticket});
    try{var result=operation();outcome='committed';return result;}
    finally{
      reportPending--;if(outcome==='failed')reportHeld=true;
      notifyReport({phase:'finish',ticket:ticket,outcome:outcome});
    }
  }
  function reportState(){
    return Object.freeze({revision:reportRevision,pending:reportPending,held:reportHeld,
      conflict:reportConflict||externalChangeSeen||root.localStorage.getItem(storageKey())!==lastSavedRaw});
  }

  function storageKey(){
    var key=(typeof SK!=='undefined'&&SK)?SK:root.SK;
    if(typeof key!=='string'||!key)throw new Error('Insight storage key is unavailable.');
    return key;
  }

  // Local snapshot identity is tracked outside insight_v11: no persisted schema changes.
  // Read once after the payload has loaded allStores. A later readSnapshot() must not
  // silently acknowledge another tab's changes while the live UI still holds old data.
  var lastSavedRaw=root.localStorage.getItem(storageKey());
  var externalChangeSeen=false;
  if(typeof root.addEventListener==='function'){
    root.addEventListener('storage',function(event){
      if(event&&(event.key===null||event.key===storageKey())&&event.newValue!==lastSavedRaw)
        externalChangeSeen=true;
      if(event&&(event.key===null||event.key===storageKey())){
        reportConflict=true;reportRevision++;notifyReport({phase:'external'});
      }
    });
  }

  function assertNotStale(){
    // Compare raw bytes, not a normalized snapshot: legacy data may lack
    // schemaVersion before its first normal save.
    if(externalChangeSeen||root.localStorage.getItem(storageKey())!==lastSavedRaw){
      var error=new Error('別のタブでデータが更新されています。古いデータで上書きしないため保存を停止しました。未保存の入力内容を控えてから、Insightを再読み込みしてください。');
      error.name='InsightStorageConflictError';
      throw error;
    }
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
    return withReportUpdate(function(){
    var serialized=serialize(snapshot);
    assertNotStale();
    root.localStorage.setItem(storageKey(),serialized);
    // Update the observed baseline only after a successful write.
    lastSavedRaw=serialized;
    return serialized;
      });
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
    var write=function(){root.localStorage.setItem(key,String(value));return true;};
    return key===storageKey()?withReportUpdate(write):write();
  }

  function persistCurrent(snapshot){
    return withReportUpdate(function(){
    var target=snapshot;
    if(target===undefined){
      try{if(typeof allStores!=='undefined')target=allStores;}catch(_){}
    }
    if(target===undefined)target=root.allStores;
    if(!target||typeof target!=='object'||Array.isArray(target))throw new Error('Insight current data is unavailable.');
    target.schemaVersion=CURRENT_SCHEMA_VERSION;
    writeSnapshot(target);
    return true;
      });
  }

  function transaction(source,mutate,validate,apply){
    return withReportUpdate(function(){
    if(typeof mutate!=='function')throw new Error('Storage transaction mutate callback is required.');
    var next=migrateSnapshot(source);
    mutate(next);
    next.schemaVersion=CURRENT_SCHEMA_VERSION;
    if(typeof validate==='function')validate(next);
    writeSnapshot(next);
    if(typeof apply==='function')apply(next);
    return next;
      });
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
    reportState:reportState,
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
