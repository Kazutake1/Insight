'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createOperationObserver} = require('../insight_operation_observer_v0.js');

const newReady = () => { const o = createOperationObserver(); assert.equal(o.initialize(), true); return o; };

test('O01: starts UNAVAILABLE and exposes registered-only state, not business fields', () => {
  const o = createOperationObserver();
  assert.deepEqual(o.status(), {scope:'registered-operations-only', state:'UNAVAILABLE', activeCount:0, epoch:0});
  assert.equal(Object.isFrozen(o.status()), true);
  assert.equal(o.initialize(), true);
  assert.equal(o.status().state, 'IDLE_OBSERVED');
});

test('O02: after mocked persisted bytes change, post-write apply remains ACTIVE', () => {
  const o = newReady(), store = {saved:0, live:0};
  const ticket = o.begin('sales_count_save');
  store.saved = 7; // FICTIONAL business operation, NOT an Insight storage write.
  assert.equal(o.status().state, 'ACTIVE');
  assert.equal(store.live, 0);
  store.live = 7;
  assert.equal(o.end(ticket, 'completed'), true);
  assert.equal(o.status().state, 'IDLE_OBSERVED');
  assert.equal(store.saved, store.live);
});

test('O03: failure after a fictional persisted write remains sticky HELD after later success', () => {
  const o = newReady(), t = o.begin('sales_count_save');
  assert.equal(o.end(t, 'failed'), true);
  const after = o.status();
  assert.equal(after.state, 'HELD');
  const t2 = o.begin('sales_category_save');
  assert.equal(o.status().state, 'HELD');
  assert.equal(o.end(t2, 'completed'), true);
  assert.equal(o.status().state, 'HELD');
});

test('O04: two concurrent operations track accurate tokens and failed one holds globally', () => {
  const o = newReady();
  const a = o.begin('sales_count_save'), b = o.begin('sales_category_save');
  assert.equal(o.status().activeCount,2);
  assert.equal(o.end(a, 'failed'),true);
  assert.equal(o.status().activeCount,1);
  assert.equal(o.status().state,'HELD');
  assert.equal(o.end(b, 'completed'),true);
  assert.equal(o.status().activeCount,0);
  assert.equal(o.status().state,'HELD');
});

test('O05: duplicate, unknown, and cross-session token cannot decrement live operations', () => {
  const o = newReady(), other = newReady();
  const a = o.begin('sales_count_save'), b = other.begin('sales_count_save');
  assert.equal(o.end(b,'completed'),false);
  assert.equal(o.status().activeCount,1);
  assert.equal(o.end(a,'completed'),true);
  assert.equal(o.end(a,'completed'),false);
  assert.equal(o.status().activeCount,0);
  assert.equal(o.status().state,'HELD');
  assert.equal(other.end(b,'completed'),true);
});

test('O06: invalid/unknown operation kinds and outcomes fail closed without returning original values', () => {
  const o = newReady();
  assert.equal(o.begin({storeId:'fictional-store'}),null);
  assert.equal(o.status().state,'HELD');
  const t = o.begin('sales_count_save');
  assert.equal(o.end(t,'magically-clean'),false);
  assert.equal(o.status().state,'HELD');
  const serialized = JSON.stringify(o.status());
  assert.doesNotMatch(serialized,/storeId|saved|live|raw|data|authorized_for_model|full_app_clean/);
});

test('O07: cancellation before any mutation can return to registered IDLE, not app CLEAN', () => {
  const o = newReady(), t = o.begin('sales_count_save');
  assert.equal(o.end(t,'cancelled_before_mutation'),true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal(o.status().scope,'registered-operations-only');
});

test('O08: cancelled-after-partial writes and unknown outcomes stay HELD', () => {
  const o = newReady(), t = o.begin('sales_category_save');
  assert.equal(o.end(t,'partial'),true);
  assert.equal(o.status().state,'HELD');
  const t2=o.begin('sales_category_save');
  assert.equal(o.end(t2,'unknown'),true);
  assert.equal(o.status().state,'HELD');
});

test('O09: epoch overflow does not wrap and permanently invalidates status', () => {
  const o = createOperationObserver({maxEpoch:2});
  assert.equal(o.initialize(),true); // epoch 1
  const t=o.begin('sales_count_save'); // epoch 2
  assert.ok(t);
  assert.equal(o.end(t,'completed'),false); // overflow detected
  assert.deepEqual({state:o.status().state,active:o.status().activeCount,epoch:o.status().epoch},
    {state:'HELD',active:0,epoch:2});
  assert.equal(o.begin('sales_count_save'),null);
});

test('O10: lifecycle invalidation never self-resets, even with an active operation', () => {
  const o = newReady(), t=o.begin('sales_count_save');
  assert.equal(o.invalidate(),true);
  assert.equal(o.status().state,'HELD');
  assert.equal(o.status().activeCount,1);
  assert.equal(o.end(t,'completed'),true);
  assert.equal(o.status().state,'HELD');
  assert.equal(o.initialize(),false);
});

test('O11: simulated failed original operation propagates unchanged through manual caller', () => {
  const o = newReady(), original = new Error('FICTIONAL failure');
  const oldFunction = () => { throw original; };
  function caller(){const token=o.begin('sales_count_save');try {return oldFunction();}
    catch(e) {o.end(token,'failed');throw e;} }
  assert.throws(caller,e=>e===original);
  assert.equal(o.status().state,'HELD');
});

test('O12: caller after all applied DOM updates ends registered operation, and does not certify other editors',()=>{
  const o = newReady(), token=o.begin('sales_category_save');
  const category = {saved:'FICTIONAL', applied:false, rendered:false};
  category.applied=true;
  assert.equal(o.status().state,'ACTIVE');
  category.rendered=true;
  assert.equal(o.end(token,'completed'),true);
  assert.equal(category.rendered,true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal('authorized_for_model' in o.status(),false);
});

// These are self-contained FICTIONAL harness tests. They do not instrument
// Insight or claim that its actual callbacks have these boundaries.
function safeFictionalCaller(observer, kind, operation) {
  let token = null;
  let observerBroken = false;
  const invalidate = () => {
    observerBroken = true;
    try { observer?.invalidate?.(); } catch (_) {}
  };
  try {
    token = observer?.begin?.(kind) ?? null;
    if (token === null) invalidate();
  } catch (_) { invalidate(); }
  let outcome = 'unknown';
  try {
    const result = operation();
    outcome = 'completed';
    return result;
  } catch (error) {
    outcome = 'failed';
    throw error;
  } finally {
    if (token !== null) {
      try { if (!observer.end(token, outcome)) invalidate(); }
      catch (_) { invalidate(); }
    }
  }
}

test('O13: observer factory handles hostile maxEpoch access as HELD, never throws',()=>{
  const hostile = new Proxy({}, {get(){throw new Error('FICTIONAL config trap');},
    getOwnPropertyDescriptor(){throw new Error('FICTIONAL descriptor trap');}});
  const observer = assert.doesNotThrow(()=>createOperationObserver(hostile));
  assert.equal(observer, undefined); // doesNotThrow returns no value
  const o = createOperationObserver(hostile);
  assert.equal(o.status().state,'HELD');
  assert.equal(o.initialize(),false);
});

test('O14: invalid maxEpoch cannot be silently accepted as a normal session',()=>{
  for (const option of [null, 'malformed', {maxEpoch:0}, {maxEpoch:NaN}, {maxEpoch:2.4}]) {
    const o=createOperationObserver(option);
    assert.equal(o.status().state,'HELD');
    assert.equal(o.initialize(),false);
  }
});

test('O15: a throwing observer begin does not prevent fictional original callback once',()=>{
  let calls=0, invalidated=0;
  const throwing={begin(){throw Error('FICTIONAL observer unavailable');},
    invalidate(){invalidated++;}};
  const result=safeFictionalCaller(throwing,'sales_count_save',()=>{calls++;return 42;});
  assert.equal(result,42);
  assert.equal(calls,1);
  assert.equal(invalidated,1);
});

test('O16: a throwing observer end does not change original exception identity',()=>{
  const original=new Error('FICTIONAL original save error'), ticket={};
  let calls=0, invalidates=0;
  const throwing={begin(){return ticket;},end(){throw Error('FICTIONAL observer end failure');},
    invalidate(){invalidates++;}};
  assert.throws(()=>safeFictionalCaller(throwing,'sales_count_save',()=>{
    calls++;throw original;
  }),error=>error===original);
  assert.equal(calls,1);
  assert.equal(invalidates,1);
});

test('O17: throwing invalidation itself is isolated from the original callback',()=>{
  let calls=0;
  const broken={begin(){throw Error('broken begin');},
    invalidate(){throw Error('broken invalidate');}};
  assert.equal(safeFictionalCaller(broken,'sales_count_save',()=>{calls++;return 'same';}),'same');
  assert.equal(calls,1);
});

test('O18: an asynchronous fictional operation stays ACTIVE through awaited continuation',async()=>{
  const o=newReady(), t=o.begin('sales_count_save');
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const work=(async()=>{
    try {await gate;assert.equal(o.status().state,'ACTIVE');}
    finally {o.end(t,'completed');}
  })();
  assert.equal(o.status().activeCount,1);
  assert.equal(o.status().state,'ACTIVE');
  release();await work;
  assert.equal(o.status().state,'IDLE_OBSERVED');
});

test('O19: async failure preserves original error and HELD, with no retries',async()=>{
  const o=newReady(), t=o.begin('sales_category_save');
  const original=new Error('FICTIONAL apply failure');
  let calls=0;
  const work=(async()=>{
    try{await Promise.resolve();calls++;throw original;}
    catch(e){o.end(t,'failed');throw e;}
  })();
  await assert.rejects(work,e=>e===original);
  assert.equal(calls,1);
  assert.equal(o.status().state,'HELD');
});

test('O20: a before-mutation cancel differs from a partially committed cancel',()=>{
  const original={raw:'FICTIONAL pristine bytes'},o=newReady();
  const a=o.begin('sales_category_save');
  assert.equal(o.end(a,'cancelled_before_mutation'),true);
  assert.equal(original.raw,'FICTIONAL pristine bytes');
  assert.equal(o.status().state,'IDLE_OBSERVED');
  const b=o.begin('sales_category_save');
  original.raw='FICTIONAL changed bytes';
  assert.equal(o.end(b,'partial'),true);
  assert.equal(o.status().state,'HELD');
});

test('O21: nested fictional operations maintain count through outer close',()=>{
  const o=newReady();
  const outer=o.begin('sales_count_save');
  const inner=o.begin('sales_category_save');
  assert.equal(o.status().activeCount,2);
  assert.equal(o.end(inner,'completed'),true);
  assert.equal(o.status().activeCount,1);
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.end(outer,'completed'),true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
});

test('O22: failure of one concurrent operation cannot be cleared by later success',()=>{
  const o=newReady(),a=o.begin('sales_count_save'),b=o.begin('sales_category_save');
  assert.equal(o.end(a,'failed'),true);
  assert.equal(o.status().state,'HELD');
  assert.equal(o.status().activeCount,1);
  assert.equal(o.end(b,'completed'),true);
  assert.equal(o.status().state,'HELD');
});

test('O23: observer has no event/listener registration or storage/model APIs',()=>{
  const o=newReady();
  assert.deepEqual(Object.keys(o).sort(),['begin','end','initialize','invalidate','status']);
  const s=JSON.stringify(o.status());
  assert.doesNotMatch(s,/insight_v11|storeId|data|token|authorized|provenance|clean|weather/i);
  assert.equal('on' in o,false);
  assert.equal('subscribe' in o,false);
  assert.equal('localStorage' in o,false);
});

test('O24: a silent fictional A-B-A raw change is outside observer visibility',()=>{
  const o=newReady(),before=o.status(),store={raw:'A'};
  store.raw='B';store.raw='A';
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal(o.status().epoch,before.epoch);
  assert.equal(store.raw,'A');
  // This demonstrates a blind spot; IDLE_OBSERVED must never authorize capture.
});

test('O25: no finite timeout can silently clear an unclosed operation',async()=>{
  const o=newReady();o.begin('sales_count_save');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.status().activeCount,1);
  o.invalidate();
  assert.equal(o.status().state,'HELD');
  assert.equal(o.status().activeCount,1);
});

test('O26: end() success means token resolution, not business success',()=>{
  const o=newReady(),t=o.begin('sales_count_save');
  assert.equal(o.end(t,'failed'),true);
  assert.equal(o.status().state,'HELD');
});


test('O27: throwing observer end cannot change a successful callback return value',()=>{
  let calls=0, invalidated=0;
  const throwing={begin(){return {};},end(){throw Error('FICTIONAL end trap');},
    invalidate(){invalidated++;}};
  const result=safeFictionalCaller(throwing,'sales_count_save',()=>{calls++;return 'FICTIONAL success';});
  assert.equal(result,'FICTIONAL success');
  assert.equal(calls,1);
  assert.equal(invalidated,1);
});

test('O28: begin failure and a missing observer never prevent the original callback',()=>{
  let calls=0;
  assert.equal(safeFictionalCaller(null,'sales_count_save',()=>{calls++;return 17;}),17);
  assert.equal(safeFictionalCaller({begin(){return null;},invalidate(){}},'sales_count_save',
    ()=>{calls++;return 18;}),18);
  assert.equal(calls,2);
});

test('O29: browser source exposes only a frozen observer factory and no persistence',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  let writes=0,external=0;
  const window={localStorage:{getItem(){writes++;throw Error('unexpected read');},
    setItem(){writes++;throw Error('unexpected write');}},fetch(){external++;throw Error('network');}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','insight_operation_observer_v0.js'),'utf8'),
    {window,Object,Set,Number});
  const api=window.InsightOperationObserverV0;
  assert.ok(api&&Object.isFrozen(api));
  assert.deepEqual(Object.keys(api),['createOperationObserver']);
  const observer=api.createOperationObserver();
  assert.equal(observer.initialize(),true);
  const t=observer.begin('sales_count_save');
  assert.equal(observer.status().state,'ACTIVE');
  observer.end(t,'completed');
  assert.equal(observer.status().state,'IDLE_OBSERVED');
  assert.equal(writes,0);
  assert.equal(external,0);
});

test('O30: registered sales period change is observed only as a local operation', () => {
  const observer=newReady(), ticket=observer.begin('sales_period_change');
  assert.equal(typeof ticket,'object');
  assert.equal(observer.status().state,'ACTIVE');
  assert.equal(observer.status().activeCount,1);
  assert.equal(observer.end(ticket,'completed'),true);
  assert.equal(observer.status().state,'IDLE_OBSERVED');
  assert.equal(observer.status().activeCount,0);
});

test('O31: fictional weather bulk is one registered async operation kind', () => {
  const o=newReady(),token=o.begin('weather_bulk_run');
  assert.ok(token&&typeof token==='object');
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.end(token,'unknown'),true);
  assert.equal(o.status().state,'HELD');
  const next=o.begin('weather_bulk_run');
  assert.ok(next);
  assert.equal(o.end(next,'completed'),true);
  assert.equal(o.status().state,'HELD');
});

test('O32: FICTIONAL hourly dialog save is registered but cannot authorize app-wide cleanliness', () => {
  const o=newReady(), token=o.begin('hourly_customers_save');
  assert.ok(token&&typeof token==='object');
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.end(token,'completed'),true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal('full_app_clean' in o.status(),false);
  const failure=o.begin('hourly_customers_save');
  assert.equal(o.end(failure,'unknown'),true);
  assert.equal(o.status().state,'HELD');
});

test('O33: FICTIONAL confirmed weather-location set remains registered-only', () => {
  const o=newReady(), t=o.begin('weather_location_set');
  assert.ok(t&&typeof t==='object');
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.end(t,'completed'),true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal('authorized_for_model' in o.status(),false);
  const t2=o.begin('weather_location_set');
  assert.equal(o.end(t2,'unknown'),true);
  assert.equal(o.status().state,'HELD');
});

test('O34: FICTIONAL weather-location clear is a separate non-authorizing kind', () => {
  const o=newReady(), first=o.begin('weather_location_clear');
  assert.ok(first&&typeof first==='object');
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.end(first,'completed'),true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal('authorized_for_model' in o.status(),false);
  const second=o.begin('weather_location_clear');
  assert.equal(o.end(second,'unknown'),true);
  assert.equal(o.status().state,'HELD');
});

test('O35: FICTIONAL waste budget save is registered-only, never model-authorizing', () => {
  const o=newReady(),token=o.begin('waste_budget_save');
  assert.ok(token&&typeof token==='object');
  assert.equal(o.status().state,'ACTIVE');
  assert.equal(o.end(token,'completed'),true);
  assert.equal(o.status().state,'IDLE_OBSERVED');
  assert.equal('full_app_clean' in o.status(),false);
  const later=o.begin('waste_budget_save');
  assert.equal(o.end(later,'unknown'),true);
  assert.equal(o.status().state,'HELD');
});
