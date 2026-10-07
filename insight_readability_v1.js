/* Insight readability v1: STEP17 typography rollout for remaining core pages. */
(function(root){
  'use strict';
  if(!root.document)return;
  var doc=root.document;
  if(doc.getElementById('insightReadabilityStyle'))return;
  if(root.InsightPageTitleLayout&&typeof root.InsightPageTitleLayout.alignAll==='function')root.InsightPageTitleLayout.alignAll();
  root.InsightReadability={VERSION:1};
})(typeof window!=='undefined'?window:globalThis);
