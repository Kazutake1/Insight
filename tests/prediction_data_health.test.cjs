const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../insight_prediction_data_health_v1.js');

function sample(){
  const rows=Array.from({length:30},(_,i)=>({d:String(i+1),客数:0,weather:''}));
  rows[0]={d:'1',客数:0,weather:'晴',tempMaxC:28,tempMinC:22};
  rows[1]={d:'2',客数:14,weather:'雨',tempMaxC:27,tempMinC:20};
  rows[2]={d:'3',客数:0,weather:''};
  rows[3]={d:'4',客数:16,weather:'曇',tempMaxC:0,tempMinC:10};
  return {
    current:'a',salesCountManagement:{categories:[
      {id:'food',name:'おにぎり',activeTrips:[true,false,true],hidden:false},
      {id:'extra',name:'その他',activeTrips:[true,true,true],hidden:true}
    ]},
    stores:{
      a:{name:'A店',data:{2025:{'9月':rows}},salesCounts:{
        '2025-09-01':{food:{trips:[{delivery:10,sales:0},{delivery:30,sales:40},{delivery:null,sales:null}]}},
        '2025-09-02':{food:{trips:[{delivery:null,sales:5},{delivery:null,sales:null},{delivery:null,sales:null}]}},
        '2025-09-04':{food:{trips:[{delivery:8,sales:8},{delivery:null,sales:null},{delivery:0,sales:0}]}}
      }},
      b:{name:'B店',data:{},salesCounts:{}}
    }
  };
}

test('入力済みの0を含め、納品・販売を便別に計数し、対象外便は除外する',()=>{
  const data=sample(),before=JSON.stringify(data);
  const report=model.examine(data,{start:'2025-09-01',end:'2025-09-05'});
  const category=report.stores[0].categories[0];
  assert.equal(report.days,5);
  assert.deepEqual(category.trips.map(t=>t.active),[true,false,true]);
  assert.deepEqual(
    category.trips[0]&&[category.trips[0].delivery,category.trips[0].sales,category.trips[0].both,category.trips[0].zeroSales,category.trips[0].recentSales],
    [2,3,2,1,3]
  );
  assert.equal(category.trips[0].longestGap,1);
  assert.equal(category.trips[2].sales,1);
  assert.equal(category.trips[2].zeroSales,1);
  assert.equal(category.completeDays,1);
  assert.equal(JSON.stringify(data),before,'診断は元データを変更しない');
});

test('初期値客数0は入力済みと断定せず、天気・気温と別に集計する',()=>{
  const report=model.examine(sample(),{start:'2025-09-01',end:'2025-09-05'});
  const first=report.stores[0];
  assert.equal(first.customersPositive,2);
  assert.equal(first.customersUncertain,3);
  assert.equal(first.weather,3);
  assert.equal(first.temperature,3);
  assert.equal(first.weatherWithCustomer,2);
  assert.equal(report.stores[1].customersPositive,0);
  assert.equal(report.stores[1].customersUncertain,5);
  assert.equal(report.stores[1].categories[0].trips[0].longestGap,null);
});

test('未入力と0、対象外便、非表示カテゴリー、起点日、未来日を取り違えない',()=>{
  const data=sample();
  data.stores.a.salesCounts['2025-08-30']={food:{trips:[{delivery:10,sales:10}]}};
  const report=model.examine(data,{start:'2025-09-01',end:'2025-09-05'});
  assert.equal(report.stores[0].categories[0].trips[0].sales,3);
  assert.equal(report.stores[0].categories[1].hidden,true);
  assert.throws(()=>model.examine(data,{start:'2025-09-32',end:'2025-10-01'}));
  assert.throws(()=>model.examine(data,{start:'2025-10-05',end:'2025-09-05'}));
  const today=model.examine(data);
  assert.equal(today.start,'2025-09-01');
  assert.ok(today.end<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),'当日の未確定数値を集計しない');
});
