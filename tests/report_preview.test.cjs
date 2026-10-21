'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {reportFixture}=require('./report_fixture.cjs');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'insight_storage_v1.js'),'utf8');
const api=require('../insight_report_v1.js');
function setup(){
  const fixture=reportFixture(),values={insight_v11:JSON.stringify(fixture)},events=[],listeners={};let fail=false;
  const window={SK:'insight_v11',localStorage:{getItem:key=>values[key]??null,setItem(key,value){if(fail)throw Error('quota');values[key]=value;}},
    addEventListener:(name,fn)=>{listeners[name]=fn;},InsightReportPreview:{onStorageUpdate:e=>events.push(e)}};
  const context=vm.createContext({window,SK:'insight_v11',JSON,Error,console});
  vm.runInContext(source,context);
  return {window,storage:window.InsightStorage,fixture,values,events,listeners,fail:value=>{fail=value;}};
}
test('private write inside transaction notifies through full apply',()=>{
  const f=setup();const observations=[];
  f.window.InsightReportPreview.onStorageUpdate=e=>{f.events.push(e);observations.push(f.storage.reportState().pending);};
  f.storage.transaction(f.fixture,next=>{next.stores.store_a.data['2026']['10月'][18].売上=70;},null,()=>{
    assert.ok(f.storage.reportState().pending>0);assert.equal(f.events.filter(e=>e.phase==='finish').length,1);
  });
  assert.equal(f.events.filter(e=>e.phase==='begin').length,2);assert.equal(f.events.filter(e=>e.phase==='finish').length,2);
  assert.deepEqual(observations,[1,2,1,0]);assert.equal(f.storage.reportState().held,false);
});
test('notification exception never changes successful save or return',()=>{
  const f=setup();f.window.InsightReportPreview.onStorageUpdate=()=>{throw Error('observer');};
  assert.equal(f.storage.persistCurrent(f.fixture),true);
  assert.equal(JSON.parse(f.values.insight_v11).schemaVersion,1);assert.equal(f.storage.reportState().held,false);
});
test('serialization failure clears report and is held without writing',()=>{
  const f=setup(),raw=f.values.insight_v11;assert.throws(()=>f.storage.writeSnapshot({schemaVersion:99}),/新しいInsight/);
  assert.equal(f.values.insight_v11,raw);assert.equal(f.events[0].phase,'begin');
  assert.equal(f.storage.reportState().held,true);assert.equal(f.storage.reportState().pending,0);
});
test('quota failure preserves saved data and original error',()=>{
  const f=setup(),raw=f.values.insight_v11;f.fail(true);
  assert.throws(()=>f.storage.persistCurrent(f.fixture),/quota/);assert.equal(f.values.insight_v11,raw);
  assert.equal(f.storage.reportState().held,true);assert.equal(f.events.at(-1).outcome,'failed');
});
test('successful later write cannot acknowledge a reporting failure',()=>{
  const f=setup();f.fail(true);assert.throws(()=>f.storage.writeSnapshot(f.fixture));
  f.fail(false);f.storage.writeSnapshot(f.fixture);assert.equal(f.storage.reportState().held,true);
});
test('apply failure remains held after successful write',()=>{
  const f=setup();assert.throws(()=>f.storage.transaction(f.fixture,n=>{n.current='store_b';},null,()=>{throw Error('apply');}),/apply/);
  assert.equal(JSON.parse(f.values.insight_v11).current,'store_b');assert.equal(f.storage.reportState().held,true);
});
test('metadata only invalidates reports for main data key',()=>{
  const f=setup();f.storage.writeMetadata('insight_dark','1');assert.equal(f.events.length,0);
  f.storage.writeMetadata('insight_v11',f.values.insight_v11);assert.deepEqual(f.events.map(e=>e.phase),['begin','finish']);
});
test('external data and clear notify without changing save conflict behavior',()=>{
  for(const key of ['insight_v11',null]){
    const f=setup();f.listeners.storage({key,newValue:null});assert.equal(f.events[0].phase,'external');
    assert.equal(f.storage.reportState().conflict,true);assert.throws(()=>f.storage.writeSnapshot(f.fixture),e=>e.name==='InsightStorageConflictError');
  }
});
test('unrelated external metadata leaves reports alone',()=>{
  const f=setup();f.listeners.storage({key:'insight_dark',newValue:'1'});assert.equal(f.events.length,0);assert.equal(f.storage.reportState().conflict,false);
});
test('unnotified raw changes cannot be acknowledged by readSnapshot',()=>{
  const f=setup();f.values.insight_v11+=' ';f.storage.readSnapshot();assert.equal(f.storage.reportState().conflict,true);
});
test('configured report is read only and retains unknown zero',()=>{
  const f=setup(),before=f.values.insight_v11;
  const h=api.createSavedHost({revision:'integration-test',stores:[{id:'store_a',name:'架空店舗A'},{id:'store_b',name:'架空店舗B'}]});
  const request={store_id:'store_a',period:{start:'2026-10-19',end:'2026-10-19'},reference:{start:'2026-10-12',end:'2026-10-12'},
    quantity_day:'2026-10-19',quantity_reference:{start:'2026-09-28',end:'2026-09-29'},category_id:'food',as_of:'2026-10-20',
    comparison_confirmed:false,request_id:'integration-test',data_revision:'0'};
  assert.equal(h.capture(()=>f.values.insight_v11,()=>JSON.stringify(request)),true);
  assert.equal(h.getState().report.kpis[0].current.value,80000);assert.equal(h.getState().report.kpis[1].current.value,null);
  assert.match(h.getState().text,/日合計0個で確定/);assert.match(h.getState().text,/判定できません/);
  assert.equal(f.values.insight_v11,before);assert.equal(f.events.length,0);
});
test('preview and core add no outbound API or report persistence calls',()=>{
  for(const name of ['insight_report_v1.js','insight_report_preview_v1.js']){
    const text=fs.readFileSync(path.join(root,name),'utf8');
    assert.doesNotMatch(text,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.setItem|console\.(log|warn|error)\s*\(/);
  }
});


// Pin the reviewed public package and unchanged lab engine used by this host.
const crypto=require('node:crypto');
const previewSource=fs.readFileSync(path.join(root,'insight_report_preview_v1.js'),'utf8');
const embeddedMatch=previewSource.match(/\/\* reviewed-calendar:start \*\/([\s\S]*?)\/\* reviewed-calendar:end \*\//);
assert.ok(embeddedMatch,'reviewed calendar package must be embedded');
const embeddedCalendar=JSON.parse(embeddedMatch[1]);
const calendarVersion="cao-table-2026-2027-20261021-0b2cdf75cf19";
function canonical(v){
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
function calendarCapture(options={}){
  const snapshot=reportFixture(),store=snapshot.stores.store_a;
  store.tripHistoryOverrides={version:1,categories:{food:{'2026-09':{'1':'active','2':'inactive','3':'inactive'}}}};
  if(options.mutate)options.mutate(snapshot);
  const raw=JSON.stringify(snapshot),before=raw;
  const request={store_id:'store_a',period:{start:'2026-10-19',end:'2026-10-19'},reference:{start:'2026-10-12',end:'2026-10-12'},
    quantity_day:'2026-10-19',quantity_reference:options.reference||{start:'2026-09-28',end:'2026-09-29'},
    category_id:'food',as_of:options.as_of||'2026-10-21',comparison_confirmed:false,request_id:'calendar-test',data_revision:'calendar-fixture'};
  if(options.request)Object.assign(request,options.request);
  const selected=api.selectCalendar(embeddedCalendar,{...request.quantity_reference,as_of:request.as_of},calendarVersion);
  const deps={source_revision:'calendar-fixture',calendar_book:selected.calendar};
  if(options.resolver!==false)deps.resolver=(...args)=>require('../insight_trip_history_resolver_v1.js').resolveDate(...args);
  const host=api.createSavedHost({revision:'calendar-fixture',stores:[{id:'store_a',name:'架空店舗A'},{id:'store_b',name:'架空店舗B'}]});
  assert.equal(host.capture(()=>raw,()=>JSON.stringify(request),deps,{min_days:2}),true);
  assert.equal(raw,before);assert.equal(JSON.stringify(snapshot),before);
  return {report:host.getState().report,text:host.getState().text,selected,raw,request};
}
test('report engine is an unchanged copy of reviewed lab main d732aa5',()=>{
  const text=fs.readFileSync(path.join(root,'insight_report_v1.js'),'utf8');
  assert.equal(crypto.createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex'),"02a8c7fff7b4a893a56ac0efe5af2fa598dfcad0");
});
test('embedded calendar matches reviewed package content digest and version',()=>{
  const {content_sha256,...body}=embeddedCalendar;
  assert.equal(content_sha256,"6c66c7253f57d8af7e6ff5d66a633044df3629e357f968d7a7cff4153d2517bc");
  assert.equal(crypto.createHash('sha256').update(canonical(body)).digest('hex'),content_sha256);
  assert.equal(embeddedCalendar.version,calendarVersion);assert.equal(embeddedCalendar.holidays.length,35);
  assert.equal(embeddedCalendar.source.original_bytes_sha256,null);
  assert.match(previewSource,/var CALENDAR_VERSION=/);assert.doesNotMatch(previewSource,/captureWithContext|prepareContext/);
});
test('calendar enables confirmed weekday mean while KPI comparisons remain held',()=>{
  const {report}=calendarCapture();
  assert.deepEqual(report.weekday.value,{numerator:'15',denominator:'1'});assert.equal(report.weekday.entered,2);
  assert.equal(report.daily.value,0);assert.equal(report.kpis[0].reason,'conditions_unconfirmed');
  assert.equal(report.kpis[1].reason,'current_zero_unverified');assert.ok(report.kpis.every(k=>!k.comparable));
});
test('confirmed holiday and weekend values are excluded from weekday mean',()=>{
  const {report}=calendarCapture({reference:{start:'2026-09-21',end:'2026-09-27'},mutate:s=>{
    for(const [i,n]of [90,50,70,10,20,900,800].entries()){
      const record=JSON.parse(JSON.stringify(s.stores.store_a.salesCounts['2026-10-19']));
      record.food.trips[0]={sales:n,delivery:n};s.stores.store_a.salesCounts['2026-09-'+(21+i)]=record;
    }
  }});
  assert.equal(report.weekday.value.numerator,'15');assert.equal(report.weekday.entered,2);
});
test('entered trip zero remains in average',()=>{
  const {report}=calendarCapture({mutate:s=>{s.stores.store_a.salesCounts['2026-09-28'].food.trips[0]={sales:0,delivery:0};}});
  assert.equal(report.weekday.value.numerator,'10');assert.equal(report.weekday.entered,2);
});
test('calendar cannot supply unknown historical trips',()=>{
  const {report}=calendarCapture({resolver:false});assert.equal(report.weekday.value,null);assert.equal(report.daily.value,0);
});
test('calendar cannot supply missing event registry',()=>{
  const {report}=calendarCapture({mutate:s=>{delete s.eventManagement;}});
  assert.equal(report.weekday.value,null);assert.equal(report.daily.value,0);
});
test('calendar review after as_of remains held',()=>{
  const {report,selected}=calendarCapture({as_of:'2026-10-20'});
  assert.equal(selected.reason,'calendar_after_as_of');assert.equal(report.weekday.value,null);assert.equal(report.kpis[0].current.value,80000);
});
test('unsupported year remains unknown instead of an empty holiday list',()=>{
  const selected=api.selectCalendar(embeddedCalendar,{start:'2025-09-29',end:'2025-09-30',as_of:'2026-10-21'},calendarVersion);
  assert.equal(selected.calendar,null);assert.equal(selected.reason,'calendar_out_of_range');
});
test('registered event is still excluded after holiday confirmation',()=>{
  const {report}=calendarCapture({mutate:s=>{s.eventManagement.events.push({id:'fixture-sale',type:'sale',scope:'global',
    startDate:'2026-09-28',endDate:'2026-09-28'});}});
  assert.equal(report.weekday.value.numerator,'20');assert.equal(report.weekday.entered,1);
});


// Exercise the private production formatter; it is not a public adoption/evidence API.
const detailsMatch=previewSource.match(/\/\/ comparison-details:start([\s\S]*?)\/\/ comparison-details:end/);
assert.ok(detailsMatch);
const detailsContext=vm.createContext({root:{InsightReport:{selectCalendar:(...args)=>api.selectCalendar(...args.map(a=>JSON.parse(JSON.stringify(a))))}},calendarPackage:embeddedCalendar,
  CALENDAR_VERSION:calendarVersion,Date,JSON,Set});
vm.runInContext(previewSource.match(/  function shift\(iso,n\)\{[^\n]+/)[0]+'\n'+detailsMatch[1],detailsContext);
function detailsFor(options={}){
  const capture=calendarCapture(options),before=JSON.stringify(capture);
  const details=detailsContext.comparisonDetails(capture.raw,JSON.stringify(capture.request),capture.report);
  assert.equal(JSON.stringify(capture),before);assert.ok(capture.report.kpis.every(k=>!k.comparable&&k.delta===null));
  return {...capture,details};
}
test('details retain independent input, sample, calendar and definition blockers',()=>{
  const {details}=detailsFor();
  assert.match(details,/廃棄金額：当期の入力済み確認0日／対象1日。当期の保存値0は1日分の入力状態が不明。当期は全対象日の入力確認が未完了/);
  assert.match(details,/最低入力済み日数2日に未達/);
  assert.match(details,/曜日構成：一致。当期 月曜1日／比較期間 月曜1日/);
  assert.match(details,/祝日構成（曜日別）：違いあり。当期 該当日なし／比較期間 月曜1日/);
  assert.match(details,/イベント登録：当期 登録なし／比較期間 登録なし。実際の開催有無や登録条件の同等性は未確認/);
  assert.match(details,/集計定義：未確認/);
  assert.match(details,/確認日 2026-10-21/);
});
test('equal holiday totals on different weekdays are not identical composition',()=>{
  const {details}=detailsFor({request:{period:{start:'2026-03-20',end:'2026-03-20'},quantity_day:'2026-03-20',
    reference:{start:'2026-02-23',end:'2026-02-23'},quantity_reference:{start:'2026-02-16',end:'2026-02-17'}}});
  assert.match(details,/曜日構成：違いあり/);
  assert.match(details,/祝日構成（曜日別）：違いあり。当期 金曜1日／比較期間 月曜1日/);
});
test('equal supported profiles do not authorize any KPI comparison',()=>{
  const {details,report}=detailsFor({request:{reference:{start:'2026-10-05',end:'2026-10-05'}}});
  assert.match(details,/祝日構成（曜日別）：一致/);assert.match(details,/増減は引き続き保留/);
  assert.ok(report.kpis.every(k=>!k.comparable));
});
test('partial calendar evidence and future review remain unknown independently',()=>{
  const old=detailsFor({request:{reference:{start:'2025-10-13',end:'2025-10-13'}},mutate:s=>{Object.values(s.stores).forEach(store=>store.years.push('2025'));}}).details;
  assert.match(old,/祝日構成：未確認。当期 資料確認済み／比較期間 資料の確認範囲外/);
  const future=detailsFor({as_of:'2026-10-20'}).details;
  assert.match(future,/祝日構成：未確認。当期 基準日時点では資料未確認／比較期間 基準日時点では資料未確認/);
});
test('unprovided and invalid event registries never become no registered events',()=>{
  for(const mutate of [s=>{delete s.eventManagement;},s=>{delete s.stores.store_a.events;},
    s=>{s.eventManagement.events=[{id:'broken',type:'sale',scope:'global',startDate:'2026-02-30',endDate:'2026-10-19'}];},
    s=>{s.eventManagement.events=[{id:'bad\u200b',type:'sale',scope:'global',startDate:'2026-10-19',endDate:'2026-10-19'}];}]){
    const {details}=detailsFor({mutate});assert.match(details,/イベント登録：未確認/);
    assert.doesNotMatch(details,/イベント登録：当期 登録なし/);
  }
});
test('event overlap uses captured store and both KPI periods, not quantity reference',()=>{
  const {details}=detailsFor({mutate:s=>{
    s.eventManagement.events=[{id:'global-current',scope:'global',type:'sale',startDate:'2026-10-18',endDate:'2026-10-20'}];
    s.stores.store_a.events=[{id:'store-reference',scope:'store',type:'nearby',startDate:'2026-10-12',endDate:'2026-10-12'}];
    s.stores.store_b.events=[{id:'other-store',scope:'store',type:'nearby',startDate:'2026-10-19',endDate:'2026-10-19'}];
  }});
  assert.match(details,/イベント登録：当期 1件の登録あり／比較期間 1件の登録あり/);
  assert.match(details,/登録条件の同等性は未確認/);
});
test('duplicate or wrong-scope events remain unknown',()=>{
  for(const events of [
    [{id:'x',scope:'global',type:'nearby',startDate:'2026-10-19',endDate:'2026-10-19'}],
    Array.from({length:2},()=>({id:'same',scope:'global',type:'sale',startDate:'2026-10-19',endDate:'2026-10-19'}))
  ])assert.match(detailsFor({mutate:s=>{s.eventManagement.events=events;}}).details,/イベント登録：未確認/);
});
test('missing rows and unequal durations are retained independently',()=>{
  const {details}=detailsFor({request:{period:{start:'2026-10-19',end:'2026-10-20'}},mutate:s=>{
    s.stores.store_a.data['2026']['10月']=s.stores.store_a.data['2026']['10月'].filter(r=>String(r.d)!=='20');
  }});
  assert.match(details,/当期の入力済み確認1日／対象2日。当期は全対象日の入力確認が未完了/);
  assert.match(details,/対象日数に違いあり/);
  assert.match(details,/曜日構成：違いあり。当期 月曜1日・火曜1日／比較期間 月曜1日/);
});
test('weekday and holiday observations cover the whole period, not only saved KPI rows',()=>{
  const {details}=detailsFor({request:{period:{start:'2026-10-19',end:'2026-10-20'},
    reference:{start:'2026-10-12',end:'2026-10-13'}}});
  assert.match(details,/曜日構成：一致。当期 月曜1日・火曜1日／比較期間 月曜1日・火曜1日/);
  assert.match(details,/祝日構成（曜日別）：違いあり/);
});
