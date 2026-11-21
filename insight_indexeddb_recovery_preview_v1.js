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

  function mount(container){
    const section=element('section');
    const title=element('h2','暗号化バックアップの確認');
    const note=element('p','保存を停止しています。バックアップの内容を確認できます。');
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
    field(fields,'暗号化バックアップ',file);
    field(fields,'バックアップのパスワード',password);
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
      const approve=element('button','確認済みにする');
      const cancel=element('button','取り消す');
      approve.type=cancel.type='button';
      summary.replaceChildren(heading,element('p','作成日時 '+timestamp),list,approve,cancel);
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
      if(fields.disabled)return;
      fields.disabled=true;
      let passphrase=password.value;
      password.value='';
      status.textContent='バックアップを確認中です。';
      try{
        const result=await root.InsightIndexedDBStorageV1.reviewMissingStorageBackup(file.files[0],passphrase,review);
        status.textContent=result.review==='confirmed'
          ?'バックアップを確認しました。保存は停止したままです。'
          :'確認を取り消しました。保存は停止したままです。';
      }catch(error){
        status.textContent=error?.name==='InsightBackupValidationError'
          ?error.message:'確認できませんでした。ファイル、パスワード、保存状態を確認してください。';
      }finally{
        passphrase='';
        file.value='';
        fields.disabled=false;
        file.focus();
      }
    });
  }

  root.InsightIndexedDBRecoveryPreviewV1=Object.freeze({mount});
})(globalThis);
