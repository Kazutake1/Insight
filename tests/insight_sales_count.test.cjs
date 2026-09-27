const test=require('node:test');
const assert=require('node:assert/strict');
const sales=require('../insight_sales_count_v1.js');

function base(){return {current:'a',stores:{a:{name:'A',years:['2026'],data:{},salesCounts:{}}}};}

test('old data receives safe defaults without changing existing store fields',()=>{
  const all=base();all.stores.a.keep='value';sales.ensure(all);
  assert.equal(all.stores.a.keep,'value');
  assert.deepEqual(all.salesCountManagement.categories.map(c=>c.name),['おにぎり','サンドイッチ','麺類']);
  assert.deepEqual(all.stores.a.salesCounts,{});
});

test('zero is averaged and null is excluded independently by trip',()=>{
  const a={trips:[{delivery:0,sales:null},{delivery:10,sales:0},{delivery:20,sales:5}]};
  const b={trips:[{delivery:null,sales:10},{delivery:20,sales:null},{delivery:40,sales:15}]};
  const delivery=sales.average([a,b],'delivery');
  const sold=sales.average([a,b],'sales');
  assert.deepEqual(delivery.trips,[0,15,30]);
  assert.equal(delivery.total,30);
  assert.deepEqual(sold.trips,[10,0,10]);
  assert.equal(sold.total,null);
});

test('daily average only includes records with all three values',()=>{
  const complete={trips:[{delivery:0,sales:1},{delivery:10,sales:2},{delivery:20,sales:3}]};
  const missing={trips:[{delivery:5,sales:4},{delivery:null,sales:5},{delivery:5,sales:6}]};
  assert.equal(sales.average([complete,missing],'delivery').total,30);
  assert.equal(sales.average([complete,missing],'sales').total,10.5);
});

test('legacy sale name remains linked after category rename through aliases',()=>{
  const all=base();sales.ensure(all);const category=all.salesCountManagement.categories[0];
  category.aliases.push(category.name);category.name='おむすび';
  assert.equal(sales.categoryForSale(all,{category:'おにぎり'}).id,'cat_onigiri');
  assert.equal(sales.categoryForSale(all,{category:'何でも',categoryId:'cat_onigiri'}).name,'おむすび');
});

test('validation allows 1000 and sales greater than delivery while rejecting negative values',()=>{
  const all=base();sales.ensure(all);all.stores.a.salesCounts['2026-09-01']={cat_onigiri:{trips:[{delivery:1,sales:1000},{delivery:0,sales:3},{delivery:null,sales:null}]}};
  assert.doesNotThrow(()=>sales.validate(all));
  all.stores.a.salesCounts['2026-09-01'].cat_onigiri.trips[0].delivery=-1;
  assert.throws(()=>sales.validate(all));
});
