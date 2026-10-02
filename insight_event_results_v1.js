/* イベント・催事実績 v3: 過去開催→開催サマリー→日別ピーク/販売実績を参照する読み取り専用ページ */
(function(root){
  'use strict';

  var LEGACY_LOCATION='場所未設定';
  var WEEKDAYS=['日','月','火','水','木','金','土'];

  function copy(value){return JSON.parse(JSON.stringify(value));}
  function text(value){return String(value==null?'':value).trim();}
  function finite(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function pad(value){return String(value).padStart(2,'0');}
  function parseIso(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    var y=Number(match[1]),m=Number(match[2]),d=Number(match[3]),date=new Date(0);
    date.setFullYear(y,m-1,d);date.setHours(12,0,0,0);
    if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return null;
    return date;
  }
  function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function addDays(value,days){var date=parseIso(value);if(!date)return value;date.setDate(date.getDate()+days);return iso(date);}
  function eachDate(start,end){
    var out=[],cursor=start,guard=0;
    while(cursor&&end&&cursor<=end&&guard<3700){out.push(cursor);cursor=addDays(cursor,1);guard++;}
    return out;
  }
  function eventLocation(event){
    var value=event&&event.snapshot?text(event.snapshot.location):'';
    return value||LEGACY_LOCATION;
  }
  function eventTitle(event){return event&&event.snapshot?text(event.snapshot.title):'';}
  function storeEventsByType(all,storeId,type){
    var store=all&&all.stores&&all.stores[storeId],items=store&&Array.isArray(store.events)?store.events:[];
    return items.filter(function(event){return event&&event.type===type;}).map(copy).sort(function(a,b){
      return String(b.endDate||'').localeCompare(String(a.endDate||''))||String(b.startDate||'').localeCompare(String(a.startDate||''));
    });
  }
  function nearbyEvents(all,storeId){return storeEventsByType(all,storeId,'nearby');}
  function specialEvents(all,storeId){return storeEventsByType(all,storeId,'special');}
  function locations(all,storeId){
    var latest={};
    nearbyEvents(all,storeId).forEach(function(event){
      var location=eventLocation(event),date=String(event.endDate||event.startDate||'');
      if(!latest[location]||date>latest[location])latest[location]=date;
    });
    return Object.keys(latest).sort(function(a,b){
      if(a===LEGACY_LOCATION&&b!==LEGACY_LOCATION)return 1;
      if(b===LEGACY_LOCATION&&a!==LEGACY_LOCATION)return -1;
      return latest[b].localeCompare(latest[a])||a.localeCompare(b,'ja');
    });
  }
  function eventNames(all,storeId,location){
    var latest={};
    nearbyEvents(all,storeId).forEach(function(event){
      if(eventLocation(event)!==location)return;
      var title=eventTitle(event),date=String(event.endDate||event.startDate||'');
      if(!title)return;
      if(!latest[title]||date>latest[title])latest[title]=date;
    });
    return Object.keys(latest).sort(function(a,b){return latest[b].localeCompare(latest[a])||a.localeCompare(b,'ja');});
  }
  function specialNames(all,storeId){
    var latest={};
    specialEvents(all,storeId).forEach(function(event){
      var title=eventTitle(event),date=String(event.endDate||event.startDate||'');
      if(!title)return;
      if(!latest[title]||date>latest[title])latest[title]=date;
    });
    return Object.keys(latest).sort(function(a,b){return latest[b].localeCompare(latest[a])||a.localeCompare(b,'ja');});
  }
  function emptyMetrics(){return {salesYen:null,customers:null,customerUnitPrice:null,items:null,inputDays:0};}
  function normalizeMetrics(metrics){
    metrics=metrics||{};
    return {
      salesYen:finite(metrics.salesYen),
      customers:finite(metrics.customers),
      customerUnitPrice:finite(metrics.customerUnitPrice),
      items:finite(metrics.items),
      inputDays:Number.isFinite(Number(metrics.inputDays))?Number(metrics.inputDays):0
    };
  }
  function dayResult(date,storeId,analysisApi){
    var metrics=emptyMetrics(),conditions=null;
    try{
      if(analysisApi&&typeof analysisApi.buildDay==='function'){
        var context=analysisApi.buildDay(date,storeId)||{};
        metrics=normalizeMetrics(context.metrics);
        conditions=context.conditions&&Array.isArray(context.conditions.daily)?context.conditions.daily[0]||null:null;
      }
    }catch(_){}
    var hasData=metrics.inputDays>0||['salesYen','customers','customerUnitPrice','items'].some(function(key){return metrics[key]!==null;});
    return {date:date,metrics:metrics,conditions:conditions,hasData:hasData};
  }
  function aggregateDays(days){
    function sum(key){
      var values=days.map(function(day){return day.metrics[key];}).filter(function(value){return value!==null;});
      return values.length?values.reduce(function(total,value){return total+value;},0):null;
    }
    var sales=sum('salesYen'),customers=sum('customers'),items=sum('items');
    return {
      salesYen:sales,
      customers:customers,
      customerUnitPrice:sales!==null&&customers!==null&&customers>0?sales/customers:null,
      items:items,
      inputDays:days.filter(function(day){return day.hasData;}).length
    };
  }
  function occurrenceResult(event,storeId,analysisApi){
    var days=eachDate(event.startDate,event.endDate).map(function(date){return dayResult(date,storeId,analysisApi);});
    var metrics=null;
    try{
      if(analysisApi&&typeof analysisApi.buildRange==='function')metrics=normalizeMetrics((analysisApi.buildRange(event.startDate,event.endDate,storeId)||{}).metrics);
    }catch(_){}
    if(!metrics||!metrics.inputDays)metrics=aggregateDays(days);
    return {
      id:event.id||event.startDate+'|'+event.endDate+'|'+eventTitle(event),
      startDate:event.startDate,
      endDate:event.endDate,
      note:event.snapshot&&event.snapshot.note||'',
      metrics:metrics,
      days:days
    };
  }
  function collect(all,storeId,location,title,analysisApi){
    location=text(location);title=text(title);
    if(!location||!title)return {kind:'nearby',location:location,title:title,occurrences:[]};
    var matched=nearbyEvents(all,storeId).filter(function(event){
      return eventLocation(event)===location&&eventTitle(event)===title;
    });
    return {
      kind:'nearby',
      location:location,
      title:title,
      occurrences:matched.map(function(event){return occurrenceResult(event,storeId,analysisApi);})
    };
  }
  function collectSpecial(all,storeId,title,analysisApi){
    title=text(title);
    if(!title)return {kind:'special',location:'',title:title,occurrences:[]};
    var matched=specialEvents(all,storeId).filter(function(event){return eventTitle(event)===title;});
    return {
      kind:'special',
      location:'',
      title:title,
      occurrences:matched.map(function(event){return occurrenceResult(event,storeId,analysisApi);})
    };
  }

  var model={VERSION:3,LEGACY_LOCATION:LEGACY_LOCATION,eachDate:eachDate,eventLocation:eventLocation,storeEventsByType:storeEventsByType,nearbyEvents:nearbyEvents,specialEvents:specialEvents,locations:locations,eventNames:eventNames,specialNames:specialNames,aggregateDays:aggregateDays,occurrenceResult:occurrenceResult,collect:collect,collectSpecial:collectSpecial};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightEventResults=model;
  if(!root.document)return;

  function init(){
    if(root.__insightEventResultsV3)return;
    if(!root.InsightEvents||!root.InsightAnalysisContext||!root.InsightSalesCount||!root.InsightHourlyCustomers){setTimeout(init,0);return;}
    root.__insightEventResultsV3=true;

    var doc=root.document,state={kind:'nearby',location:'',eventName:'',occurrenceId:'',selectedDate:''};
    function el(tag,label,cls){var node=doc.createElement(tag);if(label!==undefined)node.textContent=label;if(cls)node.className=cls;return node;}
    function currentStoreId(){return typeof allStores!=='undefined'&&allStores?allStores.current:null;}
    function option(value,label){var node=el('option',label);node.value=value;return node;}
    function numberText(value,digits){
      if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
      return Number(value).toLocaleString('ja-JP',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    }
    function yen(value){return value===null?'—':numberText(value,0)+'円';}
    function people(value){return value===null?'—':numberText(value,0)+'人';}
    function dateLabel(value,year){
      var date=parseIso(value);if(!date)return value;
      return (year===false?'':date.getFullYear()+'/')+(date.getMonth()+1)+'/'+date.getDate()+'（'+WEEKDAYS[date.getDay()]+'）';
    }
    function periodLabel(occurrence){
      if(occurrence.startDate===occurrence.endDate)return dateLabel(occurrence.startDate,true);
      var start=parseIso(occurrence.startDate),end=parseIso(occurrence.endDate);
      return dateLabel(occurrence.startDate,true)+' 〜 '+dateLabel(occurrence.endDate,!(start&&end&&start.getFullYear()===end.getFullYear()));
    }
    function renderEmpty(message){
      var summary=doc.getElementById('erSummary'),results=doc.getElementById('erResults');
      if(summary)summary.replaceChildren();
      if(results){results.replaceChildren();results.append(el('div',message,'er-empty'));}
    }
    function renderSelectors(){
      var storeId=currentStoreId(),locationSelect=doc.getElementById('erLocation'),eventSelect=doc.getElementById('erEvent');
      var locationField=doc.getElementById('erLocationField'),arrow=doc.getElementById('erLocationArrow'),eventLabel=doc.getElementById('erEventFieldLabel');
      doc.querySelectorAll('.er-kind-btn').forEach(function(button){button.classList.toggle('active',button.dataset.kind===state.kind);});
      if(state.kind==='special'){
        state.location='';
        if(locationField)locationField.hidden=true;
        if(arrow)arrow.hidden=true;
        if(eventLabel)eventLabel.textContent='催事名';
        var specialItems=specialNames(allStores,storeId);
        if(state.eventName&&specialItems.indexOf(state.eventName)<0){state.eventName='';state.occurrenceId='';state.selectedDate='';}
        eventSelect.replaceChildren(option('','催事を選択'));
        specialItems.forEach(function(value){eventSelect.append(option(value,value));});
        eventSelect.disabled=!specialItems.length;
        eventSelect.value=state.eventName;
        return {locations:[],names:specialItems};
      }

      if(locationField)locationField.hidden=false;
      if(arrow)arrow.hidden=false;
      if(eventLabel)eventLabel.textContent='イベント名';
      var locationItems=locations(allStores,storeId);
      if(state.location&&locationItems.indexOf(state.location)<0){state.location='';state.eventName='';state.occurrenceId='';state.selectedDate='';}
      locationSelect.replaceChildren(option('','イベント場所を選択'));
      locationItems.forEach(function(value){locationSelect.append(option(value,value));});
      locationSelect.value=state.location;

      var names=state.location?eventNames(allStores,storeId,state.location):[];
      if(state.eventName&&names.indexOf(state.eventName)<0){state.eventName='';state.occurrenceId='';state.selectedDate='';}
      eventSelect.replaceChildren(option('',state.location?'イベント名を選択':'先にイベント場所を選択'));
      names.forEach(function(value){eventSelect.append(option(value,value));});
      eventSelect.disabled=!state.location;
      eventSelect.value=state.eventName;
      return {locations:locationItems,names:names};
    }
    function currentData(){
      return state.kind==='special'
        ?collectSpecial(allStores,currentStoreId(),state.eventName,root.InsightAnalysisContext)
        :collect(allStores,currentStoreId(),state.location,state.eventName,root.InsightAnalysisContext);
    }
    function renderHistory(data){
      var summary=doc.getElementById('erSummary'),results=doc.getElementById('erResults');
      summary.replaceChildren();summary.append(el('span','過去開催 '+data.occurrences.length+'回'));
      results.replaceChildren();
      var section=el('section',undefined,'er-section er-history-section');section.append(el('h2','過去開催一覧'));
      if(!data.occurrences.length){section.append(el('div','過去の開催実績がありません。','er-empty'));results.append(section);return;}
      var list=el('div',undefined,'er-history-list');
      data.occurrences.forEach(function(occurrence){
        var button=el('button',undefined,'er-occurrence');button.type='button';button.dataset.occurrenceId=occurrence.id;
        button.append(el('strong',periodLabel(occurrence),'er-occurrence-date'));
        var metrics=el('div',undefined,'er-occurrence-metrics');
        metrics.append(el('span','売上 '+yen(occurrence.metrics.salesYen)),el('span','客数 '+people(occurrence.metrics.customers)));
        button.append(metrics);
        button.onclick=function(){
          state.occurrenceId=occurrence.id;
          state.selectedDate=occurrence.days.length?occurrence.days[0].date:'';
          render();
        };
        list.append(button);
      });
      section.append(list);results.append(section);
    }
    function summaryMetric(label,value){
      var card=el('div',undefined,'er-summary-card');card.append(el('span',label),el('strong',value));return card;
    }
    function hourlySection(date){
      var hourly=root.InsightHourlyCustomers.status(allStores,currentStoreId(),date);
      if(!hourly.complete)return null;
      var max=Math.max.apply(null,hourly.hours),peakHour=hourly.hours.indexOf(max);
      var section=el('section',undefined,'er-section er-hourly-section'),head=el('div',undefined,'er-section-head');
      head.append(el('h2','時間帯別客数'),el('strong','ピーク '+peakHour+'時台 '+people(max),'er-peak'));
      section.append(head);
      var scroll=el('div',undefined,'er-hour-scroll'),chart=el('div',undefined,'er-hour-chart');
      hourly.hours.forEach(function(value,hour){
        var item=el('div',undefined,'er-hour-item'),plot=el('div',undefined,'er-hour-plot'),bar=el('div',undefined,'er-hour-bar');
        var height=max>0?Math.max(2,Math.round(value/max*150)):2;bar.style.height=height+'px';
        plot.append(bar);item.append(el('strong',String(value)),plot,el('span',hour+'時'));chart.append(item);
      });
      scroll.append(chart);section.append(scroll);
      return section;
    }
    function salesCategoriesSection(date){
      root.InsightSalesCount.ensure(allStores);
      var store=allStores.stores[currentStoreId()],saved=store&&store.salesCounts&&store.salesCounts[date]||{};
      var categories=(allStores.salesCountManagement&&allStores.salesCountManagement.categories||[]).filter(function(category){
        if(category.hidden||!saved[category.id])return false;
        var record=root.InsightSalesCount.normalizeRecord(saved[category.id]);
        return record.trips.some(function(trip){return trip.delivery!==null||trip.sales!==null;});
      });
      if(!categories.length)return null;
      var section=el('section',undefined,'er-section er-sales-section');section.append(el('h2','カテゴリー別・便別実績'));
      var grid=el('div',undefined,'er-category-grid');
      categories.forEach(function(category){
        var wrap=el('article',undefined,'er-category-card');wrap.append(el('h3',category.name));
        var card=root.InsightSalesCount.createReadOnlyDayCard(date,saved[category.id],category);card.classList.add('er-readonly-sales-card');
        wrap.append(card);grid.append(wrap);
      });
      section.append(grid);return section;
    }
    function renderDayTabs(occurrence){
      if(occurrence.days.length<=1)return null;
      var wrap=el('div',undefined,'er-day-tabs');
      occurrence.days.forEach(function(day){
        var button=el('button',undefined,'er-day-tab'+(day.date===state.selectedDate?' active':''));button.type='button';button.dataset.date=day.date;
        button.append(el('strong',dateLabel(day.date,false)),el('span','売上 '+yen(day.metrics.salesYen)),el('span','客数 '+people(day.metrics.customers)));
        var hourly=root.InsightHourlyCustomers.status(allStores,currentStoreId(),day.date);
        if(hourly.complete)button.append(el('small','時間帯データあり'));
        button.onclick=function(){state.selectedDate=day.date;render();};
        wrap.append(button);
      });
      return wrap;
    }
    function renderOccurrence(data,occurrence){
      var summary=doc.getElementById('erSummary'),results=doc.getElementById('erResults');summary.replaceChildren();results.replaceChildren();
      var back=el('button','← 過去開催一覧へ','er-back');back.type='button';back.onclick=function(){state.occurrenceId='';state.selectedDate='';render();};summary.append(back);
      var head=el('section',undefined,'er-section er-detail-head'),heading=el('div',undefined,'er-detail-title');
      heading.append(el('h2',data.title),el('p',periodLabel(occurrence)+(occurrence.days.length>1?'　'+occurrence.days.length+'日間':'　1日開催')));
      head.append(heading);
      var cards=el('div',undefined,'er-overview-grid');
      cards.append(
        summaryMetric('売上',yen(occurrence.metrics.salesYen)),
        summaryMetric('客数',people(occurrence.metrics.customers)),
        summaryMetric('客単価',yen(occurrence.metrics.customerUnitPrice)),
        summaryMetric('買上点数',occurrence.metrics.items===null?'—':numberText(occurrence.metrics.items,2))
      );
      head.append(cards);results.append(head);

      var tabs=renderDayTabs(occurrence);if(tabs)results.append(tabs);
      if(!state.selectedDate&&occurrence.days.length)state.selectedDate=occurrence.days[0].date;
      var selected=occurrence.days.find(function(day){return day.date===state.selectedDate;})||occurrence.days[0];
      if(!selected)return;

      var daily=el('section',undefined,'er-section er-daily-summary');daily.append(el('h2',dateLabel(selected.date,true)));
      var dailyCards=el('div',undefined,'er-daily-grid');
      dailyCards.append(
        summaryMetric('売上',yen(selected.metrics.salesYen)),
        summaryMetric('客数',people(selected.metrics.customers)),
        summaryMetric('客単価',yen(selected.metrics.customerUnitPrice)),
        summaryMetric('買上点数',selected.metrics.items===null?'—':numberText(selected.metrics.items,2))
      );
      daily.append(dailyCards);results.append(daily);
      var hourly=hourlySection(selected.date);if(hourly)results.append(hourly);
      var sales=salesCategoriesSection(selected.date);if(sales)results.append(sales);
    }
    function render(){
      var available=renderSelectors();
      if(state.kind==='special'){
        if(!available.names.length){renderEmpty('催事が登録されていません。');return;}
        if(!state.eventName){renderEmpty('催事を選択してください。');return;}
      }else{
        if(!available.locations.length){renderEmpty('近隣イベントが登録されていません。');return;}
        if(!state.location){renderEmpty('イベント場所を選択してください。');return;}
        if(!available.names.length){renderEmpty('この場所にはイベントが登録されていません。');return;}
        if(!state.eventName){renderEmpty('イベント名を選択してください。');return;}
      }
      var data=currentData();
      var occurrence=data.occurrences.find(function(item){return item.id===state.occurrenceId;});
      if(!occurrence){state.occurrenceId='';state.selectedDate='';renderHistory(data);return;}
      renderOccurrence(data,occurrence);
    }
    function buildPage(){
      var saleNav=doc.getElementById('navSaleResults'),main=doc.getElementById('main');
      if(!saleNav||!main)return false;
      var nav=el('button',undefined,'nav-btn');nav.id='navEventResults';nav.type='button';
      nav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg><span>イベント・催事</span>';
      nav.onclick=function(){root.gotoNav('eventResults');};
      saleNav.insertAdjacentElement('afterend',nav);
      var page=el('div',undefined,'page er-page');page.id='pageEventResults';
      page.innerHTML='<div class="page-header"><div class="page-title">イベント・催事実績</div></div>'+
        '<div class="er-kind-switch" role="group" aria-label="実績種別"><button type="button" class="er-kind-btn active" data-kind="nearby">近隣イベント</button><button type="button" class="er-kind-btn" data-kind="special">催事</button></div>'+
        '<div class="er-toolbar"><label id="erLocationField">イベント場所<select id="erLocation" aria-label="イベント場所"></select></label><span id="erLocationArrow" class="er-arrow" aria-hidden="true">→</span><label><span id="erEventFieldLabel">イベント名</span><select id="erEvent" aria-label="イベント名／催事名"></select></label></div>'+
        '<div id="erSummary" class="er-summary"></div><div id="erResults"></div>';
      main.append(page);
      doc.querySelectorAll('.er-kind-btn').forEach(function(button){button.onclick=function(){if(state.kind===button.dataset.kind)return;state.kind=button.dataset.kind;state.location='';state.eventName='';state.occurrenceId='';state.selectedDate='';render();};});
      doc.getElementById('erLocation').onchange=function(event){state.location=event.target.value;state.eventName='';state.occurrenceId='';state.selectedDate='';render();};
      doc.getElementById('erEvent').onchange=function(event){state.eventName=event.target.value;state.occurrenceId='';state.selectedDate='';render();};
      return true;
    }

    var style=el('style');style.id='insightEventResultsStyle';style.textContent=
      '.er-page{overflow:auto}.er-kind-switch{display:inline-flex;gap:3px;margin:0 0 10px;padding:3px;border:1px solid var(--border);border-radius:11px;background:var(--surface2)}.er-kind-btn{border:0;border-radius:8px;background:transparent;color:var(--text3);padding:7px 12px;font:800 11px/1 inherit;cursor:pointer}.er-kind-btn.active{background:var(--surface);color:var(--text);box-shadow:0 1px 4px var(--shadow2)}.er-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}'+
      '.er-toolbar [hidden]{display:none!important}.er-toolbar label{display:flex;flex-direction:column;gap:5px;min-width:220px;font-size:11px;font-weight:800;color:var(--text3)}.er-toolbar select{min-height:36px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);padding:7px 10px;font:700 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.er-toolbar select:disabled{opacity:.55}.er-arrow{padding-bottom:9px;color:var(--text4);font-weight:800}'+
      '.er-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}.er-summary>span{border:1px solid var(--border);border-radius:999px;background:var(--surface);padding:5px 9px;color:var(--text3);font-size:10.5px;font-weight:800}.er-back{border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text3);padding:7px 10px;font:700 11px/1 inherit;cursor:pointer}'+
      '.er-section{margin-bottom:12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.er-section h2{margin:0;font-size:15px}.er-empty{padding:28px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text4);font-size:12px;text-align:center}'+
      '.er-history-list{display:grid;gap:8px;margin-top:10px}.er-occurrence{display:grid;grid-template-columns:minmax(200px,1fr) auto;align-items:center;gap:12px;width:100%;border:1px solid var(--border);border-radius:11px;background:var(--surface2);color:var(--text);padding:11px 12px;text-align:left;cursor:pointer}.er-occurrence-date{font-size:12px}.er-occurrence-metrics{display:flex;gap:18px;font-size:11px;font-weight:800;color:var(--text3)}'+
      '.er-detail-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}.er-detail-title h2{font-size:17px}.er-detail-title p{margin:4px 0 0;color:var(--text4);font-size:11px}.er-overview-grid,.er-daily-grid{display:grid;grid-template-columns:repeat(4,minmax(115px,1fr));gap:8px;flex:1;min-width:min(100%,520px)}.er-summary-card{border:1px solid var(--border);border-radius:11px;background:var(--surface2);padding:9px 10px}.er-summary-card span{display:block;color:var(--text4);font-size:9.5px;font-weight:700}.er-summary-card strong{display:block;margin-top:4px;font-size:15px;color:var(--text)}'+
      '.er-day-tabs{display:flex;gap:8px;overflow-x:auto;padding:1px 1px 10px}.er-day-tab{flex:0 0 180px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);padding:10px 11px;text-align:left;cursor:pointer}.er-day-tab.active{border-color:var(--text);box-shadow:inset 0 0 0 1px var(--text)}.er-day-tab strong{font-size:11.5px}.er-day-tab span{font-size:10.5px;color:var(--text3);font-weight:700}.er-day-tab small{margin-top:2px;color:#15803d;font-size:9px;font-weight:800}'+
      '.er-daily-summary h2{margin-bottom:10px}.er-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.er-peak{font-size:11px;color:var(--text3)}.er-hour-scroll{overflow-x:auto;padding:4px 0 8px}.er-hour-chart{display:flex;align-items:flex-end;gap:8px;min-width:1440px;height:205px;padding:8px 6px 0;border-bottom:1px solid var(--border)}.er-hour-item{width:52px;flex:0 0 52px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px}.er-hour-item>strong{font-size:9.5px;color:var(--text3)}.er-hour-plot{height:150px;width:28px;display:flex;align-items:flex-end}.er-hour-bar{width:100%;min-height:2px;border-radius:5px 5px 2px 2px;background:#3b82f6}.er-hour-item>span{font-size:9px;color:var(--text4)}'+
      '.er-sales-section>h2{margin-bottom:10px}.er-category-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.er-category-card{min-width:0;border:1px solid var(--border);border-radius:12px;background:var(--surface2);padding:9px}.er-category-card>h3{margin:0 0 7px;font-size:12px}.er-category-card .sc-day{width:auto;min-width:0;background:var(--surface)}.er-category-card .sc-day-title{display:none}.er-category-card input{pointer-events:none}'+
      '@media(max-width:1200px){.er-category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:800px){.er-toolbar{align-items:stretch}.er-toolbar label{min-width:0;width:100%}.er-arrow{display:none}.er-occurrence{grid-template-columns:1fr}.er-occurrence-metrics{justify-content:flex-start}.er-overview-grid,.er-daily-grid{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.er-category-grid{grid-template-columns:1fr}}';
    doc.head.append(style);
    if(!buildPage())return;
    render();

    var originalGoto=root.gotoNav;
    root.gotoNav=function(target){
      if(target==='eventResults'){
        if(currentNav==='salesCounts'&&root.InsightSalesCount.confirmLeave&&!root.InsightSalesCount.confirmLeave())return;
        doc.querySelectorAll('.nav-btn').forEach(function(node){node.classList.remove('active');});
        doc.querySelectorAll('.page').forEach(function(node){node.classList.remove('show');});
        doc.getElementById('navEventResults').classList.add('active');
        doc.getElementById('pageEventResults').classList.add('show');
        currentNav='eventResults';render();return;
      }
      if(currentNav==='eventResults'){
        doc.getElementById('navEventResults').classList.remove('active');
        doc.getElementById('pageEventResults').classList.remove('show');
      }
      return originalGoto(target);
    };

    var originalSwitch=root.switchStore;
    root.switchStore=function(id){
      if(currentNav!=='eventResults')return originalSwitch.apply(this,arguments);
      var result;
      currentNav=1;
      try{result=originalSwitch.apply(this,arguments);}
      finally{currentNav='eventResults';}
      state.kind='nearby';state.location='';state.eventName='';state.occurrenceId='';state.selectedDate='';
      doc.querySelectorAll('.nav-btn').forEach(function(node){node.classList.remove('active');});
      doc.querySelectorAll('.page').forEach(function(node){node.classList.remove('show');});
      doc.getElementById('navEventResults').classList.add('active');
      doc.getElementById('pageEventResults').classList.add('show');
      render();
      return result;
    };

    model.render=render;
    model.getState=function(){return copy(state);};
  }

  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
