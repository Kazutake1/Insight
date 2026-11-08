/* Insight privacy boundary v1 — deliberately NOT loaded by the production shell.
 * Local-only, schema-allowlisted projection; never read storage or send requests.
 * Aliases reduce casual disclosure but DO NOT guarantee anonymity.
 */
(function(root){
  'use strict';
  const SCHEMA='insight-local-ai-slice-v1';
  const WEATHER=new Set(['clear','partly_cloudy','cloudy','light_rain','rain','heavy_rain','sleet','snow','heavy_snow','unknown']);
  const CONDITION=new Set(['present','absent','unknown']);
  const METRIC=new Set(['entered','missing','invalid','unknown']);
  function fail(){throw new Error('invalid_local_ai_projection');}
  function plain(v){
    return !!v&&typeof v==='object'&&!Array.isArray(v)&&
      (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
  }
  function own(obj,key){return Object.prototype.hasOwnProperty.call(obj,key);}
  function value(obj,key){
    if(!plain(obj))fail();
    const desc=Object.getOwnPropertyDescriptor(obj,key);
    if(!desc||!own(desc,'value'))fail();
    return desc.value;
  }
  function day(v){
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail();
    const d=new Date(v+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail();
    return d;
  }
  function metric(input,optional){
    if((input===undefined||input===null)&&optional)return {state:'unknown',value:null};
    if(!plain(input))fail();
    const state=value(input,'state'),amount=value(input,'value');
    if(!METRIC.has(state))fail();
    if(state==='entered'){
      if(!Number.isSafeInteger(amount)||amount<0)fail();
      return {state,value:amount};
    }
    if(amount!==null)fail();
    return {state,value:null};
  }
  function temperature(input){
    if(input===undefined||input===null)return {state:'unknown',value:null};
    if(!plain(input))fail();
    const state=value(input,'state'),amount=value(input,'value');
    if(!METRIC.has(state))fail();
    if(state==='entered'){
      if(typeof amount!=='number'||!Number.isFinite(amount)||amount< -100||amount>100)fail();
      return {state,value:amount};
    }
    if(amount!==null)fail();
    return {state,value:null};
  }
  function condition(input){
    if(input===undefined||input===null)return 'unknown';
    if(!CONDITION.has(input))fail();
    return input;
  }
  function freeze(v){
    if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}
    return v;
  }
  function projectForLocalAI(input){
    if(!plain(input)||!plain(value(input,'scope')))fail();
    const scope=value(input,'scope'),store=value(scope,'store_id'),
      category=value(scope,'category_id'),trip=value(scope,'trip');
    if(typeof store!=='string'||!store.trim()||typeof category!=='string'||!category.trim()||
      !Number.isInteger(trip)||trip<1||trip>3)fail();
    const history=value(input,'history');
    if(!Array.isArray(history)||history.length<1||history.length>42)fail();
    const rows=[];let last='';
    for(const item of history){
      if(!plain(item))fail();
      const iso=value(item,'date'),d=day(iso);
      if(last&&iso<=last)fail();
      last=iso;
      const sales=metric(value(item,'sales')),delivery=metric(value(item,'delivery'));
      const customers=metric(own(item,'customers')?value(item,'customers'):undefined,true);
      const tempMax=temperature(own(item,'temp_max')?value(item,'temp_max'):undefined);
      const tempMin=temperature(own(item,'temp_min')?value(item,'temp_min'):undefined);
      const code=own(item,'weather_kind')?value(item,'weather_kind'):'unknown';
      if(!WEATHER.has(code))fail();
      const holiday=condition(own(item,'holiday')?value(item,'holiday'):undefined);
      const sale=condition(own(item,'sale')?value(item,'sale'):undefined);
      const event=condition(own(item,'event')?value(item,'event'):undefined);
      // We intentionally omit exact dates, IDs, store names, free text, raw paths,
      // snapshot identifiers, arbitrary metadata and timestamps.
      rows.push({
        index:rows.length,weekday:d.getUTCDay()||7,month:d.getUTCMonth()+1,
        sales,delivery,customers,temp_max:tempMax,temp_min:tempMin,
        weather_kind:code,holiday,sale,event
      });
    }
    return freeze({
      schema:SCHEMA,processing:'LOCAL_ONLY',anonymity:'NOT_GUARANTEED',
      scope:{store_alias:'store_1',category_alias:'category_1',trip},
      rows
    });
  }
  const api=Object.freeze({SCHEMA,projectForLocalAI});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.InsightLocalAIPrivacy=api;
})(typeof window!=='undefined'?window:globalThis);
