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
