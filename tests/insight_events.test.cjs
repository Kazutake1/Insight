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

test('特需商品は商品名・カテゴリ名を自由入力でき用意数と販売数を履歴に保持する',()=>{
  const a=data(),snap={version:1,title:'夏祭り',note:'',location:'文化フォーラム',specialDemand:[
    {id:'dmd_ice',name:'低価格アイス',prepared:60,sold:52},
    {id:'dmd_protein',name:'プロテイン系',prepared:30,sold:28}
  ]};
  events.add(a,'a',{type:'nearby',scope:'store',startDate:'2026-08-01',endDate:'2026-08-01',snapshot:snap});
  const restored=JSON.parse(JSON.stringify(a));events.validate(restored);
  assert.deepEqual(events.demandItems(restored.stores.a.events[0].snapshot),snap.specialDemand);
  const bad=events.copy(snap);bad.specialDemand[0].sold=61;
  assert.throws(()=>events.validateSnapshot(bad),/販売数は用意数以下/);
});

test('よく使うイベントの特需商品は開催実績から次回用テンプレートへ同期し過去実績は変えない',()=>{
  const a=data();
  a.eventManagement={version:1,presets:[],events:[],nearbyPresets:[
    {id:'np1',snapshot:{version:1,title:'夏祭り',note:'',location:'文化フォーラム',specialDemand:[{id:'dmd_ice',name:'低価格アイス'}]}}
  ]};
  const past={id:'past1',presetId:'np1',type:'nearby',scope:'store',startDate:'2025-08-01',endDate:'2025-08-01',snapshot:{version:1,title:'夏祭り',note:'',location:'文化フォーラム',specialDemand:[{id:'dmd_ice',name:'低価格アイス',prepared:50,sold:45}]}};
  a.stores.a.events=[events.copy(past)];
  const current={id:'now1',presetId:'np1',type:'nearby',scope:'store',startDate:'2026-08-01',endDate:'2026-08-01',snapshot:{version:1,title:'夏祭り',note:'',location:'文化フォーラム',specialDemand:[{id:'dmd_ice',name:'低価格アイス',prepared:60,sold:52},{id:'dmd_water',name:'冷たい飲料',prepared:40,sold:35}]}};
  events.syncDemandPreset(a,current);events.validate(a);
  assert.deepEqual(events.nearbyPresets(a)[0].snapshot.specialDemand,[{id:'dmd_ice',name:'低価格アイス'},{id:'dmd_water',name:'冷たい飲料'}]);
  assert.deepEqual(a.stores.a.events[0],past);
  assert.deepEqual(events.demandTemplate(current.snapshot.specialDemand),[{id:'dmd_ice',name:'低価格アイス'},{id:'dmd_water',name:'冷たい飲料'}]);
});

test('よく使うイベントはイベント名と場所の組み合わせで重複を防ぐ',()=>{
  const a=data();
  a.eventManagement={version:1,presets:[],events:[],nearbyPresets:[
    {id:'np1',snapshot:{version:1,title:'大会',note:'',location:'文化フォーラム',specialDemand:[]}},
    {id:'np2',snapshot:{version:1,title:'大会',note:'',location:'市民会館',specialDemand:[]}}
  ]};
  assert.doesNotThrow(()=>events.validate(a));
  a.eventManagement.nearbyPresets.push({id:'np3',snapshot:{version:1,title:'大会',note:'',location:'文化フォーラム',specialDemand:[]}});
  assert.throws(()=>events.validate(a),/同じイベント名・場所が重複/);
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


test('同一カテゴリーに複数のセール実績区分を保持できる',()=>{
  const snap={version:1,title:'おにぎりセール',note:'',sale:{
    category:'おにぎり',categoryId:'cat_onigiri',method:'fixed',params:{maxPrice:179,price:100},
    targets:[{categoryId:'cat_onigiri',category:'おにぎり',method:'fixed',params:{maxPrice:179,price:100}}],
    segments:[
      {id:'seg_low',categoryId:'cat_onigiri',category:'おにぎり',label:'179円以下',method:'fixed',params:{maxPrice:179,price:100}},
      {id:'seg_mid',categoryId:'cat_onigiri',category:'おにぎり',label:'180〜239円',method:'fixed',params:{minPrice:180,maxPrice:239,price:150}},
      {id:'seg_high',categoryId:'cat_onigiri',category:'おにぎり',label:'240〜359円',method:'fixed',params:{minPrice:240,maxPrice:359,price:200}}
    ]
  }};
  assert.doesNotThrow(()=>events.validateSnapshot(snap));
  assert.equal(events.segmentsForCategory(snap.sale,'cat_onigiri','おにぎり').length,3);
  assert.match(events.segmentSummary(snap,snap.sale.segments[1]),/180〜239円/);
  assert.match(events.segmentSummary(snap,snap.sale.segments[1]),/150円均一/);
  assert.match(events.summary(snap),/100円均一/);
  assert.match(events.summary(snap),/150円均一/);
  assert.match(events.summary(snap),/200円均一/);
});


test('上下限のある値引き条件は「以上・以下」ではなく範囲表記にする',()=>{
  const snap={version:1,title:'おにぎりセール',note:'',sale:{
    category:'おにぎり',categoryId:'cat_onigiri',method:'fixed',params:{maxPrice:179,price:100},
    targets:[{categoryId:'cat_onigiri',category:'おにぎり',method:'fixed',params:{maxPrice:179,price:100}}],
    segments:[
      {id:'seg_low',categoryId:'cat_onigiri',category:'おにぎり',label:'179円以下',method:'fixed',params:{maxPrice:179,price:100}},
      {id:'seg_mid',categoryId:'cat_onigiri',category:'おにぎり',label:'180円以上239円以下',method:'fixed',params:{minPrice:180,maxPrice:239,price:150}},
      {id:'seg_high',categoryId:'cat_onigiri',category:'おにぎり',label:'240円以上349円以下',method:'fixed',params:{minPrice:240,maxPrice:349,price:250}}
    ]
  }};
  const text=events.summary(snap);
  assert.match(text,/180〜239円→150円均一/);
  assert.match(text,/240〜349円→250円均一/);
  assert.doesNotMatch(text,/180円以上239円以下/);
  assert.doesNotMatch(text,/240円以上349円以下/);
});


test('複数値引き条件の見出しは簡潔なカテゴリー＋条件一覧で表示する',()=>{
  const snap={version:1,title:'おにぎりセール',note:'',sale:{
    category:'おにぎり',categoryId:'cat_onigiri',method:'fixed',params:{maxPrice:179,price:100},
    targets:[{categoryId:'cat_onigiri',category:'おにぎり',method:'fixed',params:{maxPrice:179,price:100}}],
    segments:[
      {id:'seg_low',categoryId:'cat_onigiri',category:'おにぎり',label:'179円以下',method:'fixed',params:{maxPrice:179,price:100}},
      {id:'seg_mid',categoryId:'cat_onigiri',category:'おにぎり',label:'180円以上239円以下',method:'fixed',params:{minPrice:180,maxPrice:239,price:150}},
      {id:'seg_high',categoryId:'cat_onigiri',category:'おにぎり',label:'240円以上349円以下',method:'fixed',params:{minPrice:240,maxPrice:349,price:250}}
    ]
  }};
  assert.equal(events.summary(snap),'おにぎり：179円以下→100円均一 / 180〜239円→150円均一 / 240〜349円→250円均一');
});

test('複数場所は既存の文字列形式で保存しバックアップ往復でも維持する',()=>{
  const a=data();
  events.add(a,'a',{type:'nearby',scope:'store',startDate:'2026-10-02',endDate:'2026-10-02',snapshot:{version:1,title:'複数会場イベント',note:'',location:'中央公園\n駅前広場'}});
  const restored=JSON.parse(JSON.stringify(a));
  assert.doesNotThrow(()=>events.validate(restored));
  assert.equal(restored.stores.a.events.length,1);
  assert.equal(restored.stores.a.events[0].snapshot.location,'中央公園\n駅前広場');
});


test('特需商品カテゴリーは任意指定・既存カテゴリー連携・独自名に対応し従来データを維持する',()=>{
  const original={version:1,title:'秋祭り',note:'',specialDemand:[
    {id:'d1',name:'おにぎりセット',category:'おにぎり',categoryId:'cat_onigiri',prepared:100,sold:85},
    {id:'d2',name:'限定セット',category:'特設コーナー',prepared:40,sold:32},
    {id:'d3',name:'旧商品',prepared:10,sold:5}
  ]};
  assert.doesNotThrow(()=>events.validateSnapshot(original));
  assert.deepEqual(events.demandTemplate(original.specialDemand),[
    {id:'d1',name:'おにぎりセット',category:'おにぎり',categoryId:'cat_onigiri'},
    {id:'d2',name:'限定セット',category:'特設コーナー'},
    {id:'d3',name:'旧商品'}
  ]);
  const a=data();
  events.add(a,'a',{type:'special',scope:'store',startDate:'2026-10-08',endDate:'2026-10-08',snapshot:original});
  events.validate(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(events.demandItems(a.stores.a.events[0].snapshot),original.specialDemand);
  const missing=events.copy(original);missing.specialDemand[0].categoryId='cat_orphan';delete missing.specialDemand[0].category;
  assert.throws(()=>events.validateSnapshot(missing),/カテゴリー/);
  const blank=events.copy(original);blank.specialDemand[1].category='   ';
  assert.doesNotThrow(()=>events.validateSnapshot(blank));
});
test('よく使う催事への同期ではカテゴリーを保持し用意数と販売数を引き継がない',()=>{
  const a=data();
  a.eventManagement={version:1,presets:[],events:[],specialPresets:[
    {id:'sp_demand',snapshot:{version:1,title:'催事',note:'',specialDemand:[]}}
  ]};
  const event={presetId:'sp_demand',type:'special',snapshot:{specialDemand:[
    {id:'d1',name:'特別弁当',categoryId:'cat_bento',category:'お弁当',prepared:100,sold:80},
    {id:'d2',name:'記念品',category:'催事グッズ',prepared:50,sold:40}
  ]}};
  events.syncDemandPreset(a,event);
  assert.deepEqual(a.eventManagement.specialPresets[0].snapshot.specialDemand,[
    {id:'d1',name:'特別弁当',category:'お弁当',categoryId:'cat_bento'},
    {id:'d2',name:'記念品',category:'催事グッズ'}
  ]);
  assert.doesNotThrow(()=>events.validate(a));
});


test('よく使う特需商品カテゴリーは2店舗共通で保存し、順序と過去の実績を維持する',()=>{
  const all=data(),before={version:1,title:'催事',note:'',specialDemand:[{id:'p1',name:'限定弁当',category:'弁当',prepared:100,sold:80}]};
  all.stores.a.events=[{id:'e1',type:'special',scope:'store',startDate:'2026-10-08',endDate:'2026-10-08',snapshot:events.copy(before)}];
  all.eventManagement={version:1,presets:[],events:[]};
  assert.deepEqual(events.demandCategories(all),[]);
  events.appendDemandFavorites(all,['弁当','特設グッズ','弁当']);
  assert.deepEqual(events.demandCategories(all).map(item=>item.name),['弁当','特設グッズ']);
  assert.equal(events.demandCategories(all),all.eventManagement.demandCategories);
  const restored=JSON.parse(JSON.stringify(all));
  assert.doesNotThrow(()=>events.validate(restored));
  assert.deepEqual(restored.stores.a.events[0].snapshot,before);
  assert.deepEqual(restored.eventManagement.demandCategories,all.eventManagement.demandCategories);
  assert.deepEqual(events.demandCategories(restored),events.demandCategories(all));
  assert.doesNotThrow(()=>events.validate({stores:{a:{},b:{}},eventManagement:{version:1,presets:[],events:[]}}));
});

test('よく使う特需商品カテゴリーは名前とIDの重複を許可しない',()=>{
  const all=data();
  all.eventManagement={version:1,presets:[],events:[],demandCategories:[{id:'c1',name:'お弁当'}]};
  assert.doesNotThrow(()=>events.validate(all));
  all.eventManagement.demandCategories.push({id:'c2',name:'お弁当'});
  assert.throws(()=>events.validate(all),/重複/);
  all.eventManagement.demandCategories[1].name='デザート';
  all.eventManagement.demandCategories[1].id='c1';
  assert.throws(()=>events.validate(all),/重複/);
  all.eventManagement.demandCategories[1].id='c2';
  assert.doesNotThrow(()=>events.validate(all));
  all.eventManagement.demandCategories[1].name='';
  assert.throws(()=>events.validate(all),/カテゴリー名/);
});

test('販売数入力の既存カテゴリーはよく使うカテゴリーに重複追加せずマスターを変更しない',()=>{
  const all=data();
  all.salesCountManagement={categories:[{id:'cat1',name:'おにぎり',hidden:false}]};
  all.eventManagement={version:1,presets:[],events:[]};
  const before=JSON.stringify(all.salesCountManagement);
  events.appendDemandFavorites(all,['おにぎり','イベント限定','イベント限定']);
  assert.deepEqual(events.demandCategories(all).map(item=>item.name),['イベント限定']);
  assert.equal(JSON.stringify(all.salesCountManagement),before);
  assert.doesNotThrow(()=>events.validate(all));
});

test('イベント・催事は開催記録ごとに実績表示カテゴリーIDを安全に保存できる',()=>{
  const all=data();
  events.add(all,'a',{type:'nearby',scope:'store',startDate:'2026-09-10',endDate:'2026-09-10',snapshot:{version:1,title:'文化祭',note:'',location:'文化フォーラム',resultCategoryIds:['cat_onigiri','cat_sweets']}});
  events.add(all,'a',{type:'special',scope:'store',startDate:'2026-09-11',endDate:'2026-09-12',snapshot:{version:1,title:'催事',note:'',resultCategoryIds:['cat_noodles']}});
  events.add(all,'b',{type:'nearby',scope:'store',startDate:'2026-09-10',endDate:'2026-09-10',snapshot:{version:1,title:'別店舗',note:''}});
  const original=JSON.stringify(all),restored=JSON.parse(original);
  events.validate(restored);
  assert.equal(JSON.stringify(restored),original);
  assert.deepEqual(restored.stores.a.events.map(e=>e.snapshot.resultCategoryIds),[['cat_onigiri','cat_sweets'],['cat_noodles']]);
  assert.equal(restored.stores.b.events[0].snapshot.resultCategoryIds,undefined);
  const testSnapshot={version:1,title:'不正',note:'',resultCategoryIds:['cat_onigiri','cat_onigiri']};
  assert.throws(()=>events.validateSnapshot(testSnapshot),/重複/);
  testSnapshot.resultCategoryIds=[];
  assert.throws(()=>events.validateSnapshot(testSnapshot),/1件以上/);
  testSnapshot.resultCategoryIds=[''];
  assert.throws(()=>events.validateSnapshot(testSnapshot),/識別番号/);
  testSnapshot.resultCategoryIds=['cat_onigiri'];
  assert.doesNotThrow(()=>events.validateSnapshot(testSnapshot));
});


/* STEP4 P4d-5: original events dialog handlers in a fictional, isolated VM DOM.
 * The witness is positive DIRTY or UNKNOWN only; this does not inspect saved
 * data, establish a clean editor, or exercise real persistence/network.
 */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const eventSource=fs.readFileSync(path.join(__dirname,'../insight_events_v1.js'),'utf8');

function fictionalEventDialog(){
  const operations={transaction:0,network:0,model:0},dialogs=[];
  function make(tag){
    const element={
      tagName:tag,id:'',className:'',value:'',textContent:'',children:[],
      parentNode:null,listeners:{},open:false,removed:false,
      classList:{add(){}},
      setAttribute(){},
      append(...nodes){
        for(const n of nodes){
          if(!n||typeof n!=='object')throw Error('invalid fictional child');
          n.parentNode=this;this.children.push(n);
        }
      },
      replaceChildren(...nodes){this.children=[];this.append(...nodes);},
      insertBefore(child,before){
        if(child.parentNode){
          const idx=child.parentNode.children.indexOf(child);
          if(idx>=0)child.parentNode.children.splice(idx,1);
        }
        child.parentNode=this;
        const index=this.children.indexOf(before);
        if(index<0)this.children.push(child);else this.children.splice(index,0,child);
      },
      addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);},
      emit(type){
        const evt={type,target:this,preventDefault(){}};
        let cursor=this;
        while(cursor){
          for(const fn of cursor.listeners[type]||[])fn.call(cursor,evt);
          cursor=cursor.parentNode;
        }
      },
      close(){this.open=false;this.emit('close');},
      showModal(){this.open=true;},
      remove(){
        if(this.parentNode){
          const index=this.parentNode.children.indexOf(this);
          if(index>=0)this.parentNode.children.splice(index,1);
        }
        this.removed=true;this.parentNode=null;
      }
    };
    if(tag==='dialog')dialogs.push(element);
    return element;
  }
  const body=make('body'),host=make('section');host.id='opsDailyWrap';
  body.append(host);
  function walk(parent,condition){
    if(condition(parent))return parent;
    for(const child of parent.children){
      const found=walk(child,condition);
      if(found)return found;
    }
    return null;
  }
  function getById(id){return walk(body,x=>x.id===id);}
  const document={readyState:'complete',body,createElement:make,getElementById:getById};
  const privateEvent={
    id:'e_canary',type:'other',scope:'store',
    startDate:'2026-10-26',endDate:'2026-10-26',
    snapshot:{version:1,title:'FICTIONAL_PRIVATE_EVENT',note:''}
  };
  const allStores={current:'a',stores:{
    a:{name:'FICTIONAL_PRIVATE_STORE',events:[JSON.parse(JSON.stringify(privateEvent))]},
    b:{name:'Other fictional store'}
  },eventManagement:{version:1,presets:[],events:[]}};
  const original=JSON.stringify(allStores);
  const root={
    document,InsightDateContext:{getSelectedIso(){return '2026-10-26';}},
    InsightHooks:{on(){}},
    InsightStorage:{transaction(){operations.transaction++;throw Error('should not persist');}}
  };
  const sandbox={
    window:root,globalThis:root,document,allStores,
    Date,JSON,String,Number,Object,Array,Math,Set,Map,
    alert(){throw Error('unexpected alert');},confirm(){return false;}
  };
  vm.createContext(sandbox);vm.runInContext(eventSource,sandbox);
  const model=root.InsightEvents;
  function read(){return JSON.parse(JSON.stringify(model.getForecastDraftStatus()));}
  function openEdit(){
    const b=walk(host,x=>x.tagName==='button'&&x.textContent==='編集');
    assert.ok(b,'the existing event edit button should render');
    b.onclick();
    const d=dialogs.at(-1);
    assert.ok(d&&d.open,'original edit handler must open dialog');
    const input=walk(d,x=>x.tagName==='input');
    const form=walk(d,x=>x.tagName==='form');
    assert.ok(input&&form,'original event form must render');
    return {dialog:d,input,form};
  }
  function openDetails(){
    const b=walk(host,x=>x.tagName==='button'&&x.className==='ie-summary');
    assert.ok(b);
    b.onclick();
    return dialogs.at(-1);
  }
  return {read,model,openEdit,openDetails,dialogs,allStores,original,operations};
}
function eventUnknown(s){
  assert.equal(s.initialized,false);assert.equal(s.dirty,null);
  assert.ok(Number.isSafeInteger(s.epoch));
}
test('P4d5 V01: no browser editor produces UNKNOWN without raw values',()=>{
  const state=events.getForecastDraftStatus();
  assert.deepEqual(state,{initialized:false,dirty:null,epoch:0});
  assert.equal(Object.isFrozen(state),true);
});
test('P4d5 V02: browser fixture initializes UNKNOWN and opens real event editor',()=>{
  const h=fictionalEventDialog(),start=h.read().epoch;
  eventUnknown(h.read());
  h.openEdit();
  eventUnknown(h.read());
  assert.ok(h.read().epoch>start);
  assert.equal(h.operations.transaction,0);
});
test('P4d5 V03: real dialog input listener marks observed DIRTY',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit(),before=h.read().epoch;
  ui.input.value='0';ui.input.emit('input');
  assert.equal(h.read().initialized,true);
  assert.equal(h.read().dirty,true);
  assert.ok(h.read().epoch>before);
  assert.equal(JSON.stringify(h.allStores),h.original);
});
test('P4d5 V04: input value getter is never accessed',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  Object.defineProperty(ui.input,'value',{get(){throw Error('RAW_EVENT_CANARY');}});
  ui.input.emit('input');
  assert.equal(h.read().dirty,true);
  assert.doesNotMatch(JSON.stringify(h.read()),/RAW_EVENT_CANARY|FICTIONAL_PRIVATE_EVENT|FICTIONAL_PRIVATE_STORE/);
});
test('P4d5 V05: change event advances epoch without reading input',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  ui.input.emit('input');const first=h.read().epoch;
  ui.input.emit('change');
  assert.equal(h.read().dirty,true);
  assert.ok(h.read().epoch>first);
});
test('P4d5 V06: form submit invalidates old dirty witness',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  ui.input.emit('input');const before=h.read().epoch;
  ui.form.emit('submit');
  eventUnknown(h.read());
  assert.ok(h.read().epoch>before);
  assert.equal(h.operations.transaction,0,'fictional dispatch does not run submit handler');
});
test('P4d5 V07: close and reopening never reuse old dirty epoch',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  ui.input.emit('input');const first=h.read().epoch;
  ui.dialog.close();
  eventUnknown(h.read());const after=h.read().epoch;
  h.openEdit();eventUnknown(h.read());
  assert.ok(after>first&&h.read().epoch>after);
});
test('P4d5 V08: a second dialog invalidates an earlier witness',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  ui.input.emit('input');const first=h.read().epoch;
  const details=h.openDetails();
  assert.ok(details.open);
  eventUnknown(h.read());assert.ok(h.read().epoch>first);
  ui.dialog.close();details.close();
  eventUnknown(h.read());
});
test('P4d5 V09: view-only details dialog does not falsely claim clean',()=>{
  const h=fictionalEventDialog(),d=h.openDetails();
  eventUnknown(h.read());d.close();eventUnknown(h.read());
});
test('P4d5 V10: dirty -> unknown -> dirty is a new epoch',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  ui.input.emit('input');const a=h.read().epoch;
  ui.form.emit('submit');const b=h.read().epoch;
  ui.input.emit('change');const c=h.read().epoch;
  assert.ok(a<b&&b<c);assert.equal(h.read().dirty,true);
});
test('P4d5 V11: getter has only three frozen metadata fields',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();ui.input.emit('input');
  const result=h.model.getForecastDraftStatus();
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(Object.keys(result).sort(),['dirty','epoch','initialized']);
  assert.doesNotMatch(JSON.stringify(result),/FICTIONAL_PRIVATE|value|name|date|store|raw/);
});
test('P4d5 V12: no storage transaction or model/network side effect',()=>{
  const h=fictionalEventDialog(),ui=h.openEdit();
  ui.input.emit('input');ui.form.emit('submit');
  ui.dialog.close();
  assert.equal(h.operations.transaction,0);
  assert.equal(h.operations.network,0);assert.equal(h.operations.model,0);
  assert.equal(JSON.stringify(h.allStores),h.original);
});
