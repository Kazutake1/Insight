/* 店舗イベント v1: 日次数値とは独立して保存。開催内容はプリセットから複製する。 */
(function(root){
  'use strict';
  var TYPES={sale:'セール',campaign:'キャンペーン',nearby:'近隣イベント',environment:'周辺環境',equipment:'設備',staff:'人員',bulk:'大口注文',other:'その他'};
  var METHODS={amount:'○円引き',percent:'○%引き',fixed:'○円均一',multi:'複数購入値引き',gift:'購入特典',other:'その他／自由条件'};
  var CATEGORIES=['おにぎり','フライヤー','中華まん','麺類','ブリトー','その他'];
  var FIELDS={amount:[['amount','値引き額（円）',1]],percent:[['percent','割引率（%）',0.1,100]],fixed:[['minPrice','対象価格下限（円）',0],['maxPrice','対象価格上限（円）',0],['price','均一価格（円）',0]],multi:[['quantity','購入個数',1],['amount','値引き額（円）',1]],gift:[['quantity','購入個数',1],['giftType','特典種類（例：商品無料）'],['giftProduct','特典商品'],['giftQuantity','特典数量',1],['giftUnit','特典の単位（例：本・杯・個）']],other:[['text','自由条件']]};
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function requireValue(ok,message){if(!ok)throw new Error(message);}
  function str(v,label,empty){requireValue(typeof v==='string'&&(empty||v.trim().length>0)&&v.length<=2000,label+'を確認してください。');}
  function validDate(v){
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'1000-01-01')return false;
    var d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
  }
  function validateSnapshot(s){
    requireValue(object(s)&&s.version===1,'イベント内容の形式が不正です。');
    str(s.title,'名称');str(s.note,'補足',true);
    if(s.sale!==undefined){
      var sale=s.sale;requireValue(object(sale)&&object(sale.params),'セール条件が不正です。');
      str(sale.category,'対象カテゴリ');str(sale.method,'セール方式');
      (FIELDS[sale.method]||[]).forEach(function(f){
        var v=sale.params[f[0]];
        if(f.length===2){str(v,f[1]);return;}
        requireValue(typeof v==='number'&&Number.isFinite(v)&&v>=f[2]&&(f[3]===undefined||v<=f[3])&&(f[0]==='percent'||Number.isSafeInteger(v)),f[1]+'を確認してください。');
      });
      if(sale.method==='fixed')requireValue(sale.params.minPrice<=sale.params.maxPrice,'価格の下限は上限以下にしてください。');
    }
    return s;
  }
  function validate(all){
    var ids=new Set();
    function unique(v){str(v.id,'識別番号');requireValue(!ids.has(v.id),'イベントの識別番号が重複しています。');ids.add(v.id);}
    function events(items,scope){
      requireValue(Array.isArray(items),'イベント一覧が不正です。');
      items.forEach(function(e){
        requireValue(object(e),'イベントが不正です。');unique(e);str(e.type,'種別');
        requireValue(e.scope===scope,'イベントの保存範囲が不正です。');
        if(e.type==='sale'||e.type==='campaign')requireValue(scope==='global','セール・キャンペーンは全店舗共通です。');
        if(['nearby','environment','equipment','staff','bulk'].indexOf(e.type)>=0)requireValue(scope==='store','この種別は店舗ごとに保存します。');
        requireValue(validDate(e.startDate)&&validDate(e.endDate)&&e.startDate<=e.endDate,'開催期間を確認してください。');
        validateSnapshot(e.snapshot);
        if(e.type==='sale')requireValue(!!e.snapshot.sale,'セール条件がありません。');
        if(e.presetId!==undefined)str(e.presetId,'プリセット番号');
      });
    }
    if(all.eventManagement!==undefined){
      var m=all.eventManagement;
      requireValue(object(m)&&m.version===1&&Array.isArray(m.presets),'店舗イベントの保存形式に対応していません。');
      m.presets.forEach(function(p){requireValue(object(p),'よく使うセールが不正です。');unique(p);validateSnapshot(p.snapshot);requireValue(!!p.snapshot.sale,'よく使うセールの条件がありません。');});
      events(m.events,'global');
    }
    Object.keys(all.stores||{}).forEach(function(id){var st=all.stores[id];if(st.events!==undefined)events(st.events,'store');});
    return all;
  }
  function summary(s){
    if(!s.sale)return s.title;
    var a=s.sale,p=a.params,t='';
    switch(a.method){
      case 'amount':t=p.amount+'円引き';break;
      case 'percent':t=p.percent+'%引き';break;
      case 'fixed':t=p.minPrice+'〜'+p.maxPrice+'円の商品を'+p.price+'円均一';break;
      case 'multi':t=p.quantity+'個購入で'+p.amount+'円引き';break;
      case 'gift':t=p.quantity+'個購入で'+p.giftProduct+p.giftQuantity+p.giftUnit+(p.giftType==='商品無料'?'無料':'（'+p.giftType+'）');break;
      case 'other':t=p.text;break;
      default:t=s.title;
    }
    return a.category+' '+t;
  }
  function presets(all){return all.eventManagement?all.eventManagement.presets:[];}
  function list(all,storeId,start,end){
    end=end||start;
    var global=all.eventManagement?all.eventManagement.events:[],local=(all.stores[storeId]||{}).events||[];
    return copy(global.concat(local).filter(function(e){return e.startDate<=end&&e.endDate>=start;}));
  }
  function id(){return 'evt_'+(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));}
  function management(all){return all.eventManagement||(all.eventManagement={version:1,presets:[],events:[]});}
  function add(all,storeId,event){
    var e=copy(event);e.id=id();
    if(e.scope==='global')management(all).events.push(e);
    else{requireValue(!!all.stores[storeId],'対象店舗がありません。');(all.stores[storeId].events||(all.stores[storeId].events=[])).push(e);}
    validate(all);return e.id;
  }
  var model={validate:validate,validateSnapshot:validateSnapshot,summary:summary,list:list,presets:presets,add:add,copy:copy};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  if(!root.document)return;
  root.InsightEvents=model;

  function init(){
    if(root.__insightEventsV1)return;
    root.__insightEventsV1=true;
    var doc=root.document,activeDialog=null;
    function el(tag,text,cls){var n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
    function button(text,fn){var b=el('button',text);b.type='button';b.onclick=fn;return b;}
    function selectedDate(){var input=doc.getElementById('iqdDateInput');return input?input.value:String(todayInfo.fy)+'-'+String(todayInfo.mIdx+1).padStart(2,'0')+'-'+String(quickEditDay).padStart(2,'0');}
    function transaction(fn){
      try{
        var next=copy(allStores);fn(next);validate(next);
        // 保存できた場合のみメモリーへ反映する。既存 persist の容量不足の黙殺を引き継がない。
        localStorage.setItem(SK,JSON.stringify(next));
        if(next.eventManagement!==undefined)allStores.eventManagement=next.eventManagement;
        Object.keys(next.stores).forEach(function(key){if(next.stores[key].events!==undefined)allStores.stores[key].events=next.stores[key].events;});
        render();return true;
      }catch(e){alert('イベントを保存できませんでした。\n'+e.message+'\n入力済みデータは変更していません。');return false;}
    }
    var style=el('style');style.textContent=`
      #insightEvents{margin-top:10px;font-size:12px}#insightEvents .ie-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      #insightEvents button,.ie-dialog button{border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);padding:7px 10px;font:inherit;cursor:pointer}
      #insightEvents .ie-list{display:flex;flex-wrap:wrap;gap:6px}.ie-chip{display:flex;align-items:center;gap:6px;max-width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:4px 7px}.ie-chip span{overflow-wrap:anywhere}.ie-chip small{color:var(--text4);white-space:nowrap}#insightEvents .ie-chip button{padding:0 5px;border:0;font-size:17px}#insightEvents .ie-chip .ie-summary{font-size:12px;text-align:left;overflow-wrap:anywhere;min-width:0;padding:0}
      .ie-dialog{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:88vh;overflow:auto;border:1px solid var(--border);border-radius:18px;padding:20px;background:var(--surface);color:var(--text);font:12px/1.55 -apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;box-shadow:0 12px 40px #0003}.ie-dialog::backdrop{background:#0005}.ie-dialog h2{font-size:16px;margin:0}.ie-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.ie-dialog label{display:flex;flex-direction:column;gap:4px;margin:10px 0}.ie-dialog input,.ie-dialog select,.ie-dialog textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:9px;padding:9px;background:var(--input-bg,var(--surface2));color:var(--text);font:inherit}.ie-dialog textarea{min-height:64px;resize:vertical}.ie-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ie-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ie-dialog .ie-primary{background:var(--text);color:var(--surface)}.ie-muted{font-size:11px;color:var(--text4);margin:5px 0}.ie-presets{display:flex;flex-wrap:wrap;gap:6px}.ie-preset-row{border-bottom:1px solid var(--border);padding:10px 0}.ie-preset-row div{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ie-dialog button:disabled{opacity:.4;cursor:default}
      .ie-dialog.ie-event-add{position:fixed;inset:0;margin:auto}
    `;doc.head.appendChild(style);
    function dialog(title){
      var d=el('dialog',undefined,'ie-dialog'),head=el('header');
      var h=el('h2',title);h.id=id();d.setAttribute('aria-labelledby',h.id);head.append(h,button('閉じる',function(){d.close();}));d.append(head);
      d.addEventListener('close',function(){d.remove();if(activeDialog===d)activeDialog=null;});doc.body.append(d);d.showModal();return d;
    }
    function field(parent,label,type,value){var l=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value==null?'':String(value);input.setAttribute('aria-label',label);l.append(input);parent.append(l);return input;}
    function select(parent,label,options,value){var l=el('label',label),s=el('select');Object.keys(options).forEach(function(k){var o=el('option',options[k]);o.value=k;s.append(o);});s.value=value;s.setAttribute('aria-label',label);l.append(s);parent.append(l);return s;}
    function saleEditor(parent,snapshot){
      var initial=snapshot&&snapshot.sale,catOptions={};CATEGORIES.forEach(function(c){catOptions[c]=c;});if(initial)catOptions[initial.category]=initial.category;
      var cat=select(parent,'対象カテゴリ',catOptions,initial?initial.category:CATEGORIES[0]);
      var methods=Object.assign({},METHODS);if(initial&&!methods[initial.method])methods[initial.method]=initial.method+'（既存方式）';
      var method=select(parent,'セール方式',methods,initial?initial.method:'amount');var params=el('div');parent.append(params);var inputs={};
      function draw(){params.replaceChildren();inputs={};(FIELDS[method.value]||[]).forEach(function(f){
        var value=initial&&method.value===initial.method?initial.params[f[0]]:f[0]==='giftType'?'商品無料':f[0]==='giftUnit'?'本':'';
        var input=field(params,f[1],f.length===2?'text':'number',value);input.required=true;
        if(f.length>2){input.min=f[2];input.step=f[0]==='percent'?'0.1':'1';if(f[3]!==undefined)input.max=f[3];}inputs[f[0]]=input;
      });}
      method.onchange=draw;draw();
      var note=field(parent,'補足（任意）','textarea',snapshot?snapshot.note:'');
      return function(){
        var p=initial&&method.value===initial.method?copy(initial.params):{};
        (FIELDS[method.value]||[]).forEach(function(f){requireValue(inputs[f[0]].value.trim()!=='',f[1]+'を入力してください。');p[f[0]]=f.length===2?inputs[f[0]].value.trim():Number(inputs[f[0]].value);});
        var s={version:1,title:cat.value,note:note.value.trim(),sale:{category:cat.value,method:method.value,params:p}};
        validateSnapshot(s);return s;
      };
    }
    function render(){
      var container=doc.getElementById('opsDailyWrap');if(!container)return;
      var old=doc.getElementById('insightEvents');if(old)old.remove();
      var wrap=el('section');wrap.id='insightEvents';wrap.setAttribute('aria-label','店舗イベント');
      var head=el('div',undefined,'ie-head');head.append(el('strong','店舗イベント'),button('＋イベントを追加',openEvent));wrap.append(head);
      var rows=el('div',undefined,'ie-list');
      try{validate(allStores);list(allStores,allStores.current,selectedDate()).forEach(function(e){
        var chip=el('div',undefined,'ie-chip');chip.title=e.startDate+' 〜 '+e.endDate+(e.snapshot.note?'\n'+e.snapshot.note:'');
        var desc=summary(e.snapshot);
        var details=button(desc,function(){var d=dialog(TYPES[e.type]||e.type);d.append(el('p',desc),el('p',e.startDate+' 〜 '+e.endDate),el('p',e.scope==='global'?'全店舗共通':'この店舗のみ'));if(e.snapshot.note){var note=el('p',e.snapshot.note);note.style.whiteSpace='pre-wrap';d.append(note);}});details.className='ie-summary';
        chip.append(el('small',TYPES[e.type]||e.type),details,el('small',e.scope==='global'?'全店舗':'この店舗'));
        var remove=button('×',function(){
          if(!confirm(desc+'\n'+e.startDate+' 〜 '+e.endDate+'\n'+(e.scope==='global'?'全店舗':'この店舗')+'の開催記録を期間全体から削除します。過去の日付の表示も消えます。\nよろしいですか？'))return;
          transaction(function(next){var target=e.scope==='global'?next.eventManagement:next.stores[allStores.current];target.events=target.events.filter(function(v){return v.id!==e.id;});});
        });remove.setAttribute('aria-label',desc+'を削除');chip.append(remove);rows.append(chip);
      });}catch(e){rows.append(el('span','イベントデータを読み込めません。バックアップを確認してください。'));}
      wrap.append(rows);container.append(wrap);
    }
    function openEvent(){
      if(activeDialog)return;
      var storeId=allStores.current,d=dialog('店舗イベントを追加');d.classList.add('ie-event-add');activeDialog=d;
      var form=el('form');d.append(form);
      var type=select(form,'イベント種別',TYPES,'sale');
      var scopeText=el('p',undefined,'ie-muted');form.append(scopeText);
      var dates=el('div',undefined,'ie-dates');form.append(dates);
      var start=field(dates,'開始日','date',selectedDate()),end=field(dates,'終了日','date',selectedDate());start.required=end.required=true;
      start.onchange=function(){if(end.value<start.value)end.value=start.value;};
      var content=el('div');form.append(content);var read,scope,showAll=false;
      function save(snapshot,presetId){
        try{
          requireValue(storeId===allStores.current,'店舗が変更されています。画面を開き直してください。');
          var e={type:type.value,scope:type.value==='sale'||type.value==='campaign'?'global':type.value==='other'?scope.value:'store',startDate:start.value,endDate:end.value,snapshot:snapshot};
          if(presetId)e.presetId=presetId;
          if(transaction(function(next){add(next,storeId,e);}))d.close();
        }catch(err){alert(err.message);}
      }
      function draw(){
        content.replaceChildren();scopeText.textContent=type.value==='sale'||type.value==='campaign'?'全店舗共通・指定期間の各日に表示します。':'現在の店舗：'+allStores.stores[storeId].name;
        if(type.value==='sale'){
          var h=el('div',undefined,'ie-head');h.append(el('strong','よく使うセール'),button('編集',function(){managePresets(draw);}));content.append(h);
          var ps=el('div',undefined,'ie-presets'),items=presets(allStores);items.slice(0,showAll?items.length:6).forEach(function(p){ps.append(button(summary(p.snapshot),function(){save(copy(p.snapshot),p.id);}));});
          if(!items.length)ps.append(el('span','「編集」からよく使うセールを追加できます。','ie-muted'));
          if(items.length>6)ps.append(button(showAll?'折りたたむ':'すべて表示（'+items.length+'件）',function(){showAll=!showAll;draw();}));content.append(ps,el('p','選ぶと上記の期間で登録します。個別の条件は下で入力できます。','ie-muted'));
          read=saleEditor(content);
        }else{
          if(type.value==='other')scope=select(content,'適用範囲',{store:'この店舗のみ',global:'全店舗共通'},'store');
          var title=field(content,'イベント名','text',''),note=field(content,'補足（任意）','textarea','');title.required=true;
          read=function(){return {version:1,title:title.value.trim(),note:note.value.trim()};};
        }
      }
      type.onchange=draw;draw();
      form.append(el('p','イベントは登録時に保存されます。日次の「クリア」では削除されません。','ie-muted'));
      var actions=el('div',undefined,'ie-actions'),submit=el('button','登録する','ie-primary');submit.type='submit';actions.append(button('キャンセル',function(){d.close();}),submit);form.append(actions);
      form.onsubmit=function(e){e.preventDefault();try{save(read());}catch(err){alert(err.message);}};
    }
    function managePresets(onChange){
      var d=dialog('よく使うセールを編集'),body=el('div');d.append(body);d.addEventListener('close',onChange);
      function editor(p){
        body.replaceChildren();var form=el('form');body.append(form);var read=saleEditor(form,p&&p.snapshot);
        var actions=el('div',undefined,'ie-actions'),save=el('button','保存する','ie-primary');save.type='submit';actions.append(button('戻る',draw),save);form.append(actions);
        form.onsubmit=function(e){e.preventDefault();try{
          var snapshot=read();
          if(p&&!confirm('よく使うセールを変更します。登録済みの開催記録は変更されません。よろしいですか？'))return;
          if(transaction(function(next){var m=management(next);if(p){var item=m.presets.find(function(v){return v.id===p.id;});requireValue(!!item,'対象が見つかりません。');item.snapshot=copy(snapshot);}else m.presets.push({id:id(),snapshot:copy(snapshot)});}))draw();
        }catch(err){alert(err.message);}};
      }
      function draw(){
        body.replaceChildren();body.append(el('p','全店舗共通です。変更・削除しても開催済みの内容は変わりません。','ie-muted'),button('＋よく使うセールを追加',function(){editor(null);}));
        var items=presets(allStores);items.forEach(function(p,index){
          var row=el('div',undefined,'ie-preset-row'),actions=el('div');row.append(el('span',summary(p.snapshot)));
          function move(delta){if(transaction(function(next){var a=management(next).presets;var item=a.splice(index,1)[0];a.splice(index+delta,0,item);}))draw();}
          var up=button('↑',function(){move(-1);}),down=button('↓',function(){move(1);});up.disabled=index===0;down.disabled=index===items.length-1;up.setAttribute('aria-label','上へ移動');down.setAttribute('aria-label','下へ移動');
          actions.append(button('編集',function(){editor(p);}),button('削除',function(){if(!confirm(summary(p.snapshot)+'\nよく使うセールから削除します。開催記録は残ります。よろしいですか？'))return;if(transaction(function(next){next.eventManagement.presets=next.eventManagement.presets.filter(function(v){return v.id!==p.id;});}))draw();}),up,down);row.append(actions);body.append(row);
        });
      }
      draw();
    }
    var oldRender=root.renderQuickPage;
    root.renderQuickPage=function(){var result=oldRender.apply(this,arguments);render();return result;};
    function contextEvents(){
      var month=MONTHS.indexOf(selMonth)+1;if(!month)return [];
      var prefix=String(baseYear)+'-'+String(month).padStart(2,'0')+'-';
      var limit=typeof getAIAnalysisThroughDay==='function'?getAIAnalysisThroughDay(baseYear,selMonth):null;
      var last=limit||new Date(Number(baseYear),month,0).getDate();
      return list(allStores,allStores.current,prefix+'01',prefix+String(last).padStart(2,'0'));
    }
    model.getForDate=function(date,storeId){return list(allStores,storeId||allStores.current,date);};
    model.getForPeriod=function(start,end,storeId){return list(allStores,storeId||allStores.current,start,end);};
    if(root.ManagementOpsAnalysis){
      var oldGet=root.ManagementOpsAnalysis.getCurrent;
      root.ManagementOpsAnalysis.getCurrent=function(){var a=oldGet.apply(this,arguments);a.events=contextEvents();return a;};
    }
    var oldAI=root.renderAIAnalysisPanel;
    root.renderAIAnalysisPanel=function(){
      var result=oldAI.apply(this,arguments),target=doc.getElementById('aiAnalysisChecks');
      if(target){var events=contextEvents();if(events.length)target.append(el('p','店舗イベント：'+events.length+'件。'+events.slice(0,3).map(function(e){return summary(e.snapshot);}).join(' / ')+'。数値変化との関係は該当日の入力と照合してください。','ai-analysis-comment'));}return result;
    };
    var oldAnswer=root.buildAIQuestionAnswer;
    root.buildAIQuestionAnswer=function(q){
      if(/イベント|セール|キャンペーン|祭り|大口注文/.test(String(q))){var events=contextEvents();return events.length?'この期間の店舗イベント：\n'+events.map(function(e){return e.startDate+'〜'+e.endDate+'：'+summary(e.snapshot)+(e.snapshot.note?'（'+e.snapshot.note+'）':'');}).join('\n')+'\n数値変化との因果関係は断定せず、該当日の売上・客数と照合してください。':'この期間の店舗イベントはまだありません。';}
      return oldAnswer.apply(this,arguments);
    };
    render();
  }
  if(document.readyState==='complete')init();else root.addEventListener('load',init,{once:true});
})(typeof window!=='undefined'?window:globalThis);
