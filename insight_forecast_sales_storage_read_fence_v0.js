'use strict';
/*
 * STEP4 P4c-1: isolated, non-authorizing sales/storage read fence.
 *
 * This CommonJS module is NOT loaded by the production shell. It reads
 * explicitly supplied sources only; it never saves, changes the UI, calls
 * the model, logs data, or returns raw/live/selection values.
 *
 * GATE-1 ONLY: a clean sales-count draft does NOT imply other editors are
 * clean. Selection epoch is required; the current OrderForecast UI does
 * not yet provide an authenticated one (GATE-2/GATE-3 remain blocked).
 * No output grants provenance or model authorization.
 */
const MAX_NODES=120000,MAX_DEPTH=90;

function stable(value, trustedPrototypes) {
  // Only explicit realm identities are accepted, never constructor.name.
  // Caller-supplied realm identities are not a provenance/authenticity proof.
  const objectPrototypes=new Set([Object.prototype,null]);
  const arrayPrototypes=new Set([Array.prototype]);
  if(trustedPrototypes){
    objectPrototypes.add(trustedPrototypes.object);
    arrayPrototypes.add(trustedPrototypes.array);
  }
  let nodes=0;
  const ancestors=new Set();
  function visit(v,depth) {
    if(++nodes>MAX_NODES||depth>MAX_DEPTH)throw Error('unavailable');
    if(v===null||typeof v==='string'||typeof v==='boolean')
      return JSON.stringify(v);
    if(typeof v==='number') {
      if(!Number.isFinite(v)||Object.is(v,-0)||
         (Number.isInteger(v)&&!Number.isSafeInteger(v)))throw Error('unavailable');
      return JSON.stringify(v);
    }
    if(typeof v!=='object'||ancestors.has(v))throw Error('unavailable');
    ancestors.add(v);
    try {
      if(Array.isArray(v)) {
        if(!arrayPrototypes.has(Object.getPrototypeOf(v)))
          throw Error('unavailable');
        const keys=Reflect.ownKeys(v);
        if(keys.length!==v.length+1)throw Error('unavailable');
        const parts=[];
        for(let i=0;i<v.length;i++) {
          const d=Object.getOwnPropertyDescriptor(v,String(i));
          if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('unavailable');
          parts.push(visit(d.value,depth+1));
        }
        return '['+parts.join(',')+']';
      }
      // A cross-realm JSON.parse object is accepted only if its genuine
      // realm prototype was explicitly supplied by the trusted VM harness.
      // Inspecting a prototype's constructor.name could execute a getter.
      if(!objectPrototypes.has(Object.getPrototypeOf(v)))
        throw Error('unavailable');
      const keys=Reflect.ownKeys(v);
      if(keys.some(k=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k)))
        throw Error('unavailable');
      keys.sort();
      const pairs=[];
      for(const key of keys) {
        const d=Object.getOwnPropertyDescriptor(v,key);
        if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('unavailable');
        pairs.push(JSON.stringify(key)+':'+visit(d.value,depth+1));
      }
      return '{'+pairs.join(',')+'}';
    } finally {
      ancestors.delete(v);
    }
  }
  return visit(value,0);
}
function normalized(value, trustedPrototypes) {
  return JSON.parse(stable(value,trustedPrototypes));
}
function record(v) {
  return !!v&&typeof v==='object'&&!Array.isArray(v);
}
function reportReady(v) {
  return record(v)&&Number.isSafeInteger(v.revision)&&v.revision>=0&&
    v.pending===0&&v.held===false&&v.conflict===false;
}
function draftReady(v) {
  return record(v)&&v.initialized===true&&v.dirty===false&&
    Number.isSafeInteger(v.epoch)&&v.epoch>=0;
}
function selectionReady(v) {
  return record(v)&&Number.isSafeInteger(v.epoch)&&v.epoch>=0&&
    typeof v.store_id==='string'&&v.store_id.length>0&&
    typeof v.category_id==='string'&&v.category_id.length>0&&
    Number.isInteger(v.trip)&&v.trip>=1&&v.trip<=3&&
    typeof v.delivery==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.delivery);
}
function result(consistent,reason) {
  return Object.freeze({
    status:consistent?'LOCAL_SALES_SCOPE_ONLY':'BLOCKED',
    reason,consistent,
    full_app_clean:false,
    provenance_verified:false,
    authorized_for_model:false
  });
}
function createSalesStorageReadFence(source) {
  if(!source||!source.storage||!source.salesCount||
      typeof source.storage.reportState!=='function'||
      typeof source.storage.readSnapshot!=='function'||
      typeof source.salesCount.getForecastDraftStatus!=='function'||
      typeof source.readLive!=='function'||
      typeof source.readSelection!=='function')
    throw Error('read_fence_source_required');

  // Fixed at construction: only the two actual VM realm prototypes supplied
  // by the isolated caller may supplement the host's built-in prototypes.
  const injected=source.trustedPrototypes;
  let trustedPrototypes=null;
  if(injected!==undefined){
    if(!injected||typeof injected!=='object')
      throw Error('trusted_realm_prototypes_required');
    const object=Object.getOwnPropertyDescriptor(injected,'object');
    const array=Object.getOwnPropertyDescriptor(injected,'array');
    if(!object||!array||!Object.hasOwn(object,'value')||
       !Object.hasOwn(array,'value')||!object.value||!array.value||
       typeof object.value!=='object'||typeof array.value!=='object')
      throw Error('trusted_realm_prototypes_required');
    trustedPrototypes=Object.freeze({object:object.value,array:array.value});
  }

  function fence() {
    // Make each read an immediate copy. Later mutation cannot rewrite the
    // earlier observation before the comparison.
    const report=normalized(source.storage.reportState(),trustedPrototypes);
    const draft=normalized(source.salesCount.getForecastDraftStatus(),trustedPrototypes);
    const selection=normalized(source.readSelection(),trustedPrototypes);
    return {report,draft,selection,
      token:stable({report,draft,selection},trustedPrototypes)};
  }
  function inspect() {
    try {
      const before=fence();
      if(!reportReady(before.report))return result(false,'storage_unready');
      if(!draftReady(before.draft))
        return result(false,'sales_draft_unknown_or_dirty');
      if(!selectionReady(before.selection))
        return result(false,'selection_epoch_or_scope_unknown');

      // Original InsightStorage.readSnapshot parses persisted raw and migrates
      // legacy schema into a new copy. Compare that copy with live allStores,
      // NOT raw JSON bytes and NOT serialize(live), which may mutate state.
      const saved=stable(source.storage.readSnapshot(),trustedPrototypes);
      const live=stable(source.readLive(),trustedPrototypes);
      const after=fence();
      if(before.token!==after.token)
        return result(false,'source_changed_during_read');
      if(!reportReady(after.report)||!draftReady(after.draft)||
         !selectionReady(after.selection))
        return result(false,'source_unready_after_read');
      if(saved!==live)return result(false,'saved_live_mismatch');
      return result(true,'sales_scope_consistent_other_editors_unknown');
    } catch (_) {
      // Never expose error messages, values, keys, IDs or private drafts.
      return result(false,'observation_unavailable');
    }
  }
  return Object.freeze({inspect});
}
module.exports=Object.freeze({createSalesStorageReadFence});
