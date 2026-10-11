/* Settings monthly trip inference review and optional manual corrections. */
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
  function appendManualControl(card,trip,report,all){
    var overrides=root.InsightTripOverrides;
    if(!overrides||typeof overrides.getOverride!=='function')return;
    var storeId=storeSelect.value,categoryId=categorySelect.value,month=monthSelect.value;
    var previous=overrides.getOverride(all,storeId,categoryId,month,trip.trip);
    var control=doc.createElement('div');control.className='insight-trip-history-edit';
    var select=doc.createElement('select');
    select.className='insight-trip-history-choice';
    select.setAttribute('aria-label',trip.trip+'便の手動判定');
    option(select,'','自動判定に戻す');
    option(select,'active','対象便として確定');
    option(select,'inactive','対象外として確定');
    select.value=previous||'';
    var hasSaved=overrides.hasRecord(all.stores[storeId],categoryId,month,trip.trip);
    if(hasSaved)select.querySelector('option[value="inactive"]').disabled=true;
    var save=doc.createElement('button');
    save.type='button';save.className='insight-trip-history-save';
    save.textContent='保存';save.disabled=true;
    function sync(){save.disabled=select.disabled||select.value===(previous||'');}
    select.addEventListener('change',sync);
    save.addEventListener('click',function(){
      var mode=select.value||null;
      try{
        overrides.save(snapshot(),root.InsightStorage,storeId,categoryId,month,trip.trip,mode);
        render();
        summary.textContent='手動判定を保存しました。 '+summary.textContent;
      }catch(error){
        root.alert('対象便判定を保存できませんでした。\\n'+String(error&&error.message?error.message:error));
        render();
      }
    });
    if(!report.monthCompleted){
      select.disabled=true;
      select.title='終了した過去月のみ手動設定できます。';
    }
    if(hasSaved&&previous!=='inactive'){
      select.title='入力実績のある便は対象外として確定できません。';
    }
    sync();
    control.append(select,save);card.appendChild(control);
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
        var overrides=root.InsightTripOverrides,decision=overrides&&overrides.effective?
          overrides.effective(all,storeSelect.value,categorySelect.value,monthSelect.value,trip.trip,trip.status):null;
        var title=decision&&decision.mode==='manual'?
          '手動指定：'+(decision.manual==='active'?'対象便':'対象外'):
          decision&&decision.mode==='conflict'?'入力実績あり（手動判定と矛盾）':labelFor(trip);
        text(card,title,'insight-trip-history-status');
        text(card,reasonFor(trip,report),'insight-trip-history-reason');
        if(decision&&decision.mode==='conflict')
          text(card,'保存済みの実績を優先します。手動判定を確認してください。','insight-trip-history-review');
        else if(trip.needsDateReview)text(card,'月途中の変更・未入力に注意','insight-trip-history-review');
        appendManualControl(card,trip,report,all);
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
      '<p>保存済みの納品・販売実績から月ごとに推定します。過去月の判定だけ手動で修正できます。</p>'+
      '<div class="insight-trip-history-controls">'+
        '<label>店舗<select id="insightTripHistoryStore"></select></label>'+
        '<label>カテゴリー<select id="insightTripHistoryCategory"></select></label>'+
        '<label>年月<select id="insightTripHistoryMonth"></select></label>'+
      '</div>'+
      '<div id="insightTripHistorySummary" class="insight-trip-history-summary" aria-live="polite"></div>'+
      '<div id="insightTripHistoryResults" class="insight-trip-history-results"></div>'+
      '<p class="insight-trip-history-note">推定は確定情報ではありません。手動指定は月単位の判定記録で、納品・販売実績や現在の対象便設定は変更しません。</p>';
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
