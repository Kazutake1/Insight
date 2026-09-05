(function(){
  function preserveDailyOps(oldRow,newRow){
    if(!oldRow||!newRow)return newRow;
    if(newRow.storeMemo===undefined&&oldRow.storeMemo!==undefined)newRow.storeMemo=oldRow.storeMemo;
    if(newRow.stockout===undefined&&oldRow.stockout!==undefined)newRow.stockout=oldRow.stockout;
    return newRow;
  }

  if(typeof window.saveInput==='function'){
    var originalSaveInput=window.saveInput;
    window.saveInput=function(type){
      var year=editYear&&editYear[type];
      var month=editMonth&&editMonth[type];
      var oldRows=(year&&month&&store.data&&store.data[year]&&Array.isArray(store.data[year][month]))?store.data[year][month]:[];
      var savedOps=oldRows.map(function(row){
        if(!row)return null;
        return {storeMemo:row.storeMemo,stockout:row.stockout};
      });

      var result=originalSaveInput.apply(this,arguments);

      var newRows=(year&&month&&store.data&&store.data[year]&&Array.isArray(store.data[year][month]))?store.data[year][month]:[];
      newRows.forEach(function(row,index){
        if(savedOps[index])preserveDailyOps(savedOps[index],row);
      });
      persist();
      return result;
    };
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
    if(!confirm(storeName+' の '+m+'（'+y+'年）の客数データだけを全て削除します。\n売上・買上点数・廃棄・店舗メモ・欠品・天気は残ります。\n\nこの操作は元に戻せません。よろしいですか？'))return;
    if(!store.data[y]||!store.data[y][m])return;
    store.data[y][m].forEach(function(row){if(row)row.客数=0;});
    persist();
    initInputPage('kyaku');
    updateMissingBadge();
    showToast('🗑 '+m+'の客数データをクリアしました','#dc2626','#fef2f2');
  };

  window.clearTodayData=function(){
    var t=todayFY();
    var day=Number(typeof quickEditDay!=='undefined'?quickEditDay:t.day)||t.day;
    var storeName=store.name;
    var targetLabel=day===t.day?'本日（'+t.month+day+'日）':t.month+day+'日';
    if(!confirm(storeName+' の '+targetLabel+'の入力データを削除します。\n売上・客数・買上点数・廃棄・店舗メモ・欠品をクリアし、天気は保持します。\n\nこの操作は元に戻せません。よろしいですか？'))return;
    if(!store.data[t.fy]||!store.data[t.fy][t.month])return;
    var ri=day-1,row=store.data[t.fy][t.month][ri];
    if(row){
      row.売上=0;
      row.客数=0;
      row.買上点数=0;
      row.廃棄金額=0;
      row.haiki=blankHaiki();
      delete row.storeMemo;
      delete row.stockout;
    }
    persist();
    initQuickPage();
    updateMissingBadge();
    showToast('🗑 '+t.month+day+'日の入力データをクリアしました','#dc2626','#fef2f2');
  };
})();
