/* 発注予測: saved sales records and JMA forecasts, read-only and memory-only. */
(function(root){
  'use strict';
  var BASE='https://www.jma.go.jp/bosai/';
  function isoDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return false;var date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
  function addDays(value,days){if(!isoDate(value))throw new Error('日付が不正です');var date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
  function today(now){var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now||new Date()),p={};parts.forEach(function(x){p[x.type]=x.value;});return p.year+'-'+p.month+'-'+p.day;}
  function weatherDayTone(date,holidayCheck){var d=new Date(date+'T12:00:00Z'),weekday=d.getUTCDay();return weekday===0||(typeof holidayCheck==='function'&&holidayCheck(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()))?'sun':weekday===6?'sat':'';}
  // 気象庁の予報コードだけをアイコンへ変換。未発表・未対応は推測表示しない。
  function weatherIconKind(code){
    var groups={
      sun:'100',
      partly:'101,110,111,201,210,211',
      sunRain:'102,103,112,113,114,301,311',
      sunSnow:'104,105,115,116,117,401,411',
      cloud:'200',
      cloudRain:'202,203,212,213,214,313',
      cloudSnow:'204,205,215,216,217,413',
      rain:'300,302,308',
      rainSnow:'303,304,314,403,414',
      snow:'400,402,406'
    };
    var value=String(code==null?'':code);
    for(var kind in groups){if(groups[kind].split(',').includes(value))return kind;}
    return null;
  }
  function createWeatherIcon(code,doc){
    var kind=weatherIconKind(code);if(!kind)return null;
    var ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('class','of-weather-symbol');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    function shape(name,attributes){
      var node=doc.createElementNS(ns,name);
      Object.keys(attributes).forEach(function(key){node.setAttribute(key,String(attributes[key]));});
      svg.appendChild(node);return node;
    }
    function sun(cx,cy,r){
      shape('circle',{cx:cx,cy:cy,r:r,class:'of-wx-sun'});
      for(var i=0;i<8;i++){var angle=i*Math.PI/4;
        shape('line',{x1:(cx+Math.cos(angle)*(r+2)).toFixed(2),y1:(cy+Math.sin(angle)*(r+2)).toFixed(2),
          x2:(cx+Math.cos(angle)*(r+4)).toFixed(2),y2:(cy+Math.sin(angle)*(r+4)).toFixed(2),class:'of-wx-sun'});
      }
    }
    function cloud(offset){
      shape('path',{d:'M8 22H23A5 5 0 0 0 23 12H22A7 7 0 0 0 9 14A4 4 0 0 0 8 22Z',
        transform:'translate(0 '+offset+')',class:'of-wx-cloud'});
    }
    function rain(){
      [11,17,23].forEach(function(x){shape('line',{x1:x,y1:24,x2:x-2,y2:29,class:'of-wx-rain'});});
    }
    function snow(){
      [12,22].forEach(function(x){shape('path',{d:'M'+x+' 24v5m-2.2-3.7 4.4 2.4m0-2.4-4.4 2.4',class:'of-wx-snow'});});
    }
    if(kind==='sun')sun(16,16,6);
    else{
      if(['partly','sunRain','sunSnow'].includes(kind))sun(11,10,4);
      cloud(['rain','cloudRain','sunRain','rainSnow','snow','cloudSnow','sunSnow'].includes(kind)?-4:0);
      if(['rain','cloudRain','sunRain','rainSnow'].includes(kind))rain();
      if(['snow','cloudSnow','sunSnow','rainSnow'].includes(kind))snow();
    }
    return svg;
  }
  function dates(delivery){return {previousYear:[-3,-2,-1,0,1,2,3].map(function(n){return addDays(delivery,-364+n);}),weeks:[-28,-21,-14,-7].map(function(n){return addDays(delivery,n);}),recent:[-7,-6,-5,-4,-3].map(function(n){return addDays(delivery,n);})};}
  function hasRecord(record,mask){return !!(record&&Array.isArray(record.trips)&&record.trips.some(function(t,i){return mask[i]!==false&&t&&['delivery','sales'].some(function(k){return t[k]!==null&&t[k]!==undefined&&Number.isFinite(t[k]);});}));}
  function collect(saved,category,delivery,sales){var ranges=dates(delivery),mask=sales.activeTrips(category);function at(date){var raw=saved&&saved[date]&&saved[date][category.id];return {date:date,record:sales.normalizeRecord(raw)};}var weeks=ranges.weeks.map(at);return {previousYear:ranges.previousYear.map(at),weeks:weeks,recent:ranges.recent.map(at).filter(function(x){return hasRecord(x.record,mask);}),deliveryAverage:sales.average(weeks.map(function(x){return x.record;}),'delivery',mask),salesAverage:sales.average(weeks.map(function(x){return x.record;}),'sales',mask)};}
  function number(v){return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);}
  function resolveLocation(location,areas){
    if(!location)return {office:'230000',area:'230010',latitude:35.17,longitude:136.97,label:'愛知県西部'};
    var names=[location.name,location.admin4,location.admin3,location.admin2,location.query].filter(Boolean),matches=[];
    Object.keys(areas.class20s||{}).forEach(function(code){var town=areas.class20s[code];if(!names.some(function(name){return town.name===name||town.name.replace(/[（(].*$/,'')===name;}))return;var middle=areas.class15s[town.parent],region=middle&&areas.class10s[middle.parent],office=region&&areas.offices[region.parent];if(!office)return;if(location.admin1&&office.name.indexOf(location.admin1)<0&&location.admin1!=='北海道')return;matches.push({office:region.parent,area:middle.parent,latitude:Number(location.latitude),longitude:Number(location.longitude),label:office.name+' '+region.name});});
    var distinct=matches.filter(function(x,i){return matches.findIndex(function(y){return x.office===y.office&&x.area===y.area;})===i;});
    if(distinct.length!==1)throw new Error('設定地点の気象庁予報区を特定できません。天気地点設定を確認してください。');return distinct[0];
  }
  function weatherText(code){var common={'100':'晴れ','101':'晴れ時々くもり','102':'晴れ一時雨','103':'晴れ時々雨','104':'晴れ一時雪','105':'晴れ時々雪','110':'晴れのちくもり','111':'晴れのちくもり','112':'晴れのち雨','113':'晴れのち雨','114':'晴れのち雨','115':'晴れのち雪','116':'晴れのち雪','117':'晴れのち雪','200':'くもり','201':'くもり時々晴れ','202':'くもり一時雨','203':'くもり時々雨','204':'くもり一時雪','205':'くもり時々雪','210':'くもりのち晴れ','211':'くもりのち晴れ','212':'くもりのち雨','213':'くもりのち雨','214':'くもりのち雨','215':'くもりのち雪','216':'くもりのち雪','217':'くもりのち雪','300':'雨','301':'雨時々晴れ','302':'雨時々止む','303':'雨時々雪','304':'雨か雪','308':'雨で暴風を伴う','311':'雨のち晴れ','313':'雨のちくもり','314':'雨のち雪','400':'雪','401':'雪時々晴れ','402':'雪時々止む','403':'雪時々雨','406':'風雪強い','411':'雪のち晴れ','413':'雪のちくもり','414':'雪のち雨'};return common[String(code)]|| (code?'天気コード '+code:'—');}
  function nearest(candidates,location,points){var ranked=candidates.map(function(a){var p=points[a.area.code];if(!p||!Array.isArray(p.lat)||!Array.isArray(p.lon))return {a:a,d:Infinity};var lat=p.lat[0]+p.lat[1]/60,lon=p.lon[0]+p.lon[1]/60;return {a:a,d:Math.pow(lat-location.latitude,2)+Math.pow((lon-location.longitude)*Math.cos(lat*Math.PI/180),2)};}).sort(function(a,b){return a.d-b.d;});if(!ranked.length||!Number.isFinite(ranked[0].d))throw new Error('気温の予報地点を特定できません。');return ranked[0].a;}
  function parseForecast(data,location,areas,points,start){
    if(!Array.isArray(data)||!data.length||!data[0].timeSeries)throw new Error('天気予報データが不正です');
    var days={},temperatureNames=new Set();for(var i=0;i<7;i++){var date=addDays(start,i);days[date]={date:date,weather:'—',weatherCode:null,max:null,min:null,pop:null};}
    // Weekly first, detailed forecast second. Daily rain probability is the
    // maximum of the published time slots; never infer missing temperatures.
    data.slice().reverse().forEach(function(report){var reportPops={};(report.timeSeries||[]).forEach(function(series){var rows=series.areas||[],temperature=rows.some(function(a){return a.temps||a.tempsMin||a.tempsMax;}),area;
      if(temperature){area=nearest(rows,location,points);temperatureNames.add(area.area.name);}
      else{area=rows.find(function(a){return a.area.code===location.area;})||rows.find(function(a){return a.area.code===location.office;});if(!area&&rows.length===1){var info=(areas.class10s||{})[rows[0].area.code];if(info&&info.parent===location.office)area=rows[0];}}
      if(!area)return;
      (series.timeDefines||[]).forEach(function(time,index){var day=days[String(time).slice(0,10)];if(!day)return;var code=area.weatherCodes&&area.weatherCodes[index],text=area.weathers&&area.weathers[index];if(code){day.weather=text?text.replace(/\s+/g,' '):weatherText(code);day.weatherCode=String(code);}if(area.pops){var pop=number(area.pops[index]);if(pop!==null)reportPops[day.date]=reportPops[day.date]===undefined?pop:Math.max(reportPops[day.date],pop);}['Min','Max'].forEach(function(key){var val=number(area['temps'+key]&&area['temps'+key][index]);if(val!==null)day[key.toLowerCase()]=val;});if(area.temps){var val=number(area.temps[index]),hour=String(time).slice(11,13);if(val!==null){if(hour==='00')day.min=val;else if(hour==='09')day.max=val;}}});
    });Object.keys(reportPops).forEach(function(date){days[date].pop=reportPops[date];});});
    if(!Object.values(days).some(function(d){return d.weather!=='—';}))throw new Error('設定地点の予報がありません。');
    return {days:Object.values(days),location:location.label,temperatureLocation:Array.from(temperatureNames).join(' / '),reportDatetime:data[0].reportDatetime};
  }
  function createClient(fetcher,clock){
    var cache=new Map(),pending=new Map(),attempts=new Map();clock=clock||Date.now;
    async function json(url){var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);try{var response=await fetcher(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});if(!response.ok)throw new Error('気象庁の予報を取得できませんでした。');return await response.json();}finally{clearTimeout(timer);}}
    async function memo(key,url,ttl,force){if(pending.has(key))return pending.get(key);var entry=cache.get(key),now=clock();if(entry&&now-entry.at<ttl&&!force)return entry.value;if(attempts.has(key)&&now-attempts.get(key)<60000){if(entry)return entry.value;throw new Error('少し時間をおいて更新してください。');}attempts.set(key,now);var promise=json(url).then(function(value){cache.set(key,{at:clock(),value:value});return value;}).finally(function(){pending.delete(key);});pending.set(key,promise);return promise;}
    return {load:async function(location,force){var constants=await Promise.all([memo('areas',BASE+'common/const/area.json',86400000,false),memo('points',BASE+'amedas/const/amedastable.json',86400000,false)]),target=resolveLocation(location,constants[0]),raw=await memo(target.office,BASE+'forecast/data/forecast/'+target.office+'.json',1800000,force),entry=cache.get(target.office),result=parseForecast(raw,target,constants[0],constants[1],today(new Date(clock())));result.fetchedAt=entry.at;return result;}};
  }
  var model={addDays:addDays,today:today,dates:dates,hasRecord:hasRecord,collect:collect,resolveLocation:resolveLocation,parseForecast:parseForecast,createClient:createClient,weatherDayTone:weatherDayTone,weatherIconKind:weatherIconKind};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightOrderForecast=model;if(!root.document)return;
  function init(){
    if(root.__insightOrderForecastV1)return;
    var sales=root.InsightSalesCount,doc=root.document;if(!sales||!sales.createReadOnlyDayCard||!doc.getElementById('navSaleResults')){setTimeout(init,20);return;}root.__insightOrderForecastV1=true;
    var state={storeId:allStores.current,delivery:addDays(today(),2),categoryId:null},forecast=null,error='',loading=false,request=0,client=createClient(root.fetch.bind(root));
    function el(tag,text,cls){var node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
    var link=el('link');link.rel='stylesheet';link.href='./insight_order_forecast_v1.css?v=20261010-weather-details-8';doc.head.append(link);
    var nav=el('button',undefined,'nav-btn');nav.id='navOrderForecast';nav.type='button';nav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18v16H3zM3 9h18M8 4v16"/></svg><span>発注予測</span>';nav.onclick=function(){root.gotoNav('orderForecast');};var navList=doc.querySelector('#sidebar .nav-list'),divider=el('div',undefined,'of-nav-divider');divider.setAttribute('role','separator');navList.append(divider,nav);
    var page=el('div',undefined,'page of-page');page.id='pageOrderForecast';page.innerHTML='<div class="page-header"><div class="page-title">発注予測</div></div><div class="of-toolbar"><label>納品日 <input id="ofDelivery" type="date" min="1900-01-01" max="9998-12-31"></label><label>カテゴリー <select id="ofCategory"></select></label></div><section class="of-section"><div class="of-heading"><h2>天気予報 <details class="of-source-info"><summary aria-label="天気予報の出典を確認" title="出典を確認">ⓘ</summary><div class="of-source-description"><a href="https://www.jma.go.jp/bosai/forecast/" target="_blank" rel="noopener noreferrer">出典：気象庁ホームページ（天気予報データを加工して表示）</a></div></details></h2><button id="ofRefresh" type="button">更新</button></div><div id="ofWeatherStatus" role="status" class="of-meta"></div><div id="ofWeather" class="of-grid"></div></section><section class="of-section"><h2>前年同時期7日間</h2><div id="ofPreviousYear" class="of-meta"></div><div id="ofYearCards" class="of-grid"></div></section><section class="of-section"><h2>過去4週間の同曜日実績</h2><div id="ofWeekCards" class="of-grid"></div></section><section class="of-section"><h2>納品日前7日間の実績</h2><div id="ofRecentCards" class="of-grid"></div><div id="ofRecentEmpty" class="of-meta"></div></section>';doc.getElementById('main').append(page);
    function dateLabel(date){var d=new Date(date+'T12:00:00Z');return Number(date.slice(5,7))+'/'+Number(date.slice(8,10))+'（'+'日月火水木金土'[d.getUTCDay()]+'）';}
    function categories(){return (allStores.salesCountManagement&&allStores.salesCountManagement.categories||[]).filter(function(c){return !c.hidden;});}
    function dataStore(){return allStores.stores[state.storeId];}
    function weather(){var box=doc.getElementById('ofWeather');box.replaceChildren();var status=doc.getElementById('ofWeatherStatus');status.textContent=loading?'取得中…':error;status.hidden=!status.textContent;doc.getElementById('ofRefresh').disabled=loading;if(!forecast)return;forecast.days.forEach(function(day){var tone=weatherDayTone(day.date,typeof isHoliday==='function'?isHoliday:null),card=el('div',undefined,'sc-day of-weather-card'+(tone==='sun'?' sun-card':tone==='sat'?' sat-card':'')+(day.date===state.delivery?' of-selected':'')),temperatures=el('div',undefined,'of-temperatures'),wx=el('div',day.weather,'of-weather-text');card.dataset.date=day.date;wx.title=day.weather;temperatures.append(el('span',day.max===null?'—':Math.floor(day.max)+'°','of-temp-max'),el('span',' / ','of-temp-divider'),el('span',day.min===null?'—':Math.floor(day.min)+'°','of-temp-min'));var symbol=createWeatherIcon(day.weatherCode,doc);card.append(el('strong',dateLabel(day.date),'sc-day-num'+(tone?' '+tone:'')));if(symbol)card.append(symbol);card.append(wx,temperatures,el('small','降水 '+(day.pop===null?'—':day.pop+'%')));box.append(card);});}
    function dayCard(item,category){var card=sales.createReadOnlyDayCard(item.date,item.record,category);card.dataset.date=item.date;var events=root.InsightEvents&&root.InsightEvents.list(allStores,state.storeId,item.date,item.date)||[];if(events.length){var badge=el('small',Array.from(new Set(events.map(function(e){return e.type==='sale'?'セール':'イベント';}))).join('・'),'of-event');badge.title=events.map(function(e){return e.name||e.title||e.type;}).join(' / ');card.append(badge);}return card;}
    function render(){if(!dataStore())state.storeId=allStores.current;var available=categories(),category=available.find(function(c){return c.id===state.categoryId;})||available[0];state.categoryId=category&&category.id||null;var catSelect=doc.getElementById('ofCategory');catSelect.replaceChildren();available.forEach(function(c){var option=el('option',c.name);option.value=c.id;catSelect.append(option);});catSelect.value=state.categoryId||'';doc.getElementById('ofDelivery').value=state.delivery;doc.getElementById('ofPreviousYear').textContent='基準日 '+addDays(state.delivery,-364)+'（52週間前）';['ofYearCards','ofWeekCards','ofRecentCards'].forEach(function(id){doc.getElementById(id).replaceChildren();});if(category){var data=collect(dataStore().salesCounts,category,state.delivery,sales);data.previousYear.forEach(function(item){doc.getElementById('ofYearCards').append(dayCard(item,category));});data.weeks.forEach(function(item){doc.getElementById('ofWeekCards').append(dayCard(item,category));});doc.getElementById('ofWeekCards').append(sales.createAverageCard('4週平均',data.deliveryAverage,data.salesAverage,null,category));data.recent.forEach(function(item){doc.getElementById('ofRecentCards').append(dayCard(item,category));});doc.getElementById('ofRecentEmpty').textContent=data.recent.length?'':'対象期間の実績はありません。';}else doc.getElementById('ofRecentEmpty').textContent='表示するカテゴリーがありません。';weather();}
    async function load(force){var token=++request;loading=true;error='';weather();try{var result=await client.load(dataStore().weatherLocation,force);if(token!==request)return;forecast=result;}catch(e){if(token!==request)return;error=(e&&e.message||'天気予報を取得できませんでした。')+(forecast?'（前回取得分を表示）':'');}finally{if(token===request){loading=false;weather();}}}
doc.getElementById('ofCategory').onchange=function(e){state.categoryId=e.target.value;render();};doc.getElementById('ofDelivery').onchange=function(e){if(!isoDate(e.target.value)||e.target.value<'1900-01-01'||e.target.value>'9998-12-31'){e.target.value=state.delivery;return;}state.delivery=e.target.value;render();};doc.getElementById('ofRefresh').onclick=function(){load(true);};
    var originalGoto=root.gotoNav;root.gotoNav=function(target){if(target==='orderForecast'){originalGoto.apply(this,arguments);if(currentNav!==target)return;state.storeId=allStores.current;doc.querySelectorAll('.nav-btn').forEach(function(n){n.classList.remove('active');});doc.querySelectorAll('.page').forEach(function(n){n.classList.remove('show');});nav.classList.add('active');page.classList.add('show');render();load(false);return;}var result=originalGoto.apply(this,arguments);if(currentNav!=='orderForecast'){nav.classList.remove('active');page.classList.remove('show');}return result;};
    var originalSwitch=root.switchStore;root.switchStore=function(id){if(currentNav!=='orderForecast')return originalSwitch.apply(this,arguments);if(!allStores.stores[id]){doc.getElementById('storeSel').value=allStores.current;return;}var view=currentNav;currentNav=1;try{originalSwitch.apply(this,arguments);}finally{currentNav=view;}state.storeId=allStores.current;forecast=null;render();load(false);};
    model.getState=function(){return Object.assign({},state);};model.render=render;
  }
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
