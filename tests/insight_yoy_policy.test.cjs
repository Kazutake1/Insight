const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const payload=read('insight_payload_source_v1.html');
const engineSource=payload.slice(payload.indexOf('function kpiNum('),payload.indexOf('function blankMonthData('));
function element(label=''){
  return {textContent:label,style:{},children:[],append(...xs){xs.forEach(x=>{x.parent=this;this.children.push(x);});},appendChild(x){this.append(x);},remove(){this.parent.children=this.parent.children.filter(x=>x!==this);},querySelector(s){if(s==='.kpi-label')return this.label;if(s==='.kpi-value')return this.value;return this.children.find(x=>x.className===s.slice(1))||null;},querySelectorAll(){return this.children;}};
}
function setup(){
  const cards=['売上','客数','買上点数','廃棄金額','客単価','廃棄率','人件費','粗利率'].map(label=>{const c=element();c.label=element(label);c.value=element();return c;});
  const row=element();row.children=cards;row.querySelector=s=>cards.find(c=>s.includes('"'+c.label.textContent+'"'));row.querySelectorAll=()=>cards;
  const nodes={kpiRow:row};
  for(const id of ['aiAnalysisPeriod','aiAnalysisSummary','aiAnalysisGood','aiAnalysisCaution','aiAnalysisChecks'])nodes[id]=element();
  const c={console,MONTHS:Array.from({length:12},(_,i)=>(i+1)+'月'),HAIKI_CATS:[],baseYear:'2026',cmpYear:'2025',selMonth:'9月',currentNav:1,
    editYear:{sales:'2026',kyaku:'2026',haiki:'2026'},editMonth:{sales:'9月',kyaku:'9月',haiki:'9月'},
    clock:{fy:'2026',mIdx:8,month:'9月',day:20},store:{data:{},monthlyOps:{'2026':{'9月':{laborCostYen:120000,grossMarginRate:32}},'2025':{'9月':{laborCostYen:100000,grossMarginRate:30}}}},
    document:{readyState:'loading',getElementById:id=>nodes[id]||null,createElement:()=>element(),querySelector:()=>null,addEventListener(){}},addEventListener(){},renderKPI(){},renderDerived(){},refreshDash(){}};
  c.window=c;c.todayFY=()=>c.clock;c.getAIAnalysisThroughDay=(y,m)=>String(y)===c.clock.fy&&m===c.clock.month?c.clock.day:null;
  const rows=(count,factor)=>Array.from({length:30},(_,i)=>({d:i+1,売上:i<count?100*factor:0,客数:i<count?100*factor:0,買上点数:i<count?200*factor:0,廃棄金額:i<count?1000*factor:0}));
  c.store.data={'2026':{'9月':rows(10,1.2)},'2025':{'9月':rows(12,1)}};
  vm.createContext(c);vm.runInContext(engineSource,c);vm.runInContext(read('insight_yoy_policy_v1.js'),c);
  vm.runInContext(read('insight_ai_compat_core_v1.js'),c);
  vm.runInContext(read('insight_date_context_v1.js'),c);
  vm.runInContext(read('insight_hooks_v1.js'),c);
  vm.runInContext(read('insight_dashboard_kpi_sync_v1.js'),c);
  vm.runInContext(read('insight_ai_ops_v1.js'),c);
  vm.runInContext(read('insight_ai_page_comments_v1.js'),c);
  return {c,cards,nodes,get:()=>c.InsightYearComparison.getPeriod(c.baseYear,c.selMonth,c.getAIAnalysisThroughDay(c.baseYear,c.selMonth),c.cmpYear)};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('月途中は今年10日・前年12日の平均を比較し、カードとAIの4項目が一致する',()=>{
  const {c,cards,get}=setup(),r=get();
  assert.equal(r.current.inputDays,10);assert.equal(r.previous.inputDays,12);
  for(const [key,label] of [['salesYen','売上'],['customers','客数'],['items','買上点数'],['wasteYen','廃棄金額']]){
    close(r.comparison[key].pct,20);
    assert.match(cards.find(x=>x.label.textContent===label).querySelector('.kpi-yoy').children[0].textContent,/\+20\.0%/);
    assert.match(c.buildAIQuestionAnswer(label),/前年比\+20\.0%/);
  }
  for(const mode of ['sales','customers','waste'])assert.match(c.InsightAIPageComments.build(mode).summary.join('\n'),/前年比\+20\.0%/);
  assert.match(c.ManagementCommentEngine.getPeriod('2026','9月',20,'2025').text,/前年比\+20\.0%/);
});
test('月末当日は平均、翌月から月合計へ切り替わり指定日による切り捨てもなくなる',()=>{
  const {c,get}=setup();c.clock.day=30;assert.equal(get().basis,'dailyAverage');
  c.clock={fy:'2026',mIdx:9,month:'10月',day:1};const r=c.InsightYearComparison.getPeriod('2026','9月',5,'2025');
  assert.equal(r.basis,'total');assert.equal(r.throughDay,null);assert.equal(r.previous.inputDays,12);
  for(const key of ['salesYen','customers','items','wasteYen'])close(r.comparison[key].pct,0);
  c.InsightDashboardKPISync.refresh();assert.match(c.buildAIQuestionAnswer('売上'),/前年比0\.0%/);
});
test('客単価の方式と廃棄率pt差は月途中・終了後で変わらない、粗利率も常にpt差',()=>{
  const {c,get}=setup();c.store.data['2026']['9月'][0].売上+=100;
  const first=get();
  for(const completed of [false,true]){
    if(completed)c.clock.mIdx=9;
    const r=get();close(r.comparison.customerUnitPrice.pct,first.comparison.customerUnitPrice.pct);
    close(r.comparison.wasteRate.point,r.current.wasteRate-r.previous.wasteRate);
    assert.equal(c.InsightYearComparison.monthly('2026','9月','2025').grossMarginRate.point,2);
    assert.match(c.buildAIQuestionAnswer('粗利率'),/\+2\.0pt/);
  }
});
test('比較年度なしは前年を自動選択せず、カード・AI・入力ページすべて比較しない',()=>{
  const {c,cards,get}=setup();c.cmpYear=null;assert.equal(get().comparison,null);assert.equal(get().previous,null);
  c.InsightDashboardKPISync.refresh();cards.forEach(card=>assert.equal(card.querySelector('.kpi-yoy'),null));
  assert.match(c.buildAIQuestionAnswer('前年比'),/なし/);
  assert.match(c.InsightAIPageComments.build('sales').checks.join(''),/なし/);
  assert.doesNotMatch(c.ManagementCommentEngine.getPeriod('2026','9月',20,null).text,/前年比[+\-]?\d/);
});
test('前年平均0・前年データなしは算出不可、現在0で前年ありはマイナス100%',()=>{
  const {c,get}=setup();c.store.data['2025']['9月'].forEach(r=>{r.売上=0;r.廃棄金額=0;});
  assert.equal(get().comparison.salesYen,null);assert.equal(get().comparison.wasteYen,null);
  c.store.data['2026']['9月'].forEach(r=>r.客数=0);close(get().comparison.customers.pct,-100);
  c.store.data['2025']['9月']=[];Object.values(get().comparison).forEach(x=>assert.equal(x,null));
});
test('人件費は月途中に比較せず、月終了後のみ月額前年比、年境界も正しく判定',()=>{
  const {c,cards}=setup();assert.equal(c.InsightYearComparison.monthly('2026','9月','2025').laborCostYen,null);
  assert.equal(cards[6].querySelector('.kpi-yoy'),null);assert.match(c.buildAIQuestionAnswer('人件費'),/評価から除外/);
  c.clock.mIdx=9;c.InsightDashboardKPISync.refresh();assert.match(c.buildAIQuestionAnswer('人件費'),/前年比\+20\.0%/);
  assert.match(cards[6].querySelector('.kpi-yoy').children[0].textContent,/\+20\.0%/);
  c.clock={fy:'2027',mIdx:0,month:'1月',day:1};assert.equal(c.InsightYearComparison.isCompletedMonth('2026','12月'),true);
  assert.equal(c.InsightYearComparison.isCompletedMonth('2027','1月'),false);
  assert.equal(c.InsightYearComparison.isCompletedMonth('2027','2月'),false);
});
test('全JS・Index内スクリプト・展開後スクリプトに構文エラーなし、共通処理を先に読み込む',async()=>{
  for(const f of fs.readdirSync(root).filter(x=>x.endsWith('.js')))new vm.Script(read(f),{filename:f});
  const scripts=html=>Array.from(html.matchAll(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/script>/gi),m=>m[1]);
  for(const s of scripts(payload))new vm.Script(s);
  let expanded;
  const context={Chart:function Chart(){},
    fetch:async url=>({ok:true,text:async()=>read(url.split('?')[0].replace('./',''))}),document:{body:{},open(){},write:s=>expanded=s,close(){}}};
  context.window=context;context.globalThis=context;
  vm.runInNewContext(read('insight_shell_boot_v1.js'),context);
  vm.runInNewContext(read('insight_shell_loader_v1.js'),context);
  await new Promise(resolve=>setImmediate(resolve));assert.ok(expanded);
  for(const s of scripts(expanded))new vm.Script(s);
  assert.ok(expanded.indexOf('insight_yoy_policy_v1.js')<expanded.indexOf('insight_ops_v1.js'));
  assert.ok(expanded.indexOf('insight_yoy_policy_v1.js')<expanded.indexOf('insight_ai_compat_core_v1.js'));
  assert.ok(expanded.indexOf('insight_ai_compat_core_v1.js')<expanded.indexOf('insight_hooks_v1.js'));
});
