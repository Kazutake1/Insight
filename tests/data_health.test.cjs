const test=require('node:test');
const assert=require('node:assert/strict');
const health=require('../insight_data_health_v1.js');
const events=require('../insight_events_v1.js');

function day(d){return {d:String(d),売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:{},weather:''};}
function yearData(year){
  const out={};
  for(let month=1;month<=12;month++){
    const days=new Date(Number(year),month,0).getDate();
    out[month+'月']=Array.from({length:days},(_,i)=>day(i+1));
  }
  return out;
}
function clean(){
  return {
    current:'s1',
    stores:{
      s1:{name:'店舗A',years:['2025','2026'],data:{'2025':yearData('2025'),'2026':yearData('2026')},monthlyOps:{},salesCounts:{'2026-01-01':{}},hourlyCustomers:{'2026-01-01':Array(24).fill(null)}}
    }
  };
}

test('正常な保存構造は正常判定になる',()=>{
  const data=clean(),before=JSON.stringify(data);
  const report=health.check(data);
  assert.equal(report.ok,true);
  assert.equal(report.status,'ok');
  assert.equal(report.counts.total,0);
  assert.equal(JSON.stringify(data),before,'チェックは保存データを変更してはいけない');
});

test('未登録年度の残存データと日付別データを要確認として検出する',()=>{
  const data=clean(),store=data.stores.s1;
  store.data['2024']={'8月':[null,null,{d:'3'}]};
  store.monthlyOps['2024']={'8月':{}};
  store.salesCounts['2024-08-03']={};
  store.hourlyCustomers['2024-08-03']=Array(24).fill(null);
  const before=JSON.stringify(data);
  const report=health.check(data);
  const codes=report.issues.map(x=>x.code);
  assert.equal(report.status,'warning');
  assert.ok(codes.includes('orphan_data_year'));
  assert.ok(codes.includes('monthly_ops_unregistered_year'));
  assert.ok(codes.includes('sales_unregistered_year'));
  assert.ok(codes.includes('hourly_unregistered_year'));
  assert.equal(JSON.stringify(data),before,'要確認判定でも保存データを変更してはいけない');
});

test('正式年度内のnull行や日数不一致は重大として検出する',()=>{
  const data=clean(),rows=data.stores.s1.data['2025']['1月'];
  rows[0]=null;
  rows.pop();
  const report=health.check(data);
  assert.equal(report.status,'error');
  assert.ok(report.issues.some(x=>x.code==='month_length'));
  assert.ok(report.issues.some(x=>x.code==='daily_invalid'));
});

test('時間帯別客数の24時間形式と日付キーを検査する',()=>{
  const data=clean(),store=data.stores.s1;
  store.hourlyCustomers['2026-02-30']=[1,2];
  store.hourlyCustomers['2026-02-01']=[1,2];
  const report=health.check(data);
  assert.ok(report.issues.some(x=>x.code==='hourly_invalid_date'));
  assert.ok(report.issues.some(x=>x.code==='hourly_invalid_shape'));
});


test('廃棄数が未導入の旧データは正常として扱う',()=>{
  const data=clean(),before=JSON.stringify(data);
  assert.equal(health.check(data).status,'ok');
  assert.equal(JSON.stringify(data),before);
});
test('廃棄数の正常な数量・日付・カテゴリーを読取専用で検証する',()=>{
  const data=clean();
  data.salesCountManagement={version:1,categories:[{id:'cat_onigiri',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]}]};
  data.stores.s1.wasteCounts={'2026-10-11':{cat_onigiri:{trips:[null,0,3]}}};
  const before=JSON.stringify(data),report=health.check(data);
  assert.equal(report.status,'ok');assert.equal(JSON.stringify(data),before);
});
test('廃棄数の不正便数・数量・カテゴリー・日付を検出し保存データを変更しない',()=>{
  const data=clean();
  data.salesCountManagement={version:1,categories:[{id:'cat_onigiri'}]};
  data.stores.s1.wasteCounts={
    '2026-10-11':{
      cat_onigiri:{trips:[null,-1,1.5]},
      unknown:{trips:[0,1,2]}
    },
    '2026-10-12':{cat_onigiri:{trips:['0',null,3]}},
    '2026-02-30':{cat_onigiri:{trips:[0,0,0]}}
  };
  const before=JSON.stringify(data),report=health.check(data);
  const codes=new Set(report.issues.map(i=>i.code));
  for(const code of ['waste_invalid_record','waste_unknown_category','waste_invalid_date'])assert.ok(codes.has(code),code);
  assert.equal(report.status,'error');assert.equal(JSON.stringify(data),before);
});
test('廃棄数のレコードがあるのに共通カテゴリーが存在しない場合はエラー',()=>{
  const data=clean();
  data.stores.s1.wasteCounts={'2026-10-11':{cat_onigiri:{trips:[0,1,2]}}};
  assert.ok(health.check(data).issues.some(x=>x.code==='waste_missing_categories'));
});

function eventRecord(id,scope,type){
  return {id,type:type||'special',scope,startDate:'2026-10-11',endDate:'2026-10-12',
    snapshot:{version:1,title:'実績確認用イベント',note:''}};
}

test('イベント・催事が登録されていない旧データは正常なまま',()=>{
  const data=clean(),before=JSON.stringify(data);
  const report=health.check(data,events);
  assert.equal(report.status,'ok');
  assert.equal(JSON.stringify(data),before);
});

test('正常な全店共通イベント・店舗イベント・よく使う設定は変更せず正常判定',()=>{
  const data=clean();
  data.eventManagement={version:1,presets:[],events:[eventRecord('global1','global','campaign')]};
  data.stores.s1.events=[eventRecord('store1','store')];
  const before=JSON.stringify(data),report=health.check(data,events);
  assert.equal(report.status,'ok');
  assert.equal(report.counts.errors,0);
  assert.equal(JSON.stringify(data),before);
});

test('店舗イベントの不正な開催期間を店舗名付きで報告し書き換えない',()=>{
  const data=clean(),bad=eventRecord('store-bad','store');
  bad.endDate='2026-10-10';
  data.stores.s1.events=[bad];
  const before=JSON.stringify(data),report=health.check(data,events);
  const issue=report.issues.find(item=>item.code==='event_store_invalid');
  assert.equal(report.status,'error');
  assert.equal(issue.storeId,'s1');
  assert.equal(issue.storeName,'店舗A');
  assert.match(issue.message,/開催期間/);
  assert.equal(JSON.stringify(data),before);
});

test('全店共通のプリセット不正は店舗イベントとは分けて報告',()=>{
  const data=clean();
  data.eventManagement={version:1,presets:[{id:'preset-bad',snapshot:{version:1,title:'',note:''}}],events:[]};
  const before=JSON.stringify(data),report=health.check(data,events);
  assert.ok(report.issues.some(item=>item.code==='event_global_invalid'&&/名称/.test(item.message)));
  assert.ok(!report.issues.some(item=>item.code==='event_store_invalid'));
  assert.equal(JSON.stringify(data),before);
});

test('店舗間・共通をまたぐイベント識別番号の重複を検出',()=>{
  const data=clean();
  data.eventManagement={version:1,presets:[],events:[eventRecord('duplicate','global','campaign')]};
  data.stores.s1.events=[eventRecord('duplicate','store')];
  const before=JSON.stringify(data),report=health.check(data,events);
  assert.equal(report.status,'error');
  assert.ok(report.issues.some(item=>item.code==='event_cross_scope_invalid'&&/重複/.test(item.message)));
  assert.equal(JSON.stringify(data),before);
});

test('異常のある店舗だけを特定し他店舗のイベントを誤判定しない',()=>{
  const data=clean(),other=JSON.parse(JSON.stringify(data.stores.s1));
  other.name='店舗B';
  other.events=[eventRecord('store-b','store')];
  data.stores.s2=other;
  data.stores.s1.events=[eventRecord('store-a','store')];
  data.stores.s1.events[0].scope='global';
  const report=health.check(data,events);
  const items=report.issues.filter(item=>item.code==='event_store_invalid');
  assert.equal(items.length,1);
  assert.equal(items[0].storeName,'店舗A');
});

test('イベント検証処理が利用できないときは正常扱いにせず検査不能を報告',()=>{
  const data=clean();
  data.stores.s1.events=[eventRecord('store1','store')];
  const report=health.check(data);
  assert.equal(report.status,'error');
  assert.ok(report.issues.some(item=>item.code==='event_validator_missing'));
});
