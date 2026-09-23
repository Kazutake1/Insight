(function(){
  function ensureMonthlyOps(year,month){
    var y=String(year!=null?year:(baseYear||""));
    var m=month||selMonth;
    if(!store.monthlyOps)store.monthlyOps={};
    if(!store.monthlyOps[y])store.monthlyOps[y]={};
    if(!store.monthlyOps[y][m])store.monthlyOps[y][m]={laborCostYen:0,grossMarginRate:0};
    return store.monthlyOps[y][m];
  }

  function dailyRow(){
    var fy=todayInfo&&todayInfo.fy?todayInfo.fy:"";
    var m=todayInfo&&todayInfo.month?todayInfo.month:"";
    var rows=store.data&&store.data[fy]&&store.data[fy][m]?store.data[fy][m]:[];
    return rows[quickEditDay-1]||null;
  }

  function formatQuickItems(){
    var input=document.getElementById("qi_買上点数");
    if(!input||input.dataset.insightItemsDecimalBound)return;
    input.dataset.insightItemsDecimalBound="1";
    input.dataset.insightItemsRaw=input.value;
    input.inputMode="decimal";
    input.step="any";
    function format(){
      var raw=input.dataset.insightItemsRaw;
      if(raw===""){input.value="";return;}
      var value=Number(raw);
      if(Number.isFinite(value))input.value=value.toFixed(2);
    }
    input.addEventListener("input",function(){input.dataset.insightItemsRaw=input.value;});
    input.addEventListener("blur",format);
    format();
  }

  function renderDailyOps(){
    var grid=document.getElementById("quickGrid");
    if(!grid||document.getElementById("opsDailyWrap"))return;
    formatQuickItems();
    var r=dailyRow()||{},wrap=document.createElement("div");
    wrap.id="opsDailyWrap";
    wrap.className="quick-section wide";
    var memo=String(r.storeMemo||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    wrap.innerHTML='<div class="qs-title">店舗状況</div><div class="ops-daily-wrap"><div class="ops-field-card" style="grid-column:1/-1"><div class="ops-field-title">店舗メモ</div><textarea id="qi_storeMemo" class="ops-memo" placeholder="例：近隣イベント、大量注文、機器故障など">'+memo+'</textarea></div></div>';
    grid.appendChild(wrap);
  }

  var oldRenderQuick=window.renderQuickPage||renderQuickPage;
  window.renderQuickPage=function(){oldRenderQuick.apply(this,arguments);renderDailyOps();};

  var oldSaveQuick=window.saveQuick||saveQuick;
  window.saveQuick=function(){
    var memoEl=document.getElementById("qi_storeMemo");
    var memo=memoEl?memoEl.value:"";
    var itemsInput=document.getElementById("qi_買上点数");
    if(itemsInput&&itemsInput.dataset.insightItemsDecimalBound){
      itemsInput.value=itemsInput.dataset.insightItemsRaw;
    }
    oldSaveQuick.apply(this,arguments);
    if(itemsInput&&itemsInput.dataset.insightItemsDecimalBound){
      var raw=itemsInput.dataset.insightItemsRaw;
      if(raw!==""&&Number.isFinite(Number(raw)))itemsInput.value=Number(raw).toFixed(2);
    }
    var fy=todayInfo.fy,m=todayInfo.month,rows=store.data[fy][m],ri=quickEditDay-1;
    if(!rows[ri])rows[ri]=blankRow(quickEditDay);
    rows[ri].storeMemo=memo;
    persist();
  };

  function comparisonPct(now,prev){
    now=Number(now)||0;prev=Number(prev)||0;
    if(prev<=0)return null;
    var pct=(now-prev)/prev*100;
    return {up:pct>=0,str:Math.abs(pct).toFixed(1)+"%"};
  }

  function grossMarginPoint(now,prev){
    now=Number(now)||0;prev=Number(prev)||0;
    if(prev<=0)return null;
    var pt=now-prev;
    return {up:pt>=0,str:Math.abs(pt).toFixed(1)+"pt"};
  }

  function createMonthlyKpiCard(type,label,valueHtml,comparison,prevLabel){
    var card=document.createElement("div");
    card.className="kpi-card";
    card.dataset.monthlyOps=type;
    card.title=label+"を編集";
    card.onclick=function(){window.editMonthlyOpsKpi(type);};
    var badge="";
    if(comparison){
      var positive=type==="labor"?!comparison.up:comparison.up;
      badge='<div class="kpi-yoy"><span class="kpi-badge '+(positive?'up':'dn')+'">'+(comparison.up?'▲':'▼')+' '+comparison.str+'</span><span class="kpi-prev">'+prevLabel+'</span></div>';
    }
    card.innerHTML='<div class="kpi-label">'+label+' <span style="font-weight:500;font-size:8.5px;color:var(--text5);">'+selMonth+'</span></div><div class="kpi-value">'+valueHtml+'</div>'+badge;
    return card;
  }

  function renderMonthlyOpsKpis(){
    var row=document.getElementById("kpiRow");
    if(!row)return;
    row.querySelectorAll('[data-monthly-ops]').forEach(function(el){el.remove();});
    var current=ensureMonthlyOps(baseYear,selMonth);
    var prev=(typeof cmpYear!=="undefined"&&cmpYear!=null&&store.monthlyOps&&store.monthlyOps[String(cmpYear)]&&store.monthlyOps[String(cmpYear)][selMonth])?store.monthlyOps[String(cmpYear)][selMonth]:null;
    var labor=Number(current.laborCostYen)||0;
    var gm=Number(current.grossMarginRate)||0;
    var laborCmp=labor>0&&prev?comparisonPct(labor,prev.laborCostYen):null;
    var gmCmp=gm>0&&prev?grossMarginPoint(gm,prev.grossMarginRate):null;
    var prevLabel=(typeof cmpYear!=="undefined"&&cmpYear!=null)?String(cmpYear)+"年比":"前年比";
    row.appendChild(createMonthlyKpiCard("labor","人件費",labor?Math.round(labor/1000).toLocaleString()+'<span class="kpi-unit">千円</span>':'—',laborCmp,prevLabel));
    row.appendChild(createMonthlyKpiCard("grossMargin","粗利率",gm?gm.toFixed(1)+'<span class="kpi-unit">%</span>':'—',gmCmp,prevLabel));
  }

  window.editMonthlyOpsKpi=function(type){
    var d=ensureMonthlyOps(baseYear,selMonth);
    if(type==="labor"){
      var current=Number(d.laborCostYen)||0;
      var entered=window.prompt(baseYear+'年 '+selMonth+'の人件費（円）を入力してください。\n削除する場合は入力欄を空にして「OK」を押してください。',current?String(current):'');
      if(entered===null)return;
      if(String(entered).trim()===''){
        if(!current)return;
        if(!window.confirm(baseYear+'年 '+selMonth+'の人件費データを削除します。\nこの操作は元に戻せません。よろしいですか？'))return;
        delete d.laborCostYen;
        persist();
        renderMonthlyOpsKpis();
        return;
      }
      var labor=parseInt(String(entered).replace(/[,，\s]/g,''),10);
      if(!Number.isFinite(labor)||labor<0){window.alert('人件費は0以上の数字で入力してください。');return;}
      d.laborCostYen=labor;
    }else if(type==="grossMargin"){
      var currentRate=Number(d.grossMarginRate)||0;
      var enteredRate=window.prompt(baseYear+'年 '+selMonth+'の粗利率（%）を入力してください。\n削除する場合は入力欄を空にして「OK」を押してください。',currentRate?String(currentRate):'');
      if(enteredRate===null)return;
      if(String(enteredRate).trim()===''){
        if(!currentRate)return;
        if(!window.confirm(baseYear+'年 '+selMonth+'の粗利率データを削除します。\nこの操作は元に戻せません。よろしいですか？'))return;
        delete d.grossMarginRate;
    }else{return;}
    persist();
    renderMonthlyOpsKpis();
  };

  var oldRefreshDash=window.refreshDash||refreshDash;
  window.refreshDash=function(){oldRefreshDash.apply(this,arguments);renderMonthlyOpsKpis();};

  var oldRenderMonthlyOps=window.renderMonthlyOps;
  window.renderMonthlyOps=function(){renderMonthlyOpsKpis();};

  var oldMonthly=document.getElementById("monthlyOpsCard");
  if(oldMonthly)oldMonthly.remove();
  if(typeof currentNav!=="undefined"&&currentNav===0)renderDailyOps();
  if(typeof currentNav!=="undefined"&&currentNav===1)renderMonthlyOpsKpis();
})();
