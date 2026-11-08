'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {encryptBackupPayload,decryptBackupPayload,FORMAT}=require('../insight_secure_backup_crypto_v1.js');
const PASSWORD='test only - strong memorable passphrase not used in production';
function backup(){return {
  backupInfo:{kind:'synthetic-offline-test'},
  data:{current:'secret-store-55',stores:{
    'secret-store-55':{name:'PRIVATE_STORE_NAME',data:{'2026-10-17':{sales:1500,customers:42}}}
  }}
};}
test('C01: WebCrypto round-trip retains exact backup object, without modifying original',async()=>{
  const input=backup(),before=JSON.stringify(input);
  const enc=await encryptBackupPayload(input,PASSWORD);
  assert.equal(enc.format,FORMAT);
  assert.equal(enc.encryption,'AES-256-GCM');
  assert.equal(enc.kdf.name,'PBKDF2-SHA-256');
  assert.equal(enc.kdf.iterations,310000);
  assert.equal(JSON.stringify(input),before);
  const restored=await decryptBackupPayload(enc,PASSWORD);
  assert.deepEqual(restored,input);
});
test('C02: unencrypted content, names, IDs, exact dates and passphrase do not appear in ciphertext metadata',async()=>{
  const enc=await encryptBackupPayload(backup(),PASSWORD);
  const s=JSON.stringify(enc);
  for(const secret of ['PRIVATE_STORE_NAME','secret-store-55','2026-10-17',PASSWORD,
    'customers','sales','backupInfo','stores'])
    assert.equal(s.includes(secret),false,secret);
  assert.equal(Object.isFrozen(enc),true);
  assert.equal(Object.isFrozen(enc.kdf),true);
});
test('C03: independent randomized backups never share the same salt, IV or ciphertext',async()=>{
  const one=await encryptBackupPayload(backup(),PASSWORD);
  const two=await encryptBackupPayload(backup(),PASSWORD);
  assert.notEqual(one.kdf.salt,two.kdf.salt);
  assert.notEqual(one.iv,two.iv);
  assert.notEqual(one.ciphertext,two.ciphertext);
});
test('C04: wrong password or ciphertext/tag modification fails closed with generic error',async()=>{
  const enc=await encryptBackupPayload(backup(),PASSWORD);
  await assert.rejects(decryptBackupPayload(enc,'incorrect passphrase with 30 letters'),/backup_decryption_failed/);
  const altered=structuredClone(enc);
  const raw=altered.ciphertext;
  altered.ciphertext=(raw[0]==='A'?'B':'A')+raw.slice(1);
  await assert.rejects(decryptBackupPayload(altered,PASSWORD),/backup_decryption_failed/);
});
test('C05: altered header, weakened KDF, invalid salt/IV and short passphrases rejected',async()=>{
  const enc=await encryptBackupPayload(backup(),PASSWORD);
  for(const bad of [
    {...enc,version:2},{...enc,encryption:'AES-128-CBC'},
    {...enc,kdf:{...enc.kdf,iterations:1}},
    {...enc,kdf:{...enc.kdf,salt:'!!!'}},
    {...enc,iv:'invalid-base64'},
    {...enc,ciphertext:'not a valid blob'}
  ])await assert.rejects(decryptBackupPayload(bad,PASSWORD),/invalid_encrypted_backup/);
  await assert.rejects(encryptBackupPayload(backup(),'short'),/strong_passphrase_required/);
});
test('C06: cryptographic helper has no storage, network or automatic restore hooks',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../insight_secure_backup_crypto_v1.js'),'utf8');
  assert.doesNotMatch(source,/\blocalStorage\b\s*\.|fetch\s*\(|XMLHttpRequest|WebSocket|writeSnapshot\s*\(/);
});
