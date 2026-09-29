/* Temperature recording v1: optional daily max/min temperature with derived average. */
(function(root){
  'use strict';
  if(root.__insightTemperatureV1)return;
  root.__insightTemperatureV1=true;

  function selectedQuickDateInfo(){
    try{
      var picker=document.getElementById('iqdDateInput');
      var match=picker&&/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(picker.value||''));
      if(match){
        var year=Number(match[1]),monthIndex=Number(match[2])-1,day=Number(match[3]);
        var date=new Date(0);date.setFullYear(year,monthIndex,day);date.setHours(0,0,0,0);
        if(date.getFullYear()===year&&date.getMonth()===monthIndex&&date.getDate()===day){
          return {fy:String(year),month:(typeof MONTHS!=='undefined'&&MONTHS[monthIndex])||String(monthIndex+1)+'月',mIdx:monthIndex,day:day,date:date};
        }
      }
      var fy=todayInfo&&todayInfo.fy?String(todayInfo.fy):'';
      var mIdx=Number(todayInfo&&todayInfo.mIdx);
      var month=todayInfo&&todayInfo.month?todayInfo.month:((Number.isFinite(mIdx)?mIdx+1:'')+'月');
      var selectedDay=Number(quickEditDay);
      return {fy:fy,month:month,mIdx:mIdx,day:selectedDay,date:new Date(Number(fy),mIdx,selectedDay)};
    }catch(_){return null;}
  }

  function isFutureQuickDate(info){
    if(!info||!(info.date instanceof Date)||!Number.isFinite(info.date.getTime()))return false;
    var now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    return info.date>today;
  }

  function rowForQuickDay(){
    try{
      var info=selectedQuickDateInfo();if(!info||isFutureQuickDate(info))return null;
      var rows=store&&store.data&&store.data[info.fy]&&store.data[info.fy][info.month];
      return rows&&rows[info.day-1]?rows[info.day-1]:null;
    }catch(_){return null;}
  }

  function parseTemperature(value){
    var raw=String(value==null?'':value).trim();
    if(raw==='')return null;
    var n=Number(raw);
    return Number.isFinite(n)?n:NaN;
  }

  function displayTemperature(value){
    if(value===undefined||value===null||value==='')return '';
    var n=Number(value);
    return Number.isFinite(n)?String(n):'';
  }


  var temperatureDisplayValues=new WeakMap();

  function temperatureInputValue(input){
    var value=temperatureDisplayValues.get(input);
    return value&&input.value===value.display?value.raw:input.value;
  }

  function showTemperature(input,value){
    var raw=displayTemperature(value);
    var display=document.activeElement===input?raw:(raw===''?'':String(Math.round(Number(raw))));
    temperatureDisplayValues.set(input,{raw:raw,display:display});
    input.value=display;
  }

  function bindTemperatureDisplay(input){
    input.addEventListener('focus',function(){
      input.value=temperatureInputValue(input);
    });
    input.addEventListener('input',function(){
      showTemperature(input,input.value);
      updateAverage();
    });
    input.addEventListener('blur',function(){
      showTemperature(input,temperatureInputValue(input));
    });
  }

  function normalizedLocationPart(value){
    return String(value==null?'':value).trim().replace(/\s+/g,'');
  }

  function municipalityKey(targetStore){
    var loc=targetStore&&targetStore.weatherLocation;
    if(!loc)return '';
    var name=normalizedLocationPart(loc.name||loc.query);
    var admin1=normalizedLocationPart(loc.admin1);
    if(name)return admin1+'|'+name;
    var lat=Number(loc.latitude),lon=Number(loc.longitude);
    return Number.isFinite(lat)&&Number.isFinite(lon)?'coord|'+lat.toFixed(4)+'|'+lon.toFixed(4):'';
  }

  function ensureDailyRow(targetStore,fy,month,day){
    if(!targetStore.data||typeof targetStore.data!=='object')targetStore.data={};
    if(!targetStore.data[fy]||typeof targetStore.data[fy]!=='object')targetStore.data[fy]={};
    if(!Array.isArray(targetStore.data[fy][month]))targetStore.data[fy][month]=[];
    var rows=targetStore.data[fy][month],ri=day-1;
    if(!rows[ri]){
      rows[ri]=typeof blankRow==='function'?blankRow(day):{d:day,weather:''};
    }
    return rows[ri];
  }

  function syncWeatherAndTemperatureForMunicipality(fy,month,day,sourceRow){
    var key=municipalityKey(store);
    if(!key||!sourceRow||!allStores||!allStores.stores)return 0;
    var synced=0;
    Object.keys(allStores.stores).forEach(function(storeId){
      var targetStore=allStores.stores[storeId];
      if(!targetStore||targetStore===store||municipalityKey(targetStore)!==key)return;
      var targetRow=ensureDailyRow(targetStore,fy,month,day);
      targetRow.weather=sourceRow.weather==null?'':sourceRow.weather;
      if(sourceRow.tempMaxC===undefined)delete targetRow.tempMaxC;
      else targetRow.tempMaxC=sourceRow.tempMaxC;
      if(sourceRow.tempMinC===undefined)delete targetRow.tempMinC;
      else targetRow.tempMinC=sourceRow.tempMinC;
      synced++;
    });
    return synced;
  }

  function updateAverage(){
    var maxInput=document.getElementById('qi_tempMaxC');
    var minInput=document.getElementById('qi_tempMinC');
    var avg=document.getElementById('qi_tempAvgC');
    if(!maxInput||!minInput||!avg)return;
    var max=parseTemperature(temperatureInputValue(maxInput)),min=parseTemperature(temperatureInputValue(minInput));
    avg.textContent=Number.isFinite(max)&&Number.isFinite(min)?((max+min)/2).toFixed(1)+'℃':'—';
  }

  function ensureStyle(){
    if(document.getElementById('insightTemperatureV1Style'))return;
    var style=document.createElement('style');
    style.id='insightTemperatureV1Style';
    style.textContent=[
      '.quick-temperature{display:flex;align-items:center;gap:6px;padding:3px 7px;border:1px solid var(--border,#e5e7eb);border-radius:9px;background:var(--surface,#fff)}',
      '.quick-temperature label{display:flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:var(--text3,#666);white-space:nowrap}',
      '.quick-temperature input{width:52px;height:28px;box-sizing:border-box;border:1px solid var(--border,#ddd);border-radius:7px;background:var(--input-bg,#fff);color:var(--text,#1a1a1a);padding:0 5px;text-align:right;font:700 12px/1 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;outline:none}',
      '.quick-temperature input:focus{border-color:var(--text3,#666)}',
      '.quick-temperature .qt-unit{font-size:10px;color:var(--text4,#888)}',
      '.quick-temperature .qt-average{display:flex;align-items:center;gap:3px;padding-left:5px;border-left:1px solid var(--border,#ddd);font-size:10px;color:var(--text4,#888);white-space:nowrap}',
      '.quick-temperature .qt-average strong{font-size:11px;color:var(--text2,#444)}',
      '@media(max-width:700px){.quick-temperature{order:3}.quick-temperature input{width:48px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderTemperature(){
    ensureStyle();
    var weather=document.getElementById('qWeatherSel');
    if(!weather)return;
    var wrap=document.getElementById('qTemperatureInputs');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='qTemperatureInputs';
      wrap.className='quick-temperature';
      wrap.innerHTML='<label>最高 <input id="qi_tempMaxC" type="number" inputmode="decimal" step="0.1" aria-label="最高気温"><span class="qt-unit">℃</span></label>'+
        '<label>最低 <input id="qi_tempMinC" type="number" inputmode="decimal" step="0.1" aria-label="最低気温"><span class="qt-unit">℃</span></label>'+
        '<span class="qt-average">平均 <strong id="qi_tempAvgC">—</strong></span>';
      weather.insertAdjacentElement('afterend',wrap);
      var maxInput=wrap.querySelector('#qi_tempMaxC'),minInput=wrap.querySelector('#qi_tempMinC');
      bindTemperatureDisplay(maxInput);
      bindTemperatureDisplay(minInput);
    }
    var info=selectedQuickDateInfo(),future=isFutureQuickDate(info),row=rowForQuickDay()||{};
    var max=document.getElementById('qi_tempMaxC'),min=document.getElementById('qi_tempMinC');
    if(max){showTemperature(max,future?null:row.tempMaxC);max.disabled=future;}
    if(min){showTemperature(min,future?null:row.tempMinC);min.disabled=future;}
    updateAverage();
  }

  function readAndValidate(){
    var maxInput=document.getElementById('qi_tempMaxC'),minInput=document.getElementById('qi_tempMinC');
    var max=maxInput?parseTemperature(temperatureInputValue(maxInput)):null;
    var min=minInput?parseTemperature(temperatureInputValue(minInput)):null;
    if(Number.isNaN(max)||Number.isNaN(min))throw new Error('最高気温・最低気温は数字で入力してください。');
    if(max!==null&&min!==null&&max<min)throw new Error('最高気温は最低気温以上になるように入力してください。');
    return {max:max,min:min};
  }

  var oldRender=root.renderQuickPage;
  if(typeof oldRender==='function'){
    root.renderQuickPage=function(){
      var result=oldRender.apply(this,arguments);
      renderTemperature();
      return result;
    };
  }

  var oldSave=root.saveQuick;
  if(typeof oldSave==='function'){
    root.saveQuick=function(){
      var target=selectedQuickDateInfo(),future=isFutureQuickDate(target),values={max:null,min:null};
      if(!future){
        try{values=readAndValidate();}catch(err){alert(err.message);return;}
      }
      var result=oldSave.apply(this,arguments);
      try{
        if(!target)throw new Error('対象日を取得できませんでした。');
        var fy=target.fy,month=target.month,day=target.day;
        if(!store.data[fy])store.data[fy]={};
        if(!Array.isArray(store.data[fy][month]))store.data[fy][month]=[];
        var rows=store.data[fy][month],ri=day-1;
        if(!rows[ri])rows[ri]=blankRow(day);
        if(future){
          rows[ri].weather='';
          delete rows[ri].tempMaxC;
          delete rows[ri].tempMinC;
        }else{
          if(values.max===null)delete rows[ri].tempMaxC;else rows[ri].tempMaxC=values.max;
          if(values.min===null)delete rows[ri].tempMinC;else rows[ri].tempMinC=values.min;
          syncWeatherAndTemperatureForMunicipality(fy,month,day,rows[ri]);
        }
        persist();
      }catch(err){
        alert('気温データを保存できませんでした。\n'+err.message);
        return;
      }
      return result;
    };
  }

  root.InsightTemperature={
    parse:parseTemperature,
    selectedQuickDateInfo:selectedQuickDateInfo,
    isFutureQuickDate:isFutureQuickDate,
    average:function(max,min){
      max=parseTemperature(max);min=parseTemperature(min);
      return Number.isFinite(max)&&Number.isFinite(min)?(max+min)/2:null;
    }
  };

  if(typeof currentNav!=='undefined'&&currentNav===0)renderTemperature();
})(typeof window!=='undefined'?window:globalThis);
