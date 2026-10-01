const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lock=require('../insight_analysis_period_lock_v1.js');

test('分析対象年月を正規化して保持できる',()=>{
  assert.deepEqual(lock.normalize({year:'2026',month:'9月',compareYear:'2025',source:'sales'}),{
    year:2026,month:9,monthLabel:'9月',day:null,compareYear:2025,source:'sales'
  });
  assert.equal(lock.setTarget({year:2026,month:9,compareYear:2025}),true);
  assert.equal(lock.getTarget().year,2026);
  assert.equal(lock.getTarget().month,9);
});

test('過去月の週次基準日は月末を使用する',()=>{
  lock.setTarget({year:2026,month:9});
  assert.equal(lock.referenceDate(),'2026-09-30');
});

test('日付付き対象はその日を週次基準日にする',()=>{
  lock.setTarget({year:2026,month:9,day:18});
  assert.equal(lock.referenceDate(),'2026-09-18');
});

test('不正な年月は拒否する',()=>{
  assert.equal(lock.normalize({year:2026,month:13}),null);
  assert.equal(lock.normalize({year:'x',month:9}),null);
});

test('期間ロックは保存層を使用しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_analysis_period_lock_v1.js'),'utf8');
  assert.doesNotMatch(source,/localStorage|InsightStorage/);
});

test('販売数ページは期間取得・期間同期APIを公開する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_v1.js'),'utf8');
  assert.match(source,/model\.getPeriod=function/);
  assert.match(source,/model\.setPeriod=function/);
  assert.match(source,/insight:sales-count-period-change/);
});
