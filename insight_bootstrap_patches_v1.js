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
// STEP5 retained: persist() must be hardened before the core app executes.
var originalPersist='function persist(){\n  try{localStorage.setItem(SK,JSON.stringify(allStores));}catch(e){}\n}';
var safePersist='function persist(){\n  try{\n    if(window.InsightStorage&&typeof window.InsightStorage.persistCurrent==="function")return window.InsightStorage.persistCurrent(allStores);\n    localStorage.setItem(SK,JSON.stringify(allStores));return true;\n  }catch(e){\n    alert("データを保存できませんでした。\\nブラウザの保存領域を確認して、もう一度お試しください。\\n現在の変更は保存されていません。");\n    const saveError=new Error("Insight data save failed");saveError.name="InsightPersistError";saveError.cause=e;throw saveError;\n  }\n}\nwindow.addEventListener("error",e=>{if(e.error&&e.error.name==="InsightPersistError")e.preventDefault();});';
if(html.indexOf(originalPersist)<0)throw new Error('保存処理の安全化に失敗しました');
patch(originalPersist,safePersist);
// STEP5 retained: legacy core control contrast patch; keep until the corresponding base style is moved out of the payload.
patch('background:var(--surface);color:var(--text);box-shadow:0 6px 24px var(--shadow);','background:#1a1a1a;color:#fff;box-shadow:0 6px 24px var(--shadow);');
// STEP5 retained: Chart.js SRI/referrer policy must be injected before the browser evaluates the dependency tag.
patch('<script src=\"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js\"\n  crossorigin=\"anonymous\"','<script src=\"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js\"\n  integrity=\"sha512-CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw==\"\n  crossorigin=\"anonymous\"\n  referrerpolicy=\"no-referrer\"');
// STEP5 retained: suppress the legacy year-delete UI before first paint; the guarded replacement UI is owned by insight_dashboard_year_fix_v1.js.
patch("<div class=\"modal-bg\" id=\"modalBg\">\n  <div class=\"modal\">\n    <h2>年度を削除しますか？</h2>\n    <p id=\"modalMsg\"></p>\n    <div class=\"modal-btns\">\n      <button class=\"modal-btn cancel\" onclick=\"closeModal()\">キャンセル</button>\n      <button class=\"modal-btn danger\" onclick=\"confirmDeleteYear()\">削除する</button>\n    </div>\n  </div>\n</div>\n\n",'');
patch("let yearToDelete=null;\n",'');
patch("function showDeleteYear(y){yearToDelete=y;\n  document.getElementById(\"modalMsg\").textContent=`${y}年のデータはすべて削除されます。この操作は元に戻せません。`;\n  document.getElementById(\"modalBg\").classList.add(\"show\");}\nfunction closeModal(){yearToDelete=null;document.getElementById(\"modalBg\").classList.remove(\"show\");}\nfunction confirmDeleteYear(){\n  if(!yearToDelete)return;\n  store.years=store.years.filter(y=>y!==yearToDelete);delete store.data[yearToDelete];\n  if(baseYear===yearToDelete)baseYear=store.years[store.years.length-1]||null;\n  if(cmpYear===yearToDelete)cmpYear=null;\n  [\"sales\",\"kyaku\",\"haiki\"].forEach(t=>{if(editYear[t]===yearToDelete)editYear[t]=baseYear||store.years[0];});\n  persist();closeModal();renderYearPills();\n  if(currentNav===1)refreshDash();else if(currentNav>1)initInputPage([\"\",\"\",\"sales\",\"kyaku\",\"haiki\"][currentNav]);\n}\n",'');
patch("    if(store.years.length>1){\n      const del=document.createElement(\"button\");del.className=\"btn-del-year\";del.textContent=\"✕\";\n      del.onclick=()=>showDeleteYear(y);wrap.appendChild(del);\n    }\n",'');

  return html;
}
root.InsightBootstrapPatches={VERSION:1,apply:apply};
if(typeof module!=='undefined'&&module.exports)module.exports=root.InsightBootstrapPatches;
})(typeof window!=='undefined'?window:globalThis);
