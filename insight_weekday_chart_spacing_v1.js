/* Weekday chart spacing v1: remove excess space below weekday charts only. */
(function(root){
  'use strict';
  if(!root.document||root.InsightWeekdayChartSpacing)return;
  var doc=root.document;
  var style=doc.createElement('style');
  style.id='insight-weekday-chart-spacing-style';
  style.textContent=[
    '.haiki-chart-card:has(#salesWdChart),.haiki-chart-card:has(#kyakuWdChart),.haiki-chart-card:has(#haikiWdChart){display:flex!important;flex-direction:column!important}',
    '#salesWdChart,#kyakuWdChart,#haikiWdChart{display:block!important;margin-bottom:0!important}',
    '#pageSales *:has(> #salesWdChart),#pageKyaku *:has(> #kyakuWdChart),#pageHaiki *:has(> #haikiWdChart){height:auto!important;min-height:105px;flex:1 1 0!important;padding-bottom:0!important;margin-bottom:0!important}'
  ].join('\n');
  (doc.head||doc.documentElement).appendChild(style);
  root.InsightWeekdayChartSpacing={version:1};
})(typeof window!=='undefined'?window:globalThis);
