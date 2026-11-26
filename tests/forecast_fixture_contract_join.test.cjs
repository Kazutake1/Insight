'use strict';
/* P4d-15 JN01-JN06: new CROSS-CONTRACT boundaries only. All values
 * FICTIONAL. Old Reader/group/graph unit cases are not reimplemented.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureSnapshotReader}=
  require('../insight_forecast_fixture_snapshot_reader_v0.js');
const {createFictionalTripGroup}=
  require('../insight_forecast_fixture_trip_group_v0.js');
const {joinFictionalContracts:join}=
  require('../insight_forecast_fixture_contract_join_v0.js');
const ISSUED='2026-10-25T10:59:00+09:00';
const CAPTURE='2026-10-25T10:58:00+09:00';
const EARLY='2026-10-25T09:00:00+09:00';
const HIST='2026-10-19',TARGET='2026-10-26';
const SCOPE={store_id:'lab_a',category_id:'fictional_rice',trip:2};
const VERSIONS={weather:'wx1',calendar:'cal1',registry:'reg1',
  policy:'pol1',adapter:'ad1',contract:'ct1',model:'mod1'};
const known=value=>({state:'known',value});
const dim=(mode,value=null)=>({mode,value});
const all=()=>dim('all');
const exact=value=>dim('exact',value);
const coverage=(day=TARGET,changes={})=>({
  store:all(),category:all(),trip:all(),area:all(),site:all(),
  start_day:day,end_day:day,...changes
});
function makeGraph(snapId,manual=false){
  const g={kind:'FICTIONAL',schema_version:'fictional-source-graph-v0',
    anchor:{session_id:'join_session',request_id:'join_graph_request',
      snapshot_id:snapId,ui_epoch:7,scope:{...SCOPE},
      target_day:TARGET,manual_target:manual,purpose:'current_snapshot',
      issued_at:ISSUED,captured_at:CAPTURE,storage_revision:2,
      raw_live_state:'fictional_matched',
      adapter_version:known('fixture_adapter_v1'),
      normalizer_version:known('fixture_normalizer_v1'),
      graph_rule_version:known('fixture_graph_v1')},
    nodes:[],roots:{candidate:'registered_root',target:'target_root',
      history:['history_row_zero'],model:'model_root',weather:null}};
  const kinds={target_calendar:'fixture_calendar',
    common_registry:'fixture_registry',store_registry:'fixture_registry',
    promotional_sale_absence:'independent_check',
    event_absence:'independent_check',
    historical_promotional_sale_absence:'independent_check',
    historical_event_absence:'independent_check',
    condition_policy:'fixture_policy',model_policy:'fixture_policy',
    fallback_policy:'fixture_policy',area_mapping:'fixture_mapping'};
  function source(role,ref,fact,day=TARGET,changes={}){
    const at=changes.at||EARLY;
    const item={kind:'source',ref,role,snapshot_id:snapId,
      source_kind:kinds[role]||'fixture_record',read_state:'ok',
      coverage:coverage(day,changes.coverage||{}),
      source_version:known('fixture_source_v1'),
      times:role==='historical_sales'?{available_at:known(at)}:
        {known_at:known(at)},fact};
    g.nodes.push(item);return item;
  }
  function bind(s,day=TARGET,mapping_refs=[]){
    const b={kind:'binding',ref:s.ref+'_binding',role:s.role+'_binding',
      snapshot_id:snapId,source_ref:s.ref,mapping_refs,
      applied_scope:{...SCOPE},applied_day:day,rule_id:'fictional_binding_rule',
      rule_version:known('fixture_rule_v1'),known_at:known(EARLY)};
    g.nodes.push(b);return b;
  }
  function derived(role,ref,deps,day=TARGET){
    const d={kind:'derived',ref,role,snapshot_id:snapId,dependencies:deps,
      day,rule_id:'fictional_derivation',
      rule_version:known('fixture_rule_v1'),effective_at:known(EARLY)};
    g.nodes.push(d);return d;
  }
  source('area_mapping','area_map',
    {store_id:'lab_a',area:'fictional_area_a'},TARGET,
    {coverage:{store:exact('lab_a'),area:exact('fictional_area_a')}});
  const trip=bind(source('target_trip','trip_record',
    {status:'active',source:'current',tentative:false,
      conflict:false,needs_date_review:false}));
  const calendar=bind(source('target_calendar','calendar_record',
    {status:'non_holiday'},TARGET,{coverage:{area:exact('fictional_area_a')}}),
    TARGET,['area_map']);
  const common=bind(source('common_registry','common_reg',{presence:'absent'}));
  const store=bind(source('store_registry','store_reg',{presence:'absent'}));
  const sale=bind(source('promotional_sale_absence','sale_absence',
    {status:'confirmed_absent',method:'independent'}));
  const event=bind(source('event_absence','event_absence',
    {status:'confirmed_absent',method:'independent'}));
  const policy=bind(source('condition_policy','condition_policy',
    {id:'registered_conditions_only'}));
  const model=bind(source('model_policy','model_policy',
    {selection:'fictional_baseline',minimum_samples:1}));
  const fallback=bind(source('fallback_policy','fallback_policy',
    {selection:'fictional_baseline_only'}));
  derived('registered_candidate','registered_root',
    [calendar.ref,common.ref,store.ref,policy.ref]);
  derived('numeric_target_context','target_root',
    [trip.ref,calendar.ref,sale.ref,event.ref]);
  derived('model_gate','model_root',['target_root',model.ref,fallback.ref]);
  const historySale=bind(source('historical_sales','history_sales_zero',
    {day:HIST,entered:true,count:0},HIST,
    {at:'2026-10-20T09:00:00+09:00'}),HIST);
  const historyContext=bind(source('historical_context','history_context_zero',
    {day:HIST,active:true,holiday:false,event:false,origin:'independent'},
    HIST,{at:'2026-10-20T08:00:00+09:00'}),HIST);
  const historyPromo=bind(source('historical_promotional_sale_absence',
    'history_promo_zero',{day:HIST,status:'confirmed_absent',method:'independent'},
    HIST,{at:'2026-10-20T08:00:00+09:00'}),HIST);
  const historyEvent=bind(source('historical_event_absence',
    'history_event_zero',{day:HIST,status:'confirmed_absent',method:'independent'},
    HIST,{at:'2026-10-20T08:00:00+09:00'}),HIST);
  derived('history_row','history_row_zero',
    [historySale.ref,historyContext.ref,historyPromo.ref,historyEvent.ref],HIST);
  return g;
}
function fixture({shortVersions=false,manual=false}={}){
  const inspection={pending:0,held:false,conflict:false,report_revision:2,
    raw_fingerprint:'fictional_label_only',
    versions:shortVersions?
      {weather:'wx1',calendar:'cal1',registry:'reg1',policy:'pol1'}:
      {...VERSIONS}};
  const source={fixture:true,inspect(){return structuredClone(inspection);},
    readFixture(){return {history:[],target_evidence:null};}};
  const reader=createFixtureSnapshotReader(source);
  const req={scope:{...SCOPE},target_day:TARGET,request_issued_at:ISSUED,
    manual_target:manual,purpose:'current_snapshot',history_days:42};
  const snapshot=reader.read(req);
  const group=createFictionalTripGroup({fixture:true,group_id:'join_group',
    session_id:'join_session',snapshot_id:snapshot.snapshot_id,
    store_id:SCOPE.store_id,category_id:SCOPE.category_id,
    target_day:TARGET,issued_at:ISSUED,manual_target:manual,
    purpose:'current_snapshot',ui_epoch:7,history_days:42,
    trips:[2],source_versions:{...VERSIONS}});
  const child=group.children[0],graph_input=makeGraph(snapshot.snapshot_id,manual);
  const observed={session_id:'join_session',snapshot_id:snapshot.snapshot_id,
    store_id:SCOPE.store_id,category_id:SCOPE.category_id,
    target_day:TARGET,manual_target:manual,ui_epoch:7,
    source_versions:{...VERSIONS}};
  const capture={session_id:'join_session',snapshot_id:snapshot.snapshot_id,
    child_request_id:child.context.request_id,
    graph_request_ref:graph_input.anchor.request_id,
    ui_epoch:7,captured_at:CAPTURE,storage_revision:2};
  const reference={child_request_id:child.context.request_id,
    graph_request_ref:graph_input.anchor.request_id};
  // inspection is private to the fictional Reader source; the join contract
  // deliberately permits only its eight explicit input keys.
  return {reader,snapshot,group,child,graph_input,reference,capture,observed};
}
function verdict(v,status,reason){
  const out=join(v);assert.equal(out.status,status);
  assert.equal(out.reason,reason);
  assert.deepEqual(Object.keys(out).sort(),[
    'kind','status','reason','fixture_only','full_app_clean',
    'provenance_verified','authorized_for_model'].sort());
  assert.equal(out.kind,'FICTIONAL_CONTRACT_JOIN_ONLY');
  assert.equal(out.full_app_clean,false);
  assert.equal(out.authorized_for_model,false);
  assert.equal(out.provenance_verified,false);
  return out;
}

test('JN01: Reader accepts four versions, but seven-key cross-join holds',()=>{
  verdict(fixture({shortVersions:true}),'HELD','VERSION_UNVERIFIED');
});
test('JN02: real Reader snapshot and distinct explicit request refs only match FICTIONAL',()=>{
  const v=fixture();
  assert.notEqual(v.reference.child_request_id,v.reference.graph_request_ref);
  assert.equal(v.reference.child_request_id.endsWith('.trip2'),true);
  assert.equal(v.reference.graph_request_ref.includes('.'),false);
  const out=verdict(v,'MATCHED_FIXTURE',null);
  assert.equal(JSON.stringify(out).includes('lab_a'),false);
  assert.equal(JSON.stringify(out).includes(ISSUED),false);
  assert.equal(JSON.stringify(out).includes('count'),false);
});
test('JN03: request ref mapping and external capture metadata cannot drift',()=>{
  for(const edit of [
    v=>v.reference.graph_request_ref='other_ref',
    v=>v.capture.graph_request_ref='other_ref',
    v=>v.capture.storage_revision=3,
    v=>v.capture.captured_at='2026-10-25T10:57:00+09:00',
    v=>v.graph_input.anchor.session_id='other_session',
    v=>v.graph_input.anchor.issued_at='2026-10-25T10:58:00+09:00',
    v=>v.graph_input.anchor.scope.category_id='fictional_bread',
    v=>v.graph_input.anchor.snapshot_id='different_fixture',
    v=>v.observed.target_day='2026-10-27'
  ]){
    const v=fixture();edit(v);
    assert.notEqual(join(v).status,'MATCHED_FIXTURE');
  }
});
test('JN04: original graph screens missing target or history, never upgrades to READY',()=>{
  const target=fixture();
  const t=target.graph_input.nodes.find(n=>n.ref==='sale_absence');
  t.fact={status:'unknown',method:'unknown'};
  verdict(target,'HELD','TARGET_UNSCREENED');
  const history=fixture();
  const h=history.graph_input.nodes.find(n=>n.ref==='history_sales_zero');
  h.times.available_at={state:'unknown',value:null};
  verdict(history,'HELD','HISTORY_UNSCREENED');
});
test('JN05: fabricated authorizations and accessor graphs are rejected',()=>{
  const forged=fixture();forged.graph_input.authorized_for_model=true;
  verdict(forged,'REJECT','GRAPH_INVALID');
  const invalid=fixture();
  Object.defineProperty(invalid.graph_input,'anchor',{enumerable:true,
    get(){throw new Error('secret fixture exception must not escape');}});
  verdict(invalid,'REJECT','INVALID_FIXTURE_INPUT');
});
test('JN06: old observed automatic day holds, explicit manual fixture stays unchanged',()=>{
  const old=fixture();
  old.observed.target_day='2026-10-27';
  verdict(old,'HELD','FIXTURE_STALE');
  const manual=fixture({manual:true});
  verdict(manual,'MATCHED_FIXTURE',null);
});
