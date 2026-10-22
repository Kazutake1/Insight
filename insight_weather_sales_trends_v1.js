/* Stage 2: read-only descriptive weather/temperature sales tendencies.
 * Same weekday + Sunday/holiday classification; no causal or demand prediction.
 * Eligible samples come ONLY from InsightWeatherSalesReadiness.
 * Never writes or changes the original snapshot, aggregation or application UI.
 */
(function(root){
  'use strict';
  if(root.InsightWeatherSalesTrends)return;
  var readinessDefault=(typeof module!=='undefined'&&module.exports)?
    require('./insight_weather_sales_readiness_v1.js'):root.InsightWeatherSalesReadiness;
  var MIN_SAMPLE=3;
  var DAY_TYPES=['weekday','saturday','sundayHoliday'];
  var TEMP_BANDS=[
    {id:'below10',label:'10℃未満'},
    {id:'10to20',label:'10℃以上20℃未満'},
    {id:'20to30',label:'20℃以上30℃未満'},
    {id:'30plus',label:'30℃以上'}
  ];
  function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
  function bandFor(temp){
    if(!Number.isFinite(temp))throw new Error('最高気温が不正です。');
    return temp<10?'below10':temp<20?'10to20':temp<30?'20to30':'30plus';
  }
  function mean(sum,count){return count>0?sum/count:null;}
  function validSample(sample){
    return object(sample)&&typeof sample.date==='string'&&
      Number.isInteger(sample.weekday)&&sample.weekday>=0&&sample.weekday<=6&&
      DAY_TYPES.includes(sample.dayType)&&
      ((sample.dayType==='weekday'&&sample.weekday>=1&&sample.weekday<=5)||
       (sample.dayType==='saturday'&&sample.weekday===6)||
       sample.dayType==='sundayHoliday')&&
      typeof sample.weather==='string'&&sample.weather.trim()!==''&&
      Number.isFinite(sample.tempMaxC)&&Number.isFinite(sample.tempMinC)&&
      sample.tempMaxC>=sample.tempMinC&&
      Number.isSafeInteger(sample.sales)&&sample.sales>=0;
  }
  function series(rows,field,bandOrder){
    var groups=new Map();
    rows.forEach(function(sample){
      var name=field==='weather'?sample.weather:bandFor(sample.tempMaxC);
      var item=groups.get(name);
      if(!item){item={key:name,count:0,sum:0};groups.set(name,item);}
      item.count++;item.sum+=sample.sales;
    });
    var keys=Array.from(groups.keys());
    if(bandOrder)keys.sort(function(a,b){return TEMP_BANDS.findIndex(function(x){return x.id===a;})-
      TEMP_BANDS.findIndex(function(x){return x.id===b;});});
    else keys.sort();
    var summaries=keys.map(function(name){
      var group=groups.get(name),enough=group.count>=MIN_SAMPLE;
      var band=bandOrder&&TEMP_BANDS.find(function(x){return x.id===name;});
      return {key:name,label:band?band.label:name,sampleCount:group.count,
        sufficient:enough,meanSales:enough?mean(group.sum,group.count):null};
    });
    var comparisons=[];
    for(var i=0;i<keys.length;i++)for(var j=i+1;j<keys.length;j++){
      var a=groups.get(keys[i]),b=groups.get(keys[j]);
      var left=mean(a.sum,a.count),right=mean(b.sum,b.count),state='ready';
      if(a.count<MIN_SAMPLE||b.count<MIN_SAMPLE)state='insufficient_samples';
      else if(left===0)state='zero_baseline';
      comparisons.push({
        leftKey:a.key,rightKey:b.key,leftCount:a.count,rightCount:b.count,
        leftMean:state==='insufficient_samples'?null:left,
        rightMean:state==='insufficient_samples'?null:right,
        difference:state==='insufficient_samples'?null:right-left,
        changePercent:state==='ready'?(right-left)/left*100:null,
        status:state
      });
    }
    return {cohorts:summaries,comparisons:comparisons};
  }
  function sampleGroupOrder(a,b){
    var diff=DAY_TYPES.indexOf(a.dayType)-DAY_TYPES.indexOf(b.dayType);
    return diff||a.weekday-b.weekday;
  }
  function analyzeTrip(trip){
    if(!object(trip)||!Array.isArray(trip.samples))throw new Error('分析用サンプル形式が不正です。');
    var groups=new Map(),seen=new Set();
    trip.samples.forEach(function(sample){
      if(!validSample(sample))throw new Error('分析用サンプルに不正値があります。');
      if(seen.has(sample.date))throw new Error('同じ日付の販売実績が重複しています。');
      seen.add(sample.date);
      var key=sample.dayType+'|'+sample.weekday,entry=groups.get(key);
      if(!entry){entry={dayType:sample.dayType,weekday:sample.weekday,samples:[]};groups.set(key,entry);}
      entry.samples.push(sample);
    });
    var byCalendar=Array.from(groups.values()).sort(sampleGroupOrder).map(function(group){
      return {
        dayType:group.dayType,weekday:group.weekday,sampleCount:group.samples.length,
        weather:series(group.samples,'weather',false),
        temperature:series(group.samples,'temperature',true)
      };
    });
    var counts=object(trip.counts)?Object.assign({},trip.counts):null;
    return {trip:trip.trip,eligibleDays:trip.samples.length,excludedCounts:counts,byCalendar:byCalendar};
  }
  function summarize(report){
    if(!object(report)||!object(report.store)||!object(report.period)||
      !Array.isArray(report.categories)||!object(report.policy)||report.policy.savedOnly!==true||
      report.policy.historicalTripResolver!==true||
      report.policy.excludeEvents!==true||report.policy.segregateDayTypes!==true||
      report.policy.minimumCohortDays!==MIN_SAMPLE){
      throw new Error('保存済み実績の分析適格性判定結果が必要です。');
    }
    return {
      version:1,store:{id:report.store.id,name:report.store.name},
      period:{startDate:report.period.startDate,endDate:report.period.endDate,days:report.period.days},
      policy:{savedOnly:true,minimumPerGroup:MIN_SAMPLE,compareSameWeekday:true,
        separateHolidayAndNormal:true,tempAxis:'saved_daily_max_celsius',
        reference:'pairwise_right_minus_left',
        status:'descriptive-only-not-causal-or-a-forecast'},
      categories:report.categories.map(function(category){
        if(!object(category)||!Array.isArray(category.trips))throw new Error('カテゴリー判定結果が不正です。');
        return {id:category.id,name:category.name,hidden:!!category.hidden,
          trips:category.trips.map(analyzeTrip)};
      })
    };
  }
  function analyze(snapshot,options,deps){
    deps=deps||{};
    var readiness=deps.readiness||readinessDefault;
    if(!readiness||typeof readiness.examine!=='function')throw new Error('分析適格性判定が利用できません。');
    return summarize(readiness.examine(snapshot,options,deps));
  }
  var api={analyze:analyze,summarize:summarize,bandFor:bandFor,
    TEMP_BANDS:TEMP_BANDS.map(function(b){return {id:b.id,label:b.label};}),MIN_SAMPLE:MIN_SAMPLE};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.InsightWeatherSalesTrends=api;
})(typeof window!=='undefined'?window:globalThis);
