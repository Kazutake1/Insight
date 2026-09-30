const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function setup(){
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
  const context={window,globalThis:window,Object,Array,Number,String,console};
  vm.createContext(context);
  vm.runInContext(read('insight_hooks_v1.js'),context);
  return {window,calls};
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

test('対象コア関数をfeature moduleが直接上書きしない',()=>{
  const watched=['renderQuickPage','saveQuick','renderKPI','renderDerived','refreshDash','renderTable','saveInput','renderAIAnalysisPanel','buildAIQuestionAnswer'];
  const files=fs.readdirSync(root).filter(name=>/^insight_.*\.js$/.test(name)&&name!=='insight_hooks_v1.js');
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
