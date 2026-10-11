/* Optional backwards-compatible historical trip decisions (separate from saved sales/delivery records). */
(function(root){
  'use strict';
  if(root.InsightTripOverrides)return;
  var FIELD='tripInferenceOverrides';
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function monthValid(month){return typeof month==='string'&&/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month);}
  function todayMonth(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function hasActual(record,trip){
    var item=record&&Array.isArray(record.trips)&&record.trips[trip-1];
    return !!(object(item)&&
      (Number.isSafeInteger(item.delivery)&&item.delivery>=0||
       Number.isSafeInteger(item.sales)&&item.sales>=0));
  }
  function hasObservedTrip(snapshot,storeId,categoryId,month,trip){
    var store=snapshot&&snapshot.stores&&snapshot.stores[storeId],days=store&&store.salesCounts;
    if(!object(days))return false;
    return Object.keys(days).some(function(date){
      return date.slice(0,7)===month&&hasActual(days[date]&&days[date][categoryId],trip);
    });
  }
  function validate(snapshot){
    if(!object(snapshot))throw new Error('対象便の保存データが不正です。');
    if(snapshot[FIELD]===undefined)return true;
    var list=snapshot[FIELD];
    if(!Array.isArray(list))throw new Error('対象便の手動設定一覧が不正です。');
    var seen=new Set();
    list.forEach(function(row){
      if(!object(row)||typeof row.storeId!=='string'||!row.storeId||
         typeof row.categoryId!=='string'||!row.categoryId||
         !monthValid(row.month)||![1,2,3].includes(row.trip)||
         (row.status!=='active'&&row.status!=='inactive'))
        throw new Error('対象便の手動設定内容が不正です。');
      var key=JSON.stringify([row.storeId,row.categoryId,row.month,row.trip]);
      if(seen.has(key))throw new Error('対象便の手動設定が重複しています。');
      seen.add(key);
    });
    return true;
  }
  function find(snapshot,storeId,categoryId,month,trip){
    if(!snapshot||!Array.isArray(snapshot[FIELD]))return null;
    var row=snapshot[FIELD].find(function(item){
      return item&&item.storeId===storeId&&item.categoryId===categoryId&&item.month===month&&item.trip===trip;
    });
    return row?row.status:null;
  }
  function resolve(snapshot,storeId,categoryId,month,trip,inferred){
    var manual=find(snapshot,storeId,categoryId,month,trip);
    return {status:manual===null?(inferred||'unknown'):manual==='active'?'manual_active':'manual_inactive',
      manual:manual,derived:inferred||'unknown',isManual:manual!==null};
  }
  function assertTarget(snapshot,storeId,categoryId,month,trip,status){
    if(!object(snapshot)||!object(snapshot.stores)||!object(snapshot.stores[storeId]))
      throw new Error('対象の店舗が存在しません。');
    var cats=snapshot.salesCountManagement&&snapshot.salesCountManagement.categories;
    if(!Array.isArray(cats)||!cats.some(function(c){return c&&c.id===categoryId;}))
      throw new Error('対象のカテゴリーが存在しません。');
    if(!monthValid(month)||month>=todayMonth())
      throw new Error('手動設定は終了した過去月のみ指定できます。');
    if(![1,2,3].includes(trip)||!['active','inactive','auto'].includes(status))
      throw new Error('対象便または設定内容が不正です。');
    // Any recorded zero is an actual observation too. Never conceal historical counts.
    if(status==='inactive'&&hasObservedTrip(snapshot,storeId,categoryId,month,trip))
      throw new Error('この便には入力済みの納品数・販売数があります。対象外にはできません。実績を変更せず保持しています。');
  }
  function apply(snapshot,storeId,categoryId,month,trip,status){
    validate(snapshot);
    assertTarget(snapshot,storeId,categoryId,month,trip,status);
    var rows=(snapshot[FIELD]||[]).filter(function(row){
      return !(row.storeId===storeId&&row.categoryId===categoryId&&row.month===month&&row.trip===trip);
    });
    if(status!=='auto')rows.push({storeId:storeId,categoryId:categoryId,month:month,trip:trip,status:status});
    if(rows.length)snapshot[FIELD]=rows;
    else delete snapshot[FIELD];
    validate(snapshot);
    return snapshot;
  }
  function save(snapshot,storeId,categoryId,month,trip,status,storage){
    if(!storage||typeof storage.transaction!=='function')throw new Error('保存機能が利用できません。');
    validate(snapshot);
    assertTarget(snapshot,storeId,categoryId,month,trip,status);
    return storage.transaction(snapshot,function(next){
      apply(next,storeId,categoryId,month,trip,status);
    },function(next){
      validate(next);
    },function(next){
      // Called only after localStorage successfully commits, preserving the same allStores object.
      if(Object.prototype.hasOwnProperty.call(next,FIELD))snapshot[FIELD]=next[FIELD];
      else delete snapshot[FIELD];
    });
  }
  var model={FIELD:FIELD,validate:validate,find:find,resolve:resolve,apply:apply,save:save,
    hasObservedTrip:hasObservedTrip};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightTripOverrides=model;
})(typeof window!=='undefined'?window:globalThis);
