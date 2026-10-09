const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const model=require('../insight_order_forecast_v1.js');
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
test('4週平均は便・納品販売別の有効件数・0を含みセール等で除外しない',()=>{
  const saved={'2026-09-20':{food:record(0,4)},'2026-09-27':{food:record(10,null)},'2026-10-04':{food:record(null,8)},'2026-10-11':{food:record(20,0)}};
  saved['2026-10-04'].food.trips[2]={delivery:8,sales:2};
  const data=model.collect(saved,category,'2026-10-18',sales);
  assert.deepEqual(data.weeks.map(x=>x.date),['2026-09-20','2026-09-27','2026-10-04','2026-10-11']);
  assert.deepEqual(data.deliveryAverage.trips,[10,null,8]);assert.deepEqual(data.salesAverage.trips,[4,null,2]);assert.equal(data.deliveryAverage.total,null);assert.equal(data.salesAverage.total,10);
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
  assert.equal(data.days[2].weather,'くもり一時雨');assert.equal(data.days[2].pop,50);assert.equal(data.days[6].weather,'—');
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
