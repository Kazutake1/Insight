/* Compact weather selector v1: replace nine inline weather buttons with one popup selector. */
(function(root){
  'use strict';
  if(root.__insightWeatherCompactV1)return;
  root.__insightWeatherCompactV1=true;

  var ORDER=['快晴','晴','晴曇','曇','小雨','雨','大雨','みぞれ','雪','霧','凍雨','雷雨'];
  var ICONS={快晴:'☀️',晴:'🌤️',晴曇:'⛅',曇:'☁️',小雨:'🌦️',雨:'🌧️',大雨:'⛈️',みぞれ:'🌨️',雪:'❄️',霧:'🌫️',凍雨:'🧊',雷雨:'🌩️'};

  function ensureStyle(){
    if(document.getElementById('insightWeatherCompactV1Style'))return;
    var style=document.createElement('style');
    style.id='insightWeatherCompactV1Style';
    style.textContent=[
      '#qWeatherSel{display:none!important}',
      '.quick-weather-compact{position:relative;flex:0 0 auto}',
      '.qwc-trigger{height:36px;display:inline-flex;align-items:center;gap:5px;padding:0 10px;border:1.5px solid var(--border,#ddd);border-radius:9px;background:var(--surface,#fff);color:var(--text,#1a1a1a);font:700 11px/1 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;cursor:pointer;white-space:nowrap}',
      '.qwc-trigger .qwc-icon{font-size:18px;line-height:1}',
      '.qwc-trigger .qwc-arrow{font-size:9px;color:var(--text4,#999);margin-left:1px}',
      '.qwc-menu{position:absolute;z-index:1200;top:calc(100% + 6px);left:0;width:228px;box-sizing:border-box;padding:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);box-shadow:0 10px 30px rgba(0,0,0,.16)}',
      '.qwc-menu[hidden]{display:none!important}',
      '.qwc-option{min-height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid var(--border,#e5e7eb);border-radius:9px;background:var(--input-bg,#fff);color:var(--text2,#444);font:700 10px/1.2 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;cursor:pointer}',
      '.qwc-option .qwc-option-icon{font-size:20px;line-height:1}',
      '.qwc-option.active{border-color:var(--text,#1a1a1a);background:rgba(128,128,128,.08);color:var(--text,#1a1a1a)}',
      '@media(min-width:760px){.quick-date-bar{flex-wrap:nowrap}.quick-weather-compact{order:0}#qTemperatureInputs{order:0}#autoWxBtn{flex:0 0 auto}.quick-nav-row{flex:0 0 auto}}',
      '@media(max-width:759px){.qwc-menu{left:auto;right:0}.qwc-trigger{height:34px;padding:0 9px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function selectedWeather(){
    var active=document.querySelector('#qWeatherSel .wx-btn.active');
    if(active&&active.dataset&&active.dataset.wx)return active.dataset.wx;
    if(typeof quickWeather==='string'&&quickWeather)return quickWeather;
    return '快晴';
  }

  function sync(){
    var trigger=document.getElementById('qWeatherCompactTrigger');
    if(!trigger)return;
    var wx=selectedWeather();
    var icon=trigger.querySelector('.qwc-icon');
    var label=trigger.querySelector('.qwc-label');
    if(icon)icon.textContent=ICONS[wx]||'☀️';
    if(label)label.textContent=wx;
    var menu=document.getElementById('qWeatherCompactMenu');
    if(menu){
      Array.prototype.forEach.call(menu.querySelectorAll('.qwc-option'),function(btn){
        var active=btn.dataset.wx===wx;
        btn.classList.toggle('active',active);
        btn.setAttribute('aria-pressed',active?'true':'false');
      });
    }
  }

  function close(){
    var menu=document.getElementById('qWeatherCompactMenu');
    var trigger=document.getElementById('qWeatherCompactTrigger');
    if(menu)menu.hidden=true;
    if(trigger)trigger.setAttribute('aria-expanded','false');
  }

  function choose(wx){
    if(typeof root.setWeather==='function')root.setWeather(wx);
    sync();
    close();
  }

  function ensureControl(){
    ensureStyle();
    var weather=document.getElementById('qWeatherSel');
    if(!weather)return;
    var wrap=document.getElementById('qWeatherCompact');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='qWeatherCompact';
      wrap.className='quick-weather-compact';

      var trigger=document.createElement('button');
      trigger.type='button';
      trigger.id='qWeatherCompactTrigger';
      trigger.className='qwc-trigger';
      trigger.setAttribute('aria-haspopup','true');
      trigger.setAttribute('aria-expanded','false');
      trigger.innerHTML='<span class="qwc-icon">☀️</span><span class="qwc-label">快晴</span><span class="qwc-arrow">▼</span>';

      var menu=document.createElement('div');
      menu.id='qWeatherCompactMenu';
      menu.className='qwc-menu';
      menu.hidden=true;
      menu.setAttribute('role','menu');

      ORDER.forEach(function(wx){
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='qwc-option';
        btn.dataset.wx=wx;
        btn.setAttribute('role','menuitem');
        btn.innerHTML='<span class="qwc-option-icon">'+ICONS[wx]+'</span><span>'+wx+'</span>';
        btn.addEventListener('click',function(e){e.stopPropagation();choose(wx);});
        menu.appendChild(btn);
      });

      trigger.addEventListener('click',function(e){
        e.stopPropagation();
        var willOpen=menu.hidden;
        menu.hidden=!willOpen;
        trigger.setAttribute('aria-expanded',willOpen?'true':'false');
        if(willOpen)sync();
      });

      wrap.append(trigger,menu);
      weather.insertAdjacentElement('afterend',wrap);

      document.addEventListener('click',function(e){
        if(!wrap.contains(e.target))close();
      });
      document.addEventListener('keydown',function(e){
        if(e.key==='Escape')close();
      });

      var observer=new MutationObserver(sync);
      observer.observe(weather,{subtree:true,attributes:true,attributeFilter:['class']});
    }
    sync();

    var autoLabel=document.getElementById('autoWxLabel');
    if(autoLabel){
      function compactAutoLabel(){
        if(autoLabel.textContent==='自動取得')autoLabel.textContent='自動';
      }
      compactAutoLabel();
      if(!autoLabel.dataset.qwcObserved){
        autoLabel.dataset.qwcObserved='1';
        new MutationObserver(compactAutoLabel).observe(autoLabel,{childList:true,characterData:true,subtree:true});
      }
    }
  }

  var oldRender=root.renderQuickPage;
  if(typeof oldRender==='function'){
    root.renderQuickPage=function(){
      var result=oldRender.apply(this,arguments);
      ensureControl();
      return result;
    };
  }

  root.InsightWeatherCompact={sync:sync,close:close};
  if(typeof currentNav!=='undefined'&&currentNav===0)ensureControl();
})(typeof window!=='undefined'?window:globalThis);
