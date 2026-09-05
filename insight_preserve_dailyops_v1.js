(function(){
  function preserveDailyOps(oldRow,newRow){
    if(!oldRow||!newRow)return newRow;
    if(newRow.storeMemo===undefined&&oldRow.storeMemo!==undefined)newRow.storeMemo=oldRow.storeMemo;
    if(newRow.stockout===undefined&&oldRow.stockout!==undefined)newRow.stockout=oldRow.stockout;
    return newRow;
  }

  if(typeof window.saveInput!=='function')return;

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
})();
