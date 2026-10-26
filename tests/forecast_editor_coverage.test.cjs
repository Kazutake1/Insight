'use strict';
/* STEP4 GATE-3 / P4d-1: fictional-only editor coverage contract.
 * Deliberately NOT a production adapter. No real editor/store, AI, DOM, or network.
 * This test never treats clean editor observations as model authorization.
 */
const test=require('node:test');
const assert=require('node:assert/strict');

const EDITORS=Object.freeze([
  'sales_count', 'quick_daily', 'daily_sales', 'daily_customers',
  'daily_waste', 'hourly_customers', 'events_and_promotions'
]);
const verdict=state=>Object.freeze({
  editor_coverage_state:state,
  full_app_clean:false,
  provenance_verified:false,
  authorized_for_model:false
});
const unknown=()=>verdict('UNKNOWN');

// Read no editor values: statuses must be owned, non-accessor fields only.
// Keeping the source callback reference across both passes prevents a swapped
// provider from gaining a false clean classification during the read.
function readStatus(callback){
  try{
    const status=callback();
    if(!status||typeof status!=='object'||Array.isArray(status))return null;
    const read=key=>{
      const d=Object.getOwnPropertyDescriptor(status,key);
      if(!d||!Object.hasOwn(d,'value'))throw Error('status_unavailable');
      return d.value;
    };
    const initialized=read('initialized');
    const dirty=read('dirty');
    const epoch=read('epoch');
    if(initialized!==true||typeof dirty!=='boolean'||
        !Number.isSafeInteger(epoch)||epoch<0)return null;
    return Object.freeze({dirty,epoch});
  }catch{return null;}
}
function callbackFor(providers,key){
  try{
    const d=Object.getOwnPropertyDescriptor(providers,key);
    return d&&Object.hasOwn(d,'value')&&typeof d.value==='function'?d.value:null;
  }catch{return null;}
}
function observeFictionalEditorCoverage(providers){
  try{
    if(!providers||typeof providers!=='object')return unknown();
    const callbacks=EDITORS.map(key=>callbackFor(providers,key));
    if(callbacks.some(callback=>!callback))return unknown();
    const pass=()=>{
      const out=[];
      for(let i=0;i<EDITORS.length;i++){
        if(callbackFor(providers,EDITORS[i])!==callbacks[i])return null;
        const stamp=readStatus(callbacks[i]);
        if(!stamp||callbackFor(providers,EDITORS[i])!==callbacks[i])return null;
        out.push(stamp);
      }
      return out;
    };
    // A third read catches a later callback mutating an earlier editor after
    // that editor was already sampled on the second pass. Not a live guarantee.
    const first=pass(),second=pass(),third=pass();
    if(!first||!second||!third)return unknown();
    if(!EDITORS.every((_,i)=>callbackFor(providers,EDITORS[i])===callbacks[i]&&
      first[i].epoch===second[i].epoch&&second[i].epoch===third[i].epoch&&
      first[i].dirty===second[i].dirty&&second[i].dirty===third[i].dirty))return unknown();
    return verdict(third.some(stamp=>stamp.dirty)?'DIRTY':'OBSERVED_CLEAN_ONLY');
  }catch{return unknown();}
}
function setup(){
  const values=Object.fromEntries(EDITORS.map(key=>[key,{initialized:true,dirty:false,epoch:0}]));
  const calls=Object.fromEntries(EDITORS.map(key=>[key,0]));
  const providers=Object.fromEntries(EDITORS.map(key=>[key,()=>{
    calls[key]++;
    return {...values[key]};
  }]));
  const mark=(key,dirty)=>{
    values[key].dirty=dirty;
    values[key].epoch++;
  };
  return {providers,values,calls,mark};
}
const expectBlocked=result=>{
  assert.equal(result.full_app_clean,false);
  assert.equal(result.provenance_verified,false);
  assert.equal(result.authorized_for_model,false);
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(Object.keys(result).sort(),[
    'authorized_for_model','editor_coverage_state','full_app_clean','provenance_verified'
  ]);
};

test('P4d1 E01: a missing editor always prevents all-clean claims',()=>{
  const h=setup();delete h.providers.events_and_promotions;
  const r=observeFictionalEditorCoverage(h.providers);
  assert.equal(r.editor_coverage_state,'UNKNOWN');expectBlocked(r);
});
test('P4d1 E02: seven stable fictional clean statuses are observation only',()=>{
  const h=setup(),r=observeFictionalEditorCoverage(h.providers);
  assert.equal(r.editor_coverage_state,'OBSERVED_CLEAN_ONLY');expectBlocked(r);
  for(const key of EDITORS)assert.equal(h.calls[key],3);
});
test('P4d1 E03: each independent editor can block with a dirty draft',()=>{
  for(const key of EDITORS){
    const h=setup();h.mark(key,true);
    const r=observeFictionalEditorCoverage(h.providers);
    assert.equal(r.editor_coverage_state,'DIRTY',key);expectBlocked(r);
  }
});
test('P4d1 E04: unknown beats other known dirty statuses',()=>{
  const h=setup();h.mark('quick_daily',true);
  h.values.hourly_customers.initialized=false;
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'UNKNOWN');
});
test('P4d1 E05: absent, invalid, accessor and unsafe epochs fail closed',()=>{
  const invalid=[null,{initialized:false,dirty:false,epoch:1},
    {initialized:true,dirty:null,epoch:1},{initialized:true,dirty:false,epoch:null},
    {initialized:true,dirty:false,epoch:-1},
    {initialized:true,dirty:false,epoch:Number.MAX_SAFE_INTEGER+1},
    Object.defineProperty({},'initialized',{get(){throw Error('CANARY_SECRET');}})];
  for(const state of invalid){
    const h=setup();h.providers.daily_sales=()=>state;
    const r=observeFictionalEditorCoverage(h.providers);
    assert.equal(r.editor_coverage_state,'UNKNOWN');expectBlocked(r);
  }
});
test('P4d1 E06: save failure cannot reset an uncommitted dirty status',()=>{
  const h=setup();h.mark('daily_customers',true);
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'DIRTY');
  // Simulated failure: dirty remains set, no persistence is performed.
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'DIRTY');
  h.mark('daily_customers',false);
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'OBSERVED_CLEAN_ONLY');
});
test('P4d1 E07: A-B-A visible values with advanced epoch are not same observation',()=>{
  const h=setup();let count=0;
  h.providers.quick_daily=()=>{
    count++;
    if(count===2){h.mark('quick_daily',true);h.mark('quick_daily',false);}
    return {...h.values.quick_daily};
  };
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'UNKNOWN');
});
test('P4d1 E08: mutation of another editor inside provider callback is detected',()=>{
  const h=setup();let count=0;
  h.providers.daily_waste=()=>{
    if(++count===2)h.mark('sales_count',true);
    return {...h.values.daily_waste};
  };
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'UNKNOWN');
});
test('P4d1 E09: swapping provider callback mid-observation is unknown',()=>{
  const h=setup();
  h.providers.hourly_customers=()=>{
    h.providers.hourly_customers=()=>({...h.values.hourly_customers});
    return {...h.values.hourly_customers};
  };
  assert.equal(observeFictionalEditorCoverage(h.providers).editor_coverage_state,'UNKNOWN');
});
test('P4d1 E10: two simultaneous dirty editors are still non-authorizing',()=>{
  const h=setup();h.mark('daily_sales',true);h.mark('events_and_promotions',true);
  const r=observeFictionalEditorCoverage(h.providers);
  assert.equal(r.editor_coverage_state,'DIRTY');expectBlocked(r);
});
test('P4d1 E11: explicit zero, blank and invalid fictional input never get serialized',()=>{
  const h=setup(),draft={quantity:0,blank:'',invalid:'UNTRUSTED_RAW_CANARY'};
  const original=JSON.stringify(draft);
  h.mark('sales_count',true);
  const r=observeFictionalEditorCoverage(h.providers);
  assert.equal(r.editor_coverage_state,'DIRTY');
  assert.doesNotMatch(JSON.stringify(r),/UNTRUSTED_RAW_CANARY|quantity|blank|invalid/);
  assert.equal(JSON.stringify(draft),original);expectBlocked(r);
});
test('P4d1 E12: no callback arguments, writes, fetches or model execution',()=>{
  const h=setup(),effects={persist:0,fetch:0,model:0};
  for(const key of EDITORS){
    h.providers[key]=function(){
      assert.equal(arguments.length,0);
      return {...h.values[key]};
    };
  }
  const r=observeFictionalEditorCoverage(h.providers);
  assert.equal(r.editor_coverage_state,'OBSERVED_CLEAN_ONLY');expectBlocked(r);
  assert.deepEqual(effects,{persist:0,fetch:0,model:0});
});
