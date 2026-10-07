/* Read-only persisted data health checker v1. */
(function(root){
  'use strict';
  if(root.InsightDataHealth)return;

  var MONTH_NAMES=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function validYear(value){return /^\d{4}$/.test(String(value||''));}
  function validDate(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    var y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
    var date=new Date(0);date.setFullYear(y,m-1,d);date.setHours(12,0,0,0);
    if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return null;
    return {year:String(y),month:m,day:d};
  }
  function expectedDays(year,monthIndex){return new Date(Number(year),monthIndex+1,0).getDate();}
  function own(target,key){return Object.prototype.hasOwnProperty.call(target,key);}
  function issue(list,severity,code,storeId,storeName,year,message){
    list.push({severity:severity,code:code,storeId:storeId||null,storeName:storeName||'',year:year||null,message:message});
  }
  function countNullRows(yearData){
    if(!object(yearData))return 0;
    var count=0;
    Object.keys(yearData).forEach(function(month){
      var rows=yearData[month];
      if(Array.isArray(rows))rows.forEach(function(row){if(!object(row))count++;});
    });
    return count;
  }
  function dateYearCounts(container,registered,kind,issues,storeId,storeName){
    if(container===undefined)return;
    if(!object(container)){issue(issues,'error',kind+'_container',storeId,storeName,null,kind==='sales'?'販売数データの保存形式が不正です。':'時間帯別客数データの保存形式が不正です。');return;}
    var orphan={},invalid=0,shape=0;
    Object.keys(container).forEach(function(key){
      var parsed=validDate(key);
      if(!parsed){invalid++;return;}
      if(!registered.has(parsed.year))orphan[parsed.year]=(orphan[parsed.year]||0)+1;
      if(kind==='hourly'){
        var hours=container[key];
        if(!Array.isArray(hours)||hours.length!==24||hours.some(function(v){return v!==null&&(!Number.isSafeInteger(v)||v<0);}))shape++;
      }else if(!object(container[key]))shape++;
    });
    if(invalid)issue(issues,'error',kind+'_invalid_date',storeId,storeName,null,(kind==='sales'?'販売数':'時間帯別客数')+'に不正な日付キーが'+invalid+'件あります。');
    Object.keys(orphan).sort().forEach(function(year){
      issue(issues,'warning',kind+'_unregistered_year',storeId,storeName,year,(kind==='sales'?'販売数':'時間帯別客数')+'に、正式登録されていない'+year+'年度のデータが'+orphan[year]+'日分あります。');
    });
    if(shape)issue(issues,'error',kind+'_invalid_shape',storeId,storeName,null,(kind==='sales'?'販売数':'時間帯別客数')+'のデータ形式が不正な日付が'+shape+'件あります。');
  }

  function check(snapshot){
    var issues=[];
    if(!object(snapshot)){issue(issues,'error','root','', '',null,'保存データ全体の形式が不正です。');return finish(issues,0);}
    if(!object(snapshot.stores)||!Object.keys(snapshot.stores).length){issue(issues,'error','stores','', '',null,'店舗データがありません。');return finish(issues,0);}
    if(typeof snapshot.current!=='string'||!snapshot.stores[snapshot.current])issue(issues,'error','current','', '',null,'現在店舗の参照が不正です。');

    var storeCount=0;
    Object.keys(snapshot.stores).forEach(function(storeId){
      storeCount++;
      var store=snapshot.stores[storeId],name=object(store)&&typeof store.name==='string'?store.name:storeId;
      if(!object(store)){issue(issues,'error','store',storeId,name,null,'店舗データの形式が不正です。');return;}
      var rawYears=Array.isArray(store.years)?store.years.map(String):[];
      if(!rawYears.length)issue(issues,'error','years_empty',storeId,name,null,'正式年度が登録されていません。');
      var invalidYears=rawYears.filter(function(y){return !validYear(y);});
      if(invalidYears.length)issue(issues,'error','years_invalid',storeId,name,null,'年度一覧に4桁ではない年度があります。');
      var unique=new Set(rawYears);
      if(unique.size!==rawYears.length)issue(issues,'error','years_duplicate',storeId,name,null,'年度一覧に重複があります。');
      var registered=new Set(rawYears.filter(validYear));

      if(!object(store.data)){
        issue(issues,'error','data_container',storeId,name,null,'日別データの保存形式が不正です。');
      }else{
        registered.forEach(function(year){
          var yd=store.data[year];
          if(!object(yd)){issue(issues,'error','registered_year_missing',storeId,name,year,year+'年度の日別データがありません。');return;}
          MONTH_NAMES.forEach(function(month,mi){
            var rows=yd[month],expected=expectedDays(year,mi);
            if(!Array.isArray(rows)){issue(issues,'error','month_missing',storeId,name,year,year+'年'+month+'の日別データがありません。');return;}
            if(rows.length!==expected)issue(issues,'error','month_length',storeId,name,year,year+'年'+month+'の日数が'+rows.length+'件で、期待値'+expected+'件と一致しません。');
            var invalidRows=0,dateMismatch=0;
            rows.forEach(function(row,index){
              if(!object(row)){invalidRows++;return;}
              if(row.d!==undefined&&Number(row.d)!==index+1)dateMismatch++;
            });
            if(invalidRows)issue(issues,'error','daily_invalid',storeId,name,year,year+'年'+month+'にnullまたは不正な日別データが'+invalidRows+'件あります。');
            if(dateMismatch)issue(issues,'error','daily_date_mismatch',storeId,name,year,year+'年'+month+'に日付番号の不整合が'+dateMismatch+'件あります。');
          });
        });
        Object.keys(store.data).filter(function(y){return validYear(y)&&!registered.has(String(y));}).sort().forEach(function(year){
          var nullRows=countNullRows(store.data[year]);
          var suffix=nullRows?'（null／不正行 '+nullRows+'件を含む）':'';
          issue(issues,'warning','orphan_data_year',storeId,name,year,'正式年度一覧にない'+year+'年度の日別データが内部に残っています。'+suffix);
        });
      }

      if(store.monthlyOps!==undefined){
        if(!object(store.monthlyOps))issue(issues,'error','monthly_ops_container',storeId,name,null,'月次データの保存形式が不正です。');
        else Object.keys(store.monthlyOps).filter(function(y){return validYear(y)&&!registered.has(String(y));}).sort().forEach(function(year){
          issue(issues,'warning','monthly_ops_unregistered_year',storeId,name,year,'正式年度一覧にない'+year+'年度の月次データが内部に残っています。');
        });
      }

      dateYearCounts(store.salesCounts,registered,'sales',issues,storeId,name);
      dateYearCounts(store.hourlyCustomers,registered,'hourly',issues,storeId,name);
    });
    return finish(issues,storeCount);
  }

  function finish(issues,storeCount){
    var errors=issues.filter(function(item){return item.severity==='error';}).length;
    var warnings=issues.filter(function(item){return item.severity==='warning';}).length;
    return {
      ok:issues.length===0,
      status:errors?'error':warnings?'warning':'ok',
      issues:issues,
      counts:{errors:errors,warnings:warnings,total:issues.length,stores:storeCount}
    };
  }

  var model={check:check,validDate:validDate,expectedDays:expectedDays};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightDataHealth=model;
  if(!root.document)return;

  var button=null,overlay=null,lastReport=null;
  function snapshot(){try{return typeof allStores!=='undefined'?allStores:null;}catch(_){return null;}}
  function statusText(report){
    if(report.status==='ok')return 'データ状態：正常';
    return 'データ状態：要確認 '+report.counts.total+'件';
  }
  function applyStatusClass(node,report){
    var ok=report.status==='ok';
    node.classList.toggle('insight-health-status-ok',ok);
    node.classList.toggle('insight-health-status-error',!ok);
  }
  function findRestoreAnchor(){
    var nodes=Array.prototype.slice.call(document.querySelectorAll('button,label,a'));
    return nodes.find(function(node){return /データ復元/.test(String(node.textContent||''));})||null;
  }
  function ensureOverlay(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.id='insightDataHealthOverlay';overlay.hidden=true;
    overlay.innerHTML='<div id="insightDataHealthDialog" role="dialog" aria-modal="true" aria-labelledby="insightDataHealthHeading"><h2 id="insightDataHealthHeading">保存データの状態</h2><p id="insightDataHealthSummary"></p><p id="insightDataHealthNote">この確認は読み取り専用です。保存データの修正・削除は行いません。</p><div id="insightDataHealthIssues"></div><div id="insightDataHealthActions"><button type="button" id="insightDataHealthClose">閉じる</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#insightDataHealthClose').onclick=function(){overlay.hidden=true;if(button)button.focus();};
    overlay.addEventListener('click',function(event){if(event.target===overlay)overlay.hidden=true;});
    overlay.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();overlay.hidden=true;}});
  }
  function renderDialog(report){
    ensureOverlay();
    var summary=overlay.querySelector('#insightDataHealthSummary');
    var issues=overlay.querySelector('#insightDataHealthIssues');
    if(report.status==='ok'){
      summary.textContent='構造上の問題は見つかりませんでした。';
      applyStatusClass(summary,report);
      issues.innerHTML='';
      var ok=document.createElement('div');ok.className='insight-health-issue';ok.textContent='正式年度、日別データ、販売数、時間帯別客数の保存構造を確認しました。';
      issues.appendChild(ok);
    }else{
      summary.textContent='要確認：'+report.counts.total+'件（重大 '+report.counts.errors+'件／注意 '+report.counts.warnings+'件）';
      applyStatusClass(summary,report);issues.innerHTML='';
      report.issues.slice(0,100).forEach(function(item){
        var card=document.createElement('div');card.className='insight-health-issue insight-health-'+item.severity;
        var title=document.createElement('strong');
        title.textContent=(item.severity==='error'?'重大':'注意')+(item.storeName?'｜'+item.storeName:'')+(item.year?'｜'+item.year+'年度':'');
        var body=document.createElement('div');body.textContent=item.message;
        card.append(title,body);issues.appendChild(card);
      });
      if(report.issues.length>100){
        var more=document.createElement('div');more.className='insight-health-issue';more.textContent='ほか '+(report.issues.length-100)+'件あります。';issues.appendChild(more);
      }
    }
    overlay.hidden=false;
  }
  function refresh(){
    lastReport=check(snapshot());
    if(button){button.textContent=statusText(lastReport);applyStatusClass(button,lastReport);button.title='保存データの構造チェック結果を表示';}
    return lastReport;
  }
  function open(){var report=refresh();renderDialog(report);return report;}
  function ensureButton(){
    if(button&&button.isConnected)return true;
    var anchor=findRestoreAnchor();if(!anchor)return false;
    button=document.createElement('button');button.type='button';button.id='insightDataHealthButton';
    button.onclick=open;
    anchor.insertAdjacentElement('afterend',button);
    refresh();return true;
  }
  model.refresh=refresh;
  model.open=open;
  model.getLastReport=function(){return lastReport;};
  model.ensureButton=ensureButton;

  function init(){
    if(ensureButton())return;
    var attempts=0,timer=setInterval(function(){attempts++;if(ensureButton()||attempts>=40)clearInterval(timer);},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&button)refresh();});
})(typeof window!=='undefined'?window:globalThis);
