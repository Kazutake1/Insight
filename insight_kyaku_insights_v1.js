/* 客数入力ページ専用：前年同月比較と曜日別の客数傾向を表示する。 */
(function(){
  'use strict';
  if(window.__insightKyakuInsightsV1)return;
  window.__insightKyakuInsightsV1=true;
  var page=document.getElementById('pageKyaku');
  if(!page)return;
  var css=document.createElement('style');
  css.id='insightKyakuInsightsStyle';
  css.textContent=[
    '#pageKyaku #ikyRow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;flex:0 0 auto;min-width:0;margin-bottom:10px}',
    '#pageKyaku #ikyRow .iky-card{box-sizing:border-box;min-width:0;min-height:138px;border-radius:14px;padding:11px 14px;background:var(--surface);box-shadow:0 2px 10px var(--shadow)}',
    '#pageKyaku #ikyRow .iky-title{font-size:13px;font-weight:750;color:var(--text);margin-bottom:6px}',
    '#pageKyaku #ikyRow .iky-stat{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2);font-size:11px;color:var(--text3)}',
    '#pageKyaku #ikyRow .iky-stat:last-of-type{border-bottom:0}',
    '#pageKyaku #ikyRow .iky-stat strong{font-size:14px;font-weight:800;color:var(--text);white-space:nowrap}',
    '#pageKyaku #ikyRow .iky-stat strong.up{color:#b91c1c}',
    '#pageKyaku #ikyRow .iky-stat strong.down{color:#15803d}',
    '#pageKyaku #ikyRow .iky-note{font-size:9px;color:var(--text4);line-height:1.3;margin-top:4px}',
    '#pageKyaku #ikyRow .iky-trend-text{font-size:11px;color:var(--text3);min-height:15px;line-height:1.3}',
    '#pageKyaku #ikyRow .iky-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;height:52px;margin-top:5px;align-items:end}',
    '#pageKyaku #ikyRow .iky-weekday{height:52px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;min-width:0}',
    '#pageKyaku #ikyRow .iky-bar{width:80%;max-width:24px;min-height:0;border-radius:3px 3px 0 0;background:#93c5fd}',
    '#pageKyaku #ikyRow .iky-weekday.sun .iky-bar{background:#f87171}',
    '#pageKyaku #ikyRow .iky-weekday.sat .iky-bar{background:#3b82f6}',
    '#pageKyaku #ikyRow .iky-weekday small{font-size:9px;color:var(--text4);line-height:1}',
    '#pageKyaku #ikyRow .iky-weekday.sun small{color:#dc2626}',
    '#pageKyaku #ikyRow .iky-weekday.sat small{color:#3b82f6}',
    '#pageKyaku #ikyRow .iky-trend-note{font-size:9px;color:var(--text4);margin-top:4px;line-height:1.3}',
    '@media(max-width:700px){#pageKyaku #ikyRow{grid-template-columns:minmax(0,1fr)}}'
  ].join('');
  document.head.appendChild(css);

  function numeric(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function label(id,value,cls){var node=document.getElementById(id);if(!node)return;node.textContent=value;node.classList.remove('up','down');if(cls)node.classList.add(cls);}
  function mount(){
    var calendar=document.getElementById('kyakuGridWrap');if(!calendar)return false;
    if(document.getElementById('ikyRow'))return true;
    var row=document.createElement('div');row.id='ikyRow';
    row.innerHTML='<section class="iky-card" aria-label="前年同月比較"><div class="iky-title">前年同月比較</div><div class="iky-stat"><span>客数前年比</span><strong id="ikyYoy">—</strong></div><div class="iky-stat"><span>入力済日数</span><strong id="ikyDays">—</strong></div><div class="iky-stat"><span>平均客数差</span><strong id="ikyAvgDiff">—</strong></div><div class="iky-note" id="ikyCompareNote"></div></section>'+
      '<section class="iky-card" aria-label="客数の傾向"><div class="iky-title">客数の傾向</div><div class="iky-trend-text" id="ikyTrendText">—</div><div class="iky-week" id="ikyWeek" role="img" aria-label="曜日別平均客数"></div><div class="iky-trend-note" id="ikyTrendNote"></div></section>';
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
    var totals=Array.from({length:7},function(){return {sum:0,count:0};});
    rows.forEach(function(r,i){
      if(!r)return;
      var value=numeric(r.客数),day=Number(r.d)||i+1;
      if(!value||day<1||day>days)return;
      entered++;
      if(Object.prototype.hasOwnProperty.call(prevByDay,day)&&prevByDay[day]>0){compared++;nowSum+=value;oldSum+=prevByDay[day];}
      var wd=typeof getWeekday==='function'?getWeekday(year,mi,day):new Date(Number(year),mi,day).getDay();
      if(wd>=0&&wd<=6){totals[wd].sum+=value;totals[wd].count++;}
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
    var week=document.getElementById('ikyWeek');week.replaceChildren();
    var names=['日','月','火','水','木','金','土'];
    var max=Math.max(0,...totals.map(function(v){return v.count?v.sum/v.count:0;}));
    totals.forEach(function(v,i){
      var avg=v.count?v.sum/v.count:0;
      var col=document.createElement('div');col.className='iky-weekday'+(i===0?' sun':i===6?' sat':'');
      col.title=names[i]+'曜日：'+(v.count?Math.round(avg).toLocaleString('ja-JP')+'人/日':'データなし');
      var bar=document.createElement('div');bar.className='iky-bar';bar.style.height=(v.count&&max?Math.max(2,Math.round(avg/max*35)):0)+'px';
      var dayLabel=document.createElement('small');dayLabel.textContent=names[i];col.append(bar,dayLabel);week.appendChild(col);
    });
    var weekendSum=totals[0].sum+totals[6].sum,weekendCount=totals[0].count+totals[6].count;
    var weekdaySum=0,weekdayCount=0;for(var i=1;i<=5;i++){weekdaySum+=totals[i].sum;weekdayCount+=totals[i].count;}
    var trend='入力データがありません',note='入力済み日の曜日別平均を表示';
    if(weekendCount&&weekdayCount){
      var wend=weekendSum/weekendCount,wday=weekdaySum/weekdayCount;
      trend=wend>wday*1.1?'週末の平均客数が平日より多い傾向です':wday>wend*1.1?'平日の平均客数が週末より多い傾向です':'週末と平日の平均客数はほぼ同水準です';
      note='週末 '+Math.round(wend).toLocaleString('ja-JP')+'人/日 ・ 平日 '+Math.round(wday).toLocaleString('ja-JP')+'人/日';
    }else if(weekendCount||weekdayCount){trend='比較には週末・平日両方の入力が必要です';}
    label('ikyTrendText',trend);label('ikyTrendNote',note);
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
