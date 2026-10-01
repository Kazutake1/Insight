const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sync=require('../insight_page_period_sync_v1.js');

test('通常画面の共有年月を正規化できる',()=>{
  assert.deepEqual(sync.normalize({year:'2026',month:'9月',source:'sales'}),{
    year:2026,month:9,monthLabel:'9月',day:null,source:'sales'
  });
  assert.equal(sync.normalize({year:2026,month:13}),null);
});

test('過去月を日付ページへ同期する場合は月末を基準日にする',()=>{
  const date=sync.referenceDate({year:2026,month:9});
  assert.equal(date.getFullYear(),2026);
  assert.equal(date.getMonth()+1,9);
  assert.equal(date.getDate(),30);
});

test('日付指定がある場合はその日を維持する',()=>{
  const date=sync.referenceDate({year:2026,month:9,day:18});
  assert.equal(date.getFullYear(),2026);
  assert.equal(date.getMonth()+1,9);
  assert.equal(date.getDate(),18);
});

test('全主要ページを同一期間へ同期する実装を持つ',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_page_period_sync_v1.js'),'utf8');
  assert.match(source,/function syncDashboard\(/);
  assert.match(source,/function syncInput\(/);
  assert.match(source,/function syncDaily\(/);
  assert.match(source,/function syncSalesCount\(/);
  assert.match(source,/editMonth\[type\]=value\.monthLabel/);
  assert.match(source,/selMonth=value\.monthLabel/);
  assert.match(source,/InsightSalesCount\.setPeriod\(value\.year,value\.month\)/);
});

test('サイドバー遷移中は遷移先の現在月を共有年月へ逆上書きしない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_page_period_sync_v1.js'),'utf8');
  assert.match(source,/var routeTransition=false/);
  assert.match(source,/closest\('#nav0,#nav1,#nav2,#nav3,#nav4,#navSalesCount'\)/);
  assert.match(source,/routeTransition=true/);
  assert.match(source,/if\(syncing\|\|routeTransition\)return/);
  assert.match(source,/scheduleRouteSync\(\)/);
});

test('分析AIが開いている場合は分析期間ロックを優先する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_page_period_sync_v1.js'),'utf8');
  assert.match(source,/InsightAnalysisPeriodLock\.isActive/);
  assert.match(source,/InsightAnalysisPeriodLock\.getTarget/);
  assert.match(source,/function effectiveTarget\(\)\{return analysisTarget\(\)\|\|target;\}/);
});

test('通常画面の期間同期は保存層を使用しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_page_period_sync_v1.js'),'utf8');
  assert.doesNotMatch(source,/localStorage|InsightStorage/);
});
