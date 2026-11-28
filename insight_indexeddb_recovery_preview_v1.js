/* Draft-only recovery screen. The normal Insight loader does not mount it. */
(function(root){
  'use strict';

  function element(tag,text){
    const node=root.document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    return node;
  }

  function field(form,label,input){
    const wrapper=element('p');
    const caption=element('label',label+' ');
    caption.append(input);
    wrapper.append(caption);
    form.append(wrapper);
  }

  function mount(container,{mode='inspect',onCommitted}={}){
    if(!['inspect','restore','resume','missing'].includes(mode))throw new Error('Unknown recovery preview mode');
    const restoring=mode==='restore',resuming=mode==='resume';
    const missing=mode==='missing';
    const changesStorage=restoring||resuming||missing;
    if(changesStorage&&typeof onCommitted!=='function')throw new Error('Recovery requires an isolated restart handler');
    let committed=false;
    const section=element('section');
    const title=element('h2',restoring||missing?'暗号化バックアップから復元':resuming?'保存を再開':'暗号化バックアップの確認');
    const note=element('p',restoring?'現在の確定版と復元対象の暗号化バックアップが必要です。復元前の確定版は直前版に残り、それ以前の直前版は置き換わります。':
      missing?'端末上の保存記録を確認できません。使うバックアップの店舗・年度・作成日時を確認してください。':
      '保存を停止しています。バックアップの内容を確認できます。');
    const status=element('p');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    const form=element('form');
    const fields=element('fieldset');
    const file=element('input');
    file.type='file';
    file.accept='.json,application/json';
    file.required=true;
    const password=element('input');
    password.type='password';
    password.required=true;
    password.autocomplete='off';
    field(fields,restoring?'復元するバックアップ':'暗号化バックアップ',file);
    field(fields,restoring?'復元するバックアップのパスワード':'バックアップのパスワード',password);
    const safetyFile=file.cloneNode();
    const safetyPassword=password.cloneNode();
    if(restoring){
      field(fields,'復元前のバックアップ',safetyFile);
      field(fields,'復元前のパスワード',safetyPassword);
    }
    const closed=element('input');
    closed.type='checkbox';
    closed.required=true;
    if(changesStorage)field(fields,'旧版のInsightをすべて閉じました',closed);
    const submit=element('button','内容を表示');
    submit.type='submit';
    fields.append(submit);
    form.append(fields);

    const summary=element('div');
    summary.hidden=true;
    section.append(title,note,form,summary,status);
    container.append(section);

    function review(info){
      const heading=element('h3','選択したバックアップ');
      const timestamp=new Date(info.createdAt).toLocaleString('ja-JP');
      const list=element('ul');
      for(const store of info.stores){
        list.append(element('li',store.name+'（'+store.years.join('、')+'年度）'));
      }
      const approve=element('button',restoring||missing?'復元する':resuming?'この版で保存を再開する':'確認済みにする');
      const cancel=element('button','取り消す');
      approve.type=cancel.type='button';
      summary.replaceChildren(heading,element('p','作成日時 '+timestamp),list);
      summary.append(approve,cancel);
      summary.hidden=false;
      approve.focus();
      return new Promise(resolve=>{
        function finish(confirmed){
          summary.hidden=true;
          summary.replaceChildren();
          resolve(confirmed);
        }
        approve.addEventListener('click',()=>finish(true),{once:true});
        cancel.addEventListener('click',()=>finish(false),{once:true});
      });
    }

    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(fields.disabled||committed)return;
      fields.disabled=true;
      let passphrase=password.value,safetyPassphrase=safetyPassword.value;
      password.value=safetyPassword.value='';
      status.textContent='バックアップを確認中です。';
      try{
        const api=root.InsightIndexedDBStorageV1;
        if(changesStorage){
          const request={file:file.files[0],password:passphrase,legacyClientsClosed:closed.checked};
          const result=restoring?await api.restoreBackup({
            ...request,safetyFile:safetyFile.files[0],safetyPassword:safetyPassphrase,
            confirm:info=>review({...info.target,revision:info.revision})
          }):missing?await api.restoreMissingStorage({...request,confirm:review}):
            await api.resumeRecovery({...request,confirm:info=>review({...info.backup,revision:info.revision})});
          if(result.review==='cancelled'){
            status.textContent='取り消しました。';
          }else{
            committed=true;
            status.textContent=restoring||missing?'復元しました。':
              '保存を再開しました。画面を読み直しています。';
            await onCommitted(result.revision);
          }
        }else{
          const result=await api.reviewMissingStorageBackup(file.files[0],passphrase,review);
          status.textContent=result.review==='confirmed'
            ?'バックアップを確認しました。保存は停止したままです。'
            :'確認を取り消しました。保存は停止したままです。';
        }
      }catch(error){
        if(committed)status.textContent='確定版を更新しました。画面を開き直してから入力を再開してください。';
        else status.textContent=error?.name==='InsightBackupValidationError'
          ?error.message:'確認できませんでした。ファイル、パスワード、保存状態を確認してください。';
      }finally{
        passphrase=safetyPassphrase='';
        file.value=safetyFile.value='';
        closed.checked=false;
        fields.disabled=committed;
        if(!committed)file.focus();
      }
    });
  }

  function mountExport(container){
    const form=element('form');
    const fields=element('fieldset');
    fields.append(element('legend','暗号化バックアップ'));
    const password=element('input'),repeat=element('input');
    for(const input of [password,repeat]){
      input.type='password';
      input.required=true;
      input.autocomplete='new-password';
    }
    field(fields,'バックアップ用パスワード',password);
    field(fields,'パスワードの確認',repeat);
    const submit=element('button','バックアップを作成');
    submit.type='submit';
    const status=element('p');
    status.setAttribute('role','status');
    fields.append(submit);
    form.append(fields,status);
    container.append(form);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(fields.disabled)return;
      let passphrase=password.value;
      const matches=passphrase===repeat.value;
      password.value=repeat.value='';
      if(!matches){
        status.textContent='パスワードが一致しません。';
        password.focus();
        return;
      }
      fields.disabled=true;
      status.textContent='バックアップ作成中';
      try{
        await root.InsightIndexedDBStorageV1.downloadCommittedBackup(passphrase,form);
        status.textContent='バックアップを作成しました。';
      }catch(error){
        status.textContent=error?.name==='InsightBackupValidationError'?error.message:
          'バックアップを作成できませんでした。';
      }finally{
        passphrase='';
        fields.disabled=false;
        password.focus();
      }
    });
  }

  function connectSettings(actions,{onCommitted}){
    const backup=actions.querySelector('#backupBtn');
    const restore=actions.querySelector('#restoreBtn');
    const legacyFile=actions.querySelector('#restoreFile');
    if(!backup||!restore||!legacyFile||typeof onCommitted!=='function')
      throw new Error('Missing isolated settings controls');
    const dialog=element('dialog');
    dialog.id='insightIndexedDBBackupDialog';
    const heading=element('h2');
    heading.id='insightIndexedDBBackupHeading';
    dialog.setAttribute('aria-labelledby',heading.id);
    const formHost=element('div');
    const close=element('button','閉じる');
    close.type='button';
    dialog.append(heading,formHost,close);
    actions.after(dialog);
    let committed=false;
    const initiating=()=>committed||Boolean(formHost.querySelector('fieldset:disabled'));
    close.addEventListener('click',()=>{if(!initiating())dialog.close();});
    dialog.addEventListener('cancel',event=>{if(initiating())event.preventDefault();});
    dialog.addEventListener('close',()=>{if(!committed)formHost.replaceChildren();});
    function replaceAction(original,mode,title){
      const button=original.cloneNode(true);
      original.replaceWith(button);
      button.addEventListener('click',()=>{
        if(dialog.open||committed)return;
        dialog.classList.toggle('insight-backup-export',mode==='export');
        heading.textContent=title;
        formHost.replaceChildren();
        if(mode==='export')mountExport(formHost);
        else mount(formHost,{mode,onCommitted:async revision=>{
          committed=true;
          close.disabled=true;
          await onCommitted(revision);
        }});
        dialog.showModal();
      });
    }
    replaceAction(backup,'export','データバックアップ');
    replaceAction(restore,'restore','データ復元');
    actions.querySelector('#insightRestoreSafetyBackup')?.closest('label')?.remove();
    legacyFile.remove();
    return dialog;
  }

  root.InsightIndexedDBRecoveryPreviewV1=Object.freeze({mount,mountExport,connectSettings});
})(globalThis);
