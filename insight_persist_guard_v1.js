/* Persist guard v1.
 * Replaces the legacy global persist() after InsightStorage is available.
 * Keeps save failures visible and delegates all writes to the shared storage layer.
 */
(function(root){
'use strict';
if(root.InsightPersistGuard)return;

var original=root.persist;
if(typeof original!=='function')throw new Error('Insight legacy persist function is unavailable');

function currentSnapshot(){
  var target;
  try{if(typeof allStores!=='undefined')target=allStores;}catch(_){}
  if(target===undefined)target=root.allStores;
  if(!target||typeof target!=='object'||Array.isArray(target))throw new Error('Insight current data is unavailable');
  return target;
}

function failSave(error){
  try{
    if(typeof root.alert==='function'){
      root.alert(error&&(error.name==='InsightStorageConflictError'||error.name==='InsightStorageRestoreHoldError')?error.message:'データの保存処理でエラーが発生しました。\n保存結果を確認できないため、この画面での追加編集・再保存は控えてください。\n入力内容を控えてからInsightを手動で再読み込みし、保存済みデータを確認してください。');
    }
  }catch(_){}
  var saveError=new Error('Insight data save failed');
  saveError.name='InsightPersistError';
  saveError.cause=error;
  throw saveError;
}

function guardedPersist(){
  try{
    if(!root.InsightStorage||typeof root.InsightStorage.persistCurrent!=='function'){
      throw new Error('Insight shared storage is unavailable');
    }
    return root.InsightStorage.persistCurrent(currentSnapshot());
  }catch(error){
    return failSave(error);
  }
}
guardedPersist.__insightPersistGuard=true;
guardedPersist.__insightOriginal=original;

root.persist=guardedPersist;
if(root.persist!==guardedPersist)throw new Error('Insight persist guard could not be installed');

if(typeof root.addEventListener==='function'){
  root.addEventListener('error',function(event){
    if(event&&event.error&&event.error.name==='InsightPersistError'&&typeof event.preventDefault==='function')event.preventDefault();
  });
}

root.InsightPersistGuard={
  VERSION:1,
  original:original,
  persist:guardedPersist
};
})(typeof window!=='undefined'?window:globalThis);
