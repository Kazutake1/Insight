const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../insight_trip_overrides_v1.js');

const OPTIONS={todayMonth:'2026-10'};
function fixture(){
  return {schemaVersion:1,current:'a',unrelated:{keep:true},
    salesCountManagement:{version:1,categories:[{id:'c1',name:'カテゴリA'},{id:'c2',name:'カテゴリB'}]},
    stores:{a:{name:'A',years:['2026'],salesCounts:{},data:{keep:'data'},events:[{id:'event'}]},
      b:{name:'B',years:['2026'],salesCounts:{}}}};
}
function mockStorage(opts={}){
  const saved=[];
  return {saved,transaction(source,mutate,validate,apply){
    const next=structuredClone(source);mutate(next);validate(next);
    if(opts.fail)throw opts.fail;
    saved.push(JSON.stringify(next));
    if(apply)apply(next);
    return next;
  }};
}
function mode(snapshot,store='a',category='c1',month='2026-09',trip=3){
  return api.getOverride(snapshot,store,category,month,trip);
}

test('旧形式の店舗データでは手動設定なしを正常扱いし、読取で変更しない',()=>{
  const snapshot=fixture(),before=JSON.stringify(snapshot);
  assert.equal(api.validateSnapshot(snapshot),true);
  assert.equal(mode(snapshot),null);
  assert.equal(JSON.stringify(snapshot),before);
});

test('店舗・カテゴリー・月・便を指定した手動対象判定を一度だけ永続保存する',()=>{
  const snap=fixture(),storage=mockStorage(),original=JSON.stringify(snap);
  assert.equal(api.save(snap,storage,'a','c1','2026-09',3,'active',OPTIONS),true);
  assert.equal(storage.saved.length,1);
  assert.equal(mode(snap), 'active');
  assert.equal(JSON.parse(storage.saved[0]).stores.a.tripHistoryOverrides.version,1);
  assert.equal(snap.schemaVersion,1);
  assert.equal(JSON.stringify({...snap,stores:{...snap.stores,a:{...snap.stores.a,tripHistoryOverrides:undefined}}}).includes('"events":[{"id":"event"}]'),true);
  assert.equal(snap.stores.a.data.keep,'data');
  assert.equal(snap.stores.b.tripHistoryOverrides,undefined);
  assert.equal(JSON.parse(original).stores.a.tripHistoryOverrides,undefined);
});

test('手動対象外の登録・再読込・リセットは保存済み実績を保持する',()=>{
  const snap=fixture(),storage=mockStorage();
  snap.stores.a.salesCounts['2026-09-03']={c1:{trips:[{delivery:3,sales:0},{delivery:null,sales:null},{delivery:null,sales:null}]}};
  const salesBefore=JSON.stringify(snap.stores.a.salesCounts);
  api.save(snap,storage,'a','c1','2026-09',3,'inactive',OPTIONS);
  assert.equal(mode(JSON.parse(storage.saved[0])),'inactive');
  assert.equal(api.effective(snap,'a','c1','2026-09',3,'unknown').value,'inactive');
  api.save(snap,storage,'a','c1','2026-09',3,null,OPTIONS);
  assert.equal(mode(snap),null);
  assert.equal(snap.stores.a.tripHistoryOverrides,undefined);
  assert.equal(JSON.stringify(snap.stores.a.salesCounts),salesBefore);
});

test('数値0でも入力実績があれば対象外への手動設定を拒否する',()=>{
  const snap=fixture(),storage=mockStorage();
  snap.stores.a.salesCounts['2026-09-01']={c1:{trips:[{delivery:null,sales:null},{delivery:null,sales:null},{delivery:0,sales:null}]}};
  const before=JSON.stringify(snap);
  assert.throws(()=>api.save(snap,storage,'a','c1','2026-09',3,'inactive',OPTIONS),/保存済みの納品・販売実績/);
  assert.equal(JSON.stringify(snap),before);
  assert.equal(storage.saved.length,0);
});

test('販売数のみ入力済みの便も対象外へ変更できない',()=>{
  const snap=fixture();
  snap.stores.a.salesCounts['2026-09-01']={c1:{trips:[{delivery:null,sales:null},{delivery:null,sales:null},{delivery:null,sales:11}]}};
  assert.throws(()=>api.put(snap,'a','c1','2026-09',3,'inactive',OPTIONS),/保存済み/);
});

test('同じ判定への再保存と未設定のリセットでは書き込まない',()=>{
  const snap=fixture(),storage=mockStorage();
  assert.equal(api.save(snap,storage,'a','c1','2026-09',3,null,OPTIONS),false);
  assert.equal(api.save(snap,storage,'a','c1','2026-09',3,'active',OPTIONS),true);
  assert.equal(api.save(snap,storage,'a','c1','2026-09',3,'active',OPTIONS),false);
  assert.equal(storage.saved.length,1);
});

test('他店舗・他カテゴリー・他年月の手動設定に干渉しない',()=>{
  const snap=fixture(),storage=mockStorage();
  api.save(snap,storage,'a','c1','2026-09',1,'active',OPTIONS);
  api.save(snap,storage,'a','c2','2026-09',2,'inactive',OPTIONS);
  api.save(snap,storage,'b','c1','2026-08',3,'active',OPTIONS);
  api.save(snap,storage,'a','c1','2026-09',1,null,OPTIONS);
  assert.equal(api.getOverride(snap,'a','c2','2026-09',2),'inactive');
  assert.equal(api.getOverride(snap,'b','c1','2026-08',3),'active');
  assert.equal(api.getOverride(snap,'a','c1','2026-09',1),null);
});

test('保存失敗時は手動設定をメモリに反映せず既存実績も保護',()=>{
  const snap=fixture(),original=JSON.stringify(snap),error=new Error('容量不足');
  const storage=mockStorage({fail:error});
  assert.throws(()=>api.save(snap,storage,'a','c1','2026-09',1,'active',OPTIONS),/容量不足/);
  assert.equal(JSON.stringify(snap),original);
  assert.equal(storage.saved.length,0);
});

test('別タブとの競合による保存失敗でも既存設定を変更しない',()=>{
  const snap=fixture(),error=new Error('別のタブで更新'),storage=mockStorage({fail:error});
  error.name='InsightStorageConflictError';
  assert.throws(()=>api.save(snap,storage,'a','c1','2026-09',1,'active',OPTIONS),e=>e.name==='InsightStorageConflictError');
  assert.equal(snap.stores.a.tripHistoryOverrides,undefined);
});

test('完了前の月・対象店舗なし・カテゴリーなし・不正な便は保存を拒否',()=>{
  const snap=fixture();
  assert.throws(()=>api.put(snap,'a','c1','2026-10',3,'active',OPTIONS),/終了した過去月/);
  assert.throws(()=>api.put(snap,'no','c1','2026-09',3,'active',OPTIONS),/店舗/);
  assert.throws(()=>api.put(snap,'a','no','2026-09',3,'active',OPTIONS),/カテゴリー/);
  assert.throws(()=>api.put(snap,'a','c1','2026-09',4,'active',OPTIONS),/便の指定/);
  assert.throws(()=>api.put(snap,'a','c1','2026-09',1,'wrong',OPTIONS),/手動判定/);
});

test('不正な保存形式は放置せず検証エラーとする',()=>{
  const snap=fixture();
  snap.stores.a.tripHistoryOverrides={version:1,categories:{c1:{'2026-09':{'3':'none'}}}};
  assert.throws(()=>api.validateSnapshot(snap),/手動判定/);
  snap.stores.a.tripHistoryOverrides={version:2,categories:{}};
  assert.throws(()=>api.validateSnapshot(snap),/形式/);
});

test('変更後に実績が入力された手動対象外は入力実績を優先して矛盾として表示',()=>{
  const snap=fixture();
  api.put(snap,'a','c1','2026-09',3,'inactive',OPTIONS);
  snap.stores.a.salesCounts['2026-09-03']={c1:{trips:[{delivery:null,sales:null},{delivery:null,sales:null},{delivery:0,sales:null}]}};
  assert.deepEqual(api.effective(snap,'a','c1','2026-09',3,'unknown'),
    {mode:'conflict',value:'observed_active',manual:'inactive'});
});

test('追加メタデータは全体JSONバックアップでも既存データと同時に復元可能',()=>{
  const snap=fixture();api.put(snap,'a','c1','2026-09',3,'inactive',OPTIONS);
  const restored=JSON.parse(JSON.stringify(snap));
  assert.equal(api.validateSnapshot(restored),true);
  assert.equal(mode(restored),'inactive');
  assert.equal(restored.stores.a.data.keep,'data');
  assert.deepEqual(restored.stores.a.events,[{id:'event'}]);
});
