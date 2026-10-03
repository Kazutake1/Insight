/* Input period controls v3: sales-count style navigation for sales, customers and waste pages. */
(function(root){
  'use strict';
  if(root.InsightInputPeriodControls)return;

  function monthNumber(value){
    if(Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12)return Number(value);
    var m=/^(\d{1,2})月$/.exec(String(value||''));
    if(!m)return null;
    var month=Number(m[1]);
    return month>=1&&month<=12?month:null;
  }
  function validYear(value){
    var year=Number(value);
    return Number.isInteger(year)&&year>=1000&&year<=9999?year:null;
  }
  function shiftPeriod(year,month,delta){
    year=validYear(year);month=monthNumber(month);delta=Number(delta);
    if(!year||!month||(delta!==-1&&delta!==1))return null;
    var date=new Date(year,month-1+delta,1);
    return {year:date.getFullYear(),month:date.getMonth()+1};
  }

  var model={
    VERSION:3,
    monthNumber:monthNumber,
    validYear:validYear,
    shiftPeriod:shiftPeriod,
    adjacentPeriod:shiftPeriod
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightInputPeriodControls=model;
  root.InsightSalesPeriodSelector=model;
  if(!root.document)return;

  var doc=root.document;
  var configs=[
    {type:'sales',pageId:'pageSales',yearId:'salesYearRow',monthId:'salesMonthTabs',label:'売上'},
    {type:'kyaku',pageId:'pageKyaku',yearId:'kyakuYearRow',monthId:'kyakuMonthTabs',label:'客数'},
    {type:'haiki',pageId:'pageHaiki',yearId:'haikiYearRow',monthId:'haikiMonthTabs',label:'廃棄'}
  ];

  var css=doc.createElement('style');
  css.id='insightInputPeriodControlsStyle';
  css.textContent='.insight-input-period-toolbar{margin-bottom:10px}';
  doc.head.appendChild(css);

  function currentStore(){
    try{return typeof allStores!=='undefined'&&allStores&&allStores.stores?allStores.stores[allStores.current]:null;}catch(_){return null;}
  }
  function registered(year){
    if(root.InsightYearManager&&typeof root.InsightYearManager.isCurrentRegistered==='function'){
      return root.InsightYearManager.isCurrentRegistered(String(year));
    }
    var st=currentStore();
    return !!(st&&Array.isArray(st.years)&&st.years.some(function(value){return String(value)===String(year);}));
  }
  function ensureRegisteredYear(year,label){
    var y=String(year);
    if(registered(y))return true;
    if(!root.InsightYearManager||typeof root.InsightYearManager.promoteCurrent!=='function'){
      alert('この年度を追加する機能を使用できません。');return false;
    }
    if(!confirm(y+'年度はダッシュボードに登録されていません。\n年度を追加して'+label+'を入力しますか？\n\n既にある過去データは保持したまま、未入力日を正常な空データで補完します。'))return false;
    try{
      root.InsightYearManager.promoteCurrent(y);
      try{store=allStores.stores[allStores.current];}catch(_){}
      if(typeof renderYearPills==='function')renderYearPills();
      if(typeof showToast==='function')showToast('✓ '+y+'年度を追加しました','#15803d','#f0fdf4');
      return true;
    }catch(error){
      alert('年度を追加できませんでした。\n'+(error&&error.message?error.message:error));
      return false;
    }
  }
  function period(config){
    try{
      var year=validYear(editYear&&editYear[config.type]),month=monthNumber(editMonth&&editMonth[config.type]);
      return year&&month?{year:year,month:month}:null;
    }catch(_){return null;}
  }
  function monthLabel(month){
    try{if(typeof MONTHS!=='undefined'&&Array.isArray(MONTHS)&&MONTHS[month-1])return MONTHS[month-1];}catch(_){}
    return String(month)+'月';
  }
  function removeLegacyPlaceholders(config){
    [config.yearId,config.monthId].forEach(function(id){
      var node=doc.getElementById(id);
      if(node)node.remove();
    });
  }
  function ensureToolbar(config){
    var page=doc.getElementById(config.pageId);if(!page)return null;
    var id='insightInputPeriodToolbar-'+config.type,toolbar=doc.getElementById(id);
    if(toolbar&&toolbar.isConnected)return toolbar;
    var header=page.querySelector(':scope > .page-header')||page.querySelector('.page-header');
    if(!header)return null;
    toolbar=doc.createElement('div');
    toolbar.id=id;
    toolbar.className='sc-toolbar insight-input-period-toolbar';
    toolbar.setAttribute('aria-label',config.label+'入力の対象年月');
    toolbar.innerHTML='<button type="button" data-period-prev>‹ 前月</button><strong data-period-current></strong><button type="button" data-period-next>翌月 ›</button>';
    toolbar.querySelector('[data-period-prev]').addEventListener('click',function(){change(config,-1);});
    toolbar.querySelector('[data-period-next]').addEventListener('click',function(){change(config,1);});
    header.insertAdjacentElement('afterend',toolbar);
    return toolbar;
  }
  function syncConfig(config){
    removeLegacyPlaceholders(config);
    var toolbar=ensureToolbar(config),value=period(config);
    if(!toolbar||!value)return;
    toolbar.querySelector('[data-period-current]').textContent=String(value.year)+'年 '+String(value.month)+'月';
  }
  function syncAll(){configs.forEach(syncConfig);}

  function apply(config,year,month){
    year=validYear(year);month=monthNumber(month);
    if(!year||!month)return false;
    if(!ensureRegisteredYear(year,config.label))return false;
    try{
      if(root.InsightPagePeriodSync&&typeof root.InsightPagePeriodSync.setTarget==='function'&&typeof root.InsightPagePeriodSync.syncCurrentPage==='function'){
        root.InsightPagePeriodSync.setTarget({year:year,month:month,source:'inputPeriodControls'});
        root.InsightPagePeriodSync.syncCurrentPage();
      }else{
        editYear[config.type]=typeof editYear[config.type]==='number'?year:String(year);
        editMonth[config.type]=monthLabel(month);
        if(typeof initInputPage==='function')initInputPage(config.type);
      }
      syncConfig(config);
      return true;
    }catch(_){return false;}
  }
  function change(config,delta){
    var value=period(config),next=value&&shiftPeriod(value.year,value.month,delta);
    return !!(next&&apply(config,next.year,next.month));
  }

  if(root.InsightHooks){
    root.InsightHooks.on('input:table:after','input-period-controls',function(ctx){
      var type=ctx.args[0];
      var config=configs.find(function(item){return item.type===type;});
      if(config)syncConfig(config);
    },60);
  }

  model.apply=apply;
  model.change=change;
  model.sync=syncAll;
  model.configs=configs.map(function(config){return {type:config.type,pageId:config.pageId,label:config.label};});

  syncAll();
})(typeof window!=='undefined'?window:globalThis);
