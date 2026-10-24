'use strict';
/*
 * STEP2 vs STEP4: synthetic-only compatibility/regression tests.
 * This is an evidence-boundary probe, NOT a production adapter or readiness gate.
 * No real store IDs, persisted records, UI, weather request, network or LLM.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const health=require('../insight_prediction_data_health_v1.js');
const resolver=require('../insight_trip_history_resolver_v1.js');
const normalizer=require('../insight_forecast_input_normalizer_proto_v1.js');
const bridge=require('../insight_forecast_conditions_bridge_proto_v1.js');

const STORE='lab_a',CATEGORY='fictional_rice',TARGET='2026-10-24',ISSUED='2026-10-23T10:59:00+09:00';
const HISTORY=['2026-10-18','2026-10-19'];
const scope=()=>({store_id:STORE,category_id:CATEGORY,trip:1});
function synthetic(){
  const rows=Array.from({length:31},(_,i)=>({
    d:String(i+1),客数:0,weather:'',tempMaxC:null,tempMinC:null
  }));
  rows[17]={d:'18',客数:0,weather:'晴',tempMaxC:0,tempMinC:-2};
  rows[18]={d:'19',客数:18,weather:'雨',tempMaxC:20,tempMinC:10};
  return {
    schemaVersion:1,current:STORE,
    salesCountManagement:{categories:[{
      id:CATEGORY,name:'架空食品',activeTrips:[true,false,false],aliases:[],hidden:false
    }]},
    eventManagement:{version:1,presets:[],events:[]},
    stores:{
      lab_a:{name:'架空店A',events:[],data:{2026:{'10月':rows}},salesCounts:{
        '2026-10-18':{fictional_rice:{trips:[
          {sales:0,delivery:0},{sales:null,delivery:null},{sales:null,delivery:null}
        ]}},
        '2026-10-19':{fictional_rice:{trips:[
          {sales:5,delivery:null},{sales:null,delivery:null},{sales:null,delivery:null}
        ]}}
      }}
    }
  };
}
function examine(snapshot, start='2026-10-18',end='2026-10-19'){
  return health.examine(snapshot,{start,end,today:'2026-10-23'});
}
function normalize(snapshot,history=HISTORY){
  return normalizer.buildFictionalInput(snapshot,{
    kind:'FICTIONAL',schema_version:normalizer.VERSION,scope:scope(),
    target_day:TARGET,issued_at:ISSUED,manual_target:true,
    purpose:'current_snapshot',history_days:history
  },{
    session_id:'synthetic-session',request_id:'synthetic-request',snapshot_id:'synthetic-snapshot',
    captured_at:'2026-10-23T10:58:00+09:00',
    revision:1,today:'2026-10-23',
    storage:{pending:false,held:false,conflict:false},resolver
  });
}
test('Q01: STEP2 and STEP4 preserve 0 versus missing for identical fictional saved records',()=>{
  const snapshot=synthetic(),before=JSON.stringify(snapshot);
  const report=examine(snapshot),rows=normalize(snapshot).history;
  const first=report.stores[0].categories[0];
  assert.deepEqual([first.trips[0].sales,first.trips[0].delivery,first.trips[0].both,first.trips[0].zeroSales],[2,1,1,1]);
  assert.deepEqual(rows.map(r=>[r.date,r.sales.state,r.sales.value,r.delivery.state,r.delivery.value]),[
    ['2026-10-18','entered',0,'entered',0],
    ['2026-10-19','entered',5,'missing',null]
  ]);
  assert.equal(JSON.stringify(snapshot),before);
});
test('Q02: all-active trip period does NOT imply all days have complete sales/delivery',()=>{
  const report=examine(synthetic()).stores[0].categories[0];
  assert.equal(report.trips[0].periodStatus,'all_active');
  assert.equal(report.completeDays,1);
  assert.equal(report.incompleteDays,1);
  assert.equal(report.trips[0].both,1);
  assert.equal(report.trips[0].sales,2);
  const rows=normalize(synthetic()).history;
  assert.equal(rows[1].delivery.state,'missing');
});
test('Q03: customer zero stays uncertain and STEP4 Normalizer does not fabricate customer observation',()=>{
  const snapshot=synthetic(),report=examine(snapshot).stores[0],rows=normalize(snapshot).history;
  assert.equal(report.customersPositive,1);
  assert.equal(report.customersUncertain,1);
  assert.equal(report.weatherWithCustomer,1);
  assert.ok(rows.every(r=>!Object.hasOwn(r,'customers')&&!Object.hasOwn(r,'customer_count')));
});
test('Q04: valid 0C and negative temperature remain valid in STEP2 and STEP4',()=>{
  const snapshot=synthetic(),report=examine(snapshot).stores[0],rows=normalize(snapshot).history;
  assert.equal(report.temperature,2);
  assert.equal(rows[0].weather.weather_text,'晴');
  assert.equal(rows[0].weather.temp_max.value,0);
  assert.equal(rows[0].weather.temp_min.value,-2);
  assert.equal(rows[0].weather.temperature_pair_state,'valid');
  assert.equal(rows[0].weather.temp_max.available_at,null);
  assert.equal(rows[0].weather.temp_min.available_at,null);
});
test('Q05: reversed, invalid, and missing temperature are not silently accepted as valid',()=>{
  for(const [mutate,step2Key,step4Status,maxStatus] of [
    [s=>{s.stores.lab_a.data[2026]['10月'][17].tempMaxC=-5;},'temperatureReversed','reversed','entered'],
    [s=>{s.stores.lab_a.data[2026]['10月'][17].tempMaxC='bad';},'temperatureInvalid','unknown','invalid'],
    [s=>{s.stores.lab_a.data[2026]['10月'][17].tempMaxC='   ';},'temperatureMissing','unknown','missing']
  ]){
    const snapshot=synthetic();mutate(snapshot);
    const summary=examine(snapshot,'2026-10-18','2026-10-18').stores[0];
    const row=normalize(snapshot,['2026-10-18']).history[0];
    assert.equal(summary[step2Key],1);
    assert.equal(row.weather.temperature_pair_state,step4Status);
    assert.equal(row.weather.temp_max.state,maxStatus);
  }
});
test('Q06: date-position vs explicit d lookup can diverge on a malformed unsorted saved weather array',()=>{
  const snapshot=synthetic();
  const rows=snapshot.stores.lab_a.data[2026]['10月'];
  rows[17]={d:'19',客数:0,weather:'',tempMaxC:null,tempMinC:null};
  rows[18]={d:'18',客数:18,weather:'晴',tempMaxC:0,tempMinC:-2};
  // STEP2 reads array[day-1]; STEP4 searches by each row.d explicitly.
  const summary=examine(snapshot,'2026-10-18','2026-10-18').stores[0];
  const normalized=normalize(snapshot,['2026-10-18']).history[0];
  assert.equal(summary.weather,0);
  assert.equal(summary.temperatureMissing,1);
  assert.equal(normalized.weather.weather_text,'晴');
  assert.equal(normalized.weather.temperature_pair_state,'valid');
  // This discrepancy MUST NOT be interpreted as a valid source identity proof.
});
test('Q07: historical trip conflict is counted for review, even if saved zero exists',()=>{
  const snapshot=synthetic();
  snapshot.stores.lab_a.salesCounts['2026-09-18']={fictional_rice:{trips:[
    {sales:0,delivery:0},{sales:null,delivery:null},{sales:null,delivery:null}
  ]}};
  snapshot.stores.lab_a.tripHistoryOverrides={version:1,categories:{
    fictional_rice:{'2026-09':{'1':'inactive','2':'inactive','3':'inactive'}}
  }};
  const report=examine(snapshot,'2026-09-18','2026-09-18').stores[0].categories[0];
  const row=normalize(snapshot,['2026-09-18']).history[0];
  assert.equal(report.completeDays,0);
  assert.equal(report.reviewDays,1);
  assert.equal(report.trips[0].reviewSaved.sales,1);
  assert.equal(row.sales.state,'entered');
  assert.equal(row.sales.value,0);
  assert.equal(row.trip_resolution.conflict,true);
  assert.equal(row.trip_resolution.needsDateReview,true);
});
test('Q08: summary counts cannot serve as target-day condition evidence or timestamps',()=>{
  const snapshot=synthetic();
  const summary=examine(snapshot);
  const envelope=normalize(snapshot);
  assert.ok(!Object.hasOwn(summary,'snapshot_id'));
  assert.ok(!Object.hasOwn(summary,'issued_at'));
  assert.ok(!Object.hasOwn(summary,'manual_target'));
  assert.ok(!Object.hasOwn(summary,'history'));
  assert.equal(envelope.freshness,'not_checked');
  assert.equal(envelope.forecast_status,'not_evaluated');
  const dto=bridge.toConditionInputDTO(envelope);
  assert.equal(dto.calendar.state,'unknown');
  assert.equal(dto.sale.state,'unknown');
  assert.equal(dto.event.state,'unknown');
  assert.deepEqual(dto.registries.map(r=>r.read_state),['unavailable','unavailable']);
});
test('Q09: STEP2 multi-day summary cannot bypass STEP4 explicit <=42-day history contract',()=>{
  const snapshot=synthetic(),days=Array.from({length:43},(_,i)=>{
    const d=new Date('2026-09-01T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);
    return d.toISOString().slice(0,10);
  });
  const summary=examine(snapshot,'2026-09-01','2026-10-13');
  assert.equal(summary.days,43);
  assert.throws(()=>normalize(snapshot,days),/invalid_history_days/);
});
