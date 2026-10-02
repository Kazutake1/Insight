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
          {id:'e1',type:'nearby',scope:'store',startDate:'2026-09-10',endDate:'2026-09-11',snapshot:{version:1,title:'秋まつり',note:'',location:'文化フォーラム'}},
          {id:'e2',type:'nearby',scope:'store',startDate:'2025-09-12',endDate:'2025-09-12',snapshot:{version:1,title:'秋まつり',note:'前年',location:'文化フォーラム'}},
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
