const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const resolver=require('../insight_trip_history_resolver_v1.js');
const normalizer=require('../insight_forecast_input_normalizer_proto_v1.js');
const bridge=require('../insight_forecast_conditions_bridge_proto_v1.js');

function insightFixture(){
  return {schemaVersion:1,current:'lab_a',
    salesCountManagement:{categories:[
      {id:'fictional_rice',name:'架空食品',aliases:[],activeTrips:[true,false,false],hidden:false}
    ]},
    eventManagement:{version:1,presets:[],events:[]},
    stores:{lab_a:{name:'架空店舗',events:[],data:{},
      salesCounts:{
        '2026-10-18':{fictional_rice:{trips:[{delivery:0,sales:4},
          {delivery:null,sales:null},{delivery:null,sales:null}]}}
      }}}
  };
}
function normalized(){
  const snapshot=insightFixture();
  const request={kind:'FICTIONAL',schema_version:normalizer.VERSION,
    scope:{store_id:'lab_a',category_id:'fictional_rice',trip:1},
    target_day:'2026-10-24',issued_at:'2026-10-23T10:59:00+09:00',
    manual_target:true,purpose:'current_snapshot',history_days:['2026-10-18']};
  const ctx={snapshot_id:'fictional-snapshot-a',session_id:'fictional-session-a',
    request_id:'fictional-request-a',captured_at:'2026-10-23T10:58:00+09:00',
    revision:5,storage:{pending:false,held:false,conflict:false},
    today:'2026-10-23',resolver};
  return normalizer.buildFictionalInput(snapshot,request,ctx);
}
function recordRef(label,source=null){
  return {snapshot_id:'fictional-snapshot-a',
    local_locator:['fictional','target','2026-10-24',label],source_id:source};
}
function cover(){
  return {store:'lab_a',category:'fictional_rice',
    start_day:'2026-10-24',end_day:'2026-10-24'};
}
function targetEvidence(){
  return {kind:'FICTIONAL_TARGET_EVIDENCE_V0',
    target_day:'2026-10-24',
    scope:{store_id:'lab_a',category_id:'fictional_rice',trip:1},
    calendar:{state:'non_holiday',version:'fictional-calendar-v1',
      coverage:cover(),record_ref:recordRef('calendar'),
      known_at:'2026-10-23T10:00:00+09:00'},
    sale:{state:'unknown',coverage:cover(),
      record_ref:recordRef('sale-confirmation'),known_at:null},
    event:{state:'unknown',coverage:cover(),
      record_ref:recordRef('event-confirmation'),known_at:null},
    registries:{
      common:{ledger:'common',read_state:'ok',coverage:cover(),
        record_ref:recordRef('common'),known_at:null,omission_rule:null,records:[]},
      store:{ledger:'store',read_state:'ok',coverage:cover(),
        record_ref:recordRef('store'),known_at:null,omission_rule:null,records:[]}
    },
    policy:{allowed_omission_rules:[]}};
}
const convert=(e=normalized(),t)=>bridge.toConditionInputDTO(e,t);

test('B01: Normalizer出力とlab ConditionRequestの架空scope・ID・時刻を型対応',()=>{
  const e=normalized(),dto=convert(e);
  assert.equal(bridge.INPUT_VERSION,normalizer.VERSION);
  assert.equal(dto.request.schema_version,'fictional-forecast-conditions-v1');
  assert.deepEqual(dto.request.scope,{store:'lab_a',category:'fictional_rice',trip:1});
  assert.deepEqual([
    dto.request.request_id,dto.request.snapshot_id,
    dto.request.captured_at,dto.request.issued_at,dto.request.target_day,
    dto.request.kind,dto.request.purpose
  ],[
    e.request_id,e.snapshot.snapshot_id,e.snapshot.captured_at,e.issued_at,
    e.target_day,'FICTIONAL','current_snapshot'
  ]);
  assert.deepEqual(Object.keys(dto).sort(),
    ['request','policy','calendar','sale','event','registries'].sort());
});

test('B02: デフォルトは対象日の台帳・暦が未取得。過去の無登録を未来の不在証明に流用しない',()=>{
  const dto=convert();
  assert.equal(dto.calendar.state,'unknown');
  assert.equal(dto.calendar.version,null);
  assert.equal(dto.sale.state,'unknown');
  assert.equal(dto.event.state,'unknown');
  assert.deepEqual(dto.registries.map(x=>x.read_state),['unavailable','unavailable']);
  assert.ok(dto.registries.every(x=>x.records.length===0&&x.omission_rule===null));
  assert.equal(Object.hasOwn(dto,'eligibility'),false);
  assert.equal(Object.hasOwn(dto,'forecast_status'),false);
});

test('B03: lab ConditionInputの6フィールド群を揃え、保存rawへ書き込まない',()=>{
  const e=normalized(),original=JSON.stringify(e),dto=convert(e);
  assert.deepEqual(Object.keys(dto.policy).sort(),
    ['id','version','event_mapping','allowed_omission_rules'].sort());
  assert.equal(dto.policy.id,'registered_conditions_only');
  assert.equal(dto.policy.version,'fictional-registered-conditions-v1');
  assert.equal(dto.policy.event_mapping,'fictional-all-registered-types-v1');
  assert.deepEqual(dto.policy.allowed_omission_rules,[]);
  assert.deepEqual(dto.registries.map(x=>x.ledger),['common','store']);
  assert.deepEqual(Object.keys(dto.calendar).sort(),
    ['state','version','coverage','ref','known_at'].sort());
  assert.deepEqual(Object.keys(dto.sale).sort(),
    ['state','coverage','ref','known_at'].sort());
  assert.equal(JSON.stringify(e),original);
});

test('B04: 対象日の明示的な架空根拠だけをlab向けDTOに変換する',()=>{
  const src=targetEvidence(),before=JSON.stringify(src),dto=convert(normalized(),src);
  assert.equal(dto.calendar.state,'non_holiday');
  assert.equal(dto.calendar.version,'fictional-calendar-v1');
  assert.equal(dto.registries[0].read_state,'ok');
  assert.equal(dto.registries[1].read_state,'ok');
  assert.equal(dto.registries[0].coverage.start_day,'2026-10-24');
  assert.equal(dto.calendar.known_at,'2026-10-23T10:00:00+09:00');
  assert.equal(JSON.stringify(src),before);
  assert.equal(Object.hasOwn(dto,'eligibility'),false); // evaluator only
});

test('B05: 登録セールのevent_typeと対象category、元ID、時刻を保持',()=>{
  const t=targetEvidence();
  t.registries.common.records=[{event_type:'sale',applicability:'applies',
    record_ref:recordRef('sale-one','saved-sale-id'),known_at:'2026-10-23T09:00:00+09:00'}];
  const dto=convert(normalized(),t),item=dto.registries[0].records[0];
  assert.deepEqual(item,{event_type:'sale',applicability:'applies',
    ref:recordRef('sale-one','saved-sale-id'),known_at:'2026-10-23T09:00:00+09:00'});
  assert.equal(dto.sale.state,'unknown'); // registration and external confirmation are separate
});

test('B06: scope/日付が異なる別店舗の証拠を混入させない',()=>{
  const t=targetEvidence();t.scope.store_id='lab_b';
  assert.throws(()=>convert(normalized(),t),/target_evidence_scope_or_shape/);
  const t2=targetEvidence();t2.target_day='2026-10-25';
  assert.throws(()=>convert(normalized(),t2),/target_evidence_scope_or_shape/);
  const t3=targetEvidence();t3.calendar.coverage.store='lab_b';
  assert.throws(()=>convert(normalized(),t3),/invalid_explicit_coverage/);
});

test('B07: 参照するsnapshot IDと重複したlocal_locatorを拒否する',()=>{
  const t=targetEvidence();t.calendar.record_ref.snapshot_id='other-snapshot';
  assert.throws(()=>convert(normalized(),t),/invalid_record_ref/);
  const t2=targetEvidence();
  t2.sale.record_ref.local_locator=t2.calendar.record_ref.local_locator.slice();
  assert.throws(()=>convert(normalized(),t2),/duplicate_record_ref/);
});

test('B08: unknown/omitted/invalid台帳をokへ自動昇格させない',()=>{
  const t=targetEvidence();t.registries.store.read_state='omitted';
  assert.equal(convert(normalized(),t).registries[1].read_state,'omitted');
  assert.equal(convert(normalized(),t).registries[1].omission_rule,null);
  t.registries.store.read_state='invalid';
  assert.equal(convert(normalized(),t).registries[1].read_state,'invalid');
  t.registries.store.records=[{event_type:'sale',applicability:'applies',
    record_ref:recordRef('invalid-item'),known_at:null}];
  assert.throws(()=>convert(normalized(),t),/invalid_target_registry/);
});

test('B09: 旧台帳省略を許可するのは明示ポリシーのみ',()=>{
  const t=targetEvidence();
  t.policy.allowed_omission_rules=['fictional-legacy-optional-ledgers-v1'];
  t.registries.common.read_state='omitted';
  t.registries.common.omission_rule='fictional-legacy-optional-ledgers-v1';
  const dto=convert(normalized(),t);
  assert.deepEqual(dto.policy.allowed_omission_rules,['fictional-legacy-optional-ledgers-v1']);
  assert.equal(dto.registries[0].omission_rule,'fictional-legacy-optional-ledgers-v1');
  t.policy.allowed_omission_rules=['automatically_assume_absence'];
  assert.throws(()=>convert(normalized(),t),/unsupported_omission_policy/);
});

test('B10: historic replayではunknown時点・暦・台帳を過去の既知情報に昇格しない',()=>{
  const envelope=normalized();
  envelope.purpose='historical_replay';
  envelope.issued_at='2026-10-20T09:00:00+09:00';
  const dto=convert(envelope);
  assert.equal(dto.request.purpose,'historical_replay');
  assert.equal(dto.calendar.known_at,null);
  assert.equal(dto.registries[0].known_at,null);
  assert.equal(dto.registries[1].known_at,null);
  assert.equal(dto.calendar.state,'unknown');
});

test('B11: 未知の時刻を捏造せず、未来公表の時刻があっても変更しない',()=>{
  const t=targetEvidence();
  t.calendar.known_at='2026-10-25T10:00:00+09:00'; // lab evaluator must mark not known at issue.
  const dto=convert(normalized(),t);
  assert.equal(dto.calendar.known_at,'2026-10-25T10:00:00+09:00');
  assert.throws(()=>convert(normalized(),{...targetEvidence(),
    calendar:{...targetEvidence().calendar,known_at:'2026-10-23T25:00:00+09:00'}}),
    /invalid_target_evidence/);
});

test('B12: 異なるschema・保存競合・期限不整合のEnvelopeを拒否',()=>{
  const e=normalized();
  assert.throws(()=>convert({...e,kind:'REAL'}),/invalid_insight_envelope/);
  assert.throws(()=>convert({...e,schema_version:'v99'}),/invalid_insight_envelope/);
  assert.throws(()=>convert({...e,snapshot:{...e.snapshot,pending:true}}),/invalid_snapshot_or_history/);
  assert.throws(()=>convert({...e,snapshot:{...e.snapshot,conflict:true}}),/invalid_snapshot_or_history/);
  assert.throws(()=>convert({...e,snapshot:{...e.snapshot,captured_at:'2026-10-23T11:30:00+09:00'}}),
    /invalid_request_metadata/);
});

test('B13: 歴史レコードのscope混入や対象日を含んだhistoryを拒否',()=>{
  const e=normalized();
  e.history[0].scope.store_id='lab_b';
  assert.throws(()=>convert(e),/invalid_snapshot_or_history/);
  const e2=normalized();e2.history[0].date=e2.target_day;
  assert.throws(()=>convert(e2),/invalid_snapshot_or_history/);
});

test('B14: 未対応イベント種別をそのまま保持しlab側でundeterminedと判定可能にする',()=>{
  const t=targetEvidence();t.registries.store.records=[
    {event_type:'new_event_type',applicability:'applies',
      record_ref:recordRef('item'),known_at:null}];
  const dto=convert(normalized(),t);
  assert.equal(dto.registries[1].records[0].event_type,'new_event_type');
  assert.equal(Object.hasOwn(dto,'eligibility'),false);
  t.registries.store.records[0].event_type='';
  assert.throws(()=>convert(normalized(),t),/invalid_target_registry_item/);
  t.registries.store.records[0].event_type='sale';
  t.registries.store.records[0].applicability='not_sure';
  assert.throws(()=>convert(normalized(),t),/invalid_target_registry_item/);
  t.registries.store.records[0].applicability='unknown';
  assert.equal(convert(normalized(),t).registries[1].records[0].applicability,'unknown');
});

test('B15: 固有の原資料参照は配列のコピーでありDTO変更で元根拠は不変',()=>{
  const t=targetEvidence(),dto=convert(normalized(),t);
  dto.calendar.ref.local_locator.push('changed');
  assert.deepEqual(t.calendar.record_ref.local_locator,['fictional','target','2026-10-24','calendar']);
  dto.policy.allowed_omission_rules.push('temp');
  assert.deepEqual(t.policy.allowed_omission_rules,[]);
});

test('B16: I/O・画面操作・ストレージ・予測エンジンに接続しない',()=>{
  const script=fs.readFileSync(require.resolve('../insight_forecast_conditions_bridge_proto_v1.js'),'utf8');
  const sandbox={window:{}};
  vm.runInNewContext(script,sandbox);
  assert.equal(typeof sandbox.window.InsightFictionalConditionBridgePrototype.toConditionInputDTO,
    'function');
  assert.ok(!/localStorage\.|fetch\(|XMLHttpRequest|\.setItem\(|console\.|document\.|importScripts\(/.test(script));
  assert.ok(!script.includes('insight_v11'));
  assert.ok(!/predict\(/.test(script));
});

test('B17: 明示した架空対象日の根拠にcoverageがなければ推測で補完しない',()=>{
  const t=targetEvidence();
  delete t.calendar.coverage;
  assert.throws(()=>convert(normalized(),t),/invalid_target_evidence/);
  const t2=targetEvidence();
  delete t2.registries.common.coverage;
  assert.throws(()=>convert(normalized(),t2),/invalid_target_registry/);
  const t3=targetEvidence();
  delete t3.sale.coverage;
  assert.throws(()=>convert(normalized(),t3),/invalid_target_evidence/);
});

test('B18: 別日付の登録証拠の範囲を勝手に予測対象日へ拡張しない',()=>{
  const t=targetEvidence();
  t.registries.store.coverage.start_day='2026-10-17';
  t.registries.store.coverage.end_day='2026-10-18';
  const dto=convert(normalized(),t);
  assert.deepEqual([dto.registries[1].coverage.start_day,dto.registries[1].coverage.end_day],
    ['2026-10-17','2026-10-18']);
  assert.equal(dto.request.target_day,'2026-10-24');
  // Lab evaluates uncovered registry as undetermined; the Bridge never expands coverage.
  assert.equal(Object.hasOwn(dto,'eligibility'),false);
});
