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

  var OPEN_METEO_HISTORY='https://historical-forecast-api.open-meteo.com/v1/forecast';

  function pad(n){return String(n).padStart(2,'0');}
  function localYmd(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function compactYmd(date){return date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate());}
  function parseIsoDate(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    var year=Number(match[1]),month=Number(match[2])-1,day=Number(match[3]);
    var date=new Date(0);date.setFullYear(year,month,day);date.setHours(0,0,0,0);
    return date.getFullYear()===year&&date.getMonth()===month&&date.getDate()===day?date:null;
  }
  function targetDate(){
    try{
      var picker=document.getElementById('iqdDateInput');
      var selected=picker&&parseIsoDate(picker.value);
      if(selected)return selected;
      var year=Number(todayInfo.fy),month=Number(todayInfo.mIdx),day=Number(quickEditDay);
      if(!Number.isFinite(year)||!Number.isFinite(month)||!Number.isFinite(day))return new Date();
      return new Date(year,month,day);
    }catch(_){return new Date();}
  }
  function isFutureDate(date){return localYmd(date)>localYmd(new Date());}
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
    if(code===3)return '曇';
    if(code===45||code===48)return '霧';
    if([51,53,55,61,80].indexOf(code)>=0)return '小雨';
    if([56,57,66,67].indexOf(code)>=0)return '凍雨';
    if([63,81].indexOf(code)>=0)return '雨';
    if([65,82].indexOf(code)>=0)return '大雨';
    if([95,96,97,99].indexOf(code)>=0)return '雷雨';
    if([71,73,75,77,85,86].indexOf(code)>=0)return '雪';
    return '曇';
  }

  async function fetchByStoreLocation(date){
    var loc=store&&store.weatherLocation;
    if(!validLocation(loc))return null;
    var dateKey=localYmd(date),timezone=loc.timezone||'Asia/Tokyo';
    // Compare calendar dates in the requested timezone, avoiding DST-length days.
    var parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    var todayParts={};
    parts.forEach(function(part){todayParts[part.type]=part.value;});
    var cutoff=new Date(Date.UTC(Number(todayParts.year),Number(todayParts.month)-1,Number(todayParts.day)-3));
    var cutoffKey=cutoff.getUTCFullYear()+'-'+pad(cutoff.getUTCMonth()+1)+'-'+pad(cutoff.getUTCDate());
    var historical=dateKey<cutoffKey;
    var params=[
      'latitude='+encodeURIComponent(Number(loc.latitude)),
      'longitude='+encodeURIComponent(Number(loc.longitude)),
      'daily='+encodeURIComponent('weather_code,temperature_2m_max,temperature_2m_min'),
      'timezone='+encodeURIComponent(timezone)
    ].join('&');
    params+=historical?'&start_date='+dateKey+'&end_date='+dateKey+'&models=jma_seamless':'&past_days=3&forecast_days=1';
    var res=await fetch((historical?OPEN_METEO_HISTORY:OPEN_METEO_JMA)+'?'+params);
    if(!res.ok)throw new Error('location forecast fetch failed');
    var data=await res.json();
    var daily=data&&data.daily;
    if(!daily||!Array.isArray(daily.time))throw new Error('location forecast invalid');
    var idx=daily.time.indexOf(dateKey);
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

  function clearFutureWeatherData(){
    var stores=allStores&&allStores.stores;
    if(!stores||typeof stores!=='object')return 0;
    var todayKey=localYmd(new Date()),changed=0;
    Object.keys(stores).forEach(function(storeId){
      var targetStore=stores[storeId],data=targetStore&&targetStore.data;
      if(!data||typeof data!=='object')return;
      Object.keys(data).forEach(function(yearKey){
        var year=Number(yearKey);if(!Number.isFinite(year))return;
        var months=data[yearKey];if(!months||typeof months!=='object')return;
        Object.keys(months).forEach(function(monthKey){
          var match=/^(\d{1,2})月$/.exec(String(monthKey));if(!match)return;
          var month=Number(match[1]);if(month<1||month>12)return;
          var rows=months[monthKey];if(!Array.isArray(rows))return;
          rows.forEach(function(row,index){
            if(!row||typeof row!=='object')return;
            var day=Number(row.d)||index+1;
            var key=year+'-'+pad(month)+'-'+pad(day);
            if(key<=todayKey)return;
            if(row.weather){row.weather='';changed++;}
            if(Object.prototype.hasOwnProperty.call(row,'tempMaxC')){delete row.tempMaxC;changed++;}
            if(Object.prototype.hasOwnProperty.call(row,'tempMinC')){delete row.tempMinC;changed++;}
          });
        });
      });
    });
    if(changed&&typeof persist==='function')persist();
    return changed;
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
      if(isFutureDate(date)){
        label('自動');
        title('未来日の天気・気温は取得・保存しません。');
        return;
      }
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
    }finally{if(btn)btn.disabled=isFutureDate(targetDate());}
  };

  function applyFutureWeatherState(){
    var future=isFutureDate(targetDate());
    var trigger=document.getElementById('qWeatherCompactTrigger');
    var autoBtn=document.getElementById('autoWxBtn');
    var maxInput=document.getElementById('qi_tempMaxC');
    var minInput=document.getElementById('qi_tempMinC');
    if(trigger)trigger.disabled=future;
    if(autoBtn){
      autoBtn.disabled=future;
      autoBtn.title=future?'未来日の天気・気温は取得・保存しません。':autoBtn.title;
    }
    if(maxInput)maxInput.disabled=future;
    if(minInput)minInput.disabled=future;
    var menu=document.getElementById('qWeatherCompactMenu');
    if(menu)Array.prototype.forEach.call(menu.querySelectorAll('.qwc-option'),function(option){option.disabled=future;});
    if(future){
      if(root.InsightWeatherCompact&&typeof root.InsightWeatherCompact.close==='function')root.InsightWeatherCompact.close();
      if(trigger){
        var icon=trigger.querySelector('.qwc-icon'),text=trigger.querySelector('.qwc-label');
        if(icon)icon.textContent='';
        if(text)text.textContent='—';
      }
    }else if(root.InsightWeatherCompact&&typeof root.InsightWeatherCompact.sync==='function'){
      root.InsightWeatherCompact.sync();
    }
  }

  var oldRenderQuick=root.renderQuickPage;
  if(typeof oldRenderQuick==='function'){
    root.renderQuickPage=function(){
      var result=oldRenderQuick.apply(this,arguments);
      applyFutureWeatherState();
      return result;
    };
  }

  clearFutureWeatherData();
  applyFutureWeatherState();

  root.InsightWeatherTemperatureAuto={
    weatherFromForecast:weatherFromForecast,
    temperatureFromForecast:temperatureFromForecast,
    wmoToWx:wmoToWx,
    validLocation:validLocation,
    targetDate:targetDate,
    isFutureDate:isFutureDate,
    clearFutureWeatherData:clearFutureWeatherData,
    applyFutureWeatherState:applyFutureWeatherState
  };
})(typeof window!=='undefined'?window:globalThis);
