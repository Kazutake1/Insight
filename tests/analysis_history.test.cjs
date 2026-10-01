const test=require('node:test');
const assert=require('node:assert/strict');
const history=require('../insight_analysis_history_v1.js');

function isoShift(value,days){
  const d=new Date(value+'T12:00:00');
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
function weeklyFake(){
  const rows={
    '2026-10-01':{end:'2026-10-01',start:'2026-09-28',items:[
      {key:'sales',title:'売上低下',type:'sales',theme:'sales',level:'attention',positive:false,state:'improving',magnitude:6}
    ]},
    '2026-09-27':{end:'2026-09-27',start:'2026-09-21',items:[
      {key:'sales',title:'売上低下',type:'sales',theme:'sales',level:'attention',positive:false,state:'continuing',magnitude:10}
    ]},
    '2026-09-20':{end:'2026-09-20',start:'2026-09-14',items:[
      {key:'sales',title:'売上低下',type:'sales',theme:'sales',level:'important',positive:false,state:'new',magnitude:14}
    ]},
    '2026-09-13':{end:'2026-09-13',start:'2026-09-07',items:[]}
  };
  return {
    referenceDate(){return '2026-10-01';},
    weekWindow(ref){
      if(ref==='2026-10-01')return {startDate:'2026-09-28',endDate:'2026-10-01'};
      const d=new Date(ref+'T12:00:00'),day=d.getDay(),off=day===0?-6:1-day;
      const s=new Date(d);s.setDate(d.getDate()+off);
      return {startDate:s.toISOString().slice(0,10),endDate:ref};
    },
    review(ref){
      const row=rows[ref]||{end:ref,start:isoShift(ref,-6),items:[]};
      return {
        period:{startDate:row.start,endDate:row.end},
        current:{metrics:{inputDays:4},salesCount:{categories:[]}},
        items:row.items,
        display:row.items,
        conclusion:['週次結論']
      };
    }
  };
}

function monthlyFake(){
  return {
    review(options){
      const key=options.year+'-'+String(options.month).padStart(2,'0');
      const item=key==='2026-10'
        ?[{key:'waste',title:'廃棄金額悪化',type:'waste',theme:'waste',level:'attention',positive:false,primaryChange:12}]
        :key==='2026-09'
          ?[{key:'waste',title:'廃棄金額悪化',type:'waste',theme:'waste',level:'important',positive:false,primaryChange:20}]
          :[];
      return {
        period:{year:options.year,month:options.month,throughDay:options.throughDay,completed:key!=='2026-10'},
        current:{metrics:{inputDays:10},profitCost:{available:false},salesCount:{categories:[]}},
        items:item,
        display:item,
        conclusion:['月次結論']
      };
    }
  };
}

test('週次履歴は現在週と過去週を新しい順で再構築する',()=>{
  const result=history.build({kind:'week',referenceDate:'2026-10-01',storeId:'storeA',count:4},{WeeklyReview:weeklyFake()});
  assert.equal(result.entries.length,4);
  assert.deepEqual(result.entries.map(e=>e.id),[
    'week:2026-10-01','week:2026-09-27','week:2026-09-20','week:2026-09-13'
  ]);
  assert.equal(result.entries[0].label,'9/28〜10/1');
});

test('週次異常の開始・継続・改善を時系列で追跡する',()=>{
  const result=history.build({kind:'week',referenceDate:'2026-10-01',storeId:'storeA',count:4},{WeeklyReview:weeklyFake()});
  const trace=result.traces.find(t=>t.key==='sales');
  assert.ok(trace);
  assert.equal(trace.startLabel,'9/14〜9/20');
  assert.equal(trace.periods,3);
  assert.equal(trace.status,'improving');
  assert.match(result.traceLine(trace),/3週継続/);
  assert.match(result.traceLine(trace),/改善中/);
});

test('異常が次期間で消えた場合は解消時期を記録する',()=>{
  const entries=[
    {id:'week:1',sortDate:'2026-09-01',label:'9/1',items:[{key:'sales',title:'売上低下',type:'sales',theme:'sales',level:'attention',positive:false,magnitude:10}]},
    {id:'week:2',sortDate:'2026-09-08',label:'9/8',items:[{key:'sales',title:'売上低下',type:'sales',theme:'sales',level:'attention',positive:false,magnitude:8}]},
    {id:'week:3',sortDate:'2026-09-15',label:'9/15',items:[]}
  ];
  const traces=history.buildTimeline(entries);
  assert.equal(traces[0].status,'resolved');
  assert.equal(traces[0].resolvedLabel,'9/15');
  assert.match(history.traceLine(traces[0]),/解消/);
});

test('月次履歴は比較年差を保ったまま過去月を再計算する',()=>{
  const calls=[];
  const MonthlyReview=monthlyFake();
  const original=MonthlyReview.review;
  MonthlyReview.review=function(options){
    calls.push({...options});
    return original(options);
  };
  const result=history.build({
    kind:'month',year:2026,month:10,throughDay:20,compareYear:2025,storeId:'storeA',count:3
  },{MonthlyReview});
  assert.equal(result.entries.length,3);
  assert.equal(calls[0].compareYear,2025);
  assert.equal(calls[1].compareYear,2025);
  assert.equal(calls[2].compareYear,2025);
  assert.equal(calls[0].throughDay,20);
  assert.equal(calls[1].throughDay,30);
});

test('月次の悪化が縮小した場合は改善中として追跡する',()=>{
  const result=history.build({
    kind:'month',year:2026,month:10,throughDay:20,compareYear:2025,storeId:'storeA',count:3
  },{MonthlyReview:monthlyFake()});
  const trace=result.traces.find(t=>t.key==='waste');
  assert.ok(trace);
  assert.equal(trace.periods,2);
  assert.equal(trace.status,'improving');
  assert.match(result.traceLine(trace),/2か月継続/);
});

test('保存データがない期間は履歴一覧から除外する',()=>{
  const WeeklyReview=weeklyFake();
  const original=WeeklyReview.review;
  WeeklyReview.review=function(ref){
    const r=original(ref);
    if(ref==='2026-09-27')r.current.metrics.inputDays=0;
    return r;
  };
  const result=history.build({kind:'week',referenceDate:'2026-10-01',count:3},{WeeklyReview});
  assert.equal(result.entries.some(e=>e.id==='week:2026-09-27'),false);
});
