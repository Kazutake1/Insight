const test=require('node:test');
const assert=require('node:assert/strict');

const interpretation=require('../insight_ai_interpretation_v1.js');

function context(metrics,delivery,sales){
  return {
    metrics,
    salesCount:{categories:[{
      id:'cat_onigiri',name:'おにぎり',hidden:false,inputDays:7,
      delivery:{total:{average:delivery}},
      sales:{total:{average:sales}}
    }]},
    conditions:{
      daily:[{weather:'雨'},{weather:'晴'},{weather:'雨'}],
      events:[{id:'sale1',summary:'おにぎりセール'}]
    }
  };
}

function item(spec){
  return Object.assign({
    level:'attention',score:70,positive:false,state:'continuing',stateLabel:'継続',
    persistenceMonths:2,impactYen:20000,confidence:'high',summary:'比較期間より悪化'
  },spec);
}

function monthlyReview(){
  const current=context({salesYen:950000,customers:900,customerUnitPrice:1055.56,items:1800,wasteYen:12000},110,100);
  const previous=context({salesYen:1000000,customers:1000,customerUnitPrice:1000,items:2000,wasteYen:10000},100,100);
  const items=[
    item({key:'customers',type:'customers',theme:'customers',title:'客数低下',summary:'客数 -10.0%'}),
    item({key:'sales',type:'sales',theme:'sales',title:'売上低下',summary:'売上 -5.0%',score:68}),
    item({key:'waste',type:'waste',theme:'waste',title:'廃棄増加',summary:'廃棄金額 +20.0%',score:66}),
    item({key:'gross',type:'grossMargin',theme:'costs',title:'粗利率低下',summary:'粗利率 -1.2pt',score:55}),
    item({key:'labor',type:'laborRate',theme:'costs',title:'人件費率上昇',summary:'人件費率 +1.0pt',score:50}),
    item({key:'improve',type:'sales',theme:'sales',title:'客単価改善',summary:'客単価 +5.6%',score:45,positive:true,state:'improving',stateLabel:'改善'})
  ];
  return {
    period:{yoyLabel:'前年同月比',compareYear:2025},
    current,comparisonYear:previous,previousMonth:previous,
    items,
    forTheme(theme){return this.items.filter(x=>x.theme===theme);}
  };
}

test('月次はダッシュボード数値再掲ではなく優先順位と関係分析を返す',()=>{
  const result=interpretation.monthly(monthlyReview(),'dashboard');
  assert.equal(result.conclusion.length,1);
  assert.match(result.conclusion[0],/確認を優先/);
  assert.ok(result.priorities.length<=5);
  assert.ok(result.priorities.some(x=>/客数低下/.test(x)));
  assert.ok(result.priorities.some(x=>/廃棄増加/.test(x)));
  assert.ok(result.relations.some(x=>/売上 × 客数 × 客単価/.test(x)&&/主因候補は客数/.test(x)));
  assert.ok(result.relations.some(x=>/納品 × 販売 × 廃棄/.test(x)&&/供給量との関係/.test(x)));
  assert.ok(result.checks.some(x=>/曜日別の客数/.test(x)));
});

test('重要ポイントは異常度・スコア・継続性を使い最大5件に絞る',()=>{
  const review=monthlyReview();
  const picked=interpretation.pickItems(review,'dashboard');
  assert.equal(picked.length,5);
  assert.equal(picked[0].title,'客数低下');
  assert.ok(!picked.every(x=>x.positive));
});

test('売上低下時に客単価が維持・改善なら客数を主因候補として表現する',()=>{
  const result=interpretation.monthly(monthlyReview(),'dashboard');
  const line=result.relations.find(x=>/売上 × 客数 × 客単価/.test(x));
  assert.match(line,/売上 -5\.0%/);
  assert.match(line,/客数 -10\.0%/);
  assert.match(line,/客単価 \+5\.6%/);
  assert.match(line,/主因候補は客数/);
});

test('天候・イベントは因果断定せず関連情報として扱う',()=>{
  const result=interpretation.monthly(monthlyReview(),'dashboard');
  const line=result.relations.find(x=>/天候・イベント/.test(x));
  assert.match(line,/雨・雪等 2日/);
  assert.match(line,/登録イベント 1件/);
  assert.match(line,/因果は断定せず/);
});

test('週次でも同じ4ブロックへ変換する',()=>{
  const review=monthlyReview();
  review.period={referenceDate:'2026-10-01'};
  review.previous=review.comparisonYear;
  review.items=review.items.map(x=>Object.assign({},x,{persistenceWeeks:2}));
  const result=interpretation.weekly(review,'dashboard');
  assert.match(result.conclusion[0],/今週/);
  assert.ok(result.priorities.length>0);
  assert.ok(result.relations.length>0);
  assert.ok(result.checks.length>0);
});

test('日次は即時警告を結論と優先事項へ変換し客数主因候補を関連表示する',()=>{
  const anomaly={
    display:[{
      key:'sales',type:'sales',title:'売上低下',summary:'通常比 -18.0%',level:'important',
      details:{customerCause:{deltaPct:-15}}
    }],
    opportunities:[],
    target:{daily:[{conditions:{weather:'雨',eventIds:['event1']}}]}
  };
  const result=interpretation.daily(anomaly,{checks:[]});
  assert.match(result.conclusion[0],/売上低下/);
  assert.match(result.priorities[0],/【重要】/);
  assert.ok(result.relations.some(x=>/主因候補は客数 -15\.0%/.test(x)));
  assert.ok(result.relations.some(x=>/天気 雨/.test(x)));
});
