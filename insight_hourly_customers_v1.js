/* 時間帯別客数 v1: 日報集計とは独立した日付別0〜23時の客数データ */
(function(root){
  'use strict';

  function copy(value){return JSON.parse(JSON.stringify(value));}
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function validDate(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return false;
    var y=Number(match[1]),m=Number(match[2]),d=Number(match[3]),date=new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
  }
  function normalizeHours(value){
    var source=Array.isArray(value)?value:[],hours=[];
    for(var i=0;i<24;i++){
      var item=source[i];
      if(item===undefined||item===null||item==='')hours.push(null);
      else{
        var n=Number(item);
        if(!Number.isSafeInteger(n)||n<0)throw new Error('時間帯別客数は0以上の整数で入力してください。');
        hours.push(n);
      }
    }
    return hours;
  }
  function validate(all){
    if(!object(all)||!object(all.stores))throw new Error('店舗データが不正です。');
    Object.keys(all.stores).forEach(function(storeId){
      var data=all.stores[storeId].hourlyCustomers;
      if(data===undefined)return;
      if(!object(data))throw new Error('時間帯別客数データが不正です。');
      Object.keys(data).forEach(function(date){
        if(!validDate(date))throw new Error('時間帯別客数の日付が不正です。');
        var hours=data[date];
        if(!Array.isArray(hours)||hours.length!==24)throw new Error('時間帯別客数は24時間分で保存してください。');
        normalizeHours(hours);
      });
    });
    return all;
  }
  function get(all,storeId,date){
    var store=all&&all.stores&&all.stores[storeId],data=store&&store.hourlyCustomers;
    if(!data||!Array.isArray(data[date]))return null;
    return normalizeHours(data[date]);
  }
  function status(all,storeId,date){
    var hours=get(all,storeId,date)||Array(24).fill(null);
    var values=hours.filter(function(value){return value!==null;});
    return {
      hours:hours,
      count:values.length,
      complete:values.length===24,
      total:values.reduce(function(sum,value){return sum+value;},0)
    };
  }
  function set(all,storeId,date,hours){
    if(!validDate(date))throw new Error('時間帯別客数の日付が不正です。');
    if(!all||!all.stores||!all.stores[storeId])throw new Error('対象店舗がありません。');
    var normalized=normalizeHours(hours);
    var store=all.stores[storeId];
    if(!object(store.hourlyCustomers))store.hourlyCustomers={};
    if(normalized.every(function(value){return value===null;}))delete store.hourlyCustomers[date];
    else store.hourlyCustomers[date]=normalized;
    validate(all);
    return normalized;
  }

  var model={VERSION:1,validDate:validDate,normalizeHours:normalizeHours,validate:validate,get:get,status:status,set:set,copy:copy};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightHourlyCustomers=model;
  if(!root.document)return;

  function init(){
    if(root.__insightHourlyCustomersV1)return;
    if(!root.InsightHooks||!root.InsightDateContext||!root.InsightStorage){setTimeout(init,0);return;}
    root.__insightHourlyCustomersV1=true;
    var doc=root.document,activeDialog=null;

    function el(tag,text,cls){
      var node=doc.createElement(tag);
      if(text!==undefined)node.textContent=text;
      if(cls)node.className=cls;
      return node;
    }
    function selectedDate(){return root.InsightDateContext.getSelectedIso();}
    function selectedStore(){return typeof allStores!=='undefined'&&allStores?allStores.current:null;}
    function formatTotal(value){return Number(value||0).toLocaleString('ja-JP')+'人';}
    function statusText(value){
      if(!value.count)return '未入力';
      if(value.complete)return '入力済み 24/24　合計 '+formatTotal(value.total);
      return '途中 '+value.count+'/24　合計 '+formatTotal(value.total);
    }
    function persist(date,hours){
      var storeId=selectedStore();
      root.InsightStorage.transaction(allStores,function(next){
        set(next,storeId,date,hours);
      },validate,function(next){
        allStores.stores[storeId].hourlyCustomers=next.stores[storeId].hourlyCustomers||{};
        store=allStores.stores[allStores.current];
      });
    }
    function renderQuick(){
      var host=doc.getElementById('opsDailyWrap');
      if(!host)return;
      var old=doc.getElementById('hourlyCustomersQuick');if(old)old.remove();
      var date=selectedDate(),value=status(allStores,selectedStore(),date);
      var card=el('section',undefined,'ops-field-card hourly-quick-card');card.id='hourlyCustomersQuick';
      var head=el('div',undefined,'hourly-quick-head');
      var copyBox=el('div'),title=el('div','時間帯別客数','ops-field-title'),state=el('div',statusText(value),'hourly-quick-status');
      copyBox.append(title,state);
      var button=el('button',value.count?'編集':'入力','hourly-quick-button');button.type='button';button.onclick=function(){openDialog(date);};
      head.append(copyBox,button);card.append(head);
      var events=doc.getElementById('insightEvents');
      if(events&&events.parentElement===host)host.insertBefore(card,events);
      else host.append(card);
    }
    function openDialog(date){
      if(activeDialog)return;
      var saved=status(allStores,selectedStore(),date),draft=saved.hours.slice();
      var dialog=el('dialog',undefined,'hourly-dialog');activeDialog=dialog;
      var head=el('header'),heading=el('h2','時間帯別客数　'+date),close=el('button','閉じる');close.type='button';close.onclick=function(){dialog.close();};
      head.append(heading,close);dialog.append(head);

      var grid=el('div',undefined,'hourly-input-grid'),inputs=[];
      for(var block=0;block<4;block++){
        var group=el('section',undefined,'hourly-input-group');
        group.append(el('h3',(block*6)+'〜'+(block*6+5)+'時'));
        for(var offset=0;offset<6;offset++){
          var hour=block*6+offset,label=el('label'),caption=el('span',hour+'時'),input=el('input');
          input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.enterKeyHint=hour===23?'done':'next';
          input.value=draft[hour]===null?'':String(draft[hour]);input.dataset.hour=String(hour);input.setAttribute('aria-label',hour+'時台の客数');
          label.append(caption,input);group.append(label);inputs.push(input);
        }
        grid.append(group);
      }
      dialog.append(grid);

      var summary=el('div',undefined,'hourly-dialog-summary'),count=el('strong'),total=el('strong');summary.append(count,total);dialog.append(summary);
      function refresh(){
        var entered=0,sum=0;
        inputs.forEach(function(input,index){
          var raw=input.value.trim();
          if(raw===''){draft[index]=null;input.setCustomValidity('');return;}
          var n=Number(raw);
          if(!Number.isSafeInteger(n)||n<0){input.setCustomValidity('0以上の整数を入力してください');return;}
          input.setCustomValidity('');draft[index]=n;entered++;sum+=n;
        });
        count.textContent='入力 '+entered+'/24';
        total.textContent='合計 '+formatTotal(sum);
      }
      inputs.forEach(function(input,index){
        input.addEventListener('input',refresh);
        input.addEventListener('keydown',function(event){
          if(event.key==='Enter'){
            event.preventDefault();
            var next=inputs[index+1];
            if(next){next.focus();next.select();}
            else input.blur();
          }
        });
      });
      refresh();

      var actions=el('div',undefined,'hourly-actions'),cancel=el('button','キャンセル'),save=el('button','保存する','hourly-primary');
      cancel.type='button';cancel.onclick=function(){dialog.close();};save.type='button';save.onclick=function(){
        refresh();
        var invalid=inputs.find(function(input){return !input.checkValidity();});
        if(invalid){invalid.reportValidity();invalid.focus();return;}
        try{
          persist(date,draft);
          dialog.close();
          renderQuick();
          if(root.InsightEventResults&&typeof root.InsightEventResults.render==='function')root.InsightEventResults.render();
          if(typeof showToast==='function')showToast('✓ 時間帯別客数を保存しました','#15803d','#f0fdf4');
        }catch(error){alert('時間帯別客数を保存できませんでした。\n'+error.message);}
      };
      actions.append(cancel,save);dialog.append(actions);
      dialog.addEventListener('close',function(){dialog.remove();if(activeDialog===dialog)activeDialog=null;});
      doc.body.append(dialog);dialog.showModal();
      setTimeout(function(){var first=inputs.find(function(input){return input.value==='';})||inputs[0];if(first)first.focus();},0);
    }



    root.InsightHooks.on('quick:render:after','hourly-customers-render',renderQuick,25);
    if(typeof currentNav!=='undefined'&&currentNav===0)renderQuick();
    model.renderQuick=renderQuick;
  }

  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
