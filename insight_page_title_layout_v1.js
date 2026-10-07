/* Shared page-title alignment v1.
 * Dashboard positioning is the visual source of truth.
 * Page body padding stays untouched; only page-title visual offsets are normalized.
 */
(function(root){
'use strict';
if(root.__insightPageTitleLayoutV1)return;
root.__insightPageTitleLayoutV1=true;

var FALLBACK_LEFT=20;
var FALLBACK_TOP=16;
var SELECTOR='.page > .page-header > .page-title';

function numberOr(value,fallback){
  var n=parseFloat(value);
  return Number.isFinite(n)?n:fallback;
}
function baseline(){
  var dashboard=document.getElementById('pageDash');
  if(!dashboard)return {left:FALLBACK_LEFT,top:FALLBACK_TOP};
  var style=getComputedStyle(dashboard);
  return {
    left:numberOr(style.paddingLeft,FALLBACK_LEFT),
    top:numberOr(style.paddingTop,FALLBACK_TOP)
  };
}
function alignTitle(title){
  if(!title||!title.closest)return;
  var page=title.closest('.page');
  var header=title.closest('.page-header');
  if(!page||!header||header.parentElement!==page)return;
  title.classList.add('insight-page-title-aligned');
}
function alignAll(){
  document.querySelectorAll(SELECTOR).forEach(function(title){alignTitle(title);});
}
function alignAdded(mutations){
  mutations.forEach(function(mutation){
    mutation.addedNodes.forEach(function(node){
      if(!node||node.nodeType!==1)return;
      if(node.matches&&node.matches(SELECTOR))alignTitle(node);
      if(node.querySelectorAll)node.querySelectorAll(SELECTOR).forEach(function(title){alignTitle(title);});
    });
  });
}


alignAll();

var main=document.getElementById('main');
if(main&&typeof MutationObserver==='function'){
  new MutationObserver(alignAdded).observe(main,{childList:true,subtree:true});
}
root.addEventListener('resize',alignAll,{passive:true});

root.InsightPageTitleLayout={
  alignAll:alignAll,
  baseline:baseline
};
})(window);
