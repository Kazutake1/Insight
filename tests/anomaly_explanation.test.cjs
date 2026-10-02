const test=require('node:test');
const assert=require('node:assert/strict');
const explanation=require('../insight_anomaly_explanation_v1.js');

function finding(type,direction='down'){return {key:type,type,direction,title:type,summary:'',alertNow:true};}
function baseContext(){
  return {
    weekday:{row:{weekday:4,weekdayLabel:'木',sampleCount:8,metrics:{
      salesYen:{position:{code:'low',label:'低め'}},
      customers:{position:{code:'normal',label:'平均圏'}},
      wasteYen:{position:{code:'high',label:'高め'}}
    }}},
    seasonality:{result:{metrics:{
      salesYen:{historical:{pattern:{code:'recurring_low',sampleYears:3}},current:{index:90},fit:{currentDirection:'low'},relationship:{code:'recurring_low',label:'例年の季節的な低下'}},
      customers:{historical:{pattern:{code:'neutral',sampleYears:3}},current:{index:80},fit:{currentDirection:'low'},relationship:{code:'current_only_low',label:'今年だけ低い可能性'}},
      wasteYen:{historical:{pattern:{code:'neutral',sampleYears:3}},current:{index:110},fit:{currentDirection:'high'},relationship:{code:'current_only_high',label:'今年だけ高い可能性'}}
    }}},
    events:[]
  };
}

test('例年の季節的な低下と同方向の売上異常は説明要因ありに分類する',()=>{
  const result=explanation.annotate(finding('sales','down'),baseContext());
  assert.equal(result.explanation.status,'explained');
  assert.equal(result.explanation.label,'説明要因あり');
  assert.ok(result.explanation.supportingFactors.some(f=>f.kind==='seasonality'));
  assert.equal(result.explanation.causalClaim,false);
});

test('今年だけの客数低下は季節性では説明せず説明要因未特定にする',()=>{
  const result=explanation.annotate(finding('customers','down'),baseContext());
  assert.equal(result.explanation.status,'unexplained');
  assert.ok(result.explanation.opposingFactors.some(f=>f.kind==='seasonality'&&f.relation==='unexpected'));
});

test('曜日傾向だけでは異常を説明済みにしない',()=>{
  const context=baseContext();
  context.seasonality={result:{metrics:{salesYen:null}}};
  const result=explanation.annotate(finding('sales','down'),context);
  assert.equal(result.explanation.status,'unexplained');
  const weekday=result.explanation.factors.find(f=>f.kind==='weekday');
  assert.equal(weekday.relation,'context');
  assert.equal(weekday.supportsFinding,true);
});

test('セール影響方向と売上異常が一致すれば説明要因として扱う',()=>{
  const context=baseContext();
  context.seasonality={result:{metrics:{salesYen:null}}};
  context.events=[{id:'sale1',type:'sale',label:'セール',title:'おにぎりセール',impact:{kpi:{metrics:{salesYen:{pattern:{duringVsBefore:{direction:'up'}}}}}}}];
  const result=explanation.annotate(finding('sales','up'),context);
  assert.equal(result.explanation.status,'explained');
  assert.ok(result.explanation.supportingFactors.some(f=>f.kind==='sale'));
});

test('近隣イベント影響方向と客数異常が一致すれば説明要因として扱う',()=>{
  const context=baseContext();
  context.seasonality={result:{metrics:{customers:null}}};
  context.events=[{id:'evt1',type:'nearby',label:'近隣イベント',title:'祭り',impact:{kpi:{metrics:{customers:{comparison:{direction:'up'}}}}}}];
  const result=explanation.annotate(finding('customers','up'),context);
  assert.equal(result.explanation.status,'explained');
  assert.ok(result.explanation.supportingFactors.some(f=>f.kind==='event'));
});

test('イベント開催は確認できても影響方向を確認できなければ一部説明要因に留める',()=>{
  const context=baseContext();
  context.seasonality={result:{metrics:{salesYen:null}}};
  context.events=[{id:'evt1',type:'special',label:'催事',title:'店頭催事',impact:null,error:'データ不足'}];
  const result=explanation.annotate(finding('sales','up'),context);
  assert.equal(result.explanation.status,'partial');
  assert.equal(result.explanation.causalClaim,false);
});

test('入力異常は業績背景による説明対象にしない',()=>{
  const result=explanation.annotate(finding('input','down'),baseContext());
  assert.equal(result.explanation.status,'not_applicable');
});

test('enrichは元のfindingを破壊せず分類件数を返す',()=>{
  const original=[finding('sales','down'),finding('customers','down')],before=JSON.stringify(original);
  const result=explanation.enrich(original,baseContext());
  assert.equal(JSON.stringify(original),before);
  assert.equal(result.counts.explained,1);
  assert.equal(result.counts.unexplained,1);
});
