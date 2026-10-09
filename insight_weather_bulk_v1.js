/* Historical weather backfill. Does not create years/rows or overwrite recorded fields. */
(function(root){
'use strict';
if(root.InsightWeatherBulk)return;
var START='2023-01-01';
var DAILY='weather_code,temperature_2m_max,temperature_2m_min';
var running=false;
var cancelRequested=false;

function pad(n){return String(n).padStart(2,'0');}
function localDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function today(){
  return localDate(new Date());
}
function recentStart(){
  var d=new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()-3);
  return localDate(d);
}
function isValidLocation(loc){
  return !!loc&&Number.isFinite(Number(loc.latitude))&&Number.isFinite(Number(loc.longitude))&&
    Number(loc.latitude)>=-90&&Number(loc.latitude)<=90&&Number(loc.longitude)>=-180&&Number(loc.longitude)<=180;
}
function missing(v){
  return v===undefined||v===null||(typeof v==='string'&&v.trim()==='');
}
function validDate(y,m,d){
  var date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
  return date.getUTCFullYear()===Number(y)&&date.getUTCMonth()===Number(m)-1&&date.getUTCDate()===Number(d);
}
function readCurrent(){
  try{if(typeof allStores!=='undefined')return allStores;}catch(_){}
  return root.allStores;
}
function monthAndRow(target,dateKey){
  var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if(!match)return null;
  var rows=target&&target.data&&target.data[match[1]]&&target.data[match[1]][Number(match[2])+'月'];
  if(!Array.isArray(rows))return null;
  var d=Number(match[3]);
  var index=rows.findIndex(function(row,i){return row&&Number(row.d==null?i+1:row.d)===d;});
  return index<0?null:rows[index];
}
function scan(snapshot,lastDate){
  var end=lastDate||today(),recent=recentStart();
  var result={start:START,end:end,stores:[],groups:[],days:0,fields:0,unconfigured:[],unavailableYears:[]};
  var stores=snapshot&&snapshot.stores||{};
  Object.keys(stores).forEach(function(storeId){
    var target=stores[storeId],name=String(target&&target.name||storeId);
    if(!target||!isValidLocation(target.weatherLocation)){
      result.unconfigured.push(name);
      return;
    }
    var dates=[],yearData=target.data||{};
    var years=Array.isArray(target.years)&&target.years.length?new Set(target.years.map(String)):null;
    for(var year=2023;year<=Number(end.slice(0,4));year++){
      if(!Object.prototype.hasOwnProperty.call(yearData,String(year))||(years&&!years.has(String(year)))){
        result.unavailableYears.push(name+': '+year+'年');
        continue;
      }
      var months=yearData[String(year)];
      for(var m=1;m<=12;m++){
        var rows=months&&months[m+'月'];
        if(!Array.isArray(rows))continue;
        rows.forEach(function(row,index){
          if(!row||typeof row!=='object')return;
          var day=Number(row.d==null?index+1:row.d);
          if(!validDate(year,m,day))return;
          var key=year+'-'+pad(m)+'-'+pad(day);
          if(key<START||key>end)return;
          var count=Number(missing(row.weather))+Number(missing(row.tempMaxC))+Number(missing(row.tempMinC));
          if(!count)return;
          dates.push(key);result.fields+=count;result.days++;
        });
      }
    }
    if(!dates.length)return;
    dates.sort();
    result.stores.push({id:storeId,name:name,dates:dates.length});
    var byQuarter={};
    dates.forEach(function(date){
      var k=date>=recent?'recent':date.slice(0,4)+'-'+Math.floor((Number(date.slice(5,7))-1)/3);
      if(!byQuarter[k])byQuarter[k]=[];
      byQuarter[k].push(date);
    });
    Object.keys(byQuarter).sort().forEach(function(key){
      var keys=byQuarter[key];
      result.groups.push({storeId:storeId,storeName:name,dates:keys,
        start:keys[0],end:keys[keys.length-1],recent:key==='recent'});
    });
  });
  return result;
}
function urlFor(loc,group,endpoint){
  var args=[
    'latitude='+encodeURIComponent(Number(loc.latitude)),
    'longitude='+encodeURIComponent(Number(loc.longitude)),
    'daily='+encodeURIComponent(DAILY),
    'timezone='+encodeURIComponent(loc.timezone||'Asia/Tokyo')
  ];
  if(endpoint==='recent'){
    args.push('past_days=3','forecast_days=1');
  }else{
    args.push('start_date='+group.start,'end_date='+group.end);
    if(endpoint==='historical')args.push('models=jma_seamless');
    else args.push('models=best_match');
  }
  var base=endpoint==='recent'?'https://api.open-meteo.com/v1/jma':
    endpoint==='historical'?'https://historical-forecast-api.open-meteo.com/v1/forecast':
    'https://archive-api.open-meteo.com/v1/archive';
  return base+'?'+args.join('&');
}
function dailyMap(data){
  var daily=data&&data.daily;
  if(!daily||!Array.isArray(daily.time))throw new Error('APIの応答形式が不正です');
  var map=new Map();
  daily.time.forEach(function(date,i){
    map.set(date,{
      code:daily.weather_code&&daily.weather_code[i],
      max:daily.temperature_2m_max&&daily.temperature_2m_max[i],
      min:daily.temperature_2m_min&&daily.temperature_2m_min[i]
    });
  });
  return map;
}
function codeToWeather(code){
  if(missing(code)||!Number.isFinite(Number(code)))return null;
  var n=Number(code);
  if(n===0)return '快晴';
  if(n===1)return '晴';
  if(n===2)return '晴曇';
  if(n===3)return '曇';
  if(n===45||n===48)return '霧';
  if([51,53,55,61,80].includes(n))return '小雨';
  if([56,57,66,67].includes(n))return '凍雨';
  if([63,81].includes(n))return '雨';
  if([65,82].includes(n))return '大雨';
  if([95,96,97,99].includes(n))return '雷雨';
  if([71,73,75,77,85,86].includes(n))return '雪';
  return null;
}
function finiteTemperature(v){
  if(missing(v))return null;
  var n=Number(v);
  return Number.isFinite(n)?Math.trunc(n):null;
}
async function fetchSeries(loc,group){
  var modes=group.recent?['recent','archive']:['historical','archive'];
  var lastError=null;
  for(var i=0;i<modes.length;i++){
    if(cancelRequested)throw new Error('操作を中止しました');
    try{
      var response=await root.fetch(urlFor(loc,group,modes[i]),{cache:'no-store'});
      if(!response.ok){
        if(response.status===429)throw new Error('APIの利用制限（429）です。時間をおいて再実行してください');
        throw new Error('気象API: HTTP '+response.status);
      }
      var map=dailyMap(await response.json());
      // A partial response is not accepted; never silently mark unavailable days as completed.
      if(group.dates.some(function(date){
        var item=map.get(date);
        return !item||codeToWeather(item.code)===null||
          finiteTemperature(item.max)===null||finiteTemperature(item.min)===null;
      }))throw new Error('対象日の天気・最高気温・最低気温に欠損があります');
      return {map:map,source:modes[i]};
    }catch(error){
      if(String(error&&error.message||'').includes('429'))throw error;
      lastError=error;
    }
  }
  throw lastError||new Error('過去の天気を取得できませんでした');
}
function applyGroup(live,group,records){
  if(!root.InsightStorage||typeof root.InsightStorage.writeSnapshot!=='function')
    throw new Error('Insightの安全な保存機能を利用できません');
  var next=root.InsightStorage.clone(live);
  var originalStore=live.stores[group.storeId];
  var dest=next.stores[group.storeId];
  if(!originalStore||!dest)throw new Error('取得中に店舗構成が変更されました');
  var edits=[],days=0;
  group.dates.forEach(function(date){
    var current=monthAndRow(originalStore,date),copy=monthAndRow(dest,date),item=records.get(date);
    if(!current||!copy||!item)return;
    var values={weather:codeToWeather(item.code),
      tempMaxC:finiteTemperature(item.max),tempMinC:finiteTemperature(item.min)};
    var changed={};
    Object.keys(values).forEach(function(key){
      if(missing(current[key])&&values[key]!==null){
        copy[key]=values[key];
        changed[key]=values[key];
      }
    });
    if(Object.keys(changed).length){edits.push({date:date,values:changed});days++;}
  });
  if(!edits.length)return {days:0,fields:0};
  // Write first. If localStorage quota/write fails, no live data is modified.
  root.InsightStorage.writeSnapshot(next);
  var fields=0;
  edits.forEach(function(edit){
    var row=monthAndRow(originalStore,edit.date);
    if(!row)return;
    Object.keys(edit.values).forEach(function(key){
      if(missing(row[key])){row[key]=edit.values[key];fields++;}
    });
  });
  return {days:days,fields:fields};
}
async function run(onProgress){
  if(running)throw new Error('一括取得は既に実行中です');
  var snapshot=readCurrent();
  if(!snapshot||!snapshot.stores)throw new Error('店舗データを読み込めません');
  var plan=scan(snapshot);
  if(!plan.groups.length)return {plan:plan,days:0,fields:0,requests:0,sourceCounts:{}};
  running=true;cancelRequested=false;
  var total={plan:plan,days:0,fields:0,requests:0,sourceCounts:{}};
  try{
    for(var i=0;i<plan.groups.length;i++){
      if(cancelRequested)break;
      var group=plan.groups[i];
      var current=readCurrent();
      var target=current&&current.stores&&current.stores[group.storeId];
      if(!target||!isValidLocation(target.weatherLocation))throw new Error(group.storeName+'：天気地点が変更されました');
      if(typeof onProgress==='function')onProgress({done:i,total:plan.groups.length,store:group.storeName,source:null,summary:total});
      var fetched=await fetchSeries(target.weatherLocation,group);
      if(cancelRequested)break;
      var added=applyGroup(readCurrent(),group,fetched.map);
      total.days+=added.days;total.fields+=added.fields;total.requests++;
      total.sourceCounts[fetched.source]=(total.sourceCounts[fetched.source]||0)+1;
      if(typeof onProgress==='function')onProgress({done:i+1,total:plan.groups.length,store:group.storeName,source:fetched.source,summary:total});
    }
    total.cancelled=cancelRequested;
    return total;
  }finally{running=false;cancelRequested=false;}
}
function button(id,title){
  var b=root.document.createElement('button');
  b.id=id;b.type='button';b.className='insight-weather-bulk-button';
  b.textContent=title;return b;
}
function install(){
  if(!root.document)return false;
  var page=root.document.getElementById('pageSettings');
  var container=page&&page.querySelector('.insight-settings-content');
  if(!container)return false;
  if(root.document.getElementById('insightWeatherBulkStart'))return true;
  var section=root.document.createElement('section');
  section.className='insight-settings-section insight-weather-bulk-section';
  var h=root.document.createElement('h2');h.textContent='過去の天気を一括補完';
  var p=root.document.createElement('p');
  p.textContent='2023年1月1日〜本日。登録済み年度・日付の未入力欄だけ補完し、既存の天気・最高／最低気温、売上、客数は変更しません。';
  var note=root.document.createElement('p');note.className='insight-weather-bulk-note';
  note.textContent='全店舗が対象です。各店舗の「天気地点」が未設定の場合はスキップします。当日分は予報値となる場合があります。開始前にデータをバックアップしてください。';
  var row=root.document.createElement('div');row.className='insight-weather-bulk-actions';
  var start=button('insightWeatherBulkStart','未取得の天気を一括取得');
  var cancel=button('insightWeatherBulkCancel','中止');cancel.disabled=true;
  var status=root.document.createElement('p');status.id='insightWeatherBulkStatus';status.className='insight-weather-bulk-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  row.append(start,cancel);section.append(h,p,note,row,status);container.append(section);
  cancel.addEventListener('click',function(){cancelRequested=true;status.textContent='中止を受け付けました。進行中の取得完了後に停止します。';});
  start.addEventListener('click',async function(){
    if(running)return;
    var plan=scan(readCurrent());
    if(!plan.groups.length){
      status.textContent=plan.unconfigured.length?'取得対象なし。天気地点未設定：'+plan.unconfigured.join('、'):'取得対象の未入力欄はありません。対象年度が登録されているか確認してください。';
      return;
    }
    var info='対象：'+plan.stores.map(function(s){return s.name+'（'+s.dates+'日）';}).join('、')+
      '\n未入力 '+plan.days+'日／'+plan.fields+'項目、取得区間 '+plan.groups.length+'件'+
      (plan.unconfigured.length?'\n地点未設定のためスキップ：'+plan.unconfigured.join('、'):'')+
      '\n\n既存の入力済み値は上書きしません。事前にバックアップを保存しましたか？';
    if(!root.confirm(info))return;
    start.disabled=true;cancel.disabled=false;
    try{
      var result=await run(function(p){
        status.textContent='取得中 '+p.done+'/'+p.total+' 区間：'+p.store+
          '（保存 '+p.summary.days+'日／'+p.summary.fields+'項目）';
      });
      status.textContent=(result.cancelled?'中止しました。':'取得が終了しました。')+
        ' 補完 '+result.days+'日／'+result.fields+'項目。'+
        (result.plan.unconfigured.length?' 地点未設定：'+result.plan.unconfigured.join('、')+'。':'')+
        (result.plan.unavailableYears.length?' 未登録年度：'+result.plan.unavailableYears.join('、')+'。':'')+
        (result.sourceCounts.archive?' 再解析データ使用区間：'+result.sourceCounts.archive+'。':'')+
        ' 既存の表示を更新するには画面を再読み込みしてください。';
    }catch(error){
      status.textContent='取得を中断しました：'+String(error&&error.message||error)+
        '。保存済み分は保持されています。時間をおいて再実行すると未入力分から再開します。';
    }finally{start.disabled=false;cancel.disabled=true;}
  });
  return true;
}
if(root.document){
  function startInstall(){
    if(install())return;
    var attempts=0,timer=root.setInterval(function(){
      attempts++;
      if(install()||attempts>=50)root.clearInterval(timer);
    },100);
  }
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',startInstall,{once:true});
  else startInstall();
}
root.InsightWeatherBulk={scan:scan,run:run,applyGroup:applyGroup,urlFor:urlFor,
  fetchSeries:fetchSeries,isValidLocation:isValidLocation,codeToWeather:codeToWeather,
  cancel:function(){cancelRequested=true;},install:install};
})(typeof window!=='undefined'?window:globalThis);
