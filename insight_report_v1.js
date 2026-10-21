/* Deterministic report and in-memory lifecycle. Explicit store profiles; no I/O. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else {if(Object.prototype.hasOwnProperty.call(root,'InsightReport'))throw new Error('report_namespace_collision');
    root.InsightReport=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function makeEngine(configuration){
  'use strict';
  if(configuration===undefined)configuration=null;
  const CONFIGURED=configuration!==null, VERSION=CONFIGURED?'configured-report-v1':'fictional-report-v1', MAX=1000000000000, LIMIT=2000;
  let STORES={lab_a:'架空店舗A',lab_b:'架空店舗B'}, profileRevision=null;
  const STORE_ERROR=CONFIGURED?'store_profile_mismatch':'fictional_store_only', METRICS=['sales','waste','customers'];
  const NAMES={sales:'売上',waste:'廃棄金額',customers:'客数'}, UNITS={sales:'円',waste:'円',customers:'人'};
  const WASTE=['米飯','調理パン','麺類・その他','デリカテッセン','スイーツ','FF','その他デイリー','パン・ペストリー'];
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const bool=v=>typeof v==='boolean', tri=v=>v===null||bool(v);
  const text=v=>typeof v==='string'&&v.length>0&&v.length<=100&&!/[\p{C}\p{Zl}\p{Zp}\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/u.test(v);
  const need=(ok,code)=>{if(!ok)throw new Error(code);};
  function copy(value,depth=0,state={nodes:0}){
    need(depth<=32&&++state.nodes<=100000,'input_too_large');
    if(value===null||typeof value==='string'||bool(value))return value;
    if(typeof value==='number'){need(Number.isFinite(value),'invalid_numeric_value');return value;}
    if(Array.isArray(value)){
      need(value.length<=10000,'input_too_large');
      return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));
        need(d&&own(d,'value'),'accessor_or_sparse_array');return copy(d.value,depth+1,state);});
    }
    need(object(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),'invalid_json_value');
    const out=Object.create(null);
    for(const k of Object.keys(value)){
      need(!['__proto__','constructor','prototype'].includes(k),'unsafe_object_key');
      const descriptor=Object.getOwnPropertyDescriptor(value,k);
      need(descriptor&&own(descriptor,'value'),'accessor_input');
      out[k]=copy(descriptor.value,depth+1,state);
    }
    return out;
  }
  function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}

  if(CONFIGURED){
    const profile=copy(configuration);
    need(object(profile)&&Object.keys(profile).length===2&&text(profile.revision)&&/^[A-Za-z0-9._-]{1,100}$/.test(profile.revision)&&
      Array.isArray(profile.stores)&&profile.stores.length>=1&&profile.stores.length<=16,'invalid_store_profile');
    const catalog=Object.create(null),names=new Set();
    for(const entry of profile.stores){
      need(object(entry)&&Object.keys(entry).length===2&&typeof entry.id==='string'&&
        /^[A-Za-z0-9_-]{1,100}$/.test(entry.id)&&!['__proto__','constructor','prototype'].includes(entry.id)&&
        typeof entry.name==='string'&&entry.name.length>=1&&entry.name.length<=100&&
        entry.name===entry.name.trim()&&!/[\p{C}\p{Zl}\p{Zp}]/u.test(entry.name)&&
        !own(catalog,entry.id)&&!names.has(entry.name),'invalid_store_profile');
      catalog[entry.id]=entry.name;names.add(entry.name);
    }
    STORES=freeze(catalog);profileRevision=profile.revision;
  }

  function iso(v){
    need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000'),'invalid_date');
    const t=Date.parse(v+'T00:00:00Z');need(Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v,'invalid_date');return v;
  }
  function days(p){
    need(object(p),'invalid_period');iso(p.start);iso(p.end);
    const n=(Date.parse(p.end+'T00:00:00Z')-Date.parse(p.start+'T00:00:00Z'))/86400000;
    need(Number.isInteger(n)&&n>=0&&n<366,'invalid_period');
    return Array.from({length:n+1},(_,i)=>new Date(Date.parse(p.start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  }
  const label=p=>p.start+'〜'+p.end, within=(d,p)=>p.start<=d&&d<=p.end;
  const weekday=d=>new Date(d+'T00:00:00Z').getUTCDay();
  function count(v){need(v===null||Number.isSafeInteger(v)&&v>=0&&v<=MAX,'invalid_count');return v;}
  function amount(v,metric){
    need(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=MAX,'invalid_numeric_value');
    // Decimal representation, never binary floating multiplication or rounding.
    const m=String(v).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);need(m,'invalid_numeric_value');
    const power=(metric==='sales'?3:0)+Number(m[3]||0)-(m[2]||'').length;
    let n=BigInt(m[1]+(m[2]||''));
    if(power>=0)n*=10n**BigInt(power);
    else {const divisor=10n**BigInt(-power);need(n%divisor===0n,'non_integer_or_large_normalized_value');n/=divisor;}
    need(n<=BigInt(MAX),'non_integer_or_large_normalized_value');return Number(n);
  }
  const abs=n=>n<0n?-n:n;
  function fraction(n,d=1n){n=BigInt(n);d=BigInt(d);need(d!==0n,'invalid_fraction');if(d<0n){n=-n;d=-d;}
    let a=abs(n),b=d;while(b){const t=a%b;a=b;b=t;}return {numerator:String(n/a),denominator:String(d/a)};}
  function validFraction(v){need(object(v)&&typeof v.numerator==='string'&&/^-?(0|[1-9]\d*)$/.test(v.numerator)&&
    typeof v.denominator==='string'&&/^[1-9]\d*$/.test(v.denominator)&&v.numerator.length<=30&&v.denominator.length<=30,'invalid_fraction');return fraction(v.numerator,v.denominator);}
  const fAbs=f=>fraction(abs(BigInt(f.numerator)),f.denominator);
  const fNeg=f=>fraction(-BigInt(f.numerator),f.denominator);
  const fCompare=(a,b)=>{const d=BigInt(a.numerator)*BigInt(b.denominator)-BigInt(b.numerator)*BigInt(a.denominator);return d<0n?-1:d>0n?1:0;};
  function fText(f){
    const n=BigInt(f.numerator),d=BigInt(f.denominator);if(d===1n)return String(n);
    const scaled=abs(n)*100n;let q=scaled/d,r=scaled%d;
    if(r*2n>d||r*2n===d&&q%2n===1n)q++;
    return '約'+(n<0n?'-':'')+String(q/100n)+'.'+String(q%100n).padStart(2,'0');
  }
  const unique=a=>[...new Set(a)], sorted=a=>a.slice().sort((a,b)=>a<b?-1:a>b?1:0);
  function validate(data,rules){
    need(object(data)&&Object.values(STORES).includes(data.store),STORE_ERROR);days(data.period);days(data.quantity_reference);iso(data.quantity_day);
    need(within(data.quantity_day,data.period)&&data.quantity_reference.end<data.period.start,'invalid_quantity_period');
    need(text(data.quantity_category)&&['PARTIAL','ALL'].includes(data.quantity_coverage),'invalid_quantity_scope');
    need(Number.isInteger(rules.focus_limit)&&rules.focus_limit>=1&&rules.focus_limit<=5&&Number.isInteger(rules.min_days)&&rules.min_days>=1&&rules.min_days<=366,'invalid_rules');
    validFraction(rules.relative_threshold);need(fCompare(rules.relative_threshold,fraction(0))>0&&fCompare(rules.relative_threshold,fraction(10))<=0,'invalid_rules');
    for(const key of ['kpis','specs','quantities','contexts'])need(Array.isArray(data[key])&&data[key].length<=LIMIT,'invalid_collection');
    need(data.specs.length===3&&unique(data.specs.map(s=>s.metric)).length===3,'missing_or_duplicate_metric');
    for(const s of data.specs){need(METRICS.includes(s.metric)&&text(s.current_scope)&&text(s.reference_scope)&&bool(s.conditions_confirmed),'invalid_spec');days(s.reference);need(s.reference.end<data.period.start,'reference_period_not_past');}
    const refs=new Set(),seen=new Set();
    function record(r,key){need(object(r)&&Object.values(STORES).includes(r.store)&&text(r.evidence)&&!refs.has(r.evidence)&&!seen.has(key),'duplicate_record_or_evidence');refs.add(r.evidence);seen.add(key);}
    for(const r of data.kpis){record(r,JSON.stringify(['k',r.store,r.day,r.metric,r.scope]));iso(r.day);need(METRICS.includes(r.metric)&&text(r.scope)&&r.unit===UNITS[r.metric]&&bool(r.zero_unverified)&&(!r.zero_unverified||r.value===null),'invalid_kpi_record');count(r.value);}
    for(const r of data.quantities){record(r,JSON.stringify(['q',r.store,r.day,r.category]));iso(r.day);need(text(r.category)&&tri(r.holiday)&&tri(r.sale_or_event)&&Array.isArray(r.trips)&&r.trips.length===3,'invalid_quantity_record');for(const t of r.trips){need(object(t)&&tri(t.active),'invalid_trip');count(t.value);}}
    for(const r of data.contexts){record(r,JSON.stringify(['c',r.store,r.period?.start,r.period?.end,r.kind]));days(r.period);need(['event','weather'].includes(r.kind)&&['UNPROVIDED','CONFIRMED_PRESENT','CONFIRMED_NONE'].includes(r.state),'invalid_context');}
  }
  function daily(r){
    if(!r)return {state:'UNKNOWN_TRIP',value:null,trip_states:Array(3).fill('UNKNOWN_TRIP'),evidence_ids:[]};
    const states=r.trips.map(t=>t.active===null?'UNKNOWN_TRIP':!t.active?'INACTIVE':t.value===null?'MISSING':t.value===0?'ENTERED_ZERO':'ENTERED');
    const state=states.includes('UNKNOWN_TRIP')?'UNKNOWN_TRIP':states.every(s=>s==='INACTIVE')?'INACTIVE':states.includes('MISSING')?'INCOMPLETE':'COMPLETE';
    return {state,value:state==='COMPLETE'?r.trips.reduce((n,t)=>n+(t.active?t.value:0),0):null,trip_states:states,evidence_ids:[r.evidence]};
  }
  function mean(data){
    const rows=data.quantities.filter(r=>r.store===data.store&&r.category===data.quantity_category&&within(r.day,data.quantity_reference)&&weekday(r.day)>=1&&weekday(r.day)<=5).sort((a,b)=>a.day<b.day?-1:1);
    const unknown=rows.filter(r=>r.holiday!==true&&r.sale_or_event!==true&&(r.holiday===null||r.sale_or_event===null));
    if(unknown.length)return {value:null,entered:0,excluded_incomplete:0,evidence_ids:rows.map(r=>r.evidence),unverified_conditions:unknown.length};
    const eligible=rows.filter(r=>r.holiday===false&&r.sale_or_event===false),complete=eligible.map(daily).filter(d=>d.state==='COMPLETE');
    const sum=complete.reduce((n,d)=>n+BigInt(d.value),0n);
    return {value:complete.length?fraction(sum,complete.length):null,entered:complete.length,excluded_incomplete:eligible.length-complete.length,evidence_ids:eligible.map(r=>r.evidence),unverified_conditions:0};
  }
  function total(data,metric,scope,p){
    const rows=data.kpis.filter(r=>r.store===data.store&&r.metric===metric&&r.scope===scope&&within(r.day,p));
    const entered=rows.filter(r=>r.value!==null),expected=days(p).length,sum=entered.reduce((n,r)=>n+r.value,0);need(Number.isSafeInteger(sum),'unsafe_total');
    return {value:entered.length===expected?sum:null,entered:entered.length,expected,evidence_ids:rows.sort((a,b)=>a.day<b.day?-1:1).map(r=>r.evidence),unknown_zero:rows.filter(r=>r.zero_unverified).length};
  }
  const REASONS={current_zero_unverified:'当期の保存値0が入力済みか未入力か確認できない',reference_zero_unverified:'比較期間の保存値0が入力済みか未入力か確認できない',current_incomplete:'当期の対象日が全て入力済みではない',reference_incomplete:'比較期間の対象日が全て入力済みではない',scope_mismatch:'当期と比較期間の集計範囲が違う',duration_mismatch:'当期と比較期間の対象日数が違う',insufficient_sample:'入力済み日数が実験ルールの最低件数に満たない',conditions_unconfirmed:'曜日構成などの比較条件が確認済みではない'};
  const reports=new WeakSet(),normalizedInputs=new WeakSet(),normalizedCalendars=new WeakMap();
  function build(normalized, supplied={}){
    if(CONFIGURED)need(normalizedInputs.has(normalized),'normalized_not_from_this_engine');
    const data=copy(normalized.data),rules=Object.assign({focus_limit:3,min_days:1,relative_threshold:fraction(1,10)},copy(supplied));validate(data,rules);rules.relative_threshold=validFraction(rules.relative_threshold);
    const kpis=METRICS.map(metric=>{const s=data.specs.find(s=>s.metric===metric),current=total(data,metric,s.current_scope,data.period),reference=total(data,metric,s.reference_scope,s.reference);
      const reason=current.unknown_zero?'current_zero_unverified':reference.unknown_zero?'reference_zero_unverified':current.value===null?'current_incomplete':reference.value===null?'reference_incomplete':s.current_scope!==s.reference_scope?'scope_mismatch':current.expected!==reference.expected?'duration_mismatch':!s.conditions_confirmed?'conditions_unconfirmed':Math.min(current.entered,reference.entered)<rules.min_days?'insufficient_sample':'comparable';
      const delta=reason==='comparable'?current.value-reference.value:null;
      return {metric,current,reference,comparable:reason==='comparable',reason,delta,ratio:delta!==null&&reference.value?fraction(delta,reference.value):null};});
    const day=daily(data.quantities.find(r=>r.store===data.store&&r.category===data.quantity_category&&r.day===data.quantity_day)),weekdayMean=mean(data),lines=[];
    function add(key,kind,value,refs,rank=null,reason='',period=data.period){lines.push({key,store:data.store,period,kind,text:value,evidence_ids:unique(refs),rank,selection_reason:reason});}
    for(const k of kpis){const s=data.specs.find(s=>s.metric===k.metric),name=NAMES[k.metric],unit=UNITS[k.metric],pos=METRICS.indexOf(k.metric),refs=k.current.evidence_ids.concat(k.reference.evidence_ids);
      if(k.current.value!==null)add(k.metric+'.current','FACT',`当期の${name}（範囲：${s.current_scope}）は${k.current.value}${unit}。入力済み${k.current.entered}日／対象${k.current.expected}日。`,k.current.evidence_ids);
      if(k.reference.value!==null)add(k.metric+'.reference','FACT',`比較期間${label(s.reference)}の${name}（範囲：${s.reference_scope}）は${k.reference.value}${unit}。`,k.reference.evidence_ids,null,'',s.reference);
      if(!k.comparable){const c=k.current.unknown_zero||k.reference.unknown_zero?'入力済みと確認できた日数':'入力済み';add(k.metric+'.gap','GAP',`${name}の増減は判定できません。${REASONS[k.reason]}ためです。当期${c}${k.current.entered}日／対象${k.current.expected}日、比較期間${label(s.reference)}は${c}${k.reference.entered}日／対象${k.reference.expected}日。`,refs,[0,pos,fraction(0)],k.reason);continue;}
      if(k.delta===0){add(k.metric+'.change','FACT',`${name}は比較期間から変化なし。実績値が0という意味ではありません。`,refs);continue;}
      const adverse=k.metric==='waste'?k.delta>0:k.delta<0,significant=k.ratio===null||fCompare(fAbs(k.ratio),rules.relative_threshold)>=0;
      const rank=significant?[adverse?1:2,pos,fNeg(k.ratio?fAbs(k.ratio):fraction(0))]:null;
      const rate=k.ratio===null?'比較基準0のため増減率は算出できません。':`変化率の絶対値は${fText(fraction(abs(BigInt(k.ratio.numerator))*100n,k.ratio.denominator))}%。`;
      add(k.metric+'.change','FACT',`${name}は比較期間${label(s.reference)}の${k.reference.value}${unit}から当期${k.current.value}${unit}へ${k.delta>0?'増加':'減少'}。差の絶対値は${Math.abs(k.delta)}${unit}。${rate}`,refs,rank,adverse?'adverse_change':'favorable_change');
    }
    if(day.state==='COMPLETE')add('quantity.daily','FACT',`${data.quantity_day}の${data.quantity_category}の販売数は日合計${day.value}個で確定。入力済み0を含み、対象外便の保存値は合計に含めません。`,day.evidence_ids);
    else {const names={UNKNOWN_TRIP:'対象便が不明',INACTIVE:'全便が明示的対象外',INCOMPLETE:'対象便に未入力がある'};add('quantity.daily','GAP',`${data.quantity_day}の${data.quantity_category}は${names[day.state]}ため日合計を示せません。未確定や対象外を実績0とは扱いません。`,day.evidence_ids,[0,3,fraction(0)],day.state);}
    if(weekdayMean.value===null){const w=weekdayMean;add('quantity.mean','GAP',`参考期間${label(data.quantity_reference)}の${data.quantity_category}は、`+(w.unverified_conditions?`祝日・イベントの除外条件が未確認の日が${w.unverified_conditions}日あり、平日平均は保留です。`:'集計可能な平日が0日で、平日平均は算出できません。'),w.evidence_ids,[0,4,fraction(0)],w.unverified_conditions?'weekday_conditions_unverified':'weekday_sample_missing',data.quantity_reference);}
    else add('quantity.mean','FACT',`参考期間${label(data.quantity_reference)}の${data.quantity_category}の平日平均は${fText(weekdayMean.value)}個（確定日数${weekdayMean.entered}日）。記録のある平日のうち、対象便未確定・全便対象外で除外した日は${weekdayMean.excluded_incomplete}日。月〜金のうち祝日・セール／イベント日を除外し、入力済み0を含む日合計から算出。当日の日合計とは別期間の参考値で、両者の増減は判定しません。`,weekdayMean.evidence_ids,null,'',data.quantity_reference);
    if(data.quantity_coverage==='PARTIAL')add('quantity.scope','FACT','廃棄金額の集計範囲と、数量記録の範囲は別です。数量記録は一部カテゴリーのみで、対応がない金額分類を廃棄0円とは判断できません。金額の配賦は行いません。',data.quantities.filter(r=>r.store===data.store&&r.category===data.quantity_category&&(r.day===data.quantity_day||within(r.day,data.quantity_reference))).sort((a,b)=>a.day<b.day?-1:1).map(r=>r.evidence));
    for(const [pos,kind] of [[5,'event'],[6,'weather']]){const match=data.contexts.find(c=>c.store===data.store&&c.kind===kind&&c.period.start===data.period.start&&c.period.end===data.period.end),refs=match?[match.evidence]:[];
      if(!match||match.state==='UNPROVIDED')add(kind+'.context','GAP',`${kind==='event'?'イベント':'天候'}資料は未提供で、内容を判断できません。`,refs,[0,pos,fraction(0)],'context_unprovided');
      else if(kind==='event')add(kind+'.context','FACT',(match.state==='CONFIRMED_PRESENT'?'イベント登録は確認済み。':'イベント登録がないことを資料で確認済み。')+'販売変化との因果関係は未検証で、原因は断定しません。',refs);
      else add(kind+'.context','FACT','天候資料の確認状態は記録済み。具体的な天候や販売への影響はこの入力から断定しません。',refs);
    }
    const selected=lines.filter(l=>l.rank!==null).sort((a,b)=>a.rank[0]-b.rank[0]||a.rank[1]-b.rank[1]||fCompare(a.rank[2],b.rank[2])||(a.key<b.key?-1:a.key>b.key?1:0)).slice(0,rules.focus_limit).map(l=>l.key);
    const report=freeze({store:data.store,period:data.period,rules,daily:day,weekday:weekdayMean,kpis,lines,focus_keys:selected,status:selected.length?'HAS_FOCUS':kpis.every(k=>k.comparable&&k.delta===0)?'NO_CHANGE':'BELOW_TRIAL_THRESHOLD'});reports.add(report);return report;
  }
  function renderText(report){
    need(reports.has(report),'report_not_built_here');
    const statuses={HAS_FOCUS:'注目候補あり',NO_CHANGE:'比較可能な3指標は変化なし',BELOW_TRIAL_THRESHOLD:'変化はあるが実験用閾値未満'};
    const out=[`${report.store}　対象期間：${label(report.period)}`,(CONFIGURED?'読取専用の定型報告。モデル呼び出し・通信・保存なし。':'架空データの定型報告。モデル呼び出し・通信・保存なし。'),'状態：'+statuses[report.status],'注目項目（実験用の優先ルール）'];
    for(const k of report.focus_keys){const l=report.lines.find(l=>l.key===k),r=l.kind==='GAP'?'不足情報を優先':l.selection_reason==='adverse_change'?'悪化方向の変化を優先':'改善方向の変化を表示';out.push(`・${l.text}（選択理由：${r}）`);}
    if(!report.focus_keys.length)out.push('注目候補なし。数合わせの項目は作成していません。');
    for(const [title,kind] of [['確認情報（非選択も全件保持）','FACT'],['不足情報（非選択も全件保持）','GAP']]){out.push(title);const rows=report.lines.filter(l=>l.kind===kind);out.push(...(rows.length?rows.map(l=>'・'+l.text):['該当なし。']));}
    if(report.context){
      const labels={CONFIRMED:'比較条件の根拠を照合済み。',UNCONFIRMED:'比較条件が未確認のため保留。',MISMATCH:'比較条件に不一致があるため保留。'};
      out.push('比較条件の確認');
      for(const item of report.context.verification.comparisons)out.push(`・${NAMES[item.metric]}：${labels[item.state]}`);
    }
    out.push('閾値・最低件数・優先順位は架空試験用。本番精度・原因・最適発注量は未判定です。');return out.join('\n');
  }
  function eventRecords(snapshot,store){
    const management=snapshot.eventManagement;
    if(management==null||!own(store,'events'))return null;
    need(object(management)&&Array.isArray(management.events)&&Array.isArray(store.events),'invalid_event_registry');
    const result=[],ids=new Set(),types=['sale','campaign','nearby','special','environment','equipment','staff','bulk','other'];
    for(const [scope,entries] of [['global',management.events],['store',store.events]]){
      need(entries.length<=LIMIT,'too_many_events');
      for(const e of entries){need(object(e)&&text(e.id)&&!ids.has(e.id)&&e.scope===scope&&types.includes(e.type),'invalid_event_record');
        need(['sale','campaign'].includes(e.type)?scope==='global':e.type==='other'||scope==='store','invalid_event_scope');
        iso(e.startDate);iso(e.endDate);need(e.startDate<=e.endDate,'invalid_event_period');ids.add(e.id);result.push([e.startDate,e.endDate,e.id]);}
    }
    return result;
  }
  function decision(result,d){
    need(object(result)&&result.date===d&&result.month===d.slice(0,7)&&Array.isArray(result.trips)&&result.trips.length===3,'invalid_resolver_identity');
    const trips=result.trips.map((t,i)=>{need(object(t)&&t.trip===i+1&&['active','inactive','unknown'].includes(t.status)&&
      ['manual','inference','observed_day','insufficient','conflict','invalid'].includes(t.source)&&bool(t.tentative)&&bool(t.needsDateReview)&&(!own(t,'conflict')||bool(t.conflict)),'invalid_resolver_trip');
      return {status:t.status,source:t.source,tentative:t.tentative,conflict:t.conflict||false,needs_review:t.needsDateReview};});
    const mask=trips.map(t=>t.status==='active'?true:t.status==='inactive'?false:null);
    need(Array.isArray(result.mask)&&result.mask.length===3&&result.mask.every((v,i)=>tri(v)&&v===mask[i]),'invalid_resolver_mask');
    need(bool(result.needsReview)&&result.needsReview===trips.some(t=>t.status==='unknown'||t.needs_review||t.conflict)&&
      bool(result.includesEstimate)&&result.includesEstimate===trips.some(t=>t.tentative),'invalid_resolver_summary');return trips;
  }
  function normalize(raw,request,dependencies={}){
    const snapshot=copy(raw),o=copy(request),before=JSON.stringify(snapshot);
    need(object(snapshot)&&object(snapshot.stores)&&object(o)&&own(STORES,o.store_id)&&own(snapshot.stores,o.store_id),STORE_ERROR);
    need(Object.keys(snapshot.stores).every(k=>own(STORES,k)&&object(snapshot.stores[k])&&snapshot.stores[k].name===STORES[k]),STORE_ERROR);
    need(text(o.request_id)&&text(o.data_revision),'explicit_request_identity_required');
    const version=own(snapshot,'schemaVersion')?snapshot.schemaVersion:0;need(Number.isInteger(version)&&[0,1].includes(version),'unsupported_snapshot_version');
    for(const p of [o.period,o.reference,o.quantity_reference])days(p);iso(o.as_of);iso(o.quantity_day);
    need(o.period.end<=o.as_of&&within(o.quantity_day,o.period)&&o.reference.end<o.period.start&&o.quantity_reference.end<o.period.start&&bool(o.comparison_confirmed)&&typeof o.category_id==='string','invalid_options');
    need(object(dependencies)&&(!own(dependencies,'resolver')||dependencies.resolver===null||typeof dependencies.resolver==='function')&&
      (!own(dependencies,'event_reader')||dependencies.event_reader===null||typeof dependencies.event_reader==='function'),'invalid_dependencies');
    const sourceRevision=own(dependencies,'source_revision')?dependencies.source_revision:(CONFIGURED?'configured-dependencies-v1':'fictional-dependencies-v1');need(text(sourceRevision),'invalid_metadata_request');
    const store=snapshot.stores[o.store_id],master=snapshot.salesCountManagement;
    need(object(store.data)&&Array.isArray(store.years)&&store.years.every(y=>typeof y==='string'&&/^\d{4}$/.test(y))&&unique(store.years).length===store.years.length,'invalid_daily_container');
    need([o.period,o.reference,o.quantity_reference].flatMap(days).every(d=>store.years.includes(d.slice(0,4))),'unregistered_year');
    need(object(master)&&Array.isArray(master.categories)&&master.categories.length<=LIMIT&&master.categories.every(c=>object(c)&&typeof c.id==='string')&&unique(master.categories.map(c=>c.id)).length===master.categories.length,'invalid_category_master');
    const category=master.categories.find(c=>c.id===o.category_id);need(category&&text(category.name),'unknown_category');
    need(Array.isArray(category.activeTrips)&&category.activeTrips.length===3&&category.activeTrips.every(bool),'invalid_current_trip_mask');
    const book=dependencies.calendar_book==null?null:copy(dependencies.calendar_book);
    if(book){need(text(book.version)&&bool(book.verified)&&Array.isArray(book.holidays)&&unique(book.holidays).length===book.holidays.length,'invalid_calendar_book');iso(book.start);iso(book.end);need(book.start<=book.end&&book.holidays.every(d=>{iso(d);return within(d,book); }),'invalid_calendar_book');}
    const sources=[],diagnostics=[],calendar=new Map(),decisions=new Map(),cache=new Map();
    const issue=(code,d,subject)=>diagnostics.push({code,day:d,subject});
    function source(evidence_id,path,state,raw,source_unit,normalized_unit,decision_source='',t=null){
      sources.push({evidence_id,path,state,raw,source_unit,normalized_unit,decision_source,
        tentative:t?t.tentative:false,conflict:t?t.conflict:false,needs_review:t?t.needs_review:false});}
    const qdates=sorted(unique(days(o.quantity_reference).concat(o.quantity_day)));
    for(const d of qdates){const verified=book&&book.verified&&within(d,book),holiday=verified?book.holidays.includes(d):null;calendar.set(d,holiday);
      if(!verified)issue('calendar_unverified',d,'holiday');
      if(d.slice(0,7)===o.as_of.slice(0,7))continue;
      let trips=Array.from({length:3},()=>({status:'unknown',source:'insufficient',tentative:false,conflict:false,needs_review:false}));
      if(!dependencies.resolver)issue('resolver_unavailable',d,'trips');
      else {let value,failed=false;try{value=dependencies.resolver(snapshot,o.store_id,o.category_id,d,{today:o.as_of,monthCache:cache});}catch(_){failed=true;issue('resolver_failed',d,'trips');}
        if(!failed)try{trips=decision(copy(value),d);}catch(_){issue('resolver_invalid',d,'trips');}}
      decisions.set(d,trips);
    }
    let events=null,eventState;
    try{events=eventRecords(snapshot,store);eventState=events===null?'UNPROVIDED':'KNOWN';}catch(_){eventState='INVALID';}
    if(eventState==='KNOWN'&&dependencies.event_reader){let result,failed=false;
      try{result=copy(dependencies.event_reader(snapshot,o.store_id,qdates[0],qdates[qdates.length-1]));}catch(_){failed=true;events=null;eventState='UNPROVIDED';issue('event_reader_failed',o.quantity_day,'events');}
      if(!failed)try{need(Array.isArray(result),'invalid_event_reader_result');const checked=eventRecords({eventManagement:{events:result.filter(e=>object(e)&&e.scope==='global')}},{events:result.filter(e=>object(e)&&e.scope==='store')});need(checked.length===result.length,'invalid_event_reader_result');
        const expected=events.filter(e=>e[0]<=qdates[qdates.length-1]&&e[1]>=qdates[0]);need(JSON.stringify(sorted(checked.map(e=>JSON.stringify(e))))===JSON.stringify(sorted(expected.map(e=>JSON.stringify(e)))),'event_reader_mismatch');
      }catch(_){events=null;eventState='INVALID';}}
    if(eventState!=='KNOWN')issue('event_registry_unverified',o.quantity_day,eventState);
    need(before===JSON.stringify(snapshot),'dependency_mutated_snapshot');
    for(const d of qdates)source(`${o.store_id}/${d}/calendar`,'injected.calendar.'+(book?book.version:'unavailable'),calendar.get(d)===null?'UNKNOWN':'VERIFIED',calendar.get(d),'祝日確認','祝日確認');
    const kpis=[],rowsByDate=new Map();
    for(const d of sorted(unique(days(o.period).concat(days(o.reference))))){const [year,month,day]=d.split('-'),yd=store.data[year];need(yd==null||object(yd),'invalid_year_container');const rows=yd?yd[Number(month)+'月']:null;need(rows==null||Array.isArray(rows),'invalid_month_container');
      if(rows){need(rows.length<=31&&rows.every(object)&&unique(rows.map(r=>String(r.d))).length===rows.length,'invalid_or_duplicate_daily_row');for(const r of rows){need((typeof r.d==='string'&&/^[1-9]\d*$/.test(r.d)||Number.isSafeInteger(r.d)&&r.d>0)&&String(Number(r.d))===String(r.d),'invalid_daily_date');iso(year+'-'+month+'-'+String(r.d).padStart(2,'0'));}}
      const index=rows?rows.findIndex(r=>String(r.d)===String(Number(day))):-1,row=index>=0?rows[index]:null;rowsByDate.set(d,row);
      for(const [metric,field] of [['sales','売上'],['waste','廃棄金額'],['customers','客数']]){const location=index>=0?`[${index}]`:`[day=${Number(day)}:missing]`,path=`stores.${o.store_id}.data.${year}.${Number(month)}月${location}.${field}`,evidence=`${o.store_id}/${d}/${metric}`;
        let raw=row?(row[field]??null):null,trace=raw,origin=path;
        if(metric==='waste'&&row&&row.haiki!=null){const detail=row.haiki;need(object(detail)&&Object.keys(detail).every(k=>WASTE.includes(k)),'invalid_waste_detail');need(Object.keys(detail).length===WASTE.length,'incomplete_waste_detail');const sum=WASTE.reduce((n,k)=>n+amount(detail[k],'waste'),0);
          if(sum>0){need(raw===null||[0,sum].includes(amount(raw,'waste')),'waste_total_detail_conflict');raw=sum;trace=WASTE.map(k=>[k,detail[k]]);origin=path.slice(0,path.lastIndexOf('.'))+'.haiki';}
          else if(raw===null){raw=0;trace=WASTE.map(k=>[k,detail[k]]);origin=path.slice(0,path.lastIndexOf('.'))+'.haiki';}}
        let value=raw===null?null:amount(raw,metric),state=raw===null?'MISSING':value===0?'UNKNOWN_ZERO':'ENTERED';
        if(state==='UNKNOWN_ZERO'){issue('legacy_zero_unverified',d,metric);value=null;}
        source(evidence,origin,state,trace,metric==='sales'?'千円':UNITS[metric],UNITS[metric]);
        kpis.push({store:STORES[o.store_id],day:d,metric,scope:'全体',unit:UNITS[metric],value,evidence,zero_unverified:state==='UNKNOWN_ZERO'});
      }
    }
    const saved=own(store,'salesCounts')?store.salesCounts:{};need(object(saved)&&Object.keys(saved).length<=LIMIT,'invalid_quantity_container');const quantities=[];
    for(const d of sorted(Object.keys(saved))){iso(d);if(!qdates.includes(d))continue;const by=saved[d];need(object(by),'invalid_quantity_record');if(!own(by,o.category_id))continue;const raw=by[o.category_id],trips=raw?.trips;
      need(Array.isArray(trips)&&trips.length===3&&trips.every(object),'invalid_quantity_trips');const converted=[];
      for(const [i,r] of trips.entries()){need(own(r,'sales')&&own(r,'delivery'),'incomplete_trip_shape');const sales=count(r.sales),delivery=count(r.delivery);let t=null,active,origin;
        if(d.slice(0,7)===o.as_of.slice(0,7)){active=category.activeTrips[i];origin='current';}
        else {t=decisions.has(d)?decisions.get(d)[i]:null;const uncertain=!t||t.tentative||t.conflict||t.needs_review||t.status==='unknown'||['conflict','invalid','insufficient'].includes(t.source)||t.status==='inactive'&&t.source!=='manual'||['observed_day','inference'].includes(t.source)&&sales===null&&delivery===null||t.status==='inactive'&&(sales!==null||delivery!==null);active=uncertain?null:t.status==='active';origin=t?t.source:'unavailable';if(uncertain)issue('historical_trip_unverified',d,'trip'+(i+1));}
        converted.push({active,value:sales});
        for(const [key,value] of [['sales',sales],['delivery',delivery]])source(`${o.store_id}/${d}/q/${i}/${key}`,`stores.${o.store_id}.salesCounts.${d}.${o.category_id}.trips.${i}.${key}`,active===null?'UNKNOWN_TRIP':active===false?'INACTIVE':value===null?'MISSING':value===0?'ENTERED_ZERO':'ENTERED',value,'個','個',origin,t);
      }
      source(`${o.store_id}/${d}/quantity`,`stores.${o.store_id}.salesCounts.${d}.${o.category_id}`,'STORED_RECORD',trips.map(t=>[t.delivery,t.sales]),'個','個');
      quantities.push({store:STORES[o.store_id],day:d,category:category.name,trips:converted,holiday:calendar.get(d),sale_or_event:events===null?null:events.some(e=>e[0]<=d&&d<=e[1]),evidence:`${o.store_id}/${d}/quantity`});
    }
    const weatherKnown=days(o.period).every(d=>{const r=rowsByDate.get(d);return r&&typeof r.weather==='string'&&r.weather.trim().length>0;}),periodEvents=(events||[]).filter(e=>e[0]<=o.period.end&&e[1]>=o.period.start);
    const contexts=[{store:STORES[o.store_id],period:o.period,kind:'event',state:events===null?'UNPROVIDED':periodEvents.length?'CONFIRMED_PRESENT':'CONFIRMED_NONE',evidence:o.store_id+'/event-registry'},
      {store:STORES[o.store_id],period:o.period,kind:'weather',state:weatherKnown?'CONFIRMED_PRESENT':'UNPROVIDED',evidence:o.store_id+'/saved-weather'}];
    source(contexts[0].evidence,`eventManagement.events + stores.${o.store_id}.events`,contexts[0].state,events,'登録状態','登録状態');
    source(contexts[1].evidence,`stores.${o.store_id}.data.*.weather`,contexts[1].state,days(o.period).map(d=>[d,rowsByDate.get(d)?.weather??null]),'保存天候','確認状態');
    const waste=own(store,'wasteCounts')?store.wasteCounts:{},waste_records=[];need(object(waste)&&Object.keys(waste).length<=LIMIT,'invalid_waste_count_container');
    for(const d of sorted(Object.keys(waste))){iso(d);if(!qdates.includes(d))continue;need(object(waste[d]),'invalid_waste_count_record');if(!own(waste[d],o.category_id))continue;const values=waste[d][o.category_id]?.trips;need(Array.isArray(values)&&values.length===3,'invalid_waste_count_record');values.forEach(count);waste_records.push([d,values]);source(`${o.store_id}/${d}/waste-quantity`,`stores.${o.store_id}.wasteCounts.${d}.${o.category_id}`,'STORED_VALUES_ONLY',values,'個','個','not_resolved');issue('waste_quantity_kept_separate',d,o.category_id);}
    const data={store:STORES[o.store_id],period:o.period,quantity_day:o.quantity_day,quantity_reference:o.quantity_reference,quantity_category:category.name,quantity_coverage:'PARTIAL',kpis,
      specs:METRICS.map(metric=>({metric,current_scope:'全体',reference_scope:'全体',reference:o.reference,conditions_confirmed:o.comparison_confirmed})),quantities,contexts};
    validate(data,{focus_limit:3,min_days:1,relative_threshold:fraction(1,10)});
    const identity={request_id:o.request_id,data_revision:o.data_revision,code_version:VERSION,source_revision:sourceRevision,store_id:o.store_id,category_id:o.category_id,period:o.period,reference:o.reference,quantity_reference:o.quantity_reference,as_of:o.as_of};
    if(CONFIGURED)identity.profile_revision=profileRevision;
    const normalized=freeze({data,sources,diagnostics,waste_records,request:identity});
    normalizedInputs.add(normalized);normalizedCalendars.set(normalized,book!==null);return normalized;
  }

  // Context evidence matching only. It never enables comparison or rewrites a report.
  // A supplied source/verified flag is an assertion, not authentication of that source.
  function verifyContext(normalized, supplied, suppliedPolicy=null){
    need(normalizedInputs.has(normalized),'normalized_not_from_this_engine');
    const context=copy(supplied),policy=copy(suppliedPolicy),data=normalized.data;
    const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>own(v,k));
    const id=v=>text(v)&&/^[A-Za-z0-9._-]+$/.test(v);
    const same=(a,b)=>object(b)?exact(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
    need(exact(context,['revision','comparisons','calendar'])&&id(context.revision)&&
      Array.isArray(context.comparisons)&&context.comparisons.length<=3,'invalid_context_evidence');
    if(policy!==null)need(exact(policy,['version','required_checks'])&&id(policy.version)&&
      Array.isArray(policy.required_checks)&&policy.required_checks.length>=1&&policy.required_checks.length<=16&&
      policy.required_checks.every(id)&&unique(policy.required_checks).length===policy.required_checks.length,'invalid_context_policy');
    const binding=Object.assign({},copy(normalized.request),{quantity_day:data.quantity_day,context_revision:context.revision,
      calendar_version:context.calendar===null?null:context.calendar.version});
    const recordKeys=['id','metric','binding','policy_version','unit','current_scope','reference_scope','aggregation','checks'];
    const seenMetrics=new Set(),seenIds=new Set();
    for(const record of context.comparisons){
      need(exact(record,recordKeys)&&id(record.id)&&METRICS.includes(record.metric)&&object(record.binding)&&
        id(record.policy_version)&&text(record.unit)&&text(record.current_scope)&&text(record.reference_scope)&&
        text(record.aggregation)&&Array.isArray(record.checks)&&record.checks.length<=16&&
        !seenMetrics.has(record.metric)&&!seenIds.has(record.id),'invalid_context_evidence');
      seenMetrics.add(record.metric);seenIds.add(record.id);
      const seenChecks=new Set();
      for(const check of record.checks){
        need(exact(check,['criterion','state','source','checked_at'])&&id(check.criterion)&&
          ['CONFIRMED','UNCONFIRMED','MISMATCH'].includes(check.state)&&!seenChecks.has(check.criterion), 'invalid_context_evidence');
        seenChecks.add(check.criterion);
        if(check.state==='CONFIRMED'||check.state==='MISMATCH'){
          need(text(check.source),'invalid_context_evidence');iso(check.checked_at);
          need(check.checked_at<=binding.as_of,'future_context_evidence');
        }else{
          need(check.source===null&&check.checked_at===null,'invalid_context_evidence');
        }
      }
    }
    const book=context.calendar;
    if(book!==null){
      need(exact(book,['version','verified','start','end','holidays','source','checked_at'])&&id(book.version)&&bool(book.verified)&&
        Array.isArray(book.holidays)&&unique(book.holidays).length===book.holidays.length,'invalid_context_calendar');
      // Calendar coverage may exceed a report period; apply the existing bounded-period contract.
      days(book);need(book.holidays.every(d=>{iso(d);return within(d,book); }),'invalid_context_calendar');
      if(book.verified){need(text(book.source),'invalid_context_calendar');iso(book.checked_at);
        need(book.checked_at<=binding.as_of,'future_context_evidence');}
      else need(book.source===null&&book.checked_at===null,'invalid_context_calendar');
    }
    const comparisons=METRICS.map(metric=>{
      const spec=data.specs.find(s=>s.metric===metric),record=context.comparisons.find(r=>r.metric===metric);
      const reasons=[],checks=record?record.checks:[];let mismatch=false,unconfirmed=false;
      const missing=reason=>{unconfirmed=true;reasons.push(reason);},wrong=reason=>{mismatch=true;reasons.push(reason);};
      if(policy===null)missing('policy_unprovided');
      if(!record)missing('evidence_unprovided');
      else {
        if(!same(record.binding,binding))wrong('request_binding_mismatch');
        if(policy!==null&&record.policy_version!==policy.version)wrong('policy_version_mismatch');
        if(record.unit!==UNITS[metric])wrong('unit_mismatch');
        if(record.current_scope!==spec.current_scope||record.reference_scope!==spec.reference_scope)wrong('scope_mismatch');
        if(record.aggregation!=='sum_daily')wrong('aggregation_mismatch');
        if(policy!==null){
          if(checks.some(c=>!policy.required_checks.includes(c.criterion)))wrong('unexpected_check');
          for(const key of policy.required_checks){
            const check=checks.find(c=>c.criterion===key);
            if(!check||check.state==='UNCONFIRMED')missing('check_unconfirmed:'+key);
            else if(check.state==='MISMATCH')wrong('check_mismatch:'+key);
          }
        }
      }
      const current=total(data,metric,spec.current_scope,data.period),reference=total(data,metric,spec.reference_scope,spec.reference);
      const blockers=[];
      if(current.unknown_zero)blockers.push('current_zero_unverified');
      if(reference.unknown_zero)blockers.push('reference_zero_unverified');
      if(current.value===null)blockers.push('current_incomplete');
      if(reference.value===null)blockers.push('reference_incomplete');
      if(spec.current_scope!==spec.reference_scope)blockers.push('scope_mismatch');
      if(current.expected!==reference.expected)blockers.push('duration_mismatch');
      return {metric,state:mismatch?'MISMATCH':unconfirmed?'UNCONFIRMED':'CONFIRMED',reasons,checks,
        evidence_id:record?record.id:null,policy_version:policy?policy.version:null,
        current:{days:current.expected,entered:current.entered},reference:{days:reference.expected,entered:reference.entered},
        data_blockers:blockers};
    });
    const calendarDays=sorted(unique(days(data.quantity_reference).concat(data.quantity_day))).map(day=>{
      const reason=book===null?'calendar_unprovided':!book.verified?'calendar_unverified':!within(day,book)?'calendar_out_of_range':null;
      return {day,holiday:reason===null?book.holidays.includes(day):null,reason,
        version:book?book.version:null,source:reason===null?book.source:null,checked_at:reason===null?book.checked_at:null};
    });
    return freeze({version:'context-evidence-v1',binding,policy,
      calendar_version:book?book.version:null,
      calendar_coverage:book?{start:book.start,end:book.end,verified:book.verified,source:book.source,checked_at:book.checked_at}:null,
      comparisons,calendar:calendarDays});
  }

  // Select a bounded calendar from a build-checked, caller-supplied package. No fetch or writes.
  // SHA fields are provenance metadata here; byte integrity is checked by the offline builder.
  function selectCalendar(supplied,requested,expectedVersion){
    const bundle=copy(supplied),range=copy(requested);
    const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>own(v,k));
    const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
    need(exact(bundle,['format','version','converter_version','verified','checked_at','source','coverage','holidays','content_sha256'])&&
      bundle.format==='jp-holiday-package-v1'&&bundle.converter_version==='calendar-build-v1'&&
      typeof bundle.version==='string'&&/^[A-Za-z0-9._-]{1,60}$/.test(bundle.version)&&bool(bundle.verified)&&
      hash(bundle.content_sha256),'invalid_calendar_package');
    need(typeof expectedVersion==='string'&&expectedVersion===bundle.version,'calendar_package_version_mismatch');
    const source=bundle.source;
    need(exact(source,['url','representation','original_bytes_sha256','capture_sha256','retrieved_at','reviewer'])&&
      source.url==='https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html'&&source.representation==='reviewed-page-table-transcription'&&
      source.original_bytes_sha256===null&&hash(source.capture_sha256)&&typeof source.reviewer==='string'&&
      /^[A-Za-z0-9._-]{1,80}$/.test(source.reviewer),'invalid_calendar_package');
    iso(source.retrieved_at);
    if(bundle.verified){iso(bundle.checked_at);need(source.retrieved_at<=bundle.checked_at,'invalid_calendar_package');}
    else need(bundle.checked_at===null,'invalid_calendar_package');
    need(Array.isArray(bundle.coverage)&&bundle.coverage.length>=1&&bundle.coverage.length<=8&&
      Array.isArray(bundle.holidays)&&bundle.holidays.length>=1&&bundle.holidays.length<=256,'invalid_calendar_package');
    let previous='';
    for(const span of bundle.coverage){
      need(exact(span,['start','end']),'invalid_calendar_package');days(span);
      const year=Number(span.start.slice(0,4));
      need(year>=1900&&year<=2099&&span.start===year+'-01-01'&&span.end===year+'-12-31'&&span.start>previous,'invalid_calendar_package');
      previous=span.end;
    }
    previous='';
    for(const item of bundle.holidays){
      need(exact(item,['day','name']),'invalid_calendar_package');iso(item.day);
      need(item.day>previous&&bundle.coverage.some(p=>within(item.day,p))&&typeof item.name==='string'&&
        item.name.length>=1&&item.name.length<=80&&item.name===item.name.trim()&&!/[\p{C}\p{Zl}\p{Zp}]/u.test(item.name),'invalid_calendar_package');
      previous=item.day;
    }
    need(bundle.coverage.every(span=>bundle.holidays.some(h=>within(h.day,span))),'invalid_calendar_package');
    need(exact(range,['start','end','as_of']),'invalid_calendar_range');iso(range.start);iso(range.end);iso(range.as_of);
    need(range.start<=range.end,'invalid_calendar_range');
    const length=(Date.parse(range.end+'T00:00:00Z')-Date.parse(range.start+'T00:00:00Z'))/86400000+1;
    const reason=!bundle.verified?'calendar_unverified':bundle.checked_at>range.as_of?'calendar_after_as_of':
      length>366?'calendar_range_too_large':days(range).some(d=>!bundle.coverage.some(p=>within(d,p)))?'calendar_out_of_range':null;
    const calendar=reason===null?{version:bundle.version,verified:true,start:range.start,end:range.end,
      holidays:bundle.holidays.filter(h=>within(h.day,range)).map(h=>h.day),source:'calendar-package.'+bundle.version,checked_at:bundle.checked_at}:null;
    return freeze({version:'calendar-selection-v1',package_version:bundle.version,content_sha256:bundle.content_sha256,verified:bundle.verified,checked_at:bundle.checked_at,
      requested:range,source,coverage:bundle.coverage,calendar,reason});
  }

  // Fixture-only provider: deterministic assertions from request-bound material, not authentication.
  // The caller must explicitly select this trial policy; no production policy is implied.
  function prepareContext(normalized,supplied,suppliedPolicy=null){
    need(normalizedInputs.has(normalized),'normalized_not_from_this_engine');
    need(normalized.data.specs.every(s=>s.conditions_confirmed===false),'comparison_confirmation_not_supported');
    need(normalizedCalendars.get(normalized)===false,'context_calendar_conflict');
    const material=copy(supplied),selected=copy(suppliedPolicy);
    const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>own(v,k));
    const id=v=>text(v)&&/^[A-Za-z0-9._-]+$/.test(v);
    const same=(a,b)=>object(b)?exact(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
    const criteria=['definition','weekday','holiday','event_registry'];
    need(exact(material,['revision','binding','definitions','calendar'])&&id(material.revision)&&
      Array.isArray(material.definitions)&&material.definitions.length<=3,'invalid_provider_material');
    if(selected!==null)need(exact(selected,['version','required_checks'])&&selected.version==='fixture-comparison-v1'&&
      Array.isArray(selected.required_checks)&&selected.required_checks.length===criteria.length&&
      unique(selected.required_checks).length===criteria.length&&criteria.every(k=>selected.required_checks.includes(k)),'unsupported_provider_policy');
    const rawBook=material.calendar;
    if(rawBook!==null){
      need(exact(rawBook,['version','verified','start','end','holidays','source','checked_at'])&&id(rawBook.version)&&
        bool(rawBook.verified)&&Array.isArray(rawBook.holidays)&&unique(rawBook.holidays).length===rawBook.holidays.length,'invalid_provider_calendar');
      days(rawBook);need(rawBook.holidays.every(d=>{iso(d);return within(d,rawBook); }),'invalid_provider_calendar');
      if(rawBook.verified){need(text(rawBook.source),'invalid_provider_calendar');iso(rawBook.checked_at);}
      else need(rawBook.source===null&&rawBook.checked_at===null,'invalid_provider_calendar');
    }
    // Bind to the supplied material version even if a future calendar is subsequently withheld.
    const expected=Object.assign({},copy(normalized.request),{quantity_day:normalized.data.quantity_day,
      context_revision:material.revision,calendar_version:rawBook===null?null:rawBook.version});
    need(same(material.binding,expected),'provider_binding_mismatch');
    const seen=new Set();
    for(const entry of material.definitions){
      need(exact(entry,['metric','current','reference','source','checked_at'])&&METRICS.includes(entry.metric)&&
        !seen.has(entry.metric)&&text(entry.source),'invalid_provider_definition');seen.add(entry.metric);iso(entry.checked_at);
      for(const part of [entry.current,entry.reference])need(exact(part,['version','unit','scope','aggregation'])&&
        id(part.version)&&text(part.unit)&&text(part.scope)&&text(part.aggregation),'invalid_provider_definition');
    }
    const asOf=normalized.request.as_of,lateBook=rawBook!==null&&rawBook.verified&&rawBook.checked_at>asOf;
    const context={revision:material.revision,comparisons:[],calendar:lateBook?null:rawBook};
    const policy=selected===null?null:{version:'fixture-comparison-v1',required_checks:criteria.slice()};
    const binding=Object.assign({},copy(normalized.request),{quantity_day:normalized.data.quantity_day,
      context_revision:context.revision,calendar_version:context.calendar===null?null:context.calendar.version});
    const currentDays=days(normalized.data.period),referenceDays=days(normalized.request.reference);
    const weekCounts=list=>Array.from({length:7},(_,i)=>list.filter(d=>weekday(d)===i).length);
    const currentWeek=weekCounts(currentDays),referenceWeek=weekCounts(referenceDays);
    const equalList=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const book=context.calendar;
    const holidayCounts=list=>!book||!book.verified||list.some(d=>!within(d,book))?null:
      Array.from({length:7},(_,i)=>[false,true].map(h=>list.filter(d=>weekday(d)===i&&book.holidays.includes(d)===h).length));
    const currentHoliday=holidayCounts(currentDays),referenceHoliday=holidayCounts(referenceDays);
    const registry=normalized.sources.find(s=>s.evidence_id===normalized.request.store_id+'/event-registry');
    const knownEvents=registry&&['CONFIRMED_PRESENT','CONFIRMED_NONE'].includes(registry.state)&&Array.isArray(registry.raw);
    const eventsIn=period=>knownEvents?sorted(registry.raw.filter(e=>e[0]<=period.end&&e[1]>=period.start).map(e=>e[2])):null;
    const currentEvents=eventsIn(normalized.data.period),referenceEvents=eventsIn(normalized.request.reference);
    const details=[];
    for(const metric of METRICS){
      const spec=normalized.data.specs.find(s=>s.metric===metric),definition=material.definitions.find(d=>d.metric===metric),checks=[],evaluations=[];
      function add(criterion,state,reason,current,reference,source=null,checked_at=null){
        if(policy===null){state='UNCONFIRMED';reason='policy_unprovided';source=null;checked_at=null;}
        checks.push({criterion,state,source:state==='UNCONFIRMED'?null:source,checked_at:state==='UNCONFIRMED'?null:checked_at});
        evaluations.push({criterion,state,reason,current,reference});
      }
      const definitionKnown=definition&&definition.checked_at<=asOf;
      const fits=(part,scope)=>part.unit===UNITS[metric]&&part.scope===scope&&part.aggregation==='sum_daily';
      const definitionMatches=definitionKnown&&definition.current.version===definition.reference.version&&
        fits(definition.current,spec.current_scope)&&fits(definition.reference,spec.reference_scope)&&spec.current_scope===spec.reference_scope;
      add('definition',!definitionKnown?'UNCONFIRMED':definitionMatches?'CONFIRMED':'MISMATCH',
        !definition?'definition_unprovided':!definitionKnown?'definition_after_as_of':definitionMatches?'definition_matches':'definition_mismatch',
        definition?definition.current:null,definition?definition.reference:null,definition?.source,definition?.checked_at);
      add('weekday',equalList(currentWeek,referenceWeek)?'CONFIRMED':'MISMATCH',
        equalList(currentWeek,referenceWeek)?'weekday_matches':'weekday_mismatch',currentWeek,referenceWeek,'provider.request',asOf);
      const holidayKnown=currentHoliday!==null&&referenceHoliday!==null;
      const holidayMatches=holidayKnown&&equalList(currentHoliday,referenceHoliday);
      add('holiday',!holidayKnown?'UNCONFIRMED':holidayMatches?'CONFIRMED':'MISMATCH',
        !holidayKnown?'calendar_incomplete':holidayMatches?'holiday_matches':'holiday_mismatch',currentHoliday,referenceHoliday,book?.source,book?.checked_at);
      const noEvents=knownEvents&&currentEvents.length===0&&referenceEvents.length===0;
      add('event_registry',!knownEvents?'UNCONFIRMED':noEvents?'CONFIRMED':'MISMATCH',
        !knownEvents?'event_registry_unprovided':noEvents?'no_registered_events':'registered_events_present',currentEvents,referenceEvents,
        knownEvents?'provider.event-registry':null,asOf);
      context.comparisons.push({id:'provider-'+metric,metric,binding:copy(binding),policy_version:policy?policy.version:'fixture-comparison-v1',
        unit:UNITS[metric],current_scope:spec.current_scope,reference_scope:spec.reference_scope,aggregation:'sum_daily',checks});
      details.push({metric,definition:definition||null,evaluations});
    }
    // Reuse the strict consumer contract before returning anything usable by the report path.
    const verification=verifyContext(normalized,context,policy);
    return freeze({version:'context-provider-v1',context,policy,details:{binding:material.binding,
      event_source:registry?{evidence_id:registry.evidence_id,path:registry.path,state:registry.state}:null,
      calendar:{provided:rawBook,reason:lateBook?'calendar_after_as_of':rawBook===null?'calendar_unprovided':
        !rawBook.verified?'calendar_unverified':null},comparisons:details},verification});
  }

  // Reverify raw context in this engine; a serialized verification result is not authority.
  function buildWithContext(normalized,context,policy=null,suppliedRules={}){
    need(normalizedInputs.has(normalized),'normalized_not_from_this_engine');
    need(normalized.data.specs.every(s=>s.conditions_confirmed===false),'comparison_confirmation_not_supported');
    need(normalizedCalendars.get(normalized)===false,'context_calendar_conflict');
    const rules=freeze(copy(suppliedRules)),verification=verifyContext(normalized,context,policy),prepared=copy(normalized);
    for(const spec of prepared.data.specs)spec.conditions_confirmed=verification.comparisons.find(c=>c.metric===spec.metric).state==='CONFIRMED';
    const calendar=new Map(verification.calendar.map(row=>[row.day,row.holiday]));
    for(const row of prepared.data.quantities)row.holiday=calendar.has(row.day)?calendar.get(row.day):null;
    freeze(prepared);normalizedInputs.add(prepared);
    const core=build(prepared,rules);
    const report=freeze(Object.assign({},core,{context:{version:'context-report-v1',verification,
      origin:{sources:normalized.sources,diagnostics:normalized.diagnostics},
      applied_comparisons:prepared.data.specs.map(s=>({metric:s.metric,conditions_confirmed:s.conditions_confirmed}))}}));
    reports.add(report);return report;
  }

  // Request-local lifecycle. The host must repaint getState().text after every transition.
  // Tokens are opaque, session-local and single-use; no externally supplied result is accepted.
  function createSession(){
    let generation=0,current=null,closed=false;
    const state=(status,extra={})=>freeze(Object.assign({status,generation,text:'',report:null,request:null,error:null},extra));
    let view=state('idle');
    function reset(status){generation++;current=null;view=state(status);return view;}
    function start(snapshot,request,dependencies={},rules={}){
      need(!closed,'session_closed');
      reset('pending');const mine=generation,token=Object.freeze({});
      try{
        const capturedRules=freeze(copy(rules)),capturedRequest=freeze(copy(request));
        const normalized=normalize(snapshot,capturedRequest,dependencies);
        // A resolver can synchronously close/invalidate/start another request.
        if(closed||mine!==generation)return token;
        const identity=freeze(Object.assign({options:capturedRequest,rules:capturedRules,
          code_version:VERSION,source_revision:normalized.request.source_revision},
          CONFIGURED?{profile_revision:profileRevision}:{}));
        current={token,normalized,rules:capturedRules,identity};
        view=state('pending',{request:identity});
        return token;
      }catch(error){
        if(!closed&&mine===generation){current=null;view=state('error',{error:'report_request_failed'});}
        throw error;
      }
    }
    function complete(token){
      if(closed||!current||token!==current.token)return false;
      const item=current;current=null;
      try{
        const report=build(item.normalized,item.rules),result=renderText(report);
        view=state('ready',{text:result,report,request:item.identity});return true;
      }catch(error){view=state('error',{request:item.identity,error:'report_build_failed'});throw error;}
    }
    return Object.freeze({start,complete,getState:()=>view,
      invalidate:()=>closed?view:reset('idle'),
      close:()=>{if(!closed){closed=true;reset('closed');}return view;}});
  }


  // Host notification coordinator. No listeners, DOM, persistence or automatic data reads.
  // A ticket ends only AFTER the caller's complete operation (all saves, apply and verification).
  function createHost(){
    const session=createSession(),updates=new Map();
    let generation=0,current=null,closed=false,conflict=false,held=null;
    function invalidate(){
      generation++;current=null;session.invalidate();
    }
    function getState(){
      const value=session.getState();
      return freeze(Object.assign({},value,{status:closed?'closed':conflict?'conflict':
        updates.size?'updating':held?'held':value.status,
        pending_updates:updates.size,host_generation:generation,hold_reason:held}));
    }
    function beginUpdate(kind='change'){
      if(closed||conflict)return null;
      need(text(kind),'invalid_update_kind');
      const recovery=kind==='recovery'&&updates.size===0;
      invalidate();
      const token=Object.freeze({});
      updates.set(token,{recovery,generation});return token;
    }
    function finishUpdate(token,outcome){
      if(closed||conflict||!updates.has(token))return false;
      need(['committed','cancelled','failed','rolled_back'].includes(outcome),'invalid_update_outcome');
      const item=updates.get(token);updates.delete(token);
      if(outcome==='failed'||outcome==='rolled_back')held=outcome;
      else if(item.recovery&&outcome==='committed'&&updates.size===0&&item.generation===generation)held=null;
      return true;
    }
    function request(snapshot,options,dependencies={},rules={}){
      if(closed||conflict||updates.size||held)return null;
      invalidate();const mine=generation,token=Object.freeze({});
      const inner=session.start(snapshot,options,dependencies,rules);
      if(mine===generation&&!closed&&!conflict&&!updates.size&&!held)current={token,inner,generation};
      return token;
    }
    function complete(token){
      if(closed||conflict||updates.size||held||!current||current.token!==token||
        current.generation!==generation)return false;
      const inner=current.inner;current=null;return session.complete(inner);
    }
    return Object.freeze({getState,beginUpdate,finishUpdate,request,complete,
      invalidate:()=>{if(!closed&&!conflict)invalidate();return getState();},
      externalChange:()=>{if(!closed){invalidate();updates.clear();conflict=true;held='external_change';}return getState();},
      close:()=>{if(!closed){invalidate();updates.clear();closed=true;session.close();}return getState();}});
  }

  function createConfiguredEngine(profile){need(object(profile),'invalid_store_profile');return makeEngine(profile);}


  // Injected readers only: no storage, migration, initialization or model calls.
  function createSavedReader(profile){
    const capturedProfile=freeze(copy(profile));
    createConfiguredEngine(capturedProfile); // Validate before any reader can run.
    let generation=0,closed=false;
    let view=freeze({status:'idle',generation,text:'',report:null,error:null});
    function clear(status,error=null){
      generation++;view=freeze({status,generation,text:'',report:null,error});return view;
    }
    // JSON.parse alone silently accepts duplicate object keys. Scan keys first,
    // with the same depth/node bounds as the independent-copy boundary.
    function parseSaved(raw){
      need(typeof raw==='string'&&raw.length>0&&raw.length<=2000000,'invalid_saved_text');
      let at=0,nodes=0;
      const ws=()=>{while(at<raw.length&&/[\x20\t\r\n]/.test(raw[at]))at++;};
      function string(){
        const start=at;need(raw[at++]==='"','invalid_saved_json');
        while(at<raw.length){
          const c=raw[at++];
          if(c==='"')return JSON.parse(raw.slice(start,at));
          if(c==='\\')at++;
        }
        need(false,'invalid_saved_json');
      }
      function value(depth){
        need(depth<=32&&++nodes<=100000,'saved_data_limit');ws();
        if(raw[at]==='{'){
          at++;ws();const keys=new Set();
          if(raw[at]==='}'){at++;return;}
          while(at<raw.length){
            ws();const key=string();
            need(!keys.has(key),'duplicate_saved_key');keys.add(key);
            ws();need(raw[at++]===':','invalid_saved_json');value(depth+1);ws();
            if(raw[at]==='}'){at++;return;}
            need(raw[at++ ]===',','invalid_saved_json');
          }
          need(false,'invalid_saved_json');
        }else if(raw[at]==='['){
          at++;ws();if(raw[at]===']'){at++;return;}
          while(at<raw.length){
            value(depth+1);ws();if(raw[at]===']'){at++;return;}
            need(raw[at++]===',','invalid_saved_json');
          }
          need(false,'invalid_saved_json');
        }else if(raw[at]==='"')string();
        else{
          const match=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(at));
          need(match,'invalid_saved_json');at+=match[0].length;
        }
      }
      value(0);ws();need(at===raw.length,'invalid_saved_json');
      return copy(JSON.parse(raw));
    }
    function capture(readSavedText,readRequestText,dependencies={},rules={}){
      if(closed)return false;
      clear('reading');const mine=generation;
      try{
        need(typeof readSavedText==='function'&&typeof readRequestText==='function','invalid_saved_readers');
        const capturedRules=freeze(copy(rules));
        const saved=readSavedText();
        if(closed||mine!==generation)return false;
        const requestText=readRequestText();
        if(closed||mine!==generation)return false;
        const snapshot=parseSaved(saved),request=parseSaved(requestText);
        // This entry has no independent evidence for comparison equivalence.
        need(request.comparison_confirmed===false,'comparison_confirmation_not_supported');
        const engine=createConfiguredEngine(capturedProfile);
        const normalized=engine.normalize(snapshot,request,dependencies);
        if(closed||mine!==generation)return false;
        const report=engine.build(normalized,capturedRules),result=engine.renderText(report);
        // Check after resolver/build as well; never publish a mixed capture.
        const latestSaved=readSavedText();
        if(closed||mine!==generation)return false;
        const latestRequest=readRequestText();
        if(closed||mine!==generation)return false;
        need(saved===latestSaved&&requestText===latestRequest,'saved_capture_changed');
        view=freeze({status:'ready',generation,text:result,report,error:null});
        return true;
      }catch(error){
        // Callback exceptions must not leak raw values or preserve old reports.
        if(!closed&&mine===generation)view=freeze({status:'error',generation,text:'',report:null,error:'saved_report_unavailable'});
        return false;
      }
    }
    function captureWithContext(readSavedText,readRequestText,readContextText,readPolicyText,dependencies={},rules={}){
      if(closed)return false;
      clear('reading');const mine=generation,current=()=>!closed&&mine===generation;
      try{
        const readers=[readSavedText,readRequestText,readContextText,readPolicyText];
        need(readers.every(r=>typeof r==='function'),'invalid_saved_readers');
        const capturedRules=freeze(copy(rules)),capturedDependencies=Object.create(null);
        need(object(dependencies)&&(Object.getPrototypeOf(dependencies)===Object.prototype||Object.getPrototypeOf(dependencies)===null),'invalid_dependencies');
        need(Object.getOwnPropertySymbols(dependencies).length===0,'invalid_context_dependencies');
        for(const key of Object.getOwnPropertyNames(dependencies)){
          need(['source_revision','resolver','event_reader'].includes(key),'invalid_context_dependencies');
          const descriptor=Object.getOwnPropertyDescriptor(dependencies,key);need(descriptor&&own(descriptor,'value'),'accessor_input');
          const value=descriptor.value;
          need(key==='source_revision'?text(value):value===null||typeof value==='function','invalid_dependencies');capturedDependencies[key]=value;
        }
        Object.freeze(capturedDependencies);
        const texts=[];
        for(const read of readers){texts.push(read());if(!current())return false;}
        const [snapshot,request,context,policy]=texts.map(parseSaved);
        need(request!==null&&request.comparison_confirmed===false,'comparison_confirmation_not_supported');
        const engine=createConfiguredEngine(capturedProfile),normalized=engine.normalize(snapshot,request,capturedDependencies);
        if(!current())return false;
        const report=engine.buildWithContext(normalized,context,policy,capturedRules),result=engine.renderText(report);
        for(let i=0;i<readers.length;i++){
          const latest=readers[i]();if(!current())return false;
          need(texts[i]===latest,'saved_capture_changed');
        }
        view=freeze({status:'ready',generation,text:result,report,error:null});return true;
      }catch(error){
        if(current())view=freeze({status:'error',generation,text:'',report:null,error:'saved_report_unavailable'});
        return false;
      }
    }
    return Object.freeze({capture,captureWithContext,getState:()=>view,
      invalidate:()=>closed?view:clear('idle'),
      close:()=>{if(!closed){closed=true;clear('closed');}return view;}});
  }


  // Saved input capture + explicit host notifications. This installs no listeners.
  function createSavedHost(profile){
    const reader=createSavedReader(profile),host=createHost();
    const blocked=()=>['closed','conflict','updating','held'].includes(host.getState().status);
    function getState(){
      const r=reader.getState(),h=host.getState();
      return freeze(Object.assign({},r,{status:blocked()?h.status:r.status,
        host_generation:h.host_generation,pending_updates:h.pending_updates,hold_reason:h.hold_reason}));
    }
    function capture(readSavedText,readRequestText,dependencies={},rules={}){
      if(blocked())return false; // Do not inspect inputs while unstable.
      host.invalidate();
      return reader.capture(readSavedText,readRequestText,dependencies,rules);
    }
    function captureWithContext(readSavedText,readRequestText,readContextText,readPolicyText,dependencies={},rules={}){
      if(blocked())return false;
      host.invalidate();
      return reader.captureWithContext(readSavedText,readRequestText,readContextText,readPolicyText,dependencies,rules);
    }
    function beginUpdate(kind='change'){
      reader.invalidate();
      return host.beginUpdate(kind);
    }
    return Object.freeze({getState,capture,captureWithContext,beginUpdate,
      finishUpdate:(ticket,outcome)=>host.finishUpdate(ticket,outcome),
      invalidate:()=>{reader.invalidate();host.invalidate();return getState();},
      externalChange:()=>{reader.invalidate();host.externalChange();return getState();},
      close:()=>{reader.close();host.close();return getState();}});
  }

  // Public exports contain no test/runtime I/O.
  return Object.freeze({VERSION,normalize,build,renderText,verifyContext,selectCalendar,prepareContext,buildWithContext,createSession,createHost,createConfiguredEngine,createSavedReader,createSavedHost});
});

