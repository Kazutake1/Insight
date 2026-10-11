const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const view=fs.readFileSync(path.join(root,'insight_trip_inference_view_v1.js'),'utf8');
const theme=fs.readFileSync(path.join(root,'insight_payload_core_v1.css'),'utf8');
const manifest=fs.readFileSync(path.join(root,'insight_shell_loader_v1.js'),'utf8');

test('過去の対象便UIは推定表示と分離した安全な手動設定に対応する',()=>{
  assert.doesNotThrow(()=>new vm.Script(view));
  assert.match(view,/InsightTripInferenceView/);
  assert.match(view,/InsightTripInference\.inferAvailableMonths/);
  assert.match(view,/inferMonth\(all,storeSelect\.value,categorySelect\.value,monthSelect\.value\)/);
  assert.doesNotMatch(view,/localStorage\.setItem|\.writeSnapshot\(|\bpersist\(|\.transaction\(/);
  assert.doesNotMatch(view,/createElement\(['"]style['"]\)|style\.textContent|\.innerHTML.*\$\{/);
});

test('入力実績・推定対象外・判定不能の日本語が明確である',()=>{
  assert.match(view,/入力実績あり/);
  assert.match(view,/対象外と推定/);
  assert.match(view,/判定不能/);
  assert.match(view,/この便は未入力/);
  assert.match(view,/納品.*販売/);
  assert.match(view,/月途中の変更/);
  assert.match(view,/納品・販売実績から月別に判定/);
  assert.match(view,/月途中の変更には対応していません/);
});

test('既存設定ページに追加し、既存の管理機能と選択中の店舗を保持する',()=>{
  assert.match(view,/pageSettings \.insight-settings-content/);
  for(const key of ['insightTripHistorySection','insightTripHistoryStore','insightTripHistoryCategory','insightTripHistoryMonth','insightTripHistoryResults'])
    assert.ok(view.includes(key),key);
  assert.match(view,/syncStore\?'':storeSelect\.value/);
  assert.match(view,/year\+'-'\+String\(m\)\.padStart/);
  assert.match(view,/previous,preferred/);
  assert.ok(manifest.indexOf('insight_trip_inference_v1.js')<manifest.indexOf('insight_trip_inference_view_v1.js'));
  assert.ok(manifest.indexOf('insight_settings_v1.js')<manifest.indexOf('insight_trip_inference_view_v1.js'));
});

test('iPad横画面と狭幅で3便カードが見切れない固定CSSを定義する',()=>{
  assert.match(theme,/#insightTripHistorySection \.insight-trip-history-results\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(theme,/@media\(max-width:720px\)/);
  assert.match(theme,/@media\(max-width:520px\)/);
  assert.doesNotMatch(view,/\.style\.|setAttribute\(['"]style/);
});
