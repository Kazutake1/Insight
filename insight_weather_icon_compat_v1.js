/* Weather icon lexical compatibility v1.
 * Extends the legacy payload's mutable WX_ICONS object without rewriting compressed payload source.
 */
(function(root){
'use strict';
if(root.__insightWeatherIconCompatV1)return;
root.__insightWeatherIconCompatV1=true;

function apply(){
  if(typeof WX_ICONS==='undefined'||!WX_ICONS||typeof WX_ICONS!=='object'){
    throw new Error('Insight weather icon map is unavailable');
  }
  WX_ICONS['霧']='🌫️';
  WX_ICONS['凍雨']='🧊';
  WX_ICONS['雷雨']='🌩️';
  return WX_ICONS;
}

apply();
root.InsightWeatherIconCompat={VERSION:1,apply:apply};
})(typeof window!=='undefined'?window:globalThis);
