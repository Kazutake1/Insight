/* Bootstrap payload compatibility patches v1.
 * Runs before the decompressed legacy payload is executed.
 * Every compatibility patch is required: a missing target fails fast.
 */
(function(root){
'use strict';
function apply(html){
  function patch(search,replacement){
    if(html.indexOf(search)<0){
      throw new Error('Insight互換パッチの適用対象が見つかりません: '+String(search).slice(0,80));
    }
    html=html.replace(search,replacement);
  }
// STEP5 retained: base weather constants are lexical core state, so keep these pre-execution compatibility patches until the payload source itself is migrated.
patch("const WX_KEYS=[\"快晴\",\"晴\",\"晴曇\",\"曇\",\"小雨\",\"雨\",\"大雨\",\"みぞれ\",\"雪\"];","const WX_KEYS=[\"快晴\",\"晴\",\"晴曇\",\"曇\",\"小雨\",\"雨\",\"大雨\",\"みぞれ\",\"雪\",\"霧\",\"凍雨\",\"雷雨\"];");
patch("\"雪\":\"❄️\",\"\":\"\"","\"雪\":\"❄️\",\"霧\":\"🌫️\",\"凍雨\":\"🧊\",\"雷雨\":\"🌩️\",\"\":\"\"");
patch("const wxGroups={\"晴れ\":[\"快晴\",\"晴\",\"晴曇\"],\"曇り\":[\"曇\"],\"雨\":[\"小雨\",\"雨\",\"大雨\"],\"雪\":[\"みぞれ\",\"雪\"]};","const wxGroups={\"晴れ\":[\"快晴\",\"晴\",\"晴曇\"],\"曇り\":[\"曇\"],\"雨\":[\"小雨\",\"雨\",\"大雨\"],\"雪\":[\"みぞれ\",\"雪\"],\"霧\":[\"霧\"],\"凍雨\":[\"凍雨\"],\"雷雨\":[\"雷雨\"]};");
// STEP5 retained: saved data must never silently fall back to a blank store when startup restore fails.
var originalLoadAll="function loadAll(){\n  try{\n    const s=localStorage.getItem(SK);\n    if(s){\n      const all=JSON.parse(s);\n      // 各店舗データのマイグレーション\n      Object.values(all.stores).forEach(st=>{\n        Object.values(st.data).forEach(yd=>{\n          Object.values(yd).forEach(rows=>{\n            if(Array.isArray(rows))rows.forEach(r=>{\n              if(!r.haiki)r.haiki=blankHaiki();\n              if(r.weather===undefined)r.weather=\"\";\n            });\n          });\n        });\n      });\n      return all;\n    }\n    // 古いキー(v8/v9)からのマイグレーション\n    for(const oldKey of[\"insight_v9\",\"insight_v8\"]){\n      const old=localStorage.getItem(oldKey);\n      if(old){\n        const migrated=migrateOldData(JSON.parse(old));\n        return migrated;\n      }\n    }\n  }catch(e){}\n  // 初回：今年度の空データ\n  const t=todayFY();\n  const sid=\"store_1\";\n  return{current:sid,stores:{[sid]:{name:\"店舗1\",years:[t.fy],data:{[t.fy]:blankYearData(t.fy)}}}};\n}";
var safeLoadAll="function loadAll(){\n  function failStoredDataLoad(error){\n    try{\n      document.body.innerHTML=\"\";\n      const box=document.createElement(\"div\");\n      box.id=\"insightStorageLoadError\";\n      box.style.cssText=\"max-width:720px;margin:48px auto;padding:24px;font-family:-apple-system,Hiragino Kaku Gothic ProN,Noto Sans JP,sans-serif;color:#1a1a1a;background:#fff;border:1px solid #e5e7eb;border-radius:16px\";\n      const heading=document.createElement(\"h2\");\n      heading.style.cssText=\"margin:0 0 12px;font-size:18px\";\n      heading.textContent=\"保存済みデータを読み込めませんでした\";\n      const first=document.createElement(\"p\");\n      first.style.cssText=\"margin:0 0 10px;line-height:1.7\";\n      first.textContent=\"安全のため、空のデータでは起動していません。現在の保存データは上書きしていません。\";\n      const second=document.createElement(\"p\");\n      second.style.cssText=\"margin:0 0 12px;line-height:1.7;color:#666\";\n      second.textContent=\"この画面のまま新しいデータを保存せず、保存データの確認を行ってください。\";\n      const reason=document.createElement(\"p\");\n      reason.id=\"insightStorageLoadReason\";\n      reason.style.cssText=\"margin:0 0 16px;padding:10px 12px;border-radius:10px;background:#f7f7f8;color:#555;font-size:12px;line-height:1.6;word-break:break-word\";\n      reason.textContent=\"読込エラー: \"+String(error&&error.message?error.message:error);\n      const actions=document.createElement(\"div\");\n      actions.style.cssText=\"display:flex;gap:8px;flex-wrap:wrap\";\n      const exportButton=document.createElement(\"button\");\n      exportButton.id=\"insightStorageExportRaw\";\n      exportButton.type=\"button\";\n      exportButton.textContent=\"保存データを書き出す\";\n      exportButton.style.cssText=\"border:0;border-radius:10px;background:#1a1a1a;color:#fff;padding:10px 14px;font-weight:700;font-family:inherit\";\n      exportButton.onclick=function(){\n        try{\n          const raw=localStorage.getItem(SK);\n          if(raw===null)throw new Error(\"保存データが見つかりません\");\n          const blob=new Blob([raw],{type:\"application/json\"});\n          const url=URL.createObjectURL(blob);\n          const a=document.createElement(\"a\");\n          a.href=url;\n          a.download=\"Insight_raw_storage_\"+new Date().toISOString().slice(0,10)+\".json\";\n          document.body.append(a);\n          a.click();\n          a.remove();\n          setTimeout(function(){URL.revokeObjectURL(url);},1000);\n        }catch(exportError){\n          alert(\"保存データを書き出せませんでした。\\n\"+String(exportError&&exportError.message?exportError.message:exportError));\n        }\n      };\n      actions.append(exportButton);\n      box.append(heading,first,second,reason,actions);\n      document.body.append(box);\n    }catch(_){}\n    const loadError=new Error(\"Insight stored data load failed\");\n    loadError.name=\"InsightLoadError\";\n    loadError.cause=error;\n    throw loadError;\n  }\n  const current=localStorage.getItem(SK);\n  if(current!==null){\n    try{\n      const all=JSON.parse(current);\n      if(!all||typeof all!==\"object\"||Array.isArray(all)||!all.stores||typeof all.stores!==\"object\"||Array.isArray(all.stores)||!Object.keys(all.stores).length)throw new Error(\"店舗データがありません\");\n      if(typeof all.current!==\"string\"||!all.stores[all.current])throw new Error(\"現在店舗の情報が不正です\");\n      Object.values(all.stores).forEach(st=>{\n        if(!st||typeof st!==\"object\"||Array.isArray(st)||!st.data||typeof st.data!==\"object\"||Array.isArray(st.data))throw new Error(\"店舗データが不正です\");\n        const activeYears=Array.isArray(st.years)&&st.years.length?new Set(st.years.map(String)):null;\n        Object.entries(st.data).forEach(([yearKey,yd])=>{\n          if(activeYears&&!activeYears.has(String(yearKey)))return;\n          if(!yd||typeof yd!==\"object\"||Array.isArray(yd))throw new Error(\"年度データが不正です\");\n          Object.values(yd).forEach(rows=>{\n            if(Array.isArray(rows))rows.forEach(r=>{\n              if(!r||typeof r!==\"object\"||Array.isArray(r))throw new Error(\"日別データが不正です\");\n              if(!r.haiki)r.haiki=blankHaiki();\n              if(r.weather===undefined)r.weather=\"\";\n            });\n          });\n        });\n      });\n      return all;\n    }catch(e){return failStoredDataLoad(e);}\n  }\n  for(const oldKey of[\"insight_v9\",\"insight_v8\"]){\n    const old=localStorage.getItem(oldKey);\n    if(old!==null){\n      try{return migrateOldData(JSON.parse(old));}\n      catch(e){return failStoredDataLoad(e);}\n    }\n  }\n  const t=todayFY();\n  const sid=\"store_1\";\n  return{current:sid,stores:{[sid]:{name:\"店舗1\",years:[t.fy],data:{[t.fy]:blankYearData(t.fy)}}}};\n}";
if(html.indexOf(originalLoadAll)<0)throw new Error('保存済みデータ読込の安全化に失敗しました');
patch(originalLoadAll,safeLoadAll);

// STEP5 retained: persist() must be hardened before the core app executes.
var originalPersist='function persist(){\n  try{localStorage.setItem(SK,JSON.stringify(allStores));}catch(e){}\n}';
var safePersist='function persist(){\n  try{\n    if(window.InsightStorage&&typeof window.InsightStorage.persistCurrent==="function")return window.InsightStorage.persistCurrent(allStores);\n    localStorage.setItem(SK,JSON.stringify(allStores));return true;\n  }catch(e){\n    alert("データを保存できませんでした。\\nブラウザの保存領域を確認して、もう一度お試しください。\\n現在の変更は保存されていません。");\n    const saveError=new Error("Insight data save failed");saveError.name="InsightPersistError";saveError.cause=e;throw saveError;\n  }\n}\nwindow.addEventListener("error",e=>{if(e.error&&e.error.name==="InsightPersistError")e.preventDefault();});';
if(html.indexOf(originalPersist)<0)throw new Error('保存処理の安全化に失敗しました');
patch(originalPersist,safePersist);
// STEP5 migrated: legacy core control contrast is now applied at runtime by insight_legacy_style_compat_v1.js.
// STEP5 retained: Chart.js SRI/referrer policy must be injected before the browser evaluates the dependency tag.
patch('<script src=\"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js\"\n  crossorigin=\"anonymous\"','<script src=\"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js\"\n  integrity=\"sha512-CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw==\"\n  crossorigin=\"anonymous\"\n  referrerpolicy=\"no-referrer\"');
// STEP5 migrated: legacy year-delete UI cleanup now runs in insight_dashboard_year_fix_v1.js after payload execution.
// Keeping this out of bootstrap removes four brittle HTML/function string replacements.

  // Input pages: remove the legacy year pills, inline year-add form and 12 month tabs before the payload executes.
  // The replacement period UI is owned by insight_sales_period_selector_v1.js and matches sales-count navigation.
  var legacyInputPeriodStart='  const yrId={sales:"salesYearRow",kyaku:"kyakuYearRow",haiki:"haikiYearRow"}[type];';
  var legacyInputPeriodEnd='  renderTable(type);\n}';
  var legacyInputStartAt=html.indexOf(legacyInputPeriodStart);
  if(legacyInputStartAt<0)throw new Error('入力ページ旧年月UIの開始位置が見つかりません');
  var legacyInputEndAt=html.indexOf(legacyInputPeriodEnd,legacyInputStartAt);
  if(legacyInputEndAt<0)throw new Error('入力ページ旧年月UIの終了位置が見つかりません');
  html=html.slice(0,legacyInputStartAt)+html.slice(legacyInputEndAt);

  return html;
}
root.InsightBootstrapPatches={VERSION:1,apply:apply};
if(typeof module!=='undefined'&&module.exports)module.exports=root.InsightBootstrapPatches;
})(typeof window!=='undefined'?window:globalThis);
