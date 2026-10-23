/* Prediction data completeness diagnostics (read-only, no changes to stored records). */
(function(root){
  'use strict';
  if(root.InsightPredictionDataHealth)return;

  var START='2025-09-01';
  var WEEK=['日','月','火','水','木','金','土'];
  // Resolved only when examine() is called: the browser loader loads this file
  // before InsightTripHistoryResolver.
  var nodeResolver=typeof module!=='undefined'&&module.exports?
    require('./insight_trip_history_resolver_v1.js'):null;
  function resolverFor(options){
    var resolver=options&&options.resolver||nodeResolver||root.InsightTripHistoryResolver;
    if(!resolver||typeof resolver.resolveDate!=='function')
      throw new Error('過去対象便の判定機能を利用できません。');
    return resolver;
  }
  function isObject(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function parseDate(s){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;
    var d=new Date(s+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d:null;
  }
  function iso(d){return d.toISOString().slice(0,10);}
  function addDays(s,n){var d=parseDate(s);if(!d)throw new Error('診断対象の日付が不正です。');d.setUTCDate(d.getUTCDate()+n);return iso(d);}
  function yesterday(){
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    var values={};parts.forEach(function(part){values[part.type]=part.value;});
    return addDays(values.year+'-'+values.month+'-'+values.day,-1);
  }
  function validCount(value){return Number.isSafeInteger(value)&&value>=0;}
  function validTemp(value){
    return value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
  }
  function temperatureState(row){
    if(!row||row.tempMaxC===undefined||row.tempMinC===undefined||
      row.tempMaxC===null||row.tempMinC===null||
      String(row.tempMaxC).trim()===''||String(row.tempMinC).trim()==='')return 'missing';
    if(!validTemp(row.tempMaxC)||!validTemp(row.tempMinC))return 'invalid';
    return Number(row.tempMaxC)<Number(row.tempMinC)?'reversed':'valid';
  }
  function validSavedTrip(record,index){
    var trip=record&&Array.isArray(record.trips)?record.trips[index]:null;
    return isObject(trip)?trip:null;
  }
  function dateTripState(raw,trip){
    if(!trip||!['active','inactive','unknown'].includes(trip.status))return 'unverified';
    if(trip.tentative||trip.needsDateReview||trip.conflict)return 'review';
    if(trip.status==='unknown')return 'unverified';
    if(trip.status==='inactive')
      return trip.source==='current'||trip.source==='manual'?'confirmed_inactive':'unverified';
    if(trip.source==='current'||trip.source==='manual')return 'confirmed_active';
    // A monthly inference is not evidence that a trip was active on every day.
    // "observed_day" can originate from delivery alone, not necessarily sales.
    if((trip.source==='observed_day'||trip.source==='inference')&&raw&&
      (validCount(raw.sales)||validCount(raw.delivery)))return 'confirmed_active';
    return 'unverified';
  }
  function gapWithinActiveDays(days){
    var longest=null,flags=[];
    function flush(){
      if(!flags.length)return;
      var run=longestInnerGap(flags);
      if(run!==null)longest=longest===null?run:Math.max(longest,run);
      flags=[];
    }
    days.forEach(function(day){
      if(day.status==='confirmed_active')flags.push(day.hasSales);
      else flush();
    });
    flush();return longest;
  }
  function dayRow(store,date){
    var year=date.slice(0,4),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
    var list=store.data&&store.data[year]&&store.data[year][month+'月'];
    return Array.isArray(list)&&isObject(list[day-1])?list[day-1]:null;
  }
  function longestInnerGap(values){
    var first=values.indexOf(true),last=values.lastIndexOf(true),run=0,longest=0;
    if(first<0)return null;
    for(var i=first;i<=last;i++){
      if(values[i]){longest=Math.max(longest,run);run=0;}
      else run++;
    }
    return Math.max(longest,run);
  }
  function examine(snapshot,options){
    options=options||{};
    var start=options.start||START,end=options.end||yesterday();
    if(!parseDate(start)||!parseDate(end)||start>end)throw new Error('診断対象期間が不正です。');
    var days=[],cursor=start;
    while(cursor<=end&&days.length<4000){days.push(cursor);cursor=addDays(cursor,1);}
    if(cursor<=end)throw new Error('診断対象期間が長すぎます。');
    var stores=isObject(snapshot)&&isObject(snapshot.stores)?snapshot.stores:{};
    var categories=snapshot&&snapshot.salesCountManagement&&snapshot.salesCountManagement.categories;
    if(!Array.isArray(categories))categories=[];
    var recentStart=addDays(end,-55),resolver=resolverFor(options);
    // Memoize month inference for the duration of this read-only report.
    var monthCache=new Map(),resolverOptions={monthCache:monthCache};
    if(options.today!==undefined)resolverOptions.today=options.today;
    var result={start:start,end:end,days:days.length,stores:[]};
    Object.keys(stores).forEach(function(id){
      var store=stores[id];if(!isObject(store))return;
      var storeReport={
        id:id,name:String(store.name||id),
        customersPositive:0,customersUncertain:0,
        weather:0,temperature:0,temperatureMissing:0,temperatureInvalid:0,
        temperatureReversed:0,weatherWithCustomer:0,
        categories:[]
      };
      days.forEach(function(date){
        var row=dayRow(store,date);
        var hasCustomer=!!row&&Number.isFinite(Number(row.客数))&&row.客数!==''&&row.客数!==null&&Number(row.客数)>0;
        var weather=!!row&&typeof row.weather==='string'&&row.weather.trim().length>0;
        var tempStatus=temperatureState(row),temperature=tempStatus==='valid';
        if(tempStatus==='missing')storeReport.temperatureMissing++;
        else if(tempStatus==='invalid')storeReport.temperatureInvalid++;
        else if(tempStatus==='reversed')storeReport.temperatureReversed++;
        if(hasCustomer)storeReport.customersPositive++;
        else storeReport.customersUncertain++;
        if(weather)storeReport.weather++;
        if(temperature)storeReport.temperature++;
        if(hasCustomer&&weather&&temperature)storeReport.weatherWithCustomer++;
      });
      categories.forEach(function(category){
        if(!isObject(category)||typeof category.id!=='string')return;
        var categoryReport={id:category.id,name:String(category.name||category.id),
          hidden:!!category.hidden,trips:[],completeDays:0,
          incompleteDays:0,reviewDays:0,allInactiveDays:0,resolverErrorDays:0};
        var dated=days.map(function(date){
          var record=store.salesCounts&&store.salesCounts[date]&&store.salesCounts[date][category.id];
          var decision;
          try{decision=resolver.resolveDate(snapshot,id,category.id,date,resolverOptions);}
          catch(_){categoryReport.resolverErrorDays++;}
          var sourceTrips=decision&&Array.isArray(decision.trips)&&decision.trips.length===3?decision.trips:null;
          return {date:date,trips:[0,1,2].map(function(index){
            var raw=validSavedTrip(record,index);
            var status=dateTripState(raw,sourceTrips&&sourceTrips[index]);
            return {status:status,raw:raw,hasSales:!!raw&&validCount(raw.sales),
              hasDelivery:!!raw&&validCount(raw.delivery),
              source:sourceTrips&&sourceTrips[index]&&sourceTrips[index].source||null};
          })};
        });
        dated.forEach(function(day){
          var active=day.trips.filter(function(t){return t.status==='confirmed_active';});
          var uncertain=day.trips.some(function(t){return t.status==='review'||t.status==='unverified';});
          if(active.length&&day.trips.every(function(t){
            return t.status==='confirmed_inactive'||t.status==='confirmed_active'&&t.hasSales&&t.hasDelivery;
          }))categoryReport.completeDays++;
          else if(!active.length&&!uncertain)categoryReport.allInactiveDays++;
          else if(uncertain)categoryReport.reviewDays++;
          else categoryReport.incompleteDays++;
        });
        for(var i=0;i<3;i++){
          var items=dated.map(function(day){return Object.assign({date:day.date},day.trips[i]);});
          var statusDays={confirmed_active:0,confirmed_inactive:0,review:0,unverified:0};
          var trip={trip:i+1,active:true,delivery:0,sales:0,both:0,recentSales:0,
            zeroSales:0,longestGap:null,statusDays:statusDays,periodStatus:'needs_review',
            reviewSaved:{delivery:0,sales:0,both:0},
            quantityRelation:{equal:0,salesAboveDelivery:0,salesBelowDelivery:0},
            reviewQuantityRelation:{equal:0,salesAboveDelivery:0,salesBelowDelivery:0}};
          items.forEach(function(item){
            statusDays[item.status]++;
            var validDelivery=item.hasDelivery,validSales=item.hasSales;
            if(item.status==='confirmed_active'){
              if(validDelivery)trip.delivery++;
              if(validSales){trip.sales++;if(item.date>=recentStart)trip.recentSales++;
                if(item.raw.sales===0)trip.zeroSales++;}
              if(validDelivery&&validSales)trip.both++;
            }else{
              if(validDelivery)trip.reviewSaved.delivery++;
              if(validSales)trip.reviewSaved.sales++;
              if(validDelivery&&validSales)trip.reviewSaved.both++;
            }
            if(validDelivery&&validSales){
              var comparison=item.raw.sales===item.raw.delivery?'equal':
                item.raw.sales>item.raw.delivery?'salesAboveDelivery':'salesBelowDelivery';
              (item.status==='confirmed_active'?trip.quantityRelation:trip.reviewQuantityRelation)[comparison]++;
            }
          });
          trip.longestGap=gapWithinActiveDays(items);
          if(statusDays.confirmed_inactive===days.length)trip.periodStatus='all_inactive';
          else if(statusDays.confirmed_active===days.length)trip.periodStatus='all_active';
          else if(statusDays.review||statusDays.unverified)trip.periodStatus='needs_review';
          else trip.periodStatus='mixed';
          trip.active=trip.periodStatus!=='all_inactive';
          categoryReport.trips.push(trip);
        }
        storeReport.categories.push(categoryReport);
      });
      result.stores.push(storeReport);
    });
    return result;
  }
  var model={START:START,examine:examine,longestInnerGap:longestInnerGap};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightPredictionDataHealth=model;
  if(!root.document)return;

  var doc=root.document,button=null,overlay=null,lastReport=null;
  function element(tag,text,cls){
    var node=doc.createElement(tag);
    if(text!==undefined)node.textContent=text;
    if(cls)node.className=cls;
    return node;
  }
  function close(){if(overlay){overlay.hidden=true;if(button)button.focus();}}
  function open(){
    var source;try{source=typeof allStores!=='undefined'?allStores:root.allStores;}catch(_){source=root.allStores;}
    lastReport=examine(source);
    if(!overlay){
      overlay=element('div',undefined,'ipdh-overlay');overlay.id='insightPredictionDataOverlay';overlay.hidden=true;
      overlay.setAttribute('role','presentation');
      var dialog=element('div',undefined,'ipdh-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      dialog.setAttribute('aria-labelledby','ipdhHeading');
      var header=element('div',undefined,'ipdh-header');
      var title=element('h2','予測用データ品質チェック');title.id='ipdhHeading';
      var exit=element('button','閉じる');exit.type='button';exit.className='ipdh-close';exit.onclick=close;
      header.append(title,exit);dialog.append(header);
      dialog.append(element('div',undefined,'ipdh-body'));overlay.append(dialog);doc.body.append(overlay);
      overlay.addEventListener('click',function(event){if(event.target===overlay)close();});
      overlay.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();close();}});
    }
    var body=overlay.querySelector('.ipdh-body');body.replaceChildren();
    body.append(element('p',lastReport.start+' ～ '+lastReport.end+'（'+lastReport.days+'日間）','ipdh-period'));
    body.append(element('p','この診断は読み取り専用です。件数は予測精度や予測可能性を保証しません。客数0は未入力と実績0を判別できないため、確認待ちとして集計します。','ipdh-note'));
    if(!lastReport.stores.length)body.append(element('p','店舗データがありません。','ipdh-note'));
    lastReport.stores.forEach(function(store){
      var section=element('section',undefined,'ipdh-store');
      section.append(element('h3',store.name));
      var summary=element('div',undefined,'ipdh-metrics');
      [
        ['客数が正の値',store.customersPositive+'日'],
        ['客数0・判定不可',store.customersUncertain+'日'],
        ['天気あり',store.weather+'日'],
        ['最高・最低気温あり',store.temperature+'日'],
        ['客数＋天気＋気温',store.weatherWithCustomer+'日']
      ].forEach(function(pair){var item=element('div',undefined,'ipdh-metric');item.append(element('span',pair[0]),element('strong',pair[1]));summary.append(item);});
      section.append(summary);
      var tableScroll=element('div',undefined,'ipdh-table-scroll');
      var table=element('table');table.className='ipdh-table';
      var thead=element('thead'),head=element('tr');
      ['カテゴリー','便','納品','販売','両方','直近8週販売','中間の連続欠損'].forEach(function(name){head.append(element('th',name));});
      thead.append(head);table.append(thead);
      var tbody=element('tbody');
      store.categories.forEach(function(category){
        category.trips.forEach(function(t){
          var row=element('tr');
          if(t.trip===1){var label=element('th',category.name+(category.hidden?'（非表示）':''));label.rowSpan=3;label.scope='rowgroup';row.append(label);}
          var periodLabel=t.periodStatus==='mixed'?'（一部対象）':
            t.periodStatus==='needs_review'?'（要確認）':'';
          row.append(element('td',t.trip+'便'+periodLabel));
          if(t.active){
            [t.delivery,t.sales,t.both,t.recentSales,t.longestGap===null?'—':t.longestGap+'日'].forEach(function(value){row.append(element('td',String(value)));});
          }else{
            var excluded=element('td','対象外');excluded.colSpan=5;excluded.className='ipdh-inactive';row.append(excluded);
          }
          tbody.append(row);
        });
      });
      table.append(tbody);tableScroll.append(table);section.append(tableScroll);
      section.append(element('p','納品・販売・両方＝対象便と確認できた日の入力済み日数（0を含む）。直近8週販売＝直近56日間。連続欠損＝対象と確認できる連続期間内の最大未入力日数。対象便が不明・競合する日の保存値は残し、入力漏れとは断定しません。','ipdh-note'));
      body.append(section);
    });
    overlay.hidden=false;overlay.querySelector('.ipdh-close').focus();
    return lastReport;
  }
  function initButton(){
    if(button&&button.isConnected)return true;
    var anchor=doc.getElementById('insightDataHealthButton');
    var actions=doc.getElementById('insightSettingsDataActions');
    // Settings builds later and moves the existing health button into this container.
    // Insert only after that move so the new button is not discarded by replaceChildren().
    if(!anchor||!actions||!actions.contains(anchor))return false;
    button=element('button','予測用データ品質チェック');button.type='button';button.id='insightPredictionDataButton';
    button.onclick=function(){try{open();}catch(error){alert('データ診断に失敗しました。'+(error&&error.message||''));}};
    anchor.insertAdjacentElement('afterend',button);return true;
  }
  function init(){
    if(initButton())return;
    var count=0,timer=setInterval(function(){count++;if(initButton()||count>=40)clearInterval(timer);},100);
  }
  model.open=open;
  model.lastReport=function(){return lastReport;};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
