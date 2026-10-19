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
  // Fallback emoji remain available in legacy text-only UI.
  WX_ICONS['大雨']='🌧️';
  WX_ICONS['大雪']='🌨️';
  return WX_ICONS;
}

apply();

/* Presentation-only SVGs for all 11 current weather choices; stored weather labels are never migrated. */
var CLOUD='<path d="M10 24h20a5 5 0 0 0-.4-10 8.4 8.4 0 0 0-15.8-2A6.2 6.2 0 0 0 10 24Z"/>';
function flake(x,y,r){
  return '<path d="M'+(x-r)+' '+y+'h'+(r*2)+'M'+x+' '+(y-r)+'v'+(r*2)+
    'M'+(x-r*0.75)+' '+(y-r*0.75)+'l'+(r*1.5)+' '+(r*1.5)+
    'M'+(x+r*0.75)+' '+(y-r*0.75)+'l'+(-r*1.5)+' '+(r*1.5)+'"/>';
}
// Shared 40x40 geometry and a consistent 2.25px stroke for all 11 choices.
var SUN='<circle cx="20" cy="20" r="8"/>'+
  '<path d="M20 3v6M20 31v6M3 20h6M31 20h6M8 8l4.3 4.3M27.7 27.7L32 32M8 32l4.3-4.3M27.7 12.3L32 8"/>';
var PARTIAL_SUN='<circle cx="14" cy="13" r="5.5"/>'+
  '<path d="M14 3v3M14 20v3M4 13h3M21 13h3M7 6l2 2M21 20l2 2M7 20l2-2M21 6l2 2"/>';
var SMALL_CLOUD='<path d="M17 29h15a4.5 4.5 0 0 0-.5-9 6 6 0 0 0-11-1.6A5.5 5.5 0 0 0 17 29Z"/>';
var CLOUDY_SUN='<circle cx="10" cy="12" r="5"/>'+
  '<path d="M10 3v2M3 12h2M16 6l2-2M4 5l2 2"/>';
var SVG_BODY={
  '快晴':SUN,
  '晴':PARTIAL_SUN+SMALL_CLOUD,
  '晴曇':CLOUDY_SUN+CLOUD,
  '曇':CLOUD,
  '小雨':CLOUD+'<path d="M15 28l-1.4 4M26 28l-1.4 4"/>',
  '雨':CLOUD+'<path d="M13 27l-2 5M21 27l-2 5M29 27l-2 5"/>',
  '大雨':CLOUD+'<path d="M11 27l-2 6M17 27l-2 6M23 27l-2 6M29 27l-2 6"/>',
  '雷雨':CLOUD+'<path d="M12 27l-2 4M29 27l-2 4M22 25l-6 7h5l-3 6"/>',
  'みぞれ':CLOUD+'<path d="M12 27l-2 5M18 27l-2 5"/>'+flake(28,31,2.5),
  '雪':CLOUD+flake(15,30,2.5)+flake(26,30,2.5),
  '大雪':CLOUD+flake(11,28,2)+flake(20,28,2)+flake(29,28,2)+flake(15,35,2)+flake(25,35,2)
};
function markup(wx){
  if(Object.prototype.hasOwnProperty.call(SVG_BODY,wx)){
    return '<svg class="iwx-weather-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="img" aria-label="'+wx+
      '" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">'+SVG_BODY[wx]+'</svg>';
  }
  return WX_ICONS[wx]||'';
}
function render(el,wx){
  if(!el)return;
  if(Object.prototype.hasOwnProperty.call(SVG_BODY,wx))el.innerHTML=markup(wx);
  else el.textContent=markup(wx);
}
root.InsightWeatherIconCompat={VERSION:3,apply:apply,markup:markup,render:render};
})(typeof window!=='undefined'?window:globalThis);
