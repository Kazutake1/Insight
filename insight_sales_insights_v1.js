/* 売上入力ページ専用：前年同月比較と入力済日の平均売上。 */
(function(){
  'use strict';
  if(window.__insightSalesInsightsV1)return;
  window.__insightSalesInsightsV1=true;
  var page=document.getElementById('pageSales');
  if(!page)return;



  function numeric(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function label(id,value,cls){
    var node=document.getElementById(id);
    if(!node)return;
    node.textContent=value;
    node.classList.remove('up','down');
    if(cls)node.classList.add(cls);
  }
  function mount(){
    var table=page.querySelector('.table-card');
    if(!table)return false;
    if(document.getElementById('issRow'))return true;
    var row=document.createElement('div');
    row.id='issRow';
    row.innerHTML='<section class="iss-card" aria-label="前年同月比較"><div class="iss-title">前年同月比較</div><div class="iss-stats"><div class="iss-stat"><span>売上前年比</span><strong id="issYoy">—</strong></div><div class="iss-stat"><span>入力済日数</span><strong id="issDays">—</strong></div><div class="iss-stat"><span>平均売上差</span><strong id="issAvgDiff">—</strong></div></div><div class="iss-note" id="issCompareNote"></div></section>';
    table.parentNode.insertBefore(row,table);
    return true;
  }
  function syncChartSummary(){
    var chartTotal=document.getElementById('salesChartTotal');
    if(!chartTotal||typeof drafts==='undefined'||!Array.isArray(drafts.sales))return;
    var total=0,filled=0;
    drafts.sales.forEach(function(row){
      var value=numeric(row&&row.売上);
      total+=value;
      if(value>0)filled++;
    });
    var totalValue=chartTotal.querySelector('.haiki-chart-total-val');
    if(totalValue)totalValue.textContent=total.toLocaleString('ja-JP')+'千円';
    var average=chartTotal.querySelector('#issDailyAverage');
    if(!average){
      average=document.createElement('div');
      average.id='issDailyAverage';
      chartTotal.appendChild(average);
    }
    average.textContent='入力済日の平均 '+(filled?Math.round(total/filled).toLocaleString('ja-JP'):'-')+'千円/日';
  }
  function refresh(){
    if(!mount()||typeof store==='undefined'||typeof editYear==='undefined'||typeof editMonth==='undefined'||typeof drafts==='undefined')return;
    var year=String(editYear.sales||''),month=editMonth.sales||'',mi=typeof MONTHS!=='undefined'?MONTHS.indexOf(month):-1;
    if(!year||mi<0)return;
    var rows=Array.isArray(drafts.sales)?drafts.sales:[];
    var days=rows.length||(typeof DAYS_IN_MONTH!=='undefined'?DAYS_IN_MONTH[mi]:0);
    var entered=0,compared=0,nowSum=0,oldSum=0,prevYear=String(Number(year)-1);
    var prior=store.data&&store.data[prevYear]&&store.data[prevYear][month];
    var prevByDay={};
    if(Array.isArray(prior))prior.forEach(function(r,i){if(r)prevByDay[Number(r.d)||i+1]=numeric(r.売上);});
    rows.forEach(function(r,i){
      if(!r)return;
      var value=numeric(r.売上),day=Number(r.d)||i+1;
      if(!value||day<1||day>days)return;
      entered++;
      if(Object.prototype.hasOwnProperty.call(prevByDay,day)&&prevByDay[day]>0){
        compared++;nowSum+=value;oldSum+=prevByDay[day];
      }
    });
    label('issDays',entered+' / '+days+'日');
    if(compared&&oldSum>0){
      var pct=(nowSum/oldSum-1)*100,diff=(nowSum-oldSum)/compared;
      label('issYoy',(pct>0?'+':'')+pct.toFixed(1)+'%',pct>0?'up':pct<0?'down':'');
      label('issAvgDiff',(diff>0?'+':'')+diff.toFixed(1)+'千円',diff>0?'up':diff<0?'down':'');
      label('issCompareNote','前年同月の同じ日付・入力済み'+compared+'日で比較');
    }else{
      label('issYoy','—');label('issAvgDiff','—');
      label('issCompareNote',Array.isArray(prior)?'前年と比較できる入力済み日がありません':'前年同月のデータがありません');
    }
    syncChartSummary();
  }

  if(typeof window.refreshSalesLineChart==='function'){
    var originalChart=window.refreshSalesLineChart;
    window.refreshSalesLineChart=function(){
      var result=originalChart.apply(this,arguments);
      syncChartSummary();
      return result;
    };
  }
  if(window.InsightHooks){
    window.InsightHooks.on('input:table:after','sales-insights-table',function(ctx){if(ctx.args[0]==='sales')refresh();},30);
  }
  page.addEventListener('input',function(event){
    if(event.target&&event.target.matches&&event.target.matches('#salesForm input[data-k="売上"]'))refresh();
  });
  if(typeof currentNav!=='undefined'&&currentNav===2)refresh();
})();
