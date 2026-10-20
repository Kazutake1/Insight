/* 販売数入力 v1: 全店舗共通カテゴリーマスターと店舗別・日別・便別実績 */
(function(root){
  'use strict';
  var DEFAULT_CATEGORIES=[
    {id:'cat_onigiri',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]},
    {id:'cat_sandwich',name:'サンドイッチ',hidden:false,aliases:[],activeTrips:[true,true,true]},
    {id:'cat_noodles',name:'麺類',hidden:false,aliases:[],activeTrips:[true,true,true]}
  ];
  var WEEKDAYS=['日','月','火','水','木','金','土'];
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function activeTrips(category){var value=category&&Array.isArray(category.activeTrips)&&category.activeTrips.length===3?category.activeTrips:[true,true,true];return value.map(function(v){return v!==false;});}
  function tripActive(category,index){return activeTrips(category)[index]!==false;}
  function validDateKey(value){var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return false;var year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;}
  function uniqueSaleRecords(rows){var dates=new Set();return rows.filter(function(row){if(!row||dates.has(row.date))return false;dates.add(row.date);return true;}).map(function(row){return row.record;});}
  function ensure(all){
    if(!object(all.salesCountManagement))all.salesCountManagement={version:1,categories:copy(DEFAULT_CATEGORIES)};
    if(!Array.isArray(all.salesCountManagement.categories))all.salesCountManagement.categories=copy(DEFAULT_CATEGORIES);
    all.salesCountManagement.categories.forEach(function(category){if(!Array.isArray(category.aliases))category.aliases=[];if(!Array.isArray(category.activeTrips)||category.activeTrips.length!==3)category.activeTrips=[true,true,true];else category.activeTrips=category.activeTrips.map(function(v){return v!==false;});});
    Object.keys(all.stores||{}).forEach(function(id){if(!object(all.stores[id].salesCounts))all.stores[id].salesCounts={};});
    return all;
  }
  function categoriesForSale(all,sale){
    ensure(all);if(!sale)return [];
    var refs=Array.isArray(sale.targets)&&sale.targets.length?sale.targets:[{categoryId:sale.categoryId,category:sale.category}],found=[],ids=new Set();
    refs.forEach(function(ref){var category;if(ref.categoryId)category=all.salesCountManagement.categories.find(function(c){return c.id===ref.categoryId;});if(!category)category=all.salesCountManagement.categories.find(function(c){return c.name===ref.category||(c.aliases||[]).indexOf(ref.category)>=0;});if(category&&!ids.has(category.id)){ids.add(category.id);found.push(category);}});return found;
  }
  function categoryForSale(all,sale){return categoriesForSale(all,sale)[0]||null;}
  function emptyRecord(){return {trips:[{delivery:null,sales:null},{delivery:null,sales:null},{delivery:null,sales:null}]};}
  function normalizeRecord(value){var out=emptyRecord(),src=value&&Array.isArray(value.trips)?value.trips:[];for(var i=0;i<3;i++){var t=src[i]||{};out.trips[i].delivery=t.delivery===null||t.delivery===undefined?null:Number(t.delivery);out.trips[i].sales=t.sales===null||t.sales===undefined?null:Number(t.sales);}return out;}
  function wasteRecordAt(all,storeId,date,categoryId){
    var store=all&&all.stores&&all.stores[storeId];
    return store&&store.wasteCounts&&store.wasteCounts[date]&&store.wasteCounts[date][categoryId]||null;
  }
  function emptyWasteRecord(){return {trips:[null,null,null]};}
  function normalizeWasteRecord(value){
    var raw=value&&Array.isArray(value.trips)?value.trips:[];
    return {trips:[0,1,2].map(function(i){return raw[i]===undefined?null:raw[i];})};
  }
  function validateWasteCounts(all){
    var ids=new Set((all.salesCountManagement&&all.salesCountManagement.categories||[]).map(function(c){return c.id;}));
    Object.keys(all.stores||{}).forEach(function(storeId){
      var waste=all.stores[storeId].wasteCounts;
      if(waste===undefined)return;
      if(!object(waste))throw new Error('廃棄数の保存形式が不正です');
      Object.keys(waste).forEach(function(date){
        if(!validDateKey(date)||!object(waste[date]))throw new Error('廃棄数の日付データが不正です');
        Object.keys(waste[date]).forEach(function(categoryId){
          if(!ids.has(categoryId))throw new Error('廃棄数カテゴリーの識別番号が不正です');
          var rec=waste[date][categoryId];
          if(!object(rec)||!Array.isArray(rec.trips)||rec.trips.length!==3||
            rec.trips.some(function(v){return v!==null&&(!Number.isSafeInteger(v)||v<0);}))
            throw new Error('廃棄数の便データが不正です');
        });
      });
    });
    return all;
  }
  // Without a dated trip history, present settings cannot prove that older trips were excluded.
  function localTodayKey(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function wasteTripStatus(mask,date,index,today){
    var active=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    if(active[index]!==false)return 'active';
    if(validDateKey(date)&&date<(today||localTodayKey()))return 'unverified';
    return 'inactive';
  }
  function wasteSummary(value,mask,date,today){
    var rec=normalizeWasteRecord(value),active=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    var indexes=[0,1,2].filter(function(i){
      return (date?wasteTripStatus(active,date,i,today)!=='inactive':active[i]!==false)||rec.trips[i]!==null;
    });
    var present=indexes.filter(function(i){return rec.trips[i]!==null;});
    return {total:present.length?present.reduce(function(sum,i){return sum+rec.trips[i];},0):null,
      complete:indexes.length>0&&present.length===indexes.length};
  }
  function average(records,key,mask){
    mask=Array.isArray(mask)&&mask.length===3?mask:[true,true,true];
    var trips=[0,1,2].map(function(i){if(mask[i]===false)return null;var a=records.map(function(r){return r.trips[i][key];}).filter(function(v){return v!==null;});return a.length?a.reduce(function(s,v){return s+v;},0)/a.length:null;});
    var active=[0,1,2].filter(function(i){return mask[i]!==false;});
    var totals=records.filter(function(r){return active.every(function(i){return r.trips[i][key]!==null;});}).map(function(r){return active.reduce(function(sum,i){return sum+r.trips[i][key];},0);});
    return {trips:trips,total:totals.length?totals.reduce(function(s,v){return s+v;},0)/totals.length:null};
  }
  // Saved records only; use the same all-event exclusion as impact analyses.
  function dayTypeRecords(records,categoryId,prefix,eventsForDate,holidayForDate,withDates){
    var groups={weekday:[],sundayHoliday:[]};
    Object.keys(records||{}).sort().forEach(function(date){
      if(!validDateKey(date)||date.slice(0,7)!==prefix||!records[date][categoryId])return;
      if(eventsForDate(date).length)return;
      var parts=date.split('-').map(Number),wd=new Date(parts[0],parts[1]-1,parts[2]).getDay();
      var holiday=holidayForDate(parts[0],parts[1],parts[2]);
      var record=normalizeRecord(records[date][categoryId]);
      var value=withDates?{date:date,record:record}:record;
      if(wd===0||holiday)groups.sundayHoliday.push(value);
      else if(wd>=1&&wd<=5)groups.weekday.push(value);
    });
    return groups;
  }
  function validate(all){
    ensure(all);var m=all.salesCountManagement,ids=new Set(),names=new Set(),labels=new Set();
    if(!object(m)||m.version!==1||!Array.isArray(m.categories)||!m.categories.length||!m.categories.some(function(c){return object(c)&&c.hidden===false;}))throw new Error('販売数カテゴリーマスターが不正です');
    m.categories.forEach(function(c){if(!object(c)||typeof c.id!=='string'||!c.id||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||names.has(c.name)||typeof c.hidden!=='boolean'||!Array.isArray(c.aliases)||!Array.isArray(c.activeTrips)||c.activeTrips.length!==3||c.activeTrips.some(function(v){return typeof v!=='boolean';})||!c.activeTrips.some(Boolean))throw new Error('販売数カテゴリーが不正です');var values=[c.name].concat(c.aliases);if(values.some(function(v){return typeof v!=='string'||!v.trim()||labels.has(v);}))throw new Error('販売数カテゴリーの名称履歴が重複しています');values.forEach(function(v){labels.add(v);});ids.add(c.id);names.add(c.name);});
    Object.keys(all.stores||{}).forEach(function(storeId){var data=all.stores[storeId].salesCounts;if(!object(data))throw new Error('販売数データが不正です');Object.keys(data).forEach(function(date){if(!validDateKey(date)||!object(data[date]))throw new Error('販売数の日付データが不正です');Object.keys(data[date]).forEach(function(catId){if(!ids.has(catId))throw new Error('販売数カテゴリーの識別番号が不正です');var r=data[date][catId];if(!object(r)||!Array.isArray(r.trips)||r.trips.length!==3)throw new Error('販売数の便データが不正です');r.trips.forEach(function(t){if(!object(t))throw new Error('販売数の便データが不正です');['delivery','sales'].forEach(function(k){var v=t[k];if(v!==null&&(!Number.isSafeInteger(v)||v<0))throw new Error('販売数の入力値が不正です');});});});});});
    validateWasteCounts(all);
    return all;
  }

  // 過去の保存済み日別天気を参照するだけの純粋関数。補完・保存・外部取得は行わない。
  function historicalWeather(all,storeId,date){
    var empty={weather:'—',icon:'—',max:'—',min:'—'};
    if(!all||!all.stores||!all.stores[storeId]||!validDateKey(date))return empty;
    var year=date.slice(0,4),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
    var data=all.stores[storeId].data,rows=data&&data[year]&&data[year][month+'月'],entry=Array.isArray(rows)?rows[day-1]:null;
    if(!entry||typeof entry!=='object'||String(entry.d)!==String(day))return empty;
    var symbols={'快晴':'☀️','晴':'🌤️','晴曇':'⛅','曇':'☁️','小雨':'🌦️','雨':'🌧️','大雨':'⛈️','みぞれ':'🌨️','雪':'❄️'};
    var wx=typeof entry.weather==='string'?entry.weather:'';
    function temp(value){if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return '—';return String(Math.trunc(Number(value)));}
    return {weather:wx||'—',icon:Object.prototype.hasOwnProperty.call(symbols,wx)?symbols[wx]:'—',max:temp(entry.tempMaxC),min:temp(entry.tempMinC)};
  }
  var model={ensure:ensure,validate:validate,categoryForSale:categoryForSale,categoriesForSale:categoriesForSale,emptyRecord:emptyRecord,normalizeRecord:normalizeRecord,emptyWasteRecord:emptyWasteRecord,normalizeWasteRecord:normalizeWasteRecord,validateWasteCounts:validateWasteCounts,wasteSummary:wasteSummary,wasteRecordAt:wasteRecordAt,wasteTripStatus:wasteTripStatus,average:average,activeTrips:activeTrips,tripActive:tripActive,validDateKey:validDateKey,uniqueSaleRecords:uniqueSaleRecords,dayTypeRecords:dayTypeRecords,historicalWeather:historicalWeather};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  if(!root.document)return;
  root.InsightSalesCount=model;

  function init(){
    if(root.__insightSalesCountV1)return;root.__insightSalesCountV1=true;ensure(allStores);
    var doc=root.document,state={year:String(new Date().getFullYear()),month:new Date().getMonth()+1,categoryId:null,draft:{},wasteDraft:{},wasteTouched:{},dirty:false};
    function el(tag,text,cls){var n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
    function pad(v){return String(v).padStart(2,'0');}
    function monthPrefix(){return state.year+'-'+pad(state.month);}
    function daysInMonth(){return new Date(Number(state.year),state.month,0).getDate();}
    function categories(){return allStores.salesCountManagement.categories;}
    function activeCategories(){return categories().filter(function(c){return !c.hidden;});}
    function selectedCategory(){return categories().find(function(c){return c.id===state.categoryId;})||null;}
    function setDirty(v){state.dirty=!!v;var mark=doc.getElementById('scDirty'),save=doc.getElementById('scSave');if(mark){mark.textContent=v?'未保存の変更があります':'保存済み';mark.className='sc-status '+(v?'dirty':'saved');}if(save)save.disabled=!v;}
    function confirmLeave(){return !state.dirty||confirm('販売数入力に未保存の変更があります。\n保存せずに移動しますか？');}
    function yearRegistered(year){return !!(store&&Array.isArray(store.years)&&/^\d{4}$/.test(String(year))&&store.years.some(function(value){return String(value)===String(year);}));}
    function ensureRegisteredYear(year){var y=String(year);if(yearRegistered(y))return true;if(!root.InsightYearManager||typeof root.InsightYearManager.promoteCurrent!=='function'){alert('この年度を追加する機能を使用できません。');return false;}if(!confirm(y+'年度はダッシュボードに登録されていません。\n年度を追加して販売数を入力しますか？\n\n既にある過去データは保持したまま、未入力日を正常な空データで補完します。'))return false;try{root.InsightYearManager.promoteCurrent(y);store=allStores.stores[allStores.current];if(typeof renderYearPills==='function')renderYearPills();if(typeof showToast==='function')showToast('✓ '+y+'年度を追加しました','#15803d','#f0fdf4');return true;}catch(error){alert('年度を追加できませんでした。\n'+(error&&error.message?error.message:error));return false;}}
    function readMonth(){state.draft={};var prefix=monthPrefix(),data=store.salesCounts||{};Object.keys(data).forEach(function(date){if(date.slice(0,7)===prefix&&data[date][state.categoryId])state.draft[date]=normalizeRecord(data[date][state.categoryId]);});var waste=store.wasteCounts||{};state.wasteDraft={};state.wasteTouched={};Object.keys(waste).forEach(function(date){if(date.slice(0,7)===prefix&&waste[date][state.categoryId])state.wasteDraft[date]=normalizeWasteRecord(waste[date][state.categoryId]);});setDirty(false);}
    function record(date){return state.draft[date]||(state.draft[date]=emptyRecord());}
    function total(r,key,mask){mask=Array.isArray(mask)&&mask.length===3?mask:activeTrips(selectedCategory());var indexes=[0,1,2].filter(function(i){return mask[i]!==false;});var values=indexes.map(function(i){return r.trips[i][key];});return values.every(function(v){return v===null;})?null:values.reduce(function(sum,v){return sum+(v===null?0:v);},0);}
    function fmt(v){return v===null?'—':Number(v).toFixed(1).replace(/\.0$/,'');}
    function persistTransaction(next){if(!root.InsightStorage)throw new Error('保存機能を初期化できませんでした。');validate(next);root.InsightStorage.writeSnapshot(next);allStores.salesCountManagement=next.salesCountManagement;Object.keys(next.stores).forEach(function(id){allStores.stores[id].salesCounts=next.stores[id].salesCounts;if(Object.prototype.hasOwnProperty.call(next.stores[id],'wasteCounts'))allStores.stores[id].wasteCounts=next.stores[id].wasteCounts;});store=allStores.stores[allStores.current];}
    function save(){
      if(!ensureRegisteredYear(state.year))return;
      var invalid=doc.querySelector('#pageSalesCount input:invalid');if(invalid){invalid.reportValidity();invalid.focus();return;}
      var mask=activeTrips(selectedCategory()),large=[];Object.keys(state.draft).forEach(function(date){state.draft[date].trips.forEach(function(t,i){if(mask[i]===false)return;['delivery','sales'].forEach(function(k){if(t[k]>=1000)large.push(date+' '+(i+1)+'便 '+(k==='delivery'?'納品':'販売')+' '+t[k]);});});});
      Object.keys(state.wasteTouched).forEach(function(date){var rec=state.wasteDraft[date];if(!rec)return;rec.trips.forEach(function(v,i){if(v!==null&&v>=1000)large.push(date+' '+(i+1)+'便 廃棄 '+v);});});if(large.length&&!confirm('4桁以上の入力があります。内容を確認して保存しますか？\n\n'+large.slice(0,8).join('\n')+(large.length>8?'\nほか '+(large.length-8)+'件':'')))return;
      try{var next=copy(allStores);ensure(next);var nextStore=next.stores[allStores.current],prefix=monthPrefix();Object.keys(nextStore.salesCounts).forEach(function(date){if(date.slice(0,7)===prefix&&nextStore.salesCounts[date][state.categoryId]){delete nextStore.salesCounts[date][state.categoryId];if(!Object.keys(nextStore.salesCounts[date]).length)delete nextStore.salesCounts[date];}});Object.keys(state.draft).forEach(function(date){var r=normalizeRecord(state.draft[date]);if(r.trips.some(function(t){return t.delivery!==null||t.sales!==null;})){if(!nextStore.salesCounts[date])nextStore.salesCounts[date]={};nextStore.salesCounts[date][state.categoryId]=r;}});if(Object.keys(state.wasteTouched).length){var savedWaste=nextStore.wasteCounts||{};Object.keys(state.wasteTouched).forEach(function(date){var rec=normalizeWasteRecord(state.wasteDraft[date]);if(rec.trips.some(function(v){return v!==null;})){if(!savedWaste[date])savedWaste[date]={};savedWaste[date][state.categoryId]=rec;}else if(savedWaste[date]){delete savedWaste[date][state.categoryId];if(!Object.keys(savedWaste[date]).length)delete savedWaste[date];}});nextStore.wasteCounts=savedWaste;}persistTransaction(next);state.wasteTouched={};setDirty(false);showToast('✓ 販売数を保存しました','#15803d','#f0fdf4');renderAnalysis();}catch(e){alert('販売数を保存できませんでした。\n'+e.message);}
    }
    function notifyPeriodChange(){
      try{root.dispatchEvent(new CustomEvent('insight:sales-count-period-change',{detail:{year:state.year,month:state.month}}));}catch(_){}
    }
    function setPeriod(year,month){
      var y=Number(year),m=Number(month);
      if(!Number.isInteger(y)||y<1000||!Number.isInteger(m)||m<1||m>12)return false;
      // A no-op route sync only displays the period; it must not attempt year registration.
      if(String(y)===state.year&&m===state.month)return true;
      if(!confirmLeave())return false;
      if(!ensureRegisteredYear(y))return false;
      state.year=String(y);state.month=m;readMonth();render();notifyPeriodChange();return true;
    }
    function changePeriod(delta){var d=new Date(Number(state.year),state.month-1+delta,1);setPeriod(d.getFullYear(),d.getMonth()+1);}
    function changeCategory(id){if(id===state.categoryId)return;if(!confirmLeave()){doc.getElementById('scCategory').value=state.categoryId;return;}state.categoryId=id;readMonth();render();}
    function normalizeEditableCountInput(input){
      // Only strip redundant leading zeroes from complete, safe non-negative integers.
      // Keep blank/invalid/intermediate input intact for the existing validation flow.
      if(/^0+\d+$/.test(input.value)){
        var count=Number(input.value);
        if(Number.isSafeInteger(count))input.value=String(count);
      }
    }
    function buildInput(date,r,trip,key){var i=el('input');if(!tripActive(selectedCategory(),trip)){var saved=r.trips[trip][key];i.type='text';i.value=saved===null?'／':String(saved);i.readOnly=true;i.tabIndex=-1;i.className='sc-not-applicable';i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',date+' '+(trip+1)+'便 '+(key==='delivery'?'納品数':'販売数')+' 対象外'+(saved===null?'':'（保存済み・編集不可）'));return i;}i.type='text';i.inputMode='numeric';i.pattern='[0-9]*';i.value=r.trips[trip][key]===null?'':String(r.trips[trip][key]);i.classList.toggle('has-val',i.value!=='');i.setAttribute('aria-label',date+' '+(trip+1)+'便 '+(key==='delivery'?'納品数':'販売数'));i.oninput=function(){normalizeEditableCountInput(i);if(!state.draft[date])state.draft[date]=r;i.setCustomValidity('');if(i.value===''){r.trips[trip][key]=null;}else{var n=Number(i.value);if(!/^[0-9]+$/.test(i.value)||!Number.isSafeInteger(n)){i.setCustomValidity('0以上の整数を入力してください');setDirty(true);return;}r.trips[trip][key]=n;}i.classList.toggle('has-val',i.value!=='');setDirty(true);updateTotals(i.closest('.sc-day'),r);renderAverages();};return i;}
    function updateTotals(card,r,mask){var vals=card.querySelectorAll('[data-total]');vals.forEach(function(n){var v=total(r,n.dataset.total,mask);n.textContent=v===null?'—':String(v);});}
    function buildReadOnlyInput(date,r,trip,key,category,historyMask){
      var i=el('input'),hasHistory=Array.isArray(historyMask)&&historyMask.length===3,
        status=hasHistory?historyMask[trip]:activeTrips(category||selectedCategory())[trip],
        saved=r.trips[trip][key];
      // Historical read-only cards must never hide a saved count (including zero).
      if(status===false&&saved===null){
        i.type='text';i.value='／';i.readOnly=true;i.tabIndex=-1;i.className='sc-not-applicable';
        i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',date+' '+(trip+1)+'便 対象外');return i;
      }
      if(status===null&&saved===null){
        i.type='text';i.value='ー';i.readOnly=true;i.tabIndex=-1;i.className='sc-waste-unverified';
        i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',date+' '+(trip+1)+'便 '+(key==='delivery'?'納品数':'販売数')+'（対象便未確認）');return i;
      }
      i.type='number';i.min='0';i.step='1';i.inputMode='numeric';i.value=saved===null?'':String(saved);
      i.classList.toggle('has-val',i.value!=='');i.readOnly=true;i.tabIndex=-1;
      i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',date+' '+(trip+1)+'便 '+(key==='delivery'?'納品数':'販売数')+(status===false?' 対象外（保存済み・編集不可）':''));return i;
    }

    function buildReadOnlyWasteInput(date,record,index,category){
      var input=el('input'),value=record.trips[index];
      var status=wasteTripStatus(activeTrips(category||selectedCategory()),date,index);
      input.type='text';
      input.value=value===null?(status==='inactive'?'／':status==='unverified'?'ー':''):String(value);
      input.readOnly=true;input.tabIndex=-1;
      input.setAttribute('aria-readonly','true');
      input.setAttribute('aria-label',date+' '+(index+1)+'便 廃棄数'+(status==='unverified'?'（過去の対象便は未確認）':''));
      if(status==='inactive'&&value===null)input.classList.add('sc-not-applicable');
      else if(status==='unverified'&&value===null)input.classList.add('sc-waste-unverified');
      else input.classList.toggle('has-val',value!==null);
      return input;
    }

    function createHistoricalWeatherRow(date,storeId){
      var info=historicalWeather(allStores,storeId||allStores.current,date);
      var line=el('div',undefined,'sc-history-weather');
      line.setAttribute('aria-label','天気 '+info.weather+'、最高気温 '+info.max+'℃、最低気温 '+info.min+'℃');
      var icon=el('span',undefined,'sc-history-icon');
      if(root.InsightWeatherIconCompat&&typeof root.InsightWeatherIconCompat.render==='function'){
        root.InsightWeatherIconCompat.render(icon,info.weather);
      }
      if(!icon.firstChild&&!icon.textContent)icon.textContent=info.icon;
      line.append(icon,el('span',info.max+'°','sc-history-high'),
        el('span',' / ','sc-history-divider'),el('span',info.min+'°','sc-history-low'));
      return line;
    }
    function createReadOnlyDayCard(date,value,category,waste,historyMask){
      var r=normalizeRecord(value),mask=Array.isArray(historyMask)&&historyMask.length===3?historyMask:activeTrips(category||selectedCategory()),parts=date.split('-'),
        year=Number(parts[0]),month=Number(parts[1]),day=Number(parts[2]),
        wd=new Date(year,month-1,day).getDay(),
        holiday=typeof isHoliday==='function'&&isHoliday(year,month,day),red=wd===0||holiday,
        withWaste=arguments.length>=4,
        card=el('div',undefined,'sc-day '+(wd===6?'sat-card':red?'sun-card':'')+(withWaste?' sc-readonly-waste':''));
      var head=el('div',undefined,'sc-day-title'),
        num=el('strong',month+'/'+day+'（'+WEEKDAYS[wd]+'）','sc-day-num '+(wd===6?'sat':red?'sun':''));
      head.append(num,holiday?el('small','祝日'):el('span'));
      card.append(head,createHistoricalWeatherRow(date,allStores.current));
      var labels=el('div',undefined,'sc-col-head');
      labels.innerHTML='<span>1便</span><span>2便</span><span>3便</span>';
      card.append(labels);
      var delivery=el('div',undefined,'sc-trip sc-delivery-row'),
        salesRow=el('div',undefined,'sc-trip sc-sales-row');
      delivery.append(buildReadOnlyInput(date,r,0,'delivery',category,historyMask),buildReadOnlyInput(date,r,1,'delivery',category,historyMask),buildReadOnlyInput(date,r,2,'delivery',category,historyMask));
      salesRow.append(buildReadOnlyInput(date,r,0,'sales',category,historyMask),buildReadOnlyInput(date,r,1,'sales',category,historyMask),buildReadOnlyInput(date,r,2,'sales',category,historyMask));
      card.append(delivery,salesRow);
      var wasteRecord;
      if(withWaste){
        wasteRecord=normalizeWasteRecord(waste);
        var wasteRow=el('div',undefined,'sc-trip sc-waste-row');
        wasteRow.append(buildReadOnlyWasteInput(date,wasteRecord,0,category),buildReadOnlyWasteInput(date,wasteRecord,1,category),buildReadOnlyWasteInput(date,wasteRecord,2,category));
        card.append(wasteRow);
      }
      var totals=el('div',undefined,'sc-totals');
      totals.innerHTML='<b class="sc-total-delivery" data-total="delivery"></b><b class="sc-total-sales" data-total="sales"></b>'+(withWaste?'<b class="sc-total-waste"></b>':'');
      card.append(totals);updateTotals(card,r,mask);
      if(Array.isArray(historyMask)&&historyMask.length===3){
        // Read-only historical totals require all confirmed active trips to have values.
        // An unknown trip or a missing active value must never become a partial total.
        totals.querySelectorAll('[data-total]').forEach(function(node){
          var key=node.dataset.total;
          var complete=mask.every(function(active,index){
            return active===false||(active===true&&r.trips[index][key]!==null);
          });
          if(!complete){node.textContent='—';node.title='過去の対象便が未確認、または対象便の実績が未入力です';}
        });
      }
      if(withWaste){
        var summary=wasteSummary(wasteRecord,mask,date),target=totals.querySelector('.sc-total-waste');
        target.textContent=summary.total===null?'—':String(summary.total)+(summary.complete?'':'※');
        target.classList.toggle('has-val',summary.total!==null);
        target.setAttribute('aria-label',summary.total===null?'廃棄数未入力':summary.complete?'廃棄合計 '+summary.total+'個':'廃棄入力済み合計 '+summary.total+'個。一部未入力');
      }
      return card;
    }
    function buildWasteInput(date,index){
      var rec=state.wasteDraft[date]||emptyWasteRecord(),value=rec.trips[index],input=el('input');
      // Follow the same current category trip mask as delivery/sales for editing.
      // A saved waste count must remain visible and preserved, even when the trip is now excluded.
      if(!tripActive(selectedCategory(),index)){
        input.type='text';input.value=value===null?'／':String(value);input.readOnly=true;input.tabIndex=-1;input.className='sc-not-applicable';
        input.setAttribute('aria-readonly','true');input.setAttribute('aria-label',date+' '+(index+1)+'便 廃棄 対象外'+(value===null?'':'（保存済み・編集不可）'));return input;
      }
      input.type='text';input.inputMode='numeric';input.pattern='[0-9]*';
      input.value=value===null?'':String(value);input.classList.toggle('has-val',value!==null);
      input.setAttribute('aria-label',date+' '+(index+1)+'便 廃棄数');
      input.oninput=function(){
        normalizeEditableCountInput(input);
        input.setCustomValidity('');
        var nextValue=null;
        if(input.value!==''){
          nextValue=Number(input.value);
          if(!/^[0-9]+$/.test(input.value)||!Number.isSafeInteger(nextValue)){
            input.setCustomValidity('0以上の整数を入力してください');setDirty(true);return;
          }
        }
        var draft=state.wasteDraft[date]||(state.wasteDraft[date]=emptyWasteRecord());
        draft.trips[index]=nextValue;state.wasteTouched[date]=true;
        input.classList.toggle('has-val',nextValue!==null);setDirty(true);
        updateWasteTotal(input.closest('.sc-day'),date);
      };
      return input;
    }
    function updateWasteTotal(card,date){
      if(!card)return;
      var target=card.querySelector('.sc-total-waste');if(!target)return;
      var summary=wasteSummary(state.wasteDraft[date]||emptyWasteRecord(),activeTrips(selectedCategory()),date);
      target.textContent=summary.total===null?'—':String(summary.total)+(summary.complete?'':'※');
        target.classList.toggle('has-val',summary.total!==null);
      target.setAttribute('aria-label',summary.total===null?'廃棄数未入力':summary.complete?'廃棄合計 '+summary.total+'個':'廃棄入力済み合計 '+summary.total+'個。一部未入力');
    }
    function renderCalendar(){var grid=doc.getElementById('scCalendar');grid.replaceChildren();WEEKDAYS.forEach(function(w,i){var h=el('div',w,'sc-weekhead '+(i===0?'sun':i===6?'sat':''));grid.append(h);});var first=new Date(Number(state.year),state.month-1,1).getDay(),col=first;for(var b=0;b<first;b++)grid.append(el('div',undefined,'sc-day empty'));var days=daysInMonth();for(var day=1;day<=days;day++){var date=monthPrefix()+'-'+pad(day),r=state.draft[date]||emptyRecord(),wd=new Date(Number(state.year),state.month-1,day).getDay(),holiday=typeof isHoliday==='function'&&isHoliday(Number(state.year),state.month,day),red=wd===0||holiday,card=el('div',undefined,'sc-day '+(wd===6?'sat-card':red?'sun-card':''));var head=el('div',undefined,'sc-day-title'),num=el('strong',String(day),'sc-day-num '+(wd===6?'sat':red?'sun':''));head.append(num,holiday?el('small','祝日'):el('span'));card.append(head);var labels=el('div',undefined,'sc-col-head');labels.innerHTML='<span>1便</span><span>2便</span><span>3便</span>';card.append(labels);var delivery=el('div',undefined,'sc-trip sc-delivery-row'),salesRow=el('div',undefined,'sc-trip sc-sales-row'),wasteRow=el('div',undefined,'sc-trip sc-waste-row');delivery.append(buildInput(date,r,0,'delivery'),buildInput(date,r,1,'delivery'),buildInput(date,r,2,'delivery'));salesRow.append(buildInput(date,r,0,'sales'),buildInput(date,r,1,'sales'),buildInput(date,r,2,'sales'));wasteRow.append(buildWasteInput(date,0),buildWasteInput(date,1),buildWasteInput(date,2));card.append(delivery,salesRow,wasteRow);var totals=el('div',undefined,'sc-totals');totals.innerHTML='<b class="sc-total-delivery" data-total="delivery"></b><b class="sc-total-sales" data-total="sales"></b><b class="sc-total-waste"></b>';card.append(totals);updateTotals(card,r);updateWasteTotal(card,date);grid.append(card);col=(col+1)%7;if(wd===6&&day<days){grid.append(el('div',undefined,'sc-week-sep'));col=0;}}if(col>0){for(var x=col;x<7;x++)grid.append(el('div',undefined,'sc-day empty'));}}
    // Only historical averages use month-specific trip evidence; editing and current settings are unchanged.
    function datedAverage(rows,key){
      var month=monthPrefix(),mask=activeTrips(selectedCategory());
      if(month>=localTodayKey().slice(0,7)){
        var ordinary=average(rows.map(function(row){return row.record;}),key,mask);
        return {trips:ordinary.trips,total:ordinary.total,mask:mask,recordDays:rows.length};
      }
      var resolver=root.InsightTripHistoryResolver;
      if(!resolver||typeof resolver.monthly!=='function'||typeof resolver.averageByDate!=='function')
        throw new Error('過去の対象便集計機能を読み込めませんでした。');
      var report=resolver.monthly(allStores,allStores.current,state.categoryId,month);
      var calculated=resolver.averageByDate(allStores,allStores.current,state.categoryId,rows,key);
      return {trips:calculated.trips,total:calculated.total,recordDays:rows.length,
        mask:report.trips.map(function(item){return item.status==='active'?true:item.status==='inactive'?false:null;})};
    }
    function weekdayRecords(key){
      var groups=[[],[],[],[],[],[],[]];
      Object.keys(state.draft).forEach(function(date){
        groups[new Date(date+'T12:00:00').getDay()].push({date:date,record:state.draft[date]});
      });
      return groups.map(function(group){return datedAverage(group,key);});
    }
    function averageTable(title,key){var box=el('section',undefined,'sc-card'),h=el('h3',title),table=el('table'),mask=activeTrips(selectedCategory());table.innerHTML='<thead><tr><th>曜日</th><th>1便平均</th><th>2便平均</th><th>3便平均</th><th>1日合計平均</th></tr></thead>';var body=el('tbody'),values=weekdayRecords(key);values.forEach(function(a,i){var tr=el('tr');tr.innerHTML='<th>'+WEEKDAYS[i]+'</th><td>'+(mask[0]===false?'／':a.trips[0]===null?'':fmt(a.trips[0]))+'</td><td>'+(mask[1]===false?'／':a.trips[1]===null?'':fmt(a.trips[1]))+'</td><td>'+(mask[2]===false?'／':a.trips[2]===null?'':fmt(a.trips[2]))+'</td><td>'+fmt(a.total)+'</td>';body.append(tr);});table.append(body);box.append(h,table);return box;}
    function eventMatches(e){if(!e||e.type!=='sale'||!e.snapshot||!e.snapshot.sale)return false;return categoriesForSale(allStores,e.snapshot.sale).some(function(c){return c.id===state.categoryId;});}
    function eventsFor(storeId,date){try{return root.InsightEvents?root.InsightEvents.list(allStores,storeId,date).filter(eventMatches):[];}catch(_){return [];}}
    function analysisData(){var saleRows=[],normal=[],saleWeekdays=new Set(),days=daysInMonth(),storeId=allStores.current,st=allStores.stores[storeId];if(!st)return {sales:saleRows,normal:normal};for(var d=1;d<=days;d++){var date=monthPrefix()+'-'+pad(d),evs=eventsFor(storeId,date),r=st.salesCounts&&st.salesCounts[date]&&st.salesCounts[date][state.categoryId]?normalizeRecord(st.salesCounts[date][state.categoryId]):null;if(evs.length){saleWeekdays.add(new Date(date+'T12:00:00').getDay());evs.forEach(function(e){saleRows.push({date:date,store:st.name,event:e,record:r||emptyRecord()});});}}for(var n=1;n<=days;n++){var normalDate=monthPrefix()+'-'+pad(n),wd=new Date(normalDate+'T12:00:00').getDay();if(saleWeekdays.has(wd)&&eventsFor(storeId,normalDate).length===0){var normalRecord=st.salesCounts&&st.salesCounts[normalDate]&&st.salesCounts[normalDate][state.categoryId];if(normalRecord)normal.push(normalizeRecord(normalRecord));}}return {sales:saleRows,normal:normal};}

    function reloadFromStore(){
      ensure(allStores);
      store=allStores.stores[allStores.current];
      if(!store)return false;
      var active=activeCategories();
      if(!active.length&&categories().length){categories()[0].hidden=false;active=activeCategories();}
      if(!selectedCategory()||selectedCategory().hidden)state.categoryId=active[0]&&active[0].id||null;
      readMonth();
      render();
      return true;
    }

    // Read-only snapshot for automatic AI comments; reuse the page's calculations.
    model.getPeriod=function(){return {year:state.year,month:state.month};};
    model.setPeriod=function(year,month){return setPeriod(year,month);};
    model.reloadFromStore=reloadFromStore;
    model.confirmLeave=confirmLeave;
    model.createReadOnlyDayCard=createReadOnlyDayCard;
    model.createHistoricalWeatherRow=createHistoricalWeatherRow;
    model.createAverageCard=createAverageCard;

    model.getAnalysisContext=function(){
      var data=analysisData(),records=Object.keys(state.draft).sort().map(function(date){
        var r=state.draft[date],mask=activeTrips(selectedCategory());
        return {date:date,delivery:total(r,'delivery',mask),sales:total(r,'sales',mask)};
      });
      var saleRecords=uniqueSaleRecords(data.sales);
      return copy({
        year:state.year,month:state.month,category:selectedCategory(),dirty:state.dirty,
        activeTrips:activeTrips(selectedCategory()),
        daily:records,delivery:average(Object.values(state.draft),'delivery',activeTrips(selectedCategory())),
        sales:average(Object.values(state.draft),'sales',activeTrips(selectedCategory())),
        weekdays:{delivery:weekdayRecords('delivery'),sales:weekdayRecords('sales')},
        sale:{delivery:average(saleRecords,'delivery',activeTrips(selectedCategory())),sales:average(saleRecords,'sales',activeTrips(selectedCategory()))},
        normal:{delivery:average(data.normal,'delivery',activeTrips(selectedCategory())),sales:average(data.normal,'sales',activeTrips(selectedCategory()))},
        events:data.sales.map(function(row){return {date:row.date,summary:root.InsightEvents.summary(row.event.snapshot)};})
      });
    };

    function comparisonTable(records,title){
      var d=datedAverage(records,'delivery'),s=datedAverage(records,'sales'),
        box=el('section',undefined,'sc-card'),table=el('table'),mask=d.mask;
      box.append(el('h3',title));
      function v(value,index){
        return mask[index]===false?'／':mask[index]===null&&value===null&&records.length?'ー':value===null?'':fmt(value);
      }
      table.innerHTML='<thead><tr><th></th><th>1便</th><th>2便</th><th>3便</th><th>1日</th></tr></thead>'+
        '<tbody><tr><th>平均納品</th><td>'+v(d.trips[0],0)+'</td><td>'+v(d.trips[1],1)+'</td><td>'+v(d.trips[2],2)+'</td><td>'+fmt(d.total)+'</td></tr>'+
        '<tr><th>平均販売</th><td>'+v(s.trips[0],0)+'</td><td>'+v(s.trips[1],1)+'</td><td>'+v(s.trips[2],2)+'</td><td>'+fmt(s.total)+'</td></tr></tbody>';
      box.append(table);return box;
    }
    function appendDayTypeComparisons(comps){
      var groups=dayTypeRecords(store.salesCounts,state.categoryId,monthPrefix(),function(date){
        return root.InsightEvents.list(allStores,allStores.current,date);
      },function(year,month,day){return typeof isHoliday==='function'&&isHoliday(year,month,day);},true);
      [
        {records:groups.weekday,title:'平日平均'},
        {records:groups.sundayHoliday,title:'日曜日・祝日平均'}
      ].forEach(function(group){
        var card=comparisonTable(group.records,group.title);
        card.classList.add('sc-day-type-card');
        card.querySelector('thead th:last-child').textContent='1日合計';
        comps.append(card);
      });
    }
    function renderAnalysis(){var area=doc.getElementById('scAnalysis');if(!area)return;area.replaceChildren();var comps=el('div',undefined,'sc-comparisons');appendDayTypeComparisons(comps);area.append(comps);}
    function disp(t,index){return tripActive(selectedCategory(),index)?dispValue(t.delivery)+' / '+dispValue(t.sales):'対象外';}function dispValue(v){return v===null?'—':String(v);}
    function buildAverageInput(value,label,enabled){
      var i=el('input');
      if(enabled===false){i.type='text';i.value='／';i.readOnly=true;i.tabIndex=-1;i.className='sc-not-applicable';i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',label+' 対象外');return i;}
      if(enabled===null&&value===null){i.type='text';i.value='ー';i.readOnly=true;i.tabIndex=-1;i.className='sc-waste-unverified';i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',label+' 対象便未確認');return i;}
      i.type='number';i.value=value===null?'':fmt(value);i.readOnly=true;i.tabIndex=-1;i.setAttribute('aria-readonly','true');i.setAttribute('aria-label',label);i.classList.toggle('has-val',value!==null);return i;
    }
    function createAverageCard(label,deliveryAverage,salesAverage,tone,category,historyMask){var mask=Array.isArray(historyMask)&&historyMask.length===3?historyMask:activeTrips(category||selectedCategory());deliveryAverage=deliveryAverage||{trips:[null,null,null],total:null};salesAverage=salesAverage||{trips:[null,null,null],total:null};var card=el('section',undefined,'sc-day sc-average-card '+(tone==='sun'?'sun-card':tone==='sat'?'sat-card':'')),title=el('div',undefined,'sc-day-title'),num=el('strong',label,'sc-day-num '+(tone==='sun'?'sun':tone==='sat'?'sat':'')),head=el('div',undefined,'sc-col-head'),delivery=el('div',undefined,'sc-trip sc-delivery-row'),salesRow=el('div',undefined,'sc-trip sc-sales-row'),totals=el('div',undefined,'sc-totals');title.append(num,el('span'));head.innerHTML='<span>1便</span><span>2便</span><span>3便</span>';delivery.append(buildAverageInput(deliveryAverage.trips[0],label+' 1便 平均納品',mask[0]),buildAverageInput(deliveryAverage.trips[1],label+' 2便 平均納品',mask[1]),buildAverageInput(deliveryAverage.trips[2],label+' 3便 平均納品',mask[2]));salesRow.append(buildAverageInput(salesAverage.trips[0],label+' 1便 平均販売',mask[0]),buildAverageInput(salesAverage.trips[1],label+' 2便 平均販売',mask[1]),buildAverageInput(salesAverage.trips[2],label+' 3便 平均販売',mask[2]));totals.innerHTML='<b class="sc-total-delivery">'+fmt(deliveryAverage.total)+'</b><b class="sc-total-sales">'+fmt(salesAverage.total)+'</b>';card.append(title,head,delivery,salesRow,totals);return card;}
    function renderAverages(){
      var a=doc.getElementById('scAverages');a.replaceChildren();
      a.append(el('h3','曜日別平均','sc-average-title'));
      var grid=el('div',undefined,'sc-average-grid'),
        deliveries=weekdayRecords('delivery'),salesValues=weekdayRecords('sales');
      function v(value,index,mask,recordDays){
        return '<b'+(mask[index]===false?' class="sc-not-applicable"':'')+'>'+
          (mask[index]===null&&value===null&&recordDays?'ー':mask[index]===false?'／':value===null?'':fmt(value))+'</b>';
      }
      WEEKDAYS.forEach(function(day,i){
        var card=el('section',undefined,'sc-average-day '+(i===0?'sun-card':i===6?'sat-card':'')),
          title=el('div',day+'曜日','sc-average-day-title '+(i===0?'sun':i===6?'sat':'')),
          head=el('div',undefined,'sc-average-head'),delivery=el('div',undefined,'sc-average-row sc-average-delivery'),
          salesRow=el('div',undefined,'sc-average-row sc-average-sales'),totals=el('div',undefined,'sc-average-totals'),
          d=deliveries[i],s=salesValues[i],mask=d.mask;
        head.innerHTML='<span>1便</span><span>2便</span><span>3便</span>';
        delivery.innerHTML=v(d.trips[0],0,mask,d.recordDays)+v(d.trips[1],1,mask,d.recordDays)+v(d.trips[2],2,mask,d.recordDays);
        salesRow.innerHTML=v(s.trips[0],0,mask,s.recordDays)+v(s.trips[1],1,mask,s.recordDays)+v(s.trips[2],2,mask,s.recordDays);
        totals.innerHTML='<b class="sc-total-delivery">'+fmt(d.total)+'</b><b class="sc-total-sales">'+fmt(s.total)+'</b>';
        card.append(title,head,delivery,salesRow,totals);grid.append(card);
      });
      a.append(grid);
    }
    function render(){var title=doc.getElementById('scPeriod');title.textContent=state.year+'年 '+state.month+'月';var sel=doc.getElementById('scCategory');sel.replaceChildren();activeCategories().forEach(function(c){var o=el('option',c.name);o.value=c.id;sel.append(o);});if(!selectedCategory()||selectedCategory().hidden)state.categoryId=activeCategories()[0]&&activeCategories()[0].id;sel.value=state.categoryId||'';renderCalendar();renderAverages();renderAnalysis();}
    function manageCategories(){var d=el('dialog',undefined,'sc-dialog'),draft=copy(categories());draft.forEach(function(c){c.activeTrips=activeTrips(c);});d.innerHTML='<header><h2>カテゴリー管理</h2><button type="button">閉じる</button></header><div class="sc-category-list"></div><div class="sc-dialog-actions"><button type="button" data-add>＋ カテゴリーを追加</button><button type="button" class="primary" data-save>保存する</button></div>';doc.body.append(d);var list=d.querySelector('.sc-category-list');d.querySelector('header button').onclick=function(){d.close();};function moveWithinGroup(items,position,delta){var target=items[position+delta];if(!target)return;var currentIndex=items[position].index,targetIndex=target.index,x=draft[currentIndex];draft[currentIndex]=draft[targetIndex];draft[targetIndex]=x;draw();}function drawGroup(hidden){var items=draft.map(function(c,index){return {category:c,index:index};}).filter(function(item){return item.category.hidden===hidden;}),group=el('section',undefined,'sc-category-group '+(hidden?'is-hidden':'is-visible')),heading=el('h3',(hidden?'非表示':'表示中')+'（'+items.length+'件）');group.append(heading);items.forEach(function(item,position){var c=item.category,row=el('div',undefined,'sc-category-row '+(hidden?'is-hidden':'is-visible')),input=el('input');input.value=c.name;input.setAttribute('aria-label','カテゴリー名');input.oninput=function(){c.name=input.value.trim();};var trips=el('div',undefined,'sc-category-trips');trips.append(el('span','対象便','sc-category-trips-label'));[0,1,2].forEach(function(trip){var label=el('label'),check=el('input');check.type='checkbox';check.checked=c.activeTrips[trip]!==false;check.setAttribute('aria-label',c.name+' '+(trip+1)+'便を対象にする');check.onchange=function(){c.activeTrips[trip]=check.checked;};label.append(check,el('span',(trip+1)+'便'));trips.append(label);});var stateText=el('span',(hidden?'○ ':'● ')+(hidden?'非表示':'表示中'),'sc-category-state '+(hidden?'is-hidden':'is-visible'));var toggle=el('button',hidden?'再表示する':'非表示にする','sc-category-toggle');toggle.type='button';toggle.onclick=function(){c.hidden=!c.hidden;draw();};var up=el('button','↑','sc-category-move'),down=el('button','↓','sc-category-move');up.type=down.type='button';up.setAttribute('aria-label',c.name+'を上へ移動');down.setAttribute('aria-label',c.name+'を下へ移動');up.disabled=position===0;down.disabled=position===items.length-1;up.onclick=function(){moveWithinGroup(items,position,-1);};down.onclick=function(){moveWithinGroup(items,position,1);};row.append(input,trips,stateText,toggle,up,down);group.append(row);});list.append(group);}function draw(){list.replaceChildren();drawGroup(false);drawGroup(true);}d.querySelector('[data-add]').onclick=function(){draft.push({id:'cat_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),name:'新しいカテゴリー',hidden:false,aliases:[],activeTrips:[true,true,true]});draw();};d.querySelector('[data-save]').onclick=function(){try{if(!draft.length||!draft.some(function(c){return !c.hidden;}))throw new Error('表示するカテゴリーを1件以上残してください');var names=new Set();draft.forEach(function(c){if(!c.name)throw new Error('カテゴリー名を入力してください');if(!Array.isArray(c.activeTrips)||!c.activeTrips.some(Boolean))throw new Error(c.name+'は対象便を1つ以上選択してください');if(names.has(c.name))throw new Error('同じカテゴリー名は使用できません');names.add(c.name);var old=categories().find(function(x){return x.id===c.id;});if(old&&old.name!==c.name){c.aliases=Array.from(new Set((c.aliases||[]).filter(function(name){return name!==c.name;}).concat([old.name])));}});var labels=new Set();draft.forEach(function(c){[c.name].concat(c.aliases||[]).forEach(function(name){if(labels.has(name))throw new Error('現在名または過去名と重複するカテゴリー名は使用できません');labels.add(name);});});var previousCategoryId=state.categoryId,previousDraft=state.draft,previousWasteDraft=state.wasteDraft,previousWasteTouched=state.wasteTouched,wasDirty=state.dirty,nextCategory=draft.find(function(c){return c.id===previousCategoryId&&!c.hidden;});var nextCategoryId=nextCategory?previousCategoryId:draft.find(function(c){return !c.hidden;}).id;if(wasDirty&&nextCategoryId!==previousCategoryId&&!confirm('販売数入力に未保存の変更があります。\n保存せずにカテゴリーを切り替えますか？'))return;var next=copy(allStores);ensure(next);next.salesCountManagement.categories=draft;persistTransaction(next);state.categoryId=nextCategoryId;if(nextCategoryId===previousCategoryId){state.draft=previousDraft;state.wasteDraft=previousWasteDraft;state.wasteTouched=previousWasteTouched;render();setDirty(wasDirty);}else{readMonth();render();}d.close();showToast('✓ カテゴリーを保存しました','#15803d','#f0fdf4');}catch(e){alert(e.message);}};d.addEventListener('close',function(){d.remove();});draw();d.showModal();}
    // iPad home-screen PWAs can retain a stale touch viewport when a numeric keyboard closes.
    // Let the viewport settle before opening category management after a sales-count edit.
    var lastCountInputBlurAt=0,categoryDialogOpening=false;
    function blurSalesCountInput(){
      var active=doc.activeElement;
      if(active&&active.matches&&active.matches('#pageSalesCount .sc-calendar .sc-trip input[inputmode="numeric"]:not([readonly])'))active.blur();
    }
    function waitForCategoryViewport(callback){
      var start=Date.now(),lastChange=start,previous=null;
      function sample(){
        var view=root.visualViewport;
        return view?[view.width,view.height,view.offsetLeft,view.offsetTop,root.innerHeight]:
          [root.innerWidth,root.innerHeight,0,0,root.innerHeight];
      }
      function poll(){
        var now=Date.now(),values=sample();
        if(previous&&values.some(function(v,i){return Math.abs(v-previous[i])>0.5;}))lastChange=now;
        previous=values;
        // Wait beyond the usual keyboard closing animation, with a bounded fallback.
        if((now-start>=400&&now-lastChange>=150)||now-start>=1200){
          root.requestAnimationFrame(function(){root.requestAnimationFrame(callback);});
        }else root.setTimeout(poll,40);
      }
      poll();
    }
    function openCategoryManager(){
      if(categoryDialogOpening)return;
      blurSalesCountInput();
      if(Date.now()-lastCountInputBlurAt>2000){manageCategories();return;}
      categoryDialogOpening=true;
      waitForCategoryViewport(function(){
        categoryDialogOpening=false;
        var page=doc.getElementById('pageSalesCount');
        if(page&&page.classList.contains('show')&&!doc.querySelector('dialog.sc-dialog[open]'))manageCategories();
      });
    }
    function buildPage(){var nav4=doc.getElementById('nav4'),nav=el('button',undefined,'nav-btn');nav.id='navSalesCount';nav.type='button';nav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18v16H3z"/><path d="M3 9h18M8 4v16M13 4v16M18 4v16"/></svg>販売数入力';nav.onclick=function(){root.gotoNav('salesCounts');};nav4.insertAdjacentElement('afterend',nav);var page=el('div',undefined,'page sc-page');page.id='pageSalesCount';page.innerHTML='<div class="page-header"><div class="page-title">販売数入力</div><div class="header-right"><span id="scDirty" class="sc-status saved">保存済み</span><button id="scSave" class="save-btn" disabled>保存する</button></div></div><div class="sc-toolbar"><button id="scPrev" type="button">‹ 前月</button><strong id="scPeriod"></strong><button id="scNext" type="button">翌月 ›</button><label>カテゴリー <select id="scCategory"></select></label><button id="scManage" type="button">カテゴリー管理</button></div><div class="sc-legend" aria-label="色分けの案内"><span><i class="sc-legend-delivery"></i>納品＝緑</span><span><i class="sc-legend-sales"></i>販売＝オレンジ</span><span><i class="sc-legend-waste"></i>廃棄＝赤</span><span>※一部未入力</span></div><div id="scCalendar" class="sc-calendar"></div><div id="scAverages" class="sc-averages"></div><div id="scAnalysis"></div>';doc.getElementById('main').append(page);doc.getElementById('scSave').onclick=save;doc.getElementById('scPrev').onclick=function(){changePeriod(-1);};doc.getElementById('scNext').onclick=function(){changePeriod(1);};doc.getElementById('scCategory').onchange=function(e){changeCategory(e.target.value);};var manageButton=doc.getElementById('scManage');
      doc.getElementById('pageSalesCount').addEventListener('focusout',function(e){
        if(e.target.matches&&e.target.matches('.sc-calendar .sc-trip input[inputmode="numeric"]:not([readonly])'))lastCountInputBlurAt=Date.now();
      },true);
      // Blur on pointerdown, before the tap moves focus to the management button.
      manageButton.addEventListener('pointerdown',blurSalesCountInput);
      manageButton.onclick=openCategoryManager;}
    buildPage();
    if(!activeCategories().length)categories()[0].hidden=false;state.categoryId=activeCategories()[0].id;readMonth();render();
    var originalGoto=root.gotoNav;root.gotoNav=function(i){if(i==='salesCounts'){if(currentNav==='salesCounts')return;doc.querySelectorAll('.nav-btn').forEach(function(n){n.classList.remove('active');});doc.querySelectorAll('.page').forEach(function(n){n.classList.remove('show');});doc.getElementById('navSalesCount').classList.add('active');doc.getElementById('pageSalesCount').classList.add('show');currentNav='salesCounts';ensure(allStores);store=allStores.stores[allStores.current];readMonth();render();return;}if(currentNav==='salesCounts'&&!confirmLeave())return;doc.getElementById('navSalesCount').classList.remove('active');doc.getElementById('pageSalesCount').classList.remove('show');return originalGoto(i);};
    var originalSwitch=root.switchStore;root.switchStore=function(id){if(currentNav!=='salesCounts')return originalSwitch(id);if(!allStores.stores[id]||!confirmLeave()){doc.getElementById('storeSel').value=allStores.current;return;}allStores.current=id;store=allStores.stores[id];baseYear=store.years[store.years.length-1];cmpYear=store.years.length>1?store.years[store.years.length-2]:null;editYear={sales:baseYear,kyaku:baseYear,haiki:baseYear};var t=todayFY();editMonth={sales:t.month,kyaku:t.month,haiki:t.month};applySharedWeatherToStore(store);persist();renderStoreSel();updateMissingBadge();doc.getElementById('storeMenu').classList.add('hidden');ensure(allStores);readMonth();render();};
    root.addEventListener('beforeunload',function(e){if(!state.dirty)return;e.preventDefault();e.returnValue='';});
  }
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
