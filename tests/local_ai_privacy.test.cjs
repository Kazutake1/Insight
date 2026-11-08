'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {projectForLocalAI}=require('../insight_local_ai_privacy_v1.js');

const input=()=>({
  scope:{store_id:'private-store-777',category_id:'confidential-food',trip:2,
    store_name:'PRIVATE SHOP ADDRESS'},
  history:[
    {date:'2026-10-17',sales:{state:'entered',value:0},
      delivery:{state:'missing',value:null},
      customers:{state:'unknown',value:null},
      temp_max:{state:'entered',value:0},temp_min:{state:'entered',value:-2},
      weather_kind:'clear',holiday:'unknown',sale:'absent',event:'unknown',
      employee_name:'SECRET_EMPLOYEE',raw_note:'PRIVATE_LOCATION'},
    {date:'2026-10-18',sales:{state:'entered',value:15},
      delivery:{state:'entered',value:20},
      customers:{state:'entered',value:170},
      weather_kind:'rain',sale:'present',event:'absent',
      raw_fingerprint:'PRIVATE_FINGERPRINT',event_name:'PRIVATE_EVENT'}
  ],
  shop_address:'PRIVATE_ADDRESS',api_key:'PRIVATE_API_KEY',
  session_id:'PRIVATE_SESSION_ID',raw_storage:'PRIVATE_RAW_STORAGE'
});
test('P01: exact identifiers, full dates, free text, raw and secrets are not copied to local slice',()=>{
  const data=input(),before=JSON.stringify(data),out=projectForLocalAI(data),text=JSON.stringify(out);
  assert.equal(out.processing,'LOCAL_ONLY');
  assert.equal(out.anonymity,'NOT_GUARANTEED');
  assert.deepEqual(out.scope,{store_alias:'store_1',category_alias:'category_1',trip:2});
  assert.equal(out.rows.length,2);
  for(const item of ['private-store-777','confidential-food','2026-10-17','2026-10-18',
    'PRIVATE_', 'SECRET_', 'employee_name','event_name','raw_note','api_key','shop_address','session_id'])
    assert.equal(text.includes(item),false,item);
  assert.equal(JSON.stringify(data),before);
});
test('P02: explicit zero and unentered counts remain distinct, and weekday/month are derived locally',()=>{
  const out=projectForLocalAI(input());
  assert.deepEqual(out.rows[0].sales,{state:'entered',value:0});
  assert.deepEqual(out.rows[0].delivery,{state:'missing',value:null});
  assert.deepEqual(out.rows[0].customers,{state:'unknown',value:null});
  assert.deepEqual([out.rows[0].weekday,out.rows[0].month],[6,10]);
  assert.deepEqual([out.rows[1].weekday,out.rows[1].month],[7,10]);
  assert.deepEqual(out.rows[0].temp_min,{state:'entered',value:-2});
  assert.equal(out.rows[1].holiday,'unknown');
});
test('P03: output is deep-frozen and cannot be mutated into a data exfiltration envelope',()=>{
  const out=projectForLocalAI(input());
  assert.ok(Object.isFrozen(out));
  assert.ok(Object.isFrozen(out.rows));
  assert.ok(Object.isFrozen(out.rows[0].sales));
  assert.throws(()=>{out.rows[0].sales.value=88;},TypeError);
  assert.throws(()=>{out.rows.push({raw:'secret'});},TypeError);
});
test('P04: invalid state/value mismatches, negative counts and unconfirmed 0 fail closed',()=>{
  for(const bad of [
    {state:'missing',value:0},{state:'entered',value:-1},
    {state:'entered',value:1.5},{state:'entered',value:'5'},
    {state:'invalid',value:5},{state:'unknown',value:0},
    {state:'entered',value:Number.POSITIVE_INFINITY}
  ]){
    const x=input();x.history[0].sales=bad;
    assert.throws(()=>projectForLocalAI(x),/invalid_local_ai_projection/);
  }
});
test('P05: unsafe dates, duplicates, mixed ordering, invalid scope and enormous batches are rejected',()=>{
  for(const dates of [
    ['2026-02-30','2026-10-18'],
    ['2026-10-18','2026-10-17'],
    ['2026-10-17','2026-10-17']
  ]){
    const x=input();x.history[0].date=dates[0];x.history[1].date=dates[1];
    assert.throws(()=>projectForLocalAI(x),/invalid_local_ai_projection/);
  }
  const x=input();x.history=Array.from({length:43},()=>structuredClone(x.history[0]));
  assert.throws(()=>projectForLocalAI(x),/invalid_local_ai_projection/);
  const y=input();y.scope.trip='2';
  assert.throws(()=>projectForLocalAI(y),/invalid_local_ai_projection/);
});
test('P06: invalid weather/holiday enum and temperature force rejection; no silent free-text fallback',()=>{
  for(const [key,bad] of [
    ['weather_kind','my home address'],['sale','unconfirmed_absent'],
    ['holiday',false],['temp_max',{state:'entered',value:999}]
  ]){
    const x=input();x.history[0][key]=bad;
    assert.throws(()=>projectForLocalAI(x),/invalid_local_ai_projection/,key);
  }
});
test('P07: malformed input errors do not include sensitive data',()=>{
  const x=input();x.history[0].sales={state:'bad',value:'PRIVATE_SECRET'};
  let err;try{projectForLocalAI(x);}catch(e){err=e;}
  assert.equal(err?.message,'invalid_local_ai_projection');
  assert.equal(JSON.stringify(err).includes('PRIVATE'),false);
});
