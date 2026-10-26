'use strict';
/* STEP4 P4d-9: Combined VM observations using unchanged REAL editor source.
 * No DOMContentLoaded, actual store, persisted write, production capture,
 * network or model. All outcomes are NON-AUTHORIZING.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const DIR=path.join(__dirname,'..');
const SOURCES=[
  'insight_storage_v1.js','insight_sales_count_v1.js',
  'insight_hourly_customers_v1.js','insight_events_v1.js',
  'insight_input_day_nav_v1.js','insight_quick_date_nav_v1.js'
];
const KEYS=['sales_count','quick_daily','daily_sales','daily_customers',
  'daily_waste','hourly_customers','events_and_promotions'];
const DENIED=Object.freeze({full_app_clean:false,
  provenance_verified:false,authorized_for_model:false});
function fixture(options={}){
  const nodes={},hooks={},storageListeners=[],writes=[];
  let raw=JSON.stringify({schemaVersion:1,current:'fake',stores:{fake:{name:'fake-only'}}});
  function node(){
    const subs={};return {
      addEventListener(k,cb){(subs[k]||(subs[k]=[])).push(cb);},
      emit(k){(subs[k]||[]).forEach(cb=>cb({target:this}));}
    };
  }
  for(const id of ['pageQuick','qNavRow','quickGrid'])nodes[id]=node();
  const doc={readyState:'loading',
    getElementById(k){return nodes[k]||null;},addEventListener(){}};
  const root={document:doc,SK:'insight_v11',
    localStorage:{
      getItem(k){if(k!=='insight_v11')throw Error('invalid fake key');return raw;},
      setItem(k,v){writes.push([k,v]);raw=v;}
    },
    addEventListener(k,cb){if(k==='storage')storageListeners.push(cb);},
    InsightDateContext:options.noContext?undefined:{getSelectedIso(){return '2026-10-26';}},
    renderQuickPage(){},saveQuick(){},
    InsightHooks:{on(k,id,cb){(hooks[k]||(hooks[k]=[])).push(cb);}},
    setTimeout(){throw Error('no deferred init');}
  };
  const context={window:root,globalThis:root,document:doc,SK:'insight_v11',
    allStores:{current:'fake',stores:{fake:{name:'fake-only'}}},
    setTimeout(){throw Error('no deferred init');}};
  vm.createContext(context);
  for(const name of SOURCES)vm.runInContext(
    fs.readFileSync(path.join(DIR,name),'utf8'),context,{filename:name,timeout:1500});
  function statuses(){return {
    sales_count:root.InsightSalesCount?.getForecastDraftStatus(),
    quick_daily:root.InsightQuickDaily?.getForecastDraftStatus(),
    daily_sales:root.InsightInputDayNav?.getForecastDraftStatus('sales'),
    daily_customers:root.InsightInputDayNav?.getForecastDraftStatus('kyaku'),
    daily_waste:root.InsightInputDayNav?.getForecastDraftStatus('haiki'),
    hourly_customers:root.InsightHourlyCustomers?.getForecastDraftStatus(),
    events_and_promotions:root.InsightEvents?.getForecastDraftStatus()
  };}
  function externalChange(){
    const prior=raw;
    raw=JSON.stringify({schemaVersion:1,current:'fake',stores:{fake:{name:'changed'}}});
    storageListeners.forEach(fn=>fn({key:'insight_v11',oldValue:prior,newValue:raw}));
  }
  return {root,nodes,writes,hooks,statuses,externalChange,
    get raw(){return raw;}};
}
function sampledState(f){
  try{
    const a=f.root.InsightStorage.reportState();
    if(a.pending!==0||a.held||a.conflict)return 'UNKNOWN';
    const statuses=f.statuses();
    const all=KEYS.map(k=>{
      const s=statuses[k];if(!s||typeof s!=='object')return null;
      const own=p=>{const d=Object.getOwnPropertyDescriptor(s,p);
        return d&&Object.hasOwn(d,'value')?d.value:null;};
      const initialized=own('initialized'),dirty=own('dirty'),epoch=own('epoch');
      return initialized===true&&typeof dirty==='boolean'&&
        Number.isSafeInteger(epoch)&&epoch>=0?{dirty,epoch}:null;
    });
    const b=f.root.InsightStorage.reportState();
    if(a.revision!==b.revision||b.pending!==0||b.held||b.conflict||
        all.some(s=>!s))return 'UNKNOWN';
    return all.some(s=>s.dirty)?'DIRTY':'OBSERVED_CLEAN_ONLY';
  }catch{return 'UNKNOWN';}
}
function deny(){
  assert.equal(DENIED.full_app_clean,false);
  assert.equal(DENIED.provenance_verified,false);
  assert.equal(DENIED.authorized_for_model,false);
}
test('P4d9 R01: seven status getters exist in actual six reviewed source modules',()=>{
  const h=fixture(),out=h.statuses();
  assert.deepEqual(Object.keys(out),KEYS);
  assert.ok(h.root.InsightStorage);
  for(const k of KEYS){
    assert.ok(out[k],k);
    assert.equal(Object.isFrozen(out[k]),true,k);
    assert.deepEqual(Object.keys(out[k]).sort(),['dirty','epoch','initialized'],k);
  }
  assert.equal(h.writes.length,0);deny();
});
test('P4d9 R02: before real editor initialization all seven sources are UNKNOWN',()=>{
  const h=fixture(),out=h.statuses();
  for(const k of KEYS){assert.equal(out[k].initialized,false,k);
    assert.equal(out[k].dirty,null,k);}
  assert.equal(sampledState(h),'UNKNOWN');assert.equal(h.writes.length,0);deny();
});
test('P4d9 R03: real QuickDaily input witness is DIRTY without Storage commit',()=>{
  const h=fixture(),a=h.root.InsightStorage.reportState();
  h.nodes.quickGrid.emit('input');
  const q=h.statuses().quick_daily;
  assert.equal(q.initialized,true);assert.equal(q.dirty,true);
  assert.ok(Number.isSafeInteger(q.epoch)&&q.epoch>0);
  assert.equal(h.root.InsightStorage.reportState().revision,a.revision);
  assert.equal(sampledState(h),'UNKNOWN');assert.equal(h.writes.length,0);deny();
});
test('P4d9 R04: real QuickDaily after-save hook resets to UNKNOWN, never CLEAN',()=>{
  const h=fixture();
  h.nodes.quickGrid.emit('change');
  const before=h.statuses().quick_daily;
  assert.equal(before.dirty,true);
  assert.ok(h.hooks['quick:save:after']?.length);
  for(const fn of h.hooks['quick:save:after'])fn();
  const after=h.statuses().quick_daily;
  assert.equal(after.initialized,false);assert.equal(after.dirty,null);
  assert.ok(after.epoch>before.epoch);
  assert.equal(sampledState(h),'UNKNOWN');
  assert.equal(h.writes.length,0);deny();
});
test('P4d9 R05: original Storage sees external notification and joined view fails closed',()=>{
  const h=fixture(),a=h.root.InsightStorage.reportState();
  h.nodes.quickGrid.emit('input');h.externalChange();
  const b=h.root.InsightStorage.reportState();
  assert.equal(b.conflict,true);assert.ok(b.revision>a.revision);
  assert.equal(sampledState(h),'UNKNOWN');assert.equal(h.writes.length,0);deny();
});
test('P4d9 R06: missing DateContext omits four real API sources, not clean',()=>{
  const h=fixture({noContext:true}),out=h.statuses();
  for(const k of ['quick_daily','daily_sales','daily_customers','daily_waste'])
    assert.equal(out[k],undefined,k);
  assert.equal(sampledState(h),'UNKNOWN');assert.equal(h.writes.length,0);deny();
});
test('P4d9 R07: status-only reads expose no identifier/value or persistence',()=>{
  const h=fixture(),before=h.raw,out=h.statuses();
  const printed=JSON.stringify(out);
  assert.doesNotMatch(printed,/fake-only|insight_v11|schemaVersion|stores/);
  assert.equal(h.raw,before);
  assert.equal(h.writes.length,0);deny();
});
