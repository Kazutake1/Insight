/* Settings historical monthly trip review with optional manual overrides. */
(function(root){
  'use strict';
  if(root.InsightTripInferenceView)return;
  var doc=root.document,section=null,storeSelect=null,categorySelect=null,monthSelect=null,results=null,summary=null;
  var model={refresh:refresh};
  root.InsightTripInferenceView=model;
  if(!doc)return;

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function snapshot(){try{return typeof allStores!=='undefined'?allStores:null;}catch(_){return null;}}
  function option(select,value,label){
    var el=doc.createElement('option');
    el.value=value;el.textContent=label;select.appendChild(el);
  }
  function replaceOptions(select,values,previous,preferred){
    select.replaceChildren();
    values.forEach(function(entry){option(select,entry.value,entry.label);});
    if(values.some(function(v){return v.value===previous;}))select.value=previous;
    else if(values.some(function(v){return v.value===preferred;}))select.value=preferred;
    else if(values.length)select.value=values[0].value;
    select.disabled=values.length===0;
  }
  function localMonth(){
    var d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function monthOptions(all,storeId,categoryId){
    var store=all.stores[storeId],through=localMonth(),months=new Set();
    if(Array.isArray(store.years)){
      store.years.forEach(function(year){
        year=String(year);
        if(!/^[1-9][0-9]{3}$/.test(year))return;
        for(var m=1;m<=12;m++){
          var key=year+'-'+String(m).padStart(2,'0');
          if(key<=through)months.add(key);
        }
      });
    }
    if(categoryId){
      var records=store.salesCounts||{};
      Object.keys(records).forEach(function(date){
        if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date.slice(0,7)<=through&&
          object(records[date])&&Object.prototype.hasOwnProperty.call(records[date],categoryId))
          months.add(date.slice(0,7));
      });
    }
    return Array.from(months).sort().reverse().map(function(key){
      var parts=key.split('-');return {value:key,label:parts[0]+'年'+Number(parts[1])+'月'};
    });
  }
  function latestObservedMonth(all,storeId,categoryId){
    if(!categoryId||!root.InsightTripInference)return null;
    try{
      var results=root.InsightTripInference.inferAvailableMonths(all,storeId,categoryId);
      var valid=results.map(function(r){return r.month;}).filter(function(month){return month<=localMonth();});
      return valid.length?valid[valid.length-1]:null;
    }catch(_){return null;}
  }
  function text(parent,value,className){
    var item=doc.createElement('div');
    if(className)item.className=className;
    item.textContent=value;
    parent.appendChild(item);
    return item;
  }
  function labelFor(trip){
    if(trip.status==='observed_active')return '入力実績あり';
    if(trip.status==='inferred_inactive')return '対象外と推定';
    return '判定不能';
  }
  function reasonFor(trip,report){
    if(trip.status==='observed_active')
      return '入力 '+trip.observedDays+'日（納品 '+trip.deliveryDays+'日／販売 '+trip.salesDays+'日）';
    if(report.invalidRecordDays)return '記録の形式に問題があり、判定できません。';
    if(trip.status==='inferred_inactive')
      return 'この便は未入力／他便の入力 '+trip.otherTripObservedDays+'日';
    if(!report.monthCompleted)return '当月・未来月は対象外と推定しません。';
    return '他便の入力 '+trip.otherTripObservedDays+'日（推定基準 '+report.minEvidenceDays+'日）';
  }
  function render(){
    if(!results||!summary)return;
    results.replaceChildren();
    var all=snapshot();
    if(!object(all)||!object(all.stores)||!storeSelect.value||!categorySelect.value||!monthSelect.value){
      summary.textContent='店舗・カテゴリー・年月を選択してください。';
      return;
    }
    var inference=root.InsightTripInference;
    if(!inference||typeof inference.inferMonth!=='function'){
      summary.textContent='対象便の判定機能を読み込めませんでした。';
      return;
    }
    try{
      var report=inference.inferMonth(all,storeSelect.value,categorySelect.value,monthSelect.value);
      summary.textContent='記録がある日：'+report.recordDays+'日'+
        (report.invalidRecordDays?'／不正な記録 '+report.invalidRecordDays+'日':'');
      report.trips.forEach(function(trip){
        var card=doc.createElement('div');
        card.className='insight-trip-history-card insight-trip-history-'+trip.status;
        text(card,trip.trip+'便','insight-trip-history-trip');
        var overrides=root.InsightTripOverrides;
        var choice=overrides&&overrides.resolve(all,storeSelect.value,categorySelect.value,monthSelect.value,trip.trip,trip.status);
        if(choice&&choice.isManual){
          text(card,choice.status==='manual_active'?'対象便（手動設定）':'対象外（手動設定）','insight-trip-history-status');
          text(card,'自動判定：'+labelFor(trip),'insight-trip-history-reason');
        }else text(card,labelFor(trip),'insight-trip-history-status');
        text(card,reasonFor(trip,report),'insight-trip-history-reason');
        if(trip.needsDateReview)text(card,'月途中の変更・未入力に注意','insight-trip-history-review');
        if(overrides&&typeof overrides.save==='function'&&report.monthCompleted){
          var controls=doc.createElement('div');controls.className='insight-trip-history-edit';
          var picker=doc.createElement('select');
          picker.setAttribute('aria-label',trip.trip+'便の手動判定');
          option(picker,'auto','自動判定');
          option(picker,'active','対象便');
          option(picker,'inactive','対象外');
          picker.value=choice&&choice.manual||'auto';
          if(trip.observedDays>0)picker.querySelector('option[value="inactive"]').disabled=true;
          var save=doc.createElement('button');
          save.type='button';save.textContent='保存';save.disabled=true;
          save.setAttribute('aria-label',trip.trip+'便の手動判定を保存');
          picker.addEventListener('change',function(){
            save.disabled=picker.value===(choice&&choice.manual||'auto');
          });
          save.addEventListener('click',function(){
            var selected=picker.value;
            try{
              var storage=root.InsightStorage;
              overrides.save(all,storeSelect.value,categorySelect.value,monthSelect.value,trip.trip,selected,storage);
              render();
              if(root.InsightDataHealth&&typeof root.InsightDataHealth.refresh==='function')root.InsightDataHealth.refresh();
            }catch(error){
              root.alert('対象便の設定を保存できませんでした。\\n'+String(error&&error.message?error.message:error));
              // Re-read the committed selection; failed writes must never look saved.
              render();
            }
          });
          controls.append(picker,save);card.appendChild(controls);
        }
        results.appendChild(card);
      });
    }catch(error){
      summary.textContent='対象便の判定ができませんでした：'+String(error&&error.message?error.message:error);
    }
  }
  function refresh(syncStore){
    if(!section)return;
    var all=snapshot();
    if(!object(all)||!object(all.stores)){
      storeSelect.replaceChildren();categorySelect.replaceChildren();monthSelect.replaceChildren();
      summary.textContent='保存データを読み取れません。';results.replaceChildren();return;
    }
    var stores=Object.keys(all.stores).filter(function(id){return object(all.stores[id]);}).map(function(id){
      return {value:id,label:typeof all.stores[id].name==='string'&&all.stores[id].name?all.stores[id].name:id};
    });
    var previousStore=syncStore?'':storeSelect.value;
    replaceOptions(storeSelect,stores,previousStore,all.current);
    var categories=all.salesCountManagement&&Array.isArray(all.salesCountManagement.categories)?all.salesCountManagement.categories:[];
    var catList=categories.filter(function(c){return object(c)&&typeof c.id==='string';}).map(function(c){
      return {value:c.id,label:String(c.name||c.id)+(c.hidden?'（非表示）':'')};
    });
    var oldCat=categorySelect.value;
    replaceOptions(categorySelect,catList,oldCat,null);
    var months=storeSelect.value?monthOptions(all,storeSelect.value,categorySelect.value):[];
    var oldMonth=monthSelect.value;
    replaceOptions(monthSelect,months,oldMonth,latestObservedMonth(all,storeSelect.value,categorySelect.value));
    render();
  }
  function mount(){
    if(section&&section.isConnected)return true;
    var container=doc.querySelector('#pageSettings .insight-settings-content');
    if(!container)return false;
    section=doc.createElement('section');
    section.id='insightTripHistorySection';
    section.className='insight-settings-section insight-trip-history-section';
    section.innerHTML='<h2>過去の対象便判定</h2>'+
      '<p>納品・販売実績から月別に判定します。手動設定しても実績は変更しません。</p>'+
      '<div class="insight-trip-history-controls">'+
        '<label>店舗<select id="insightTripHistoryStore"></select></label>'+
        '<label>カテゴリー<select id="insightTripHistoryCategory"></select></label>'+
        '<label>年月<select id="insightTripHistoryMonth"></select></label>'+
      '</div>'+
      '<div id="insightTripHistorySummary" class="insight-trip-history-summary" aria-live="polite"></div>'+
      '<div id="insightTripHistoryResults" class="insight-trip-history-results"></div>'+
      '<p class="insight-trip-history-note">「対象外と推定」は確定ではありません。手動設定は過去月単位です。月途中の変更には対応していません。</p>';
    container.appendChild(section);
    storeSelect=section.querySelector('#insightTripHistoryStore');
    categorySelect=section.querySelector('#insightTripHistoryCategory');
    monthSelect=section.querySelector('#insightTripHistoryMonth');
    summary=section.querySelector('#insightTripHistorySummary');
    results=section.querySelector('#insightTripHistoryResults');
    storeSelect.addEventListener('change',function(){categorySelect.value='';monthSelect.value='';refresh();});
    categorySelect.addEventListener('change',function(){monthSelect.value='';refresh();});
    monthSelect.addEventListener('change',render);
    var page=doc.getElementById('pageSettings'),wasVisible=page.classList.contains('show');
    var observer=new MutationObserver(function(){
      var visible=page.classList.contains('show');
      if(visible&&!wasVisible)refresh(true);
      wasVisible=visible;
    });
    observer.observe(page,{attributes:true,attributeFilter:['class']});
    doc.addEventListener('visibilitychange',function(){
      if(!doc.hidden&&page.classList.contains('show'))refresh();
    });
    refresh(true);
    return true;
  }
  function init(){
    if(mount())return;
    var attempts=0,timer=setInterval(function(){attempts++;if(mount()||attempts>=50)clearInterval(timer);},100);
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
