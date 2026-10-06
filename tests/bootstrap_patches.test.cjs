const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const PARTS=[
  'insight_payload_v1_part01a.txt','insight_payload_v1_part01b.txt',
  'insight_payload_v1_part02.txt','insight_payload_v1_part03.txt',
  'insight_payload_v1_part04a.txt','insight_payload_v1_part04b.txt',
  'insight_payload_v1_part05.txt','insight_payload_v1_part06.txt',
  'insight_payload_v1_part07.txt'
];
function payload(){
  const b64=PARTS.map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('').replace(/\s/g,'');
  return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}

test('圧縮payloadはbootstrap文字列置換なしで安全化済み',()=>{
  const base=payload();
  assert.match(base,/Insight stored data load failed/);
  assert.match(base,/insightStorageLoadError/);
  assert.match(base,/const current=localStorage\.getItem\(SK\)/);
  assert.match(base,/activeYears&&!activeYears\.has/);
  assert.match(base,/localStorage\.setItem\(SK,JSON\.stringify\(allStores\)\)/);
  assert.doesNotMatch(base,/InsightPersistError/);
  assert.match(base,/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js/);
  assert.doesNotMatch(base,/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js"[^>]*integrity=/);
});

test('旧bootstrap互換shimは削除済み',()=>{
  assert.equal(fs.existsSync(path.join(root,'insight_bootstrap_patches_v1.js')),false);
});

test('persist安全化はruntime guardが所有する',()=>{
  const guard=fs.readFileSync(path.join(root,'insight_persist_guard_v1.js'),'utf8');
  assert.match(guard,/function guardedPersist\(\)/);
  assert.match(guard,/InsightStorage\.persistCurrent\(currentSnapshot\(\)\)/);
  assert.match(guard,/InsightPersistError/);
  assert.doesNotMatch(guard,/localStorage\.setItem|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotThrow(()=>new vm.Script(guard),'persist guard must be valid JavaScript');
});

test('年度削除の旧UI除去はyear-fix moduleが所有する',()=>{
  const yearFix=fs.readFileSync(path.join(root,'insight_dashboard_year_fix_v1.js'),'utf8');
  assert.match(yearFix,/function removeLegacyYearDeleteUi\(\)/);
  assert.match(yearFix,/#modalBg,\.btn-del-year\{display:none!important\}/);
});

test('旧コア配色はruntime style互換モジュールへ移行済み',()=>{
  const base=payload();
  const runtime=fs.readFileSync(path.join(root,'insight_legacy_style_compat_v1.js'),'utf8');
  assert.match(base,/background:var\(--surface\);color:var\(--text\);box-shadow:0 6px 24px var\(--shadow\);/);
  assert.match(runtime,/function applyRules\(rules\)/);
  assert.match(runtime,/background','#1a1a1a'/);
  assert.match(runtime,/color','#fff'/);
});

test('入力ページ旧年月UIのソースはruntime selectorへ委譲する',()=>{
  const base=payload();
  const selector=fs.readFileSync(path.join(root,'insight_sales_period_selector_v1.js'),'utf8');
  assert.match(base,/const yrId=\{sales:"salesYearRow",kyaku:"kyakuYearRow",haiki:"haikiYearRow"\}\[type\]/);
  assert.match(selector,/model\.legacyCleanupMode='runtime'/);
  assert.match(selector,/function installLegacyBridge\(\)/);
});

test('天気アイコン拡張はruntime moduleが所有する',()=>{
  const runtime=fs.readFileSync(path.join(root,'insight_weather_icon_compat_v1.js'),'utf8');
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

test('天気キー拡張はruntime moduleが所有する',()=>{
  const runtime=fs.readFileSync(path.join(root,'insight_weather_keys_compat_v1.js'),'utf8');
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

test('Chart.jsの安全属性はshellが所有する',()=>{
  const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
  const loader=fs.readFileSync(path.join(root,'insight_shell_loader_v1.js'),'utf8');
  assert.match(index,/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js" integrity="sha512-CQBWl4fJHWbryGE\+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d\+6I\+1zze6Z7kHXO7q3UyZAWw=="/);
  assert.match(index,/crossorigin="anonymous" referrerpolicy="no-referrer"/);
  assert.match(loader,/function stripPayloadChartScript\(html\)/);
  assert.match(loader,/typeof Chart==='undefined'/);
});
