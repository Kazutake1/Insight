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
          {id:'e2',type:'nearby',scope:'store',startDate:'2026-09-11',endDate:'2026-09-12',snapshot:{version:1,title:'秋まつり',note:'2回目',location:'文化フォーラム'}},
          {id:'e3',type:'nearby',scope:'store',startDate:'2026-10-01',endDate:'2026-10-01',snapshot:{version:1,title:'展示会',note:'',location:'市民会館'}},
          {id:'e4',type:'nearby',scope:'store',startDate:'2026-08-01',endDate:'2026-08-01',snapshot:{version:1,title:'旧催事',note:''}},
          {id:'e5',type:'staff',scope:'store',startDate:'2026-09-10',endDate:'2026-09-10',snapshot:{version:1,title:'応援',note:''}}
        ]
      }
    }
  };
}
const analysis={
  buildDay(date){
    const day=Number(date.slice(-2));
    return {metrics:{salesYen:100000+day,customers:100+day,customerUnitPrice:900+day,items:200+day/10,wasteYen:3000+day,wasteRate:2+day/100,inputDays:1},conditions:{daily:[]}};
  }
};

test('locations list nearby locations and keeps legacy events under fallback location',()=>{
  const all=data();
  assert.deepEqual(results.locations(all,'a'),['市民会館','文化フォーラム','場所未設定']);
  assert.deepEqual(results.eventNames(all,'a','文化フォーラム'),['秋まつり']);
  assert.deepEqual(results.eventNames(all,'a','場所未設定'),['旧催事']);
});

test('selected location and event name return only unique event dates newest first',()=>{
  const all=data(),value=results.collect(all,'a','文化フォーラム','秋まつり',analysis);
  assert.equal(value.occurrences.length,2);
  assert.deepEqual(value.days.map(day=>day.date),['2026-09-12','2026-09-11','2026-09-10']);
  assert.equal(value.days[0].metrics.salesYen,100012);
  assert.equal(value.days[0].metrics.customers,112);
  assert.equal(value.days.every(day=>day.hasData),true);
});

test('empty selection does not read unrelated events or daily data',()=>{
  const all=data(),value=results.collect(all,'a','','',analysis);
  assert.deepEqual(value.occurrences,[]);
  assert.deepEqual(value.days,[]);
});
