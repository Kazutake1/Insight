/* ══ Constants ══ */
const MONTHS=["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const DAYS_IN_MONTH=[31,28,31,30,31,30,31,31,30,31,30,31];
const HAIKI_CATS=["米飯","調理パン","麺類・その他","デリカテッセン","スイーツ","FF","その他デイリー","パン・ペストリー"];
const HAIKI_COLORS=["#7f1d1d","#991b1b","#b91c1c","#dc2626","#ef4444","#f87171","#fca5a5","#fecaca"];
const WEEKDAYS=["日","月","火","水","木","金","土"];
const WX_KEYS=["快晴","晴","晴曇","曇","小雨","雨","大雨","みぞれ","雪"];
const WX_ICONS={"快晴":"☀️","晴":"🌤️","晴曇":"⛅","曇":"☁️","小雨":"🌦️","雨":"🌧️","大雨":"⛈️","みぞれ":"🌨️","雪":"❄️","":""};
const SK="insight_v11";

function migrateOldData(old){
  // v9以前の単店舗データをマイグレーション
  const t=todayFY();
  const sid="store_1";
  return{current:sid,stores:{[sid]:{name:"本店",years:old.years||[t.fy],data:old.data||{[t.fy]:blankYearData(t.fy)}}}};
}

function loadAll(){
  function failStoredDataLoad(error){
    try{
      document.body.innerHTML="";
      const box=document.createElement("div");
      box.id="insightStorageLoadError";
      box.style.cssText="max-width:720px;margin:48px auto;padding:24px;font-family:-apple-system,Hiragino Kaku Gothic ProN,Noto Sans JP,sans-serif;color:#1a1a1a;background:#fff;border:1px solid #e5e7eb;border-radius:16px";
      const heading=document.createElement("h2");
      heading.style.cssText="margin:0 0 12px;font-size:18px";
      heading.textContent="保存済みデータを読み込めませんでした";
      const first=document.createElement("p");
      first.style.cssText="margin:0 0 10px;line-height:1.7";
      first.textContent="安全のため、空のデータでは起動していません。現在の保存データは上書きしていません。";
      const second=document.createElement("p");
      second.style.cssText="margin:0 0 12px;line-height:1.7;color:#666";
      second.textContent="この画面のまま新しいデータを保存せず、保存データの確認を行ってください。";
      const reason=document.createElement("p");
      reason.id="insightStorageLoadReason";
      reason.style.cssText="margin:0 0 16px;padding:10px 12px;border-radius:10px;background:#f7f7f8;color:#555;font-size:12px;line-height:1.6;word-break:break-word";
      reason.textContent="読込エラー: "+String(error&&error.message?error.message:error);
      const actions=document.createElement("div");
      actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
      const exportButton=document.createElement("button");
      exportButton.id="insightStorageExportRaw";
      exportButton.type="button";
      exportButton.textContent="保存データを書き出す";
      exportButton.style.cssText="border:0;border-radius:10px;background:#1a1a1a;color:#fff;padding:10px 14px;font-weight:700;font-family:inherit";
      exportButton.onclick=function(){
        try{
          const raw=localStorage.getItem(SK);
          if(raw===null)throw new Error("保存データが見つかりません");
          const blob=new Blob([raw],{type:"application/json"});
          const url=URL.createObjectURL(blob);
          const a=document.createElement("a");
          a.href=url;
          a.download="Insight_raw_storage_"+new Date().toISOString().slice(0,10)+".json";
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(function(){URL.revokeObjectURL(url);},1000);
        }catch(exportError){
          alert("保存データを書き出せませんでした。\n"+String(exportError&&exportError.message?exportError.message:exportError));
        }
      };
      actions.append(exportButton);
      box.append(heading,first,second,reason,actions);
      document.body.append(box);
    }catch(_){}
    const loadError=new Error("Insight stored data load failed");
    loadError.name="InsightLoadError";
    loadError.cause=error;
    throw loadError;
  }
  const current=localStorage.getItem(SK);
  if(current!==null){
    try{
      const all=JSON.parse(current);
      if(!all||typeof all!=="object"||Array.isArray(all)||!all.stores||typeof all.stores!=="object"||Array.isArray(all.stores)||!Object.keys(all.stores).length)throw new Error("店舗データがありません");
      if(typeof all.current!=="string"||!all.stores[all.current])throw new Error("現在店舗の情報が不正です");
      Object.values(all.stores).forEach(st=>{
        if(!st||typeof st!=="object"||Array.isArray(st)||!st.data||typeof st.data!=="object"||Array.isArray(st.data))throw new Error("店舗データが不正です");
        const activeYears=Array.isArray(st.years)&&st.years.length?new Set(st.years.map(String)):null;
        Object.entries(st.data).forEach(([yearKey,yd])=>{
          if(activeYears&&!activeYears.has(String(yearKey)))return;
          if(!yd||typeof yd!=="object"||Array.isArray(yd))throw new Error("年度データが不正です");
          Object.values(yd).forEach(rows=>{
            if(Array.isArray(rows))rows.forEach(r=>{
              if(!r||typeof r!=="object"||Array.isArray(r))throw new Error("日別データが不正です");
              if(!r.haiki)r.haiki=blankHaiki();
              if(r.weather===undefined)r.weather="";
            });
          });
        });
      });
      return all;
    }catch(e){return failStoredDataLoad(e);}
  }
  for(const oldKey of["insight_v9","insight_v8"]){
    const old=localStorage.getItem(oldKey);
    if(old!==null){
      try{return migrateOldData(JSON.parse(old));}
      catch(e){return failStoredDataLoad(e);}
    }
  }
  const t=todayFY();
  const sid="store_1";
  return{current:sid,stores:{[sid]:{name:"店舗1",years:[t.fy],data:{[t.fy]:blankYearData(t.fy)}}}};
}

function persist(){
  try{localStorage.setItem(SK,JSON.stringify(allStores));}catch(e){}
}

/* ══ 共有天気 ══ */
function wxKey(year,mName,day){return`${year}-${mName}-${day}`;}
function getSharedWeather(year,mName,day){
  return(allStores.sharedWeather||{})[wxKey(year,mName,day)]||"";
}
function setSharedWeather(year,mName,day,wx){
  if(!allStores.sharedWeather)allStores.sharedWeather={};
  allStores.sharedWeather[wxKey(year,mName,day)]=wx;
  // 全店舗の同じ日付に反映
  Object.values(allStores.stores).forEach(st=>{
    const rows=st.data?.[year]?.[mName];
    if(!rows)return;
    const ri=parseInt(day)-1;
    if(rows[ri])rows[ri].weather=wx;
  });
  persist();
}
function applySharedWeatherToStore(st){
  const sw=allStores.sharedWeather||{};
  Object.entries(sw).forEach(([key,wx])=>{
    const [year,mName,day]=key.split('-');
    if(!mName||!day)return;
    // key形式: "2025-1月-1" → split('-') = ["2025","1月","1"]
    const rows=st.data?.[year]?.[mName];
    if(!rows)return;
    const ri=parseInt(day)-1;
    if(rows[ri]&&!rows[ri].weather)rows[ri].weather=wx;
  });
}

const METRICS=[
  {key:"売上",label:"売上",unit:"千円",up:true,
   color:"#166534",colorBg:"rgba(22,101,52,0.08)",
   fmt:v=>`${v.toLocaleString()}千円`,
   short:v=>`${v.toLocaleString()}<span class="kpi-unit">千円</span>`,
   yFmt:v=>v>=1000?`${(v/1000).toFixed(0)}万`:`${v}千`},
  {key:"客数",label:"客数",unit:"人",up:true,
   color:"#555",colorBg:"rgba(80,80,80,0.07)",
   fmt:v=>`${v.toLocaleString()}人`,short:v=>`${v.toLocaleString()}<span class="kpi-unit">人</span>`,
   yFmt:v=>`${(v/1000).toFixed(1)}k`},
  {key:"買上点数",label:"買上点数",unit:"点",up:true,
   color:"#1e40af",colorBg:"rgba(30,64,175,0.08)",
   fmt:v=>`${v.toLocaleString()}点`,short:v=>`${v.toFixed(2)}<span class="kpi-unit">点</span>`,
   yFmt:v=>`${(v/1000).toFixed(1)}k`},
  {key:"廃棄金額",label:"廃棄金額",unit:"円",up:false,
   color:"#b91c1c",colorBg:"rgba(185,28,28,0.08)",
   fmt:v=>`¥${v.toLocaleString()}`,short:v=>`¥${v.toLocaleString()}`,
   yFmt:v=>v>=10000?`${(v/10000).toFixed(0)}万`:`${v}`},
];

/* ══ カンマ入力ユーティリティ ══ */
function toComma(v){
  const n=parseInt(String(v).replace(/,/g,""))||0;
  return n===0?"":n.toLocaleString();
}
function fromComma(v){return parseInt(String(v).replace(/,/g,""))||0;}
function fromCommaFloat(v){return parseFloat(String(v).replace(/,/g,""))||0;}

// 計算式を安全に評価（+,-,*,/のみ対応）
function evalFormula(str){
  const s=String(str).replace(/,/g,"").trim();
  if(!s)return 0;
  // 数字・演算子・小数点・スペースのみ許可
  if(!/^[\d\s\+\-\*\/\.]+$/.test(s))return fromCommaFloat(s);
  try{
    // トークン分割で安全に計算
    const tokens=s.match(/[\d\.]+|[\+\-\*\/]/g)||[];
    if(!tokens.length)return 0;
    // 掛け算・割り算を先に処理
    let i=0;const nums=[];const ops=[];
    tokens.forEach(t=>{
      if(/[\d\.]+/.test(t))nums.push(parseFloat(t));
      else ops.push(t);
    });
    // 演算子と数値を交互に処理（掛割優先）
    let result=[nums[0]];let resOps=[];
    for(let j=0;j<ops.length;j++){
      if(ops[j]==="*"||ops[j]==="/"){
        const a=result.pop();
        const b=nums[j+1];
        result.push(ops[j]==="*"?a*b:b!==0?a/b:0);
      }else{
        result.push(nums[j+1]);
        resOps.push(ops[j]);
      }
    }
    let final=result[0];
    for(let j=0;j<resOps.length;j++){
      final=resOps[j]==="+"?final+result[j+1]:final-result[j+1];
    }
    return isNaN(final)||final<0?0:Math.round(final);
  }catch(e){return fromCommaFloat(s);}
}

function commaBlurWithFormula(el){
  const n=evalFormula(el.value);
  el.value=n>0?n.toLocaleString():"";
  return n;
}
function commaFocus(el){
  const n=fromCommaFloat(el.value);
  el.value=n||"";
}
function commaBlur(el){
  const n=fromComma(el.value);
  el.value=n>0?n.toLocaleString():"";
}
function commaFloatBlur(el,decimals=2){
  const n=fromCommaFloat(el.value);
  el.value=n>0?n.toFixed(decimals):"";
}
function applyCommaInput(el){
  el.addEventListener("focus",()=>commaFocus(el));
  el.addEventListener("blur",()=>commaBlur(el));
  const n=fromComma(el.value);
  if(n>0)el.value=n.toLocaleString();
}
function applyCommaFloatInput(el,decimals=2){
  el.addEventListener("focus",()=>commaFocus(el));
  el.addEventListener("blur",()=>commaFloatBlur(el,decimals));
  const n=fromCommaFloat(el.value);
  if(n>0)el.value=n.toFixed(decimals);
}

/* ══ Date helpers ══ */
function getWeekday(fyear,mIdx,day){
  const cy=parseInt(fyear);
  const cm=mIdx+1; // 1月=1, 12月=12
  return new Date(cy,cm-1,day).getDay(); // 0=Sun
}
function todayFY(){
  const t=new Date();
  const y=t.getFullYear(),m=t.getMonth()+1,d=t.getDate();
  const mIdx=m-1; // 0始まり
  return{fy:String(y),mIdx,month:MONTHS[mIdx],day:d};
}

/* ══ Data ══ */
function blankHaiki(){const h={};HAIKI_CATS.forEach(c=>{h[c]=0;});return h;}
function blankRow(d){return{d:String(d),売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:blankHaiki(),weather:""};}

/* ══ KPI Calculation Engine v1 ══
   既存UI・保存形式には影響を与えず、store.data の日別データから
   経営分析用KPIを算出する純粋な計算レイヤー。
   売上は既存仕様どおり「千円」保存、返却値では円換算値も用意する。
════════════════════════════════ */
function kpiNum(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function getRowWasteYen(row){
  if(!row)return 0;
  const byCategory=HAIKI_CATS.reduce((sum,c)=>sum+kpiNum(row.haiki?.[c]),0);
  // カテゴリー内訳がある場合はそれを正とし、旧データ等では廃棄金額へフォールバック
  return byCategory>0?byCategory:kpiNum(row.廃棄金額);
}

function hasKPIInput(row){
  if(!row)return false;
  return kpiNum(row.売上)>0 || kpiNum(row.客数)>0 || kpiNum(row.買上点数)>0 || getRowWasteYen(row)>0;
}

function calcKPI(rows){
  const list=Array.isArray(rows)?rows:[];
  const entered=list.filter(hasKPIInput);

  const salesKyen=entered.reduce((sum,row)=>sum+kpiNum(row.売上),0);
  const salesYen=salesKyen*1000;
  const customers=entered.reduce((sum,row)=>sum+kpiNum(row.客数),0);
  const items=entered.reduce((sum,row)=>sum+kpiNum(row.買上点数),0);
  const wasteYen=entered.reduce((sum,row)=>sum+getRowWasteYen(row),0);
  const inputDays=entered.length;

  return {
    // 元KPI
    salesKyen,
    salesYen,
    customers,
    items,
    wasteYen,
    inputDays,

    // 派生KPI
    customerUnitPrice: customers>0 ? salesYen/customers : 0,       // 客単価（円/人）
    itemsPerCustomer: customers>0 ? items/customers : 0,           // 1人当たり買上点数（点/人）
    salesPerItem: items>0 ? salesYen/items : 0,                    // 1点当たり売上（円/点）
    wasteRate: salesYen>0 ? (wasteYen/salesYen)*100 : 0,           // 廃棄率（%）
    avgDailySalesYen: inputDays>0 ? salesYen/inputDays : 0,        // 入力日平均売上（円/日）
    avgDailyCustomers: inputDays>0 ? customers/inputDays : 0,      // 入力日平均客数（人/日）
    avgDailyItems: inputDays>0 ? items/inputDays : 0,              // 入力日平均買上点数（点/日）
    avgDailyWasteYen: inputDays>0 ? wasteYen/inputDays : 0         // 入力日平均廃棄額（円/日）
  };
}

function getKPIRows(year,month,throughDay=null){
  const rows=store?.data?.[String(year)]?.[month] || [];
  if(throughDay==null)return rows;
  const end=Math.max(0,Math.min(rows.length,Math.floor(kpiNum(throughDay))));
  return rows.slice(0,end);
}

function getPeriodKPI(year,month,throughDay=null){
  return calcKPI(getKPIRows(year,month,throughDay));
}

// 後続の前年比較・異常検知・AIパネルから安全に呼び出せる共通窓口
window.KPIEngine={
  calc:calcKPI,
  getPeriod:getPeriodKPI,
  getRows:getKPIRows,
  getRowWasteYen
};

/* ══ Year-over-year comparison engine (calculation only / no UI changes) ══ */
function calcYoYChange(current,previous){
  const cur=kpiNum(current),prev=kpiNum(previous);
  if(prev===0)return null;
  const pct=((cur-prev)/prev)*100;
  return {
    current:cur,
    previous:prev,
    difference:cur-prev,
    pct,
    direction:pct>0?"up":pct<0?"down":"flat"
  };
}

function calcPointChange(current,previous){
  const cur=kpiNum(current),prev=kpiNum(previous);
  return {
    current:cur,
    previous:prev,
    difference:cur-prev,
    point:cur-prev,
    direction:cur>prev?"up":cur<prev?"down":"flat"
  };
}

function compareKPIYoY(currentKPI,previousKPI){
  const cur=currentKPI||calcKPI([]);
  const prev=previousKPI||calcKPI([]);
  return {
    salesYen:calcYoYChange(cur.salesYen,prev.salesYen),
    customers:calcYoYChange(cur.customers,prev.customers),
    items:calcYoYChange(cur.items,prev.items),
    wasteYen:calcYoYChange(cur.wasteYen,prev.wasteYen),
    customerUnitPrice:calcYoYChange(cur.customerUnitPrice,prev.customerUnitPrice),
    itemsPerCustomer:calcYoYChange(cur.itemsPerCustomer,prev.itemsPerCustomer),
    salesPerItem:calcYoYChange(cur.salesPerItem,prev.salesPerItem),
    // 比率同士は前年比率ではなく前年差（percentage point）で比較
    wasteRate:calcPointChange(cur.wasteRate,prev.wasteRate),
    avgDailySalesYen:calcYoYChange(cur.avgDailySalesYen,prev.avgDailySalesYen),
    avgDailyCustomers:calcYoYChange(cur.avgDailyCustomers,prev.avgDailyCustomers),
    avgDailyItems:calcYoYChange(cur.avgDailyItems,prev.avgDailyItems),
    avgDailyWasteYen:calcYoYChange(cur.avgDailyWasteYen,prev.avgDailyWasteYen)
  };
}

function getPeriodYoY(baseYear,month,throughDay=null,compareYear=null){
  const by=String(baseYear);
  const cy=compareYear!=null?String(compareYear):String(parseInt(by,10)-1);
  const current=KPIEngine.getPeriod(by,month,throughDay);
  const previous=KPIEngine.getPeriod(cy,month,throughDay);
  return {
    baseYear:by,
    compareYear:cy,
    month,
    throughDay:throughDay==null?null:Math.floor(kpiNum(throughDay)),
    current,
    previous,
    comparison:compareKPIYoY(current,previous)
  };
}

window.YearComparisonEngine={
  change:calcYoYChange,
  pointChange:calcPointChange,
  compare:compareKPIYoY,
  getPeriod:getPeriodYoY
};

/* ══ Management Comment Engine v1 (comment generation only / no anomaly detection / no UI changes) ══
   KPI と前年比較結果から、経営状況を説明する文章を生成する純粋な文章生成レイヤー。
   警告判定・異常判定・スコアリングは行わない。
════════════════════════════════ */
function formatPctForComment(change,digits=1){
  if(!change || change.pct==null || !Number.isFinite(change.pct))return "比較不可";
  const sign=change.pct>0?"+":"";
  return `${sign}${change.pct.toFixed(digits)}%`;
}

function formatPointForComment(change,digits=1){
  if(!change || change.point==null || !Number.isFinite(change.point))return "比較不可";
  const sign=change.point>0?"+":"";
  return `${sign}${change.point.toFixed(digits)}pt`;
}

function relationWord(change){
  if(!change)return "比較できません";
  if(change.direction==="up")return "上回っています";
  if(change.direction==="down")return "下回っています";
  return "前年と同水準です";
}

function generateManagementCommentFromYoY(yoyResult){
  const r=yoyResult||{};
  const c=r.comparison||{};
  const comments=[];
  const sales=c.salesYen, customers=c.customers, unit=c.customerUnitPrice;
  const items=c.items, itemsPerCustomer=c.itemsPerCustomer, salesPerItem=c.salesPerItem;
  const waste=c.wasteYen, wasteRate=c.wasteRate;

  // 売上・客数・客単価の関係を説明
  if(sales && customers && unit){
    if(sales.direction==="up" && customers.direction==="up"){
      comments.push(`売上は前年比${formatPctForComment(sales)}、客数は${formatPctForComment(customers)}で、いずれも前年を上回っています。客単価は${formatPctForComment(unit)}です。`);
    }else if(sales.direction==="down" && customers.direction==="down"){
      comments.push(`売上は前年比${formatPctForComment(sales)}、客数は${formatPctForComment(customers)}で、いずれも前年を下回っています。客単価は${formatPctForComment(unit)}です。`);
    }else if(sales.direction==="down" && customers.direction==="up"){
      comments.push(`客数は前年比${formatPctForComment(customers)}と前年を上回っていますが、売上は${formatPctForComment(sales)}です。客単価は${formatPctForComment(unit)}で、売上との関係を確認できます。`);
    }else if(sales.direction==="up" && customers.direction==="down"){
      comments.push(`客数は前年比${formatPctForComment(customers)}と前年を下回っていますが、売上は${formatPctForComment(sales)}です。客単価は${formatPctForComment(unit)}です。`);
    }else{
      comments.push(`売上は前年比${formatPctForComment(sales)}、客数は${formatPctForComment(customers)}、客単価は${formatPctForComment(unit)}です。`);
    }
  }

  // 買上点数と購買構成を説明
  if(items && itemsPerCustomer && salesPerItem){
    comments.push(`買上点数は前年比${formatPctForComment(items)}、1人当たり買上点数は${formatPctForComment(itemsPerCustomer)}、1点当たり売上は${formatPctForComment(salesPerItem)}です。`);
  }

  // 廃棄状況を説明（判定はしない）
  if(waste && wasteRate){
    comments.push(`廃棄額は前年比${formatPctForComment(waste)}、廃棄率は前年差${formatPointForComment(wasteRate)}です。`);
  }

  if(comments.length===0){
    comments.push("前年比較に必要なデータが不足しているため、経営コメントを生成できません。");
  }

  return {
    baseYear:r.baseYear??null,
    compareYear:r.compareYear??null,
    month:r.month??null,
    throughDay:r.throughDay??null,
    comments,
    text:comments.join("\n")
  };
}

function getPeriodManagementComment(baseYear,month,throughDay=null,compareYear=null){
  const yoy=YearComparisonEngine.getPeriod(baseYear,month,throughDay,compareYear);
  return generateManagementCommentFromYoY(yoy);
}

window.ManagementCommentEngine={
  generate:generateManagementCommentFromYoY,
  getPeriod:getPeriodManagementComment
};
function blankMonthData(mi,fy){
  // 2月（mIdx=1）のうるう年対応
  const days=(mi===1&&fy&&parseInt(fy)%4===0&&(parseInt(fy)%100!==0||parseInt(fy)%400===0))?29:DAYS_IN_MONTH[mi];
  return Array.from({length:days},(_,di)=>blankRow(di+1));
}
function blankYearData(fy){const d={};MONTHS.forEach((m,mi)=>{d[m]=blankMonthData(mi,fy);});return d;}

function sampleYearData(factor){
  const base={
    売上:[82000,94000,78000,105000,112000,99000,124000,131000,156000,118000,129000,142000],
    客数:[1640,1880,1560,2100,2240,1980,2480,2620,3120,2360,2580,2840],
    買上点数:[5248,5828,4836,6510,6944,6138,7688,8122,9672,7316,7998,8804],
    廃棄金額:[328000,376000,390000,315000,280000,360000,290000,305000,260000,340000,310000,275000],
  };
  const hRatio=[0.28,0.18,0.16,0.14,0.13,0.11];
  const wxList=["快晴","晴","晴","晴曇","曇","小雨","雨","晴"];
  const daily={};
  MONTHS.forEach((m,mi)=>{
    const days=DAYS_IN_MONTH[mi];
    daily[m]=Array.from({length:days},(_,di)=>{
      const d=di+1,row={d:String(d)};
      const r1=((d*17+mi*31)%97)/97,t=d/days;
      row.売上=Math.round(base.売上[mi]*factor/days*(0.5+r1*1.2)*(0.85+t*0.3));
      const r2=((d*17+mi*31+7)%97)/97;
      row.客数=Math.round(base.客数[mi]*factor/days*(0.5+r2*1.2)*(0.85+t*0.3));
      const r3=((d*17+mi*31+14)%97)/97;
      row.買上点数=Math.round(base.買上点数[mi]*factor/days*(0.5+r3*1.2)*(0.85+t*0.3));
      const r4=((d*17+mi*31+21)%97)/97;
      row.廃棄金額=Math.round(base.廃棄金額[mi]*factor/days*(0.5+r4*1.2)*(0.85+t*0.3));
      const h={};let acc=0;
      HAIKI_CATS.forEach((c,ci)=>{
        const nr=((d*13+mi*23+ci*11)%97)/97;
        h[c]=ci===HAIKI_CATS.length-1?Math.max(0,row.廃棄金額-acc):Math.round(row.廃棄金額*hRatio[ci]*(0.7+nr*0.6));
        acc+=h[c];
      });
      row.haiki=h;
      row.weather=wxList[(d+mi)%wxList.length];
      return row;
    });
  });
  return daily;
}


/* ══ State ══ */
let allStores=loadAll();  // 新旧どちらの形式でも初期値取得
// 旧形式（単店舗）を多店舗形式に変換
if(!allStores.stores){
  const sid="store_1";
  allStores={current:sid,stores:{[sid]:{name:"本店",years:allStores.years,data:allStores.data}}};
}
let store=allStores.stores[allStores.current];

let baseYear=store.years[store.years.length-1];
let cmpYear=store.years.length>1?store.years[store.years.length-2]:null;
let viewMode="月",selMonth=MONTHS[new Date().getMonth()];
let activeMetrics=["売上","客数"];
let currentNav=0;
let editYear={sales:baseYear,kyaku:baseYear,haiki:baseYear};
let editMonth={sales:"4月",kyaku:"4月",haiki:"4月"};
let drafts={sales:[],kyaku:[],haiki:[]};
let yearToDelete=null;
let quickWeather="快晴";
let todayInfo=todayFY();
let quickEditDay=todayInfo.day; // which day is shown in quick view
let mainChartInst=null,donutInst=null,wdChartInst=null,haikiBarInst=null,haikiWdChartInst=null;
let salesLineInst=null,salesWdInst=null,kyakuLineInst=null,kyakuWdInst=null;
let wdPeriod=1; // 1,3,6ヶ月
let donutMode="amount"; // 'amount' | 'percent'

/* ══ Theme ══ */
/* ══ 店舗管理 ══ */
function genStoreId(){return"store_"+Date.now();}

function renderStoreSel(){
  const sel=document.getElementById("storeSel");
  if(!sel)return;
  sel.innerHTML="";
  Object.entries(allStores.stores).forEach(([id,st])=>{
    const opt=document.createElement("option");
    opt.value=id;
    opt.textContent=st.name;
    if(id===allStores.current)opt.selected=true;
    sel.appendChild(opt);
  });
}

function switchStore(id){
  if(!allStores.stores[id])return;
  allStores.current=id;
  store=allStores.stores[id];
  baseYear=store.years[store.years.length-1];
  cmpYear=store.years.length>1?store.years[store.years.length-2]:null;
  editYear={sales:baseYear,kyaku:baseYear,haiki:baseYear};
  const t=todayFY();
  editMonth={sales:t.month,kyaku:t.month,haiki:t.month};
  // 共有天気を新店舗に適用
  applySharedWeatherToStore(store);
  persist();
  renderStoreSel();
  if(currentNav===0)initQuickPage();
  else if(currentNav===1)refreshDash();
  else initInputPage(["","","sales","kyaku","haiki"][currentNav]);
  updateMissingBadge();
  document.getElementById("storeMenu").classList.remove("is-open");
}

function showStoreMenu(){
  const menu=document.getElementById("storeMenu");
  if(menu.classList.contains("is-open")){menu.classList.remove("is-open");return;}
  menu.innerHTML="";

  // 店舗名変更
  const rename=document.createElement("button");
  rename.className="store-menu-item";
  rename.innerHTML=`<span>✏️</span> 店舗名を変更`;
  rename.onclick=()=>{
    const cur=allStores.stores[allStores.current];
    const name=prompt("店舗名を入力してください",cur.name);
    if(name&&name.trim()){
      cur.name=name.trim();persist();renderStoreSel();
    }
    menu.classList.remove("is-open");
  };
  menu.appendChild(rename);

  // 新しい店舗を追加
  const add=document.createElement("button");
  add.className="store-menu-item";
  add.innerHTML=`<span>＋</span> 新しい店舗を追加`;
  add.onclick=()=>{
    const name=prompt("新しい店舗名を入力してください","店舗2");
    if(name&&name.trim()){
      const id=genStoreId();
      const t=todayFY();
      allStores.stores[id]={name:name.trim(),years:[t.fy],data:{[t.fy]:blankYearData(t.fy)}};
      persist();
      switchStore(id);
    }
    menu.classList.remove("is-open");
  };
  menu.appendChild(add);

  // 区切り線
  if(Object.keys(allStores.stores).length>1){
    const sep=document.createElement("div");sep.className="store-menu-sep";menu.appendChild(sep);

    // この店舗を削除
    const del=document.createElement("button");
    del.className="store-menu-item danger";
    del.innerHTML=`<span>🗑</span> この店舗を削除`;
    del.onclick=()=>{
      const cur=allStores.stores[allStores.current];
      if(!confirm(`「${cur.name}」を削除します。\nこの店舗のデータはすべて消えます。よろしいですか？`)){
        menu.classList.remove("is-open");return;
      }
      const ids=Object.keys(allStores.stores);
      const nextId=ids.find(id=>id!==allStores.current)||ids[0];
      delete allStores.stores[allStores.current];
      persist();
      switchStore(nextId);
      menu.classList.remove("is-open");
    };
    menu.appendChild(del);
  }

  menu.classList.add("is-open");

  // メニュー外クリックで閉じる
  setTimeout(()=>{
    document.addEventListener("click",function closeMenu(e){
      if(!menu.contains(e.target)&&e.target.id!=="storeMenuBtn"){
        menu.classList.remove("is-open");
      }
      document.removeEventListener("click",closeMenu);
    });
  },50);
}

const THEMES={
  mono:{primary:"#1a1a1a",secondary:"#888",accent:"#555",bg:"rgba(26,26,26,0.07)"},
};

function applyTheme(t){
  const th=THEMES[t]||THEMES.mono;
  document.documentElement.style.setProperty("--c-primary",th.primary);
  document.documentElement.style.setProperty("--c-secondary",th.secondary);
  document.documentElement.style.setProperty("--c-accent",th.accent);
  document.documentElement.style.setProperty("--c-bg",th.bg);
  document.querySelectorAll(".theme-btn").forEach(b=>{
    b.classList.toggle("active",b.onclick?.toString().includes(`'${t}'`)||b.getAttribute("onclick")?.includes(`'${t}'`));
  });
}
function setTheme(t){store.theme=t;persist();applyTheme(t);if(currentNav===1)refreshDash();}

/* ══ Nav ══ */
function gotoNav(i){
  [0,1,2,3,4].forEach(j=>document.getElementById(`nav${j}`).classList.toggle("active",j===i));
  currentNav=i;
  ["pageQuick","pageDash","pageSales","pageKyaku","pageHaiki"].forEach((id,j)=>{
    document.getElementById(id).classList.toggle("show",j===i);
  });
  if(i===0)initQuickPage();
  else if(i===1)refreshDash();
  else if(i===2){editYear.sales=null;initInputPage("sales");}
  else if(i===3){editYear.kyaku=null;initInputPage("kyaku");}
  else if(i===4){editYear.haiki=null;initInputPage("haiki");}
}

/* ══ Quick input page ══ */
function initQuickPage(){
  todayInfo=todayFY();
  document.getElementById("todayBadge").textContent="今日";
  renderQuickNav();
  renderQuickPage();
  // 今日のページを開いたとき、天気が未設定なら自動取得
  if(quickEditDay===todayInfo.day){
    const fy=todayInfo.fy,month=todayInfo.month;
    const row=store.data[fy]?.[month]?.[quickEditDay-1];
    if(!row||!row.weather){
      fetchWeather();
    }
  }
}

function renderQuickNav(){
  // Show prev/next day navigation around today
  const nav=document.getElementById("qNavRow");
  nav.innerHTML="";
  // Show a few days around today for quick access
  const mi=MONTHS.indexOf(todayInfo.month);
  const maxDay=DAYS_IN_MONTH[mi];
  const days=[];
  for(let d=Math.max(1,quickEditDay-2);d<=Math.min(maxDay,quickEditDay+2);d++)days.push(d);
  days.forEach(d=>{
    const btn=document.createElement("button");
    btn.className="qnav"+(d===quickEditDay?" active":"");
    btn.textContent=`${d}日`;
    btn.onclick=()=>{quickEditDay=d;renderQuickNav();renderQuickPage();};
    nav.appendChild(btn);
  });
}

function renderQuickPage(){
  const fy=todayInfo.fy,mIdx=todayInfo.mIdx,month=todayInfo.month;
  const wdIdx=getWeekday(fy,mIdx,quickEditDay);
  const wd=WEEKDAYS[wdIdx];
  const isSat=wdIdx===6;
  const isSunOrHol=wdIdx===0||isHolidayFY(fy,mIdx,quickEditDay);

  // Header
  document.getElementById("qDate").textContent=`${month} ${quickEditDay}日`;
  const wdEl=document.getElementById("qWeekday");
  wdEl.textContent=`${wd}曜日`;
  wdEl.className="quick-weekday"+(isSunOrHol?" holiday":isSat?" sat":"");

  // Load existing data for this day
  const rows=store.data[fy]?.[month]||[];
  const existingRow=rows[quickEditDay-1]||blankRow(quickEditDay);
  quickWeather=existingRow.weather||"快晴";

  // Set weather buttons
  document.querySelectorAll(".wx-btn").forEach(b=>{
    b.classList.toggle("active",b.dataset.wx===quickWeather);
  });

  // Build quick grid
  const grid=document.getElementById("quickGrid");
  grid.innerHTML="";

  // 売上 + 買上点数
  const secSales=document.createElement("div");secSales.className="quick-section";
  secSales.innerHTML=`<div class="qs-title">売上・点数</div>
    <div class="qs-field"><span class="qs-label">売上</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <input class="qs-input" id="qi_売上" type="text" inputmode="numeric"
          value="${existingRow.売上>0?existingRow.売上.toLocaleString():""}"
          placeholder="0">
        <span class="qs-unit">千円</span>
      </div></div>
    <div class="qs-field"><span class="qs-label">買上点数</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <input class="qs-input" id="qi_買上点数" type="number" inputmode="numeric"
          value="${existingRow.買上点数>0?existingRow.買上点数:""}"
          placeholder="0">
        <span class="qs-unit">点</span>
      </div></div>`;
  grid.appendChild(secSales);
  // DOM挿入後に適用
  const qiUriage=document.getElementById("qi_売上");
  if(qiUriage){
    qiUriage.addEventListener("focus",()=>{const n=fromComma(qiUriage.value);qiUriage.value=n>0?String(n):"";});
    qiUriage.addEventListener("blur",()=>commaBlurWithFormula(qiUriage));
  }

  // 客数
  const secKyaku=document.createElement("div");secKyaku.className="quick-section";
  secKyaku.innerHTML=`<div class="qs-title">客数</div>
    <div class="qs-field"><span class="qs-label">客数</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <input class="qs-input" id="qi_客数" type="number" inputmode="numeric"
          value="${existingRow.客数>0?existingRow.客数:""}"
          placeholder="0">
        <span class="qs-unit">人</span>
      </div></div>
    <div style="font-size:10px;color:var(--text5);margin-top:4px;">
      客単価: ¥${existingRow.客数>0?Math.round((existingRow.売上*1000)/existingRow.客数).toLocaleString():"-"}</div>`;
  grid.appendChild(secKyaku);

  // 廃棄
  const secHaiki=document.createElement("div");secHaiki.className="quick-section wide";
  let haikiFields=`<div class="qs-title">廃棄内訳（円）</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
  HAIKI_CATS.forEach(c=>{
    const hv=existingRow.haiki?.[c]||0;
    haikiFields+=`<div class="qs-field"><span class="qs-label" style="font-size:11.5px;">${c}</span>
      <input class="qs-input" id="qi_h_${c}" type="text" inputmode="numeric"
        value="${hv>0?hv.toLocaleString():""}"
        placeholder="0" style="width:90px;">
    </div>`;
  });
  haikiFields+=`</div>`;
  secHaiki.innerHTML=haikiFields;
  grid.appendChild(secHaiki);
  // DOM挿入後にカンマ入力適用
  HAIKI_CATS.forEach(c=>{
    const el=document.getElementById(`qi_h_${c}`);
    if(el){
      el.addEventListener("focus",()=>{const n=fromComma(el.value);el.value=n>0?String(n):"";});
      el.addEventListener("blur",()=>commaBlurWithFormula(el));
    }
  });
}

function setWeather(wx){
  quickWeather=wx;
  document.querySelectorAll(".wx-btn").forEach(b=>b.classList.toggle("active",b.dataset.wx===wx));
}

/* JMAコードを天気種別にマッピング */
function jmaCodeToWx(code){
  const c=parseInt(code)||0;
  if(c>=400) return "雪";
  if(c>=300){
    if(c===304||c===307||c===308)return"大雨";
    if(c===303||c===309||c===322)return"みぞれ";
    if(c===301||c===311||c===313||c===314||c===315)return"小雨";
    return"雨";
  }
  if(c>=200){
    if(c===201||c===210||c===211||c===223)return"晴曇";
    return"曇";
  }  // 100系
  if(c===100)return"快晴";
  if(c===101||c===110||c===111||c===130||c===131)return"晴曇";
  return"晴";
}

async function fetchWeather(){
  const btn=document.getElementById("autoWxBtn");
  const label=document.getElementById("autoWxLabel");
  label.textContent="取得中…";btn.disabled=true;
  try{
    // 気象庁 愛知県(230000) 予報API - CORSフリー公開API
    const res=await fetch("https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json");
    if(!res.ok)throw new Error("fetch failed");
    const data=await res.json();
    // timeSeries[0] = 天気予報, areas内で尾張(稲沢市エリア)を探す
    const ts=data[0]?.timeSeries?.[0];
    if(!ts)throw new Error("no data");
    const today=new Date().toISOString().slice(0,10);
    const todayIdx=ts.timeDefines.findIndex(t=>t.startsWith(today));
    // 尾張(230010)を優先、なければ最初のエリア
    const area=ts.areas.find(a=>a.area.code==="230010")||ts.areas[0];
    const idx=todayIdx>=0?todayIdx:0;
    const code=area?.weatherCodes?.[idx]||"100";
    const wx=jmaCodeToWx(code);
    const weatherText=area?.weathers?.[idx]||"";
    setWeather(wx);
    label.textContent=`取得済 ${WX_ICONS[wx]}`;
    setTimeout(()=>{label.textContent="自動取得";},3000);
    // ツールチップ的に気象庁のテキストを表示
    if(weatherText){
      btn.title=`気象庁: ${weatherText.trim()}`;
    }
  }catch(e){
    label.textContent="取得失敗";
    btn.title="気象庁APIへの接続に失敗しました。手動で選択してください。";
    setTimeout(()=>{label.textContent="自動取得";},3000);
  }finally{
    btn.disabled=false;
  }
}

function saveQuick(){
  const fy=todayInfo.fy,month=todayInfo.month;
  if(!store.data[fy])store.data[fy]=blankYearData(fy);
  if(!store.years.includes(fy)){store.years.push(fy);store.years.sort();}
  const rows=store.data[fy][month];
  const ri=quickEditDay-1;
  if(!rows[ri])rows[ri]=blankRow(quickEditDay);
  const r=rows[ri];
  r.売上=fromComma(document.getElementById("qi_売上")?.value)||0;
  r.客数=Number(document.getElementById("qi_客数")?.value)||0;
  r.買上点数=parseFloat(document.getElementById("qi_買上点数")?.value)||0;
  const h={};let total=0;
  HAIKI_CATS.forEach(c=>{
    h[c]=fromComma(document.getElementById(`qi_h_${c}`)?.value)||0;
    total+=h[c];
  });
  r.haiki=h;r.廃棄金額=total;r.weather=quickWeather;
  setSharedWeather(fy,month,quickEditDay,quickWeather);
  persist();
  // Flash feedback
  const btn=document.querySelector(".quick-save");
  btn.textContent="✓ 保存しました";btn.classList.add("is-saved-feedback");
  setTimeout(()=>{btn.textContent="保存する";btn.classList.remove("is-saved-feedback");},2000);
  updateMissingBadge();
}

/* ══ Year pills ══ */
function renderYearPills(){
  const base=document.getElementById("baseYearSel");
  const cmp=document.getElementById("cmpYearSel");
  if(!base||!cmp)return;

  // 基準年セレクター
  base.innerHTML=store.years.map(y=>`<option value="${y}" ${y===baseYear?"selected":""}>${y}年</option>`).join("");

  // 比較年セレクター（なし + 他の年）
  cmp.innerHTML=`<option value="" ${!cmpYear?"selected":""}>比較なし</option>`+
    store.years.filter(y=>y!==baseYear).map(y=>`<option value="${y}" ${y===cmpYear?"selected":""}>${y}年</option>`).join("");
}

function onBaseYearChange(y){
  baseYear=y;
  if(cmpYear===y)cmpYear=null;
  renderYearPills();refreshDash();
}
function onCmpYearChange(y){
  cmpYear=y||null;
  renderYearPills();refreshDash();
}
function selectYear(y){
  baseYear=y;cmpYear=null;renderYearPills();refreshDash();
}
function showAddYear(){
  const wrap=document.getElementById("addYearInlineWrap");if(!wrap)return;
  if(wrap.innerHTML)return;
  wrap.innerHTML=`<span style="display:inline-flex;align-items:center;gap:5px;">
    <input id="ayInput" type="number" placeholder="例: 2026"
      style="width:90px;padding:5px 8px;border:1.5px solid #ddd;border-radius:8px;
      font-size:12px;font-weight:600;color:var(--text);font-family:inherit;outline:none;text-align:center;"
      onkeydown="if(event.key==='Enter')addYear(document.getElementById('ayInput').value);
                 if(event.key==='Escape')document.getElementById('addYearInlineWrap').innerHTML='';">
    <button onclick="addYear(document.getElementById('ayInput').value)"
      style="padding:5px 10px;border-radius:8px;font-size:12px;font-weight:700;border:none;
      cursor:pointer;font-family:inherit;background:#e8eaed;color:#444;">追加</button>
  </span>`;
  document.getElementById("ayInput")?.focus();
}
function addYear(val){
  const y=String(parseInt(val)||"").trim();
  if(!y||y.length!==4){alert("4桁の西暦を入力してください");return;}
  if(store.years.includes(y)){alert(`${y}年は既に存在します`);return;}
  store.years.push(y);store.years.sort();store.data[y]=blankYearData(y);
  baseYear=y;cmpYear=store.years.length>1?store.years[store.years.indexOf(y)-1]||null:null;
  persist();
  const wrap=document.getElementById("addYearInlineWrap");if(wrap)wrap.innerHTML="";
  renderYearPills();refreshDash();
}
function showDeleteYear(y){yearToDelete=y;
  document.getElementById("modalMsg").textContent=`${y}年のデータはすべて削除されます。この操作は元に戻せません。`;
  document.getElementById("modalBg").classList.add("show");}
function closeModal(){yearToDelete=null;document.getElementById("modalBg").classList.remove("show");}
function confirmDeleteYear(){
  if(!yearToDelete)return;
  store.years=store.years.filter(y=>y!==yearToDelete);delete store.data[yearToDelete];
  if(baseYear===yearToDelete)baseYear=store.years[store.years.length-1]||null;
  if(cmpYear===yearToDelete)cmpYear=null;
  ["sales","kyaku","haiki"].forEach(t=>{if(editYear[t]===yearToDelete)editYear[t]=baseYear||store.years[0];});
  persist();closeModal();renderYearPills();
  if(currentNav===1)refreshDash();else if(currentNav>1)initInputPage(["","","sales","kyaku","haiki"][currentNav]);
}

/* ══ Aggregation ══ */
function getMonthly(year){
  if(!store.data[year])return MONTHS.map(m=>({m,売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:blankHaiki(),filledDays:0}));
  return MONTHS.map((m,mi)=>{
    const rows=store.data[year][m]||[];
    const entry={m};
    ["売上","客数","買上点数","廃棄金額"].forEach(k=>{entry[k]=rows.reduce((s,r)=>s+(Number(r[k])||0),0);});
    const haiki={};HAIKI_CATS.forEach(c=>{haiki[c]=rows.reduce((s,r)=>s+(Number(r.haiki?.[c])||0),0);});
    entry.haiki=haiki;
    // 入力済み日数（売上 or 客数が入力されている日）
    entry.filledDays=rows.filter(r=>(Number(r.売上)||0)>0||(Number(r.客数)||0)>0).length;
    return entry;
  });
}
function getAnnual(monthly){
  const t={};["売上","客数","買上点数","廃棄金額"].forEach(k=>{t[k]=monthly.reduce((s,m)=>s+(m[k]||0),0);});
  const haiki={};HAIKI_CATS.forEach(c=>{haiki[c]=monthly.reduce((s,m)=>s+(m.haiki?.[c]||0),0);});
  t.haiki=haiki;
  // 年間入力済み日数
  t.filledDays=monthly.reduce((s,m)=>s+(m.filledDays||0),0);
  // 1日平均
  const d=t.filledDays||1;
  t.avg={
    売上:Math.round(t.売上/d),
    客数:Math.round(t.客数/d),
    買上点数:Math.round(t.買上点数/d),
    廃棄金額:Math.round(t.廃棄金額/d),
  };
  return t;
}
function yoy(cur,prev){
  if(!prev||prev===0)return null;
  const pct=(cur-prev)/prev*100;return{pct,up:pct>=0,str:(pct>=0?"+":"")+pct.toFixed(1)+"%"};
}

/* ══ Correlation data ══ */
function getCorrData(year,months){
  const wdSales=Array(7).fill(0),wdCount=Array(7).fill(0);
  const wxGroups={"晴れ":["快晴","晴","晴曇"],"曇り":["曇"],"雨":["小雨","雨","大雨"],"雪":["みぞれ","雪"]};
  const wxSales={},wxCount={};
  Object.keys(wxGroups).forEach(g=>{wxSales[g]=0;wxCount[g]=0;});

  // 対象月を直近N月に絞る（selMonthを終月とする・年を跨いで遡る）
  const endMIdx=MONTHS.indexOf(selMonth);
  const targets=[]; // [{year, mName, mi}]
  for(let i=0;i<months;i++){
    const mi=((endMIdx-i)+12)%12;
    const y=endMIdx-i<0?String(parseInt(year)-1):year;
    targets.push({y,mName:MONTHS[mi],mi});
  }

  targets.forEach(({y,mName,mi})=>{
    const rows=store.data[y]?.[mName]||[];
    rows.forEach(r=>{
      const wd=getWeekday(y,mi,parseInt(r.d));
      const sales=Number(r.売上)||0;
      if(sales>0){wdSales[wd]+=sales;wdCount[wd]++;}
      const wx=r.weather||"";
      for(const [grp,cats] of Object.entries(wxGroups)){
        if(cats.includes(wx)){wxSales[grp]+=(Number(r.売上)||0);wxCount[grp]++;break;}
      }
    });
  });
  const wdAvg=wdSales.map((s,i)=>wdCount[i]>0?Math.round(s/wdCount[i]):0);
  const wxAvg={};Object.keys(wxSales).forEach(k=>{wxAvg[k]=wxCount[k]>0?Math.round(wxSales[k]/wxCount[k]):0;});
  return{wdAvg,wxAvg,wxGroups};
}

/* ══ KPI ══ */
function renderKPI(aNow,aPrev){
  const row=document.getElementById("kpiRow");row.innerHTML="";
  METRICS.forEach(m=>{
    const iS1=activeMetrics[0]===m.key,iS2=activeMetrics[1]===m.key;
    const avgNow=aNow.avg?.[m.key]??aNow[m.key];
    const avgPrev=aPrev?.avg?.[m.key]??aPrev?.[m.key];
    const yoyVal=aPrev?yoy(avgNow,avgPrev):null;
    const card=document.createElement("div");card.className=`kpi-card${iS1?" sel1":iS2?" sel2":""}`;
    const valueState=yoyVal&&!yoyVal.up&&m.up?" insight-kpi-value-alert":" insight-kpi-value-normal";
    card.dataset.key=m.key;
    card.onclick=()=>toggleMetric(m.key);
    card.innerHTML=`<div class="kpi-dot"></div>
      <div class="kpi-label">${m.label} <span style="font-weight:500;font-size:8.5px;color:var(--text5);">${selMonth} 1日平均</span></div>
      <div class="kpi-value${valueState}">${m.short(avgNow)}</div>
      ${yoyVal?`<div class="kpi-yoy"><span class="kpi-badge ${m.key==='廃棄金額'?(yoyVal.up?'dn':'up'):(yoyVal.up?'up':'dn')}">${yoyVal.up?"▲":"▼"} ${yoyVal.str}</span>
        <span class="kpi-prev">${cmpYear}年比</span></div>`:""}`;
    row.appendChild(card);
  });
}
function toggleMetric(key){
  if(activeMetrics.includes(key)){if(activeMetrics.length===1)return;activeMetrics=activeMetrics.filter(k=>k!==key);}
  else{activeMetrics=activeMetrics.length>=2?[activeMetrics[1],key]:[...activeMetrics,key];}
  refreshDash();
}

/* ══ Derived ══ */
function renderDerived(aNow,aPrev){
  const row=document.getElementById("kpiRow");
  const 客単価=aNow.客数>0?Math.round(aNow.売上*1000/aNow.客数):0;
  const prev客=aPrev&&aPrev.客数>0?Math.round(aPrev.売上*1000/aPrev.客数):null;
  const 廃棄率=aNow.売上>0?(aNow.廃棄金額/(aNow.売上*1000)*100).toFixed(2):"-";
  const prev廃棄=aPrev&&aPrev.売上>0?aPrev.廃棄金額/(aPrev.売上*1000)*100:null;
  [{label:"客単価",value:`¥${客単価.toLocaleString()}`,unit:"円",chg:prev客?yoy(客単価,prev客):null,good:true},
   {label:"廃棄率",value:廃棄率,unit:"%",chg:prev廃棄?yoy(parseFloat(廃棄率),prev廃棄):null,good:false},
  ].forEach(item=>{
    const yoyVal=item.chg;
    const pos=yoyVal?(item.good?yoyVal.up:!yoyVal.up):null;
    const card=document.createElement("div");card.className="kpi-card";
    card.innerHTML=`
      <div class="kpi-label">${item.label} <span style="font-weight:500;font-size:8.5px;color:var(--text5);">${selMonth}</span></div>
      <div class="kpi-value">${item.value}<span class="kpi-unit">${item.unit}</span></div>
      ${yoyVal?`<div class="kpi-yoy"><span class="kpi-badge ${pos?"up":"dn"}">${yoyVal.up?"▲":"▼"} ${yoyVal.str}</span>
        <span class="kpi-prev">${cmpYear}年比</span></div>`:""}`;
    row.appendChild(card);
  });
}

/* ══ Correlation charts ══ */
function setWdPeriod(months){
  wdPeriod=months;
  document.querySelectorAll(".wd-period-btn").forEach(b=>{
    b.classList.toggle("active",parseInt(b.dataset.months)===months);
  });
  refreshCorrCharts();
}

function refreshCorrCharts(){
  const corrRow=document.getElementById("corrRow");
  corrRow.style.display="block";
  const {wdAvg}=getCorrData(baseYear,wdPeriod);
  const p=METRICS.find(m=>m.key===activeMetrics[0]);
  const pri=p.color||"#1a1a1a";

  if(wdChartInst){wdChartInst.destroy();wdChartInst=null;}
  wdChartInst=new Chart(document.getElementById("wdChart"),{type:"bar",
    data:{labels:WEEKDAYS,datasets:[{data:wdAvg,backgroundColor:WEEKDAYS.map((_,i)=>{
      if(i===0)return"rgba(220,38,38,0.7)";if(i===6)return"rgba(59,130,246,0.7)";return"rgba(22,101,52,0.7)";
    }),borderRadius:4,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:false},tooltip:{backgroundColor:"#fff",titleColor:"#111",bodyColor:"#666",
        borderColor:"#e8e8e8",borderWidth:1,padding:7,callbacks:{label:c=>`平均: ${c.parsed.y.toLocaleString()}千円`}}},
      scales:{x:{grid:{display:false},ticks:{color:"#ccc",font:{size:9}},border:{display:false}},
        y:{grid:{color:"#f2f2f2"},ticks:{color:"#ccc",font:{size:8},callback:v=>v>=1000?`${(v/1000).toFixed(0)}万`:`${v}千`},border:{display:false}}}}});
}

/* ══ Donut ══ */
function buildDonutData(){
  const isDaily=viewMode==="日";
  let haiki={};HAIKI_CATS.forEach(c=>{haiki[c]=0;});
  if(isDaily){
    const sel=document.getElementById("donutDaySelect");
    const dayIdx=sel?parseInt(sel.value):0;
    const rows=store.data[baseYear]?.[selMonth]||[];
    const r=rows[dayIdx]||{haiki:blankHaiki()};
    haiki=r.haiki||blankHaiki();
    document.getElementById("donutSub").textContent=`${selMonth} ${dayIdx+1}日`;
  }else{
    const rows=store.data[baseYear]?.[selMonth]||[];
    rows.forEach(r=>{HAIKI_CATS.forEach(c=>{haiki[c]+=(Number(r.haiki?.[c])||0);});});
    document.getElementById("donutSub").textContent=`${selMonth} 月合計`;
  }
  return haiki;
}
function renderDonutDayPicker(){
  const isDaily=viewMode==="日";
  document.getElementById("donutDayPicker").style.display=isDaily?"block":"none";
  if(!isDaily)return;
  const sel=document.getElementById("donutDaySelect");
  const mi=MONTHS.indexOf(selMonth);const days=DAYS_IN_MONTH[mi];const prev=sel.value;
  sel.innerHTML=Array.from({length:days},(_,i)=>`<option value="${i}">${i+1}日</option>`).join("");
  if(prev&&parseInt(prev)<days)sel.value=prev;
}
function refreshDonut(){
  const haiki=buildDonutData();
  const vals=HAIKI_CATS.map(c=>haiki[c]);
  const total=vals.reduce((a,b)=>a+b,0);
  const ctx=document.getElementById("donutChart");
  if(donutInst){donutInst.destroy();donutInst=null;}
  donutInst=new Chart(ctx,{type:"doughnut",
    data:{labels:HAIKI_CATS,datasets:[{data:vals,backgroundColor:HAIKI_COLORS,borderColor:"#fff",borderWidth:2,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"68%",animation:{duration:300},
      plugins:{legend:{display:false},tooltip:{backgroundColor:"#fff",titleColor:"#111",bodyColor:"#666",
        borderColor:"#e8e8e8",borderWidth:1,padding:7,callbacks:{label:c=>`${c.label}: ¥${c.parsed.toLocaleString()} (${total>0?(c.parsed/total*100).toFixed(1):0}%)`}}}}});
  const leg=document.getElementById("donutLegends");leg.innerHTML="";
  // 合計行
  if(total>0){
    const totRow=document.createElement("div");
    totRow.style.cssText="display:flex;justify-content:space-between;padding:5px 0 7px;border-bottom:2px solid #e8e8e8;margin-bottom:2px;";
    totRow.innerHTML=`<span style="font-size:11px;font-weight:700;color:var(--text3);">合計</span>
      <span style="font-size:13px;font-weight:800;color:#b91c1c;">¥${total.toLocaleString()}</span>`;
    leg.appendChild(totRow);
  }
  HAIKI_CATS.forEach((c,i)=>{
    if(vals[i]===0)return;
    const pct=total>0?(vals[i]/total*100).toFixed(1):"0.0";
    const dispVal=donutMode==="amount"?`¥${vals[i].toLocaleString()}`:`${pct}%`;
    const div=document.createElement("div");div.className="donut-leg";
    div.innerHTML=`<span class="donut-dot" style="background:${HAIKI_COLORS[i]};"></span>
      <span class="donut-name">${c}</span>
      <span class="donut-val">${dispVal}</span>`;
    leg.appendChild(div);
  });
  if(total===0){
    const empty=document.createElement("div");
    empty.style.cssText="font-size:11px;color:#bbb;text-align:center;padding:12px 0;";
    empty.textContent="データなし";
    leg.appendChild(empty);
  }
}

function setDonutMode(mode){
  donutMode=mode;
  const btnAmt=document.getElementById("donutBtnAmt");
  const btnPct=document.getElementById("donutBtnPct");
  if(btnAmt){btnAmt.style.background=mode==="amount"?"#1a1a1a":"#fff";btnAmt.style.color=mode==="amount"?"#fff":"#999";}
  if(btnPct){btnPct.style.background=mode==="percent"?"#1a1a1a":"#fff";btnPct.style.color=mode==="percent"?"#fff":"#999";}
  refreshDonut();
}

/* ══ Chart type / view ══ */
function setView(v){
  viewMode=v;
  document.getElementById("tabDay").classList.toggle("active",v==="日");
  document.getElementById("tabMonth").classList.toggle("active",v==="月");
  renderDonutDayPicker();refreshDash();
}
function renderMonthBtns(){
  ["dashMonthBtns"].forEach(id=>{
    const c=document.getElementById(id);if(!c)return;
    c.innerHTML="";
    MONTHS.forEach(m=>{
      const btn=document.createElement("button");btn.className="m-btn"+(m===selMonth?" active":"");
      btn.textContent=m;
      btn.onclick=()=>{
        selMonth=m;
        renderMonthBtns();
        renderDonutDayPicker();
        refreshMainChart();
        refreshDonut();
        refreshCorrCharts();
        // KPI・派生指標も選択月で更新
        const mNow=getMonthly(baseYear),mCmp=cmpYear?getMonthly(cmpYear):null;
        const aNow=getAnnual(mNow),aCmp=mCmp?getAnnual(mCmp):null;
        const mIdx=MONTHS.indexOf(selMonth);
        const mNowSel=mNow[mIdx]||{売上:0,客数:0,買上点数:0,廃棄金額:0,filledDays:0};
        const mCmpSel=mCmp?mCmp[mIdx]:null;
        function monthAvg(md){const d=md.filledDays||1;return{...md,avg:{売上:Math.round(md.売上/d),客数:Math.round(md.客数/d),買上点数:md.filledDays>0?(md.買上点数/d):0,廃棄金額:Math.round(md.廃棄金額/d)}};}
        renderKPI(monthAvg(mNowSel),mCmpSel?monthAvg(mCmpSel):null);
        renderDerived(mNowSel,mCmpSel);
      };
      c.appendChild(btn);
    });
  });
}
function renderLegend(){
  const row=document.getElementById("legendRow");row.innerHTML="";
  const mSales=METRICS.find(m=>m.key==="売上");
  const mKyaku=METRICS.find(m=>m.key==="客数");
  [{meta:mSales,type:"bar"},{meta:mKyaku,type:"line"}].forEach(({meta,type})=>{
    const div=document.createElement("div");div.className="legend-item";
    const indicator=type==="bar"
      ?`<div style="width:12px;height:12px;border-radius:3px;background:${meta.color}bb;"></div>`
      :`<div class="legend-line" style="background:${meta.color};width:18px;height:2.5px;border-radius:2px;"></div>`;
    div.innerHTML=`${indicator}<span>${meta.label}（${meta.unit}）</span>`;
    row.appendChild(div);
  });
  if(cmpYear){
    [{color:"rgba(180,180,180,0.7)",label:`${cmpYear}年 売上`,type:"bar"},
     {color:"#aaa",label:`${cmpYear}年 客数`,type:"line"}].forEach(l=>{
      const div=document.createElement("div");div.className="legend-item";
      const indicator=l.type==="bar"
        ?`<div style="width:12px;height:12px;border-radius:3px;background:${l.color};"></div>`
        :`<div style="width:18px;height:0;border-top:2px dashed #aaa;"></div>`;
      div.innerHTML=`${indicator}<span style="color:var(--text5)">${l.label}</span>`;
      row.appendChild(div);
    });
  }
}

/* ══ Main chart ══ */
function refreshMainChart(){
  if(!baseYear)return;
  const mNow=getMonthly(baseYear),mCmp=cmpYear?getMonthly(cmpYear):null;
  const isDaily=viewMode==="日";
  const ctx=document.getElementById("mainChart");
  if(mainChartInst){mainChartInst.destroy();mainChartInst=null;}

  const nowD=isDaily?store.data[baseYear][selMonth]:mNow;
  const cmpD=cmpYear?(isDaily?store.data[cmpYear]?.[selMonth]:mCmp):null;
  const labels=nowD.map(d=>isDaily?`${d.d}日`:d.m);

  const mSales=METRICS.find(m=>m.key==="売上");
  const mKyaku=METRICS.find(m=>m.key==="客数");

  // 月計・前年比
  const mt売上=isDaily?nowD.reduce((s,d)=>s+(Number(d.売上)||0),0):null;
  const mc売上=isDaily&&cmpD?cmpD.reduce((s,d)=>s+(Number(d.売上)||0),0):null;
  const yoyInfo=mt売上!=null&&mc売上?yoy(mt売上,mc売上):null;
  document.getElementById("chartTitle").textContent=isDaily?`${selMonth} 日別推移`:"月次推移";
  document.getElementById("chartSub").textContent=
    "売上（棒）＆ 客数（折れ線）"+
    (mt売上!=null?`　売上月計: ${mSales.fmt(mt売上)}`:"")
    +(yoyInfo?`　前年比: ${yoyInfo.str}`:"");

  // datasets: 今年売上（棒）、前年売上（棒・薄）、今年客数（折れ線）、前年客数（折れ線・破線）
  const ds=[
    // 今年 売上 → 棒
    {type:"bar",label:`${baseYear}年 売上`,data:nowD.map(d=>d.売上),
     backgroundColor:mSales.color+"bb",borderRadius:5,borderSkipped:false,
     yAxisID:"y",order:2},
  ];
  if(cmpD) ds.push(
    // 前年 売上 → 棒（薄）
    {type:"bar",label:`${cmpYear}年 売上`,data:cmpD.map(d=>d.売上),
     backgroundColor:"rgba(180,180,180,0.45)",borderRadius:5,borderSkipped:false,
     yAxisID:"y",order:3}
  );
  // 今年 客数 → 折れ線
  ds.push(
    {type:"line",label:`${baseYear}年 客数`,data:nowD.map(d=>d.客数),
     borderColor:mKyaku.color,borderWidth:2.5,backgroundColor:"transparent",
     fill:false,tension:0.4,pointRadius:isDaily?0:3,pointHoverRadius:5,
     pointBackgroundColor:mKyaku.color,yAxisID:"y2",order:1}
  );
  if(cmpD) ds.push(
    // 前年 客数 → 折れ線破線
    {type:"line",label:`${cmpYear}年 客数`,data:cmpD.map(d=>d.客数),
     borderColor:"#aaa",borderWidth:1.5,backgroundColor:"transparent",
     fill:false,tension:0.4,borderDash:[4,3],pointRadius:0,pointHoverRadius:4,
     yAxisID:"y2",order:1}
  );

  const scales={
    x:{grid:{color:"#f0f0f0",drawBorder:false},
       ticks:{color:"#888",font:{size:isDaily?9:10},maxTicksLimit:isDaily?8:12},
       border:{display:false}},
    y:{position:"left",grid:{color:"#f0f0f0",drawBorder:false},
       ticks:{color:mSales.color,font:{size:10},callback:mSales.yFmt},
       border:{display:false},
       title:{display:true,text:"売上",color:mSales.color,font:{size:10,weight:"700"}}},
    y2:{position:"right",grid:{display:false},
        ticks:{color:mKyaku.color,font:{size:10},callback:mKyaku.yFmt},
        border:{display:false},
        title:{display:true,text:"客数",color:mKyaku.color,font:{size:10,weight:"700"}}},
  };

  mainChartInst=new Chart(ctx,{
    type:"bar", // ComposedChart: typeはbaseとして指定
    data:{labels,datasets:ds},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:300},
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:10,
          callbacks:{
            label:c=>{
              if(c.dataset.label?.includes("売上"))
                return ` ${c.dataset.label}: ${mSales.fmt(c.parsed.y)}`;
              if(c.dataset.label?.includes("客数"))
                return ` ${c.dataset.label}: ${mKyaku.fmt(c.parsed.y)}`;
              return ` ${c.dataset.label}: ${c.parsed.y?.toLocaleString()}`;
            }
          }
        }
      },
      scales
    }
  });
}

/* ══ Bar ══ */
/* ══ Summary ══ */
function renderSummary(aNow,aPrev){
  const body=document.getElementById("summaryBody");body.innerHTML="";
  METRICS.forEach(m=>{
    const isAct=activeMetrics.includes(m.key);
    const yoyVal=aPrev?yoy(aNow[m.key],aPrev[m.key]):null;
    const div=document.createElement("div");div.className="sum-row";
    div.innerHTML=`<div class="sum-left"><div class="sum-bar${isAct?" act":""}"></div><span class="sum-name">${m.label}</span></div>
      <div class="sum-right"><div class="sum-val">${m.short(aNow[m.key])}</div>
      ${yoyVal?`<div class="sum-yoy" style="color:${(m.up?yoyVal.up:!yoyVal.up)?"#16a34a":"#dc2626"}">${yoyVal.up?"▲":"▼"} ${yoyVal.str}</div>`:""}</div>`;
    body.appendChild(div);
  });
}

/* ══ Dashboard ══ */
function refreshDash(){
  if(!baseYear)return;
  renderYearPills();
  const mNow=getMonthly(baseYear),mCmp=cmpYear?getMonthly(cmpYear):null;
  const aNow=getAnnual(mNow),aCmp=mCmp?getAnnual(mCmp):null;

  // 選択月の月次データで1日平均を計算してKPIに渡す
  const mIdx=MONTHS.indexOf(selMonth);
  const mNowSel=mNow[mIdx]||{売上:0,客数:0,買上点数:0,廃棄金額:0,filledDays:0};
  const mCmpSel=mCmp?mCmp[mIdx]:null;
  function monthAvg(md){
    const d=md.filledDays||1;
    return{...md,avg:{売上:Math.round(md.売上/d),客数:Math.round(md.客数/d),買上点数:md.filledDays>0?(md.買上点数/d):0,廃棄金額:Math.round(md.廃棄金額/d)}};
  }
  const kpiNow=monthAvg(mNowSel);
  const kpiPrev=mCmpSel?monthAvg(mCmpSel):null;

  renderKPI(kpiNow,kpiPrev);renderDerived(mNowSel,mCmpSel);renderLegend();renderMonthBtns();
  renderDonutDayPicker();refreshMainChart();renderSummary(aNow,aCmp);
  refreshDonut();refreshCorrCharts();
}

/* ══ Input pages ══ */
function initInputPage(type){
  const t=todayFY();
  // editYear[type]がstoreに存在する年ならそのまま維持、なければ今日の年か最新年にセット
  if(!editYear[type]||!store.years.includes(editYear[type])){
    editYear[type]=store.years.includes(t.fy)?t.fy:store.years[store.years.length-1];
    editMonth[type]=t.month;
  }
  const yrId={sales:"salesYearRow",kyaku:"kyakuYearRow",haiki:"haikiYearRow"}[type];
  const moId={sales:"salesMonthTabs",kyaku:"kyakuMonthTabs",haiki:"haikiMonthTabs"}[type];
  const row=document.getElementById(yrId);row.innerHTML="";
  store.years.forEach(y=>{
    const wrap=document.createElement("span");wrap.style.cssText="display:inline-flex;align-items:center;gap:2px;";
    const btn=document.createElement("button");btn.className="iytab"+(y===editYear[type]?" active":"");
    btn.textContent=y+"年";btn.onclick=()=>{
      editYear[type]=y;
      const t=todayFY();
      if(type==="haiki")window.haikiSelDay=(t.fy===y&&t.month===editMonth.haiki)?t.day:1;
      if(type==="sales")window.salesSelDay=(t.fy===y&&t.month===editMonth.sales)?t.day:1;
      initInputPage(type);};wrap.appendChild(btn);
    if(store.years.length>1){
      const del=document.createElement("button");del.className="btn-del-year";del.textContent="✕";
      del.onclick=()=>showDeleteYear(y);wrap.appendChild(del);
    }
    row.appendChild(wrap);
  });
  const aw=document.createElement("span");aw.className="add-year-form";
  const ai=document.createElement("input");ai.type="number";ai.placeholder="年度追加";
  ai.addEventListener("keydown",e=>{if(e.key==="Enter"){
    const y=String(parseInt(ai.value)||"").trim();
    if(y&&y.length===4&&!store.years.includes(y)){
      store.years.push(y);store.years.sort();store.data[y]=blankYearData(y);persist();
      // 追加しても現在選択中の年を維持する
    }
    initInputPage(type);
  }});
  const ab=document.createElement("button");ab.className="btn-add";ab.textContent="追加";
  ab.onclick=()=>{
    const y=String(parseInt(ai.value)||"").trim();
    if(y&&y.length===4&&!store.years.includes(y)){
      store.years.push(y);store.years.sort();store.data[y]=blankYearData(y);persist();
      // 追加しても現在選択中の年を維持する
    }
    initInputPage(type);
  };
  aw.appendChild(ai);aw.appendChild(ab);row.appendChild(aw);
  const tabs=document.getElementById(moId);tabs.innerHTML="";
  MONTHS.forEach(m=>{
    const btn=document.createElement("button");btn.className="mtab"+(m===editMonth[type]?" active":"");
    btn.textContent=m;btn.onclick=()=>{editMonth[type]=m;
      if(type==="haiki"){const t=todayFY();window.haikiSelDay=(t.month===m&&t.fy===editYear.haiki)?t.day:1;}
      if(type==="sales"){const t=todayFY();window.salesSelDay=(t.month===m&&t.fy===editYear.sales)?t.day:1;}
      document.querySelectorAll(`#${moId} .mtab`).forEach((b,i)=>b.classList.toggle("active",MONTHS[i]===m));
      renderTable(type);};
    tabs.appendChild(btn);
  });
  renderTable(type);
}

/* ══ 廃棄予算 ══ */
function getHaikiBudget(){
  // store.haikibudget = {total:0, cats:{カテゴリ名:0, ...}}
  if(!store.haikibudget){
    store.haikibudget={total:0,cats:{}};
    HAIKI_CATS.forEach(c=>{store.haikibudget.cats[c]=0;});
  }
  return store.haikibudget;
}

function renderHaikiBudgetSection(actualTotal, actualCats){
  const budget=getHaikiBudget();
  const hasBudget=budget.total>0||HAIKI_CATS.some(c=>budget.cats[c]>0);

  let html=`<div class="hf-budget-section">
    <div class="hf-budget-title">
      <span>予算</span>
      <button class="hf-budget-edit-btn" onclick="openBudgetModal()">⚙️ 設定</button>
    </div>`;

  if(!hasBudget){
    html+=`<div style="font-size:11px;color:var(--text5);padding:8px 0;">予算未設定 — ⚙️設定から入力できます</div>`;
  }else{
    // 項目ごと
    HAIKI_CATS.forEach(c=>{
      const limit=budget.cats[c]||0;
      if(limit===0)return;
      const actual=actualCats[c]||0;
      const over=actual>limit;
      const pct=limit>0?Math.min(100,Math.round(actual/limit*100)):0;
      html+=`<div class="hf-budget-row">
        <span class="hf-budget-label">${c}</span>
        <div class="hf-budget-bar-wrap"><div class="hf-budget-bar${over?" over":""}" style="width:${pct}%;"></div></div>
        <span class="hf-budget-actual${over?" over":""}">¥${actual.toLocaleString()}</span>
        <span class="hf-budget-limit">/ ¥${limit.toLocaleString()}</span>
      </div>`;
    });
    // 合計行
    if(budget.total>0){
      const over=actualTotal>budget.total;
      const pct=Math.min(100,Math.round(actualTotal/budget.total*100));
      html+=`<div class="hf-budget-total-row">
        <span class="hf-budget-label" style="font-weight:700;">合計</span>
        <div class="hf-budget-bar-wrap"><div class="hf-budget-bar${over?" over":""}" style="width:${pct}%;"></div></div>
        <span class="hf-budget-actual${over?" over":""}" style="font-size:14px;">¥${actualTotal.toLocaleString()}</span>
        <span class="hf-budget-limit">/ ¥${budget.total.toLocaleString()}</span>
      </div>`;
    }
  }
  html+=`</div>`;
  return html;
}

function openBudgetModal(){
  const budget=getHaikiBudget();
  const rows=document.getElementById("budgetEditRows");
  rows.innerHTML=
    HAIKI_CATS.map(c=>`
      <div class="budget-edit-row">
        <span class="budget-edit-label">${c}</span>
        <input type="text" inputmode="numeric" class="budget-edit-input" id="be_${c}"
          value="${budget.cats[c]>0?budget.cats[c].toLocaleString():""}" placeholder="0">
        <span class="budget-edit-unit">円</span>
      </div>`).join("")+
    `<div class="budget-edit-row" style="margin-top:4px;border-top:2px solid var(--border);padding-top:10px;border-bottom:none;">
      <span class="budget-edit-label" style="font-weight:700;">合計上限</span>
      <input type="text" inputmode="numeric" class="budget-edit-input" id="be_total"
        value="${budget.total>0?budget.total.toLocaleString():""}" placeholder="0">
      <span class="budget-edit-unit">円</span>
    </div>`;
  // カンマ入力適用
  document.querySelectorAll(".budget-edit-input").forEach(el=>applyCommaInput(el));
  document.getElementById("budgetModalBg").classList.add("show");
}

function closeBudgetModal(){
  document.getElementById("budgetModalBg").classList.remove("show");
}

function saveBudget(){
  const budget=getHaikiBudget();
  HAIKI_CATS.forEach(c=>{
    const el=document.getElementById(`be_${c}`);
    budget.cats[c]=el?fromComma(el.value):0;
  });
  const tot=document.getElementById("be_total");
  budget.total=tot?fromComma(tot.value):0;
  store.haikibudget=budget;
  persist();
  closeBudgetModal();
  // フォームを再描画して予算セクションを更新
  const fy=editYear.haiki;
  const mi=MONTHS.indexOf(editMonth.haiki);
  if(window.haikiSelDay)renderHaikiForm(fy,mi,window.haikiSelDay);
}

/* ══ 日本祝日計算 ══ */
function calcJpHolidays(year){
  const h=new Set();
  const add=(m,d)=>h.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);

  // 固定祝日
  add(1,1);   // 元日
  add(2,11);  // 建国記念の日
  add(2,23);  // 天皇誕生日
  add(4,29);  // 昭和の日
  add(5,3);   // 憲法記念日
  add(5,4);   // みどりの日
  add(5,5);   // こどもの日
  add(8,11);  // 山の日
  add(11,3);  // 文化の日
  add(11,23); // 勤労感謝の日

  // ハッピーマンデー
  const nthMon=(m,n)=>{let d=1;let cnt=0;while(true){if(new Date(year,m-1,d).getDay()===1){cnt++;if(cnt===n)return d;}d++;}};
  add(1, nthMon(1,2));  // 成人の日（1月第2月）
  add(7, nthMon(7,3));  // 海の日（7月第3月）
  add(9, nthMon(9,3));  // 敬老の日（9月第3月）
  add(10,nthMon(10,2)); // スポーツの日（10月第2月）

  // 春分の日・秋分の日（簡易計算）
  const shunbun=Math.floor(20.8431+0.242194*(year-1980)-Math.floor((year-1980)/4));
  const shubun=Math.floor(23.2488+0.242194*(year-1980)-Math.floor((year-1980)/4));
  add(3,shunbun);
  add(9,shubun);

  // 振替休日（祝日が日曜→翌月曜）
  const extra=new Set();
  h.forEach(s=>{
    const dt=new Date(s);
    if(dt.getDay()===0){
      let next=new Date(dt);
      do{next.setDate(next.getDate()+1);}while(h.has(next.toISOString().slice(0,10))||extra.has(next.toISOString().slice(0,10)));
      extra.add(next.toISOString().slice(0,10));
    }
  });
  extra.forEach(s=>h.add(s));

  // 国民の休日（祝日に挟まれた平日）
  const arr=[...h].sort();
  for(let i=0;i<arr.length-1;i++){
    const a=new Date(arr[i]),b=new Date(arr[i+1]);
    if((b-a)===2*86400000){
      const mid=new Date(a.getTime()+86400000);
      if(mid.getDay()!==0&&mid.getDay()!==6) h.add(mid.toISOString().slice(0,10));
    }
  }
  return h;
}

// 年ごとのキャッシュ
const _jpHolCache={};
function isJpHoliday(year,month,day){
  if(!_jpHolCache[year])_jpHolCache[year]=calcJpHolidays(parseInt(year));
  // FY年度→西暦変換
  const cy=parseInt(month)<=3?parseInt(year)+1:parseInt(year); // MONTHS使う場合
  // 引数はすでに西暦yearとして渡す想定
  const key=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return _jpHolCache[year].has(key);
}

// 実際の西暦年・月・日を受け取って祝日判定
function isHoliday(cyear,cmonth,cday){
  if(!_jpHolCache[cyear])_jpHolCache[cyear]=calcJpHolidays(parseInt(cyear));
  const key=`${cyear}-${String(cmonth).padStart(2,'0')}-${String(cday).padStart(2,'0')}`;
  return _jpHolCache[cyear].has(key);
}

// 会計年度(fy)・月インデックス・日から西暦年月を求めて祝日判定
function isHolidayFY(fy,mIdx,day){
  const cy=parseInt(fy);
  const cm=mIdx+1;
  return isHoliday(cy,cm,day);
}

function wdClass(fy,mIdx,day){
  const w=getWeekday(fy,mIdx,day);
  if(w===0)return"sun";
  if(w===6)return"sat";
  if(isHolidayFY(fy,mIdx,day))return"hol";
  return"";
}

function renderTable(type){
  const mi=MONTHS.indexOf(editMonth[type]);
  const fy=editYear[type];
  const src=store.data[fy]?.[editMonth[type]];
  drafts[type]=src?src.map(r=>({...r,haiki:{...blankHaiki(),...(r.haiki||{})},weather:r.weather||""})):blankMonthData(mi);

  if(type==="sales"){
    if(!window.salesSelDay||window.salesSelDay>DAYS_IN_MONTH[mi]){
      // 今日が同じ月なら今日、そうでなければ1日
      const t=todayFY();
      window.salesSelDay=(t.fy===fy&&t.month===editMonth.sales)?t.day:1;
    }
    renderSalesDayList(fy,mi);
    renderSalesForm(fy,mi,window.salesSelDay);
    requestAnimationFrame(()=>{refreshSalesLineChart(fy,mi);refreshSalesWdChart(fy,mi);});
  }else if(type==="kyaku"){
    renderKyakuGrid(fy,mi);
    requestAnimationFrame(()=>{refreshKyakuLineChart(fy,mi);refreshKyakuWdChart(fy,mi);});
  }else{
    // 廃棄 2ペイン: 左=日付リスト, 右=入力フォーム
    const mi2=MONTHS.indexOf(editMonth.haiki);
    const fy2=editYear.haiki;
    // 最初の日を選択
    if(!window.haikiSelDay||window.haikiSelDay>DAYS_IN_MONTH[mi2]){
      const t=todayFY();
      window.haikiSelDay=(t.fy===fy2&&t.month===editMonth.haiki)?t.day:1;
    }
    renderHaikiDayList(fy2,mi2);
    renderHaikiForm(fy2,mi2,window.haikiSelDay);
    // ページ表示後にcanvasサイズが確定するよう1フレーム遅らせる
    requestAnimationFrame(()=>{refreshHaikiBarChart(fy2,mi2);refreshHaikiWdChart(fy2,mi2);});
  }
}

function renderKyakuGrid(fy,mi){
  const grid=document.getElementById("kyakuGrid");
  if(!grid)return;
  grid.innerHTML="";
  const days=DAYS_IN_MONTH[mi];
  // 1日の曜日インデックス (0=日〜6=土)
  const firstWd=getWeekday(fy,mi,1);
  // ヘッダー行 (日月火水木金土)
  const WD_ORDER=["日","月","火","水","木","金","土"];
  WD_ORDER.forEach((w,i)=>{
    const h=document.createElement("div");
    h.className=`kyaku-day-header${i===0?" sun":i===6?" sat":""}`;
    h.textContent=w;grid.appendChild(h);
  });
  // 1日前の空白
  for(let i=0;i<firstWd;i++){
    const blank=document.createElement("div");blank.className="kyaku-day-card empty";
    grid.appendChild(blank);
  }
  // 日付カード
  let col=firstWd;
  drafts.kyaku.forEach((row,ri)=>{
    const d=parseInt(row.d);
    const wd=getWeekday(fy,mi,d); // 0=Sun,6=Sat
    const isSun=wd===0,isSat=wd===6;
    const isHol=!isSun&&isHolidayFY(fy,mi,d);
    const isRedDay=isSun||isHol;
    const kyaku=Number(row.客数)||0;
    const wx=row.weather||"";
    const card=document.createElement("div");
    card.className=`kyaku-day-card${isRedDay?" sun-card":isSat?" sat-card":""}`;
    card.innerHTML=`
      <div class="kyaku-day-num${isRedDay?" sun":isSat?" sat":""}">${d}</div>
      <div class="kyaku-wx">${WX_ICONS[wx]||"　"}</div>
      <input class="kyaku-input${kyaku>0?" has-val":""}" type="number"
        inputmode="numeric" value="${kyaku||""}" placeholder="0"
        data-ri="${ri}">
    `;
    grid.appendChild(card);
    // 土曜後に区切り（最終日でなければ）
    col=(col+1)%7;
    if(isSat&&d<days){
      const sep=document.createElement("div");sep.className="kyaku-week-sep";
      grid.appendChild(sep);
      col=0;
    }
  });
  // 末尾の空白
  if(col>0){for(let i=col;i<7;i++){const b=document.createElement("div");b.className="kyaku-day-card empty";grid.appendChild(b);}}

  // 月合計
  updateKyakuTotal();

  // イベント
  grid.querySelectorAll("input.kyaku-input").forEach(inp=>{
    attachValidation(inp,"客数",()=>drafts.kyaku);
    inp.addEventListener("input",e=>{
      const ri=+e.target.dataset.ri;
      drafts.kyaku[ri].客数=e.target.value;
      e.target.classList.toggle("has-val",(Number(e.target.value)||0)>0);
      updateKyakuTotal();
    });
  });
}

function updateKyakuTotal(){
  const total=drafts.kyaku.reduce((s,r)=>s+(Number(r.客数)||0),0);
  const avg=total>0?(total/drafts.kyaku.filter(r=>(Number(r.客数)||0)>0).length).toFixed(0):"-";
  const el=document.getElementById("kyakuMonthTotal");
  if(!el)return;
  el.innerHTML=`
    <div>
      <div class="kyaku-month-label">月間客数</div>
      <div class="kyaku-month-sub">入力済日の平均 ${avg}人/日</div>
    </div>
    <div class="kyaku-month-val">${total.toLocaleString()}人</div>`;
}

function renderSalesDayList(fy,mi){
  const list=document.getElementById("salesDayList");
  if(!list)return;
  list.innerHTML="";
  drafts.sales.forEach((row,ri)=>{
    const d=parseInt(row.d);
    const wd=getWeekday(fy,mi,d);
    const isHol=wd!==0&&isHolidayFY(fy,mi,d);
    const wdc=wd===0?"sun":wd===6?"sat":isHol?"hol":"";
    const wdLabel=WEEKDAYS[wd];
    const hasData=(Number(row.売上)||0)>0;
    const btn=document.createElement("button");
    btn.className=`haiki-day-btn${d===window.salesSelDay?" sel":""}${hasData?" has-data":""}`;
    const wx=row.weather||"";
    btn.innerHTML=`<div class="hdb-num">${d}日 ${WX_ICONS[wx]||""}</div>
      <div class="hdb-wd ${wdc}">${wdLabel}曜</div>
      <div class="hdb-tot">${hasData?"¥"+(Number(row.売上)||0).toLocaleString()+"千":"未入力"}</div>`;
    btn.onclick=()=>{window.salesSelDay=d;renderSalesDayList(fy,mi);renderSalesForm(fy,mi,d);};
    list.appendChild(btn);
  });
}

function renderSalesForm(fy,mi,day){
  const form=document.getElementById("salesForm");
  if(!form)return;
  const ri=day-1;
  const row=drafts.sales[ri]||blankRow(day);
  const wd=getWeekday(fy,mi,day);
  const 売上val=Number(row.売上)||0;
  const 点数val=Number(row.買上点数)||0;
  form.innerHTML=`
    <div class="hf-title">${editMonth.sales} ${day}日（${WEEKDAYS[wd]}曜日）</div>

    <div style="margin-bottom:10px;">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text5);margin-bottom:6px;">天気</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${WX_KEYS.map(w=>`<button onclick="setSalesWeather(${ri},'${w}')" style="font-size:16px;padding:5px 8px;border-radius:8px;border:2px solid ${row.weather===w?"#1a1a1a":"transparent"};background:${row.weather===w?"#f8f8f8":"#fff"};cursor:pointer;line-height:1;" id="swx_${ri}_${w}">${WX_ICONS[w]}</button>`).join("")}
      </div>
    </div>

    <div class="hf-field">
      <span class="hf-label">売上</span>
      <div class="hf-input-wrap">
        <input type="text" inputmode="numeric" value="${売上val>0?売上val.toLocaleString():""}" placeholder="0"
          id="sf_売上" data-ri="${ri}" data-k="売上">
        <span class="hf-unit">千円</span>
      </div>
    </div>
    <div style="font-size:10px;color:#bbb;padding:3px 0 8px;text-align:right;" id="sfYen" style="font-size:10px;color:var(--text5);padding:3px 0 8px;text-align:right;">
      ${売上val>0?`= ¥${(売上val*1000).toLocaleString()}`:""}
    </div>

    <div class="hf-field">
      <span class="hf-label">買上点数</span>
      <div class="hf-input-wrap">
        <input type="text" inputmode="numeric" value="${点数val>0?点数val.toFixed(2):""}" placeholder="0.00"
          id="sf_買上点数" data-ri="${ri}" data-k="買上点数">
        <span class="hf-unit">点</span>
      </div>
    </div>

    <div class="hf-total" style="background:#f0fdf4;">
      <span class="hf-total-label">客単価（参考）</span>
      <span class="hf-total-val" id="sfTanka" style="color:#166534;">
        ${row.客数>0?"¥"+(Math.round(売上val*1000/row.客数)).toLocaleString():"-"}
      </span>
    </div>`;

  // イベント
  form.querySelectorAll("input[data-k]").forEach(inp=>{
    const k=inp.dataset.k;
    if(k==="買上点数") applyCommaFloatInput(inp,2);
    else applyCommaInput(inp);
    attachValidation(inp,k,()=>drafts.sales);
    inp.addEventListener("input",e=>{
      const ri2=+e.target.dataset.ri,k=e.target.dataset.k;
      drafts.sales[ri2][k]=k==="買上点数"?fromCommaFloat(e.target.value):fromComma(e.target.value);
      // 円換算表示更新
      if(k==="売上"){
        const yen=document.getElementById("sfYen");
        const n=fromComma(e.target.value);
        if(yen)yen.textContent=n>0?`= ¥${(n*1000).toLocaleString()}`:"";
      }
      // 日付リストのバッジ更新
      const hasD=(fromComma(drafts.sales[ri2].売上)||0)>0;
      const btnEl=document.querySelector(`#salesDayList .haiki-day-btn:nth-child(${ri2+1})`);
      if(btnEl){
        btnEl.classList.toggle("has-data",hasD);
        const totEl=btnEl.querySelector(".hdb-tot");
        if(totEl)totEl.textContent=hasD?"¥"+(fromComma(drafts.sales[ri2].売上)||0).toLocaleString()+"千":"未入力";
      }
      updateTotals("sales");
    });
  });
}

function setSalesWeather(ri,wx){
  drafts.sales[ri].weather=wx;
  // 共有天気に保存（全店舗に反映）
  setSharedWeather(editYear.sales,editMonth.sales,ri+1,wx);
  // ボタンのハイライト更新
  WX_KEYS.forEach(w=>{
    const btn=document.getElementById(`swx_${ri}_${w}`);
    if(btn){btn.style.borderColor=w===wx?"#1a1a1a":"transparent";btn.style.background=w===wx?"#f8f8f8":"#fff";}
  });
  // 日付リストのアイコン更新
  const btnEl=document.querySelector(`#salesDayList .haiki-day-btn:nth-child(${ri+1})`);
  if(btnEl){const num=btnEl.querySelector(".hdb-num");if(num)num.textContent=`${ri+1}日 ${WX_ICONS[wx]||""}`;}
}

function refreshHaikiBarChart(fy,mi){
  const ctx=document.getElementById("haikiBarChart");
  if(!ctx)return;
  if(haikiBarInst){haikiBarInst.destroy();haikiBarInst=null;}

  const rows=drafts.haiki;
  const labels=rows.map(r=>r.d+"日");
  const totals=rows.map(r=>HAIKI_CATS.reduce((s,c)=>s+(Number(r.haiki?.[c])||0),0));
  const grand=totals.reduce((a,b)=>a+b,0);
  const selIdx=window.haikiSelDay-1;

  // タイトル・合計更新
  const month=editMonth.haiki;
  document.getElementById("haikiChartTitle").textContent=`${month} 廃棄金額 日別`;
  document.getElementById("haikiChartSub").textContent="棒をタップで日付選択";
  document.getElementById("haikiChartTotal").innerHTML=
    `<div class="haiki-chart-total-label">月合計</div>
     <div class="haiki-chart-total-val">¥${grand.toLocaleString()}</div>`;

  haikiBarInst=new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        data:totals,
        backgroundColor:totals.map((_,i)=>
          i===selIdx?"#b91c1c":"rgba(185,28,28,0.25)"
        ),
        borderRadius:4,
        borderSkipped:false,
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      onClick:(_,els)=>{
        if(els.length>0){
          const d=els[0].index+1;
          window.haikiSelDay=d;
          renderHaikiDayList(fy,mi);
          renderHaikiForm(fy,mi,d);
          refreshHaikiBarChart(fy,mi);
          refreshHaikiWdChart(fy,mi);
        }
      },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:8,
          callbacks:{
            title:ctx2=>[ctx2[0].label],
            label:ctx2=>`廃棄: ¥${ctx2.parsed.y.toLocaleString()}`,
          }
        }
      },
      scales:{
        x:{grid:{display:false},ticks:{color:"#aaa",font:{size:8},
          maxTicksLimit:15,maxRotation:0},border:{display:false}},
        y:{grid:{color:"#f0f0f0",drawBorder:false},
          ticks:{color:"#aaa",font:{size:8},
            callback:v=>v>=10000?`${(v/10000).toFixed(0)}万`:v>0?v:""},
          border:{display:false}}
      }
    }
  });
}

function refreshHaikiWdChart(fy,mi){
  const ctx=document.getElementById("haikiWdChart");
  if(!ctx)return;
  if(haikiWdChartInst){haikiWdChartInst.destroy();haikiWdChartInst=null;}

  // 曜日別に廃棄金額を集計
  const wdSums=Array(7).fill(0);
  const wdCounts=Array(7).fill(0);
  drafts.haiki.forEach(r=>{
    const d=parseInt(r.d);
    const total=HAIKI_CATS.reduce((s,c)=>s+(Number(r.haiki?.[c])||0),0);
    if(total>0){
      const wd=getWeekday(fy,mi,d);
      wdSums[wd]+=total;
      wdCounts[wd]++;
    }
  });
  const wdAvg=wdSums.map((s,i)=>wdCounts[i]>0?Math.round(s/wdCounts[i]):0);

  haikiWdChartInst=new Chart(ctx,{
    type:"bar",
    data:{
      labels:WEEKDAYS,
      datasets:[{
        data:wdAvg,
        backgroundColor:WEEKDAYS.map((_,i)=>{
          if(i===0)return"rgba(220,38,38,0.7)";
          if(i===6)return"rgba(59,130,246,0.7)";
          return"rgba(185,28,28,0.55)";
        }),
        borderRadius:4,borderSkipped:false,
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:7,
          callbacks:{label:c=>`平均: ¥${c.parsed.y.toLocaleString()}`}
        }
      },
      scales:{
        x:{grid:{display:false},ticks:{color:"#aaa",font:{size:9}},border:{display:false}},
        y:{grid:{color:"#f0f0f0"},ticks:{color:"#aaa",font:{size:8},
          callback:v=>v>=10000?`${(v/10000).toFixed(0)}万`:v>0?v:""},
          border:{display:false}}
      }
    }
  });
}

/* ══ 売上入力ページ用チャート ══ */
function refreshSalesLineChart(fy,mi){
  const ctx=document.getElementById("salesLineChart");
  if(!ctx)return;
  if(salesLineInst){salesLineInst.destroy();salesLineInst=null;}

  const rows=drafts.sales;
  const labels=rows.map(r=>r.d+"日");
  const values=rows.map(r=>Number(r.売上)||0);
  const total=values.reduce((a,b)=>a+b,0);
  const selIdx=(window.salesSelDay||1)-1;

  const month=editMonth.sales;
  const titleEl=document.getElementById("salesChartTitle");
  const subEl=document.getElementById("salesChartSub");
  const totEl=document.getElementById("salesChartTotal");
  if(titleEl)titleEl.textContent=`${month} 売上 日別`;
  if(subEl)subEl.textContent="グラフをタップで日付選択";
  if(totEl)totEl.innerHTML=`<div class="haiki-chart-total-label">月合計</div>
     <div class="haiki-chart-total-val">${total.toLocaleString()}千円</div>`;

  salesLineInst=new Chart(ctx,{
    type:"bar",
    data:{labels,datasets:[{
      data:values,
      backgroundColor:values.map((_,i)=>i===selIdx?"#166534":"rgba(22,101,52,0.25)"),
      borderRadius:4,borderSkipped:false,
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      onClick:(_,els)=>{
        if(els.length>0){
          const d=els[0].index+1;
          window.salesSelDay=d;
          renderSalesDayList(fy,mi);
          renderSalesForm(fy,mi,d);
          refreshSalesLineChart(fy,mi);
          refreshSalesWdChart(fy,mi);
        }
      },
      plugins:{
        legend:{display:false},
        tooltip:{backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:8,
          callbacks:{label:c=>`売上: ${c.parsed.y.toLocaleString()}千円`}}
      },
      scales:{
        x:{grid:{display:false},ticks:{color:"#aaa",font:{size:8},maxTicksLimit:15,maxRotation:0},border:{display:false}},
        y:{grid:{color:"#f0f0f0",drawBorder:false},
          ticks:{color:"#aaa",font:{size:8},callback:v=>v>=1000?`${(v/1000).toFixed(0)}万`:v>0?v:""},
          border:{display:false}}
      }
    }
  });
}

function refreshSalesWdChart(fy,mi){
  const ctx=document.getElementById("salesWdChart");
  if(!ctx)return;
  if(salesWdInst){salesWdInst.destroy();salesWdInst=null;}

  const wdSums=Array(7).fill(0),wdCounts=Array(7).fill(0);
  drafts.sales.forEach(r=>{
    const d=parseInt(r.d);
    const v=Number(r.売上)||0;
    if(v>0){const wd=getWeekday(fy,mi,d);wdSums[wd]+=v;wdCounts[wd]++;}
  });
  const wdAvg=wdSums.map((s,i)=>wdCounts[i]>0?Math.round(s/wdCounts[i]):0);

  salesWdInst=new Chart(ctx,{
    type:"bar",
    data:{labels:WEEKDAYS,datasets:[{
      data:wdAvg,
      backgroundColor:WEEKDAYS.map((_,i)=>{
        if(i===0)return"rgba(220,38,38,0.7)";
        if(i===6)return"rgba(59,130,246,0.7)";
        return"rgba(22,101,52,0.6)";
      }),
      borderRadius:4,borderSkipped:false,
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:7,
          callbacks:{label:c=>`平均: ${c.parsed.y.toLocaleString()}千円`}}},
      scales:{
        x:{grid:{display:false},ticks:{color:"#aaa",font:{size:9}},border:{display:false}},
        y:{grid:{color:"#f0f0f0"},ticks:{color:"#aaa",font:{size:8},
          callback:v=>v>=1000?`${(v/1000).toFixed(0)}万`:v>0?v:""},border:{display:false}}
      }
    }
  });
}

/* ══ 客数入力ページ用チャート ══ */
function refreshKyakuLineChart(fy,mi){
  const ctx=document.getElementById("kyakuLineChart");
  if(!ctx)return;
  if(kyakuLineInst){kyakuLineInst.destroy();kyakuLineInst=null;}

  const rows=drafts.kyaku||drafts.sales;
  const labels=rows.map(r=>r.d+"日");
  const values=rows.map(r=>Number(r.客数)||0);
  const total=values.reduce((a,b)=>a+b,0);

  const month=editMonth.kyaku;
  const titleEl=document.getElementById("kyakuChartTitle");
  const totEl=document.getElementById("kyakuChartTotal");
  if(titleEl)titleEl.textContent=`${month} 客数 日別`;
  if(totEl)totEl.innerHTML=`<div class="haiki-chart-total-label">月合計</div>
     <div class="haiki-chart-total-val">${total.toLocaleString()}人</div>`;

  const selIdx=(window.kyakuSelDay||0)-1;

  kyakuLineInst=new Chart(ctx,{
    type:"bar",
    data:{labels,datasets:[{
      data:values,
      backgroundColor:values.map((_,i)=>i===selIdx?"#555":"rgba(85,85,85,0.25)"),
      borderRadius:4,borderSkipped:false,
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:8,
          callbacks:{label:c=>`客数: ${c.parsed.y.toLocaleString()}人`}}},
      scales:{
        x:{grid:{display:false},ticks:{color:"#aaa",font:{size:8},maxTicksLimit:15,maxRotation:0},border:{display:false}},
        y:{grid:{color:"#f0f0f0",drawBorder:false},ticks:{color:"#aaa",font:{size:8}},border:{display:false}}
      }
    }
  });
}

function refreshKyakuWdChart(fy,mi){
  const ctx=document.getElementById("kyakuWdChart");
  if(!ctx)return;
  if(kyakuWdInst){kyakuWdInst.destroy();kyakuWdInst=null;}

  const wdSums=Array(7).fill(0),wdCounts=Array(7).fill(0);
  (drafts.kyaku||drafts.sales).forEach(r=>{
    const d=parseInt(r.d);
    const v=Number(r.客数)||0;
    if(v>0){const wd=getWeekday(fy,mi,d);wdSums[wd]+=v;wdCounts[wd]++;}
  });
  const wdAvg=wdSums.map((s,i)=>wdCounts[i]>0?Math.round(s/wdCounts[i]):0);

  kyakuWdInst=new Chart(ctx,{
    type:"bar",
    data:{labels:WEEKDAYS,datasets:[{
      data:wdAvg,
      backgroundColor:WEEKDAYS.map((_,i)=>{
        if(i===0)return"rgba(220,38,38,0.7)";
        if(i===6)return"rgba(59,130,246,0.7)";
        return"rgba(85,85,85,0.55)";
      }),
      borderRadius:4,borderSkipped:false,
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:"#fff",titleColor:"#111",bodyColor:"#555",
          borderColor:"#e0e0e0",borderWidth:1,padding:7,
          callbacks:{label:c=>`平均: ${c.parsed.y.toLocaleString()}人`}}},
      scales:{
        x:{grid:{display:false},ticks:{color:"#aaa",font:{size:9}},border:{display:false}},
        y:{grid:{color:"#f0f0f0"},ticks:{color:"#aaa",font:{size:8}},border:{display:false}}
      }
    }
  });
}

function renderHaikiDayList(fy,mi){
  const list=document.getElementById("haikiDayList");
  if(!list)return;
  list.innerHTML="";
  drafts.haiki.forEach((row,ri)=>{
    const d=parseInt(row.d);
    const wd=getWeekday(fy,mi,d);
    const isHol=wd!==0&&isHolidayFY(fy,mi,d);
    const wdLabel=WEEKDAYS[wd];
    const wdc=wd===0?"sun":wd===6?"sat":isHol?"hol":"";
    const total=HAIKI_CATS.reduce((s,c)=>s+(Number(row.haiki?.[c])||0),0);
    const hasData=total>0;
    const btn=document.createElement("button");
    btn.className=`haiki-day-btn${d===window.haikiSelDay?" sel":""}${hasData?" has-data":""}`;
    btn.innerHTML=`<div class="hdb-num">${d}日</div>
      <div class="hdb-wd ${wdc}">${wdLabel}曜</div>
      ${hasData?`<div class="hdb-tot">¥${total.toLocaleString()}</div>`:`<div class="hdb-tot">未入力</div>`}`;
    btn.onclick=()=>{window.haikiSelDay=d;renderHaikiDayList(fy,mi);renderHaikiForm(fy,mi,d);};
    list.appendChild(btn);
  });
}

function renderHaikiForm(fy,mi,day){
  const form=document.getElementById("haikiForm");
  if(!form)return;
  const ri=day-1;
  const row=drafts.haiki[ri]||{haiki:blankHaiki()};
  const wd=getWeekday(fy,mi,day);
  const wdLabel=WEEKDAYS[wd];
  form.innerHTML=`<div class="hf-title">${editMonth.haiki} ${day}日（${wdLabel}曜日）</div>`+
    HAIKI_CATS.map(c=>`
      <div class="hf-field">
        <span class="hf-label">${c}</span>
        <div class="hf-input-wrap">
          <input type="text" inputmode="numeric"
            value="${(row.haiki?.[c]||0)>0?(row.haiki[c]).toLocaleString():""}"
            placeholder="0"
            data-ri="${ri}" data-hc="${c}" id="hf_${c}">
          <span class="hf-unit">円</span>
        </div>
      </div>`).join("")+
    `<div class="hf-total">
      <span class="hf-total-label">合計廃棄金額</span>
      <span class="hf-total-val" id="hfTotalVal">¥${HAIKI_CATS.reduce((s,c)=>s+(Number(row.haiki?.[c])||0),0).toLocaleString()}円</span>
    </div>`+
    renderHaikiBudgetSection(
      HAIKI_CATS.reduce((s,c)=>s+(Number(row.haiki?.[c])||0),0),
      row.haiki||blankHaiki()
    );
  form.querySelectorAll("input[data-hc]").forEach(inp=>{
    const c=inp.dataset.hc;
    // 計算式対応: focusでカンマ除去、blurで式を評価してカンマ表示
    inp.addEventListener("focus",()=>{
      const n=fromComma(inp.value);
      inp.value=n>0?String(n):"";
    });
    inp.addEventListener("blur",e=>{
      const ri2=+e.target.dataset.ri,c=e.target.dataset.hc;
      const n=commaBlurWithFormula(e.target);
      if(!drafts.haiki[ri2].haiki)drafts.haiki[ri2].haiki=blankHaiki();
      drafts.haiki[ri2].haiki[c]=n;
      const total=HAIKI_CATS.reduce((s,cat)=>s+(Number(drafts.haiki[ri2].haiki?.[cat])||0),0);
      const tv=document.getElementById("hfTotalVal");
      if(tv)tv.textContent=`¥${total.toLocaleString()}円`;
      const btnEl=document.querySelector(`.haiki-day-btn:nth-child(${ri2+1})`);
      if(btnEl){
        btnEl.classList.toggle("has-data",total>0);
        const totEl=btnEl.querySelector(".hdb-tot");
        if(totEl)totEl.textContent=total>0?`¥${total.toLocaleString()}`:"未入力";
      }
      updateTotals("haiki");
      if(haikiBarInst){
        const mi3=MONTHS.indexOf(editMonth.haiki);
        haikiBarInst.data.datasets[0].backgroundColor=drafts.haiki.map((_,i)=>
          i===(window.haikiSelDay-1)?"#b91c1c":"rgba(185,28,28,0.25)");
        haikiBarInst.data.datasets[0].data=drafts.haiki.map(r=>
          HAIKI_CATS.reduce((s,c)=>s+(Number(r.haiki?.[c])||0),0));
        const grand=haikiBarInst.data.datasets[0].data.reduce((a,b)=>a+b,0);
        const totEl=document.getElementById("haikiChartTotal");
        if(totEl)totEl.innerHTML=`<div class="haiki-chart-total-label">月合計</div>
          <div class="haiki-chart-total-val">¥${grand.toLocaleString()}</div>`;
        haikiBarInst.update();
      }
      // 予算セクション更新
      const budgetSec=form.querySelector(".hf-budget-section");
      if(budgetSec){
        const tmp=document.createElement("div");
        tmp.innerHTML=renderHaikiBudgetSection(total,drafts.haiki[ri2].haiki||blankHaiki());
        budgetSec.replaceWith(tmp.firstElementChild);
      }
    });
    attachValidation(inp,c,()=>drafts.haiki);
    inp.addEventListener("input",e=>{
      const ri2=+e.target.dataset.ri,c=e.target.dataset.hc;
      if(!drafts.haiki[ri2].haiki)drafts.haiki[ri2].haiki=blankHaiki();
      drafts.haiki[ri2].haiki[c]=fromComma(e.target.value);
      const total=HAIKI_CATS.reduce((s,cat)=>s+(Number(drafts.haiki[ri2].haiki?.[cat])||0),0);
      const tv=document.getElementById("hfTotalVal");
      if(tv)tv.textContent=`¥${total.toLocaleString()}円`;
      // update day list total
      const btnEl=document.querySelector(`.haiki-day-btn:nth-child(${ri2+1})`);
      if(btnEl){
        btnEl.classList.toggle("has-data",total>0);
        const totEl=btnEl.querySelector(".hdb-tot");
        if(totEl)totEl.textContent=total>0?`¥${total.toLocaleString()}`:"未入力";
      }
      updateTotals("haiki");
      // グラフ更新（選択中の棒を強調）
      if(haikiBarInst){
        const mi3=MONTHS.indexOf(editMonth.haiki);
        haikiBarInst.data.datasets[0].backgroundColor=drafts.haiki.map((_,i)=>
          i===(window.haikiSelDay-1)?"#b91c1c":"rgba(185,28,28,0.25)");
        haikiBarInst.data.datasets[0].data=drafts.haiki.map(r=>
          HAIKI_CATS.reduce((s,c)=>s+(Number(r.haiki?.[c])||0),0));
        const grand=haikiBarInst.data.datasets[0].data.reduce((a,b)=>a+b,0);
        const totEl=document.getElementById("haikiChartTotal");
        if(totEl)totEl.innerHTML=`<div class="haiki-chart-total-label">月合計</div>
          <div class="haiki-chart-total-val">¥${grand.toLocaleString()}</div>`;
        haikiBarInst.update();
      }
    });
  });
}

function updateTotals(type){
  if(type==="sales"){
    // sales合計はフォームに表示（tot_salesは不要）
    // 月合計をフォームのタイトル付近に反映させたい場合のみ更新
  }else if(type==="kyaku"){
    updateKyakuTotal();
  }
  // haiki合計はフォーム内で管理
}

function saveInput(type){
  if(!store.data[editYear[type]])store.data[editYear[type]]=blankYearData(editYear[type]);
  const clean=drafts[type].map(r=>{
    const row={d:r.d,weather:r.weather||""};
    ["売上","客数","買上点数"].forEach(k=>{
      row[k]=r[k]===""?0:k==="買上点数"?parseFloat(r[k])||0:Number(r[k])||0;
    });
    const h={};HAIKI_CATS.forEach(c=>{h[c]=r.haiki?.[c]===""?0:Number(r.haiki?.[c])||0;});
    row.haiki=h;
    row.廃棄金額=type==="haiki"?HAIKI_CATS.reduce((s,c)=>s+(h[c]||0),0):(store.data[editYear[type]][editMonth[type]]?.[parseInt(r.d)-1]?.廃棄金額||0);
    return row;
  });
  if(type!=="haiki"){
    const existing=store.data[editYear[type]][editMonth[type]]||[];
    clean.forEach((r,i)=>{if(existing[i]){r.haiki=existing[i].haiki||blankHaiki();r.廃棄金額=existing[i].廃棄金額||0;}});
  }
  store.data[editYear[type]][editMonth[type]]=clean;
  // 天気を共有ストアに同期
  clean.forEach(r=>{if(r.weather)setSharedWeather(editYear[type],editMonth[type],r.d,r.weather);});
  persist();updateMissingBadge();
  const msgId={sales:"savedSales",kyaku:"savedKyaku",haiki:"savedHaiki"}[type];
  const msg=document.getElementById(msgId);
  if(msg){msg.classList.add("is-visible");setTimeout(()=>msg.classList.remove("is-visible"),3000);}
}

function clearDayData(type){
  const label={sales:"売上入力",haiki:"廃棄入力"}[type]||type;
  const y=editYear[type],m=editMonth[type];
  const day=type==="sales"?window.salesSelDay:window.haikiSelDay;
  const storeName=store.name;
  if(!day){alert("日付が選択されていません。");return;}
  if(!confirm(`${storeName} の ${m}${day}日 の${label}データを削除します。\n\nこの操作は元に戻せません。よろしいですか？`)){
    return;
  }
  if(!store.data[y]||!store.data[y][m])return;
  const ri=day-1;
  if(!store.data[y][m][ri])return;
  store.data[y][m][ri]=blankRow(day);
  persist();
  initInputPage(type);
  updateMissingBadge();
  showToast(`🗑 ${m}${day}日のデータをクリアしました`,"#dc2626","#fef2f2");
}

function clearKyakuMonth(){
  const y=editYear.kyaku,m=editMonth.kyaku;
  const storeName=store.name;
  if(!confirm(`${storeName} の ${m}（${y}年）の客数データを全て削除します。\n\nこの操作は元に戻せません。よろしいですか？`)){
    return;
  }
  if(!store.data[y]||!store.data[y][m])return;
  const mi=MONTHS.indexOf(m);
  store.data[y][m]=blankMonthData(mi,y);
  persist();
  initInputPage("kyaku");
  updateMissingBadge();
  showToast(`🗑 ${m}の客数データをクリアしました`,"#dc2626","#fef2f2");
}

function clearTodayData(){
  const t=todayFY();
  const storeName=store.name;
  if(!confirm(`${storeName} の本日（${t.month}${t.day}日）の入力データを削除します。\n\nこの操作は元に戻せません。よろしいですか？`)){
    return;
  }
  if(!store.data[t.fy]||!store.data[t.fy][t.month])return;
  const ri=t.day-1;
  const row=store.data[t.fy][t.month][ri];
  if(row){
    row.売上=0;row.客数=0;row.買上点数=0;row.廃棄金額=0;row.haiki=blankHaiki();
  }
  persist();
  initQuickPage();
  updateMissingBadge();
  showToast("🗑 本日のデータをクリアしました","#dc2626","#fef2f2");
}

/* ══ バックアップ・復元 ══ */
const BACKUP_KEY="insight_last_backup";

function updateBackupDaysLabel(){
  const label=document.getElementById("backupDaysLabel");
  if(!label)return;
  label.classList.remove("backup-status-missing","backup-status-today","backup-status-recent","backup-status-stale");
  const last=localStorage.getItem(BACKUP_KEY);
  if(!last){label.textContent="未バックアップ";label.classList.add("backup-status-missing");return;}
  const days=Math.floor((Date.now()-parseInt(last))/(1000*60*60*24));
  if(days===0){label.textContent="今日バックアップ済";label.classList.add("backup-status-today");}
  else if(days<=7){label.textContent=`${days}日前`;label.classList.add("backup-status-recent");}
  else{label.textContent=`${days}日経過 ⚠️`;label.classList.add("backup-status-stale");}
}

function backupData(){
  const now=new Date();
  const pad=n=>String(n).padStart(2,"0");
  const storeName=allStores.stores[allStores.current]?.name||"店舗";
  const filename=`insight_backup_${storeName}_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
  const json=JSON.stringify(allStores,null,2);
  const blob=new Blob([json],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  localStorage.setItem(BACKUP_KEY,String(Date.now()));
  updateBackupDaysLabel();
  showToast("📥 バックアップを保存しました","#15803d","#f0fdf4");
}

function restoreData(e){
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      // 新形式(allStores)・旧形式(単店舗)どちらも対応
      let newAll;
      if(data.stores&&data.current){
        newAll=data;
      }else if(data.years&&data.data){
        newAll=migrateOldData(data);
      }else throw new Error("invalid");
      if(!confirm(`${file.name}\nのデータを復元します。現在の全データは上書きされます。よろしいですか？`)){
        e.target.value="";return;
      }
      allStores=newAll;
      store=allStores.stores[allStores.current];
      persist();
      baseYear=store.years[store.years.length-1];
      cmpYear=store.years.length>1?store.years[store.years.length-2]:null;
      editYear={sales:baseYear,kyaku:baseYear,haiki:baseYear};
      editMonth={sales:todayFY().month,kyaku:todayFY().month,haiki:todayFY().month};
      renderStoreSel();
      if(currentNav===1)refreshDash();
      else if(currentNav>1)initInputPage(["","","sales","kyaku","haiki"][currentNav]);
      else initQuickPage();
      updateMissingBadge();
      showToast("📤 データを復元しました","#1d4ed8","#eff6ff");
    }catch(err){
      alert("ファイルの読み込みに失敗しました。\n正しいバックアップファイルを選択してください。");
    }
    e.target.value="";
  };
  reader.readAsText(file);
}

function importCSV(e){
  const file=e.target.files[0];
  if(!file){return;}
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const lines=ev.target.result.split('\n').map(l=>l.trim()).filter(l=>l);
      if(lines.length<2)throw new Error('データがありません');

      // ヘッダー行を確認
      const header=lines[0].split(',').map(h=>h.trim());
      const dateIdx=header.findIndex(h=>h.includes('日付')||h.toLowerCase()==='date');
      const salesIdx=header.findIndex(h=>h.includes('売上')&&!h.includes('廃棄'));
      const kyakuIdx=header.findIndex(h=>h.includes('客数'));
      const tensuIdx=header.findIndex(h=>h.includes('買上')||h.includes('点数'));
      const haikiTotalIdx=header.findIndex(h=>h.includes('廃棄金額')||h.includes('廃棄合計'));
      // 廃棄カテゴリ列のインデックス（サブカテゴリのエイリアスも対応）
      const haikiCatIdx={};
      const haikiAliases={
        'FF':['FF','FFおでん','FFフライヤー','FFフライヤーその他'],
        'その他デイリー':['その他デイリー','牛乳','乳飲料','牛乳・乳飲料','生活デイリー'],
      };
      HAIKI_CATS.forEach(c=>{
        const aliases=haikiAliases[c]||[c];
        const idx=header.findIndex(h=>aliases.some(a=>h===a||h.includes(a)));
        if(idx>=0)haikiCatIdx[c]=idx;
      });
      // サブカテゴリが複数列ある場合（FFおでん列とFFフライヤー列が別々など）
      const haikiSubCols={};
      header.forEach((h,i)=>{
        if(h.includes('FFおでん')||h.includes('FFフライヤー'))
          (haikiSubCols['FF']=haikiSubCols['FF']||[]).push(i);
        if(h.includes('牛乳')||h.includes('乳飲料')||h.includes('生活デイリー'))
          (haikiSubCols['その他デイリー']=haikiSubCols['その他デイリー']||[]).push(i);
      });
      if(dateIdx<0)throw new Error('「日付」列が見つかりません');

      // データ行を解析
      const rows=[];
      let skipped=0;
      for(let i=1;i<lines.length;i++){
        const cols=lines[i].split(',').map(c=>c.trim());
        const dateStr=cols[dateIdx]||'';
        const m=dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if(!m){skipped++;continue;}
        const year=m[1],month=parseInt(m[2]),day=parseInt(m[3]);
        const mName=MONTHS[month-1];
        if(!mName){skipped++;continue;}
        // 廃棄カテゴリ（サブカテゴリは合算）
        const haiki={};
        HAIKI_CATS.forEach(c=>{
          let val=0;
          if(haikiSubCols[c]&&haikiSubCols[c].length>1){
            // 複数のサブカテゴリ列を合算
            haikiSubCols[c].forEach(i=>{val+=parseInt(String(cols[i]||'0').replace(/,/g,''))||0;});
          }else if(haikiCatIdx[c]!==undefined){
            val=parseInt(String(cols[haikiCatIdx[c]]||'0').replace(/,/g,''))||0;
          }
          if(val>0)haiki[c]=val;
        });
        rows.push({
          year,mName,day,
          sales:salesIdx>=0?parseInt(String(cols[salesIdx]).replace(/,/g,''))||0:null,
          kyaku:kyakuIdx>=0?parseInt(String(cols[kyakuIdx]).replace(/,/g,''))||0:null,
          tensu:tensuIdx>=0?parseFloat(String(cols[tensuIdx]).replace(/,/g,''))||0:null,
          haikiTotal:haikiTotalIdx>=0?parseInt(String(cols[haikiTotalIdx]).replace(/,/g,''))||0:null,
          haiki:Object.keys(haiki).length>0?haiki:null,
        });
      }
      if(rows.length===0)throw new Error('有効なデータ行がありません');

      // 確認ダイアログ
      const years=[...new Set(rows.map(r=>r.year))].sort();
      const hasHaiki=rows.some(r=>r.haiki||r.haikiTotal>0);
      if(!confirm(`${file.name}\n\n${rows.length}件のデータを取り込みます。\n対象年度: ${years.join(', ')}\n含むデータ: 売上・客数・買上点数${hasHaiki?'・廃棄':''}\n\n既存データは上書きされます。よろしいですか？`)){
        e.target.value='';return;
      }

      // 年度が存在しない場合は作成
      years.forEach(y=>{
        if(!store.years.includes(y)){
          store.years.push(y);store.years.sort();
          store.data[y]=blankYearData(y);
        }
      });

      // データを書き込む
      let imported=0;
      rows.forEach(({year,mName,day,sales,kyaku,tensu,haikiTotal,haiki})=>{
        if(!store.data[year])store.data[year]=blankYearData(year);
        if(!store.data[year][mName])return;
        const ri=day-1;
        if(ri<0||ri>=store.data[year][mName].length)return;
        const row=store.data[year][mName][ri];
        if(sales!==null&&sales>0)row.売上=sales;
        if(kyaku!==null&&kyaku>0)row.客数=kyaku;
        if(tensu!==null&&tensu>0)row.買上点数=tensu;
        if(haikiTotal!==null&&haikiTotal>0)row.廃棄金額=haikiTotal;
        if(haiki){
          if(!row.haiki)row.haiki=blankHaiki();
          HAIKI_CATS.forEach(c=>{if(haiki[c]>0)row.haiki[c]=haiki[c];});
          // 廃棄合計を自動計算
          row.廃棄金額=HAIKI_CATS.reduce((s,c)=>s+(row.haiki[c]||0),0);
        }
        imported++;
      });

      persist();
      baseYear=store.years[store.years.length-1];
      editYear={sales:baseYear,kyaku:baseYear,haiki:baseYear};
      if(currentNav===1)refreshDash();
      updateMissingBadge();
      showToast(`📊 ${imported}件のデータを取り込みました${skipped>0?' ('+skipped+'件スキップ)':''}`, '#1d4ed8','#eff6ff');
    }catch(err){
      alert('CSVの読み込みに失敗しました。\n\n'+err.message+'\n\n形式例:\n日付,売上,客数,買上点数,廃棄金額\n2025-01-01,1234,150,3.45,25000');
    }
    e.target.value='';
  };
  reader.readAsText(file,'UTF-8');
}

/* ══ ① 入力漏れの可視化 ══ */
function checkTodayInput(){
  const t=todayFY();
  if(!store.data[t.fy])return{sales:false,kyaku:false,haiki:false};
  const rows=store.data[t.fy][t.month]||[];
  const row=rows[t.day-1];
  if(!row)return{sales:false,kyaku:false,haiki:false};
  return{
    sales:(Number(row.売上)||0)>0,
    kyaku:(Number(row.客数)||0)>0,
    haiki:HAIKI_CATS.reduce((s,c)=>s+(Number(row.haiki?.[c])||0),0)>0,
  };
}

function updateMissingBadge(){
  const status=checkTodayInput();
  const allDone=status.sales&&status.kyaku&&status.haiki;

  // 今日の入力ボタン：完了時のみ表示
  const badge=document.getElementById("todayBadge");
  if(badge){
    if(allDone){
      badge.textContent="✓ 完了";
      badge.className="today-badge";
      badge.classList.remove("is-hidden");
    } else {
      badge.classList.add("is-hidden");
    }
  }

  // 各入力ページのバッジは表示しない
  [2,3,4].forEach(i=>{
    const btn=document.getElementById(`nav${i}`);
    if(btn)btn.querySelectorAll(".missing-badge,.warn-badge,.done-badge").forEach(b=>b.remove());
  });
}

/* ══ ② 入力値バリデーション ══ */
function validateInput(key,value,prevValues){
  const n=Number(value)||0;
  const warnings=[];

  if(key==="売上"){
    if(n<0)warnings.push("売上がマイナスです");
    if(n>500000)warnings.push(`売上が${n.toLocaleString()}千円と非常に大きい値です`);
    if(prevValues.length>0){
      const avg=prevValues.reduce((a,b)=>a+b,0)/prevValues.length;
      if(avg>0&&n>avg*5)warnings.push(`平均(${Math.round(avg).toLocaleString()}千円)の5倍以上です`);
    }
  }
  if(key==="客数"){
    if(n<0)warnings.push("客数がマイナスです");
    if(n>3000)warnings.push(`客数が${n.toLocaleString()}人と非常に多い値です`);
  }
  if(key==="買上点数"){
    if(n<0)warnings.push("買上点数がマイナスです");
    if(n>10000)warnings.push(`買上点数が${n.toLocaleString()}点と非常に多い値です`);
  }
  if(HAIKI_CATS.includes(key)){
    if(n<0)warnings.push("廃棄金額がマイナスです");
    if(n>500000)warnings.push(`廃棄金額が¥${n.toLocaleString()}と非常に大きい値です`);
  }
  return warnings;
}

function attachValidation(input,key,getDraftFn){
  input.addEventListener("blur",e=>{
    const v=Number(e.target.value)||0;
    // 同じキーの過去30日分を参考値として取得
    const draft=getDraftFn();
    const prevValues=draft
      .filter(r=>r!==draft[+e.target.dataset.ri||0])
      .map(r=>Number(r[key])||0)
      .filter(n=>n>0)
      .slice(-14);
    const warns=validateInput(key,v,prevValues);
    if(warns.length>0){
      const ok=confirm("⚠️ 入力値の確認\n\n"+warns.join("\n")+"\n\nこの値で入力を続けますか？");
      if(!ok){e.target.value="";e.target.focus();}
    }
  });
}

function showToast(msg,color,bg){
  const t=document.createElement("div");
  t.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${bg};color:${color};border-radius:12px;padding:10px 20px;
    font-size:13px;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.12);
    white-space:nowrap;font-family:-apple-system,sans-serif;`;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

/* ══ ダークモード ══ */
const MOON_SVG=`<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`;
const SUN_SVG=`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`;
function setDarkModeIcon(isDark){
  const el=document.getElementById("darkModeIcon");
  if(el)el.innerHTML=isDark?SUN_SVG:MOON_SVG;
  const lbl=document.getElementById("darkModeLabel");
  if(lbl)lbl.textContent=isDark?"ライトモード":"ダークモード";
}
function toggleDarkMode(){
  const isDark=document.documentElement.classList.toggle("dark");
  setDarkModeIcon(isDark);
  localStorage.setItem("insight_dark",isDark?"1":"0");
  const gridColor=isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)";
  const tickColor=isDark?"#666676":"#ccc";
  Chart.defaults.color=isDark?"#888898":"#999";
  [mainChartInst,wdChartInst,haikiBarInst,haikiWdChartInst,salesLineInst,salesWdInst,kyakuLineInst,kyakuWdInst].forEach(inst=>{
    if(!inst)return;
    Object.values(inst.options.scales||{}).forEach(ax=>{
      if(ax.grid)ax.grid.color=gridColor;
      if(ax.ticks)ax.ticks.color=tickColor;
    });
    inst.update();
  });
}
function applyDarkMode(isDark){
  if(isDark){
    document.documentElement.classList.add("dark");
    setDarkModeIcon(true);
    Chart.defaults.color="#888898";
  }
}

/* ══ Boot ══ */
applyTheme("mono");
renderStoreSel();
initQuickPage();
updateMissingBadge();
updateBackupDaysLabel();
if(localStorage.getItem("insight_dark")==="1")applyDarkMode(true);

/* ══ PWA セットアップ ══ */
(function setupPWA(){
  // SVGアイコン生成
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="112" fill="#1a1a1a"/>
    <text x="256" y="340" font-family="-apple-system,sans-serif" font-size="260"
      font-weight="800" fill="white" text-anchor="middle">I</text>
    <text x="256" y="430" font-family="-apple-system,sans-serif" font-size="72"
      font-weight="600" fill="rgba(255,255,255,0.55)" text-anchor="middle">nsight</text>
  </svg>`;
  const svgDataUri="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(svg)));

  // アイコン設定
  document.getElementById("appleIcon180").href=svgDataUri;
  document.getElementById("appleIcon152").href=svgDataUri;
  document.getElementById("favicon").href=svgDataUri;

  // Web Manifest（動的生成）
  const manifest={
    name:"Insight — コンビニ経営ダッシュボード",
    short_name:"Insight",
    description:"売上・客数・廃棄を日次管理するコンビニ向けダッシュボード",
    start_url:"./",
    display:"standalone",
    orientation:"landscape",
    background_color:"#1a1a1a",
    theme_color:"#1a1a1a",
    lang:"ja",
    icons:[
      {src:svgDataUri,sizes:"512x512",type:"image/svg+xml",purpose:"any maskable"},
      {src:svgDataUri,sizes:"192x192",type:"image/svg+xml"},
    ]
  };
  const manifestBlob=new Blob([JSON.stringify(manifest)],{type:"application/manifest+json"});
  const manifestUrl=URL.createObjectURL(manifestBlob);
  document.getElementById("manifestLink").href=manifestUrl;

  // Service Worker: blob URLはiOS Safariで動作しないため省略
  // Chart.jsはブラウザの通常キャッシュで自動的にオフライン対応される

  // インストール促進バナー（未インストール時のみ）
  window._deferredPrompt=null;
  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();window._deferredPrompt=e;showInstallBanner();
  });
  // iOSはbeforeinstallpromptが発火しないので別途案内
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone=window.navigator.standalone===true;
  if(isIOS&&!isStandalone){
    setTimeout(showIOSInstallHint,2000);
  }
})();

function showInstallBanner(){
  const banner=document.createElement("div");
  banner.id="installBanner";
  banner.style.cssText=`position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:#1a1a1a;color:#fff;border-radius:14px;padding:12px 20px;
    display:flex;align-items:center;gap:12px;z-index:9999;
    box-shadow:0 8px 30px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif;
    font-size:13px;font-weight:600;white-space:nowrap;`;
  banner.innerHTML=`<span>📲 ホーム画面に追加して使う</span>
    <button onclick="doInstall()" style="background:#fff;color:#1a1a1a;border:none;
      border-radius:8px;padding:6px 14px;font-weight:800;font-size:12px;cursor:pointer;">
      追加する
    </button>
    <button onclick="this.closest('#installBanner').remove()" style="background:transparent;
      color:rgba(255,255,255,0.5);border:none;font-size:16px;cursor:pointer;padding:0 4px;">✕</button>`;
  document.body.appendChild(banner);
  setTimeout(()=>banner.remove&&banner.remove(),15000);
}

function doInstall(){
  if(window._deferredPrompt){window._deferredPrompt.prompt();document.getElementById("installBanner")?.remove();}
}

function showIOSInstallHint(){
  // すでにバナーがあれば表示しない
  if(document.getElementById("iosHint"))return;
  const hint=document.createElement("div");
  hint.id="iosHint";
  hint.style.cssText=`position:fixed;bottom:0;left:0;right:0;
    background:#1a1a1a;color:#fff;border-radius:18px 18px 0 0;
    padding:20px 24px 32px;z-index:9999;
    box-shadow:0 -8px 30px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif;`;
  hint.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:15px;font-weight:800;">📲 アプリとして使う</div>
      <button onclick="this.closest('#iosHint').remove()" style="background:rgba(255,255,255,0.15);
        color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">後で</button>
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Safariのアドレスバー下の <strong style="color:#fff;">共有ボタン（□↑）</strong> をタップして<br>
      <strong style="color:#fff;">「ホーム画面に追加」</strong> を選ぶとアプリとして起動できます。
    </div>
    <div style="margin-top:14px;display:flex;gap:12px;align-items:center;">
      <div style="text-align:center;background:rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;font-size:20px;">□↑</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);">ブラウザの共有ボタン</div>
      <div style="font-size:20px;">→</div>
      <div style="text-align:center;background:rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;font-size:20px;">＋</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);">ホーム画面に追加</div>
    </div>`;
  document.body.appendChild(hint);
}
