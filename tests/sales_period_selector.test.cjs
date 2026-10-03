const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const controls=require('../insight_sales_period_selector_v1.js');

test('月表記を1〜12へ正規化できる',()=>{
  assert.equal(controls.monthNumber('10月'),10);
  assert.equal(controls.monthNumber(1),1);
  assert.equal(controls.monthNumber('13月'),null);
});

test('販売数入力と同じく前月・翌月は年をまたいで1か月移動する',()=>{
  assert.deepEqual(controls.shiftPeriod(2025,12,1),{year:2026,month:1});
  assert.deepEqual(controls.shiftPeriod(2025,1,-1),{year:2024,month:12});
  assert.deepEqual(controls.adjacentPeriod(2026,10,-1),{year:2026,month:9});
});

test('売上・客数・廃棄の3ページを同じ操作方法へ統一する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/type:'sales'.*pageId:'pageSales'.*label:'売上'/);
  assert.match(source,/type:'kyaku'.*pageId:'pageKyaku'.*label:'客数'/);
  assert.match(source,/type:'haiki'.*pageId:'pageHaiki'.*label:'廃棄'/);
  assert.match(source,/className='sc-toolbar insight-input-period-toolbar'/);
  assert.match(source,/‹ 前月/);
  assert.match(source,/翌月 ›/);
  assert.doesNotMatch(source,/今月へ|年月を選択|insightSalesPeriodOverlay|data-month|hideLegacy|legacy-hidden|setTimeout|MutationObserver/);
});

test('未登録年度は販売数入力と同じ年度追加確認を経由する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/年度はダッシュボードに登録されていません/);
  assert.match(source,/InsightYearManager\.promoteCurrent/);
  assert.match(source,/既にある過去データは保持したまま/);
});

test('旧年月UIを後から隠さず、入力ページ更新フックで同期的に新UIを更新する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/input:table:after/);
  assert.match(source,/syncConfig\(config\)/);
  assert.match(source,/removeLegacyPlaceholders/);
  assert.doesNotMatch(source,/hideLegacy|legacy-hidden|setTimeout|queueMicrotask|MutationObserver/);
});

test('期間変更は既存同期処理を利用し保存処理を再実装しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/InsightPagePeriodSync\.setTarget/);
  assert.match(source,/InsightPagePeriodSync\.syncCurrentPage/);
  assert.doesNotMatch(source,/localStorage|InsightStorage\.writeSnapshot|InsightStorage\.transaction|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
