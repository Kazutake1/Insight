(function(){
  function ensureOpsStyle(){
    if(document.getElementById("insightOpsV1Style"))return;
    var style=document.createElement("style");
    style.id="insightOpsV1Style";
    style.textContent='.ops-daily-wrap{margin-top:10px;display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:10px}.ops-field-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px}.ops-field-title{font-size:11px;font-weight:750;color:var(--text3);margin-bottom:6px}.ops-memo{width:100%;min-height:58px;resize:vertical;box-sizing:border-box;border:1px solid var(--border);border-radius:9px;background:var(--input-bg);color:var(--text);padding:8px 9px;font-size:12px;line-height:1.45;font-family:inherit;outline:none}.ops-stockout{width:100%;height:38px;border:1px solid var(--border);border-radius:9px;background:var(--input-bg);color:var(--text);padding:0 8px;font-size:12px;font-weight:700;font-family:inherit;outline:none}.monthly-ops-card{margin:10px 0 12px;padding:12px 14px;border-radius:14px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}.monthly-ops-title{font-size:12px;font-weight:750;color:var(--text);margin-right:4px;align-self:center}.monthly-ops-field{display:flex;flex-direction:column;gap:5px}.monthly-ops-label{font-size:10px;font-weight:700;color:var(--text4)}.monthly-ops-input{width:140px;height:36px;box-sizing:border-box;border:1px solid var(--border);border-radius:9px;background:var(--input-bg);color:var(--text);padding:0 9px;font-size:12px;font-weight:700;font-family:inherit;outline:none}.monthly-ops-save{height:36px;border:0;border-radius:9px;background:var(--text);color:var(--surface);padding:0 14px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer}.monthly-ops-saved{font-size:10px;color:#16a34a;min-width:70px;padding-bottom:8px}@media(max-width:700px){.ops-daily-wrap{grid-template-columns:1fr}.monthly-ops-input{width:120px}}';
    document.head.appendChild(style);
  }
  ensureOpsStyle();

  function ensureMonthlyOps(year,month){
    var y=String(year!=null?year:(baseYear||""));
    var m=month||selMonth;
    if(!store.monthlyOps)store.monthlyOps={};
    if(!store.monthlyOps[y])store.monthlyOps[y]={};
    if(!store.monthlyOps[y][m])store.monthlyOps[y][m]={laborCostYen:0,grossMarginRate:0};
    return store.monthlyOps[y][m];
  }

  function quickDateInfo(){
    return window.InsightDateContext&&typeof window.InsightDateContext.getSelectedInfo==="function"
      ?window.InsightDateContext.getSelectedInfo():null;
  }

  function dailyRow(){
    var info=quickDateInfo();
    if(!info)return null;
    var rows=store.data&&store.data[info.fy]&&store.data[info.fy][info.month]?store.data[info.fy][info.month]:[];
    return rows[info.day-1]||null;
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

  if(window.InsightHooks){
    window.InsightHooks.on('quick:render:after','ops-render-daily',function(){renderDailyOps();},20);
  }

  if(window.InsightHooks){
    window.InsightHooks.on('quick:save:before','ops-save-prepare',function(ctx){
      var memoEl=document.getElementById("qi_storeMemo");
      var itemsInput=document.getElementById("qi_買上点数");
      ctx.state.ops={
        memo:memoEl?memoEl.value:"",
        itemsInput:itemsInput,
        rawItems:itemsInput&&itemsInput.dataset.insightItemsDecimalBound?itemsInput.dataset.insightItemsRaw:null
      };
      if(itemsInput&&itemsInput.dataset.insightItemsDecimalBound)itemsInput.value=itemsInput.dataset.insightItemsRaw;
    },20);
    window.InsightHooks.on('quick:save:after','ops-save-finalize',function(ctx){
      var state=ctx.state.ops||{},itemsInput=state.itemsInput;
      if(itemsInput&&itemsInput.dataset.insightItemsDecimalBound){
        var raw=state.rawItems;
        if(raw!==""&&Number.isFinite(Number(raw)))itemsInput.value=Number(raw).toFixed(2);
      }
      var info=quickDateInfo();
      if(!info)return;
      var fy=info.fy,m=info.month,rows=store.data[fy][m],ri=info.day-1;
      if(!rows[ri])rows[ri]=blankRow(info.day);
      rows[ri].storeMemo=state.memo||"";
      persist();
    },20);
  }

  function monthlyComparisonDisplay(change,kind){
    if(!change)return null;
    var value=kind==="point"?Number(change.point):Number(change.pct);
    if(!Number.isFinite(value))return null;
    return {up:value>=0,str:Math.abs(value).toFixed(1)+(kind==="point"?"pt":"%")};
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
    var labor=Number(current.laborCostYen)||0;
    var gm=Number(current.grossMarginRate)||0;
    var comparison=(window.InsightYearComparison&&typeof window.InsightYearComparison.monthly==="function")
      ?window.InsightYearComparison.monthly(baseYear,selMonth,typeof cmpYear!=="undefined"?cmpYear:null)
      :{laborCostYen:null,grossMarginRate:null};
    var laborCmp=monthlyComparisonDisplay(comparison.laborCostYen,"pct");
    var gmCmp=monthlyComparisonDisplay(comparison.grossMarginRate,"point");
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
        persist();
        renderMonthlyOpsKpis();
        return;
      }
      var gm=parseFloat(String(enteredRate).replace(/[%％\s]/g,''));
      if(!Number.isFinite(gm)||gm<0||gm>100){window.alert('粗利率は0〜100の数字で入力してください。');return;}
      d.grossMarginRate=gm;
    }else{return;}
    persist();
    renderMonthlyOpsKpis();
  };

  if(window.InsightHooks){
    window.InsightHooks.on('dashboard:refresh:after','ops-render-monthly',function(){renderMonthlyOpsKpis();},20);
  }

  var oldRenderMonthlyOps=window.renderMonthlyOps;
  window.renderMonthlyOps=function(){renderMonthlyOpsKpis();};

  var oldMonthly=document.getElementById("monthlyOpsCard");
  if(oldMonthly)oldMonthly.remove();
  if(typeof currentNav!=="undefined"&&currentNav===0)renderDailyOps();
  if(typeof currentNav!=="undefined"&&currentNav===1)renderMonthlyOpsKpis();
})();
