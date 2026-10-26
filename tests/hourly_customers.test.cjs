/* Run: node --test tests/hourly_customers.test.cjs (no dependencies). */
const test=require('node:test');
const assert=require('node:assert/strict');
const hourly=require('../insight_hourly_customers_v1.js');

function data(){return {current:'a',stores:{a:{name:'A'},b:{name:'B'}}};}

test('old backups remain valid without hourly customer data',()=>{
  const all=data(),before=JSON.stringify(all);
  hourly.validate(all);
  assert.equal(JSON.stringify(all),before);
  assert.equal(hourly.get(all,'a','2026-10-02'),null);
  assert.deepEqual(hourly.status(all,'a','2026-10-02'),{hours:Array(24).fill(null),count:0,complete:false,total:0});
});

test('partial hourly input preserves blanks separately from zero',()=>{
  const all=data(),hours=Array(24).fill(null);hours[0]=0;hours[1]=12;hours[18]=186;
  hourly.set(all,'a','2026-10-02',hours);
  const saved=hourly.get(all,'a','2026-10-02');
  assert.equal(saved.length,24);
  assert.equal(saved[0],0);
  assert.equal(saved[1],12);
  assert.equal(saved[2],null);
  const status=hourly.status(all,'a','2026-10-02');
  assert.equal(status.count,3);
  assert.equal(status.complete,false);
  assert.equal(status.total,198);
});

test('24 hours becomes complete and all-empty input deletes the date',()=>{
  const all=data(),hours=Array.from({length:24},(_,i)=>i);
  hourly.set(all,'a','2026-10-02',hours);
  const status=hourly.status(all,'a','2026-10-02');
  assert.equal(status.count,24);
  assert.equal(status.complete,true);
  assert.equal(status.total,276);
  hourly.set(all,'a','2026-10-02',Array(24).fill(null));
  assert.equal(hourly.get(all,'a','2026-10-02'),null);
});

test('invalid date, negative, decimal and non-24 saved data are rejected',()=>{
  const all=data();
  assert.throws(()=>hourly.set(all,'a','bad-date',Array(24).fill(1)));
  const negative=Array(24).fill(null);negative[2]=-1;
  assert.throws(()=>hourly.set(all,'a','2026-10-02',negative));
  const decimal=Array(24).fill(null);decimal[2]=1.5;
  assert.throws(()=>hourly.set(all,'a','2026-10-02',decimal));
  all.stores.a.hourlyCustomers={'2026-10-02':[1,2]};
  assert.throws(()=>hourly.validate(all));
});


/* STEP4 P4d-2: original hourly dialog handlers in a fictional VM DOM.
 * Only non-sensitive status crosses the observation boundary; never reads
 * actual stores, production localStorage, native UI or network.
 */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function hourlyForecastFixture(){
  const source=fs.readFileSync(path.join(__dirname,'../insight_hourly_customers_v1.js'),'utf8');
  const calls={transaction:0,fetch:0,model:0},alerts=[];
  let failSave=false;
  function node(tag){
    const e={
      tagName:tag,id:'',children:[],parentElement:null,listeners:{},dataset:{},
      value:'',open:false,removed:false,_invalid:'',
      append(...items){
        for(const x of items){
          if(!x||typeof x!=='object')throw Error('invalid fictional child');
          if(x.parentElement){
            const idx=x.parentElement.children.indexOf(x);
            if(idx>=0)x.parentElement.children.splice(idx,1);
          }
          x.parentElement=this;this.children.push(x);
        }
      },
      insertBefore(child,other){
        this.append(child);const idx=this.children.indexOf(other);
        if(idx>=0){this.children.splice(this.children.indexOf(child),1);this.children.splice(idx,0,child);}
      },
      setAttribute(){},
      addEventListener(type,handler){(this.listeners[type]||(this.listeners[type]=[])).push(handler);},
      dispatch(type){for(const cb of this.listeners[type]||[])cb.call(this,{type,target:this});},
      setCustomValidity(message){this._invalid=message;},
      checkValidity(){return !this._invalid;},
      reportValidity(){},
      focus(){},select(){},
      remove(){
        if(this.parentElement){
          const a=this.parentElement.children,i=a.indexOf(this);
          if(i>=0)a.splice(i,1);
        }
        this.parentElement=null;this.removed=true;
      },
      showModal(){this.open=true;},
      close(){this.open=false;this._closePending=true;},
      finishClose(){assert.equal(this._closePending,true);this.dispatch('close');},
    };
    return e;
  }
  const body=node('body'),host=node('section');host.id='opsDailyWrap';body.append(host);
  function walk(e,id){
    if(e.id===id)return e;
    for(const child of e.children){const found=walk(child,id);if(found)return found;}
    return null;
  }
  function byTag(e,tag){
    return [ ...(e.tagName===tag?[e]:[]),...e.children.flatMap(c=>byTag(c,tag)) ];
  }
  const doc={readyState:'complete',body,createElement:node,getElementById(id){return walk(body,id);}};
  const allStores={current:'a',stores:{a:{name:'fictional A'},b:{name:'fictional B'}}};
  const before=JSON.stringify(allStores);
  const root={
    document:doc,
    InsightHooks:{on(){}},
    InsightDateContext:{getSelectedIso(){return '2026-10-26';}},
    InsightStorage:{
      transaction(live,mutate,validate,apply){
        calls.transaction++;
        if(failSave)throw Error('PRIVATE_ERROR_CANARY_NOT_FOR_STATUS');
        const next=JSON.parse(JSON.stringify(live));
        mutate(next);validate(next);apply(next);
      }
    }
  };
  const sandbox={
    window:root,globalThis:root,document:doc,allStores,store:allStores.stores.a,
    currentNav:0,
    setTimeout(fn){fn();return 1;},
    alert(text){alerts.push(String(text));},
    Date,JSON,Error,Array,Math,Number,Object,String
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const model=root.InsightHourlyCustomers;
  function state(){
    const v=model.getForecastDraftStatus();
    return JSON.parse(JSON.stringify(v));
  }
  function open(){
    const card=doc.getElementById('hourlyCustomersQuick');
    assert.ok(card,'hourly card should be rendered using original hook');
    const btn=byTag(card,'button')[0];
    btn.onclick();
    const dialog=byTag(body,'dialog').find(d=>d.open);
    assert.ok(dialog,'real openDialog must create an open fictional modal');
    return {dialog,inputs:byTag(dialog,'input'),
      save:byTag(dialog,'button').find(b=>b.textContent==='保存する'),
      cancel:byTag(dialog,'button').find(b=>b.textContent==='キャンセル'),
      close:byTag(dialog,'button').find(b=>b.textContent==='閉じる')};
  }
  return {
    model,root,allStores,before,calls,alerts,state,open,
    setFail(value){failSave=!!value;},
    byTag,body
  };
}
function assertHourStatusShape(h,expected){
  const r=h.model.getForecastDraftStatus();
  assert.equal(Object.isFrozen(r),true);
  assert.deepEqual(Object.keys(r).sort(),['dirty','epoch','initialized']);
  assert.equal(r.initialized,expected.initialized);
  assert.equal(r.dirty,expected.dirty);
  assert.equal(r.epoch,expected.epoch);
  assert.doesNotMatch(JSON.stringify(r),
    /fictional A|fictional B|PRIVATE_ERROR_CANARY_NOT_FOR_STATUS|2026-10-26|hourlyCustomers/);
}
test('P4d2 H01: uninitialized readonly API is unknown with no identifiers',()=>{
  const s=hourly.getForecastDraftStatus();
  assert.deepEqual(s,{initialized:false,dirty:null,epoch:null});
  assert.equal(Object.isFrozen(s),true);
});
test('P4d2 H02: init and untouched dialog only report local observation',()=>{
  const h=hourlyForecastFixture(),start=h.state();
  assert.equal(start.initialized,true);assert.equal(start.dirty,false);
  const ui=h.open(),opened=h.state();
  assert.equal(opened.initialized,true);assert.equal(opened.dirty,false);
  assert.ok(opened.epoch>start.epoch);
  ui.cancel.onclick();
  assertHourStatusShape(h,{initialized:false,dirty:null,epoch:h.state().epoch});
  ui.dialog.finishClose();
  const closed=h.state();
  assert.equal(closed.initialized,true);assert.equal(closed.dirty,false);
  assert.ok(closed.epoch>opened.epoch);
  assert.equal(h.calls.transaction,0);assert.equal(JSON.stringify(h.allStores),h.before);
});
test('P4d2 H03: edit including zero and blank is dirty and epoch advances',()=>{
  const h=hourlyForecastFixture(),ui=h.open(),before=h.state().epoch;
  ui.inputs[0].value='0';ui.inputs[0].dispatch('input');
  assert.equal(h.state().dirty,true);assert.ok(h.state().epoch>before);
  const first=h.state().epoch;
  ui.inputs[0].value='';ui.inputs[0].dispatch('input');
  assert.equal(h.state().dirty,true);assert.ok(h.state().epoch>first);
  ui.cancel.onclick();ui.dialog.finishClose();
  assert.equal(h.state().dirty,false);assert.equal(h.calls.transaction,0);
  assert.equal(JSON.stringify(h.allStores),h.before);
});
test('P4d2 H04: invalid numeric draft stays dirty and cannot save',()=>{
  const h=hourlyForecastFixture(),ui=h.open();
  ui.inputs[0].value='not-a-number';ui.inputs[0].dispatch('input');
  assert.equal(h.state().dirty,true);
  ui.save.onclick();
  assert.equal(h.calls.transaction,0,'validation prevents transaction');
  assert.equal(h.state().dirty,true);
  ui.cancel.onclick();ui.dialog.finishClose();
  assert.equal(h.state().dirty,false);
});
test('P4d2 H05: successful save is unknown until dialog-close event',()=>{
  const h=hourlyForecastFixture(),ui=h.open();
  ui.inputs[0].value='0';ui.inputs[0].dispatch('input');
  const before=h.state().epoch;ui.save.onclick();
  assert.equal(h.calls.transaction,1);
  assert.equal(h.state().initialized,false);
  assert.equal(h.state().dirty,null);
  assert.ok(h.state().epoch>before);
  ui.dialog.finishClose();
  assert.equal(h.state().initialized,true);
  assert.equal(h.state().dirty,false);
  assert.equal(h.allStores.stores.a.hourlyCustomers['2026-10-26'][0],0);
});
test('P4d2 H06: failing transaction is never mistaken for clean',()=>{
  const h=hourlyForecastFixture(),ui=h.open();
  ui.inputs[0].value='123';ui.inputs[0].dispatch('input');
  h.setFail(true);ui.save.onclick();
  assert.equal(h.calls.transaction,1);
  assert.equal(h.state().initialized,false);assert.equal(h.state().dirty,null);
  ui.inputs[1].value='9';ui.inputs[1].dispatch('input');
  assert.equal(h.state().initialized,false,'further typing cannot clear a failed save');
  assert.doesNotMatch(JSON.stringify(h.state()),/PRIVATE_ERROR_CANARY_NOT_FOR_STATUS/);
  assert.equal(JSON.stringify(h.allStores),h.before);
  ui.cancel.onclick();ui.dialog.finishClose();
  assert.equal(h.state().initialized,true);assert.equal(h.state().dirty,false);
});
test('P4d2 H07: cancel, close and reopening never reuses old epoch',()=>{
  const h=hourlyForecastFixture(),a=h.open();
  const first=h.state().epoch;
  a.inputs[0].value='2';a.inputs[0].dispatch('input');
  a.close.onclick();
  assert.equal(h.state().initialized,false);
  a.dialog.finishClose();
  const closed=h.state().epoch;
  const b=h.open();
  assert.ok(closed>first);assert.ok(h.state().epoch>closed);
  b.dialog.dispatch('cancel');
  assert.equal(h.state().initialized,false);
  b.dialog.close();b.dialog.finishClose();
  assert.equal(h.state().dirty,false);
});
test('P4d2 H08: original model and status never transmit raw or call external services',()=>{
  const h=hourlyForecastFixture(),ui=h.open();
  ui.inputs[2].value='12345';ui.inputs[2].dispatch('input');
  assertHourStatusShape(h,{initialized:true,dirty:true,epoch:h.state().epoch});
  assert.equal(h.calls.fetch,0);assert.equal(h.calls.model,0);
  assert.equal(h.calls.transaction,0);
  assert.equal(JSON.stringify(h.allStores),h.before);
  ui.cancel.onclick();ui.dialog.finishClose();
});
