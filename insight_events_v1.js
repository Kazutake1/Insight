/* 店舗イベント v1: 日次数値とは独立して保存。開催内容はプリセットから複製する。 */
(function(root){
  'use strict';
  var TYPES={sale:'セール',campaign:'キャンペーン',nearby:'近隣イベント',special:'催事',environment:'周辺環境',equipment:'設備',staff:'人員',bulk:'大口注文',other:'その他'};
  var METHODS={amount:'○円引き',percent:'○%引き',fixed:'○円均一',multi:'複数購入値引き',gift:'購入特典',other:'その他／自由条件'};
  var CATEGORIES=['おにぎり','フライヤー','中華まん','麺類','ブリトー','その他'];
  var FIELDS={amount:[['amount','値引き額（円）',1]],percent:[['percent','割引率（%）',0.1,100]],fixed:[['minPrice','対象価格下限（円・任意）',0],['maxPrice','対象価格上限（円・任意）',0],['price','均一価格（円）',0]],multi:[['quantity','購入個数',1],['amount','値引き額（円）',1]],gift:[['quantity','購入個数',1],['giftType','特典種類（例：商品無料）'],['giftProduct','特典商品'],['giftQuantity','特典数量',1],['giftUnit','特典の単位（例：本・杯・個）']],other:[['text','自由条件']]};
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function requireValue(ok,message){if(!ok)throw new Error(message);}
  function str(v,label,empty){requireValue(typeof v==='string'&&(empty||v.trim().length>0)&&v.length<=2000,label+'を確認してください。');}
  function validDate(v){
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'1000-01-01')return false;
    var d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
  }
  function validateSaleCondition(method,params){
    requireValue(typeof method==='string'&&method.trim().length>0,'セール方式を確認してください。');
    requireValue(object(params),'セール条件が不正です。');
    (FIELDS[method]||[]).forEach(function(f){
      var v=params[f[0]],optionalFixedBound=method==='fixed'&&(f[0]==='minPrice'||f[0]==='maxPrice');
      if(optionalFixedBound&&(v===undefined||v===null||v===''))return;
      if(f.length===2){str(v,f[1]);return;}
      requireValue(typeof v==='number'&&Number.isFinite(v)&&v>=f[2]&&(f[3]===undefined||v<=f[3])&&(f[0]==='percent'||Number.isSafeInteger(v)),f[1]+'を確認してください。');
    });
    if(method==='fixed'&&params.minPrice!==undefined&&params.maxPrice!==undefined)requireValue(params.minPrice<=params.maxPrice,'価格の下限は上限以下にしてください。');
  }
  function validateSnapshot(s){
    requireValue(object(s)&&s.version===1,'イベント内容の形式が不正です。');
    str(s.title,'名称');str(s.note,'補足',true);if(s.location!==undefined)str(s.location,'イベント場所',true);
    if(s.sale!==undefined){
      var sale=s.sale;requireValue(object(sale)&&object(sale.params),'セール条件が不正です。');
      str(sale.category,'対象カテゴリ');str(sale.method,'セール方式');
      if(sale.categoryId!==undefined)str(sale.categoryId,'対象カテゴリ識別番号');
      var targetKeys=new Set();
      if(sale.targets!==undefined){
        requireValue(Array.isArray(sale.targets)&&sale.targets.length>0,'対象カテゴリを1件以上選択してください。');
        sale.targets.forEach(function(target){
          requireValue(object(target),'対象カテゴリが不正です。');str(target.category,'対象カテゴリ');
          if(target.categoryId!==undefined)str(target.categoryId,'対象カテゴリ識別番号');
          if(target.method!==undefined||target.params!==undefined)validateSaleCondition(target.method,target.params);
          var key=target.categoryId||'name:'+target.category;requireValue(!targetKeys.has(key),'対象カテゴリが重複しています。');targetKeys.add(key);
        });
      }
      if(sale.segments!==undefined){
        requireValue(Array.isArray(sale.segments)&&sale.segments.length>0,'セール実績区分を1件以上設定してください。');
        var segmentIds=new Set();sale.segments.forEach(function(segment){
          requireValue(object(segment),'セール実績区分が不正です。');str(segment.id,'セール実績区分識別番号');str(segment.category,'対象カテゴリ');
          if(segment.categoryId!==undefined)str(segment.categoryId,'対象カテゴリ識別番号');
          if(segment.label!==undefined)str(segment.label,'実績区分名',true);
          requireValue(!segmentIds.has(segment.id),'セール実績区分の識別番号が重複しています。');segmentIds.add(segment.id);
          var targetKey=segment.categoryId||'name:'+segment.category;
          if(targetKeys.size)requireValue(targetKeys.has(targetKey),'セール実績区分の対象カテゴリが一致しません。');
          validateSaleCondition(segment.method,segment.params);
        });
      }
      validateSaleCondition(sale.method,sale.params);
    }
    if(s.specialDemand!==undefined){
      requireValue(Array.isArray(s.specialDemand),'特需商品の形式が不正です。');
      var demandIds=new Set(),demandNames=new Set();
      s.specialDemand.forEach(function(item){
        requireValue(object(item),'特需商品が不正です。');str(item.id,'特需商品識別番号');str(item.name,'特需商品名');
        requireValue(!demandIds.has(item.id),'特需商品の識別番号が重複しています。');demandIds.add(item.id);
        var nameKey=item.name.trim();requireValue(!demandNames.has(nameKey),'同じ特需商品名が重複しています。');demandNames.add(nameKey);
        ['prepared','sold'].forEach(function(key){
          var value=item[key];if(value===undefined||value===null)return;
          requireValue(Number.isSafeInteger(value)&&value>=0,(key==='prepared'?'用意数':'販売数')+'を確認してください。');
        });
        if(item.prepared!==undefined&&item.prepared!==null&&item.sold!==undefined&&item.sold!==null)requireValue(item.sold<=item.prepared,'販売数は用意数以下にしてください。');
      });
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
        if(['nearby','special','environment','equipment','staff','bulk'].indexOf(e.type)>=0)requireValue(scope==='store','この種別は店舗ごとに保存します。');
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
      if(m.specialPresets!==undefined){
        requireValue(Array.isArray(m.specialPresets),'よく使う催事の保存形式が不正です。');
        var specialTitles=new Set();
        m.specialPresets.forEach(function(p){
          requireValue(object(p),'よく使う催事が不正です。');unique(p);validateSnapshot(p.snapshot);
          requireValue(!p.snapshot.sale&&p.snapshot.location===undefined,'よく使う催事の内容が不正です。');
          var key=p.snapshot.title.trim();requireValue(!specialTitles.has(key),'よく使う催事名が重複しています。');specialTitles.add(key);
        });
      }
      if(m.nearbyPresets!==undefined){
        requireValue(Array.isArray(m.nearbyPresets),'よく使うイベントの保存形式が不正です。');
        var nearbyKeys=new Set();
        m.nearbyPresets.forEach(function(p){
          requireValue(object(p),'よく使うイベントが不正です。');unique(p);validateSnapshot(p.snapshot);
          requireValue(!p.snapshot.sale&&typeof p.snapshot.location==='string'&&p.snapshot.location.trim().length>0,'よく使うイベントの内容が不正です。');
          var key=p.snapshot.title.trim()+'|'+p.snapshot.location.trim();requireValue(!nearbyKeys.has(key),'同じイベント名・場所が重複しています。');nearbyKeys.add(key);
        });
      }
      events(m.events,'global');
    }
    Object.keys(all.stores||{}).forEach(function(id){var st=all.stores[id];if(st.events!==undefined)events(st.events,'store');});
    return all;
  }
  function categorySummary(sale){return Array.isArray(sale.targets)&&sale.targets.length?sale.targets.map(function(target){return target.category;}).join('・'):sale.category;}
  function conditionText(method,p){
    p=p||{};var t='';
    switch(method){
      case 'amount':t=p.amount+'円引き';break;
      case 'percent':t=p.percent+'%引き';break;
      case 'fixed':t=p.minPrice!==undefined&&p.maxPrice!==undefined?p.minPrice+'〜'+p.maxPrice+'円の商品を'+p.price+'円均一':p.minPrice!==undefined?p.minPrice+'円以上の商品を'+p.price+'円均一':p.maxPrice!==undefined?p.maxPrice+'円以下の商品を'+p.price+'円均一':p.price+'円均一';break;
      case 'multi':t=p.quantity+'個購入で'+p.amount+'円引き';break;
      case 'gift':t=p.quantity+'個購入で'+p.giftProduct+p.giftQuantity+p.giftUnit+(p.giftType==='商品無料'?'無料':'（'+p.giftType+'）');break;
      case 'other':t=p.text;break;
      default:t='';
    }
    return t;
  }
  function targetForCategory(sale,categoryId,categoryName){
    var targets=Array.isArray(sale&&sale.targets)?sale.targets:[];
    return targets.find(function(target){return categoryId&&target.categoryId===categoryId||categoryName&&target.category===categoryName;})||null;
  }
  function segmentsForCategory(sale,categoryId,categoryName){
    var segments=Array.isArray(sale&&sale.segments)?sale.segments:[];
    return segments.filter(function(segment){return categoryId&&segment.categoryId===categoryId||categoryName&&segment.category===categoryName;});
  }
  function segmentDetail(segment){
    if(!segment)return '';
    var label=String(segment.label||'').trim(),params=segment.params||{};
    if(segment.method==='fixed'&&params.minPrice!==undefined&&params.maxPrice!==undefined)label=params.minPrice+'〜'+params.maxPrice+'円';
    if(label&&segment.method==='fixed'&&params.price!==undefined)return label+'→'+params.price+'円均一';
    var condition=conditionText(segment.method,params);
    return label?(label+(condition?'：'+condition:'')):condition;
  }
  function segmentSummary(snapshot,segment){
    if(!segment)return snapshot&&snapshot.title||'';
    var detail=segmentDetail(segment);
    return segment.category+(detail?' '+detail:'');
  }
  function summary(s,categoryId,categoryName){
    if(!s.sale)return s.title;
    var a=s.sale,allSegments=Array.isArray(a.segments)?a.segments:[],segments=segmentsForCategory(a,categoryId,categoryName);
    if(!categoryId&&!categoryName&&allSegments.length){
      var groups={};allSegments.forEach(function(segment){var key=segment.categoryId||'name:'+segment.category;(groups[key]||(groups[key]={category:segment.category,items:[]})).items.push(segment);});
      if(Object.keys(groups).some(function(key){return groups[key].items.length>1;})){
        return Object.keys(groups).map(function(key){var group=groups[key];return group.category+'：'+group.items.map(segmentDetail).join(' / ');}).join(' ｜ ');
      }
    }
    if(segments.length>1)return (segments[0].category||categoryName||'')+'：'+segments.map(segmentDetail).join(' / ');
    var target=targetForCategory(a,categoryId,categoryName);
    if(target&&(target.method||target.params))return target.category+' '+conditionText(target.method||a.method,target.params||a.params);
    var individualized=Array.isArray(a.targets)&&a.targets.some(function(item){return item&&item.method&&item.params;});
    if(individualized)return a.targets.map(function(item){return item.category+' '+conditionText(item.method||a.method,item.params||a.params);}).join(' / ');
    return categorySummary(a)+' '+conditionText(a.method,a.params);
  }
  function presets(all){return all.eventManagement?all.eventManagement.presets:[];}
  function specialPresets(all){var m=all&&all.eventManagement;return m&&Array.isArray(m.specialPresets)?m.specialPresets:[];}
  function mutableSpecialPresets(all){var m=management(all);return m.specialPresets||(m.specialPresets=[]);}
  function nearbyPresets(all){var m=all&&all.eventManagement;return m&&Array.isArray(m.nearbyPresets)?m.nearbyPresets:[];}
  function mutableNearbyPresets(all){var m=management(all);return m.nearbyPresets||(m.nearbyPresets=[]);}
  function demandTemplate(items){return (Array.isArray(items)?items:[]).map(function(item){return {id:item.id,name:item.name};});}
  function demandItems(snapshot){return copy(Array.isArray(snapshot&&snapshot.specialDemand)?snapshot.specialDemand:[]);}
  function syncDemandPreset(all,event){
    if(!event||!event.presetId||(event.type!=='nearby'&&event.type!=='special'))return;
    var items=event.type==='nearby'?mutableNearbyPresets(all):mutableSpecialPresets(all);
    var preset=items.find(function(item){return item.id===event.presetId;});
    if(preset)preset.snapshot.specialDemand=demandTemplate(event.snapshot&&event.snapshot.specialDemand);
  }
  function findDuplicateSpecial(all,storeId,event,excludeId){
    if(!event||event.type!=='special'||!event.snapshot)return null;
    var store=all&&all.stores&&all.stores[storeId],items=store&&Array.isArray(store.events)?store.events:[];
    var title=String(event.snapshot.title||'').trim();
    return items.find(function(item){
      return item&&item.type==='special'&&item.id!==excludeId&&String(item.snapshot&&item.snapshot.title||'').trim()===title&&item.startDate===event.startDate&&item.endDate===event.endDate;
    })||null;
  }
  function list(all,storeId,start,end){
    end=end||start;
    var global=all.eventManagement?all.eventManagement.events:[],local=(all.stores[storeId]||{}).events||[];
    return copy(global.concat(local).filter(function(e){return e.startDate<=end&&e.endDate>=start;}));
  }
  function id(){return 'evt_'+(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));}
  function segmentId(){return 'seg_'+(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));}
  function demandId(){return 'dmd_'+(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));}
  function management(all){return all.eventManagement||(all.eventManagement={version:1,presets:[],events:[]});}
  function add(all,storeId,event){
    var e=copy(event);e.id=id();
    if(e.scope==='global')management(all).events.push(e);
    else{requireValue(!!all.stores[storeId],'対象店舗がありません。');(all.stores[storeId].events||(all.stores[storeId].events=[])).push(e);}
    validate(all);return e.id;
  }
  var model={validate:validate,validateSnapshot:validateSnapshot,summary:summary,targetForCategory:targetForCategory,segmentsForCategory:segmentsForCategory,segmentSummary:segmentSummary,list:list,presets:presets,specialPresets:specialPresets,nearbyPresets:nearbyPresets,demandItems:demandItems,demandTemplate:demandTemplate,syncDemandPreset:syncDemandPreset,findDuplicateSpecial:findDuplicateSpecial,add:add,copy:copy};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  if(!root.document)return;
  root.InsightEvents=model;

  function init(){
    if(root.__insightEventsV1)return;
    root.__insightEventsV1=true;
    var doc=root.document,activeDialog=null;
    function el(tag,text,cls){var n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
    function button(text,fn){var b=el('button',text);b.type='button';b.onclick=fn;return b;}
    function selectedDate(){return root.InsightDateContext&&typeof root.InsightDateContext.getSelectedIso==='function'?root.InsightDateContext.getSelectedIso():'';}
    function transaction(fn){
      try{
        if(!root.InsightStorage)throw new Error('保存機能を初期化できませんでした。');
        root.InsightStorage.transaction(allStores,fn,validate,function(next){
          if(next.eventManagement!==undefined)allStores.eventManagement=next.eventManagement;
          Object.keys(next.stores).forEach(function(key){if(next.stores[key].events!==undefined)allStores.stores[key].events=next.stores[key].events;});
        });
        render();return true;
      }catch(e){alert('イベントを保存できませんでした。\n'+e.message+'\n入力済みデータは変更していません。');return false;}
    }
    var style=el('style');style.textContent=`
      #insightEvents{margin-top:10px;font-size:12px}#insightEvents .ie-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      #insightEvents button,.ie-dialog button{border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);padding:7px 10px;font:inherit;cursor:pointer}
      #insightEvents .ie-list{display:flex;flex-wrap:wrap;gap:6px}.ie-chip{display:flex;align-items:center;gap:6px;max-width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:4px 7px}.ie-chip span{overflow-wrap:anywhere}.ie-chip small{color:var(--text4);white-space:nowrap}#insightEvents .ie-chip button{padding:0 5px;border:0;font-size:17px}#insightEvents .ie-chip .ie-summary{font-size:12px;text-align:left;overflow-wrap:anywhere;min-width:0;padding:0}#insightEvents .ie-chip .ie-edit{font-size:11px;padding:2px 6px;border:1px solid var(--border);border-radius:7px}#insightEvents .ie-chip .ie-note-row{flex-basis:100%;display:flex;align-items:flex-start;gap:6px;min-width:0}#insightEvents .ie-chip .ie-note{flex:1 1 auto;min-width:0;font-size:11px;line-height:1.45;color:var(--text3);white-space:pre-wrap;overflow-wrap:anywhere;padding:2px 0 1px}
      .ie-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:88vh;overflow:auto;border:1px solid var(--border);border-radius:18px;padding:20px;background:var(--surface);color:var(--text);font:12px/1.55 -apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;box-shadow:0 12px 40px #0003}.ie-dialog::backdrop{background:#0005}.ie-dialog h2{font-size:16px;margin:0}.ie-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.ie-dialog label{display:flex;flex-direction:column;gap:4px;margin:10px 0}.ie-dialog input,.ie-dialog select,.ie-dialog textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:9px;padding:9px;background:var(--input-bg,var(--surface2));color:var(--text);font:inherit}.ie-dialog textarea{min-height:64px;resize:vertical}.ie-category-options{border:1px solid var(--border);border-radius:11px;padding:8px 10px;margin:10px 0}.ie-category-options legend{font-weight:700;padding:0 4px}.ie-category-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 10px}.ie-sale-target-list{display:grid;gap:10px}.ie-sale-target{border:1px solid var(--border);border-radius:10px;padding:9px;background:var(--surface2)}.ie-sale-target-head{display:flex!important;flex-direction:row!important;align-items:center;gap:7px!important;margin:0 0 7px!important}.ie-sale-target-head input{width:auto!important}.ie-sale-target-method{margin:5px 0!important}.ie-sale-target-params{padding-left:12px;border-left:2px solid var(--border)}.ie-sale-target-body{padding-top:4px}.ie-sale-pattern-list{display:grid;gap:8px;margin-bottom:8px}.ie-sale-pattern{border:1px solid var(--border);border-radius:9px;padding:8px;background:var(--surface)}.ie-sale-pattern-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.ie-sale-pattern-top button{padding:4px 7px!important;font-size:11px}.ie-sale-pattern>label{margin:7px 0!important}.ie-dialog .ie-category-option{display:flex;flex-direction:row;align-items:center;gap:7px;margin:0;padding:5px 2px}.ie-dialog .ie-category-option input{width:auto;margin:0;accent-color:#15803d}.ie-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ie-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ie-dialog .ie-primary{background:var(--text);color:var(--surface)}.ie-muted{font-size:11px;color:var(--text4);margin:5px 0}.ie-dialog.ie-event-add .ie-presets{margin-top:10px}.ie-presets{display:flex;flex-wrap:wrap;gap:6px}.ie-preset-row{border-bottom:1px solid var(--border);padding:10px 0}.ie-preset-row div{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ie-demand-editor{margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}.ie-demand-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.ie-demand-list{display:grid;gap:8px}.ie-demand-row{display:grid;grid-template-columns:minmax(150px,1fr) 90px 90px auto;gap:8px;align-items:end;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--surface2)}.ie-demand-row label{margin:0}.ie-demand-row .ie-demand-remove{align-self:end}.ie-preset-editor .ie-demand-row{grid-template-columns:minmax(180px,1fr) auto}.ie-dialog button:disabled{opacity:.4;cursor:default}@media(max-width:520px){.ie-category-list{grid-template-columns:1fr}}
      .ie-dialog.ie-event-add{position:fixed;inset:0;margin:auto}
      .ie-dialog.ie-preset-editor{position:fixed;inset:0;margin:auto}
    `;doc.head.appendChild(style);
    function dialog(title){
      var d=el('dialog',undefined,'ie-dialog'),head=el('header');
      var h=el('h2',title);h.id=id();d.setAttribute('aria-labelledby',h.id);head.append(h,button('閉じる',function(){d.close();}));d.append(head);
      d.addEventListener('close',function(){d.remove();if(activeDialog===d)activeDialog=null;});doc.body.append(d);d.showModal();return d;
    }
    function field(parent,label,type,value){var l=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value==null?'':String(value);input.setAttribute('aria-label',label);l.append(input);parent.append(l);return input;}
    function select(parent,label,options,value){var l=el('label',label),s=el('select');Object.keys(options).forEach(function(k){var o=el('option',options[k]);o.value=k;s.append(o);});s.value=value;s.setAttribute('aria-label',label);l.append(s);parent.append(l);return s;}
    function specialDemandEditor(parent,snapshot,templateOnly){
      var section=el('section',undefined,'ie-demand-editor'),head=el('div',undefined,'ie-demand-head'),listBox=el('div',undefined,'ie-demand-list'),rows=[];
      head.append(el('strong','特需商品'),button('＋追加',function(){addRow(null);}));section.append(head,el('p',templateOnly?'商品名・カテゴリ名を自由に登録できます。用意数と販売数は開催ごとに入力します。':'商品名・カテゴリ名は自由入力です。用意数と販売数から消化率を算出します。','ie-muted'),listBox);parent.append(section);
      function addRow(seed){
        seed=seed||{};var rowEl=el('div',undefined,'ie-demand-row'),name=field(rowEl,'名称','text',seed.name||''),prepared=null,sold=null;
        name.required=true;
        if(!templateOnly){prepared=field(rowEl,'用意数','number',seed.prepared==null?'':seed.prepared);prepared.min='0';prepared.step='1';sold=field(rowEl,'販売数','number',seed.sold==null?'':seed.sold);sold.min='0';sold.step='1';}
        var remove=button('削除',function(){var at=rows.findIndex(function(row){return row.el===rowEl;});if(at>=0)rows.splice(at,1);rowEl.remove();});remove.className='ie-demand-remove';rowEl.append(remove);listBox.append(rowEl);
        rows.push({id:seed.id||demandId(),el:rowEl,name:name,prepared:prepared,sold:sold});
      }
      (Array.isArray(snapshot&&snapshot.specialDemand)?snapshot.specialDemand:[]).forEach(function(item){addRow(item);});
      return function(){
        var names=new Set();return rows.map(function(row){
          var name=row.name.value.trim();requireValue(name!=='','特需商品名を入力してください。');requireValue(!names.has(name),'同じ特需商品名が重複しています。');names.add(name);
          var item={id:row.id,name:name};if(!templateOnly){
            function num(input,label){var raw=input.value.trim();if(raw==='')return null;var value=Number(raw);requireValue(Number.isSafeInteger(value)&&value>=0,label+'を確認してください。');return value;}
            item.prepared=num(row.prepared,'用意数');item.sold=num(row.sold,'販売数');if(item.prepared!==null&&item.sold!==null)requireValue(item.sold<=item.prepared,'販売数は用意数以下にしてください。');
          }
          return item;
        });
      };
    }
    function specialPresetEditor(parent,snapshot){
      var title=field(parent,'催事名','text',snapshot?snapshot.title:''),note=field(parent,'補足（任意）','textarea',snapshot?snapshot.note:'');title.required=true;
      var readDemand=specialDemandEditor(parent,snapshot,true);
      return function(){
        var result={version:1,title:title.value.trim(),note:note.value.trim(),specialDemand:readDemand()};
        validateSnapshot(result);return result;
      };
    }
    function nearbyPresetEditor(parent,snapshot){
      var location=field(parent,'イベント場所','text',snapshot&&snapshot.location?snapshot.location:''),title=field(parent,'イベント名','text',snapshot?snapshot.title:''),note=field(parent,'補足（任意）','textarea',snapshot?snapshot.note:'');location.required=title.required=true;
      var readDemand=specialDemandEditor(parent,snapshot,true);
      return function(){
        var result={version:1,title:title.value.trim(),note:note.value.trim(),location:location.value.trim(),specialDemand:readDemand()};
        requireValue(result.location!=='','イベント場所を入力してください。');validateSnapshot(result);return result;
      };
    }
    function saleEditor(parent,snapshot){
      var initial=snapshot&&snapshot.sale,master=allStores.salesCountManagement&&Array.isArray(allStores.salesCountManagement.categories)?allStores.salesCountManagement.categories:[],options=[],optionKeys=new Set(),selectedKeys=new Set();
      function addOption(key,name,categoryId){if(optionKeys.has(key))return;optionKeys.add(key);options.push({key:key,name:name,categoryId:categoryId});}
      master.filter(function(c){return !c.hidden;}).forEach(function(c){addOption(c.id,c.name,c.id);});
      var initialTargets=initial?(Array.isArray(initial.targets)&&initial.targets.length?initial.targets:[{categoryId:initial.categoryId,category:initial.category,method:initial.method,params:initial.params}]):[];
      var initialSegments=initial&&Array.isArray(initial.segments)?initial.segments:[];
      initialTargets.forEach(function(target){
        var linked=master.find(function(c){return c.id===target.categoryId||c.name===target.category||(c.aliases||[]).indexOf(target.category)>=0;});
        if(linked){addOption(linked.id,linked.name,linked.id);selectedKeys.add(linked.id);}
        else{var legacyKey='legacy:'+target.category;addOption(legacyKey,target.category);selectedKeys.add(legacyKey);}
      });
      initialSegments.forEach(function(segment){
        var linked=master.find(function(c){return c.id===segment.categoryId||c.name===segment.category||(c.aliases||[]).indexOf(segment.category)>=0;});
        if(linked){addOption(linked.id,linked.name,linked.id);selectedKeys.add(linked.id);}
        else{var legacyKey='legacy:'+segment.category;addOption(legacyKey,segment.category);selectedKeys.add(legacyKey);}
      });
      if(!options.length)CATEGORIES.forEach(function(c){addOption('legacy:'+c,c);});
      if(!selectedKeys.size&&options.length)selectedKeys.add(options[0].key);
      
      var categoriesBox=el('fieldset',undefined,'ie-category-options'),legend=el('legend','対象カテゴリー・値引き条件'),categoryList=el('div',undefined,'ie-sale-target-list'),rows=[];categoriesBox.append(legend,categoryList);parent.append(categoriesBox);
      function matchesOption(item,option){return item&&(option.categoryId&&item.categoryId===option.categoryId||item.category===option.name);}
      function initialTarget(option){return initialTargets.find(function(target){return matchesOption(target,option);})||null;}
      function initialPatterns(option){
        var existing=initialSegments.filter(function(segment){return matchesOption(segment,option);});
        if(existing.length)return existing.map(copy);
        var target=initialTarget(option),method=target&&target.method||initial&&initial.method||'amount',params=copy(target&&target.params||initial&&initial.params||{});
        return [{id:segmentId(),categoryId:option.categoryId,category:option.name,label:'',method:method,params:params}];
      }
      function methodSelect(value){
        var method=el('select');Object.keys(METHODS).forEach(function(key){var op=el('option',METHODS[key]);op.value=key;method.append(op);});
        if(value&&!METHODS[value]){var legacy=el('option',value+'（既存方式）');legacy.value=value;method.append(legacy);}method.value=value||'amount';return method;
      }
      function drawCondition(pattern,seed){
        pattern.params.replaceChildren();pattern.inputs={};
        (FIELDS[pattern.method.value]||[]).forEach(function(f){
          var value=seed&&pattern.method.value===seed.method?seed.params&&seed.params[f[0]]:f[0]==='giftType'?'商品無料':f[0]==='giftUnit'?'本':'';
          var input=field(pattern.params,f[1],f.length===2?'text':'number',value),optionalFixedBound=pattern.method.value==='fixed'&&(f[0]==='minPrice'||f[0]==='maxPrice');
          input.required=pattern.row.check.checked&&!optionalFixedBound;
          if(f.length>2){input.min=f[2];input.step=f[0]==='percent'?'0.1':'1';if(f[3]!==undefined)input.max=f[3];}pattern.inputs[f[0]]=input;
        });
      }
      function syncRow(row){
        row.body.style.display=row.check.checked?'':'none';
        row.patterns.forEach(function(pattern){
          pattern.method.disabled=!row.check.checked;pattern.label.disabled=!row.check.checked;
          Object.keys(pattern.inputs).forEach(function(key){pattern.inputs[key].disabled=!row.check.checked;});
        });
      }
      function updateRemoveButtons(row){row.patterns.forEach(function(pattern){pattern.remove.disabled=row.patterns.length<=1;});}
      function addPattern(row,seed){
        seed=seed||{id:segmentId(),categoryId:row.option.categoryId,category:row.option.name,label:'',method:'amount',params:{}};
        var card=el('div',undefined,'ie-sale-pattern'),top=el('div',undefined,'ie-sale-pattern-top');
        var title=el('strong','値引きパターン '+(row.patterns.length+1)),remove=button('削除',function(){if(row.patterns.length<=1)return;var at=row.patterns.indexOf(pattern);if(at>=0)row.patterns.splice(at,1);card.remove();row.patterns.forEach(function(item,index){item.title.textContent='値引きパターン '+(index+1);});updateRemoveButtons(row);});
        top.append(title,remove);card.append(top);
        var label=field(card,'条件名（任意・例：179円以下）','text',seed.label||'');
        var methodLabel=el('label',undefined,'ie-sale-target-method'),methodText=el('span','セール方式'),method=methodSelect(seed.method||'amount');methodLabel.append(methodText,method);card.append(methodLabel);
        var params=el('div',undefined,'ie-sale-target-params'),pattern={id:seed.id||segmentId(),row:row,card:card,title:title,remove:remove,label:label,method:method,params:params,inputs:{}};card.append(params);row.patterns.push(pattern);row.patternWrap.append(card);
        method.onchange=function(){drawCondition(pattern,null);syncRow(row);};drawCondition(pattern,seed);updateRemoveButtons(row);syncRow(row);return pattern;
      }
      options.forEach(function(option){
        var rowEl=el('div',undefined,'ie-sale-target'),head=el('label',undefined,'ie-sale-target-head'),check=el('input');check.type='checkbox';check.checked=selectedKeys.has(option.key);check.setAttribute('aria-label','対象カテゴリー '+option.name);head.append(check,el('strong',option.name));
        var body=el('div',undefined,'ie-sale-target-body'),patternWrap=el('div',undefined,'ie-sale-pattern-list'),add=button('＋ 値引きパターンを追加',function(){addPattern(row);});
        body.append(patternWrap,add);rowEl.append(head,body);categoryList.append(rowEl);
        var row={option:option,check:check,body:body,patternWrap:patternWrap,patterns:[]};rows.push(row);
        initialPatterns(option).forEach(function(seed){addPattern(row,seed);});
        check.onchange=function(){syncRow(row);};syncRow(row);
      });
      var note=field(parent,'補足（任意）','textarea',snapshot?snapshot.note:'');
      function readPattern(row,pattern){
        var p={};(FIELDS[pattern.method.value]||[]).forEach(function(f){
          var raw=pattern.inputs[f[0]].value.trim(),optionalFixedBound=pattern.method.value==='fixed'&&(f[0]==='minPrice'||f[0]==='maxPrice');
          if(optionalFixedBound&&raw==='')return;
          requireValue(raw!=='',row.option.name+'：'+f[1]+'を入力してください。');p[f[0]]=f.length===2?raw:Number(raw);
        });
        validateSaleCondition(pattern.method.value,p);
        var segment={id:pattern.id||segmentId(),category:row.option.name,label:pattern.label.value.trim(),method:pattern.method.value,params:p};
        if(row.option.categoryId)segment.categoryId=row.option.categoryId;return segment;
      }
      return function(){
        var chosen=rows.filter(function(row){return row.check.checked;});requireValue(chosen.length>0,'対象カテゴリーを1件以上選択してください。');
        var targets=[],segments=[];
        chosen.forEach(function(row){
          requireValue(row.patterns.length>0,row.option.name+'の値引きパターンを1件以上設定してください。');
          var rowSegments=row.patterns.map(function(pattern){return readPattern(row,pattern);}),first=rowSegments[0],target={category:row.option.name,method:first.method,params:copy(first.params)};
          if(row.option.categoryId)target.categoryId=row.option.categoryId;targets.push(target);segments=segments.concat(rowSegments);
        });
        var first=targets[0],categoryNames=targets.map(function(target){return target.category;});
        var sale={category:categoryNames.join('・'),method:first.method,params:copy(first.params),targets:targets,segments:segments};if(first.categoryId)sale.categoryId=first.categoryId;
        var title=categoryNames.join('・')+' セール',result={version:1,title:title,note:note.value.trim(),sale:sale};validateSnapshot(result);return result;
      };
    }
    function render(){
      var container=doc.getElementById('opsDailyWrap');if(!container)return;
      var old=doc.getElementById('insightEvents');if(old)old.remove();
      var wrap=el('section');wrap.id='insightEvents';wrap.setAttribute('aria-label','店舗イベント');
      var head=el('div',undefined,'ie-head');head.append(el('strong','店舗イベント'),button('＋イベントを追加',function(){openEvent(null);}));wrap.append(head);
      var rows=el('div',undefined,'ie-list');
      try{validate(allStores);list(allStores,allStores.current,selectedDate()).forEach(function(e){
        var chip=el('div',undefined,'ie-chip');chip.title=e.startDate+' 〜 '+e.endDate+(e.snapshot.note?'\n'+e.snapshot.note:'');
        var desc=summary(e.snapshot);
        var details=button(desc,function(){var d=dialog(TYPES[e.type]||e.type);d.append(el('p',desc),el('p',e.startDate+' 〜 '+e.endDate),el('p',e.scope==='global'?'全店舗共通':'この店舗のみ'));if(e.type==='nearby'&&e.snapshot.location)d.append(el('p','場所：'+e.snapshot.location));if(e.snapshot.note){var note=el('p',e.snapshot.note);note.style.whiteSpace='pre-wrap';d.append(note);}});details.className='ie-summary';
        var edit=button('編集',function(){openEvent(e);});edit.className='ie-edit';edit.setAttribute('aria-label',desc+'を編集');
        chip.append(el('small',TYPES[e.type]||e.type),details,el('small',e.scope==='global'?'全店舗':'この店舗'));
        var remove=button('×',function(){
          if(!confirm(desc+'\n'+e.startDate+' 〜 '+e.endDate+'\n'+(e.scope==='global'?'全店舗':'この店舗')+'の開催記録を期間全体から削除します。過去の日付の表示も消えます。\nよろしいですか？'))return;
          transaction(function(next){var target=e.scope==='global'?next.eventManagement:next.stores[allStores.current];target.events=target.events.filter(function(v){return v.id!==e.id;});});
        });remove.setAttribute('aria-label',desc+'を削除');
        if(e.snapshot.note){
          var noteRow=el('div',undefined,'ie-note-row');noteRow.append(el('span','補足：'+e.snapshot.note,'ie-note'),edit,remove);chip.append(noteRow);
        }else chip.append(edit,remove);
        rows.append(chip);
      });}catch(e){rows.append(el('span','イベントデータを読み込めません。バックアップを確認してください。'));}
      wrap.append(rows);container.append(wrap);
    }
    function openEvent(existing){
      if(activeDialog)return;
      var editing=object(existing)&&typeof existing.id==='string'&&existing.id.length>0&&object(existing.snapshot)&&typeof existing.type==='string';
      var source=editing?copy(existing):null,storeId=allStores.current;
      var d=dialog(editing?'店舗イベントを編集':'店舗イベントを追加');d.classList.add('ie-event-add');activeDialog=d;
      var form=el('form');d.append(form);
      var type=select(form,'イベント種別',TYPES,editing?source.type:'sale');
      var scopeText=el('p',undefined,'ie-muted');form.append(scopeText);
      var dates=el('div',undefined,'ie-dates');form.append(dates);
      var start=field(dates,'開始日','date',editing?source.startDate:selectedDate()),end=field(dates,'終了日','date',editing?source.endDate:selectedDate());start.required=end.required=true;
      start.onchange=function(){if(end.value<start.value)end.value=start.value;};
      var content=el('div');form.append(content);var read,scope,showAll=false,eventTemplate=null,templatePresetId=null;
      function replaceRegisteredEvent(next,event){
        var oldTarget=source.scope==='global'?management(next):next.stores[storeId];
        requireValue(oldTarget&&Array.isArray(oldTarget.events),'登録済みイベントが見つかりません。');
        var oldIndex=oldTarget.events.findIndex(function(v){return v.id===source.id;});
        requireValue(oldIndex>=0,'登録済みイベントが見つかりません。');
        oldTarget.events.splice(oldIndex,1);
        if(event.scope==='global')management(next).events.push(event);
        else{
          requireValue(!!next.stores[storeId],'対象店舗がありません。');
          (next.stores[storeId].events||(next.stores[storeId].events=[])).push(event);
        }
      }
      function save(snapshot,presetId){
        try{
          requireValue(storeId===allStores.current,'店舗が変更されています。画面を開き直してください。');
          var e={type:type.value,scope:type.value==='sale'||type.value==='campaign'?'global':type.value==='other'?scope.value:'store',startDate:start.value,endDate:end.value,snapshot:snapshot};
          if(editing)e.id=source.id;
          if(presetId)e.presetId=presetId;
          else if(editing&&source.presetId&&type.value===source.type)e.presetId=source.presetId;
          if(e.type==='special'){
            var duplicate=findDuplicateSpecial(allStores,storeId,e,editing?source.id:null);
            if(duplicate&&!confirm('同じ店舗に同じ催事名・同じ期間の登録があります。\n\n'+e.snapshot.title+'\n'+e.startDate+' 〜 '+e.endDate+'\n\n重複して登録しますか？'))return;
          }
          if(editing){
            if(!confirm('登録済みイベントを変更します。\n期間中の表示や関連する比較にも変更内容が反映されます。よろしいですか？'))return;
            if(transaction(function(next){syncDemandPreset(next,e);replaceRegisteredEvent(next,e);}))d.close();
          }else{
            if(transaction(function(next){syncDemandPreset(next,e);add(next,storeId,e);}))d.close();
          }
        }catch(err){alert(err.message);}
      }
      function draw(){
        content.replaceChildren();var hideScopeText=type.value==='sale'||type.value==='campaign';scopeText.hidden=hideScopeText;scopeText.textContent=hideScopeText?'':'現在の店舗：'+allStores.stores[storeId].name;
        if(type.value==='sale'){
          var h=el('div',undefined,'ie-head');h.append(el('strong','よく使うセール'),button('編集',function(){managePresets(draw);}));content.append(h);
          var ps=el('div',undefined,'ie-presets'),items=presets(allStores);items.slice(0,showAll?items.length:6).forEach(function(p){ps.append(button(summary(p.snapshot),function(){save(copy(p.snapshot),p.id);}));});
          if(!items.length)ps.append(el('span','「編集」からよく使うセールを追加できます。','ie-muted'));
          if(items.length>6)ps.append(button(showAll?'折りたたむ':'すべて表示（'+items.length+'件）',function(){showAll=!showAll;draw();}));content.append(ps);if(editing)content.append(el('p','プリセットを選ぶと、その内容で登録済みイベントを変更します。下の項目から個別編集もできます。','ie-muted'));
          read=saleEditor(content,editing&&source.type==='sale'?source.snapshot:null);
        }else{
          if(type.value==='other')scope=select(content,'適用範囲',{store:'この店舗のみ',global:'全店舗共通'},editing&&source.type==='other'?source.scope:'store');
          if(type.value==='nearby'||type.value==='special'){
            var isNearby=type.value==='nearby',presetItems=isNearby?nearbyPresets(allStores):specialPresets(allStores);
            var presetHead=el('div',undefined,'ie-head');presetHead.append(el('strong',isNearby?'よく使うイベント':'よく使う催事'),button('編集',function(){(isNearby?manageNearbyPresets:manageSpecialPresets)(draw);}));content.append(presetHead);
            var presetBox=el('div',undefined,'ie-presets');
            presetItems.slice(0,showAll?presetItems.length:6).forEach(function(p){
              presetBox.append(button(p.snapshot.title,function(){eventTemplate=copy(p.snapshot);templatePresetId=p.id;draw();}));
            });
            if(!presetItems.length)presetBox.append(el('span','「編集」から'+(isNearby?'よく使うイベント':'よく使う催事')+'を追加できます。','ie-muted'));
            if(presetItems.length>6)presetBox.append(button(showAll?'折りたたむ':'すべて表示（'+presetItems.length+'件）',function(){showAll=!showAll;draw();}));
            content.append(presetBox,el('p','選ぶと名称・補足'+(isNearby?'・場所':'')+'と特需商品を入力欄へ反映します。特需商品の用意数・販売数は開催ごとに入力します。','ie-muted'));
          }
          var initialSnapshot=eventTemplate||(editing&&source.snapshot?source.snapshot:null);
          var location=type.value==='nearby'?field(content,'イベント場所','text',initialSnapshot&&initialSnapshot.location?initialSnapshot.location:''):null;if(location)location.required=true;
          var title=field(content,type.value==='special'?'催事名':'イベント名','text',initialSnapshot?initialSnapshot.title:''),note=field(content,'補足（任意）','textarea',initialSnapshot?initialSnapshot.note:'');title.required=true;
          var readDemand=(type.value==='nearby'||type.value==='special')?specialDemandEditor(content,initialSnapshot,false):function(){return [];};
          read=function(){var snapshot={version:1,title:title.value.trim(),note:note.value.trim()};if(location){requireValue(location.value.trim()!=='','イベント場所を入力してください。');snapshot.location=location.value.trim();}if(type.value==='nearby'||type.value==='special')snapshot.specialDemand=readDemand();validateSnapshot(snapshot);return snapshot;};
        }
      }
      type.onchange=function(){showAll=false;eventTemplate=null;templatePresetId=null;draw();};draw();
      if(editing)form.append(el('p','変更内容は保存後、登録済みの期間全体に反映されます。','ie-muted'));
      var actions=el('div',undefined,'ie-actions'),submit=el('button',editing?'変更を保存':'登録する','ie-primary');submit.type='submit';actions.append(button('キャンセル',function(){d.close();}),submit);form.append(actions);
      form.onsubmit=function(e){e.preventDefault();try{save(read(),templatePresetId);}catch(err){alert(err.message);}};
    }
    function manageNearbyPresets(onChange){
      var d=dialog('よく使うイベントを編集'),body=el('div');d.classList.add('ie-preset-editor');d.append(body);d.addEventListener('close',onChange);
      function editor(p){
        body.replaceChildren();var form=el('form');body.append(form);var read=nearbyPresetEditor(form,p&&p.snapshot);
        var actions=el('div',undefined,'ie-actions'),saveButton=el('button','保存する','ie-primary');saveButton.type='submit';actions.append(button('戻る',draw),saveButton);form.append(actions);
        form.onsubmit=function(e){e.preventDefault();try{
          var snapshot=read();
          if(p&&!confirm('よく使うイベントを変更します。登録済みの開催記録は変更されません。よろしいですか？'))return;
          if(transaction(function(next){
            var items=mutableNearbyPresets(next),duplicate=items.find(function(item){return item.id!==(p&&p.id)&&item.snapshot.title.trim()===snapshot.title.trim()&&item.snapshot.location.trim()===snapshot.location.trim();});
            requireValue(!duplicate,'同じイベント名・場所が「よく使うイベント」に登録されています。');
            if(p){var item=items.find(function(v){return v.id===p.id;});requireValue(!!item,'対象が見つかりません。');item.snapshot=copy(snapshot);}
            else items.push({id:id(),snapshot:copy(snapshot)});
          }))draw();
        }catch(err){alert(err.message);}};
      }
      function draw(){
        body.replaceChildren();body.append(el('p','全店舗共通です。変更・削除しても登録済みのイベントは変更されません。','ie-muted'),button('＋よく使うイベントを追加',function(){editor(null);}));
        var items=nearbyPresets(allStores);items.forEach(function(p,index){
          var row=el('div',undefined,'ie-preset-row'),actions=el('div');row.append(el('span',p.snapshot.title+'（'+p.snapshot.location+'）'));
          function move(delta){if(transaction(function(next){var a=mutableNearbyPresets(next);var item=a.splice(index,1)[0];a.splice(index+delta,0,item);}))draw();}
          var up=button('↑',function(){move(-1);}),down=button('↓',function(){move(1);});up.disabled=index===0;down.disabled=index===items.length-1;up.setAttribute('aria-label','上へ移動');down.setAttribute('aria-label','下へ移動');
          actions.append(button('編集',function(){editor(p);}),button('削除',function(){if(!confirm(p.snapshot.title+'\nよく使うイベントから削除します。登録済みのイベントは残ります。よろしいですか？'))return;if(transaction(function(next){var a=mutableNearbyPresets(next);var at=a.findIndex(function(v){return v.id===p.id;});if(at>=0)a.splice(at,1);})){draw();}}),up,down);row.append(actions);body.append(row);
        });
      }
      draw();
    }
    function manageSpecialPresets(onChange){
      var d=dialog('よく使う催事を編集'),body=el('div');d.classList.add('ie-preset-editor');d.append(body);d.addEventListener('close',onChange);
      function editor(p){
        body.replaceChildren();var form=el('form');body.append(form);var read=specialPresetEditor(form,p&&p.snapshot);
        var actions=el('div',undefined,'ie-actions'),saveButton=el('button','保存する','ie-primary');saveButton.type='submit';actions.append(button('戻る',draw),saveButton);form.append(actions);
        form.onsubmit=function(e){e.preventDefault();try{
          var snapshot=read();
          if(p&&!confirm('よく使う催事を変更します。登録済みの開催記録は変更されません。よろしいですか？'))return;
          if(transaction(function(next){
            var items=mutableSpecialPresets(next),duplicate=items.find(function(item){return item.id!==(p&&p.id)&&item.snapshot.title.trim()===snapshot.title.trim();});
            requireValue(!duplicate,'同じ催事名が「よく使う催事」に登録されています。');
            if(p){var item=items.find(function(v){return v.id===p.id;});requireValue(!!item,'対象が見つかりません。');item.snapshot=copy(snapshot);}
            else items.push({id:id(),snapshot:copy(snapshot)});
          }))draw();
        }catch(err){alert(err.message);}};
      }
      function draw(){
        body.replaceChildren();body.append(el('p','全店舗共通です。変更・削除しても登録済みの催事は変更されません。','ie-muted'),button('＋よく使う催事を追加',function(){editor(null);}));
        var items=specialPresets(allStores);items.forEach(function(p,index){
          var row=el('div',undefined,'ie-preset-row'),actions=el('div');row.append(el('span',p.snapshot.title));
          function move(delta){if(transaction(function(next){var a=mutableSpecialPresets(next);var item=a.splice(index,1)[0];a.splice(index+delta,0,item);}))draw();}
          var up=button('↑',function(){move(-1);}),down=button('↓',function(){move(1);});up.disabled=index===0;down.disabled=index===items.length-1;up.setAttribute('aria-label','上へ移動');down.setAttribute('aria-label','下へ移動');
          actions.append(button('編集',function(){editor(p);}),button('削除',function(){if(!confirm(p.snapshot.title+'\nよく使う催事から削除します。登録済みの催事は残ります。よろしいですか？'))return;if(transaction(function(next){var a=mutableSpecialPresets(next);var at=a.findIndex(function(v){return v.id===p.id;});if(at>=0)a.splice(at,1);})){draw();}}),up,down);row.append(actions);body.append(row);
        });
      }
      draw();
    }
    function managePresets(onChange){
      var d=dialog('よく使うセールを編集'),body=el('div');d.classList.add('ie-preset-editor');d.append(body);d.addEventListener('close',onChange);
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
    if(root.InsightHooks){
      root.InsightHooks.on('quick:render:after','events-render',function(){render();},30);
    }
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
    if(root.InsightHooks){
      root.InsightHooks.on('ai:render:after','events-ai-check',function(){
        var target=doc.getElementById('aiAnalysisChecks');
        if(target){var events=contextEvents();if(events.length)target.append(el('p','店舗イベント：'+events.length+'件。'+events.slice(0,3).map(function(e){return summary(e.snapshot);}).join(' / ')+'。数値変化との関係は該当日の入力と照合してください。','ai-analysis-comment'));}
      },30);
      root.InsightHooks.on('ai:question:before','events-question',function(ctx){
        var q=String(ctx.args[0]);
        if(!/イベント|セール|キャンペーン|祭り|大口注文/.test(q))return;
        var events=contextEvents();
        ctx.result=events.length?'この期間の店舗イベント：\n'+events.map(function(e){return e.startDate+'〜'+e.endDate+'：'+summary(e.snapshot)+(e.snapshot.note?'（'+e.snapshot.note+'）':'');}).join('\n')+'\n数値変化との因果関係は断定せず、該当日の売上・客数と照合してください。':'この期間の店舗イベントはまだありません。';
        ctx.cancel=true;
        return false;
      },5);
    }
    render();
  }
  if(document.readyState==='complete')init();else root.addEventListener('load',init,{once:true});
})(typeof window!=='undefined'?window:globalThis);
