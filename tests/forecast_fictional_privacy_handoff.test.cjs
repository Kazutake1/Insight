'use strict';
/*
 * S01/S02 fictional Normalizer-shaped handoff checks.
 * No actual InsightStorage or production Normalizer is imported: this is a
 * shape-only contract. The real STEP4 prototype remains in separate PR #221.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {projectFictionalNormalizerForLocalAI}=require('../insight_forecast_fictional_privacy_handoff_v0.js');
const SECRET='PRIVATE_SHOP_ID_AND_ADDRESS';
const SCOPE={store_id:'lab_a',category_id:'fictional_rice',trip:1};
function row(date,sales,delivery){
  return {date,scope:{...SCOPE},
    sales:{state:'entered',value:sales,record_ref:{source_id:SECRET}},
    delivery:delivery===null?{state:'missing',value:null}:{state:'entered',value:delivery},
    trip_resolution:{status:'active',source:'current',tentative:false,
      needsDateReview:false,conflict:false,issue:null,record_ref:{source_id:SECRET}},
    weather:{kind:'saved_unspecified',weather_text:'PRIVATE_WEATHER',
      location:SECRET,temp_max:{state:'entered',value:0},
      temp_min:{state:'entered',value:-2},temperature_pair_state:'valid',
      available_at:null,record_ref:{source_id:SECRET}},
    holiday:{state:'unknown',known_at:null},
    registries:[{ledger:'common',read_state:'ok',records:[],secret:SECRET}],
    condition_eligibility:'not_evaluated',staff_name:SECRET,raw_note:SECRET};
}
function input(){
  return {kind:'FICTIONAL',schema_version:'fictional-insight-input-v0',
    scope:{...SCOPE},purpose:'current_snapshot',
    target_day:'2026-10-25',issued_at:'2026-10-24T10:59:00+09:00',
    snapshot:{pending:false,held:false,conflict:false,
      snapshot_id:'PRIVATE_SNAPSHOT',raw_fingerprint:SECRET},
    history:[row('2026-10-17',0,null),row('2026-10-18',15,20)],
    raw_storage:SECRET,token:SECRET,forecast_status:'READY'};
}
const project=(data)=>projectFictionalNormalizerForLocalAI(data);

test('S01: projection is an immutable, non-authorizing allowlist and keeps explicit zero vs missing',()=>{
  const source=input(),unchanged=JSON.stringify(source),out=project(source),text=JSON.stringify(out);
  assert.equal(out.schema,'fictional-privacy-handoff-v0');
  assert.equal(out.provenance_verified,false);
  assert.equal(out.authorized_for_model,false);
  assert.equal(out.slice.processing,'LOCAL_ONLY');
  assert.equal(out.slice.anonymity,'NOT_GUARANTEED');
  assert.deepEqual(out.slice.scope,{store_alias:'store_1',category_alias:'category_1',trip:1});
  assert.deepEqual(out.slice.rows.map(r=>[r.sales.state,r.sales.value,r.delivery.state,r.delivery.value]),[
    ['entered',0,'missing',null],['entered',15,'entered',20]]);
  assert.deepEqual(out.slice.rows.map(r=>[r.weekday,r.month]),[[6,10],[7,10]]);
  assert.equal(JSON.stringify(source),unchanged);
  assert.ok(Object.isFrozen(out));
  assert.ok(Object.isFrozen(out.slice.rows[0]));
  for(const hidden of [SECRET,'PRIVATE_','2026-10-17','2026-10-18',
    'raw_fingerprint','snapshot_id','record_ref','staff_name','location','READY','token']){
    assert.equal(text.includes(hidden),false,hidden);
  }
});
test('S02: unsourced weather and condition registers never imply observed weather or known absence',()=>{
  const out=project(input());
  for(const r of out.slice.rows){
    assert.equal(r.weather_kind,'unknown');
    assert.deepEqual(r.temp_max,{state:'unknown',value:null});
    assert.deepEqual(r.temp_min,{state:'unknown',value:null});
    assert.equal(r.holiday,'unknown');
    assert.equal(r.sale,'unknown');
    assert.equal(r.event,'unknown');
    assert.deepEqual(r.customers,{state:'unknown',value:null});
  }
});
test('S01: wrong schema, non-fictional scope, target-day leakage, invalid order and overlong history fail closed',()=>{
  for(const change of [
    x=>{x.schema_version='fictional-snapshot-v0';},
    x=>{x.scope.store_id='real_customer_store';},
    x=>{x.scope.trip=0;},
    x=>{x.history[0].scope.store_id='lab_b';},
    x=>{x.history.reverse();},
    x=>{x.history[1].date=x.history[0].date;},
    x=>{x.history[1].date=x.target_day;},
    x=>{x.history=[];},
    x=>{x.history=Array.from({length:43},(_,i)=>row('2026-10-17',0,null));},
    x=>{x.purpose='historical_replay';},
    x=>{x.snapshot.conflict=true;},
    x=>{x.snapshot.pending=1;},
    x=>{x.target_day='2026-02-30';},
    x=>{x.issued_at='2026-10-24T25:59:00+09:00';}
  ]){
    const x=input();change(x);
    assert.throws(()=>project(x),/fictional_privacy_handoff_unavailable/);
  }
});
test('S01: invalid and non-integer quantities never turn into measured zero',()=>{
  for(const bad of [
    {state:'entered',value:-1},{state:'entered',value:1.5},
    {state:'entered',value:'0'},{state:'entered',value:NaN},
    {state:'missing',value:0},{state:'invalid',value:null},
    {state:'unknown',value:0}
  ]){
    const x=input();x.history[0].sales=bad;
    assert.throws(()=>project(x),/fictional_privacy_handoff_unavailable/);
  }
  const x=input();x.history[0].sales={state:'unknown',value:null};
  assert.deepEqual(project(x).slice.rows[0].sales,{state:'unknown',value:null});
});
test('S02: unresolved trip, unverified conditions and impossible temperatures are blocked',()=>{
  for(const change of [
    x=>{x.history[0].trip_resolution.status='inactive';},
    x=>{x.history[0].trip_resolution.status='unknown';},
    x=>{x.history[0].trip_resolution.tentative=true;},
    x=>{x.history[0].trip_resolution.needsDateReview=true;},
    x=>{x.history[0].trip_resolution.conflict=true;},
    x=>{x.history[0].trip_resolution.issue='monthly_basis_unavailable';},
    x=>{x.history[0].holiday.state='non_holiday';},
    x=>{x.history[0].condition_eligibility='confirmed_normal';},
    x=>{x.history[0].weather.kind='guessed_clear';},
    x=>{x.history[0].weather.temp_max={state:'invalid',value:null};},
    x=>{x.history[0].weather.temp_max.value=-50;},
    x=>{x.history[0].weather.temperature_pair_state='reversed';},
    x=>{x.history[0].weather.available_at='2026-10-26T09:00:00+09:00';}
  ]){
    const x=input();change(x);
    assert.throws(()=>project(x),/fictional_privacy_handoff_unavailable/);
  }
});
test('S02: no storage/network/worker/real Normalizer imports or leak-bearing errors',()=>{
  const file=fs.readFileSync(path.join(__dirname,'..','insight_forecast_fictional_privacy_handoff_v0.js'),'utf8');
  assert.doesNotMatch(file,/require\(['"]\.\/insight_forecast_input_normalizer_proto/);
  assert.doesNotMatch(file,/\b(?:fetch|XMLHttpRequest|WebSocket|Worker|localStorage|sessionStorage)\s*\(/);
  const x=input();x.history[0].sales={state:'invalid',value:SECRET};
  let error;try{project(x);}catch(e){error=e;}
  assert.equal(error.message,'fictional_privacy_handoff_unavailable');
  assert.equal(JSON.stringify(error).includes(SECRET),false);
});

test('S03 GAP: pure projection is not a freshness attestation after fake source or selection changes',()=>{
  const x=input();
  const fakeSource={epoch:7,raw_revision:13,selected_store:'lab_a'};
  const before=project(x);
  const initial={...fakeSource};
  fakeSource.selected_store='lab_b';
  fakeSource.selected_store='lab_a';
  fakeSource.epoch++;
  fakeSource.raw_revision++;
  const after=project(x);
  assert.deepEqual(after.slice,before.slice,'Projection has no source epoch identity');
  assert.equal(before.authorized_for_model,false);
  assert.equal(after.authorized_for_model,false);
  assert.notDeepEqual(fakeSource,initial,'An external freshness gate is required');
  // A successful shape projection MUST NOT be interpreted as an accepted READY.
});

test('S04: synthetic sensitive metadata never enters the projection, even for nested evidence',()=>{
  const x=input();
  const privateMarker='SYNTHETIC_PRIVATE_CANARY_92831';
  x.snapshot.private_token=privateMarker;
  x.history[0].sales.private_record={access_token:privateMarker};
  x.history[1].weather.private_location={address:privateMarker};
  x.history[1].registries.push({ledger:'store',secret:{staff:privateMarker}});
  x.history[0].private_notes=[{person:privateMarker}];
  const before=JSON.stringify(x),result=project(x);
  const output=JSON.stringify(result);
  assert.equal(output.includes(privateMarker),false);
  assert.equal(JSON.stringify(x),before,'Read-only projection must not mutate source');
  assert.equal(result.authorized_for_model,false);
  assert.equal(result.provenance_verified,false);
  // This is data minimization only, not runtime network/DOM/console monitoring.
});
