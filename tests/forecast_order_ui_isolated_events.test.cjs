'use strict';
/*
 * STEP4 G1/G2/G8/G9: execute the ORIGINAL order-forecast UI event handlers
 * and ORIGINAL InsightStorage in a fully isolated Node VM with fabricated data.
 *
 * These tests intentionally document the ABSENT production coordinator wiring.
 * They neither patch original modules nor authorize a real-data Reader/AI model.
 * No real browser, localStorage, network, deployed page, or actual iPad is used.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createFixtureCapturePreflight}=require('../insight_forecast_fixture_capture_preflight_v0.js');
const sourceFile=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

function fakeElement(tag,registry){
  const values=[];
  const css=new Set();
  const node={
    tagName:tag,id:'',value:'',textContent:'',className:'',dataset:{},style:{},
    children:values,hidden:false,disabled:false,
    classList:{
      add(name){css.add(name);},
      remove(name){css.delete(name);},
      contains(name){return css.has(name);}
    },
    append(...children){values.push(...children);},
    appendChild(child){values.push(child);return child;},
    replaceChildren(...children){values.splice(0,values.length,...children);},
    insertAdjacentElement(_where,other){return other;},
    setAttribute(name,value){this[name]=String(value);},
    querySelector(_query){return {after() {}};},
    after(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}
  };
  registry.push(node);
  return node;
}
function isolatedUI(){
  const elements=new Map(),created=[],listeners=new Map(),storeEvents=[];
  const known=['navSaleResults','main','ofDelivery','ofCategory','ofPreviousYear',
    'ofYearCards','ofWeekCards','ofRecentCards','ofRecentEmpty','ofWeather',
    'ofWeatherStatus','ofRefresh','storeSel'];
  for(const id of known){const node=fakeElement('div',created);node.id=id;elements.set(id,node);}
  const sidebar=fakeElement('div',created);
  const doc={
    readyState:'loading',
    head:fakeElement('head',created),
    getElementById(id){return elements.get(id)||null;},
    querySelector(query){return query==='#sidebar .nav-list'?sidebar:null;},
    querySelectorAll(query){
      if(query==='.nav-btn')return created.filter(n=>n.className.split(/\s+/).includes('nav-btn'));
      if(query==='.page')return created.filter(n=>n.className.split(/\s+/).includes('page'));
      return [];
    },
    createElement(tag){return fakeElement(tag,created);},
    createElementNS(_ns,tag){return fakeElement(tag,created);},
    addEventListener(event,handler){listeners.set(event,handler);}
  };
  const categoryA={id:'fictional_rice',name:'架空米飯',hidden:false,activeTrips:[true,false,false]};
  const categoryB={id:'fictional_bread',name:'架空パン',hidden:false,activeTrips:[true,false,false]};
  const data={
    schemaVersion:1,current:'lab_a',
    salesCountManagement:{categories:[categoryA,categoryB]},
    stores:{
      lab_a:{salesCounts:{},data:{},weatherLocation:null,marker:0},
      lab_b:{salesCounts:{},data:{},weatherLocation:null,marker:0}
    }
  };
  const sandboxStorage=new Map([['insight_v11',JSON.stringify(data)]]);
  const requests=[];
  const root={
    SK:'insight_v11',document:doc,allStores:data,
    localStorage:{
      getItem(key){return sandboxStorage.has(key)?sandboxStorage.get(key):null;},
      setItem(key,val){sandboxStorage.set(key,String(val));}
    },
    addEventListener(event,handler){storeEvents.push([event,handler]);},
    fetch(url){requests.push(url);return Promise.reject(new Error('SYNTHETIC_OFFLINE_ONLY'));},
    InsightSalesCount:{
      activeTrips(c){return c.activeTrips;},
      normalizeRecord(){return {trips:[{delivery:null,sales:null}]};},
      createReadOnlyDayCard(){return fakeElement('article',created);},
      createAverageCard(){return fakeElement('article',created);},
      wasteRecordAt(){return null;},
      average(){return null;}
    },
    InsightTripHistoryResolver:{
      resolveDate(){return {mask:[true,false,false]};},
      averageByDate(){return null;}
    },
    InsightEvents:{list(){return [];}},
    currentNav:'dashboard',
    gotoNav(target){root.currentNav=target;},
    switchStore(id){root.allStores.current=id;}
  };
  const ctx=vm.createContext({
    window:root,globalThis:root,document:doc,
    allStores:data,SK:'insight_v11',
    console:{warn(){},log(){},error(){},info(){}},
    currentNav:'dashboard',
    setTimeout(fn){return 1;},clearTimeout(){},
    // Any attempted HTTP request is intercepted by root.fetch, never sent.
    Error,Promise,Array,Object,Map,Set,Number,Boolean,String,JSON,Date,Intl
  });
  // The original navigation helpers run in vm global scope (not host root).
  ctx.gotoNav=function(target){ctx.currentNav=target;};
  ctx.switchStore=function(id){data.current=id;};
  root.gotoNav=ctx.gotoNav;
  root.switchStore=ctx.switchStore;
  vm.runInContext(sourceFile('insight_storage_v1.js'),ctx,{filename:'insight_storage_v1.js'});
  vm.runInContext(sourceFile('insight_order_forecast_v1.js'),ctx,{filename:'insight_order_forecast_v1.js'});
  const ready=listeners.get('DOMContentLoaded');
  assert.equal(typeof ready,'function','actual UI initializer must be registered');
  ready();
  assert.equal(typeof elements.get('ofDelivery').onchange,'function');
  assert.equal(typeof elements.get('ofCategory').onchange,'function');
  assert.equal(typeof elements.get('ofRefresh').onclick,'function');
  // Deliberately exercise original screen navigation and render logic.
  root.gotoNav('orderForecast');
  const model=root.InsightOrderForecast,storage=root.InsightStorage;
  const versions={weather:'fictional-weather-v1',calendar:'fictional-calendar-v1',
    registry:'fictional-registry-v1',policy:'fictional-policy-v1'};
  const gate=createFixtureCapturePreflight({
    fixture:true,
    inspect(){return {...storage.reportState(),versions:{...versions}};},
    readSaved(){return storage.readSnapshot();},
    readLive(){return data;},
    readSelection(){const s=model.getState();return {
      store_id:s.storeId,category_id:s.categoryId,trip:1,delivery:s.delivery};}
  });
  gate.event('auto-delivery'); // Test harness ONLY; app did not emit this event.
  const request=()=>{
    const s=model.getState();
    return {scope:{store_id:s.storeId,category_id:s.categoryId,trip:1},
      target_day:s.delivery,manual_target:false};
  };
  return {root,ctx,doc,data,storage,model,gate,request,versions,requests,elements,storeEvents,sandboxStorage};
}
test('U01: actual UI registers date/category/refresh handlers in isolated DOM',()=>{
  const f=isolatedUI();
  assert.equal(f.model.getState().storeId,'lab_a');
  assert.equal(f.model.getState().categoryId,'fictional_rice');
  assert.equal(f.elements.get('ofDelivery').value,f.model.getState().delivery);
  assert.equal(f.gate.capture(f.request()).ok,true);
  assert.equal(f.requests.every(url=>url.startsWith('https://www.jma.go.jp/bosai/')),true);
  // All fetch calls are rejected by an in-memory fake; no actual network request.
});
test('U02 G1: manually selecting the same displayed automatic day is not exposed by getState',()=>{
  const f=isolatedUI(),before=f.model.getState(),d=f.elements.get('ofDelivery');
  const ticket=f.gate.capture(f.request()).ticket;
  assert.equal(f.gate.isCurrent(ticket),true);
  d.value=before.delivery;d.onchange({target:d}); // the actual onChange
  const after=f.model.getState();
  assert.equal(after.delivery,before.delivery);
  assert.equal(after.manual_target,undefined);
  assert.equal(after.autoDelivery,undefined);
  assert.equal(f.gate.getEpoch(),1,'the original UI never signals the fixture coordinator');
  assert.equal(f.gate.isCurrent(ticket),true,
    'GAP: same-date manual intent cannot be detected from the public state');
  f.gate.event('delivery-manual'); // demonstration of required explicit wiring
  assert.equal(f.gate.isCurrent(ticket),false);
});
test('U03 G1: actual UI accepts a distinct date and rejects invalid calendar values',()=>{
  const f=isolatedUI(),d=f.elements.get('ofDelivery');
  d.value='2026-11-01';d.onchange({target:d});
  assert.equal(f.model.getState().delivery,'2026-11-01');
  const epoch=f.gate.getEpoch();
  assert.equal(epoch,1,'real date change does not emit an invalidate');
  d.value='2026-13-99';d.onchange({target:d});
  assert.equal(d.value,'2026-11-01');
  assert.equal(f.model.getState().delivery,'2026-11-01');
});
test('U04 G8: actual category A→B→A returns to the same state without an epoch change',()=>{
  const f=isolatedUI(),control=f.elements.get('ofCategory');
  const ticket=f.gate.capture(f.request()).ticket;
  control.value='fictional_bread';control.onchange({target:control});
  assert.equal(f.model.getState().categoryId,'fictional_bread');
  control.value='fictional_rice';control.onchange({target:control});
  assert.equal(f.model.getState().categoryId,'fictional_rice');
  assert.equal(f.gate.isCurrent(ticket),true,'GAP: no event bridge for A→B→A');
  f.gate.event('category');
  assert.equal(f.gate.isCurrent(ticket),false);
});
test('U05 G8: actual store A→B→A also lacks a request invalidation hook',()=>{
  const f=isolatedUI();
  const ticket=f.gate.capture(f.request()).ticket;
  f.root.switchStore('lab_b');
  assert.equal(f.model.getState().storeId,'lab_b');
  f.root.switchStore('lab_a');
  assert.equal(f.model.getState().storeId,'lab_a');
  assert.equal(f.gate.isCurrent(ticket),true,'GAP: restored state cannot prove intervening store switch');
  f.gate.event('store');
  assert.equal(f.gate.isCurrent(ticket),false);
});
test('U06 G8: actual page navigation away and back does not notify the capture gate',()=>{
  const f=isolatedUI(),ticket=f.gate.capture(f.request()).ticket;
  f.root.gotoNav('dashboard');
  f.root.gotoNav('orderForecast');
  assert.equal(f.ctx.currentNav,'orderForecast');
  assert.equal(f.gate.isCurrent(ticket),true,'GAP: page A→B→A is not wired');
  f.gate.event('page');
  assert.equal(f.gate.isCurrent(ticket),false);
});
test('U07 G8: original refresh click does not invalidate old inspection ticket',()=>{
  const f=isolatedUI(),ticket=f.gate.capture(f.request()).ticket;
  f.elements.get('ofRefresh').onclick();
  assert.equal(f.gate.isCurrent(ticket),true,'GAP: refresh lacks an invalidate callback');
  f.gate.event('refresh');
  assert.equal(f.gate.isCurrent(ticket),false);
});
test('U08 G2/G8: the original shared Storage revision is observed but UI writes are not linked',()=>{
  const f=isolatedUI(),ticket=f.gate.capture(f.request()).ticket;
  assert.equal(f.gate.isCurrent(ticket),true);
  const initial=f.storage.reportState().revision;
  const altered=JSON.parse(f.sandboxStorage.get('insight_v11'));
  altered.stores.lab_a.marker=1;
  // This calls the original Storage writer but never writes a real browser key.
  f.storage.writeSnapshot(altered);
  assert.ok(f.storage.reportState().revision>initial);
  assert.equal(f.gate.isCurrent(ticket),false,
    'fixture gate may observe revision changes even without a UI event hook');
  assert.equal(f.model.getState().storeId,'lab_a');
  assert.equal(f.root.localStorage.getItem('insight_v11'),JSON.stringify(altered));
});
test('U09: persisted-vs-unsaved divergence blocks capture in actual Storage VM',()=>{
  const f=isolatedUI();
  f.data.stores.lab_a.marker=7; // unsaved, isolated synthetic mutable allStores
  const result=f.gate.capture(f.request());
  assert.equal(result.ok,false);
  assert.equal(result.reason,'unsaved_live_data_mismatch');
  assert.equal(f.storage.reportState().revision,0,
    'real Storage revision cannot observe the synthetic unsaved UI edit');
});
