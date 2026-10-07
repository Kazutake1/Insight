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
    '#pageDash .qs-title{font-size:15px!important}',
    '.ops-field-title{font-size:13px!important}',
    '.ops-memo,.ops-stockout{font-size:14px!important;line-height:1.5}',
    '.monthly-ops-title{font-size:14px!important}',
    '.monthly-ops-label{font-size:12px!important}',
    '.monthly-ops-input{font-size:14px!important}',
    '.monthly-ops-save{font-size:13px!important}',
    '.monthly-ops-saved{font-size:12px!important}',

    '#pageSales #issDailyAverage,#pageKyaku #ikyDailyAverage{font-size:12.5px!important;line-height:1.45!important}',
    '#pageSales .table-card,#pageKyaku .table-card,#pageHaiki .table-card{font-size:13px!important}',
    '#pageSales .table-card th,#pageSales .table-card td,#pageKyaku .table-card th,#pageKyaku .table-card td,#pageHaiki .table-card th,#pageHaiki .table-card td{font-size:12.5px!important}',
    '#pageSales .table-card input,#pageSales .table-card select,#pageSales .table-card button,#pageKyaku .table-card input,#pageKyaku .table-card select,#pageKyaku .table-card button,#pageHaiki .table-card input,#pageHaiki .table-card select,#pageHaiki .table-card button{font-size:13px!important}',




    '.ai-analysis-workspace .ai-analysis-card-title{font-size:13px!important}',
    '.ai-analysis-workspace .ai-analysis-comment,.ai-analysis-workspace .ai-analysis-empty{font-size:14px!important;line-height:1.6!important}'
  ].join('');
  doc.head.appendChild(style);
  if(root.InsightPageTitleLayout&&typeof root.InsightPageTitleLayout.alignAll==='function')root.InsightPageTitleLayout.alignAll();
  root.InsightReadability={VERSION:1};
})(typeof window!=='undefined'?window:globalThis);
