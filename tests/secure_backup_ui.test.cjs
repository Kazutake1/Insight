'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {Blob,File}=require('node:buffer');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const fictional={backupInfo:{format:'InsightBackup',formatVersion:2,createdAt:'2026-10-24T00:00:00.000Z'},
  data:{schemaVersion:1,current:'fictional',stores:{fictional:{name:'架空店舗',years:['2026'],data:{'2026':{}}}}}};
const secret='correct horse battery staples 2026';
function fixture(){
  const downloads=[],restores=[],dialogs=[];
  let confirmReturn=true;
  const root={
    crypto:webcrypto,
    InsightBackupGuard:{buildExportPayload(){return clone(fictional);}},
    confirm(message){dialogs.push(message);return confirmReturn;},
    restoreData(event){restores.push(event.target.files[0]);},
    document:{
      head:{appendChild(){}},
      readyState:'loading',addEventListener(){},
      createElement(tag){
        if(tag==='link')return {rel:'',href:''};
        if(tag==='a')return {parentNode:null,href:'',download:'',
          click(){downloads.push(this.download);},
          remove(){this.parentNode=null;}};
        throw Error('Unexpected element '+tag);
      },
      body:{appendChild(node){node.parentNode=this;}}
    }
  };
  const blobs=[];
  const sandbox={window:root,globalThis:root,TextEncoder,TextDecoder,Uint8Array,
    btoa:x=>Buffer.from(x,'binary').toString('base64'),
    atob:x=>Buffer.from(x,'base64').toString('binary'),
    Blob,File,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:test';},
      revokeObjectURL(){}},
    Date,setTimeout(){},setInterval(){},clearInterval(){},
    JSON,Error,Object,Promise,Math,Buffer};
  vm.createContext(sandbox);
  vm.runInContext(read('insight_secure_backup_crypto_v1.js'),sandbox);
  vm.runInContext(read('insight_secure_backup_ui_v1.js'),sandbox);
  return {root,ui:root.InsightSecureBackupUI,crypto:root.InsightSecureBackupCrypto,
    downloads,blobs,restores,dialogs,setConfirmation(v){confirmReturn=v;}};
}
async function encryptedFile(f){
  await f.ui.exportEncrypted(secret,secret);
  assert.equal(f.downloads.length,1);
  assert.match(f.downloads[0],/\.insight\.enc\.json$/);
  const text=await f.blobs[0].text();
  return {text,file:new File([text],'backup.insight.enc.json',{type:'application/json'})};
}

test('encrypted export stores only an authenticated ciphertext envelope and preserves the source data',async()=>{
  const f=fixture(),before=JSON.stringify(fictional);
  const {text}=await encryptedFile(f);
  const json=JSON.parse(text);
  assert.equal(json.format,'insight-encrypted-backup');
  assert.equal(json.encryption,'AES-256-GCM');
  assert.equal(Object.hasOwn(json,'data'),false);
  assert.doesNotMatch(text,/架空店舗|schemaVersion|stores|backupInfo/);
  assert.deepEqual(clone(await f.crypto.decryptBackupPayload(json,secret)),fictional);
  assert.equal(JSON.stringify(fictional),before);
});

test('passphrase confirmation rejects export before download',async()=>{
  const f=fixture();
  await assert.rejects(f.ui.exportEncrypted(secret,'different passphrase'),/passphrase_mismatch/);
  assert.equal(f.downloads.length,0);
});

test('decrypted payload uses the unchanged restoreData entry point after an explicit plain safety-backup warning',async()=>{
  const f=fixture(),{file}=await encryptedFile(f);
  assert.equal(await f.ui.importEncrypted(file,secret),true);
  assert.equal(f.restores.length,1);
  assert.deepEqual(JSON.parse(await f.restores[0].text()),fictional);
  assert.match(f.dialogs.join(' '),/平文JSON/);
});

test('a wrong passphrase cannot enter the existing restore path',async()=>{
  const f=fixture(),{file}=await encryptedFile(f);
  await assert.rejects(f.ui.importEncrypted(file,'incorrect password with length'),/backup_decryption_failed/);
  assert.equal(f.restores.length,0);
});

test('tampered encrypted file cannot enter restore',async()=>{
  const f=fixture(),{text}=await encryptedFile(f);
  const obj=JSON.parse(text);
  const c=obj.ciphertext;
  obj.ciphertext=(c[0]==='A'?'B':'A')+c.slice(1);
  const file=new File([JSON.stringify(obj)],'tampered.json');
  await assert.rejects(f.ui.importEncrypted(file,secret),/backup_decryption_failed/);
  assert.equal(f.restores.length,0);
});

test('unsupported format, malformed file and oversized file are blocked before restore',async()=>{
  const f=fixture();
  for(const file of [
    new File(['{broken'],'malformed.json'),
    new File(['{"format":"unsupported"}'],'unsupported.json'),
    {size:59*1024*1024,text:async()=>'{ }'}
  ]){
    await assert.rejects(f.ui.importEncrypted(file,secret));
  }
  assert.equal(f.restores.length,0);
});

test('canceled warning stops before legacy restore and leaves the file untouched',async()=>{
  const f=fixture(),{file}=await encryptedFile(f);
  f.setConfirmation(false);
  assert.equal(await f.ui.importEncrypted(file,secret),false);
  assert.equal(f.restores.length,0);
});

test('oversized decrypted legacy backup is refused before passing to the 20MB restore path',async()=>{
  const f=fixture();
  const oversized={data:{notes:'x'.repeat(20*1024*1024)}};
  f.root.InsightSecureBackupCrypto=Object.freeze({...f.crypto,decryptBackupPayload:async()=>oversized});
  await assert.rejects(f.ui.importEncrypted(new File(['{}'],'huge.json'),secret),/backup_too_large_for_restore/);
  assert.equal(f.restores.length,0);
});

test('manifest loads crypto before opt-in UI, preserves backup guard, and updates HTML shell version',()=>{
  const loader=read('insight_shell_loader_v1.js');
  const index=read('Index.html'),boot=read('insight_shell_boot_v1.js');
  assert.ok(loader.indexOf('insight_backup_guard_v1.js')<loader.indexOf('insight_secure_backup_crypto_v1.js'));
  assert.ok(loader.indexOf('insight_secure_backup_crypto_v1.js')<loader.indexOf('insight_secure_backup_ui_v1.js'));
  assert.ok(loader.indexOf('insight_settings_v1.js')<loader.indexOf('insight_secure_backup_ui_v1.js'));
  assert.match(boot,/20261024-encrypted-backup-build-97/);
  assert.match(index,/20261024-encrypted-backup-build-97/);
  assert.match(read('insight_backup_guard_v1.js'),/buildExportPayload/);
});
