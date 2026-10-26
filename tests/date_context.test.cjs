const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'insight_date_context_v1.js'),'utf8');

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

function setup(){
  const window={};
  const context={
    window,globalThis:window,
    MONTHS:Array.from({length:12},(_,i)=>(i+1)+'月'),
    todayInfo:{fy:'2026',mIdx:8,month:'9月',day:30},
    quickEditDay:30,
    Date:fixedDateClass(),
    Number,String,Object,Array,Math,console
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return {api:window.InsightDateContext,context};
}

test('ISO日付を厳密に解析し月跨ぎ・年跨ぎを保持する',()=>{
  const {api}=setup();
  const oct=api.parseIso('2026-10-01');
  assert.equal(api.iso(oct),'2026-10-01');
  api.setSelectedDate(oct);
  assert.deepEqual(
    {fy:api.getSelectedInfo().fy,mIdx:api.getSelectedInfo().mIdx,month:api.getSelectedInfo().month,day:api.getSelectedInfo().day},
    {fy:'2026',mIdx:9,month:'10月',day:1}
  );
  api.setSelectedDate(api.parseIso('2027-01-01'));
  assert.equal(api.getSelectedIso(),'2027-01-01');
  assert.equal(api.parseIso('2026-02-30'),null);
});

test('今日・未来日の判定を共通化する',()=>{
  const {api}=setup();
  assert.equal(api.isToday(api.parseIso('2026-09-30')),true);
  assert.equal(api.isFuture(api.parseIso('2026-10-01')),true);
  assert.equal(api.isFuture(api.parseIso('2026-09-29')),false);
});

test('legacy globalsは処理中だけ選択日に合わせて処理後に復元する',()=>{
  const {api,context}=setup();
  api.setSelectedDate(api.parseIso('2026-10-01'));
  let seen;
  api.withLegacyGlobals(()=>{
    seen={fy:context.todayInfo.fy,mIdx:context.todayInfo.mIdx,month:context.todayInfo.month,day:context.quickEditDay};
  });
  assert.deepEqual(seen,{fy:'2026',mIdx:9,month:'10月',day:1});
  assert.deepEqual(context.todayInfo,{fy:'2026',mIdx:8,month:'9月',day:30});
  assert.equal(context.quickEditDay,30);
});

test('日付利用モジュールは共有DateContextを参照する',()=>{
  const consumers=[
    'insight_ops_v1.js',
    'insight_temperature_v1.js',
    'insight_weather_temperature_auto_v1.js',
    'insight_events_v1.js',
    'insight_ai_page_comments_v1.js'
  ];
  consumers.forEach(name=>{
    const text=fs.readFileSync(path.join(root,name),'utf8');
    assert.match(text,/InsightDateContext/,name+' が共有日付Contextを参照していません');
  });
});

test('日付利用モジュールは独自に日付ピッカーを解析しない',()=>{
  for(const name of [
    'insight_ops_v1.js',
    'insight_temperature_v1.js',
    'insight_weather_temperature_auto_v1.js',
    'insight_events_v1.js',
    'insight_ai_page_comments_v1.js'
  ]){
    const text=fs.readFileSync(path.join(root,name),'utf8');
    assert.doesNotMatch(text,/iqdDateInput/,name+' に独自の日付ピッカー参照が残っています');
    assert.doesNotMatch(text,/quickEditDay/,name+' に旧quickEditDay依存が残っています');
  }
});


/* STEP4 P4d-3: quick-date-nav's actual handlers in isolated fictional DOM. */
const quickNavSource=fs.readFileSync(path.join(root,'insight_quick_date_nav_v1.js'),'utf8');
function quickDraftFixture(){
  let activeDate=new Date(2026,9,26),allowConfirm=true,renderCallback=null;
  const observations={render:0,persist:0,fetch:0,confirm:0,saveHook:0};
  function element(){
    return {
      innerHTML:'',textContent:'',value:'',onclick:null,events:{},
      addEventListener(type,fn){(this.events[type]||(this.events[type]=[])).push(fn);},
      emit(type,event={}){
        (this.events[type]||[]).forEach(fn=>fn.call(this,event));
      }
    };
  }
  const els=Object.fromEntries([
    'pageQuick','qNavRow','quickGrid','iqdPrev','iqdNext',
    'iqdToday','iqdDateInput','todayBadge'
  ].map(id=>[id,element()]));
  const document={
    getElementById(id){return els[id]||null;},
    querySelector(){return null;}
  };
  const iso=d=>[
    d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');
  const dateContext={
    getSelectedDate(){return new Date(activeDate.getTime());},
    getSelectedIso(){return iso(activeDate);},
    getSelectedInfo(){return {
      fy:String(activeDate.getFullYear()),
      month:(activeDate.getMonth()+1)+'月',day:activeDate.getDate()
    };},
    iso,parseIso(value){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
      const [year,month,day]=value.split('-').map(Number);
      const d=new Date(year,month-1,day);
      return iso(d)===value?d:null;
    },
    setSelectedDate(date){activeDate=new Date(date.getTime());},
    resetToToday(){activeDate=new Date(2026,9,26);},
    isToday(){return iso(activeDate)==='2026-10-26';}
  };
  const hooks={};
  const store={
    name:'SECRET_STORE_CANARY',
    data:{'2026':{'10月':[]}}
  };
  const allStores={current:'a'};
  const original=JSON.stringify(store);
  const window={
    InsightDateContext:dateContext,
    InsightYearManager:{isCurrentRegistered(){return true;}},
    InsightHooks:{on(name,key,fn){hooks[name]=fn;}},
    renderQuickPage(){
      observations.render++;
      if(renderCallback)renderCallback();
    },
    saveQuick(){},
    confirm(){observations.confirm++;return allowConfirm;},
    alert(){throw Error('unexpected alert');}
  };
  const sandbox={
    window,document,allStores,store,
    quickEditDay:26,currentNav:0,
    Date,Number,String,Math,Array,Object,
    todayInfo:{fy:'2026',month:'10月',mIdx:9,day:26},
    todayFY(){return {fy:'2026',month:'10月',mIdx:9,day:26};},
    fetchWeather(){observations.fetch++;},
    persist(){observations.persist++;},
    blankHaiki(){return {};},
    updateMissingBadge(){},showToast(){}
  };
  vm.createContext(sandbox);vm.runInContext(quickNavSource,sandbox);
  const get=()=>window.InsightQuickDaily.getForecastDraftStatus();
  const read=()=>JSON.parse(JSON.stringify(get()));
  return {
    window,els,store,allStores,original,observations,hooks,read,get,
    allow(value){allowConfirm=value;},
    onRender(fn){renderCallback=fn;},
    selectedIso:()=>dateContext.getSelectedIso()
  };
}
function quickUnknown(s){
  assert.equal(s.initialized,false);
  assert.equal(s.dirty,null);
  assert.ok(Number.isSafeInteger(s.epoch));
}
test('P4d3 Q01: pre-edit quick daily is unknown, never presumed clean',()=>{
  const h=quickDraftFixture(),value=h.get();
  assert.equal(Object.isFrozen(value),true);
  quickUnknown(h.read());
  assert.deepEqual(Object.keys(h.read()).sort(),['dirty','epoch','initialized']);
});
test('P4d3 Q02: input/blank/change are positive dirty witnesses',()=>{
  const h=quickDraftFixture(),before=h.read().epoch;
  h.els.quickGrid.emit('input',{target:{value:'0',canary:'SENSITIVE_VALUE'}});
  const dirty=h.read();
  assert.equal(dirty.initialized,true);assert.equal(dirty.dirty,true);
  assert.ok(dirty.epoch>before);
  h.els.quickGrid.emit('change',{target:{value:''}});
  assert.equal(h.read().dirty,true);assert.ok(h.read().epoch>dirty.epoch);
  assert.doesNotMatch(JSON.stringify(h.read()),/SENSITIVE_VALUE|SECRET_STORE_CANARY/);
});
test('P4d3 Q03: only weather-related clicks mark a dirty witness',()=>{
  const h=quickDraftFixture(),before=h.read().epoch;
  h.els.pageQuick.emit('click',{target:{closest(){return null;}}});
  assert.equal(h.read().epoch,before);
  h.els.pageQuick.emit('click',{target:{closest(selector){
    assert.equal(selector,'.wx-btn,#autoWxBtn');return {};
  }}});
  assert.equal(h.read().dirty,true);
});
test('P4d3 Q04: canceled date selection retains the dirty witness',()=>{
  const h=quickDraftFixture();
  h.els.quickGrid.emit('input');
  const first=h.read().epoch;
  h.allow(false);h.els.iqdNext.onclick();
  assert.equal(h.selectedIso(),'2026-10-26');
  assert.equal(h.read().dirty,true);assert.equal(h.read().epoch,first);
  assert.equal(h.observations.confirm,1);
});
test('P4d3 Q05: confirmed date selection invalidates old evidence',()=>{
  const h=quickDraftFixture();
  h.els.quickGrid.emit('input');
  const old=h.read().epoch;
  h.els.iqdNext.onclick();
  assert.equal(h.selectedIso(),'2026-10-27');
  quickUnknown(h.read());assert.ok(h.read().epoch>old);
  assert.equal(h.observations.persist,0);
  assert.equal(JSON.stringify(h.store),h.original);
});
test('P4d3 Q06: reentrant typing during render cannot be reset to clean',()=>{
  const h=quickDraftFixture();
  h.onRender(()=>h.els.quickGrid.emit('input',{target:{value:'73'}}));
  h.els.iqdNext.onclick();
  assert.equal(h.read().dirty,true);
  assert.equal(h.read().initialized,true);
  assert.equal(h.observations.persist,0);
});
test('P4d3 Q07: save-hook outcome stays unknown, never claimed clean',()=>{
  const h=quickDraftFixture();
  h.els.quickGrid.emit('input');
  const first=h.read().epoch;
  h.hooks['quick:save:after']();
  quickUnknown(h.read());
  assert.ok(h.read().epoch>first);
  h.els.quickGrid.emit('input');
  assert.equal(h.read().dirty,true);
  assert.equal(h.observations.persist,0);
});
test('P4d3 Q08: store-switch rerender invalidates and reentry stays dirty',()=>{
  const h=quickDraftFixture();
  h.els.quickGrid.emit('input');
  h.allStores.current='b';
  h.window.initQuickPage();
  quickUnknown(h.read());
  h.onRender(()=>h.els.quickGrid.emit('change'));
  h.window.initQuickPage();
  assert.equal(h.read().dirty,true);
});
test('P4d3 Q09: declined clear does not change saved rows or status',()=>{
  const h=quickDraftFixture();
  h.els.quickGrid.emit('input');
  const before=h.read();
  h.allow(false);h.window.clearTodayData();
  assert.deepEqual(h.read(),before);
  assert.equal(h.observations.persist,0);
  assert.equal(JSON.stringify(h.store),h.original);
});
test('P4d3 Q10: dirty -> unknown -> dirty is a new epoch, never authorization',()=>{
  const h=quickDraftFixture();
  h.els.quickGrid.emit('input');const first=h.read().epoch;
  h.hooks['quick:save:after']();const second=h.read().epoch;
  h.els.quickGrid.emit('input');const third=h.read().epoch;
  assert.ok(first<second&&second<third);
  assert.equal(h.read().dirty,true);
  assert.equal(h.observations.persist,0);
  assert.doesNotMatch(JSON.stringify(h.read()),/raw|quantity|date|store|authorization/);
});
