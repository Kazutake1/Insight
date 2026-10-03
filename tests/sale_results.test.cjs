const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const saleResults=require('../insight_sale_results_v1.js');
const sales=require('../insight_sales_count_v1.js');
const events=require('../insight_events_v1.js');

function record(a,b,c){
  return {trips:[
    {delivery:a,sales:a-2},
    {delivery:b,sales:b-2},
    {delivery:c,sales:c-2}
  ]};
}
function fixture(){
  const all={
    salesCountManagement:{version:1,categories:[
      {id:'cat_onigiri',name:'おにぎり',hidden:false,aliases:[]},
      {id:'cat_sandwich',name:'サンドイッチ',hidden:false,aliases:[]}
    ]},
    eventManagement:{version:1,presets:[],events:[
      {id:'sale_sep',type:'sale',scope:'global',startDate:'2026-09-15',endDate:'2026-09-17',snapshot:{title:'おにぎりセール',sale:{categoryId:'cat_onigiri',category:'おにぎり',method:'amount',params:{amount:20}}}},
      {id:'sale_jul',type:'sale',scope:'global',startDate:'2026-07-20',endDate:'2026-07-20',snapshot:{title:'おにぎりセール',sale:{categoryId:'cat_onigiri',category:'おにぎり',method:'amount',params:{amount:20}}}},
      {id:'sale_apr',type:'sale',scope:'global',startDate:'2026-04-10',endDate:'2026-04-10',snapshot:{title:'おにぎり別セール',sale:{categoryId:'cat_onigiri',category:'おにぎり',method:'amount',params:{amount:30}}}},
      {id:'sale_sand',type:'sale',scope:'global',startDate:'2026-09-15',endDate:'2026-09-15',snapshot:{title:'サンド',sale:{categoryId:'cat_sandwich',category:'サンドイッチ',method:'amount',params:{amount:50}}}}
    ]},
    stores:{storeA:{name:'A店',salesCounts:{},events:[]}},
    current:'storeA'
  };
  [
    ['2026-09-15',40,50,45],['2026-09-16',42,52,46],['2026-09-17',44,54,48],
    ['2026-07-20',50,55,45],['2026-04-10',30,40,35],
    ['2026-09-08',32,42,37],['2026-09-09',33,43,38],['2026-09-10',34,44,39],
    ['2026-07-13',35,45,40],['2026-04-03',25,35,30]
  ].forEach(row=>{all.stores.storeA.salesCounts[row[0]]={cat_onigiri:record(row[1],row[2],row[3])};});
  return all;
}

test('同じセール内容は月をまたいで1グループへ集約する',()=>{
  const data=saleResults.collect(fixture(),'storeA','cat_onigiri','12','2026-10-01',{events,sales});
  const group=data.groups.find(g=>g.summary==='おにぎり 20円引き');
  assert.ok(group);
  assert.equal(group.occurrences.length,2);
  assert.deepEqual(group.days.map(d=>d.date),[
    '2026-09-15','2026-09-16','2026-09-17','2026-07-20'
  ]);
  assert.equal(group.days.length,4);
  assert.ok(group.averageDelivery>0);
  assert.ok(group.averageSales>0);
  assert.ok(group.sellThrough>0);
});

test('異なるセール内容は別グループに分離する',()=>{
  const data=saleResults.collect(fixture(),'storeA','cat_onigiri','12','2026-10-01',{events,sales});
  assert.deepEqual(data.groups.map(g=>g.summary).sort(),['おにぎり 20円引き','おにぎり 30円引き']);
});

test('カテゴリーが異なるセールは表示対象に含めない',()=>{
  const data=saleResults.collect(fixture(),'storeA','cat_onigiri','12','2026-10-01',{events,sales});
  assert.equal(data.groups.some(g=>/サンドイッチ/.test(g.summary)),false);
});

test('期間フィルタは月をまたいだ対象範囲を制限する',()=>{
  const three=saleResults.collect(fixture(),'storeA','cat_onigiri','3','2026-10-01',{events,sales});
  assert.equal(three.range.start,'2026-08-01');
  assert.deepEqual(three.groups.map(g=>g.summary),['おにぎり 20円引き']);
  assert.deepEqual(three.groups[0].days.map(d=>d.date),['2026-09-15','2026-09-16','2026-09-17']);
});

test('実績一覧は同曜日通常日比較を持つ',()=>{
  const data=saleResults.collect(fixture(),'storeA','cat_onigiri','12','2026-10-01',{events,sales});
  const sep=data.occurrences.find(o=>o.id==='sale_sep');
  assert.ok(sep);
  assert.ok(sep.normalCount>=1);
  assert.notEqual(sep.normalAverageSales,null);
  assert.notEqual(sep.normalRatio,null);
});

test('セール実績ページは販売数入力と同じ日別カードAPIを利用し7列で折り返す',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sale_results_v1.js'),'utf8');
  const salesSource=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  assert.match(source,/InsightSalesCount\.createReadOnlyDayCard/);
  assert.match(source,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(source,/\.sr-day-grid>\.sc-day\{min-width:0\}/);
  assert.match(salesSource,/model\.createReadOnlyDayCard=createReadOnlyDayCard/);
  assert.match(salesSource,/class="sc-total-delivery"/);
  assert.doesNotMatch(source,/localStorage|InsightStorage/);
});

test('セール実績は対象外便を日合計・通常日比較から除外する',()=>{
  const all=fixture();
  sales.ensure(all);
  const category=all.salesCountManagement.categories.find(c=>c.id==='cat_onigiri');
  category.activeTrips=[false,true,true];
  Object.values(all.stores.storeA.salesCounts).forEach(day=>{
    if(day.cat_onigiri){
      day.cat_onigiri.trips[0].delivery=null;
      day.cat_onigiri.trips[0].sales=null;
    }
  });
  const data=saleResults.collect(all,'storeA','cat_onigiri','12','2026-10-01',{events,sales});
  const sep=data.occurrences.find(o=>o.id==='sale_sep');
  assert.ok(sep);
  assert.notEqual(sep.averageDelivery,null);
  assert.notEqual(sep.averageSales,null);
  assert.ok(sep.normalCount>=1);
  assert.notEqual(sep.normalRatio,null);
});


test('同一セールのカテゴリー別条件は別々の実績見出しとして扱う',()=>{
  const all=fixture();
  all.salesCountManagement.categories.push({id:'cat_onigiri_mid',name:'おにぎり180〜239円',hidden:false,aliases:[],activeTrips:[true,true,true]});
  all.eventManagement.events=[{id:'multi_price',type:'sale',scope:'global',startDate:'2026-09-15',endDate:'2026-09-17',snapshot:{version:1,title:'おにぎり複数価格',note:'',sale:{
    category:'おにぎり・おにぎり180〜239円',categoryId:'cat_onigiri',method:'fixed',params:{maxPrice:179,price:100},
    targets:[
      {categoryId:'cat_onigiri',category:'おにぎり',method:'fixed',params:{maxPrice:179,price:100}},
      {categoryId:'cat_onigiri_mid',category:'おにぎり180〜239円',method:'fixed',params:{minPrice:180,maxPrice:239,price:150}}
    ]
  }}}];
  ['2026-09-15','2026-09-16','2026-09-17'].forEach(date=>{all.stores.storeA.salesCounts[date].cat_onigiri_mid=record(30,25,20);});
  const low=saleResults.collect(all,'storeA','cat_onigiri','12','2026-10-01',{events,sales});
  const mid=saleResults.collect(all,'storeA','cat_onigiri_mid','12','2026-10-01',{events,sales});
  assert.match(low.groups[0].summary,/100円均一/);
  assert.match(mid.groups[0].summary,/150円均一/);
  assert.doesNotMatch(low.groups[0].summary,/150円均一/);
});
