/* Per-store weather location settings v1. */
(function(root){
  'use strict';
  if(root.__insightWeatherLocationV1)return;
  root.__insightWeatherLocationV1=true;

  var GEOCODE_URL='https://geocoding-api.open-meteo.com/v1/search';
  // Registered-only, non-authorizing: the confirmed location set/write path.
  var locationObserver=null,locationFault=false,locationActive=0;
  function getLocationSaveOperationStatus(){
    var scope='weather-location-confirmed-set-only';
    if(locationFault)return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});
    if(!locationObserver)return Object.freeze({scope:scope,state:'UNAVAILABLE',activeCount:null,epoch:null});
    try{
      var value=locationObserver.status();
      if(!value||value.scope!=='registered-operations-only'||
        ['IDLE_OBSERVED','ACTIVE','HELD'].indexOf(value.state)<0||
        !Number.isSafeInteger(value.activeCount)||value.activeCount<0||
        !Number.isSafeInteger(value.epoch)||value.epoch<1||
        value.activeCount<locationActive||
        (value.state==='IDLE_OBSERVED'&&value.activeCount!==0)||
        (value.state==='ACTIVE'&&value.activeCount===0)||
        (locationActive>0&&value.state!=='ACTIVE'&&value.state!=='HELD'))
        throw new Error('location observer status invalid');
      return Object.freeze({scope:scope,state:value.state,activeCount:value.activeCount,epoch:value.epoch});
    }catch(_){
      locationFault=true;
      return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});
    }
  }
  (function initializeLocationObserver(){
    try{
      var factory=root.InsightOperationObserverV0&&root.InsightOperationObserverV0.createOperationObserver;
      if(typeof factory!=='function')return;
      var candidate=factory();
      if(!candidate||['initialize','begin','end','invalidate','status'].some(function(name){
        return typeof candidate[name]!=='function';
      })||candidate.initialize()!==true){locationFault=true;return;}
      locationObserver=candidate;
      var initial=getLocationSaveOperationStatus();
      if(initial.state!=='IDLE_OBSERVED'||initial.activeCount!==0)locationFault=true;
    }catch(_){locationFault=true;}
  })();
  function observeConfirmedLocationSet(operation){
    var observer=locationObserver,ticket=null,registered=false,outcome='unknown';
    if(observer&&!locationFault){
      try{
        ticket=observer.begin('weather_location_set');
        if(!ticket||typeof ticket!=='object'||locationActive>=Number.MAX_SAFE_INTEGER){
          locationFault=true;
        }else{
          registered=true;locationActive++;
          if(getLocationSaveOperationStatus().state!=='ACTIVE')locationFault=true;
        }
      }catch(_){locationFault=true;}
    }
    try{
      var value=operation();
      outcome='completed';
      return value;
    }finally{
      if(registered){
        try{if(observer.end(ticket,outcome)!==true)locationFault=true;}
        catch(_){locationFault=true;}
        locationActive--;
        if(!locationFault)getLocationSaveOperationStatus();
      }
    }
  }



  // Independent registered-only observer for confirmed CLEAR; prior SET untouched.
  var clearObserver=null,clearFault=false,clearActive=0;
  function getLocationClearOperationStatus(){
    var scope='weather-location-confirmed-clear-only';
    if(clearFault)return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});
    if(!clearObserver)return Object.freeze({scope:scope,state:'UNAVAILABLE',activeCount:null,epoch:null});
    try{
      var result=clearObserver.status();
      if(!result||result.scope!=='registered-operations-only'||
         ['IDLE_OBSERVED','ACTIVE','HELD'].indexOf(result.state)<0||
         !Number.isSafeInteger(result.activeCount)||result.activeCount<0||
         !Number.isSafeInteger(result.epoch)||result.epoch<1||
         result.activeCount<clearActive||
         (result.state==='IDLE_OBSERVED'&&result.activeCount!==0)||
         (result.state==='ACTIVE'&&result.activeCount===0)||
         (clearActive>0&&result.state!=='ACTIVE'&&result.state!=='HELD'))
        throw new Error('location clear observer status invalid');
      return Object.freeze({scope:scope,state:result.state,activeCount:result.activeCount,epoch:result.epoch});
    }catch(_){clearFault=true;return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});}
  }
  (function initializeLocationClearObserver(){
    try{
      var factory=root.InsightOperationObserverV0&&root.InsightOperationObserverV0.createOperationObserver;
      if(typeof factory!=='function')return;
      var candidate=factory();
      if(!candidate||['initialize','begin','end','invalidate','status'].some(function(name){
        return typeof candidate[name]!=='function';
      })||candidate.initialize()!==true){clearFault=true;return;}
      clearObserver=candidate;
      var initial=getLocationClearOperationStatus();
      if(initial.state!=='IDLE_OBSERVED'||initial.activeCount!==0)clearFault=true;
    }catch(_){clearFault=true;}
  })();
  function observeConfirmedLocationClear(operation){
    var observer=clearObserver,ticket=null,registered=false,outcome='unknown';
    if(observer&&!clearFault){
      try{
        ticket=observer.begin('weather_location_clear');
        if(!ticket||typeof ticket!=='object'||clearActive>=Number.MAX_SAFE_INTEGER){
          clearFault=true;
        }else{
          registered=true;clearActive++;
          if(getLocationClearOperationStatus().state!=='ACTIVE')clearFault=true;
        }
      }catch(_){clearFault=true;}
    }
    try{
      var value=operation();
      outcome='completed';
      return value;
    }finally{
      if(registered){
        try{if(observer.end(ticket,outcome)!==true)clearFault=true;}
        catch(_){clearFault=true;}
        clearActive--;
        if(!clearFault)getLocationClearOperationStatus();
      }
    }
  }

  function text(v){return String(v==null?'':v).trim();}
  function uniqueParts(parts){
    var out=[];
    parts.forEach(function(p){p=text(p);if(p&&out.indexOf(p)<0)out.push(p);});
    return out;
  }
  function candidateLabel(r){
    return uniqueParts([r.name,r.admin4,r.admin3,r.admin2,r.admin1]).join(' / ');
  }
  function currentLabel(){
    try{
      var loc=store&&store.weatherLocation;
      return loc&&(loc.label||loc.name)?String(loc.label||loc.name):'未設定';
    }catch(_){return '未設定';}
  }
  function validResult(r){
    return r&&Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude));
  }
  async function searchLocations(query){
    var url=GEOCODE_URL+'?name='+encodeURIComponent(query)+
      '&count=10&language=ja&countryCode=JP&format=json';
    var res=await fetch(url);
    if(!res.ok)throw new Error('地点検索に失敗しました。');
    var data=await res.json();
    var results=Array.isArray(data&&data.results)?data.results.filter(validResult):[];
    var seen={},clean=[];
    results.forEach(function(r){
      var key=[r.name,r.admin1,r.admin2,r.admin3,r.admin4,r.latitude,r.longitude].join('|');
      if(seen[key])return;seen[key]=1;clean.push(r);
    });
    return clean;
  }
  function chooseCandidate(results){
    if(!results.length)return null;
    if(results.length===1)return results[0];
    var max=Math.min(results.length,8);
    var lines=['候補を番号で選択してください。'];
    for(var i=0;i<max;i++)lines.push((i+1)+'. '+candidateLabel(results[i]));
    var raw=prompt(lines.join('\n'),'1');
    if(raw===null)return null;
    var n=parseInt(raw,10);
    if(!Number.isFinite(n)||n<1||n>max){alert('候補番号を正しく入力してください。');return null;}
    return results[n-1];
  }
  async function configureLocation(){
    var current=store&&store.weatherLocation;
    var initial=current&&(current.name||current.query)?String(current.name||current.query):'';
    var query=prompt('天気を取得する市区町村名を入力してください。\n例：稲沢市、一宮市\n\n空欄で設定を解除します。',initial);
    if(query===null)return;
    query=query.trim();

    if(!query){
      if(!current)return;
      if(confirm('この店舗の天気地点設定を解除しますか？')){
        observeConfirmedLocationClear(function(){
          delete store.weatherLocation;
          persist();
          alert('天気地点設定を解除しました。\n未設定時は従来の愛知県西部／名古屋基準で取得します。');
        });
      }
      return;
    }

    try{
      var results=await searchLocations(query);
      if(!results.length){alert('「'+query+'」に一致する市区町村が見つかりませんでした。');return;}
      var chosen=chooseCandidate(results);if(!chosen)return;
      var label=candidateLabel(chosen);
      if(!confirm('この地点を使用しますか？\n\n'+label+'\n緯度 '+Number(chosen.latitude).toFixed(4)+' / 経度 '+Number(chosen.longitude).toFixed(4)))return;

      observeConfirmedLocationSet(function(){
        store.weatherLocation={
          name:String(chosen.name||query),
          query:query,
          label:label||query,
          latitude:Number(chosen.latitude),
          longitude:Number(chosen.longitude),
          timezone:String(chosen.timezone||'Asia/Tokyo'),
          admin1:text(chosen.admin1),
          admin2:text(chosen.admin2),
          admin3:text(chosen.admin3),
          admin4:text(chosen.admin4),
          source:'open-meteo-geocoding'
        };
        persist();
        alert('天気地点を「'+(label||query)+'」に設定しました。\n今後「自動」で、この地点の天気・最高気温・最低気温を取得します。');
      });
    }catch(e){
      alert((e&&e.message)||'地点設定に失敗しました。');
    }
  }

  function injectMenuItem(){
    var menu=document.getElementById('storeMenu');
    if(!menu||document.getElementById('weatherLocationMenuItem'))return;
    var btn=document.createElement('button');
    btn.id='weatherLocationMenuItem';
    btn.className='store-menu-item';
    var icon=document.createElement('span');
    icon.textContent='🌤️';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' 天気地点：'+currentLabel()));
    btn.onclick=async function(e){
      if(e)e.stopPropagation();
      menu.classList.add('insight-weather-menu-hidden');
      await configureLocation();
    };
    var children=menu.children;
    if(children.length>1)menu.insertBefore(btn,children[1]);
    else menu.appendChild(btn);
  }

  var oldShow=root.showStoreMenu;
  if(typeof oldShow==='function'){
    root.showStoreMenu=function(){
      var result=oldShow.apply(this,arguments);
      injectMenuItem();
      return result;
    };
  }

  root.InsightWeatherLocation={
    configure:configureLocation,
    getLocationSaveOperationStatus:getLocationSaveOperationStatus,
    getLocationClearOperationStatus:getLocationClearOperationStatus,
    search:searchLocations,
    label:candidateLabel
  };
})(typeof window!=='undefined'?window:globalThis);
