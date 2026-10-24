'use strict';
/*
 * B01-B11: fictional trip-group / immutable adoption-context contract.
 * Uses only fabricated stores, categories, timestamps and evidence.
 * No production wiring, real storage, network or forecast model invocation.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFictionalTripGroup,assessFictionalTemporalEvidence}=
  require('../insight_forecast_fixture_trip_group_v0.js');
const {createFixtureSnapshotReader}=
  require('../insight_forecast_fixture_snapshot_reader_v0.js');
const {createFixtureRequestCoordinator}=
  require('../insight_forecast_fixture_request_coordinator_v0.js');
const forecast=require('../insight_order_forecast_v1.js');
const CANARY='SYNTHETIC_PRIVATE_CANARY_NEVER_PUBLISH';
function spec(overrides={}){
  return {fixture:true,group_id:'fictional-group-1',
    session_id:'fictional-session-1',snapshot_id:'fictional-snapshot-1',
    store_id:'lab_a',category_id:'fictional_rice',target_day:'2026-10-25',
    issued_at:'2026-10-24T10:59:00+09:00',manual_target:false,
    purpose:'current_snapshot',ui_epoch:7,history_days:42,trips:[1,2,3],
    source_versions:{weather:'fictional-wx-1',calendar:'fictional-cal-1',
      registry:'fictional-reg-1',policy:'fictional-pol-1',
      adapter:'fictional-adapter-1',contract:'fictional-contract-1',
      model:'fictional-model-1'},...overrides};
}
function observed(s){
  return {session_id:s.session_id,snapshot_id:s.snapshot_id,
    store_id:s.store_id,category_id:s.category_id,
    target_day:s.target_day,manual_target:s.manual_target,
    ui_epoch:s.ui_epoch,source_versions:{...s.source_versions}};
}
function reply(child,s,status='READY',value=0){
  return {session_id:s.session_id,request_id:child.context.request_id,
    snapshot_id:s.snapshot_id,ui_epoch:s.ui_epoch,issued_at:s.issued_at,
    purpose:s.purpose,target_day:s.target_day,manual_target:s.manual_target,
    scope:{...child.context.scope},source_versions:{...s.source_versions},
    status,value};
}
function deferred(){
  let resolve;
  const promise=new Promise(res=>{resolve=res;});
  return {promise,resolve};
}

test('B01: no implicit first trip/all trips; reject duplicates, booleans, floats and strings',()=>{
  for(const trips of [undefined,[],[1,1],[0],[4],[true],[false],['1'],[1.5],
    [1,2,2],[1,2,3,1]]){
    assert.throws(()=>createFictionalTripGroup(spec({trips})),
      /invalid_fictional_trip_contract/);
  }
  const selected=createFictionalTripGroup(spec({trips:[2,3]}));
  assert.deepEqual(selected.children.map(c=>c.context.scope.trip),[2,3]);
  assert.equal(selected.children.some(c=>c.context.scope.trip===1),false);
});
test('B02: strict fictional IDs and temporal metadata; no real IDs or silent horizon rewrite',()=>{
  for(const change of [
    {store_id:'real-store'},{category_id:'real-category'},
    {issued_at:'2026-10-24T10:59:00Z'},{issued_at:'2026-10-24T25:00:00+09:00'},
    {target_day:'2026-02-29'},{manual_target:undefined},{purpose:'unexpected'},
    {session_id:''},{ui_epoch:-1},{ui_epoch:1.5},{snapshot_id:null}
  ]){
    assert.throws(()=>createFictionalTripGroup(spec(change)),
      /invalid_fictional_trip_contract/);
  }
  const farDay='2026-11-01';
  const s=spec({target_day:farDay,manual_target:true});
  const parent=createFictionalTripGroup(s);
  assert.equal(parent.children[0].reader_request.target_day,farDay);
  // This fixture preserves a manual date; the existing lab engine's 1-3-day
  // horizon is a separate experimental constraint, NOT silently coerced.
});
test('B03: immutable one-trip child contexts, unique IDs, and exact Reader request fields',()=>{
  const s=spec(),g=createFictionalTripGroup(s);
  assert.equal(g.children.length,3);
  assert.equal(new Set(g.children.map(c=>c.context.request_id)).size,3);
  for(const child of g.children){
    assert.equal(child.context.manual_target,s.manual_target);
    assert.equal(child.context.issued_at,s.issued_at);
    assert.equal(child.context.snapshot_id,s.snapshot_id);
    assert.equal(child.context.ui_epoch,s.ui_epoch);
    assert.equal(child.context.source_versions.model,s.source_versions.model);
    assert.deepEqual(Object.keys(child.reader_request).sort(),
      ['scope','target_day','request_issued_at','manual_target','purpose','history_days'].sort());
    assert.equal(Object.hasOwn(child.reader_request,'ui_epoch'),false);
    assert.equal(Object.isFrozen(child.context),true);
    assert.equal(Object.isFrozen(child.context.scope),true);
    assert.equal(Object.isFrozen(child.context.source_versions),true);
    assert.equal(Object.isFrozen(child.reader_request),true);
  }
  assert.equal(g.children[0].context.scope.trip,1);
  assert.equal(g.children[1].context.scope.trip,2);
  assert.equal(g.children[2].context.scope.trip,3);
});
test('B04: mixed READY/HELD/INACTIVE is per-trip; zero is not missing or held',()=>{
  const s=spec(),g=createFictionalTripGroup(s),live=observed(s);
  const states=[['READY',0],['HELD',null],['INACTIVE',null]];
  const items=g.children.map((child,i)=>
    g.adopt(child,reply(child,s,...states[i]),live));
  assert.deepEqual(items.map(x=>x.status),['READY','HELD','INACTIVE']);
  assert.deepEqual(items.map(x=>x.value),[0,null,null]);
  assert.equal(items.every(x=>x.accepted&&x.authorized_for_model===false),true);
  const view=g.view(items);
  assert.equal(view.kind,'FICTIONAL_TRIP_GROUP_ONLY');
  assert.equal(view.daily_total,null);
  assert.equal(view.daily_total_confirmed,false);
  assert.equal(view.authorized_for_model,false);
  assert.equal(view.provenance_verified,false);
});
test('B05: incomplete, misplaced, fabricated or malformed child replies are not adopted',()=>{
  const s=spec(),g=createFictionalTripGroup(s),live=observed(s);
  const a=g.children[0],b=g.children[1];
  for(const patch of [
    {request_id:b.context.request_id},{session_id:'other'},
    {snapshot_id:'other'},{issued_at:'2026-10-24T10:00:00+09:00'},
    {ui_epoch:8},{manual_target:true},{target_day:'2026-10-26'},
    {purpose:'historical_replay'},{scope:{...a.context.scope,trip:2}},
    {source_versions:{...s.source_versions,model:'new-model'}},
    {status:'READY',value:null},{status:'HELD',value:0},
    {status:'INACTIVE',value:0},{status:'UNKNOWN',value:null}
  ]){
    const out=g.adopt(a,{...reply(a,s),...patch},live);
    assert.equal(out.accepted,false);
    assert.equal(out.freshness,'stale');
    assert.equal(out.authorized_for_model,false);
    assert.equal(JSON.stringify(out).includes(CANARY),false);
  }
  const one=g.adopt(a,reply(a,s),live);
  assert.equal(g.view([one]).accepted,false,'partial group is not a daily result');
  assert.equal(g.view([one,one,one]).accepted,false,'duplicate child is not a group');
});
test('B06: same-day explicit manual choice is part of context, not inferred from date',()=>{
  const automatic=spec({trips:[1]}),manual=spec({trips:[1],manual_target:true});
  const a=createFictionalTripGroup(automatic),m=createFictionalTripGroup(manual);
  assert.equal(a.children[0].reader_request.target_day,m.children[0].reader_request.target_day);
  assert.equal(a.children[0].reader_request.manual_target,false);
  assert.equal(m.children[0].reader_request.manual_target,true);
  assert.equal(a.adopt(a.children[0],reply(a.children[0],automatic),
    observed({...automatic,manual_target:true})).accepted,false);
  assert.equal(m.adopt(m.children[0],reply(m.children[0],manual),observed(manual)).accepted,true);
});
test('B07: A-to-B-to-A events revoke all siblings even if the view reverts',()=>{
  const s=spec(),g=createFictionalTripGroup(s),live=observed(s);
  const first=g.children.map(c=>g.adopt(c,reply(c,s),live));
  assert.equal(first.every(x=>x.accepted),true);
  const firstEpoch=g.getEpoch();
  g.invalidate('fictional-store-B');
  g.invalidate('fictional-store-A');
  assert.equal(g.getEpoch(),firstEpoch+2);
  for(const child of g.children){
    const old=g.adopt(child,reply(child,s),live);
    assert.equal(old.accepted,false);
    assert.equal(old.freshness,'stale');
  }
  assert.equal(g.view(first).accepted,false,'cached replies cannot resurrect');
});
test('B08: actual 11 AM JST boundary is checked at adoption, not only at issue',()=>{
  const before=new Date('2026-10-24T01:59:00Z');
  const after=new Date('2026-10-24T02:00:00Z');
  assert.equal(forecast.defaultDelivery(before),'2026-10-25');
  assert.equal(forecast.defaultDelivery(after),'2026-10-26');
  const s=spec({trips:[1]}),g=createFictionalTripGroup(s);
  const stillOld=observed(s);
  stillOld.target_day=forecast.defaultDelivery(after);
  assert.equal(g.adopt(g.children[0],reply(g.children[0],s),stillOld).accepted,false);
  const manual=spec({trips:[1],manual_target:true});
  const gm=createFictionalTripGroup(manual);
  assert.equal(gm.adopt(gm.children[0],reply(gm.children[0],manual),
    observed(manual)).accepted,true,'manual selection retains its target day');
});
test('B09: version absence or mutation blocks; epoch overflow requires new session',()=>{
  const s=spec({trips:[2]}),g=createFictionalTripGroup(s),child=g.children[0];
  for(const key of Object.keys(s.source_versions)){
    const changed=observed(s);
    changed.source_versions[key]+='-v2';
    assert.equal(g.adopt(child,reply(child,s),changed).accepted,false,key);
    const omitted={...s.source_versions};delete omitted[key];
    assert.throws(()=>createFictionalTripGroup(spec({source_versions:omitted})),
      /invalid_fictional_trip_contract/);
  }
  const atLimit=spec({ui_epoch:Number.MAX_SAFE_INTEGER,trips:[1]});
  const full=createFictionalTripGroup(atLimit);
  assert.equal(full.invalidate('fictional-renew-session'),null);
  assert.equal(full.isCurrent(full.children[0],observed(atLimit)),false);
});
test('B10: unknown/future known_at and candidate-only absence never become verified input',()=>{
  const issued='2026-10-24T10:59:00+09:00';
  const eligible=assessFictionalTemporalEvidence({
    confirmed:true,candidate:false,known_at:'2026-10-23T12:00:00+09:00'},issued);
  assert.equal(eligible.eligible,true);
  for(const evidence of [
    {confirmed:true,candidate:false,known_at:null},
    {confirmed:true,candidate:false,known_at:issued.replace('10:59','11:00')},
    {confirmed:false,candidate:true,known_at:'2026-10-23T12:00:00+09:00'},
    {confirmed:false,candidate:false,known_at:'2026-10-23T12:00:00+09:00'},
    {confirmed:true,candidate:true,known_at:'2026-10-23T12:00:00+09:00'},
    {confirmed:true,candidate:false,known_at:undefined}
  ]){
    const r=assessFictionalTemporalEvidence(evidence,issued);
    assert.equal(r.eligible,false);
    assert.equal(r.reason,'unverified_or_unknown_time');
  }
  // A current_snapshot condition candidate is not a numerical forecast
  // Context.event=false, holiday=false or a fabricated known_at timestamp.
});
test('B11: existing real fixture Reader and Coordinator accept only independent trip requests',async()=>{
  const s=spec({trips:[2,3]}),g=createFictionalTripGroup(s);
  const source={fixture:true,
    inspect(){return {pending:0,held:false,conflict:false,report_revision:1,
      raw_fingerprint:'fictional-raw',versions:s.source_versions};},
    readFixture(){return {history:[],target_evidence:null};}};
  const reader=createFixtureSnapshotReader(source);
  const generated=[];
  const coordinator=createFixtureRequestCoordinator({
    reader,session_id:'fictional-coord',
    evaluate(snapshot){generated.push(snapshot.request.scope.trip);
      return {kind:'FICTIONAL_PROBE_ONLY',authorized_for_model:false};}
  });
  const results=[];
  for(const child of g.children){
    const result=await coordinator.request(child.reader_request);
    assert.equal(result.accepted,true,'fixture freshness only');
    assert.equal(result.result.authorized_for_model,false);
    results.push(result);
  }
  assert.deepEqual(generated,[2,3]);
  assert.equal(new Set(results.map(r=>r.context.request_id)).size,2);
  coordinator.dispose();
});
