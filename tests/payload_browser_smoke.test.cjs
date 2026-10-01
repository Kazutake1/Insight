const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');

const root=path.join(__dirname,'..');
const PARTS=[
  'insight_payload_v1_part01a.txt',
  'insight_payload_v1_part01b.txt',
  'insight_payload_v1_part02.txt',
  'insight_payload_v1_part03.txt',
  'insight_payload_v1_part04a.txt',
  'insight_payload_v1_part04b.txt',
  'insight_payload_v1_part05.txt',
  'insight_payload_v1_part06.txt',
  'insight_payload_v1_part07.txt'
];

function read(name){return fs.readFileSync(path.join(root,name),'utf8');}
function basePayload(){
  const b64=PARTS.map(read).join('').replace(/\s/g,'');
  return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}

test('圧縮payloadは有効なInsight HTMLへ復元できる',()=>{
  const html=basePayload();
  assert.match(html,/^<!doctype html>/i);
  assert.match(html,/<\/body>/i);
  assert.match(html,/<\/html>/i);
});

test('主要画面が依存するDOM anchorはbase payloadに存在する',()=>{
  const html=basePayload();
  for(const id of ['nav0','nav1','nav2','nav3','nav4','quickGrid','aiAnalysisPanel']){
    assert.ok(html.includes('id="'+id+'"'),id+' がbase payloadにありません');
  }
});

test('主要ナビ・入力・保存関数はbase payloadに存在する',()=>{
  const html=basePayload();
  for(const name of ['renderQuickPage','saveQuick','persist','gotoNav','switchStore']){
    assert.ok(new RegExp('function\\s+'+name+'\\s*\\(').test(html),name+' がbase payloadにありません');
  }
});

test('STEP5で残した文字列patchの元anchorはpayload内に全て残っている',()=>{
  const html=basePayload();
  const bootstrap=read('insight_bootstrap_patches_v1.js');
  const persistMatch=bootstrap.match(/var originalPersist='([\s\S]*?)';\nvar safePersist=/);
  assert.ok(persistMatch,'bootstrapのoriginalPersist定義を取得できません');
  const originalPersist=Function('return '+JSON.stringify(persistMatch[1]))()
    .replace(/\\n/g,'\n');
  const anchors=[
    'const WX_KEYS=["快晴","晴","晴曇","曇","小雨","雨","大雨","みぞれ","雪"];',
    '"雪":"❄️","":""',
    'const wxGroups={"晴れ":["快晴","晴","晴曇"],"曇り":["曇"],"雨":["小雨","雨","大雨"],"雪":["みぞれ","雪"]};',
    originalPersist,
    'background:var(--surface);color:var(--text);box-shadow:0 6px 24px var(--shadow);',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"\n  crossorigin="anonymous"',
    '<div class="modal-bg" id="modalBg">',
    'let yearToDelete=null;',
    'function showDeleteYear(y){yearToDelete=y;',
    'del.onclick=()=>showDeleteYear(y);wrap.appendChild(del);',
    '</body>'
  ];
  anchors.forEach(anchor=>assert.ok(html.includes(anchor),'payload patch anchor missing: '+anchor.slice(0,80)));
});

test('feature manifestの主要構造モジュールは一意かつ依存順に並ぶ',()=>{
  const index=read('Index.html');
  const ordered=[
    'insight_yoy_policy_v1.js',
    'insight_date_context_v1.js',
    'insight_hooks_v1.js',
    'insight_storage_v1.js',
    'insight_ops_v1.js',
    'insight_backup_guard_v1.js',
    'insight_ai_presentation_v1.js',
    'insight_ai_visual_v1.js',
    'insight_events_v1.js',
    'insight_temperature_v1.js',
    'insight_sales_count_v1.js',
    'insight_sale_results_v1.js',
    'insight_page_period_sync_v1.js',
    'insight_analysis_period_lock_v1.js',
    'insight_analysis_context_v1.js',
    'insight_daily_anomaly_v1.js',
    'insight_weekly_review_v1.js',
    'insight_monthly_review_v1.js',
    'insight_analysis_history_v1.js',
    'insight_ai_context_v1.js',
    'insight_ai_page_comments_v1.js'
  ];
  let last=-1;
  ordered.forEach(name=>{
    const first=index.indexOf(name);
    assert.ok(first>last,name+' の依存順が不正です');
    assert.equal(index.indexOf(name,first+1),-1,name+' が重複しています');
    last=first;
  });
});

test('画面フローの主要module contractを維持する',()=>{
  const date=read('insight_date_context_v1.js');
  const hooks=read('insight_hooks_v1.js');
  const storage=read('insight_storage_v1.js');
  const ai=read('insight_ai_presentation_v1.js');
  const aiVisual=read('insight_ai_visual_v1.js');
  const events=read('insight_events_v1.js');
  const sales=read('insight_sales_count_v1.js');
  const saleResults=read('insight_sale_results_v1.js');
  const pagePeriod=read('insight_page_period_sync_v1.js');
  const periodLock=read('insight_analysis_period_lock_v1.js');
  const analysis=read('insight_analysis_context_v1.js');
  const anomaly=read('insight_daily_anomaly_v1.js');
  const weekly=read('insight_weekly_review_v1.js');
  const monthly=read('insight_monthly_review_v1.js');
  const history=read('insight_analysis_history_v1.js');
  const aiContext=read('insight_ai_context_v1.js');

  assert.match(date,/getSelectedDate/);
  assert.match(date,/withLegacyGlobals/);
  assert.match(hooks,/quick:render:after/);
  assert.match(hooks,/quick:save:before/);
  assert.match(storage,/persistCurrent/);
  assert.match(storage,/CURRENT_SCHEMA_VERSION/);
  assert.match(ai,/ensureAnalysisDom/);
  assert.match(ai,/ensureBackdrop/);
  assert.match(aiVisual,/InsightAIVisual/);
  assert.match(aiVisual,/function parseLine\(/);
  assert.match(aiVisual,/function renderLines\(/);
  assert.doesNotMatch(aiVisual,/localStorage|InsightStorage|fetch\s*\(/);
  assert.match(events,/InsightStorage\.transaction/);
  assert.match(sales,/InsightStorage\.writeSnapshot/);
  assert.match(saleResults,/InsightSaleResults/);
  assert.match(saleResults,/createReadOnlyDayCard/);
  assert.doesNotMatch(saleResults,/localStorage|InsightStorage/);
  assert.match(pagePeriod,/InsightPagePeriodSync/);
  assert.match(pagePeriod,/syncCurrentPage/);
  assert.doesNotMatch(pagePeriod,/localStorage|InsightStorage/);
  assert.match(periodLock,/InsightAnalysisPeriodLock/);
  assert.match(periodLock,/syncCurrentPage/);
  assert.doesNotMatch(periodLock,/localStorage|InsightStorage/);
  assert.match(analysis,/CONTEXT_VERSION/);
  assert.match(analysis,/buildRange/);
  assert.match(analysis,/savedOnly:true/);
  assert.match(anomaly,/InsightDailyAnomaly/);
  assert.match(anomaly,/alertNow/);
  assert.match(anomaly,/slice\(0,3\)/);
  assert.match(weekly,/InsightWeeklyReview/);
  assert.match(weekly,/STATE_LABEL/);
  assert.match(weekly,/slice\(0,5\)/);
  assert.match(monthly,/InsightMonthlyReview/);
  assert.match(monthly,/trendLabel/);
  assert.match(monthly,/selectDisplay/);
  assert.match(history,/InsightAnalysisHistory/);
  assert.match(history,/buildTimeline/);
  assert.doesNotMatch(history,/localStorage|InsightStorage/);
  assert.match(aiContext,/InsightAIContext/);
  assert.match(aiContext,/createRequest/);
  assert.match(aiContext,/authoritativeArithmetic:true/);
  assert.doesNotMatch(aiContext,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|InsightStorage/);
});
