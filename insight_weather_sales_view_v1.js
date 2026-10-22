/* Read-only, on-device viewer for weekday-matched historical sales tendencies.
 * Uses the existing trends module. Never persists results or sends store records.
 */
(function(root){
  'use strict';
  if(root.InsightWeatherSalesView)return;
  var PERIODS=[84,168,366];
  var DAY_NAMES=['日','月','火','水','木','金','土'];
  var view=null,launchButton=null,current=null,controls={},details=null,periodLabel=null;
  function element(tag,content,className){
    var n=root.document.createElement(tag);
    if(content!==undefined)n.textContent=String(content);
    if(className)n.className=className;
    return n;
  }
  function collect(snapshot,days,deps){
    deps=deps||{};
    if(!snapshot||!snapshot.stores||typeof snapshot.stores!=='object'||Array.isArray(snapshot.stores))
      throw new Error('店舗データを確認できません。');
    if(PERIODS.indexOf(days)<0)throw new Error('分析期間が不正です。');
    var api=deps.trends||root.InsightWeatherSalesTrends;
    if(!api||typeof api.analyze!=='function')throw new Error('傾向分析モジュールがありません。');
    return {days:days,readOnly:true,localOnly:true,stores:Object.keys(snapshot.stores).map(function(id){
      try{
        var output=api.analyze(snapshot,{storeId:id,lookbackDays:days},deps);
        if(!output||!Array.isArray(output.categories)||!output.period)throw new Error('分析結果の形式が不正です。');
        return {id:id,name:String(output.store&&output.store.name||id),
          categories:output.categories,period:output.period,error:null};
      }catch(error){
        return {id:id,name:String(snapshot.stores[id]&&snapshot.stores[id].name||id),
          categories:[],period:null,error:String(error&&error.message||'分析できません')};
      }
    })};
  }
  function fill(select,items,want){
    var previous=want===undefined?select.value:String(want);
    select.replaceChildren();
    items.forEach(function(item){var option=element('option',item.label);option.value=String(item.value);select.append(option);});
    var found=items.some(function(item){return String(item.value)===previous;});
    select.value=found?previous:items.length?String(items[0].value):'';
    return select.value;
  }
  function selectedStore(){
    return current&&current.stores.find(function(s){return s.id===controls.store.value;});
  }
  function selectedCategory(){
    var store=selectedStore();
    return store&&store.categories.find(function(c){return String(c.id)===controls.category.value;});
  }
  function selectedTrip(){
    var category=selectedCategory();
    return category&&category.trips.find(function(t){return String(t.trip)===controls.trip.value;});
  }
  function groupKey(group){return group.dayType+'|'+group.weekday;}
  function groupTitle(group){
    var name=DAY_NAMES[group.weekday]+'曜日';
    if(group.dayType==='sundayHoliday')return name+'（日曜・祝日区分）';
    return name+(group.dayType==='weekday'?'（通常平日）':'（土曜区分）');
  }
  function field(label,id,parent){
    var wrapper=element('label',undefined,'iwsv-field');
    wrapper.append(element('span',label));
    var select=element('select');select.id=id;select.setAttribute('aria-label',label);
    wrapper.append(select);parent.append(wrapper);
    return select;
  }
  function note(parent,message){parent.append(element('p',message,'iwsv-note'));}
  function heading(parent,label){parent.append(element('h3',label,'iwsv-subtitle'));}
  function numeric(value){
    return typeof value==='number'&&Number.isFinite(value)?value.toFixed(1):'—';
  }
  function cohortTable(parent,title,rows){
    var section=element('section',undefined,'iwsv-section');
    heading(section,title);
    if(!rows||!rows.length){note(section,'この曜日・条件の保存済み実績はありません。');parent.append(section);return;}
    var scroll=element('div',undefined,'ipdh-table-scroll');
    var table=element('table',undefined,'ipdh-table iwsv-table');
    var thead=element('thead'),header=element('tr');
    ['条件','有効日数','平均販売数'].forEach(function(name){header.append(element('th',name));});
    thead.append(header);table.append(thead);
    var tbody=element('tbody');
    rows.forEach(function(r){
      var tr=element('tr');
      tr.append(element('td',r.label));
      tr.append(element('td',r.sampleCount+'日'));
      tr.append(element('td',r.sufficient?numeric(r.meanSales)+'個':'—（3日未満）'));
      tbody.append(tr);
    });
    table.append(tbody);scroll.append(table);section.append(scroll);parent.append(section);
  }
  function comparisonTable(parent,title,series){
    var comparisons=(series&&series.comparisons||[]).filter(function(pair){
      return pair.status==='ready'||pair.status==='zero_baseline';
    });
    if(!comparisons.length)return;
    var section=element('section',undefined,'iwsv-section');
    heading(section,title+'・条件間の平均差');
    var labels=new Map((series.cohorts||[]).map(function(c){return [c.key,c.label];}));
    var scroll=element('div',undefined,'ipdh-table-scroll');
    var table=element('table',undefined,'ipdh-table iwsv-table');
    var thead=element('thead'),head=element('tr');
    ['比較条件（左 → 右）','平均差（右－左）','増減率'].forEach(function(name){head.append(element('th',name));});
    thead.append(head);table.append(thead);
    var tbody=element('tbody');
    comparisons.forEach(function(pair){
      var row=element('tr');
      row.append(element('td',(labels.get(pair.leftKey)||pair.leftKey)+' → '+(labels.get(pair.rightKey)||pair.rightKey)));
      row.append(element('td',numeric(pair.difference)+'個'));
      row.append(element('td',pair.status==='zero_baseline'?'—（基準0）':numeric(pair.changePercent)+'%'));
      tbody.append(row);
    });
    table.append(tbody);scroll.append(table);section.append(scroll);parent.append(section);
  }
  function renderDetail(){
    if(!details||!current)return;
    details.replaceChildren();
    var store=selectedStore();
    if(!store){note(details,'店舗データがありません。');return;}
    if(store.error){note(details,'この店舗の分析はできませんでした：'+store.error);return;}
    periodLabel.textContent=store.period.startDate+' ～ '+store.period.endDate+'（'+store.period.days+'日）';
    var category=selectedCategory(),trip=selectedTrip();
    if(!category||!trip){note(details,'分析対象のカテゴリー・便がありません。');return;}
    details.append(element('p',category.name+'・'+trip.trip+'便　有効日数 '+trip.eligibleDays+'日','iwsv-summary'));
    var group=(trip.byCalendar||[]).find(function(g){return groupKey(g)===controls.weekday.value;});
    if(!group){note(details,'この曜日の有効データはありません。');return;}
    note(details,groupTitle(group)+'で比較します。対象は保存済み実績のみ。3日未満の条件は平均を算出しません。');
    cohortTable(details,'天気別の平均販売数',group.weather&&group.weather.cohorts);
    comparisonTable(details,'天気別',group.weather);
    cohortTable(details,'最高気温帯別の平均販売数',group.temperature&&group.temperature.cohorts);
    comparisonTable(details,'最高気温帯別',group.temperature);
    note(details,'これは過去の記述統計です。天気との因果関係や納品予定日の需要予測を示すものではありません。');
  }
  function syncGroups(){
    var trip=selectedTrip();
    fill(controls.weekday,(trip&&trip.byCalendar||[]).map(function(group){
      return {value:groupKey(group),label:groupTitle(group)};
    }));
    renderDetail();
  }
  function syncCategory(){
    var category=selectedCategory();
    fill(controls.trip,(category&&category.trips||[]).map(function(trip){
      return {value:trip.trip,label:trip.trip+'便'};
    }));
    syncGroups();
  }
  function syncStore(){
    var store=selectedStore();
    fill(controls.category,(store&&store.categories||[]).map(function(category){
      return {value:category.id,label:category.name+(category.hidden?'（非表示）':'')};
    }));
    if(store&&!store.error&&periodLabel)
      periodLabel.textContent=store.period.startDate+' ～ '+store.period.endDate+'（'+store.period.days+'日）';
    else if(periodLabel)periodLabel.textContent='';
    syncCategory();
  }
  function refresh(days){
    var snapshot;
    try{snapshot=typeof allStores!=='undefined'?allStores:root.allStores;}
    catch(_){snapshot=root.allStores;}
    current=collect(snapshot,days);
    fill(controls.store,current.stores.map(function(store){
      return {value:store.id,label:store.name};
    }),controls.store.value||snapshot.current);
    syncStore();
  }
  function close(){
    if(view)view.hidden=true;
    if(launchButton)launchButton.focus();
  }
  function open(){
    if(!view){
      view=element('div',undefined,'ipdh-overlay');view.id='insightWeatherSalesViewOverlay';view.hidden=true;
      var dialog=element('div',undefined,'ipdh-dialog iwsv-dialog');
      dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      dialog.setAttribute('aria-labelledby','iwsvHeading');
      var header=element('div',undefined,'ipdh-header');
      var title=element('h2','販売傾向の確認');title.id='iwsvHeading';
      var exit=element('button','閉じる','ipdh-close');exit.type='button';
      exit.addEventListener('click',close);header.append(title,exit);dialog.append(header);
      var body=element('div',undefined,'iwsv-body');
      var explanation=element('p','店舗ごとの保存済み販売実績と天気・気温を、同じ曜日・祝日区分で比較します。','iwsv-note');
      body.append(explanation);
      var selectorRow=element('div',undefined,'iwsv-controls');
      controls.days=field('分析期間','iwsvDays',selectorRow);
      controls.store=field('店舗','iwsvStore',selectorRow);
      controls.category=field('カテゴリー','iwsvCategory',selectorRow);
      controls.trip=field('便','iwsvTrip',selectorRow);
      controls.weekday=field('曜日・区分','iwsvWeekday',selectorRow);
      fill(controls.days,PERIODS.map(function(days){return {value:days,label:'直近'+days+'日'};}),'84');
      body.append(selectorRow);
      periodLabel=element('p',undefined,'iwsv-period');body.append(periodLabel);
      details=element('div',undefined,'iwsv-details');body.append(details);
      dialog.append(body);view.append(dialog);root.document.body.append(view);
      controls.days.addEventListener('change',function(){
        try{refresh(Number(controls.days.value));}
        catch(error){details.replaceChildren();note(details,'分析できませんでした：'+String(error&&error.message||error));}
      });
      controls.store.addEventListener('change',syncStore);
      controls.category.addEventListener('change',syncCategory);
      controls.trip.addEventListener('change',syncGroups);
      controls.weekday.addEventListener('change',renderDetail);
      view.addEventListener('click',function(e){if(e.target===view)close();});
      view.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}});
    }
    try{refresh(Number(controls.days.value));}
    catch(error){details.replaceChildren();note(details,'分析できませんでした：'+String(error&&error.message||error));}
    view.hidden=false;view.querySelector('.ipdh-close').focus();
  }
  function initButton(){
    if(launchButton&&launchButton.isConnected)return true;
    var anchor=root.document.getElementById('insightWeatherSalesDiagnosticsButton');
    var parent=root.document.getElementById('insightSettingsDataActions');
    if(!anchor||!parent||!parent.contains(anchor))return false;
    launchButton=element('button','販売傾向の確認','sidebar-btn');
    launchButton.type='button';launchButton.id='insightWeatherSalesViewButton';
    launchButton.addEventListener('click',open);
    anchor.insertAdjacentElement('afterend',launchButton);
    return true;
  }
  function init(){
    if(!root.document.getElementById('insightWeatherSalesViewStyle')){
      var link=element('link');link.id='insightWeatherSalesViewStyle';
      link.rel='stylesheet';link.href='./insight_weather_sales_view_v1.css?v=20261022-view-1';
      root.document.head.append(link);
    }
    if(initButton())return;
    var attempts=0,timer=root.setInterval(function(){
      attempts++;if(initButton()||attempts>=50)root.clearInterval(timer);
    },100);
  }
  root.InsightWeatherSalesView={collect:collect,PERIODS:PERIODS.slice(),open:open,close:close};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.InsightWeatherSalesView;
  if(!root.document)return;
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
  else root.setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
