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
        assert.equal(visible[i].weather,'予報対象外');
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
