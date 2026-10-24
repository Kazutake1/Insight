'use strict';
/*
 * STEP4 TEST-ONLY fictional trip-group contract proposal.
 * NO production imports, InsightStorage, browser IO, network, or model run.
 * An accepted fixture result is NEVER permission to read real store data.
 */
const STORE_IDS=new Set(['lab_a','lab_b']);
const CATEGORY_IDS=new Set(['fictional_rice','fictional_bread']);
const REQUIRED_VERSIONS=['weather','calendar','registry','policy',
  'adapter','contract','model'];
function reject(){throw Error('invalid_fictional_trip_contract');}
function id(v){return typeof v==='string'&&/^[a-zA-Z0-9][\w.-]{0,63}$/.test(v);}
function day(v){
  return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
    Number.isFinite(Date.parse(v+'T00:00:00Z'))&&
    new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
}
function jst(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(v))return false;
  const parts=v.slice(11,19).split(':').map(Number);
  return day(v.slice(0,10))&&parts[0]<24&&parts[1]<60&&parts[2]<60&&
    Number.isFinite(Date.parse(v));
}
function versions(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
      Object.getPrototypeOf(v)!==Object.prototype||
      Object.keys(v).some(k=>!REQUIRED_VERSIONS.includes(k))||
      !REQUIRED_VERSIONS.every(k=>id(v[k])))reject();
  return Object.freeze({...v});
}
function sameVersions(a,b){
  return !!b&&REQUIRED_VERSIONS.every(k=>a[k]===b[k])&&
    Object.keys(b).length===REQUIRED_VERSIONS.length;
}
function stable(obj){return Object.freeze(obj);}
function refused(reason){return stable({accepted:false,freshness:'stale',reason,
  authorized_for_model:false,provenance_verified:false});}
function createFictionalTripGroup(input){
  if(!input||input.fixture!==true||!STORE_IDS.has(input.store_id)||
    !CATEGORY_IDS.has(input.category_id)||!id(input.group_id)||
    !id(input.session_id)||!id(input.snapshot_id)||
    !day(input.target_day)||!jst(input.issued_at)||
    (input.purpose!=='current_snapshot'&&input.purpose!=='historical_replay')||
    typeof input.manual_target!=='boolean'||
    !Number.isSafeInteger(input.ui_epoch)||input.ui_epoch<0||
    !Number.isSafeInteger(input.history_days)||input.history_days<1||
    input.history_days>366||!Array.isArray(input.trips)||
    input.trips.length<1||input.trips.length>3)reject();
  const seen=new Set();
  for(const trip of input.trips){
    if(!Number.isInteger(trip)||trip<1||trip>3||seen.has(trip))reject();
    seen.add(trip);
  }
  // Version evidence never becomes a claim of provenance.
  const versionStamp=versions(input.source_versions);
  const common=stable({
    session_id:input.session_id,ui_epoch:input.ui_epoch,
    snapshot_id:input.snapshot_id,target_day:input.target_day,
    issued_at:input.issued_at,manual_target:input.manual_target,
    purpose:input.purpose,source_versions:versionStamp
  });
  const children=stable(input.trips.map(trip=>{
    const scope=stable({store_id:input.store_id,
      category_id:input.category_id,trip});
    const context=stable({...common,request_id:input.group_id+'.trip'+trip,scope});
    // The existing strict Reader request accepts only these six keys.
    const reader_request=stable({scope,target_day:common.target_day,
      request_issued_at:common.issued_at,manual_target:common.manual_target,
      purpose:common.purpose,history_days:input.history_days});
    return stable({context,reader_request});
  }));
  let epoch=input.ui_epoch,invalidated=false;
  function invalidate(){
    invalidated=true;
    // Each intervening event advances the generation. Overflow requires a new
    // session and cannot be silently wrapped back to an older epoch.
    if(epoch!==null)epoch=epoch===Number.MAX_SAFE_INTEGER?null:epoch+1;
    return epoch;
  }
  function isCurrent(child,observed){
    if(invalidated||!children.includes(child)||!observed||
      observed.ui_epoch!==epoch||observed.session_id!==common.session_id||
      observed.snapshot_id!==common.snapshot_id||
      observed.target_day!==common.target_day||
      observed.manual_target!==common.manual_target||
      observed.store_id!==input.store_id||
      observed.category_id!==input.category_id||
      !sameVersions(versionStamp,observed.source_versions))return false;
    return true;
  }
  function adopt(child,response,observed){
    if(!isCurrent(child,observed))return refused('superseded_or_changed');
    if(!response||typeof response!=='object'||
      response.session_id!==common.session_id||
      response.request_id!==child.context.request_id||
      response.issued_at!==common.issued_at||
      response.purpose!==common.purpose||
      response.snapshot_id!==common.snapshot_id||
      response.ui_epoch!==common.ui_epoch||
      response.target_day!==common.target_day||
      response.manual_target!==common.manual_target||
      !sameVersions(versionStamp,response.source_versions)||
      !response.scope||response.scope.store_id!==child.context.scope.store_id||
      response.scope.category_id!==child.context.scope.category_id||
      response.scope.trip!==child.context.scope.trip||
      !['READY','HELD','INACTIVE'].includes(response.status)||
      (response.status==='READY'?(!Number.isSafeInteger(response.value)||
        response.value<0):response.value!==null))return refused('context_or_state_mismatch');
    return stable({accepted:true,freshness:'current',fixture_only:true,
      status:response.status,value:response.value,request_id:child.context.request_id,
      authorized_for_model:false,provenance_verified:false});
  }
  function view(results){
    // Display only a complete, matching set of adopted fixture replies.
    // Never issue a confirmed daily total, including an all-READY fixture.
    if(invalidated||!Array.isArray(results)||results.length!==children.length||
      results.some((r,i)=>!r||r.request_id!==children[i].context.request_id||
        r.accepted!==true||r.freshness!=='current'||r.fixture_only!==true||
        r.authorized_for_model!==false||r.provenance_verified!==false))
      return refused('group_incomplete_or_changed');
    return stable({kind:'FICTIONAL_TRIP_GROUP_ONLY',items:stable(results.slice()),
      daily_total:null,daily_total_confirmed:false,authorized_for_model:false,
      provenance_verified:false});
  }
  return stable({fixture:true,children,common,invalidate,isCurrent,adopt,view,
    getEpoch(){return epoch;}});
}
function assessFictionalTemporalEvidence(evidence,issuedAt){
  if(!jst(issuedAt)||!evidence||evidence.confirmed!==true||
    evidence.candidate===true||!jst(evidence.known_at)||
    Date.parse(evidence.known_at)>Date.parse(issuedAt))
    return stable({eligible:false,reason:'unverified_or_unknown_time'});
  return stable({eligible:true,reason:null});
}
module.exports=stable({createFictionalTripGroup,assessFictionalTemporalEvidence});
