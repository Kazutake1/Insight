(function(root){
  'use strict';

  const status=document.getElementById('offline-status');
  const data=document.getElementById('offline-data');
  const stores=document.getElementById('offline-store');
  const months=document.getElementById('offline-month');
  const rows=document.getElementById('offline-rows');
  const sourceKey='insight_v11';
  const adoptionKey='insight_indexeddb_adoption_v1';
  const number=new Intl.NumberFormat('ja-JP');
  const wasteCategories=['米飯','調理パン','麺類・その他','デリカテッセン','スイーツ','FF','その他デイリー','パン・ペストリー'];
  let chart;
  let storageChanged=false;
  let reading=false;

  const platformHost=['localhost','127.0.0.1'].includes(location.hostname);
  const scope=new URL('./',location.href);
  const workerUrl=new URL('worker.js',scope);

  function known(worker){
    return worker?.scriptURL===workerUrl.href;
  }

  async function verifyBundle(worker){
    const channel=new MessageChannel();
    try{
      return await new Promise((resolve,reject)=>{
        const timeout=root.setTimeout(()=>reject(new Error('Offline worker did not reply')),5000);
        channel.port1.onmessage=event=>{
          root.clearTimeout(timeout);
          resolve(event.data==='insight-offline-bundle-ready');
        };
        worker.postMessage('insight-offline-verify-bundle',[channel.port2]);
      });
    }finally{channel.port1.close();}
  }

  async function controlled(){
    if(location.origin!=='https://kazutake1.github.io'&&!platformHost)throw new Error('Unsupported host');
    if(!(platformHost&&scope.pathname==='/offline/')&&scope.pathname!=='/Insight/offline/')
      throw new Error('Unsupported offline path');
    if(location.search||location.hash||
       ![scope.href,new URL('index.html',scope).href].includes(location.href))
      throw new Error('Unsupported offline URL');
    const workers=navigator.serviceWorker;
    const registration=await workers.getRegistration(scope);
    if((registration&&registration.scope!==scope.href)||
       [registration?.active,registration?.waiting,registration?.installing,workers.controller].some(w=>w&&!known(w)))
      throw new Error('Unexpected worker');
    if(workers.controller){
      if(registration?.active!==workers.controller||!await verifyBundle(workers.controller))
        throw new Error('Offline bundle unavailable');
      return true;
    }
    const local=registration??await workers.register(workerUrl,{scope:scope.href,updateViaCache:'none'});
    const installed=local.installing??local.waiting??local.active;
    if(!known(installed)||local.scope!==scope.href)throw new Error('Unexpected worker');
    if(installed.state!=='activated'){
      await new Promise((resolve,reject)=>{
        const timeout=root.setTimeout(()=>finish(new Error('Worker installation did not complete')),20000);
        function finish(error){
          root.clearTimeout(timeout);
          installed.removeEventListener('statechange',check);
          if(error)reject(error);
          else resolve();
        }
        function check(){
          if(installed.state==='activated')finish();
          if(installed.state==='redundant')finish(new Error('Worker installation failed'));
        }
        installed.addEventListener('statechange',check);
        check();
      });
    }
    if(!await verifyBundle(installed))throw new Error('Offline bundle unavailable');
    const link=document.createElement('a');
    link.href=scope.href;
    link.textContent='オフライン閲覧を開く';
    status.replaceChildren(link);
    return false;
  }

  function storageState(){
    return {raw:root.localStorage.getItem(sourceKey),adoption:root.localStorage.getItem(adoptionKey)};
  }

  function unchanged({raw,adoption}){
    const current=storageState();
    return !storageChanged&&current.raw===raw&&current.adoption===adoption;
  }

  function readOnlyStorage(){
    const storage=root.InsightIndexedDBStorageV1;
    Object.defineProperty(root,'InsightIndexedDBStorageV1',{
      value:undefined,configurable:false,writable:false
    });
    // The shared reader may try to record a source conflict. The offline view never writes that marker.
    Object.defineProperty(root,'InsightStorage',{value:Object.freeze({
      writeMetadata(){throw new Error('Offline mode does not write data');}
    })});
    return storage;
  }

  async function readSnapshot(storage,{raw,adoption}){
    const diagnosis=await storage.diagnoseStartup();
    if(diagnosis.reason==='indexeddb-adopted'&&adoption!==null)return storage.read();
    if(diagnosis.state!=='legacy'||raw===null||adoption!==null)throw new Error('No verified snapshot');
    return {snapshot:JSON.parse(raw)};
  }

  function option(label,value){
    const item=document.createElement('option');
    item.textContent=label;
    item.value=value;
    return item;
  }

  function record(value){
    return value!==null&&typeof value==='object'&&!Array.isArray(value);
  }

  function metric(value){
    if(value==null)return 0;
    if(typeof value!=='number'&&typeof value!=='string')throw new Error('Invalid number');
    const parsed=Number(value);
    if(!Number.isFinite(parsed))throw new Error('Invalid number');
    return parsed;
  }

  function workRow(row,index){
    if(!record(row)||!['d','売上','客数','廃棄金額','haiki','weather'].some(key=>Object.hasOwn(row,key))||
       (Object.hasOwn(row,'d')&&String(index+1)!==String(row.d))||
       (row.haiki!=null&&!record(row.haiki))||(row.weather!=null&&typeof row.weather!=='string'))
      throw new Error('Invalid daily record');
    const categories=wasteCategories.reduce((sum,category)=>sum+metric(row.haiki?.[category]),0);
    const fallback=metric(row.廃棄金額);
    if(!Number.isFinite(categories))throw new Error('Invalid waste total');
    return {day:index+1,sales:metric(row.売上),customers:metric(row.客数),
      waste:categories>0?categories:fallback,weather:row.weather||'—'};
  }

  function checkedShops(snapshot){
    if(!record(snapshot)||!record(snapshot.stores)||typeof snapshot.current!=='string'||
       !Object.hasOwn(snapshot.stores,snapshot.current)||
       (snapshot.schemaVersion!=null&&![0,1,'0','1'].includes(snapshot.schemaVersion)))
      throw new Error('Unknown snapshot format');
    return Object.entries(snapshot.stores).map(([key,shop])=>{
      if(!record(shop)||typeof shop.name!=='string'||!shop.name.trim()||!record(shop.data))
        throw new Error('Invalid shop');
      const years=Object.keys(shop.data);
      if(!years.length||years.some(year=>!/^[1-9]\d{3}$/.test(year)))
        throw new Error('Invalid years');
      if(shop.years!==undefined&&(!Array.isArray(shop.years)||
         shop.years.length!==years.length||new Set(shop.years.map(String)).size!==years.length||
         shop.years.some(year=>!years.includes(String(year)))))
        throw new Error('Invalid year list');
      const available=years.sort().reverse().flatMap(year=>{
        const byMonth=shop.data[year];
        if(!record(byMonth)||!Object.keys(byMonth).length)throw new Error('Invalid months');
        return Object.entries(byMonth).map(([name,daily])=>{
          const match=/^(1[0-2]|[1-9])月$/.exec(name);
          if(!match)throw new Error('Invalid month');
          const month=Number(match[1]);
          if(!Array.isArray(daily)||!daily.length||daily.length>new Date(Date.UTC(Number(year),month,0)).getUTCDate())
            throw new Error('Invalid number of daily records');
          return {year,month,daily:daily.map(workRow)};
        }).sort((a,b)=>b.month-a.month);
      });
      return [key,{name:shop.name,available}];
    });
  }

  function showSnapshot(shops,current){
    if(!root.Chart)throw new Error('Chart is unavailable');
    stores.replaceChildren(...shops.map(([key,shop])=>option(shop.name,key)));
    stores.value=current;
    const lookup=new Map(shops);
    function renderMonths(){
      const {available}=lookup.get(stores.value);
      months.replaceChildren(...available.map(({year,month},i)=>option(year+'年'+month+'月',String(i))));
      function render(){
        const {daily}=available[Number(months.value)];
        rows.replaceChildren(...daily.map(({day,sales,customers,waste,weather})=>{
          const line=document.createElement('tr');
          for(const value of [day,sales,customers,waste,weather]){
            const cell=document.createElement('td');
            cell.textContent=typeof value==='number'?number.format(value):value;
            line.append(cell);
          }
          return line;
        }));
        chart?.destroy();
        chart=new root.Chart(document.getElementById('offline-sales'),{
          type:'line',
          data:{labels:daily.map(row=>String(row.day)),datasets:[
            {label:'売上（千円）',data:daily.map(row=>row.sales),borderColor:'#387ba8'}
          ]},
          options:{animation:false}
        });
      }
      months.onchange=render;
      render();
    }
    data.hidden=false;
    try{renderMonths();}catch(error){data.hidden=true;throw error;}
    stores.onchange=renderMonths;
  }

  function hold(){
    data.hidden=true;
    status.textContent='保存済み実績を確認できません。通信できる状態で通常のInsightを開いてください。';
  }

  function refresh(){
    data.hidden=true;
    const link=document.createElement('a');
    link.href=scope.href;
    link.textContent='最新の保存済み実績を開く';
    status.replaceChildren(link);
  }

  navigator.serviceWorker?.addEventListener('controllerchange',()=>{
    if(reading||!data.hidden)hold();
  });
  root.addEventListener('storage',event=>{
    if(![null,sourceKey,adoptionKey].includes(event.key))return;
    storageChanged=true;
    if(reading||!data.hidden)refresh();
  });

  (async()=>{
    if(!await controlled())return;
    reading=true;
    const controller=navigator.serviceWorker.controller;
    const storage=readOnlyStorage();
    const captured=storageState();
    const result=await readSnapshot(storage,captured);
    const shops=checkedShops(result.snapshot);
    if(result.revision!==undefined){
      const current=await storage.read();
      if(current.revision!==result.revision||
         JSON.stringify(current.snapshot)!==JSON.stringify(result.snapshot))return refresh();
    }
    if(!controller||navigator.serviceWorker.controller!==controller)throw new Error('Offline worker changed');
    if(!unchanged(captured))return refresh();
    showSnapshot(shops,result.snapshot.current);
    status.textContent='閲覧専用（読み込み時点の確定データ）';
  })().catch(()=>{
    if(storageChanged)refresh();
    else hold();
  }).finally(()=>{reading=false;});
})(globalThis);
