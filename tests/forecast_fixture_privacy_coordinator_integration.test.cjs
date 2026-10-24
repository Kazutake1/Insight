'use strict';
/*
 * S03/S04 SYNTHETIC-only integration of the exact Git blobs from STEP4 PR #218
 * with the fictional privacy handoff from PR #229.
 * This is NOT a real Normalizer, Storage adapter, UI binding, model or network.
 * Privacy projection does not authorize model execution.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureSnapshotReader}=require('../insight_forecast_fixture_snapshot_reader_v0.js');
const {createFixtureRequestCoordinator}=require('../insight_forecast_fixture_request_coordinator_v0.js');
const {projectFictionalNormalizerForLocalAI}=require('../insight_forecast_fictional_privacy_handoff_v0.js');

const SECRET='SYNTHETIC_PRIVATE_CANARY_NO_REAL_DATA';
const SCOPE={store_id:'lab_a',category_id:'fictional_rice',trip:1};
const TARGET='2026-10-25',ISSUED='2026-10-24T10:59:00+09:00';
function request(){
  return {scope:{...SCOPE},target_day:TARGET,request_issued_at:ISSUED,
    manual_target:false,purpose:'current_snapshot',history_days:42};
}
function source(){
  const state={pending:0,held:false,conflict:false,report_revision:2,
    raw_fingerprint:'synthetic-stable-raw',
    versions:{weather:'wx1',calendar:'cal1',registry:'reg1',policy:'pol1'}};
  const payload={history:[{scope:{...SCOPE},day:'2026-10-23',
    sales:{state:'entered',value:0},delivery:{state:'missing',value:null},
    weather:{known_at:null,private_location:SECRET}}],
    target_evidence:{scope:{...SCOPE},day:TARGET,
      sale:'unknown',event:'unknown',calendar:'unknown',known_at:null}};
  return {fixture:true,state,payload,
    inspect(){return structuredClone(state);},
    readFixture(){return structuredClone(payload);}};
}
function normalizedFromFakeReader(snapshot){
  // Minimal synthetic Normalizer-shaped envelope; no real STEP4 Normalizer use.
  // The only day/scope/metrics here come from the Reader's synthetic rows.
  return {kind:'FICTIONAL',schema_version:'fictional-insight-input-v0',
    purpose:'current_snapshot',scope:{...snapshot.request.scope},
    target_day:snapshot.request.target_day,issued_at:snapshot.request.request_issued_at,
    snapshot:{snapshot_id:snapshot.snapshot_id,pending:false,held:false,conflict:false},
    history:snapshot.history.map(r=>({date:r.day,scope:{...r.scope},
      sales:{...r.sales,record_ref:{source_id:SECRET}},
      delivery:{...r.delivery,record_ref:{source_id:SECRET}},
      trip_resolution:{status:'active',source:'current',tentative:false,
        needsDateReview:false,conflict:false,issue:null},
      weather:{kind:'saved_unspecified',weather_text:SECRET,location:SECRET,
        temp_max:{state:'unknown',value:null},
        temp_min:{state:'unknown',value:null},available_at:null},
      holiday:{state:'unknown'},registries:[],
      condition_eligibility:'not_evaluated',staff_name:SECRET})),
    raw_storage:SECRET,token:SECRET};
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
function privacyProbe(snapshot){
  const handoff=projectFictionalNormalizerForLocalAI(normalizedFromFakeReader(snapshot));
  assert.equal(handoff.authorized_for_model,false);
  assert.equal(handoff.provenance_verified,false);
  assert.equal(handoff.slice.processing,'LOCAL_ONLY');
  assert.equal(handoff.slice.anonymity,'NOT_GUARANTEED');
  const serialized=JSON.stringify(handoff);
  assert.equal(serialized.includes(SECRET),false);
  assert.equal(serialized.includes('2026-10-23'),false);
  assert.equal(serialized.includes('snapshot_id'),false);
  return handoff;
}

test('S03: actual fictional Reader/Coordinator can carry a non-authorizing privacy probe',async()=>{
  const reader=createFixtureSnapshotReader(source());
  const coord=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session',
    evaluate(snapshot){return {kind:'FICTIONAL_PROBE_ONLY',handoff:privacyProbe(snapshot)};}
  });
  const reply=await coord.request(request());
  assert.equal(reply.accepted,true,'Coordinator acceptance proves freshness, not forecast READY');
  assert.equal(reply.result.kind,'FICTIONAL_PROBE_ONLY');
  assert.equal(reply.result.handoff.authorized_for_model,false);
  assert.deepEqual(reply.result.handoff.slice.rows[0].sales,{state:'entered',value:0});
  assert.deepEqual(reply.result.handoff.slice.rows[0].delivery,{state:'missing',value:null});
  assert.equal(JSON.stringify(reply.result).includes(SECRET),false);
  coord.dispose();
});

test('S03: A→B→A explicit UI invalidation discards an already projected, late probe',async()=>{
  const reader=createFixtureSnapshotReader(source()),late=deferred();
  let handoff;
  const coord=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session',
    evaluate(snapshot){handoff=privacyProbe(snapshot);return late.promise;}
  });
  const pending=coord.request(request());
  assert.equal(handoff.authorized_for_model,false);
  const startEpoch=coord.getEpoch();
  coord.invalidate('synthetic-select-store-B');
  coord.invalidate('synthetic-select-store-A');
  late.resolve({kind:'FICTIONAL_PROBE_ONLY',handoff});
  const outcome=await pending;
  assert.equal(outcome.accepted,false);
  assert.equal(outcome.freshness,'stale');
  assert.equal(outcome.result,undefined,'late probe and slice must not escape in reply');
  assert.equal(coord.getEpoch(),startEpoch+2);
  coord.dispose();
});

test('S03: changed synthetic storage revision invalidates probe without raw-text changes',async()=>{
  const fake=source(),reader=createFixtureSnapshotReader(fake),late=deferred();
  const coord=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session',
    evaluate(snapshot){return late.promise.then(()=>({
      kind:'FICTIONAL_PROBE_ONLY',handoff:privacyProbe(snapshot)}));}
  });
  const pending=coord.request(request());
  const raw=fake.state.raw_fingerprint;
  fake.state.report_revision++;
  late.resolve();
  const outcome=await pending;
  assert.equal(fake.state.raw_fingerprint,raw);
  assert.equal(outcome.accepted,false);
  assert.equal(outcome.freshness,'stale');
  assert.equal(outcome.result,undefined);
  coord.dispose();
});

test('S04: synthetic private exception is suppressed by actual fictional Coordinator',async()=>{
  const fake=source(),reader=createFixtureSnapshotReader(fake);
  const coord=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session',
    evaluate(snapshot){
      privacyProbe(snapshot);
      return Promise.reject(new Error(SECRET));
    }
  });
  const reply=await coord.request(request());
  assert.equal(reply.accepted,false);
  assert.equal(reply.reason,'evaluation_failed_or_aborted');
  assert.equal(reply.result,undefined);
  assert.equal(JSON.stringify(reply).includes(SECRET),false);
  coord.dispose();
});
