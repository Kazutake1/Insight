/* Analysis history v1: reconstruct past weekly/monthly reviews from saved data without new persistence. */
(function(root){
  'use strict';
  if(root.InsightAnalysisHistory)return;

  var VERSION=1;
  var DEFAULT_WEEK_COUNT=12;
  var DEFAULT_MONTH_COUNT=12;

  function pad(v){return String(v).padStart(2,'0');}
  function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function parse(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!m)return null;
    var d=new Date(0);d.setFullYear(Number(m[1]),Number(m[2])-1,Number(m[3]));d.setHours(12,0,0,0);
    return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;
  }
  function shiftDate(value,days){var d=parse(value);if(!d)return '';d.setDate(d.getDate()+days);return iso(d);}
  function shiftMonth(year,month,offset){
    var d=new Date(Number(year),Number(month)-1+Number(offset||0),1,12,0,0,0);
    return {year:d.getFullYear(),month:d.getMonth()+1};
  }
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function formatDate(value){
    var d=parse(value);
    return d?(d.getMonth()+1)+'/'+d.getDate():String(value||'');
  }
  function hasContextData(context){
    if(!context)return false;
    if(context.metrics&&Number(context.metrics.inputDays)>0)return true;
    if(context.profitCost&&context.profitCost.available)return true;
    var categories=context.salesCount&&Array.isArray(context.salesCount.categories)?context.salesCount.categories:[];
    return categories.some(function(c){return Number(c.inputDays)>0;});
  }
  function reviewItems(review){
    return review&&Array.isArray(review.items)?review.items:[];
  }
  function displayItems(review){
    return review&&Array.isArray(review.display)?review.display:[];
  }
  function negative(item){return item&&item.level!=='internal'&&!item.positive&&item.state!=='resolved';}
  function magnitude(item){
    if(!item)return 0;
    if(item.magnitude!=null)return Math.abs(Number(item.magnitude)||0);
    if(item.primaryChange!=null)return Math.abs(Number(item.primaryChange)||0);
    return 0;
  }
  function labelForWeek(review){
    var p=review.period||{};
    return formatDate(p.startDate)+'〜'+formatDate(p.endDate);
  }
  function labelForMonth(review){
    var p=review.period||{};
    return String(p.year)+'年'+String(p.month)+'月'+(p.completed?'':'（'+String(p.throughDay)+'日まで）');
  }
  function summaryFor(review){
    var c=review&&Array.isArray(review.conclusion)?review.conclusion:[];
    return c.filter(Boolean).slice(0,2);
  }

  function weeklyEntries(options,overrides){
    options=options||{};
    var weekly=overrides&&overrides.WeeklyReview||root.InsightWeeklyReview;
    if(!weekly||typeof weekly.review!=='function'||typeof weekly.weekWindow!=='function')throw new Error('週次レビューを利用できません。');
    var reference=options.referenceDate||weekly.referenceDate();
    var baseWindow=weekly.weekWindow(reference);
    var count=clamp(Number(options.count)||DEFAULT_WEEK_COUNT,1,24);
    var entries=[];
    for(var i=0;i<count;i++){
      var ref=i===0?reference:shiftDate(baseWindow.startDate,-1-7*(i-1));
      var review;
      try{review=weekly.review(ref,options.storeId,overrides);}catch(_){continue;}
      if(!hasContextData(review.current))continue;
      entries.push({
        id:'week:'+review.period.endDate,
        kind:'week',
        sortDate:review.period.endDate,
        label:labelForWeek(review),
        review:review,
        items:reviewItems(review),
        display:displayItems(review),
        conclusion:summaryFor(review)
      });
    }
    return entries;
  }

  function monthlyEntries(options,overrides){
    options=options||{};
    var monthly=overrides&&overrides.MonthlyReview||root.InsightMonthlyReview;
    if(!monthly||typeof monthly.review!=='function')throw new Error('月次レビューを利用できません。');
    var year=Number(options.year),month=Number(options.month);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('履歴対象年月が不正です。');
    var count=clamp(Number(options.count)||DEFAULT_MONTH_COUNT,1,24);
    var gap=options.compareYear==null?null:year-Number(options.compareYear);
    var entries=[];
    for(var i=0;i<count;i++){
      var ref=shiftMonth(year,month,-i);
      var compareYear=gap==null?null:ref.year-gap;
      var through=i===0?Number(options.throughDay)||lastDay(ref.year,ref.month):lastDay(ref.year,ref.month);
      var review;
      try{
        review=monthly.review({
          year:ref.year,month:ref.month,throughDay:through,compareYear:compareYear,storeId:options.storeId
        },overrides);
      }catch(_){continue;}
      if(!hasContextData(review.current))continue;
      entries.push({
        id:'month:'+ref.year+'-'+pad(ref.month),
        kind:'month',
        sortDate:ref.year+'-'+pad(ref.month)+'-'+pad(review.period.throughDay||lastDay(ref.year,ref.month)),
        label:labelForMonth(review),
        review:review,
        items:reviewItems(review),
        display:displayItems(review),
        conclusion:summaryFor(review)
      });
    }
    return entries;
  }

  function chronological(entries){
    return entries.slice().sort(function(a,b){return a.sortDate.localeCompare(b.sortDate);});
  }

  function buildTimeline(entries){
    var ordered=chronological(entries),active={},episodes=[];
    ordered.forEach(function(entry){
      var current={};
      entry.items.forEach(function(item){
        if(!item||!item.key)return;
        if(item.state==='resolved'||item.positive)return;
        if(item.level==='internal')return;
        current[item.key]=item;
        var episode=active[item.key];
        if(!episode){
          episode={
            key:item.key,title:item.title,type:item.type,theme:item.theme,
            startId:entry.id,startLabel:entry.label,startDate:entry.sortDate,
            lastId:entry.id,lastLabel:entry.label,lastDate:entry.sortDate,
            periods:1,status:'new',statusLabel:'新規',resolvedId:null,resolvedLabel:null,
            latestItem:item
          };
          active[item.key]=episode;
          episodes.push(episode);
        }else{
          episode.periods++;
          episode.lastId=entry.id;episode.lastLabel=entry.label;episode.lastDate=entry.sortDate;
          var currentMag=magnitude(item),previousMag=magnitude(episode.latestItem);
          episode.status=currentMag<=previousMag*0.7?'improving':'continuing';
          episode.statusLabel=episode.status==='improving'?'改善':'継続';
          episode.latestItem=item;
        }
      });
      Object.keys(active).forEach(function(key){
        if(current[key])return;
        var episode=active[key];
        episode.status='resolved';
        episode.statusLabel='解消';
        episode.resolvedId=entry.id;
        episode.resolvedLabel=entry.label;
        episode.resolvedDate=entry.sortDate;
        delete active[key];
      });
    });
    return episodes.sort(function(a,b){return b.startDate.localeCompare(a.startDate);});
  }

  function tracesForEntry(history,entry){
    if(!entry)return [];
    var keys={};
    entry.items.forEach(function(item){if(item&&item.key)keys[item.key]=true;});
    return history.traces.filter(function(trace){
      return keys[trace.key]||trace.startId===entry.id||trace.resolvedId===entry.id;
    }).slice(0,5);
  }

  function traceLine(trace){
    var line=trace.title+'：'+trace.startLabel+'に開始';
    if(trace.periods>1)line+=' → '+trace.periods+(trace.startId.indexOf('week:')===0?'週':'か月')+'継続';
    if(trace.resolvedLabel)line+=' → '+trace.resolvedLabel+'に解消';
    else if(trace.status==='improving')line+=' → 改善中';
    else if(trace.status==='continuing')line+=' → 継続中';
    return line;
  }

  function build(options,overrides){
    options=options||{};
    var kind=options.kind==='month'?'month':'week';
    var entries=kind==='month'?monthlyEntries(options,overrides):weeklyEntries(options,overrides);
    var traces=buildTimeline(entries);
    return {
      version:VERSION,
      kind:kind,
      entries:entries,
      traces:traces,
      getEntry:function(id){return entries.find(function(entry){return entry.id===id;})||entries[0]||null;},
      tracesForEntry:function(entry){return tracesForEntry({traces:traces},entry);},
      traceLine:traceLine
    };
  }

  var model={
    VERSION:VERSION,
    DEFAULT_WEEK_COUNT:DEFAULT_WEEK_COUNT,
    DEFAULT_MONTH_COUNT:DEFAULT_MONTH_COUNT,
    build:build,
    weeklyEntries:weeklyEntries,
    monthlyEntries:monthlyEntries,
    buildTimeline:buildTimeline,
    traceLine:traceLine
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAnalysisHistory=model;
})(typeof window!=='undefined'?window:globalThis);
