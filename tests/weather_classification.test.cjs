const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('選択肢から霧・凍雨を外し、大雪を追加（保存済みラベルは残す）',()=>{
  const window={};
  const WX_KEYS=['快晴','晴','晴曇','曇','小雨','雨','大雨','みぞれ','雪','霧','凍雨','雷雨'];
  const WX_ICONS={'大雨':'⛈️','雪':'❄️','霧':'🌫️','凍雨':'🧊'};
  const ctx={window,WX_KEYS,WX_ICONS};
  vm.createContext(ctx);
  vm.runInContext(read('insight_weather_keys_compat_v1.js'),ctx);
  vm.runInContext(read('insight_weather_icon_compat_v1.js'),ctx);
  assert.equal(WX_KEYS.includes('霧'),false);
  assert.equal(WX_KEYS.includes('凍雨'),false);
  assert.equal(WX_KEYS.includes('大雪'),true);
  assert.equal(WX_KEYS.includes('雷雨'),true);
  assert.equal(WX_ICONS['霧'],'🌫️');
  assert.equal(WX_ICONS['凍雨'],'🧊');
  const icon=window.InsightWeatherIconCompat;
  const svg=['大雨','雷雨','雪','大雪'].map(wx=>icon.markup(wx));
  assert.equal(new Set(svg).size,4);
  assert.ok(svg.every(markup=>markup.includes('<svg')));
  assert.doesNotMatch(svg[0],/l-6 7/);
  assert.match(svg[1],/l-6 7/);
  assert.ok((svg[3].match(/<path/g)||[]).length>(svg[2].match(/<path/g)||[]).length);
  assert.equal(icon.markup('霧'),'🌫️');
});

function autoWeather(){
  const window={};
  const document={getElementById:()=>null};
  const ctx={window,globalThis:window,document,allStores:{stores:{}},store:{},
    Date,Intl,Number,String,Object,Array,Math,Promise,encodeURIComponent,console,setTimeout:()=>0};
  vm.createContext(ctx);
  vm.runInContext(read('insight_weather_temperature_auto_v1.js'),ctx);
  return window.InsightWeatherTemperatureAuto.wmoToWx;
}
function bulkWeather(){
  const window={};
  const ctx={window,globalThis:window,Date,Number,String,Object,Array,Math,Promise,Set,Map,URL,encodeURIComponent,console};
  vm.createContext(ctx);
  vm.runInContext(read('insight_weather_bulk_v1.js'),ctx);
  return window.InsightWeatherBulk.codeToWeather;
}
test('自動天気取得と過去の一括補完で廃止カテゴリを生成せず、強い雪を大雪に分類',()=>{
  for(const classify of [autoWeather(),bulkWeather()]){
    for(const code of [45,48])assert.equal(classify(code),'曇');
    for(const code of [56,57,66,67])assert.equal(classify(code),'雨');
    for(const code of [71,73,77,85])assert.equal(classify(code),'雪');
    for(const code of [75,86])assert.equal(classify(code),'大雪');
    assert.equal(classify(95),'雷雨');
    assert.equal(classify(65),'大雨');
  }
});

test('気象庁の大雪コードを識別し、通常の雪とは区別する',()=>{
  const core=read('insight_payload_core_v1.js');
  const match=core.match(/function jmaCodeToWx\(code\)\{([\s\S]*?)\n\}/);
  assert.ok(match,'JMA mapping found');
  const jma=new Function('code',match[1]);
  assert.equal(jma(405),'大雪');
  assert.equal(jma(425),'大雪');
  assert.equal(jma(400),'雪');
  assert.equal(jma(302),'雨');
  assert.match(core,/"雪":\["みぞれ","雪","大雪"\]/);
  assert.match(core,/"曇り":\["曇","霧"\]/);
  assert.match(core,/"雨":\["小雨","雨","大雨","凍雨","雷雨"\]/);
});
