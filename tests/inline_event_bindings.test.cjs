const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('dynamic controls use delegated listeners instead of CSP-blocked inline attributes',()=>{
  const core=read('insight_payload_core_v1.js');
  assert.doesNotMatch(core,/\son(?:click|keydown)\s*=/i);
  for(const marker of [
    'id="ayAddBtn"',
    'id="haikiBudgetEditBtn"',
    'data-sales-weather=',
    'data-ri=',
    'id="installBannerAddBtn"',
    'id="installBannerCloseBtn"',
    'id="iosHintCloseBtn"'
  ])assert.ok(core.includes(marker),'missing marker '+marker);
});

test('delegated controls preserve existing actions and never write persisted data',()=>{
  const calls=[];
  const listeners={};
  const input={id:'ayInput',value:'2027'};
  const wrap={id:'addYearInlineWrap',innerHTML:'nonempty'};
  const nodes={ayInput:input,addYearInlineWrap:wrap};
  const doc={
    getElementById(id){return nodes[id]||null;},
    querySelectorAll(){return [];},
    addEventListener(event,handler){(listeners[event]||(listeners[event]=[])).push(handler);}
  };
  const window={
    document:doc,
    addYear:value=>calls.push(['addYear',value]),
    openBudgetModal:()=>calls.push(['openBudgetModal']),
    setSalesWeather:(row,weather)=>calls.push(['setSalesWeather',row,weather]),
    doInstall:()=>calls.push(['doInstall'])
  };
  vm.runInNewContext(read('insight_payload_bindings_v1.js'),{window});
  assert.equal(listeners.keydown.length,1);
  assert.equal(listeners.click.length,1);
  const fire=(type,target,key)=>{
    for(const handler of listeners[type]||[])handler({target,key});
  };
  const button=(id,attributes,ancestor)=>{
    const attrs=attributes||{};
    return {
      id,
      hasAttribute(name){return Object.prototype.hasOwnProperty.call(attrs,name);},
      getAttribute(name){return attrs[name]??null;},
      closest(selector){
        if(selector.startsWith('#ayAddBtn,'))return this;
        if(selector==='#installBanner'||selector==='#iosHint')return ancestor||null;
        return null;
      }
    };
  };

  fire('keydown',input,'Enter');
  fire('click',button('ayAddBtn'));
  fire('keydown',input,'Escape');
  assert.equal(wrap.innerHTML,'');
  fire('click',button('haikiBudgetEditBtn'));
  fire('click',button('',{'data-ri':'5','data-sales-weather':'晴'}));
  fire('click',button('installBannerAddBtn'));
  let bannerClosed=0,iosClosed=0;
  fire('click',button('installBannerCloseBtn',{}, {remove(){bannerClosed++;}}));
  fire('click',button('iosHintCloseBtn',{}, {remove(){iosClosed++;}}));
  assert.deepEqual(calls,[
    ['addYear','2027'],
    ['addYear','2027'],
    ['openBudgetModal'],
    ['setSalesWeather',5,'晴'],
    ['doInstall']
  ]);
  assert.equal(bannerClosed,1);
  assert.equal(iosClosed,1);
  assert.equal(window.InsightPayloadBindings.VERSION,1);
});
