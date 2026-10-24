'use strict';
/*
 * STEP4 fictional-only contract handoff checker. It does NOT transform Reader
 * rows into saved Insight data, call a normalizer/Bridge, or attest provenance.
 * The caller must independently provide an explicit FICTIONAL normalized
 * envelope and FICTIONAL target-day evidence. Fail closed on inconsistencies.
 * No production UI/Storage/Worker/LLM/network imports or writes.
 */
const HANDOFF_VERSION = 'fictional-contract-handoff-v0';
function reject() { throw new Error('fictional_handoff_unavailable'); }
function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function matches(a,b) { return object(a) && object(b) && a.store_id===b.store_id && a.category_id===b.category_id && a.trip===b.trip; }
function validDay(s) {
  if (typeof s!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s;
}
function validJst(s) {
  if(typeof s!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(s) || !validDay(s.slice(0,10)))return false;
  const date = new Date(s);
  return Number.isFinite(date.getTime()) &&
    new Date(date.getTime()+9*3600000).toISOString().slice(0,19)===s.slice(0,19);
}
function known(value, issue) {
  if(value===null)return true; // no inference from unknown
  if(!validJst(value))return false;
  return Date.parse(value)<=Date.parse(issue);
}
function evidenceKnown(value, issue, seen=new Set()) {
  if (value===null || typeof value!=='object')return true;
  if(seen.has(value))return false;
  seen.add(value);
  if(Array.isArray(value)){
    if(!value.every(item=>evidenceKnown(item,issue,seen)))return false;
  } else {
    for(const [key,part] of Object.entries(value)){
      if((key==='known_at'||key==='available_at'||key==='issued_at'||key==='fetched_at') &&
        part!==undefined && !known(part,issue))return false;
      if(!evidenceKnown(part,issue,seen))return false;
    }
  }
  seen.delete(value);
  return true;
}
function validRef(ref, snapshotId) {
  return object(ref) && ref.snapshot_id===snapshotId &&
    Array.isArray(ref.local_locator) && ref.local_locator.length>0 &&
    ref.local_locator.every(p=>typeof p==='string'&&p.trim()) &&
    (ref.source_id===null || ref.source_id===undefined ||
      (typeof ref.source_id==='string'&&ref.source_id.trim()));
}
function validCoverage(c,scope,day) {
  return object(c) && c.store===scope.store_id &&
    (c.category===scope.category_id||c.category===null) &&
    validDay(c.start_day)&&validDay(c.end_day) &&
    c.start_day<=day && day<=c.end_day;
}
function validPart(part,allowed,scope,day,id) {
  return object(part)&&allowed.includes(part.state)&&
    validCoverage(part.coverage,scope,day)&&validRef(part.record_ref,id)&&
    (part.known_at===null||validJst(part.known_at));
}
function metricConsistent(source, output) {
  if (!object(source)||!object(output)||!['entered','missing','invalid'].includes(source.state))return false;
  if(source.state!==output.state)return false;
  if(source.state==='entered')return Number.isSafeInteger(source.value)&&source.value>=0&&output.value===source.value;
  return source.value===null && output.value===null;
}
function isUnknown(target,stateKey,reading) {
  if(reading===null || reading===undefined || reading==='unknown')return target[stateKey].state==='unknown';
  return reading===target[stateKey].state;
}
function validateFixtureHandoff({reader,snapshot,envelope,target_evidence}) {
  if(!reader||typeof reader.isCurrent!=='function')reject();
  try { if(!reader.isCurrent(snapshot))reject(); }catch(_){ reject(); }
  if(!object(snapshot)||snapshot.schema!=='fictional-snapshot-v0'||
    !object(snapshot.request)||!Array.isArray(snapshot.history)||
    !object(envelope)||envelope.kind!=='FICTIONAL'||envelope.schema_version!=='fictional-insight-input-v0'||
    !object(envelope.snapshot)||!Array.isArray(envelope.history)||
    !object(envelope.scope)||!object(target_evidence)||target_evidence.kind!=='FICTIONAL_TARGET_EVIDENCE_V0')reject();
  const req=snapshot.request, es=envelope.snapshot, scope=req.scope;
  // Explicitly limit this proof-of-shape to the fixed lab fixture namespace.
  if(!object(scope)||!['lab_a','lab_b'].includes(scope.store_id)||
    !['fictional_rice','fictional_bread'].includes(scope.category_id)||
    ![1,2,3].includes(scope.trip)||
    !matches(scope,envelope.scope)||!matches(scope,target_evidence.scope)||
    !validDay(req.target_day)||envelope.target_day!==req.target_day||
    target_evidence.target_day!==req.target_day||
    !validJst(req.request_issued_at)||envelope.issued_at!==req.request_issued_at||
    req.manual_target!==envelope.manual_target||
    envelope.purpose!==req.purpose||!['current_snapshot','historical_replay'].includes(req.purpose)||
    typeof envelope.session_id!=='string'||!envelope.session_id||
    typeof envelope.request_id!=='string'||!envelope.request_id||
    typeof es.snapshot_id!=='string'||es.snapshot_id!==snapshot.snapshot_id||
    !validJst(es.captured_at)||(req.purpose==='current_snapshot'&&es.captured_at>envelope.issued_at)||
    !Number.isSafeInteger(es.revision)||es.revision<0||
    es.pending!==false||es.held!==false||es.conflict!==false)reject();
  // Reader's day list is the ONLY allowed handoff list. No zero-filled or
  // automatically generated days, and do not silently drop an invalid day.
  if(snapshot.history.length>42||envelope.history.length!==snapshot.history.length)reject();
  const byDate=new Map();
  for(const record of snapshot.history){
    if(!object(record)||!matches(scope,record.scope)||!validDay(record.day)||
      record.day>=req.target_day||byDate.has(record.day))reject();
    byDate.set(record.day,record);
  }
  const seen=new Set();
  for(const row of envelope.history){
    if(!object(row)||!matches(scope,row.scope)||!validDay(row.date)||
      !byDate.has(row.date)||seen.has(row.date))reject();
    seen.add(row.date);
    const record=byDate.get(row.date);
    if(!metricConsistent(record.sales,row.sales)||!metricConsistent(record.delivery,row.delivery))reject();
    if(object(record.trip)&&(!object(row.trip_resolution)||row.trip_resolution.status!==record.trip.status))reject();
    if(!object(row.weather)||!evidenceKnown(row,req.request_issued_at))reject();
  }
  // PR #214 needs a separately sourced target-day object. The Reader's
  // simplified target evidence CANNOT prove absence of a sale/event/holiday.
  const rTarget=snapshot.target_evidence;
  if(rTarget!==null&&(!object(rTarget)||!matches(scope,rTarget.scope)||rTarget.day!==req.target_day))reject();
  if(!object(target_evidence.calendar)||!object(target_evidence.sale)||
    !object(target_evidence.event)||!object(target_evidence.registries)||
    !object(target_evidence.policy))reject();
  const id=snapshot.snapshot_id;
  if(!validPart(target_evidence.calendar,['holiday','non_holiday','unknown','conflict'],scope,req.target_day,id)||
    !validPart(target_evidence.sale,['confirmed_present','confirmed_absent','unknown','conflict'],scope,req.target_day,id)||
    !validPart(target_evidence.event,['confirmed_present','confirmed_absent','unknown','conflict'],scope,req.target_day,id)||
    (target_evidence.calendar.version!==null&&
      (typeof target_evidence.calendar.version!=='string'||!target_evidence.calendar.version.trim())))reject();
  if(!isUnknown(target_evidence,'sale',rTarget?.sale)||
    !isUnknown(target_evidence,'event',rTarget?.event)||
    !isUnknown(target_evidence,'calendar',rTarget?.calendar))reject();
  for(const kind of ['common','store']){
    const reg=target_evidence.registries[kind];
    if(!object(reg)||reg.ledger!==kind||
      !validCoverage(reg.coverage,scope,req.target_day)||
      !validRef(reg.record_ref,id)||
      !(reg.known_at===null||validJst(reg.known_at))||
      reg.omission_rule!==null||
      !['unavailable','invalid'].includes(reg.read_state)||
      !Array.isArray(reg.records)||reg.records.length!==0)reject();
  }
  if(!Array.isArray(target_evidence.policy.allowed_omission_rules)||
    target_evidence.policy.allowed_omission_rules.length!==0||
    !evidenceKnown(target_evidence,req.request_issued_at))reject();
  try { if(!reader.isCurrent(snapshot))reject(); }catch(_){ reject(); }
  // Report only shape agreement. NOT an authorizing token or data conversion.
  return Object.freeze({schema:HANDOFF_VERSION,compatible_shape:true,
    snapshot_id:snapshot.snapshot_id,request_id:envelope.request_id,
    history_count:envelope.history.length,provenance_verified:false});
}
module.exports=Object.freeze({HANDOFF_VERSION,validateFixtureHandoff});
