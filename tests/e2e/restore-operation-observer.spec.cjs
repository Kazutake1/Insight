const {test,expect}=require('@playwright/test');

// All browser state and imported files are FICTIONAL, created in a fresh
// Playwright context. Never inspect a real user's stored Insight records.
async function setup(page,{missingObserver=false}={}){
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  if(missingObserver)await page.route('**/insight_operation_observer_v0.js*',route=>
    route.fulfill({status:404,contentType:'text/plain',body:'FICTIONAL missing observer'}));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InsightRestoreOperationObserverV0&&window.InsightStorage&&
    window.InsightDataHealth&&document.getElementById('restoreFile'));
  const fixture=await page.evaluate(()=>{
    const original=InsightStorage.migrateSnapshot(JSON.parse(JSON.stringify(allStores)));
    const id=original.current;
    const year=String(original.stores[id].years.at(-1)),month='1月';
    original.stores[id].data[year][month][0].売上=111;
    const target=JSON.parse(JSON.stringify(original));
    target.stores[id].data[year][month][0].売上=777;
    allStores=original;
    store=allStores.stores[id];
    baseYear=year;
    InsightStorage.persistCurrent(allStores);
    window.__restoreSamples=[];
    window.__restoreWrites=0;
    window.__restoreAlerts=[];
    window.alert=message=>window.__restoreAlerts.push(String(message));
    const originalWrite=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(){
      window.__restoreSamples.push(InsightRestoreOperationObserverV0.getStatus());
      window.__restoreWrites++;
      const value=originalWrite.apply(this,arguments);
      window.__restoreSamples.push(InsightRestoreOperationObserverV0.getStatus());
      return value;
    };
    return {json:JSON.stringify(target),id,year,month};
  });
  page.on('dialog',dialog=>dialog.accept());
  return fixture;
}
async function upload(page,json){
  await page.locator('#restoreFile').setInputFiles({
    name:'FICTIONAL_backup.json',mimeType:'application/json',buffer:Buffer.from(json)
  });
}
async function snapshot(page,fixture){
  return page.evaluate(({id,year,month})=>{
    const saved=JSON.parse(localStorage.getItem('insight_v11'));
    return {
      status:InsightRestoreOperationObserverV0.getStatus(),
      saved:saved.stores[id].data[year][month][0].売上,
      live:allStores.stores[id].data[year][month][0].売上,
      writes:window.__restoreWrites,samples:window.__restoreSamples,
      alerts:window.__restoreAlerts,inputValue:document.getElementById('restoreFile').value
    };
  },fixture);
}
async function endState(page,writes,state){
  await page.waitForFunction(({writes,state})=>{
    const status=window.InsightRestoreOperationObserverV0.getStatus();
    return window.__restoreWrites===writes&&status.state===state&&status.activeCount===0;
  },{writes,state});
}
test('FICTIONAL native FileReader completes confirmed write and sync UI observation',async({page})=>{
  const f=await setup(page);
  expect((await snapshot(page,f)).status.state).toBe('UNAVAILABLE');
  await upload(page,f.json);
  await endState(page,1,'IDLE_OBSERVED');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.samples).toHaveLength(2);
  expect(s.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
  expect(s.inputValue).toBe('');
  expect(s.alerts).toEqual([]);
  expect(await page.evaluate(()=>InsightStorage.snapshotWritesHeld())).toBe(false);
});
test('FICTIONAL user cancellation does not begin restore write observation',async({page})=>{
  const f=await setup(page);
  page.removeAllListeners('dialog');
  page.on('dialog',dialog=>dialog.dismiss());
  await upload(page,f.json);
  await page.waitForFunction(()=>document.getElementById('restoreFile').value==='');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([111,111,0]);
  expect(s.status.state).toBe('UNAVAILABLE');
});
test('FICTIONAL postflight mismatch rolls back saved bytes and stays HELD',async({page})=>{
  const f=await setup(page);
  await page.evaluate(({id,year,month})=>{
    const prior=InsightStorage.readSnapshot;
    let corruptOnce=true;
    InsightStorage.readSnapshot=function(){
      const value=prior.apply(this,arguments);
      if(window.__restoreWrites===1&&corruptOnce){
        corruptOnce=false;
        value.stores[id].data[year][month][0].売上+=1;
      }
      return value;
    };
  },f);
  await upload(page,f.json);
  await endState(page,2,'HELD');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([111,111,2]);
  expect(s.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1)).toBe(true);
  expect(s.alerts.join(' ')).toContain('自動で戻しました');
});
test('FICTIONAL committed restore keeps saved bytes after a sync UI exception',async({page})=>{
  const f=await setup(page);
  await page.evaluate(()=>{
    InsightDataHealth.refresh=function(){throw Error('FICTIONAL late UI failure');};
  });
  await upload(page,f.json);
  await endState(page,1,'HELD');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.alerts.join(' ')).toContain('復元したデータは保存されています');
  expect(s.samples.every(x=>x.state==='ACTIVE')).toBe(true);
});
test('FICTIONAL missing observer script never blocks original native restore',async({page})=>{
  const f=await setup(page,{missingObserver:true});
  await upload(page,f.json);
  await page.waitForFunction(()=>window.__restoreWrites===1&&document.getElementById('restoreFile').value==='');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.status.state).toBe('UNAVAILABLE');
});


test('FICTIONAL postwrite throw reports saved target without retry or false unchanged warning',async({page})=>{
  const f=await setup(page);
  await page.evaluate(()=>{
    const original=InsightStorage.writeSnapshot;
    InsightStorage.writeSnapshot=function(){
      const result=original.apply(this,arguments);
      if(window.__restoreWrites===1)throw Error('FICTIONAL postwrite throw');
      return result;
    };
  });
  await upload(page,f.json);
  await endState(page,1,'HELD');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,111,1]);
  expect(s.alerts.join(' ')).toContain('保存領域に復元対象と一致するデータ');
  expect(s.alerts.join(' ')).not.toContain('現在のデータは変更されていません');
  expect(s.samples.every(x=>x.state==='ACTIVE')).toBe(true);
  expect(await page.evaluate(()=>InsightStorage.snapshotWritesHeld())).toBe(true);
  const after=await page.evaluate(()=>{
    const before=localStorage.getItem('insight_v11');
    const errors=[];
    for(const action of [
      ()=>InsightStorage.persistCurrent(allStores),
      ()=>InsightStorage.writeSnapshot(allStores),
      ()=>InsightStorage.transaction(allStores,draft=>{draft.stores[draft.current].name='FICTIONAL overwrite';}),
      ()=>InsightStorage.writeMetadata('insight_v11','FICTIONAL overwrite')
    ]){
      try{action();errors.push('not blocked');}catch(error){errors.push(error.name);}
    }
    InsightStorage.writeMetadata('insight_last_backup','FICTIONAL allowed');
    return {same:localStorage.getItem('insight_v11')===before,errors,metadata:localStorage.getItem('insight_last_backup')};
  });
  expect(after.same).toBe(true);
  expect(after.errors).toEqual(Array(4).fill('InsightStorageRestoreHoldError'));
  expect(after.metadata).toBe('FICTIONAL allowed');
});

test('FICTIONAL duplicate native FileReader completion is observed but cannot commit twice',async({page})=>{
  const f=await setup(page);
  await page.evaluate(()=>{
    const NativeReader=window.FileReader;
    window.FileReader=class extends NativeReader{
      readAsText(file){
        this.addEventListener('load',()=>{
          queueMicrotask(()=>{if(typeof this.onload==='function')this.onload({target:this});});
        },{once:true});
        return super.readAsText(file);
      }
    };
  });
  await upload(page,f.json);
  await page.waitForFunction(()=>window.__restoreWrites===1&&
    InsightRestoreOperationObserverV0.getStatus().state==='HELD');
  const s=await snapshot(page,f);
  expect([s.saved,s.live,s.writes]).toEqual([777,777,1]);
  expect(s.inputValue).toBe('');
  expect(s.alerts).toEqual([]);
  expect(await page.evaluate(()=>InsightStorage.snapshotWritesHeld())).toBe(false);
});
test('FICTIONAL overlapping native restore readers allow first completion and later retry',async({page})=>{
  const f=await setup(page);
  await page.evaluate(()=>{
    window.__pendingRestoreReads=[];
    window.__resumeRestoreReads=false;
    const NativeReader=window.FileReader;
    window.FileReader=class extends NativeReader{
      readAsText(file){
        if(!window.__resumeRestoreReads){
          window.__pendingRestoreReads.push({reader:this,file});
          return;
        }
        return super.readAsText(file);
      }
    };
  });
  await upload(page,f.json);
  await page.waitForFunction(()=>window.__pendingRestoreReads.length===1);
  const blocked=await page.evaluate(json=>{
    const event={target:{files:[new File([json],'FICTIONAL_overlap.json',{type:'application/json'})],value:'selected'}};
    restoreData(event);
    return {value:event.target.value,pending:window.__pendingRestoreReads.length,writes:window.__restoreWrites};
  },f.json);
  expect(blocked).toEqual({value:'',pending:1,writes:0});
  await page.evaluate(()=>{
    window.__resumeRestoreReads=true;
    const pending=window.__pendingRestoreReads[0];
    pending.reader.readAsText(pending.file);
  });
  await page.waitForFunction(()=>window.__restoreWrites===1&&document.getElementById('restoreFile').value==='');
  const first=await snapshot(page,f);
  expect([first.saved,first.live,first.writes]).toEqual([777,777,1]);
  expect(first.alerts.join(' ')).toContain('別のバックアップ復元処理が進行中');
  expect(first.status.state).toBe('HELD');
  await page.evaluate(json=>{
    const event={target:{files:[new File([json],'FICTIONAL_retry.json',{type:'application/json'})],value:'selected'}};
    restoreData(event);
  },f.json);
  await page.waitForFunction(()=>window.__restoreWrites===2);
  const second=await snapshot(page,f);
  expect([second.saved,second.live,second.writes]).toEqual([777,777,2]);
});

test('FICTIONAL stale first load after abort cannot overwrite a newer native restore',async({page})=>{
  const f=await setup(page);
  await page.evaluate(()=>{
    window.__fictionalReaders=[];
    const NativeReader=window.FileReader;
    window.FileReader=class extends NativeReader{
      readAsText(file){window.__fictionalReaders.push({reader:this,file});}
    };
  });
  await upload(page,f.json);
  await page.waitForFunction(()=>window.__fictionalReaders.length===1);
  const blocked=await page.evaluate(json=>{
    const a=window.__fictionalReaders[0].reader;
    a.onabort(); // FICTIONAL abort before the first load callback.
    const target=JSON.parse(json);
    const id=target.current,year=String(target.stores[id].years.at(-1));
    target.stores[id].data[year]['1月'][0].売上=850;
    window.__fictionalBJson=JSON.stringify(target);
    const input={value:'selected',files:[new File([window.__fictionalBJson],'FICTIONAL_second.json',{type:'application/json'})]};
    restoreData({target:input});
    a.onload({target:{result:json}}); // The first A load comes after B starts.
    const forbidden={value:'selected',files:[new File([json],'FICTIONAL_third.json',{type:'application/json'})]};
    restoreData({target:forbidden});
    return {readers:window.__fictionalReaders.length,writes:window.__restoreWrites,
      secondInput:input.value,thirdInput:forbidden.value};
  },f.json);
  expect(blocked).toEqual({readers:2,writes:0,secondInput:'selected',thirdInput:''});
  await page.evaluate(()=>{
    window.__fictionalReaders[1].reader.onload({target:{result:window.__fictionalBJson}});
  });
  await page.waitForFunction(()=>window.__restoreWrites===1);
  const state=await snapshot(page,f);
  expect([state.saved,state.live,state.writes]).toEqual([850,850,1]);
  expect(state.status.state).toBe('HELD');
  expect(state.alerts.join(' ')).toContain('別のバックアップ復元処理が進行中');
  expect(await page.evaluate(()=>InsightStorage.snapshotWritesHeld())).toBe(false);
});

for(const scenario of ['postwrite-throw','committed-ui-error']){
  test(`FICTIONAL manual reload recovers saved snapshot after ${scenario}`,async({page})=>{
    const f=await setup(page);
    if(scenario==='postwrite-throw'){
      await page.evaluate(()=>{
        const original=InsightStorage.writeSnapshot;
        InsightStorage.writeSnapshot=function(){
          const result=original.apply(this,arguments);
          if(window.__restoreWrites===1)throw Error('FICTIONAL postwrite throw before live commit');
          return result;
        };
      });
    }else{
      await page.evaluate(()=>{
        InsightDataHealth.refresh=function(){throw Error('FICTIONAL UI error after save');};
      });
    }
    await upload(page,f.json);
    await endState(page,1,'HELD');
    const before=await page.evaluate(({id,year,month})=>{
      const raw=localStorage.getItem('insight_v11');
      return {
        raw,
        saved:JSON.parse(raw).stores[id].data[year][month][0].売上,
        live:allStores.stores[id].data[year][month][0].売上,
        held:InsightStorage.snapshotWritesHeld()
      };
    },f);
    expect(before.saved).toBe(777);
    expect(before.live).toBe(scenario==='postwrite-throw'?111:777);
    expect(before.held).toBe(scenario==='postwrite-throw');
    // A manual reload is the documented recovery procedure. It must not restore stale live data.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.InsightStorage&&typeof allStores!=='undefined'&&
      allStores&&allStores.stores&&typeof InsightStorage.snapshotWritesHeld==='function');
    const after=await page.evaluate(({id,year,month})=>{
      const raw=localStorage.getItem('insight_v11');
      return {
        raw,
        saved:JSON.parse(raw).stores[id].data[year][month][0].売上,
        live:allStores.stores[id].data[year][month][0].売上,
        held:InsightStorage.snapshotWritesHeld(),
        conflict:InsightStorage.reportState().conflict
      };
    },f);
    expect(after.raw).toBe(before.raw);
    expect([after.saved,after.live,after.held,after.conflict]).toEqual([777,777,false,false]);
  });
}

for(const rollbackFailure of ['before-rollback-write','after-rollback-write']){
  test(`FICTIONAL manual reload uses actual saved snapshot after ${rollbackFailure}`,async({page})=>{
    const f=await setup(page);
    await page.evaluate(({id,year,month,rollbackFailure})=>{
      const originalRead=InsightStorage.readSnapshot;
      let corruptReadbackOnce=true;
      InsightStorage.readSnapshot=function(){
        const value=originalRead.apply(this,arguments);
        if(corruptReadbackOnce&&window.__restoreWrites===1){
          corruptReadbackOnce=false;
          value.stores[id].data[year][month][0].売上+=1;
        }
        return value;
      };
      const originalWrite=InsightStorage.writeSnapshot;
      let attempts=0;
      InsightStorage.writeSnapshot=function(){
        attempts++;
        if(attempts===2&&rollbackFailure==='before-rollback-write')
          throw Error('FICTIONAL rollback interrupted before write');
        const result=originalWrite.apply(this,arguments);
        if(attempts===2&&rollbackFailure==='after-rollback-write')
          throw Error('FICTIONAL rollback interrupted after write');
        return result;
      };
    },{...f,rollbackFailure});
    await upload(page,f.json);
    await page.waitForFunction(()=>window.__restoreAlerts.some(message=>
      message.includes('自動復旧にも失敗')));
    const expected=rollbackFailure==='before-rollback-write'?777:111;
    const before=await page.evaluate(({id,year,month})=>{
      const raw=localStorage.getItem('insight_v11');
      return {
        raw,
        saved:JSON.parse(raw).stores[id].data[year][month][0].売上,
        live:allStores.stores[id].data[year][month][0].売上,
        held:InsightStorage.snapshotWritesHeld(),
        alerts:window.__restoreAlerts,
        observer:InsightRestoreOperationObserverV0.getStatus().state
      };
    },f);
    expect([before.saved,before.live,before.held,before.observer]).toEqual([expected,111,true,'HELD']);
    expect(before.alerts.join(' ')).toContain('この画面での再復元は行わないでください');
    expect(before.alerts.join(' ')).toContain('Insightを手動で再読み込み');
    // Reload must reflect actual persisted data, not assert a successful automatic rollback.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.InsightStorage&&typeof allStores!=='undefined'&&
      allStores&&allStores.stores&&typeof InsightStorage.snapshotWritesHeld==='function');
    const after=await page.evaluate(({id,year,month})=>{
      const raw=localStorage.getItem('insight_v11');
      return {
        raw,
        saved:JSON.parse(raw).stores[id].data[year][month][0].売上,
        live:allStores.stores[id].data[year][month][0].売上,
        held:InsightStorage.snapshotWritesHeld(),
        conflict:InsightStorage.reportState().conflict
      };
    },f);
    expect(after.raw).toBe(before.raw);
    expect([after.saved,after.live,after.held,after.conflict]).toEqual([expected,expected,false,false]);
  });
}

test('FICTIONAL native second tab cannot overwrite restored snapshot through metadata API',async({page})=>{
  const f=await setup(page);
  const second=await page.context().newPage();
  try{
    await second.route('**/Index.html*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
    });
    await second.goto('/Index.html',{waitUntil:'domcontentloaded'});
    await second.waitForFunction(()=>window.InsightStorage&&typeof allStores!=='undefined'&&
      allStores&&allStores.stores&&allStores.stores[allStores.current]);
    const oldLive=await second.evaluate(({id,year,month})=>
      allStores.stores[id].data[year][month][0].売上,f);
    expect(oldLive).toBe(111);
    await upload(page,f.json);
    await endState(page,1,'IDLE_OBSERVED');
    const restored=await snapshot(page,f);
    expect([restored.saved,restored.live,restored.writes]).toEqual([777,777,1]);
    const result=await second.evaluate(({id,year,month})=>{
      const before=localStorage.getItem('insight_v11');
      const errors=[];
      for(const action of [
        ()=>InsightStorage.writeMetadata('insight_v11','FICTIONAL unauthorized replacement'),
        ()=>InsightStorage.persistCurrent(allStores)
      ]){
        try{action();errors.push('not blocked');}catch(error){errors.push(error.name);}
      }
      InsightStorage.writeMetadata('insight_last_backup','FICTIONAL metadata allowed');
      return {
        errors,
        savedUnchanged:localStorage.getItem('insight_v11')===before,
        saved:JSON.parse(localStorage.getItem('insight_v11')).stores[id].data[year][month][0].売上,
        live:allStores.stores[id].data[year][month][0].売上,
        metadata:localStorage.getItem('insight_last_backup')
      };
    },f);
    expect(result).toEqual({
      errors:['InsightStorageMetadataKeyError','InsightStorageConflictError'],
      savedUnchanged:true,saved:777,live:111,metadata:'FICTIONAL metadata allowed'
    });
    const after=await snapshot(page,f);
    expect([after.saved,after.live,after.writes]).toEqual([777,777,1]);
  }finally{
    await second.close();
  }
});

test('FICTIONAL native external direct-storage update blocks stale save until manual reload',async({page})=>{
  const f=await setup(page);
  const other=await page.context().newPage();
  try{
    await other.route('**/Index.html*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
    });
    await other.goto('/Index.html',{waitUntil:'domcontentloaded'});
    await other.waitForFunction(()=>window.InsightStorage&&typeof allStores!=='undefined'&&
      allStores&&allStores.stores&&allStores.stores[allStores.current]);
    const initial=await other.evaluate(({id,year,month})=>({
      saved:JSON.parse(localStorage.getItem('insight_v11')).stores[id].data[year][month][0].売上,
      live:allStores.stores[id].data[year][month][0].売上
    }),f);
    expect(initial).toEqual({saved:111,live:111});

    // FICTIONAL external code writes a valid snapshot directly. This is a bypass
    // simulation, NOT a claim that Insight can prevent arbitrary localStorage writes.
    const externalRaw=await other.evaluate(({id,year,month})=>{
      const next=JSON.parse(localStorage.getItem('insight_v11'));
      next.stores[id].data[year][month][0].売上=555;
      const raw=JSON.stringify(next);
      localStorage.setItem('insight_v11',raw);
      return raw;
    },f);
    const stale=await page.evaluate(({id,year,month})=>{
      let errorName='none';
      try{InsightStorage.persistCurrent(allStores);}
      catch(error){errorName=error.name;}
      return {
        errorName,
        raw:localStorage.getItem('insight_v11'),
        saved:JSON.parse(localStorage.getItem('insight_v11')).stores[id].data[year][month][0].売上,
        live:allStores.stores[id].data[year][month][0].売上,
        conflict:InsightStorage.reportState().conflict,
        restoreHeld:InsightStorage.snapshotWritesHeld()
      };
    },f);
    expect(stale).toEqual({
      errorName:'InsightStorageConflictError',raw:externalRaw,
      saved:555,live:111,conflict:true,restoreHeld:false
    });

    // User's manual reload reconciles the live view with the actual persisted
    // bytes. This must not write the stale 111 value over the external 555.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.InsightStorage&&typeof allStores!=='undefined'&&
      allStores&&allStores.stores&&allStores.stores[allStores.current]&&
      typeof InsightStorage.snapshotWritesHeld==='function');
    const after=await page.evaluate(({id,year,month})=>({
      raw:localStorage.getItem('insight_v11'),
      saved:InsightStorage.readSnapshot().stores[id].data[year][month][0].売上,
      live:allStores.stores[id].data[year][month][0].売上,
      conflict:InsightStorage.reportState().conflict,
      restoreHeld:InsightStorage.snapshotWritesHeld()
    }),f);
    expect(after).toEqual({
      raw:externalRaw,saved:555,live:555,conflict:false,restoreHeld:false
    });
  }finally{
    await other.close();
  }
});
