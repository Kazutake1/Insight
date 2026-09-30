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
        if(context.cancel)return context.result;
        context.result=original.apply(self,context.args);
        if(afterEvent)emit(afterEvent,context);
        return context.result;
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

  root.InsightHooks={
    on:on,
    emit:emit,
    originals:originals,
    handlers:handlers
  };
})(typeof window!=='undefined'?window:globalThis);
