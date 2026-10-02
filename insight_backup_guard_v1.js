(function(){
function isPlainObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function validYear(v){return /^\d{4}$/.test(String(v));}
function nonNegativeNumber(v,label){if(v===undefined||v===null||v==="")return 0;var n=Number(v);if(!Number.isFinite(n)||n<0)throw new Error(label+" が不正です");return n;}
function expectedDays(year,monthIndex){var y=Number(year);if(monthIndex===1&&y%4===0&&(y%100!==0||y%400===0))return 29;return DAYS_IN_MONTH[monthIndex];}
function validSalesCountDate(value){var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return false;var year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;}
var BACKUP_FORMAT="InsightBackup",BACKUP_FORMAT_VERSION=2;
function validationError(message){var error=new Error(message);error.name="InsightBackupValidationError";return error;}
function currentStorageKey(){try{if(typeof SK!=="undefined"&&SK)return String(SK);}catch(_){}return "insight_v11";}
function sameStrings(a,b){if(!Array.isArray(a)||!Array.isArray(b))return false;var x=a.map(String).slice().sort(),y=b.map(String).slice().sort();return x.length===y.length&&x.every(function(v,i){return v===y[i];});}
function backupYears(snapshot){
  var set=new Set();
  Object.keys(snapshot.stores||{}).forEach(function(id){var st=snapshot.stores[id];if(st&&Array.isArray(st.years))st.years.forEach(function(y){if(validYear(y))set.add(String(y));});});
  return Array.from(set).sort();
}
function backupStoreInfo(snapshot){
  return Object.keys(snapshot.stores||{}).map(function(id){var st=snapshot.stores[id]||{};return {id:id,name:String(st.name||id),years:Array.isArray(st.years)?st.years.map(String).filter(validYear).sort():[]};});
}
function buildBackupInfo(snapshot,now){
  var stores=backupStoreInfo(snapshot);
  return {
    format:BACKUP_FORMAT,
    formatVersion:BACKUP_FORMAT_VERSION,
    createdAt:now.toISOString(),
    storageKey:currentStorageKey(),
    schemaVersion:snapshot.schemaVersion,
    buildId:window.__INSIGHT_SHELL_VERSION__||"",
    storeCount:stores.length,
    currentStoreId:snapshot.current,
    years:backupYears(snapshot),
    stores:stores
  };
}
function parseBackupEnvelope(raw){
  if(isPlainObject(raw)&&Object.prototype.hasOwnProperty.call(raw,"backupInfo")){
    if(!isPlainObject(raw.backupInfo)||!isPlainObject(raw.data))throw validationError("バックアップ情報またはデータ本体が不正です。");
    return {data:raw.data,info:raw.backupInfo,legacy:false};
  }
  return {data:raw,info:null,legacy:true};
}
function validateBackupInfo(info,snapshot){
  if(info.format!==BACKUP_FORMAT||Number(info.formatVersion)!==BACKUP_FORMAT_VERSION)throw validationError("このバックアップ形式には対応していません。");
  if(typeof info.createdAt!=="string"||!Number.isFinite(Date.parse(info.createdAt)))throw validationError("バックアップ日時が不正です。");
  if(info.storageKey!==undefined&&typeof info.storageKey!=="string")throw validationError("保存領域情報が不正です。");
  if(info.buildId!==undefined&&typeof info.buildId!=="string")throw validationError("ビルド情報が不正です。");
  if(Number(info.schemaVersion)!==Number(snapshot.schemaVersion))throw validationError("バックアップ情報とデータ形式のバージョンが一致しません。");
  var actualStores=backupStoreInfo(snapshot),actualIds=actualStores.map(function(item){return item.id;});
  if(!Number.isSafeInteger(Number(info.storeCount))||Number(info.storeCount)!==actualStores.length)throw validationError("バックアップ情報の店舗数がデータ本体と一致しません。");
  if(!Array.isArray(info.stores)||info.stores.length!==actualStores.length)throw validationError("バックアップ情報の店舗一覧がデータ本体と一致しません。");
  var metaIds=[];
  info.stores.forEach(function(item){
    if(!isPlainObject(item)||typeof item.id!=="string"||!item.id||typeof item.name!=="string"||!Array.isArray(item.years))throw validationError("バックアップ情報の店舗内容が不正です。");
    var actual=actualStores.find(function(store){return store.id===item.id;});
    if(!actual||actual.name!==item.name||!sameStrings(item.years,actual.years))throw validationError("バックアップ情報の店舗・年度がデータ本体と一致しません。");
    metaIds.push(item.id);
  });
  if(!sameStrings(metaIds,actualIds))throw validationError("バックアップ情報の店舗識別情報が一致しません。");
  if(!Array.isArray(info.years)||info.years.some(function(y){return !validYear(y);})||!sameStrings(info.years,backupYears(snapshot)))throw validationError("バックアップ情報の対象年度がデータ本体と一致しません。");
  if(typeof info.currentStoreId!=="string"||info.currentStoreId!==snapshot.current)throw validationError("バックアップ情報の現在店舗がデータ本体と一致しません。");
}
function runRestorePreflight(snapshot){
  if(!window.InsightDataHealth||typeof window.InsightDataHealth.check!=="function")throw validationError("データ状態確認機能を初期化できませんでした。");
  var report=window.InsightDataHealth.check(snapshot);
  if(!report||!report.counts)throw validationError("復元前検査を完了できませんでした。");
  if(report.counts.errors){
    var details=(report.issues||[]).filter(function(item){return item.severity==="error";}).slice(0,5).map(function(item){return "・"+item.message;}).join("\n");
    throw validationError("復元前検査で重大な問題が"+report.counts.errors+"件見つかりました。"+(details?"\n"+details:""));
  }
  return report;
}
function restoreSummary(fileName,info,snapshot,report){
  var created="記録なし（従来形式）";
  if(info&&typeof info.createdAt==="string"){try{created=new Date(info.createdAt).toLocaleString("ja-JP");}catch(_){}}
  var years=backupYears(snapshot);
  var checkText=report.counts.warnings?"注意 "+report.counts.warnings+"件（重大 0件）":"正常";
  var message=fileName+"\n\nバックアップ日時："+created+"\n店舗数："+Object.keys(snapshot.stores).length+"\n対象年度："+(years.length?years.join(" / "):"なし")+"\n復元前検査："+checkText;
  if(report.counts.warnings){
    var warnings=(report.issues||[]).filter(function(item){return item.severity==="warning";}).slice(0,3).map(function(item){return "・"+item.message;}).join("\n");
    if(warnings)message+="\n\n注意事項\n"+warnings;
  }
  return message+"\n\n現在の全データは上書きされます。復元しますか？";
}

function normalizeSalesCount(next){
  if(next.salesCountManagement===undefined)next.salesCountManagement={version:1,categories:[{id:"cat_onigiri",name:"おにぎり",hidden:false,aliases:[]},{id:"cat_sandwich",name:"サンドイッチ",hidden:false,aliases:[]},{id:"cat_noodles",name:"麺類",hidden:false,aliases:[]}]};
  if(!isPlainObject(next.salesCountManagement)||next.salesCountManagement.version!==1||!Array.isArray(next.salesCountManagement.categories)||!next.salesCountManagement.categories.length||!next.salesCountManagement.categories.some(function(c){return isPlainObject(c)&&c.hidden===false;}))throw new Error("販売数カテゴリーマスターが不正です");
  var ids=new Set(),names=new Set(),labels=new Set();next.salesCountManagement.categories.forEach(function(c){if(!isPlainObject(c)||typeof c.id!=="string"||!c.id||ids.has(c.id)||typeof c.name!=="string"||!c.name.trim()||names.has(c.name)||typeof c.hidden!=="boolean"||!Array.isArray(c.aliases)||c.aliases.some(function(a){return typeof a!=="string"||!a.trim();}))throw new Error("販売数カテゴリーが不正です");var values=[c.name].concat(c.aliases);if(values.some(function(v){return labels.has(v);}))throw new Error("販売数カテゴリーの名称履歴が重複しています");values.forEach(function(v){labels.add(v);});ids.add(c.id);names.add(c.name);});
  Object.keys(next.stores).forEach(function(storeId){var st=next.stores[storeId];if(st.salesCounts===undefined)st.salesCounts={};if(!isPlainObject(st.salesCounts))throw new Error("販売数データが不正です");Object.keys(st.salesCounts).forEach(function(date){if(!validSalesCountDate(date)||!isPlainObject(st.salesCounts[date]))throw new Error("販売数の日付データが不正です");Object.keys(st.salesCounts[date]).forEach(function(categoryId){if(!ids.has(categoryId))throw new Error("販売数カテゴリーの識別番号が不正です");var r=st.salesCounts[date][categoryId];if(!isPlainObject(r)||!Array.isArray(r.trips)||r.trips.length!==3)throw new Error("販売数の便データが不正です");r.trips.forEach(function(t){if(!isPlainObject(t))throw new Error("販売数の便データが不正です");["delivery","sales"].forEach(function(k){var v=t[k];if(v!==null&&(!Number.isSafeInteger(v)||v<0))throw new Error("販売数の入力値が不正です");});});});});});
}
function normalizeBackup(raw){
  var next;if(isPlainObject(raw)&&isPlainObject(raw.stores)&&typeof raw.current==="string"){next=raw;}else if(isPlainObject(raw)&&Array.isArray(raw.years)&&isPlainObject(raw.data)){next=migrateOldData(raw);}else{throw new Error("バックアップ形式が正しくありません");}
  if(!window.InsightStorage)throw new Error("保存機能を初期化できませんでした");
  next=window.InsightStorage.migrateSnapshot(next);
  if(next.schemaVersion!==window.InsightStorage.CURRENT_SCHEMA_VERSION)throw new Error("バックアップのデータ形式に対応していません");
  if(!isPlainObject(next.stores)||Object.keys(next.stores).length===0)throw new Error("店舗データがありません");
  if(typeof next.current!=="string"||!next.current||!next.stores[next.current])throw new Error("現在店舗の情報が不正です");
  Object.keys(next.stores).forEach(function(id){
    var st=next.stores[id];if(!isPlainObject(st))throw new Error("店舗データが不正です");
    if(typeof st.name!=="string"||!st.name.trim())throw new Error("店舗名が不正です");
    if(!Array.isArray(st.years)||st.years.length===0)throw new Error("年度データがありません");
    var years=st.years.map(function(y){return String(y);});
    if(years.some(function(y){return !validYear(y);})||new Set(years).size!==years.length)throw new Error("年度情報が不正です");
    st.years=years;if(!isPlainObject(st.data))throw new Error("日別データが不正です");
    years.forEach(function(y){
      var yd=st.data[y];if(!isPlainObject(yd))throw new Error(y+"年のデータがありません");
      MONTHS.forEach(function(m,mi){
        var rows=yd[m];if(!Array.isArray(rows)||rows.length!==expectedDays(y,mi))throw new Error(y+"年"+m+"の日別データ件数が不正です");
        rows.forEach(function(row,ri){
          if(!isPlainObject(row))throw new Error(y+"年"+m+(ri+1)+"日のデータが不正です");
          if(row.d!==undefined&&Number(row.d)!==ri+1)throw new Error(y+"年"+m+(ri+1)+"日の日付情報が不正です");row.d=String(ri+1);
          ["売上","客数","買上点数","廃棄金額"].forEach(function(k){row[k]=nonNegativeNumber(row[k],k);});
          if(row.haiki===undefined){row.haiki=blankHaiki();}else{if(!isPlainObject(row.haiki))throw new Error("廃棄内訳が不正です");HAIKI_CATS.forEach(function(c){row.haiki[c]=nonNegativeNumber(row.haiki[c],c);});}
          if(row.weather===undefined)row.weather="";else if(typeof row.weather!=="string")throw new Error("天気データが不正です");
          if(row.storeMemo!==undefined&&typeof row.storeMemo!=="string")throw new Error("店舗メモが不正です");
          if(row.stockout!==undefined&&["なし","少ない","多い"].indexOf(row.stockout)<0)throw new Error("欠品データが不正です");
        });
      });
    });
    if(st.monthlyOps!==undefined){
      if(!isPlainObject(st.monthlyOps))throw new Error("月次データが不正です");
      Object.keys(st.monthlyOps).forEach(function(y){if(!validYear(y)||!isPlainObject(st.monthlyOps[y]))throw new Error("月次年度データが不正です");Object.keys(st.monthlyOps[y]).forEach(function(m){if(MONTHS.indexOf(m)<0||!isPlainObject(st.monthlyOps[y][m]))throw new Error("月次データが不正です");var op=st.monthlyOps[y][m];op.laborCostYen=nonNegativeNumber(op.laborCostYen,"人件費");op.grossMarginRate=nonNegativeNumber(op.grossMarginRate,"粗利率");if(op.grossMarginRate>100)throw new Error("粗利率が不正です");});});
    }
    if(st.haikibudget!==undefined){if(!isPlainObject(st.haikibudget)||!isPlainObject(st.haikibudget.cats))throw new Error("廃棄予算が不正です");st.haikibudget.total=nonNegativeNumber(st.haikibudget.total,"廃棄予算");HAIKI_CATS.forEach(function(c){st.haikibudget.cats[c]=nonNegativeNumber(st.haikibudget.cats[c],c+"予算");});}
    if(st.weatherLocation!==undefined){
      var wl=st.weatherLocation;
      if(!isPlainObject(wl)||typeof wl.name!=="string"||!wl.name.trim())throw new Error("天気地点設定が不正です");
      var lat=Number(wl.latitude),lon=Number(wl.longitude);
      if(!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lon)||lon<-180||lon>180)throw new Error("天気地点の座標が不正です");
      wl.latitude=lat;wl.longitude=lon;
      if(wl.label!==undefined&&typeof wl.label!=="string")throw new Error("天気地点名が不正です");
      if(wl.timezone!==undefined&&typeof wl.timezone!=="string")throw new Error("天気地点のタイムゾーンが不正です");
    }
  });
  if(next.sharedWeather!==undefined){if(!isPlainObject(next.sharedWeather))throw new Error("共有天気データが不正です");Object.keys(next.sharedWeather).forEach(function(k){if(typeof next.sharedWeather[k]!=="string")throw new Error("共有天気データが不正です");});}
  normalizeSalesCount(next);
  if(window.InsightEvents)window.InsightEvents.validate(next);
  else if(next.eventManagement!==undefined||Object.keys(next.stores).some(function(id){return next.stores[id].events!==undefined;}))throw new Error("店舗イベント機能の読み込み後に復元してください");
  return next;
}
backupData=function(){
  try{
    if(!window.InsightStorage)throw new Error("保存機能を初期化できませんでした");
    var snapshot=window.InsightStorage.migrateSnapshot(allStores),now=new Date();
    var payload={backupInfo:buildBackupInfo(snapshot,now),data:snapshot};
    var pad=function(n){return String(n).padStart(2,"0");};
    var stamp=now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"_"+pad(now.getHours())+pad(now.getMinutes())+pad(now.getSeconds());
    var filename="Insight_backup_all_stores_"+stamp+".json";
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
    localStorage.setItem("insight_last_backup",String(Date.now()));
    if(typeof updateBackupDaysLabel==="function")updateBackupDaysLabel();
    showToast("📥 バックアップを保存しました","#15803d","#f0fdf4");
  }catch(err){
    console.warn("Insight backup failed:",err);
    alert("バックアップを保存できませんでした。\n"+String(err&&err.message?err.message:err));
  }
};
restoreData=function(e){
  var file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024){alert("バックアップファイルが大きすぎます。\n20MB以下のファイルを選択してください。");e.target.value="";return;}
  var reader=new FileReader();reader.onload=function(ev){try{
    var parsed=JSON.parse(ev.target.result),envelope=parseBackupEnvelope(parsed),newAll=normalizeBackup(envelope.data);
    if(envelope.info)validateBackupInfo(envelope.info,newAll);
    var preflight=runRestorePreflight(newAll);
    if(!confirm(restoreSummary(file.name,envelope.info,newAll,preflight))){e.target.value="";return;}
    try{if(!window.InsightStorage)throw new Error("保存機能を初期化できませんでした");window.InsightStorage.writeSnapshot(newAll);}catch(storageErr){throw new Error("保存容量が不足しているため復元できません");}
    allStores=newAll;store=allStores.stores[allStores.current];baseYear=store.years[store.years.length-1];cmpYear=store.years.length>1?store.years[store.years.length-2]:null;editYear={sales:baseYear,kyaku:baseYear,haiki:baseYear};editMonth={sales:todayFY().month,kyaku:todayFY().month,haiki:todayFY().month};renderStoreSel();if(currentNav==='salesCounts'){if(window.InsightSalesCount&&typeof window.InsightSalesCount.reloadFromStore==="function")window.InsightSalesCount.reloadFromStore();else gotoNav('salesCounts');}else if(currentNav===1)refreshDash();else if(currentNav>1)initInputPage(["","","sales","kyaku","haiki"][currentNav]);else initQuickPage();if(window.InsightPagePeriodSync&&typeof window.InsightPagePeriodSync.reconcileCurrentStore==="function")window.InsightPagePeriodSync.reconcileCurrentStore();updateMissingBadge();showToast("📤 データを復元しました","#1d4ed8","#eff6ff");
  }catch(err){
    console.warn("Insight restore rejected:",err);
    var detail=String(err&&err.message?err.message:err);
    alert("バックアップを復元できませんでした。\n"+detail+"\n\n現在のデータは変更されていません。");
  }e.target.value="";};reader.onerror=function(){alert("ファイルを読み込めませんでした。\n現在のデータは変更されていません。");e.target.value="";};reader.readAsText(file);
};
})();
