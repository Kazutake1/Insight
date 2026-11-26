/* Insight optional encrypted backup v1.
 * Standalone Web Crypto AES-256-GCM with per-file random salt/IV, PBKDF2-SHA-256.
 * NOT connected to existing plain backup/restore, localStorage or the shell.
 * The password is never stored, transmitted or returned. A weak password is unsafe.
 */
(function(root){
  'use strict';
  const FORMAT='insight-encrypted-backup';
  const VERSION=1,ITERATIONS=310000,MAX_BYTES=40*1024*1024;
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  function fail(code){throw new Error(code);}
  function plain(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&
    (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
  function cryptoProvider(){
    if(!root.crypto||typeof root.crypto.getRandomValues!=='function'||!root.crypto.subtle)
      fail('secure_crypto_unavailable');
    return root.crypto;
  }
  function keyInput(passphrase){
    if(typeof passphrase!=='string'||passphrase.length<16||passphrase.length>1024)
      fail('strong_passphrase_required');
    return encoder.encode(passphrase);
  }
  function b64(bytes){
    let s='';
    for(let i=0;i<bytes.length;i+=16384)
      s+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return btoa(s);
  }
  function fromB64(s,max){
    if(typeof s!=='string'||s.length>Math.ceil(max/3)*4+4||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
      fail('invalid_encrypted_backup');
    const bin=atob(s);
    if(bin.length>max||b64(Uint8Array.from(bin,ch=>ch.charCodeAt(0)))!==s)
      fail('invalid_encrypted_backup');
    return Uint8Array.from(bin,ch=>ch.charCodeAt(0));
  }
  async function derivedKey(passphrase,salt){
    const c=cryptoProvider(),raw=await c.subtle.importKey('raw',keyInput(passphrase),
      {name:'PBKDF2'},false,['deriveKey']);
    return c.subtle.deriveKey(
      {name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},raw,
      {name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  }
  function aad(){return encoder.encode(FORMAT+':v'+VERSION);}
  async function encryptBackupPayload(payload,passphrase){
    if(!plain(payload))fail('invalid_backup_payload');
    const serialized=JSON.stringify(payload);
    if(typeof serialized!=='string')fail('invalid_backup_payload');
    const bytes=encoder.encode(serialized);
    if(bytes.length>MAX_BYTES)fail('backup_too_large');
    const c=cryptoProvider(),salt=c.getRandomValues(new Uint8Array(16)),
      iv=c.getRandomValues(new Uint8Array(12));
    const key=await derivedKey(passphrase,salt);
    const ciphertext=await c.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:aad(),tagLength:128},key,bytes);
    return Object.freeze({
      format:FORMAT,version:VERSION,
      encryption:'AES-256-GCM',
      kdf:Object.freeze({name:'PBKDF2-SHA-256',iterations:ITERATIONS,salt:b64(salt)}),
      iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))
    });
  }
  async function decryptBackupPayload(envelope,passphrase){
    if(!plain(envelope)||envelope.format!==FORMAT||envelope.version!==VERSION||
      envelope.encryption!=='AES-256-GCM'||!plain(envelope.kdf)||
      envelope.kdf.name!=='PBKDF2-SHA-256'||
      envelope.kdf.iterations!==ITERATIONS)fail('invalid_encrypted_backup');
    const salt=fromB64(envelope.kdf.salt,16),iv=fromB64(envelope.iv,12),
      ciphertext=fromB64(envelope.ciphertext,MAX_BYTES+16);
    if(salt.length!==16||iv.length!==12||ciphertext.length<16)
      fail('invalid_encrypted_backup');
    const c=cryptoProvider(),key=await derivedKey(passphrase,salt);
    try{
      const raw=await c.subtle.decrypt(
        {name:'AES-GCM',iv,additionalData:aad(),tagLength:128},key,ciphertext);
      const output=JSON.parse(decoder.decode(raw));
      if(!plain(output))fail('invalid_encrypted_backup');
      return output;
    }catch(_){fail('backup_decryption_failed');}
  }
  const api=Object.freeze({FORMAT,VERSION,encryptBackupPayload,decryptBackupPayload});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.InsightSecureBackupCrypto=api;
})(typeof window!=='undefined'?window:globalThis);
