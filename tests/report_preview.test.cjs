'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {reportFixture}=require('./report_fixture.cjs');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'insight_storage_v1.js'),'utf8');
const api=require('../insight_report_v1.js');
function setup(){
  const fixture=reportFixture(),values={insight_v11:JSON.stringify(fixture)},events=[],listeners={};let fail=false;
  const window={SK:'insight_v11',localStorage:{getItem:key=>values[key]??null,setItem(key,value){if(fail)throw Error('quota');values[key]=value;}},
    addEventListener:(name,fn)=>{listeners[name]=fn;},InsightReportPreview:{onStorageUpdate:e=>events.push(e)}};
  const context=vm.createContext({window,SK:'insight_v11',JSON,Error,console});
  vm.runInContext(source,context);
  return {window,storage:window.InsightStorage,fixture,values,events,listeners,fail:value=>{fail=value;}};
}
test('private write inside transaction notifies through full apply',()=>{
  const f=setup();const observations=[];
  f.window.InsightReportPreview.onStorageUpdate=e=>{f.events.push(e);observations.push(f.storage.reportState().pending);};
  f.storage.transaction(f.fixture,next=>{next.stores.store_a.data['2026']['10月'][18].売上=70;},null,()=>{
    assert.ok(f.storage.reportState().pending>0);assert.equal(f.events.filter(e=>e.phase==='finish').length,1);
  });
  assert.equal(f.events.filter(e=>e.phase==='begin').length,2);assert.equal(f.events.filter(e=>e.phase==='finish').length,2);
  assert.deepEqual(observations,[1,2,1,0]);assert.equal(f.storage.reportState().held,false);
});
test('notification exception never changes successful save or return',()=>{
  const f=setup();f.window.InsightReportPreview.onStorageUpdate=()=>{throw Error('observer');};
  assert.equal(f.storage.persistCurrent(f.fixture),true);
  assert.equal(JSON.parse(f.values.insight_v11).schemaVersion,1);assert.equal(f.storage.reportState().held,false);
});
test('serialization failure clears report and is held without writing',()=>{
  const f=setup(),raw=f.values.insight_v11;assert.throws(()=>f.storage.writeSnapshot({schemaVersion:99}),/新しいInsight/);
  assert.equal(f.values.insight_v11,raw);assert.equal(f.events[0].phase,'begin');
  assert.equal(f.storage.reportState().held,true);assert.equal(f.storage.reportState().pending,0);
});
test('quota failure preserves saved data and original error',()=>{
  const f=setup(),raw=f.values.insight_v11;f.fail(true);
  assert.throws(()=>f.storage.persistCurrent(f.fixture),/quota/);assert.equal(f.values.insight_v11,raw);
  assert.equal(f.storage.reportState().held,true);assert.equal(f.events.at(-1).outcome,'failed');
});
test('successful later write cannot acknowledge a reporting failure',()=>{
  const f=setup();f.fail(true);assert.throws(()=>f.storage.writeSnapshot(f.fixture));
  f.fail(false);f.storage.writeSnapshot(f.fixture);assert.equal(f.storage.reportState().held,true);
});
test('apply failure remains held after successful write',()=>{
  const f=setup();assert.throws(()=>f.storage.transaction(f.fixture,n=>{n.current='store_b';},null,()=>{throw Error('apply');}),/apply/);
  assert.equal(JSON.parse(f.values.insight_v11).current,'store_b');assert.equal(f.storage.reportState().held,true);
});
test('metadata only invalidates reports for main data key',()=>{
  const f=setup();f.storage.writeMetadata('insight_dark','1');assert.equal(f.events.length,0);
  f.storage.writeMetadata('insight_v11',f.values.insight_v11);assert.deepEqual(f.events.map(e=>e.phase),['begin','finish']);
});
test('external data and clear notify without changing save conflict behavior',()=>{
  for(const key of ['insight_v11',null]){
    const f=setup();f.listeners.storage({key,newValue:null});assert.equal(f.events[0].phase,'external');
    assert.equal(f.storage.reportState().conflict,true);assert.throws(()=>f.storage.writeSnapshot(f.fixture),e=>e.name==='InsightStorageConflictError');
  }
});
test('unrelated external metadata leaves reports alone',()=>{
  const f=setup();f.listeners.storage({key:'insight_dark',newValue:'1'});assert.equal(f.events.length,0);assert.equal(f.storage.reportState().conflict,false);
});
test('unnotified raw changes cannot be acknowledged by readSnapshot',()=>{
  const f=setup();f.values.insight_v11+=' ';f.storage.readSnapshot();assert.equal(f.storage.reportState().conflict,true);
});
test('configured report is read only and retains unknown zero',()=>{
  const f=setup(),before=f.values.insight_v11;
  const h=api.createSavedHost({revision:'integration-test',stores:[{id:'store_a',name:'架空店舗A'},{id:'store_b',name:'架空店舗B'}]});
  const request={store_id:'store_a',period:{start:'2026-10-19',end:'2026-10-19'},reference:{start:'2026-10-12',end:'2026-10-12'},
    quantity_day:'2026-10-19',quantity_reference:{start:'2026-09-28',end:'2026-09-29'},category_id:'food',as_of:'2026-10-20',
    comparison_confirmed:false,request_id:'integration-test',data_revision:'0'};
  assert.equal(h.capture(()=>f.values.insight_v11,()=>JSON.stringify(request)),true);
  assert.equal(h.getState().report.kpis[0].current.value,80000);assert.equal(h.getState().report.kpis[1].current.value,null);
  assert.match(h.getState().text,/日合計0個で確定/);assert.match(h.getState().text,/判定できません/);
  assert.equal(f.values.insight_v11,before);assert.equal(f.events.length,0);
});
test('preview and core add no outbound API or report persistence calls',()=>{
  for(const name of ['insight_report_v1.js','insight_report_preview_v1.js']){
    const text=fs.readFileSync(path.join(root,name),'utf8');
    assert.doesNotMatch(text,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.setItem|console\.(log|warn|error)\s*\(/);
  }
});
