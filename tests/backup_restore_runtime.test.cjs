'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const backupSource=fs.readFileSync(path.join(__dirname,'..','insight_backup_guard_v1.js'),'utf8');
const {createOperationObserver}=require('../insight_operation_observer_v0.js');
const months=Array.from({length:12},(_,i)=>(i+1)+'月');
const days=[31,28,31,30,31,30,31,31,30,31,30,31];
const clone=value=>JSON.parse(JSON.stringify(value));

function snapshot(sales){
  function store(name){
    const data={'2026':{}};
    months.forEach((month,monthIndex)=>{
      data['2026'][month]=Array.from({length:days[monthIndex]},(_,i)=>({
        d:String(i+1),売上:sales,客数:10,買上点数:1,廃棄金額:0,
        haiki:{米飯:0},weather:'晴'
      }));
    });
    return {name,years:['2026'],data};
  }
  return {
    schemaVersion:1,current:'a',
    salesCountManagement:{version:1,categories:[
      {id:'cat_onigiri',name:'おにぎり',hidden:false,aliases:[]}
    ]},
    stores:{a:store('店舗A'),b:store('店舗B')}
  };
}

function fixture(options={}){
  const original=snapshot(100);
  let persisted=clone(original),writeCount=0,readFaultOnce=!!options.corruptAfterWrite;
  const downloads=[],alerts=[],toasts=[],samples=[],readers=[];
  let confirmation=options.confirm!==false;
  let writeHeld=false;
  let failWriteOnce=!!options.quotaOnce;
  const body={
    appendChild(node){node.parentNode=body;}
  };
  const document={
    body,
    createElement(name){
      assert.equal(name,'a');
      if(options.backupDownloadFailure)throw new Error('download was blocked');
      return {parentNode:null,href:'',download:'',
        click(){downloads.push(this.download);},
        remove(){this.parentNode=null;}
      };
    }
  };
  const window={
    __INSIGHT_SHELL_VERSION__:'test',
    InsightOperationObserverV0:options.missingObserver?undefined:{createOperationObserver},
    InsightStorage:{
      CURRENT_SCHEMA_VERSION:1,
      migrateSnapshot(value){const valueCopy=clone(value);valueCopy.schemaVersion=1;return valueCopy;},
      serialize(value){return options.indistinguishableSnapshots?'FICTIONAL identical serialized snapshots':JSON.stringify(value);},
      readSnapshot(){
        if(options.readbackUnavailableAfterCommit&&writeCount>0)throw Error('FICTIONAL readback unavailable');
        if(window.InsightRestoreOperationObserverV0)samples.push({point:'readback',...window.InsightRestoreOperationObserverV0.getStatus()});
        const result=clone(persisted);
        if(options.unexpectedReadbackAfterCommit&&writeCount>0){result.stores.a.data['2026']['1月'][0].売上=4242;}
        if(readFaultOnce&&writeCount>0){
          readFaultOnce=false;
          result.stores.a.data['2026']['1月'][0].売上+=1;
        }
        return result;
      },
      writeSnapshot(value){
        if(writeHeld){const err=new Error('FICTIONAL restore hold');err.name='InsightStorageRestoreHoldError';throw err;}
        if(window.InsightRestoreOperationObserverV0)samples.push({point:'before-write',...window.InsightRestoreOperationObserverV0.getStatus()});
        if(options.rollbackFailure&&writeCount===1)throw new Error('FICTIONAL rollback failed');
        if(failWriteOnce){
          failWriteOnce=false;
          const error=new Error('simulated quota exceeded');
          error.name='QuotaExceededError';
          throw error;
        }
        writeCount++;
        persisted=options.revertAfterWrite&&writeCount===1?clone(original):clone(value);
        if(window.InsightRestoreOperationObserverV0)samples.push({point:'after-write',...window.InsightRestoreOperationObserverV0.getStatus()});
        if(options.postcommitThrow&&writeCount===1)throw new Error('FICTIONAL postcommit write throw');
      },
      writeMetadata(){return true;},
      holdSnapshotWrites(){writeHeld=true;return true;},
      snapshotWritesHeld(){return writeHeld;}
    },
    InsightDataHealth:{
      check(){return {status:'ok',counts:{errors:0,warnings:0},issues:[]};}
    }
  };
  const ctx={
    window,globalThis:window,
    allStores:clone(original),store:null,SK:'insight_v11',
    MONTHS:months,DAYS_IN_MONTH:days,HAIKI_CATS:['米飯'],
    blankHaiki(){return {米飯:0};},
    migrateOldData(){throw new Error('legacy not expected in test');},
    document,
    URL:{createObjectURL(){return 'blob:fake';},revokeObjectURL(){}},
    Blob,Date,Number,Set,Map,String,Object,Array,Math,JSON,Promise,
    setTimeout(){return 1;},
    confirm(){return confirmation;},
    alert(message){alerts.push(String(message));},
    console:{warn(){},log(){}},
    FileReader:class FileReader{
      constructor(){readers.push(this);}
      readAsText(file){
        this._file=file;
        if(options.readThrows)throw new Error('FICTIONAL readAsText failed');
        if(!options.deferReader)this.onload({target:{result:file.contents}});
      }
    },
    currentNav:1,
    renderStoreSel(){},refreshDash(){if(options.uiFailure)throw new Error('FICTIONAL UI failure');},updateMissingBadge(){},
    showToast(message){toasts.push(message);},
    todayFY(){return {month:'10月'};}
  };
  ctx.store=ctx.allStores.stores.a;
  vm.createContext(ctx);
  vm.runInContext(backupSource,ctx);

  function restore(source){
    const contents=typeof source==='string'?source:JSON.stringify(source);
    const input={value:'selected',files:[{name:'backup.json',size:contents.length,contents}]};
    ctx.restoreData({target:input});
    return input;
  }
  return {ctx,window,original,restore,downloads,alerts,toasts,samples,readers,
    flushReader(){const r=readers.at(-1);r.onload({target:{result:r._file.contents}});},
    repeatReader(){const r=readers.at(-1);r.onload({target:{result:r._file.contents}});},
    get persisted(){return persisted;},
    get writeCount(){return writeCount;},
    setConfirmation(value){confirmation=!!value;}
  };
}

test('valid backup of two stores restores and saves a pre-restore download first',()=>{
  const f=fixture();
  const input=f.restore(snapshot(750));
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.equal(f.persisted.stores.b.data['2026']['12月'][30].売上,750);
  assert.equal(f.ctx.allStores.stores.a.data['2026']['1月'][0].売上,750);
  assert.equal(f.writeCount,1);
  assert.equal(f.downloads.length,1);
  assert.match(f.downloads[0],/^Insight_pre_restore_\d{8}_\d{6}\.json$/);
  assert.equal(input.value,'');
  assert.equal(f.alerts.length,0);
});

test('malformed JSON is rejected without modifying the current storage',()=>{
  const f=fixture();
  const input=f.restore('{not json');
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.downloads.length,0);
  assert.equal(input.value,'');
  assert.match(f.alerts.join('\n'),/復元できませんでした/);
});

test('invalid calendar rows reject before any backup replacement',()=>{
  const f=fixture();
  const invalid=snapshot(750);
  invalid.stores.a.data['2026']['2月'].pop();
  f.restore(invalid);
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.downloads.length,0);
  assert.match(f.alerts.join('\n'),/日別データ件数が不正/);
});

test('canceling a restore does not download or modify storage',()=>{
  const f=fixture({confirm:false});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.downloads.length,0);
});

test('a failed safety-backup download stops restoration before a write',()=>{
  const f=fixture({backupDownloadFailure:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.match(f.alerts.join('\n'),/復元直前バックアップを作成できない/);
});

test('storage quota failure leaves prior data untouched',()=>{
  const f=fixture({quotaOnce:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.downloads.length,1);
  assert.match(f.alerts.join('\n'),/保存容量が不足/);
});

test('post-restore readback mismatch automatically rolls back to original data',()=>{
  const f=fixture({corruptAfterWrite:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,2,'restore then rollback');
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.downloads.length,1);
  assert.match(f.alerts.join('\n'),/復元前の状態へ自動で戻しました/);
});


test('BR01 FICTIONAL deferred FileReader starts observation at write, stays ACTIVE through readback',()=>{
  const f=fixture({deferReader:true});
  const input=f.restore(snapshot(750));
  assert.equal(f.writeCount,0);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'UNAVAILABLE');
  f.flushReader();
  assert.equal(input.value,'');
  assert.equal(f.writeCount,1);
  assert.equal(f.samples.filter(x=>['before-write','after-write','readback'].includes(x.point)).length,3);
  assert.ok(f.samples.every(x=>x.state==='ACTIVE'&&x.activeCount===1));
  assert.deepEqual({state:f.window.InsightRestoreOperationObserverV0.getStatus().state,activeCount:f.window.InsightRestoreOperationObserverV0.getStatus().activeCount},
    {state:'IDLE_OBSERVED',activeCount:0});
  assert.equal(f.persisted.stores.b.data['2026']['12月'][30].売上,750);
});
test('BR02 FICTIONAL invalid file and confirmation cancellation never register a write token',()=>{
  for(const mode of ['cancel','invalid']){
    const f=fixture(mode==='cancel'?{confirm:false}:{});
    f.restore(mode==='cancel'?snapshot(750):'{bad json');
    assert.equal(f.writeCount,0);
    assert.deepEqual(f.persisted,f.original);
    assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'UNAVAILABLE');
  }
});
test('BR03 FICTIONAL quota exception holds without mutating persisted bytes',()=>{
  const f=fixture({quotaOnce:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
  assert.equal(f.samples[0].state,'ACTIVE');
});
test('BR04 FICTIONAL postflight mismatch rolls back but observation remains sticky HELD',()=>{
  const f=fixture({corruptAfterWrite:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,2);
  assert.deepEqual(f.persisted,f.original);
  assert.ok(f.samples.filter(x=>x.point==='before-write').every(x=>x.state==='ACTIVE'));
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR05 FICTIONAL rollback failure leaves partial commit and HELD without extra writes',()=>{
  const f=fixture({corruptAfterWrite:true,rollbackFailure:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.match(f.alerts.join(' '),/自動復旧にも失敗/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR06 FICTIONAL committed bytes survive UI failure; observation remains HELD',()=>{
  const f=fixture({uiFailure:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.match(f.alerts.join(' '),/復元したデータは保存されています/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR07 FICTIONAL observer missing never blocks original restore',()=>{
  const f=fixture({missingObserver:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'UNAVAILABLE');
});
test('BR08 FICTIONAL duplicate FileReader onload is not silently accepted as clean',()=>{
  const f=fixture({deferReader:true});
  f.restore(snapshot(750));
  f.flushReader();
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'IDLE_OBSERVED');
  f.repeatReader(); // Existing business may repeat; monitor must conservatively HOLD.
  assert.equal(f.writeCount,2);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR09 FICTIONAL observer factory failure never blocks the original write',()=>{
  const f=fixture({deferReader:true});
  f.window.InsightOperationObserverV0={createOperationObserver(){throw Error('FICTIONAL factory failure');}};
  f.restore(snapshot(750));
  f.flushReader();
  assert.equal(f.writeCount,1);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR10 FICTIONAL postcommit write throw is HELD even if the original guard shows an optimistic warning',()=>{
  const f=fixture({postcommitThrow:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR11 FICTIONAL readAsText synchronous exception keeps original exception and HELD',()=>{
  const f=fixture({readThrows:true});
  assert.throws(()=>f.restore(snapshot(750)),/FICTIONAL readAsText failed/);
  assert.equal(f.writeCount,0);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR12 FICTIONAL reader abort leaves existing data untouched and conservatively HELD',()=>{
  const f=fixture({deferReader:true});
  f.restore(snapshot(750));
  f.readers[0].onabort();
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});


test('BR13 FICTIONAL saved-after-throw identifies target data without falsely claiming unchanged',()=>{
  const f=fixture({postcommitThrow:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.equal(f.ctx.allStores.stores.a.data['2026']['1月'][0].売上,100);
  assert.equal(f.alerts.length,1);
  assert.match(f.alerts[0],/保存領域に復元対象と一致するデータ/);
  assert.match(f.alerts[0],/整合性確認・画面更新は完了していません/);
  assert.doesNotMatch(f.alerts[0],/現在のデータは変更されていません/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR14 FICTIONAL unreadable postthrow state is uncertain and does not retry writes',()=>{
  const f=fixture({postcommitThrow:true,readbackUnavailableAfterCommit:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.match(f.alerts.join(' '),/現在の保存状態を確認できませんでした/);
  assert.doesNotMatch(f.alerts.join(' '),/現在のデータは変更されていません/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR15 FICTIONAL prewrite quota error retains previous-data warning and never retries',()=>{
  const f=fixture({quotaOnce:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,0);
  assert.deepEqual(f.persisted,f.original);
  assert.match(f.alerts.join(' '),/現在のデータは変更されていません/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR16 FICTIONAL third-state readback does not classify an unknown writer as target',()=>{
  const f=fixture({postcommitThrow:true,unexpectedReadbackAfterCommit:true});
  f.restore(snapshot(750));
  assert.equal(f.writeCount,1);
  assert.match(f.alerts.join(' '),/現在の保存状態を確認できませんでした/);
  assert.doesNotMatch(f.alerts.join(' '),/現在のデータは変更されていません/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});
test('BR17 FICTIONAL indistinguishable previous and target serialized values stay uncertain',()=>{
  const f=fixture({postcommitThrow:true,indistinguishableSnapshots:true});
  f.restore(snapshot(100));
  assert.equal(f.writeCount,1);
  assert.match(f.alerts.join(' '),/現在の保存状態を確認できませんでした/);
  assert.equal(f.window.InsightRestoreOperationObserverV0.getStatus().state,'HELD');
});

test('BR18 FICTIONAL postwrite throw latches hold against later stale-live writer',()=>{
  const f=fixture({postcommitThrow:true});
  f.restore(snapshot(750));
  assert.equal(f.window.InsightStorage.snapshotWritesHeld(),true);
  assert.equal(f.ctx.allStores.stores.a.data['2026']['1月'][0].売上,100);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
  assert.throws(()=>f.window.InsightStorage.writeSnapshot(f.ctx.allStores),error=>error.name==='InsightStorageRestoreHoldError');
  assert.equal(f.writeCount,1);
  assert.equal(f.persisted.stores.a.data['2026']['1月'][0].売上,750);
});
test('BR19 FICTIONAL rollback failure holds writes and guides manual reload before recovery',()=>{
  const f=fixture({corruptAfterWrite:true,rollbackFailure:true});
  f.restore(snapshot(750));
  assert.equal(f.window.InsightStorage.snapshotWritesHeld(),true);
  assert.throws(()=>f.window.InsightStorage.writeSnapshot(f.ctx.allStores),/FICTIONAL restore hold/);
  assert.equal(f.writeCount,1);
  assert.equal(f.alerts.length,1);
  const notice=f.alerts[0];
  const steps=[
    'Insight_pre_restore_...json を保管してください',
    '追加の編集・保存',
    'この画面での再復元は行わないでください',
    'Insightを手動で再読み込み',
    '保存内容を確認してください',
    'その後、必要な場合のみ保管したバックアップから復元してください'
  ];
  const positions=steps.map(step=>notice.indexOf(step));
  assert.ok(positions.every(position=>position>=0),'復旧案内の必須手順が欠落しています');
  assert.ok(positions.every((position,i)=>i===0||position>positions[i-1]),'復旧案内の順序が不正です');
  assert.doesNotMatch(notice,/json を使って手動で復元してください/);
});
test('BR20 FICTIONAL uncertain postthrow latches hold without retry',()=>{
  const f=fixture({postcommitThrow:true,readbackUnavailableAfterCommit:true});
  f.restore(snapshot(750));
  assert.equal(f.window.InsightStorage.snapshotWritesHeld(),true);
  assert.equal(f.writeCount,1);
});
test('BR21 FICTIONAL previous-observed, prewrite quota and successful rollback do not latch',()=>{
  for(const options of [{postcommitThrow:true,revertAfterWrite:true},{quotaOnce:true},{corruptAfterWrite:true}]){
    const f=fixture(options);
    f.restore(snapshot(750));
    assert.equal(f.window.InsightStorage.snapshotWritesHeld(),false,JSON.stringify(options));
  }
});
test('BR22 FICTIONAL successful restore, UI error and duplicate onload do not latch',()=>{
  for(const options of [{},{uiFailure:true},{deferReader:true}]){
    const f=fixture(options);
    f.restore(snapshot(750));
    if(options.deferReader){f.flushReader();f.repeatReader();assert.equal(f.writeCount,2);}
    assert.equal(f.window.InsightStorage.snapshotWritesHeld(),false,JSON.stringify(options));
  }
});
