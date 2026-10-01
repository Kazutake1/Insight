const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../insight_analysis_context_v1.js');

function setup(){
  const allStores={
    schemaVersion:1,
    current:'storeA',
    salesCountManagement:{
      version:1,
      categories:[
        {id:'cat_onigiri',name:'おにぎり',hidden:false,aliases:[]},
        {id:'cat_bento',name:'弁当',hidden:true,aliases:[]}
      ]
    },
    stores:{
      storeA:{
        name:'A店',
        data:{
          '2026':{
            '10月':[
              {d:1,'売上':100,'客数':100,'買上点数':150,'廃棄_1':1000,weather:'晴',tempMaxC:26,tempMinC:18,storeMemo:'通常営業'},
              {d:2,'売上':200,'客数':200,'買上点数':280,'廃棄_1':2000,weather:'雨',tempMaxC:22,tempMinC:17,storeMemo:'近隣イベント'},
              {d:3,'売上':300,'客数':250,'買上点数':350,'廃棄_1':0,weather:'曇',tempMaxC:24,tempMinC:16}
            ],
            '11月':[
              {d:1,'売上':120,'客数':110,'買上点数':160,'廃棄_1':500,weather:'晴',tempMaxC:20,tempMinC:12}
            ]
          }
        },
        monthlyOps:{
          '2026':{
            '10月':{laborCostYen:100000,grossMarginRate:31.5}
          }
        },
        salesCounts:{
          '2026-10-01':{
            cat_onigiri:{trips:[
              {delivery:40,sales:35},
              {delivery:50,sales:48},
              {delivery:null,sales:null}
            ]}
          },
          '2026-10-02':{
            cat_onigiri:{trips:[
              {delivery:0,sales:0},
              {delivery:60,sales:55},
              {delivery:30,sales:25}
            ]}
          },
          '2026-11-01':{
            cat_onigiri:{trips:[
              {delivery:20,sales:18},
              {delivery:20,sales:19},
              {delivery:20,sales:17}
            ]}
          }
        }
      }
    }
  };

  const KPIEngine={
    calc(rows){
      const salesYen=rows.reduce((sum,row)=>sum+Number(row['売上']||0)*1000,0);
      const customers=rows.reduce((sum,row)=>sum+Number(row['客数']||0),0);
      const items=rows.reduce((sum,row)=>sum+Number(row['買上点数']||0),0);
      const wasteYen=rows.reduce((sum,row)=>sum+Number(row['廃棄_1']||0),0);
      return {
        salesYen,
        customers,
        customerUnitPrice:customers?salesYen/customers:0,
        items,
        wasteYen,
        wasteRate:salesYen?wasteYen/salesYen*100:0,
        inputDays:rows.length
      };
    }
  };

  const InsightEvents={
    list(all,storeId,start,end){
      const event={
        id:'evt1',
        type:'nearby',
        scope:'store',
        startDate:'2026-10-02',
        endDate:'2026-10-02',
        snapshot:{title:'地域イベント',note:'駅前',version:1}
      };
      return event.startDate<=end&&event.endDate>=start?[event]:[];
    },
    summary(snapshot){return snapshot.title;}
  };

  const InsightSalesCount={
    normalizeRecord(value){
      return JSON.parse(JSON.stringify(value));
    }
  };

  const InsightYearComparison={
    isCompletedMonth(){return true;}
  };

  return {
    allStores,
    deps:{
      allStores,
      KPIEngine,
      InsightEvents,
      InsightSalesCount,
      InsightYearComparison,
      MONTHS:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
      isHoliday(year,month,day){return year===2026&&month===10&&day===2;}
    }
  };
}

test('月次contextはKPI・条件・イベント・販売納品・利益コストを共通形式で返す',()=>{
  const {deps}=setup();
  const ctx=model.buildMonth(2026,'10月',2,'storeA',deps);

  assert.equal(ctx.version,1);
  assert.deepEqual(ctx.store,{id:'storeA',name:'A店'});
  assert.equal(ctx.scope.kind,'month');
  assert.equal(ctx.scope.startDate,'2026-10-01');
  assert.equal(ctx.scope.endDate,'2026-10-02');

  assert.equal(ctx.metrics.salesYen,300000);
  assert.equal(ctx.metrics.customers,300);
  assert.equal(ctx.metrics.customerUnitPrice,1000);
  assert.equal(ctx.metrics.wasteYen,3000);
  assert.equal(ctx.metrics.inputDays,2);

  assert.equal(ctx.profitCost.available,true);
  assert.equal(ctx.profitCost.evaluationReady,true);
  assert.equal(ctx.profitCost.laborCostYen,100000);
  assert.equal(ctx.profitCost.grossMarginRate,31.5);
  assert.ok(Math.abs(ctx.profitCost.laborRate-33.3333333333)<0.0001);

  assert.equal(ctx.conditions.daily.length,2);
  assert.equal(ctx.conditions.daily[1].weather,'雨');
  assert.equal(ctx.conditions.daily[1].holiday,true);
  assert.deepEqual(ctx.conditions.daily[1].eventIds,['evt1']);
  assert.equal(ctx.conditions.events[0].summary,'地域イベント');

  const onigiri=ctx.salesCount.categories.find(c=>c.id==='cat_onigiri');
  assert.equal(onigiri.inputDays,2);
  assert.equal(onigiri.delivery.trips[0].count,2);
  assert.equal(onigiri.delivery.trips[0].sum,40);
  assert.equal(onigiri.sales.trips[0].sum,35);
  assert.equal(onigiri.delivery.total.count,1);
  assert.equal(onigiri.delivery.total.sum,90);

  const hidden=ctx.salesCount.categories.find(c=>c.id==='cat_bento');
  assert.equal(hidden.hidden,true);
  assert.equal(hidden.inputDays,0);
});

test('日次contextでは月次人件費・粗利を混在させない',()=>{
  const {deps}=setup();
  const ctx=model.buildDay('2026-10-02','storeA',deps);
  assert.equal(ctx.scope.kind,'day');
  assert.equal(ctx.metrics.salesYen,200000);
  assert.equal(ctx.profitCost.available,false);
  assert.equal(ctx.profitCost.laborCostYen,null);
  assert.match(ctx.profitCost.reason,/月次以外/);
});

test('任意期間は月をまたいで保存済み日次データを集計できる',()=>{
  const {deps}=setup();
  const ctx=model.buildRange('2026-10-02','2026-11-01','storeA',deps);
  assert.equal(ctx.scope.kind,'range');
  assert.equal(ctx.daily.length,3);
  assert.deepEqual(ctx.daily.map(d=>d.date),['2026-10-02','2026-10-03','2026-11-01']);
  assert.equal(ctx.metrics.salesYen,620000);
  assert.equal(ctx.metrics.customers,560);
  assert.equal(ctx.profitCost.available,false);

  const onigiri=ctx.salesCount.categories.find(c=>c.id==='cat_onigiri');
  assert.deepEqual(onigiri.daily.map(d=>d.date),['2026-10-02','2026-11-01']);
});

test('販売納品は空欄nullと入力値0を区別する',()=>{
  const {deps}=setup();
  const ctx=model.buildMonth(2026,10,2,'storeA',deps);
  const onigiri=ctx.salesCount.categories.find(c=>c.id==='cat_onigiri');
  assert.equal(onigiri.daily[0].trips[2].delivery,null);
  assert.equal(onigiri.daily[1].trips[0].delivery,0);
  assert.equal(onigiri.delivery.trips[0].count,2);
});

test('analysis context生成は既存保存データを書き換えない',()=>{
  const {allStores,deps}=setup();
  const before=JSON.stringify(allStores);
  model.buildMonth(2026,10,2,'storeA',deps);
  assert.equal(JSON.stringify(allStores),before);
});

test('不正な期間は拒否する',()=>{
  const {deps}=setup();
  assert.throws(()=>model.buildRange('2026-10-05','2026-10-01','storeA',deps),/分析対象期間/);
  assert.throws(()=>model.buildDay('2026-02-30','storeA',deps),/分析対象日/);
});
