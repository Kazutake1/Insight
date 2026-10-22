const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const viewer=require('../insight_weather_sales_view_v1.js');

function fakeTrends(){
  return {analyze(snapshot,options){
    assert.ok([84,168,366].includes(options.lookbackDays));
    return {store:{id:options.storeId,name:snapshot.stores[options.storeId].name},
      period:{startDate:'2026-01-01',endDate:'2026-10-21',days:options.lookbackDays},
      categories:[{id:'onigiri',name:'おにぎり',hidden:false,trips:[
        {trip:1,eligibleDays:0,byCalendar:[]},{trip:2,eligibleDays:0,byCalendar:[]},
        {trip:3,eligibleDays:0,byCalendar:[]}
      ]}]};
  }};
}
test('店舗別に保存済み実績の傾向を取得し、元のデータと選択期間を変更しない',()=>{
  const source={current:'a',stores:{a:{name:'A店'},b:{name:'B店'}}};
  const before=JSON.stringify(source),periods=[];
  const api={analyze(snapshot,options){
    periods.push([options.storeId,options.lookbackDays]);
    return fakeTrends().analyze(snapshot,options);
  }};
  for(const days of [84,168,366]){
    const result=viewer.collect(source,days,{trends:api});
    assert.equal(result.readOnly,true);
    assert.equal(result.localOnly,true);
    assert.equal(result.days,days);
    assert.deepEqual(result.stores.map(s=>s.name),['A店','B店']);
    assert.equal(result.stores[0].categories[0].trips.length,3);
    assert.equal(JSON.stringify(source),before);
  }
  assert.deepEqual(periods,[['a',84],['b',84],['a',168],['b',168],['a',366],['b',366]]);
});
test('一店舗で分析が失敗しても別店舗の結果を保持する',()=>{
  const snapshot={stores:{a:{name:'A店'},b:{name:'B店'}}};
  const api={analyze(s,o){
    if(o.storeId==='a')throw new Error('保存済みデータを解析できません');
    return fakeTrends().analyze(s,o);
  }};
  const result=viewer.collect(snapshot,84,{trends:api});
  assert.match(result.stores[0].error,/解析できません/);
  assert.deepEqual(result.stores[0].categories,[]);
  assert.equal(result.stores[1].error,null);
  assert.equal(result.stores[1].categories.length,1);
});
test('許可外の分析期間と利用できない傾向分析を拒否する',()=>{
  const snapshot={stores:{a:{name:'A'}}};
  for(const days of [0,1,83,85,367,'84',null]){
    assert.throws(()=>viewer.collect(snapshot,days,{trends:fakeTrends()}),/期間/);
  }
  assert.throws(()=>viewer.collect(null,84,{trends:fakeTrends()}),/店舗データ/);
  assert.throws(()=>viewer.collect(snapshot,84,{trends:{}}),/傾向分析モジュール/);
});
test('表示はread-onlyで、既存の分析/診断のロード順とスタイル分離を維持する',()=>{
  const root=path.join(__dirname,'..');
  const script=fs.readFileSync(path.join(root,'insight_weather_sales_view_v1.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'insight_weather_sales_view_v1.css'),'utf8');
  const loader=fs.readFileSync(path.join(root,'insight_shell_loader_v1.js'),'utf8');
  for(const forbidden of [/localStorage\./,/sessionStorage\./,/\.setItem\(/,/fetch\(/,/XMLHttpRequest/,/sendBeacon\(/,/\.save\(/,/eval\(/]){
    assert.doesNotMatch(script,forbidden);
  }
  assert.match(script,/textContent=String\(content\)/);
  assert.match(script,/insightWeatherSalesDiagnosticsButton/);
  assert.match(script,/insight_weather_sales_view_v1\.css/);
  assert.match(css,/#insightWeatherSalesViewOverlay/);
  for(const rule of css.split('\n').filter(s=>s.trim()&&!s.trim().startsWith('/*')&&!s.trim().startsWith('*')&&!s.trim().startsWith('@media'))){
    assert.match(rule,/#insightWeatherSalesViewOverlay/);
  }
  const ordered=['insight_weather_sales_readiness_v1.js','insight_weather_sales_trends_v1.js',
    'insight_weather_sales_diagnostics_v1.js','insight_weather_sales_view_v1.js'];
  let previous=-1;
  ordered.forEach(name=>{
    const at=loader.indexOf("'./"+name+"?v=");
    assert.ok(at>previous,'依存順の不整合：'+name);
    previous=at;
  });
});
