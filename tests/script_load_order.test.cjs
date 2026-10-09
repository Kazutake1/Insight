const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const shellSource=()=>read('Index.html')+'\n'+read('insight_shell_loader_v1.js');

const ordered=[
  'insight_weather_icon_compat_v1.js',
  'insight_weather_keys_compat_v1.js',
  'insight_yoy_policy_v1.js',
  'insight_date_context_v1.js',
  'insight_hooks_v1.js',
  'insight_storage_v1.js',
  'insight_persist_guard_v1.js',
  'insight_year_manager_v1.js',
  'insight_ops_v1.js',
  'insight_preserve_dailyops_v1.js',
  'insight_quick_date_nav_v1.js',
  'insight_ops_kpifix_v1.js',
  'insight_ai_ops_v1.js',
  'insight_backup_guard_v1.js',
  'insight_data_health_v1.js',
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
  'insight_sales_period_selector_v1.js',
  'insight_analysis_period_lock_v1.js',
  'insight_analysis_context_v1.js',
  'insight_multiyear_analysis_v1.js',
  'insight_weekday_analysis_v1.js',
  'insight_sale_impact_v1.js',
  'insight_event_impact_v1.js',
  'insight_seasonality_analysis_v1.js',
  'insight_anomaly_explanation_v1.js',
  'insight_event_results_v1.js',
  'insight_daily_anomaly_v1.js',
  'insight_weekly_review_v1.js',
  'insight_monthly_review_v1.js',
  'insight_analysis_history_v1.js',
  'insight_analysis_bundle_v1.js',
  'insight_ai_interpretation_v1.js',
  'insight_ai_context_v1.js',
  'insight_ai_page_comments_v1.js',
  'insight_settings_v1.js',
  'insight_weather_bulk_v1.js'
];

test('機能スクリプトの読み込み順はshell loaderのmanifestで明示される',()=>{
  const index=shellSource();
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

test('Indexはshell loaderを外部scriptとして読み込む',()=>{
  const index=read('Index.html');
  assert.match(index,/insight_shell_loader_v1\.js\?v=20261009-order-forecast-delivery-date-build-3/);
  assert.doesNotMatch(index,/var orderedFeatureLoads=/);
  assert.match(read('insight_shell_loader_v1.js'),/var orderedFeatureLoads=/);
});

test('shell BUILDはIndex metaとboot scriptで一致する',()=>{
  const index=read('Index.html');
  const boot=read('insight_shell_boot_v1.js');
  const meta=index.match(/<meta name="insight-shell-version" content="([^"]+)"/);
  const build=boot.match(/var BUILD="([^"]+)"/);
  assert.ok(meta&&build,'shell BUILD情報が取得できること');
  assert.equal(build[1],meta[1]);
  assert.ok(index.includes('insight_shell_boot_v1.js?v='+build[1]));
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
  const index=shellSource();
  assert.ok(index.indexOf('insight_date_context_v1.js')<index.indexOf('insight_hooks_v1.js'));
  assert.ok(index.indexOf('insight_hooks_v1.js')<index.indexOf('insight_storage_v1.js'));
  assert.ok(index.indexOf('insight_storage_v1.js')<index.indexOf('insight_persist_guard_v1.js'));
  assert.ok(index.indexOf('insight_persist_guard_v1.js')<index.indexOf('insight_ops_v1.js'));
  assert.ok(index.indexOf('insight_preserve_dailyops_v1.js')<index.indexOf('insight_quick_date_nav_v1.js'));
});

test('AIと分析補助モジュールはページ別AIより先に確定順で読み込む',()=>{
  const index=shellSource();
  for(const dependency of [
    'insight_ai_ops_v1.js',
    'insight_ai_visual_v1.js',
    'insight_waste_insights_v1.js',
    'insight_sales_insights_v1.js',
    'insight_kyaku_insights_v1.js',
    'insight_dashboard_kpi_sync_v1.js',
    'insight_sale_results_v1.js',
    'insight_page_period_sync_v1.js',
    'insight_sales_period_selector_v1.js',
    'insight_analysis_period_lock_v1.js',
    'insight_analysis_context_v1.js',
    'insight_multiyear_analysis_v1.js',
    'insight_weekday_analysis_v1.js',
    'insight_sale_impact_v1.js',
    'insight_event_impact_v1.js',
    'insight_seasonality_analysis_v1.js',
    'insight_anomaly_explanation_v1.js',
    'insight_daily_anomaly_v1.js',
    'insight_weekly_review_v1.js',
    'insight_monthly_review_v1.js',
    'insight_analysis_history_v1.js',
    'insight_analysis_bundle_v1.js',
    'insight_ai_interpretation_v1.js',
    'insight_ai_context_v1.js'
  ]){
    assert.ok(index.indexOf(dependency)<index.indexOf('insight_ai_page_comments_v1.js'),dependency+' がページ別AIより後です');
  }
});

test('廃棄分析の既存コンパクト表示スタイルは維持する',()=>{
  const source=read('insight_ops_kpifix_v1.js');
  const css=read('insight_payload_core_v1.css');
  assert.match(css,/#iwcRow \.iwc-card\{padding:7px 10px\}/);
  assert.match(css,/#iwcRow \.iwc-kpis\{gap:5px;margin-bottom:3px\}/);
  assert.doesNotMatch(source,/createElement\(['"]style['"]\)|\.style\.|cssText/);
  assert.doesNotMatch(source,/insightWasteInsightsV1Script/);
});

test('非圧縮payload読込はbootstrap文字列パッチと展開処理に依存しない',()=>{
  const index=shellSource();
  assert.doesNotMatch(index,/insight_bootstrap_patches_v1\.js|InsightBootstrapPatches/);
  assert.match(index,/fetch\('\.\/insight_payload_source_v1\.html\?v=20261006-static-styles-1'/);
  assert.doesNotMatch(index,/Promise\.all\(files\.map|pako\.ungzip|atob\(b64\)/);
  assert.match(index,/orderedFeatureLoads/);
});

