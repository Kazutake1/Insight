/* Input chart cleanup v1: remove selected explanatory labels from sales/customer/waste charts only. */
(function(root){
  'use strict';
  if(root.InsightInputChartCleanup)return;
  if(!root.document)return;

  var doc=root.document;
  var RULES={
    pageSales:['月合計','グラフをタップで日付選択'],
    pageKyaku:['月合計'],
    pageHaiki:['月合計']
  };

  function normalized(node){return String(node&&node.textContent||'').replace(/\s+/g,' ').trim();}
  function depth(node){
    var n=0;
    while(node&&node.parentElement){n++;node=node.parentElement;}
    return n;
  }
  function removeExact(rootNode,text){
    var matches=Array.prototype.slice.call(rootNode.querySelectorAll('*')).filter(function(node){
      return normalized(node)===text;
    });
    if(!matches.length)return false;
    matches.sort(function(a,b){return depth(b)-depth(a);});
    var target=matches[0],parent=target.parentElement;
    target.remove();
    if(parent&&/^(P|SMALL)$/.test(parent.tagName)&&normalized(parent)===''&&parent.children.length===0)parent.remove();
    return true;
  }
  function apply(){
    Object.keys(RULES).forEach(function(id){
      var page=doc.getElementById(id);
      if(!page)return;
      RULES[id].forEach(function(text){removeExact(page,text);});
    });
  }

  var queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    var run=function(){queued=false;apply();};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);
    else setTimeout(run,0);
  }

  root.InsightInputChartCleanup={refresh:apply};

  function init(){
    schedule();
    var main=doc.getElementById('main')||doc.body;
    if(main&&typeof MutationObserver!=='undefined'){
      new MutationObserver(schedule).observe(main,{childList:true,subtree:true,characterData:true});
    }
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
