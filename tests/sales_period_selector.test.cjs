const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const controls=require('../insight_sales_period_selector_v1.js');

test('月表記を1〜12へ正規化できる',()=>{
  assert.equal(controls.monthNumber('10月'),10);
  assert.equal(controls.monthNumber(1),1);
  assert.equal(controls.monthNumber('13月'),null);
});

test('販売数入力と同じく前月・翌月は年をまたいで1か月移動する',()=>{
  assert.deepEqual(controls.shiftPeriod(2025,12,1),{year:2026,month:1});
  assert.deepEqual(controls.shiftPeriod(2025,1,-1),{year:2024,month:12});
  assert.deepEqual(controls.adjacentPeriod(2026,10,-1),{year:2026,month:9});
});

test('売上・客数・廃棄の3ページを同じ操作方法へ統一する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/type:'sales'.*pageId:'pageSales'.*label:'売上'/);
  assert.match(source,/type:'kyaku'.*pageId:'pageKyaku'.*label:'客数'/);
  assert.match(source,/type:'haiki'.*pageId:'pageHaiki'.*label:'廃棄'/);
  assert.match(source,/className='sc-toolbar insight-input-period-toolbar'/);
  assert.match(source,/‹ 前月/);
  assert.match(source,/翌月 ›/);
  assert.doesNotMatch(source,/今月へ|年月を選択|insightSalesPeriodOverlay|data-month|hideLegacy|legacy-hidden|setTimeout|MutationObserver/);
});

test('未登録年度は販売数入力と同じ年度追加確認を経由する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/年度はダッシュボードに登録されていません/);
  assert.match(source,/InsightYearManager\.promoteCurrent/);
  assert.match(source,/既にある過去データは保持したまま/);
});

test('旧年月UIを後から隠さず、入力ページ更新フックで同期的に新UIを更新する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/input:table:after/);
  assert.match(source,/syncConfig\(config\)/);
  assert.match(source,/removeLegacyPlaceholders/);
  assert.doesNotMatch(source,/hideLegacy|legacy-hidden|setTimeout|queueMicrotask|MutationObserver/);
});

test('期間変更は既存同期処理を利用し保存処理を再実装しない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/InsightPagePeriodSync\.setTarget/);
  assert.match(source,/InsightPagePeriodSync\.syncCurrentPage/);
  assert.doesNotMatch(source,/localStorage|InsightStorage\.writeSnapshot|InsightStorage\.transaction|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('旧年月UIはbootstrap依存ではなくruntime cleanupとして所有する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.equal(controls.VERSION,4);
  assert.match(source,/model\.cleanupLegacy=syncAll/);
  assert.match(source,/model\.legacyCleanupMode='runtime'/);
  assert.match(source,/function removeLegacyPlaceholders\(config\)/);
  assert.match(source,/input:table:after/);
});

test('旧initInputPage実行前に不可視プレースホルダを用意し実行後に除去する',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_period_selector_v1.js'),'utf8');
  assert.match(source,/function ensureLegacyPlaceholders\(config\)/);
  assert.match(source,/node\.hidden=true/);
  assert.match(source,/function installLegacyBridge\(\)/);
  assert.match(source,/ensureLegacyPlaceholders\(config\)/);
  assert.match(source,/finally\{if\(config\)syncConfig\(config\);\}/);
  assert.match(source,/__insightInputPeriodControls=true/);
});


/* STEP4 P4d-4: real input-day-nav event handlers, fictional VM services. */
const vm=require('node:vm');
const inputDayNavSource=fs.readFileSync(
  path.join(__dirname,'..','insight_input_day_nav_v1.js'),'utf8');
function threeEditorFixture(){
  const handlers={},hooks={},nodes={},operations={apply:0,persist:0,network:0,model:0,confirm:0};
  const editYear={sales:2026,kyaku:2026,haiki:2026};
  const editMonth={sales:'10月',kyaku:'10月',haiki:'10月'};
  const secretStore={name:'PRIVATE_STORE_NAME_CANARY',savedCounts:{sales:19}};
  const before=JSON.stringify(secretStore);
  const navIds=['nav0','nav1','nav2','nav3','nav4','navSalesCount','storeSel'];
  for(const id of navIds)nodes[id]={
    listeners:{},
    addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);},
    emit(type){(this.listeners[type]||[]).forEach(fn=>fn());}
  };
  const doc={
    readyState:'complete',
    getElementById(id){return nodes[id]||null;},
    addEventListener(type,fn){(handlers[type]||(handlers[type]=[])).push(fn);}
  };
  let allow=true,onApply=null,onFrame=null;
  const iso=d=>[
    d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')].join('-');
  const dateContext={
    iso,parseIso(value){
      if(!/^\d{4}-\d\d-\d\d$/.test(value))return null;
      const [y,m,d]=value.split('-').map(Number);
      const date=new Date(y,m-1,d);
      return iso(date)===value?date:null;
    }
  };
  const root={
    document:doc,InsightDateContext:dateContext,
    InsightInputPeriodControls:{
      monthNumber(value){
        const m=/^(\d{1,2})月$/.exec(String(value));
        return m&&Number(m[1])>=1&&Number(m[1])<=12?Number(m[1]):null;
      },
      apply(config,year,month){
        operations.apply++;
        if(onApply)onApply(config.type);
        editYear[config.type]=year;
        editMonth[config.type]=month+'月';
        return true;
      }
    },
    InsightHooks:{on(name,key,fn){hooks[name]=fn;}},
    addEventListener(){},
    requestAnimationFrame(fn){if(onFrame)onFrame();fn();},
    setTimeout(fn){fn();},
    confirm(){operations.confirm++;return allow;}
  };
  const sandbox={window:root,globalThis:root,document:doc,
    editYear,editMonth,Date,Number,String,Math,Array,Object};
  vm.createContext(sandbox);
  vm.runInContext(inputDayNavSource,sandbox);
  const api=root.InsightInputDayNav;
  const read=type=>JSON.parse(JSON.stringify(api.getForecastDraftStatus(type)));
  function target(type,kind,nav=false){
    const pages={sales:'pageSales',kyaku:'pageKyaku',haiki:'pageHaiki',salesCounts:'pageSalesCount'};
    return {
      closest(selector){
        if(selector==='button,input')return this;
        if(selector==='.insight-shared-day-nav')return nav?this:null;
        if(selector.startsWith('#page'))return selector==='#'+pages[type]?this:null;
        return null;
      },
      matches(selector){
        if(selector.includes('#salesSaveBtn'))return kind==='save';
        if(selector==='.wx-btn')return kind==='weather';
        return false;
      }
    };
  }
  function emit(event,type,kind,nav=false){
    const t=target(type,kind,nav);
    for(const fn of handlers[event]||[])fn({target:t});
  }
  function assertNoEffects(){
    assert.equal(operations.persist,0);
    assert.equal(operations.network,0);
    assert.equal(operations.model,0);
    assert.equal(JSON.stringify(secretStore),before);
  }
  return {api,read,operations,hooks,nodes,editYear,editMonth,emit,
    setAllow(v){allow=v;},onApply(fn){onApply=fn;},onFrame(fn){onFrame=fn;},
    assertNoEffects};
}
function unknownEditor(s){
  assert.equal(s.initialized,false);
  assert.equal(s.dirty,null);
  assert.ok(Number.isSafeInteger(s.epoch));
}
test('P4d4 L01: each legacy editor starts UNKNOWN, counts excluded',()=>{
  const h=threeEditorFixture();
  for(const key of ['sales','kyaku','haiki'])unknownEditor(h.read(key));
  assert.deepEqual(h.read('salesCounts'),{initialized:false,dirty:null,epoch:null});
  assert.deepEqual(h.read('invalid'),{initialized:false,dirty:null,epoch:null});
});
test('P4d4 L02: sales, customers and waste have independent dirty epochs',()=>{
  const h=threeEditorFixture();
  for(const key of ['sales','kyaku','haiki']){
    h.emit('input',key);
    const s=h.read(key);
    assert.equal(s.initialized,true);assert.equal(s.dirty,true);assert.equal(s.epoch,1);
  }
  h.emit('input','sales');
  assert.equal(h.read('sales').epoch,2);
  assert.equal(h.read('kyaku').epoch,1);
  assert.equal(h.read('haiki').epoch,1);
  h.assertNoEffects();
});
test('P4d4 L03: input value getter is never read or exposed',()=>{
  const h=threeEditorFixture();
  h.emit('input','sales');
  const result=h.api.getForecastDraftStatus('sales');
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(Object.keys(result).sort(),['dirty','epoch','initialized']);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_STORE_NAME_CANARY|sales|2026|quantity|value/);
  h.assertNoEffects();
});
test('P4d4 L04: change counts as DIRTY; date-nav input is excluded',()=>{
  const h=threeEditorFixture();
  h.emit('change','kyaku');
  assert.equal(h.read('kyaku').dirty,true);
  h.emit('input','haiki',null,true);
  unknownEditor(h.read('haiki'));
});
test('P4d4 L05: weather click marks only selected legacy editor dirty',()=>{
  const h=threeEditorFixture();
  h.emit('click','sales','weather');
  assert.equal(h.read('sales').dirty,true);
  unknownEditor(h.read('haiki'));
  h.emit('click','salesCounts','weather');
  unknownEditor(h.read('kyaku'));
});
test('P4d4 L06: save-button click invalidates but NEVER proves clean',()=>{
  const h=threeEditorFixture();
  h.emit('input','kyaku');const first=h.read('kyaku').epoch;
  h.emit('click','kyaku','save');
  unknownEditor(h.read('kyaku'));assert.ok(h.read('kyaku').epoch>first);
  h.emit('input','kyaku');assert.equal(h.read('kyaku').dirty,true);
  h.assertNoEffects();
});
test('P4d4 L07: rejected month switch keeps dirty witness and period',()=>{
  const h=threeEditorFixture();
  h.emit('input','sales');const before=h.read('sales');
  h.setAllow(false);
  assert.equal(h.api.select('sales','2026-11-02'),false);
  assert.deepEqual(h.read('sales'),before);
  assert.equal(h.operations.apply,0);
  assert.equal(h.operations.confirm,1);
});
test('P4d4 L08: accepted month switch invalidates only target editor',()=>{
  const h=threeEditorFixture();
  h.emit('input','sales');h.emit('input','kyaku');
  const prev=h.read('sales').epoch;
  assert.equal(h.api.select('sales','2026-11-02'),true);
  unknownEditor(h.read('sales'));
  assert.ok(h.read('sales').epoch>prev);
  assert.equal(h.read('kyaku').dirty,true);
  assert.equal(h.editMonth.sales,'11月');
  h.assertNoEffects();
});
test('P4d4 L09: synchronous input during period apply becomes new DIRTY',()=>{
  const h=threeEditorFixture();
  h.onApply(type=>h.emit('input',type));
  assert.equal(h.api.select('haiki','2026-11-02'),true);
  assert.equal(h.read('haiki').dirty,true);
  assert.ok(h.read('haiki').epoch>=2);
});
test('P4d4 L10: nav and store changes invalidate all editor witnesses',()=>{
  const h=threeEditorFixture();
  for(const key of ['sales','kyaku','haiki'])h.emit('input',key);
  h.nodes.nav0.emit('click');
  for(const key of ['sales','kyaku','haiki'])unknownEditor(h.read(key));
  h.emit('input','sales');
  h.nodes.storeSel.emit('change');
  unknownEditor(h.read('sales'));
  h.assertNoEffects();
});
test('P4d4 L11: table rerender invalidates only named editor',()=>{
  const h=threeEditorFixture();
  h.emit('input','sales');h.emit('input','kyaku');
  h.hooks['input:table:after']({args:['sales']});
  unknownEditor(h.read('sales'));
  assert.equal(h.read('kyaku').dirty,true);
});
test('P4d4 L12: event reentry during post-table sync remains DIRTY',()=>{
  const h=threeEditorFixture();
  h.emit('input','haiki');
  h.onFrame(()=>h.emit('input','haiki'));
  h.hooks['input:table:after']({args:['haiki']});
  assert.equal(h.read('haiki').dirty,true);
});
test('P4d4 L13: count page changes never authorize legacy snapshots',()=>{
  const h=threeEditorFixture();
  h.emit('input','salesCounts');
  h.emit('change','salesCounts');
  h.emit('click','salesCounts','save');
  for(const key of ['sales','kyaku','haiki'])unknownEditor(h.read(key));
  h.assertNoEffects();
});
test('P4d4 L14: witness -> UNKNOWN -> witness is new epoch (ABA)',()=>{
  const h=threeEditorFixture();
  h.emit('input','sales');const first=h.read('sales').epoch;
  h.emit('click','sales','save');const second=h.read('sales').epoch;
  h.emit('input','sales');const third=h.read('sales').epoch;
  assert.ok(first<second&&second<third);
  assert.equal(h.read('sales').dirty,true);
  h.assertNoEffects();
});
