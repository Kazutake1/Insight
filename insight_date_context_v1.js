/* Shared date context v1: one source for the selected date on 今日の入力. */
(function(root){
  'use strict';
  if(root.InsightDateContext)return;

  function normalize(date){
    if(!date||typeof date.getFullYear!=='function'||!Number.isFinite(date.getTime()))return null;
    var out=new Date(0);
    out.setFullYear(date.getFullYear(),date.getMonth(),date.getDate());
    out.setHours(0,0,0,0);
    return out;
  }
  function parseIso(value){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    var year=Number(match[1]),monthIndex=Number(match[2])-1,day=Number(match[3]);
    var date=new Date(0);
    date.setFullYear(year,monthIndex,day);
    date.setHours(0,0,0,0);
    return date.getFullYear()===year&&date.getMonth()===monthIndex&&date.getDate()===day?date:null;
  }
  function iso(date){
    var d=normalize(date);
    if(!d)return '';
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function info(date){
    var d=normalize(date);
    if(!d)return null;
    var monthIndex=d.getMonth();
    var month=(typeof MONTHS!=='undefined'&&Array.isArray(MONTHS)&&MONTHS[monthIndex])||String(monthIndex+1)+'月';
    return {fy:String(d.getFullYear()),mIdx:monthIndex,month:month,day:d.getDate(),date:d,iso:iso(d)};
  }

  var selected=normalize(new Date());

  function getSelectedDate(){return normalize(selected);}
  function getSelectedInfo(){return info(selected);}
  function getSelectedIso(){return iso(selected);}
  function setSelectedDate(date){
    var next=normalize(date);
    if(!next)throw new Error('選択日が不正です。');
    selected=next;
    return getSelectedDate();
  }
  function resetToToday(){return setSelectedDate(new Date());}
  function isToday(date){return iso(date||selected)===iso(new Date());}
  function isFuture(date){var value=iso(date||selected),today=iso(new Date());return !!value&&value>today;}

  function withLegacyGlobals(callback){
    var selectedInfo=getSelectedInfo();
    var previousTodayInfo,previousQuickDay,hasTodayInfo=false,hasQuickDay=false;
    try{
      hasTodayInfo=typeof todayInfo!=='undefined';
      if(hasTodayInfo){previousTodayInfo=todayInfo;todayInfo={fy:selectedInfo.fy,mIdx:selectedInfo.mIdx,month:selectedInfo.month,day:selectedInfo.day};}
      hasQuickDay=typeof quickEditDay!=='undefined';
      if(hasQuickDay){previousQuickDay=quickEditDay;quickEditDay=selectedInfo.day;}
      return callback();
    }finally{
      if(hasTodayInfo)todayInfo=previousTodayInfo;
      if(hasQuickDay)quickEditDay=previousQuickDay;
    }
  }

  root.InsightDateContext={
    parseIso:parseIso,
    iso:iso,
    info:info,
    getSelectedDate:getSelectedDate,
    getSelectedInfo:getSelectedInfo,
    getSelectedIso:getSelectedIso,
    setSelectedDate:setSelectedDate,
    resetToToday:resetToToday,
    isToday:isToday,
    isFuture:isFuture,
    withLegacyGlobals:withLegacyGlobals
  };
})(typeof window!=='undefined'?window:globalThis);
