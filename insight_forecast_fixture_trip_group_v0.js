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

/*
 * Fictional-only screening of historical fact availability and numeric Context.
 * A lab ConditionDecision candidate verifies registered records only; it never
 * establishes real-world absence, forecast READY or historical availability.
 */
function screenFictionalPredictionEvidence(input){
  const blocked=(reason)=>stable({screened:false,reason,
    target_status:'HELD',eligible_history:0,eligible_zero:0,excluded_history:0,
    authorized_for_model:false,provenance_verified:false});
  try{
    // Reject properties that JSON would erase or getter/toJSON would transform.
    let examined=0;
    const seen=new Set();
    function safe(v,depth){
      if(++examined>1500||depth>16)return false;
      if(v===null||typeof v==='string'||typeof v==='boolean')return true;
      if(typeof v==='number')return Number.isSafeInteger(v)&&!Object.is(v,-0);
      if(typeof v!=='object'||seen.has(v))return false;
      if(Array.isArray(v)&&Object.getPrototypeOf(v)!==Array.prototype)return false;
      if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype)return false;
      seen.add(v);
      const descriptors=Object.getOwnPropertyDescriptors(v);
      const keys=Reflect.ownKeys(descriptors);
      if(keys.some(k=>typeof k!=='string'||['__proto__','constructor','prototype','toJSON'].includes(k)))return false;
      if(Array.isArray(v)){
        if(keys.length!==v.length+1)return false;
        for(let i=0;i<v.length;i++)if(!Object.hasOwn(descriptors,i))return false;
      }
      for(const k of keys){
        if(!Object.hasOwn(descriptors[k],'value')||!safe(descriptors[k].value,depth+1))return false;
      }
      seen.delete(v);return true;
    }
    if(!safe(input,0))return blocked('invalid_fixture_evidence');
    if(input?.fixture!==true||!input.request||!input.condition_decision||
      !input.target||!Array.isArray(input.history)||input.history.length>366)
      return blocked('invalid_fixture_contract');
    const r=input.request,d=input.condition_decision,t=input.target;
    if(!STORE_IDS.has(r.scope?.store_id)||!CATEGORY_IDS.has(r.scope?.category_id)||
      !Number.isInteger(r.scope.trip)||r.scope.trip<1||r.scope.trip>3||
      !id(r.snapshot_id)||!day(r.target_day)||!jst(r.issued_at)||
      !['current_snapshot','historical_replay'].includes(r.purpose))
      return blocked('invalid_scope_or_request');
    const eqScope=(x)=>!!x&&x.store_id===r.scope.store_id&&
      x.category_id===r.scope.category_id&&x.trip===r.scope.trip;
    const dr=d.request;
    if(d.outcome!=='completed'||d.eligibility!=='candidate'||
      !dr||!eqScope(dr.scope)||dr.snapshot_id!==r.snapshot_id||
      dr.target_day!==r.target_day||dr.issued_at!==r.issued_at||
      dr.purpose!==r.purpose||
      !Array.isArray(d.basis)||d.basis.length!==2||
      !['sale','event'].every(kind=>d.basis.some(b=>b.condition===kind&&
        b.absence_scope==='registered_records_only'))||
      !Array.isArray(d.conditions)||!['sale','event','holiday'].every(kind=>
        d.conditions.some(c=>Array.isArray(c)&&c.length===2&&
          c[0]===kind&&c[1]==='candidate')))
      return blocked('candidate_not_numeric_confirmation');
    const timeOk=(v)=>jst(v)&&Date.parse(v)<=Date.parse(r.issued_at);
    if(!eqScope(t.scope)||t.day!==r.target_day)return blocked('target_mismatch');
    const state=t.trip_status,holiday=t.holiday,special=t.special;
    if(state?.status!=='active'||!timeOk(state.known_at)||
      holiday?.status!=='confirmed_non_holiday'||
      holiday.origin!=='verified_calendar'||!timeOk(holiday.known_at)||
      special?.status!=='confirmed_none'||
      special.origin!=='independent_check'||!timeOk(special.known_at))
      return blocked('target_context_unconfirmed');
    // Individual rows with unknown availability are excluded, not invented.
    let eligible=0,zeros=0,excluded=0;
    const seenDays=new Set();
    for(const row of input.history){
      if(!eqScope(row.scope)||!day(row.day)||row.day>=r.target_day||
        seenDays.has(row.day))return blocked('history_scope_or_day_invalid');
      seenDays.add(row.day);
      const context=row.context;
      const allowed=day(row.day)&&row.day<r.issued_at.slice(0,10)&&
        Number.isSafeInteger(row.count)&&row.count>=0&&
        timeOk(row.available_at)&&
        Date.parse(row.available_at)>=Date.parse(row.day+'T00:00:00+09:00')&&
        context?.active===true&&context?.holiday===false&&
        context?.event===false&&timeOk(context.known_at)&&
        context.origin==='independent_verified';
      if(allowed){eligible++;if(row.count===0)zeros++;}
      else excluded++;
    }
    return stable({screened:true,reason:null,target_status:'FICTIONAL_CONTEXT_SCREENED',
      eligible_history:eligible,eligible_zero:zeros,excluded_history:excluded,
      authorized_for_model:false,provenance_verified:false});
  }catch(_){
    // No exception or source value is included in the result.
    return blocked('fixture_inspection_failed');
  }
}

module.exports=stable({createFictionalTripGroup,assessFictionalTemporalEvidence,screenFictionalPredictionEvidence});
