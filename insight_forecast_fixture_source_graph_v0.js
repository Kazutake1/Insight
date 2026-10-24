'use strict';
/*
 * STEP4 fictional source-graph screening contract. Test-only, not imported by
 * Insight production, not an authorization/provenance attestation.
 * No Storage, UI, model, network, logging, or source-value export.
 */
const STORES=['lab_a','lab_b'],CATEGORIES=['fictional_rice','fictional_bread'];
const AREAS=['fictional_area_a','fictional_area_b'],SITES=['lab_site_a','lab_site_b'];
const SOURCE_ROLES=[
  'target_trip','target_calendar','common_registry','store_registry',
  'promotional_sale_absence','event_absence','historical_sales',
  'historical_context','condition_policy','model_policy','fallback_policy',
  'area_mapping','weather_site_mapping','weather_report','weather_policy'
];
const DERIVED={
  registered_candidate:['target_calendar_binding','common_registry_binding',
    'store_registry_binding','condition_policy_binding'],
  numeric_target_context:['target_trip_binding','target_calendar_binding',
    'promotional_sale_absence_binding','event_absence_binding'],
  history_row:['historical_sales_binding','historical_context_binding'],
  weather_gate:['weather_report_binding','weather_site_mapping_binding',
    'weather_policy_binding'],
  model_gate:['numeric_target_context','model_policy_binding','fallback_policy_binding']
};
const KINDS=['source','binding','derived'];
const ID=/^[a-z][a-z0-9_-]{0,63}$/;
const timesByRole={
  historical_sales:['available_at'],
  weather_report:['published_at','received_at']
};
const sourceKinds={
  target_trip:'fixture_record',target_calendar:'fixture_calendar',
  common_registry:'fixture_registry',store_registry:'fixture_registry',
  promotional_sale_absence:'independent_check',event_absence:'independent_check',
  historical_sales:'fixture_record',historical_context:'fixture_record',
  condition_policy:'fixture_policy',model_policy:'fixture_policy',
  fallback_policy:'fixture_policy',weather_policy:'fixture_policy',
  area_mapping:'fixture_mapping',weather_site_mapping:'fixture_mapping',
  weather_report:'fixture_report'
};
function fail(){throw new Error('fictional_graph_contract_invalid');}
function keys(obj,expected){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
      Object.keys(obj).length!==expected.length||
      expected.some(k=>!Object.hasOwn(obj,k)))fail();
}
function identifier(v){return typeof v==='string'&&ID.test(v);}
function day(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function jst(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(v)||
      !day(v.slice(0,10)))return false;
  const d=new Date(v);
  return Number.isFinite(d.getTime())&&
    new Date(d.getTime()+9*3600000).toISOString().slice(0,19)===v.slice(0,19);
}
function safeInput(v){
  let count=0;const seen=new Set();
  function visit(x,depth){
    if(++count>12000||depth>32)fail();
    if(x===null||typeof x==='string'||typeof x==='boolean')return;
    if(typeof x==='number'){
      if(!Number.isSafeInteger(x)||Object.is(x,-0))fail();
      return;
    }
    if(typeof x!=='object'||seen.has(x))fail();
    const array=Array.isArray(x),proto=Object.getPrototypeOf(x);
    if(array?proto!==Array.prototype:(proto!==Object.prototype&&proto!==null))fail();
    seen.add(x);
    const desc=Object.getOwnPropertyDescriptors(x),own=Reflect.ownKeys(desc);
    if(own.some(k=>typeof k!=='string'||['__proto__','prototype','constructor','toJSON'].includes(k)))fail();
    if(array){
      if(x.length>256||own.length!==x.length+1)fail();
      for(let i=0;i<x.length;i++)if(!Object.hasOwn(desc,String(i)))fail();
    }
    for(const k of own){
      if(k==='length'&&array)continue;
      if(!desc[k].enumerable||!Object.hasOwn(desc[k],'value'))fail();
      visit(desc[k].value,depth+1);
    }
    seen.delete(x);
  }
  visit(v,0);
  return JSON.parse(JSON.stringify(v));
}
function tag(v,kind){
  keys(v,['state','value']);
  if(v.state==='unknown'&&v.value===null)return false;
  if(v.state!=='known'||!(kind==='time'?jst(v.value):identifier(v.value)))fail();
  return true;
}
function knownBefore(v,cutoff){return v.state==='known'&&Date.parse(v.value)<=cutoff;}
function scope(s){
  keys(s,['store_id','category_id','trip']);
  if(!STORES.includes(s.store_id)||!CATEGORIES.includes(s.category_id)||
      !Number.isInteger(s.trip)||s.trip<1||s.trip>3)fail();
}
function dim(x,kind){
  keys(x,['mode','value']);
  if(x.mode==='all'&&x.value===null)return;
  if(x.mode==='unknown'&&x.value===null)return;
  const allowed=kind==='store'?STORES:kind==='category'?CATEGORIES:
    kind==='trip'?[1,2,3]:kind==='area'?AREAS:SITES;
  if(x.mode!=='exact'||!allowed.includes(x.value))fail();
}
function coverage(c){
  keys(c,['store','category','trip','area','site','start_day','end_day']);
  for(const k of ['store','category','trip','area','site'])dim(c[k],k);
  if(c.start_day===null&&c.end_day===null)return false;
  if(!day(c.start_day)||!day(c.end_day)||c.start_day>c.end_day)fail();
  return true;
}
function covers(c,anchor,atDay){
  const req={store:anchor.scope.store_id,category:anchor.scope.category_id,
    trip:anchor.scope.trip};
  let unknown=false;
  // Every known dimension and the known date interval must be checked:
  // an earlier unknown must never hide a known scope/date mismatch.
  for(const k of Object.keys(req)){
    if(c[k].mode==='unknown')unknown=true;
    else if(c[k].mode==='exact'&&c[k].value!==req[k])return 'mismatch';
  }
  if(c.start_day===null)unknown=true;
  else if(atDay<c.start_day||atDay>c.end_day)return 'mismatch';
  return unknown?'unknown':'ok';
}
function fact(role,f){
  if(role==='target_trip'){
    keys(f,['status','source','tentative','conflict','needs_date_review']);
    if(!['active','inactive','unknown'].includes(f.status)||
       !['manual','current','inference','observed_day','insufficient','conflict'].includes(f.source)||
       [f.tentative,f.conflict,f.needs_date_review].some(v=>typeof v!=='boolean'))fail();
  }else if(role==='target_calendar'){
    keys(f,['status']);if(!['non_holiday','holiday','unknown'].includes(f.status))fail();
  }else if(role==='common_registry'||role==='store_registry'){
    keys(f,['presence']);if(!['absent','present','unknown'].includes(f.presence))fail();
  }else if(role==='promotional_sale_absence'||role==='event_absence'){
    keys(f,['status','method']);
    if(!['confirmed_absent','confirmed_present','unknown'].includes(f.status)||
      !['independent','registered_only','unknown'].includes(f.method)||
      (f.status==='confirmed_absent'&&f.method!=='independent'))fail();
  }else if(role==='historical_sales'){
    keys(f,['day','entered','count']);
    if(!day(f.day)||typeof f.entered!=='boolean'||
      (f.entered?(!Number.isSafeInteger(f.count)||f.count<0):f.count!==null))fail();
  }else if(role==='historical_context'){
    keys(f,['day','active','holiday','event','origin']);
    if(!day(f.day)||![true,false,null].includes(f.active)||
      ![true,false,null].includes(f.holiday)||
      ![true,false,null].includes(f.event)||
      !['independent','registered_only','unknown'].includes(f.origin))fail();
  }else if(role==='condition_policy'){
    keys(f,['id']);if(f.id!=='registered_conditions_only')fail();
  }else if(role==='model_policy'){
    keys(f,['selection','minimum_samples']);
    if(!['unselected','fictional_baseline'].includes(f.selection)||
      !Number.isSafeInteger(f.minimum_samples)||f.minimum_samples<1||f.minimum_samples>6)fail();
  }else if(role==='fallback_policy'){
    keys(f,['selection']);if(!['disabled','fictional_baseline_only'].includes(f.selection))fail();
  }else if(role==='weather_policy'){
    keys(f,['max_age_seconds']);
    if(!Number.isSafeInteger(f.max_age_seconds)||f.max_age_seconds<1||f.max_age_seconds>604800)fail();
  }else if(role==='area_mapping'){
    keys(f,['store_id','area']);
    if(!STORES.includes(f.store_id)||!AREAS.includes(f.area))fail();
  }else if(role==='weather_site_mapping'){
    keys(f,['store_id','site']);
    if(!STORES.includes(f.store_id)||!SITES.includes(f.site))fail();
  }else if(role==='weather_report'){
    keys(f,['day','site','report_id','source_kind','classification_version','unit']);
    if(!day(f.day)||!SITES.includes(f.site)||!identifier(f.report_id)||
      f.source_kind!=='forecast'||!identifier(f.classification_version)||
      f.unit!=='celsius')fail();
  }else fail();
}
function checkSource(n,anchor){
  keys(n,['kind','ref','role','snapshot_id','source_kind','read_state',
    'coverage','source_version','times','fact']);
  if(!SOURCE_ROLES.includes(n.role)||n.source_kind!==sourceKinds[n.role]||
    !['ok','unavailable','unknown','conflict'].includes(n.read_state))fail();
  coverage(n.coverage);
  if(n.role==='target_calendar'&&n.coverage.area.mode==='all')fail();
  if(n.role==='weather_report'&&n.coverage.site.mode==='all')fail();
  tag(n.source_version,'version');
  const ts=timesByRole[n.role]||['known_at'];
  keys(n.times,ts);
  for(const t of ts)tag(n.times[t],'time');
  fact(n.role,n.fact);
  if(n.role==='weather_report'&&n.times.published_at.state==='known'&&
      n.times.received_at.state==='known'&&
      Date.parse(n.times.published_at.value)>Date.parse(n.times.received_at.value))fail();
}
function checkBinding(n,anchor){
  keys(n,['kind','ref','role','snapshot_id','source_ref','mapping_refs',
    'applied_scope','applied_day','rule_id','rule_version','known_at']);
  if(!SOURCE_ROLES.some(r=>r+'_binding'===n.role)||!identifier(n.source_ref)||
    !Array.isArray(n.mapping_refs)||n.mapping_refs.length>2||
    n.mapping_refs.some(v=>!identifier(v))||!identifier(n.rule_id))fail();
  tag(n.rule_version,'version');tag(n.known_at,'time');
  scope(n.applied_scope);
  if(n.applied_scope.store_id!==anchor.scope.store_id||
    n.applied_scope.category_id!==anchor.scope.category_id||
    n.applied_scope.trip!==anchor.scope.trip||!day(n.applied_day))fail();
}
function checkDerived(n){
  keys(n,['kind','ref','role','snapshot_id','dependencies','day',
    'rule_id','rule_version','effective_at']);
  if(!Object.hasOwn(DERIVED,n.role)||!identifier(n.rule_id)||
    !Array.isArray(n.dependencies)||n.dependencies.length>7||
    !day(n.day))fail();
  tag(n.rule_version,'version');tag(n.effective_at,'time');
}
function structural(input){
  keys(input,['kind','schema_version','anchor','nodes','roots']);
  if(input.kind!=='FICTIONAL'||input.schema_version!=='fictional-source-graph-v0')fail();
  const a=input.anchor;
  keys(a,['session_id','request_id','snapshot_id','ui_epoch','scope','target_day',
    'manual_target','purpose','issued_at','captured_at','storage_revision',
    'raw_live_state','adapter_version','normalizer_version','graph_rule_version']);
  if(![a.session_id,a.request_id,a.snapshot_id].every(identifier)||
    !Number.isSafeInteger(a.ui_epoch)||a.ui_epoch<0||
    !day(a.target_day)||typeof a.manual_target!=='boolean'||
    !['current_snapshot','historical_replay'].includes(a.purpose)||
    !jst(a.issued_at)||!jst(a.captured_at)||
    (a.purpose==='current_snapshot'&&Date.parse(a.captured_at)>Date.parse(a.issued_at))||
    !Number.isSafeInteger(a.storage_revision)||a.storage_revision<0||
    !['fictional_matched','unknown','conflict'].includes(a.raw_live_state))fail();
  scope(a.scope);
  for(const k of ['adapter_version','normalizer_version','graph_rule_version'])tag(a[k],'version');
  if(!Array.isArray(input.nodes)||input.nodes.length<1||input.nodes.length>120)fail();
  const byRef=new Map();
  for(const n of input.nodes){
    if(!n||!KINDS.includes(n.kind)||!identifier(n.ref)||
      n.snapshot_id!==a.snapshot_id||byRef.has(n.ref))fail();
    if(n.kind==='source')checkSource(n,a);
    else if(n.kind==='binding')checkBinding(n,a);
    else checkDerived(n);
    byRef.set(n.ref,n);
  }
  keys(input.roots,['candidate','target','history','model','weather']);
  if(![input.roots.candidate,input.roots.target,input.roots.model].every(identifier)||
    !(input.roots.weather===null||identifier(input.roots.weather))||
    !Array.isArray(input.roots.history)||input.roots.history.length>10||
    input.roots.history.some(v=>!identifier(v))||
    new Set(input.roots.history).size!==input.roots.history.length)fail();
  const rootRoles=[['candidate','registered_candidate'],['target','numeric_target_context'],
    ['model','model_gate'],['weather','weather_gate']];
  for(const [r,role] of rootRoles){
    const id=input.roots[r];if(id!==null&&byRef.get(id)?.role!==role)fail();
  }
  const historyDays=new Set();
  for(const ref of input.roots.history){
    const row=byRef.get(ref);
    if(row?.role!=='history_row'||historyDays.has(row.day))fail();
    // The anchor already fixes one store/category/trip. A second history
    // root with the same day is a duplicate sale, regardless of its ref.
    historyDays.add(row.day);
  }
  const get=(id)=>{const node=byRef.get(id);if(!node)fail();return node;};
  const edges=new Map();
  for(const n of input.nodes){
    let deps=[];
    if(n.kind==='binding'){
      const s=get(n.source_ref);
      if(s.kind!=='source'||s.role+'_binding'!==n.role)fail();
      deps=[n.source_ref,...n.mapping_refs];
      const wanted=n.role==='target_calendar_binding'?'area_mapping':
        n.role==='weather_report_binding'?'weather_site_mapping':null;
      if((wanted===null&&n.mapping_refs.length!==0)||
         (wanted!==null&&(n.mapping_refs.length!==1||
           get(n.mapping_refs[0]).role!==wanted||
           get(n.mapping_refs[0]).kind!=='source')))fail();
      const cd=covers(s.coverage,a,n.applied_day);
      if(cd==='mismatch')fail();
      if(['historical_sales','historical_context','weather_report'].includes(s.role)){
        if(s.fact.day!==n.applied_day)fail();
      }else if(n.applied_day!==a.target_day)fail();
      if(s.role==='target_calendar'){
        const mapper=get(n.mapping_refs[0]);
        if(mapper.fact.store_id!==a.scope.store_id)fail();
        if(s.coverage.area.mode==='exact'&&s.coverage.area.value!==mapper.fact.area)fail();
      }
      if(s.role==='weather_report'){
        const mapper=get(n.mapping_refs[0]);
        if(mapper.fact.store_id!==a.scope.store_id||s.fact.site!==mapper.fact.site)fail();
        if(s.coverage.site.mode==='exact'&&s.coverage.site.value!==mapper.fact.site)fail();
      }
      for(const dep of n.mapping_refs)if(get(dep).snapshot_id!==a.snapshot_id)fail();
    }else if(n.kind==='derived'){
      deps=n.dependencies;
      if(new Set(deps).size!==deps.length)fail();
      const expected=DERIVED[n.role];
      const actual=deps.map(id=>get(id).role).sort();
      const required=expected.slice().sort();
      // A model may additionally depend on the weather gate when explicitly selected.
      if(n.role==='model_gate'&&actual.includes('weather_gate')){
        const i=actual.indexOf('weather_gate');actual.splice(i,1);
      }
      if(actual.length!==required.length||actual.some((v,i)=>v!==required[i]))fail();
      if(n.role==='history_row'){
        const sale=get(deps.find(id=>get(id).role==='historical_sales_binding'));
        const context=get(deps.find(id=>get(id).role==='historical_context_binding'));
        if(sale.applied_day!==n.day||context.applied_day!==n.day)fail();
      }else if(n.day!==a.target_day)fail();
    }
    edges.set(n.ref,deps);
  }
  const seen=new Set(),active=new Set();
  function visit(ref,depth){
    if(depth>120||active.has(ref))fail();
    if(seen.has(ref))return;
    active.add(ref);
    for(const d of edges.get(ref))visit(d,depth+1);
    active.delete(ref);seen.add(ref);
  }
  for(const ref of byRef.keys())visit(ref,0);
  return {a,byRef};
}
function evaluate(input){
  const refused=reason=>Object.freeze({
    status:'REJECT',reason,target_status:'HELD',candidate_status:'undetermined',
    history_eligible:0,history_zero:0,history_excluded:0,weather_status:'NOT_EVALUATED',
    model_status:'DISABLED',authorized_for_model:false,provenance_verified:false
  });
  try{
    const copied=safeInput(input);
    const {a,byRef}=structural(copied);
    const cutoff=Date.parse(a.purpose==='current_snapshot'?a.captured_at:a.issued_at);
    const usable=(ref,visited=new Set())=>{
      if(visited.has(ref))return false;
      visited.add(ref);
      const n=byRef.get(ref);
      if(n.kind==='source'){
        if(n.read_state!=='ok'||n.source_version.state!=='known')return false;
        const at=covers(n.coverage,a,
          n.role==='historical_sales'||n.role==='historical_context'?n.fact.day:
          n.role==='weather_report'?n.fact.day:a.target_day);
        if(at!=='ok'||
          (n.role==='target_calendar'&&n.coverage.area.mode==='unknown')||
          (n.role==='weather_report'&&n.coverage.site.mode==='unknown'))return false;
        return Object.values(n.times).every(t=>knownBefore(t,cutoff));
      }
      if(n.kind==='binding'){
        if(!knownBefore(n.known_at,cutoff)||n.rule_version.state!=='known')return false;
        return [n.source_ref,...n.mapping_refs].every(v=>usable(v,new Set(visited)));
      }
      if(n.rule_version.state!=='known'||!knownBefore(n.effective_at,cutoff))return false;
      return n.dependencies.every(v=>usable(v,new Set(visited)));
    };
    const node=(ref)=>byRef.get(ref);
    const derived=(ref)=>node(ref);
    const child=(parent,role)=>node(parent.dependencies.find(v=>node(v).role===role));
    const factFor=(binding)=>node(binding.source_ref).fact;
    const f=(root,role)=>factFor(child(derived(root),role));
    const roots=copied.roots;
    const cr=derived(roots.candidate);
    let candidate='undetermined';
    if(usable(cr.ref)){
      const calendar=f(cr.ref,'target_calendar_binding');
      const common=f(cr.ref,'common_registry_binding');
      const store=f(cr.ref,'store_registry_binding');
      const policy=f(cr.ref,'condition_policy_binding');
      if(calendar.status==='non_holiday'&&common.presence==='absent'&&
          store.presence==='absent'&&policy.id==='registered_conditions_only')
        candidate='candidate';
      else if(calendar.status==='holiday'||common.presence==='present'||store.presence==='present')
        candidate='not_candidate';
    }else if(a.purpose==='current_snapshot'){
      // Current registered-only candidate can have unknown registry known_at.
      const refs=cr.dependencies.map(node),registryRefs=refs.filter(n=>
        ['common_registry_binding','store_registry_binding'].includes(n.role));
      // The legacy CURRENT candidate allows unknown registry known_at ONLY.
      // Rule/version, issue cutoff, binding and complete coverage are still
      // mandatory; each registry is checked independently so one may be known.
      const canSkip=cr.rule_version.state==='known'&&
        knownBefore(cr.effective_at,cutoff)&&registryRefs.length===2&&
        registryRefs.every(b=>{
          const s=node(b.source_ref);
          const state=covers(s.coverage,a,b.applied_day);
          return state==='ok'&&s.read_state==='ok'&&
            s.source_version.state==='known'&&
            b.rule_version.state==='known'&&knownBefore(b.known_at,cutoff)&&
            (s.times.known_at.state==='unknown'||
              knownBefore(s.times.known_at,cutoff));
        })&&refs.filter(n=>!registryRefs.includes(n)).every(n=>usable(n.ref));
      if(canSkip){
        const cal=f(cr.ref,'target_calendar_binding');
        const common=f(cr.ref,'common_registry_binding');
        const store=f(cr.ref,'store_registry_binding');
        if(cal.status==='non_holiday'&&common.presence==='absent'&&store.presence==='absent')
          candidate='candidate';
      }
    }
    const target=derived(roots.target);
    const trip=f(target.ref,'target_trip_binding');
    const cal=f(target.ref,'target_calendar_binding');
    const sale=f(target.ref,'promotional_sale_absence_binding');
    const event=f(target.ref,'event_absence_binding');
    const absenceDistinct=child(target,'promotional_sale_absence_binding').source_ref!==
      child(target,'event_absence_binding').source_ref;
    const targetReady=usable(target.ref)&&absenceDistinct&&
      trip.status==='active'&&!trip.tentative&&!trip.conflict&&!trip.needs_date_review&&
      cal.status==='non_holiday'&&
      sale.status==='confirmed_absent'&&sale.method==='independent'&&
      event.status==='confirmed_absent'&&event.method==='independent';
    let eligible=0,zeros=0,excluded=0;
    for(const ref of roots.history){
      const row=node(ref);
      const saleNode=child(row,'historical_sales_binding');
      const contextNode=child(row,'historical_context_binding');
      const sf=factFor(saleNode),cf=factFor(contextNode);
      if(sf.day!==cf.day||sf.day!==row.day||row.day>=a.target_day)fail();
      const saleTime=node(saleNode.source_ref).times.available_at;
      const availableDayOk=saleTime.state==='known'&&
        Date.parse(saleTime.value)>=Date.parse(sf.day+'T00:00:00+09:00');
      if(usable(ref)&&availableDayOk&&sf.entered===true&&
          cf.active===true&&cf.holiday===false&&cf.event===false&&
          cf.origin==='independent'&&row.day<a.issued_at.slice(0,10)){
        eligible++;if(sf.count===0)zeros++;
      }else excluded++;
    }
    let weatherStatus='NOT_SELECTED';
    if(roots.weather!==null){
      const w=derived(roots.weather);
      const wbind=child(w,'weather_report_binding');
      const report=factFor(wbind);
      const reportNode=node(wbind.source_ref);
      const policyBinding=child(w,'weather_policy_binding');
      const weatherPolicy=factFor(policyBinding);
      // Freshness is measured from the report's publication time to the
      // request evidence cutoff (captured_at for current; issued_at for replay).
      const age=cutoff-Date.parse(reportNode.times.published_at.value);
      const fresh=reportNode.times.published_at.state==='known'&&
        age>=0&&age<=weatherPolicy.max_age_seconds*1000;
      weatherStatus=usable(w.ref)&&report.day===a.target_day&&fresh?
        'SCREENED':'HELD';
    }
    const model=derived(roots.model);
    const policy=f(model.ref,'model_policy_binding');
    const fallback=f(model.ref,'fallback_policy_binding');
    const modelPolicyComplete=usable(model.ref)&&policy.selection==='fictional_baseline'&&
      fallback.selection==='fictional_baseline_only';
    return Object.freeze({
      status:'FICTIONAL_SCREENING_ONLY',reason:null,
      target_status:targetReady&&a.raw_live_state==='fictional_matched'?'SCREENED':'HELD',
      candidate_status:candidate,history_eligible:eligible,history_zero:zeros,
      history_excluded:excluded,weather_status:weatherStatus,
      model_status:modelPolicyComplete?'FIXTURE_POLICY_DECLARED':'DISABLED',
      authorized_for_model:false,provenance_verified:false
    });
  }catch(_){return refused('invalid_graph_contract');}
}
module.exports=Object.freeze({evaluateFictionalSourceGraph:evaluate});