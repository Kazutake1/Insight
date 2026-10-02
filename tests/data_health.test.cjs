const test=require('node:test');
const assert=require('node:assert/strict');
const health=require('../insight_data_health_v1.js');

function day(d){return {d:String(d),売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:{},weather:''};}
function yearData(year){
  const out={};
  for(let month=1;month<=12;month++){
    const days=new Date(Number(year),month,0).getDate();
    out[month+'月']=Array.from({length:days},(_,i)=>day(i+1));
  }
  return out;
}
function clean(){
  return {
    current:'s1',
    stores:{
      s1:{name:'店舗A',years:['2025','2026'],data:{'2025':yearData('2025'),'2026':yearData('2026')},monthlyOps:{},salesCounts:{'2026-01-01':{}},hourlyCustomers:{'2026-01-01':Array(24).fill(null)}}
    }
  };
}

test('正常な保存構造は正常判定になる',()=>{
  const data=clean(),before=JSON.stringify(data);
  const report=health.check(data);
  assert.equal(report.ok,true);
  assert.equal(report.status,'ok');
  assert.equal(report.counts.total,0);
  assert.equal(JSON.stringify(data),before,'チェックは保存データを変更してはいけない');
});

test('未登録年度の残存データと日付別データを要確認として検出する',()=>{
  const data=clean(),store=data.stores.s1;
  store.data['2024']={'8月':[null,null,{d:'3'}]};
  store.monthlyOps['2024']={'8月':{}};
  store.salesCounts['2024-08-03']={};
  store.hourlyCustomers['2024-08-03']=Array(24).fill(null);
  const before=JSON.stringify(data);
  const report=health.check(data);
  const codes=report.issues.map(x=>x.code);
  assert.equal(report.status,'warning');
  assert.ok(codes.includes('orphan_data_year'));
  assert.ok(codes.includes('monthly_ops_unregistered_year'));
  assert.ok(codes.includes('sales_unregistered_year'));
  assert.ok(codes.includes('hourly_unregistered_year'));
  assert.equal(JSON.stringify(data),before,'要確認判定でも保存データを変更してはいけない');
});

test('正式年度内のnull行や日数不一致は重大として検出する',()=>{
  const data=clean(),rows=data.stores.s1.data['2025']['1月'];
  rows[0]=null;
  rows.pop();
  const report=health.check(data);
  assert.equal(report.status,'error');
  assert.ok(report.issues.some(x=>x.code==='month_length'));
  assert.ok(report.issues.some(x=>x.code==='daily_invalid'));
});

test('時間帯別客数の24時間形式と日付キーを検査する',()=>{
  const data=clean(),store=data.stores.s1;
  store.hourlyCustomers['2026-02-30']=[1,2];
  store.hourlyCustomers['2026-02-01']=[1,2];
  const report=health.check(data);
  assert.ok(report.issues.some(x=>x.code==='hourly_invalid_date'));
  assert.ok(report.issues.some(x=>x.code==='hourly_invalid_shape'));
});
