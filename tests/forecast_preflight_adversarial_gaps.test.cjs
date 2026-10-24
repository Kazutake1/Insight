'use strict';
/*
 * STEP4 G0-G9 adversarial GAP probes, with synthetic fixtures only.
 *
 * A passing GAP test documents a feature the fictional Reader/Coordinator
 * CANNOT prove; it is NOT evidence of production preflight or forecast READY.
 * No InsightStorage use, real store data, network, Worker or persistence.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dataHealth=require('../insight_data_health_v1.js');
const {createFixtureSnapshotReader,automaticTargetDay}=require('../insight_forecast_fixture_snapshot_reader_v0.js');
const {createFixtureRequestCoordinator}=require('../insight_forecast_fixture_request_coordinator_v0.js');

const scope=()=>({store_id:'lab_a',category_id:'fictional_rice',trip:1});
const req=(overrides={})=>({
  scope:scope(),target_day:'2026-10-25',
  request_issued_at:'2026-10-24T10:59:00+09:00',
  manual_target:false,purpose:'current_snapshot',history_days:42,
  ...overrides
});
function fakeSource(){
  const state={
    pending:0,held:false,conflict:false,report_revision:1,
    raw_fingerprint:'synthetic-saved-v1',
    versions:{weather:'wx1',calendar:'cal1',registry:'reg1',policy:'pol1'}
  };
  const payload={
    history:[{
      scope:scope(),day:'2026-10-23',
      sales:{state:'entered',value:0},
      delivery:{state:'missing',value:null},
      weather:{kind:'saved_unspecified',known_at:null}
    }],
    target_evidence:{
      scope:scope(),day:'2026-10-25',known_at:null,
      sale:'unknown',event:'unknown',calendar:'unknown'
    }
  };
  let reads=0;
  return {
    fixture:true,state,payload,get reads(){return reads;},
    inspect(){return structuredClone(state);},
    readFixture(){reads++;return structuredClone(payload);}
  };
}
function deferred(){
  let resolve;
  const promise=new Promise(r=>resolve=r);
  return {promise,resolve};
}
function syntheticYear(){
  const months={};
  for(let m=1;m<=12;m++){
    const n=new Date(Date.UTC(2026,m,0)).getUTCDate();
    months[m+'月']=Array.from({length:n},(_,i)=>({d:String(i+1),weather:''}));
  }
  return {
    current:'lab_a',
    stores:{lab_a:{name:'synthetic-lab',years:['2026'],data:{'2026':months}}},
    salesCountManagement:{categories:[{id:'fictional_rice',name:'synthetic'}]}
  };
}
function fakePreflight(saved,live,rawConfirmed){
  // Test-only PRECONDITION demonstration; production has no wired API.
  if(!rawConfirmed || JSON.stringify(saved)!==JSON.stringify(live))return 'CAPTURE_BLOCKED';
  const diag=dataHealth.check(structuredClone(saved));
  return diag.counts.errors>0 ? 'CAPTURE_BLOCKED' : 'CAPTURE_ELIGIBLE_NOT_READY';
}
test('G1 gap: caller can assert manual_target=true on automatic day; UI provenance is unverified',()=>{
  const src=fakeSource(),reader=createFixtureSnapshotReader(src);
  const automatic=reader.read(req());
  const claimedManual=reader.read(req({manual_target:true}));
  assert.equal(automatic.request.target_day,claimedManual.request.target_day);
  assert.equal(automatic.request.manual_target,false);
  assert.equal(claimedManual.request.manual_target,true);
  assert.equal(automaticTargetDay(req().request_issued_at),automatic.request.target_day);
  assert.equal(reader.isCurrent(claimedManual),true);
  // The boolean passes shape validation; no UI event identity is supplied.
});
test('G2 gap: identical fake report token cannot prove an unsaved live edit',()=>{
  const src=fakeSource(),reader=createFixtureSnapshotReader(src);
  const saved=syntheticYear(),live=structuredClone(saved);
  const before=reader.read(req());
  live.stores.lab_a.data['2026']['10月'][0].weather='synthetic-manual-edit';
  assert.equal(src.state.raw_fingerprint,'synthetic-saved-v1');
  assert.equal(reader.isCurrent(before),true);
  assert.equal(fakePreflight(saved,live,true),'CAPTURE_BLOCKED');
  assert.equal(fakePreflight(saved,saved,false),'CAPTURE_BLOCKED');
  assert.equal(src.reads,1);
});
test('G3: existing DataHealth catches swapped daily d; fictional Reader has no structural gate',()=>{
  const saved=syntheticYear(),live=structuredClone(saved);
  const rows=saved.stores.lab_a.data['2026']['10月'];
  [rows[16],rows[17]]=[rows[17],rows[16]];
  const diagnosis=dataHealth.check(saved);
  assert.ok(diagnosis.issues.some(x=>x.code==='daily_date_mismatch'&&x.severity==='error'));
  assert.equal(fakePreflight(saved,live,true),'CAPTURE_BLOCKED');
  const src=fakeSource(),reader=createFixtureSnapshotReader(src);
  assert.equal(reader.isCurrent(reader.read(req())),true);
  // This gap must be closed by a genuine same-snapshot preflight, NOT by Reader fixture metadata.
});
test('G3: complete synthetic shape can be structurally eligible but is not forecast READY',()=>{
  const saved=syntheticYear();
  assert.equal(dataHealth.check(saved).counts.errors,0);
  assert.equal(fakePreflight(saved,structuredClone(saved),true),'CAPTURE_ELIGIBLE_NOT_READY');
  const broken=structuredClone(saved);broken.stores.lab_a.years=[];
  assert.ok(dataHealth.check(broken).issues.some(x=>x.code==='years_empty'));
  assert.equal(fakePreflight(broken,broken,true),'CAPTURE_BLOCKED');
});
test('G6 gap: Reader checks future known_at, but not independently future available_at',()=>{
  const src=fakeSource();
  src.payload.history[0].weather.available_at='2026-10-26T10:00:00+09:00';
  const reader=createFixtureSnapshotReader(src);
  const snap=reader.read(req());
  assert.equal(snap.history[0].weather.available_at,'2026-10-26T10:00:00+09:00');
  src.payload.history[0].weather.known_at='2026-10-26T10:00:00+09:00';
  assert.throws(()=>reader.read(req()),/future_knowledge/);
  // No entitlement to historical-replay use follows from accepting available_at.
});
test('G5/G7 gap: arbitrary fake READY result passes Coordinator even with unknown conditions',async()=>{
  const src=fakeSource(),reader=createFixtureSnapshotReader(src);
  const coord=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session',
    evaluate:()=>({outcome:'completed',forecast:{status:'READY',value:99}})
  });
  const answer=await coord.request(req());
  assert.equal(answer.accepted,true);
  assert.equal(answer.result.forecast.status,'READY');
  assert.equal(src.payload.target_evidence.sale,'unknown');
  assert.equal(src.payload.target_evidence.event,'unknown');
  assert.equal(src.payload.target_evidence.calendar,'unknown');
  // This is an evaluator-supplied value, not a Coordinator's authorization/condition test.
});
test('G8/G9 gap: unreported UI A-B-A is invisible; explicit invalidate discards old response',async()=>{
  let selected='lab_a';
  const src=fakeSource(),reader=createFixtureSnapshotReader(src);
  const a=deferred();
  const coord=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session',
    evaluate:()=>a.promise
  });
  const old=coord.request(req());
  selected='lab_b';selected='lab_a';
  assert.equal(selected,req().scope.store_id);
  a.resolve({outcome:'completed',forecast:{status:'READY',value:1}});
  const unchecked=await old;
  assert.equal(unchecked.accepted,true,'Missing UI invalidate is a known unsafe gap');
  const b=deferred();
  const guarded=createFixtureRequestCoordinator({
    reader,session_id:'synthetic-session-guarded',evaluate:()=>b.promise
  });
  const pending=guarded.request(req());
  const before=guarded.getEpoch();
  guarded.invalidate('synthetic-ui-to-B');
  guarded.invalidate('synthetic-ui-back-to-A');
  b.resolve({outcome:'completed',forecast:{status:'READY',value:1}});
  const rejected=await pending;
  assert.equal(rejected.accepted,false);
  assert.equal(rejected.freshness,'stale');
  assert.equal(rejected.result,undefined);
  assert.equal(guarded.getEpoch(),before+2);
});
test('G8: weather/calendar/registry/policy version changes revoke an otherwise identical raw snapshot',async()=>{
  for(const field of ['weather','calendar','registry','policy']){
    const src=fakeSource(),reader=createFixtureSnapshotReader(src),wait=deferred();
    const coord=createFixtureRequestCoordinator({
      reader,session_id:'synthetic-session',evaluate:()=>wait.promise
    });
    const task=coord.request(req());
    const raw=src.state.raw_fingerprint;
    src.state.versions[field]+='-changed';
    wait.resolve({outcome:'completed',forecast:{status:'READY',value:1}});
    const result=await task;
    assert.equal(src.state.raw_fingerprint,raw);
    assert.equal(result.accepted,false,field);
    assert.equal(result.result,undefined,field);
    assert.equal(result.freshness,'stale',field);
  }
});
test('G0 boundary: synthetic fixture modules are not production-loaded storage/network adapters',()=>{
  const names=[
    'insight_forecast_fixture_snapshot_reader_v0.js',
    'insight_forecast_fixture_request_coordinator_v0.js',
    'insight_forecast_fixture_contract_handoff_v0.js'
  ];
  for(const name of names){
    const source=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    assert.doesNotMatch(source,/localStorage|InsightStorage\.readSnapshot|fetch\s*\(|XMLHttpRequest|WebSocket/);
  }
});
