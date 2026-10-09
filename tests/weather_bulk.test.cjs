const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','insight_weather_bulk_v1.js'),'utf8');
const coord={latitude:35.25,longitude:136.78,timezone:'Asia/Tokyo',label:'稲沢市'};
function row(d,fields={}){return Object.assign({d:String(d),売上:123,客数:45,weather:''},fields);}
function snapshot(){
  return {current:'a',stores:{a:{name:'A店',years:['2022','2023'],weatherLocation:coord,data:{
    '2022':{'12月':[row(31)]},
    '2023':{'1月':[row(1,{weather:'',tempMaxC:'',tempMinC:0,storeMemo:'保護'}),row(2,{weather:'晴',tempMaxC:22,tempMinC:null})]}
  }},b:{name:'B店',years:['2023'],data:{'2023':{'1月':[row(1)]}}}}};
}
function mockWeather(url){
  const u=new URL(url);
  const start=u.searchParams.get('start_date')||'2023-01-01';
  const end=u.searchParams.get('end_date')||'2023-01-02';
  const time=[],code=[],max=[],min=[];
  let d=new Date(start+'T00:00:00Z');
  const last=new Date(end+'T00:00:00Z');
  for(;d<=last;d.setUTCDate(d.getUTCDate()+1)){
    time.push(d.toISOString().slice(0,10));code.push(63);max.push(24.9);min.push(10.8);
  }
  return {ok:true,status:200,json:async()=>({daily:{time,weather_code:code,temperature_2m_max:max,temperature_2m_min:min}})};
}
function load(options={}){
  const data=options.data||snapshot(),saved=[],urls=[];
  const storage={
    clone:s=>JSON.parse(JSON.stringify(s)),
    writeSnapshot(s){
      if(options.throwWrite)throw new Error('QuotaExceededError');
      saved.push(JSON.parse(JSON.stringify(s)));
    }
  };
  const win={
    InsightStorage:storage,
    allStores:data,
    fetch:async url=>{
      urls.push(url);
      if(options.failNetwork)return {ok:false,status:500};
      if(options.failHistorical&&url.includes('historical-forecast-api'))return {ok:false,status:500};
      if(options.partialHistorical&&url.includes('historical-forecast-api'))return {ok:true,status:200,json:async()=>({daily:{time:['2023-01-01','2023-01-02'],weather_code:[61,61],temperature_2m_max:[null,null],temperature_2m_min:[10,10]}})};
      return mockWeather(url);
    }
  };
  const ctx={window:win,globalThis:win,console,Date,Set,Map,Number,Object,Array,String,Math,Promise,URL,encodeURIComponent};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {api:win.InsightWeatherBulk,data,saved,urls};
}
test('2023年からの既存年度・行だけを対象にし、未設定店舗を飛ばす',()=>{
  const x=load();const p=x.api.scan(x.data,'2023-01-03');
  assert.equal(p.days,2);assert.equal(p.fields,3);
  assert.equal(p.stores.length,1);assert.deepEqual(Array.from(p.unconfigured),['B店']);
  assert.equal(p.groups.length,1);
  assert.equal(p.groups[0].start,'2023-01-01');
  assert.equal(p.groups[0].end,'2023-01-02');
});
test('気温0を入力済みとして保持し、天気・気温の空欄だけ保存する',async()=>{
  const x=load();
  const result=await x.api.run();
  assert.equal(result.days,2);assert.equal(result.fields,3);
  assert.equal(x.saved.length,1);
  const r1=x.data.stores.a.data['2023']['1月'][0];
  const r2=x.data.stores.a.data['2023']['1月'][1];
  assert.equal(r1.weather,'雨');assert.equal(r1.tempMaxC,24);assert.equal(r1.tempMinC,0);
  assert.equal(r1.売上,123);assert.equal(r1.客数,45);assert.equal(r1.storeMemo,'保護');
  assert.equal(r2.weather,'晴');assert.equal(r2.tempMaxC,22);assert.equal(r2.tempMinC,10);
  assert.equal(x.data.stores.a.data['2022']['12月'][0].weather,'');
  assert.equal(x.data.stores.b.data['2023']['1月'][0].weather,'');
  assert.equal(x.saved[0].stores.a.data['2023']['1月'][0].tempMinC,0);
  assert.match(x.urls[0],/historical-forecast-api\.open-meteo\.com/);
  assert.match(x.urls[0],/models=jma_seamless/);
  const again=await x.api.run();
  assert.equal(again.days,0);assert.equal(x.saved.length,1);
});
test('気象庁モデルが失敗すると再解析APIへフォールバックする',async()=>{
  const x=load({failHistorical:true});
  const result=await x.api.run();
  assert.equal(result.days,2);
  assert.equal(x.urls.length,2);
  assert.match(x.urls[1],/archive-api\.open-meteo\.com\/v1\/archive/);
  assert.equal(result.sourceCounts.archive,1);
});
test('API失敗時は保存も既存データへの変更も行わない',async()=>{
  const x=load({failNetwork:true});
  await assert.rejects(x.api.run(),/HTTP 500/);
  assert.equal(x.saved.length,0);
  assert.equal(x.data.stores.a.data['2023']['1月'][0].weather,'');
});
test('保存失敗時にメモリ上の実績を変更しない',async()=>{
  const x=load({throwWrite:true});
  await assert.rejects(x.api.run(),/QuotaExceededError/);
  assert.equal(x.data.stores.a.data['2023']['1月'][0].weather,'');
  assert.equal(x.data.stores.a.data['2023']['1月'][0].tempMaxC,'');
});
test('天気ラベルは既存コードに合わせ、未定義WMOコードを捏造しない',()=>{
  const {api}=load();
  assert.equal(api.codeToWeather(0),'快晴');
  assert.equal(api.codeToWeather(63),'雨');
  assert.equal(api.codeToWeather(95),'雷雨');
  assert.equal(api.codeToWeather(999),null);
});

test('過去の気象モデルに日付はあっても気温が欠ける場合は再解析へ切り替える',async()=>{
  const x=load({partialHistorical:true});
  const result=await x.api.run();
  assert.equal(result.days,2);
  assert.equal(x.urls.length,2);
  assert.match(x.urls[1],/archive-api\.open-meteo\.com/);
  assert.equal(x.data.stores.a.data['2023']['1月'][0].tempMaxC,24);
});
test('両店舗の地点が登録されている場合は店舗ごとに補完する',async()=>{
  const data=snapshot();
  data.stores.b.weatherLocation={latitude:35.3,longitude:136.8,timezone:'Asia/Tokyo'};
  const x=load({data});
  const result=await x.api.run();
  assert.equal(result.days,3);
  assert.equal(x.saved.length,2);
  assert.equal(x.data.stores.b.data['2023']['1月'][0].weather,'雨');
  assert.equal(x.data.stores.b.data['2023']['1月'][0].tempMaxC,24);
});

test('一括取得の期間は2023年1月1日から実行日の今日までを含む',()=>{
  const x=load();
  const plan=x.api.scan(x.data);
  const now=new Date();
  const ymd=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  assert.equal(plan.start,'2023-01-01');
  assert.equal(plan.end,ymd);
  const todayGroup={start:ymd,end:ymd};
  const url=x.api.urlFor(coord,todayGroup,'recent');
  assert.match(url,/past_days=3/);
  assert.match(url,/forecast_days=1/);
});
