'use strict';
/*
 * PHASE 3 fictional-only privacy handoff shape guard.
 * Reuses PR #226's projectForLocalAI; no duplicate projection, real Reader,
 * production Storage, DOM, network, Worker, model, or READY authorization.
 * Input provenance is NOT verified by this function.
 */
const {projectForLocalAI}=require('./insight_local_ai_privacy_v1.js');
const SCHEMA='fictional-privacy-handoff-v0';
const INPUT_SCHEMA='fictional-insight-input-v0';
function fail(){throw new Error('fictional_privacy_handoff_unavailable');}
function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function validDay(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function validIssued(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(s)||!validDay(s.slice(0,10)))return false;
  const n=Date.parse(s);
  return Number.isFinite(n)&&new Date(n+9*3600000).toISOString().slice(0,19)===s.slice(0,19);
}
function sameScope(a,b){
  return object(a)&&a.store_id===b.store_id&&a.category_id===b.category_id&&a.trip===b.trip;
}
function quantity(m){
  if(!object(m))fail();
  if(m.state==='entered'){
    if(!Number.isSafeInteger(m.value)||m.value<0)fail();
  }else if((m.state==='missing'||m.state==='unknown')&&m.value===null){
    // An explicit missing quantity is NOT a measured zero.
  }else fail(); // invalid, malformed and silently imputed values are rejected.
  return {state:m.state,value:m.value};
}
function weatherStatus(w,issuedAt){
  if(!object(w)||!['saved_unspecified','unknown'].includes(w.kind))fail();
  if(w.temperature_pair_state==='reversed')fail();
  if(!['valid','unknown',undefined].includes(w.temperature_pair_state))fail();
  for(const k of ['temp_max','temp_min']){
    const t=w[k];
    if(t!==undefined&&t!==null){
      if(!object(t))fail();
      if(t.state==='entered'){
        if(typeof t.value!=='number'||!Number.isFinite(t.value)||t.value< -100||t.value>100)fail();
      }else if((t.state==='missing'||t.state==='unknown')&&t.value===null){
        // Explicitly no temperature evidence.
      }else fail(); // invalid temperature is never silently repaired.
    }
  }
  for(const key of ['known_at','available_at','issued_at','fetched_at']){
    const ts=w[key];
    if(ts!==undefined&&ts!==null &&
       (typeof ts!=='string'||!Number.isFinite(Date.parse(ts))||
         Date.parse(ts)>Date.parse(issuedAt)))fail();
  }
  if(w.temp_max?.state==='entered'&&w.temp_min?.state==='entered'&&
     w.temp_max.value<w.temp_min.value)fail();
  // Saved weather has no confirmed code or historical as-of evidence.
  // Never pass through raw weather text, location or uncertain temperatures.
  return {weather_kind:'unknown',temp_max:{state:'unknown',value:null},
    temp_min:{state:'unknown',value:null}};
}
function projectFictionalNormalizerForLocalAI(envelope){
  if(!object(envelope)||envelope.kind!=='FICTIONAL'||
     envelope.schema_version!==INPUT_SCHEMA||envelope.purpose!=='current_snapshot'||
     !object(envelope.scope)||!['lab_a','lab_b'].includes(envelope.scope.store_id)||
     !['fictional_rice','fictional_bread'].includes(envelope.scope.category_id)||
     ![1,2,3].includes(envelope.scope.trip)||!object(envelope.snapshot)||
     envelope.snapshot.pending!==false||envelope.snapshot.held!==false||
     envelope.snapshot.conflict!==false||!validDay(envelope.target_day)||
     !validIssued(envelope.issued_at)||envelope.target_day<=envelope.issued_at.slice(0,10)||
     !Array.isArray(envelope.history)||envelope.history.length<1||
     envelope.history.length>42)fail();
  const scope=envelope.scope,rows=[];
  let lastDay='';
  for(const row of envelope.history){
    if(!object(row)||!sameScope(row.scope,scope)||!validDay(row.date)||
      row.date<=lastDay||row.date>=envelope.target_day||
      row.date>envelope.issued_at.slice(0,10))fail();
    lastDay=row.date;
    const trip=row.trip_resolution;
    if(!object(trip)||trip.status!=='active'||trip.tentative!==false||
       trip.needsDateReview!==false||trip.conflict!==false||trip.issue!==null)fail();
    if(!object(row.holiday)||row.holiday.state!=='unknown'||
       row.condition_eligibility!=='not_evaluated'||!Array.isArray(row.registries))fail();
    const w=weatherStatus(row.weather,envelope.issued_at);
    rows.push({date:row.date,sales:quantity(row.sales),delivery:quantity(row.delivery),
      // Normalizer does not prove customer observations or known-at conditions.
      customers:{state:'unknown',value:null},
      ...w,holiday:'unknown',sale:'unknown',event:'unknown'});
  }
  const slice=projectForLocalAI({scope:{store_id:scope.store_id,
    category_id:scope.category_id,trip:scope.trip},history:rows});
  // The projection is safe to inspect but MUST NOT authorize model execution:
  // G0-G9 production provenance, source freshness and policy gates are absent.
  return Object.freeze({schema:SCHEMA,provenance_verified:false,
    authorized_for_model:false,slice});
}
module.exports=Object.freeze({SCHEMA,projectFictionalNormalizerForLocalAI});
