const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');

function fixedDateClass(){
  const RealDate=Date;
  return class FixedDate extends RealDate{
    constructor(...args){
      if(args.length===0)super('2026-09-30T03:00:00.000Z');
      else super(...args);
    }
    static now(){return new RealDate('2026-09-30T03:00:00.000Z').getTime();}
  };
}

function loadWeatherAuto(options={}){
  const source=fs.readFileSync(path.join(root,'insight_weather_temperature_auto_v1.js'),'utf8');
  const picker={value:options.selectedDate||'2026-09-30'};
  const document={
    getElementById(id){
      if(id==='iqdDateInput')return picker;
      return null;
    }
  };
  const window={};
  const context={
    window,globalThis:window,document,
    allStores:options.allStores||{stores:{}},
    store:options.store||{},
    persist:options.persist||(()=>{}),
    fetch:async()=>{throw new Error('network should not be called');},
    setTimeout:()=>0,
    Date:fixedDateClass(),
    Intl,Number,String,Object,Array,Promise,Math,encodeURIComponent,console
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {api:window.InsightWeatherTemperatureAuto,picker,context};
}

test('天気取得日はtodayInfoではなく日付ナビの選択日を優先する',()=>{
  const {api}=loadWeatherAuto({selectedDate:'2026-10-01'});
  const date=api.targetDate();
  assert.equal(date.getFullYear(),2026);
  assert.equal(date.getMonth(),9);
  assert.equal(date.getDate(),1);
  assert.equal(api.isFutureDate(date),true);
});

test('未来日の天気・最高最低気温だけを既存データから削除する',()=>{
  let persistCount=0;
  const allStores={stores:{
    a:{data:{'2026':{
      '9月':[{d:30,weather:'晴',tempMaxC:30,tempMinC:20}],
      '10月':[{d:1,weather:'雨',tempMaxC:25,tempMinC:18,売上:12345,客数:100,storeMemo:'保持'}]
    }}}
  }};
  loadWeatherAuto({allStores,persist:()=>{persistCount++;}});
  const today=allStores.stores.a.data['2026']['9月'][0];
  const future=allStores.stores.a.data['2026']['10月'][0];
  assert.equal(today.weather,'晴');
  assert.equal(today.tempMaxC,30);
  assert.equal(future.weather,'');
  assert.equal('tempMaxC' in future,false);
  assert.equal('tempMinC' in future,false);
  assert.equal(future.売上,12345);
  assert.equal(future.客数,100);
  assert.equal(future.storeMemo,'保持');
  assert.equal(persistCount,1);
});

test('通常APIは未来7日を要求せず当日分だけに制限する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_weather_temperature_auto_v1.js'),'utf8');
  assert.match(source,/past_days=3&forecast_days=1/);
  assert.doesNotMatch(source,/forecast_days=7/);
  assert.match(source,/if\(isFutureDate\(date\)\)/);
});

test('気温保存も日付ナビの選択日を使い未来日の天気・気温を残さない',()=>{
  const source=fs.readFileSync(path.join(root,'insight_temperature_v1.js'),'utf8');
  const picker={value:'2026-10-01'};
  const store={data:{
    '2026':{
      '9月':[{d:1,weather:'晴',tempMaxC:29,tempMinC:20}],
      '10月':[{d:1,weather:'雨',tempMaxC:24,tempMinC:17,売上:5000}]
    }
  }};
  let persistCount=0;
  const window={saveQuick:()=>true};
  const document={
    activeElement:null,
    getElementById(id){
      if(id==='iqdDateInput')return picker;
      return null;
    }
  };
  const context={
    window,globalThis:window,document,
    store,allStores:{stores:{a:store}},
    todayInfo:{fy:'2026',mIdx:8,month:'9月'},
    quickEditDay:1,MONTHS:Array.from({length:12},(_,i)=>(i+1)+'月'),
    currentNav:1,
    blankRow:day=>({d:day,weather:''}),
    persist:()=>{persistCount++;},
    alert:message=>assert.fail(message),
    Date:fixedDateClass(),
    Number,String,Object,Array,Math,WeakMap,console
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  window.saveQuick();
  const september=store.data['2026']['9月'][0];
  const october=store.data['2026']['10月'][0];
  assert.equal(september.weather,'晴');
  assert.equal(september.tempMaxC,29);
  assert.equal(october.weather,'');
  assert.equal('tempMaxC' in october,false);
  assert.equal('tempMinC' in october,false);
  assert.equal(october.売上,5000);
  assert.equal(persistCount,1);
});
