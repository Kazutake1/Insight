/* Year controls layout v1: move fiscal-year management to Settings and inline dashboard month buttons. */
(function(root){
  'use strict';
  if(root.InsightYearControlsLayout)return;
  if(!root.document)return;
  var doc=root.document,yearRow=null,state={moved:false,monthsInline:false};

  var style=doc.createElement('style');
  style.id='insightYearControlsLayoutStyle';
  style.textContent=[
    '#insightSettingsYearActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '#insightSettingsYearActions>button{margin:0!important}',
    '#insightSettingsYearInlineHost:empty{display:none}',
    '#insightSettingsYearInlineHost:not(:empty){margin-top:10px}',
    '#pageDash .insight-dashboard-year-row{flex-wrap:wrap!important}',
    '#pageDash .insight-dashboard-inline-months{display:contents!important}',
    '#pageDash .insight-dashboard-inline-months>button{background:#fff!important;color:#1a1a1a!important}',
    '#pageDash .insight-dashboard-inline-months>button:first-child{margin-left:12px!important}',
    '#pageDash .insight-dashboard-inline-months>button.insight-dashboard-selected-month{border-color:#000!important;color:#1a1a1a!important}'
  ].join('');
  doc.head.appendChild(style);

  function normalized(node){return String(node&&node.textContent||'').replace(/\s+/g,' ').trim();}
  function buttons(container){return container?Array.prototype.slice.call(container.querySelectorAll('button')):[];}
  function findButton(container,pattern){return buttons(container).find(function(button){return pattern.test(normalized(button));})||null;}
  function directMonthButtons(node){
    if(!node)return [];
    return Array.prototype.filter.call(node.children,function(child){
      return child&&child.tagName==='BUTTON'&&/^(?:[1-9]|1[0-2])月$/.test(normalized(child));
    });
  }
  function isMonthRow(node){
    var list=directMonthButtons(node);
    return list.length===12&&list.every(function(button,index){return normalized(button)===String(index+1)+'月';});
  }
  function selectedMonthLabel(){
    try{return typeof selMonth!=='undefined'?String(selMonth):'';}catch(_){return '';}
  }
  function syncSelectedMonth(node){
    var selected=selectedMonthLabel();
    directMonthButtons(node).forEach(function(button){
      button.classList.toggle('insight-dashboard-selected-month',normalized(button)===selected);
    });
  }
  function findMonthRow(dash,row){
    if(row){
      var own=Array.prototype.find.call(row.children,function(child){return isMonthRow(child);});
      if(own)return own;
      var parent=row.parentElement;
      if(parent){
        var sibling=Array.prototype.find.call(parent.children,function(child){return child!==row&&isMonthRow(child);});
        if(sibling)return sibling;
      }
    }
    var nodes=dash?dash.querySelectorAll('*'):[];
    for(var i=0;i<nodes.length;i++)if(isMonthRow(nodes[i]))return nodes[i];
    return null;
  }
  function findYearRow(dash,addButton,monthRow){
    if(yearRow&&yearRow.isConnected&&dash.contains(yearRow))return yearRow;
    var tagged=dash.querySelector('.insight-dashboard-year-row');
    if(tagged)return tagged;
    if(addButton&&dash.contains(addButton))return addButton.parentElement;
    var parent=monthRow&&monthRow.parentElement;
    if(parent){
      var candidates=Array.prototype.slice.call(parent.children);
      for(var i=0;i<candidates.length;i++){
        var node=candidates[i];
        if(node===monthRow)continue;
        if(node.querySelectorAll('select').length>=2&&normalized(node).indexOf('基準年')>=0&&normalized(node).indexOf('比較年')>=0)return node;
      }
    }
    return null;
  }
  function ensureSettingsSection(){
    var content=doc.querySelector('#pageSettings .insight-settings-content');
    if(!content)return null;
    var section=doc.getElementById('insightSettingsYearSection');
    if(section)return section;
    section=doc.createElement('section');
    section.id='insightSettingsYearSection';
    section.className='insight-settings-section';
    section.innerHTML='<h2>年度管理</h2><div id="insightSettingsYearActions"></div><div id="insightSettingsYearInlineHost"></div>';
    content.insertBefore(section,content.firstElementChild||null);
    return section;
  }
  function apply(){
    var dash=doc.getElementById('pageDash'),section=ensureSettingsSection();
    if(!dash||!section){state={moved:false,monthsInline:false};return false;}
    var actions=section.querySelector('#insightSettingsYearActions');
    var inlineHost=section.querySelector('#insightSettingsYearInlineHost');
    var addButton=findButton(dash,/年度追加/)||findButton(section,/年度追加/)||findButton(doc,/年度追加/);
    var monthRow=findMonthRow(dash,yearRow);
    var row=findYearRow(dash,addButton,monthRow);

    if(row){
      yearRow=row;
      yearRow.classList.add('insight-dashboard-year-row');
      monthRow=findMonthRow(dash,yearRow);
      if(monthRow){
        monthRow.classList.add('insight-dashboard-inline-months');
        if(monthRow.parentElement!==yearRow)yearRow.appendChild(monthRow);
        syncSelectedMonth(monthRow);
      }
    }

    if(addButton&&addButton.parentElement!==actions)actions.appendChild(addButton);
    var deleteButton=doc.getElementById('insightDeleteYearButton');
    if(deleteButton&&deleteButton.parentElement!==actions)actions.appendChild(deleteButton);
    var addWrap=doc.getElementById('addYearInlineWrap');
    if(addWrap&&addWrap.parentElement!==inlineHost)inlineHost.appendChild(addWrap);

    state={
      moved:!!(addButton&&actions.contains(addButton)&&deleteButton&&actions.contains(deleteButton)),
      monthsInline:!!(yearRow&&monthRow&&monthRow.parentElement===yearRow&&directMonthButtons(monthRow).length===12)
    };
    return state.moved&&state.monthsInline;
  }

  var queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    var run=function(){queued=false;apply();};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else setTimeout(run,0);
  }
  root.InsightYearControlsLayout={
    refresh:apply,
    getState:function(){return {moved:state.moved,monthsInline:state.monthsInline};}
  };
  function init(){
    doc.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('.insight-dashboard-inline-months>button'):null;
      if(button)setTimeout(schedule,0);
    });
    schedule();
    var main=doc.getElementById('main')||doc.body;
    if(main&&typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
