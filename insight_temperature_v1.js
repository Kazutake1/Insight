/* Temperature recording v1: optional daily max/min temperature with derived average. */
(function(root){
  'use strict';
  if(root.__insightTemperatureV1)return;
  root.__insightTemperatureV1=true;

  function rowForQuickDay(){
    try{
      var fy=todayInfo&&todayInfo.fy?todayInfo.fy:'';
      var month=todayInfo&&todayInfo.month?todayInfo.month:'';
      var rows=store&&store.data&&store.data[fy]&&store.data[fy][month];
      return rows&&rows[quickEditDay-1]?rows[quickEditDay-1]:null;
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

  function updateAverage(){
    var maxInput=document.getElementById('qi_tempMaxC');
    var minInput=document.getElementById('qi_tempMinC');
    var avg=document.getElementById('qi_tempAvgC');
    if(!maxInput||!minInput||!avg)return;
    var max=parseTemperature(maxInput.value),min=parseTemperature(minInput.value);
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
      maxInput.addEventListener('input',updateAverage);
      minInput.addEventListener('input',updateAverage);
    }
    var row=rowForQuickDay()||{};
    var max=document.getElementById('qi_tempMaxC'),min=document.getElementById('qi_tempMinC');
    if(max)max.value=displayTemperature(row.tempMaxC);
    if(min)min.value=displayTemperature(row.tempMinC);
    updateAverage();
  }

  function readAndValidate(){
    var maxInput=document.getElementById('qi_tempMaxC'),minInput=document.getElementById('qi_tempMinC');
    var max=maxInput?parseTemperature(maxInput.value):null;
    var min=minInput?parseTemperature(minInput.value):null;
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
      var values;
      try{values=readAndValidate();}catch(err){alert(err.message);return;}
      var result=oldSave.apply(this,arguments);
      try{
        var fy=todayInfo.fy,month=todayInfo.month,rows=store.data[fy][month],ri=quickEditDay-1;
        if(!rows[ri])rows[ri]=blankRow(quickEditDay);
        if(values.max===null)delete rows[ri].tempMaxC;else rows[ri].tempMaxC=values.max;
        if(values.min===null)delete rows[ri].tempMinC;else rows[ri].tempMinC=values.min;
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
    average:function(max,min){
      max=parseTemperature(max);min=parseTemperature(min);
      return Number.isFinite(max)&&Number.isFinite(min)?(max+min)/2:null;
    }
  };

  if(typeof currentNav!=='undefined'&&currentNav===0)renderTemperature();
})(typeof window!=='undefined'?window:globalThis);
