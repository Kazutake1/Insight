/* Weekday input charts fix v1: live refresh and correct sales y-axis unit conversion. */
(function(root){
  'use strict';
  if(root.InsightWeekdayChartFix)return;
  if(!root.document)return;

  var doc=root.document;
  var pending={sales:false,kyaku:false,haiki:false};

  function period(type){
    try{
      var year=editYear[type];
      var month=editMonth[type];
      var mi=MONTHS.indexOf(month);
      return year&&mi>=0?{year:year,mi:mi}:null;
    }catch(_){return null;}
  }

  function formatSalesYAxis(value){
    var n=Number(value);
    if(!Number.isFinite(n)||n<=0)return '';
    var man=n/10;
    var rounded=Math.round(man);
    return (Math.abs(man-rounded)<0.000001?String(rounded):man.toFixed(1).replace(/\.0$/,''))+'万';
  }

  function salesChart(){
    var canvas=doc.getElementById('salesWdChart');
    if(!canvas)return null;
    try{
      if(root.Chart&&typeof root.Chart.getChart==='function'){
        var found=root.Chart.getChart(canvas);
        if(found)return found;
      }
    }catch(_){}
    try{
      if(typeof salesWdInst!=='undefined'&&salesWdInst)return salesWdInst;
    }catch(_){}
    return null;
  }

  function wasteChart(){
    var canvas=doc.getElementById('haikiWdChart');
    if(!canvas)return null;
    try{
      if(root.Chart&&typeof root.Chart.getChart==='function'){
        var found=root.Chart.getChart(canvas);
        if(found)return found;
      }
    }catch(_){}
    try{
      if(typeof haikiWdChartInst!=='undefined'&&haikiWdChartInst)return haikiWdChartInst;
    }catch(_){}
    return null;
  }

  function computeWasteWeekdayAverage(rows,fy,mi,now){
    var sums=Array(7).fill(0);
    var counts=Array(7).fill(0);
    var current=now instanceof Date?now:new Date();
    var cutoff=new Date(current.getFullYear(),current.getMonth(),current.getDate());
    (Array.isArray(rows)?rows:[]).forEach(function(row){
      var day=parseInt(row&&row.d,10);
      if(!Number.isFinite(day)||day<1)return;
      var date=new Date(parseInt(fy,10),mi,day);
      if(date>=cutoff)return;
      var total=HAIKI_CATS.reduce(function(sum,cat){
        return sum+(Number(row&&row.haiki&&row.haiki[cat])||0);
      },0);
      var wd=getWeekday(fy,mi,day);
      sums[wd]+=total;
      counts[wd]++;
    });
    return sums.map(function(sum,index){
      return counts[index]>0?Math.round(sum/counts[index]):0;
    });
  }

  function fixWasteAverage(fy,mi){
    var chart=wasteChart();
    if(!chart||!chart.data||!chart.data.datasets||!chart.data.datasets[0])return false;
    var rows=[];
    try{rows=drafts.haiki||[];}catch(_){rows=[];}
    chart.data.datasets[0].data=computeWasteWeekdayAverage(rows,fy,mi,new Date());
    try{chart.update('none');}catch(_){try{chart.update();}catch(__){}}
    return true;
  }

  function fixSalesAxis(){
    var chart=salesChart();
    if(!chart||!chart.options||!chart.options.scales||!chart.options.scales.y||!chart.options.scales.y.ticks)return false;
    chart.options.scales.y.ticks.callback=formatSalesYAxis;
    try{chart.update('none');}catch(_){try{chart.update();}catch(__){}}
    return true;
  }

  function wrapSalesRefresh(){
    if(typeof root.refreshSalesWdChart!=='function'||root.refreshSalesWdChart.__insightWeekdayChartFix)return;
    var original=root.refreshSalesWdChart;
    var wrapped=function(){
      var result=original.apply(this,arguments);
      fixSalesAxis();
      return result;
    };
    wrapped.__insightWeekdayChartFix=true;
    wrapped.__original=original;
    root.refreshSalesWdChart=wrapped;
  }

  function wrapWasteRefresh(){
    if(typeof root.refreshHaikiWdChart!=='function'||root.refreshHaikiWdChart.__insightWeekdayWasteFix)return;
    var original=root.refreshHaikiWdChart;
    var wrapped=function(fy,mi){
      var result=original.apply(this,arguments);
      fixWasteAverage(fy,mi);
      return result;
    };
    wrapped.__insightWeekdayWasteFix=true;
    wrapped.__original=original;
    root.refreshHaikiWdChart=wrapped;
  }

  function refresh(type){
    var p=period(type);
    if(!p)return false;
    try{
      if(type==='sales'&&typeof root.refreshSalesWdChart==='function'){
        root.refreshSalesWdChart(p.year,p.mi);
        return true;
      }
      if(type==='kyaku'&&typeof root.refreshKyakuWdChart==='function'){
        root.refreshKyakuWdChart(p.year,p.mi);
        return true;
      }
      if(type==='haiki'&&typeof root.refreshHaikiWdChart==='function'){
        root.refreshHaikiWdChart(p.year,p.mi);
        return true;
      }
    }catch(_){}
    return false;
  }

  function schedule(type){
    if(pending[type])return;
    pending[type]=true;
    var run=function(){
      pending[type]=false;
      refresh(type);
    };
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);
    else setTimeout(run,0);
  }

  function inputType(target){
    if(!target||!target.matches)return null;
    if(target.matches('#pageSales #salesForm input[data-k="売上"]'))return 'sales';
    if(target.matches('#pageKyaku #kyakuGrid input.kyaku-input'))return 'kyaku';
    if(target.matches('#pageHaiki #haikiForm input[data-hc]'))return 'haiki';
    return null;
  }

  function onValueChange(event){
    var type=inputType(event.target);
    if(type)schedule(type);
  }

  function init(){
    wrapSalesRefresh();
    wrapWasteRefresh();
    fixSalesAxis();
    doc.addEventListener('input',onValueChange,false);
    doc.addEventListener('change',onValueChange,false);
  }

  root.InsightWeekdayChartFix={
    refresh:refresh,
    fixSalesAxis:fixSalesAxis,
    formatSalesYAxis:formatSalesYAxis,
    computeWasteWeekdayAverage:computeWasteWeekdayAverage
  };

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});
  else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
