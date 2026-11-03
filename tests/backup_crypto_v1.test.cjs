'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const source=fs.readFileSync(path.join(__dirname,'..','insight_backup_crypto_v1.js'),'utf8');
const PASSWORD='fictional-only-test-passphrase-2026';
const storeSnapshot={
  backupInfo:{format:'InsightBackup',formatVersion:2,storeCount:2},
  data:{schemaVersion:1,current:'store-a',
    stores:{'store-a':{name:'架空店舗A',years:['2025','2026'],data:{'2026':{'1月':[{d:'1',売上:123}]}}},
      'store-b':{name:'架空店舗B',years:['2026'],data:{'2026':{'1月':[{d:'1',売上:456}]}}}},
    salesCountManagement:{version:1,categories:[{id:'fictional',name:'架空カテゴリ',hidden:false,aliases:[]}]}}
};

function codec(secure=true){
  const window={
    isSecureContext:secure,crypto:webcrypto,
    btoa(value){return Buffer.from(value,'binary').toString('base64');},
    atob(value){return Buffer.from(value,'base64').toString('binary');}
  };
  vm.runInNewContext(source,{window,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer});
  return window.InsightBackupCryptoV1;
}
function clone(value){return JSON.parse(JSON.stringify(value));}

test('FICTIONAL two-store snapshot round-trips through authenticated AES-256-GCM',async()=>{
  const api=codec();
  const original=clone(storeSnapshot);
  const encrypted=await api.encrypt(original,PASSWORD);
  assert.equal(encrypted.format,'InsightEncryptedBackup');
  assert.equal(encrypted.formatVersion,1);
  assert.equal(encrypted.kdf.iterations,600000);
  assert.equal(encrypted.cipher.algorithm,'AES-256-GCM');
  assert.ok(encrypted.ciphertext.length>40);
  assert.equal(JSON.stringify(encrypted).includes('架空店舗A'),false);
  assert.equal(JSON.stringify(encrypted).includes('"売上"'),false);
  const decrypted=await api.decrypt(encrypted,PASSWORD);
  assert.deepEqual(clone(decrypted),original);
});

test('FICTIONAL two backups use different random salts and IVs',async()=>{
  const api=codec();
  const a=await api.encrypt(clone(storeSnapshot),PASSWORD);
  const b=await api.encrypt(clone(storeSnapshot),PASSWORD);
  assert.notEqual(a.kdf.salt,b.kdf.salt);
  assert.notEqual(a.cipher.iv,b.cipher.iv);
  assert.notEqual(a.ciphertext,b.ciphertext);
});

test('FICTIONAL wrong password and altered authenticated fields never yield data',async()=>{
  const api=codec();
  const saved=await api.encrypt(clone(storeSnapshot),PASSWORD);
  await assert.rejects(api.decrypt(saved,'wrong-password-2026'),/復号できません/);
  for(const edit of [
    file=>{file.cipher.iv=file.cipher.iv.replace(/^./,file.cipher.iv[0]==='A'?'B':'A');},
    file=>{file.kdf.salt=file.kdf.salt.replace(/^./,file.kdf.salt[0]==='A'?'B':'A');},
    file=>{file.ciphertext=file.ciphertext.replace(/^./,file.ciphertext[0]==='A'?'B':'A');}
  ]){
    const bad=clone(saved);edit(bad);
    await assert.rejects(api.decrypt(bad,PASSWORD));
  }
  const unsupported=clone(saved);unsupported.kdf.iterations=1;
  await assert.rejects(api.decrypt(unsupported,PASSWORD),/対応していない/);
  const malformed=clone(saved);malformed.ciphertext='malformed@';
  await assert.rejects(api.decrypt(malformed,PASSWORD),/形式が不正/);
});

test('FICTIONAL insecure contexts fail closed; no JSON fallback',async()=>{
  const api=codec(false);
  await assert.rejects(api.encrypt(clone(storeSnapshot),PASSWORD),/HTTPS/);
  const encrypted=await codec().encrypt(clone(storeSnapshot),PASSWORD);
  await assert.rejects(api.decrypt(encrypted,PASSWORD),/HTTPS/);
});

test('FICTIONAL short passwords and oversized payload are rejected',async()=>{
  const api=codec();
  await assert.rejects(api.encrypt(clone(storeSnapshot),'short'),/12文字以上/);
  await assert.rejects(api.encrypt(clone(storeSnapshot),'            '),/12文字以上/);
  await assert.rejects(api.encrypt({payload:'A'.repeat(15*1024*1024)},PASSWORD),/大きすぎます/);
});

test('existing plain JSON remains distinguishable; codec never rewrites the snapshot',async()=>{
  const api=codec();
  const original=clone(storeSnapshot);
  assert.equal(api.isEncryptedEnvelope(original),false);
  assert.equal(api.isEncryptedEnvelope({format:'InsightEncryptedBackup',formatVersion:1}),true);
  const encrypted=await api.encrypt(original,PASSWORD);
  assert.deepEqual(original,storeSnapshot);
  assert.equal(api.isEncryptedEnvelope(encrypted),true);
});
