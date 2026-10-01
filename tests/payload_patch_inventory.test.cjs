const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('STEP5最終整理後のpayload文字列置換は11件に固定されている',()=>{
  const index=read('Index.html');
  const count=(index.match(/html=html\.replace/g)||[]).length;
  assert.equal(count,11);
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
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-period-lock/);
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
  assert.match(index,/insight_ai_page_comments_v1\.js\?v=20261001-period-lock/);
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
  assert.match(index,/insight_analysis_period_lock_v1\.js\?v=20261001-period-lock2/);
  assert.match(index,/insight_sales_count_v1\.js\?v=20261001-period-lock/);
  assert.match(presentation,/aiAnalysisTarget/);
  assert.match(presentation,/InsightAnalysisPeriodLock\.syncCurrentPage/);
  assert.match(pageAI,/InsightAnalysisPeriodLock\.getContext/);
  assert.match(pageAI,/InsightAnalysisPeriodLock\.referenceDate/);
  assert.match(lock,/function captureCurrent\(/);
  assert.match(lock,/function syncCurrentPage\(/);
  assert.match(lock,/function syncDashboard\(/);
  assert.match(lock,/function syncInput\(/);
  assert.match(lock,/function syncSalesCount\(/);
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
  assert.ok(index.indexOf('insight_analysis_history_v1.js')<index.indexOf('insight_ai_context_v1.js'));
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

test('通常画面の選択年月をサイドバー切替後も全ページで維持する',()=>{
  const index=read('Index.html');
  const pagePeriod=read('insight_page_period_sync_v1.js');
  assert.match(index,/insight_page_period_sync_v1\.js\?v=20261001-page-period/);
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

test('店舗運営UIのCSSはops moduleが所有する',()=>{
  const index=read('Index.html');
  const ops=read('insight_ops_v1.js');
  assert.ok(!index.includes("html=html.replace('</style>'"));
  assert.match(ops,/insightOpsV1Style/);
  assert.match(ops,/\.ops-daily-wrap/);
  assert.match(ops,/\.monthly-ops-card/);
});

test('まだpayload前処理が必要な安全・互換パッチは保持する',()=>{
  const index=read('Index.html');
  assert.match(index,/const WX_KEYS=/);
  assert.match(index,/originalPersist/);
  assert.match(index,/safePersist/);
  assert.match(index,/Chart\.js\/4\.4\.1/);
  assert.match(index,/integrity=/);
  assert.match(index,/yearToDelete/);
  assert.match(index,/orderedFeatureLoads/);
});

test('残す11件はSTEP5で意図的に維持する互換・安全パッチだけである',()=>{
  const index=read('Index.html');
  assert.match(index,/STEP5 retained: base weather constants/);
  assert.match(index,/STEP5 retained: persist\(\) must be hardened/);
  assert.match(index,/STEP5 retained: legacy core control contrast patch/);
  assert.match(index,/STEP5 retained: Chart\.js SRI\/referrer policy/);
  assert.match(index,/STEP5 retained: suppress the legacy year-delete UI/);
  assert.match(index,/STEP5 retained bootstrap boundary/);

  assert.equal((index.match(/const WX_KEYS=/g)||[]).length>=1,true);
  assert.equal((index.match(/yearToDelete/g)||[]).length>=1,true);
  assert.equal((index.match(/html=html\.replace/g)||[]).length,11);
});

test('分析AI workspace assetはcache bustされている',()=>{
  const index=read('Index.html');
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261001-period-lock/);
  assert.match(index,/insight_ops_v1\.js\?v=20260930-step5-2/);
});
