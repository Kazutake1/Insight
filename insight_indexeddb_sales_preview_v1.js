/* Isolated first IndexedDB sale save. The public shell does not load it. */
(function(root){
  'use strict';

  function element(tag,text){
    const node=root.document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    return node;
  }

  async function open(container,{year,month,day}){
    const api=root.InsightIndexedDBStorageV1;
    const status=element('p','保存済みの売上を読み込んでいます。');
    status.setAttribute('role','status');
    container.replaceChildren(status);

    let committed,target;
    try{
      committed=await api.read();
      target={storeId:committed.snapshot.current,year,month,day};
      const shop=committed.snapshot.stores[target.storeId];
      const row=shop.data?.[year]?.[month]?.[day-1];
      if(!row||Number(row.d)!==day||!Object.hasOwn(row,'売上'))throw new Error('Saved day missing');
    }catch(_){
      status.textContent='売上を読み込めないため、保存を停止しています。';
      return;
    }

    function rowOf(snapshot){
      return snapshot.stores[target.storeId].data[target.year][target.month][target.day-1];
    }

    const form=element('form');
    const heading=element('h2','売上入力（試験用）');
    const shop=committed.snapshot.stores[target.storeId];
    const date=element('p',shop.name+' '+year+'年度 '+month+day+'日');
    const confirmed=element('p','確定済みの売上 '+rowOf(committed.snapshot).売上+'円');
    const label=element('label','売上（円） ');
    const input=element('input');
    input.type='number';
    input.min='0';
    input.step='1';
    input.required=true;
    input.value=String(rowOf(committed.snapshot).売上);
    label.append(input);
    const button=element('button','売上を保存');
    button.type='submit';
    form.append(label,button);
    status.textContent='';
    container.replaceChildren(heading,date,confirmed,form,status);

    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(button.disabled)return;
      const value=input.valueAsNumber;
      if(!Number.isSafeInteger(value)||value<0){
        status.textContent='売上は0以上の整数で入力してください。';
        return;
      }
      const candidate=JSON.parse(JSON.stringify(committed.snapshot));
      rowOf(candidate).売上=value;
      button.disabled=true;
      input.readOnly=true;
      status.textContent='保存を確認しています。';
      try{
        committed=await api.save(committed.revision,candidate);
        confirmed.textContent='確定済みの売上 '+rowOf(committed.snapshot).売上+'円';
        status.textContent='売上を保存しました。';
        button.disabled=false;
      }catch(_){
        status.textContent='保存結果を確認できないため、追加の保存を停止しました。';
      }finally{
        input.readOnly=false;
      }
    });
  }

  root.InsightIndexedDBSalesPreviewV1=Object.freeze({open});
})(globalThis);
