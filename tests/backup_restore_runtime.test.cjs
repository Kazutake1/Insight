'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const backupSource=fs.readFileSync(path.join(__dirname,'..','insight_backup_guard_v1.js'),'utf8');
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
  const downloads=[],alerts=[],toasts=[];
  let confirmation=options.confirm!==false;
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
    InsightStorage:{
      CURRENT_SCHEMA_VERSION:1,
      migrateSnapshot(value){const valueCopy=clone(value);valueCopy.schemaVersion=1;return valueCopy;},
      serialize(value){return JSON.stringify(value);},
      readSnapshot(){
        const result=clone(persisted);
        if(readFaultOnce&&writeCount>0){
          readFaultOnce=false;
          result.stores.a.data['2026']['1月'][0].売上+=1;
        }
        return result;
      },
      writeSnapshot(value){
        if(failWriteOnce){
          failWriteOnce=false;
          const error=new Error('simulated quota exceeded');
          error.name='QuotaExceededError';
          throw error;
        }
        writeCount++;
        persisted=clone(value);
      },
      writeMetadata(){return true;}
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
      readAsText(file){this.onload({target:{result:file.contents}});}
    },
    currentNav:1,
    renderStoreSel(){},refreshDash(){},updateMissingBadge(){},
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
  return {ctx,window,original,restore,downloads,alerts,toasts,
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
