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
