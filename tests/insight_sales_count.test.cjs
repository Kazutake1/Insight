const test=require('node:test');
const assert=require('node:assert/strict');
const sales=require('../insight_sales_count_v1.js');
const fs=require('node:fs');
const path=require('node:path');

function base(){return {current:'a',stores:{a:{name:'A',years:['2026'],data:{},salesCounts:{}}}};}

test('old data receives safe defaults without changing existing store fields',()=>{
  const all=base();all.stores.a.keep='value';sales.ensure(all);
  assert.equal(all.stores.a.keep,'value');
  assert.deepEqual(all.salesCountManagement.categories.map(c=>c.name),['おにぎり','サンドイッチ','麺類']);
  assert.deepEqual(all.salesCountManagement.categories.map(c=>c.activeTrips),[[true,true,true],[true,true,true],[true,true,true]]);
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

test('multiple sale targets link independently by stable category id',()=>{
  const all=base();sales.ensure(all);
  all.salesCountManagement.categories.push(
    {id:'cat_cold_noodles',name:'調理麺',hidden:false,aliases:[]},
    {id:'cat_cup_noodles',name:'カップ麺',hidden:false,aliases:[]},
    {id:'cat_other_noodles',name:'麺類その他',hidden:false,aliases:[]}
  );
  const sale={category:'調理麺・カップ麺・麺類その他',categoryId:'cat_cold_noodles',targets:[
    {categoryId:'cat_cold_noodles',category:'調理麺'},
    {categoryId:'cat_cup_noodles',category:'カップ麺'},
    {categoryId:'cat_other_noodles',category:'麺類その他'}
  ]};
  assert.deepEqual(sales.categoriesForSale(all,sale).map(c=>c.id),['cat_cold_noodles','cat_cup_noodles','cat_other_noodles']);
  all.salesCountManagement.categories.find(c=>c.id==='cat_cup_noodles').name='温かい麺';
  assert.deepEqual(sales.categoriesForSale(all,sale).map(c=>c.id),['cat_cold_noodles','cat_cup_noodles','cat_other_noodles']);
});

test('validation allows 1000 and sales greater than delivery while rejecting negative values',()=>{
  const all=base();sales.ensure(all);all.stores.a.salesCounts['2026-09-01']={cat_onigiri:{trips:[{delivery:1,sales:1000},{delivery:0,sales:3},{delivery:null,sales:null}]}};
  assert.doesNotThrow(()=>sales.validate(all));
  all.stores.a.salesCounts['2026-09-01'].cat_onigiri.trips[0].delivery=-1;
  assert.throws(()=>sales.validate(all));
});

test('validation rejects empty or fully hidden category masters and impossible dates',()=>{
  const empty=base();sales.ensure(empty);empty.salesCountManagement.categories=[];
  assert.throws(()=>sales.validate(empty),/カテゴリーマスター/);

  const hidden=base();sales.ensure(hidden);hidden.salesCountManagement.categories.forEach(c=>{c.hidden=true;});
  assert.throws(()=>sales.validate(hidden),/カテゴリーマスター/);

  const invalidDate=base();sales.ensure(invalidDate);
  invalidDate.stores.a.salesCounts['2026-09-31']={cat_onigiri:sales.emptyRecord()};
  assert.throws(()=>sales.validate(invalidDate),/日付データ/);
  assert.equal(sales.validDateKey('2024-02-29'),true);
  assert.equal(sales.validDateKey('2026-02-29'),false);
});

test('sale averages use each store date only once when events overlap',()=>{
  const first=sales.emptyRecord(),second=sales.emptyRecord();
  first.trips.forEach(t=>{t.sales=10;});second.trips.forEach(t=>{t.sales=30;});
  const rows=[
    {date:'2026-09-01',record:first},
    {date:'2026-09-01',record:first},
    {date:'2026-09-08',record:second}
  ];
  assert.equal(sales.average(sales.uniqueSaleRecords(rows),'sales').total,60);
});

test('分析AI向け平均カードは販売数入力カードと同じDOMクラス構造を再利用する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  assert.match(source,/function createAverageCard\(/);
  assert.match(source,/sc-day sc-average-card/);
  assert.match(source,/sc-day-title/);
  assert.match(source,/sc-day-num/);
  assert.match(source,/sc-col-head/);
  assert.match(source,/sc-trip sc-delivery-row/);
  assert.match(source,/sc-trip sc-sales-row/);
  assert.match(source,/class="sc-total-delivery"/);
  assert.match(source,/class="sc-total-sales"/);
  assert.match(source,/model\.createAverageCard=createAverageCard/);
});

test('対象外便は日合計平均の入力必須条件から除外する',()=>{
  const first={trips:[{delivery:null,sales:null},{delivery:20,sales:18},{delivery:30,sales:28}]};
  const second={trips:[{delivery:null,sales:null},{delivery:10,sales:9},{delivery:40,sales:35}]};
  const mask=[false,true,true];
  const delivery=sales.average([first,second],'delivery',mask);
  const sold=sales.average([first,second],'sales',mask);
  assert.deepEqual(delivery.trips,[null,15,35]);
  assert.equal(delivery.total,50);
  assert.deepEqual(sold.trips,[null,13.5,31.5]);
  assert.equal(sold.total,45);
});

test('既存カテゴリーは対象便未設定でも全3便対象として安全に移行する',()=>{
  const all=base();
  all.salesCountManagement={version:1,categories:[{id:'legacy',name:'旧カテゴリー',hidden:false,aliases:[]}]};
  sales.ensure(all);
  assert.deepEqual(all.salesCountManagement.categories[0].activeTrips,[true,true,true]);
  assert.doesNotThrow(()=>sales.validate(all));
});

test('カテゴリーは対象便を最低1便必要とする',()=>{
  const all=base();sales.ensure(all);
  all.salesCountManagement.categories[0].activeTrips=[false,false,false];
  assert.throws(()=>sales.validate(all),/販売数カテゴリー/);
});

test('対象外便のUIは対象外表示となり入力対象から外れる',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  assert.match(source,/activeTrips:\[true,true,true\]/);
  assert.match(source,/value='ー'/);
  assert.match(source,/sc-not-applicable/);
  assert.match(source,/対象便を1つ以上選択してください/);
  assert.match(source,/sc-category-trips/);
  assert.match(source,/activeTrips:activeTrips/);
});

test('曜日別平均の対象外便はダッシュ表示かつグレー表示にする',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const start=source.indexOf('function renderAverages()');
  assert.ok(start>=0);
  const block=source.slice(start,start+2600);
  assert.match(block,/class="sc-not-applicable"/);
  assert.match(block,/\?'ー':fmt\(value\)/);
  assert.doesNotMatch(block,/対象外/);
  const css=fs.readFileSync(path.join(__dirname,'..','insight_payload_core_v1.css'),'utf8');
  assert.match(css,/\.sc-average-row b\.sc-not-applicable\{background:var\(--surface2\)!important;border-color:var\(--border\)!important;color:var\(--text4\)!important/);
});


test('複数値引き条件でも通常カテゴリー実績を一度だけ使い専用区分入力を作らない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  assert.doesNotMatch(source,/saleSegmentCounts/);
  assert.doesNotMatch(source,/renderSaleSegments/);
  assert.doesNotMatch(source,/scSaleSegments/);
});


test('日種別平均は選択月・カテゴリーの保存実績から全イベントを除外し土曜を平日平均から除外する',()=>{
  const rec=value=>({trips:[{delivery:value,sales:value},{delivery:value,sales:value},{delivery:value,sales:value}]});
  const records={};
  for(const [date,value] of [['2026-09-01',10],['2026-09-05',20],['2026-09-06',30],['2026-09-21',40],['2026-09-22',50],['2026-09-23',60],['2026-09-27',70],['2026-08-31',900]])records[date]={cat:rec(value)};
  records['2026-09-02']={other:rec(900)};
  const excluded=new Set(['2026-09-22','2026-09-23','2026-09-27']);
  const groups=sales.dayTypeRecords(records,'cat','2026-09',date=>excluded.has(date)?[{type:'sale'}]:[],(y,m,d)=>d===21||d===23);
  assert.deepEqual(groups.weekday.map(r=>r.trips[0].sales),[10]);
  assert.deepEqual(groups.sundayHoliday.map(r=>r.trips[0].sales),[30,40]);
  assert.equal(sales.average(groups.weekday,'sales').total,30);
  assert.equal(sales.average(groups.sundayHoliday,'sales').total,105);
  assert.equal(sales.average([],'sales').total,null);
});
