const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('STEP5-2後のpayload文字列置換は16件に縮小されている',()=>{
  const index=read('Index.html');
  const count=(index.match(/html=html\.replace/g)||[]).length;
  assert.equal(count,16);
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
  assert.match(presentation,/\.ai-analysis-question-row/);
  assert.match(presentation,/@media\(max-width:520px\)/);
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

test('STEP5-2対象assetはcache bustされている',()=>{
  const index=read('Index.html');
  assert.match(index,/insight_ai_presentation_v1\.js\?v=20260930-step5-2/);
  assert.match(index,/insight_ops_v1\.js\?v=20260930-step5-2/);
});
