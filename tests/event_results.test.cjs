/* Run: node --test tests/event_results.test.cjs (no dependencies). */
const test=require('node:test');
const assert=require('node:assert/strict');
const results=require('../insight_event_results_v1.js');

function data(){
  return {
    current:'a',
    stores:{
      a:{
        name:'A',
        events:[
          {id:'e1',type:'nearby',scope:'store',startDate:'2026-09-10',endDate:'2026-09-11',snapshot:{version:1,title:'秋まつり',note:'',location:'文化フォーラム',specialDemand:[{id:'dmd_ice',name:'低価格アイス',prepared:60,sold:52},{id:'dmd_drink',name:'冷たい飲料',prepared:40,sold:35}]}},
          {id:'e2',type:'nearby',scope:'store',startDate:'2025-09-12',endDate:'2025-09-12',snapshot:{version:1,title:'秋まつり',note:'前年',location:'文化フォーラム',specialDemand:[{id:'dmd_ice',name:'低価格アイス',prepared:50,sold:45}]}},
          {id:'e3',type:'nearby',scope:'store',startDate:'2026-10-01',endDate:'2026-10-01',snapshot:{version:1,title:'展示会',note:'',location:'市民会館'}},
          {id:'e4',type:'nearby',scope:'store',startDate:'2026-08-01',endDate:'2026-08-01',snapshot:{version:1,title:'旧催事',note:''}},
          {id:'e5',type:'staff',scope:'store',startDate:'2026-09-10',endDate:'2026-09-10',snapshot:{version:1,title:'応援',note:''}},
          {id:'s1',type:'special',scope:'store',startDate:'2026-12-24',endDate:'2026-12-25',snapshot:{version:1,title:'クリスマス',note:'今年'}},
          {id:'s2',type:'special',scope:'store',startDate:'2025-12-24',endDate:'2025-12-25',snapshot:{version:1,title:'クリスマス',note:'前年'}},
          {id:'s3',type:'special',scope:'store',startDate:'2026-02-14',endDate:'2026-02-14',snapshot:{version:1,title:'バレンタイン',note:''}}
        ]
      }
    }
  };
}
const analysis={
  buildDay(date){
    const day=Number(date.slice(-2));
    return {metrics:{salesYen:100000+day,customers:100+day,customerUnitPrice:900+day,items:200+day/10,inputDays:1},conditions:{daily:[]}};
  }
};

test('locations list nearby locations and keeps legacy events under fallback location',()=>{
  const all=data();
  assert.deepEqual(results.locations(all,'a'),['市民会館','文化フォーラム','場所未設定']);
  assert.deepEqual(results.eventNames(all,'a','文化フォーラム'),['秋まつり']);
  assert.deepEqual(results.eventNames(all,'a','場所未設定'),['旧催事']);
});

test('each registered nearby event remains a separate past occurrence',()=>{
  const value=results.collect(data(),'a','文化フォーラム','秋まつり',analysis);
  assert.equal(value.occurrences.length,2);
  assert.equal(value.occurrences[0].id,'e1');
  assert.deepEqual(value.occurrences[0].days.map(day=>day.date),['2026-09-10','2026-09-11']);
  assert.equal(value.occurrences[0].metrics.salesYen,200021);
  assert.equal(value.occurrences[0].metrics.customers,221);
  assert.equal(value.occurrences[1].id,'e2');
  assert.deepEqual(value.occurrences[1].days.map(day=>day.date),['2025-09-12']);
});

test('特需商品は開催回ごとに保持し前回実績と比較できる',()=>{
  const value=results.collect(data(),'a','文化フォーラム','秋まつり',analysis);
  const current=value.occurrences[0];
  assert.deepEqual(current.specialDemand[0],{id:'dmd_ice',name:'低価格アイス',prepared:60,sold:52,sellThrough:52/60*100});
  const comparison=results.demandComparison(value.occurrences,current);
  assert.equal(comparison.length,2);
  assert.deepEqual(comparison[0].previous,{id:'dmd_ice',name:'低価格アイス',prepared:50,sold:45,sellThrough:90});
  assert.equal(comparison[1].previous,null);
});

test('period summary recalculates customer unit price from totals',()=>{
  const value=results.collect(data(),'a','文化フォーラム','秋まつり',analysis);
  const first=value.occurrences[0];
  assert.equal(first.metrics.salesYen,200021);
  assert.equal(first.metrics.customers,221);
  assert.equal(first.metrics.customerUnitPrice,200021/221);
  assert.equal(first.metrics.items,402.1);
});

test('special day names and occurrences are collected without location',()=>{
  const all=data();
  assert.deepEqual(results.specialNames(all,'a'),['クリスマス','バレンタイン']);
  const value=results.collectSpecial(all,'a','クリスマス',analysis);
  assert.equal(value.kind,'special');
  assert.equal(value.location,'');
  assert.equal(value.occurrences.length,2);
  assert.equal(value.occurrences[0].id,'s1');
  assert.deepEqual(value.occurrences[0].days.map(day=>day.date),['2026-12-24','2026-12-25']);
  assert.equal(value.occurrences[1].id,'s2');
});

test('empty selection does not read unrelated events',()=>{
  const value=results.collect(data(),'a','','',analysis);
  assert.deepEqual(value.occurrences,[]);
});

test('複数場所のイベントは各場所から同じ開催記録を1件だけ参照できる',()=>{
  const all=data();
  all.stores.a.events[0].snapshot.location='文化フォーラム\n駅前広場\n文化フォーラム';
  assert.deepEqual(results.eventNames(all,'a','駅前広場'),['秋まつり']);
  assert.equal(results.locations(all,'a').filter(value=>value==='文化フォーラム').length,1);
  const value=results.collect(all,'a','駅前広場','秋まつり',analysis);
  assert.equal(value.occurrences.length,1);
  assert.equal(value.occurrences[0].id,'e1');
  assert.equal(value.occurrences[0].metrics.salesYen,200021);
  assert.equal(results.collect(all,'a','文化フォーラム','秋まつり',analysis).occurrences.length,2);
});


test('特需商品のカテゴリーを正規化しても過去の未分類商品・前回比較を維持する',()=>{
  const all=data();
  all.stores.a.events[0].snapshot.specialDemand[0].category='アイス';
  all.stores.a.events[0].snapshot.specialDemand[0].categoryId='cat_ice';
  all.stores.a.events[0].snapshot.specialDemand[1].category='催事限定';
  const value=results.collect(all,'a','文化フォーラム','秋まつり',analysis);
  const current=value.occurrences[0];
  assert.equal(current.specialDemand[0].category,'アイス');
  assert.equal(current.specialDemand[0].categoryId,'cat_ice');
  assert.equal(current.specialDemand[1].category,'催事限定');
  const prior=results.demandComparison(value.occurrences,current)[0].previous;
  assert.equal(prior.category,undefined);
  assert.equal(prior.sold,45);
});


for(const count of [1,2,4])test(`特需表示の${count}カテゴリーでも全商品・順序・前回値を保持し元データを変更しない`,()=>{
  const all=data(),products=all.stores.a.events[0].snapshot.specialDemand;
  products[0].category='カテゴリー1';
  for(let i=1;i<count;i++)products.push({id:'cat'+i,name:'商品'+i,category:i===3?'':'カテゴリー'+(i+1),prepared:null,sold:null});
  products.push({id:'last',name:'同じカテゴリーの最後の商品',category:'カテゴリー1',prepared:0,sold:0});
  const before=JSON.stringify(all);
  const value=results.collect(all,'a','文化フォーラム','秋まつり',analysis);
  const comparison=results.demandComparison(value.occurrences,value.occurrences[0]);
  assert.deepEqual(comparison.map(e=>e.current.id),products.map(e=>e.id));
  assert.equal(comparison[0].previous.sold,45);
  assert.equal(comparison.at(-1).current.prepared,0);
  assert.equal(comparison.at(-1).current.sold,0);
  assert.equal(comparison.at(-1).current.sellThrough,null);
  assert.equal(JSON.stringify(all),before);
});
