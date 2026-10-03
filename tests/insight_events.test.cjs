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
test('multiple target categories survive validation and backup roundtrip',()=>{
  const a=data(),s=snapshot();
  s.title='麺類セール';s.sale.category='調理麺・カップ麺・麺類その他';s.sale.categoryId='cat_cold_noodles';
  s.sale.targets=[
    {categoryId:'cat_cold_noodles',category:'調理麺'},
    {categoryId:'cat_cup_noodles',category:'カップ麺'},
    {categoryId:'cat_other_noodles',category:'麺類その他'}
  ];
  events.add(a,'a',sale(s));const restored=JSON.parse(JSON.stringify(a));events.validate(restored);
  assert.deepEqual(restored,a);
  assert.equal(events.summary(restored.eventManagement.events[0].snapshot),'調理麺・カップ麺・麺類その他 50円引き');
  restored.eventManagement.events[0].snapshot.sale.targets.push({categoryId:'cat_cup_noodles',category:'重複'});
  assert.throws(()=>events.validate(restored));
});

test('nearby event location is optional for old backups and retained when present',()=>{
  const legacy=data();events.add(legacy,'a',{type:'nearby',scope:'store',startDate:'2026-10-01',endDate:'2026-10-01',snapshot:{version:1,title:'旧イベント',note:''}});events.validate(legacy);
  assert.equal(legacy.stores.a.events[0].snapshot.location,undefined);
  const current=data();events.add(current,'a',{type:'nearby',scope:'store',startDate:'2026-10-02',endDate:'2026-10-02',snapshot:{version:1,title:'新イベント',note:'',location:'文化フォーラム'}});
  const restored=JSON.parse(JSON.stringify(current));events.validate(restored);
  assert.equal(restored.stores.a.events[0].snapshot.location,'文化フォーラム');
});
test('special day is stored per store without a location and survives backup roundtrip',()=>{
  const a=data();
  events.add(a,'a',{type:'special',scope:'store',startDate:'2026-12-24',endDate:'2026-12-25',snapshot:{version:1,title:'クリスマス',note:'重点日'}});
  events.validate(a);
  assert.equal(events.list(a,'a','2026-12-24').length,1);
  assert.equal(events.list(a,'b','2026-12-24').length,0);
  assert.equal(a.stores.a.events[0].snapshot.location,undefined);
  const restored=JSON.parse(JSON.stringify(a));events.validate(restored);
  assert.equal(restored.stores.a.events[0].type,'special');
  assert.equal(restored.stores.a.events[0].snapshot.title,'クリスマス');
});
test('special presets are optional, global, ordered and survive backup roundtrip',()=>{
  const a=data();
  a.eventManagement={version:1,presets:[],events:[],specialPresets:[
    {id:'sp1',snapshot:{version:1,title:'クリスマス',note:''}},
    {id:'sp2',snapshot:{version:1,title:'節分',note:'予約強化'}}
  ]};
  events.validate(a);
  assert.deepEqual(events.specialPresets(a).map(p=>p.snapshot.title),['クリスマス','節分']);
  const restored=JSON.parse(JSON.stringify(a));events.validate(restored);
  assert.deepEqual(restored,a);
  restored.eventManagement.specialPresets.push({id:'sp3',snapshot:{version:1,title:'クリスマス',note:''}});
  assert.throws(()=>events.validate(restored),/よく使う催事名が重複/);
});

test('same-store special duplicate detection requires same title and exact period',()=>{
  const a=data();
  const id=events.add(a,'a',{type:'special',scope:'store',startDate:'2026-12-24',endDate:'2026-12-25',snapshot:{version:1,title:'クリスマス',note:''}});
  const same={type:'special',scope:'store',startDate:'2026-12-24',endDate:'2026-12-25',snapshot:{version:1,title:'クリスマス',note:'別メモ'}};
  assert.equal(events.findDuplicateSpecial(a,'a',same).id,id);
  assert.equal(events.findDuplicateSpecial(a,'a',same,id),null);
  assert.equal(events.findDuplicateSpecial(a,'b',same),null);
  assert.equal(events.findDuplicateSpecial(a,'a',{...same,startDate:'2026-12-23'}),null);
  assert.equal(events.findDuplicateSpecial(a,'a',{...same,snapshot:{...same.snapshot,title:'年末'}}),null);
});
test('malformed periods, scope, duplicates and conditions are rejected',()=>{
  const mutations=[e=>e.endDate='2026-02-30',e=>e.endDate='2026-09-21',e=>e.scope='store',e=>e.snapshot.sale.params.amount=-1,e=>e.snapshot.sale.params.amount='50',e=>e.snapshot.version=2];
  for(const mutate of mutations){const a=data();events.add(a,'a',sale());mutate(a.eventManagement.events[0]);assert.throws(()=>events.validate(a));}
  const a=data();events.add(a,'a',sale());a.eventManagement.events.push(events.copy(a.eventManagement.events[0]));assert.throws(()=>events.validate(a));
  assert.throws(()=>events.validateSnapshot(snapshot('fixed',{minPrice:220,maxPrice:160,price:100})));
  assert.throws(()=>events.validateSnapshot(snapshot('percent',{percent:101})));
  assert.throws(()=>events.validateSnapshot(snapshot('multi',{quantity:1.5,amount:50})));
});


test('複数カテゴリーはカテゴリーごとに異なる均一価格条件を保持できる',()=>{
  const a=data(),snap={version:1,title:'おにぎり複数価格',note:'',sale:{
    category:'おにぎり179円以下・おにぎり180〜239円',categoryId:'cat_low',method:'fixed',params:{maxPrice:179,price:100},
    targets:[
      {categoryId:'cat_low',category:'おにぎり179円以下',method:'fixed',params:{maxPrice:179,price:100}},
      {categoryId:'cat_mid',category:'おにぎり180〜239円',method:'fixed',params:{minPrice:180,maxPrice:239,price:150}}
    ]
  }};
  events.validateSnapshot(snap);
  assert.equal(events.summary(snap,'cat_low'),'おにぎり179円以下 179円以下の商品を100円均一');
  assert.equal(events.summary(snap,'cat_mid'),'おにぎり180〜239円 180〜239円の商品を150円均一');
  assert.match(events.summary(snap),/100円均一/);
  assert.match(events.summary(snap),/150円均一/);
});
