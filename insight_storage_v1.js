/* Shared storage layer v1: one write path for snapshot/transactional updates. */
(function(root){
  'use strict';
  if(root.InsightStorage)return;

  function storageKey(){
    var key=(typeof SK!=='undefined'&&SK)?SK:root.SK;
    if(typeof key!=='string'||!key)throw new Error('Insight storage key is unavailable.');
    return key;
  }

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function serialize(snapshot){
    return JSON.stringify(snapshot);
  }

  function writeSnapshot(snapshot){
    var serialized=serialize(snapshot);
    root.localStorage.setItem(storageKey(),serialized);
    return serialized;
  }

  function persistCurrent(){
    if(typeof persist==='function')return persist();
    if(typeof root.persist==='function')return root.persist();
    throw new Error('Insight persist function is unavailable.');
  }

  function transaction(source,mutate,validate,apply){
    if(typeof mutate!=='function')throw new Error('Storage transaction mutate callback is required.');
    var next=clone(source);
    mutate(next);
    if(typeof validate==='function')validate(next);
    writeSnapshot(next);
    if(typeof apply==='function')apply(next);
    return next;
  }

  root.InsightStorage={
    clone:clone,
    serialize:serialize,
    writeSnapshot:writeSnapshot,
    persistCurrent:persistCurrent,
    transaction:transaction
  };
})(typeof window!=='undefined'?window:globalThis);
