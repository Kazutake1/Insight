/* Insight readability v1: STEP17 typography rollout for remaining core pages. */
(function(root){
  'use strict';
  if(!root.document)return;
  var doc=root.document;
  if(doc.getElementById('insightReadabilityStyle'))return;
  var style=doc.createElement('style');
  style.id='insightReadabilityStyle';
  style.textContent=[
    '#pageDash .kpi-label{font-size:13px!important;line-height:1.35}',
    '#pageDash .kpi-label>span{font-size:12px!important}',
    '#pageDash .kpi-unit{font-size:12px!important}',
    '#pageDash .kpi-badge{font-size:12px!important}',
    '#pageDash .kpi-prev{font-size:11.5px!important}',
    '#pageDash .qs-title{font-size:15px!important}',
    '.ops-field-title{font-size:13px!important}',
    '.ops-memo,.ops-stockout{font-size:14px!important;line-height:1.5}',
    '.monthly-ops-title{font-size:14px!important}',
    '.monthly-ops-label{font-size:12px!important}',
    '.monthly-ops-input{font-size:14px!important}',
    '.monthly-ops-save{font-size:13px!important}',
    '.monthly-ops-saved{font-size:12px!important}',

    '#pageSales #issRow .iss-title,#pageKyaku #ikyRow .iky-title{font-size:15px!important}',
    '#pageSales #issRow .iss-stat,#pageKyaku #ikyRow .iky-stat{font-size:13px!important}',
    '#pageSales #issRow .iss-stat strong,#pageKyaku #ikyRow .iky-stat strong{font-size:20px!important}',
    '#pageSales #issRow .iss-note,#pageKyaku #ikyRow .iky-note{font-size:12px!important;line-height:1.5!important}',
    '#pageSales #issDailyAverage,#pageKyaku #ikyDailyAverage{font-size:12.5px!important;line-height:1.45!important}',
    '#pageSales .table-card,#pageKyaku .table-card,#pageHaiki .table-card{font-size:13px!important}',
    '#pageSales .table-card th,#pageSales .table-card td,#pageKyaku .table-card th,#pageKyaku .table-card td,#pageHaiki .table-card th,#pageHaiki .table-card td{font-size:12.5px!important}',
    '#pageSales .table-card input,#pageSales .table-card select,#pageSales .table-card button,#pageKyaku .table-card input,#pageKyaku .table-card select,#pageKyaku .table-card button,#pageHaiki .table-card input,#pageHaiki .table-card select,#pageHaiki .table-card button{font-size:13px!important}',

    '#iwcRow{--iwc-height:178px!important}',
    '#iwcRow .iwc-title{font-size:14px!important}',
    '#iwcRow .iwc-sub{font-size:11.5px!important;line-height:1.35}',
    '#iwcRow .iwc-switch button{font-size:11.5px!important}',
    '#iwcRow .iwc-legends .donut-leg,#iwcRow .iwc-legends .donut-val{font-size:11.5px!important}',
    '#iwcRow .iwc-total{font-size:11.5px!important}',
    '#iwcRow .iwc-total strong{font-size:13px!important}',
    '#iwcRow .iwc-kpi-label{font-size:11.5px!important;line-height:1.2!important}',
    '#iwcRow .iwc-kpi-value{font-size:16px!important}',
    '#iwcRow .iwc-rank-tabs button{font-size:10.5px!important}',
    '#iwcRow .iwc-rank-title{font-size:11px!important}',
    '#iwcRow .iwc-increase-head .iwc-switch button{font-size:10.5px!important}',
    '#iwcRow .iwc-rank-line{font-size:11px!important;line-height:1.35!important}',
    '#iwcRow .iwc-increase-percent{font-size:10.5px!important}',
    '#iwcRow .iwc-empty{font-size:11.5px!important}',

    '#pageSalesCount .sc-toolbar{font-size:13.5px}',
    '#pageSalesCount .sc-status{font-size:12.5px!important}',
    '#pageSalesCount .sc-legend{font-size:13px!important}',
    '#pageSalesCount .sc-col-head,#pageSalesCount .sc-average-head{font-size:12.5px!important}',
    '#pageSalesCount .sc-trip input{font-size:13.5px!important}',
    '#pageSalesCount .sc-trip input.sc-not-applicable{font-size:11.5px!important}',
    '#pageSalesCount .sc-average-title{font-size:16px!important}',
    '#pageSalesCount .sc-average-row b{font-size:13px!important}',
    '#pageSalesCount .sc-card h3{font-size:15px!important}',
    '#pageSalesCount .sc-card table{font-size:12.5px!important}',
    '.sc-dialog{font-size:13px}',
    '.sc-dialog .sc-category-trips-label{font-size:12px!important}',
    '.sc-dialog .sc-category-trips label,.sc-dialog .sc-category-state{font-size:12.5px!important}',

    '.hourly-quick-status{font-size:12.5px!important;line-height:1.4}',
    '.hourly-quick-button{font-size:13px!important}',
    '.hourly-dialog{font-size:14px!important}',
    '.hourly-dialog h2{font-size:18px!important}',
    '.hourly-help{font-size:12.5px!important;line-height:1.5}',
    '.hourly-input-group h3{font-size:13px!important}',
    '.hourly-input-group label span{font-size:13px!important}',
    '.hourly-input-group input{font-size:14px!important}',
    '.hourly-dialog-summary{font-size:14px!important}',

    '#pageSettings .insight-settings-section h2{font-size:17px!important}',
    '#pageSettings .insight-settings-section>p{font-size:13px!important;line-height:1.6!important}',
    '#pageSettings .insight-settings-actions .sidebar-btn,#pageSettings #insightDataHealthButton{font-size:14px!important;line-height:1.4!important}',
    '#pageSettings .insight-settings-actions .sidebar-btn-sub{font-size:12px!important}',
    '#pageSettings .insight-theme-toggle{font-size:14px!important}',

    '.ai-workspace-target-label{font-size:12px!important}',
    '.ai-workspace-period-btn{font-size:13px!important}',
    '.ai-workspace-side-title{font-size:12px!important}',
    '.ai-workspace-section-title{font-size:17px!important}',
    '.ai-workspace-section-hint{font-size:11.5px!important}',
    '.ai-analysis-workspace .ai-analysis-card-title{font-size:13px!important}',
    '.ai-analysis-workspace .ai-analysis-comment,.ai-analysis-workspace .ai-analysis-empty{font-size:14px!important;line-height:1.6!important}',
    '.ai-insight-title{font-size:13px!important}',
    '.ai-insight-state{font-size:11.5px!important}',
    '.ai-insight-detail{font-size:13px!important;line-height:1.55!important}',
    '.ai-insight-item.is-primary .ai-insight-title{font-size:13.5px!important}',
    '.ai-insight-item.is-primary .ai-insight-detail{font-size:13.5px!important}',
    '.ai-check-text{font-size:13px!important;line-height:1.55!important}',
    '.ai-sales-count-block-title{font-size:13px!important}',
    '.ai-history-mode-btn,.ai-history-period-btn{font-size:12px!important}',
    '.ai-analysis-question-input{font-size:14px!important}',
    '.ai-analysis-question-send{font-size:13px!important}',
    '.ai-analysis-question-answer{font-size:13px!important;line-height:1.6!important}'
  ].join('');
  doc.head.appendChild(style);
})(typeof window!=='undefined'?window:globalThis);
