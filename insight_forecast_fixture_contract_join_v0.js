'use strict';
/* STEP4 P4d-15: strictly FICTIONAL Reader/group/graph context join.
 * Not loaded by production. Never grants source provenance or model access.
 * No real identifiers, values, raw snapshots, network, DOM, or Storage.
 */
const {evaluateFictionalSourceGraph}=require('./insight_forecast_fixture_source_graph_v0.js');
const KEYS=['weather','calendar','registry','policy','adapter','contract','model'];
const ID=/^[a-zA-Z0-9][\w.-]{0,63}$/;
function result(status,reason=null){
  return Object.freeze({kind:'FICTIONAL_CONTRACT_JOIN_ONLY',status,reason,
    fixture_only:true,full_app_clean:false,provenance_verified:false,
    authorized_for_model:false});
}
function invalid(){throw Error('invalid_fixture_input');}
function keys(v,expected){
  return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
    Object.keys(v).length===expected.length&&
    expected.every(k=>Object.hasOwn(v,k));
}
// Copy once and freeze; this does NOT sandbox a hostile Proxy or callback.
function copySafe(input){
  const seen=new Set();let count=0;
  function visit(v,depth){
    if(++count>2000||depth>35)invalid();
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isFinite(v)||Object.is(v,-0))invalid();return v;}
    if(typeof v!=='object'||seen.has(v))invalid();
    const a=Array.isArray(v),proto=Object.getPrototypeOf(v);
    if(proto!==(a?Array.prototype:Object.prototype))invalid();
    seen.add(v);
    const d=Object.getOwnPropertyDescriptors(v),ks=Reflect.ownKeys(d);
    if(ks.some(k=>typeof k!=='string'||['__proto__','constructor','prototype','toJSON'].includes(k)))invalid();
    const out=a?[]:{};
    if(a){
      if(v.length>2000||ks.length!==v.length+1)invalid();
      for(let i=0;i<v.length;i++){
        if(!Object.hasOwn(d,i)||!Object.hasOwn(d[i],'value'))invalid();
        out.push(visit(d[i].value,depth+1));
      }
    }else for(const k of ks){
      if(!Object.hasOwn(d[k],'value'))invalid();
      Object.defineProperty(out,k,{value:visit(d[k].value,depth+1),enumerable:true});
    }
    seen.delete(v);return Object.freeze(out);
  }
  return visit(input,0);
}
function sameScope(a,b){
  return !!a&&!!b&&a.store_id===b.store_id&&a.category_id===b.category_id&&a.trip===b.trip;
}
function sameVersions(a,b){
  return keys(a,KEYS)&&keys(b,KEYS)&&KEYS.every(k=>
    typeof a[k]==='string'&&ID.test(a[k])&&a[k]===b[k]);
}
function joinFictionalContracts(input){
  try{
    if(!keys(input,['reader','snapshot','group','child','graph_input',
      'reference','capture','observed']))invalid();
    const {reader,snapshot,group,child}=input;
    // The same frozen graph is compared and passed into the existing evaluator.
    const graph=copySafe(input.graph_input);
    const meta=copySafe({reference:input.reference,capture:input.capture,observed:input.observed});
    const {reference,capture,observed}=meta,anchor=graph.anchor;
    if(typeof reader?.isCurrent!=='function'||!snapshot||group?.fixture!==true||
       !Array.isArray(group.children)||!group.children.includes(child)||
       typeof group.isCurrent!=='function'||!group.common||
       !child?.context||!child.reader_request||!anchor)invalid();
    if(!keys(reference,['child_request_id','graph_request_ref'])||
       !keys(capture,['session_id','snapshot_id','child_request_id','graph_request_ref',
         'ui_epoch','captured_at','storage_revision'])||
       !keys(observed,['session_id','snapshot_id','store_id','category_id',
         'target_day','manual_target','ui_epoch','source_versions']))invalid();
    if(!reader.isCurrent(snapshot)||!group.isCurrent(child,observed))
      return result('HELD','FIXTURE_STALE');
    const ctx=child.context,common=group.common,rr=child.reader_request,req=snapshot.request;
    if(!req||!sameVersions(snapshot.source_versions,common.source_versions)||
       !sameVersions(common.source_versions,ctx.source_versions)||
       !sameVersions(ctx.source_versions,observed.source_versions))
      return result('HELD','VERSION_UNVERIFIED');
    // The explicitly declared two IDs differ by grammar, never transform one
    // into the other by text replacement. Capture data is supplied by the
    // fixture, NOT emitted/certified by SnapshotReader.
    if(reference.child_request_id!==ctx.request_id||
       reference.graph_request_ref!==anchor.request_id||
       capture.child_request_id!==reference.child_request_id||
       capture.graph_request_ref!==reference.graph_request_ref||
       capture.snapshot_id!==snapshot.snapshot_id||
       capture.snapshot_id!==common.snapshot_id||
       capture.snapshot_id!==anchor.snapshot_id||
       capture.session_id!==common.session_id||
       capture.session_id!==anchor.session_id||
       capture.ui_epoch!==common.ui_epoch||capture.ui_epoch!==anchor.ui_epoch||
       capture.captured_at!==anchor.captured_at||
       capture.storage_revision!==anchor.storage_revision||
       ctx.request_id===anchor.request_id||
       ctx.session_id!==common.session_id||
       ctx.snapshot_id!==common.snapshot_id||ctx.ui_epoch!==common.ui_epoch||
       !sameScope(req.scope,rr.scope)||!sameScope(ctx.scope,req.scope)||
       !sameScope(ctx.scope,anchor.scope)||
       observed.store_id!==ctx.scope.store_id||
       observed.category_id!==ctx.scope.category_id||
       rr.target_day!==req.target_day||
       rr.request_issued_at!==req.request_issued_at||
       rr.manual_target!==req.manual_target||rr.purpose!==req.purpose||
       rr.history_days!==req.history_days||
       common.target_day!==req.target_day||
       common.issued_at!==req.request_issued_at||
       common.manual_target!==req.manual_target||common.purpose!==req.purpose||
       anchor.target_day!==common.target_day||
       anchor.issued_at!==common.issued_at||
       anchor.manual_target!==common.manual_target||
       anchor.purpose!==common.purpose||
       anchor.raw_live_state!=='fictional_matched')
      return result('HELD','CONTEXT_UNVERIFIED');
    const screening=evaluateFictionalSourceGraph(graph);
    if(screening.status==='REJECT'||screening.status!=='FICTIONAL_SCREENING_ONLY'||
       screening.authorized_for_model!==false||
       screening.provenance_verified!==false)
      return result('REJECT','GRAPH_INVALID');
    // External callbacks are rechecked after evaluation for possible changes.
    if(!reader.isCurrent(snapshot)||!group.isCurrent(child,observed))
      return result('HELD','FIXTURE_STALE');
    if(screening.target_status!=='SCREENED')
      return result('HELD','TARGET_UNSCREENED');
    if(screening.history_eligible<1||screening.history_excluded>0)
      return result('HELD','HISTORY_UNSCREENED');
    if(screening.weather_status==='HELD')
      return result('HELD','WEATHER_UNSCREENED');
    if(screening.model_status!=='FIXTURE_POLICY_DECLARED')
      return result('HELD','POLICY_UNSCREENED');
    return result('MATCHED_FIXTURE');
  }catch(_){
    return result('REJECT','INVALID_FIXTURE_INPUT');
  }
}
module.exports=Object.freeze({joinFictionalContracts});
