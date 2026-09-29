/* Weather + temperature auto fetch v1: fetch JMA weather and max/min temperature together. */
(function(root){
  'use strict';
  if(root.__insightWeatherTemperatureAutoV1)return;
  root.__insightWeatherTemperatureAutoV1=true;

  var FORECAST_URL='https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json';
  var WEATHER_AREA='230010'; // 愛知県西部
  var TEMP_POINT='51106';    // 名古屋
  var AMEDAS_POINT='51106';  // 名古屋

  function pad(n){return String(n).padStart(2,'0');}
  function localYmd(date){
    return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
  }
  function compactYmd(date){
    return date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate());
  }
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
  function weatherFromForecast(data,dateKey){
    try{
      var ts=data[0].timeSeries[0];
      var idx=ts.timeDefines.findIndex(function(t){return String(t).slice(0,10)===dateKey;});
      var area=ts.areas.find(function(a){return a.area&&a.area.code===WEATHER_AREA;})||ts.areas[0];
      if(idx<0||!area)return null;
      return {
        code:area.weatherCodes&&area.weatherCodes[idx],
        text:area.weathers&&area.weathers[idx]
      };
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
    var lastSlot=Math.floor(lastHour/3)*3;
    var values=[],ymd=compactYmd(date);
    var slots=[];
    for(var h=0;h<=lastSlot;h+=3)slots.push(h);
    var results=await Promise.all(slots.map(async function(h){
      try{
        var url='https://www.jma.go.jp/bosai/amedas/data/point/'+AMEDAS_POINT+'/'+ymd+'_'+pad(h)+'.json';
        var res=await fetch(url);
        if(!res.ok)return [];
        var json=await res.json(),out=[];
        Object.keys(json||{}).forEach(function(k){
          var item=json[k],arr=item&&item.temp;
          if(Array.isArray(arr)){
            var v=finite(arr[0]);if(v!==null)out.push(v);
          }
        });
        return out;
      }catch(_){return [];}
    }));
    results.forEach(function(a){values=values.concat(a);});
    if(!values.length)return null;
    return {min:Math.min.apply(null,values),max:Math.max.apply(null,values),source:isToday?'observed-so-far':'observed'};
  }
  function label(text){
    var el=document.getElementById('autoWxLabel');
    if(el)el.textContent=text;
  }
  function title(text){
    var btn=document.getElementById('autoWxBtn');
    if(btn)btn.title=text||'';
  }
  function compactIdleLabel(){
    setTimeout(function(){label('自動');},3000);
  }

  root.fetchWeather=async function(){
    var btn=document.getElementById('autoWxBtn');
    if(btn)btn.disabled=true;
    label('取得中…');
    try{
      var date=targetDate(),dateKey=localYmd(date);
      var res=await fetch(FORECAST_URL);
      if(!res.ok)throw new Error('forecast fetch failed');
      var data=await res.json();

      var wx=weatherFromForecast(data,dateKey);
      if(wx&&wx.code){
        var kind=typeof root.jmaCodeToWx==='function'?root.jmaCodeToWx(wx.code):null;
        if(kind&&typeof root.setWeather==='function')root.setWeather(kind);
        if(root.InsightWeatherCompact&&typeof root.InsightWeatherCompact.sync==='function')root.InsightWeatherCompact.sync();
      }

      var temp=temperatureFromForecast(data,dateKey);
      if(!temp){
        var nowKey=localYmd(new Date());
        if(dateKey<=nowKey)temp=await temperatureFromAmedas(date);
      }

      var gotTemp=false;
      if(temp){
        gotTemp=setInput('qi_tempMaxC',temp.max)||gotTemp;
        gotTemp=setInput('qi_tempMinC',temp.min)||gotTemp;
      }

      if(wx&&gotTemp){
        label('取得済');
        var sourceText=temp&&temp.source==='forecast'?'気象庁予報':
          temp&&temp.source==='observed-so-far'?'名古屋の観測値（現時点まで）':'名古屋の観測値';
        title('天気と最高・最低気温を取得しました。気温：'+sourceText+(wx.text?' / 天気：'+String(wx.text).trim():''));
      }else if(wx){
        label('天気のみ');
        title('天気は取得しましたが、この日の最高・最低気温は取得できませんでした。');
      }else if(gotTemp){
        label('気温のみ');
        title('最高・最低気温は取得しましたが、この日の天気は取得できませんでした。');
      }else{
        throw new Error('no weather/temperature data');
      }
      compactIdleLabel();
    }catch(e){
      label('取得失敗');
      title('気象庁データへの接続または対象日のデータ取得に失敗しました。手動で入力してください。');
      compactIdleLabel();
    }finally{
      if(btn)btn.disabled=false;
    }
  };

  root.InsightWeatherTemperatureAuto={
    weatherFromForecast:weatherFromForecast,
    temperatureFromForecast:temperatureFromForecast
  };
})(typeof window!=='undefined'?window:globalThis);
