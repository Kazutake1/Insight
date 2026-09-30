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
    if(type==='sales'){
      row.売上=0;
      row.買上点数=0;
    }else if(type==='haiki'){
      row.廃棄金額=0;
      row.haiki=blankHaiki();
    }else{return;}
    persist();
    initInputPage(type);
    updateMissingBadge();
    showToast('🗑 '+m+day+'日の'+label+'データをクリアしました','#dc2626','#fef2f2');
  };

  window.clearKyakuMonth=function(){
    var y=editYear.kyaku,m=editMonth.kyaku;
    var storeName=store.name;
    if(!confirm(storeName+' の '+m+'（'+y+'年）の客数データだけを全て削除します。\n売上・買上点数・廃棄・店舗メモ・天気・気温は残ります。\n\nこの操作は元に戻せません。よろしいですか？'))return;
    if(!store.data[y]||!store.data[y][m])return;
    store.data[y][m].forEach(function(row){if(row)row.客数=0;});
    persist();
    initInputPage('kyaku');
    updateMissingBadge();
    showToast('🗑 '+m+'の客数データをクリアしました','#dc2626','#fef2f2');
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

