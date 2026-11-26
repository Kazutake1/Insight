'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {candidateSource,MiB,encryptedFileLimit}=require('./backup-capacity-source.cjs');

async function main(){
  const size=Number(process.argv[2]);
  assert.ok([25,50,100].includes(size));
  const window={isSecureContext:true,crypto:webcrypto,btoa,atob};
  vm.runInNewContext(candidateSource('insight_backup_crypto_v1.js'),{window,TextEncoder,TextDecoder,Uint8Array});
  const codec=window.InsightBackupCryptoV1;
  const password='Fictional-capacity-only-2026';
  const payload={backupInfo:{format:'InsightBackup',formatVersion:2},data:{fictional:''}};
  const fill=bytes=>{
    payload.data.fictional='';
    const padding=bytes-Buffer.byteLength(JSON.stringify(payload));
    payload.data.fictional='架'.repeat(Math.floor(padding/3))+'A'.repeat(padding%3);
  };
  fill(size*MiB);
  assert.equal(Buffer.byteLength(JSON.stringify(payload)),size*MiB);
  let start=performance.now();
  const encrypted=await codec.encrypt(payload,password);
  const encryptMs=Math.round(performance.now()-start);
  start=performance.now();
  const decrypted=await codec.decrypt(encrypted,password);
  const decryptMs=Math.round(performance.now()-start);
  assert.equal(decrypted.data.fictional,payload.data.fictional);
  const fileBytes=Buffer.byteLength(JSON.stringify(encrypted,null,2));
  assert.equal(encrypted.ciphertext.length,Math.ceil((size*MiB+16)/3)*4);
  assert.ok(fileBytes<=encryptedFileLimit);
  if(size===100){
    fill(size*MiB+1);
    await assert.rejects(codec.encrypt(payload,password),/大きすぎます/);
  }
  console.log(JSON.stringify({engine:'node',sizeMiB:size,fileBytes,encryptMs,decryptMs,peakRssKiB:process.resourceUsage().maxRSS}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
