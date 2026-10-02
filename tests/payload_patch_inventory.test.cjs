const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('payload互換パッチ11件はbootstrap moduleへ分離しIndexにはbody挿入だけ残す',()=>{
  const index=read('Index.html');
  const bootstrap=read('insight_bootstrap_patches_v1.js');
  assert.equal((bootstrap.match(/^patch\(/gm)||[]).length,11);
  assert.equal((index.match(/html=html\.replace/g)||[]).length,1);
  assert.match(index,/insight_bootstrap_patches_v1\.js\?v=20261002-orphan-year-fix/);
});

test('トップページはキャッシュ抑止とビルド自己更新を持つ',()=>{
  const index=read('Index.html');
  assert.match(index,/insight-shell-version" content="20261002-hourly-gap-1/);
  assert.match(index,/Cache-Control" content="no-cache, no-store, must-revalidate/);
  assert.match(index,/insight_probe=/);
  assert.match(index,/cache:'no-store'/);
  assert.match(index,/location\.replace\('\.\/Index\.html\?insight_build='/);
});

test('AI表示CSSはIndexの文字列置換ではなくpresentation moduleが所有する',()=>{
  const index=read('Index.html');
  const presentation=read('insight_ai_presentation_v1.js');
  for(const marker of [
    'body.ai-analysis-open #main{margin-right:390px;}',
    'position:fixed;top:0;right:0;bottom:0;z-index:10010;',
    '  .ai-analysis-panel{width:min(390px,88vw);max-width:none;}',
    '  .ai-analysis-panel{width:92vw;}',
    '.ai-analysis-empty{font-size:12px;line-height:1.7;color:var(--text4);}'
  ]) assert.ok(!index.includes("html=html.replace('"+marker),marker+' がIndexのreplaceに残っています');
  assert.match(presentation,/insightAiPresentationStyle/);
  assert.match(presentation,/body\.ai-analysis-open #main\{margin-right:0!important\}/);
  assert.match(presentation,/\.ai-analysis-panel\.ai-analysis-workspace/);
  assert.match(presentation,/\.ai-workspace-grid/);
  assert.match(presentation,/\.ai-analysis-question-row/);
  assert.match(presentation,/@media\(max-width:920px\)/);
  assert.doesNotThrow(()=>new vm.Script(presentation), 'presentation module must be valid JavaScript');
  assert.match(presentation,/var selected=currentNav===i;/);
  assert.doesNotMatch(presentation,/var selected=!open&&currentNav===i;/);
});

test('AIのDOM・背景・開閉同期はpresentation moduleが所有する',()=>{
  const index=read('Index.html');
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
  assert.match(presentation,/grid-template-columns:minmax\(0,1fr\) 250px/);
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
  const index=read('Index.html');
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
  const index=read('Index.html');
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
  const index=read('Index.html');
  const presentation=read('insight_ai_presentation_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  const lock=read('insight_analysis_period_lock_v1.js');
  const salesCount=read('insight_sales_count_v1.js');
  assert.match(index,/insight_analysis_period_lock_v1\.js\?v=20261001-sync-owner/);
  assert.match(index,/insight_sales_count_v1\.js\?v=20261002-historical-years/);
  assert.match(presentation,/aiAnalysisTarget/);
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
  const index=read('Index.html');
  const aiContext=read('insight_ai_context_v1.js');
  assert.match(index,/insight_ai_context_v1\.js\?v=20261001-step7/);
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

test('保存データ健全性チェックは読み取り専用で不整合を可視化する',()=>{
  const index=read('Index.html');
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
  const index=read('Index.html');
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
  const index=read('Index.html');
  const manager=read('insight_year_manager_v1.js');
  const yearFix=read('insight_dashboard_year_fix_v1.js');
  assert.match(index,/insight_year_manager_v1\.js\?v=20261002-year-delete-consistency/);
  assert.match(index,/insight_dashboard_year_fix_v1\.js\?v=20261002-year-delete-consistency/);
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
  const index=read('Index.html');
  const quick=read('insight_quick_date_nav_v1.js');
  assert.match(index,/insight_quick_date_nav_v1\.js\?v=20261002-quick-historical-year/);
  assert.match(quick,/function ensureRegisteredYear\(/);
  assert.match(quick,/InsightYearManager/);
  assert.match(quick,/年度を追加してこの日付を入力しますか/);
  assert.match(quick,/manager\.promoteCurrent\(year\)/);
  assert.match(quick,/if\(!ensureRegisteredYear\(date\)\)return/);
  assert.doesNotMatch(quick,/localStorage/);
  assert.doesNotThrow(()=>new vm.Script(quick),'quick date navigation must be valid JavaScript');
});

test('通常画面の選択年月をサイドバー切替後も全ページで維持する',()=>{
  const index=read('Index.html');
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
  const index=read('Index.html');
  const hourly=read('insight_hourly_customers_v1.js');
  assert.match(index,/insight_bootstrap_patches_v1\.js\?v=20261002-orphan-year-fix/);
  assert.match(index,/insight_hourly_customers_v1\.js\?v=20261002-hourly-position/);
  assert.ok(index.indexOf('insight_events_v1.js')<index.indexOf('insight_hourly_customers_v1.js'));
  assert.ok(index.indexOf('insight_hourly_customers_v1.js')<index.indexOf('insight_event_results_v1.js'));
  assert.match(hourly,/hourlyCustomers/);
  assert.match(hourly,/Array\(24\)/);
  assert.match(hourly,/途中/);
  assert.match(hourly,/入力済み 24\/24/);
  assert.match(hourly,/getElementById\('insightEvents'\)/);
  assert.match(hourly,/insertBefore\(card,events\)/);
  assert.doesNotMatch(hourly,/日次客数|差異|暦日/);
  assert.doesNotThrow(()=>new vm.Script(hourly),'hourly customers module must be valid JavaScript');
});

test('イベント実績は過去開催・日付カード・時間帯グラフ・販売数カードを読み取り専用で表示する',()=>{
  const index=read('Index.html');
  const eventResults=read('insight_event_results_v1.js');
  const events=read('insight_events_v1.js');
  assert.match(index,/insight_events_v1\.js\?v=20261002-special-presets/);
  assert.match(index,/insight_event_results_v1\.js\?v=20261002-hourly-gap/);
  assert.ok(index.indexOf('insight_analysis_context_v1.js')<index.indexOf('insight_event_results_v1.js'));
  assert.ok(index.indexOf('insight_event_results_v1.js')<index.indexOf('insight_daily_anomaly_v1.js'));
  assert.match(eventResults,/過去開催一覧/);
  assert.match(eventResults,/<span>イベント・催事<\/span>/);
  assert.match(eventResults,/page-title">イベント・催事実績/);
  assert.match(eventResults,/\/\* イベント・催事実績 v3:/);
  assert.match(eventResults,/data-kind="special">催事/);
  assert.match(eventResults,/collectSpecial/);
  assert.match(eventResults,/specialNames/);
  assert.match(eventResults,/\.er-toolbar \[hidden\]\{display:none!important\}/);
  assert.match(eventResults,/売上 /);
  assert.match(eventResults,/客数 /);
  assert.match(eventResults,/er-day-tab/);
  assert.match(eventResults,/時間帯別客数/);
  assert.match(eventResults,/\.er-hour-bar\{[^}]*background:#3b82f6/);
  assert.match(eventResults,/el\('button',undefined,'er-hour-plot'\)/);
  assert.match(eventResults,/aria-pressed/);
  assert.match(eventResults,/er-hour-value/);
  assert.match(eventResults,/font-size:11\.5px/);
  assert.doesNotMatch(eventResults,/item\.append\(el\('strong',String\(value\)\)/);
  assert.match(eventResults,/\.er-hour-chart\{[^}]*gap:4px;[^}]*min-width:1440px/);
  assert.match(eventResults,/min-width:1440px/);
  assert.match(eventResults,/createReadOnlyDayCard/);
  assert.match(eventResults,/カテゴリー別・便別実績/);
  assert.match(eventResults,/hourly\.complete/);
  assert.doesNotMatch(eventResults,/廃棄額|廃棄率|暦日/);
  assert.doesNotMatch(eventResults,/localStorage|InsightStorage/);
  assert.match(events,/イベント場所/);
  assert.match(events,/special:'催事'/);
  assert.match(events,/type\.value==='special'\?'催事名':'イベント名'/);
  assert.match(events,/よく使う催事/);
  assert.match(events,/specialPresets/);
  assert.match(events,/findDuplicateSpecial/);
  assert.match(events,/同じ店舗に同じ催事名・同じ期間の登録があります/);
  assert.match(events,/snapshot\.location=location\.value\.trim\(\)/);
  assert.doesNotThrow(()=>new vm.Script(eventResults),'event results module must be valid JavaScript');
});

test('全ページタイトルはダッシュボード基準の共通モジュールで位置を統一する',()=>{
  const index=read('Index.html');
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
  const index=read('Index.html');
  const saleResults=read('insight_sale_results_v1.js');
  const sales=read('insight_sales_count_v1.js');
  assert.match(index,/insight_sales_count_v1\.js\?v=20261002-historical-years/);
  assert.match(index,/insight_sale_results_v1\.js\?v=20261002-card-fit/);
  assert.ok(index.indexOf('insight_sales_count_v1.js')<index.indexOf('insight_sale_results_v1.js'));
  assert.ok(index.indexOf('insight_sale_results_v1.js')<index.indexOf('insight_page_period_sync_v1.js'));
  assert.match(saleResults,/id='navSaleResults'|nav\.id='navSaleResults'/);
  assert.match(saleResults,/page\.id='pageSaleResults'/);
  assert.match(saleResults,/InsightSalesCount\.createReadOnlyDayCard/);
  assert.match(saleResults,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(saleResults,/\.sr-day-grid>\.sc-day\{min-width:0\}/);
  assert.match(sales,/model\.createReadOnlyDayCard=createReadOnlyDayCard/);
  assert.doesNotMatch(saleResults,/localStorage|InsightStorage/);
  assert.doesNotThrow(()=>new vm.Script(saleResults),'sale results module must be valid JavaScript');
});

test('分析AIコメントは文章列ではなく構造化カードで表示し色は注意と改善だけに限定する',()=>{
  const index=read('Index.html');
  const presentation=read('insight_ai_presentation_v1.js');
  const visual=read('insight_ai_visual_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  assert.match(index,/insight_ai_visual_v1\.js\?v=20261001-decision-analysis/);
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

test('分析AIはダッシュボード再掲ではなく4ブロックの意思決定支援へ変換する',()=>{
  const index=read('Index.html');
  const interpretation=read('insight_ai_interpretation_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  const presentation=read('insight_ai_presentation_v1.js');
  assert.match(index,/insight_ai_interpretation_v1\.js\?v=20261001-decision-analysis/);
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-decision-analysis/);
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261001-decision-analysis/);
  assert.match(index,/insight_ai_visual_v1\.js\?v=20261001-decision-analysis/);
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
  const index=read('Index.html');
  const ops=read('insight_ops_v1.js');
  assert.ok(!index.includes("html=html.replace('</style>'"));
  assert.match(ops,/insightOpsV1Style/);
  assert.match(ops,/\.ops-daily-wrap/);
  assert.match(ops,/\.monthly-ops-card/);
});

test('まだ必要な安全・互換パッチはbootstrap moduleで保持する',()=>{
  const index=read('Index.html');
  const bootstrap=read('insight_bootstrap_patches_v1.js');
  assert.match(index,/insight_bootstrap_patches_v1\.js\?v=20261002-orphan-year-fix/);
  assert.match(bootstrap,/const WX_KEYS=/);
  assert.match(bootstrap,/originalPersist/);
  assert.match(bootstrap,/safePersist/);
  assert.match(bootstrap,/Chart\.js\/4\.4\.1/);
  assert.match(bootstrap,/integrity=/);
  assert.match(bootstrap,/yearToDelete/);
  assert.match(index,/orderedFeatureLoads/);
});

test('互換パッチ11件はfail-fast bootstrapに集約しfeature挿入境界だけIndexに残す',()=>{
  const index=read('Index.html');
  const bootstrap=read('insight_bootstrap_patches_v1.js');
  assert.match(bootstrap,/STEP5 retained: base weather constants/);
  assert.match(bootstrap,/STEP5 retained: saved data must never silently fall back/);
  assert.match(bootstrap,/STEP5 retained: persist\(\) must be hardened/);
  assert.match(bootstrap,/STEP5 retained: legacy core control contrast patch/);
  assert.match(bootstrap,/STEP5 retained: Chart\.js SRI\/referrer policy/);
  assert.match(bootstrap,/STEP5 retained: suppress the legacy year-delete UI/);
  assert.match(index,/STEP5 retained bootstrap boundary/);
  assert.match(bootstrap,/互換パッチの適用対象が見つかりません/);
  assert.equal((bootstrap.match(/^patch\(/gm)||[]).length,11);
  assert.equal((index.match(/html=html\.replace/g)||[]).length,1);
});

test('分析AI workspace assetはcache bustされている',()=>{
  const index=read('Index.html');
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261001-decision-analysis/);
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
  const index=read('Index.html');
  const sales=read('insight_sales_count_v1.js');
  const analysis=read('insight_analysis_context_v1.js');
  const saleResults=read('insight_sale_results_v1.js');
  const pageAI=read('insight_ai_page_comments_v1.js');
  assert.match(index,/insight_sales_count_v1\.js\?v=20261002-historical-years/);
  assert.match(index,/insight_sale_results_v1\.js\?v=20261002-card-fit/);
  assert.match(index,/insight_analysis_context_v1\.js\?v=20261001-active-trips/);
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-decision-analysis/);
  assert.match(sales,/activeTrips:\[true,true,true\]/);
  assert.match(sales,/対象便を1つ以上選択してください/);
  assert.match(sales,/sc-not-applicable/);
  assert.match(analysis,/activeTrips:copy\(mask\)/);
  assert.match(saleResults,/salesApi\.activeTrips/);
  assert.match(pageAI,/if\(active\[t\]===false\)continue/);
});

test('対象外便のカード表示は簡潔なダッシュを使い判定文言は維持する',()=>{
  const sales=read('insight_sales_count_v1.js');
  assert.match(sales,/i\.value='ー';i\.readOnly=true/);
  assert.match(sales,/便 対象外/);
  assert.match(sales,/対象便を1つ以上選択してください/);
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
