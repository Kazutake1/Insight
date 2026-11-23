/* IndexedDB startup diagnosis and the explicitly enabled manual migration flow. */
(function(root){
  'use strict';

  function element(tag,text){
    const node=root.document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    return node;
  }

  function storage(){
    return root.InsightIndexedDBStorageV1;
  }

  function clearFutureWeather(snapshot,today){
    let changed=false;
    function isFuture(year,month,day){
      if(!/^[1-9]\d{3}$/.test(year)||!Number.isInteger(day))return false;
      const date=new Date(Number(year),month-1,day);
      return date.getFullYear()===Number(year)&&date.getMonth()===month-1&&date.getDate()===day&&date>today;
    }
    for(const shop of Object.values(snapshot.stores)){
      for(const [year,months] of Object.entries(shop.data??{})){
        for(const [month,rows] of Object.entries(months??{})){
          const match=/^(1[0-2]|[1-9])月$/.exec(month);
          if(!match||!Array.isArray(rows))continue;
          rows.forEach((row,index)=>{
            if(!row||typeof row!=='object'||!isFuture(year,Number(match[1]),Number(row.d)||index+1))return;
            if(row.weather){row.weather='';changed=true;}
            for(const field of ['tempMaxC','tempMinC']){
              if(Object.hasOwn(row,field)){delete row[field];changed=true;}
            }
          });
        }
      }
    }
    for(const key of Object.keys(snapshot.sharedWeather??{})){
      const date=/^([1-9]\d{3})-(1[0-2]|[1-9])月-([1-9]\d?)$/.exec(key);
      if(date&&isFuture(date[1],Number(date[2]),Number(date[3]))){
        delete snapshot.sharedWeather[key];
        changed=true;
      }
    }
    return changed;
  }

  async function prepareAdoptedStartup(){
    const active=await storage().read();
    const candidate=structuredClone(active.snapshot);
    const today=new Date();
    today.setHours(0,0,0,0);
    return clearFutureWeather(candidate,today)?storage().save(active.revision,candidate):active;
  }

  async function start(container,loadLegacy,loadAdopted,{restart}={}){
    container.textContent='保存状態を確認しています。';
    const diagnostic=await storage().diagnoseStartup();
    if(diagnostic.state==='legacy'){
      await loadLegacy();
      return;
    }
    if(diagnostic.reason==='indexeddb-adopted'&&typeof loadAdopted==='function'){
      let prepared;
      try{prepared=await prepareAdoptedStartup();}
      catch(_){
        container.setAttribute('role','status');
        container.textContent='起動時の保存を確認できないため、入力を停止しています。';
        return;
      }
      await loadAdopted(prepared,typeof restart==='function'?{restart}:undefined);
      return;
    }
    if(typeof restart==='function'&&root.InsightIndexedDBRecoveryPreviewV1){
      const preview=root.InsightIndexedDBRecoveryPreviewV1;
      if(diagnostic.reason==='writing'||diagnostic.reason==='preparing'){
        let checked;
        try{checked=await storage().diagnose({verifyInterrupted:true});}
        catch(_){/* Leave startup held when the operation cannot be inspected. */}
        if(checked?.reason===diagnostic.reason&&
          ['migration-copy-verified','prior-save-verified','save-verified'].includes(checked.recovery)){
          container.replaceChildren();
          preview.mount(container,{mode:'resume',onCommitted:restart});
          return;
        }
      }else if(diagnostic.reason==='storage-history-unknown'){
        container.replaceChildren();
        preview.mount(container);
        return;
      }
    }
    const message=diagnostic.reason==='indexeddb-adopted'
      ?'IndexedDBにコピーを確認しました。保存を停止しています。'
      :'保存状態を確認できないため、起動と保存を停止しています。';
    container.setAttribute('role','status');
    container.textContent=message;
  }

  function selectVerifiedBackup(){
    const dialog=element('dialog');
    const title=element('h2','保存したバックアップの照合');
    const hint=element('p','ダウンロードした暗号化ファイルを選び、作成時のパスワードを入力してください。');
    const form=element('form');
    const file=element('input');
    file.type='file';
    file.accept='.json,application/json';
    file.required=true;
    const fileLabel=element('label','保存した暗号化バックアップ');
    fileLabel.append(file);
    const password=element('input');
    password.type='password';
    password.autocomplete='off';
    password.required=true;
    const passLabel=element('label','バックアップ照合用パスワード');
    passLabel.append(password);
    const verify=element('button','照合して移行');
    verify.type='submit';
    const cancel=element('button','移行を取り消す');
    cancel.type='button';
    const fields=element('fieldset');
    for(const label of [fileLabel,passLabel]){
      const line=element('p');
      line.append(label);
      fields.append(line);
    }
    fields.append(verify,cancel);
    form.append(fields);
    dialog.append(title,hint,form);
    dialog.setAttribute('aria-label',title.textContent);
    root.document.body.append(dialog);
    return new Promise(resolve=>{
      function finish(result){
        password.value='';
        dialog.close();
        dialog.remove();
        resolve(result);
      }
      form.addEventListener('submit',event=>{
        event.preventDefault();
        finish({file:file.files[0],password:password.value});
      },{once:true});
      cancel.addEventListener('click',()=>finish(null),{once:true});
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);},{once:true});
      dialog.showModal();
    });
  }

  function mount(container){
    if(root.localStorage.getItem('insight_v11')===null)return;
    const section=element('section');
    const heading=element('h2','IndexedDBへの移行（試験用）');
    const label=element('label','Insightの他のタブとホーム画面から開いたアプリを閉じました');
    const checkbox=element('input');
    checkbox.type='checkbox';
    label.prepend(checkbox);
    const confirmation=element('p');
    confirmation.append(label);
    const button=element('button','バックアップを作成して移行');
    button.type='button';
    button.disabled=true;
    const status=element('p');
    status.setAttribute('role','status');
    section.append(heading,confirmation,button,status);
    container.append(section);

    checkbox.addEventListener('change',()=>{button.disabled=!checkbox.checked;});
    button.addEventListener('click',async ()=>{
      if(button.disabled||!checkbox.checked)return;
      checkbox.disabled=button.disabled=true;
      status.textContent='移行の準備を確認しています。';
      try{
        await storage().migrate({legacyClientsClosed:true,selectVerifiedBackup});
        root.location.reload();
      }catch(error){
        const diagnostic=await storage().diagnoseStartup();
        if(diagnostic.state!=='legacy'){
          root.location.reload();
          return;
        }
        status.textContent=error?.message==='Backup save was not confirmed'
          ?'バックアップの確認を取り消しました。'
          :'移行を中止しました。バックアップのファイルとパスワード、起動環境を確認してください。';
        checkbox.checked=false;
        checkbox.disabled=false;
        checkbox.focus();
      }
    });
  }

  root.InsightIndexedDBMigrationPreviewV1=Object.freeze({start,mount});
})(globalThis);
