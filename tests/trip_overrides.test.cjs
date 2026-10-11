const test=require('node:test');
const assert=require('node:assert/strict');
const overrides=require('../insight_trip_overrides_v1.js');
function base(){
  return {schemaVersion:1,current:'a',stores:{
    a:{name:'A',salesCounts:{}},b:{name:'B',salesCounts:{}}
  },salesCountManagement:{version:1,categories:[
    {id:'cat1',name:'商品A',hidden:false,aliases:[],activeTrips:[true,true,true]},
    {id:'cat2',name:'商品B',hidden:false,aliases:[],activeTrips:[true,true,true]}
  ]}};
}
function fakeStorage(fail){
  return {transaction(source,mutate,validate,apply){
    const next=JSON.parse(JSON.stringify(source));
    mutate(next);validate(next);
    if(fail)throw new Error('InsightStorageConflictError');
    apply(next);return next;
  }};
}
function inputs(data,trip,values,date='2026-09-15',store='a',cat='cat1'){
  data.stores[store].salesCounts[date]={[cat]:{trips:[{delivery:null,sales:null},{delivery:null,sales:null},{delivery:null,sales:null}]}};
  data.stores[store].salesCounts[date][cat].trips[trip-1]=values;
}
test('旧データは任意の対象便手動設定がなくても検証できる',()=>{
  const data=base(),before=JSON.stringify(data);
  assert.equal(overrides.validate(data),true);
  assert.equal(overrides.find(data,'a','cat1','2026-09',1),null);
  assert.deepEqual(overrides.resolve(data,'a','cat1','2026-09',1,'inferred_inactive'),{
    status:'inferred_inactive',manual:null,derived:'inferred_inactive',isManual:false});
  assert.equal(JSON.stringify(data),before);
});
test('月別・店舗別・カテゴリ別・便別に対象便を指定し再読み込み後も残る',()=>{
  const data=base(),raw=JSON.stringify(data);
  overrides.save(data,'a','cat1','2026-09',3,'active',fakeStorage());
  assert.equal(data.tripInferenceOverrides.length,1);
  assert.equal(overrides.find(JSON.parse(JSON.stringify(data)),'a','cat1','2026-09',3),'active');
  assert.equal(overrides.find(data,'b','cat1','2026-09',3),null);
  assert.equal(overrides.find(data,'a','cat2','2026-09',3),null);
  assert.equal(overrides.find(data,'a','cat1','2026-08',3),null);
  assert.equal(overrides.find(data,'a','cat1','2026-09',2),null);
  assert.equal(data.schemaVersion,JSON.parse(raw).schemaVersion);
  assert.deepEqual(data.stores,JSON.parse(raw).stores);
  assert.deepEqual(data.salesCountManagement,JSON.parse(raw).salesCountManagement);
});
test('手動指定は自動判定の表示より優先され、戻すと自動へ復帰する',()=>{
  const data=base();
  overrides.save(data,'a','cat1','2026-09',3,'inactive',fakeStorage());
  assert.deepEqual(overrides.resolve(data,'a','cat1','2026-09',3,'unknown'),{
    status:'manual_inactive',manual:'inactive',derived:'unknown',isManual:true});
  overrides.save(data,'a','cat1','2026-09',3,'active',fakeStorage());
  assert.equal(overrides.resolve(data,'a','cat1','2026-09',3,'inferred_inactive').status,'manual_active');
  overrides.save(data,'a','cat1','2026-09',3,'auto',fakeStorage());
  assert.equal(Object.prototype.hasOwnProperty.call(data,'tripInferenceOverrides'),false);
  assert.equal(overrides.resolve(data,'a','cat1','2026-09',3,'inferred_inactive').status,'inferred_inactive');
});
test('入力済み0を含む便を対象外にできず、保存済み実績は保持される',()=>{
  const data=base();
  inputs(data,3,{delivery:0,sales:null});
  const before=JSON.stringify(data);
  assert.equal(overrides.hasObservedTrip(data,'a','cat1','2026-09',3),true);
  assert.throws(()=>overrides.save(data,'a','cat1','2026-09',3,'inactive',fakeStorage()),/入力済み/);
  assert.equal(JSON.stringify(data),before);
  overrides.save(data,'a','cat1','2026-09',3,'active',fakeStorage());
  assert.equal(data.stores.a.salesCounts['2026-09-15'].cat1.trips[2].delivery,0);
});
test('保存競合など書込エラー時には画面側の対象便記録を更新しない',()=>{
  const data=base(),before=JSON.stringify(data);
  assert.throws(()=>overrides.save(data,'a','cat1','2026-09',3,'active',fakeStorage(true)),/Conflict/);
  assert.equal(JSON.stringify(data),before);
});
test('未登録店舗・カテゴリ・当月・未来月・不正便・不正操作を拒否する',()=>{
  const data=base();
  assert.throws(()=>overrides.apply(data,'missing','cat1','2026-09',1,'active'),/店舗/);
  assert.throws(()=>overrides.apply(data,'a','missing','2026-09',1,'active'),/カテゴリー/);
  assert.throws(()=>overrides.apply(data,'a','cat1','2026-13',1,'active'),/過去月/);
  assert.throws(()=>overrides.apply(data,'a','cat1','2026-10',1,'active'),/過去月/);
  assert.throws(()=>overrides.apply(data,'a','cat1','2026-09',4,'active'),/不正/);
  assert.throws(()=>overrides.apply(data,'a','cat1','2026-09',1,'unknown'),/不正/);
});
test('旧形式のバックアップはそのまま、新形式の任意記録はJSON往復で保持',()=>{
  const data=base(),backup=JSON.stringify(data);
  assert.doesNotThrow(()=>overrides.validate(JSON.parse(backup)));
  overrides.save(data,'b','cat2','2026-08',2,'inactive',fakeStorage());
  const restored=JSON.parse(JSON.stringify({backupInfo:{format:'InsightBackup',formatVersion:2},data})).data;
  assert.doesNotThrow(()=>overrides.validate(restored));
  assert.equal(overrides.find(restored,'b','cat2','2026-08',2),'inactive');
  assert.equal(restored.schemaVersion,1);
});
test('手動設定レコードの破損・重複を厳密に拒否する',()=>{
  const data=base();
  data.tripInferenceOverrides=[{storeId:'a',categoryId:'cat1',month:'2026-09',trip:2,status:'inactive'}];
  assert.doesNotThrow(()=>overrides.validate(data));
  data.tripInferenceOverrides.push({...data.tripInferenceOverrides[0]});
  assert.throws(()=>overrides.validate(data),/重複/);
  data.tripInferenceOverrides[1].trip=3;
  data.tripInferenceOverrides[1].status='forced';
  assert.throws(()=>overrides.validate(data),/不正/);
  data.tripInferenceOverrides='bad';
  assert.throws(()=>overrides.validate(data),/不正/);
});
test('既存の他便データと現在のカテゴリー対象便設定を保存後も変更しない',()=>{
  const data=base();
  inputs(data,1,{delivery:15,sales:0});
  inputs(data,3,{delivery:null,sales:8},'2026-09-16');
  const before=JSON.stringify({stores:data.stores,master:data.salesCountManagement});
  overrides.save(data,'a','cat1','2026-09',2,'inactive',fakeStorage());
  assert.equal(JSON.stringify({stores:data.stores,master:data.salesCountManagement}),before);
});
