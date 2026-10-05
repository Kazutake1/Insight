/* Dashboard annual summary presentation: hide 買上点数 only in 年間サマリー and improve vertical readability. */
(function(root){
  'use strict';
  if(root.InsightAnnualSummaryDisplay)return;
  if(!root.document)return;

  var doc=root.document;
  var METRIC_LABELS=['売上','客数','買上点数','廃棄金額','廃棄率','客単価','人件費','粗利率'];
  var state={found:false,removed:false,metricCount:0};

  var style=doc.createElement('style');
  style.id='insightAnnualSummaryStyle';
  style.textContent=[
    '.insight-annual-summary-enhanced .insight-annual-summary-title{font-size:16px!important;line-height:1.4!important;margin-bottom:8px!important}',
    '.insight-annual-summary-metrics{row-gap:12px!important}',
    '.insight-annual-summary-metric-label{font-size:13px!important;line-height:1.45!important;padding-top:3px!important;padding-bottom:3px!important}',
    '.insight-annual-summary-metric-value{font-size:18px!important;line-height:1.3!important;font-weight:800!important;padding-top:3px!important;padding-bottom:3px!important}'
  ].join('');
  doc.head.appendChild(style);

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
  function knownCount(node,except){
    var text=normalized(node),count=0;
    METRIC_LABELS.forEach(function(label){
      if(label!==except&&text.indexOf(label)>=0)count++;
    });
    return count;
  }
  function findAnnualRoot(heading){
    var current=heading;
    while(current&&current!==doc.body){
      var buy=exact(current,'買上点数');
      if(buy&&knownCount(current,'買上点数')>=2)return {root:current,buy:buy};
      current=current.parentElement;
    }
    return null;
  }
  function removableBlock(label,rootNode){
    var current=label;
    while(current.parentElement&&current.parentElement!==rootNode){
      var parent=current.parentElement;
      if(normalized(parent).indexOf('年間サマリー')>=0||knownCount(parent,'買上点数')>0)break;
      current=parent;
    }
    return current;
  }
  function decorateMetricContainer(container){
    if(!container)return 0;
    container.classList.add('insight-annual-summary-metrics');
    var count=0;
    Array.prototype.forEach.call(container.children,function(block){
      if(block.dataset&&block.dataset.insightAnnualSummaryRemoved==='1')return;
      var blockText=normalized(block),labelName=null;
      METRIC_LABELS.forEach(function(label){
        if(label!=='買上点数'&&!labelName&&blockText.indexOf(label)>=0)labelName=label;
      });
      if(!labelName)return;
      block.classList.add('insight-annual-summary-metric');
      var labelNode=exact(block,labelName);
      if(labelNode)labelNode.classList.add('insight-annual-summary-metric-label');
      leaves(block).forEach(function(node){
        var text=normalized(node);
        if(node===labelNode)return;
        if(/[0-9０-９]/.test(text)||/[¥￥%％円人点千]/.test(text)||text==='—'||text==='-'){
          node.classList.add('insight-annual-summary-metric-value');
        }
      });
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

    var enhanced=heading.closest('.insight-annual-summary-enhanced');
    if(enhanced){
      heading.classList.add('insight-annual-summary-title');
      var metrics=enhanced.querySelector('.insight-annual-summary-metrics');
      state={found:true,removed:!exact(enhanced,'買上点数'),metricCount:decorateMetricContainer(metrics)};
      return true;
    }

    var match=findAnnualRoot(heading);
    if(!match){
      state={found:true,removed:false,metricCount:0};
      return false;
    }

    var rootNode=match.root,buy=match.buy;
    rootNode.classList.add('insight-annual-summary-enhanced');
    heading.classList.add('insight-annual-summary-title');

    var block=removableBlock(buy,rootNode);
    var container=block&&block.parentElement;
    if(block&&container){
      block.dataset.insightAnnualSummaryRemoved='1';
      block.remove();
    }

    state={
      found:true,
      removed:!exact(rootNode,'買上点数'),
      metricCount:decorateMetricContainer(container)
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
