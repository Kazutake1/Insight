/* Isolated IndexedDB migration preview. The public loader does not use it. */
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

  async function start(container,loadLegacy){
    container.textContent='保存状態を確認しています。';
    const diagnostic=await storage().diagnoseStartup();
    if(diagnostic.state==='legacy'){
      loadLegacy();
      return;
    }
    const message=diagnostic.reason==='indexeddb-adopted'
      ?'IndexedDBにコピーを確認しました。保存を停止しています。'
      :'保存状態を確認できないため、起動と保存を停止しています。';
    container.setAttribute('role','status');
    container.textContent=message;
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
        await storage().migrate({legacyClientsClosed:true});
        root.location.reload();
      }catch(error){
        const diagnostic=await storage().diagnoseStartup();
        if(diagnostic.state!=='legacy'){
          root.location.reload();
          return;
        }
        status.textContent=error?.message==='Backup save was not confirmed'
          ?'バックアップの確認を取り消しました。'
          :'移行を中止しました。編集中の操作と起動環境を確認してください。';
        checkbox.checked=false;
        checkbox.disabled=false;
        checkbox.focus();
      }
    });
  }

  root.InsightIndexedDBMigrationPreviewV1=Object.freeze({start,mount});
})(globalThis);
