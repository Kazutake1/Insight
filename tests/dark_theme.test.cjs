const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','insight_dark_theme_v1.js'),'utf8');

test('Firefox系ダークテーマは指定パレットをdarkモードだけに適用する',()=>{
  assert.match(source,/background:'#251b26'/);
  assert.match(source,/surface:'#2f2942'/);
  assert.match(source,/wine:'#432325'/);
  assert.match(source,/wineActive:'#5a3038'/);
  assert.match(source,/\.dark\{/);
  assert.match(source,/\.dark \.sidebar/);
  assert.match(source,/\.dark \.nav-btn\.active/);
});

test('ダークテーマは保存データや外部通信に触れない',()=>{
  assert.doesNotMatch(source,/localStorage|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('テーマカラーはdark時だけプラム色へ同期する',()=>{
  assert.match(source,/meta\[name="theme-color"\]/);
  assert.match(source,/darkActive\(\)\?PALETTE\.background/);
  assert.match(source,/dataset\.insightLightThemeColor/);
});


test('テーマ切替UIは設定ボタン直上のトグルスイッチとして提供する',()=>{
  const settings=fs.readFileSync(path.join(__dirname,'..','insight_settings_v1.js'),'utf8');
  assert.match(settings,/insight-theme-toggle/);
  assert.match(settings,/id="insightThemeToggle" type="checkbox" role="switch"/);
  assert.match(settings,/sidebarActions\.replaceChildren\(themeWrap,nav\)/);
  assert.match(settings,/dark\.click\(\)/);
  assert.match(settings,/dark\.hidden=true/);
});
