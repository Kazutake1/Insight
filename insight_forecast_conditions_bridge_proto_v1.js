/* STEP4 FICTIONAL transport compatibility prototype.
 * Converts Insight prototype envelope to a shape matching lab PR #60
 * ConditionInput dataclass fields. It does not instantiate Python types,
 * evaluate normal-day conditions, or read storage/network/UI.
 * Target-day evidence must be supplied separately; history is NOT evidence
 * that a future target day has no sale/event or is a non-holiday.
 */
(function(root){
  'use strict';
  var INPUT_VERSION='fictional-insight-input-v0';
  var OUTPUT_VERSION='fictional-forecast-conditions-v1';
  var POLICY={id:'registered_conditions_only',
    version:'fictional-registered-conditions-v1',
    event_mapping:'fictional-all-registered-types-v1'};
  var ALLOWED_OMISSION='fictional-legacy-optional-ledgers-v1';
  var EVENT_TYPES=['sale','campaign','nearby','special','environment',
    'equipment','staff','bulk','other'];
  function obj(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
  function required(ok,reason){if(!ok)throw new Error(reason);}
  function nonblank(v){return typeof v==='string'&&!!v.trim();}
  function validDay(s){
    if(typeof s!=='string'||!/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(s))return false;
    var p=s.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
    return d.getUTCFullYear()===p[0]&&d.getUTCMonth()+1===p[1]&&d.getUTCDate()===p[2];
  }
  function validJst(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(s)||
       !validDay(s.slice(0,10)))return false;
    var d=new Date(s);
    return Number.isFinite(d.getTime())&&
      new Date(d.getTime()+9*3600000).toISOString().slice(0,19)===s.slice(0,19);
  }
  function scopeOf(x){
    required(obj(x)&&['lab_a','lab_b'].includes(x.store_id)&&
      ['fictional_rice','fictional_bread'].includes(x.category_id)&&
      Number.isInteger(x.trip)&&x.trip>=1&&x.trip<=3,'fictional_scope_required');
    return {store:x.store_id,category:x.category_id,trip:x.trip};
  }
  function coverage(scope,day,x){
    if(x===undefined)return {store:scope.store,category:scope.category,
      start_day:day,end_day:day};
    required(obj(x)&&x.store===scope.store&&
      (x.category===scope.category||x.category===null)&&
      validDay(x.start_day)&&validDay(x.end_day)&&x.start_day<=x.end_day,
      'invalid_explicit_coverage');
    return {store:x.store,category:x.category,start_day:x.start_day,end_day:x.end_day};
  }
  function recordRef(snapshotId,raw){
    required(obj(raw)&&raw.snapshot_id===snapshotId&&
      Array.isArray(raw.local_locator)&&raw.local_locator.length>0&&
      raw.local_locator.every(nonblank)&&
      (raw.source_id===undefined||raw.source_id===null||nonblank(raw.source_id)),
      'invalid_record_ref');
    return {snapshot_id:snapshotId,local_locator:raw.local_locator.slice(),
      source_id:raw.source_id===undefined?null:raw.source_id};
  }
  function syntheticRef(snapshotId,day,label){
    return {snapshot_id:snapshotId,local_locator:['bridge','target',day,label],source_id:null};
  }
  function evidencePart(part,scope,day,id,defaults){
    if(part===undefined){
      var fallback={state:defaults.state,
        coverage:coverage(scope,day),ref:syntheticRef(id,day,defaults.name),known_at:null};
      if(defaults.isCalendar)fallback.version=defaults.version;
      return fallback;
    }
    required(obj(part)&&defaults.allowed.includes(part.state)&&
      (part.known_at===null||validJst(part.known_at)),
      'invalid_target_evidence');
    var item={state:part.state,coverage:coverage(scope,day,part.coverage),
      ref:recordRef(id,part.record_ref),known_at:part.known_at};
    if(defaults.isCalendar){
      required(part.version===null||nonblank(part.version),'invalid_calendar_version');
      item.version=part.version;
    }
    return item;
  }
  function registry(ledger,part,scope,day,snapshotId){
    if(part===undefined)return {ledger:ledger,read_state:'unavailable',
      coverage:coverage(scope,day),
      ref:syntheticRef(snapshotId,day,'registry-'+ledger),known_at:null,
      records:[],omission_rule:null};
    required(obj(part)&&part.ledger===ledger&&
      ['ok','omitted','unavailable','invalid'].includes(part.read_state)&&
      (part.known_at===null||validJst(part.known_at))&&
      Array.isArray(part.records)&&
      (part.read_state==='ok'||part.records.length===0)&&
      (part.omission_rule===null||nonblank(part.omission_rule))&&
      (part.read_state==='omitted'||part.omission_rule===null),
      'invalid_target_registry');
    var seen=[];
    var records=part.records.map(function(item){
      required(obj(item)&&EVENT_TYPES.includes(item.event_type)&&
        ['applies','not_applies','unknown','conflict'].includes(item.applicability)&&
        (item.known_at===null||validJst(item.known_at)),'invalid_target_registry_item');
      return {event_type:item.event_type,applicability:item.applicability,
        ref:recordRef(snapshotId,item.record_ref),known_at:item.known_at};
    });
    return {ledger:ledger,read_state:part.read_state,
      coverage:coverage(scope,day,part.coverage),
      ref:recordRef(snapshotId,part.record_ref),known_at:part.known_at,
      records:records,omission_rule:part.omission_rule};
  }
  function toConditionInputDTO(envelope,targetEvidence){
    required(obj(envelope)&&envelope.kind==='FICTIONAL'&&
      envelope.schema_version===INPUT_VERSION&&obj(envelope.scope)&&
      obj(envelope.snapshot),'invalid_insight_envelope');
    var scope=scopeOf(envelope.scope);
    required(nonblank(envelope.request_id)&&nonblank(envelope.snapshot.snapshot_id)&&
      validDay(envelope.target_day)&&validJst(envelope.issued_at)&&
      validJst(envelope.snapshot.captured_at)&&
      ['current_snapshot','historical_replay'].includes(envelope.purpose)&&
      (envelope.purpose==='historical_replay'||
        envelope.snapshot.captured_at<=envelope.issued_at),
      'invalid_request_metadata');
    required(envelope.snapshot.pending===false&&envelope.snapshot.held===false&&
      envelope.snapshot.conflict===false&&
      Array.isArray(envelope.history)&&envelope.history.every(function(row){
        if(!obj(row)||!obj(row.scope)||!validDay(row.date)||row.date>=envelope.target_day)return false;
        return row.scope.store_id===scope.store&&
          row.scope.category_id===scope.category&&row.scope.trip===scope.trip;
      }),'invalid_snapshot_or_history');
    var day=envelope.target_day,id=envelope.snapshot.snapshot_id,explicit=targetEvidence!==undefined;
    if(explicit){
      required(obj(targetEvidence)&&targetEvidence.kind==='FICTIONAL_TARGET_EVIDENCE_V0'&&
        targetEvidence.target_day===day&&obj(targetEvidence.scope)&&
        targetEvidence.scope.store_id===scope.store&&
        targetEvidence.scope.category_id===scope.category&&
        targetEvidence.scope.trip===scope.trip&&
        obj(targetEvidence.calendar)&&obj(targetEvidence.sale)&&
        obj(targetEvidence.event)&&obj(targetEvidence.registries)&&
        obj(targetEvidence.policy),'target_evidence_scope_or_shape');
    }
    var e=explicit?targetEvidence:{},pol=e.policy||{};
    var allowed=pol.allowed_omission_rules===undefined?[]:pol.allowed_omission_rules;
    required(Array.isArray(allowed)&&
      allowed.every(function(x){return x===ALLOWED_OMISSION;})&&
      new Set(allowed).size===allowed.length,'unsupported_omission_policy');
    var calendar=evidencePart(e.calendar,scope,day,id,{
      name:'calendar',state:'unknown',version:null,isCalendar:true,
      allowed:['holiday','non_holiday','unknown','conflict']});
    var sale=evidencePart(e.sale,scope,day,id,{
      name:'sale-confirmation',state:'unknown',
      allowed:['confirmed_present','confirmed_absent','unknown','conflict']});
    var event=evidencePart(e.event,scope,day,id,{
      name:'event-confirmation',state:'unknown',
      allowed:['confirmed_present','confirmed_absent','unknown','conflict']});
    var common=registry('common',e.registries&&e.registries.common,scope,day,id);
    var store=registry('store',e.registries&&e.registries.store,scope,day,id);
    var refs=[calendar.ref,sale.ref,event.ref,common.ref,store.ref];
    common.records.concat(store.records).forEach(function(item){refs.push(item.ref);});
    required(new Set(refs.map(function(r){return JSON.stringify(r.local_locator);})).size===refs.length,
      'duplicate_record_ref');
    return {
      request:{kind:'FICTIONAL',schema_version:OUTPUT_VERSION,
        request_id:envelope.request_id,snapshot_id:id,
        captured_at:envelope.snapshot.captured_at,scope:scope,
        target_day:day,issued_at:envelope.issued_at,purpose:envelope.purpose},
      policy:{id:POLICY.id,version:POLICY.version,
        event_mapping:POLICY.event_mapping,allowed_omission_rules:allowed.slice()},
      calendar:calendar,sale:sale,event:event,registries:[common,store]
    };
  }
  var api={INPUT_VERSION:INPUT_VERSION,OUTPUT_VERSION:OUTPUT_VERSION,
    toConditionInputDTO:toConditionInputDTO};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.InsightFictionalConditionBridgePrototype=api;
})(typeof window!=='undefined'?window:globalThis);
