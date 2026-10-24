'use strict';
/*
 * S03/S04 SYNTHETIC-only integration of the exact Git blobs from STEP4 PR #218
 * with the fictional privacy handoff from PR #229.
 * This is NOT a real Normalizer, Storage adapter, UI binding, model or network.
 * Privacy projection does not authorize model execution.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
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


/*
 * STEP4 G1/G2/G8 observations against the ACTUAL InsightStorage/OrderForecast
 * source, loaded exclusively in a sandbox with fictional localStorage values.
 * This is test-only verification of missing production preflight contracts.
 * Nothing writes to browser storage, and there is no production UI adapter.
 */
function syntheticStorageRuntime(){
  const initial=JSON.stringify({schemaVersion:1,current:'lab_a',
    stores:{lab_a:{value:0}}});
  const values=new Map([['insight_v11',initial]]),events=new Map();
  const live={schemaVersion:1,current:'lab_a',stores:{lab_a:{value:0}}};
  const root={
    SK:'insight_v11',
    localStorage:{
      getItem(k){return values.has(k)?values.get(k):null;},
      setItem(k,v){values.set(k,String(v));}
    },
    addEventListener(event,handler){events.set(event,handler);}
  };
  const ctx={window:root,globalThis:root,SK:'insight_v11',allStores:live,JSON,Error,console};
  vm.createContext(ctx);
  const sourceText=fs.readFileSync(path.join(__dirname,'..','insight_storage_v1.js'),'utf8');
  vm.runInContext(sourceText,ctx);
  return {storage:root.InsightStorage,root,values,events,live};
}
test('G2: actual InsightStorage reportState misses unsaved UI edits even when its flags are clear',()=>{
  const fixture=syntheticStorageRuntime(),storage=fixture.storage;
  const before={...storage.reportState()};
  assert.deepEqual(before,{revision:0,pending:0,held:false,conflict:false});
  fixture.live.stores.lab_a.value=19;
  const after={...storage.reportState()};
  assert.deepEqual(after,before,'No save event means reportState does not change');
  assert.equal(storage.readSnapshot().stores.lab_a.value,0);
  assert.notEqual(JSON.stringify(fixture.live),JSON.stringify(storage.readSnapshot()));
  assert.equal(fixture.values.get('insight_v11').includes('"value":19'),false);
  // Production Reader MUST separately attest live UI versus raw persisted data.
});

test('G8: actual InsightStorage save generation revokes a pending fictional privacy response',async()=>{
  const fixture=syntheticStorageRuntime(),fake=source(),late=deferred();
  const reader=createFixtureSnapshotReader({
    fixture:true,
    inspect(){
      const state=fixture.storage.reportState();
      return {pending:state.pending,held:state.held,conflict:state.conflict,
        report_revision:state.revision,
        raw_fingerprint:'static-synthetic-label-only',versions:fake.state.versions};
    },
    readFixture(){return structuredClone(fake.payload);}
  });
  const coordinator=createFixtureRequestCoordinator({
    reader,session_id:'fictional-saved-generation',
    evaluate(snapshot){privacyProbe(snapshot);return late.promise;}
  });
  const pending=coordinator.request(request());
  const first=fixture.storage.reportState().revision;
  fixture.storage.writeSnapshot({schemaVersion:1,current:'lab_a',
    stores:{lab_a:{value:1}}});
  assert.ok(fixture.storage.reportState().revision>first);
  late.resolve({kind:'FICTIONAL_PROBE_ONLY',value:SECRET});
  const result=await pending;
  assert.equal(result.accepted,false);
  assert.equal(result.freshness,'stale');
  assert.equal(result.result,undefined);
  assert.equal(JSON.stringify(result).includes(SECRET),false);
  coordinator.dispose();
});

test('G8: actual InsightStorage external storage event marks conflict even if raw returns to original',()=>{
  const fixture=syntheticStorageRuntime();
  const original=fixture.values.get('insight_v11');
  const external=JSON.stringify({schemaVersion:1,current:'lab_a',
    stores:{lab_a:{value:4}}});
  fixture.values.set('insight_v11',external);
  fixture.events.get('storage')({key:'insight_v11',newValue:external});
  assert.equal(fixture.storage.reportState().conflict,true);
  fixture.values.set('insight_v11',original);
  fixture.events.get('storage')({key:'insight_v11',newValue:original});
  assert.equal(fixture.storage.readSnapshot().stores.lab_a.value,0);
  assert.equal(fixture.storage.reportState().conflict,true);
  // A same-value restore is not a reason to resurrect a prior snapshot.
});

test('G1: real OrderForecast exposes 11:00 boundary but not genuine manual selection intent',()=>{
  const forecast=require('../insight_order_forecast_v1.js');
  assert.equal(forecast.defaultDelivery(new Date('2026-10-24T01:59:00Z')),'2026-10-25');
  assert.equal(forecast.defaultDelivery(new Date('2026-10-24T02:00:00Z')),'2026-10-26');
  const sourceText=fs.readFileSync(path.join(__dirname,'..','insight_order_forecast_v1.js'),'utf8');
  assert.match(sourceText,/autoDelivery=true/);
  assert.match(sourceText,/autoDelivery=false;state\.delivery=e\.target\.value/);
  assert.match(sourceText,/model\.getState=function\(\)\{return Object\.assign\(\{\},state\);\}/);
  // This is source inspection; no running UI event provenance is attested.
});
