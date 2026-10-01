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
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20261001-step1-1/);
  assert.match(index,/insight_ops_v1\.js\?v=20260930-step5-2/);
});
