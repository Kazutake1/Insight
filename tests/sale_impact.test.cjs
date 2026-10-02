const test=require('node:test');
const assert=require('node:assert/strict');
const impact=require('../insight_sale_impact_v1.js');
const events=require('../insight_events_v1.js');
const sales=require('../insight_sales_count_v1.js');

function iso(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
function daily(date,salesYen,customers,items,waste,options={}){
  const d=new Date(date+'T12:00:00');
  return {
    date,
    metrics:{
      salesYen,customers,items,wasteYen:waste,
      customerUnitPrice:customers?salesYen/customers:null,
      wasteRate:salesYen?waste/salesYen*100:null,
      inputDays:1
    },
    conditions:{
      weekday:d.getDay(),weekdayLabel:['日','月','火','水','木','金','土'][d.getDay()],
      holiday:!!options.holiday,eventIds:options.eventIds||[]
    }
  };
}
function salesRecord(totalSales,totalDelivery){
  return {trips:[
    {sales:Math.round(totalSales*0.3),delivery:Math.round(totalDelivery*0.3)},
    {sales:Math.round(totalSales*0.4),delivery:Math.round(totalDelivery*0.4)},
    {sales:totalSales-Math.round(totalSales*0.3)-Math.round(totalSales*0.4),delivery:totalDelivery-Math.round(totalDelivery*0.3)-Math.round(totalDelivery*0.4)}
  ]};
}
function fixture(){
  const event={id:'sale_oct',type:'sale',scope:'global',startDate:'2026-10-09',endDate:'2026-10-11',snapshot:{version:1,title:'おにぎりセール',note:'',sale:{categoryId:'cat_onigiri',category:'おにぎり',method:'amount',params:{amount:20}}}};
  const all={
    current:'storeA',
    salesCountManagement:{version:1,categories:[{id:'cat_onigiri',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]}]},
    eventManagement:{version:1,presets:[],events:[event]},
    stores:{storeA:{name:'A店',events:[],salesCounts:{}}}
  };
  const rows=[];
  const start=new Date('2026-09-11T12:00:00'),end=new Date('2026-11-08T12:00:00');
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    const date=iso(d),wd=d.getDay();
    const isSale=date>='2026-10-09'&&date<='2026-10-11';
    let salesYen=100000,customers=100,items=150,waste=2000,productSales=40,productDelivery=50;
    if(wd===5){salesYen=110000;customers=105;items=155;}
    if(wd===6){salesYen=120000;customers=110;items=165;}
    if(wd===0){salesYen=130000;customers=115;items=175;}
    if(isSale){salesYen*=1.2;customers*=1.15;items*=1.25;productSales=70;productDelivery=78;}
    if(date>'2026-10-11'&&(wd===5||wd===6||wd===0)){salesYen*=1.1;customers*=1.08;items*=1.1;productSales=48;productDelivery=56;}
    const eventIds=isSale?['sale_oct']:[];
    rows.push(daily(date,salesYen,customers,items,waste,{eventIds}));
    all.stores.storeA.salesCounts[date]={cat_onigiri:salesRecord(productSales,productDelivery)};
  }
  // Excluded comparator days.
  rows.find(x=>x.date==='2026-09-18').conditions.eventIds=['other_evt'];
  rows.find(x=>x.date==='2026-10-23').conditions.holiday=true;
  return {all,event,rows};
}

function deps(f){
  return {
    allStores:f.all,
    AnalysisContext:{
      buildRange(start,end){return {daily:f.rows.filter(x=>x.date>=start&&x.date<=end)};}
    },
    Events:events,
    SalesCount:sales
  };
}

test('同曜日・イベントなし・祝日なしの通常日でセール前後を比較する',()=>{
  const f=fixture();
  const result=impact.analyzeOccurrence({eventId:'sale_oct',storeId:'storeA',windowWeeks:4},deps(f));
  assert.equal(result.windows.before.startDate,'2026-09-11');
  assert.equal(result.windows.after.endDate,'2026-11-08');
  assert.equal(result.samples.saleDays,3);
  assert.deepEqual(result.samples.weekdayWeights,[1,0,0,0,0,1,1]);
  assert.ok(result.samples.beforeControlDays>=5);
  assert.ok(result.samples.afterControlDays>=5);
  assert.equal(result.policy.controlDayDefinition,'sameWeekdayNoEventNoHoliday');
  assert.equal(result.kpi.metrics.salesYen.pattern.code,'sustained_up');
  assert.equal(result.kpi.metrics.customers.pattern.code,'sustained_up');
});

test('曜日構成を重み付けするため金土日の通常差をセール効果と誤認しにくい',()=>{
  const f=fixture();
  const result=impact.analyzeOccurrence({eventId:'sale_oct',storeId:'storeA',windowWeeks:4},deps(f));
  assert.ok(result.kpi.before.salesYen>100000);
  assert.ok(result.kpi.during.salesYen>result.kpi.before.salesYen);
  assert.ok(result.kpi.after.salesYen>result.kpi.before.salesYen);
  assert.equal(result.kpi.metrics.salesYen.pattern.label,'終了後も上昇');
});

test('対象カテゴリーの販売数・納品数・消化率も前中後で比較する',()=>{
  const f=fixture();
  const result=impact.analyzeOccurrence({eventId:'sale_oct',storeId:'storeA',windowWeeks:4},deps(f));
  assert.deepEqual(result.product.categories,[{id:'cat_onigiri',name:'おにぎり'}]);
  assert.ok(result.product.during.averageSales>result.product.before.averageSales);
  assert.ok(result.product.during.averageDelivery>result.product.before.averageDelivery);
  assert.notEqual(result.product.during.sellThrough,null);
  assert.equal(result.product.metrics.averageSales.pattern.code,'sustained_up');
});

test('比較曜日ごとの通常日が2件未満なら効果を断定しない',()=>{
  const f=fixture();
  const result=impact.analyzeOccurrence({eventId:'sale_oct',storeId:'storeA',windowWeeks:1},deps(f));
  assert.equal(result.samples.beforeAvailable,false);
  assert.equal(result.kpi.metrics.salesYen.pattern.code,'insufficient');
});

test('セール期間中の祝日や別イベントを交絡要因として保持する',()=>{
  const f=fixture();
  f.rows.find(x=>x.date==='2026-10-10').conditions.holiday=true;
  f.rows.find(x=>x.date==='2026-10-11').conditions.eventIds.push('nearby_evt');
  const result=impact.analyzeOccurrence({eventId:'sale_oct',storeId:'storeA',windowWeeks:4},deps(f));
  assert.deepEqual(result.confounders.holidaySaleDays,['2026-10-10']);
  assert.equal(result.confounders.otherEventSaleDays[0].date,'2026-10-11');
  assert.deepEqual(result.confounders.otherEventSaleDays[0].eventIds,['nearby_evt']);
});

test('分析は保存データを書き換えず外部通信を行わない契約',()=>{
  const f=fixture(),before=JSON.stringify(f.all);
  const result=impact.analyzeOccurrence({eventId:'sale_oct',storeId:'storeA',windowWeeks:4},deps(f));
  assert.equal(JSON.stringify(f.all),before);
  assert.equal(result.source.readOnly,true);
  assert.equal(result.source.externalTransmission,false);
});

test('セール以外のイベントIDは拒否する',()=>{
  const f=fixture();
  f.all.eventManagement.events.push({id:'nearby',type:'nearby',scope:'store',startDate:'2026-10-01',endDate:'2026-10-01',snapshot:{version:1,title:'イベント',note:''}});
  assert.throws(()=>impact.analyzeOccurrence({eventId:'nearby',storeId:'storeA'},deps(f)),/対象セール/);
});
