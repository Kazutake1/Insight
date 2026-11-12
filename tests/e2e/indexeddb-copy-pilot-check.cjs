const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('IndexedDB copy pilot preserves the raw snapshot, refuses conflicts, and retries safely',async({page})=>{
  await page.route('**/indexeddb-copy-pilot-test',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));
  await page.goto('/indexeddb-copy-pilot-test');
  await page.addScriptTag({path:path.join(__dirname,'../fixtures/indexeddb-copy-pilot.js')});
  const result=await page.evaluate(async()=>{
    const pilot=globalThis.InsightIndexedDBCopyPilot;
    const raw=' '+JSON.stringify({
      current:'a',
      stores:{
        a:{name:'架空店🍙',years:['2025','2026'],data:{2025:{'1月':[{売上:123,客数:7,haiki:{米飯:10}}]},2026:{}}},
        b:{name:'架空店B',years:['2025','2026'],data:{2025:{},2026:{'2月':[{売上:456}]}}}
      },
      unknownLegacyField:'x'.repeat(2_600_000)
    })+'\n';
    const changed=raw.replace('456','789');
    const message=promise=>promise.then(()=>null,error=>error.message);
    let reads=0;
    const conflict=await message(pilot.copy({
      indexedDB,readSource:()=>++reads<4?raw:changed
    }));
    const denied=await message(pilot.copy({
      indexedDB:{open(){throw new DOMException('Pilot open denied','SecurityError');}},
      readSource:()=>raw
    }));
    const malformed=await message(pilot.copy({indexedDB,readSource:()=>'{'}));
    const first=await pilot.copy({indexedDB,readSource:()=>raw});
    const repeat=await pilot.copy({indexedDB,readSource:()=>raw});
    const different=await message(pilot.copy({indexedDB,readSource:()=>changed}));
    const readback=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('insight-test-only-copy-pilot-v1',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction('snapshots','readonly');
        const get=tx.objectStore('snapshots').get('candidate');
        tx.onabort=()=>{db.close();reject(tx.error);};
        tx.oncomplete=()=>{db.close();resolve(get.result===raw);};
      };
    });
    return {conflict,denied,malformed,first,repeat,different,readback,keys:localStorage.length};
  });
  expect(result).toMatchObject({
    conflict:'Pilot source changed',denied:'Pilot open denied',first:'copied',
    repeat:'already-copied',different:'Pilot already contains a different snapshot',
    readback:true,keys:0
  });
  expect(result.malformed).toBeTruthy();
});
