'use strict';
/*
 * G1/G2/G8/G9 fixture preflight CONTRACT tests (not production wiring).
 * The actual InsightStorage and OrderForecast gaps remain documented in PR #231.
 * All records/IDs are fabricated. No real localStorage, DOM or model execution.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureCapturePreflight}=require('../insight_forecast_fixture_capture_preflight_v0.js');
function harness(){
  const data={
    report:{revision:0,pending:0,held:false,conflict:false,
      versions:{weather:'fictional-wx1',calendar:'fictional-cal1',
        registry:'fictional-reg1',policy:'fictional-pol1'}},
    saved:{schemaVersion:1,stores:{lab_a:{count:0}}},
    live:{schemaVersion:1,stores:{lab_a:{count:0}}},
    selection:{store_id:'lab_a',category_id:'fictional_rice',trip:1,
      delivery:'2026-10-25'}
  };
  const source={fixture:true,
    inspect(){return structuredClone(data.report);},
    readSaved(){return structuredClone(data.saved);},
    readLive(){return structuredClone(data.live);},
    readSelection(){return structuredClone(data.selection);}};
  const gate=createFixtureCapturePreflight(source);
  const request=()=>({scope:{store_id:data.selection.store_id,
    category_id:data.selection.category_id,trip:data.selection.trip},
    target_day:data.selection.delivery,manual_target:false});
  return {data,source,gate,request};
}
test('C01: no authentic UI intent event means the fixture capture is blocked',()=>{
  const f=harness();
  const out=f.gate.capture(f.request());
  assert.equal(out.ok,false);
  assert.equal(out.reason,'selection_or_manual_provenance_unknown');
  assert.equal(out.authorized_for_model,false);
});
test('C02: synthetic auto event permits inspection, never model authorization',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  const out=f.gate.capture(f.request());
  assert.equal(out.ok,true);
  assert.equal(out.status,'FICTIONAL_ONLY_NOT_AUTHORIZED');
  assert.equal(out.ticket.provenance_verified,false);
  assert.equal(out.ticket.authorized_for_model,false);
  assert.equal(f.gate.isCurrent(out.ticket),true);
});
test('C03 G1: selecting the SAME automatic date manually is still a manual choice',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.gate.event('delivery-manual'); // date is intentionally unchanged
  const inferredFromDate=f.gate.capture(f.request());
  assert.equal(inferredFromDate.ok,false);
  const explicit={...f.request(),manual_target:true};
  const provedOnlyByFixtureEvent=f.gate.capture(explicit);
  assert.equal(provedOnlyByFixtureEvent.ok,true);
  assert.equal(provedOnlyByFixtureEvent.authorized_for_model,false);
});
test('C04 G2: unsaved UI change blocks despite revision/pending/held/conflict remaining clear',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.data.live.stores.lab_a.count=19;
  const result=f.gate.capture(f.request());
  assert.equal(result.ok,false);
  assert.equal(result.reason,'unsaved_live_data_mismatch');
  assert.equal(f.data.report.revision,0);
});
test('C05 G2: mutation during read is detected by the before/after report fence',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.source.readLive=()=>{f.data.report.revision++;return structuredClone(f.data.live);};
  assert.equal(f.gate.capture(f.request()).reason,'source_or_selection_changed_during_capture');
});
test('C06 G8: A→B→A revokes old capture even when all currently visible values match',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  const old=f.gate.capture(f.request());
  assert.equal(old.ok,true);
  f.gate.event('store');f.data.selection.store_id='lab_b';
  f.gate.event('store');f.data.selection.store_id='lab_a';
  assert.equal(f.gate.isCurrent(old.ticket),false);
  assert.equal(f.gate.capture(f.request()).ok,true);
});
test('C07 G8: category, delivery, page, and refresh events each revoke previous ticket',()=>{
  for(const operation of ['category','delivery-manual','page','refresh']){
    const f=harness();
    f.gate.event('auto-delivery');
    const old=f.gate.capture(f.request());
    f.gate.event(operation);
    assert.equal(f.gate.isCurrent(old.ticket),false,operation);
  }
});
test('C08 G8: save and external-change events revoke ticket even if raw returns to same value',()=>{
  for(const operation of ['storage','external','restore']){
    const f=harness();
    f.gate.event('auto-delivery');
    const old=f.gate.capture(f.request());
    f.data.saved.stores.lab_a.count=4;
    f.data.live.stores.lab_a.count=4;
    f.gate.event(operation);
    f.data.saved.stores.lab_a.count=0;
    f.data.live.stores.lab_a.count=0;
    assert.equal(f.gate.isCurrent(old.ticket),false,operation);
  }
});
test('C09 G9: each observed source-version change invalidates an old ticket',()=>{
  for(const kind of ['weather','calendar','registry','policy']){
    const f=harness();
    f.gate.event('auto-delivery');
    const old=f.gate.capture(f.request());
    f.data.report.versions[kind]+='v2';
    assert.equal(f.gate.isCurrent(old.ticket),false,kind);
  }
});
test('C10: pending, held and external conflict each fail closed',()=>{
  for(const patch of [{pending:1},{held:true},{conflict:true}]){
    const f=harness();
    f.gate.event('auto-delivery');
    Object.assign(f.data.report,patch);
    const result=f.gate.capture(f.request());
    assert.equal(result.ok,false);
    assert.equal(result.reason,'storage_not_ready');
  }
});
test('C11: tickets are source-bound; disposed guards never resurrect them',()=>{
  const a=harness(),b=harness();
  a.gate.event('auto-delivery');b.gate.event('auto-delivery');
  const ticket=a.gate.capture(a.request()).ticket;
  assert.equal(b.gate.isCurrent(ticket),false);
  a.gate.dispose();
  assert.equal(a.gate.isCurrent(ticket),false);
  assert.equal(a.gate.capture(a.request()).reason,'disposed');
});
test('C12: malformed source or read exception fails without leaking synthetic private data',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.source.readSaved=()=>{throw Error('SYNTHETIC_CANARY_NEVER_EXPORT');};
  const result=f.gate.capture(f.request());
  assert.equal(result.ok,false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_CANARY_NEVER_EXPORT'),false);
  assert.throws(()=>createFixtureCapturePreflight({fixture:false}),/fixture_source_required/);
});

/*
 * C13–C21: adversarial JSON evidence. These cases close lossy comparisons
 * in the TEST-ONLY fixture gate. They do NOT validate real InsightStorage.
 */
test('C13 G2: undefined fields cannot silently equal an omitted saved field',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.data.live.stores.lab_a.unsaved=undefined;
  assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable');
});
test('C14 G2: NaN cannot silently equal JSON null in the persisted snapshot',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.data.saved.stores.lab_a.count=null;
  f.data.live.stores.lab_a.count=NaN;
  assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable');
});
test('C15: Infinity, negative zero and imprecise integers are rejected',()=>{
  for(const suspect of [Infinity,-Infinity,-0,Number.MAX_SAFE_INTEGER+1]){
    const f=harness();
    f.gate.event('auto-delivery');
    f.data.live.stores.lab_a.count=suspect;
    assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable',
      'the fixture must refuse lossy numeric evidence');
  }
});
test('C16 G2: sparse arrays are rejected rather than treated as explicit null',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.data.saved.stores.lab_a.rows=[null];
  f.data.live.stores.lab_a.rows=new Array(1);
  assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable');
});
test('C17: extra array properties cannot be hidden by JSON serialization',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  const rows=[0];
  rows.privateCanary='SYNTHETIC_CANARY';
  f.data.saved.stores.lab_a.rows=[0];
  f.data.live.stores.lab_a.rows=rows;
  const out=f.gate.capture(f.request());
  assert.equal(out.reason,'fixture_evidence_unavailable');
  assert.equal(JSON.stringify(out).includes('SYNTHETIC_CANARY'),false);
});
test('C18: accessor data is rejected without invoking its getter',()=>{
  const f=harness();let getterCalls=0;
  f.gate.event('auto-delivery');
  f.source.readLive=()=>({schemaVersion:1,
    get stores(){getterCalls++;return {lab_a:{count:0}};}});
  assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable');
  assert.equal(getterCalls,0);
});
test('C19: custom toJSON cannot disguise a changed live object',()=>{
  const f=harness();let toJsonCalls=0;
  f.gate.event('auto-delivery');
  f.source.readLive=()=>({
    schemaVersion:1,stores:{lab_a:{count:20}},
    toJSON(){toJsonCalls++;return structuredClone(f.data.saved);}
  });
  assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable');
  assert.equal(toJsonCalls,0);
});
test('C20: non-plain Date objects must not be mistaken for saved timestamp text',()=>{
  const f=harness();
  f.gate.event('auto-delivery');
  f.data.saved.stores.lab_a.modified='2026-10-24T10:59:00.000Z';
  f.data.live.stores.lab_a.modified=new Date('2026-10-24T10:59:00.000Z');
  assert.equal(f.gate.capture(f.request()).reason,'fixture_evidence_unavailable');
});
test('C21: incomplete source-version evidence cannot mint a capture ticket',()=>{
  for(const [patch,expectedReason] of [
    [{weather:''},'storage_not_ready'],
    [{calendar:null},'storage_not_ready'],
    [{registry:undefined},'fixture_evidence_unavailable'],
    [{policy:0},'storage_not_ready']
  ]){
    const f=harness();
    f.gate.event('auto-delivery');
    Object.assign(f.data.report.versions,patch);
    const blocked=f.gate.capture(f.request());
    assert.equal(blocked.ok,false);
    assert.equal(blocked.reason,expectedReason);
  }
});
