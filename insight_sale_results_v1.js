/* セール実績 v1: 月をまたいだセール実績をセール内容別に閲覧する読み取り専用ページ */
(function(root){
  'use strict';

  var PERIODS={3:3,6:6,12:12,all:null};
  var WEEKDAYS=['日','月','火','水','木','金','土'];

  function copy(value){return JSON.parse(JSON.stringify(value));}
  function pad(value){return String(value).padStart(2,'0');}
  function parseIso(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(0);
    date.setFullYear(y,mo-1,d);date.setHours(12,0,0,0);
    if(date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d)return null;
    return date;
  }
  function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
  function addDays(value,days){var d=parseIso(value);if(!d)return value;d.setDate(d.getDate()+days);return iso(d);}
  function eachDate(start,end){
    var out=[],cursor=start,guard=0;
    while(cursor<=end&&guard<3700){out.push(cursor);cursor=addDays(cursor,1);guard++;}
    return out;
  }
  function todayIso(now){
    now=now||new Date();
    return now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  }
  function rangeFor(period,referenceIso){
    period=String(period||'12');
    if(!PERIODS.hasOwnProperty(period))period='12';
    var ref=parseIso(referenceIso)||parseIso(todayIso());
    var end=iso(ref);
    if(period==='all')return {start:'0001-01-01',end:end,label:'全期間'};
    var count=PERIODS[period],start=new Date(ref.getFullYear(),ref.getMonth()-(count-1),1,12,0,0,0);
    return {start:iso(start),end:end,label:'直近'+period+'か月'};
  }
  function total(record,key,mask){
    if(!record||!Array.isArray(record.trips))return null;
    mask=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    var indexes=[0,1,2].filter(function(i){return mask[i]!==false;});
    var values=indexes.map(function(i){var t=record.trips[i];return t&&t[key]!==undefined?t[key]:null;});
    return values.every(function(v){return v===null;})?null:values.reduce(function(sum,v){return sum+(v===null?0:Number(v));},0);
  }
  function complete(record,key,mask){
    if(!(record&&Array.isArray(record.trips)&&record.trips.length===3))return false;
    mask=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    return [0,1,2].filter(function(i){return mask[i]!==false;}).every(function(i){var t=record.trips[i];return t&&t[key]!==null&&t[key]!==undefined;});
  }
  function fmt(value,digits){
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
    var n=Number(value),places=digits===undefined?1:digits;
    return n.toFixed(places).replace(/\.0+$/,'');
  }
  function pct(value){return value===null||value===undefined||!Number.isFinite(Number(value))?'—':(Number(value)>=0?'+':'')+Number(value).toFixed(1)+'%';}
  function categoryMatches(all,event,categoryId,salesApi){
    if(!event||event.type!=='sale'||!event.snapshot||!event.snapshot.sale||!salesApi)return false;
    return salesApi.categoriesForSale(all,event.snapshot.sale).some(function(category){return category.id===categoryId;});
  }
  function recordAt(all,storeId,date,categoryId,salesApi){
    var store=all.stores&&all.stores[storeId],value=store&&store.salesCounts&&store.salesCounts[date]&&store.salesCounts[date][categoryId];
    return value?salesApi.normalizeRecord(value):salesApi.emptyRecord();
  }
  function hasRecord(record){
    return !!(record&&record.trips&&record.trips.some(function(t){return t.delivery!==null||t.sales!==null;}));
  }
  function stats(records,salesApi,category){
    records=records||[];
    var mask=salesApi.activeTrips?salesApi.activeTrips(category):[true,true,true];
    var delivery=salesApi.average(records,'delivery',mask).total,sales=salesApi.average(records,'sales',mask).total;
    return {
      averageDelivery:delivery,
      averageSales:sales,
      sellThrough:delivery!==null&&delivery>0&&sales!==null?sales/delivery*100:null
    };
  }
  function monthKeysForDays(days){
    var seen=new Set();
    days.forEach(function(day){seen.add(day.date.slice(0,7));});
    return Array.from(seen);
  }
  function normalComparison(all,storeId,categoryId,occurrence,range,deps,category){
    var eventsApi=deps.events,salesApi=deps.sales,mask=salesApi.activeTrips?salesApi.activeTrips(category):[true,true,true];
    var weekdays=new Set(occurrence.days.map(function(day){return parseIso(day.date).getDay();}));
    var records=[],seen=new Set(),months=monthKeysForDays(occurrence.days);
    months.forEach(function(monthKey){
      var parts=monthKey.split('-'),year=Number(parts[0]),month=Number(parts[1]),last=new Date(year,month,0).getDate();
      for(var day=1;day<=last;day++){
        var date=year+'-'+pad(month)+'-'+pad(day);
        if(date<range.start||date>range.end)continue;
        if(!weekdays.has(parseIso(date).getDay()))continue;
        var sale=eventsApi.list(all,storeId,date,date).some(function(event){return categoryMatches(all,event,categoryId,salesApi);});
        if(sale||seen.has(date))continue;
        var record=recordAt(all,storeId,date,categoryId,salesApi);
        if(!hasRecord(record)||!complete(record,'sales',mask))continue;
        seen.add(date);records.push(record);
      }
    });
    var saleStats=stats(occurrence.days.filter(function(day){return hasRecord(day.record);}).map(function(day){return day.record;}),salesApi,category);
    var normalStats=stats(records,salesApi,category);
    return {
      normalCount:records.length,
      normalAverageSales:normalStats.averageSales,
      normalRatio:saleStats.averageSales!==null&&normalStats.averageSales!==null&&normalStats.averageSales!==0?
        (saleStats.averageSales-normalStats.averageSales)/normalStats.averageSales*100:null
    };
  }
  function collect(all,storeId,categoryId,period,referenceIso,deps){
    deps=deps||{};
    var eventsApi=deps.events,salesApi=deps.sales;
    if(!eventsApi||!salesApi)throw new Error('セール実績の分析機能を利用できません。');
    salesApi.ensure(all);
    var range=rangeFor(period,referenceIso),store=all.stores&&all.stores[storeId],category=(all.salesCountManagement.categories||[]).find(function(c){return c.id===categoryId;})||null;
    if(!store)return {range:range,groups:[],occurrences:[]};
    var events=eventsApi.list(all,storeId,range.start,range.end).filter(function(event){
      return categoryMatches(all,event,categoryId,salesApi);
    });
    var occurrences=[],groupsBySummary={};

    events.forEach(function(event){
      var start=event.startDate<range.start?range.start:event.startDate;
      var end=event.endDate>range.end?range.end:event.endDate;
      if(start>end)return;
      var summary=eventsApi.summary(event.snapshot,categoryId,category&&category.name),days=eachDate(start,end).map(function(date){
        var record=recordAt(all,storeId,date,categoryId,salesApi);
        return {date:date,record:record,hasRecord:hasRecord(record)};
      });
      var occurrence={
        id:event.id||summary+'|'+start+'|'+end,
        summary:summary,
        note:String(event.snapshot.note||'').trim(),
        startDate:start,
        endDate:end,
        originalStartDate:event.startDate,
        originalEndDate:event.endDate,
        days:days
      };
      var saleStats=stats(days.filter(function(day){return day.hasRecord;}).map(function(day){return day.record;}),salesApi,category);
      Object.assign(occurrence,saleStats,normalComparison(all,storeId,categoryId,occurrence,range,deps,category));
      occurrences.push(occurrence);

      if(!groupsBySummary[summary])groupsBySummary[summary]={summary:summary,occurrences:[],daysByDate:{}};
      var group=groupsBySummary[summary];
      group.occurrences.push(occurrence);
      days.forEach(function(day){if(!group.daysByDate[day.date])group.daysByDate[day.date]=day;});
    });

    var groups=Object.keys(groupsBySummary).map(function(key){
      var group=groupsBySummary[key];
      group.occurrences.sort(function(a,b){return b.endDate.localeCompare(a.endDate)||b.startDate.localeCompare(a.startDate);});
      var ordered=[],seen=new Set();
      group.occurrences.forEach(function(occurrence){
        occurrence.days.slice().sort(function(a,b){return a.date.localeCompare(b.date);}).forEach(function(day){
          if(!seen.has(day.date)){seen.add(day.date);ordered.push(day);}
        });
      });
      group.days=ordered;
      var groupStats=stats(group.days.filter(function(day){return day.hasRecord;}).map(function(day){return day.record;}),salesApi,category);
      group.averageDelivery=groupStats.averageDelivery;
      group.averageSales=groupStats.averageSales;
      group.sellThrough=groupStats.sellThrough;
      group.latestDate=group.days.reduce(function(latest,day){return !latest||day.date>latest?day.date:latest;},'');
      delete group.daysByDate;
      return group;
    }).sort(function(a,b){return b.latestDate.localeCompare(a.latestDate)||a.summary.localeCompare(b.summary);});

    occurrences.sort(function(a,b){return b.endDate.localeCompare(a.endDate)||b.startDate.localeCompare(a.startDate);});
    return {range:range,groups:groups,occurrences:occurrences};
  }

  var model={
    VERSION:1,
    rangeFor:rangeFor,
    collect:collect,
    total:total,
    stats:stats,
    categoryMatches:categoryMatches
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSaleResults=model;
  if(!root.document)return;

  function init(){
    if(root.__insightSaleResultsV1)return;
    if(!root.InsightSalesCount||!root.InsightSalesCount.createReadOnlyDayCard||!root.InsightEvents){setTimeout(init,0);return;}
    root.__insightSaleResultsV1=true;

    var doc=root.document,state={period:'12',categoryId:null};
    function el(tag,text,cls){var node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
    function activeCategories(){root.InsightSalesCount.ensure(allStores);return allStores.salesCountManagement.categories.filter(function(category){return !category.hidden;});}
    function selectedCategory(){return activeCategories().find(function(category){return category.id===state.categoryId;})||null;}
    function referenceIso(){return todayIso(new Date());}
    function periodLabel(occurrence){
      var start=occurrence.startDate.split('-'),end=occurrence.endDate.split('-');
      if(occurrence.startDate===occurrence.endDate)return start[0]+'/'+Number(start[1])+'/'+Number(start[2]);
      if(start[0]===end[0])return start[0]+'/'+Number(start[1])+'/'+Number(start[2])+'〜'+Number(end[1])+'/'+Number(end[2]);
      return start[0]+'/'+Number(start[1])+'/'+Number(start[2])+'〜'+end[0]+'/'+Number(end[1])+'/'+Number(end[2]);
    }
    function currentData(){
      return collect(allStores,allStores.current,state.categoryId,state.period,referenceIso(),{events:root.InsightEvents,sales:root.InsightSalesCount});
    }
    function renderFilters(){
      doc.querySelectorAll('#srPeriodTabs button').forEach(function(button){button.classList.toggle('active',button.dataset.period===state.period);});
      var select=doc.getElementById('srCategory');
      var categories=activeCategories();
      if(!selectedCategory())state.categoryId=categories[0]&&categories[0].id||null;
      select.replaceChildren();
      categories.forEach(function(category){var option=el('option',category.name);option.value=category.id;select.append(option);});
      select.value=state.categoryId||'';
    }
    function renderGroups(data){
      var area=doc.getElementById('srGroups');area.replaceChildren();
      if(!data.groups.length){area.append(el('div','選択した条件のセール実績はありません。','sr-empty'));return;}
      data.groups.forEach(function(group){
        var section=el('section',undefined,'sr-group'),head=el('div',undefined,'sr-group-head'),title=el('h2',group.summary),statsRow=el('div',undefined,'sr-group-stats');
        [
          ['平均納品',fmt(group.averageDelivery,1)],
          ['平均販売',fmt(group.averageSales,1)],
          ['消化率',group.sellThrough===null?'—':fmt(group.sellThrough,1)+'%']
        ].forEach(function(item){var stat=el('div',undefined,'sr-stat');stat.append(el('span',item[0]),el('strong',item[1]));statsRow.append(stat);});
        var heading=el('div',undefined,'sr-group-heading');heading.append(title);
        var notes=Array.from(new Set(group.occurrences.map(function(item){return item.note;}).filter(Boolean)));
        notes.forEach(function(note){
          var text=note;
          if(notes.length>1)text=group.occurrences.filter(function(item){return item.note===note;}).map(periodLabel).join('、')+'\n'+note;
          heading.append(el('div',text,'sr-sale-note'));
        });
        head.append(heading,statsRow);
        var rows=el('div',undefined,'sr-occurrence-grids'),category=selectedCategory();
        group.occurrences.forEach(function(occurrence){
          var grid=el('div',undefined,'sr-day-grid');
          occurrence.days.forEach(function(day){grid.append(root.InsightSalesCount.createReadOnlyDayCard(day.date,day.record,category));});
          rows.append(grid);
        });
        section.append(head,rows);area.append(section);
      });
    }
    function renderList(data){
      var body=doc.getElementById('srListBody');body.replaceChildren();
      if(!data.occurrences.length){var tr=el('tr'),td=el('td','選択した条件のセール実績はありません。');td.colSpan=8;tr.append(td);body.append(tr);return;}
      data.occurrences.forEach(function(occurrence){
        var tr=el('tr');
        var values=[
          periodLabel(occurrence),
          occurrence.summary,
          occurrence.days.length+'日',
          fmt(occurrence.averageDelivery,1),
          fmt(occurrence.averageSales,1),
          occurrence.sellThrough===null?'—':fmt(occurrence.sellThrough,1)+'%',
          pct(occurrence.normalRatio),
          occurrence.normalCount?'同曜日 '+occurrence.normalCount+'日':'—'
        ];
        values.forEach(function(value,index){var td=el('td',String(value));if(index===6&&occurrence.normalRatio!==null)td.className=occurrence.normalRatio>=0?'sr-positive':'sr-negative';tr.append(td);});
        body.append(tr);
      });
    }
    function render(){
      renderFilters();
      if(!state.categoryId){renderGroups({groups:[]});renderList({occurrences:[]});return;}
      var data=currentData();renderGroups(data);renderList(data);
    }
    function buildPage(){
      var salesNav=doc.getElementById('navSalesCount'),nav=el('button',undefined,'nav-btn');
      if(!salesNav)return false;
      nav.id='navSaleResults';nav.type='button';
      nav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13l-7 7-9-9V4h7z"/><path d="M7.5 7.5h.01"/></svg><span>セール実績</span>';
      nav.onclick=function(){root.gotoNav('saleResults');};
      salesNav.insertAdjacentElement('afterend',nav);

      var page=el('div',undefined,'page sr-page');page.id='pageSaleResults';
      page.innerHTML='<div class="page-header"><div class="page-title">セール実績</div></div>'+
        '<div class="sr-toolbar"><div class="sr-filter"><span class="sr-filter-label">期間</span><div id="srPeriodTabs" class="sr-period-tabs">'+
        '<button type="button" data-period="3">直近3か月</button><button type="button" data-period="6">6か月</button><button type="button" data-period="12">12か月</button><button type="button" data-period="all">全期間</button></div></div>'+
        '<label class="sr-category-label">カテゴリー <select id="srCategory"></select></label></div>'+
        '<div id="srGroups"></div>'+
        '<section class="sr-list-section"><h2>セール実績一覧</h2><div class="sr-table-scroll"><table class="sr-list-table"><thead><tr><th>開催期間</th><th>セール内容</th><th>日数</th><th>平均納品数</th><th>平均販売数</th><th>消化率</th><th>通常日比</th><th>比較対象</th></tr></thead><tbody id="srListBody"></tbody></table></div></section>';
      doc.getElementById('main').append(page);
      doc.querySelectorAll('#srPeriodTabs button').forEach(function(button){button.onclick=function(){state.period=button.dataset.period;render();};});
      doc.getElementById('srCategory').onchange=function(event){state.categoryId=event.target.value;render();};
      return true;
    }

    var style=el('style');style.id='insightSaleResultsStyle';style.textContent=
      '.sr-page{overflow:auto}.sr-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}'+
      '.sr-filter{display:flex;align-items:center;gap:10px}.sr-filter-label{font-size:13px;font-weight:700;color:var(--text3)}.sr-period-tabs{display:flex;gap:4px;padding:3px;border:1px solid var(--border);border-radius:10px;background:var(--surface2)}'+
      '.sr-period-tabs button,.sr-category-label select{border:0;border-radius:7px;background:transparent;color:var(--text3);padding:7px 11px;font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sr-period-tabs button.active{background:var(--text);color:var(--surface)}'+
      '.sr-category-label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--text3)}.sr-category-label select{min-width:150px;border:1px solid var(--border);background:var(--surface2);color:var(--text)}'+
      '.sr-group{margin:0 0 18px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.sr-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:10px}.sr-group-head h2{margin:0;font-size:17px;color:var(--text)}'+
      '.sr-group-heading{min-width:0}.sr-sale-note{margin-top:6px;font-size:13px;line-height:1.5;color:var(--text3);white-space:pre-wrap;overflow-wrap:anywhere}'+
      '.sr-group-stats{display:grid;grid-template-columns:repeat(3,minmax(88px,1fr));gap:8px;justify-content:end}.sr-stat{border:1px solid var(--border);border-radius:10px;background:var(--surface2);padding:7px 9px;min-width:0}.sr-stat span{display:block;color:var(--text4);font-size:12px;font-weight:700}.sr-stat strong{display:block;margin-top:3px;color:var(--text);font-size:16px;font-weight:800}.sr-occurrence-grids{display:grid;gap:9px}.sr-day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;width:100%;box-sizing:border-box}.sr-day-grid>.sc-day{min-width:0}.sr-empty{padding:24px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text4);font-size:12px;text-align:center}'+
      '.sr-list-section{margin-top:18px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.sr-list-section h2{font-size:17px;margin:0 0 10px}.sr-table-scroll{overflow:auto}.sr-list-table{width:100%;border-collapse:collapse;font-size:12.5px}.sr-list-table th,.sr-list-table td{padding:8px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap}.sr-list-table th:first-child,.sr-list-table td:first-child,.sr-list-table th:nth-child(2),.sr-list-table td:nth-child(2){text-align:left}.sr-positive{color:#15803d;font-weight:800}.sr-negative{color:#b42318;font-weight:800}'+
      '@media(max-width:1200px){.sr-day-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.sr-group{padding:12px}.sr-group-head{align-items:flex-start;flex-direction:column}.sr-group-stats{width:100%;grid-template-columns:repeat(3,minmax(88px,1fr))}}'+
      '@media(max-width:800px){.sr-toolbar{align-items:stretch}.sr-filter,.sr-category-label{width:100%}.sr-period-tabs{flex:1}.sr-period-tabs button{flex:1;padding-left:6px;padding-right:6px}.sr-category-label select{flex:1}}';
    doc.head.appendChild(style);
    if(!buildPage())return;

    var categories=activeCategories();state.categoryId=categories[0]&&categories[0].id||null;
    render();

    var originalGoto=root.gotoNav;
    root.gotoNav=function(target){
      if(target==='saleResults'){
        if(currentNav==='salesCounts'&&root.InsightSalesCount.confirmLeave&&!root.InsightSalesCount.confirmLeave())return;
        doc.querySelectorAll('.nav-btn').forEach(function(node){node.classList.remove('active');});
        doc.querySelectorAll('.page').forEach(function(node){node.classList.remove('show');});
        doc.getElementById('navSaleResults').classList.add('active');
        doc.getElementById('pageSaleResults').classList.add('show');
        currentNav='saleResults';render();return;
      }
      if(currentNav==='saleResults'){
        doc.getElementById('navSaleResults').classList.remove('active');
        doc.getElementById('pageSaleResults').classList.remove('show');
      }
      return originalGoto(target);
    };

    var originalSwitch=root.switchStore;
    root.switchStore=function(id){
      if(currentNav!=='saleResults')return originalSwitch.apply(this,arguments);
      var result;
      currentNav=1;
      try{result=originalSwitch.apply(this,arguments);}
      finally{currentNav='saleResults';}
      doc.querySelectorAll('.nav-btn').forEach(function(node){node.classList.remove('active');});
      doc.querySelectorAll('.page').forEach(function(node){node.classList.remove('show');});
      doc.getElementById('navSaleResults').classList.add('active');
      doc.getElementById('pageSaleResults').classList.add('show');
      render();
      return result;
    };

    model.render=render;
    model.getState=function(){return copy(state);};
  }

  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
