const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const patches=require('../insight_bootstrap_patches_v1.js');

const root=path.join(__dirname,'..');
function payload(){
  return fs.readFileSync(path.join(root,'insight_payload_source_v1.html'),'utf8');
}

test('正規payload sourceはbootstrap文字列置換なしで安全化済み',()=>{
  const base=payload();
  const patched=patches.apply(base);
  assert.equal(patched,base);
  assert.match(base,/Insight stored data load failed/);
  assert.match(base,/insightStorageLoadError/);
  assert.match(base,/const current=localStorage\.getItem\(SK\)/);
  assert.match(base,/activeYears&&!activeYears\.has/);
  assert.match(base,/localStorage\.setItem\(SK,JSON\.stringify\(allStores\)\)/);
  assert.doesNotMatch(base,/InsightPersistError/);
  assert.doesNotMatch(base,/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js/);
  assert.doesNotMatch(base,/onerror="window\.Chart=/);
});

test('未使用の天気相関グループはbootstrap文字列パッチから除外する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  assert.doesNotMatch(source,/patch\("const wxGroups=/);
});

test('bootstrap互換shimはpayloadを変更せず非文字列だけ拒否する',()=>{
  const html='<!doctype html><html><body></body></html>';
  assert.equal(patches.apply(html),html);
  assert.throws(()=>patches.apply(null),/Insight payload HTML is invalid/);
});

test('persist安全化はbootstrap文字列パッチではなくruntime guardが所有する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const guard=fs.readFileSync(path.join(root,'insight_persist_guard_v1.js'),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source,/originalPersist|safePersist|InsightPersistError/);
  assert.match(guard,/function guardedPersist\(\)/);
  assert.match(guard,/InsightStorage\.persistCurrent\(currentSnapshot\(\)\)/);
  assert.match(guard,/InsightPersistError/);
  assert.doesNotMatch(guard,/localStorage\.setItem|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotThrow(()=>new vm.Script(guard),'persist guard must be valid JavaScript');
});

test('年度削除の旧UI除去はbootstrap文字列置換ではなくyear-fix moduleが所有する',()=>{
  const bootstrap=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const yearFix=fs.readFileSync(path.join(root,'insight_dashboard_year_fix_v1.js'),'utf8');
  assert.doesNotMatch(bootstrap,/suppress the legacy year-delete UI/);
  assert.doesNotMatch(bootstrap,/patch\("let yearToDelete=null;/);
  assert.match(yearFix,/function removeLegacyYearDeleteUi\(\)/);
  assert.match(yearFix,/#modalBg,\.btn-del-year\{display:none!important\}/);
});

test('旧コア配色はbootstrapで書き換えずruntime style互換モジュールへ移す',()=>{
  const patched=patches.apply(payload());
  const source=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'insight_legacy_style_compat_v1.js'),'utf8');
  assert.match(patched,/background:var\(--surface\);color:var\(--text\);box-shadow:0 6px 24px var\(--shadow\);/);
  assert.doesNotMatch(source,/legacy core control contrast patch/);
  assert.match(runtime,/function applyRules\(rules\)/);
  assert.match(runtime,/background','#1a1a1a'/);
  assert.match(runtime,/color','#fff'/);
});

test('入力ページ旧年月UIのソースはbootstrapで切り取らずruntime selectorへ委譲する',()=>{
  const patched=patches.apply(payload());
  const source=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  assert.match(patched,/const yrId=\{sales:"salesYearRow",kyaku:"kyakuYearRow",haiki:"haikiYearRow"\}\[type\]/);
  assert.doesNotMatch(source,/legacyInputPeriodStart|入力ページ旧年月UIの開始位置が見つかりません/);
});

test('天気アイコン拡張はbootstrap文字列パッチではなくruntime moduleが所有する',()=>{
  const bootstrap=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'insight_weather_icon_compat_v1.js'),'utf8');
  assert.doesNotMatch(bootstrap,/🌫️|🧊|🌩️/);
  assert.match(runtime,/WX_ICONS\['霧'\]='🌫️'/);
  assert.match(runtime,/WX_ICONS\['凍雨'\]='🧊'/);
  assert.match(runtime,/WX_ICONS\['雷雨'\]='🌩️'/);
  assert.doesNotMatch(runtime,/localStorage|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  const context={};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext('const WX_ICONS={"雪":"❄️","":""};',context);
  vm.runInContext(runtime,context);
  assert.equal(vm.runInContext('WX_ICONS["霧"]',context),'🌫️');
  assert.equal(vm.runInContext('WX_ICONS["凍雨"]',context),'🧊');
  assert.equal(vm.runInContext('WX_ICONS["雷雨"]',context),'🌩️');
});

test('天気キー拡張はbootstrap文字列パッチではなくruntime moduleが所有する',()=>{
  const bootstrap=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'insight_weather_keys_compat_v1.js'),'utf8');
  assert.doesNotMatch(bootstrap,/patch\("const WX_KEYS=/);
  assert.match(runtime,/REQUIRED=\['霧','凍雨','雷雨'\]/);
  assert.match(runtime,/if\(WX_KEYS\.indexOf\(wx\)<0\)WX_KEYS\.push\(wx\)/);
  assert.doesNotMatch(runtime,/localStorage|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  const context={};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext('const WX_KEYS=["快晴","晴","晴曇","曇","小雨","雨","大雨","みぞれ","雪"];',context);
  vm.runInContext(runtime,context);
  assert.deepEqual(Array.from(vm.runInContext('WX_KEYS',context)),['快晴','晴','晴曇','曇','小雨','雨','大雨','みぞれ','雪','霧','凍雨','雷雨']);
  vm.runInContext('InsightWeatherKeysCompat.apply()',context);
  assert.equal(vm.runInContext('WX_KEYS.length',context),12);
});

test('Chart.jsの安全属性はbootstrap文字列パッチではなくshellが所有する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
  const loader=fs.readFileSync(path.join(root,'insight_shell_loader_v1.js'),'utf8');
  assert.doesNotMatch(source,/Chart\.js\/4\.4\.1|SRI\/referrer policy/);
  assert.match(index,/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js" integrity="sha512-CQBWl4fJHWbryGE\+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d\+6I\+1zze6Z7kHXO7q3UyZAWw=="/);
  assert.match(index,/crossorigin="anonymous" referrerpolicy="no-referrer"/);
  assert.doesNotMatch(loader,/stripPayloadChartScript/);
  assert.match(loader,/typeof Chart==='undefined'/);
});
