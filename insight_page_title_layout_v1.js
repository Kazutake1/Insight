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
function alignTitle(title,base){
  if(!title||!title.closest)return;
  var page=title.closest('.page');
  var header=title.closest('.page-header');
  if(!page||!header||header.parentElement!==page)return;
  var style=getComputedStyle(page);
  var offsetX=base.left-numberOr(style.paddingLeft,base.left);
  var offsetY=base.top-numberOr(style.paddingTop,base.top);
  title.style.setProperty('--insight-page-title-offset-x',offsetX+'px');
  title.style.setProperty('--insight-page-title-offset-y',offsetY+'px');
}
function alignAll(){
  var base=baseline();
  document.querySelectorAll(SELECTOR).forEach(function(title){alignTitle(title,base);});
}
function alignAdded(mutations){
  var base=baseline();
  mutations.forEach(function(mutation){
    mutation.addedNodes.forEach(function(node){
      if(!node||node.nodeType!==1)return;
      if(node.matches&&node.matches(SELECTOR))alignTitle(node,base);
      if(node.querySelectorAll)node.querySelectorAll(SELECTOR).forEach(function(title){alignTitle(title,base);});
    });
  });
}

var style=document.createElement('style');
style.id='insightPageTitleLayoutV1Style';
style.textContent=SELECTOR+'{align-self:flex-start!important;position:relative!important;left:var(--insight-page-title-offset-x,0px)!important;top:var(--insight-page-title-offset-y,0px)!important;}';
document.head.appendChild(style);

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
