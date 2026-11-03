/* Passwords live only in this modal and its awaiting caller; never persisted. */
(function(root){
  'use strict';
  var overlay=null,pending=null,cancelBusy=null,previousFocus=null;
  function close(){
    if(pending){var resolve=pending;pending=null;resolve(null);}
    cancelBusy=null;
    if(overlay){overlay.querySelectorAll('input').forEach(function(input){input.value='';});overlay.remove();overlay=null;}
    try{if(previousFocus&&previousFocus.isConnected)previousFocus.focus();}catch(_){}
    previousFocus=null;
  }
  function shell(title){
    if(!overlay){
      previousFocus=document.activeElement;
      overlay=document.createElement('div');overlay.id='insightBackupOverlay';
      overlay.className='insight-backup-overlay';
      overlay.addEventListener('keydown',function(event){
        if(event.key==='Escape'){event.preventDefault();cancel();}
        if(event.key==='Tab'){
          var nodes=Array.from(overlay.querySelectorAll('input,button')).filter(function(n){return !n.disabled;});
          var first=nodes[0],last=nodes[nodes.length-1];
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
      });
      document.body.appendChild(overlay);
    }
    overlay.replaceChildren();
    var panel=document.createElement('section');panel.className='insight-backup-panel';
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','insightBackupTitle');
    var heading=document.createElement('h2');heading.id='insightBackupTitle';heading.textContent=title;panel.appendChild(heading);overlay.appendChild(panel);
    return panel;
  }
  function cancel(){
    if(pending){var resolve=pending;pending=null;close();resolve(null);}
    else if(cancelBusy){var fn=cancelBusy;cancelBusy=null;fn();overlay.querySelector('button').disabled=true;}
  }
  function button(text,fn){var b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
  function request(options){
    var panel=shell(options.title),form=document.createElement('form');
    var note=document.createElement('p');note.textContent=options.confirm
      ?'12〜1024文字で設定してください。パスワードを忘れると復号できません。保存・送信はしません。'
      :'このバックアップの作成時に設定したパスワードを入力してください。';
    panel.appendChild(note);
    var inputs=[];
    ['パスワード'].concat(options.confirm?['確認入力']:[]).forEach(function(text,index){
      var label=document.createElement('label');label.textContent=text;
      var input=document.createElement('input');input.type='password';input.autocomplete='off';input.required=true;input.minLength=12;input.maxLength=1024;
      input.id=index?'insightBackupPasswordConfirm':'insightBackupPassword';
      label.appendChild(input);form.appendChild(label);inputs.push(input);
    });
    var error=document.createElement('p');error.className='insight-backup-error';error.setAttribute('role','alert');form.appendChild(error);
    var actions=document.createElement('div');actions.className='insight-backup-actions';
    actions.appendChild(button('キャンセル',cancel));
    var submit=document.createElement('button');submit.type='submit';submit.textContent=options.confirm?'暗号化して続行':'復号して続行';actions.appendChild(submit);form.appendChild(actions);panel.appendChild(form);
    form.addEventListener('submit',function(event){
      event.preventDefault();var password=inputs[0].value;
      if(password.length<12||password.length>1024||! /\S/u.test(password)){error.textContent='12〜1024文字のパスワードを入力してください。';return;}
      if(inputs[1]&&inputs[1].value!==password){error.textContent='確認入力が一致しません。';return;}
      var resolve=pending;pending=null;inputs.forEach(function(input){input.value='';});
      if(resolve)resolve(password);
    });
    inputs[0].focus();
    return new Promise(function(resolve){pending=resolve;});
  }
  function busy(message,onCancel){
    var panel=shell(message),note=document.createElement('p');note.textContent='処理中です。しばらくお待ちください。';note.setAttribute('role','status');panel.appendChild(note);
    cancelBusy=onCancel;var b=button('キャンセル',cancel);panel.appendChild(b);b.focus();
  }
  root.InsightBackupPasswordV1=Object.freeze({request:request,busy:busy,close:close});
})(window);
