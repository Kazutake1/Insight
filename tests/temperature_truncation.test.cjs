'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('quick temperature displays truncated integers but restores raw decimals on focus',()=>{
  const handlers={},inputs={},row={d:'1',weather:'晴',tempMaxC:25.8,tempMinC:-3.7,客数:123};
  function input(){const listeners={};return {value:'',disabled:false,listeners,addEventListener(k,fn){listeners[k]=fn;}};}
  inputs.qi_tempMaxC=input();inputs.qi_tempMinC=input();
  inputs.qi_tempAvgC={textContent:''};
  let wrap=null;
  const weather={insertAdjacentElement(_pos,node){wrap=node;}};
  const document={
    activeElement:null,
    createElement(){return {className:'',id:'',innerHTML:'',querySelector(selector){return inputs[selector.slice(1)];}};},
    getElementById(id){
      if(id==='qWeatherSel')return weather;
      if(id==='qTemperatureInputs')return wrap;
      return inputs[id]||null;
    }
  };
  const window={
    InsightHooks:{on(event,key,fn){handlers[event+':'+key]=fn;}},
    InsightDateContext:{
      getSelectedInfo(){return {date:new Date('2026-10-01T00:00:00Z'),fy:'2026',month:'10月',day:1};},
      isFuture(){return false;}
    }
  };
  const context={window,globalThis:window,document,store:{data:{'2026':{'10月':[row]}}},
    WeakMap,Number,String,Object,Array,Math,console,currentNav:1
  };
  vm.createContext(context);
  vm.runInContext(read('insight_temperature_v1.js'),context);
  const render=handlers['quick:render:after:temperature-render'];
  assert.equal(typeof render,'function');
  render();
  assert.equal(inputs.qi_tempMaxC.value,'25');
  assert.equal(inputs.qi_tempMinC.value,'-3');
  assert.equal(row.tempMaxC,25.8,'stored precision remains untouched');
  assert.equal(row.tempMinC,-3.7,'stored negative precision remains untouched');
  document.activeElement=inputs.qi_tempMaxC;
  inputs.qi_tempMaxC.listeners.focus();
  assert.equal(inputs.qi_tempMaxC.value,'25.8');
  document.activeElement=null;
  inputs.qi_tempMaxC.listeners.blur();
  assert.equal(inputs.qi_tempMaxC.value,'25');
  document.activeElement=inputs.qi_tempMinC;
  inputs.qi_tempMinC.listeners.focus();
  assert.equal(inputs.qi_tempMinC.value,'-3.7');
});

test('sales and customer weather reference cards truncate positive/negative temperatures',()=>{
  const window={};
  const context={window,globalThis:window,WX_ICONS:{晴:'☀️'},document:{getElementById(){return null;}},Number,String,Object,Array,Math,console};
  vm.createContext(context);
  vm.runInContext(read('insight_input_weather_temp_v1.js'),context);
  const api=window.InsightInputWeatherTemp;
  assert.equal(api.fmtTemp(25.8),'25');
  assert.equal(api.fmtTemp(-3.7),'-3');
  assert.equal(api.fmtTemp(null),'—');
  assert.equal(api.tempPair({tempMaxC:25.8,tempMinC:-3.7},true),'25 / -3℃');
  assert.equal(api.tempPair({tempMaxC:25.8,tempMinC:-3.7},false),'25/-3℃');
});