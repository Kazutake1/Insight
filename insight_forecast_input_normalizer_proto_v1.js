/* STEP4 fictional contract prototype: read-only Insight-shape input normalization.
 * Not loaded by Index.html, and not connected to any live prediction engine.
 * Caller supplies all identities and time evidence; this module invents none.
 */
(function(root){
  'use strict';
  var VERSION='fictional-insight-input-v0';
  var SOURCES=['current','manual','inference','observed_day','conflict','invalid','insufficient'];
  var EVENT_TYPES=['sale','campaign','nearby','special','environment','equipment','staff','bulk','other'];
  function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
  function requireValue(ok,code){if(!ok)throw new Error(code);}
  function validDay(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
    var p=s.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
    return d.getUTCFullYear()===p[0]&&d.getUTCMonth()+1===p[1]&&d.getUTCDate()===p[2];
  }
  function strictJst(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(s)||
      !validDay(s.slice(0,10)))return false;
    var d=new Date(s);
    if(!Number.isFinite(d.getTime()))return false;
    var local=new Date(d.getTime()+9*3600000).toISOString().slice(0,19);
    return local===s.slice(0,19);
  }
  function ref(snapshotId,parts){return {snapshot_id:snapshotId,local_locator:parts,source_id:null};}
  function metric(raw,key,snapshotId,parts){
    var val=raw&&raw[key],state=val===null||val===undefined?'missing':
      Number.isSafeInteger(val)&&val>=0?'entered':'invalid';
    return {state:state,value:state==='entered'?val:null,
      reason:state==='invalid'?'non_negative_safe_integer_required':null,
      record_ref:ref(snapshotId,parts.concat([key])),available_at:null};
  }
  function quantityRecord(store,date,category,trip){
    // A missing legacy collection differs from a corrupt collection.
    if(store.salesCounts!==undefined&&!object(store.salesCounts))return {invalid:true};
    var day=object(store.salesCounts)&&store.salesCounts[date];
    if(day!==undefined&&!object(day))return {invalid:true};
    var cat=day&&day[category];
    if(cat!==undefined&&(!object(cat)||!Array.isArray(cat.trips)||cat.trips.length!==3))
      return {invalid:true};
    var raw=cat&&cat.trips[trip-1];
    if(raw!==undefined&&raw!==null&&!object(raw))return {invalid:true};
    return {raw:raw||null,invalid:false};
  }
  function dateWeather(store,date,snapshotId,storeId){
    var month=String(Number(date.slice(5,7)))+'月',year=Number(date.slice(0,4)),day=Number(date.slice(8,10));
    var rows=store.data&&store.data[year]&&store.data[year][month];
    var row=Array.isArray(rows)?rows.find(function(r,i){
      return object(r)&&Number(r.d===undefined?i+1:r.d)===day;
    }):null;
    var label=row&&typeof row.weather==='string'&&row.weather.trim()?row.weather.trim():null;
    function temp(key){
      var v=row&&row[key],state=v===null||v===undefined||
        typeof v==='string'&&!v.trim()?'missing':
        (typeof v==='number'||typeof v==='string')&&Number.isFinite(Number(v))?'entered':'invalid';
      return {state:state,value:state==='entered'?Number(v):null,
        source_record_id:null,issued_at:null,fetched_at:null,available_at:null};
    }
    var max=temp('tempMaxC'),min=temp('tempMinC');
    return {kind:row?'saved_unspecified':'unknown',date:date,
      weather_text:label,code_system:null,weather_code:null,location:null,
      temp_max:max,temp_min:min,
      temperature_pair_state:max.state==='entered'&&min.state==='entered'&&max.value<min.value?
        'reversed':max.state==='entered'&&min.state==='entered'?'valid':'unknown',
      source_record_id:null,issued_at:null,fetched_at:null,available_at:null,
      record_ref:ref(snapshotId,['stores',storeId,'data',String(year),month,String(day)])};
  }
  function normalizedTrip(resolver,snapshot,scope,date,ctx,cache,snapshotId){
    var base=['stores',scope.store_id,'salesCounts',date,scope.category_id,'trips',String(scope.trip-1)];
    var result=null,month=null,issue=null;
    try{
      var opts={today:ctx.today,monthCache:cache};
      var resolved=resolver.resolveDate(snapshot,scope.store_id,scope.category_id,date,opts);
      var candidate=resolved&&Array.isArray(resolved.trips)&&resolved.trips[scope.trip-1];
      if(!candidate||!['active','inactive','unknown'].includes(candidate.status)||
         !SOURCES.includes(candidate.source))throw new Error('unsupported_resolver_state');
      result=candidate;
    }catch(_){issue='resolver_unavailable_or_invalid';}
    // Missing monthly diagnostics must not erase a valid dated decision.
    if(result&&typeof resolver.monthly==='function'){
      try{
        var monthly=resolver.monthly(snapshot,scope.store_id,scope.category_id,date.slice(0,7),{today:ctx.today});
        var rawBasis=monthly&&Array.isArray(monthly.trips)?monthly.trips[scope.trip-1]:null;
        if(!rawBasis||!['active','inactive','unknown'].includes(rawBasis.status)||
           !SOURCES.includes(rawBasis.source))throw new Error('invalid_monthly_basis');
        month=rawBasis;
      }catch(_){issue='monthly_basis_unavailable';}
    }
    if(!result)return {status:'unknown',source:'unavailable',
      tentative:null,needsDateReview:null,conflict:null,monthly_basis:null,
      resolver_version:'insight-trip-history-resolver-v1',issue:issue,
      record_ref:ref(snapshotId,base)};
    return {status:result.status,source:result.source,
      tentative:result.tentative===true,needsDateReview:result.needsDateReview===true,
      conflict:result.conflict===true,
      monthly_basis:month?{status:month.status,source:month.source,
        tentative:month.tentative===true,needsDateReview:month.needsDateReview===true}:null,
      resolver_version:'insight-trip-history-resolver-v1',issue:null,
      record_ref:ref(snapshotId,base)};
  }
  function categoryApplicability(event,snapshot,categoryId){
    if(event.type!=='sale')return 'unknown'; // Non-sale types lack exhaustive category scope.
    var sale=event.snapshot&&event.snapshot.sale;
    if(!object(sale))return 'unknown';
    var cats=snapshot.salesCountManagement&&snapshot.salesCountManagement.categories;
    if(!Array.isArray(cats))return 'unknown';
    var selected=cats.find(function(c){return object(c)&&c.id===categoryId;});
    if(!selected)return 'unknown';
    var targets=Array.isArray(sale.targets)&&sale.targets.length?sale.targets:
      [{categoryId:sale.categoryId,category:sale.category}];
    var matched=[],ambiguous=false;
    targets.forEach(function(t){
      if(!object(t)){ambiguous=true;return;}
      var byId=typeof t.categoryId==='string'?cats.filter(function(c){return c.id===t.categoryId;}):[];
      var byName=typeof t.category==='string'?cats.filter(function(c){
        return c.name===t.category||Array.isArray(c.aliases)&&c.aliases.includes(t.category);
      }):[];
      if(byId.length===1){if(byName.length&&byName.some(function(c){return c.id!==byId[0].id;}))ambiguous=true;
        matched.push(byId[0].id);return;}
      if(byId.length>1||t.categoryId!==undefined){ambiguous=true;return;}
      if(byName.length===1)matched.push(byName[0].id);
      else ambiguous=true;
    });
    return ambiguous?'unknown':matched.includes(categoryId)?'applies':'not_applies';
  }
  function ledgers(snapshot,scope,date,snapshotId){
    var m=snapshot.eventManagement,store=snapshot.stores[scope.store_id];
    return [{kind:'common',items:m&&m.events,path:['eventManagement','events'],present:m!==undefined},
      {kind:'store',items:store.events,path:['stores',scope.store_id,'events'],present:store.events!==undefined}]
      .map(function(ledger){
        var state=!ledger.present?'omitted':Array.isArray(ledger.items)&&
          (ledger.kind!=='common'||object(m)&&m.version===1)?'ok':'invalid';
        var items=[];
        if(state==='ok'){
          ledger.items.forEach(function(e,i){
            if(!object(e)||!validDay(e.startDate)||!validDay(e.endDate)||
              e.startDate>e.endDate||!EVENT_TYPES.includes(e.type)||
              e.scope!==(ledger.kind==='common'?'global':'store')){
              state='invalid';return;
            }
            if(date<e.startDate||date>e.endDate)return;
            items.push({event_type:e.type,applicability:categoryApplicability(e,snapshot,scope.category_id),
              record_ref:{snapshot_id:snapshotId,local_locator:ledger.path.concat([String(i)]),
                source_id:typeof e.id==='string'?e.id:null},
              known_at:null});
          });
        }
        return {ledger:ledger.kind,read_state:state,omission_rule:null,
          coverage:{store_id:scope.store_id,date:date,category_id:scope.category_id,
            absence_scope:'registered_records_only'},
          record_ref:ref(snapshotId,ledger.path),known_at:null,
          records:state==='ok'?items:[]};
      });
  }
  function buildFictionalInput(snapshot,request,context){
    requireValue(object(snapshot)&&object(request)&&object(context),'invalid_arguments');
    requireValue(request.kind==='FICTIONAL'&&request.schema_version===VERSION,'fictional_contract_only');
    var scope=request.scope;
    requireValue(object(scope)&&typeof scope.store_id==='string'&&scope.store_id&&
      typeof scope.category_id==='string'&&scope.category_id&&
      Number.isInteger(scope.trip)&&scope.trip>=1&&scope.trip<=3,'invalid_scope');
    // Align this prototype with the FICTIONAL lab Scope, never real store IDs.
    requireValue(['lab_a','lab_b'].includes(scope.store_id)&&
      ['fictional_rice','fictional_bread'].includes(scope.category_id),'fictional_scope_required');
    var store=object(snapshot.stores)&&snapshot.stores[scope.store_id];
    var cats=snapshot.salesCountManagement&&snapshot.salesCountManagement.categories;
    requireValue(object(store)&&Array.isArray(cats)&&
      cats.some(function(c){return object(c)&&c.id===scope.category_id;}),'unknown_scope');
    requireValue(validDay(request.target_day)&&strictJst(request.issued_at)&&
      typeof request.manual_target==='boolean'&&
      ['current_snapshot','historical_replay'].includes(request.purpose),'invalid_request');
    requireValue(strictJst(context.captured_at)&&validDay(context.today)&&
      ['session_id','request_id','snapshot_id'].every(function(k){return typeof context[k]==='string'&&context[k].length>0;})&&
      Number.isSafeInteger(context.revision)&&context.revision>=0,'invalid_snapshot_identity');
    requireValue(request.purpose==='historical_replay'||
      context.captured_at<=request.issued_at,'snapshot_after_issue');
    requireValue(context.storage&&context.storage.pending===false&&
      context.storage.held===false&&context.storage.conflict===false,'unsafe_storage_state');
    requireValue(context.resolver&&typeof context.resolver.resolveDate==='function','resolver_required');
    requireValue(Array.isArray(request.history_days)&&request.history_days.length<=42&&
      request.history_days.every(validDay)&&
      new Set(request.history_days).size===request.history_days.length&&
      request.history_days.every(function(d){return d<request.target_day;}),'invalid_history_days');
    var cache=new Map();
    var rows=request.history_days.slice().sort().map(function(date){
      var qty=quantityRecord(store,date,scope.category_id,scope.trip);
      var base=['stores',scope.store_id,'salesCounts',date,scope.category_id,'trips',String(scope.trip-1)];
      var saved=qty.invalid?{sales:'invalid',delivery:'invalid'}:qty.raw;
      var sales=metric(saved,'sales',context.snapshot_id,base);
      var delivery=metric(saved,'delivery',context.snapshot_id,base);
      var trip=normalizedTrip(context.resolver,snapshot,scope,date,context,cache,context.snapshot_id);
      var weather=dateWeather(store,date,context.snapshot_id,scope.store_id);
      return {date:date,scope:{store_id:scope.store_id,category_id:scope.category_id,trip:scope.trip},
        iso_weekday:new Date(date+'T12:00:00Z').getUTCDay()||7,
        sales:sales,delivery:delivery,trip_resolution:trip,weather:weather,
        registries:ledgers(snapshot,scope,date,context.snapshot_id),
        holiday:{state:'unknown',version:null,known_at:null},
        // Past-day registered conditions are not evaluated as the day eligibility.
        condition_eligibility:'not_evaluated'};
    });
    return {schema_version:VERSION,adapter_version:VERSION,kind:'FICTIONAL',
      session_id:context.session_id,request_id:context.request_id,purpose:request.purpose,
      scope:{store_id:scope.store_id,category_id:scope.category_id,trip:scope.trip},
      target_day:request.target_day,issued_at:request.issued_at,manual_target:request.manual_target,
      snapshot:{snapshot_id:context.snapshot_id,captured_at:context.captured_at,
        revision:context.revision,pending:false,held:false,conflict:false},
      history:rows,
      // The real Coordinator must validate freshness, including A->B->A, and policies.
      freshness:'not_checked',forecast_status:'not_evaluated',
      model_id:null,policy_id:null};
  }
  var api={VERSION:VERSION,buildFictionalInput:buildFictionalInput};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.InsightForecastInputNormalizerPrototype=api;
})(typeof window!=='undefined'?window:globalThis);
