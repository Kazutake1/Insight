/* Insight shell loader v1: compressed payload loader and feature manifest owner. */
(function(){
var files=['insight_payload_v1_part01a.txt','insight_payload_v1_part01b.txt','insight_payload_v1_part02.txt','insight_payload_v1_part03.txt','insight_payload_v1_part04a.txt','insight_payload_v1_part04b.txt','insight_payload_v1_part05.txt','insight_payload_v1_part06.txt','insight_payload_v1_part07.txt'];
function stripPayloadChartScript(html){
  var re=/<script\b(?=[^>]*\bsrc=["']https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js\/4\.4\.1\/chart\.umd\.min\.js["'])[^>]*>[\s\S]*?<\/script>/i;
  if(!re.test(html))throw new Error('Chart.jsの旧payload依存タグが見つかりません');
  return html.replace(re,'');
}
function fail(e){document.body.innerHTML='<div style="padding:24px;font-family:-apple-system,sans-serif;color:#b42318">Insightの読み込みに失敗しました。<br><small>'+String(e&&e.message?e.message:e)+'</small></div>';}
if(typeof pako==='undefined'){fail(new Error('展開ライブラリを読み込めませんでした'));return;}
if(typeof Chart==='undefined'){fail(new Error('グラフライブラリを読み込めませんでした'));return;}
Promise.all(files.map(function(file){return fetch('./'+file+'?v=20260905-2',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(file+' の取得に失敗しました ('+r.status+')');return r.text();});})).then(function(parts){
var b64=parts.join('').replace(/\s/g,''),bin=atob(b64),bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);var html=pako.ungzip(bytes,{to:'string'});if(html.indexOf('<!DOCTYPE html>')!==0&&html.indexOf('<!doctype html>')!==0)throw new Error('HTMLデータの検証に失敗しました');
html=stripPayloadChartScript(html);
// STEP5 complete: payload source is self-contained; feature modules are inserted before document.write().
var orderedFeatureLoads=[
  './insight_legacy_style_compat_v1.js?v=20261006-core-contrast-runtime-1',
  './insight_weather_icon_compat_v1.js?v=20261006-weather-icons-runtime-1',
  './insight_weather_keys_compat_v1.js?v=20261006-weather-keys-runtime-1',
  './insight_yoy_policy_v1.js?v=20260930-1',
  './insight_ai_compat_core_v1.js?v=20261003-ai-pipeline-1',
  './insight_date_context_v1.js?v=20260930-1',
  './insight_hooks_v1.js?v=20260930-hooks2',
  './insight_storage_v1.js?v=20261003-restore-readback',
  './insight_persist_guard_v1.js?v=20261006-persist-runtime-1',
  './insight_year_manager_v1.js?v=20261002-year-delete-consistency',
  './insight_ops_v1.js?v=20260930-step5-2',
  './insight_preserve_dailyops_v1.js?v=20260930-hooks3',
  './insight_quick_date_nav_v1.js?v=20261006-keep-picker-open',
  './insight_ops_kpifix_v1.js?v=20260930-hooks1',
  './insight_ai_ops_v1.js?v=20260930-hooks2',
  './insight_backup_guard_v1.js?v=20261003-post-restore-verify',
  './insight_data_health_v1.js?v=20261002-data-health',
  './insight_waste_insights_v1.js?v=20260930-hooks2',
  './insight_dashboard_year_fix_v1.js?v=20261006-legacy-year-cleanup-1',
  './insight_kyaku_insights_v1.js?v=20260930-hooks2',
  './insight_sales_insights_v1.js?v=20260930-hooks2',
  './insight_dashboard_kpi_sync_v1.js?v=20261006-yen-suffix',
  './insight_kpi_order_v1.js?v=20260930-hooks1',
  './insight_annual_summary_v1.js?v=20261005-remove-items-3',
  './insight_ai_presentation_v1.js?v=20261006-header-compact-1',
  './insight_ai_visual_v1.js?v=20261006-balanced-layout-1',
  './insight_events_v1.js?v=20261006-multi-location-1',
  './insight_hourly_customers_v1.js?v=20261006-remove-help',
  './insight_temperature_v1.js?v=20260930-hooks1',
  './insight_weather_compact_v1.js?v=20260930-hooks1',
  './insight_weather_temperature_auto_v1.js?v=20260930-hooks1',
  './insight_weather_location_v1.js?v=20260930-security1',
  './insight_input_weather_temp_v1.js?v=20260929-round1',
  './insight_sales_count_v1.js?v=20261005-ipad-container-fit',
  './insight_sale_results_v1.js?v=20261006-sale-note-1',
  './insight_page_title_layout_v1.js?v=20261002-title-align',
  './insight_page_period_sync_v1.js?v=20261001-route-order',
  './insight_sales_period_selector_v1.js?v=20261006-input-period-runtime-2',
  './insight_analysis_period_lock_v1.js?v=20261001-sync-owner',
  './insight_analysis_context_v1.js?v=20261004-special-demand',
  './insight_multiyear_analysis_v1.js?v=20261003-multiyear-1',
  './insight_weekday_analysis_v1.js?v=20261003-weekday-1',
  './insight_sale_impact_v1.js?v=20261003-sale-impact-1',
  './insight_event_impact_v1.js?v=20261003-event-impact-1',
  './insight_seasonality_analysis_v1.js?v=20261003-seasonality-1',
  './insight_anomaly_explanation_v1.js?v=20261003-anomaly-context-1',
  './insight_event_results_v1.js?v=20261006-single-day-1',
  './insight_daily_anomaly_v1.js?v=20261003-anomaly-context-1',
  './insight_weekly_review_v1.js?v=20261001-step4',
  './insight_monthly_review_v1.js?v=20261001-step5',
  './insight_analysis_history_v1.js?v=20261001-step6',
  './insight_analysis_bundle_v1.js?v=20261003-bundle-1',
  './insight_ai_interpretation_v1.js?v=20261001-decision-analysis',
  './insight_ai_context_v1.js?v=20261003-ai-pipeline-1',
  './insight_ai_page_comments_v1.js?v=20261001-decision-analysis',
  './insight_settings_v1.js?v=20261003-theme-bridge-hidden',
  './insight_year_controls_layout_v1.js?v=20261006-month-selected-border-2',
  './insight_dark_theme_v1.js?v=20261003-firefox-dark-1',
  './insight_readability_v1.js?v=20261005-kpi-yoy-nowrap',
  './insight_input_chart_cleanup_v1.js?v=20261006-remove-chart-copy-1',
  './insight_weekday_chart_fix_v1.js?v=20261006-waste-zero-past-1',
  './insight_weekday_chart_spacing_v1.js?v=20261006-fill-height-2'
];
function featureSignature(entries){
  var text=entries.join('\n'),hash=2166136261;
  for(var i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return ('00000000'+(hash>>>0).toString(16)).slice(-8);
}
var currentFeatureSignature=featureSignature(orderedFeatureLoads);
window.__INSIGHT_FEATURE_SIGNATURE__=currentFeatureSignature;
try{
  fetch('./insight_shell_loader_v1.js?insight_manifest_probe='+Date.now(),{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('manifest probe '+r.status);
    return r.text();
  }).then(function(text){
    var start=text.indexOf('var orderedFeatureLoads=['),end=text.indexOf('];',start);
    if(start<0||end<=start)return;
    var remoteEntries=[];
    text.slice(start,end+2).replace(/'([^']+)'/g,function(match,entry){remoteEntries.push(entry);return match;});
    if(!remoteEntries.length)return;
    var remoteFeatureSignature=featureSignature(remoteEntries);
    if(remoteFeatureSignature!==currentFeatureSignature){
      location.replace('./Index.html?insight_build='+encodeURIComponent(window.__INSIGHT_SHELL_VERSION__)+'&insight_manifest='+encodeURIComponent(remoteFeatureSignature));
    }
  }).catch(function(){});
}catch(_){}
var orderedFeatureHtml=orderedFeatureLoads.map(function(entry){return '<script src="'+entry+'"></scr'+'ipt>';}).join('');
html=html.replace('</body>',orderedFeatureHtml+'</body>');
document.open();document.write(html);document.close();
}).catch(fail);
})();
