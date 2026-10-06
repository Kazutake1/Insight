const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const readShell=()=>[read('Index.html'),read('insight_shell_boot_v1.js'),read('insight_shell_loader_v1.js')].join('\n');

test('旧bootstrap shimは削除されshell loaderも依存しない',()=>{
  const index=read('Index.html');
  const loader=read('insight_shell_loader_v1.js');
  assert.equal(fs.existsSync(path.join(root,'insight_bootstrap_patches_v1.js')),false);
  assert.equal((index.match(/html=html\.replace/g)||[]).length,0);
  assert.equal((loader.match(/html=html\.replace/g)||[]).length,1);
  assert.doesNotMatch(index+loader,/insight_bootstrap_patches_v1\.js|InsightBootstrapPatches/);
});

test('Index shellはinline script/styleを持たず外部assetへ分離する',()=>{
  const index=read('Index.html');
  const boot=read('insight_shell_boot_v1.js');
  const loader=read('insight_shell_loader_v1.js');
  const css=read('insight_shell_v1.css');
  assert.match(index,/insight_shell_boot_v1\.js\?v=20261006-shell-external-1/);
  assert.match(index,/insight_shell_loader_v1\.js\?v=20261006-shell-external-1/);
  assert.match(index,/insight_shell_v1\.css\?v=20261006-shell-external-1/);
  assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(index,/<style\b/i);
  assert.match(boot,/fetch\('\.\/Index\.html\?insight_probe='/);
  assert.match(loader,/fetch\('\.\/insight_shell_loader_v1\.js\?insight_manifest_probe='/);
  assert.match(loader,/document\.open\(\);document\.write\(html\);document\.close\(\)/);
  assert.match(css,/#loading\{/);
});

test('トップページはキャッシュ抑止とシェル・機能manifestの自己更新を持つ',()=>{
  const index=readShell();
  assert.match(index,/insight-shell-version" content="20261006-shell-external-1/);
  assert.match(index,/var BUILD="20261006-shell-external-1"/);
  assert.match(index,/Shell rule: bump BUILD whenever the loader/);
  assert.match(index,/Cache-Control" content="no-cache, no-store, must-revalidate/);
  assert.match(index,/insight_probe=/);
  assert.match(index,/insight_manifest_probe=/);
  assert.match(index,/function featureSignature\(entries\)/);
  assert.match(index,/window\.__INSIGHT_FEATURE_SIGNATURE__=currentFeatureSignature/);
  assert.match(index,/remoteFeatureSignature!==currentFeatureSignature/);
  assert.match(index,/insight_manifest=/);
  assert.match(index,/cache:'no-store'/);
  assert.match(index,/location\.replace\('\.\/Index\.html\?insight_build='/);
  assert.doesNotMatch(index,/if\(params\.get\('insight_build'\)===BUILD\)return/);
});

test('天気アイコン拡張はruntime moduleが所有し旧bootstrap shimに依存しない',()=>{
  const index=readShell();
  const runtime=read('insight_weather_icon_compat_v1.js');
  assert.match(index,/insight_weather_icon_compat_v1\.js\?v=20261006-weather-icons-runtime-1/);
  assert.ok(index.indexOf('insight_weather_icon_compat_v1.js')<index.indexOf('insight_weather_compact_v1.js'));
  assert.match(runtime,/typeof WX_ICONS==='undefined'/);
  assert.match(runtime,/WX_ICONS\['霧'\]='🌫️'/);
  assert.doesNotThrow(()=>new vm.Script(runtime),'weather icon runtime module must be valid JavaScript');
});

test('天気キー拡張はruntime moduleが所有し旧bootstrap shimに依存しない',()=>{
  const index=readShell();
  const runtime=read('insight_weather_keys_compat_v1.js');
  assert.match(index,/insight_weather_keys_compat_v1\.js\?v=20261006-weather-keys-runtime-1/);
  assert.ok(index.indexOf('insight_weather_icon_compat_v1.js')<index.indexOf('insight_weather_keys_compat_v1.js'));
  assert.ok(index.indexOf('insight_weather_keys_compat_v1.js')<index.indexOf('insight_weather_compact_v1.js'));
  assert.match(runtime,/typeof WX_KEYS==='undefined'/);
  assert.match(runtime,/WX_KEYS\.indexOf\(wx\)<0/);
  assert.doesNotThrow(()=>new vm.Script(runtime),'weather key runtime module must be valid JavaScript');
});

test('未使用の天気相関グループは追加補正を持たない',()=>{
  const featureFiles=fs.readdirSync(root).filter(name=>name.endsWith('.js'));
  const consumers=featureFiles.filter(name=>/getCorrData|wxAvg|wxGroups/.test(read(name)));
  assert.deepEqual(consumers,[]);
});

test('Chart.js依存はshellでSRI付き読込しpayload内の旧タグを実行前に除去する',()=>{
  const index=readShell();
  assert.match(index,/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js/);
  assert.match(index,/integrity="sha512-CQBWl4fJHWbryGE\+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d\+6I\+1zze6Z7kHXO7q3UyZAWw=="/);
  assert.match(index,/crossorigin="anonymous" referrerpolicy="no-referrer"/);
  assert.match(index,/function stripPayloadChartScript\(html\)/);
  assert.match(index,/html=stripPayloadChartScript\(html\)/);
  assert.match(index,/typeof Chart==='undefined'/);
});

test('旧コア配色補正はruntime style moduleが所有する',()=>{
  const index=readShell();
  const compat=read('insight_legacy_style_compat_v1.js');
  assert.match(index,/insight_legacy_style_compat_v1\.js\?v=20261006-core-contrast-runtime-1/);
  assert.ok(index.indexOf('insight_legacy_style_compat_v1.js')<index.indexOf('insight_yoy_policy_v1.js'));
  assert.match(compat,/getPropertyValue\('background'\)/);
  assert.match(compat,/setProperty\('background','#1a1a1a'\)/);
  assert.match(compat,/setProperty\('color','#fff'\)/);
  assert.doesNotMatch(compat,/localStorage|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotThrow(()=>new vm.Script(compat),'legacy style compat module must be valid JavaScript');
});

test('AI表示CSSはIndexの文字列置換ではなくpresentation moduleが所有する',()=>{
  const index=readShell();
  const presentation=read('insight_ai_presentation_v1.js');
  for(const marker of [
    'body.ai-analysis-open #main{margin-right:390px;}',
    'position:fixed;top:0;right:0;bottom:0;z-index:10010;',
    '  .ai-analysis-panel{width:min(390px,88vw);max-width:none;}',
    '  .ai-analysis-panel{width:92vw;}',
    '.ai-analysis-empty{font-size:12px;line-height:1.7;color:var(--text4);}'
  ]) assert.ok(!index.includes("html=html.replace('"+marker),marker+' がIndexのreplaceに残っています');
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261006-header-compact-1/);
  assert.match(presentation,/insightAiPresentationStyle/);
  assert.doesNotMatch(presentation,/数値と要点を優先して表示/);
  assert.match(presentation,/body\.ai-analysis-open #main\{margin-right:0!important\}/);
  assert.match(presentation,/\.ai-analysis-panel\.ai-analysis-workspace/);
  assert.match(presentation,/\.ai-workspace-grid/);
  assert.match(presentation,/\.ai-analysis-question-row/);
  assert.match(presentation,/@media\(max-width:920px\)/);
  assert.doesNotThrow(()=>new vm.Script(presentation), 'presentation module must be valid JavaScript');
  assert.match(presentation,/var selected=currentNav===i;/);
  assert.doesNotMatch(presentation,/var selected=!open&&currentNav===i;/);
});

test('年間サマリーは買上点数だけを表示対象から外し縦方向の可読性を上げる',()=>{
  const index=readShell();
  const annual=read('insight_annual_summary_v1.js');
  assert.match(index,/insight_annual_summary_v1\.js\?v=20261005-remove-items-3/);
  assert.match(annual,/exact\(page,'年間サマリー'\)/);
  assert.match(annual,/function metricsForHeading\(heading\)/);
  assert.match(annual,/heading\.nextElementSibling/);
  assert.match(annual,/normalized\(block\)\.indexOf\('買上点数'\)>=0/);
  assert.match(annual,/buyBlock\.remove\(\)/);
  assert.match(annual,/insight-annual-summary-metric-label\{font-size:13px!important/);
  assert.match(annual,/insight-annual-summary-metric-value\{font-size:18px!important/);
  assert.match(annual,/insight-annual-summary-metrics\{row-gap:12px!important\}/);
  assert.match(annual,/insight-annual-summary-metric\{padding-top:6px!important;padding-bottom:6px!important\}/);
  assert.doesNotMatch(annual,/localStorage\.(?:setItem|removeItem|clear)/);
});

test('ダッシュボードKPIカードは補助月表示を削除し年比ラベルと数値バッジを表示する',()=>{
  const index=readShell();
  const sync=read('insight_dashboard_kpi_sync_v1.js');
  assert.match(index,/insight_dashboard_kpi_sync_v1\.js\?v=20261006-yen-suffix/);
  assert.match(sync,/box\.append\(badge,prev\);card\.appendChild\(box\)/);
  assert.match(sync,/prev\.textContent=String\(compareYear\)\+'年比'/);
  assert.match(sync,/function stripCardMeta\(\)/);
  assert.match(sync,/querySelectorAll\('\.kpi-label>span'\)/);
  assert.doesNotMatch(sync,/querySelectorAll\('\.kpi-label>span,\.kpi-prev'\)/);
  assert.match(sync,/if\(node&&node\.parentNode\)node\.parentNode\.removeChild\(node\)/);
  assert.match(sync,/badge\.textContent=\(display\.up\?'▲':'▼'\)\+' '\+display\.text/);
});

test('STEP17の可読性CSSは独立moduleで主要ページへ横展開する',()=>{
  const index=readShell();
  const readability=read('insight_readability_v1.js');
  assert.match(index,/insight_readability_v1\.js\?v=20261005-kpi-yoy-nowrap/);
  assert.ok(index.indexOf('insight_dark_theme_v1.js')<index.indexOf('insight_readability_v1.js'));
  assert.match(readability,/insightReadabilityStyle/);
  assert.match(readability,/#main\{padding-left:0!important;padding-right:0!important;min-width:0!important;box-sizing:border-box!important\}/);
  assert.match(readability,/\.page\{padding-left:12px!important;padding-right:12px!important;box-sizing:border-box!important;min-width:0!important;max-width:100%!important\}/);
  assert.match(readability,/InsightPageTitleLayout&&typeof root\.InsightPageTitleLayout\.alignAll==='function'/);
  assert.match(readability,/#pageDash \.kpi-card\{[^}]*height:110px!important;[^}]*border-radius:16px!important;[^}]*box-shadow:0 5px 16px rgba\(15,23,42,\.08\)!important/);
  assert.match(readability,/#pageDash \.kpi-label\{[^}]*left:16px!important;top:13px!important;[^}]*font-size:13px!important/);
  assert.match(readability,/#pageDash \.kpi-label>span\{display:none!important\}/);
  assert.match(readability,/#pageDash \.kpi-value\{[^}]*left:16px!important;top:39px!important;[^}]*text-align:left!important;[^}]*font-size:24px!important/);
  assert.match(readability,/#pageDash \.kpi-yoy\{[^}]*left:0!important;right:0!important;bottom:0!important;height:31px!important;[^}]*justify-content:space-between!important;[^}]*flex-wrap:nowrap!important;[^}]*gap:6px!important;[^}]*padding:0 10px!important/);
  assert.match(readability,/#pageDash \.kpi-yoy\{[^}]*border-top:1px solid var\(--border\)!important/);
  assert.match(readability,/#pageDash \.kpi-yoy\{[^}]*overflow:hidden!important/);
  assert.match(readability,/#pageDash \.kpi-badge\{[^}]*font-size:11\.5px!important;[^}]*white-space:nowrap!important;[^}]*flex:0 0 auto!important/);
  assert.match(readability,/#pageDash \.kpi-prev\{[^}]*margin-left:0!important;[^}]*font-size:11px!important;[^}]*white-space:nowrap!important;[^}]*flex:0 0 auto!important/);
  assert.match(readability,/#pageSales #issRow \.iss-stat,#pageKyaku #ikyRow \.iky-stat\{font-size:13px!important/);
  assert.match(readability,/#iwcRow \.iwc-kpi-value\{font-size:16px!important/);
  assert.match(readability,/#pageSalesCount \.sc-col-head,#pageSalesCount \.sc-average-head\{font-size:12\.5px!important/);
  assert.match(readability,/#pageSettings \.insight-settings-section h2\{font-size:17px!important/);
  assert.match(readability,/\.ai-analysis-workspace \.ai-analysis-card-title\{font-size:13px!important/);
  assert.match(readability,/\.hourly-dialog h2\{font-size:18px!important/);
  assert.match(readability,/root\.InsightReadability=\{VERSION:1\}/);
  assert.doesNotMatch(readability,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(readability),'readability module must be valid JavaScript');
});

test('AIのDOM・背景・開閉同期はpresentation moduleが所有する',()=>{
  const index=readShell();
  const presentation=read('insight_ai_presentation_v1.js');
  for(const marker of [
    '(<button id="aiAnalysisToggle"',
    '<aside id="aiAnalysisPanel" class="ai-analysis-panel"',
    'function openAIAnalysisPanel(){',
    'function closeAIAnalysisPanel(){',
    '<div class="ai-analysis-card">\\n      <div class="ai-analysis-card-title">経営コメント</div>'
  ]) assert.ok(!index.includes(marker),marker+' がIndexのpayload patchに残っています');
  assert.match(presentation,/function ensureAnalysisDom\(/);
  assert.match(presentation,/function ensureBackdrop\(/);
  assert.match(presentation,/function syncBackdrop\(/);
  assert.match(presentation,/aiAnalysisSummary/);
  assert.match(presentation,/aiAnalysisQuestion/);
  assert.match(presentation,/closeAIAnalysisPanel/);
});

test('分析AI内の重複サイドバーを廃止し本体ナビへ統合する',()=>{
  const presentation=read('insight_ai_presentation_v1.js');
  assert.doesNotMatch(presentation,/className='ai-workspace-left'/);
  assert.doesNotMatch(presentation,/\.ai-workspace-left\{/);
  assert.doesNotMatch(presentation,/createNavButton/);
  assert.doesNotMatch(presentation,/ai-workspace-nav-btn/);
  assert.match(presentation,/grid-template-columns:minmax\(0,3fr\) minmax\(0,2fr\)/);
  assert.match(presentation,/#nav0,#nav1,#nav2,#nav3,#nav4,#navSalesCount/);
  assert.match(presentation,/renderAIAnalysisPanel/);
});

test('STEP4の今週タブは週次レビューへ接続された状態を維持する',()=>{
  const presentation=read('insight_ai_presentation_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  assert.match(presentation,/setPeriod\(item\[1\]\)/);
  assert.match(pageAI,/analysisPeriod\(m\)!=='week'/);
  assert.match(pageAI,/weeklyQuestionAnswer/);
});

test('STEP5で今月タブを月次レビューへ接続する',()=>{
  const index=readShell();
  const pageAI=read('insight_ai_page_comments_v1.js');
  const monthly=read('insight_monthly_review_v1.js');
  assert.match(index,/insight_monthly_review_v1\.js\?v=20261001-step5/);
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-decision-analysis/);
  assert.match(pageAI,/function monthlyPanel\(/);
  assert.match(pageAI,/function monthlyQuestionAnswer\(/);
  assert.match(pageAI,/periodMode==='month'/);
  assert.match(pageAI,/page-ai-month-question/);
  assert.match(monthly,/var basis=isDone\?'total':'dailyAverage'/);
  assert.match(monthly,/badStreak/);
  assert.doesNotThrow(()=>new vm.Script(pageAI),'page AI module must be valid JavaScript');
});

test('STEP6で履歴タブ・週次月次切替・過去レビュー再表示を有効化する',()=>{
  const index=readShell();
  const presentation=read('insight_ai_presentation_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  const history=read('insight_analysis_history_v1.js');
  assert.match(index,/insight_analysis_history_v1\.js\?v=20261001-step6/);
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-decision-analysis/);
  assert.match(presentation,/aiHistoryToolbar/);
  assert.match(presentation,/aiHistoryPeriodList/);
  assert.match(presentation,/historySelected/);
  assert.doesNotMatch(presentation,/dataset\.analysisPeriod==='history'\)button\.disabled=true/);
  assert.match(pageAI,/function historyPanel\(/);
  assert.match(pageAI,/function historyQuestionAnswer\(/);
  assert.match(pageAI,/periodMode==='history'/);
  assert.match(pageAI,/page-ai-history-question/);
  assert.match(history,/function buildTimeline\(/);
  assert.doesNotMatch(history,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(presentation),'history presentation must be valid JavaScript');
  assert.doesNotThrow(()=>new vm.Script(pageAI),'history page AI must be valid JavaScript');
  assert.doesNotThrow(()=>new vm.Script(history),'history module must be valid JavaScript');
});

test('分析AIの対象年月をサイドバー切替後も固定し各ページへ同期する',()=>{
  const index=readShell();
  const presentation=read('insight_ai_presentation_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  const lock=read('insight_analysis_period_lock_v1.js');
  const salesCount=read('insight_sales_count_v1.js');
  assert.match(index,/insight_analysis_period_lock_v1\.js\?v=20261001-sync-owner/);
  assert.match(index,/insight_sales_count_v1\.js\?v=20261005-ipad-container-fit/);
  assert.match(presentation,/aiAnalysisTarget/);
  assert.match(presentation,/\.ai-workspace-period-label\{display:none!important\}/);
  assert.match(presentation,/\.ai-workspace-brand\{min-width:0;display:grid;align-content:center;gap:2px\}/);
  assert.match(presentation,/!window\.InsightPagePeriodSync&&window\.InsightAnalysisPeriodLock/);
  assert.match(pageAI,/InsightAnalysisPeriodLock\.getContext/);
  assert.match(pageAI,/InsightAnalysisPeriodLock\.referenceDate/);
  assert.match(lock,/function captureCurrent\(/);
  assert.match(lock,/function syncCurrentPage\(/);
  assert.match(lock,/InsightPagePeriodSync\.syncCurrentPage/);
  assert.doesNotMatch(lock,/function syncDashboard\(/);
  assert.doesNotMatch(lock,/function syncInput\(/);
  assert.match(salesCount,/model\.getPeriod=function/);
  assert.match(salesCount,/model\.setPeriod=function/);
  assert.doesNotMatch(lock,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(presentation),'period lock presentation must be valid JavaScript');
  assert.doesNotThrow(()=>new vm.Script(pageAI),'period lock page AI must be valid JavaScript');
  assert.doesNotThrow(()=>new vm.Script(lock),'period lock module must be valid JavaScript');
});

test('STEP7で将来AI接続用の共通analysisContext境界を追加する',()=>{
  const index=readShell();
  const aiContext=read('insight_ai_context_v1.js');
  assert.match(index,/insight_ai_context_v1\.js\?v=20261003-ai-pipeline-1/);
  assert.ok(index.indexOf('insight_analysis_history_v1.js')<index.indexOf('insight_ai_interpretation_v1.js'));
  assert.ok(index.indexOf('insight_ai_interpretation_v1.js')<index.indexOf('insight_ai_context_v1.js'));
  assert.ok(index.indexOf('insight_ai_context_v1.js')<index.indexOf('insight_ai_page_comments_v1.js'));
  assert.match(aiContext,/sourceOfTruth:'insight_deterministic_engine'/);
  assert.match(aiContext,/aiRole:'interpret_explain_summarize_only'/);
  assert.match(aiContext,/function createRequest\(/);
  assert.match(aiContext,/function toTransportPayload\(/);
  assert.match(aiContext,/includeFreeText/);
  assert.match(aiContext,/externalTransmission:false/);
  assert.doesNotMatch(aiContext,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(aiContext),'AI context module must be valid JavaScript');
});

test('設定ページはサイドバー下部の管理項目を集約する',()=>{
  const index=readShell();
  const settings=fs.readFileSync(path.join(root,'insight_settings_v1.js'),'utf8');
  assert.match(index,/insight_settings_v1\.js\?v=20261003-theme-bridge-hidden/);
  assert.ok(index.indexOf('insight_data_health_v1.js')<index.indexOf('insight_settings_v1.js'));
  assert.match(settings,/nav\.id='navSettings'/);
  assert.match(settings,/page\.id='pageSettings'/);
  assert.match(settings,/insightSettingsDataActions/);
  assert.match(settings,/append\(backup,restore,health,csv,restoreFile,csvFile\)/);
  assert.doesNotMatch(settings,/insightSettingsDisplayActions/);
  assert.match(settings,/themeBridge\.append\(dark\)/);
  assert.match(settings,/themeBridge\.style\.setProperty\('display','none','important'\)/);
  assert.match(settings,/sidebarActions\.replaceChildren\(themeWrap,nav\)/);
});

test('年度管理ボタンは設定へ移動し月ボタンはダッシュボード年度行へ移動する',()=>{
  const index=readShell();
  const layout=read('insight_year_controls_layout_v1.js');
  assert.match(index,/insight_year_controls_layout_v1\.js\?v=20261006-month-selected-border-2/);
  assert.ok(index.indexOf('insight_settings_v1.js')<index.indexOf('insight_year_controls_layout_v1.js'));
  assert.match(layout,/insightSettingsYearSection/);
  assert.match(layout,/insightSettingsYearActions/);
  assert.match(layout,/addYearInlineWrap/);
  assert.match(layout,/insight-dashboard-year-row/);
  assert.match(layout,/insight-dashboard-inline-months/);
  assert.match(layout,/insight-dashboard-inline-months>button\{background:#fff!important;color:#1a1a1a!important\}/);
  assert.match(layout,/insight-dashboard-selected-month\{border:2px solid #000!important;box-sizing:border-box!important;color:#1a1a1a!important\}/);
  assert.match(layout,/function syncSelectedMonth\(/);
  assert.match(layout,/insight-dashboard-inline-months>button:first-child\{margin-left:12px!important\}/);
  assert.match(layout,/monthRow\.parentElement!==yearRow/);
  assert.doesNotMatch(layout,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(layout),'year controls layout module must be valid JavaScript');
});

test('入力グラフ補助文の整理は入力3ページだけを対象にする',()=>{
  const index=readShell();
  const cleanup=read('insight_input_chart_cleanup_v1.js');
  assert.match(index,/insight_input_chart_cleanup_v1\.js\?v=20261006-remove-chart-copy-1/);
  assert.match(cleanup,/pageSales:\['月合計','グラフをタップで日付選択'\]/);
  assert.match(cleanup,/pageKyaku:\['月合計'\]/);
  assert.match(cleanup,/pageHaiki:\['月合計'\]/);
  assert.doesNotMatch(cleanup,/棒をタップで日付選択/);
  assert.doesNotMatch(cleanup,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(cleanup),'input chart cleanup module must be valid JavaScript');
});

test('売上・客数・廃棄の曜日別グラフ下部余白だけを詰める',()=>{
  const index=readShell();
  const spacing=read('insight_weekday_chart_spacing_v1.js');
  assert.match(index,/insight_weekday_chart_spacing_v1\.js\?v=20261006-fill-height-2/);
  assert.match(spacing,/#salesWdChart,#kyakuWdChart,#haikiWdChart/);
  assert.match(spacing,/#pageSales \*:has\(> #salesWdChart\)/);
  assert.match(spacing,/#pageKyaku \*:has\(> #kyakuWdChart\)/);
  assert.match(spacing,/#pageHaiki \*:has\(> #haikiWdChart\)/);
  assert.match(spacing,/padding-bottom:0!important/);
  assert.doesNotMatch(spacing,/localStorage|InsightStorage|persist\(/);
  assert.doesNotThrow(()=>new vm.Script(spacing),'weekday chart spacing module must be valid JavaScript');
});

test('入力曜日別グラフは入力変更で再描画し売上Y軸を千円から万円へ正しく換算する',()=>{
  const index=readShell();
  const fix=read('insight_weekday_chart_fix_v1.js');
  assert.match(index,/insight_weekday_chart_fix_v1\.js\?v=20261006-waste-zero-past-1/);
  assert.ok(index.indexOf('insight_input_chart_cleanup_v1.js')<index.indexOf('insight_weekday_chart_fix_v1.js'));
  assert.match(fix,/#pageSales #salesForm input\[data-k="売上"\]/);
  assert.match(fix,/#pageKyaku #kyakuGrid input\.kyaku-input/);
  assert.match(fix,/#pageHaiki #haikiForm input\[data-hc\]/);
  assert.match(fix,/root\.refreshSalesWdChart\(p\.year,p\.mi\)/);
  assert.match(fix,/root\.refreshKyakuWdChart\(p\.year,p\.mi\)/);
  assert.match(fix,/root\.refreshHaikiWdChart\(p\.year,p\.mi\)/);
  assert.match(fix,/var man=n\/10/);
  assert.match(fix,/function computeWasteWeekdayAverage\(/);
  assert.match(fix,/if\(date>=cutoff\)return/);
  assert.match(fix,/counts\[wd\]\+\+/);
  assert.match(fix,/wrapWasteRefresh\(\)/);
  assert.doesNotMatch(fix,/localStorage|InsightStorage|persist\(/);
  assert.doesNotThrow(()=>new vm.Script(fix),'weekday chart fix module must be valid JavaScript');
});

test('複数年度分析はAnalysisContextの後に読み込み読み取り専用で動作する',()=>{
  const index=readShell();
  const multi=read('insight_multiyear_analysis_v1.js');
  assert.match(index,/insight_multiyear_analysis_v1\.js\?v=20261003-multiyear-1/);
  assert.ok(index.indexOf('insight_analysis_context_v1.js')<index.indexOf('insight_multiyear_analysis_v1.js'));
  assert.ok(index.indexOf('insight_multiyear_analysis_v1.js')<index.indexOf('insight_daily_anomaly_v1.js'));
  assert.match(multi,/function analyzeMonth\(/);
  assert.match(multi,/basis=completed\?'total':'dailyAverage'/);
  assert.match(multi,/externalTransmission:false/);
  assert.doesNotMatch(multi,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(multi),'multi-year analysis module must be valid JavaScript');
});

test('曜日分析は複数年度分析の後に読み込みイベント・祝日を通常日基準から除外する',()=>{
  const index=readShell();
  const weekday=read('insight_weekday_analysis_v1.js');
  assert.match(index,/insight_weekday_analysis_v1\.js\?v=20261003-weekday-1/);
  assert.ok(index.indexOf('insight_multiyear_analysis_v1.js')<index.indexOf('insight_weekday_analysis_v1.js'));
  assert.ok(index.indexOf('insight_weekday_analysis_v1.js')<index.indexOf('insight_daily_anomaly_v1.js'));
  assert.match(weekday,/normalDayDefinition:'noEventAndNoHoliday'/);
  assert.match(weekday,/DEFAULT_LOOKBACK_DAYS=84/);
  assert.match(weekday,/externalTransmission:false/);
  assert.doesNotMatch(weekday,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(weekday),'weekday analysis module must be valid JavaScript');
});

test('セール影響分析は曜日分析の後に読み込み前中後を読み取り専用で比較する',()=>{
  const index=readShell();
  const impact=read('insight_sale_impact_v1.js');
  assert.match(index,/insight_sale_impact_v1\.js\?v=20261003-sale-impact-1/);
  assert.ok(index.indexOf('insight_weekday_analysis_v1.js')<index.indexOf('insight_sale_impact_v1.js'));
  assert.ok(index.indexOf('insight_sale_impact_v1.js')<index.indexOf('insight_daily_anomaly_v1.js'));
  assert.match(impact,/DEFAULT_WINDOW_WEEKS=4/);
  assert.match(impact,/controlDayDefinition:'sameWeekdayNoEventNoHoliday'/);
  assert.match(impact,/function analyzeOccurrence\(/);
  assert.match(impact,/externalTransmission:false/);
  assert.doesNotMatch(impact,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(impact),'sale impact module must be valid JavaScript');
});

test('イベント影響分析は通常同曜日と時間帯別客数を読み取り専用で比較する',()=>{
  const index=readShell();
  const impact=read('insight_event_impact_v1.js');
  assert.match(index,/insight_event_impact_v1\.js\?v=20261003-event-impact-1/);
  assert.ok(index.indexOf('insight_sale_impact_v1.js')<index.indexOf('insight_event_impact_v1.js'));
  assert.ok(index.indexOf('insight_event_impact_v1.js')<index.indexOf('insight_event_results_v1.js'));
  assert.match(impact,/controlDayDefinition:'sameWeekdayNoEventNoHoliday'/);
  assert.match(impact,/hourlyRequiresComplete24Hours:true/);
  assert.match(impact,/function analyzeOccurrence\(/);
  assert.doesNotMatch(impact,/wasteYen|wasteRate|日次客数|差異/);
  assert.match(impact,/externalTransmission:false/);
  assert.doesNotMatch(impact,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(impact),'event impact module must be valid JavaScript');
});

test('季節性分析は過去年度の季節指数と今年固有の変化を読み取り専用で分離する',()=>{
  const index=readShell();
  const season=read('insight_seasonality_analysis_v1.js');
  assert.match(index,/insight_seasonality_analysis_v1\.js\?v=20261003-seasonality-1/);
  assert.ok(index.indexOf('insight_event_impact_v1.js')<index.indexOf('insight_seasonality_analysis_v1.js'));
  assert.ok(index.indexOf('insight_seasonality_analysis_v1.js')<index.indexOf('insight_event_results_v1.js'));
  assert.match(season,/recurringDirectionRule:'twoThirds'/);
  assert.match(season,/eventAndHolidayTreatment:'includedAsSeasonality'/);
  assert.match(season,/targetMonthExcludedFromReference:true/);
  assert.match(season,/current_only_high/);
  assert.match(season,/externalTransmission:false/);
  assert.doesNotMatch(season,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(season),'seasonality module must be valid JavaScript');
});

test('異常説明レイヤーは曜日・セール・イベント・季節性を統合し既存警告を消さない',()=>{
  const index=readShell();
  const explanation=read('insight_anomaly_explanation_v1.js');
  const anomaly=read('insight_daily_anomaly_v1.js');
  assert.match(index,/insight_anomaly_explanation_v1\.js\?v=20261003-anomaly-context-1/);
  assert.match(index,/insight_daily_anomaly_v1\.js\?v=20261003-anomaly-context-1/);
  assert.ok(index.indexOf('insight_seasonality_analysis_v1.js')<index.indexOf('insight_anomaly_explanation_v1.js'));
  assert.ok(index.indexOf('insight_anomaly_explanation_v1.js')<index.indexOf('insight_daily_anomaly_v1.js'));
  assert.match(explanation,/weekdayRole:'contextOnlyBecauseCoreBaselineAlreadyWeekdayMatched'/);
  assert.match(explanation,/causality:'notAsserted'/);
  assert.match(explanation,/説明要因未特定/);
  assert.match(anomaly,/explainedAlerts/);
  assert.match(anomaly,/investigation/);
  assert.match(anomaly,/var display=findings\.filter/);
  assert.doesNotMatch(explanation,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(explanation),'anomaly explanation module must be valid JavaScript');
});

test('Firefox系ダークテーマは設定モジュールの後に読み込みライトモードを変更しない',()=>{
  const index=readShell();
  const theme=read('insight_dark_theme_v1.js');
  assert.match(index,/insight_dark_theme_v1\.js\?v=20261003-firefox-dark-1/);
  assert.ok(index.indexOf('insight_settings_v1.js')<index.indexOf('insight_dark_theme_v1.js'));
  assert.match(theme,/background:'#251b26'/);
  assert.match(theme,/surface:'#2f2942'/);
  assert.match(theme,/wine:'#432325'/);
  assert.match(theme,/\.dark\{/);
  assert.doesNotMatch(theme,/localStorage|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotThrow(()=>new vm.Script(theme),'dark theme module must be valid JavaScript');
});

test('全分析バンドルは履歴の後・AI解釈の前に読み込み外部通信せず標準化する',()=>{
  const index=readShell();
  const bundle=read('insight_analysis_bundle_v1.js');
  assert.match(index,/insight_analysis_bundle_v1\.js\?v=20261003-bundle-1/);
  assert.ok(index.indexOf('insight_analysis_history_v1.js')<index.indexOf('insight_analysis_bundle_v1.js'));
  assert.ok(index.indexOf('insight_analysis_bundle_v1.js')<index.indexOf('insight_ai_interpretation_v1.js'));
  assert.match(bundle,/contract:'InsightAnalysisBundle'/);
  assert.match(bundle,/aiConnected:false/);
  assert.match(bundle,/externalTransmission:false/);
  assert.match(bundle,/analysis:analysis/);
  assert.match(bundle,/contract:'InsightAIEvidence'/);
  assert.match(bundle,/providerNeutral:true/);
  assert.match(bundle,/causality:'association_only'/);
  assert.match(bundle,/reviews:\{/);
  assert.match(bundle,/signals:signals/);
  assert.match(bundle,/evidence:evidence/);
  assert.match(bundle,/diagnostics:diagnostics/);
  assert.doesNotMatch(bundle,/localStorage|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotThrow(()=>new vm.Script(bundle),'analysis bundle module must be valid JavaScript');
});

test('売上・客数・廃棄の旧年月UIはruntime selectorが除去し販売数入力方式だけを使う',()=>{
  const index=readShell();
  const controls=read('insight_sales_period_selector_v1.js');
  assert.doesNotMatch(index,/insight_bootstrap_patches_v1\.js|InsightBootstrapPatches/);
  assert.match(index,/insight_sales_period_selector_v1\.js\?v=20261006-input-period-runtime-2/);
  assert.ok(index.indexOf('insight_page_period_sync_v1.js')<index.indexOf('insight_sales_period_selector_v1.js'));
  assert.match(controls,/pageId:'pageSales'/);
  assert.match(controls,/pageId:'pageKyaku'/);
  assert.match(controls,/pageId:'pageHaiki'/);
  assert.match(controls,/sc-toolbar insight-input-period-toolbar/);
  assert.match(controls,/‹ 前月/);
  assert.match(controls,/翌月 ›/);
  assert.match(controls,/removeLegacyPlaceholders/);
  assert.match(controls,/model\.legacyCleanupMode='runtime'/);
  assert.match(controls,/function ensureLegacyPlaceholders\(config\)/);
  assert.match(controls,/function installLegacyBridge\(\)/);
  assert.match(controls,/__insightInputPeriodControls=true/);
  assert.match(controls,/input:table:after/);
  assert.doesNotMatch(controls,/hideLegacy|legacy-hidden|setTimeout|MutationObserver|今月へ|年月を選択|insightSalesPeriodOverlay/);
  assert.match(controls,/InsightYearManager\.promoteCurrent/);
  assert.match(controls,/InsightPagePeriodSync\.setTarget/);
  assert.doesNotMatch(controls,/localStorage|InsightStorage\.writeSnapshot|InsightStorage\.transaction|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotThrow(()=>new vm.Script(controls),'input period controls must be valid JavaScript');
});

test('保存データ健全性チェックは読み取り専用で不整合を可視化する',()=>{
  const index=readShell();
  const health=read('insight_data_health_v1.js');
  assert.match(index,/insight_data_health_v1\.js\?v=20261002-data-health/);
  assert.ok(index.indexOf('insight_backup_guard_v1.js')<index.indexOf('insight_data_health_v1.js'));
  assert.match(health,/function check\(snapshot\)/);
  assert.match(health,/orphan_data_year/);
  assert.match(health,/kind\+'_unregistered_year'/);
  assert.match(health,/dateYearCounts\(store\.salesCounts,registered,'sales'/);
  assert.match(health,/dateYearCounts\(store\.hourlyCustomers,registered,'hourly'/);
  assert.match(health,/データ状態：正常/);
  assert.match(health,/データ状態：要確認/);
  assert.match(health,/この確認は読み取り専用です/);
  assert.doesNotMatch(health,/localStorage\.setItem|InsightStorage\.writeSnapshot|InsightStorage\.persistCurrent/);
  assert.doesNotThrow(()=>new vm.Script(health),'data health module must be valid JavaScript');
});

test('過年度は既存の疎データを保持して正式年度へ昇格し販売数入力から追加できる',()=>{
  const index=readShell();
  const manager=read('insight_year_manager_v1.js');
  const salesCount=read('insight_sales_count_v1.js');
  assert.match(index,/insight_year_manager_v1\.js\?v=20261002-year-delete-consistency/);
  assert.ok(index.indexOf('insight_storage_v1.js')<index.indexOf('insight_year_manager_v1.js'));
  assert.ok(index.indexOf('insight_year_manager_v1.js')<index.indexOf('insight_sales_count_v1.js'));
  assert.match(manager,/function normalizeYearData\(/);
  assert.match(manager,/function promote\(/);
  assert.match(manager,/merged\.d=String\(targetIndex\+1\)/);
  assert.match(manager,/root\.addYear=function/);
  assert.match(salesCount,/function ensureRegisteredYear\(/);
  assert.match(salesCount,/年度を追加して販売数を入力しますか/);
  assert.match(salesCount,/InsightYearManager\.promoteCurrent/);
  assert.doesNotThrow(()=>new vm.Script(manager),'year manager module must be valid JavaScript');
});

test('年度削除は年度直結データをトランザクションで削除しイベント履歴を保持する',()=>{
  const index=readShell();
  const manager=read('insight_year_manager_v1.js');
  const yearFix=read('insight_dashboard_year_fix_v1.js');
  assert.match(index,/insight_year_manager_v1\.js\?v=20261002-year-delete-consistency/);
  assert.match(index,/insight_dashboard_year_fix_v1\.js\?v=20261006-legacy-year-cleanup-1/);
  assert.match(manager,/function removeYear\(/);
  assert.match(manager,/removeDateYear\(target\.salesCounts,y\)/);
  assert.match(manager,/removeDateYear\(target\.hourlyCustomers,y\)/);
  assert.match(manager,/function resolveSelection\(/);
  assert.match(manager,/model\.removeCurrent=removeCurrent/);
  assert.match(yearFix,/InsightYearManager\.removeCurrent\(chosen\)/);
  assert.match(yearFix,/イベント・催事の開催記録と店舗設定は削除しません/);
  assert.doesNotMatch(yearFix,/delete store\.data\[chosen\]/);
  assert.doesNotMatch(yearFix,/delete store\.monthlyOps\[chosen\]/);
  assert.doesNotThrow(()=>new vm.Script(yearFix),'year delete UI must be valid JavaScript');
});

test('今日の入力は未登録年度の日付移動前に正式年度追加を確認する',()=>{
  const index=readShell();
  const quick=read('insight_quick_date_nav_v1.js');
  assert.match(index,/insight_quick_date_nav_v1\.js\?v=20261006-keep-picker-open/);
  assert.match(quick,/function ensureRegisteredYear\(/);
  assert.match(quick,/InsightYearManager/);
  assert.match(quick,/年度を追加してこの日付を入力しますか/);
  assert.match(quick,/manager\.promoteCurrent\(year\)/);
  assert.match(quick,/if\(!ensureRegisteredYear\(date\)\)return/);
  assert.match(quick,/function selectDate\(date,preserveDatePicker\)/);
  assert.match(quick,/if\(date\)selectDate\(date,true\)/);
  assert.doesNotMatch(quick,/localStorage/);
  assert.doesNotThrow(()=>new vm.Script(quick),'quick date navigation must be valid JavaScript');
});

test('通常画面の選択年月をサイドバー切替後も全ページで維持する',()=>{
  const index=readShell();
  const pagePeriod=read('insight_page_period_sync_v1.js');
  assert.match(index,/insight_page_period_sync_v1\.js\?v=20261001-route-order/);
  assert.ok(index.indexOf('insight_sales_count_v1.js')<index.indexOf('insight_page_period_sync_v1.js'));
  assert.ok(index.indexOf('insight_page_period_sync_v1.js')<index.indexOf('insight_analysis_period_lock_v1.js'));
  assert.match(pagePeriod,/function captureCurrent\(/);
  assert.match(pagePeriod,/function syncDashboard\(/);
  assert.match(pagePeriod,/function syncInput\(/);
  assert.match(pagePeriod,/function syncDaily\(/);
  assert.match(pagePeriod,/function syncSalesCount\(/);
  assert.match(pagePeriod,/InsightAnalysisPeriodLock\.isActive/);
  assert.doesNotMatch(pagePeriod,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(pagePeriod),'page period module must be valid JavaScript');
});



test('時間帯別客数は日報客数と分離して日付別24時間データとして保存する',()=>{
  const index=readShell();
  const hourly=read('insight_hourly_customers_v1.js');
  assert.doesNotMatch(index,/insight_bootstrap_patches_v1\.js|InsightBootstrapPatches/);
  assert.match(index,/insight_hourly_customers_v1\.js\?v=20261006-remove-help/);
  assert.ok(index.indexOf('insight_events_v1.js')<index.indexOf('insight_hourly_customers_v1.js'));
  assert.ok(index.indexOf('insight_hourly_customers_v1.js')<index.indexOf('insight_event_results_v1.js'));
  assert.match(hourly,/hourlyCustomers/);
  assert.match(hourly,/Array\(24\)/);
  assert.match(hourly,/途中/);
  assert.match(hourly,/入力済み 24\/24/);
  assert.match(hourly,/getElementById\('insightEvents'\)/);
  assert.match(hourly,/insertBefore\(card,events\)/);
  assert.doesNotMatch(hourly,/0時〜23時の客数を入力してください。空欄は未入力、0は0人として保存します。/);
  assert.doesNotMatch(hourly,/日次客数|差異|暦日/);
  assert.doesNotThrow(()=>new vm.Script(hourly),'hourly customers module must be valid JavaScript');
});

test('イベント実績は過去開催・日付カード・時間帯グラフ・販売数カードを読み取り専用で表示する',()=>{
  const index=readShell();
  const eventResults=read('insight_event_results_v1.js');
  const events=read('insight_events_v1.js');
  assert.match(index,/insight_events_v1\.js\?v=20261006-multi-location-1/);
  assert.match(index,/insight_event_results_v1\.js\?v=20261006-hourly-fit-1/);
  assert.ok(index.indexOf('insight_analysis_context_v1.js')<index.indexOf('insight_event_results_v1.js'));
  assert.ok(index.indexOf('insight_event_results_v1.js')<index.indexOf('insight_daily_anomaly_v1.js'));
  assert.match(events,/\.ie-dialog\.ie-event-add \.ie-presets\{margin-top:10px\}/);
  assert.match(events,/scopeText\.hidden=hideScopeText/);
  assert.doesNotMatch(events,/全店舗共通・指定期間の各日に表示します。/);
  assert.doesNotMatch(events,/選ぶと上記の期間で登録します。個別の条件は下で入力できます。/);
  assert.doesNotMatch(events,/同じカテゴリー内に複数の値引きパターンがある場合は/);
  assert.doesNotMatch(events,/イベントは登録時に保存されます。日次の「クリア」では削除されません。/);
  assert.doesNotMatch(events,/変更内容は保存後、登録済みの期間全体に反映されます。/);
  assert.doesNotMatch(events,/プリセットを選ぶと、その内容で登録済みイベントを変更します。下の項目から個別編集もできます。/);
  assert.match(eventResults,/過去開催一覧/);
  assert.match(eventResults,/<span>イベント・催事<\/span>/);
  assert.match(eventResults,/page-title">イベント・催事実績/);
  assert.match(eventResults,/\/\* イベント・催事実績 v3:/);
  assert.match(eventResults,/data-kind="special">催事/);
  assert.match(eventResults,/collectSpecial/);
  assert.match(eventResults,/specialNames/);
  assert.match(eventResults,/\.er-toolbar \[hidden\]\{display:none!important\}/);
  assert.match(eventResults,/売上 /);
  assert.match(eventResults,/Math\.trunc\(Number\(value\)\/1000\)/);
  assert.match(eventResults,/\+'千円'/);
  assert.match(eventResults,/function overviewMetricGroup\(label,totalValue,averageValue\)/);
  assert.match(eventResults,/overviewMetricGroup\('売上',salesYen\(occurrence\.metrics\.salesYen\),salesYen\(dailyAverage\(occurrence,'salesYen'\)\)\)/);
  assert.match(eventResults,/overviewMetricGroup\('客数',people\(occurrence\.metrics\.customers\),people\(dailyAverage\(occurrence,'customers'\)\)\)/);
  assert.match(eventResults,/\[\['期間合計',totalValue\],\['1日平均',averageValue\]\]/);
  assert.match(eventResults,/function dailyAverage\(occurrence,key\)/);
  assert.match(eventResults,/finite\(day&&day\.metrics&&day\.metrics\[key\]\)!==null/);
  assert.doesNotMatch(eventResults,/summaryMetric\('客単価'/);
  assert.doesNotMatch(eventResults,/summaryMetric\('買上点数'/);
  assert.match(eventResults,/\.er-overview-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(230px,1fr\)\)/);
  assert.match(eventResults,/\.er-overview-values\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(eventResults,/客数 /);
  assert.match(eventResults,/er-day-tab/);
  assert.doesNotMatch(eventResults,/er-daily-summary|er-daily-grid/);
  assert.match(eventResults,/\.er-day-tab\{[^}]*flex:0 0 210px;[^}]*padding:13px 15px/);
  assert.match(eventResults,/\.er-day-tab strong\{font-size:15px\}/);
  assert.match(eventResults,/\.er-day-tab span\{font-size:13\.5px/);
  assert.match(eventResults,/時間帯別客数/);
  assert.match(eventResults,/\.er-hour-bar\{[^}]*background:#3b82f6/);
  assert.match(eventResults,/el\('button',undefined,'er-hour-plot'\)/);
  assert.match(eventResults,/aria-pressed/);
  assert.match(eventResults,/er-hour-value/);
  assert.match(eventResults,/\.er-occurrence-date\{font-size:14px\}/);
  assert.match(eventResults,/\.er-occurrence-metrics\{[^}]*font-size:13px/);
  assert.match(eventResults,/\.er-summary-card span\{[^}]*font-size:12\.5px/);
  assert.match(eventResults,/\.er-summary-card strong\{[^}]*font-size:18px/);
  assert.match(eventResults,/\.er-category-card>h3\{[^}]*font-size:14px/);
  assert.match(eventResults,/\.er-demand-card>h3\{[^}]*font-size:14\.5px/);
  assert.doesNotMatch(eventResults,/item\.append\(el\('strong',String\(value\)\)/);
  assert.match(eventResults,/\.er-hour-chart\{[^}]*gap:2px;[^}]*min-width:0/);
  assert.match(eventResults,/grid-template-columns:repeat\(24,minmax\(0,1fr\)\)/);
  assert.match(eventResults,/createReadOnlyDayCard/);
  assert.match(eventResults,/カテゴリー実績/);
  assert.match(eventResults,/特需商品/);
  assert.match(eventResults,/function demandComparison\(/);
  assert.match(eventResults,/er-demand-grid/);
  assert.match(eventResults,/前回：用意 /);
  assert.match(eventResults,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(eventResults,/@media\(max-width:1000px\)\{\.er-category-grid,\.er-demand-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
  assert.doesNotMatch(eventResults,/max-width:280px/);
  assert.doesNotMatch(eventResults,/カテゴリー別・便別実績/);
  assert.match(eventResults,/hourly\.complete/);
  assert.doesNotMatch(eventResults,/廃棄額|廃棄率|暦日/);
  assert.doesNotMatch(eventResults,/localStorage|InsightStorage/);
  assert.match(events,/イベント場所/);
  assert.match(events,/special:'催事'/);
  assert.match(events,/type\.value==='special'\?'催事名':'イベント名'/);
  assert.match(events,/よく使う催事/);
  assert.match(events,/よく使うイベント/);
  assert.match(events,/specialDemand/);
  assert.match(events,/function specialDemandEditor\(/);
  assert.match(events,/function nearbyPresetEditor\(/);
  assert.match(events,/function manageNearbyPresets\(/);
  assert.match(events,/syncDemandPreset/);
  assert.match(events,/商品名・カテゴリ名は自由入力/);
  assert.match(events,/specialPresets/);
  assert.match(events,/findDuplicateSpecial/);
  assert.match(events,/同じ店舗に同じ催事名・同じ期間の登録があります/);
  assert.match(events,/snapshot\.location=readLocation\(\)/);
  assert.doesNotThrow(()=>new vm.Script(eventResults),'event results module must be valid JavaScript');
});

test('全ページタイトルはダッシュボード基準の共通モジュールで位置を統一する',()=>{
  const index=readShell();
  const layout=read('insight_page_title_layout_v1.js');
  assert.match(index,/insight_page_title_layout_v1\.js\?v=20261002-title-align/);
  assert.ok(index.indexOf('insight_sale_results_v1.js')<index.indexOf('insight_page_title_layout_v1.js'));
  assert.ok(index.indexOf('insight_page_title_layout_v1.js')<index.indexOf('insight_page_period_sync_v1.js'));
  assert.match(layout,/var SELECTOR='\.page > \.page-header > \.page-title'/);
  assert.match(layout,/document\.getElementById\('pageDash'\)/);
  assert.match(layout,/getComputedStyle\(page\)/);
  assert.match(layout,/MutationObserver/);
  assert.match(layout,/align-self:flex-start!important/);
  assert.doesNotMatch(layout,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(layout),'page title layout module must be valid JavaScript');
});

test('セール実績ページは販売数入力直後に読み込み同一日別カードを再利用する',()=>{
  const index=readShell();
  const saleResults=read('insight_sale_results_v1.js');
  const sales=read('insight_sales_count_v1.js');
  assert.match(index,/insight_sales_count_v1\.js\?v=20261005-ipad-container-fit/);
  assert.match(index,/insight_sale_results_v1\.js\?v=20261006-sale-note-1/);
  assert.ok(index.indexOf('insight_sales_count_v1.js')<index.indexOf('insight_sale_results_v1.js'));
  assert.ok(index.indexOf('insight_sale_results_v1.js')<index.indexOf('insight_page_period_sync_v1.js'));
  assert.match(saleResults,/id='navSaleResults'|nav\.id='navSaleResults'/);
  assert.match(saleResults,/page\.id='pageSaleResults'/);
  assert.match(saleResults,/InsightSalesCount\.createReadOnlyDayCard/);
  assert.match(saleResults,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(saleResults,/group\.occurrences\.forEach\(function\(occurrence\)/);
  assert.match(saleResults,/sr-occurrence-grids/);
  assert.match(saleResults,/\.sr-occurrence-grids\{display:grid;gap:9px\}/);
  assert.doesNotMatch(saleResults,/\['開催日数',group\.days\.length\+'日'\]/);
  assert.match(saleResults,/\.sr-group-stats\{[^}]*grid-template-columns:repeat\(3,minmax\(88px,1fr\)\)/);
  assert.match(saleResults,/\['平均納品',fmt\(group\.averageDelivery,1\)\]/);
  assert.match(saleResults,/\['平均販売',fmt\(group\.averageSales,1\)\]/);
  assert.match(saleResults,/\['消化率',group\.sellThrough/);
  assert.match(saleResults,/\.sr-stat span\{[^}]*font-size:12px/);
  assert.match(saleResults,/\.sr-stat strong\{[^}]*font-size:16px/);
  assert.match(saleResults,/\.sr-group-head\{[^}]*align-items:flex-start/);
  assert.match(saleResults,/\.sr-group-head h2\{[^}]*font-size:17px/);
  assert.match(saleResults,/\.sr-list-table\{[^}]*font-size:12\.5px/);
  assert.match(saleResults,/\.sr-day-grid>\.sc-day\{min-width:0\}/);
  assert.match(sales,/model\.createReadOnlyDayCard=createReadOnlyDayCard/);
  assert.match(sales,/\.sc-totals b\{font-size:14px;text-align:center\}/);
  assert.match(sales,/\.sc-average-totals b\{font-size:14px;text-align:center\}/);
  assert.match(sales,/\.sc-totals b,\.sc-average-totals b\{font-size:14px\}/);
  assert.doesNotMatch(saleResults,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(saleResults),'sale results module must be valid JavaScript');
});

test('分析AIコメントは文章列ではなく構造化カードで表示し色は注意と改善だけに限定する',()=>{
  const index=readShell();
  const presentation=read('insight_ai_presentation_v1.js');
  const visual=read('insight_ai_visual_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  assert.match(index,/insight_ai_visual_v1\.js\?v=20261006-balanced-layout-1/);
  assert.ok(index.indexOf('insight_ai_presentation_v1.js')<index.indexOf('insight_ai_visual_v1.js'));
  assert.ok(index.indexOf('insight_ai_visual_v1.js')<index.indexOf('insight_ai_page_comments_v1.js'));
  assert.match(pageAI,/InsightAIVisual\.renderLines/);
  assert.match(visual,/ai-insight-item/);
  assert.match(visual,/ai-check-list/);
  assert.match(presentation,/\.ai-insight-value/);
  assert.match(presentation,/\.ai-insight-item\.is-danger/);
  assert.match(presentation,/\.ai-insight-item\.is-success/);
  assert.doesNotMatch(presentation,/--warning|--info|--accent2|--purple|--orange/);
  assert.doesNotThrow(()=>new vm.Script(visual),'AI visual module must be valid JavaScript');
});

test('月次分析AIは標準Evidenceを解釈層へ渡し旧crossAnalysisも互換維持する',()=>{
  const page=read('insight_ai_page_comments_v1.js');
  assert.match(page,/compactEvidence\(analysisBundle\)/);
  assert.match(page,/compactCrossAnalysis\(analysisBundle\)/);
  assert.match(page,/InsightAIInterpretation\.monthly\(review,theme,cross,evidence\)/);
  assert.match(page,/evidence=null/);
});


test('分析AIはダッシュボード再掲ではなく4ブロックの意思決定支援へ変換する',()=>{
  const index=readShell();
  const interpretation=read('insight_ai_interpretation_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  const presentation=read('insight_ai_presentation_v1.js');
  assert.match(index,/insight_ai_interpretation_v1\.js\?v=20261001-decision-analysis/);
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-decision-analysis/);
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261006-header-compact-1/);
  assert.match(index,/insight_ai_visual_v1\.js\?v=20261006-balanced-layout-1/);
  assert.ok(index.indexOf('insight_analysis_history_v1.js')<index.indexOf('insight_ai_interpretation_v1.js'));
  assert.ok(index.indexOf('insight_ai_interpretation_v1.js')<index.indexOf('insight_ai_page_comments_v1.js'));
  assert.match(interpretation,/売上 × 客数 × 客単価/);
  assert.match(interpretation,/客単価 × 買上点数 × 1点当たり売上/);
  assert.match(interpretation,/納品 × 販売 × 廃棄/);
  assert.match(interpretation,/因果関係は断定せず/);
  assert.match(pageAI,/function renderStructured\(/);
  assert.match(pageAI,/setSectionTitle\('aiAnalysisSummary','結論'\)/);
  assert.match(pageAI,/setSectionTitle\('aiAnalysisCaution','重要ポイント'\)/);
  assert.match(pageAI,/setSectionTitle\('aiAnalysisGood','関連性'\)/);
  assert.match(pageAI,/setSectionTitle\('aiAnalysisChecks','次に確認すること'\)/);
  assert.match(presentation,/createCard\('結論','aiAnalysisSummary'\)/);
  assert.doesNotMatch(interpretation,/localStorage|InsightStorage|fetch\s*\(/);
  assert.doesNotThrow(()=>new vm.Script(interpretation),'AI interpretation module must be valid JavaScript');
});

test('店舗運営UIのCSSはops moduleが所有する',()=>{
  const index=readShell();
  const ops=read('insight_ops_v1.js');
  assert.ok(!index.includes("html=html.replace('</style>'"));
  assert.match(ops,/insightOpsV1Style/);
  assert.match(ops,/\.ops-daily-wrap/);
  assert.match(ops,/\.monthly-ops-card/);
});

test('安全・互換処理は各所有層へ分離済み',()=>{
  const index=readShell();
  assert.doesNotMatch(index,/insight_bootstrap_patches_v1\.js|InsightBootstrapPatches/);
  assert.match(read('insight_weather_keys_compat_v1.js'),/InsightWeatherKeysCompat/);
  assert.match(read('insight_weather_icon_compat_v1.js'),/InsightWeatherIconCompat/);
  assert.match(read('insight_persist_guard_v1.js'),/InsightPersistGuard/);
  assert.match(read('insight_persist_guard_v1.js'),/InsightStorage\.persistCurrent/);
  assert.match(index,/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js" integrity=/);
  assert.match(index,/referrerpolicy="no-referrer"/);
  assert.match(index,/stripPayloadChartScript/);
  assert.match(read('insight_dashboard_year_fix_v1.js'),/removeLegacyYearDeleteUi/);
  assert.match(index,/orderedFeatureLoads/);
});

test('STEP5完了: 旧bootstrap shimは削除済み',()=>{
  const index=readShell();
  assert.match(read('insight_persist_guard_v1.js'),/function guardedPersist\(\)/);
  assert.match(read('insight_legacy_style_compat_v1.js'),/InsightLegacyStyleCompat/);
  assert.match(index,/function stripPayloadChartScript\(html\)/);
  assert.match(read('insight_dashboard_year_fix_v1.js'),/removeLegacyYearDeleteUi/);
  assert.match(index,/STEP5 complete: payload source is self-contained/);
  assert.doesNotMatch(index,/insight_bootstrap_patches_v1\.js|InsightBootstrapPatches/);
  assert.equal((index.match(/html=html\.replace/g)||[]).length,1);
});

test('分析AI workspace assetはcache bustされている',()=>{
  const index=readShell();
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261006-header-compact-1/);
  assert.match(index,/insight_ops_v1\.js\?v=20260930-step5-2/);
});

test('分析AIの上端は実際のサイドバー上端へ追従する',()=>{
  const presentation=read('insight_ai_presentation_v1.js');
  assert.match(presentation,/function sidebarRect\(button\)/);
  assert.match(presentation,/button\.closest&&button\.closest\('\.sidebar'\)/);
  assert.match(presentation,/--ai-workspace-top/);
  assert.match(presentation,/top:var\(--ai-workspace-top,12px\)!important/);
  assert.match(presentation,/top:var\(--ai-workspace-top,8px\)!important/);
});

test('曜日別平均カードと廃棄悪化色の表示契約を維持する',()=>{
  const sales=read('insight_sales_count_v1.js');
  const visual=read('insight_ai_visual_v1.js');
  assert.match(sales,/\.sc-page\{[^}]*min-width:0;width:100%;max-width:100%;box-sizing:border-box/);
  assert.match(sales,/\.sc-calendar\{[^}]*grid-template-columns:repeat\(7,minmax\(160px,1fr\)\);gap:8px;[^}]*min-width:0;width:100%;max-width:100%;box-sizing:border-box/);
  assert.match(sales,/\.sc-average-grid\{[^}]*grid-template-columns:repeat\(7,minmax\(160px,1fr\)\);gap:8px;[^}]*min-width:0;width:100%;max-width:100%;box-sizing:border-box/);
  assert.match(sales,/@media\(max-width:1200px\)\{\.sc-calendar,\.sc-average-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(sales,/@media\(max-width:800px\)\{\.sc-calendar,\.sc-average-grid\{grid-template-columns:repeat\(7,minmax\(102px,1fr\)\);gap:7px\}/);
  assert.match(sales,/sc-day sc-average-card/);
  assert.match(sales,/sc-trip sc-delivery-row/);
  assert.match(sales,/sc-trip sc-sales-row/);
  assert.match(visual,/\/廃棄\/\.test\(parts\.original\|\|''\)/);
  assert.match(visual,/value!==null&&value>0/);
});

test('販売数AI分析は販売数入力と同じ平均カード生成APIを使用する',()=>{
  const pageAI=read('insight_ai_page_comments_v1.js');
  const sales=read('insight_sales_count_v1.js');
  const presentation=read('insight_ai_presentation_v1.js');
  assert.match(pageAI,/function renderSalesCountCards\(/);
  assert.match(pageAI,/model\.createAverageCard\(/);
  assert.match(pageAI,/sc-average-grid ai-sales-count-weekdays/);
  assert.match(sales,/model\.createAverageCard=createAverageCard/);
  assert.match(presentation,/\.ai-sales-count-overall/);
  assert.match(presentation,/\.ai-sales-count-weekdays/);
});

test('販売数カテゴリーの対象便設定を全関連層で共有する',()=>{
  const index=readShell();
  const sales=read('insight_sales_count_v1.js');
  const analysis=read('insight_analysis_context_v1.js');
  const saleResults=read('insight_sale_results_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  assert.match(index,/insight_sales_count_v1\.js\?v=20261005-ipad-container-fit/);
  assert.match(index,/insight_sale_results_v1\.js\?v=20261006-sale-note-1/);
  assert.match(index,/insight_analysis_context_v1\.js\?v=20261004-special-demand/);
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-decision-analysis/);
  assert.match(sales,/activeTrips:\[true,true,true\]/);
  assert.match(sales,/対象便を1つ以上選択してください/);
  assert.match(sales,/sc-not-applicable/);
  assert.match(analysis,/activeTrips:copy\(mask\)/);
  assert.match(analysis,/specialDemand:/);
  assert.match(analysis,/sellThrough:/);
  assert.match(saleResults,/salesApi\.activeTrips/);
  assert.match(pageAI,/if\(active\[t\]===false\)continue/);
});

test('対象外便のカード表示は簡潔なダッシュを使い判定文言は維持する',()=>{
  const sales=read('insight_sales_count_v1.js');
  assert.match(sales,/i\.value='ー';i\.readOnly=true/);
  assert.match(sales,/便 対象外/);
  assert.match(sales,/対象便を1つ以上選択してください/);
});

test('販売数入力の比較表示は平日平均と日曜日・祝日平均だけにする',()=>{
  const sales=read('insight_sales_count_v1.js');
  const start=sales.indexOf('function renderAnalysis()');
  const end=sales.indexOf('function disp(',start);
  const render=sales.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(render,/セール実績/);
  assert.doesNotMatch(render,/セール日平均/);
  assert.doesNotMatch(render,/同曜日・通常日平均/);
  assert.match(render,/appendDayTypeComparisons/);
});

test('平日平均は月〜金のみとし土曜日を除外する',()=>{
  const sales=read('insight_sales_count_v1.js');
  assert.match(sales,/else if\(wd>=1&&wd<=5\)groups\.weekday\.push/);
  assert.doesNotMatch(sales,/月〜土（祝日を除く）/);
});

test('平日平均と日曜日・祝日平均は補足文を表示せず表の余白を詰める',()=>{
  const sales=read('insight_sales_count_v1.js');
  assert.doesNotMatch(sales,/sc-day-type-note/);
  assert.doesNotMatch(sales,/選択月の保存済み実績/);
  assert.match(sales,/card\.classList\.add\('sc-day-type-card'\)/);
  assert.match(sales,/\.sc-day-type-card\{padding-bottom:12px\}/);
  assert.match(sales,/\.sc-day-type-card h3\{margin-bottom:8px\}/);
});

test('曜日別平均も対象外便をダッシュ＋グレー表示に統一する',()=>{
  const sales=read('insight_sales_count_v1.js');
  const start=sales.indexOf('function renderAverages()');
  assert.ok(start>=0);
  const block=sales.slice(start,start+2600);
  assert.match(block,/class="sc-not-applicable"/);
  assert.match(block,/\?'ー':fmt\(value\)/);
  assert.doesNotMatch(block,/対象外/);
  assert.match(sales,/\.sc-average-row b\.sc-not-applicable\{background:var\(--surface2\)!important;border-color:var\(--border\)!important;color:var\(--text4\)!important\}/);
});


test('分析AI互換コアはIndexインラインから分離し新パイプラインのフォールバックに限定する',()=>{
  const index=readShell();
  const compat=read('insight_ai_compat_core_v1.js');
  assert.match(index,/insight_ai_compat_core_v1\.js\?v=20261003-ai-pipeline-1/);
  assert.ok(index.indexOf('insight_yoy_policy_v1.js')<index.indexOf('insight_ai_compat_core_v1.js'));
  assert.ok(index.indexOf('insight_ai_compat_core_v1.js')<index.indexOf('insight_hooks_v1.js'));
  assert.doesNotMatch(index,/var extra='<script>/);
  assert.doesNotMatch(index,/window\.buildAIQuestionAnswer=function/);
  assert.match(compat,/window\.buildAIQuestionAnswer=function/);
  assert.match(compat,/window\.renderAIAnalysisPanel=function/);
  assert.match(compat,/Primary analysis is owned by InsightAIPageComments \/ InsightAIInterpretation/);
  assert.doesNotThrow(()=>new vm.Script(compat),'AI compatibility core must be valid JavaScript');
});
