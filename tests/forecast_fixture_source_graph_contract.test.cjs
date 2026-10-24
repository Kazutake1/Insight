'use strict';
/*
 * G01-G22: one-store, one-category, one-trip FICTIONAL graph contract only.
 * No real Insight storage, UI, model run, or network. Zero/unknown are distinct.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluateFictionalSourceGraph:evaluate}=
  require('../insight_forecast_fixture_source_graph_v0.js');
const KNOWN=(value)=>({state:'known',value});
const UNKNOWN=()=>({state:'unknown',value:null});
const ISSUED='2026-10-25T10:59:00+09:00';
const CAPTURE='2026-10-25T10:58:00+09:00';
const EARLY='2026-10-25T09:00:00+09:00';
const TARGET='2026-10-26';
const SCOPE={store_id:'lab_a',category_id:'fictional_rice',trip:2};
const dim=(mode,value=null)=>({mode,value});
const all=()=>dim('all');
const exact=value=>dim('exact',value);
function coverage(day=TARGET,changes={}){
  return {store:all(),category:all(),trip:all(),area:all(),site:all(),
    start_day:day,end_day:day,...changes};
}
function graph(){
  const g={
    kind:'FICTIONAL',schema_version:'fictional-source-graph-v0',
    anchor:{session_id:'fictional_session',request_id:'fictional_request',
      snapshot_id:'fictional_snapshot',ui_epoch:7,scope:{...SCOPE},
      target_day:TARGET,manual_target:false,purpose:'current_snapshot',
      issued_at:ISSUED,captured_at:CAPTURE,storage_revision:2,
      raw_live_state:'fictional_matched',
      adapter_version:KNOWN('fixture_adapter_v1'),
      normalizer_version:KNOWN('fixture_normalizer_v1'),
      graph_rule_version:KNOWN('fixture_graph_v1')},
    nodes:[],roots:{candidate:'registration_result',target:'target_result',
      history:['history_row_zero','history_row_unknown'],
      model:'model_result',weather:null}
  };
  function source(role,ref,fact,opts={}){
    const n={kind:'source',ref,role,snapshot_id:'fictional_snapshot',
      source_kind:({
        target_calendar:'fixture_calendar',common_registry:'fixture_registry',
        store_registry:'fixture_registry',promotional_sale_absence:'independent_check',
        event_absence:'independent_check',condition_policy:'fixture_policy',
        model_policy:'fixture_policy',fallback_policy:'fixture_policy',
        weather_policy:'fixture_policy',area_mapping:'fixture_mapping',
        weather_site_mapping:'fixture_mapping',weather_report:'fixture_report'
      })[role]||'fixture_record',
      read_state:opts.read_state||'ok',
      coverage:opts.coverage||coverage(opts.day||TARGET),
      source_version:opts.version===null?UNKNOWN():KNOWN(opts.version||'fixture_source_v1'),
      times:role==='historical_sales'?
        {available_at:opts.time===null?UNKNOWN():KNOWN(opts.time||EARLY)}:
        role==='weather_report'?
        {published_at:opts.published_at===null?UNKNOWN():KNOWN(opts.published_at||EARLY),
          received_at:opts.received_at===null?UNKNOWN():KNOWN(opts.received_at||EARLY)}:
        {known_at:opts.time===null?UNKNOWN():KNOWN(opts.time||EARLY)},
      fact};
    g.nodes.push(n);return n;
  }
  function bind(s,opts={}){
    const n={kind:'binding',ref:s.ref+'_binding',role:s.role+'_binding',
      snapshot_id:'fictional_snapshot',source_ref:s.ref,
      mapping_refs:opts.mapping_refs||[],applied_scope:{...SCOPE},
      applied_day:opts.day||TARGET,rule_id:'fictional_binding_rule',
      rule_version:KNOWN('fixture_rule_v1'),
      known_at:opts.time===null?UNKNOWN():KNOWN(opts.time||EARLY)};
    g.nodes.push(n);return n;
  }
  function derived(role,ref,deps,day=TARGET,when=EARLY){
    const n={kind:'derived',ref,role,snapshot_id:'fictional_snapshot',
      dependencies:deps,day,rule_id:'fictional_derivation',
      rule_version:KNOWN('fixture_rule_v1'),effective_at:KNOWN(when)};
    g.nodes.push(n);return n;
  }
  source('area_mapping','area_map',
    {store_id:'lab_a',area:'fictional_area_a'},
    {coverage:coverage(TARGET,{store:exact('lab_a'),area:exact('fictional_area_a')})});
  const trip=bind(source('target_trip','trip_source',{
    status:'active',source:'current',tentative:false,conflict:false,needs_date_review:false
  }));
  const cal=bind(source('target_calendar','calendar_source',
    {status:'non_holiday'},{coverage:coverage(TARGET,{
      area:exact('fictional_area_a'),store:all()})}),
    {mapping_refs:['area_map']});
  const common=bind(source('common_registry','common_source',{presence:'absent'},
    {time:null,coverage:coverage(TARGET,{store:all(),category:all(),trip:all()})}));
  const store=bind(source('store_registry','store_source',{presence:'absent'},
    {time:null,coverage:coverage(TARGET,{store:exact('lab_a')})}));
  const sale=bind(source('promotional_sale_absence','sale_absence',
    {status:'unknown',method:'unknown'},{time:null}));
  const event=bind(source('event_absence','event_absence',
    {status:'unknown',method:'unknown'},{time:null}));
  const policy=bind(source('condition_policy','condition_policy',
    {id:'registered_conditions_only'}));
  const modelPolicy=bind(source('model_policy','model_policy',
    {selection:'unselected',minimum_samples:3}));
  const fallback=bind(source('fallback_policy','fallback_policy',
    {selection:'disabled'}));
  derived('registered_candidate','registration_result',
    [cal.ref,common.ref,store.ref,policy.ref]);
  derived('numeric_target_context','target_result',
    [trip.ref,cal.ref,sale.ref,event.ref]);
  derived('model_gate','model_result',
    ['target_result',modelPolicy.ref,fallback.ref]);
  function history(suffix,day,count,entered,availableTime,contextTime){
    const sf=bind(source('historical_sales','history_sales_'+suffix,
      {day,entered,count},{day,time:availableTime,coverage:coverage(day)}),
      {day,time:contextTime});
    const cf=bind(source('historical_context','history_context_'+suffix,
      {day,active:true,holiday:false,event:false,origin:'independent'},
      {day,time:contextTime,coverage:coverage(day)}),
      {day,time:contextTime});
    derived('history_row','history_row_'+suffix,[sf.ref,cf.ref],day,contextTime);
  }
  history('zero','2026-10-19',0,true,'2026-10-20T09:00:00+09:00',
    '2026-10-20T08:00:00+09:00');
  history('unknown','2026-10-12',6,true,null,'2026-10-13T08:00:00+09:00');
  return g;
}
const find=(g,ref)=>{
  const n=g.nodes.find(x=>x.ref===ref);assert.ok(n,'missing fixture '+ref);return n;
};
const ok=g=>evaluate(g);
function outcome(g,expected){
  const r=ok(g);assert.equal(r.status,expected);
  assert.equal(r.provenance_verified,false);
  assert.equal(r.authorized_for_model,false);
  return r;
}
function confirmTarget(g){
  for(const ref of ['sale_absence','event_absence']){
    find(g,ref).fact={status:'confirmed_absent',method:'independent'};
    find(g,ref).times.known_at=KNOWN(EARLY);
  }
}
function addWeather(g){
  const snap='fictional_snapshot';
  const siteSource={kind:'source',ref:'weather_site_source',
    role:'weather_site_mapping',snapshot_id:snap,source_kind:'fixture_mapping',
    read_state:'ok',coverage:coverage(TARGET,{store:exact('lab_a'),
      site:exact('lab_site_a')}),source_version:KNOWN('site_mapping_v1'),
    times:{known_at:KNOWN(EARLY)},fact:{store_id:'lab_a',site:'lab_site_a'}};
  g.nodes.push(siteSource);
  const mk=(s,opts={})=>({
    kind:'binding',ref:s.ref+'_binding',role:s.role+'_binding',
    snapshot_id:snap,source_ref:s.ref,mapping_refs:opts.mapping_refs||[],
    applied_scope:{...SCOPE},applied_day:TARGET,rule_id:'weather_binding',
    rule_version:KNOWN('weather_rule_v1'),known_at:KNOWN(EARLY)
  });
  const siteBinding=mk(siteSource);g.nodes.push(siteBinding);
  const record={kind:'source',ref:'weather_record',role:'weather_report',
    snapshot_id:snap,source_kind:'fixture_report',read_state:'ok',
    coverage:coverage(TARGET,{site:exact('lab_site_a')}),
    source_version:KNOWN('report_v1'),times:{published_at:KNOWN(EARLY),
      received_at:KNOWN(EARLY)},fact:{day:TARGET,site:'lab_site_a',
      report_id:'fictional_report_1',source_kind:'forecast',
      classification_version:'weather_classes_v1',unit:'celsius'}};
  const weatherPolicy={kind:'source',ref:'weather_policy_source',
    role:'weather_policy',snapshot_id:snap,source_kind:'fixture_policy',
    read_state:'ok',coverage:coverage(),
    source_version:KNOWN('weather_policy_v1'),times:{known_at:KNOWN(EARLY)},
    fact:{max_age_seconds:86400}};
  g.nodes.push(record,weatherPolicy);
  const recordBinding=mk(record,{mapping_refs:['weather_site_source']}),
    policyBinding=mk(weatherPolicy);
  g.nodes.push(recordBinding,policyBinding);
  g.nodes.push({kind:'derived',ref:'weather_result',role:'weather_gate',
    snapshot_id:snap,dependencies:[recordBinding.ref,siteBinding.ref,policyBinding.ref],
    day:TARGET,rule_id:'weather_gate_rule',rule_version:KNOWN('weather_v1'),
    effective_at:KNOWN(EARLY)});
  g.roots.weather='weather_result';
  return g;
}
test('G01: registry candidate and unknown independent absences keep target HELD, zero survives',()=>{
  const r=outcome(graph(),'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.candidate_status,'candidate');
  assert.equal(r.target_status,'HELD');
  assert.deepEqual([r.history_eligible,r.history_zero,r.history_excluded],[1,1,1]);
  assert.equal(r.model_status,'DISABLED');
  assert.equal(Object.hasOwn(r,'forecast_value'),false);
});
test('G02: duplicate opaque node refs REJECT',()=>{
  const g=graph();find(g,'store_source').ref='common_source';
  outcome(g,'REJECT');
});
test('G03: missing root, derived parent, binding source_ref and mapping_refs REJECT',()=>{
  const edits=[
    g=>g.roots.target='not_found',
    g=>find(g,'target_result').dependencies[0]='not_found',
    g=>find(g,'calendar_source_binding').source_ref='not_found',
    g=>find(g,'calendar_source_binding').mapping_refs[0]='not_found'
  ];
  for(const edit of edits){const g=graph();edit(g);outcome(g,'REJECT');}
});
test('G04: derived and binding-involved cycles or their illegal parent-kind links REJECT',()=>{
  const edits=[
    g=>find(g,'model_result').dependencies[0]='model_result',
    g=>find(g,'calendar_source_binding').source_ref='calendar_source_binding',
    g=>find(g,'calendar_source_binding').mapping_refs[0]='calendar_source_binding'
  ];
  for(const edit of edits){const g=graph();edit(g);outcome(g,'REJECT');}
});
test('G05: other-snapshot source or binding REJECT',()=>{
  for(const ref of ['common_source','trip_source_binding','history_row_zero']){
    const g=graph();find(g,ref).snapshot_id='fictional_other_snapshot';
    outcome(g,'REJECT');
  }
});
test('G06: wrong-store, category, trip applied binding REJECT',()=>{
  for(const mutate of [
    s=>{s.store_id='lab_b';},
    s=>{s.category_id='fictional_bread';},
    s=>{s.trip=3;}
  ]){
    const g=graph();mutate(find(g,'common_source_binding').applied_scope);
    outcome(g,'REJECT');
  }
});
test('G07: known non-covering day, area, store REJECT; explicitly unknown coverage HELD',()=>{
  for(const edit of [
    g=>find(g,'calendar_source').coverage.start_day='2026-10-27',
    g=>find(g,'calendar_source').coverage.area=exact('fictional_area_b'),
    g=>find(g,'store_source').coverage.store=exact('lab_b')
  ]){const g=graph();edit(g);outcome(g,'REJECT');}
  const u=graph();
  find(u,'calendar_source').coverage.start_day=null;
  find(u,'calendar_source').coverage.end_day=null;
  const r=outcome(u,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.target_status,'HELD');
  const unknownArea=graph();
  find(unknownArea,'calendar_source').coverage.area=dim('unknown');
  assert.equal(outcome(unknownArea,'FICTIONAL_SCREENING_ONLY').target_status,'HELD');
});
test('G08: broad source coverage is preserved, binding limits it to one trip',()=>{
  const g=graph();
  assert.equal(find(g,'common_source').coverage.store.mode,'all');
  assert.equal(find(g,'common_source').coverage.trip.mode,'all');
  const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.candidate_status,'candidate');
});
test('G09: unknown version or read state on one registry cannot be replaced by the other',()=>{
  for(const ref of ['common_source','store_source']){
    for(const edit of [s=>s.source_version=UNKNOWN(),s=>s.read_state='unknown']){
      const g=graph();edit(find(g,ref));
      assert.equal(outcome(g,'FICTIONAL_SCREENING_ONLY').candidate_status,'undetermined');
    }
  }
});
test('G10: registered-only candidate cannot manufacture either independent absence',()=>{
  for(const ref of ['sale_absence','event_absence']){
    const g=graph();find(g,ref).fact={status:'confirmed_absent',method:'registered_only'};
    outcome(g,'REJECT');
  }
  const g=graph();find(g,'target_result').dependencies[2]='registration_result';
  outcome(g,'REJECT');
});
test('G11: sale absence alone, or event absence alone, never confirms numeric target',()=>{
  for(const ref of ['sale_absence','event_absence']){
    const g=graph();const s=find(g,ref);
    s.fact={status:'confirmed_absent',method:'independent'};s.times.known_at=KNOWN(EARLY);
    assert.equal(outcome(g,'FICTIONAL_SCREENING_ONLY').target_status,'HELD');
  }
});
test('G12: target missing known/version => HELD; a history missing version => EXCLUDED',()=>{
  const g=graph();confirmTarget(g);
  find(g,'trip_source').times.known_at=UNKNOWN();
  find(g,'history_context_zero').source_version=UNKNOWN();
  const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.target_status,'HELD');
  assert.deepEqual([r.history_eligible,r.history_zero,r.history_excluded],[0,0,2]);
});
test('G13: entered zero, missing, unknown sale time and unknown context time stay separate',()=>{
  const g=graph();
  const extra=structuredClone(find(g,'history_sales_zero'));
  assert.equal(extra.fact.entered,true);assert.equal(extra.fact.count,0);
  find(g,'history_sales_unknown').fact={day:'2026-10-12',entered:false,count:null};
  assert.deepEqual(((r)=>[r.history_eligible,r.history_zero,r.history_excluded])(
    outcome(g,'FICTIONAL_SCREENING_ONLY')),[1,1,1]);
  const g2=graph();find(g2,'history_context_zero').times.known_at=UNKNOWN();
  assert.equal(outcome(g2,'FICTIONAL_SCREENING_ONLY').history_eligible,0);
});
test('G14: between captured and issued, a source fact is late for current snapshot',()=>{
  const g=graph();confirmTarget(g);
  find(g,'trip_source').times.known_at=KNOWN('2026-10-25T10:58:30+09:00');
  find(g,'history_sales_zero').times.available_at=KNOWN('2026-10-25T10:58:30+09:00');
  const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.target_status,'HELD');
  assert.equal(r.history_eligible,0);
});
test('G15: captured after issued rejects current, but replay checks individual evidence',()=>{
  const g=graph();g.anchor.captured_at='2026-10-25T11:01:00+09:00';
  outcome(g,'REJECT');
  g.anchor.purpose='historical_replay';
  const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.candidate_status,'undetermined','unknown registered timestamp is not historical evidence');
});
test('G16: late historical policy/model/weather versions cannot be retroactively accepted',()=>{
  const g=graph();confirmTarget(g);
  g.anchor.purpose='historical_replay';
  g.anchor.captured_at='2026-10-27T09:00:00+09:00';
  find(g,'condition_policy').times.known_at=KNOWN('2026-10-26T08:00:00+09:00');
  find(g,'model_policy').times.known_at=KNOWN('2026-10-26T08:00:00+09:00');
  assert.equal(outcome(g,'FICTIONAL_SCREENING_ONLY').candidate_status,'undetermined');
  assert.equal(outcome(g,'FICTIONAL_SCREENING_ONLY').model_status,'DISABLED');
  addWeather(g);
  find(g,'weather_record').times.received_at=KNOWN('2026-10-26T08:00:00+09:00');
  assert.equal(outcome(g,'FICTIONAL_SCREENING_ONLY').weather_status,'HELD');
});
test('G17: exact cutoff timestamp is allowed, without implying model authorization',()=>{
  const g=graph();confirmTarget(g);
  find(g,'trip_source').times.known_at=KNOWN(CAPTURE);
  find(g,'trip_source_binding').known_at=KNOWN(CAPTURE);
  const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.target_status,'SCREENED');
  assert.equal(r.authorized_for_model,false);
});
test('G18: removing any mandatory sale/event/registry/model parent REJECT',()=>{
  for(const [ref,role] of [
    ['target_result','event_absence_binding'],
    ['registration_result','common_registry_binding'],
    ['registration_result','store_registry_binding'],
    ['model_result','fallback_policy_binding']]){
    const g=graph(),n=find(g,ref);n.dependencies=n.dependencies.filter(d=>find(g,d).role!==role);
    outcome(g,'REJECT');
  }
});
test('G19: weather missing site/time/version HELD, but current required versions unchanged',()=>{
  const good=addWeather(graph());
  assert.equal(outcome(good,'FICTIONAL_SCREENING_ONLY').weather_status,'SCREENED');
  const reversed=addWeather(graph());
  find(reversed,'weather_record').times.published_at=KNOWN('2026-10-25T09:01:00+09:00');
  outcome(reversed,'REJECT');
  for(const edit of [
    g=>find(g,'weather_record').times.received_at=UNKNOWN(),
    g=>find(g,'weather_record').source_version=UNKNOWN(),
    g=>find(g,'weather_site_source').read_state='unavailable',
    g=>find(g,'weather_record').coverage.site=dim('unknown')
  ]){
    const g=addWeather(graph());edit(g);
    assert.equal(outcome(g,'FICTIONAL_SCREENING_ONLY').weather_status,'HELD');
  }
});
test('G20: node order does not matter and prior result cannot change with caller edits',()=>{
  const g=graph(),r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  g.nodes.reverse();
  assert.deepEqual(outcome(g,'FICTIONAL_SCREENING_ONLY'),r);
  find(g,'sale_absence').fact={status:'confirmed_absent',method:'independent'};
  assert.equal(r.target_status,'HELD');
  assert.equal(Object.isFrozen(r),true);
});
test('G21: accessor/toJSON/nonfinite/hole/extra-key/canary never exposed',()=>{
  const cases=[
    g=>Object.defineProperty(find(g,'trip_source').fact,'status',{get(){throw Error('SYNTHETIC_SECRET_CANARY');}}),
    g=>{find(g,'trip_source').fact.toJSON=()=>({});},
    g=>{find(g,'history_sales_zero').fact.count=NaN;},
    g=>{delete g.nodes[0];},
    g=>{find(g,'target_result').extraneous='SYNTHETIC_SECRET_CANARY';}
  ];
  for(const mutate of cases){
    const g=graph();mutate(g);const r=outcome(g,'REJECT');
    assert.equal(JSON.stringify(r).includes('SYNTHETIC_SECRET_CANARY'),false);
  }
});
test('G22: all fictional target evidence can be screened, never forecast/authorize',()=>{
  const g=graph();confirmTarget(g);
  find(g,'model_policy').fact.selection='fictional_baseline';
  find(g,'fallback_policy').fact.selection='fictional_baseline_only';
  const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.target_status,'SCREENED');
  assert.equal(r.history_eligible,1);
  assert.equal(r.model_status,'FIXTURE_POLICY_DECLARED');
  assert.equal(r.authorized_for_model,false);
  assert.equal(Object.hasOwn(r,'value'),false);
  assert.equal(Object.hasOwn(r,'daily_total'),false);
});


/*
 * G23-G26: AI社員Work independent review R3-R6 (Issue #211).
 * Each adversarial case complements G01-G22; no production bridge.
 */
test('G23 R3: registry unknown-time exemption never skips coverage, derived rule or cutoff',()=>{
  for(const edit of [
    g=>{find(g,'common_source').coverage.store=dim('unknown');},
    g=>{find(g,'registration_result').rule_version=UNKNOWN();},
    g=>{find(g,'registration_result').effective_at=KNOWN('2026-10-26T09:00:00+09:00');},
    g=>{find(g,'common_source_binding').rule_version=UNKNOWN();},
    g=>{find(g,'common_source_binding').known_at=KNOWN('2026-10-25T10:58:30+09:00');}
  ]){
    const g=graph();edit(g);
    const r=outcome(g,'FICTIONAL_SCREENING_ONLY');
    assert.equal(r.candidate_status,'undetermined');
    assert.equal(r.authorized_for_model,false);
  }
  // One registry at an actually known, timely state must not make a still
  // unknown-but-current other registry ineligible solely because it is known.
  const mixed=graph();
  find(mixed,'common_source').times.known_at=KNOWN(EARLY);
  assert.equal(outcome(mixed,'FICTIONAL_SCREENING_ONLY').candidate_status,'candidate');
  const late=graph();
  find(late,'common_source').times.known_at=KNOWN('2026-10-25T10:58:30+09:00');
  assert.equal(outcome(late,'FICTIONAL_SCREENING_ONLY').candidate_status,'undetermined');
  const replay=graph();
  replay.anchor.purpose='historical_replay';
  assert.equal(outcome(replay,'FICTIONAL_SCREENING_ONLY').candidate_status,'undetermined');
});
test('G24 R4: known coverage mismatch outranks unknown dimension in every combination',()=>{
  const edits=[
    g=>{const c=find(g,'trip_source').coverage;c.store=dim('unknown');c.trip=exact(3);},
    g=>{const c=find(g,'trip_source').coverage;c.store=dim('unknown');c.category=exact('fictional_bread');},
    g=>{const c=find(g,'trip_source').coverage;c.store=dim('unknown');c.start_day='2026-10-27';c.end_day='2026-10-27';},
    g=>{const c=find(g,'trip_source').coverage;c.category=dim('unknown');c.store=exact('lab_b');}
  ];
  for(const edit of edits){const g=graph();edit(g);outcome(g,'REJECT');}
  const onlyUnknown=graph();
  find(onlyUnknown,'trip_source').coverage.store=dim('unknown');
  const r=outcome(onlyUnknown,'FICTIONAL_SCREENING_ONLY');
  assert.equal(r.target_status,'HELD');
});
test('G25 R5: forecast publication freshness uses policy seconds and actual cutoff',()=>{
  const expired=addWeather(graph());
  find(expired,'weather_policy_source').fact.max_age_seconds=1;
  assert.equal(outcome(expired,'FICTIONAL_SCREENING_ONLY').weather_status,'HELD');
  const exact=addWeather(graph());
  find(exact,'weather_policy_source').fact.max_age_seconds=1;
  find(exact,'weather_record').times.published_at=KNOWN('2026-10-25T10:57:59+09:00');
  find(exact,'weather_record').times.received_at=KNOWN('2026-10-25T10:57:59+09:00');
  assert.equal(outcome(exact,'FICTIONAL_SCREENING_ONLY').weather_status,'SCREENED');
  const same=addWeather(graph());
  find(same,'weather_policy_source').fact.max_age_seconds=1;
  find(same,'weather_record').times.published_at=KNOWN(CAPTURE);
  find(same,'weather_record').times.received_at=KNOWN(CAPTURE);
  assert.equal(outcome(same,'FICTIONAL_SCREENING_ONLY').weather_status,'SCREENED');
  const tooOld=addWeather(graph());
  find(tooOld,'weather_policy_source').fact.max_age_seconds=1;
  find(tooOld,'weather_record').times.published_at=KNOWN('2026-10-25T10:57:58+09:00');
  find(tooOld,'weather_record').times.received_at=KNOWN('2026-10-25T10:57:58+09:00');
  assert.equal(outcome(tooOld,'FICTIONAL_SCREENING_ONLY').weather_status,'HELD');
});
test('G26 R6: duplicated same-day historical sale cannot inflate samples, even with new refs',()=>{
  const cloneRoot=graph();
  const copy=structuredClone(find(cloneRoot,'history_row_zero'));
  copy.ref='history_row_duplicate';
  cloneRoot.nodes.push(copy);
  cloneRoot.roots.history.push(copy.ref);
  outcome(cloneRoot,'REJECT');
  const clonedSources=graph();
  const renames={
    history_sales_zero:'history_sales_extra',
    history_sales_zero_binding:'history_sales_extra_binding',
    history_context_zero:'history_context_extra',
    history_context_zero_binding:'history_context_extra_binding',
    history_row_zero:'history_row_extra'
  };
  for(const old of Object.keys(renames)){
    const duplicate=structuredClone(find(clonedSources,old));
    duplicate.ref=renames[old];
    if(duplicate.kind==='binding')duplicate.source_ref=renames[duplicate.source_ref];
    if(duplicate.kind==='derived')
      duplicate.dependencies=duplicate.dependencies.map(d=>renames[d]||d);
    clonedSources.nodes.push(duplicate);
  }
  clonedSources.roots.history.push('history_row_extra');
  outcome(clonedSources,'REJECT');
  // Genuine two different days with valid timestamps remain two data rows.
  const twoDays=graph();
  find(twoDays,'history_sales_unknown').times.available_at=
    KNOWN('2026-10-13T09:00:00+09:00');
  const r=outcome(twoDays,'FICTIONAL_SCREENING_ONLY');
  assert.deepEqual([r.history_eligible,r.history_zero,r.history_excluded],[2,1,0]);
});
