/* Weather key lexical compatibility v1.
 * Extends the legacy payload's mutable WX_KEYS array without rewriting compressed payload source.
 */
(function(root){
'use strict';
if(root.__insightWeatherKeysCompatV1)return;
root.__insightWeatherKeysCompatV1=true;

var REQUIRED=['大雪','雷雨'];
var HIDDEN=['霧','凍雨'];

function apply(){
  if(typeof WX_KEYS==='undefined'||!Array.isArray(WX_KEYS)){
    throw new Error('Insight weather key list is unavailable');
  }
  // Hide obsolete choices without rewriting historical records.
  HIDDEN.forEach(function(wx){var i=WX_KEYS.indexOf(wx);if(i>=0)WX_KEYS.splice(i,1);});
  REQUIRED.forEach(function(wx){
    if(WX_KEYS.indexOf(wx)<0)WX_KEYS.push(wx);
  });
  return WX_KEYS;
}

apply();
root.InsightWeatherKeysCompat={VERSION:2,REQUIRED:REQUIRED.slice(),HIDDEN:HIDDEN.slice(),apply:apply};
})(typeof window!=='undefined'?window:globalThis);
