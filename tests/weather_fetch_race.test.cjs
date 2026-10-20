'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','insight_weather_temperature_auto_v1.js'),'utf8');
function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
function fixture(){
  const pending=[];
  let selectedDate=new Date('2026-10-19T12:00:00Z');
  let manual=0;
  const originalStore={years:['2026'],weatherLocation:{
    latitude:35.17,longitude:136.97,timezone:'Asia/Tokyo'
  },data:{}};
  const otherStore={years:['2026'],data:{}};
  const inputs={};
  for(const key of ['qi_tempMaxC','qi_tempMinC']){
    inputs[key]={value:'',events:0,dispatchEvent(){this.events++;}};
  }
  const label={textContent:''};
  const button={disabled:false,title:''};
  const elements={qi_tempMaxC:inputs.qi_tempMaxC,qi_tempMinC:inputs.qi_tempMinC,autoWxBtn:button,autoWxLabel:label};
  const weatherChanges=[];
  const window={
    InsightDateContext:{getSelectedDate(){return selectedDate;},isFuture(){return false;}},
    InsightWeatherCompact:{manualSelectionRevision(){return manual;}},
    setWeather(wx){weatherChanges.push(wx);}
  };
  const ctx={window,globalThis:window,store:originalStore,allStores:{stores:{a:originalStore,b:otherStore}},
    document:{getElementById(id){return elements[id]||null;}},
    fetch(){const wait=deferred();pending.push(wait);return wait.promise;},
    setTimeout(){return 1;},
    Event:class Event{constructor(type){this.type=type;}},
    Intl,Date,Number,String,Object,Array,Math,Promise,console
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  function complete(index=0){
    pending[index].resolve({ok:true,json:async()=>({daily:{
      time:['2026-10-19'],
      weather_code:[61],
      temperature_2m_max:[25.8],
      temperature_2m_min:[18.4]
    }})});
  }
  return {ctx,window,pending,inputs,weatherChanges,label,button,complete,
    manuallySelect(){manual++;},
    changeDate(date){selectedDate=new Date(date);},
    changeStore(){ctx.store=otherStore;}
  };
}

test('late auto-fetch must not override manual weather or temperatures',async()=>{
  const f=fixture();
  const fetch=f.window.fetchWeather();
  assert.equal(f.pending.length,1);
  f.manuallySelect();
  f.complete();
  await fetch;
  assert.deepEqual(f.weatherChanges,[]);
  assert.equal(f.inputs.qi_tempMaxC.events,0);
  assert.equal(f.inputs.qi_tempMinC.events,0);
  assert.equal(f.label.textContent,'自動');
  assert.equal(f.button.disabled,false);
});

test('normal auto-fetch still applies current-day weather and temperatures',async()=>{
  const f=fixture();
  const fetch=f.window.fetchWeather();
  f.complete();
  await fetch;
  assert.deepEqual(f.weatherChanges,['小雨']);
  assert.equal(f.inputs.qi_tempMaxC.value,'25.8');
  assert.equal(f.inputs.qi_tempMinC.value,'18.4');
  assert.equal(f.inputs.qi_tempMaxC.events,1);
  assert.equal(f.inputs.qi_tempMinC.events,1);
});

test('late fetch for another selected day must not change visible inputs',async()=>{
  const f=fixture();
  const fetch=f.window.fetchWeather();
  f.changeDate('2026-10-18T12:00:00Z');
  f.complete();
  await fetch;
  assert.deepEqual(f.weatherChanges,[]);
  assert.equal(f.inputs.qi_tempMaxC.events,0);
});

test('late fetch for another store must not change visible inputs',async()=>{
  const f=fixture();
  const fetch=f.window.fetchWeather();
  f.changeStore();
  f.complete();
  await fetch;
  assert.deepEqual(f.weatherChanges,[]);
  assert.equal(f.inputs.qi_tempMinC.events,0);
});

test('an older concurrent request cannot replace the newer result',async()=>{
  const f=fixture();
  const first=f.window.fetchWeather();
  const second=f.window.fetchWeather();
  f.complete(1);
  await second;
  f.complete(0);
  await first;
  assert.deepEqual(f.weatherChanges,['小雨']);
  assert.equal(f.inputs.qi_tempMaxC.events,1);
});

test('late fetch failures do not falsely report an error after manual selection',async()=>{
  const f=fixture();
  const fetch=f.window.fetchWeather();
  f.manuallySelect();
  f.pending[0].reject(new Error('simulated network failure'));
  await fetch;
  assert.equal(f.label.textContent,'自動');
  assert.deepEqual(f.weatherChanges,[]);
});