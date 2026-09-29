/* Shared comparison policy. KPI aggregation and stored data remain unchanged. */
(function(root){
  'use strict';
  if(root.InsightYearComparison)return;
  var engine=root.YearComparisonEngine;
  var averageFields={salesYen:'avgDailySalesYen',customers:'avgDailyCustomers',items:'avgDailyItems',wasteYen:'avgDailyWasteYen'};
  function isCompletedMonth(year,month){
    try{
      var t=todayFY(),y=Number(year),ty=Number(t.fy),mi=MONTHS.indexOf(month);
      return year!=null&&Number.isFinite(y)&&Number.isFinite(ty)&&mi>=0&&
        (y<ty||(y===ty&&mi<t.mIdx));
    }catch(_){return false;}
  }
  function getPeriod(year,month,throughDay,compareYear){
    var completed=isCompletedMonth(year,month);
    var end=completed?null:throughDay;
    var current=root.KPIEngine.getPeriod(year,month,end);
    var previous=compareYear!=null?root.KPIEngine.getPeriod(compareYear,month,end):null;
    var comparison=previous?engine.compare(current,previous):null;
    if(comparison&&!completed){
      Object.keys(averageFields).forEach(function(key){
        comparison[key]=engine.change(current[averageFields[key]],previous[averageFields[key]]);
      });
    }
    if(comparison&&(!current.inputDays||!previous.inputDays)){
      Object.keys(comparison).forEach(function(key){comparison[key]=null;});
    }
    return {baseYear:String(year),compareYear:compareYear==null?null:String(compareYear),month:month,
      throughDay:end==null?null:end,completed:completed,basis:completed?'total':'dailyAverage',
      current:current,previous:previous,comparison:comparison};
  }
  function monthly(year,month,compareYear){
    var data=typeof store!=='undefined'&&store&&store.monthlyOps||{};
    var current=data[String(year)]&&data[String(year)][month]||{};
    var previous=compareYear!=null&&data[String(compareYear)]&&data[String(compareYear)][month]||{};
    var labor=Number(current.laborCostYen),prevLabor=Number(previous.laborCostYen);
    var gm=Number(current.grossMarginRate),prevGm=Number(previous.grossMarginRate);
    return {
      laborCostYen:isCompletedMonth(year,month)&&labor>0&&prevLabor>0?engine.change(labor,prevLabor):null,
      grossMarginRate:gm>0&&prevGm>0?engine.pointChange(gm,prevGm):null
    };
  }
  root.InsightYearComparison={isCompletedMonth:isCompletedMonth,getPeriod:getPeriod,monthly:monthly};
  // Existing management comments also resolve this shared period entry point.
  engine.getPeriod=getPeriod;
})(window);
