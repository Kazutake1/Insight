'use strict';
/*
 * STEP4 fixture-only capture preflight contract for G1/G2/G8/G9.
 * Neither this module nor a successful fixture check proves actual UI event
 * provenance, real Storage/raw-live consistency, or production AI eligibility.
 * Not loaded by the production shell. No DOM, Storage, network, model or logs.
 */
const EVENT_TYPES=new Set([
  'auto-delivery','delivery-manual','store','category','trip','page',
  'refresh','storage','external','restore','weather','calendar',
  'registry','policy'
]);
function blocked(reason){return Object.freeze({ok:false,status:'CAPTURE_BLOCKED',reason,
  provenance_verified:false,authorized_for_model:false});}
function serialize(value){
  if(value===undefined)throw new Error('missing_fixture_evidence');
  const out=JSON.stringify(value);
  if(typeof out!=='string')throw new Error('invalid_fixture_evidence');
  return out;
}
function safe(report){
  return report&&typeof report==='object'&&!Array.isArray(report)&&
    Number.isSafeInteger(report.revision)&&report.revision>=0&&
    report.pending===0&&report.held===false&&report.conflict===false&&
    report.versions&&typeof report.versions==='object'&&!Array.isArray(report.versions);
}
function createFixtureCapturePreflight(source){
  if(!source||source.fixture!==true||
    !['inspect','readSaved','readLive','readSelection'].every(k=>typeof source[k]==='function'))
    throw new Error('fixture_source_required');
  let epoch=0,manualIntent=null,disposed=false;
  const tickets=new WeakMap();
  function event(type){
    if(disposed)return epoch;
    epoch++; // Includes A -> B -> A and reselecting the same displayed date.
    if(type==='delivery-manual')manualIntent=true;
    else if(type==='auto-delivery')manualIntent=false;
    if(!EVENT_TYPES.has(type))manualIntent=null; // Unknown events cannot confer provenance.
    return epoch;
  }
  function observe(){
    const startEpoch=epoch;
    const first=source.inspect();
    const firstText=serialize(first);
    const firstSelection=serialize(source.readSelection());
    const saved=serialize(source.readSaved());
    const live=serialize(source.readLive());
    const lastSelection=serialize(source.readSelection());
    const last=source.inspect();
    const lastText=serialize(last);
    if(startEpoch!==epoch||firstText!==lastText||firstSelection!==lastSelection)
      return {reason:'source_or_selection_changed_during_capture'};
    if(!safe(first)||!safe(last))return {reason:'storage_not_ready'};
    if(saved!==live)return {reason:'unsaved_live_data_mismatch'};
    return {epoch:startEpoch,report:firstText,selection:firstSelection,saved};
  }
  function matchesRequest(request,selection){
    if(!request||typeof request!=='object'||!request.scope||!selection)return false;
    return typeof request.manual_target==='boolean'&&manualIntent!==null&&
      request.manual_target===manualIntent&&
      request.scope.store_id===selection.store_id&&
      request.scope.category_id===selection.category_id&&
      request.scope.trip===selection.trip&&
      request.target_day===selection.delivery;
  }
  function capture(request){
    if(disposed)return blocked('disposed');
    try{
      const observed=observe();
      if(observed.reason)return blocked(observed.reason);
      const selection=JSON.parse(observed.selection);
      if(!matchesRequest(request,selection))return blocked('selection_or_manual_provenance_unknown');
      const ticket=Object.freeze({
        kind:'FICTIONAL_CAPTURE_ONLY',
        provenance_verified:false,
        authorized_for_model:false
      });
      tickets.set(ticket,{...observed,manualIntent});
      return Object.freeze({ok:true,status:'FICTIONAL_ONLY_NOT_AUTHORIZED',ticket,
        provenance_verified:false,authorized_for_model:false});
    }catch{return blocked('fixture_evidence_unavailable');}
  }
  function isCurrent(ticket){
    if(disposed||!ticket||typeof ticket!=='object'||!tickets.has(ticket))return false;
    const previous=tickets.get(ticket);
    if(epoch!==previous.epoch||manualIntent!==previous.manualIntent)return false;
    try{
      const latest=observe();
      return !latest.reason&&latest.epoch===previous.epoch&&
        latest.report===previous.report&&latest.selection===previous.selection&&
        latest.saved===previous.saved;
    }catch{return false;}
  }
  return Object.freeze({
    capture,isCurrent,event,getEpoch(){return epoch;},
    dispose(){if(disposed)return;event('page');disposed=true;}
  });
}
module.exports=Object.freeze({createFixtureCapturePreflight});
