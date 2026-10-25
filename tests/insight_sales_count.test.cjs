const test=require('node:test');
const assert=require('node:assert/strict');
const sales=require('../insight_sales_count_v1.js');
const fs=require('node:fs');
const path=require('node:path');


test('過去の日付・店舗別の天気は保存済みの行から参照し、欠損は推測せず表示する',()=>{
  const all={current:'a',stores:{a:{data:{'2026':{'10月':[]}}},b:{data:{'2026':{'10月':[]}}}}};
  all.stores.a.data['2026']['10月'][10]={d:'11',weather:'雨',tempMaxC:26.9,tempMinC:0};
  all.stores.b.data['2026']['10月'][10]={d:'11',weather:'晴',tempMaxC:21.2,tempMinC:12.7};
  all.stores.a.data['2026']['10月'][11]={d:'99',weather:'雪',tempMaxC:-2};
  const original=JSON.stringify(all);
  assert.deepEqual(sales.historicalWeather(all,'a','2026-10-11'),{weather:'雨',icon:'🌧️',max:'26',min:'0'});
  assert.deepEqual(sales.historicalWeather(all,'b','2026-10-11'),{weather:'晴',icon:'🌤️',max:'21',min:'12'});
  assert.deepEqual(sales.historicalWeather(all,'a','2026-10-12'),{weather:'—',icon:'—',max:'—',min:'—'});
  assert.deepEqual(sales.historicalWeather(all,'a','2026-09-11'),{weather:'—',icon:'—',max:'—',min:'—'});
  assert.deepEqual(sales.historicalWeather(all,'a','2026-10-XX'),{weather:'—',icon:'—',max:'—',min:'—'});
  assert.equal(JSON.stringify(all),original);
});

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
  assert.match(source,/value='／'/);
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
  assert.match(block,/\?'／':value===null\?'':fmt\(value\)/);
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

test('廃棄数のない既存スナップショットは変更せず検証できる',()=>{
  const all=base();sales.ensure(all);
  assert.equal(all.stores.a.wasteCounts,undefined);
  assert.doesNotThrow(()=>sales.validate(all));
  assert.equal(all.stores.a.wasteCounts,undefined);
});

test('廃棄数は未入力null・入力済み0・正の整数を区別する',()=>{
  const all=base();sales.ensure(all);
  const id=all.salesCountManagement.categories[0].id;
  all.stores.a.wasteCounts={'2026-10-11':{[id]:{trips:[null,0,3]}}};
  assert.doesNotThrow(()=>sales.validate(all));
  assert.deepEqual(sales.normalizeWasteRecord(undefined),{trips:[null,null,null]});
  assert.deepEqual(sales.normalizeWasteRecord(all.stores.a.wasteCounts['2026-10-11'][id]),{trips:[null,0,3]});
  assert.deepEqual(sales.wasteSummary({trips:[null,0,3]},[true,true,true]),{total:3,complete:false});
  assert.deepEqual(sales.wasteSummary({trips:[0,0,3]},[true,true,true]),{total:3,complete:true});
});

test('非対象便を合計しないが過去に保存された非対象便の値は捨てない',()=>{
  assert.deepEqual(sales.wasteSummary({trips:[0,null,3]},[true,false,true]),{total:3,complete:true});
  assert.deepEqual(sales.wasteSummary({trips:[0,2,3]},[true,false,true]),{total:5,complete:true});
});

test('廃棄数の店舗・日付・カテゴリー・便の不正値を拒否する',()=>{
  const make=()=>{const all=base();sales.ensure(all);const id=all.salesCountManagement.categories[0].id;all.stores.a.wasteCounts={'2026-10-11':{[id]:{trips:[0,null,2]}}};return {all,id};};
  for(const bad of [-1,1.5,'3',NaN,Infinity]){
    const {all,id}=make();all.stores.a.wasteCounts['2026-10-11'][id].trips[0]=bad;
    assert.throws(()=>sales.validate(all),/廃棄数/);
  }
  {
    const {all,id}=make();all.stores.a.wasteCounts['2026-10-11'][id].trips=[1,2];
    assert.throws(()=>sales.validate(all),/廃棄数/);
  }
  {
    const {all}=make();all.stores.a.wasteCounts={'2026-09-31':{cat_onigiri:{trips:[1,2,3]}}};
    assert.throws(()=>sales.validate(all),/廃棄数/);
  }
  {
    const {all}=make();all.stores.a.wasteCounts={'2026-10-11':{unknown_category:{trips:[1,2,3]}}};
    assert.throws(()=>sales.validate(all),/廃棄数/);
  }
});

test('廃棄数3行目は販売数入力ページだけに追加し既存平均カードを変更しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','insight_payload_core_v1.css'),'utf8');
  assert.match(source,/wasteRow\.append\(buildWasteInput/);
  assert.match(source,/nextStore\.wasteCounts=savedWaste/);
  assert.match(source,/persistTransaction\(next\);state\.wasteTouched=\{\};setDirty\(false\)/);
  assert.match(css,/#pageSalesCount \.sc-calendar>\.sc-day:not\(\.empty\)/);
  assert.doesNotMatch(source,/function createAverageCard[^\n]*sc-total-waste/);
});


test('廃棄集計と参照で過去の対象便の不明状態を保持する',()=>{
  assert.equal(sales.wasteTripStatus([true,false,true],'2025-09-11',1,'2026-10-11'),'unverified');
  assert.equal(sales.wasteTripStatus([true,false,true],'2026-10-11',1,'2026-10-11'),'inactive');
  assert.equal(sales.wasteTripStatus([true,false,true],'2026-10-12',1,'2026-10-11'),'inactive');
  assert.equal(sales.wasteTripStatus([true,true,true],'2025-09-11',1,'2026-10-11'),'active');
  assert.deepEqual(sales.wasteSummary({trips:[0,null,3]},[true,false,true],'2025-09-11','2026-10-11'),{total:3,complete:false});
  assert.deepEqual(sales.wasteSummary({trips:[0,null,3]},[true,false,true],'2026-10-11','2026-10-11'),{total:3,complete:true});
  assert.deepEqual(sales.wasteSummary({trips:[0,2,3]},[true,false,true],'2025-09-11','2026-10-11'),{total:5,complete:true});
});

test('廃棄数の保存成功時のみ編集済みフラグを初期化する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const save=source.slice(source.indexOf('function save(){'),source.indexOf('function notifyPeriodChange()'));
  assert.match(save,/persistTransaction\(next\);state\.wasteTouched=\{\};setDirty\(false\)/);
  assert.match(save,/catch\(e\)\{alert\('販売数を保存できませんでした/);
});


test('表示専用の廃棄数参照は店舗・日付・カテゴリーを区別し保存内容を変更しない',()=>{
  const all=base();sales.ensure(all);
  const id=all.salesCountManagement.categories[0].id;
  all.stores.a.wasteCounts={'2026-10-11':{[id]:{trips:[null,0,3]}}};
  all.stores.b={salesCounts:{},wasteCounts:{'2026-10-11':{[id]:{trips:[8,0,0]}}}};
  const before=JSON.stringify(all);
  assert.deepEqual(sales.wasteRecordAt(all,'a','2026-10-11',id),{trips:[null,0,3]});
  assert.deepEqual(sales.wasteRecordAt(all,'b','2026-10-11',id),{trips:[8,0,0]});
  assert.equal(sales.wasteRecordAt(all,'a','2026-10-12',id),null);
  assert.equal(sales.wasteRecordAt(all,'a','2026-10-11','other'),null);
  assert.equal(JSON.stringify(all),before);
});

test('セール・イベント・発注予測の実績カードだけ廃棄数を読み取り表示する',()=>{
  const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  const salesSource=read('insight_sales_count_v1.js');
  const saleSource=read('insight_sale_results_v1.js');
  const eventSource=read('insight_event_results_v1.js');
  const forecastSource=read('insight_order_forecast_v1.js');
  const css=read('insight_payload_core_v1.css');
  assert.match(salesSource,/withWaste=arguments\.length>=4/);
  assert.match(salesSource,/buildReadOnlyWasteInput/);
  assert.match(salesSource,/wasteSummary\(wasteRecord,mask,date\)/);
  assert.match(saleSource,/createReadOnlyDayCard\(day\.date,day\.record,category,/);
  assert.match(saleSource,/decision\.mask/);
  assert.match(eventSource,/function historicalSalesCard\(/);
  assert.match(eventSource,/createReadOnlyDayCard\(date,record,category,/);
  assert.match(eventSource,/resolver\.resolveDate\(allStores,currentStoreId\(\),category\.id,date\)/);
  assert.match(forecastSource,/createReadOnlyDayCard\(item\.date,item\.record,category,/);
  assert.match(forecastSource,/sales\.wasteRecordAt\(allStores,state\.storeId,item\.date,category\.id\),item\.mask/);
  assert.match(forecastSource,/sales\.createAverageCard\('6週平均',data\.deliveryAverage,data\.salesAverage,null,category,data\.averageMask\)/);
  assert.match(css,/#pageSalesCount \.sc-calendar \.sc-total-waste\{color:#111\}/);
  assert.match(css,/\.sc-day\.sc-readonly-waste\{height:auto;min-height:268px\}/);
  assert.match(css,/\.sc-day\.sc-readonly-waste \.sc-totals\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
});

test('過去天気の取得値と保存形式を保ち、共通SVG rendererで安全に表示する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const row=source.slice(source.indexOf('function createHistoricalWeatherRow('),source.indexOf('function createReadOnlyDayCard('));
  const all=base();sales.ensure(all);
  all.stores.a.data={'2026':{'10月':[]}};
  all.stores.a.data['2026']['10月'][10]={d:'11',weather:'大雨',tempMaxC:26,tempMinC:14};
  const before=JSON.stringify(all);
  assert.deepEqual(sales.historicalWeather(all,'a','2026-10-11'),{weather:'大雨',icon:'⛈️',max:'26',min:'14'});
  assert.deepEqual(sales.historicalWeather(all,'a','2026-10-12'),{weather:'—',icon:'—',max:'—',min:'—'});
  assert.equal(JSON.stringify(all),before,'reading historical weather must not mutate saved data');
  assert.match(row,/InsightWeatherIconCompat\.render\(icon,info\.weather\)/);
  assert.match(row,/if\(!icon\.firstChild&&!icon\.textContent\)icon\.textContent=info\.icon/);
  assert.doesNotMatch(row,/innerHTML/,'stored labels are never inserted as HTML');
  for(const consumer of ['insight_event_results_v1.js','insight_sale_results_v1.js','insight_order_forecast_v1.js']){
    assert.match(fs.readFileSync(path.join(__dirname,'..',consumer),'utf8'),/createHistoricalWeatherRow|createReadOnlyDayCard/);
  }
});

test('過去の日種別平均は既存の通常日判定を維持したまま日付情報を返せる',()=>{
  const rec=value=>({trips:[{delivery:value,sales:value},{delivery:value,sales:value},{delivery:null,sales:null}]});
  const records={
    '2026-09-01':{cat:rec(10)},
    '2026-09-05':{cat:rec(99)},
    '2026-09-06':{cat:rec(30)},
    '2026-09-21':{cat:rec(40)},
    '2026-09-22':{cat:rec(50)},
    '2026-09-23':{cat:rec(60)}
  };
  const original=JSON.stringify(records);
  const excluded=date=>date==='2026-09-22'?[{type:'sale'}]:[];
  const holiday=(y,m,d)=>d===21||d===23;
  const plain=sales.dayTypeRecords(records,'cat','2026-09',excluded,holiday);
  const dated=sales.dayTypeRecords(records,'cat','2026-09',excluded,holiday,true);
  assert.deepEqual(dated.weekday.map(item=>item.date),['2026-09-01']);
  assert.deepEqual(dated.sundayHoliday.map(item=>item.date),['2026-09-06','2026-09-21','2026-09-23']);
  assert.deepEqual(dated.weekday.map(item=>item.record),plain.weekday);
  assert.deepEqual(dated.sundayHoliday.map(item=>item.record),plain.sundayHoliday);
  assert.equal(JSON.stringify(records),original);
});

test('曜日別・平日・日祝平均の実装だけを月別の読み取り専用判定につなぐ',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const resolver=fs.readFileSync(path.join(__dirname,'..','insight_trip_history_resolver_v1.js'),'utf8');
  const loader=fs.readFileSync(path.join(__dirname,'..','insight_shell_loader_v1.js'),'utf8');
  assert.match(source,/function datedAverage\(rows,key\)/);
  assert.match(source,/resolver\.averageByDate\(allStores,allStores\.current,state\.categoryId,rows,key\)/);
  assert.match(source,/var ordinary=average\(rows\.map/);
  assert.match(source,/month>=localTodayKey\(\)\.slice\(0,7\)/);
  assert.match(source,/function weekdayRecords\(key\)/);
  assert.match(source,/function comparisonTable\(records,title\)/);
  assert.match(source,/var value=withDates\?/);
  assert.match(resolver,/function resolveDate\(/);
  assert.ok(loader.indexOf('insight_trip_history_resolver_v1.js')>loader.indexOf('insight_trip_overrides_v1.js'));
  assert.ok(loader.indexOf('insight_trip_history_resolver_v1.js')<loader.indexOf('insight_sale_results_v1.js'));
});


test('廃棄編集の対象外判定は現在のカテゴリー対象便と一致し過去値を消さない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const input=source.slice(source.indexOf('function buildWasteInput('),source.indexOf('function updateWasteTotal('));
  assert.match(input,/!tripActive\(selectedCategory\(\),index\)/);
  assert.match(input,/input\.readOnly=true/);
  assert.match(input,/value===null\?'／':String\(value\)/);
  assert.match(input,/保存済み・編集不可/);
  assert.doesNotMatch(input,/wasteTripStatus\(/);
  const all=base();sales.ensure(all);
  const id=all.salesCountManagement.categories[0].id;
  all.salesCountManagement.categories[0].activeTrips=[true,false,true];
  all.stores.a.wasteCounts={'2025-09-11':{[id]:{trips:[0,4,null]}}};
  const before=JSON.stringify(all);
  assert.doesNotThrow(()=>sales.validate(all));
  assert.deepEqual(sales.wasteRecordAt(all,'a','2025-09-11',id),{trips:[0,4,null]});
  assert.equal(JSON.stringify(all),before);
});


test('過去の廃棄対象便未確認は斜線で表示し、凡例を追加せず集計値を保持する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const renderer=source.slice(source.indexOf('function buildReadOnlyWasteInput('),source.indexOf('function createHistoricalWeatherRow('));
  assert.match(renderer,/status==='unverified'\?'ー':''/);
  assert.match(renderer,/value===null\?/);
  assert.match(renderer,/input\.classList\.add\('sc-waste-unverified'\)/);
  assert.doesNotMatch(source,/\?＝過去の対象便未確認|／＝過去の対象便未確認/);
  const all=base();sales.ensure(all);
  const id=all.salesCountManagement.categories[0].id;
  all.stores.a.wasteCounts={'2025-09-11':{[id]:{trips:[null,null,0]}}};
  const before=JSON.stringify(all);
  assert.deepEqual(sales.wasteRecordAt(all,'a','2025-09-11',id),{trips:[null,null,0]});
  assert.equal(JSON.stringify(all),before);
});


test('共有の実績・平均カードは未確認便だけ／表示にし、入力と履歴判定・データは変更しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const readonly=source.slice(source.indexOf('function buildReadOnlyInput('),source.indexOf('function buildReadOnlyWasteInput('));
  const average=source.slice(source.indexOf('function buildAverageInput('),source.indexOf('function createAverageCard('));
  const entry=source.slice(source.indexOf('function buildInput('),source.indexOf('function updateTotals('));
  for(const code of [readonly,average]){
    assert.match(code,/value='ー'/);
    assert.doesNotMatch(code,/value='\?'/);
    assert.match(code,/sc-waste-unverified/);
    assert.match(code,/sc-not-applicable/);
  }
  assert.match(readonly,/status===null&&saved===null/);
  assert.match(average,/enabled===null&&value===null/);
  assert.match(entry,/i\.value=r\.trips\[trip\]\[key\]===null\?'':String/);
  const all=base();sales.ensure(all);
  const id=all.salesCountManagement.categories[0].id;
  all.stores.a.salesCounts={'2026-09-01':{[id]:{trips:[
    {delivery:0,sales:null},{delivery:null,sales:null},{delivery:3,sales:2}
  ]}}};
  const baseline=JSON.stringify(all);
  assert.doesNotThrow(()=>sales.validate(all));
  assert.equal(JSON.stringify(all),baseline);
});


test('廃棄の数字と合計だけを青くし、0・未入力・対象外を区別する',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','insight_payload_core_v1.css'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  assert.match(css,/input\.has-val:not\(\.sc-not-applicable\)/);
  assert.match(css,/\.sc-total-waste\.has-val\{color:#2563eb!important\}/);
  assert.match(css,/\.sc-total-waste\.has-val\{color:#93c5fd!important\}/);
  assert.match(css,/\.sc-waste-row input\.sc-not-applicable\{background:/);
  assert.match(css,/\.sc-waste-row input\.sc-waste-unverified\{border-style:solid/);
  assert.equal(js.split("target.classList.toggle('has-val',summary.total!==null);").length-1,2);
  assert.match(js,/input\.classList\.toggle\('has-val',value!==null\)/);
  const all=base();sales.ensure(all);
  const category=all.salesCountManagement.categories[0];
  all.stores.a.wasteCounts={'2025-08-11':{[category.id]:{trips:[0,3,null]}}};
  const original=JSON.stringify(all);
  assert.deepEqual(sales.wasteRecordAt(all,'a','2025-08-11',category.id),{trips:[0,3,null]});
  assert.equal(JSON.stringify(all),original);
});


test('対象外に変更しても保存済みの納品・販売の0と正数を読み取り専用で表示する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  const editable=source.slice(source.indexOf('function buildInput('),source.indexOf('function updateTotals('));
  const readonly=source.slice(source.indexOf('function buildReadOnlyInput('),source.indexOf('function buildReadOnlyWasteInput('));
  assert.match(editable,/if\(!tripActive\(selectedCategory\(\),trip\)\)\{var saved=r\.trips\[trip\]\[key\]/);
  assert.match(editable,/i\.value=saved===null\?'／':String\(saved\)/);
  assert.match(editable,/i\.readOnly=true/);
  assert.match(editable,/保存済み・編集不可/);
  assert.match(readonly,/status===false&&saved===null/);
  assert.doesNotMatch(readonly,/status===false&&\(!hasHistory\|\|!recorded\)/);
  assert.match(readonly,/status===false\?' 対象外（保存済み・編集不可）'/);
  const all=base();sales.ensure(all);
  const category=all.salesCountManagement.categories[0];
  const before={trips:[
    {delivery:null,sales:null},
    {delivery:0,sales:12},
    {delivery:7,sales:0}
  ]};
  all.stores.a.salesCounts={'2026-10-01':{[category.id]:before}};
  category.activeTrips=[true,false,true];
  const snapshot=JSON.stringify(all);
  assert.doesNotThrow(()=>sales.validate(all));
  assert.deepEqual(all.stores.a.salesCounts['2026-10-01'][category.id].trips[1],
    {delivery:0,sales:12});
  assert.equal(JSON.stringify(all),snapshot);
});


// P4b: the REAL sales-count handlers run against an isolated, fabricated DOM.
// Only the new metadata read boundary is under test; this is not an iPad E2E.
function fictionalSalesDraftUI(){
  const vm=require('node:vm');
  const ids=new Map(),nodes=[],events=new Map(),notices=[],traffic=[];
  let blockedSave=false,acceptLeave=true,revision=0;
  function fakeNode(tag){
    const members=[],attrs={},classes=new Set();
    let id='';
    const n={
      tagName:String(tag).toUpperCase(),children:members,attrs,style:{},dataset:{},
      value:'',textContent:'',innerHTML:'',className:'',disabled:false,
      classList:{
        add(c){classes.add(c);},remove(c){classes.delete(c);},
        contains(c){return classes.has(c);},
        toggle(c,force){const present=force===undefined?!classes.has(c):!!force;
          if(present)classes.add(c);else classes.delete(c);return present;}
      },
      setAttribute(k,v){attrs[k]=String(v);},
      append(...x){members.push(...x);},appendChild(x){members.push(x);return x;},
      replaceChildren(...x){members.splice(0,members.length,...x);},
      insertAdjacentElement(_position,x){return x;},
      addEventListener(){},setCustomValidity(v){this.validationMessage=v;},
      querySelector(selector){return fakeNode(selector);},
      querySelectorAll(){return [];},
      closest(){return fakeNode('article');},blur(){},focus(){},
      matches(){return false;}
    };
    Object.defineProperty(n,'id',{get(){return id;},set(v){id=v;ids.set(v,n);}});
    nodes.push(n);return n;
  }
  for(const key of ['nav4','main','scSave','scPrev','scNext','scCategory','scManage',
    'scDirty','scPeriod','scCalendar','scAverages','scAnalysis','storeSel','storeMenu']){
    const n=fakeNode('div');n.id=key;
  }
  const doc={
    readyState:'loading',body:fakeNode('body'),
    getElementById(id){return ids.get(id)||null;},
    createElement:fakeNode,
    querySelector(selector){if(selector==='#pageSalesCount input:invalid')return null;return null;},
    querySelectorAll(){return [];},
    addEventListener(kind,fn){events.set(kind,fn);}
  };
  const year=String(new Date().getFullYear());
  const allStores={current:'a',stores:{a:{name:'架空店舗',years:[year],data:{},salesCounts:{}}}};
  let raw=JSON.stringify(allStores);
  const root={
    document:doc,allStores,
    addEventListener(){},dispatchEvent(){},fetch(url){traffic.push(url);throw Error('network forbidden');},
    InsightStorage:{writeSnapshot(next){
      if(blockedSave)throw Error('synthetic-save-rejected');
      raw=JSON.stringify(next);revision++;
    }},
    InsightEvents:{list(){return [];}},
    gotoNav(){},switchStore(){},
  };
  const context=vm.createContext({
    window:root,globalThis:root,document:doc,allStores,store:allStores.stores.a,
    WEEKDAYS:['日','月','火','水','木','金','土'],
    currentNav:'dashboard',
    confirm(){return acceptLeave;},
    alert(value){notices.push(String(value));},
    showToast(){},
    console:{log(v){traffic.push(['log',v]);},warn(v){traffic.push(['warn',v]);},
      error(v){traffic.push(['error',v]);}},
    Date,Intl,Number,String,Boolean,Object,Array,Map,Set,JSON,Promise,
    setTimeout(){return 1;},clearTimeout(){},
    CustomEvent:class {constructor(name,detail){this.type=name;this.detail=detail;}}
  });
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  vm.runInContext(source,context,{filename:'insight_sales_count_v1.js'});
  const model=root.InsightSalesCount;
  function status(){return model.getForecastDraftStatus();}
  function inputs(kind){
    const found=[];
    function visit(n){
      if(n&&n.oninput&&typeof n.oninput==='function'&&String(n.attrs['aria-label']||'').endsWith(kind))found.push(n);
      for(const c of n.children||[])visit(c);
    }
    visit(doc.getElementById('scCalendar'));
    return found;
  }
  return {
    model,doc,root,allStores,status,inputs,init(){events.get('DOMContentLoaded')();},
    save(){doc.getElementById('scSave').onclick();},
    changeCategory(id){doc.getElementById('scCategory').onchange({target:{value:id}});},
    set blockedSave(v){blockedSave=v;},
    set acceptLeave(v){acceptLeave=v;},
    get revision(){return revision;},get raw(){return raw;},traffic,notices
  };
}

test('P4b: uninitialized reader is unknown, initialized reader only exposes frozen metadata',()=>{
  const f=fictionalSalesDraftUI();
  assert.deepEqual(JSON.parse(JSON.stringify(f.status())),{initialized:false,dirty:null,epoch:null});
  f.init();
  const s=f.status();
  assert.equal(s.initialized,true);
  assert.equal(s.dirty,false);
  assert.equal(Number.isSafeInteger(s.epoch),true);
  assert.equal(Object.isFrozen(s),true);
  assert.deepEqual(Object.keys(s),['initialized','dirty','epoch']);
  assert.equal(f.traffic.length,0);
  assert.equal(f.notices.length,0);
  assert.equal(f.model.getForecastDraftStatus().epoch,s.epoch);
  assert.throws(()=>Object.defineProperty(s,'dirty',{value:true}));
  assert.equal(f.status().dirty,false);
});

test('P4b: real delivery and waste inputs advance epoch independently of saved raw and revision',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const a=f.inputs('納品数')[0],w=f.inputs('廃棄数')[0];
  assert.ok(a&&w);
  const initial=f.status(),before=JSON.stringify(f.allStores),raw=f.raw,rev=f.revision;
  a.value='7';a.oninput();
  assert.equal(f.status().dirty,true);
  assert.ok(f.status().epoch>initial.epoch);
  const first=f.status().epoch;
  a.value='';a.oninput();
  assert.ok(f.status().epoch>first);
  const second=f.status().epoch;
  a.value='0';a.oninput();
  assert.ok(f.status().epoch>second);
  const third=f.status().epoch;
  a.value='invalid';a.oninput();
  assert.ok(f.status().epoch>third);
  const fourth=f.status().epoch;
  w.value='0';w.oninput();
  assert.ok(f.status().epoch>fourth);
  const fifth=f.status().epoch;
  w.value='not-a-number';w.oninput();
  assert.ok(f.status().epoch>fifth);
  assert.equal(JSON.stringify(f.allStores),before);
  assert.equal(f.raw,raw);
  assert.equal(f.revision,rev);
  assert.deepEqual(Object.keys(f.status()),['initialized','dirty','epoch']);
  assert.equal(f.traffic.length,0);
});

test('P4b: failed save remains dirty, successful save advances epoch and clears dirty',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const n=f.inputs('販売数')[0];assert.ok(n);
  n.value='19';n.oninput();
  const before=f.status().epoch,raw=f.raw;
  f.blockedSave=true;f.save();
  assert.equal(f.status().dirty,true);
  assert.ok(f.status().epoch>=before);
  assert.equal(f.raw,raw);assert.equal(f.revision,0);
  f.blockedSave=false;f.save();
  assert.equal(f.status().dirty,false);
  assert.ok(f.status().epoch>before);
  assert.equal(f.revision,1);
  const last=f.status().epoch;
  f.model.reloadFromStore();
  assert.equal(f.status().dirty,false);
  assert.ok(f.status().epoch>last);
});

test('P4b: cancelled category change does not touch epoch, accepted change discards draft',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const field=f.inputs('納品数')[0];field.value='23';field.oninput();
  const s=f.status();
  const id=f.allStores.salesCountManagement.categories.find(c=>c.id!=='cat_onigiri').id;
  f.acceptLeave=false;f.changeCategory(id);
  assert.equal(f.status().epoch,s.epoch);assert.equal(f.status().dirty,true);
  f.acceptLeave=true;f.changeCategory(id);
  assert.ok(f.status().epoch>s.epoch);assert.equal(f.status().dirty,false);
  assert.equal(f.traffic.length,0);
});

test('P4b: status inquiry has no write, DOM change or raw-value disclosure',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const input=f.inputs('納品数')[0];input.value='837926';input.oninput();
  const before=f.status().epoch, saved=f.raw, original=JSON.stringify(f.allStores),events=f.traffic.length;
  const status=f.status();
  assert.equal(status.dirty,true);
  assert.doesNotMatch(JSON.stringify(status),/837926|架空店舗|cat_onigiri/);
  assert.equal(f.status().epoch,before);
  assert.equal(f.raw,saved);
  assert.equal(JSON.stringify(f.allStores),original);
  assert.equal(f.traffic.length,events);
});


test('P4b R1-A: partially failed reload is unknown until a complete read and render',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const start=f.status();assert.equal(start.initialized,true);
  const p=f.model.getPeriod();
  const date=p.year+'-'+String(p.month).padStart(2,'0')+'-01';
  f.allStores.stores.a.salesCounts[date]=null;
  assert.throws(()=>f.model.reloadFromStore(),TypeError);
  assert.deepEqual(JSON.parse(JSON.stringify(f.status())),{initialized:false,dirty:null,epoch:null});
  delete f.allStores.stores.a.salesCounts[date];
  assert.equal(f.model.reloadFromStore(),true);
  const fresh=f.status();
  assert.equal(fresh.initialized,true);
  assert.equal(fresh.dirty,false);
  assert.ok(fresh.epoch>start.epoch);
});

test('P4b R1-B: missing store invalidates previous clean state; recovery advances epoch',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const before=f.status();assert.equal(before.dirty,false);
  f.allStores.current='missing';
  assert.equal(f.model.reloadFromStore(),false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.status())),{initialized:false,dirty:null,epoch:null});
  f.allStores.current='a';
  assert.equal(f.model.reloadFromStore(),true);
  const restored=f.status();
  assert.equal(restored.initialized,true);assert.equal(restored.dirty,false);
  assert.ok(restored.epoch>before.epoch);
});

test('P4b R1-C: failed render after read cannot restore a stale clean report',()=>{
  const f=fictionalSalesDraftUI();f.init();
  const start=f.status();assert.equal(start.initialized,true);
  const get=f.doc.getElementById.bind(f.doc);
  f.doc.getElementById=(id)=>id==='scCalendar'?null:get(id);
  assert.throws(()=>f.model.reloadFromStore(),TypeError);
  assert.deepEqual(JSON.parse(JSON.stringify(f.status())),{initialized:false,dirty:null,epoch:null});
  f.doc.getElementById=get;
  assert.equal(f.model.reloadFromStore(),true);
  assert.ok(f.status().epoch>start.epoch);
  assert.equal(f.status().initialized,true);
});
