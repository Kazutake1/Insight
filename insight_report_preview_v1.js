/* Saved-point deterministic report. No writes, models, remote requests or raw-data logs. */
(function(root){
  'use strict';
  if(root.InsightReportPreview||!root.document)return;
  var doc=root.document,dialog,button,form,message,body,heading,host=null,sequence=0,tickets=new Map(),lastDay=null;
  var fields={},detailText='';
  // Reviewed public calendar from insight-ai-lab d732aa5; no runtime fetch.
  var CALENDAR_VERSION="cao-table-2026-2027-20261021-0b2cdf75cf19";
  var calendarPackage=/* reviewed-calendar:start */{
  "format": "jp-holiday-package-v1",
  "version": "cao-table-2026-2027-20261021-0b2cdf75cf19",
  "converter_version": "calendar-build-v1",
  "verified": true,
  "checked_at": "2026-10-21",
  "source": {
    "url": "https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html",
    "representation": "reviewed-page-table-transcription",
    "original_bytes_sha256": null,
    "capture_sha256": "0b2cdf75cf19e3318a4a972c30c79e7c8362dfc7cb13fc0ae49c8d949e6e1761",
    "retrieved_at": "2026-10-21",
    "reviewer": "Codex-page-table-cross-check"
  },
  "coverage": [
    {
      "start": "2026-01-01",
      "end": "2026-12-31"
    },
    {
      "start": "2027-01-01",
      "end": "2027-12-31"
    }
  ],
  "holidays": [
    {
      "day": "2026-01-01",
      "name": "元日"
    },
    {
      "day": "2026-01-12",
      "name": "成人の日"
    },
    {
      "day": "2026-02-11",
      "name": "建国記念の日"
    },
    {
      "day": "2026-02-23",
      "name": "天皇誕生日"
    },
    {
      "day": "2026-03-20",
      "name": "春分の日"
    },
    {
      "day": "2026-04-29",
      "name": "昭和の日"
    },
    {
      "day": "2026-05-03",
      "name": "憲法記念日"
    },
    {
      "day": "2026-05-04",
      "name": "みどりの日"
    },
    {
      "day": "2026-05-05",
      "name": "こどもの日"
    },
    {
      "day": "2026-05-06",
      "name": "休日"
    },
    {
      "day": "2026-07-20",
      "name": "海の日"
    },
    {
      "day": "2026-08-11",
      "name": "山の日"
    },
    {
      "day": "2026-09-21",
      "name": "敬老の日"
    },
    {
      "day": "2026-09-22",
      "name": "休日"
    },
    {
      "day": "2026-09-23",
      "name": "秋分の日"
    },
    {
      "day": "2026-10-12",
      "name": "スポーツの日"
    },
    {
      "day": "2026-11-03",
      "name": "文化の日"
    },
    {
      "day": "2026-11-23",
      "name": "勤労感謝の日"
    },
    {
      "day": "2027-01-01",
      "name": "元日"
    },
    {
      "day": "2027-01-11",
      "name": "成人の日"
    },
    {
      "day": "2027-02-11",
      "name": "建国記念の日"
    },
    {
      "day": "2027-02-23",
      "name": "天皇誕生日"
    },
    {
      "day": "2027-03-21",
      "name": "春分の日"
    },
    {
      "day": "2027-03-22",
      "name": "休日"
    },
    {
      "day": "2027-04-29",
      "name": "昭和の日"
    },
    {
      "day": "2027-05-03",
      "name": "憲法記念日"
    },
    {
      "day": "2027-05-04",
      "name": "みどりの日"
    },
    {
      "day": "2027-05-05",
      "name": "こどもの日"
    },
    {
      "day": "2027-07-19",
      "name": "海の日"
    },
    {
      "day": "2027-08-11",
      "name": "山の日"
    },
    {
      "day": "2027-09-20",
      "name": "敬老の日"
    },
    {
      "day": "2027-09-23",
      "name": "秋分の日"
    },
    {
      "day": "2027-10-11",
      "name": "スポーツの日"
    },
    {
      "day": "2027-11-03",
      "name": "文化の日"
    },
    {
      "day": "2027-11-23",
      "name": "勤労感謝の日"
    }
  ],
  "content_sha256": "6c66c7253f57d8af7e6ff5d66a633044df3629e357f968d7a7cff4153d2517bc"
}/* reviewed-calendar:end */;
  function calendarFor(requestText){
    var requested=JSON.parse(requestText);
    return root.InsightReport.selectCalendar(calendarPackage,{start:requested.quantity_reference.start,
      end:requested.quantity_reference.end,as_of:requested.as_of},CALENDAR_VERSION);
  }
  // recorded-comparison:start
  // Captured configured-host totals already share store, metric units and whole-store scope.
  // This computes recorded differences only; it never marks comparable conditions as confirmed.
  function recordedComparison(report){
    var names={sales:'売上',waste:'廃棄金額',customers:'客数'},units={sales:'円',waste:'円',customers:'人'};
    var out=['保存値の単純比較（条件差の調整なし）',
      '同一店舗・全体集計の保存値の差です。曜日・祝日・イベント等の条件差は調整していません。増減率は比較期間を基準に小数第2位まで四捨五入します。'];
    function signed(n){return (n>0n?'+':'')+n.toString();}
    function percent(delta,base){
      if(base===0n)return '算出できません（比較期間の値が0）';
      var magnitude=delta<0n?-delta:delta;
      var hundredths=(magnitude*20000n+base)/(base*2n);
      var digits=(hundredths%100n).toString().padStart(2,'0').replace(/0+$/,'');
      return (hundredths===0n?'':delta<0n?'-':'+')+(hundredths/100n).toString()+(digits?'.'+digits:'')+'%';
    }
    report.kpis.forEach(function(k){
      var reasons=[],unit=units[k.metric];
      [['当期',k.current],['比較期間',k.reference]].forEach(function(pair){
        var v=pair[1];
        if(v.unknown_zero)reasons.push(pair[0]+'の保存値0の入力状態が不明');
        if(v.entered!==v.expected||v.value===null)reasons.push(pair[0]+'の全対象日の入力確認が未完了');
      });
      if(k.current.expected!==k.reference.expected)reasons.push('対象日数が異なる');
      if(k.reason==='scope_mismatch')reasons.push('集計範囲が異なる');
      if(reasons.length){out.push('・'+names[k.metric]+'：保留。'+reasons.join('。')+'。');return;}
      if(!unit||![k.current.value,k.reference.value].every(function(v){return Number.isSafeInteger(v)&&v>=0;}))
        throw Error('invalid_recorded_total');
      var current=BigInt(k.current.value),reference=BigInt(k.reference.value),delta=current-reference;
      out.push('・'+names[k.metric]+'：当期'+current.toString()+unit+'／比較期間'+reference.toString()+unit+
        '。差 '+signed(delta)+unit+'（'+(delta<0n?'減少':delta>0n?'増加':'差なし')+'）、増減率 '+percent(delta,reference)+'。');
    });
    return out.join('\n');
  }
  // recorded-comparison:end
  // comparison-details:start
  // Descriptive observations only; never authorizes comparison or changes the report.
  function comparisonDetails(raw,requestText,report){
    var snapshot=JSON.parse(raw),requested=JSON.parse(requestText),labels={sales:'売上',waste:'廃棄金額',customers:'客数'};
    var weekdays=['日','月','火','水','木','金','土'];
    function dates(period){
      var result=[],d=period.start;
      for(var i=0;i<366&&d<=period.end;i++,d=shift(d,1))result.push(d);
      if(!result.length||result[result.length-1]!==period.end)throw Error('report_period_invalid');
      return result;
    }
    var currentDates=dates(requested.period),referenceDates=dates(requested.reference);
    function counts(ds){var n=[0,0,0,0,0,0,0];ds.forEach(function(d){n[new Date(d+'T12:00:00Z').getUTCDay()]++;});return n;}
    function describe(n){return n.map(function(v,i){return v?weekdays[i]+'曜'+v+'日':'';}).filter(Boolean).join('・')||'該当日なし';}
    function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
    function calendar(period){
      return root.InsightReport.selectCalendar(calendarPackage,{start:period.start,end:period.end,as_of:requested.as_of},CALENDAR_VERSION);
    }
    function holidayCounts(selected,ds){
      if(!selected.calendar)return null;
      return counts(ds.filter(function(d){return selected.calendar.holidays.indexOf(d)!==-1;}));
    }
    function calendarReason(selected){
      var reasons={calendar_after_as_of:'基準日時点では資料未確認',calendar_out_of_range:'資料の確認範囲外',
        calendar_unverified:'資料未確認',calendar_range_too_large:'資料の選択範囲上限超過'};
      return reasons[selected.reason]||'資料未確認';
    }
    function eventCounts(){
      var store=snapshot.stores[requested.store_id],management=snapshot.eventManagement;
      if(!management||!Object.prototype.hasOwnProperty.call(store,'events'))return null;
      var ids=new Set(),records=[],types=['sale','campaign','nearby','special','environment','equipment','staff','bulk','other'];
      function validDay(d){return typeof d==='string'&&!d.startsWith('0000')&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&shift(d,0)===d;}
      try{
        for(var pair of [['global',management.events],['store',store.events]]){
          if(!Array.isArray(pair[1])||pair[1].length>2000)return null;
          for(var e of pair[1]){
            if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.id!=='string'||!e.id.length||e.id.length>100||
              /[\p{C}\p{Zl}\p{Zp}\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/u.test(e.id)||ids.has(e.id)||e.scope!==pair[0]||types.indexOf(e.type)===-1||
              (['sale','campaign'].indexOf(e.type)!==-1?e.scope!=='global':e.type!=='other'&&e.scope!=='store')||
              !validDay(e.startDate)||!validDay(e.endDate)||e.startDate>e.endDate)return null;
            ids.add(e.id);records.push(e);
          }
        }
      }catch(_){return null;}
      return [requested.period,requested.reference].map(function(period){
        return records.filter(function(e){return e.startDate<=period.end&&e.endDate>=period.start;}).length;
      });
    }
    var out=[recordedComparison(report),'比較条件の確認（同条件での比較は未確認）',
      '・比較期間：'+requested.reference.start+'〜'+requested.reference.end+'。'];
    report.kpis.forEach(function(k){
      var notes=[];
      [['当期',k.current],['比較期間',k.reference]].forEach(function(pair){
        var value=pair[1];
        notes.push(pair[0]+'の入力済み確認'+value.entered+'日／対象'+value.expected+'日');
        if(value.unknown_zero)notes.push(pair[0]+'の保存値0は'+value.unknown_zero+'日分の入力状態が不明');
        if(value.entered<value.expected)notes.push(pair[0]+'は全対象日の入力確認が未完了');
      });
      if(k.current.expected!==k.reference.expected)notes.push('対象日数に違いあり');
      out.push('・'+labels[k.metric]+'：'+notes.join('。')+'。');
    });
    var c=counts(currentDates),r=counts(referenceDates);
    out.push('・曜日構成：'+(same(c,r)?'一致':'違いあり')+'。当期 '+describe(c)+'／比較期間 '+describe(r)+'。');
    var cc=calendar(requested.period),rc=calendar(requested.reference);
    var ch=holidayCounts(cc,currentDates),rh=holidayCounts(rc,referenceDates);
    if(ch&&rh)out.push('・祝日構成（曜日別）：'+(same(ch,rh)?'一致':'違いあり')+'。当期 '+describe(ch)+'／比較期間 '+describe(rh)+'。');
    else out.push('・祝日構成：未確認。当期 '+(ch?'資料確認済み':calendarReason(cc))+'／比較期間 '+(rh?'資料確認済み':calendarReason(rc))+'。');
    out.push('・祝日資料：'+CALENDAR_VERSION+'。確認日 '+calendarPackage.checked_at+'。');
    var events=eventCounts();
    out.push(events?'・イベント登録：当期 '+(events[0]?events[0]+'件の登録あり':'登録なし')+'／比較期間 '+
      (events[1]?events[1]+'件の登録あり':'登録なし')+'。実際の開催有無や登録条件の同等性は未確認。':
      '・イベント登録：未確認。資料が不足しているか、登録内容を確認できません。');
    out.push('・集計定義：未確認。集計上の範囲名は全体ですが、両期間で定義が変わっていないことを確認する資料は未接続です。',
      '・営業時間・価格などの条件：未確認。曜日や祝日構成の一致だけで、比較条件全体を確認済みにはしません。');
    return out.join('\n');
  }
  // comparison-details:end
  function node(tag,text,className){
    var n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;
  }
  function day(){
    var d=new Date(Date.now()+9*3600000);return d.toISOString().slice(0,10);
  }
  function shift(iso,n){return new Date(Date.parse(iso+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
  function key(){return typeof SK!=='undefined'?SK:root.SK;}
  function saved(){return root.localStorage.getItem(key());}
  function storageState(){
    if(!root.InsightStorage||typeof root.InsightStorage.reportState!=='function')throw Error('report_storage_unavailable');
    var s=root.InsightStorage.reportState();
    if(s.pending||s.held||s.conflict)throw Error('report_storage_unstable');
    return s;
  }
  function paint(){
    var state=host?host.getState():null;
    if(!state||state.status!=='ready')detailText='';
    var text=state&&state.status==='ready'?state.text:'';
    if(state&&state.status==='ready')state.report.kpis.forEach(function(k){
      if(k.reason==='conditions_unconfirmed'){
        var name={sales:'売上',waste:'廃棄金額',customers:'客数'}[k.metric];
        text=text.split('\n・'+name+'の増減は判定できません。').join('\n・'+name+'の同条件比較は保留します。');
      }
    });
    body.textContent=text+(text&&detailText?'\n'+detailText:'');
  }
  function invalidate(text){
    detailText='';
    if(host)host.invalidate();
    if(body)paint();
    if(heading)heading.textContent='';
    if(message&&dialog&&dialog.open)message.textContent=text||'内容が変わりました。条件を確認して生成し直してください。';
  }
  function clearHost(){detailText='';if(host)host.close();host=null;tickets.clear();if(body)body.textContent='';if(heading)heading.textContent='';}
  function addField(id,label,type){
    var wrap=node('label',undefined,'irp-field'),title=node('span',label),input=node(type==='select'?'select':'input');
    input.id='irp-'+id;input.name=id;if(type!=='select')input.type=type;
    input.required=true;fields[id]=input;wrap.append(title,input);form.append(wrap);return input;
  }
  function option(select,value,label){var o=node('option',label);o.value=value;select.append(o);}
  function catalog(){
    var before=saved();if(typeof before!=='string'||before.length>2000000)throw Error('report_snapshot_unavailable');
    var value=JSON.parse(before);
    if(!value||!value.stores||Array.isArray(value.stores)||!value.salesCountManagement||
      !Array.isArray(value.salesCountManagement.categories)||before!==saved())throw Error('report_catalog_unavailable');
    var profile={revision:'saved-preview-'+(++sequence),stores:Object.keys(value.stores).map(function(id){
      return {id:id,name:value.stores[id].name};
    })};
    // The configured reader independently validates the profile and every captured input.
    host=root.InsightReport.createSavedHost(profile);
    fields.store.replaceChildren();option(fields.store,'','店舗を選択');
    profile.stores.forEach(function(s){option(fields.store,s.id,s.name);});
    var selected=doc.getElementById('storeSel');
    fields.store.value=selected&&profile.stores.some(function(s){return s.id===selected.value;})?selected.value:'';
    fields.category.replaceChildren();option(fields.category,'','カテゴリーを選択');
    value.salesCountManagement.categories.forEach(function(c){
      if(c&&typeof c.id==='string'&&typeof c.name==='string')option(fields.category,c.id,c.name);
    });
    fields.category.value=''; // No implicit first-category selection.
  }
  function request(id){
    var s=storageState();
    return JSON.stringify({store_id:fields.store.value,
      period:{start:fields.start.value,end:fields.end.value},
      reference:{start:fields.referenceStart.value,end:fields.referenceEnd.value},
      quantity_day:fields.quantityDay.value,
      quantity_reference:{start:fields.quantityStart.value,end:fields.quantityEnd.value},
      category_id:fields.category.value,as_of:day(),comparison_confirmed:false,
      request_id:id,data_revision:'saved-revision-'+s.revision});
  }
  function generate(){
    invalidate('生成しています。');
    try{
      storageState();
      if(!host||!form.reportValidity())throw Error('report_conditions_required');
      var id='preview-'+(++sequence),captured=request(id),capturedRaw=null;
      var resolver=root.InsightTripHistoryResolver;
      var dependencies={source_revision:'insight-saved-calendar-v1',calendar_book:calendarFor(captured).calendar};
      if(resolver&&typeof resolver.resolveDate==='function')
        dependencies.resolver=function(snapshot,store,category,iso,options){return resolver.resolveDate(snapshot,store,category,iso,options);};
      if(!host.capture(function(){capturedRaw=saved();return capturedRaw;},function(){return request(id);},dependencies,{focus_limit:3,min_days:2,
        relative_threshold:{numerator:'1',denominator:'10'}}))throw Error('report_capture_rejected');
      // Recheck after capture; notifications and the revision are independent of raw equality.
      var capturedHost=host,capturedState=host.getState();
      var details=comparisonDetails(capturedRaw,captured,capturedState.report);
      if(capturedRaw!==saved()||captured!==request(id)||capturedHost!==host||
        host.getState().report!==capturedState.report)throw Error('report_conditions_changed');
      detailText=details;
      paint();
      heading.textContent=fields.category.options[fields.category.selectedIndex].textContent+' ／ 取得日時：'+
        new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
      message.textContent='保存済みの値から作成しました。本文末尾に「保存値の単純比較」と条件の注意点を表示しています。';
    }catch(_){
      invalidate('報告を生成できません。店舗・期間・カテゴリーと保存状態を確認してください。保存失敗や別タブ更新後は、未保存の入力を控えてから再読み込みしてください。');
    }finally{paint();}
  }
  function open(){
    clearHost();
    try{
      storageState();catalog();
      var today=day();
      fields.start.value=today;fields.end.value=today;
      fields.referenceStart.value=shift(today,-7);fields.referenceEnd.value=shift(today,-7);
      fields.quantityDay.value=today;fields.quantityStart.value=shift(today,-28);fields.quantityEnd.value=shift(today,-1);
      message.textContent='店舗・期間・カテゴリーを確認して生成してください。未保存の入力は含みません。';
    }catch(_){clearHost();message.textContent='保存済みのデータを確認できません。保存状態を確認し、必要なら未保存の入力を控えてから再読み込みしてください。';}
    if(!dialog.open)dialog.showModal();
  }
  function onStorageUpdate(event){
    if(!host)return;
    try{
      if(event.phase==='begin')tickets.set(event.ticket,host.beginUpdate('storage'));
      else if(event.phase==='finish'){
        var t=tickets.get(event.ticket);tickets.delete(event.ticket);
        if(t)host.finishUpdate(t,event.outcome);
      }else if(event.phase==='external')host.externalChange();
    }finally{
      paint();heading.textContent='';
      if(dialog.open)message.textContent='保存状態が変わったため報告を消しました。処理完了後、条件を確認して生成し直してください。';
    }
  }
  function init(){
    var nav=doc.querySelector('#sidebar .sidebar-btns');if(!nav||!root.InsightReport)return;
    button=node('button','保存時点の定型報告','sidebar-btn');button.id='insightReportOpen';button.type='button';
    button.addEventListener('click',open);nav.prepend(button);
    dialog=node('dialog',undefined,'irp-dialog');dialog.id='insightReportDialog';dialog.setAttribute('aria-labelledby','irp-title');
    var top=node('header',undefined,'irp-head'),title=node('h2','保存時点の定型報告'),close=node('button','閉じる');
    title.id='irp-title';close.type='button';close.addEventListener('click',function(){dialog.close();});
    top.append(title,close);
    var note=node('p','保存済みの値を端末内で集計します。未保存の入力は含めず、通信・モデル呼出し・報告の保存は行いません。','irp-note');
    form=node('form',undefined,'irp-grid');form.id='insightReportConditions';
    addField('store','対象店舗','select');addField('category','数量カテゴリー','select');
    addField('start','対象期間・開始','date');addField('end','対象期間・終了','date');
    addField('referenceStart','比較期間・開始','date');addField('referenceEnd','比較期間・終了','date');
    addField('quantityDay','日合計の対象日','date').parentElement.classList.add('irp-full');
    addField('quantityStart','参考平日平均の期間・開始','date');addField('quantityEnd','参考平日平均の期間・終了','date');
    var actions=node('div',undefined,'irp-actions'),submit=node('button','報告を生成');
    submit.id='insightReportGenerate';submit.type='submit';actions.append(submit);form.append(actions);
    form.addEventListener('submit',function(e){e.preventDefault();generate();});
    form.addEventListener('input',function(){invalidate();});form.addEventListener('change',function(){invalidate();});
    message=node('p','','irp-message');message.id='insightReportStatus';message.setAttribute('role','status');
    heading=node('p','','irp-note');heading.id='insightReportCapturedAt';
    body=node('pre','','irp-output');body.id='insightReportText';
    dialog.append(top,note,form,message,heading,body);doc.body.append(dialog);
    dialog.addEventListener('close',clearHost);dialog.addEventListener('cancel',clearHost);
    function outside(event){if(dialog.open&&!dialog.contains(event.target)&&event.target!==button)invalidate();}
    ['pointerdown','input','change','click'].forEach(function(type){doc.addEventListener(type,outside,true);});
    root.addEventListener('pageshow',function(){invalidate('再表示されたため報告を消しました。生成し直してください。');});
    doc.addEventListener('visibilitychange',function(){invalidate('表示状態が変わったため報告を消しました。生成し直してください。');});
    lastDay=day();
    root.setInterval(function(){var current=day();if(current!==lastDay){lastDay=current;invalidate('日付が変わったため報告を消しました。生成し直してください。');}},1000);
  }
  root.InsightReportPreview=Object.freeze({onStorageUpdate:onStorageUpdate});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
