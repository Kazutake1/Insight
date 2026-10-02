/* Run: node --test tests/hourly_customers.test.cjs (no dependencies). */
const test=require('node:test');
const assert=require('node:assert/strict');
const hourly=require('../insight_hourly_customers_v1.js');

function data(){return {current:'a',stores:{a:{name:'A'},b:{name:'B'}}};}

test('old backups remain valid without hourly customer data',()=>{
  const all=data(),before=JSON.stringify(all);
  hourly.validate(all);
  assert.equal(JSON.stringify(all),before);
  assert.equal(hourly.get(all,'a','2026-10-02'),null);
  assert.deepEqual(hourly.status(all,'a','2026-10-02'),{hours:Array(24).fill(null),count:0,complete:false,total:0});
});

test('partial hourly input preserves blanks separately from zero',()=>{
  const all=data(),hours=Array(24).fill(null);hours[0]=0;hours[1]=12;hours[18]=186;
  hourly.set(all,'a','2026-10-02',hours);
  const saved=hourly.get(all,'a','2026-10-02');
  assert.equal(saved.length,24);
  assert.equal(saved[0],0);
  assert.equal(saved[1],12);
  assert.equal(saved[2],null);
  const status=hourly.status(all,'a','2026-10-02');
  assert.equal(status.count,3);
  assert.equal(status.complete,false);
  assert.equal(status.total,198);
});

test('24 hours becomes complete and all-empty input deletes the date',()=>{
  const all=data(),hours=Array.from({length:24},(_,i)=>i);
  hourly.set(all,'a','2026-10-02',hours);
  const status=hourly.status(all,'a','2026-10-02');
  assert.equal(status.count,24);
  assert.equal(status.complete,true);
  assert.equal(status.total,276);
  hourly.set(all,'a','2026-10-02',Array(24).fill(null));
  assert.equal(hourly.get(all,'a','2026-10-02'),null);
});

test('invalid date, negative, decimal and non-24 saved data are rejected',()=>{
  const all=data();
  assert.throws(()=>hourly.set(all,'a','bad-date',Array(24).fill(1)));
  const negative=Array(24).fill(null);negative[2]=-1;
  assert.throws(()=>hourly.set(all,'a','2026-10-02',negative));
  const decimal=Array(24).fill(null);decimal[2]=1.5;
  assert.throws(()=>hourly.set(all,'a','2026-10-02',decimal));
  all.stores.a.hourlyCustomers={'2026-10-02':[1,2]};
  assert.throws(()=>hourly.validate(all));
});
