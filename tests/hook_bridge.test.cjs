const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function setup(options={}){
  const calls=[];
  const window={
    renderQuickPage(){calls.push('base:quick-render');return 'rendered';},
    saveQuick(){calls.push('base:quick-save');return 'saved';},
    renderKPI(){calls.push('base:kpi');},
    renderDerived(){calls.push('base:derived');},
    refreshDash(){calls.push('base:refresh');},
    renderTable(type){calls.push('base:table:'+type);},
    saveInput(type){calls.push('base:input-save:'+type);return true;},
    renderAIAnalysisPanel(){calls.push('base:ai-render');},
    buildAIQuestionAnswer(q){calls.push('base:question:'+q);return 'base-answer';},
    InsightDateContext:{withLegacyGlobals(fn){calls.push('date:enter');try{return fn();}finally{calls.push('date:exit');}}}
  };
  if(options.saveQuick)window.saveQuick=options.saveQuick;
  if(options.saveInput)window.saveInput=options.saveInput;
  const context={window,globalThis:window,Object,Array,Number,String,console};
  vm.createContext(context);
  vm.runInContext(read('insight_hooks_v1.js'),context);
  return {window,calls,context};
}

test('高頻度コア関数はhook bridgeだけが1回ラップする',()=>{
  const {window}=setup();
  for(const name of ['renderQuickPage','saveQuick','renderKPI','renderDerived','refreshDash','renderTable','saveInput','renderAIAnalysisPanel','buildAIQuestionAnswer']){
    assert.equal(window[name].__insightHookBridge,true,name+' is not bridged');
    assert.equal(typeof window.InsightHooks.originals[name],'function',name+' original missing');
  }
});

test('quick renderは日付Context内でbase→priority順hookを実行する',()=>{
  const {window,calls}=setup();
  window.InsightHooks.on('quick:render:after','late',()=>calls.push('hook:late'),50);
  window.InsightHooks.on('quick:render:after','early',()=>calls.push('hook:early'),10);
  assert.equal(window.renderQuickPage(),'rendered');
  assert.deepEqual(calls,['date:enter','base:quick-render','hook:early','hook:late','date:exit']);
});

test('save before hookはbase実行を中止できる',()=>{
  const {window,calls}=setup();
  window.InsightHooks.on('quick:save:before','validate',ctx=>{calls.push('validate');ctx.result='blocked';ctx.cancel=true;return false;},10);
  window.InsightHooks.on('quick:save:after','after',()=>calls.push('after'),10);
  assert.equal(window.saveQuick(),'blocked');
  assert.deepEqual(calls,['date:enter','validate','date:exit']);
});

test('after hookはAI質問結果を拡張できる',()=>{
  const {window,calls}=setup();
  window.InsightHooks.on('ai:question:after','append',ctx=>{ctx.result+=' + extra';},20);
  assert.equal(window.buildAIQuestionAnswer('売上'),'base-answer + extra');
  assert.deepEqual(calls,['base:question:売上']);
});

test('処理済みAIパネルはbaseを呼ばず必要なafter hookだけ継続できる',()=>{
  const {window,calls}=setup();
  window.InsightHooks.on('ai:render:before','handled',ctx=>{calls.push('handled');ctx.result='handled';ctx.afterOnCancel=true;ctx.cancel=true;return false;},10);
  window.InsightHooks.on('ai:render:after','append',()=>calls.push('append'),20);
  assert.equal(window.renderAIAnalysisPanel(),'handled');
  assert.deepEqual(calls,['handled','append']);
});

test('互換コア以外のfeature moduleが対象コア関数を直接上書きしない',()=>{
  const watched=['renderQuickPage','saveQuick','renderKPI','renderDerived','refreshDash','renderTable','saveInput','renderAIAnalysisPanel','buildAIQuestionAnswer'];
  const files=fs.readdirSync(root).filter(name=>/^insight_.*\.js$/.test(name)&&name!=='insight_hooks_v1.js'&&name!=='insight_ai_compat_core_v1.js');
  const offenders=[];
  files.forEach(name=>{
    const source=read(name);
    watched.forEach(fn=>{
      const re=new RegExp('(?:window|root)\\.'+fn+'\\s*=\\s*function');
      if(re.test(source))offenders.push(name+':'+fn);
    });
  });
  assert.deepEqual(offenders,[]);
});

test('選択日クリア処理はquick date navigationだけが所有する',()=>{
  assert.doesNotMatch(read('insight_preserve_dailyops_v1.js'),/window\.clearTodayData\s*=/);
  assert.match(read('insight_quick_date_nav_v1.js'),/window\.clearTodayData\s*=/);
});

test('STEP4対象機能はhooksへ登録されている',()=>{
  const expected={
    'insight_ops_v1.js':['quick:render:after','quick:save:before','quick:save:after','dashboard:refresh:after'],
    'insight_temperature_v1.js':['quick:render:after','quick:save:before','quick:save:after'],
    'insight_events_v1.js':['quick:render:after','ai:render:after','ai:question:before'],
    'insight_dashboard_kpi_sync_v1.js':['dashboard:kpi:after','dashboard:derived:after','dashboard:refresh:after'],
    'insight_waste_insights_v1.js':['input:table:after','input:save:after'],
    'insight_ai_ops_v1.js':['ai:render:before','ai:render:after','ai:question:before','ai:question:after']
  };
  Object.keys(expected).forEach(name=>{
    const source=read(name);
    expected[name].forEach(event=>assert.ok(source.includes("'"+event+"'"),name+' missing '+event));
  });
});

function observedSetup(options={}){
  const h=setup(options);
  // Real loader order: bridge first, observer factory later.
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'UNAVAILABLE');
  vm.runInContext(read('insight_operation_observer_v0.js'),h.context);
  return h;
}

test('QS01 FICTIONAL actual bridge observes core and all synchronous after hooks',()=>{
  let h;
  h=observedSetup({saveQuick(){
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'ACTIVE');
    h.calls.push('core');return 'unchanged';
  }});
  h.window.InsightHooks.on('quick:save:after','first',()=>{
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().activeCount,1);
    h.calls.push('after20');
  },20);
  h.window.InsightHooks.on('quick:save:after','last',()=>{
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'ACTIVE');
    h.calls.push('after40');
  },40);
  assert.equal(h.window.saveQuick(),'unchanged');
  assert.deepEqual(h.calls,['date:enter','core','after20','after40','date:exit']);
  const s=h.window.InsightQuickSaveObserverV0.getStatus();
  assert.equal(s.state,'IDLE_OBSERVED');
  assert.equal(s.activeCount,0);
  assert.deepEqual(Object.keys(s).sort(),['activeCount','epoch','scope','state']);
  assert.equal(Object.isFrozen(s),true);
});

test('QS02 FICTIONAL validation cancellation issues no save token',()=>{
  const h=observedSetup();
  const before=h.window.InsightQuickSaveObserverV0.getStatus();
  h.window.InsightHooks.on('quick:save:before','cancel',ctx=>{ctx.result='cancelled';return false;},10);
  assert.equal(h.window.saveQuick(),'cancelled');
  const after=h.window.InsightQuickSaveObserverV0.getStatus();
  assert.equal(after.epoch,before.epoch);
  assert.equal(after.activeCount,0);
  assert.deepEqual(h.calls,['date:enter','date:exit']);
});

test('QS03 FICTIONAL original and after-hook exceptions preserve identity and hold',()=>{
  for(const stage of ['core','after']){
    const original=new Error('FICTIONAL private failure');
    const h=observedSetup(stage==='core'?{saveQuick(){throw original;}}:{});
    if(stage==='after')h.window.InsightHooks.on('quick:save:after','throw',()=>{throw original;},20);
    assert.throws(()=>h.window.saveQuick(),e=>e===original);
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'HELD');
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().activeCount,0);
  }
});

test('QS04 FICTIONAL handled temperature persist failure is HELD despite normal return',()=>{
  const h=observedSetup();
  const alerts=[];
  Object.assign(h.context,{
    document:{getElementById(){return null;}},
    store:{data:{2026:{'10月':[{}]}}},
    allStores:{stores:{}},
    alert:value=>alerts.push(value),
    persist(){throw new Error('FICTIONAL temperature persistence failure');}
  });
  h.window.InsightDateContext.getSelectedInfo=()=>({fy:'2026',month:'10月',day:1});
  h.window.InsightDateContext.isFuture=()=>false;
  vm.runInContext(read('insight_temperature_v1.js'),h.context);
  assert.equal(h.window.saveQuick(),'saved');
  assert.equal(alerts.length,1);
  assert.match(alerts[0],/気温データを保存できませんでした/);
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'HELD');
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().activeCount,0);
  h.context.persist=()=>{};
  assert.equal(h.window.saveQuick(),'saved');
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'HELD');
});

test('QS05 FICTIONAL missing or broken observer cannot block or repeat the original save',()=>{
  for(const stage of ['missing','factory','begin','end','status']){
    let saves=0;
    const h=setup({saveQuick(){saves++;return 19;}});
    if(stage!=='missing'){
      h.window.InsightOperationObserverV0={createOperationObserver(){
        if(stage==='factory')throw Error('factory');
        let count=0,epoch=1;
        return {initialize(){return true;},invalidate(){},begin(){
          if(stage==='begin')throw Error('begin');
          count++;epoch++;return {};
        },end(){count--;epoch++;if(stage==='end')throw Error('end');return true;},
        status(){
          if(stage==='status')throw Error('status');
          return {scope:'registered-operations-only',state:count?'ACTIVE':'IDLE_OBSERVED',activeCount:count,epoch};
        }};
      }};
    }
    assert.equal(h.window.saveQuick(),19);
    assert.equal(saves,1);
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,stage==='missing'?'UNAVAILABLE':'HELD');
  }
});

test('QS06 FICTIONAL nested Quick saves keep the outer operation active',()=>{
  const h=observedSetup();
  let nested=false;
  const counts=[];
  h.window.InsightHooks.on('quick:save:after','reenter',()=>{
    counts.push(h.window.InsightQuickSaveObserverV0.getStatus().activeCount);
    if(!nested){nested=true;h.window.saveQuick();counts.push(h.window.InsightQuickSaveObserverV0.getStatus().activeCount);}
  },20);
  h.window.saveQuick();
  assert.deepEqual(counts,[1,2,1]);
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().activeCount,0);
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'IDLE_OBSERVED');
});

test('QS07 FICTIONAL after-hook cancellation is conservatively HELD',()=>{
  const h=observedSetup();
  h.window.InsightHooks.on('quick:save:after','stop',()=>false,20);
  assert.equal(h.window.saveQuick(),'saved');
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'HELD');
});

test('QS08 FICTIONAL factory appearing mid-save cannot upgrade an unobserved operation to IDLE',()=>{
  let h;
  const factory=require('../insight_operation_observer_v0.js');
  h=setup({saveQuick(){
    h.window.InsightOperationObserverV0=factory;
    assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'UNAVAILABLE');
    return 23;
  }});
  assert.equal(h.window.saveQuick(),23);
  assert.equal(h.window.InsightQuickSaveObserverV0.getStatus().state,'UNAVAILABLE');
});


test('IS01 FICTIONAL real saveInput bridge encloses core and ordered after hooks for three types',()=>{
  for(const type of ['sales','kyaku','haiki']){
    let h;
    h=observedSetup({saveInput(value){
      assert.equal(value,type);
      assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'ACTIVE');
      h.calls.push('core:'+value);
      return 42;
    }});
    h.window.InsightHooks.on('input:save:before','before',()=>h.calls.push('before'),10);
    h.window.InsightHooks.on('input:save:after','restore',()=>{
      const s=h.window.InsightInputSaveObserverV0.getStatus();
      assert.equal(s.activeCount,1);
      h.calls.push('after20');
    },20);
    h.window.InsightHooks.on('input:save:after','insights',()=>{
      assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'ACTIVE');
      h.calls.push('after40');
    },40);
    assert.equal(h.window.saveInput(type),42);
    assert.deepEqual(h.calls,['before','core:'+type,'after20','after40']);
    const s=h.window.InsightInputSaveObserverV0.getStatus();
    assert.deepEqual(Object.keys(s).sort(),['activeCount','epoch','scope','state']);
    assert.equal(s.scope,'input-month-save-core-and-sync-after-hooks-only');
    assert.equal(s.state,'IDLE_OBSERVED');
    assert.equal(s.activeCount,0);
    assert.equal(Object.isFrozen(s),true);
  }
});

test('IS02 FICTIONAL cancelled before hook never issues a save token',()=>{
  const h=observedSetup();
  const before=h.window.InsightInputSaveObserverV0.getStatus();
  h.window.InsightHooks.on('input:save:before','cancel',ctx=>{
    ctx.result='FICTIONAL stopped';return false;
  },5);
  assert.equal(h.window.saveInput('sales'),'FICTIONAL stopped');
  assert.equal(h.window.InsightInputSaveObserverV0.getStatus().epoch,before.epoch);
  assert.equal(h.window.InsightInputSaveObserverV0.getStatus().activeCount,0);
  assert.deepEqual(h.calls,[]);
});

test('IS03 FICTIONAL core and after errors retain the exact original exception and hold',()=>{
  for(const stage of ['core','after']){
    const error=new Error('FICTIONAL input save failure');
    const h=observedSetup(stage==='core'?{saveInput(){throw error;}}:{});
    if(stage==='after')h.window.InsightHooks.on('input:save:after','throw',()=>{throw error;},20);
    assert.throws(()=>h.window.saveInput('sales'),e=>e===error);
    const s=h.window.InsightInputSaveObserverV0.getStatus();
    assert.equal(s.state,'HELD');
    assert.equal(s.activeCount,0);
  }
});

test('IS04 FICTIONAL observer missing or broken cannot prevent/retry original input saving',()=>{
  for(const stage of ['missing','factory','begin','end','status']){
    let saves=0;
    const h=setup({saveInput(){saves++;return 77;}});
    if(stage!=='missing'){
      h.window.InsightOperationObserverV0={createOperationObserver(){
        if(stage==='factory')throw Error('FICTIONAL factory failure');
        let count=0,epoch=1;
        return {initialize(){return true;},invalidate(){return true;},
          begin(){if(stage==='begin')throw Error('FICTIONAL begin');count++;epoch++;return {};},
          end(){count--;epoch++;if(stage==='end')throw Error('FICTIONAL end');return true;},
          status(){if(stage==='status')throw Error('FICTIONAL status');
            return {scope:'registered-operations-only',state:count?'ACTIVE':'IDLE_OBSERVED',activeCount:count,epoch};}};
      }};
    }
    assert.equal(h.window.saveInput('haiki'),77);
    assert.equal(saves,1);
    assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,stage==='missing'?'UNAVAILABLE':'HELD');
  }
});

test('IS05 FICTIONAL reentry counts 1 to 2 to 1, and after cancellation remains HELD',()=>{
  const h=observedSetup();
  let nested=false;
  const counts=[];
  h.window.InsightHooks.on('input:save:after','nested',()=>{
    counts.push(h.window.InsightInputSaveObserverV0.getStatus().activeCount);
    if(!nested){
      nested=true;h.window.saveInput('sales');
      counts.push(h.window.InsightInputSaveObserverV0.getStatus().activeCount);
    }
  },20);
  h.window.saveInput('sales');
  assert.deepEqual(counts,[1,2,1]);
  assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'IDLE_OBSERVED');
  h.window.InsightHooks.on('input:save:after','cancel',()=>false,40);
  h.window.saveInput('sales');
  assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'HELD');
});

test('IS06 FICTIONAL late factory cannot upgrade a previously unobserved save',()=>{
  let h;
  const factory=require('../insight_operation_observer_v0.js');
  h=setup({saveInput(){
    h.window.InsightOperationObserverV0=factory;
    assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'UNAVAILABLE');
    return 23;
  }});
  assert.equal(h.window.saveInput('sales'),23);
  assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'UNAVAILABLE');
  assert.equal(h.window.saveInput('unknown'),23);
  assert.equal(h.window.InsightInputSaveObserverV0.getStatus().state,'UNAVAILABLE');
});
