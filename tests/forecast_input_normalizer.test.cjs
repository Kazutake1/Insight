const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const resolver=require('../insight_trip_history_resolver_v1.js');
const proto=require('../insight_forecast_input_normalizer_proto_v1.js');
function fixture(){
  return {current:'lab_a',schemaVersion:1,
    salesCountManagement:{categories:[
      {id:'fictional_food',name:'架空食品',aliases:['旧架空食品'],activeTrips:[true,false,false],hidden:false},
      {id:'fictional_drinks',name:'架空飲料',aliases:[],activeTrips:[true,true,true],hidden:false}
    ]},
    eventManagement:{version:1,presets:[],events:[]},
    stores:{
      lab_a:{name:'架空A店',events:[],
        salesCounts:{
          '2026-10-18':{fictional_food:{trips:[{delivery:0,sales:5},
            {delivery:null,sales:null},{delivery:null,sales:null}]}},
          '2026-10-19':{fictional_food:{trips:[{delivery:null,sales:0},
            {delivery:null,sales:null},{delivery:null,sales:null}]}},
          '2026-09-20':{fictional_food:{trips:[{delivery:0,sales:0},
            {delivery:null,sales:null},{delivery:null,sales:null}]}}
        },
        data:{2026:{'10月':[{d:'18',weather:'晴',tempMaxC:0,tempMinC:-2},
          {d:'19',weather:'雨',tempMaxC:20,tempMinC:10}]}}}
    }
  };
}
function ctx(){
  return {snapshot_id:'fictional-snapshot-a',session_id:'fictional-session-a',
    request_id:'fictional-request-a',captured_at:'2026-10-23T10:58:00+09:00',
    revision:4,storage:{pending:false,held:false,conflict:false},today:'2026-10-23',resolver};
}
function req(days=['2026-10-18','2026-10-19']){
  return {kind:'FICTIONAL',schema_version:proto.VERSION,
    scope:{store_id:'lab_a',category_id:'fictional_food',trip:1},
    target_day:'2026-10-24',issued_at:'2026-10-23T10:59:00+09:00',
    manual_target:true,purpose:'current_snapshot',history_days:days};
}
function build(s=fixture(),r=req(),c=ctx()){return proto.buildFictionalInput(s,r,c);}
test('F01: 明示0・納品欠損を独立扱いし、架空snapshotを書き換えない',()=>{
  const s=fixture(),before=JSON.stringify(s),out=build(s);
  assert.equal(out.kind,'FICTIONAL');
  assert.equal(out.schema_version,proto.VERSION);
  assert.equal(out.history.length,2);
  assert.deepEqual(out.history.map(x=>[x.sales.state,x.sales.value,x.delivery.state,x.delivery.value]),
    [['entered',5,'entered',0],['entered',0,'missing',null]]);
  assert.equal(out.history[0].sales.available_at,null);
  assert.equal(out.history[1].delivery.available_at,null);
  assert.equal(out.history[1].sales.value,0);
  assert.equal(JSON.stringify(s),before);
});
test('F02: 原保存値の不正状態をnullへ正規化するが原値を変更しない',()=>{
  const s=fixture();s.stores.lab_a.salesCounts['2026-10-18'].fictional_food.trips[0].sales=-1;
  const before=JSON.stringify(s),o=build(s).history[0];
  assert.deepEqual([o.sales.state,o.sales.value,o.sales.reason],
    ['invalid',null,'non_negative_safe_integer_required']);
  assert.equal(o.delivery.value,0);
  assert.equal(JSON.stringify(s),before);
  s.stores.lab_a.salesCounts['2026-10-18'].fictional_food.trips[0].sales='5';
  assert.equal(build(s).history[0].sales.state,'invalid');
  s.stores.lab_a.salesCounts['2026-10-18'].fictional_food={trips:[]};
  assert.deepEqual([build(s).history[0].sales.state,build(s).history[0].delivery.state],
    ['invalid','invalid']);
});
test('F03: 保存データが無い場合は0補完せずmissingと日別判定を分離',()=>{
  const o=build(fixture(),req(['2026-10-17'])).history[0];
  assert.equal(o.sales.state,'missing');
  assert.equal(o.delivery.state,'missing');
  assert.equal(o.sales.value,null);
  assert.equal(o.trip_resolution.status,'active'); // Current setting, not input evidence.
});
test('F04: 曜日をISO 1-7へ変換し、日付・Scopeを混在させない',()=>{
  const rows=build().history;
  assert.deepEqual(rows.map(x=>x.iso_weekday),[7,1]);
  assert.ok(rows.every(x=>x.scope.store_id==='lab_a'&&x.scope.category_id==='fictional_food'&&x.scope.trip===1));
  assert.throws(()=>build(fixture(),{...req(),scope:{...req().scope,store_id:'lab_b'}}),/unknown_scope/);
  assert.throws(()=>build(fixture(),{...req(),scope:{...req().scope,trip:4}}),/invalid_scope/);
  assert.throws(()=>build(fixture(),{...req(),history_days:['2026-10-18','2026-10-18']}),/invalid_history_days/);
  assert.throws(()=>build(fixture(),{...req(),history_days:['2026-10-24']}),/invalid_history_days/);
  assert.throws(()=>build(fixture(),{...req(),target_day:'2026-02-30'}),/invalid_request/);
});
test('F05: 手動で既定納品日を選んでもmanual_target=trueをそのまま保持',()=>{
  const out=build();
  assert.equal(out.target_day,'2026-10-24');
  assert.equal(out.manual_target,true);
  const changed=build(fixture(),{...req(),manual_target:false});
  assert.equal(changed.manual_target,false);
  assert.throws(()=>build(fixture(),{...req(),manual_target:null}),/invalid_request/);
  assert.throws(()=>build(fixture(),{...req(),issued_at:'2026-10-23T25:59:00+09:00'}),/invalid_request/);
});
test('F06: 過去便のobserved_dayと月次manual根拠・保存済み0・競合を保持',()=>{
  const s=fixture();s.stores.lab_a.tripHistoryOverrides={version:1,
    categories:{fictional_food:{'2026-09':{'1':'inactive','2':'inactive','3':'inactive'}}}};
  const row=build(s,req(['2026-09-20'])).history[0];
  assert.deepEqual([row.sales.state,row.sales.value,row.delivery.value],['entered',0,0]);
  assert.equal(row.trip_resolution.status,'active');
  assert.equal(row.trip_resolution.source,'observed_day');
  assert.equal(row.trip_resolution.conflict,true);
  // A saved 0 conflicts with an older manual "inactive" override.
  // The real monthly resolver correctly reports a conflict (unknown), not inactive.
  assert.equal(row.trip_resolution.monthly_basis.status,'unknown');
  assert.equal(row.trip_resolution.monthly_basis.source,'conflict');
  assert.equal(row.trip_resolution.monthly_basis.needsDateReview,true);
});
test('F07: Resolver例外や未知状態を対象外と推定せずunknownにする',()=>{
  for(const candidate of [
    {resolveDate(){throw Error('no resolver');}},
    {resolveDate(){return {trips:[{status:'SOMETHING',source:'current'}]};}}
  ]){
    const row=build(fixture(),req(['2026-10-18']),{...ctx(),resolver:candidate}).history[0];
    assert.equal(row.trip_resolution.status,'unknown');
    assert.equal(row.trip_resolution.source,'unavailable');
    assert.equal(row.trip_resolution.issue,'resolver_unavailable_or_invalid');
    assert.equal(row.sales.value,5);
  }
});
test('F08: 保存済み天気表記と気温を残し、出典不明時刻を捏造しない',()=>{
  const rows=build().history;
  assert.equal(rows[0].weather.kind,'saved_unspecified');
  assert.equal(rows[0].weather.weather_text,'晴');
  assert.deepEqual([rows[0].weather.temp_max.value,rows[0].weather.temp_min.value],[0,-2]);
  assert.equal(rows[0].weather.temperature_pair_state,'valid');
  assert.equal(rows[0].weather.code_system,null);
  assert.equal(rows[0].weather.issued_at,null);
  assert.equal(rows[0].weather.available_at,null);
  assert.equal(rows[0].weather.temp_min.available_at,null);
  const s=fixture();s.stores.lab_a.data[2026]['10月'][0].tempMaxC=-10;
  assert.equal(build(s).history[0].weather.temperature_pair_state,'reversed');
  assert.equal(build(fixture(),req(['2026-10-17'])).history[0].weather.kind,'unknown');
});
test('F09: セールの旧形式categoryを一意に解決し、対象外の登録も消さない',()=>{
  const s=fixture();s.eventManagement.events=[
    {id:'fictional-sale',type:'sale',scope:'global',startDate:'2026-10-18',
      endDate:'2026-10-19',snapshot:{version:1,title:'架空セール',
        sale:{category:'旧架空食品',method:'amount',params:{amount:10}}}}
  ];
  const o=build(s);
  assert.equal(o.history[0].registries[0].read_state,'ok');
  assert.deepEqual(o.history[0].registries[0].records.map(x=>x.applicability),['applies']);
  const other=build(s,{...req(),scope:{...req().scope,category_id:'fictional_drinks'}});
  assert.equal(other.history[0].registries[0].records[0].applicability,'not_applies');
  assert.equal(other.history[0].registries[0].records[0].event_type,'sale');
  assert.equal(o.history[0].condition_eligibility,'not_evaluated');
});
test('F10: category不明の店舗イベントは適用不明、双方の台帳省略は空確認と別',()=>{
  const s=fixture();s.stores.lab_a.events=[
    {id:'fictional-nearby',type:'nearby',scope:'store',
      startDate:'2026-10-18',endDate:'2026-10-18',
      snapshot:{version:1,title:'架空イベント'}}];
  let row=build(s).history[0];
  assert.equal(row.registries[1].records[0].applicability,'unknown');
  assert.equal(row.registries[0].read_state,'ok');
  delete s.eventManagement;delete s.stores.lab_a.events;
  row=build(s).history[0];
  assert.deepEqual(row.registries.map(x=>x.read_state),['omitted','omitted']);
  assert.ok(row.registries.every(x=>x.omission_rule===null));
  s.stores.lab_a.events={broken:true};
  row=build(s).history[0];
  assert.equal(row.registries[1].read_state,'invalid');
});
test('F11: 証拠IDがない保存数値にはsnapshot+local_locatorを付ける',()=>{
  const row=build().history[0];
  assert.equal(row.sales.record_ref.snapshot_id,'fictional-snapshot-a');
  assert.deepEqual(row.sales.record_ref.local_locator,[
    'stores','lab_a','salesCounts','2026-10-18','fictional_food','trips','0','sales']);
  assert.equal(row.sales.record_ref.source_id,null);
  assert.equal(row.weather.record_ref.source_id,null);
  assert.equal(row.registries[0].record_ref.source_id,null);
});
test('F12: 保存中/競合/スキーマ不正・本番入力で要求を発行しない',()=>{
  const s=fixture(),r=req(),c=ctx();
  for(const flag of ['pending','held','conflict']){
    assert.throws(()=>build(s,r,{...c,storage:{...c.storage,[flag]:true}}),/unsafe_storage_state/);
  }
  assert.throws(()=>build(s,{...r,kind:'REAL'}),/fictional_contract_only/);
  assert.throws(()=>build(s,r,{...c,snapshot_id:''}),/invalid_snapshot_identity/);
  assert.throws(()=>build(s,r,{...c,resolver:null}),/resolver_required/);
  assert.throws(()=>build(s,{...r,history_days:Array.from({length:43},(_,i)=>
    new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10))}),/invalid_history_days/);
});
test('F13: 過去再現をREADYと宣言せず、知得時刻nullを維持',()=>{
  const r={...req(['2026-09-20']),purpose:'historical_replay',issued_at:'2026-09-21T10:00:00+09:00'};
  const o=build(fixture(),r);
  assert.equal(o.purpose,'historical_replay');
  assert.equal(o.history[0].sales.available_at,null);
  assert.equal(o.history[0].registries[0].known_at,null);
  assert.equal(o.history[0].holiday.state,'unknown');
  assert.equal(o.forecast_status,'not_evaluated');
  assert.equal(o.freshness,'not_checked');
});
test('F14: Node・ブラウザー互換でI/O・UI・保存APIを呼び出さない',()=>{
  const script=fs.readFileSync(require.resolve('../insight_forecast_input_normalizer_proto_v1.js'),'utf8');
  const sandbox={window:{}};
  vm.runInNewContext(script,sandbox);
  assert.equal(typeof sandbox.window.InsightForecastInputNormalizerPrototype.buildFictionalInput,'function');
  assert.ok(!/localStorage\.|fetch\(|XMLHttpRequest|\.setItem\(|console\.|document\./.test(script));
  assert.ok(!script.includes('insight_v11'));
  assert.ok(!script.includes('INSIGHT_MEMORY.md'));
});
