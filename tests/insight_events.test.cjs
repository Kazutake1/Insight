/* Run: node --test tests/insight_events.test.cjs (no dependencies). */
const test = require('node:test');
const assert = require('node:assert/strict');
const events = require('../insight_events_v1.js');
function data() { return {current:'a',stores:{a:{name:'A'},b:{name:'B'}}}; }
function snapshot(method='amount',params={amount:50}) {
  return {version:1,title:'おにぎり',note:'補足',sale:{category:'おにぎり',method,params}};
}
function sale(s=snapshot()) {
  return {type:'sale',scope:'global',startDate:'2026-09-22',endDate:'2026-10-03',snapshot:s};
}
test('old backups need no migration or changes',()=>{
  const a=data(),before=JSON.stringify(a);events.validate(a);
  assert.deepEqual(events.list(a,'a','2026-09-22'),[]);assert.equal(JSON.stringify(a),before);
});
test('global and local periods remain separated across stores and date boundaries',()=>{
  const a=data();events.add(a,'a',sale());
  events.add(a,'a',{type:'nearby',scope:'store',startDate:'2026-09-22',endDate:'2026-09-22',snapshot:{version:1,title:'お祭り',note:''}});
  assert.equal(events.list(a,'a','2026-09-22').length,2);assert.equal(events.list(a,'b','2026-09-22').length,1);
  assert.equal(events.list(a,'a','2026-10-03').length,1);assert.equal(events.list(a,'a','2026-10-04').length,0);
  assert.equal(events.list(a,'a','2026-09-21').length,0);
});
test('preset changes and returned analysis records cannot mutate historical snapshots',()=>{
  const a=data(),s=snapshot();events.add(a,'a',sale(s));s.sale.params.amount=999;
  const queried=events.list(a,'a','2026-09-22');queried[0].snapshot.note='changed';
  assert.equal(a.eventManagement.events[0].snapshot.sale.params.amount,50);
  assert.equal(a.eventManagement.events[0].snapshot.note,'補足');
});
test('all six sale methods survive JSON backup roundtrip',()=>{
  const methods=[['amount',{amount:50}],['percent',{percent:20}],['fixed',{minPrice:160,maxPrice:220,price:100}],['multi',{quantity:2,amount:50}],['gift',{quantity:2,giftType:'商品無料',giftProduct:'ドリンク',giftQuantity:1,giftUnit:'本'}],['other',{text:'アプリ提示で30円引き'}]];
  const a=data();methods.forEach(([method,params])=>events.add(a,'a',sale(snapshot(method,params))));
  const restored=JSON.parse(JSON.stringify(a));events.validate(restored);
  assert.deepEqual(restored,a);assert.equal(events.list(restored,'b','2026-09-22').length,6);
  assert.equal(events.summary(restored.eventManagement.events[4].snapshot),'おにぎり 2個購入でドリンク1本無料');
});
test('future methods and additional fields are retained without reinterpretation',()=>{
  const a=data(),s=snapshot('future_set',{products:['rice','tea'],discount:100});s.sale.extension={memberOnly:true};
  events.add(a,'a',sale(s));const restored=JSON.parse(JSON.stringify(a));events.validate(restored);
  assert.deepEqual(events.list(restored,'a','2026-09-22')[0].snapshot,s);
});
test('malformed periods, scope, duplicates and conditions are rejected',()=>{
  const mutations=[e=>e.endDate='2026-02-30',e=>e.endDate='2026-09-21',e=>e.scope='store',e=>e.snapshot.sale.params.amount=-1,e=>e.snapshot.sale.params.amount='50',e=>e.snapshot.version=2];
  for(const mutate of mutations){const a=data();events.add(a,'a',sale());mutate(a.eventManagement.events[0]);assert.throws(()=>events.validate(a));}
  const a=data();events.add(a,'a',sale());a.eventManagement.events.push(events.copy(a.eventManagement.events[0]));assert.throws(()=>events.validate(a));
  assert.throws(()=>events.validateSnapshot(snapshot('fixed',{minPrice:220,maxPrice:160,price:100})));
  assert.throws(()=>events.validateSnapshot(snapshot('percent',{percent:101})));
  assert.throws(()=>events.validateSnapshot(snapshot('multi',{quantity:1.5,amount:50})));
});
