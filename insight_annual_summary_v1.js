/* Dashboard annual summary presentation: remove 買上点数 only from 年間サマリー and improve vertical readability. */
(function(root){
  'use strict';
  if(root.InsightAnnualSummaryDisplay)return;
  if(!root.document)return;

  var doc=root.document;
  var LABELS=['売上','客数','買上点数','廃棄金額'];
  var state={found:false,removed:false,metricCount:0};

  function normalized(node){return String(node&&node.textContent||'').replace(/\s+/g,' ').trim();}
  function leaves(rootNode){
    return Array.prototype.filter.call(rootNode.querySelectorAll('*'),function(node){
      return node.children.length===0&&normalized(node);
    });
  }
  function exact(rootNode,text){
    var nodes=leaves(rootNode);
    for(var i=0;i<nodes.length;i++)if(normalized(nodes[i])===text)return nodes[i];
    return null;
  }
  function containing(rootNode,text){
    var nodes=leaves(rootNode);
    for(var i=0;i<nodes.length;i++)if(normalized(nodes[i]).indexOf(text)>=0)return nodes[i];
    return null;
  }
  function metricsForHeading(heading){
    if(!heading)return null;
    var sibling=heading.nextElementSibling;
    if(sibling&&containing(sibling,'売上')&&containing(sibling,'客数')&&containing(sibling,'廃棄金額'))return sibling;
    var parent=heading.parentElement;
    if(!parent)return null;
    var children=Array.prototype.slice.call(parent.children);
    for(var i=0;i<children.length;i++){
      var node=children[i];
      if(node!==heading&&containing(node,'売上')&&containing(node,'客数')&&containing(node,'廃棄金額'))return node;
    }
    return null;
  }
  function metricLabel(block){
    for(var i=0;i<LABELS.length;i++)if(normalized(block).indexOf(LABELS[i])>=0)return LABELS[i];
    return null;
  }
  function decorate(metrics){
    var count=0;
    Array.prototype.forEach.call(metrics.children,function(block){
      var label=metricLabel(block);
      if(!label||label==='買上点数')return;
      block.classList.add('insight-annual-summary-metric');

      var labelLeaf=containing(block,label);
      if(labelLeaf)labelLeaf.classList.add('insight-annual-summary-metric-label');

      var branches=Array.prototype.slice.call(block.children);
      var labelBranch=branches.find(function(node){return normalized(node).indexOf(label)>=0;})||null;
      var valueBranch=branches.slice().reverse().find(function(node){
        return node!==labelBranch&&normalized(node)&&LABELS.every(function(name){return normalized(node).indexOf(name)<0;});
      })||null;
      if(valueBranch)valueBranch.classList.add('insight-annual-summary-metric-value');
      count++;
    });
    return count;
  }
  function apply(){
    var page=doc.getElementById('pageDash')||doc;
    var heading=exact(page,'年間サマリー');
    if(!heading){
      state={found:false,removed:false,metricCount:0};
      return false;
    }

    var metrics=metricsForHeading(heading);
    if(!metrics){
      state={found:true,removed:false,metricCount:0};
      return false;
    }

    var section=heading.parentElement;
    if(section)section.classList.add('insight-annual-summary-enhanced');
    heading.classList.add('insight-annual-summary-title');
    metrics.classList.add('insight-annual-summary-metrics');

    var buyBlock=Array.prototype.find.call(metrics.children,function(block){
      return normalized(block).indexOf('買上点数')>=0;
    });
    if(buyBlock)buyBlock.remove();

    state={
      found:true,
      removed:Array.prototype.every.call(metrics.children,function(block){return normalized(block).indexOf('買上点数')<0;}),
      metricCount:decorate(metrics)
    };
    return state.removed;
  }

  var queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    var run=function(){queued=false;apply();};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);
    else setTimeout(run,0);
  }

  if(root.InsightHooks){
    root.InsightHooks.on('dashboard:refresh:after','annual-summary-display',schedule,70);
  }
  var target=doc.getElementById('pageDash')||doc.getElementById('main')||doc.body;
  if(target&&typeof MutationObserver!=='undefined'){
    new MutationObserver(schedule).observe(target,{childList:true,subtree:true});
  }

  root.InsightAnnualSummaryDisplay={
    refresh:apply,
    getState:function(){return {found:state.found,removed:state.removed,metricCount:state.metricCount};}
  };

  schedule();
})(typeof window!=='undefined'?window:globalThis);
