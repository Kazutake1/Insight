/* Read-only historical trip inference. Never writes to Insight's persisted data. */
(function(root){
  'use strict';
  if(root.InsightTripInference)return;
  var DEFAULT_MIN_EVIDENCE_DAYS=7;
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function count(v){return Number.isSafeInteger(v)&&v>=0;}
  function validMonth(value){return typeof value==='string'&&/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value);}
  function validDate(value){
    if(typeof value!=='string'||!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value))return false;
    var parts=value.split('-').map(Number),d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    return d.getUTCFullYear()===parts[0]&&d.getUTCMonth()===parts[1]-1&&d.getUTCDate()===parts[2];
  }
  function settings(options){
    options=options||{};
    var days=options.minEvidenceDays===undefined?DEFAULT_MIN_EVIDENCE_DAYS:options.minEvidenceDays;
    if(!Number.isSafeInteger(days)||days<1||days>31)throw new RangeError('Minimum evidence days must be 1 to 31.');
    var now=options.today;
    if(now===undefined){
      var d=new Date();
      now=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    }
    if(!validDate(now))throw new TypeError('A valid local today (YYYY-MM-DD) is required.');
    return {minEvidenceDays:days,today:now};
  }
  function recordsFor(snapshot,storeId,categoryId){
    if(!object(snapshot)||!object(snapshot.stores)||!object(snapshot.stores[storeId]))throw new TypeError('Unknown store.');
    if(typeof categoryId!=='string'||!categoryId)throw new TypeError('Category ID is required.');
    var data=snapshot.stores[storeId].salesCounts;
    if(data===undefined)return {};
    if(!object(data))throw new TypeError('Invalid sales-count records.');
    return data;
  }
  function inferMonth(snapshot,storeId,categoryId,month,options){
    if(!validMonth(month))throw new TypeError('Month must be YYYY-MM.');
    var policy=settings(options),records=recordsFor(snapshot,storeId,categoryId);
    var observed=[new Set(),new Set(),new Set()],delivery=[new Set(),new Set(),new Set()],sales=[new Set(),new Set(),new Set()];
    var dates=new Set(),invalid=0;
    Object.keys(records).forEach(function(date){
      if(date.slice(0,7)!==month||!validDate(date))return;
      var day=records[date];
      if(!object(day)||!Object.prototype.hasOwnProperty.call(day,categoryId))return;
      var record=day[categoryId];dates.add(date);
      if(!object(record)||!Array.isArray(record.trips)||record.trips.length!==3){invalid++;return;}
      var corrupt=false;
      record.trips.forEach(function(t,i){
        if(!object(t)){corrupt=true;return;}
        ['delivery','sales'].forEach(function(key){
          var value=t[key];
          if(value===undefined||value===null)return;
          if(!count(value)){corrupt=true;return;}
          observed[i].add(date);
          (key==='delivery'?delivery:sales)[i].add(date);
        });
      });
      if(corrupt)invalid++;
    });
    var monthCompleted=month<policy.today.slice(0,7);
    return {
      storeId:storeId,categoryId:categoryId,month:month,monthCompleted:monthCompleted,
      minEvidenceDays:policy.minEvidenceDays,recordDays:dates.size,invalidRecordDays:invalid,
      trips:observed.map(function(days,i){
        var other=new Set();
        observed.forEach(function(dates,j){if(i!==j)dates.forEach(function(date){other.add(date);});});
        var status=days.size?'observed_active':
          monthCompleted&&invalid===0&&other.size>=policy.minEvidenceDays?'inferred_inactive':'unknown';
        return {trip:i+1,status:status,observedDays:days.size,deliveryDays:delivery[i].size,
          salesDays:sales[i].size,otherTripObservedDays:other.size,
          // An observed trip may have started/stopped midmonth; this is NOT a dated trip history.
          needsDateReview:status==='observed_active'&&other.size>days.size};
      })
    };
  }
  function inferAvailableMonths(snapshot,storeId,categoryId,options){
    var data=recordsFor(snapshot,storeId,categoryId),months=new Set();
    Object.keys(data).forEach(function(date){
      if(validDate(date)&&object(data[date])&&Object.prototype.hasOwnProperty.call(data[date],categoryId))
        months.add(date.slice(0,7));
    });
    return Array.from(months).sort().map(function(month){return inferMonth(snapshot,storeId,categoryId,month,options);});
  }
  var api={inferMonth:inferMonth,inferAvailableMonths:inferAvailableMonths,
    DEFAULT_MIN_EVIDENCE_DAYS:DEFAULT_MIN_EVIDENCE_DAYS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.InsightTripInference=api;
})(typeof window!=='undefined'?window:globalThis);
