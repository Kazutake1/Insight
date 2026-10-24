/* Optional encrypted backup controls; separate from the existing JSON restore path.
 * Browser-only, no network requests, storage-schema changes or passphrase persistence.
 */
(function(root){
  'use strict';
  if(root.InsightSecureBackupUI)return;
  const MAX_RESTORE_BYTES=20*1024*1024;
  const MAX_ENCRYPTED_FILE_BYTES=58*1024*1024;
  const model={};
  root.InsightSecureBackupUI=model;

  function cryptoEngine(){
    if(!root.InsightSecureBackupCrypto)throw new Error('secure_crypto_unavailable');
    if(!root.InsightBackupGuard||typeof root.InsightBackupGuard.buildExportPayload!=='function')
      throw new Error('backup_guard_unavailable');
    return root.InsightSecureBackupCrypto;
  }
  function stamp(now){
    const pad=n=>String(n).padStart(2,'0');
    return now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+'_'
      +pad(now.getHours())+pad(now.getMinutes())+pad(now.getSeconds());
  }
  function downloadEnvelope(envelope){
    const blob=new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=root.document.createElement('a');
    try{
      link.href=url;
      link.download='Insight_backup_encrypted_'+stamp(new Date())+'.insight.enc.json';
      root.document.body.appendChild(link);
      link.click();
    }finally{
      if(link.parentNode)link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  }
  function safeError(error){
    const code=String(error&&error.message||'');
    if(code==='secure_crypto_unavailable')return '暗号化を利用できない環境です。HTTPSと対応ブラウザーを確認してください。';
    if(code==='backup_guard_unavailable')return 'バックアップ機能の初期化が完了していません。再読み込みしてください。';
    if(code==='strong_passphrase_required')return 'パスフレーズは16文字以上1024文字以下で指定してください。';
    if(code==='backup_too_large'||code==='restore_file_too_large')return 'ファイルが大きすぎるため処理できません。';
    if(code==='backup_too_large_for_restore')return '復元上限（20MB）を超えるため暗号化バックアップを作成・復元できません。';
    if(code==='invalid_encrypted_backup'||code==='invalid_backup_payload')return '暗号化バックアップの形式が不正です。';
    if(code==='backup_decryption_failed')return '復号できません。パスフレーズ、ファイルの破損・改ざんを確認してください。';
    if(code==='passphrase_mismatch')return '確認用のパスフレーズが一致しません。';
    return '処理に失敗しました。ファイルとブラウザーの設定を確認してください。';
  }
  function plainBackupSize(payload){
    const serialized=JSON.stringify(payload);
    if(typeof serialized!=='string')throw new Error('invalid_backup_payload');
    const byteLength=new Blob([serialized]).size;
    if(byteLength>MAX_RESTORE_BYTES)throw new Error('backup_too_large_for_restore');
    return serialized;
  }
  async function exportEncrypted(passphrase,confirmation){
    const engine=cryptoEngine();
    if(passphrase!==confirmation)throw new Error('passphrase_mismatch');
    // Matches the legacy backup format and takes a snapshot before async key derivation.
    const payload=root.InsightBackupGuard.buildExportPayload();
    plainBackupSize(payload);
    const envelope=await engine.encryptBackupPayload(payload,passphrase);
    downloadEnvelope(envelope);
  }
  async function importEncrypted(file,passphrase){
    const engine=cryptoEngine();
    if(!file||file.size>MAX_ENCRYPTED_FILE_BYTES)throw new Error('restore_file_too_large');
    const parsed=JSON.parse(await file.text());
    const payload=await engine.decryptBackupPayload(parsed,passphrase);
    const serialized=plainBackupSize(payload);
    if(!root.confirm('暗号化バックアップを復号しました。復元すると、既存の復元機能が「復元直前バックアップ」を平文JSONでダウンロードします。このファイルは暗号化されません。安全な場所で管理してください。復元手順に進みますか？'))return false;
    if(typeof root.restoreData!=='function'||typeof File!=='function')
      throw new Error('backup_guard_unavailable');
    // Route through the existing preflight, user confirmation, pre-restore backup,
    // postflight verification and rollback. No second writer or restore logic.
    const restoreFile=new File([serialized],'Insight_decrypted_backup.json',{type:'application/json'});
    root.restoreData({target:{files:[restoreFile],value:''}});
    return true;
  }
  model.exportEncrypted=exportEncrypted;
  model.importEncrypted=importEncrypted;

  function setup(){
    const host=root.InsightSettings&&root.InsightSettings.page&&
      root.InsightSettings.page.querySelector('.insight-settings-content');
    if(!host)return false;
    if(root.document.getElementById('insightEncryptedBackup'))return true;
    const section=root.document.createElement('section');
    section.id='insightEncryptedBackup';
    section.className='insight-settings-section';
    section.innerHTML=
      '<h2>暗号化バックアップ（任意）</h2>'+
      '<p>従来のJSONバックアップ・復元はそのまま利用できます。暗号化はダウンロードするファイルだけに適用され、端末内の保存データは暗号化されません。パスフレーズを失うと復元できません。</p>'+
      '<div class="insight-secure-group"><h3>暗号化して保存</h3>'+
      '<label class="insight-secure-field">パスフレーズ（16文字以上）<input id="insightSecureExportPass" type="password" autocomplete="new-password" maxlength="1024"></label>'+
      '<label class="insight-secure-field">パスフレーズ（確認）<input id="insightSecureExportConfirm" type="password" autocomplete="new-password" maxlength="1024"></label>'+
      '<button id="insightSecureExport" type="button">暗号化バックアップを作成</button>'+
      '<p id="insightSecureExportStatus" role="status" aria-live="polite"></p></div>'+
      '<div class="insight-secure-group"><h3>暗号化バックアップから復元</h3>'+
      '<label class="insight-secure-field">暗号化ファイル<input id="insightSecureRestoreFile" type="file" accept=".json,application/json"></label>'+
      '<label class="insight-secure-field">パスフレーズ<input id="insightSecureRestorePass" type="password" autocomplete="off" maxlength="1024"></label>'+
      '<button id="insightSecureRestore" type="button">復号して復元手順へ</button>'+
      '<p>復元の前に、従来機能が現在のデータを平文JSONで自動退避します。平文ファイルの管理に注意してください。</p>'+
      '<p id="insightSecureRestoreStatus" role="status" aria-live="polite"></p></div>';
    host.appendChild(section);
    const find=id=>section.querySelector('#'+id);
    const exportButton=find('insightSecureExport'),restoreButton=find('insightSecureRestore');
    exportButton.addEventListener('click',async()=>{
      if(exportButton.disabled)return;
      const pass=find('insightSecureExportPass'),confirm=find('insightSecureExportConfirm'),
        status=find('insightSecureExportStatus');
      exportButton.disabled=true;status.textContent='';
      try{
        await exportEncrypted(pass.value,confirm.value);
        status.textContent='暗号化ファイルのダウンロードを開始しました。保管場所と復元用パスフレーズを確認してください。';
      }catch(error){status.textContent=safeError(error);}
      finally{pass.value='';confirm.value='';exportButton.disabled=false;}
    });
    restoreButton.addEventListener('click',async()=>{
      if(restoreButton.disabled)return;
      const fileInput=find('insightSecureRestoreFile'),pass=find('insightSecureRestorePass'),
        status=find('insightSecureRestoreStatus');
      restoreButton.disabled=true;status.textContent='';
      try{
        const proceeded=await importEncrypted(fileInput.files[0],pass.value);
        status.textContent=proceeded?'既存の復元確認へ進みました。':'復元をキャンセルしました。';
      }catch(error){status.textContent=safeError(error);}
      finally{pass.value='';fileInput.value='';restoreButton.disabled=false;}
    });
    return true;
  }
  function init(){
    if(setup())return;
    let tries=0;
    const timer=setInterval(()=>{if(setup()||++tries>=50)clearInterval(timer);},100);
  }
  if(root.document){
    const link=root.document.createElement('link');
    link.rel='stylesheet';
    link.href='./insight_secure_backup_ui_v1.css?v=20261024-security-1';
    root.document.head.appendChild(link);
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
    else setTimeout(init,0);
  }
})(typeof window!=='undefined'?window:globalThis);
