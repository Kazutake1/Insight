/* 客数入力ページ専用：前年同月比較を表示する。 */
(function(){
  'use strict';
  if(window.__insightKyakuInsightsV1)return;
  window.__insightKyakuInsightsV1=true;
  var page=document.getElementById('pageKyaku');
  if(!page)return;
  var css=document.createElement('style');
  css.id='insightKyakuInsightsStyle';
  css.textContent=[
    '#pageKyaku #ikyRow{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;flex:0 0 auto;min-width:0;margin-bottom:10px}',
    '#pageKyaku #ikyRow .iky-card{box-sizing:border-box;min-width:0;border-radius:14px;padding:11px 14px;background:var(--surface);box-shadow:0 2px 10px var(--shadow)}',
    '#pageKyaku #ikyRow .iky-title{font-size:13px;font-weight:750;color:var(--text);margin-bottom:8px}',
    '#pageKyaku #ikyRow .iky-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));min-width:0}',
    '#pageKyaku #ikyRow .iky-stat{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;padding:2px 12px;font-size:11px;color:var(--text3)}',
    '#pageKyaku #ikyRow .iky-stat:first-child{padding-left:0}',
    '#pageKyaku #ikyRow .iky-stat+.iky-stat{border-left:1px solid var(--border)}',
    '#pageKyaku #ikyRow .iky-stat strong{font-size:19px;line-height:1.2;font-weight:800;color:var(--text);white-space:nowrap}',
    '#pageKyaku #ikyRow .iky-stat strong.up{color:#b91c1c}',
    '#pageKyaku #ikyRow .iky-stat strong.down{color:#b91c1c}',
    '#pageKyaku #ikyRow .iky-note{font-size:9px;color:var(--text4);line-height:1.3;margin-top:9px;padding-top:6px;border-top:1px solid var(--border2)}',
    '@media(max-width:600px){#pageKyaku #ikyRow .iky-stat{padding:2px 6px;font-size:10px}#pageKyaku #ikyRow .iky-stat strong{font-size:15px}}'
  ].join('');
  document.head.appendChild(css);

  function numeric(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function label(id,value,cls){var node=document.getElementById(id);if(!node)return;node.textContent=value;node.classList.remove('up','down');if(cls)node.classList.add(cls);}
  function mount(){
    var calendar=document.getElementById('kyakuGridWrap');if(!calendar)return false;
    if(document.getElementById('ikyRow'))return true;
    var row=document.createElement('div');row.id='ikyRow';
    row.innerHTML='<section class="iky-card" aria-label="前年同月比較"><div class="iky-title">前年同月比較</div><div class="iky-stats"><div class="iky-stat"><span>客数前年比</span><strong id="ikyYoy">—</strong></div><div class="iky-stat"><span>入力済日数</span><strong id="ikyDays">—</strong></div><div class="iky-stat"><span>平均客数差</span><strong id="ikyAvgDiff">—</strong></div></div><div class="iky-note" id="ikyCompareNote"></div></section>';
    calendar.parentNode.insertBefore(row,calendar);
    return true;
  }
  function refresh(){
    if(!mount()||typeof store==='undefined'||typeof editYear==='undefined'||typeof editMonth==='undefined'||typeof drafts==='undefined')return;
    var year=String(editYear.kyaku||''),month=editMonth.kyaku||'',mi=typeof MONTHS!=='undefined'?MONTHS.indexOf(month):-1;
    if(!year||mi<0)return;
    var rows=Array.isArray(drafts.kyaku)?drafts.kyaku:[];
    var days=typeof DAYS_IN_MONTH!=='undefined'?DAYS_IN_MONTH[mi]:rows.length;
    var entered=0,compared=0,nowSum=0,oldSum=0,prevYear=String(Number(year)-1);
    var prior=store.data&&store.data[prevYear]&&store.data[prevYear][month];
    var prevByDay={};
    if(Array.isArray(prior))prior.forEach(function(r,i){if(r)prevByDay[Number(r.d)||i+1]=numeric(r.客数);});
    rows.forEach(function(r,i){
      if(!r)return;
      var value=numeric(r.客数),day=Number(r.d)||i+1;
      if(!value||day<1||day>days)return;
      entered++;
      if(Object.prototype.hasOwnProperty.call(prevByDay,day)&&prevByDay[day]>0){compared++;nowSum+=value;oldSum+=prevByDay[day];}
    });
    label('ikyDays',entered+' / '+days+'日');
    if(compared&&oldSum>0){
      var pct=(nowSum/oldSum-1)*100,diff=(nowSum-oldSum)/compared;
      label('ikyYoy',(pct>0?'+':'')+pct.toFixed(1)+'%',pct>0?'up':pct<0?'down':'');
      label('ikyAvgDiff',(diff>0?'+':'')+diff.toFixed(1)+'人',diff>0?'up':diff<0?'down':'');
      label('ikyCompareNote','前年同月の同じ日付・入力済み'+compared+'日で比較');
    }else{
      label('ikyYoy','—');label('ikyAvgDiff','—');
      label('ikyCompareNote',Array.isArray(prior)?'前年と比較できる入力済み日がありません':'前年同月のデータがありません');
    }
  }
  if(typeof window.renderTable==='function'){
    var original=window.renderTable;
    window.renderTable=function(type){var result=original.apply(this,arguments);if(type==='kyaku')refresh();return result;};
  }
  page.addEventListener('input',function(event){
    if(event.target&&event.target.matches&&event.target.matches('#kyakuGrid input.kyaku-input'))refresh();
  });
  if(typeof currentNav!=='undefined'&&currentNav===3)refresh();
})();
