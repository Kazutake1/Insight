(function(){
  function preserveDailyOps(oldRow,newRow){
    if(!oldRow||!newRow)return newRow;
    if(newRow.storeMemo===undefined&&oldRow.storeMemo!==undefined)newRow.storeMemo=oldRow.storeMemo;
    if(newRow.stockout===undefined&&oldRow.stockout!==undefined)newRow.stockout=oldRow.stockout;
    if(newRow.tempMaxC===undefined&&oldRow.tempMaxC!==undefined)newRow.tempMaxC=oldRow.tempMaxC;
    if(newRow.tempMinC===undefined&&oldRow.tempMinC!==undefined)newRow.tempMinC=oldRow.tempMinC;
    return newRow;
  }

  if(window.InsightHooks){
    window.InsightHooks.on('input:save:before','preserve-daily-ops',function(ctx){
      var type=ctx.args[0],year=editYear&&editYear[type],month=editMonth&&editMonth[type];
      var oldRows=(year&&month&&store.data&&store.data[year]&&Array.isArray(store.data[year][month]))?store.data[year][month]:[];
      ctx.state.preserveDailyOps={
        year:year,month:month,
        saved:oldRows.map(function(row){
          if(!row)return null;
          return {storeMemo:row.storeMemo,stockout:row.stockout,tempMaxC:row.tempMaxC,tempMinC:row.tempMinC};
        })
      };
    },10);
    window.InsightHooks.on('input:save:after','restore-daily-ops',function(ctx){
      var state=ctx.state.preserveDailyOps||{},year=state.year,month=state.month,saved=state.saved||[];
      var newRows=(year&&month&&store.data&&store.data[year]&&Array.isArray(store.data[year][month]))?store.data[year][month]:[];
      newRows.forEach(function(row,index){if(saved[index])preserveDailyOps(saved[index],row);});
      persist();
    },20);
  }


  // STEP4 GATE-3: observe only confirmed, effective daily SALES or WASTE clear.
  // This adapter is private to the preserve-daily-ops override and non-authorizing.
  var dayClearObserver=null,dayClearFault=false,dayClearActive=0;
  var dayClearScope='selected-sales-or-waste-day-confirmed-clear-only';
  function getDayClearOperationStatus(){
    var scope=dayClearScope;
    if(dayClearFault)return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});
    if(!dayClearObserver)return Object.freeze({scope:scope,state:'UNAVAILABLE',activeCount:null,epoch:null});
    try{
      var s=dayClearObserver.status();
      if(!s||s.scope!=='registered-operations-only'||
        ['IDLE_OBSERVED','ACTIVE','HELD'].indexOf(s.state)<0||
        !Number.isSafeInteger(s.activeCount)||s.activeCount<0||
        !Number.isSafeInteger(s.epoch)||s.epoch<1||
        s.activeCount<dayClearActive||
        (s.state==='IDLE_OBSERVED'&&s.activeCount!==0)||
        (s.state==='ACTIVE'&&s.activeCount===0)||
        (dayClearActive>0&&s.state!=='ACTIVE'&&s.state!=='HELD'))
        throw new Error('daily clear observer status invalid');
      return Object.freeze({scope:scope,state:s.state,activeCount:s.activeCount,epoch:s.epoch});
    }catch(_){dayClearFault=true;return Object.freeze({scope:scope,state:'HELD',activeCount:null,epoch:null});}
  }
  (function initializeDayClearObserver(){
    try{
      var factory=window.InsightOperationObserverV0&&window.InsightOperationObserverV0.createOperationObserver;
      if(typeof factory!=='function')return;
      var candidate=factory();
      if(!candidate||['initialize','begin','end','invalidate','status'].some(function(k){
        return typeof candidate[k]!=='function';
      })||candidate.initialize()!==true){dayClearFault=true;return;}
      dayClearObserver=candidate;
      var initial=getDayClearOperationStatus();
      if(initial.state!=='IDLE_OBSERVED'||initial.activeCount!==0)dayClearFault=true;
    }catch(_){dayClearFault=true;}
  })();
  function observeDayClear(action){
    var ref=dayClearObserver,token=null,registered=false,outcome='unknown';
    if(ref&&!dayClearFault){
      try{
        token=ref.begin('selected_input_day_clear');
        if(!token||typeof token!=='object'||dayClearActive>=Number.MAX_SAFE_INTEGER){
          dayClearFault=true;
        }else{
          registered=true;dayClearActive++;
          if(getDayClearOperationStatus().state!=='ACTIVE')dayClearFault=true;
        }
      }catch(_){dayClearFault=true;}
    }
    try{
      var result=action();
      outcome='completed';
      return result;
    }finally{
      if(registered){
        try{if(ref.end(token,outcome)!==true)dayClearFault=true;}
        catch(_){dayClearFault=true;}
        dayClearActive--;
        if(!dayClearFault)getDayClearOperationStatus();
      }
    }
  }
  // Getter only; no cross-observer clean aggregation or business values exposed.
  window.InsightDailyClearObserverV0=Object.freeze({getStatus:getDayClearOperationStatus});

  window.clearDayData=function(type){
    var label=type==='sales'?'売上・買上点数':type==='haiki'?'廃棄':'入力';
    var y=editYear&&editYear[type],m=editMonth&&editMonth[type];
    var day=type==='sales'?window.salesSelDay:type==='haiki'?window.haikiSelDay:null;
    var storeName=store.name;
    if(!day){alert('日付が選択されていません。');return;}
    if(!confirm(storeName+' の '+m+day+'日 の'+label+'データだけを削除します。\n他の入力データは残ります。\n\nこの操作は元に戻せません。よろしいですか？'))return;
    if(!store.data[y]||!store.data[y][m])return;
    var ri=day-1,row=store.data[y][m][ri];
    if(!row)return;
    if(type!=='sales'&&type!=='haiki')return;
    return observeDayClear(function(){
      if(type==='sales'){
        row.売上=0;
        row.買上点数=0;
      }else{
        row.廃棄金額=0;
        row.haiki=blankHaiki();
      }
      persist();
      initInputPage(type);
      updateMissingBadge();
      showToast('🗑 '+m+day+'日の'+label+'データをクリアしました','#dc2626','#fef2f2');
    });
  };

  window.clearKyakuMonth=function(){
    var y=editYear.kyaku,m=editMonth.kyaku;
    var storeName=store.name;
    if(!confirm(storeName+' の '+m+'（'+y+'年）の客数データだけを全て削除します。\n売上・買上点数・廃棄・店舗メモ・天気・気温は残ります。\n\nこの操作は元に戻せません。よろしいですか？'))return;
    if(!store.data[y]||!store.data[y][m])return;
    // The effective customer-month clear is the preserve-data override.
    // Start observing before the first row mutation; never switch to the
    // legacy core blankMonthData behavior, which would erase other fields.
    return InsightKyakuMonthClearObserverV0.observe(function(){
      store.data[y][m].forEach(function(row){if(row)row.客数=0;});
      persist();
      initInputPage('kyaku');
      updateMissingBadge();
      showToast('🗑 '+m+'の客数データをクリアしました','#dc2626','#fef2f2');
    });
  };


  if(typeof window.confirmDeleteYear==='function'){
    var originalConfirmDeleteYear=window.confirmDeleteYear;
    window.confirmDeleteYear=function(){
      var deletedYear=typeof yearToDelete!=='undefined'?yearToDelete:null;
      if(deletedYear!=null&&typeof store!=='undefined'&&store&&store.monthlyOps){
        delete store.monthlyOps[String(deletedYear)];
      }
      return originalConfirmDeleteYear.apply(this,arguments);
    };
  }
})();

