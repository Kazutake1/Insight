const test=require('node:test');
const assert=require('node:assert/strict');

const visual=require('../insight_ai_visual_v1.js');

test('状態ラベル・見出し・主要数値をコメントから抽出する',()=>{
  const parsed=visual.parseLine('【継続】客数低下：前年同月比 -6.1%。3か月連続で前年を下回っています。');
  assert.equal(parsed.state,'継続');
  assert.equal(parsed.title,'客数低下');
  assert.equal(parsed.metric,'-6.1%');
  assert.match(parsed.detail,/3か月連続/);
});

test('KPI行は先頭項目を見出しとして扱い比較率を主要数値にする',()=>{
  const parsed=visual.parseLine('売上 1,184,000円 / 前年同月比 -5.2% / 前月比 +1.0%。');
  assert.equal(parsed.title,'売上');
  assert.equal(parsed.metric,'-5.2%');
  assert.match(parsed.detail,/1,184,000円/);
});

test('注意・改善以外は色を増やさずニュートラル表示にする',()=>{
  assert.equal(visual.toneFor('aiAnalysisCaution',visual.parseLine('客数：-6.1%')),'danger');
  assert.equal(visual.toneFor('aiAnalysisGood',visual.parseLine('廃棄改善：-12.4%')),'success');
  assert.equal(visual.toneFor('aiAnalysisSummary',visual.parseLine('売上：-5.2%')),'neutral');
  assert.equal(visual.toneFor('aiAnalysisChecks',visual.parseLine('確認してください。')),'neutral');
});

test('改善・解消の状態ラベルは改善色として扱う',()=>{
  assert.equal(visual.toneFor('aiAnalysisSummary',visual.parseLine('【改善】廃棄：改善傾向')),'success');
  assert.equal(visual.toneFor('aiAnalysisSummary',visual.parseLine('【解消】客数：正常範囲')),'success');
});

test('廃棄のプラス変化だけは要約欄でも悪化色にする',()=>{
  const waste=visual.parseLine('廃棄金額 18,200円 / 前年同月比 +12.4% / 前月比 +3.0%。');
  const sales=visual.parseLine('売上 1,184,000円 / 前年同月比 +12.4% / 前月比 +3.0%。');
  assert.equal(waste.metric,'+12.4%');
  assert.equal(visual.toneFor('aiAnalysisSummary',waste),'danger');
  assert.equal(visual.toneFor('aiAnalysisSummary',sales),'neutral');
});

test('廃棄の増減判定は符号付き数値で行う',()=>{
  assert.equal(visual.metricNumber('+12.4%'),12.4);
  assert.equal(visual.metricNumber('-12.4%'),-12.4);
  assert.equal(visual.toneFor('aiAnalysisSummary',visual.parseLine('廃棄額：前年同月比 -12.4%')),'neutral');
});

test('結論・関連性はニュートラル、重要・注意は赤、改善は緑にする',()=>{
  assert.equal(visual.toneFor('aiAnalysisSummary',visual.parseLine('【結論】今月は客数を確認してください。')),'neutral');
  assert.equal(visual.toneFor('aiAnalysisGood',visual.parseLine('【関連】売上 × 客数：主因候補は客数。')),'neutral');
  assert.equal(visual.toneFor('aiAnalysisCaution',visual.parseLine('【重要】客数低下：-8.0%')),'danger');
  assert.equal(visual.toneFor('aiAnalysisCaution',visual.parseLine('【注意】廃棄増加：+10.0%')),'danger');
  assert.equal(visual.toneFor('aiAnalysisCaution',visual.parseLine('【改善】廃棄改善：-12.0%')),'success');
});
