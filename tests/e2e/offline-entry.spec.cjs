const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');

const root=path.join(__dirname,'../..');
const scope='/Insight/offline/';
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
const oldSource={current:'a',stores:{
  a:{name:'架空店舗A',data:{2025:{'1月':[{売上:123,客数:17,廃棄金額:0,haiki:{米飯:8},weather:'雨'}]}}},
  b:{name:'架空店舗B',data:{2024:{'2月':[{売上:456,客数:28,廃棄金額:6,weather:'晴'}]}}}
}};

async function fixture(use){
  const state={offline:false,failedUpdate:false};
  const viewer=await fs.readFile(path.join(root,'offline/viewer.js'));
  const viewerHash=createHash('sha256').update(viewer).digest('hex');
  const server=http.createServer(async (req,res)=>{
    if(state.offline){res.writeHead(503).end();return;}
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(['/Insight/test-seed.html','/Other/test-seed.html'].includes(pathname)){
      res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Test fixture</title>');
      return;
    }
    if(!pathname.startsWith(scope)&&pathname!=='/Insight/insight_indexeddb_storage_v1.js'){
      res.writeHead(404).end();return;
    }
    const rel=pathname===scope?'offline/index.html':pathname.slice('/Insight/'.length);
    try{
      let body=await fs.readFile(path.join(root,rel));
      if(state.failedUpdate&&pathname===scope+'worker.js'){
        body=body.toString().replace(viewerHash,'f'.repeat(64));
      }
      res.writeHead(200,{'Content-Type':contentTypes[path.extname(rel)],'Cache-Control':'no-store'}).end(body);
    }catch(_){res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await use({state,origin:'http://127.0.0.1:'+server.address().port});}
  finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
}

const offlineTest=test.extend({offlineHost:async ({},use)=>fixture(use)});

async function prepare(page,origin){
  const entry=origin+scope;
  await page.goto(entry);
  await page.getByRole('link',{name:'オフライン閲覧を開く'}).click();
  await expect(page.getByRole('status')).toHaveText('閲覧専用');
}

offlineTest('offline legacy viewing, failed update, and cache loss leave original bytes unchanged',async({page,offlineHost})=>{
  const {origin,state}=offlineHost;
  const raw=JSON.stringify(oldSource);
  await page.goto(origin+'/Insight/test-seed.html');
  await page.evaluate(raw=>localStorage.setItem('insight_v11',raw),raw);
  await prepare(page,origin);
  await expect(page.locator('#offline-rows tr')).toHaveText('1123178雨');
  await page.getByLabel('店舗').selectOption('b');
  await expect(page.getByLabel('年月')).toHaveText('2024年2月');
  await expect(page.locator('#offline-rows tr')).toHaveText('1456286晴');
  expect(await page.evaluate(()=>Chart.version)).toBe('4.4.1');
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);

  state.failedUpdate=true;
  const failed=await page.evaluate(async ()=>{
    const registration=await navigator.serviceWorker.getRegistration();
    const redundant=new Promise(resolve=>{
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker.addEventListener('statechange',()=>{
          if(worker.state==='redundant')resolve(true);
        });
      },{once:true});
    });
    await registration.update();
    return redundant;
  });
  expect(failed).toBe(true);

  state.offline=true;
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('閲覧専用');
  expect(await page.evaluate(async ()=> (await fetch('/Insight/test-seed.html')).status)).toBe(503);
  await page.evaluate(async ()=>{
    const keys=await caches.keys();
    const names=keys.filter(key=>key.startsWith('insight-offline-view-'));
    for(const name of names){
      const cache=await caches.open(name);
      await cache.delete('/Insight/offline/viewer.js');
    }
  });
  expect((await page.reload()).status()).toBe(503);
  await expect(page.locator('#offline-data')).toHaveCount(0);
  state.offline=false;
  for(const suffix of ['/Insight/test-seed.html','/Other/test-seed.html']){
    await page.goto(origin+suffix);
    expect(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(false);
    expect(await page.evaluate(async ()=>Boolean(await navigator.serviceWorker.getRegistration()))).toBe(false);
    expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(raw);
  }
});

offlineTest('offline adopted viewer reads the committed data without writing and blocks unknown formats',async({page,offlineHost})=>{
  const {origin,state}=offlineHost;
  const sourceRaw=JSON.stringify(oldSource);
  const adopted=structuredClone(oldSource);
  adopted.schemaVersion=1;
  adopted.stores.a.data[2025]['1月'][0].売上=765;
  const raw=JSON.stringify(adopted);
  await page.goto(origin+'/Insight/test-seed.html');
  const marker=JSON.stringify({state:'active',id:'fictional-adoption'});
  await page.evaluate(async ({raw,sourceRaw,marker})=>{
    localStorage.setItem('insight_v11',sourceRaw);
    localStorage.setItem('insight_indexeddb_adoption_v1',marker);
    async function seed(name,record){
      await new Promise((resolve,reject)=>{
        const request=indexedDB.open(name,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result;
          const tx=db.transaction('snapshots','readwrite');
          tx.objectStore('snapshots').add(record,'current');
          tx.oncomplete=()=>{db.close();resolve();};
          tx.onabort=()=>{db.close();reject(tx.error);};
        };
      });
    }
    const id='fictional-adoption';
    await seed('insight-migration-history-v1',{id});
    await seed('insight-store-snapshots-v1',{id,raw,sourceRaw,revision:1,previous:{revision:0,raw:sourceRaw}});
  },{raw,sourceRaw,marker});
  await prepare(page,origin);
  state.offline=true;
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('閲覧専用');
  await expect(page.locator('#offline-rows tr')).toHaveText('1765178雨');
  expect(await page.evaluate(async ()=>{
    const result=await new Promise((resolve,reject)=>{
      const opened=indexedDB.open('insight-store-snapshots-v1',1);
      opened.onerror=()=>reject(opened.error);
      opened.onsuccess=()=>{
        const db=opened.result;
        const tx=db.transaction('snapshots','readonly');
        const request=tx.objectStore('snapshots').get('current');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        tx.oncomplete=()=>db.close();
      };
    });
    return {revision:result.revision,raw:result.raw,writesAvailable:!!window.InsightIndexedDBStorageV1};
  })).toEqual({revision:1,raw,writesAvailable:false});
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBe(sourceRaw);
  expect(await page.evaluate(()=>localStorage.getItem('insight_indexeddb_adoption_v1'))).toBe(marker);
  state.offline=false;
  const peer=await page.context().newPage();
  await peer.goto(origin+'/Insight/test-seed.html');
  await peer.evaluate(async ()=>{
    await new Promise((resolve,reject)=>{
      const opened=indexedDB.open('insight-store-snapshots-v1',1);
      opened.onerror=()=>reject(opened.error);
      opened.onsuccess=()=>{
        const db=opened.result;
        const tx=db.transaction('snapshots','readwrite');
        const records=tx.objectStore('snapshots');
        const request=records.get('current');
        request.onsuccess=()=>{
          const record=request.result;
          const snapshot=JSON.parse(record.raw);
          snapshot.schemaVersion=999;
          records.put({...record,raw:JSON.stringify(snapshot)},'current');
        };
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onabort=()=>{db.close();reject(tx.error);};
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('status')).toContainText('保存済み実績を確認できません');
  await expect(page.locator('#offline-data')).toBeHidden();
  await peer.close();
});
