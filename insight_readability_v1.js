/* Insight readability v1: STEP17 typography rollout for remaining core pages. */
(function(root){
  'use strict';
  if(!root.document)return;
  var doc=root.document;
  if(doc.getElementById('insightReadabilityStyle'))return;
  var style=doc.createElement('style');
  style.id='insightReadabilityStyle';
  style.textContent=[
    '#main{padding-left:0!important;padding-right:0!important;min-width:0!important;box-sizing:border-box!important}',
    '.page{padding-left:12px!important;padding-right:12px!important;box-sizing:border-box!important;min-width:0!important;max-width:100%!important}',





    '.ai-analysis-workspace .ai-analysis-card-title{font-size:13px!important}',
    '.ai-analysis-workspace .ai-analysis-comment,.ai-analysis-workspace .ai-analysis-empty{font-size:14px!important;line-height:1.6!important}'
  ].join('');
  doc.head.appendChild(style);
  if(root.InsightPageTitleLayout&&typeof root.InsightPageTitleLayout.alignAll==='function')root.InsightPageTitleLayout.alignAll();
  root.InsightReadability={VERSION:1};
})(typeof window!=='undefined'?window:globalThis);
