/* Weather + temperature auto fetch v2: per-store municipality coordinates with JMA model fallback. */
(function(root){
  'use strict';
  if(root.__insightWeatherTemperatureAutoV2)return;
  root.__insightWeatherTemperatureAutoV2=true;

  var FORECAST_URL='https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json';
  var WEATHER_AREA='230010';
  var TEMP_POINT='51106';
  var AMEDAS_POINT='51106';
  var OPEN_METEO_JMA='https://api.open-meteo.com/v1/jma';

  function pad(n){return String(n).padStart(2,'0');}
  function localYmd(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function compactYmd(date){return date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate());}
  function targetDate(){
    try{
      var year=Number(todayInfo.fy),month=Number(todayInfo.mIdx),day=Number(quickEditDay);
      if(!Number.isFinite(year)||!Number.isFinite(month)||!Number.isFinite(day))return new Date();
      return new Date(year,month,day);
    }catch(_){return new Date();}
  }
  function finite(v){
    if(v===null||v===undefined||v==='')return null;
    var n=Number(v);return Number.isFinite(n)?n:null;
  }
  function setInput(id,value){
    var el=document.getElementById(id);
    if(!el||value===null||value===undefined)return false;
    el.value=String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
  function label(text){var el=document.getElementById('autoWxLabel');if(el)el.textContent=text;}
  function title(text){var btn=document.getElementById('autoWxBtn');if(btn)btn.title=text||'';}
  function compactIdleLabel(){setTimeout(function(){label('自動');},3000);}
  function syncWeatherControl(){
    if(root.InsightWeatherCompact&&typeof root.InsightWeatherCompact.sync==='function')root.InsightWeatherCompact.sync();
  }

  function validLocation(loc){
    return !!loc&&Number.isFinite(Number(loc.latitude))&&Number.isFinite(Number(loc.longitude))&&
      Number(loc.latitude)>=-90&&Number(loc.latitude)<=90&&Number(loc.longitude)>=-180&&Number(loc.longitude)<=180;
  }

  function wmoToWx(code){
    code=Number(code);
    if(code===0)return '快晴';
    if(code===1)return '晴';
    if(code===2)return '晴曇';
    if(code===3||code===45||code===48)return '曇';
    if([51,53,55,61,80].indexOf(code)>=0)return '小雨';
    if([56,57,66,67].indexOf(code)>=0)return 'みぞれ';
    if([63,81].indexOf(code)>=0)return '雨';
    if([65,82,95,96,97,99].indexOf(code)>=0)return '大雨';
    if([71,73,75,77,85,86].indexOf(code)>=0)return '雪';
    return '曇';
  }

  async function fetchByStoreLocation(date){
    var loc=store&&store.weatherLocation;
    if(!validLocation(loc))return null;
    var params=[
      'latitude='+encodeURIComponent(Number(loc.latitude)),
      'longitude='+encodeURIComponent(Number(loc.longitude)),
      'daily='+encodeURIComponent('weather_code,temperature_2m_max,temperature_2m_min'),
      'timezone='+encodeURIComponent(loc.timezone||'Asia/Tokyo'),
      'past_days=3',
      'forecast_days=7'
    ].join('&');
    var res=await fetch(OPEN_METEO_JMA+'?'+params);
    if(!res.ok)throw new Error('location forecast fetch failed');
    var data=await res.json();
    var daily=data&&data.daily;
    if(!daily||!Array.isArray(daily.time))throw new Error('location forecast invalid');
    var dateKey=localYmd(date),idx=daily.time.indexOf(dateKey);
    if(idx<0)throw new Error('location forecast date unavailable');
    var max=finite(daily.temperature_2m_max&&daily.temperature_2m_max[idx]);
    var min=finite(daily.temperature_2m_min&&daily.temperature_2m_min[idx]);
    var code=finite(daily.weather_code&&daily.weather_code[idx]);
    return {
      wx:code===null?null:wmoToWx(code),
      max:max,
      min:min,
      code:code,
      source:'store-location',
      label:loc.label||loc.name||'設定地点'
    };
  }

  function weatherFromForecast(data,dateKey){
    try{
      var ts=data[0].timeSeries[0];
      var idx=ts.timeDefines.findIndex(function(t){return String(t).slice(0,10)===dateKey;});
      var area=ts.areas.find(function(a){return a.area&&a.area.code===WEATHER_AREA;})||ts.areas[0];
      if(idx<0||!area)return null;
      return {code:area.weatherCodes&&area.weatherCodes[idx],text:area.weathers&&area.weathers[idx]};
    }catch(_){return null;}
  }
  function temperatureFromForecast(data,dateKey){
    var min=null,max=null;
    try{
      var weekly=data[1]&&data[1].timeSeries&&data[1].timeSeries.find(function(ts){
        return ts.areas&&ts.areas.some(function(a){return a.area&&a.area.code===TEMP_POINT&&Array.isArray(a.tempsMin)&&Array.isArray(a.tempsMax);});
      });
      if(weekly){
        var wi=weekly.timeDefines.findIndex(function(t){return String(t).slice(0,10)===dateKey;});
        var wa=weekly.areas.find(function(a){return a.area&&a.area.code===TEMP_POINT;});
        if(wi>=0&&wa){min=finite(wa.tempsMin[wi]);max=finite(wa.tempsMax[wi]);}
      }
    }catch(_){}
    if(min!==null&&max!==null)return {min:min,max:max,source:'forecast'};
    try{
      var short=data[0]&&data[0].timeSeries&&data[0].timeSeries.find(function(ts){
        return ts.areas&&ts.areas.some(function(a){return a.area&&a.area.code===TEMP_POINT&&Array.isArray(a.temps);});
      });
      if(short){
        var sa=short.areas.find(function(a){return a.area&&a.area.code===TEMP_POINT;});
        var vals=[];
        short.timeDefines.forEach(function(t,i){
          if(String(t).slice(0,10)!==dateKey)return;
          var v=finite(sa.temps[i]);if(v!==null)vals.push(v);
        });
        if(vals.length>=2)return {min:Math.min.apply(null,vals),max:Math.max.apply(null,vals),source:'forecast'};
      }
    }catch(_){}
    return null;
  }
  async function temperatureFromAmedas(date){
    var today=new Date(),isToday=localYmd(date)===localYmd(today);
    var lastHour=isToday?today.getHours():23;
    var lastSlot=Math.floor(lastHour/3)*3,values=[],ymd=compactYmd(date),slots=[];
    for(var h=0;h<=lastSlot;h+=3)slots.push(h);
    var results=await Promise.all(slots.map(async function(h){
      try{
        var url='https://www.jma.go.jp/bosai/amedas/data/point/'+AMEDAS_POINT+'/'+ymd+'_'+pad(h)+'.json';
        var res=await fetch(url);if(!res.ok)return [];
        var json=await res.json(),out=[];
        Object.keys(json||{}).forEach(function(k){
          var arr=json[k]&&json[k].temp;if(Array.isArray(arr)){var v=finite(arr[0]);if(v!==null)out.push(v);}
        });
        return out;
      }catch(_){return [];}
    }));
    results.forEach(function(a){values=values.concat(a);});
    if(!values.length)return null;
    return {min:Math.min.apply(null,values),max:Math.max.apply(null,values),source:isToday?'observed-so-far':'observed'};
  }

  async function fetchLegacy(date){
    var dateKey=localYmd(date),res=await fetch(FORECAST_URL);
    if(!res.ok)throw new Error('forecast fetch failed');
    var data=await res.json(),wx=weatherFromForecast(data,dateKey),temp=temperatureFromForecast(data,dateKey);
    if(!temp&&dateKey<=localYmd(new Date()))temp=await temperatureFromAmedas(date);
    return {wx:wx&&wx.code&&typeof root.jmaCodeToWx==='function'?root.jmaCodeToWx(wx.code):null,
      weatherText:wx&&wx.text||'',max:temp&&temp.max,min:temp&&temp.min,tempSource:temp&&temp.source,source:'legacy'};
  }

  root.fetchWeather=async function(){
    var btn=document.getElementById('autoWxBtn');if(btn)btn.disabled=true;
    label('取得中…');
    try{
      var date=targetDate(),result;
      if(validLocation(store&&store.weatherLocation)){
        result=await fetchByStoreLocation(date);
      }else{
        result=await fetchLegacy(date);
      }

      var gotWeather=false,gotTemp=false;
      if(result&&result.wx&&typeof root.setWeather==='function'){
        root.setWeather(result.wx);syncWeatherControl();gotWeather=true;
      }
      if(result){
        gotTemp=setInput('qi_tempMaxC',result.max)||gotTemp;
        gotTemp=setInput('qi_tempMinC',result.min)||gotTemp;
      }

      if(gotWeather&&gotTemp){
        label('取得済');
        if(result.source==='store-location'){
          title((result.label||'設定地点')+'のJMAモデル予報から天気・最高気温・最低気温を取得しました。');
        }else{
          var sourceText=result.tempSource==='forecast'?'気象庁予報':
            result.tempSource==='observed-so-far'?'名古屋の観測値（現時点まで）':'名古屋の観測値';
          title('天気と最高・最低気温を取得しました。気温：'+sourceText+(result.weatherText?' / 天気：'+String(result.weatherText).trim():''));
        }
      }else if(gotWeather){
        label('天気のみ');title('天気は取得しましたが、この日の最高・最低気温は取得できませんでした。');
      }else if(gotTemp){
        label('気温のみ');title('最高・最低気温は取得しましたが、この日の天気は取得できませんでした。');
      }else throw new Error('no weather/temperature data');

      compactIdleLabel();
    }catch(e){
      label('取得失敗');
      var loc=store&&store.weatherLocation;
      title(validLocation(loc)?'設定した天気地点のデータ取得に失敗しました。地点設定を確認するか、手動で入力してください。':
        '気象庁データへの接続または対象日のデータ取得に失敗しました。手動で入力してください。');
      compactIdleLabel();
    }finally{if(btn)btn.disabled=false;}
  };

  root.InsightWeatherTemperatureAuto={
    weatherFromForecast:weatherFromForecast,
    temperatureFromForecast:temperatureFromForecast,
    wmoToWx:wmoToWx,
    validLocation:validLocation
  };
})(typeof window!=='undefined'?window:globalThis);
