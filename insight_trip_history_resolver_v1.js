/* Phase 4, step 1: read-only historical trip resolution for dated calculations.
 * No persistence, category mutation, or changes to existing aggregators.
 * Unknown never means inactive; inferred inactive remains distinguishable from manual.
 */
(function(root){
  'use strict';
  if(root.InsightTripHistoryResolver)return;
  var inference=(typeof module!=='undefined'&&module.exports)?
    require('./insight_trip_inference_v1.js'):root.InsightTripInference;
  var overrides=(typeof module!=='undefined'&&module.exports)?
    require('./insight_trip_overrides_v1.js'):root.InsightTripOverrides;

  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function validDate(date){
    if(typeof date!=='string'||!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(date))return false;
    var a=date.split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2]));
    return d.getUTCFullYear()===a[0]&&d.getUTCMonth()===a[1]-1&&d.getUTCDate()===a[2];
  }
  function localToday(){
    var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function context(snapshot,storeId,categoryId){
    var store=snapshot&&snapshot.stores&&snapshot.stores[storeId];
    var categories=snapshot&&snapshot.salesCountManagement&&snapshot.salesCountManagement.categories;
    var category=Array.isArray(categories)&&categories.find(function(c){return object(c)&&c.id===categoryId;});
    if(!object(store)||!category)throw new Error('Unknown store/category.');
    return {store:store,category:category};
  }
  function currentMask(category){
    var active=Array.isArray(category.activeTrips)&&category.activeTrips.length===3?
      category.activeTrips:[true,true,true];
    return active.map(function(v){return v!==false;});
  }
  function monthly(snapshot,storeId,categoryId,month,options){
    options=options||{};
    if(typeof month!=='string'||!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month))
      throw new Error('Invalid historical month.');
    var lookup=context(snapshot,storeId,categoryId),today=options.today||localToday();
    if(!validDate(today))throw new Error('Invalid today.');
    if(month>=today.slice(0,7)){
      return {month:month,completed:false,invalidRecordDays:0,trips:currentMask(lookup.category).map(function(active,i){
        return {trip:i+1,status:active?'active':'inactive',source:'current',tentative:false,needsDateReview:false};
      })};
    }
    if(!inference||!overrides)throw new Error('Historical trip dependencies are unavailable.');
    var report=inference.inferMonth(snapshot,storeId,categoryId,month,{today:today});
    return {month:month,completed:true,invalidRecordDays:report.invalidRecordDays,
      trips:report.trips.map(function(trip){
        var effective=overrides.effective(snapshot,storeId,categoryId,month,trip.trip,trip.status);
        if(effective.mode==='conflict')return {trip:trip.trip,status:'unknown',source:'conflict',
          tentative:false,needsDateReview:true};
        if(effective.mode==='manual')return {trip:trip.trip,
          status:effective.manual==='active'?'active':'inactive',source:'manual',tentative:false,needsDateReview:false};
        if(report.invalidRecordDays)return {trip:trip.trip,status:'unknown',source:'invalid',
          tentative:false,needsDateReview:true};
        if(trip.status==='inferred_inactive')return {trip:trip.trip,status:'inactive',
          source:'inference',tentative:true,needsDateReview:false};
        if(trip.status==='observed_active')return {trip:trip.trip,
          status:trip.needsDateReview?'unknown':'active',source:'inference',
          tentative:false,needsDateReview:trip.needsDateReview};
        return {trip:trip.trip,status:'unknown',source:'insufficient',
          tentative:false,needsDateReview:false};
      })};
  }
  function dateRecord(snapshot,storeId,categoryId,date){
    var store=snapshot.stores[storeId],saved=store.salesCounts&&store.salesCounts[date];
    return saved&&object(saved)?saved[categoryId]:null;
  }
  function entered(record,index){
    var trip=record&&Array.isArray(record.trips)?record.trips[index]:null;
    return object(trip)&&['delivery','sales'].some(function(key){
      var value=trip[key];
      return Number.isSafeInteger(value)&&value>=0;
    });
  }
  function resolveDate(snapshot,storeId,categoryId,date,options){
    if(!validDate(date))throw new Error('Invalid date.');
    var month=date.slice(0,7),cache=options&&options.monthCache,cacheKey=storeId+'\u0000'+categoryId+'\u0000'+month;
    var report=cache&&cache.get(cacheKey);
    if(!report){report=monthly(snapshot,storeId,categoryId,month,options);if(cache)cache.set(cacheKey,report);}
    var record=dateRecord(snapshot,storeId,categoryId,date);
    var trips=report.trips.map(function(t,i){
      var result={trip:i+1,status:t.status,source:t.source,tentative:t.tentative,needsDateReview:t.needsDateReview};
      // Never suppress a saved day value, including zero, even when an older
      // monthly inference or manual override conflicts with that value.
      if(entered(record,i)&&result.status!=='active'){
        result.status='active';result.source='observed_day';
        result.conflict=t.status==='inactive'||t.source==='conflict';
      }
      return result;
    });
    return {date:date,month:month,trips:trips,
      mask:trips.map(function(t){return t.status==='active'?true:t.status==='inactive'?false:null;}),
      needsReview:trips.some(function(t){return t.status==='unknown'||t.needsDateReview||t.conflict;}),
      includesEstimate:trips.some(function(t){return t.tentative;})};
  }
  function safeCount(value){return Number.isSafeInteger(value)&&value>=0;}
  function averageByDate(snapshot,storeId,categoryId,rows,key,options){
    if(key!=='delivery'&&key!=='sales')throw new Error('Invalid metric.');
    if(!Array.isArray(rows))throw new Error('Rows must be an array.');
    var cache=new Map(),opts=Object.assign({},options,{monthCache:cache}),tripSums=[0,0,0],tripDays=[0,0,0];
    var sum=0,totalDays=0,unverifiedDates=[],estimatedDates=[];
    rows.forEach(function(row){
      if(!row||!validDate(row.date))throw new Error('Invalid dated record.');
      var decision=resolveDate(snapshot,storeId,categoryId,row.date,opts);
      var trips=row.record&&Array.isArray(row.record.trips)?row.record.trips:[];
      var active=0,complete=true,dayTotal=0;
      decision.mask.forEach(function(status,i){
        if(status===null){complete=false;return;}
        if(status===false)return;
        active++;
        var val=trips[i]&&trips[i][key];
        if(!safeCount(val)){complete=false;return;}
        tripSums[i]+=val;tripDays[i]++;dayTotal+=val;
      });
      if(active>0&&complete){sum+=dayTotal;totalDays++;}
      else unverifiedDates.push(row.date);
      if(decision.includesEstimate)estimatedDates.push(row.date);
    });
    return {trips:tripSums.map(function(sum,i){return tripDays[i]?sum/tripDays[i]:null;}),
      total:totalDays?sum/totalDays:null,
      tripDays:tripDays,totalDays:totalDays,
      unverifiedDates:unverifiedDates,estimatedDates:estimatedDates};
  }
  var api={monthly:monthly,resolveDate:resolveDate,averageByDate:averageByDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.InsightTripHistoryResolver=api;
})(typeof window!=='undefined'?window:globalThis);
