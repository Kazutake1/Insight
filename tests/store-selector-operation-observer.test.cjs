const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
function harness(options={}){
  const samples=[],listeners={};
  const select={value:'a',addEventListener(event,fn){listeners[event]=fn;}};
  const doc={getElementById(id){return id==='storeSel'?select:null;},
    addEventListener(){},querySelectorAll(){return [];}};
  const allStores={current:'a',stores:{a:{},b:{},c:{}}};
  const window={document:doc,switchStore(target){
    samples.push('core:'+target);
    allStores.current=target;
    return target;
  }};
  if(options.switchStore)window.switchStore=options.switchStore({window,allStores,samples});
  const ctx={window,globalThis:window,allStores,Object,Array,Number,String,console};
  vm.createContext(ctx);
  vm.runInContext(read('insight_payload_bindings_v1.js'),ctx);
  if(!options.missing)vm.runInContext(read('insight_operation_observer_v0.js'),ctx);
  function trigger(target){select.value=target;return listeners.change({currentTarget:select});}
  return {window,ctx,allStores,samples,trigger,select};
}
test('SS01 FICTIONAL selector invokes the effective nested wrapper chain once while ACTIVE',()=>{
  let h;
  h=harness({switchStore:({window,allStores,samples})=>{
    return target=>{
      samples.push('outer:'+window.InsightStoreSelectorObserverV0.getStatus().state);
      samples.push('inner:'+window.InsightStoreSelectorObserverV0.getStatus().activeCount);
      allStores.current=target;
      samples.push('render:'+window.InsightStoreSelectorObserverV0.getStatus().state);
      return 29;
    };
  }});
  const api=h.window.InsightStoreSelectorObserverV0;
  const before=api.getStatus();assert.equal(before.state,'IDLE_OBSERVED');
  assert.equal(h.trigger('b'),29);
  assert.deepEqual(h.samples,['outer:ACTIVE','inner:1','render:ACTIVE']);
  const end=api.getStatus();
  assert.equal(end.state,'IDLE_OBSERVED');
  assert.equal(end.activeCount,0);
  assert.equal(end.epoch,before.epoch+2);
  assert.deepEqual(Object.keys(end).sort(),['activeCount','epoch','scope','state']);
  assert.equal(end.scope,'store-selector-change-sync-chain-only');
  assert.equal(Object.isFrozen(end),true);
});
test('SS02 FICTIONAL same store/invalid target does not register a new operation',()=>{
  const h=harness(),api=h.window.InsightStoreSelectorObserverV0;
  const before=api.getStatus();
  h.trigger('a');h.trigger('bad');
  assert.equal(api.getStatus().epoch,before.epoch);
  assert.equal(h.allStores.current,'bad'); // A synthetic handler, not the real app validation.
  assert.deepEqual(h.samples,['core:a','core:bad']);
});
test('SS03 FICTIONAL cancelled dirty confirmation leaves conservative HELD, no mutation',()=>{
  let saves=0;
  const h=harness({switchStore:()=>()=>{saves++;return undefined;}});
  assert.equal(h.trigger('b'),undefined);
  assert.equal(saves,1);
  assert.equal(h.allStores.current,'a');
  assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().state,'HELD');
});
test('SS04 FICTIONAL postcommit and render errors keep original throw identity and HELD',()=>{
  for(const stage of ['persist','render']){
    const error=new Error('FICTIONAL '+stage+' exception');
    const h=harness({switchStore:({allStores})=>target=>{
      allStores.current=target;throw error;
    }});
    assert.throws(()=>h.trigger('b'),e=>e===error);
    assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().state,'HELD');
    assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().activeCount,0);
  }
});
test('SS05 FICTIONAL observer missing and broken never blocks original UI action',()=>{
  for(const stage of ['missing','factory','begin','end','status']){
    let calls=0;
    const h=harness({missing:true,switchStore:({allStores})=>id=>{calls++;allStores.current=id;return 99;}});
    if(stage!=='missing')h.window.InsightOperationObserverV0={createOperationObserver(){
      if(stage==='factory')throw Error('factory');
      let epoch=1,count=0;
      return {initialize(){return true;},invalidate(){},
        begin(){if(stage==='begin')throw Error('begin');count++;epoch++;return {};},
        end(){count--;epoch++;if(stage==='end')throw Error('end');return true;},
        status(){if(stage==='status')throw Error('status');
          return {scope:'registered-operations-only',state:count?'ACTIVE':'IDLE_OBSERVED',activeCount:count,epoch};}};
    }};
    assert.equal(h.trigger('b'),99);
    assert.equal(calls,1);
    assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().state,stage==='missing'?'UNAVAILABLE':'HELD');
  }
});
test('SS06 FICTIONAL nested selector events count 1→2→1 without changing return',()=>{
  let h,nested=false;
  const counts=[];
  h=harness({switchStore:({allStores})=>id=>{
    counts.push(h.window.InsightStoreSelectorObserverV0.getStatus().activeCount);
    if(!nested){nested=true;h.trigger('c');counts.push(h.window.InsightStoreSelectorObserverV0.getStatus().activeCount);}
    allStores.current=id;return id;
  }});
  assert.equal(h.trigger('b'),'b');
  assert.deepEqual(counts,[1,2,1]);
  assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().state,'IDLE_OBSERVED');
});
test('SS07 FICTIONAL late factory after unobserved operation stays UNAVAILABLE',()=>{
  const h=harness({missing:true,switchStore:({allStores,window})=>id=>{
    allStores.current=id;
    vm.runInContext(read('insight_operation_observer_v0.js'),h.ctx);
    assert.equal(window.InsightStoreSelectorObserverV0.getStatus().state,'UNAVAILABLE');
    return 5;
  }});
  assert.equal(h.trigger('b'),5);
  assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().state,'UNAVAILABLE');
  assert.equal(h.trigger('c'),5);
  assert.equal(h.window.InsightStoreSelectorObserverV0.getStatus().state,'UNAVAILABLE');
});
