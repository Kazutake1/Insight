'use strict';
/*
 * STEP4 OFFLINE FICTIONAL-ONLY integration:
 * real draft #213 normalizer (pinned blob e780491...) +
 * real draft #214 bridge (pinned blob 68c83f...) +
 * draft #218 reader/handoff checker.
 * Two independent fake sources assert the same synthetic facts. NEVER derive
 * an Insight-shaped saved snapshot from Reader.history or backfill evidence.
 * Do not include production storage, UI, network, worker, Python or evaluator.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const resolver=require('../insight_trip_history_resolver_v1.js');
const normalizer=require('../insight_forecast_input_normalizer_proto_v1.js');
const bridge=require('../insight_forecast_conditions_bridge_proto_v1.js');
const {createFixtureSnapshotReader}=require('../insight_forecast_fixture_snapshot_reader_v0.js');
const {validateFixtureHandoff}=require('../insight_forecast_fixture_contract_handoff_v0.js');
const SCOPE=Object.freeze({store_id:'lab_a',category_id:'fictional_rice',trip:1});
const TARGET='2026-10-24',ISSUED='2026-10-23T10:59:00+09:00';
const HISTORY=['2026-10-18','2026-10-19'];

function fictionalInsightSavedShape(){
  return {schemaVersion:1,current:'lab_a',
    salesCountManagement:{categories:[
      {id:'fictional_rice',name:'架空食品',aliases:[],activeTrips:[true,false,false],hidden:false}
    ]},
    eventManagement:{version:1,presets:[],events:[]},
    stores:{lab_a:{name:'架空テスト店',events:[],data:{},
      salesCounts:{
        '2026-10-18':{fictional_rice:{trips:[
          {delivery:0,sales:5},{delivery:null,sales:null},{delivery:null,sales:null}
        ]}},
        '2026-10-19':{fictional_rice:{trips:[
          {delivery:null,sales:0},{delivery:null,sales:null},{delivery:null,sales:null}
        ]}}
      }
    }}
  };
}
function fictionalReaderSource(){
  const state={pending:0,held:false,conflict:false,report_revision:2,
    raw_fingerprint:'fictional-no-real-data',
    versions:{calendar:null,weather:null,registry:null,policy:'fake-policy-v0'}};
  const payload={
    history:[
      {scope:{...SCOPE},day:'2026-10-18',
        sales:{state:'entered',value:5},delivery:{state:'entered',value:0},
        trip:{status:'active'},weather:{known_at:null}},
      {scope:{...SCOPE},day:'2026-10-19',
        sales:{state:'entered',value:0},delivery:{state:'missing',value:null},
        trip:{status:'active'},weather:{known_at:null}}
    ],
    target_evidence:{scope:{...SCOPE},day:TARGET,sale:'unknown',
      event:'unknown',calendar:'unknown',known_at:null}
  };
  return {fixture:true,state,payload,
    inspect(){return structuredClone(state);},
    readFixture(){return structuredClone(payload);}
  };
}
function targetEvidence(id){
  const coverage={store:'lab_a',category:'fictional_rice',start_day:TARGET,end_day:TARGET};
  const ref=(label)=>({snapshot_id:id,local_locator:['synthetic','target',TARGET,label],source_id:null});
  const part=(label,extras={})=>({state:'unknown',coverage,
    record_ref:ref(label),known_at:null,...extras});
  const registry=(ledger)=>({ledger,read_state:'unavailable',coverage,
    record_ref:ref('registry-'+ledger),known_at:null,records:[],omission_rule:null});
  return {kind:'FICTIONAL_TARGET_EVIDENCE_V0',scope:{...SCOPE},target_day:TARGET,
    calendar:part('calendar',{version:null}),
    sale:part('sale'),event:part('event'),
    registries:{common:registry('common'),store:registry('store')},
    policy:{allowed_omission_rules:[]}};
}
function createPipeline(){
  // The independent saved-shape and Reader's source are BOTH literal fake data.
  const saved=fictionalInsightSavedShape(),source=fictionalReaderSource();
  const reader=createFixtureSnapshotReader(source);
  const readerRequest={scope:{...SCOPE},target_day:TARGET,request_issued_at:ISSUED,
    manual_target:true,purpose:'current_snapshot',history_days:8};
  const snapshot=reader.read(readerRequest);
  const normalizedRequest={kind:'FICTIONAL',schema_version:normalizer.VERSION,
    scope:{...SCOPE},target_day:TARGET,issued_at:ISSUED,manual_target:true,
    purpose:'current_snapshot',history_days:HISTORY.slice()};
  const context={session_id:'fixture-session',request_id:'fixture-req-1',
    snapshot_id:snapshot.snapshot_id,captured_at:'2026-10-23T10:58:00+09:00',
    revision:2,today:'2026-10-23',storage:{pending:false,held:false,conflict:false},
    resolver};
  const envelope=normalizer.buildFictionalInput(saved,normalizedRequest,context);
  const target_evidence=targetEvidence(snapshot.snapshot_id);
  return {saved,source,reader,snapshot,normalizedRequest,context,envelope,target_evidence};
}
function runHandoff(data){
  const shape=validateFixtureHandoff(data);
  const dto=bridge.toConditionInputDTO(data.envelope,data.target_evidence);
  return {shape,dto};
}
test('I01: real draft Normalizer -> guard -> real draft Bridge pass explicit, independently supplied fake values',()=>{
  const data=createPipeline();
  const before=JSON.stringify(data.saved),sourceBefore=JSON.stringify(data.source.payload);
  const {shape,dto}=runHandoff(data);
  assert.equal(shape.compatible_shape,true);
  assert.equal(shape.provenance_verified,false);
  assert.equal(shape.history_count,2);
  assert.equal(dto.request.kind,'FICTIONAL');
  assert.equal(dto.request.schema_version,bridge.OUTPUT_VERSION);
  assert.equal(dto.request.snapshot_id,data.snapshot.snapshot_id);
  assert.equal(dto.request.issued_at,ISSUED);
  assert.deepEqual(dto.request.scope,{store:'lab_a',category:'fictional_rice',trip:1});
  assert.deepEqual(data.envelope.history.map(r=>[r.sales.state,r.sales.value,r.delivery.state,r.delivery.value]),[
    ['entered',5,'entered',0],['entered',0,'missing',null]
  ]);
  assert.equal(data.envelope.history[0].trip_resolution.status,'active');
  assert.equal(dto.calendar.state,'unknown');
  assert.equal(dto.sale.state,'unknown');
  assert.equal(dto.event.state,'unknown');
  assert.deepEqual(dto.registries.map(x=>x.read_state),['unavailable','unavailable']);
  assert.deepEqual(dto.policy.allowed_omission_rules,[]);
  assert.equal(JSON.stringify(data.saved),before);
  assert.equal(JSON.stringify(data.source.payload),sourceBefore);
});
test('I02: changed fake saved value vs unchanged Reader is detected, including explicit zero',()=>{
  for(const modify of [
    s=>{s.stores.lab_a.salesCounts['2026-10-18'].fictional_rice.trips[0].sales=6;},
    s=>{s.stores.lab_a.salesCounts['2026-10-18'].fictional_rice.trips[0].delivery=1;},
    s=>{s.stores.lab_a.salesCounts['2026-10-19'].fictional_rice.trips[0].sales=null;},
    s=>{s.stores.lab_a.salesCounts['2026-10-19'].fictional_rice.trips[0].delivery=0;},
    s=>{s.stores.lab_a.salesCounts['2026-10-18'].fictional_rice.trips[0].sales=-7;}
  ]){
    const data=createPipeline();modify(data.saved);
    data.envelope=normalizer.buildFictionalInput(data.saved,data.normalizedRequest,data.context);
    assert.throws(()=>runHandoff(data),/fictional_handoff_unavailable/);
  }
});
test('I03: missing, extra, duplicated or out-of-scope days cannot be auto-generated from Reader',()=>{
  for(const mutate of [
    d=>{d.normalizedRequest.history_days=['2026-10-18'];},
    d=>{d.normalizedRequest.history_days=['2026-10-18','2026-10-19','2026-10-20'];},
    d=>{d.normalizedRequest.history_days=['2026-10-18','2026-10-18'];},
    d=>{d.normalizedRequest.history_days=['2026-10-18','2026-10-25'];}
  ]){
    const d=createPipeline();mutate(d);
    if(d.normalizedRequest.history_days[0]===d.normalizedRequest.history_days[1]||
       d.normalizedRequest.history_days.includes('2026-10-25')){
      assert.throws(()=>normalizer.buildFictionalInput(d.saved,d.normalizedRequest,d.context));
    } else {
      d.envelope=normalizer.buildFictionalInput(d.saved,d.normalizedRequest,d.context);
      assert.throws(()=>runHandoff(d),/fictional_handoff_unavailable/);
    }
  }
});
test('I04: different scope, manual flag, timestamp and snapshot identity cannot be reconciled implicitly',()=>{
  for(const mutate of [
    d=>{d.envelope.scope.store_id='lab_b';},
    d=>{d.envelope.scope.category_id='fictional_bread';},
    d=>{d.envelope.manual_target=false;},
    d=>{d.envelope.issued_at='2026-10-23T11:00:00+09:00';},
    d=>{d.envelope.snapshot.snapshot_id='different-source';},
    d=>{d.target_evidence.scope.trip=2;}
  ]){
    const d=createPipeline();mutate(d);
    assert.throws(()=>runHandoff(d),/fictional_handoff_unavailable/);
  }
});
test('I05: only Bridge accepting an asserted absence does not make Reader evidence sufficient',()=>{
  const d=createPipeline();
  d.target_evidence.sale.state='confirmed_absent';
  const bridged=bridge.toConditionInputDTO(d.envelope,d.target_evidence);
  assert.equal(bridged.sale.state,'confirmed_absent');
  // Reader has only "unknown" — guard MUST reject this promotion.
  assert.throws(()=>runHandoff(d),/fictional_handoff_unavailable/);
});
test('I06: unknown timestamps cannot turn into historical known facts',()=>{
  const d=createPipeline();
  const first=runHandoff(d);
  assert.equal(first.dto.sale.known_at,null);
  assert.equal(first.dto.calendar.known_at,null);
  assert.equal(d.envelope.history[0].weather.available_at,null);
  d.target_evidence.sale.known_at='2026-10-25T12:00:00+09:00';
  assert.throws(()=>runHandoff(d),/fictional_handoff_unavailable/);
});
test('I07: Reader invalidates after fake save/restoration even when envelope is unchanged',()=>{
  for(const change of [
    s=>{s.state.report_revision+=1;},
    s=>{s.state.pending=1;},
    s=>{s.state.versions.weather='fictional-new-revision';},
    s=>{s.state.raw_fingerprint='synthetic-next-raw';}
  ]){
    const d=createPipeline();change(d.source);
    assert.throws(()=>runHandoff(d),/fictional_handoff_unavailable/);
  }
});
test('I08: static production isolation and exact upstream prototype API versions',()=>{
  const root=path.join(__dirname,'..');
  const files=['insight_forecast_input_normalizer_proto_v1.js',
    'insight_forecast_conditions_bridge_proto_v1.js',
    'insight_forecast_fixture_contract_handoff_v0.js'];
  for(const file of files){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|WebSocket|Worker)\s*\(/);
  }
  assert.equal(normalizer.VERSION,bridge.INPUT_VERSION);
  assert.equal(bridge.OUTPUT_VERSION,'fictional-forecast-conditions-v1');
  assert.equal(validateFixtureHandoff(createPipeline()).provenance_verified,false);
});
