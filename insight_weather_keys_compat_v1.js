/* Weather key lexical compatibility v1.
 * Extends the legacy payload's mutable WX_KEYS array without rewriting compressed payload source.
 */
(function(root){
'use strict';
if(root.__insightWeatherKeysCompatV1)return;
root.__insightWeatherKeysCompatV1=true;

var REQUIRED=['霧','凍雨','雷雨'];

function apply(){
  if(typeof WX_KEYS==='undefined'||!Array.isArray(WX_KEYS)){
    throw new Error('Insight weather key list is unavailable');
  }
  REQUIRED.forEach(function(wx){
    if(WX_KEYS.indexOf(wx)<0)WX_KEYS.push(wx);
  });
  return WX_KEYS;
}

apply();
root.InsightWeatherKeysCompat={VERSION:1,REQUIRED:REQUIRED.slice(),apply:apply};
})(typeof window!=='undefined'?window:globalThis);
