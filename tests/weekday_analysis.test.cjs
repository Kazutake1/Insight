const test=require('node:test');
const assert=require('node:assert/strict');
const weekday=require('../insight_weekday_analysis_v1.js');

function day(date,weekdayIndex,sales,customers,waste,options={}){
  return {
    date,
    metrics:{
      salesYen:sales,
      customers,
      customerUnitPrice:customers?sales/customers:null,
      wasteYen:waste,
      wasteRate:sales?waste/sales*100:null,
      inputDays:1
    },
    conditions:{
      weekday:weekdayIndex,
      weekdayLabel:weekday.WEEKDAYS[weekdayIndex],
      holiday:!!options.holiday,
      eventIds:options.event?['evt-'+date]:[]
    }
  };
}

function setup(){
  const daily=[];
  const start=new Date(2026,6,13,12,0,0,0);
  for(let i=0;i<84;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const wd=d.getDay(),date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    let sales=100000,customers=100,waste=2000;
    if(wd===1){sales=120000;customers=115;waste=2200;}
    if(wd===2){sales=80000;customers=85;waste=1800;}
    const options={};
    if(date==='2026-08-03')options.event=true;
    if(date==='2026-09-21')options.holiday=true;
    daily.push(day(date,wd,sales,customers,waste,options));
  }
  const allStores={current:'storeA',stores:{storeA:{name:'A店',years:['2026']}}};
  return {
    allStores,
    daily,
    deps:{
      allStores,
      AnalysisContext:{
        buildRange(startDate,endDate){
          return {daily:daily.filter(item=>item.date>=startDate&&item.date<=endDate)};
        }
      }
    }
  };
}

test('通常日のみで曜日別基準を作りイベント・祝日は除外する',()=>{
  const {deps}=setup();
  const result=weekday.analyze({endDate:'2026-10-04',lookbackDays:84,storeId:'storeA'},deps);
  const mon=result.weekdays.find(x=>x.weekday===1);
  assert.equal(result.period.startDate,'2026-07-13');
  assert.equal(result.period.endDate,'2026-10-04');
  assert.equal(result.exclusions.eventDays,1);
  assert.equal(result.exclusions.holidayDays,1);
  assert.ok(result.exclusions.specialDates.includes('2026-08-03'));
  assert.ok(result.exclusions.specialDates.includes('2026-09-21'));
  assert.equal(mon.sampleCount,10);
  assert.equal(mon.excluded.eventDays,1);
  assert.equal(mon.excluded.holidayDays,1);
});

test('曜日別の売上・客数の強弱を全通常日平均との指数で判定する',()=>{
  const {deps}=setup();
  const result=weekday.analyze({endDate:'2026-10-04',lookbackDays:84,storeId:'storeA'},deps);
  const mon=result.weekdays[1],tue=result.weekdays[2],wed=result.weekdays[3];
  assert.equal(mon.metrics.salesYen.position.code,'high');
  assert.ok(mon.metrics.salesYen.position.index>100);
  assert.equal(mon.metrics.customers.position.code,'high');
  assert.equal(tue.metrics.salesYen.position.code,'low');
  assert.ok(tue.metrics.salesYen.position.index<100);
  assert.equal(wed.metrics.salesYen.position.code,'normal');
});

test('客単価と廃棄率は集計値から算出し単純な率平均にしない',()=>{
  const days=[
    day('2026-09-07',1,100000,100,1000),
    day('2026-09-14',1,200000,50,6000),
    day('2026-09-21',1,300000,150,3000)
  ];
  const agg=weekday.aggregate(days);
  assert.equal(agg.salesYen,200000);
  assert.equal(agg.customers,100);
  assert.equal(agg.customerUnitPrice,2000);
  assert.ok(Math.abs(agg.wasteRate-(10000/600000*100))<1e-9);
});

test('通常日が3件未満の曜日は強弱を断定しない',()=>{
  const position=weekday.metricPosition(120,100,weekday.METRICS.salesYen,2);
  assert.equal(position.code,'insufficient');
  assert.equal(position.label,'データ不足');
});

test('直近3回とその前3回で同曜日の最近傾向を判定する',()=>{
  const days=[
    day('2026-08-03',1,100,10,1),
    day('2026-08-10',1,100,10,1),
    day('2026-08-17',1,100,10,1),
    day('2026-08-24',1,120,12,1),
    day('2026-08-31',1,120,12,1),
    day('2026-09-07',1,120,12,1)
  ];
  const trend=weekday.recentTrend(days,'salesYen',weekday.METRICS.salesYen);
  assert.equal(trend.code,'up');
  assert.equal(trend.label,'上昇');
  assert.ok(Math.abs(trend.change-20)<1e-9);
});

test('分析は保存データを書き換えず外部送信フラグもfalse',()=>{
  const {allStores,deps}=setup(),before=JSON.stringify(allStores);
  const result=weekday.analyze({endDate:'2026-10-04',lookbackDays:84,storeId:'storeA'},deps);
  assert.equal(JSON.stringify(allStores),before);
  assert.equal(result.source.externalTransmission,false);
  assert.equal(result.source.readOnly,true);
});
