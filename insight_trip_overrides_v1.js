/* Historical monthly trip overrides: optional, versioned, and additive to existing store data. */
(function(root){
  'use strict';
  if(root.InsightTripOverrides)return;
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function own(v,key){return Object.prototype.hasOwnProperty.call(v,key);}
  function validMonth(v){return typeof v==='string'&&/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(v);}
  function todayMonth(){
    var today=new Date();
    return today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
  }
  function validateStore(store){
    if(!object(store))throw new Error('店舗データが不正です');
    if(store.tripHistoryOverrides===undefined)return true;
    var source=store.tripHistoryOverrides;
    if(!object(source)||source.version!==1||!object(source.categories))throw new Error('過去の対象便の手動設定形式が不正です');
    Object.keys(source.categories).forEach(function(categoryId){
      if(!categoryId)throw new Error('対象便のカテゴリーが不正です');
      var months=source.categories[categoryId];
      if(!object(months))throw new Error('対象便の年月設定が不正です');
      Object.keys(months).forEach(function(month){
        if(!validMonth(month)||!object(months[month]))throw new Error('対象便の年月設定が不正です');
        Object.keys(months[month]).forEach(function(trip){
          if(!/^[123]$/.test(trip)||['active','inactive'].indexOf(months[month][trip])<0)
            throw new Error('対象便の手動判定が不正です');
        });
      });
    });
    return true;
  }
  function validateSnapshot(snapshot){
    if(!object(snapshot)||!object(snapshot.stores))throw new Error('店舗データが不正です');
    Object.keys(snapshot.stores).forEach(function(id){validateStore(snapshot.stores[id]);});
    return true;
  }
  function getOverride(snapshot,storeId,categoryId,month,trip){
    var store=snapshot&&snapshot.stores&&snapshot.stores[storeId];
    if(!store||!store.tripHistoryOverrides)return null;
    validateStore(store);
    var categories=store.tripHistoryOverrides.categories;
    var months=own(categories,categoryId)?categories[categoryId]:null;
    var item=months&&own(months,month)?months[month]:null;
    var key=String(trip);
    return item&&own(item,key)?item[key]:null;
  }
  function hasRecord(store,categoryId,month,trip){
    var records=store&&store.salesCounts;
    if(!object(records))return false;
    return Object.keys(records).some(function(date){
      if(date.slice(0,7)!==month||!object(records[date])||!own(records[date],categoryId))return false;
      var saved=records[date][categoryId],t=saved&&Array.isArray(saved.trips)?saved.trips[trip-1]:null;
      return !!(t&&(t.delivery!==null&&t.delivery!==undefined||t.sales!==null&&t.sales!==undefined));
    });
  }
  function hasCategory(snapshot,id){
    return !!(snapshot&&snapshot.salesCountManagement&&Array.isArray(snapshot.salesCountManagement.categories)&&
      snapshot.salesCountManagement.categories.some(function(c){return object(c)&&c.id===id;}));
  }
  function put(snapshot,storeId,categoryId,month,trip,mode,options){
    if(!object(snapshot)||!object(snapshot.stores)||!object(snapshot.stores[storeId]))throw new Error('店舗がありません');
    if(typeof categoryId!=='string'||!categoryId||!hasCategory(snapshot,categoryId))throw new Error('カテゴリーがありません');
    if(!validMonth(month))throw new Error('年月が不正です');
    if(!Number.isInteger(trip)||trip<1||trip>3)throw new Error('便の指定が不正です');
    if([null,'active','inactive'].indexOf(mode)<0)throw new Error('手動判定が不正です');
    var cutoff=options&&options.todayMonth||todayMonth();
    if(!validMonth(cutoff)||month>=cutoff)throw new Error('手動設定できるのは終了した過去月のみです');
    var store=snapshot.stores[storeId];validateStore(store);
    if(mode==='inactive'&&hasRecord(store,categoryId,month,trip))
      throw new Error('保存済みの納品・販売実績がある便は対象外に指定できません');
    var rootData=store.tripHistoryOverrides;
    if(mode===null){
      if(!rootData||!own(rootData.categories,categoryId)||!own(rootData.categories[categoryId],month))return false;
      var entry=rootData.categories[categoryId][month],key=String(trip);
      if(!own(entry,key))return false;
      delete entry[key];
      if(!Object.keys(entry).length)delete rootData.categories[categoryId][month];
      if(!Object.keys(rootData.categories[categoryId]).length)delete rootData.categories[categoryId];
      if(!Object.keys(rootData.categories).length)delete store.tripHistoryOverrides;
      return true;
    }
    if(!rootData)rootData=store.tripHistoryOverrides={version:1,categories:Object.create(null)};
    if(!own(rootData.categories,categoryId))rootData.categories[categoryId]=Object.create(null);
    if(!own(rootData.categories[categoryId],month))rootData.categories[categoryId][month]=Object.create(null);
    var current=rootData.categories[categoryId][month][String(trip)];
    if(current===mode)return false;
    rootData.categories[categoryId][month][String(trip)]=mode;
    return true;
  }
  function save(snapshot,storage,storeId,categoryId,month,trip,mode,options){
    if(!storage||typeof storage.transaction!=='function')throw new Error('保存機能を利用できません');
    // Validate and detect a no-op before calling storage; in-memory data is never changed.
    var proposed=JSON.parse(JSON.stringify(snapshot));
    var changed=put(proposed,storeId,categoryId,month,trip,mode,options);
    if(!changed)return false;
    validateSnapshot(proposed);
    storage.transaction(snapshot,function(next){
      put(next,storeId,categoryId,month,trip,mode,options);
    },validateSnapshot,function(next){
      var original=snapshot.stores[storeId],updated=next.stores[storeId];
      if(own(updated,'tripHistoryOverrides'))original.tripHistoryOverrides=updated.tripHistoryOverrides;
      else delete original.tripHistoryOverrides;
    });
    return true;
  }
  function effective(snapshot,storeId,categoryId,month,trip,inferred){
    var selected=getOverride(snapshot,storeId,categoryId,month,trip);
    var store=snapshot&&snapshot.stores&&snapshot.stores[storeId];
    var observed=!!(store&&hasRecord(store,categoryId,month,trip));
    // Never label saved evidence as inactive if it was entered after an old override.
    if(selected==='inactive'&&observed)return {mode:'conflict',value:'observed_active',manual:selected};
    return {mode:selected?'manual':'auto',value:selected||inferred,manual:selected};
  }
  var api={getOverride:getOverride,put:put,save:save,effective:effective,hasRecord:hasRecord,
    validateStore:validateStore,validateSnapshot:validateSnapshot};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.InsightTripOverrides=api;
})(typeof window!=='undefined'?window:globalThis);
