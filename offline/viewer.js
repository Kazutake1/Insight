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

  async function readSnapshot(){
    const storage=root.InsightIndexedDBStorageV1;
    Object.defineProperty(root,'InsightIndexedDBStorageV1',{
      value:undefined,configurable:false,writable:false
    });
    // The shared reader may try to record a source conflict. The offline view never writes that marker.
    Object.defineProperty(root,'InsightStorage',{value:Object.freeze({
      writeMetadata(){throw new Error('Offline mode does not write data');}
    })});
    const raw=root.localStorage.getItem(sourceKey);
    const adoption=root.localStorage.getItem(adoptionKey);
    const diagnosis=await storage.diagnoseStartup();
    if(diagnosis.reason==='indexeddb-adopted')return (await storage.read()).snapshot;
    if(diagnosis.state!=='legacy'||raw===null||adoption!==null||
       raw!==root.localStorage.getItem(sourceKey)||root.localStorage.getItem(adoptionKey)!==null)
      throw new Error('No verified snapshot');
    return JSON.parse(raw);
  }

  function option(label,value){
    const item=document.createElement('option');
    item.textContent=label;
    item.value=value;
    return item;
  }

  function wasteAmount(row){
    const categories=wasteCategories.reduce((sum,category)=>{
      const value=Number(row?.haiki?.[category]);
      return sum+(Number.isFinite(value)?value:0);
    },0);
    return categories>0?categories:row?.廃棄金額;
  }

  function showSnapshot(snapshot){
    if(!snapshot||!snapshot.stores||Array.isArray(snapshot.stores)||
       !Object.hasOwn(snapshot.stores,snapshot.current)||!root.Chart)
      throw new Error('Invalid snapshot');
    if(snapshot.schemaVersion!=null&&![0,1,'0','1'].includes(snapshot.schemaVersion))
      throw new Error('Unknown snapshot version');
    const shops=Object.entries(snapshot.stores);
    for(const [key,shop] of shops){
      if(!shop||typeof shop.name!=='string'||!shop.data||Array.isArray(shop.data))
        throw new Error('Invalid shop');
      stores.append(option(shop.name,key));
    }
    stores.value=snapshot.current;
    function renderMonths(){
      const shop=snapshot.stores[stores.value];
      const available=[];
      for(const year of Object.keys(shop.data).filter(key=>/^\d{4}$/.test(key)).sort().reverse()){
        for(let month=12;month>=1;month--){
          const daily=shop.data[year]?.[month+'月'];
          if(Array.isArray(daily))available.push({year,month,daily});
        }
      }
      months.replaceChildren(...available.map(({year,month},i)=>option(year+'年'+month+'月',String(i))));
      function render(){
        const daily=available[Number(months.value)]?.daily??[];
        const lines=daily.map((row,index)=>{
          const line=document.createElement('tr');
          for(const value of [index+1,row?.売上,row?.客数,wasteAmount(row),row?.weather]){
            const cell=document.createElement('td');
            cell.textContent=Number.isFinite(value)?number.format(value):typeof value==='string'&&value?value:'—';
            line.append(cell);
          }
          return line;
        });
        rows.replaceChildren(...lines);
        chart?.destroy();
        chart=new root.Chart(document.getElementById('offline-sales'),{
          type:'line',
          data:{labels:daily.map((_,i)=>String(i+1)),datasets:[{label:'売上',data:daily.map(row=>
            Number.isFinite(row?.売上)?row.売上:null),borderColor:'#387ba8'}]},
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

  navigator.serviceWorker?.addEventListener('controllerchange',()=>{
    if(data.hidden)return;
    hold();
  });
  root.addEventListener('storage',event=>{
    if([null,sourceKey,adoptionKey].includes(event.key)&&!data.hidden){
      data.hidden=true;
      const refresh=document.createElement('a');
      refresh.href=scope.href;
      refresh.textContent='最新の保存済み実績を開く';
      status.replaceChildren(refresh);
    }
  });

  (async()=>{
    if(!await controlled())return;
    const controller=navigator.serviceWorker.controller;
    const snapshot=await readSnapshot();
    if(!controller||navigator.serviceWorker.controller!==controller)throw new Error('Offline worker changed');
    showSnapshot(snapshot);
    status.textContent='閲覧専用';
  })().catch(hold);
})(globalThis);
