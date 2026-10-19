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

/* Presentation-only SVGs; stored weather labels are never migrated. */
var CLOUD='<path d="M10 24h20a5 5 0 0 0-.4-10 8.4 8.4 0 0 0-15.8-2A6.2 6.2 0 0 0 10 24Z"/>';
function flake(x,y,r){
  return '<path d="M'+(x-r)+' '+y+'h'+(r*2)+'M'+x+' '+(y-r)+'v'+(r*2)+
    'M'+(x-r*0.75)+' '+(y-r*0.75)+'l'+(r*1.5)+' '+(r*1.5)+
    'M'+(x+r*0.75)+' '+(y-r*0.75)+'l'+(-r*1.5)+' '+(r*1.5)+'"/>';
}
var SVG_BODY={
  '大雨':CLOUD+'<path d="M11 27l-2 6M17 27l-2 6M23 27l-2 6M29 27l-2 6"/>',
  '雷雨':CLOUD+'<path d="M12 27l-2 4M29 27l-2 4M22 25l-6 7h5l-3 6"/>',
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
root.InsightWeatherIconCompat={VERSION:2,apply:apply,markup:markup,render:render};
})(typeof window!=='undefined'?window:globalThis);
