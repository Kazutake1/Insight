/* Historical year manager v1: safely promote partial/orphan year data into registered full-year data. */
(function(root){
  'use strict';
  if(root.InsightYearManager)return;

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function validYear(value){var year=String(value==null?'':value).trim();return /^\d{4}$/.test(year)?year:null;}
  function hasOwn(target,key){return Object.prototype.hasOwnProperty.call(target,key);}

  function normalizeYearData(existing,year,createYear){
    if(typeof createYear!=='function')throw new Error('年度の空データを作成できません。');
    var fresh=createYear(String(year));
    if(!object(fresh))throw new Error('年度データを作成できません。');
    var source=object(existing)?existing:{},recoveredRows=0;

    Object.keys(source).forEach(function(key){
      if(!hasOwn(fresh,key))fresh[key]=clone(source[key]);
    });

    Object.keys(fresh).forEach(function(monthKey){
      var targetRows=fresh[monthKey];
      if(!Array.isArray(targetRows))return;
      var sourceRows=Array.isArray(source[monthKey])?source[monthKey]:[];
      sourceRows.forEach(function(row,index){
        if(!object(row))return;
        var declared=Number(row.d);
        var targetIndex=Number.isInteger(declared)&&declared>=1&&declared<=targetRows.length?declared-1:index;
        if(targetIndex<0||targetIndex>=targetRows.length)return;
        var base=object(targetRows[targetIndex])?targetRows[targetIndex]:{};
        var merged=Object.assign({},base,clone(row));
        if(object(base.haiki)){
          merged.haiki=object(row.haiki)?Object.assign({},clone(base.haiki),clone(row.haiki)):clone(base.haiki);
        }
        merged.d=String(targetIndex+1);
        targetRows[targetIndex]=merged;
        recoveredRows++;
      });
    });
    return {data:fresh,recoveredRows:recoveredRows};
  }

  function isRegistered(storeValue,year){
    var y=validYear(year);
    if(!y||!storeValue||!Array.isArray(storeValue.years))return false;
    return storeValue.years.some(function(value){return String(value)===y;});
  }

  function promote(snapshot,storeId,year,createYear){
    var y=validYear(year);
    if(!y)throw new Error('4桁の西暦を入力してください');
    if(!object(snapshot)||!object(snapshot.stores)||!object(snapshot.stores[storeId]))throw new Error('店舗データを確認できません。');
    var target=snapshot.stores[storeId],wasRegistered=isRegistered(target,y);
    if(!object(target.data))target.data={};
    var normalized=normalizeYearData(target.data[y],y,createYear);
    target.data[y]=normalized.data;
    var years=Array.isArray(target.years)?target.years.map(function(value){return String(value);}):[];
    if(years.indexOf(y)<0)years.push(y);
    years=Array.from(new Set(years)).sort(function(a,b){return Number(a)-Number(b);});
    target.years=years;
    return {year:y,added:!wasRegistered,recoveredRows:normalized.recoveredRows};
  }

  var model={
    validYear:validYear,
    isRegistered:isRegistered,
    normalizeYearData:normalizeYearData,
    promote:promote
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightYearManager=model;
  if(!root.document)return;

  function currentStore(){
    try{return typeof allStores!=='undefined'&&allStores&&allStores.stores?allStores.stores[allStores.current]:null;}catch(_){return null;}
  }
  function createYear(year){
    if(typeof blankYearData!=='function')throw new Error('年度データの初期化機能を使用できません。');
    return blankYearData(String(year));
  }
  function applySnapshot(next){
    allStores=next;
    store=allStores.stores[allStores.current];
  }
  function promoteCurrent(year){
    if(!root.InsightStorage||typeof root.InsightStorage.transaction!=='function')throw new Error('保存機能を初期化できませんでした。');
    var result=null;
    root.InsightStorage.transaction(
      allStores,
      function(next){result=promote(next,next.current,year,createYear);},
      null,
      applySnapshot
    );
    return result;
  }
  function isCurrentRegistered(year){return isRegistered(currentStore(),year);}

  model.promoteCurrent=promoteCurrent;
  model.isCurrentRegistered=isCurrentRegistered;

  root.addYear=function(value){
    var y=validYear(String(parseInt(value,10)||''));
    if(!y){alert('4桁の西暦を入力してください');return false;}
    if(isCurrentRegistered(y)){alert(y+'年は既に存在します');return false;}
    try{
      promoteCurrent(y);
      var list=store.years.map(String),index=list.indexOf(y);
      if(typeof baseYear!=='undefined')baseYear=typeof baseYear==='number'?Number(y):y;
      if(typeof cmpYear!=='undefined')cmpYear=index>0?list[index-1]:null;
      var wrap=document.getElementById('addYearInlineWrap');if(wrap)wrap.innerHTML='';
      if(typeof renderYearPills==='function')renderYearPills();
      if(typeof currentNav!=='undefined'&&currentNav===1&&typeof refreshDash==='function')refreshDash();
      if(typeof showToast==='function')showToast('✓ '+y+'年度を追加しました','#15803d','#f0fdf4');
      return true;
    }catch(error){
      alert('年度を追加できませんでした。\n'+(error&&error.message?error.message:error));
      return false;
    }
  };
  root.addYear.__insightYearManager=true;
})(typeof window!=='undefined'?window:globalThis);
