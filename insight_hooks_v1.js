/* Shared hook bridge v1: wrap high-traffic core functions once, then let modules subscribe. */
(function(root){
  'use strict';
  if(root.InsightHooks)return;

  var handlers=Object.create(null);
  var sequence=0;

  function list(name){
    if(!handlers[name])handlers[name]=[];
    return handlers[name];
  }

  function on(name,id,fn,priority){
    if(typeof id==='function'){priority=fn;fn=id;id='anonymous-'+(++sequence);}
    if(typeof fn!=='function')throw new Error('Hook handler must be a function.');
    var bucket=list(name);
    if(id&&bucket.some(function(item){return item.id===id;}))return function(){};
    var item={id:id||('anonymous-'+(++sequence)),fn:fn,priority:Number(priority)||100,order:sequence++};
    bucket.push(item);
    bucket.sort(function(a,b){return a.priority-b.priority||a.order-b.order;});
    return function(){
      var i=bucket.indexOf(item);
      if(i>=0)bucket.splice(i,1);
    };
  }

  function emit(name,context){
    var bucket=(handlers[name]||[]).slice();
    for(var i=0;i<bucket.length;i++){
      var value=bucket[i].fn(context);
      if(value===false)context.cancel=true;
      if(context.cancel)break;
    }
    return context;
  }

  function runScoped(dateScoped,callback){
    var dc=root.InsightDateContext;
    if(dateScoped&&dc&&typeof dc.withLegacyGlobals==='function')return dc.withLegacyGlobals(callback);
    return callback();
  }

  // Registered Quick save only. Hooks loads before the observer factory, so initialize lazily.
  var quickSaveObserver=null,quickSaveFault=false,quickSaveActive=0,quickSaveInitClosed=false;
  var quickSaveScope='quick-save-core-and-sync-after-hooks-only';
  function quickSaveStatus(){
    var scope=quickSaveScope;
    if(quickSaveFault)return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});
    if(!quickSaveObserver)return Object.freeze({scope:scope,state:'UNAVAILABLE',activeCount:null,epoch:null});
    try{
      var s=quickSaveObserver.status();
      if(!s||s.scope!=='registered-operations-only'||
        ['IDLE_OBSERVED','ACTIVE','HELD'].indexOf(s.state)<0||
        !Number.isSafeInteger(s.activeCount)||s.activeCount<0||
        !Number.isSafeInteger(s.epoch)||s.epoch<1||
        s.activeCount<quickSaveActive||
        (s.state==='IDLE_OBSERVED'&&s.activeCount!==0)||
        (s.state==='ACTIVE'&&s.activeCount===0)||
        (quickSaveActive>0&&s.state!=='ACTIVE'&&s.state!=='HELD'))
        throw new Error('invalid quick save observer status');
      return Object.freeze({scope:scope,state:s.state,activeCount:s.activeCount,epoch:s.epoch});
    }catch(_){quickSaveFault=true;return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});}
  }
  function initQuickSaveObserver(){
    if(quickSaveObserver||quickSaveFault||quickSaveInitClosed)return;
    try{
      var factory=root.InsightOperationObserverV0&&root.InsightOperationObserverV0.createOperationObserver;
      if(typeof factory!=='function')return;
      var candidate=factory();
      if(!candidate||['initialize','begin','end','invalidate','status'].some(function(k){
        return typeof candidate[k]!=='function';
      })||candidate.initialize()!==true){quickSaveFault=true;return;}
      quickSaveObserver=candidate;
      var initial=quickSaveStatus();
      if(initial.state!=='IDLE_OBSERVED'||initial.activeCount!==0)quickSaveFault=true;
    }catch(_){quickSaveFault=true;}
  }
  function observeQuickSave(action,context){
    initQuickSaveObserver();
    // A factory appearing during an unobserved save must not report that save IDLE.
    quickSaveInitClosed=true;
    var ref=quickSaveObserver,token=null,registered=false,outcome='unknown';
    if(ref&&!quickSaveFault){
      try{
        token=ref.begin('quick_daily_save');
        if(!token||typeof token!=='object'||quickSaveActive>=Number.MAX_SAFE_INTEGER){
          quickSaveFault=true;
        }else{
          registered=true;quickSaveActive++;
          if(quickSaveStatus().state!=='ACTIVE')quickSaveFault=true;
        }
      }catch(_){quickSaveFault=true;}
    }
    try{
      var result=action();
      if(context.cancel!==true&&context.state.quickSaveObservationFailed!==true)outcome='completed';
      return result;
    }finally{
      if(registered){
        try{if(ref.end(token,outcome)!==true)quickSaveFault=true;}
        catch(_){quickSaveFault=true;}
        quickSaveActive--;
        if(!quickSaveFault)quickSaveStatus();
      }
    }
  }
  // Exposes state only, never business data or permission decisions.
  root.InsightQuickSaveObserverV0=Object.freeze({getStatus:function(){initQuickSaveObserver();return quickSaveStatus();}});


  // STEP4 GATE-3: Only the sales/customers/waste input save core + synchronous after hooks.
  // This observer cannot authorize model input or assert whole-application cleanliness.
  var inputSaveObserver=null,inputSaveFault=false,inputSaveActive=0,inputSaveInitClosed=false;
  var inputSaveScope='input-month-save-core-and-sync-after-hooks-only';
  function inputSaveStatus(){
    var scope=inputSaveScope;
    if(inputSaveFault)return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});
    if(!inputSaveObserver)return Object.freeze({scope:scope,state:'UNAVAILABLE',activeCount:null,epoch:null});
    try{
      var s=inputSaveObserver.status();
      if(!s||s.scope!=='registered-operations-only'||
        ['IDLE_OBSERVED','ACTIVE','HELD'].indexOf(s.state)<0||
        !Number.isSafeInteger(s.activeCount)||s.activeCount<0||
        !Number.isSafeInteger(s.epoch)||s.epoch<1||
        s.activeCount<inputSaveActive||
        (s.state==='IDLE_OBSERVED'&&s.activeCount!==0)||
        (s.state==='ACTIVE'&&s.activeCount===0)||
        (inputSaveActive>0&&s.state!=='ACTIVE'&&s.state!=='HELD'))
        throw new Error('invalid input save observer status');
      return Object.freeze({scope:scope,state:s.state,activeCount:s.activeCount,epoch:s.epoch});
    }catch(_){inputSaveFault=true;return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});}
  }
  function initInputSaveObserver(){
    if(inputSaveObserver||inputSaveFault||inputSaveInitClosed)return;
    try{
      var factory=root.InsightOperationObserverV0&&root.InsightOperationObserverV0.createOperationObserver;
      if(typeof factory!=='function')return;
      var candidate=factory();
      if(!candidate||['initialize','begin','end','invalidate','status'].some(function(k){
        return typeof candidate[k]!=='function';
      })||candidate.initialize()!==true){inputSaveFault=true;return;}
      inputSaveObserver=candidate;
      var initial=inputSaveStatus();
      if(initial.state!=='IDLE_OBSERVED'||initial.activeCount!==0)inputSaveFault=true;
    }catch(_){inputSaveFault=true;}
  }
  function observeInputSave(action,context){
    initInputSaveObserver();
    // Do not retroactively mark an unobserved save IDLE if the factory appears later.
    inputSaveInitClosed=true;
    var ref=inputSaveObserver,token=null,registered=false,outcome='unknown';
    if(ref&&!inputSaveFault){
      try{
        token=ref.begin('input_month_save');
        if(!token||typeof token!=='object'||inputSaveActive>=Number.MAX_SAFE_INTEGER){
          inputSaveFault=true;
        }else{
          registered=true;inputSaveActive++;
          if(inputSaveStatus().state!=='ACTIVE')inputSaveFault=true;
        }
      }catch(_){inputSaveFault=true;}
    }
    try{
      var result=action();
      if(context.cancel!==true)outcome='completed';
      return result;
    }finally{
      if(registered){
        try{if(ref.end(token,outcome)!==true)inputSaveFault=true;}
        catch(_){inputSaveFault=true;}
        inputSaveActive--;
        if(!inputSaveFault)inputSaveStatus();
      }
    }
  }
  root.InsightInputSaveObserverV0=Object.freeze({getStatus:function(){initInputSaveObserver();return inputSaveStatus();}});

  var originals={};

  function bridge(functionName,beforeEvent,afterEvent,dateScoped){
    var original=root[functionName];
    if(typeof original!=='function'||original.__insightHookBridge)return;
    originals[functionName]=original;
    var wrapped=function(){
      var self=this,args=Array.prototype.slice.call(arguments);
      return runScoped(dateScoped,function(){
        var context={name:functionName,thisArg:self,args:args,state:{},cancel:false,result:undefined};
        if(beforeEvent)emit(beforeEvent,context);
        if(context.cancel){
          if(afterEvent&&context.afterOnCancel)emit(afterEvent,context);
          return context.result;
        }
        var execute=function(){
          context.result=original.apply(self,context.args);
          if(afterEvent)emit(afterEvent,context);
          return context.result;
        };
        // Validation cancellation remains outside the registered save operation.
        if(functionName==='saveQuick')return observeQuickSave(execute,context);
        if(functionName==='saveInput'&&['sales','kyaku','haiki'].indexOf(context.args[0])>=0)
          return observeInputSave(execute,context);
        return execute();
      });
    };
    wrapped.__insightHookBridge=true;
    wrapped.__insightOriginal=original;
    root[functionName]=wrapped;
  }

  bridge('renderQuickPage',null,'quick:render:after',true);
  bridge('saveQuick','quick:save:before','quick:save:after',true);
  bridge('renderKPI',null,'dashboard:kpi:after',false);
  bridge('renderDerived',null,'dashboard:derived:after',false);
  bridge('refreshDash',null,'dashboard:refresh:after',false);
  bridge('renderTable',null,'input:table:after',false);
  bridge('saveInput','input:save:before','input:save:after',false);
  bridge('renderAIAnalysisPanel','ai:render:before','ai:render:after',false);
  bridge('buildAIQuestionAnswer','ai:question:before','ai:question:after',false);

  root.InsightHooks={
    on:on,
    emit:emit,
    originals:originals,
    handlers:handlers
  };
})(typeof window!=='undefined'?window:globalThis);
