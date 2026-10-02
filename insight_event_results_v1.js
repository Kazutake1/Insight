/* イベント実績 v1: 近隣イベントの場所→イベント名から開催日実績だけを閲覧する読み取り専用ページ */
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
  function nearbyEvents(all,storeId){
    var store=all&&all.stores&&all.stores[storeId],items=store&&Array.isArray(store.events)?store.events:[];
    return items.filter(function(event){return event&&event.type==='nearby';}).map(copy).sort(function(a,b){
      return String(b.endDate||'').localeCompare(String(a.endDate||''))||String(b.startDate||'').localeCompare(String(a.startDate||''));
    });
  }
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
  function collect(all,storeId,location,title,analysisApi){
    location=text(location);title=text(title);
    if(!location||!title)return {location:location,title:title,occurrences:[],days:[]};
    var matched=nearbyEvents(all,storeId).filter(function(event){
      return eventLocation(event)===location&&eventTitle(event)===title;
    });
    var dates=[],seen=new Set();
    matched.forEach(function(event){
      eachDate(event.startDate,event.endDate).forEach(function(date){
        if(!seen.has(date)){seen.add(date);dates.push(date);}
      });
    });
    dates.sort(function(a,b){return b.localeCompare(a);});
    return {
      location:location,
      title:title,
      occurrences:matched.map(function(event){return {id:event.id||null,startDate:event.startDate,endDate:event.endDate,note:event.snapshot&&event.snapshot.note||''};}),
      days:dates.map(function(date){return dayResult(date,storeId,analysisApi);})
    };
  }

  var model={VERSION:1,LEGACY_LOCATION:LEGACY_LOCATION,eachDate:eachDate,eventLocation:eventLocation,nearbyEvents:nearbyEvents,locations:locations,eventNames:eventNames,collect:collect};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightEventResults=model;
  if(!root.document)return;

  function init(){
    if(root.__insightEventResultsV1)return;
    if(!root.InsightEvents||!root.InsightAnalysisContext){setTimeout(init,0);return;}
    root.__insightEventResultsV1=true;

    var doc=root.document,state={location:'',eventName:''};
    function el(tag,label,cls){var node=doc.createElement(tag);if(label!==undefined)node.textContent=label;if(cls)node.className=cls;return node;}
    function currentStoreId(){return typeof allStores!=='undefined'&&allStores?allStores.current:null;}
    function option(value,label){var node=el('option',label);node.value=value;return node;}
    function numberText(value,digits){
      if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
      return Number(value).toLocaleString('ja-JP',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    }
    function yen(value){return value===null?'—':numberText(value,0)+'円';}
    function people(value){return value===null?'—':numberText(value,0)+'人';}
    function dateLabel(value){
      var date=parseIso(value);if(!date)return value;
      return date.getFullYear()+'/'+(date.getMonth()+1)+'/'+date.getDate()+'（'+WEEKDAYS[date.getDay()]+'）';
    }
    function renderEmpty(message){
      var summary=doc.getElementById('erSummary'),results=doc.getElementById('erResults');
      if(summary)summary.replaceChildren();
      if(results){results.replaceChildren();results.append(el('div',message,'er-empty'));}
    }
    function renderSelectors(){
      var storeId=currentStoreId(),locationSelect=doc.getElementById('erLocation'),eventSelect=doc.getElementById('erEvent');
      var locationItems=locations(allStores,storeId);
      if(state.location&&locationItems.indexOf(state.location)<0){state.location='';state.eventName='';}
      locationSelect.replaceChildren(option('','イベント場所を選択'));
      locationItems.forEach(function(value){locationSelect.append(option(value,value));});
      locationSelect.value=state.location;

      var names=state.location?eventNames(allStores,storeId,state.location):[];
      if(state.eventName&&names.indexOf(state.eventName)<0)state.eventName='';
      eventSelect.replaceChildren(option('',state.location?'イベント名を選択':'先にイベント場所を選択'));
      names.forEach(function(value){eventSelect.append(option(value,value));});
      eventSelect.disabled=!state.location;
      eventSelect.value=state.eventName;
      return {locations:locationItems,names:names};
    }
    function renderData(data){
      var summary=doc.getElementById('erSummary'),results=doc.getElementById('erResults');
      summary.replaceChildren();
      ['開催 '+data.occurrences.length+'回','対象日 '+data.days.length+'日'].forEach(function(label){summary.append(el('span',label));});
      results.replaceChildren();
      var section=el('section',undefined,'er-section');
      section.append(el('h2','開催日実績'));
      if(!data.days.length){section.append(el('div','開催日データがありません。','er-empty'));results.append(section);return;}
      var scroll=el('div',undefined,'er-table-scroll'),table=el('table',undefined,'er-table');
      table.innerHTML='<thead><tr><th>開催日</th><th>売上</th><th>客数</th><th>客単価</th><th>買上点数</th></tr></thead><tbody id="erTableBody"></tbody>';
      var body=table.querySelector('tbody');
      data.days.forEach(function(day){
        var row=el('tr');if(!day.hasData)row.className='er-no-data';
        var values=[
          dateLabel(day.date),
          yen(day.metrics.salesYen),
          people(day.metrics.customers),
          yen(day.metrics.customerUnitPrice),
          day.metrics.items===null?'—':numberText(day.metrics.items,2)
        ];
        values.forEach(function(value,index){var cell=el('td',value);if(index===0)cell.className='er-date';row.append(cell);});
        body.append(row);
      });
      scroll.append(table);section.append(scroll);results.append(section);
    }
    function render(){
      var available=renderSelectors();
      if(!available.locations.length){renderEmpty('近隣イベントが登録されていません。');return;}
      if(!state.location){renderEmpty('イベント場所を選択してください。');return;}
      if(!available.names.length){renderEmpty('この場所にはイベントが登録されていません。');return;}
      if(!state.eventName){renderEmpty('イベント名を選択してください。');return;}
      renderData(collect(allStores,currentStoreId(),state.location,state.eventName,root.InsightAnalysisContext));
    }
    function buildPage(){
      var saleNav=doc.getElementById('navSaleResults'),main=doc.getElementById('main');
      if(!saleNav||!main)return false;
      var nav=el('button',undefined,'nav-btn');nav.id='navEventResults';nav.type='button';
      nav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg><span>イベント実績</span>';
      nav.onclick=function(){root.gotoNav('eventResults');};
      saleNav.insertAdjacentElement('afterend',nav);
      var page=el('div',undefined,'page er-page');page.id='pageEventResults';
      page.innerHTML='<div class="page-header"><div class="page-title">イベント実績</div></div>'+
        '<div class="er-toolbar"><label>イベント場所<select id="erLocation" aria-label="イベント場所"></select></label><span class="er-arrow" aria-hidden="true">→</span><label>イベント名<select id="erEvent" aria-label="イベント名"></select></label></div>'+
        '<div id="erSummary" class="er-summary"></div><div id="erResults"></div>';
      main.append(page);
      doc.getElementById('erLocation').onchange=function(event){state.location=event.target.value;state.eventName='';render();};
      doc.getElementById('erEvent').onchange=function(event){state.eventName=event.target.value;render();};
      return true;
    }

    var style=el('style');style.id='insightEventResultsStyle';style.textContent=
      '.er-page{overflow:auto}.er-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}'+
      '.er-toolbar label{display:flex;flex-direction:column;gap:5px;min-width:220px;font-size:11px;font-weight:800;color:var(--text3)}.er-toolbar select{min-height:36px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);padding:7px 10px;font:700 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.er-toolbar select:disabled{opacity:.55}.er-arrow{padding-bottom:9px;color:var(--text4);font-weight:800}'+
      '.er-summary{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.er-summary span{border:1px solid var(--border);border-radius:999px;background:var(--surface);padding:5px 9px;color:var(--text3);font-size:10.5px;font-weight:800}'+
      '.er-section{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.er-section h2{margin:0 0 10px;font-size:15px}.er-table-scroll{overflow:auto}.er-table{width:100%;border-collapse:collapse;font-size:11.5px}.er-table th,.er-table td{padding:10px 9px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap}.er-table th{color:var(--text3);font-size:10.5px}.er-table .er-date,.er-table th:first-child{text-align:left}.er-no-data td{color:var(--text4)}.er-empty{padding:28px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text4);font-size:12px;text-align:center}'+
      '@media(max-width:800px){.er-toolbar{align-items:stretch}.er-toolbar label{min-width:0;width:100%}.er-arrow{display:none}}';
    doc.head.appendChild(style);
    if(!buildPage())return;
    render();

    var originalGoto=root.gotoNav;
    root.gotoNav=function(target){
      if(target==='eventResults'){
        if(currentNav==='salesCounts'&&root.InsightSalesCount&&root.InsightSalesCount.confirmLeave&&!root.InsightSalesCount.confirmLeave())return;
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
      state.location='';state.eventName='';
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
