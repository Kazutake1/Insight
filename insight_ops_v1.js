(function(){
  function ensureMonthlyOps(){
    if(!store.monthlyOps)store.monthlyOps={};
    var y=String(baseYear||"");
    if(!store.monthlyOps[y])store.monthlyOps[y]={};
    if(!store.monthlyOps[y][selMonth])store.monthlyOps[y][selMonth]={laborCostYen:0,grossMarginRate:0};
    return store.monthlyOps[y][selMonth];
  }
  function dailyRow(){
    var fy=todayInfo&&todayInfo.fy?todayInfo.fy:"";
    var m=todayInfo&&todayInfo.month?todayInfo.month:"";
    var rows=store.data&&store.data[fy]&&store.data[fy][m]?store.data[fy][m]:[];
    return rows[quickEditDay-1]||null;
  }
  function renderDailyOps(){
    var grid=document.getElementById("quickGrid");
    if(!grid||document.getElementById("opsDailyWrap"))return;
    var r=dailyRow()||{},wrap=document.createElement("div");
    wrap.id="opsDailyWrap";
    wrap.className="quick-section wide";
    var memo=String(r.storeMemo||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    var so=r.stockout||"なし";
    wrap.innerHTML='<div class="qs-title">店舗状況</div><div class="ops-daily-wrap"><div class="ops-field-card"><div class="ops-field-title">店舗メモ</div><textarea id="qi_storeMemo" class="ops-memo" placeholder="例：近隣イベント、大量注文、機器故障など">'+memo+'</textarea></div><div class="ops-field-card"><div class="ops-field-title">欠品</div><select id="qi_stockout" class="ops-stockout"><option value="なし">なし</option><option value="少ない">少ない</option><option value="多い">多い</option></select></div></div>';
    grid.appendChild(wrap);
    var sel=document.getElementById("qi_stockout");
    if(sel)sel.value=so;
  }
  var oldRenderQuick=window.renderQuickPage||renderQuickPage;
  window.renderQuickPage=function(){oldRenderQuick.apply(this,arguments);renderDailyOps();};

  var oldSaveQuick=window.saveQuick||saveQuick;
  window.saveQuick=function(){
    var memoEl=document.getElementById("qi_storeMemo"),stockEl=document.getElementById("qi_stockout");
    var memo=memoEl?memoEl.value:"",stock=stockEl?stockEl.value:"なし";
    oldSaveQuick.apply(this,arguments);
    var fy=todayInfo.fy,m=todayInfo.month,rows=store.data[fy][m],ri=quickEditDay-1;
    if(!rows[ri])rows[ri]=blankRow(quickEditDay);
    rows[ri].storeMemo=memo;
    rows[ri].stockout=stock;
    persist();
  };

  function renderMonthlyOps(){
    var anchor=document.querySelector("#pageDash .kpi-row-wrap");
    if(!anchor)return;
    var card=document.getElementById("monthlyOpsCard");
    if(!card){
      card=document.createElement("div");
      card.id="monthlyOpsCard";
      card.className="monthly-ops-card";
      anchor.insertAdjacentElement("afterend",card);
    }
    var d=ensureMonthlyOps(),labor=Number(d.laborCostYen)||0,gm=Number(d.grossMarginRate)||0;
    card.innerHTML='<div class="monthly-ops-title">月次経営データ <span style="font-size:10px;color:var(--text4);font-weight:600">'+baseYear+'年 '+selMonth+'</span></div><label class="monthly-ops-field"><span class="monthly-ops-label">人件費</span><div style="display:flex;align-items:center;gap:5px"><input id="monthlyLaborCost" class="monthly-ops-input" type="text" inputmode="numeric" value="'+(labor?labor.toLocaleString():"")+'" placeholder="0"><span style="font-size:10px;color:var(--text4)">円</span></div></label><label class="monthly-ops-field"><span class="monthly-ops-label">粗利率</span><div style="display:flex;align-items:center;gap:5px"><input id="monthlyGrossMargin" class="monthly-ops-input" type="number" inputmode="decimal" step="0.1" min="0" max="100" value="'+(gm||"")+'" placeholder="0.0"><span style="font-size:10px;color:var(--text4)">%</span></div></label><button class="monthly-ops-save" type="button" onclick="saveMonthlyOpsData()">保存する</button><div id="monthlyOpsSaved" class="monthly-ops-saved"></div>';
    var el=document.getElementById("monthlyLaborCost");
    if(el){
      el.addEventListener("focus",function(){this.value=String(this.value).replace(/,/g,"")});
      el.addEventListener("blur",function(){var n=parseInt(String(this.value).replace(/,/g,""),10)||0;this.value=n?n.toLocaleString():""});
    }
  }
  window.saveMonthlyOpsData=function(){
    var d=ensureMonthlyOps(),l=document.getElementById("monthlyLaborCost"),g=document.getElementById("monthlyGrossMargin");
    var labor=parseInt(String(l&&l.value||"").replace(/,/g,""),10)||0,gm=parseFloat(g&&g.value)||0;
    if(gm<0)gm=0;if(gm>100)gm=100;
    d.laborCostYen=labor;d.grossMarginRate=gm;persist();
    var msg=document.getElementById("monthlyOpsSaved");
    if(msg){msg.textContent="✓ 保存しました";setTimeout(function(){msg.textContent=""},1800);}
    if(l)l.value=labor?labor.toLocaleString():"";
    if(g)g.value=gm||"";
  };
  var oldRefreshDash=window.refreshDash||refreshDash;
  window.refreshDash=function(){oldRefreshDash.apply(this,arguments);renderMonthlyOps();};

  if(typeof currentNav!=="undefined"&&currentNav===0)renderDailyOps();
  if(typeof currentNav!=="undefined"&&currentNav===1)renderMonthlyOps();
})();
