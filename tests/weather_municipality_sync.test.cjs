'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','insight_temperature_v1.js'),'utf8');
function location(name='名古屋市'){return {name,admin1:'愛知県',latitude:35.17,longitude:136.97};}
function row(){return {d:'1',weather:'晴',tempMaxC:25,tempMinC:15,売上:1234,客数:67};}
function store(years,data,name='名古屋市'){return {years,data,weatherLocation:location(name)};}
function save(stores){
  const callbacks={};
  const window={InsightHooks:{on(name,key,fn){callbacks[name+':'+key]=fn;}}};
  const allStores={current:'a',stores};
  const context={window,globalThis:window,allStores,store:stores.a,
    document:{activeElement:null,getElementById(){return null;}},currentNav:1,
    WeakMap,Number,String,Object,Array,Math,console,
    persist(){},alert(message){assert.fail('Unexpected UI alert: '+message);}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const handler=callbacks['quick:save:after:temperature-save'];
  assert.equal(typeof handler,'function');
  handler({state:{temperature:{
    target:{fy:'2026',month:'10月',day:1},future:false,
    values:{max:26,min:16}
  }}});
}
test('same municipality and registered date sync weather/temperature without changing sales',()=>{
  const a=store(['2026'],{'2026':{'10月':[row()]}});
  const b=store(['2026'],{'2026':{'10月':[row()]}});
  a.data['2026']['10月'][0].weather='大雪';
  save({a,b});
  const synced=b.data['2026']['10月'][0];
  assert.equal(synced.weather,'大雪');
  assert.equal(synced.tempMaxC,26);
  assert.equal(synced.tempMinC,16);
  assert.equal(synced.売上,1234);
  assert.equal(synced.客数,67);
});
test('unregistered destination year never creates orphan year data',()=>{
  const a=store(['2026'],{'2026':{'10月':[row()]}});
  const b=store(['2025'],{'2025':{'10月':[row()]}});
  const before=JSON.stringify(b);
  save({a,b});
  assert.equal(JSON.stringify(b),before);
  assert.equal(Object.hasOwn(b.data,'2026'),false);
});
test('orphan year already present is not modified, even when municipality matches',()=>{
  const a=store(['2026'],{'2026':{'10月':[row()]}});
  const b=store(['2025'],{'2026':{'10月':[row()]},'2025':{'10月':[row()]}});
  const before=JSON.stringify(b);
  save({a,b});
  assert.equal(JSON.stringify(b),before);
});
test('missing destination month/day is skipped rather than generating a row',()=>{
  for(const data of [{'2026':{}},{'2026':{'10月':[]}}]){
    const a=store(['2026'],{'2026':{'10月':[row()]}});
    const b=store(['2026'],data);
    const before=JSON.stringify(b);
    save({a,b});
    assert.equal(JSON.stringify(b),before);
  }
});
test('different municipality never receives shared weather',()=>{
  const a=store(['2026'],{'2026':{'10月':[row()]}});
  const b=store(['2026'],{'2026':{'10月':[row()]}},'一宮市');
  const before=JSON.stringify(b);
  save({a,b});
  assert.equal(JSON.stringify(b),before);
});