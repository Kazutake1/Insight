/* Insight encrypted backup codec v1. Isolated until the UI and restore guard are integrated.
 * File encryption only: Insight's existing localStorage schema is unchanged.
 * Requires a secure context. Never logs or persists passwords or plaintext. */
(function(root){
  'use strict';
  if(root.InsightBackupCryptoV1)return;

  var FORMAT='InsightEncryptedBackup';
  var VERSION=1;
  var ITERATIONS=600000;
  var MAX_PLAINTEXT_BYTES=15*1024*1024;
  var MAX_CIPHERTEXT_BYTES=MAX_PLAINTEXT_BYTES+16;
  var encoder=new TextEncoder();
  var decoder=new TextDecoder('utf-8',{fatal:true});

  function cryptoApi(){
    if(root.isSecureContext!==true||!root.crypto||!root.crypto.subtle||
       typeof root.crypto.getRandomValues!=='function'){
      throw new Error('暗号化には安全なHTTPS環境が必要です。');
    }
    return root.crypto;
  }
  function passwordBytes(password){
    if(typeof password!=='string'||password.length<12||password.length>1024||
       !/\S/u.test(password)){
      throw new Error('パスワードは12文字以上1024文字以下で設定してください。');
    }
    return encoder.encode(password);
  }
  function toBase64(bytes){
    var result='';
    for(var i=0;i<bytes.length;i+=32768){
      result+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));
    }
    return root.btoa(result);
  }
  function fromBase64(value,maxBytes){
    if(typeof value!=='string'||value.length===0||value.length>Math.ceil(maxBytes/3)*4+4||
       !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)){
      throw new Error('暗号化バックアップの形式が不正です。');
    }
    var binary;
    try{binary=root.atob(value);}catch(_){throw new Error('暗号化バックアップの形式が不正です。');}
    if(binary.length>maxBytes)throw new Error('暗号化バックアップのサイズが大きすぎます。');
    var output=new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++)output[i]=binary.charCodeAt(i);
    if(toBase64(output)!==value)throw new Error('暗号化バックアップの形式が不正です。');
    return output;
  }
  function plainObject(o){return !!o&&typeof o==='object'&&!Array.isArray(o);}
  function headerAAD(file){
    return encoder.encode(JSON.stringify([
      file.format,file.formatVersion,file.kdf.algorithm,file.kdf.iterations,
      file.kdf.salt,file.cipher.algorithm,file.cipher.iv
    ]));
  }
  function validate(file){
    if(!plainObject(file)||file.format!==FORMAT||file.formatVersion!==VERSION||
       !plainObject(file.kdf)||!plainObject(file.cipher)||
       file.kdf.algorithm!=='PBKDF2-HMAC-SHA256'||file.kdf.iterations!==ITERATIONS||
       file.cipher.algorithm!=='AES-256-GCM'){
      throw new Error('対応していない暗号化バックアップ形式です。');
    }
    var salt=fromBase64(file.kdf.salt,16),iv=fromBase64(file.cipher.iv,12);
    if(salt.length!==16||iv.length!==12)throw new Error('暗号化バックアップのヘッダーが不正です。');
    var ciphertext=fromBase64(file.ciphertext,MAX_CIPHERTEXT_BYTES);
    if(ciphertext.length<16)throw new Error('暗号化バックアップの暗号文が不正です。');
    return {salt:salt,iv:iv,ciphertext:ciphertext};
  }
  async function keyFromPassword(api,bytes,salt){
    var material=await api.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);
    return api.subtle.deriveKey(
      {name:'PBKDF2',hash:'SHA-256',salt:salt,iterations:ITERATIONS},
      material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  }
  async function encrypt(payload,password){
    var api=cryptoApi(),bytes=passwordBytes(password);
    if(!plainObject(payload))throw new Error('バックアップデータが不正です。');
    var plaintext=encoder.encode(JSON.stringify(payload));
    if(plaintext.length>MAX_PLAINTEXT_BYTES)throw new Error('バックアップデータが大きすぎます。');
    var salt=new Uint8Array(16),iv=new Uint8Array(12);
    api.getRandomValues(salt);api.getRandomValues(iv);
    var file={
      format:FORMAT,formatVersion:VERSION,
      kdf:{algorithm:'PBKDF2-HMAC-SHA256',iterations:ITERATIONS,salt:toBase64(salt)},
      cipher:{algorithm:'AES-256-GCM',iv:toBase64(iv)}
    };
    var key=await keyFromPassword(api,bytes,salt);
    var ciphertext=await api.subtle.encrypt(
      {name:'AES-GCM',iv:iv,additionalData:headerAAD(file),tagLength:128},
      key,plaintext
    );
    file.ciphertext=toBase64(new Uint8Array(ciphertext));
    return file;
  }
  async function decrypt(file,password){
    var api=cryptoApi(),validated=validate(file),bytes=passwordBytes(password);
    var key=await keyFromPassword(api,bytes,validated.salt);
    var plaintext;
    try{
      plaintext=await api.subtle.decrypt(
        {name:'AES-GCM',iv:validated.iv,additionalData:headerAAD(file),tagLength:128},
        key,validated.ciphertext
      );
    }catch(_){
      throw new Error('復号できませんでした。パスワードまたはバックアップファイルを確認してください。');
    }
    try{
      var result=JSON.parse(decoder.decode(plaintext));
      if(!plainObject(result))throw new Error('Invalid backup JSON');
      return result;
    }catch(_){throw new Error('復号したバックアップデータが不正です。');}
  }
  function isEncryptedEnvelope(value){
    return plainObject(value)&&value.format===FORMAT;
  }

  root.InsightBackupCryptoV1=Object.freeze({
    format:FORMAT,version:VERSION,iterations:ITERATIONS,
    encrypt:encrypt,decrypt:decrypt,isEncryptedEnvelope:isEncryptedEnvelope
  });
})(typeof window!=='undefined'?window:globalThis);
