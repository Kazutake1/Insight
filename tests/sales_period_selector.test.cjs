const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const selector=require('../insight_sales_period_selector_v1.js');

test('月表記を1〜12へ正規化できる',()=>{
  assert.equal(selector.monthNumber('10月'),10);
  assert.equal(selector.monthNumber(1),1);
  assert.equal(selector.monthNumber('13月'),null);
});

test('前月・次月は登録済み年度だけを年またぎできる',()=>{
  const years=['2024','2025','2026'];
  assert.deepEqual(selector.adjacentPeriod(2025,12,1,years),{year:2026,month:1});
  assert.deepEqual(selector.adjacentPeriod(2025,1,-1,years),{year:2024,month:12});
  assert.equal(selector.adjacentPeriod(2024,1,-1,years),null);
  assert.equal(selector.adjacentPeriod(2026,12,1,years),null);
});

test('年度一覧は重複を除き昇順へ正規化する',()=>{
  assert.deepEqual(selector.normalizeYears(['2026','2024',2025,'2026','bad']),[2024,2025,2026]);
});

test('売上年月UIは既存の保存処理を再実装しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/InsightPagePeriodSync\.setTarget/);
  assert.match(source,/root\.addYear/);
  assert.match(source,/pageSales/);
  assert.doesNotMatch(source,/localStorage|InsightStorage\.writeSnapshot|InsightStorage\.transaction|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
