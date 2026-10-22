/* On-device, read-only availability check for weather/temperature sales analysis.
 * Does not transmit, persist, or expose saved daily records. Uses Stage 1+2 modules.
 */
(function(root){
  'use strict';
  if(root.InsightWeatherSalesDiagnostics)return;
  var LOOKBACK=84;
  var ISSUES=[
    ['unknownTrip','対象便未判定'],['reviewTrip','対象便の確認要'],
    ['tentativeInactiveTrip','対象外推定'],['missingDailyRow','日別データなし'],
    ['missingConditions','曜日等未確認'],['missingWeather','天気未入力'],
    ['missingTemperature','気温未入力'],['missingSales','販売数未入力'],
    ['eventDay','イベント日']
  ];
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function matches(trip,field){
    var usable=0,percent=0;
    (trip.byCalendar||[]).forEach(function(group){
      var section=group[field];
      (section&&section.comparisons||[]).forEach(function(pair){
        if(pair.status==='ready'){usable++;percent++;}
        else if(pair.status==='zero_baseline')usable++;
      });
    });
    return {differences:usable,percentages:percent};
  }
  function issues(counts){
    counts=object(counts)?counts:{};
    return ISSUES.filter(function(entry){return Number(counts[entry[0]])>0;})
      .map(function(entry){return {code:entry[0],label:entry[1],count:counts[entry[0]]};});
  }
  function perTrip(trip){
    var weather=matches(trip,'weather'),temperature=matches(trip,'temperature');
    var diff=weather.differences+temperature.differences;
    var pct=weather.percentages+temperature.percentages;
    var status=pct?'comparison_available':diff?'difference_only':
      trip.eligibleDays?'insufficient_pairs':'no_samples';
    return {trip:trip.trip,eligibleDays:trip.eligibleDays,
      weatherPairs:weather.differences,weatherRatePairs:weather.percentages,
      temperaturePairs:temperature.differences,temperatureRatePairs:temperature.percentages,
      status:status,issues:issues(trip.excludedCounts)};
  }
  function examine(snapshot,options,deps){
    options=options||{};deps=deps||{};
    if(!object(snapshot)||!object(snapshot.stores))throw new Error('店舗データを確認できません。');
    var api=deps.trends||root.InsightWeatherSalesTrends;
    if(!api||typeof api.analyze!=='function')throw new Error('傾向分析モジュールが読み込まれていません。');
    var days=options.lookbackDays===undefined?LOOKBACK:options.lookbackDays;
    if(!Number.isInteger(days)||days<1||days>366)throw new Error('診断期間が不正です。');
    var stores=Object.keys(snapshot.stores).map(function(storeId){
      try{
        var opts={storeId:storeId,lookbackDays:days};
        if(options.today)opts.today=options.today;
        if(options.endDate)opts.endDate=options.endDate;
        var report=api.analyze(snapshot,opts,deps);
        var categories=report.categories.map(function(cat){
          return {id:cat.id,name:cat.name,hidden:cat.hidden,trips:cat.trips.map(perTrip)};
        });
        return {id:storeId,name:report.store.name,period:report.period,categories:categories,
          readyCategories:categories.filter(function(cat){
            return cat.trips.some(function(t){return t.status==='comparison_available'||t.status==='difference_only';});
          }).length,error:null};
      }catch(error){
        return {id:storeId,name:String(snapshot.stores[storeId]&&snapshot.stores[storeId].name||storeId),
          period:null,categories:[],readyCategories:0,error:String(error&&error.message||'診断できません')};
      }
    });
    return {version:1,lookbackDays:days,readOnly:true,localOnly:true,
      description:'保存済み実績の条件比較可否。予測精度・因果関係は判定しません。',
      stores:stores};
  }
  var model={examine:examine,LOOKBACK:LOOKBACK};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightWeatherSalesDiagnostics=model;
  if(!root.document)return;
  var doc=root.document,button=null,overlay=null;
  function node(tag,content,cls){
    var item=doc.createElement(tag);
    if(content!==undefined)item.textContent=content;
    if(cls)item.className=cls;
    return item;
  }
  function close(){
    if(!overlay)return;
    overlay.hidden=true;
    if(button)button.focus();
  }
  function renderStore(container,store){
    var section=node('section',undefined,'ipdh-store');
    section.classList.add('iwsd-store');
    section.append(node('h3',store.name));
    if(store.error){
      section.append(node('p','この店舗の診断はできませんでした：'+store.error,'ipdh-note'));
      container.append(section);return;
    }
    section.append(node('p',store.period.startDate+' ～ '+store.period.endDate+
      '（'+store.period.days+'日）・条件比較の成立：'+store.readyCategories+' / '+store.categories.length+'カテゴリー','ipdh-period'));
    var scroll=node('div',undefined,'ipdh-table-scroll');
    var table=node('table',undefined,'ipdh-table');table.classList.add('iwsd-table');
    var head=node('thead'),row=node('tr');
    ['カテゴリー','便','有効日数','天気比較','気温比較','判定・不足理由'].forEach(function(label){
      row.append(node('th',label));
    });
    head.append(row);table.append(head);
    var body=node('tbody');
    store.categories.forEach(function(category){
      category.trips.forEach(function(trip){
        var tr=node('tr');
        if(trip.trip===1){
          var th=node('th',category.name+(category.hidden?'（非表示）':''));th.rowSpan=3;th.scope='rowgroup';tr.append(th);
        }
        tr.append(node('td',trip.trip+'便'));
        tr.append(node('td',String(trip.eligibleDays)+'日'));
        tr.append(node('td',String(trip.weatherPairs)+'組'));
        tr.append(node('td',String(trip.temperaturePairs)+'組'));
        var labels={comparison_available:'条件比較可',difference_only:'平均差のみ（比率不可）',
          insufficient_pairs:'条件別データ不足',no_samples:'有効データなし'};
        var detail=trip.issues.map(function(issue){return issue.label+' '+issue.count+'件';}).join('、');
        tr.append(node('td',labels[trip.status]+(detail?' / '+detail:'')));
        body.append(tr);
      });
    });
    table.append(body);scroll.append(table);section.append(scroll);container.append(section);
  }
  function open(){
    var source;
    try{source=typeof allStores!=='undefined'?allStores:root.allStores;}
    catch(_){source=root.allStores;}
    var report=examine(source);
    if(!overlay){
      overlay=node('div',undefined,'ipdh-overlay');overlay.id='insightWeatherSalesDiagnosticsOverlay';
      overlay.hidden=true;
      var dialog=node('div',undefined,'ipdh-dialog');
      dialog.classList.add('iwsd-dialog');dialog.setAttribute('role','dialog');
      dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','iwsdHeading');
      var header=node('div',undefined,'ipdh-header');
      var title=node('h2','天気・気温の分析可否チェック');title.id='iwsdHeading';
      var exit=node('button','閉じる','ipdh-close');exit.type='button';exit.addEventListener('click',close);
      header.append(title,exit);dialog.append(header);
      var body=node('div',undefined,'ipdh-body');dialog.append(body);
      overlay.append(dialog);doc.body.append(overlay);
      overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
      overlay.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}});
    }
    var body=overlay.querySelector('.ipdh-body');body.replaceChildren();
    body.append(node('p','直近'+report.lookbackDays+'日・前日まで。店舗内に保存された実績だけを読み取ります。','ipdh-note'));
    body.append(node('p','比較は同じ曜日と祝日区分内で各条件3日以上の場合のみ成立。比較できても予測精度や原因を保証しません。結果は送信・保存されません。','ipdh-note'));
    body.append(node('p','有効日数は便ごとの件数、天気比較・気温比較は成立した条件の組数です。過去の対象便不明・推定対象外は確定扱いしません。','ipdh-note'));
    if(!report.stores.length)body.append(node('p','店舗データがありません。','ipdh-note'));
    report.stores.forEach(function(store){renderStore(body,store);});
    overlay.hidden=false;overlay.querySelector('.ipdh-close').focus();
    return report;
  }
  function initButton(){
    if(button&&button.isConnected)return true;
    var anchor=doc.getElementById('insightPredictionDataButton');
    var actions=doc.getElementById('insightSettingsDataActions');
    if(!anchor||!actions||!actions.contains(anchor))return false;
    button=node('button','天気・気温の分析可否チェック','sidebar-btn');
    button.type='button';button.id='insightWeatherSalesDiagnosticsButton';
    button.addEventListener('click',function(){
      try{open();}catch(error){root.alert('分析可否を確認できませんでした。'+String(error&&error.message||''));}
    });
    anchor.insertAdjacentElement('afterend',button);
    return true;
  }
  function init(){
    if(initButton())return;
    var attempts=0,timer=root.setInterval(function(){
      attempts++;if(initButton()||attempts>=50)root.clearInterval(timer);
    },100);
  }
  model.open=open;
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});
  else root.setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
