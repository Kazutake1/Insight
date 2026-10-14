/* Date navigation parity for sales, customers, waste and sales-count input pages. */
(function(root){
  'use strict';
  if(root.InsightInputDayNav)return;
  var doc=root.document,context=root.InsightDateContext;
  if(!doc||!context)return;
  var specs=[
    {key:'sales',page:'pageSales',label:'売上',kind:'legacy',dayKey:'salesSelDay'},
    {key:'kyaku',page:'pageKyaku',label:'客数',kind:'legacy'},
    {key:'haiki',page:'pageHaiki',label:'廃棄',kind:'legacy',dayKey:'haikiSelDay'},
    {key:'salesCounts',page:'pageSalesCount',label:'販売数',kind:'count'}
  ];
  var selected={},dirty={},applied={},weekday=['日','月','火','水','木','金','土'];
  function period(spec){
    if(spec.kind==='count'){
      var count=root.InsightSalesCount;
      return count&&typeof count.getPeriod==='function'?count.getPeriod():null;
    }
    try{
      var y=Number(editYear[spec.key]),m=root.InsightInputPeriodControls.monthNumber(editMonth[spec.key]);
      return Number.isInteger(y)&&m?{year:y,month:m}:null;
    }catch(_){return null;}
  }
  function dateFor(spec){
    var p=period(spec);
    if(!p)return null;
    var prev=selected[spec.key],max=new Date(Number(p.year),Number(p.month),0).getDate();
    if(prev&&prev.getFullYear()===Number(p.year)&&prev.getMonth()+1===Number(p.month))return new Date(prev.getFullYear(),prev.getMonth(),Math.min(prev.getDate(),max));
    var target=root.InsightPagePeriodSync&&root.InsightPagePeriodSync.getTarget?root.InsightPagePeriodSync.getTarget():null;
    var now=new Date(),day=1;
    if(target&&Number(target.year)===Number(p.year)&&Number(target.month)===Number(p.month)&&Number.isInteger(Number(target.day))&&Number(target.day)>0)day=Number(target.day);
    // For a newly opened current-month input page, prefer today over the legacy
    // salesSelDay/haikiSelDay default (1). Explicit user selections are above.
    else if(now.getFullYear()===Number(p.year)&&now.getMonth()+1===Number(p.month))day=now.getDate();
    else if(spec.dayKey&&Number.isInteger(Number(root[spec.dayKey]))&&Number(root[spec.dayKey])>0)day=Number(root[spec.dayKey]);
    return new Date(Number(p.year),Number(p.month)-1,Math.min(day,max));
  }
  function label(date){return date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日（'+weekday[date.getDay()]+'）';}
  function nav(spec){return doc.getElementById('insightDayNav-'+spec.key);}
  function ensure(spec){
    var page=doc.getElementById(spec.page);
    if(!page)return null;
    var element=nav(spec);
    if(element&&element.isConnected)return element;
    var header=page.querySelector('.page-header');
    var toolbar=spec.kind==='count'?page.querySelector('.sc-toolbar'):page.querySelector('.insight-input-period-toolbar');
    if(!header||!toolbar)return null;
    element=doc.createElement('div');
    element.id='insightDayNav-'+spec.key;
    element.className='quick-nav-row insight-shared-day-nav';
    element.setAttribute('aria-label',spec.label+'入力の日付切り替え');
    element.innerHTML='<button type="button" class="iqd-btn iqd-arrow" data-day-prev aria-label="前日へ">‹</button>'+
      '<div class="iqd-btn iqd-date">'+
        '<svg class="iqd-date-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></svg>'+
        '<div class="iqd-date-text"><span class="iqd-date-main"></span><span class="iqd-date-sub">タップして日付を選択</span></div>'+
        '<input class="iqd-date-input" type="date" aria-label="'+spec.label+'入力の日付を選択">'+
      '</div>'+
      '<button type="button" class="iqd-btn iqd-arrow" data-day-next aria-label="翌日へ">›</button>'+
      '<button type="button" class="iqd-btn iqd-today" data-day-today>今日に戻る</button>';
    if(spec.kind==='count')toolbar.insertBefore(element,toolbar.firstChild);
    else header.insertAdjacentElement('afterend',element);
    page.classList.add('insight-has-day-nav');
    element.querySelector('[data-day-prev]').addEventListener('click',function(){var d=dateFor(spec);if(d)go(spec,new Date(d.getFullYear(),d.getMonth(),d.getDate()-1));});
    element.querySelector('[data-day-next]').addEventListener('click',function(){var d=dateFor(spec);if(d)go(spec,new Date(d.getFullYear(),d.getMonth(),d.getDate()+1));});
    element.querySelector('[data-day-today]').addEventListener('click',function(){go(spec,new Date());});
    element.querySelector('.iqd-date-input').addEventListener('change',function(){
      var d=context.parseIso(this.value);
      if(d)go(spec,d,true);
      this.value=context.iso(dateFor(spec));
    });
    return element;
  }
  function update(spec){
    var element=ensure(spec),date=dateFor(spec);
    if(!element||!date)return;
    selected[spec.key]=date;
    element.querySelector('.iqd-date-main').textContent=label(date);
    element.querySelector('.iqd-date-input').value=context.iso(date);
  }
  function focusDate(spec,date,scroll){
    if(spec.key==='sales'||spec.key==='haiki'){
      var current=spec.key==='sales'?'sales':'haiki',p=period(spec);
      root[spec.dayKey]=date.getDate();
      if(!p)return;
      var mi=date.getMonth();
      try{
        if(current==='sales'&&typeof renderSalesDayList==='function'){
          renderSalesDayList(String(p.year),mi);renderSalesForm(String(p.year),mi,date.getDate());
        }
        if(current==='haiki'&&typeof renderHaikiDayList==='function'){
          renderHaikiDayList(String(p.year),mi);renderHaikiForm(String(p.year),mi,date.getDate());
        }
      }catch(_){}
      if(scroll){
        var list=doc.getElementById(current==='sales'?'salesDayList':'haikiDayList');
        var button=list&&list.querySelectorAll('.haiki-day-btn')[date.getDate()-1];
        if(button&&button.scrollIntoView)button.scrollIntoView({block:'nearest',inline:'nearest'});
      }
      return;
    }
    var container=doc.getElementById(spec.key==='kyaku'?'kyakuGrid':'scCalendar');
    if(!container)return;
    var cards=container.querySelectorAll(spec.key==='kyaku'?'.kyaku-day-card:not(.empty)':
      '.sc-day:not(.empty)');
    var chosen=cards[date.getDate()-1],outlined=chosen;
    if(spec.kind==='count'){
      // Keep date navigation and scrolling tied to the selected day.
      // The sales-count outline itself always marks today, and only in this month.
      var today=new Date();
      outlined=date.getFullYear()===today.getFullYear()&&date.getMonth()===today.getMonth()?
        cards[today.getDate()-1]:null;
    }
    cards.forEach(function(card){card.classList.toggle('insight-day-selected',!!outlined&&card===outlined);});
    if(scroll&&chosen&&chosen.scrollIntoView)chosen.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function sync(spec){
    var p=period(spec),element=ensure(spec);
    if(!p||!element)return;
    var date=dateFor(spec),mark=String(p.year)+'-'+String(p.month)+'-'+date.getDate();
    update(spec);
    if(applied[spec.key]!==mark){
      applied[spec.key]=mark;
      focusDate(spec,date,false);
    }else if(spec.key==='kyaku'||spec.kind==='count')focusDate(spec,date,false);
  }
  function go(spec,date,preservePicker){
    if(!date||!Number.isFinite(date.getTime()))return false;
    var current=dateFor(spec),p=period(spec);
    if(!p||!current||context.iso(current)===context.iso(date))return false;
    var crossing=Number(p.year)!==date.getFullYear()||Number(p.month)!==date.getMonth()+1;
    if(crossing&&spec.kind==='legacy'&&dirty[spec.key]&&
      !root.confirm('未保存の入力があります。\n保存せずに別の日付へ移動しますか？'))return false;
    if(crossing){
      var oldDay=spec.dayKey?root[spec.dayKey]:null;
      if(spec.dayKey)root[spec.dayKey]=date.getDate();
      var ok=spec.kind==='count'?
        root.InsightSalesCount.setPeriod(date.getFullYear(),date.getMonth()+1):
        root.InsightInputPeriodControls.apply({type:spec.key,label:spec.label},date.getFullYear(),date.getMonth()+1);
      if(!ok){
        if(spec.dayKey)root[spec.dayKey]=oldDay;
        return false;
      }
      dirty[spec.key]=false;
    }
    selected[spec.key]=new Date(date.getFullYear(),date.getMonth(),date.getDate());
    if(root.InsightPagePeriodSync&&typeof root.InsightPagePeriodSync.setTarget==='function')
      root.InsightPagePeriodSync.setTarget({year:date.getFullYear(),month:date.getMonth()+1,day:date.getDate(),source:'inputDayNav'});
    focusDate(spec,date,true);
    applied[spec.key]=date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();
    if(preservePicker){
      var element=ensure(spec);
      element.querySelector('.iqd-date-main').textContent=label(date);
      element.querySelector('.iqd-date-input').value=context.iso(date);
    }else update(spec);
    return true;
  }
  function currentSpec(node){
    return specs.find(function(spec){return node.closest&&node.closest('#'+spec.page);})||null;
  }
  function install(){
    specs.forEach(sync);
    doc.addEventListener('input',function(e){
      var spec=currentSpec(e.target);
      if(spec&&spec.kind==='legacy'&&!e.target.closest('.insight-shared-day-nav'))dirty[spec.key]=true;
    },true);
    doc.addEventListener('click',function(e){
      var target=e.target&&e.target.closest?e.target.closest('button,input'):null;
      if(!target)return;
      var spec=currentSpec(target);
      if(!spec)return;
      if(spec.kind==='legacy'){
        if(target.matches('#salesSaveBtn,#kyakuSaveBtn,#haikiSaveBtn'))dirty[spec.key]=false;
        if(target.matches('.wx-btn'))dirty[spec.key]=true;
        var list=target.closest('#salesDayList .haiki-day-btn,#haikiDayList .haiki-day-btn');
        if(list){
          var index=Array.prototype.indexOf.call(list.parentNode.children,list);
          var p=period(spec);
          if(p&&index>=0){
            selected[spec.key]=new Date(Number(p.year),Number(p.month)-1,index+1);
            update(spec);
            applied[spec.key]=String(p.year)+'-'+String(p.month)+'-'+(index+1);
          }
        }
      }
    });
    var delayed=function(){root.requestAnimationFrame(function(){specs.forEach(sync);});};
    ['nav0','nav1','nav2','nav3','nav4','navSalesCount','storeSel'].forEach(function(id){
      var node=doc.getElementById(id);if(node)node.addEventListener('click',delayed);
    });
    if(root.InsightHooks)root.InsightHooks.on('input:table:after','shared-input-day-nav',delayed,85);
    root.addEventListener('insight:sales-count-period-change',delayed);
    ['kyakuGrid','scCalendar'].forEach(function(id){
      var node=doc.getElementById(id);
      if(node&&root.MutationObserver){
        new MutationObserver(function(){var spec=specs.find(function(c){return c.key===(id==='kyakuGrid'?'kyaku':'salesCounts');});if(spec)sync(spec);})
          .observe(node,{childList:true});
      }
    });
    delayed();
  }
  root.InsightInputDayNav={VERSION:1,select:function(type,iso){
    var spec=specs.find(function(s){return s.key===type;}),date=context.parseIso(iso);
    return !!(spec&&date&&go(spec,date));
  },getSelectedIso:function(type){var spec=specs.find(function(s){return s.key===type;}),date=spec&&dateFor(spec);return date?context.iso(date):null;}};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install);
  else root.setTimeout(install,0);
})(typeof window!=='undefined'?window:globalThis);
