const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const ordered=[
  'insight_yoy_policy_v1.js',
  'insight_date_context_v1.js',
  'insight_hooks_v1.js',
  'insight_storage_v1.js',
  'insight_ops_v1.js',
  'insight_preserve_dailyops_v1.js',
  'insight_quick_date_nav_v1.js',
  'insight_ops_kpifix_v1.js',
  'insight_ai_ops_v1.js',
  'insight_backup_guard_v1.js',
  'insight_waste_insights_v1.js',
  'insight_dashboard_year_fix_v1.js',
  'insight_kyaku_insights_v1.js',
  'insight_sales_insights_v1.js',
  'insight_dashboard_kpi_sync_v1.js',
  'insight_kpi_order_v1.js',
  'insight_ai_presentation_v1.js',
  'insight_ai_visual_v1.js',
  'insight_events_v1.js',
  'insight_hourly_customers_v1.js',
  'insight_temperature_v1.js',
  'insight_weather_compact_v1.js',
  'insight_weather_temperature_auto_v1.js',
  'insight_weather_location_v1.js',
  'insight_input_weather_temp_v1.js',
  'insight_sales_count_v1.js',
  'insight_sale_results_v1.js',
  'insight_page_title_layout_v1.js',
  'insight_page_period_sync_v1.js',
  'insight_analysis_period_lock_v1.js',
  'insight_analysis_context_v1.js',
  'insight_event_results_v1.js',
  'insight_daily_anomaly_v1.js',
  'insight_weekly_review_v1.js',
  'insight_monthly_review_v1.js',
  'insight_analysis_history_v1.js',
  'insight_ai_interpretation_v1.js',
  'insight_ai_context_v1.js',
  'insight_ai_page_comments_v1.js'
];

test('機能スクリプトの読み込み順はIndex.htmlのmanifestで明示される',()=>{
  const index=read('Index.html');
  const start=index.indexOf('var orderedFeatureLoads=[');
  const end=index.indexOf('];',start);
  assert.ok(start>=0&&end>start,'orderedFeatureLoads manifestがありません');
  const manifest=index.slice(start,end+2);
  let last=-1;
  ordered.forEach(name=>{
    const first=manifest.indexOf(name);
    assert.ok(first>last,name+' の読み込み順が不正です');
    assert.equal(manifest.indexOf(name,first+1),-1,name+' がmanifest内で重複定義されています');
    last=first;
  });
});

test('旧動的scriptローダーはルートJSから除去されている',()=>{
  const files=fs.readdirSync(root).filter(name=>name.endsWith('.js'));
  const offenders=[];
  files.forEach(name=>{
    const source=read(name);
    if(/createElement\(\s*['"]script['"]\s*\)/.test(source))offenders.push(name);
  });
  assert.deepEqual(offenders,[]);
});

test('日付ナビは保存保護モジュールから動的ロードされない',()=>{
  const source=read('insight_preserve_dailyops_v1.js');
  assert.doesNotMatch(source,/insight_quick_date_nav_v1\.js/);
  const index=read('Index.html');
  assert.ok(index.indexOf('insight_date_context_v1.js')<index.indexOf('insight_hooks_v1.js'));
  assert.ok(index.indexOf('insight_hooks_v1.js')<index.indexOf('insight_storage_v1.js'));
  assert.ok(index.indexOf('insight_storage_v1.js')<index.indexOf('insight_ops_v1.js'));
  assert.ok(index.indexOf('insight_preserve_dailyops_v1.js')<index.indexOf('insight_quick_date_nav_v1.js'));
});

test('AIと分析補助モジュールはページ別AIより先に確定順で読み込む',()=>{
  const index=read('Index.html');
  for(const dependency of [
    'insight_ai_ops_v1.js',
    'insight_ai_visual_v1.js',
    'insight_waste_insights_v1.js',
    'insight_sales_insights_v1.js',
    'insight_kyaku_insights_v1.js',
    'insight_dashboard_kpi_sync_v1.js',
    'insight_sale_results_v1.js',
    'insight_page_period_sync_v1.js',
    'insight_analysis_period_lock_v1.js',
    'insight_analysis_context_v1.js',
    'insight_daily_anomaly_v1.js',
    'insight_weekly_review_v1.js',
    'insight_monthly_review_v1.js',
    'insight_analysis_history_v1.js',
    'insight_ai_interpretation_v1.js',
    'insight_ai_context_v1.js'
  ]){
    assert.ok(index.indexOf(dependency)<index.indexOf('insight_ai_page_comments_v1.js'),dependency+' がページ別AIより後です');
  }
});

test('廃棄分析の既存コンパクト表示スタイルは維持する',()=>{
  const source=read('insight_ops_kpifix_v1.js');
  assert.match(source,/insightWasteCompactStyle/);
  assert.match(source,/iwcRow/);
  assert.doesNotMatch(source,/insightWasteInsightsV1Script/);
});

test('bootstrap互換パッチはpayload展開処理より前に読み込む',()=>{
  const index=read('Index.html');
  assert.ok(index.indexOf('insight_bootstrap_patches_v1.js')<index.indexOf('Promise.all(files.map'),'bootstrap patch module must load before payload expansion');
});
