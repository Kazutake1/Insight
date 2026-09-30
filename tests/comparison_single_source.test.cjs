const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('月次KPIの旧前年比計算関数は削除されている',()=>{
  for(const name of ['insight_ops_v1.js','insight_ops_kpifix_v1.js']){
    const source=read(name);
    assert.doesNotMatch(source,/function\s+comparisonPct\s*\(/,name+' に comparisonPct が残っています');
    assert.doesNotMatch(source,/function\s+grossMarginPoint\s*\(/,name+' に grossMarginPoint が残っています');
    assert.doesNotMatch(source,/\(now-prev\)\/prev\*100/,name+' に旧前年比率計算が残っています');
  }
});

test('月次KPIカードはInsightYearComparison.monthlyだけを比較元にする',()=>{
  for(const name of ['insight_ops_v1.js','insight_ops_kpifix_v1.js']){
    const source=read(name);
    assert.match(source,/InsightYearComparison\.monthly\(/,name+' が共通比較ポリシーを使っていません');
    assert.match(source,/monthlyComparisonDisplay\(/,name+' に表示変換がありません');
  }
});

test('ダッシュボードは比較ありの場合に共通period結果を再利用する',()=>{
  const source=read('insight_dashboard_kpi_sync_v1.js');
  assert.match(source,/shared=root\.InsightYearComparison\.getPeriod\(/);
  assert.match(source,/var current=shared&&shared\.current\?shared\.current:root\.KPIEngine\.getPeriod/);
  assert.match(source,/var previous=shared&&shared\.previous\?shared\.previous:null/);
  assert.doesNotMatch(source,/var previous=compare!=null\?root\.KPIEngine\.getPeriod/);
});

test('未使用の平均フィールド指定はダッシュボード定義から除去されている',()=>{
  const source=read('insight_dashboard_kpi_sync_v1.js');
  assert.doesNotMatch(source,/avg:'avgDaily/);
  for(const field of ['salesYen','customers','items','wasteYen'])assert.match(source,new RegExp("field:'"+field+"'"));
});

test('変更対象のキャッシュバスターは最新版を指す',()=>{
  const index=read('Index.html');
  assert.match(index,/insight_ops_v1\.js\?v=20260930-dedupe1/);
  assert.match(index,/insight_ops_kpifix_v1\.js\?v=20260930-dedupe1/);
  assert.match(index,/insight_dashboard_kpi_sync_v1\.js\?v=20260930-dedupe1/);
});
