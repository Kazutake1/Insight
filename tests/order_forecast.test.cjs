const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const model=require('../insight_order_forecast_v1.js');
test('セール・イベントのタップ表示は登録時のsnapshot.titleを正しく参照し複数件を保つ',()=>{
  const data=[
    {type:'sale',title:'旧名',snapshot:{title:'おにぎりセール'}},
    {type:'sale',snapshot:{title:'サンドイッチ2個割引'}},
    {type:'nearby',snapshot:{title:'地域の秋祭り'}},
    {type:'special',snapshot:{title:'地域の秋祭り'}},
    {type:'staff',name:'応援イベント',snapshot:{}},
    {type:'sale',snapshot:{title:'<b>文字列のまま</b>'}},
    {type:'sale',snapshot:{}}
  ];
  const before=JSON.stringify(data);
  assert.deepEqual(model.eventItems(data),[
    {kind:'sale',name:'おにぎりセール'},
    {kind:'sale',name:'サンドイッチ2個割引'},
    {kind:'event',name:'地域の秋祭り'},
    {kind:'event',name:'地域の秋祭り'},
    {kind:'event',name:'応援イベント'},
    {kind:'sale',name:'<b>文字列のまま</b>'},
    {kind:'sale',name:'名称未登録'}
  ]);
  assert.equal(JSON.stringify(data),before);
  assert.deepEqual(model.eventItems(null),[]);
});
test('気象庁の天気コードに応じて晴・曇・雨・雪と複合予報のアイコン種別を返す',()=>{const cases={100:'sun',101:'partly',112:'sunRain',115:'sunSnow',200:'cloud',201:'partly',202:'cloudRain',204:'cloudSnow',300:'rain',301:'sunRain',303:'rainSnow',311:'sunRain',400:'snow',401:'sunSnow',403:'rainSnow',413:'cloudSnow'};Object.entries(cases).forEach(([code,kind])=>assert.equal(model.weatherIconKind(code),kind,code));for(const code of [null,'','999','__proto__'])assert.equal(model.weatherIconKind(code),null);});
test('発注10/9午後なら締切10/10 11時、納品10/11である',()=>{const orderDate='2026-10-09',delivery=model.addDays(orderDate,2);assert.equal(model.addDays(orderDate,1),'2026-10-10');assert.equal(delivery,'2026-10-11');assert.equal(model.addDays(delivery,-2),orderDate);assert.equal(model.addDays(delivery,-1),'2026-10-10');});
test('天気予報の日付は日曜・祝日が赤、土曜が青（祝日優先）',()=>{const holiday=(y,m,d)=>y===2026&&m===10&&(d===12||d===10);assert.equal(model.weatherDayTone('2026-10-11',holiday),'sun');assert.equal(model.weatherDayTone('2026-10-10',()=>false),'sat');assert.equal(model.weatherDayTone('2026-10-12',holiday),'sun');assert.equal(model.weatherDayTone('2026-10-10',holiday),'sun');assert.equal(model.weatherDayTone('2026-10-13',holiday),'');});
const sales=require('../insight_sales_count_v1.js');
const category={id:'food',activeTrips:[true,false,true]};
const record=(d,s)=>({trips:[{delivery:d,sales:s},{delivery:999,sales:999},{delivery:null,sales:null}]});
const areas={class20s:{'23220':{name:'稲沢市',parent:'230011'}},class15s:{'230011':{parent:'230010'}},class10s:{'230010':{name:'西部',parent:'230000'}},offices:{'230000':{name:'愛知県'}}};
const location={name:'稲沢市',admin1:'愛知県',latitude:35.25,longitude:136.8};
const target=model.resolveLocation(location,areas);
const points={'51106':{lat:[35,10],lon:[136,58]}};
function forecast(){return [{reportDatetime:'2026-10-09T17:00:00+09:00',timeSeries:[{timeDefines:['2026-10-09T17:00:00+09:00','2026-10-10T00:00:00+09:00'],areas:[{area:{code:'230010'},weatherCodes:['111','101'],weathers:['晴れ 夜遅く くもり','晴れ 朝晩 くもり']}]},{timeDefines:['2026-10-09T18:00:00+09:00','2026-10-10T00:00:00+09:00','2026-10-10T06:00:00+09:00'],areas:[{area:{code:'230010'},pops:['0','0','20']}]},{timeDefines:['2026-10-10T00:00:00+09:00','2026-10-10T09:00:00+09:00'],areas:[{area:{code:'51106',name:'名古屋'},temps:['18','28']}]}]},{timeSeries:[{timeDefines:['2026-10-10T00:00:00+09:00','2026-10-11T00:00:00+09:00'],areas:[{area:{code:'230000'},weatherCodes:['101','202'],pops:['','50']}]},{timeDefines:['2026-10-10T00:00:00+09:00','2026-10-11T00:00:00+09:00'],areas:[{area:{code:'51106',name:'名古屋'},tempsMin:['','17'],tempsMax:['','29']}]}]}];}
test('月末・年末・閏年の日付計算と日本時間の初期日',()=>{
  assert.equal(model.addDays('2024-02-28',2),'2024-03-01');
  assert.equal(model.addDays('2026-12-31',2),'2027-01-02');
  assert.equal(model.addDays('2026-10-01',-3),'2026-09-28');
  assert.equal(model.today(new Date('2026-10-09T15:01:00Z')),'2026-10-10');
  assert.throws(()=>model.addDays('2026-02-29',1));assert.throws(()=>model.addDays('2026-13-01',1));
});
test('52週間前は閏年を跨いでも曜日が一致し前後3日を含む',()=>{
  for(const day of ['2024-02-29','2025-01-01','2026-12-31']){const dates=model.dates(day);assert.equal(dates.previousYear.length,7);assert.equal(new Date(day).getUTCDay(),new Date(dates.previousYear[3]).getUTCDay());assert.equal(dates.previousYear[6],model.addDays(dates.previousYear[0],6));}
});
test('直近実績はD-7からD-3まで・未入力除外・0有効・対象外便除外',()=>{
  const saved={'2026-10-11':{food:record(0,null)},'2026-10-12':{food:record(null,null)},'2026-10-15':{food:record(null,4)},'2026-10-16':{food:record(9,9)},'2026-10-17':{food:record(9,9)}};
  const before=JSON.stringify(saved);const data=model.collect(saved,category,'2026-10-18',sales);
  assert.deepEqual(data.recent.map(x=>x.date),['2026-10-11','2026-10-15']);assert.equal(JSON.stringify(saved),before);
});
test('6週平均は6週の便・納品販売別有効件数・0を含みセール等で除外しない',()=>{
  const saved={'2026-09-06':{food:record(30,6)},'2026-09-13':{food:record(0,0)},'2026-09-20':{food:record(0,4)},'2026-09-27':{food:record(10,null)},'2026-10-04':{food:record(null,8)},'2026-10-11':{food:record(20,0)}};
  saved['2026-10-04'].food.trips[2]={delivery:8,sales:2};
  const data=model.collect(saved,category,'2026-10-18',sales);
  assert.deepEqual(data.weeks.map(x=>x.date),['2026-09-06','2026-09-13','2026-09-20','2026-09-27','2026-10-04','2026-10-11']);
  assert.deepEqual(data.deliveryAverage.trips,[12,null,8]);assert.deepEqual(data.salesAverage.trips,[3.6,null,2]);assert.equal(data.deliveryAverage.total,null);assert.equal(data.salesAverage.total,10);
  assert.equal(model.collect(saved,{id:'other',activeTrips:[true,true,true]},'2026-10-18',sales).recent.length,0);
});
test('地点は自治体と都道府県で特定し不明・曖昧な地点は代用しない',()=>{
  assert.equal(target.office,'230000');assert.equal(target.area,'230010');assert.equal(model.resolveLocation(null,areas).area,'230010');
  assert.throws(()=>model.resolveLocation({...location,name:'不明市'},areas));assert.throws(()=>model.resolveLocation({...location,admin1:'東京都'},areas));
});
test('7日分を作り短期と週間を結合、未発表の気温は0にしない',()=>{
  const data=model.parseForecast(forecast(),target,areas,points,'2026-10-09');
  assert.equal(data.days.length,7);assert.equal(data.days[0].min,null);assert.equal(data.days[0].max,null);assert.equal(data.days[0].pop,0);
  assert.equal(data.days[1].min,18);assert.equal(data.days[1].max,28);assert.equal(data.days[1].pop,20);
  assert.equal(data.days[0].weatherCode,'111');assert.equal(data.days[1].weatherCode,'101');assert.equal(data.days[2].weatherCode,'202');assert.equal(data.days[2].weather,'くもり一時雨');assert.equal(data.days[6].weatherCode,null);assert.equal(data.days[2].pop,50);assert.equal(data.days[6].weather,'—');
  assert.throws(()=>model.parseForecast({},target,areas,points,'2026-10-09'));
});
test('取得はメモリのみ、同時取得集約・30分キャッシュ・手動更新は60秒制限',async()=>{
  let now=Date.parse('2026-10-09T13:00:00Z'),calls=[];
  const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('area.json')?areas:url.endsWith('amedastable.json')?points:forecast()};};
  const client=model.createClient(fetcher,()=>now);
  const [a,b]=await Promise.all([client.load(location),client.load(location)]);assert.equal(calls.length,3);assert.equal(a.fetchedAt,b.fetchedAt);
  await client.load(location,true);assert.equal(calls.length,3);
  now+=61000;const c=await client.load(location,true);assert.equal(calls.length,4);assert.equal(c.fetchedAt,now);
  now+=1000;await client.load(location);assert.equal(calls.length,4);
  now+=1800001;await client.load(location);assert.equal(calls.length,5);
  calls.forEach(c=>{assert.equal(c.options.cache,'no-store');assert.equal(c.options.credentials,'omit');assert.match(c.url,/^https:\/\/www.jma.go.jp\//);assert.ok(!c.url.includes('sales'));});
});
test('通信エラーを伝え再試行の連打を抑える',async()=>{
  let calls=0,now=0;const client=model.createClient(async()=>{calls++;return {ok:false};},()=>now);
  await assert.rejects(client.load(location),/取得できません/);assert.equal(calls,2);
  await assert.rejects(client.load(location),/時間をおいて/);assert.equal(calls,2);
  now=61000;await assert.rejects(client.load(location),/取得できません/);assert.equal(calls,4);
});
test('新機能は永続保存・実績保存・外部記憶更新を持たない',()=>{
  const text=fs.readFileSync(require.resolve('../insight_order_forecast_v1.js'),'utf8');assert.doesNotMatch(text,/localStorage|sessionStorage|indexedDB|writeSnapshot|\bpersist\s*\(|INSIGHT_MEMORY/);
});


test('日本時間11時の締切で10:59は翌日・11:00は翌々日を納品日にする',()=>{
  const cases=[
    ['2026-10-21T01:59:59Z',1,'2026-10-22'], // 10:59:59 JST
    ['2026-10-21T02:00:00Z',2,'2026-10-23'], // 11:00:00 JST
    ['2026-10-21T02:00:01Z',2,'2026-10-23'],
    ['2026-10-20T15:00:00Z',1,'2026-10-22'], // 00:00 JST
    ['2026-12-31T01:59:59Z',1,'2027-01-01'],
    ['2026-12-31T02:00:00Z',2,'2027-01-02'],
    ['2024-02-28T01:59:59Z',1,'2024-02-29'],
    ['2024-02-28T02:00:00Z',2,'2024-03-01']
  ];
  for(const [timestamp,offset,delivery] of cases){
    const date=new Date(timestamp);
    assert.equal(model.deliveryLeadDays(date),offset,timestamp);
    assert.equal(model.defaultDelivery(date),delivery,timestamp);
  }
});

test('11時前・11時以降のどちらも納品日と前年同曜日実績を4列目で揃える',()=>{
  for(const today of ['2026-10-21','2024-02-27','2026-12-30']){
    const jmaDays=[0,1,2,3,4,5,6].map(n=>({date:model.addDays(today,n),weather:'晴',weatherCode:'100'}));
    for(const offset of [1,2]){
      const delivery=model.addDays(today,offset),visible=model.displayWeatherDays(jmaDays,offset),range=model.dates(delivery,visible[0].date);
      assert.equal(visible.length,7);
      assert.equal(visible[0].date,model.addDays(today,offset-3));
      for(let i=0;i<3-offset;i++){
        assert.equal(visible[i].weather,'実績未登録');
        assert.equal(visible[i].weatherCode,null);
      }
      assert.equal(visible[3].date,delivery,'納品日が4列目');
      assert.equal(visible[6].date,model.addDays(today,offset+3));
      assert.equal(range.previousYear[3],model.addDays(delivery,-364));
      for(let i=0;i<7;i++)assert.equal(range.previousYear[i],model.addDays(visible[i].date,-364));
      assert.equal(range.weeks[5],model.addDays(delivery,-7));
      assert.equal(range.recent[0],model.addDays(delivery,-7));
      assert.equal(jmaDays.length,7,'気象庁の元予報を変更しない');
    }
  }
  assert.deepEqual(model.displayWeatherDays([]),[]);
});

test('過去の天気カードは店舗の日別保存実績を読み取り、未登録は推測せず、保存値を変更しない',()=>{
  const snapshot={data:{'2026':{'10月':[
    {d:'19',weather:'雨',tempMaxC:24.9,tempMinC:15.5},
    {d:'20',weather:'雪',tempMaxC:0,tempMinC:-2},
    {d:'21',weather:''}
  ]}}};
  const before=JSON.stringify(snapshot),jma=[0,1,2,3,4,5,6].map(i=>({date:model.addDays('2026-10-21',i),weather:'晴れ',weatherCode:'100',max:25,min:17,pop:10}));
  assert.deepEqual(model.savedWeatherDay(snapshot,'2026-10-19'),{
    date:'2026-10-19',weather:'雨',historicalWeather:'雨',weatherCode:null,max:24.9,min:15.5,pop:null
  });
  assert.deepEqual(model.savedWeatherDay(snapshot,'2026-10-20'),{
    date:'2026-10-20',weather:'雪',historicalWeather:'雪',weatherCode:null,max:0,min:-2,pop:null
  });
  assert.equal(model.savedWeatherDay(snapshot,'2026-10-18'),null);
  assert.equal(model.savedWeatherDay(snapshot,'2026-10-21'),null);
  assert.equal(model.savedWeatherDay({},'2026-10-19'),null);
  for(const lead of [1,2]){
    const visible=model.displayWeatherDays(jma,lead,date=>model.savedWeatherDay(snapshot,date));
    assert.equal(visible.length,7);
    assert.equal(visible[3].date,model.addDays('2026-10-21',lead));
    assert.equal(visible[0].weather,lead===1?'雨':'雪');
    assert.equal(visible[0].pop,null,'実績に降水確率を捏造しない');
    if(lead===1)assert.equal(visible[1].weather,'雪');
    assert.equal(visible[3].weather,'晴れ','今日以降の予報を上書きしない');
    const previous=model.dates(visible[3].date,visible[0].date).previousYear;
    assert.equal(previous[3],model.addDays(visible[3].date,-364));
  }
  assert.equal(JSON.stringify(snapshot),before,'保存済み店舗実績を変更しない');
  assert.equal(jma.length,7,'取得した気象庁予報を変更しない');
});

test('前年7日間は上段天気の表示開始日に52週間前を対応させ、曜日と列を一致させる',()=>{
  const weatherStart='2026-10-10',delivery='2026-10-13',range=model.dates(delivery,weatherStart);
  assert.deepEqual(range.previousYear,[
    '2025-10-11','2025-10-12','2025-10-13','2025-10-14',
    '2025-10-15','2025-10-16','2025-10-17'
  ]);
  for(let i=0;i<7;i++){
    const weatherDay=model.addDays(weatherStart,i);
    assert.equal(new Date(weatherDay).getUTCDay(),new Date(range.previousYear[i]).getUTCDay());
    assert.equal(range.previousYear[i],model.addDays(weatherDay,-364));
  }
  assert.equal(range.previousYear[3],model.addDays(delivery,-364),'納品日の52週前は4列目');
  assert.equal(range.weeks[0],model.addDays(delivery,-42),'6週実績は納品日基準である');
  assert.equal(range.recent[0],model.addDays(delivery,-7),'直近実績には影響しない');
});

test('納品日が予報開始日から離れても天気の先頭と前年の先頭を優先して合わせる',()=>{
  const start='2026-10-11',earlier=model.dates('2026-10-12',start),later=model.dates('2026-10-20',start);
  assert.deepEqual(later.previousYear,earlier.previousYear);
  assert.equal(later.previousYear[0],'2025-10-12');
  assert.equal(later.weeks[0],model.addDays('2026-10-20',-42));
  assert.equal(earlier.weeks[0],model.addDays('2026-10-12',-42));
});

test('閏年を跨いでも表示7列が52週前の同じ曜日になり保存データを変更しない',()=>{
  for(const start of ['2024-02-27','2025-12-29','2026-10-11']){
    const delivery=model.addDays(start,2),saved={};
    const dataBefore=JSON.stringify(saved),data=model.collect(saved,category,delivery,sales,start);
    assert.deepEqual(data.previousYear.map(row=>row.date),model.dates(delivery,start).previousYear);
    data.previousYear.forEach((row,i)=>{
      const weather=model.addDays(start,i);
      assert.equal(new Date(weather).getUTCDay(),new Date(row.date).getUTCDay());
    });
    assert.equal(data.weeks.length,6);
    assert.equal(JSON.stringify(saved),dataBefore);
  }
});

test('6週間の各日付は納品日の同曜日・7日刻み、年末や閏年を跨いでも6件',()=>{
  for(const delivery of ['2026-10-13','2026-01-02','2024-03-01']){
    const result=model.dates(delivery);
    assert.equal(result.weeks.length,6);
    assert.equal(result.weeks[0],model.addDays(delivery,-42));
    assert.equal(result.weeks[5],model.addDays(delivery,-7));
    result.weeks.forEach((date,index)=>{
      assert.equal(date,model.addDays(delivery,-42+index*7));
      assert.equal(new Date(date).getUTCDay(),new Date(delivery).getUTCDay());
    });
    assert.equal(result.previousYear.length,7);
    assert.equal(result.recent.length,5);
  }
});

test('過去6週間の集計で実績の未入力と0を区別し保存データを変更しない',()=>{
  const delivery='2026-10-18',days=model.dates(delivery).weeks;
  const saved={};
  days.forEach((day,index)=>{saved[day]={food:record(index===0?0:index*10,index===0?0:index*2)};});
  const before=JSON.stringify(saved),actual=model.collect(saved,category,delivery,sales);
  assert.deepEqual(actual.weeks.map(item=>item.date),days);
  assert.equal(actual.deliveryAverage.trips[0],25);
  assert.equal(actual.salesAverage.trips[0],5);
  assert.equal(actual.deliveryAverage.total,null,'対象便に未入力がある場合1日合計は平均対象外');
  assert.equal(JSON.stringify(saved),before);
});


test('発注予測の6週平均は各月の対象便を用い、現行設定と異なる便や入力済み0を正しく集計する',()=>{
  const cat={id:'food',activeTrips:[false,true,false]};
  const snapshot={current:'A',salesCountManagement:{categories:[cat]},stores:{
    A:{salesCounts:{},tripHistoryOverrides:{version:1,categories:{food:{
      '2026-06':{'1':'active','2':'active','3':'inactive'},
      '2026-07':{'1':'active','2':'inactive','3':'active'}
    }}}},
    B:{salesCounts:{}}
  }};
  const dates=model.dates('2026-07-19','2026-07-17');
  const trip=(delivery,sales)=>({delivery,sales});
  dates.weeks.forEach((date,i)=>{
    snapshot.stores.A.salesCounts[date]={food:{trips:i<4?
      [trip(10,i===1?0:10),trip(20,20),trip(null,null)]:
      [trip(10,10),trip(null,null),trip(30,30)]}};
  });
  const firstPrior=dates.previousYear[0];
  snapshot.stores.A.salesCounts[firstPrior]={food:{trips:[
    trip(0,0),trip(5,5),trip(null,null)
  ]}};
  const saved=JSON.stringify(snapshot);
  const opts={snapshot,storeId:'A',resolver:require('../insight_trip_history_resolver_v1.js'),today:'2026-10-11'};
  const result=model.collect(snapshot.stores.A.salesCounts,cat,'2026-07-19',sales,'2026-07-17',opts);
  assert.deepEqual(result.weeks.map(x=>x.mask),[
    [true,true,false],[true,true,false],[true,true,false],[true,true,false],
    [true,false,true],[true,false,true]
  ]);
  assert.deepEqual(result.averageMask,[true,true,true]);
  assert.equal(result.deliveryAverage.total,200/6);
  assert.equal(result.salesAverage.total,190/6);
  assert.equal(result.salesAverage.totalDays,6);
  assert.equal(result.salesAverage.trips[0],50/6);
  assert.equal(result.salesAverage.trips[1],20);
  assert.equal(result.salesAverage.trips[2],30);
  assert.equal(result.previousYear[0].mask[0],true,'前年の保存済み0を保持');
  assert.equal(result.previousYear[0].record.trips[0].sales,0);
  assert.deepEqual(result.recent.map(x=>x.date),['2026-07-12'],'現行対象外の便だけの実績を表示');
  assert.equal(JSON.stringify(snapshot),saved,'read-only operation must never mutate the snapshot');
});

test('過去の対象便が不明なときも0個の入力は保持し、6週合計平均は未確定にする',()=>{
  const cat={id:'food',activeTrips:[false,true,false]};
  const store={salesCounts:{'2026-06-14':{food:{trips:[
    {delivery:0,sales:0},{delivery:null,sales:null},{delivery:null,sales:null}
  ]}}}};
  const snapshot={salesCountManagement:{categories:[cat]},stores:{A:store}};
  const before=JSON.stringify(snapshot),history={
    snapshot,storeId:'A',resolver:require('../insight_trip_history_resolver_v1.js'),today:'2026-10-11'
  };
  const value=model.collect(store.salesCounts,cat,'2026-06-21',sales,'2026-06-19',history);
  assert.deepEqual(value.weeks[5].mask,[true,null,null]);
  assert.deepEqual(value.averageMask,[true,null,null]);
  assert.equal(value.salesAverage.trips[0],0);
  assert.equal(value.salesAverage.total,null);
  assert.equal(value.salesAverage.totalDays,0);
  assert.deepEqual(value.recent.map(x=>x.date),['2026-06-14']);
  assert.equal(JSON.stringify(snapshot),before);
});

test('現在月の便設定を基本としつつ、現在対象外でも入力された値は非表示にしない',()=>{
  const cat={id:'food',activeTrips:[true,false,true]};
  const saved={'2026-10-11':{food:{trips:[
    {delivery:1,sales:0},{delivery:2,sales:0},{delivery:null,sales:null}
  ]}}};
  const snapshot={salesCountManagement:{categories:[cat]},stores:{A:{salesCounts:saved}}};
  const opts={snapshot,storeId:'A',resolver:require('../insight_trip_history_resolver_v1.js'),today:'2026-10-11'};
  const actual=model.collect(saved,cat,'2026-10-18',sales,'2026-10-11',opts);
  assert.deepEqual(actual.weeks[5].mask,[true,true,true]);
  assert.equal(actual.weeks[5].record.trips[1].sales,0);
  assert.equal(actual.salesAverage.total,null,'3便未入力なので部分合計は使わない');
  assert.equal(actual.recent[0].date,'2026-10-11');
});


/* STEP4 P4c-2: ORIGINAL order forecast UI handlers inside an isolated
 * fictional Node VM. No actual browser/storage/AI calls are permitted. */
function fictionalOrderSelectionUI(){
  const vm=require('node:vm'),path=require('node:path');
  const created=[],elements=new Map(),listeners=new Map();
  function el(tag){
    const children=[],classes=new Set();
    const n={tagName:tag,id:'',value:'',textContent:'',className:'',children,
      dataset:{},style:{},hidden:false,disabled:false,
      classList:{add(k){classes.add(k);},remove(k){classes.delete(k);},contains(k){return classes.has(k);}},
      append(...nodes){children.push(...nodes);},appendChild(node){children.push(node);return node;},
      replaceChildren(...nodes){children.splice(0,children.length,...nodes);},
      insertAdjacentElement(){},setAttribute(k,x){this[k]=String(x);},
      querySelector(){return {after(){}};},after(){},
      focus(){},showModal(){},close(){}};
    created.push(n);return n;
  }
  for(const id of ['navSaleResults','main','ofDelivery','ofCategory','ofPreviousYear',
    'ofYearCards','ofWeekCards','ofRecentCards','ofRecentEmpty','ofWeather',
    'ofWeatherStatus','ofRefresh','storeSel']){
    const n=el('div');n.id=id;elements.set(id,n);
  }
  const sidebar=el('div');
  const doc={
    readyState:'loading',head:el('head'),
    getElementById(id){return elements.get(id)||null;},
    querySelector(q){return q==='#sidebar .nav-list'?sidebar:null;},
    querySelectorAll(q){
      if(q==='.nav-btn')return created.filter(n=>n.className.split(/\s+/).includes('nav-btn'));
      if(q==='.page')return created.filter(n=>n.className.split(/\s+/).includes('page'));
      return [];
    },
    createElement:el,createElementNS(_ns,tag){return el(tag);},
    addEventListener(name,callback){listeners.set(name,callback);}
  };
  const cats=[
    {id:'fictional_rice',name:'架空米飯',hidden:false,activeTrips:[true,false,false]},
    {id:'fictional_bread',name:'架空パン',hidden:false,activeTrips:[true,false,false]}
  ];
  const stores={current:'fictional_a',salesCountManagement:{categories:cats},
    stores:{fictional_a:{salesCounts:{},data:{},weatherLocation:null},
      fictional_b:{salesCounts:{},data:{},weatherLocation:null}}};
  const initial=JSON.stringify(stores);
  let traffic=0,saves=0;
  const root={document:doc,allStores:stores,
    fetch(){traffic++;return Promise.reject(new Error('FICTIONAL_OFFLINE_ONLY'));},
    InsightSalesCount:{
      activeTrips(c){return c.activeTrips;},
      normalizeRecord(){return {trips:[{delivery:null,sales:null}]};},
      createReadOnlyDayCard(){return el('article');},
      createAverageCard(){return el('article');},
      wasteRecordAt(){return null;},
      average(){return null;}
    },
    InsightTripHistoryResolver:{resolveDate(){return {mask:[true,false,false]};},
      averageByDate(){return null;}},
    InsightEvents:{list(){return [];}},
    persist(){saves++;}
  };
  const ctx=vm.createContext({window:root,globalThis:root,document:doc,allStores:stores,
    currentNav:'dashboard',
    setTimeout(){return 1;},clearTimeout(){},
    Error,Date,Intl,Number,Array,Object,Map,Set,String,Boolean,Promise,
    console:{warn(){throw Error('unexpected console warn');}}});
  root.gotoNav=function(target){ctx.currentNav=target;};
  root.switchStore=function(id){stores.current=id;};
  const originalSource=fs.readFileSync(require('node:path').join(__dirname,'..','insight_order_forecast_v1.js'),'utf8');
  vm.runInContext(originalSource,ctx,{filename:'insight_order_forecast_v1.js'});
  const model=root.InsightOrderForecast;
  const status=()=>JSON.parse(JSON.stringify(model.getForecastSelectionStatus()));
  return {model,root,ctx,doc,stores,status,initial,elements,
    init(){listeners.get('DOMContentLoaded')();},
    enter(){root.gotoNav('orderForecast');},
    get saves(){return saves;},get traffic(){return traffic;}};
}
async function settleForecast(){
  // Flush the original rejected-fictional-network fetch and load.finally
  // without a real timer or a real network connection.
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
}
test('P4c-2: unavailable before init; successful UI entry gives frozen three-field auto metadata',async()=>{
  const f=fictionalOrderSelectionUI();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  f.init();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  f.enter();await settleForecast();
  const status=f.model.getForecastSelectionStatus();
  assert.deepEqual(Object.keys(status),['initialized','manualIntent','epoch']);
  assert.equal(Object.isFrozen(status),true);
  assert.equal(status.initialized,true);
  assert.equal(status.manualIntent,false);
  assert.equal(Number.isSafeInteger(status.epoch),true);
  assert.doesNotMatch(JSON.stringify(status),/fictional_a|fictional_rice|2026-/);
  assert.equal(f.saves,0);assert.equal(JSON.stringify(f.stores),f.initial);
});
test('P4c-2: focusing the same date without a change event becomes unknown, not manual',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const before=f.status(),shown=f.model.getState().delivery,date=f.elements.get('ofDelivery');
  date.onfocus();
  assert.equal(f.model.getState().delivery,shown);
  assert.equal(f.status().manualIntent,null);
  assert.ok(f.status().epoch>before.epoch);
  f.model.render();
  assert.equal(f.status().manualIntent,null,'render must not relabel an unobserved picker choice auto');
});
test('P4c-2: synthetic change is not trusted; a claimed trusted change tests only event branch',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const input=f.elements.get('ofDelivery');
  const before=f.status(),same=f.model.getState().delivery;
  input.value=same;
  input.onchange({target:input,isTrusted:false});
  assert.equal(f.status().manualIntent,null);
  assert.ok(f.status().epoch>before.epoch);
  input.onchange({target:input,isTrusted:true}); // simulated, NOT real browser provenance
  assert.equal(f.status().manualIntent,true);
  assert.ok(f.status().epoch>before.epoch);
  assert.equal(f.model.getState().delivery,same);
  assert.equal(f.saves,0);
});
test('P4c-2: invalid picker value is rejected without modifying delivery and remains unknown',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const input=f.elements.get('ofDelivery'),original=f.model.getState().delivery;
  input.value='2026-13-99';
  const start=f.status();
  input.onchange({target:input,isTrusted:true});
  assert.equal(input.value,original);
  assert.equal(f.model.getState().delivery,original);
  assert.equal(f.status().manualIntent,null);
  assert.ok(f.status().epoch>start.epoch);
});
test('P4c-2: auto delivery at 10:59/11:00 JST updates epoch without changing existing date rule',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const fakeAt=iso=>class FakeDate extends Date{
    constructor(...args){super(...(args.length?args:[iso]));}
  };
  f.ctx.Date=fakeAt('2026-10-25T01:59:59Z');
  f.model.render();
  const before=f.status(),dateBefore=f.model.getState().delivery;
  assert.equal(dateBefore,'2026-10-26');
  f.ctx.Date=fakeAt('2026-10-25T02:00:00Z');
  f.model.render();
  const after=f.status();
  assert.equal(f.model.getState().delivery,'2026-10-27');
  assert.equal(after.manualIntent,false);
  assert.ok(after.epoch>before.epoch);
  assert.equal(f.saves,0);
});
test('P4c-2: accepted category A-B-A, page reentry, and refresh advance generations',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const picker=f.elements.get('ofCategory');
  const first=f.status().epoch;
  picker.onchange({target:{value:'fictional_bread'}});
  picker.onchange({target:{value:'fictional_rice'}});
  const second=f.status().epoch;
  assert.ok(second>first);
  f.root.gotoNav('dashboard');
  assert.equal(f.status().initialized,false);
  f.enter();await settleForecast();
  assert.ok(f.status().epoch>second);
  const third=f.status().epoch;
  f.elements.get('ofRefresh').onclick();
  assert.equal(f.status().initialized,false,'refresh in flight is unknown');
  await settleForecast();
  assert.ok(f.status().epoch>third);
  assert.equal(f.saves,0);
});
test('P4c-2: failed render yields unknown; subsequent successful render gets a new epoch',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const first=f.status().epoch,original=f.elements.get('ofPreviousYear');
  f.elements.delete('ofPreviousYear');
  assert.throws(()=>f.model.render(),error=>error&&error.name==='TypeError');
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  f.elements.set('ofPreviousYear',original);
  f.model.render();
  assert.equal(f.status().initialized,true);
  assert.ok(f.status().epoch>first);
});


test('P4c2 R1-A: load rejection after page exit cannot reactivate selection metadata',async()=>{
  const f=fictionalOrderSelectionUI();
  const pending=[];
  f.ctx.AbortController=class {constructor(){this.signal={};}abort(){}};
  f.root.fetch=(url)=>new Promise((_resolve,reject)=>pending.push({url,reject}));
  f.init();f.enter();
  assert.equal(f.status().initialized,false,'fetch still running is unknown');
  assert.ok(pending.length>=2,'both synthetic const fetches started');
  f.root.gotoNav('dashboard');
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  pending.forEach(item=>item.reject(new Error('synthetic offline reject')));
  await settleForecast();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  assert.equal(f.ctx.currentNav,'dashboard');
  assert.equal(f.saves,0);
  f.enter();
  assert.equal(f.status().initialized,false,'new entry is not ready while loading');
  // Subsequent attempts can be rate-limited by the original weather client;
  // regardless, a completed reload may revive metadata only on the active page.
  await settleForecast();
  assert.equal(f.status().initialized,true);
  assert.equal(f.status().manualIntent,false);
});
test('P4c2 R1-B: successful delayed weather resolution after exit also stays unknown',async()=>{
  const f=fictionalOrderSelectionUI();
  const pending=[];
  f.ctx.AbortController=class {constructor(){this.signal={};}abort(){}};
  f.root.fetch=(url)=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}));
  f.init();f.enter();
  assert.ok(pending.length>=2);
  f.root.gotoNav('dashboard');
  pending.splice(0).forEach(item=>item.resolve({ok:true,json:async()=>({})}));
  await settleForecast();
  assert.ok(pending.length>=1,'the synthetic forecast request was started');
  const today=f.model.today(new Date());
  const payload=[{reportDatetime:today+'T17:00:00+09:00',
    timeSeries:[{timeDefines:[today+'T17:00:00+09:00'],
      areas:[{area:{code:'230010'},weatherCodes:['100'],weathers:['晴れ']}]}]}];
  pending.splice(0).forEach(item=>item.resolve({ok:true,json:async()=>payload}));
  await settleForecast();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  assert.equal(f.ctx.currentNav,'dashboard');
  assert.equal(f.saves,0);
});
test('P4c2 R1-C: render while never entered cannot initialize selection metadata',async()=>{
  const f=fictionalOrderSelectionUI();f.init();
  f.model.render();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  await settleForecast();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
});
test('P4c2 R2-A: unresolved weather means entry and refresh both report unknown',async()=>{
  const f=fictionalOrderSelectionUI();
  const pending=[];
  f.ctx.AbortController=class {constructor(){this.signal={};}abort(){}};
  f.root.fetch=(url)=>new Promise((_resolve,reject)=>pending.push({url,reject}));
  f.init();f.enter();
  assert.equal(f.elements.get('ofRefresh').disabled,true);
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  // Even a direct render must not relabel pending observations ready.
  f.model.render();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  f.elements.get('ofRefresh').onclick();
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  pending.forEach(item=>item.reject(new Error('synthetic offline reject')));
  await settleForecast();
  assert.equal(f.status().initialized,true,'only after current load fully finishes');
  assert.equal(f.elements.get('ofRefresh').disabled,false);
  assert.equal(f.saves,0);
});


/* STEP4 P4c-3: bounded event-only invalidation bridge tests. These do NOT
 * connect production Coordinator/Reader or exercise real browser events. */
test('P4c-3: invalidation subscription is argument-free and never reveals selection values',async()=>{
  const f=fictionalOrderSelectionUI(),reports=[],prior=f.initial;
  const unsubscribe=f.model.subscribeForecastSelectionInvalidation(function(){
    reports.push({args:[...arguments],status:f.status()});
  });
  f.init();f.enter();await settleForecast();
  assert.ok(reports.length>0);
  for(const report of reports){
    assert.deepEqual(report.args,[],'listener receives neither raw data nor identifiers');
    assert.equal(report.status.authorized_for_model,undefined);
  }
  assert.doesNotMatch(JSON.stringify(reports),/fictional_a|fictional_rice|20\d\d-\d\d-\d\d/);
  assert.equal(f.saves,0);
  assert.equal(JSON.stringify(f.stores),prior);
  const count=reports.length;
  unsubscribe();
  f.model.render();
  assert.equal(reports.length,count);
});
test('P4c-3: input reselect, A-B-A, page exit/entry and refresh emit invalidations',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let count=0;
  f.model.subscribeForecastSelectionInvalidation(()=>{count++;});
  const date=f.elements.get('ofDelivery');
  const start=f.status().epoch,original=f.model.getState().delivery;
  date.onfocus();
  assert.ok(count>0);
  assert.equal(f.status().manualIntent,null);
  const afterFocus=count;
  date.value=original;
  date.onchange({target:date,isTrusted:true}); // branch simulation only
  assert.ok(count>afterFocus);
  assert.equal(f.model.getState().delivery,original);
  const picker=f.elements.get('ofCategory'),afterDate=count;
  picker.onchange({target:{value:'fictional_bread'}});
  picker.onchange({target:{value:'fictional_rice'}});
  assert.ok(count>=afterDate+2);
  assert.ok(f.status().epoch>start);
  const beforeExit=count;
  f.root.gotoNav('dashboard');
  assert.ok(count>beforeExit);
  assert.equal(f.status().initialized,false);
  const beforeEntry=count;
  f.enter();assert.ok(count>beforeEntry);
  await settleForecast();
  const beforeRefresh=count;
  f.elements.get('ofRefresh').onclick();
  assert.ok(count>beforeRefresh);
  assert.equal(f.status().initialized,false);
  await settleForecast();
  assert.equal(f.saves,0);
});
test('P4c-3: throwing listeners do not break UI, later listeners or read status',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let good=0;
  const unThrow=f.model.subscribeForecastSelectionInvalidation(()=>{throw Error('FICTIONAL_SECRET_03934');});
  const unGood=f.model.subscribeForecastSelectionInvalidation(()=>{good++;});
  f.model.render();
  assert.ok(good>0);
  assert.equal(f.status().initialized,true);
  assert.equal(f.saves,0);
  unThrow();unGood();
  assert.throws(()=>f.model.subscribeForecastSelectionInvalidation(null),
    error=>error&&error.name==='TypeError');
});
test('P4c-3: duplicate callback subscriptions are independently revocable',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let calls=0;
  const listener=()=>{calls++;};
  const unsubA=f.model.subscribeForecastSelectionInvalidation(listener);
  const unsubB=f.model.subscribeForecastSelectionInvalidation(listener);
  f.model.render();
  assert.equal(calls,2);
  unsubA();unsubA();
  f.model.render();
  assert.equal(calls,3);
  unsubB();
  f.model.render();
  assert.equal(calls,3);
});
test('P4c-3: test-only coordinator is invalidated before accepting a delayed result',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  // A fabricated coordinator clock, not a reproduction of the PR #231 module.
  let generation=0;
  const invalidationKinds=[];
  const coordinator={
    invalidate(){generation++;invalidationKinds.push('invalidation');},
    getGeneration(){return generation;}
  };
  const unsubscribe=f.model.subscribeForecastSelectionInvalidation(
    ()=>coordinator.invalidate()
  );
  const snapshotGeneration=coordinator.getGeneration();
  const pending=new Promise(resolve=>{f.__resolveSynthetic=resolve;});
  const picker=f.elements.get('ofCategory');
  picker.onchange({target:{value:'fictional_bread'}});
  picker.onchange({target:{value:'fictional_rice'}});
  f.__resolveSynthetic({status:'READY',value:100391});
  const raw=await pending;
  // The late result may resolve, but cannot be adopted against its older
  // generation. Deliberately do not log/show the synthetic quantity.
  assert.equal(raw.status,'READY');
  assert.notEqual(coordinator.getGeneration(),snapshotGeneration);
  assert.ok(invalidationKinds.length>=2);
  assert.equal(f.saves,0);
  unsubscribe();
});
test('P4c-3: load starts by notifying before the source has settled',async()=>{
  const f=fictionalOrderSelectionUI();
  const unresolved=[];
  f.ctx.AbortController=class {constructor(){this.signal={};}abort(){}};
  f.root.fetch=(url)=>new Promise((_resolve,reject)=>unresolved.push({url,reject}));
  let notifications=0;
  f.model.subscribeForecastSelectionInvalidation(()=>notifications++);
  f.init();f.enter();
  assert.ok(unresolved.length>=2);
  const before=notifications;
  f.elements.get('ofRefresh').onclick();
  assert.ok(notifications>before);
  assert.deepEqual(f.status(),{initialized:false,manualIntent:null,epoch:null});
  unresolved.forEach(x=>x.reject(new Error('SYNTHETIC_NETWORK_REJECT')));
  await settleForecast();
  assert.equal(f.saves,0);
});


test('P4c3 R1-A: listeners added during dispatch wait for a later independent event',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let first=0,later=0;
  const unsubscribeFirst=f.model.subscribeForecastSelectionInvalidation(()=>{
    first++;
    if(first===1)f.model.subscribeForecastSelectionInvalidation(()=>{later++;});
  });
  f.model.render();
  assert.equal(first,1);
  assert.equal(later,0,'live Set may not visit a newly added subscriber');
  f.model.render();
  assert.equal(first,2);
  assert.equal(later,1);
  unsubscribeFirst();
  assert.equal(f.saves,0);
});

test('P4c3 R1-B: reentrant render is coalesced, never recursively dispatched',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let calls=0,depth=0,maxDepth=0;
  const records=[];
  f.model.subscribeForecastSelectionInvalidation(()=>{
    calls++;depth++;maxDepth=Math.max(maxDepth,depth);
    records.push(f.status());
    if(calls===1)f.model.render();
    depth--;
  });
  const before=f.status().epoch;
  f.model.render();
  assert.equal(calls,1,'nested render must not recursively re-notify');
  assert.equal(maxDepth,1);
  assert.ok(f.status().epoch>before,'nested render must still advance epoch');
  assert.deepEqual(records,[{initialized:false,manualIntent:null,epoch:null}],
    'status seen while notification is in flight must fail closed');
  assert.equal(f.saves,0);
});

test('P4c3 R1-C: self unsubscribe/re-register and later-entry removal respect snapshot',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let first=0,second=0,later=0;
  let unFirst,unSecond;
  unFirst=f.model.subscribeForecastSelectionInvalidation(()=>{
    first++;
    unFirst();
    f.model.subscribeForecastSelectionInvalidation(()=>{later++;});
    unSecond();
  });
  unSecond=f.model.subscribeForecastSelectionInvalidation(()=>{second++;});
  f.model.render();
  assert.equal(first,1);
  assert.equal(second,0,'entry removed before its snapshot turn is skipped');
  assert.equal(later,0,'entry added during snapshot delivery is not visited');
  f.model.render();
  assert.equal(first,1);
  assert.equal(second,0);
  assert.equal(later,1);
  assert.equal(f.saves,0);
});

test('P4c3 R1-D: adding callbacks during render never multiplies synchronous delivery',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  let calls=0;
  function grow(){
    calls++;
    if(calls<6)f.model.subscribeForecastSelectionInvalidation(grow);
  }
  f.model.subscribeForecastSelectionInvalidation(grow);
  f.model.render();
  assert.equal(calls,1,'new callback must not get a same-operation delivery');
  f.model.render();
  assert.equal(calls,3,'only the two callbacks present at start are visited');
  assert.equal(f.saves,0);
});

test('P4c3 R2-A: picker focus after manual selection never exposes old intent in new epoch',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const input=f.elements.get('ofDelivery'),same=f.model.getState().delivery;
  input.value=same;
  input.onchange({target:input,isTrusted:true}); // synthetic branch only
  assert.equal(f.status().manualIntent,true);
  const before=f.status().epoch,observed=[];
  f.model.subscribeForecastSelectionInvalidation(function(){
    observed.push({args:[...arguments],status:f.status()});
  });
  input.onfocus();
  assert.ok(f.status().epoch>before);
  assert.equal(f.status().manualIntent,null);
  assert.equal(observed.length,1);
  assert.deepEqual(observed[0],{args:[],status:{
    initialized:false,manualIntent:null,epoch:null
  }});
  assert.equal(f.saves,0);
});

test('P4c3 R2-B: valid changed date notifies after intent quarantine, then recovers',async()=>{
  const f=fictionalOrderSelectionUI();f.init();f.enter();await settleForecast();
  const input=f.elements.get('ofDelivery');
  let observed=[];
  f.model.subscribeForecastSelectionInvalidation(()=>observed.push(f.status()));
  input.value='2026-12-01';
  input.onchange({target:input,isTrusted:true}); // branch simulation only
  assert.ok(observed.length>0);
  assert.ok(observed.every(s=>s.initialized===false&&s.manualIntent===null));
  assert.equal(f.status().manualIntent,true);
  assert.equal(f.model.getState().delivery,'2026-12-01');
  assert.equal(f.saves,0);
});
