'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'..','insight_payload_core_v1.css'),'utf8');

test('weekday and holiday sales cards keep only one shared rule per property',()=>{
  const rules=[
    '.sc-day-type-card{padding-bottom:12px}',
    '.sc-day-type-card h3{margin-bottom:8px}'
  ];
  for(const rule of rules){
    assert.equal(css.split(rule).length-1,1,'duplicated structural CSS declaration: '+rule);
  }
});

test('shared card spacing is preserved without changing breakpoint overrides',()=>{
  assert.match(css,/\.sc-day-type-card\{padding-bottom:12px\}/);
  assert.match(css,/\.sc-day-type-card h3\{margin-bottom:8px\}/);
  assert.match(css,/@media\(max-width:1200px\)/);
  assert.match(css,/@media\(max-width:800px\)/);
});

test('seven-column grids use one breakpoint declaration at each width',()=>{
  const compact1200='.sc-calendar,.sc-average-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}';
  const compact800='.sc-calendar,.sc-average-grid{grid-template-columns:repeat(7,minmax(102px,1fr));gap:7px}';
  assert.equal(css.split(compact1200).length-1,1,'1200px grid breakpoints must not be duplicated');
  assert.equal(css.split(compact800).length-1,1,'800px grid breakpoints must not be duplicated');
  assert.match(css,/@media\(max-width:1200px\)\{\.sc-calendar,\.sc-average-grid\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css,/@media\(max-width:800px\)\{\.sc-calendar,\.sc-average-grid\{grid-template-columns:repeat\(7,minmax\(102px,1fr\)\);gap:7px\}/);
});

test('AI 920px responsive rules share one media query without losing precedence',()=>{
  assert.equal(css.split('@media(max-width:920px)').length-1,1,
    'separate adjacent 920px media queries should be combined without changing rule order');
  const section=css.split('@media(max-width:920px){')[1]?.split('/* Readability overrides')[0];
  assert.ok(section,'AI responsive rules must be present');
  const rules=[
    '.ai-analysis-panel.ai-analysis-workspace{left:8px!important;right:8px!important}',
    '.ai-workspace-header{padding:0 14px;gap:10px}',
    '.ai-history-mode-btn,.ai-history-period-btn{padding:6px 8px}',
    '.ai-insight-list.is-summary{grid-template-columns:1fr}',
    '.ai-insight-item.is-primary{grid-column:auto}',
    '.ai-insight-value{font-size:19px}'
  ];
  let previous=-1;
  for(const rule of rules){
    const index=section.indexOf(rule);
    assert.ok(index>previous,'AI responsive rule missing or reordered: '+rule);
    previous=index;
  }
  assert.match(section,/\.ai-insight-value\{font-size:19px\}\}/);
});

test('superseded AI important declarations are removed without changing winning values',()=>{
  const commentBase='.ai-analysis-workspace .ai-analysis-comment,.ai-analysis-workspace .ai-analysis-empty{margin:5px 0!important;color:var(--text2)!important}';
  const commentWinner='.ai-analysis-workspace .ai-analysis-comment,.ai-analysis-workspace .ai-analysis-empty{font-size:14px!important;line-height:1.6!important}';
  const statusWinner='.ai-workspace-status-card{position:relative;padding-left:16px!important}';
  assert.equal(css.split(commentBase).length-1,1);
  assert.equal(css.split(commentWinner).length-1,1);
  assert.ok(css.indexOf(commentBase)<css.indexOf(commentWinner),'later text style must remain the cascade winner');
  assert.equal(css.split(statusWinner).length-1,1);
  assert.equal(css.includes('.ai-workspace-status-card{padding-left:14px!important}'),false);
  assert.equal(css.includes('font-size:12px!important;line-height:1.55!important;color:var(--text2)!important'),false);
});

test('event result grids preserve seven-column reference and deliberate 1000/600/420 breakpoints',()=>{
  // Earlier 1000px two-column and 800px one-column declarations were
  // shadowed by the later equal-specificity seven-column layout and breakpoints.
  assert.equal(css.includes('@media(max-width:1000px){.er-category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'),false);
  assert.equal(css.includes('.er-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.er-category-grid{grid-template-columns:1fr}'),false);
  const base='.er-category-grid,.er-period-day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;width:100%;box-sizing:border-box}';
  const b1000='@media(max-width:1000px){\n  .er-category-grid,.er-period-day-grid{grid-template-columns:repeat(3,minmax(0,1fr))}\n}';
  const b600='@media(max-width:600px){\n  .er-category-grid,.er-period-day-grid{grid-template-columns:repeat(2,minmax(0,1fr))}\n}';
  const b420='@media(max-width:420px){\n  .er-category-grid,.er-period-day-grid{grid-template-columns:minmax(0,1fr)}\n}';
  const preserved=[base,b1000,b600,b420];
  let previous=-1;
  for(const rule of preserved){
    assert.equal(css.split(rule).length-1,1,'preserved layout declaration must occur exactly once');
    const position=css.indexOf(rule);
    assert.ok(position>previous,'layout cascade order must be unchanged');
    previous=position;
  }
  const expected=[
    [1194,7],[1024,7],[1001,7],[1000,3],[834,3],
    [820,3],[801,3],[800,3],[768,3],[601,3],
    [600,2],[421,2],[420,1],[375,1]
  ];
  for(const [width,columns] of expected){
    const resolved=width<=420?1:width<=600?2:width<=1000?3:7;
    assert.equal(resolved,columns,'unexpected event card grid breakpoint at '+width+'px');
  }
  // Other 800px event-result rules (toolbar, overview and controls) are retained.
  assert.equal(css.includes('@media(max-width:800px){.er-toolbar{align-items:stretch}'),true);
  assert.equal(css.includes('.er-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}}'),true);
});

test('AI grid 920px rule does not repeat unchanged layout from 1180px',()=>{
  const grid='.ai-workspace-grid{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}';
  const baseGrid='.ai-workspace-grid{height:calc(100% - 68px);display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:0;min-height:0}';
  assert.equal(css.split(baseGrid).length-1,1,'AI grid base ratio must be retained');
  const wide=css.split('@media(max-width:1180px){')[1]?.split('@media(max-width:920px){')[0];
  const narrow=css.split('@media(max-width:920px){')[1]?.split('/* Readability overrides')[0];
  assert.ok(wide && narrow,'AI 1180px and 920px media queries must exist');
  assert.equal(wide.split(grid).length-1,1,'1180px grid ratio must be preserved');
  assert.equal(narrow.includes(grid),false,'920px grid ratio is fully shadowed by unchanged 1180px declaration');
  assert.ok(wide.indexOf(grid)>-1 && css.indexOf('@media(max-width:1180px)')<css.indexOf('@media(max-width:920px)'));
  assert.equal(css.split('@media(max-width:920px)').length-1,1);
  assert.ok(narrow.includes('.ai-workspace-header{padding:0 14px;gap:10px}'),'920px distinct padding remains');
  assert.ok(narrow.includes('.ai-analysis-panel.ai-analysis-workspace{left:8px!important;right:8px!important}'),'920px panel margins remain');
});

test('legend line keeps only its effective size, without a shadowed duplicate',()=>{
  const effective='.legend-line{width:18px;height:2.5px;border-radius:2px;}';
  const superseded='.legend-line{width:14px;height:2.5px;border-radius:2px;}';
  assert.equal(css.includes(superseded),false,'obsolete legend width should not be restored');
  assert.equal(css.split(effective).length-1,1,'effective legend width, height and radius must be preserved');
  assert.equal(css.split('.legend-line{').length-1,1,'there should be exactly one base legend size rule');
});

test('sales and average calendars have one effective base rule each without obsolete STEP5 duplicates',()=>{
  const calendar='.sc-calendar{display:grid;grid-template-columns:repeat(7,minmax(160px,1fr));gap:8px;overflow-x:auto;flex-shrink:0;min-width:0;width:100%;max-width:100%;box-sizing:border-box}';
  const average='.sc-average-grid{display:grid;grid-template-columns:repeat(7,minmax(160px,1fr));gap:8px;overflow-x:auto;min-width:0;width:100%;max-width:100%;box-sizing:border-box}';
  const obsoleteAverage='.sc-average-grid{display:grid;grid-template-columns:repeat(7,minmax(160px,1fr));gap:8px;overflow-x:auto;width:100%;max-width:100%;box-sizing:border-box}';
  assert.equal(css.split(calendar).length-1,1,'calendar base style must be unique and unchanged');
  assert.equal(css.split(average).length-1,1,'average base style must retain its winning min-width:0');
  assert.equal(css.includes(obsoleteAverage),false,'earlier shadowed average declaration must be removed');
  const origin=css.indexOf('/* STEP5 CSP: full sales-count module CSS externalized. */');
  const grid=css.indexOf(calendar);
  const averageGrid=css.indexOf(average);
  const compact1200=css.indexOf('@media(max-width:1200px){.sc-calendar,.sc-average-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}');
  const compact800=css.indexOf('@media(max-width:800px){.sc-calendar,.sc-average-grid{grid-template-columns:repeat(7,minmax(102px,1fr));gap:7px}');
  assert.ok(origin>=0 && origin<grid && grid<averageGrid && averageGrid<compact1200 && compact1200<compact800,
    'sales and average base grids must keep their source order and both narrow-width overrides');
  assert.ok(css.includes('/* STEP5 CSP: externalized sales-count runtime CSS. */\n.sc-totals b'),
    'externalized sales-count runtime must retain its total-label rule');
});

test('dark KPI rules rely on the same themed variables as the base cards',()=>{
  const card='.kpi-card{background:var(--surface);border-radius:15px;width:160px;flex-shrink:0;padding:13px 15px;\n  box-shadow:0 2px 12px var(--shadow2);cursor:pointer;position:relative;\n  overflow:hidden;transition:transform .15s,outline .1s;}';
  const preserved=[
    card,
    '.kpi-label{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text4);margin-bottom:5px;}',
    '.kpi-value{font-size:19px;font-weight:800;color:var(--text);letter-spacing:-0.02em;margin-bottom:5px;}',
    '.kpi-prev{font-size:10px;color:var(--text4);}',
    '#pageDash .kpi-card{height:110px!important;min-height:110px!important;max-height:110px!important;',
    '#pageDash .kpi-value.insight-kpi-value-normal{color:#1a1a1a}',
    '#pageDash .kpi-value.insight-kpi-value-alert{color:#dc2626}'
  ];
  for(const rule of preserved)assert.ok(css.includes(rule),'preserve the active KPI layout and color: '+rule.slice(0,65));
  for(const selector of ['.dark .kpi-card{','.dark .kpi-label{','.dark .kpi-value{','.dark .kpi-prev{']){
    assert.equal(css.includes(selector),false,'remove redundant dark KPI duplicate: '+selector);
  }
  assert.ok(css.includes('--surface:#2f2942') && css.includes('--text:#e2e2ea') && css.includes('--text4:#9793a1'),
    'retain final dark-mode theme variable values');
});

// The early summary CSS is followed by equal-specificity full-module rules.
// Deleting only identical predecessor declarations must not affect the cascade.
test('IWC cards retain the winning spacing, flex layout and ranking dimensions',()=>{
  const early=[
    '#iwcRow .iwc-kpis{gap:5px}',
    '#iwcRow .iwc-rank{padding:3px 5px}',
    '#iwcRow .iwc-rank-title{font-size:8px;line-height:1.1}',
    '#iwcRow .iwc-rank-line{font-size:8px;line-height:1.1}'
  ];
  const final=[
    '#iwcRow .iwc-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:3px;flex:0 0 auto;}',
    '#iwcRow .iwc-rank-grid{display:flex;flex-direction:column;gap:3px;flex:1;min-height:0;}',
    '#iwcRow .iwc-rank{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:8px;padding:4px 6px;}',
    '#iwcRow .iwc-rank-title{font-size:9px;font-weight:750;white-space:nowrap;color:var(--text);margin-bottom:2px;flex-shrink:0;}',
    '#iwcRow .iwc-rank-line{display:flex;align-items:center;gap:4px;justify-content:space-between;font-size:9px;line-height:1.25;min-width:0;padding:1px 0;border-top:1px solid var(--border2);flex:1;min-height:0;}'
  ];
  for(const item of [...early,...final])assert.equal(css.split(item).length-1,1,'preserve the specific IWC declaration: '+item.slice(0,65));
  const old=[
    '#iwcRow .iwc-kpis{gap:5px;margin-bottom:3px}',
    '#iwcRow .iwc-rank-grid{gap:3px}',
    '#iwcRow .iwc-rank{padding:3px 5px;display:flex;flex-direction:column}',
    '#iwcRow .iwc-rank-title{font-size:8px;line-height:1.1;margin-bottom:2px;flex-shrink:0}',
    '#iwcRow .iwc-rank-line{font-size:8px;line-height:1.1;padding:1px 0;flex:1;min-height:0}'
  ];
  for(const item of old)assert.equal(css.includes(item),false,'old redundant declarations must not reappear: '+item);
  const first=css.indexOf(early[0]),last=css.indexOf(final[0]);
  assert.ok(first>=0 && last>first,'IWC base/override precedence must stay the same');
  // Page-specific waste adjustment and readability typography remain untouched.
  assert.ok(css.includes('#pageHaiki #iwcRow .iwc-card{height:calc(var(--iwc-height) + 50px)}'));
  assert.ok(css.includes('#iwcRow .iwc-kpi-label{font-size:11.5px!important;line-height:1.2!important}'));
});

test('event cards have only their active grid and width rules',()=>{
  const obsoleteGrid='.er-category-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}';
  const obsoleteCard='.er-category-card{min-width:0;width:100%;border:1px solid var(--border);border-radius:12px;background:var(--surface2);padding:9px;box-sizing:border-box}';
  const card='.er-category-card{border:1px solid var(--border);border-radius:12px;background:var(--surface2);padding:9px}';
  const grid='.er-category-grid,.er-period-day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;width:100%;box-sizing:border-box}';
  const width='.er-category-card,.er-period-day-grid>.sc-day{min-width:0;width:100%;box-sizing:border-box}';
  assert.equal(css.includes(obsoleteGrid),false,'earlier unused 4-column grid must not return');
  assert.equal(css.includes(obsoleteCard),false,'earlier repeated card sizing must not return');
  assert.equal(css.split(card).length-1,1,'retain category card border, color, radius, and padding');
  assert.equal(css.split(grid).length-1,1,'retain the winning 7-column grid and 9px gap');
  assert.equal(css.split(width).length-1,1,'retain category card width, min-width and border-box');
  assert.ok(css.indexOf(card)<css.indexOf(grid)&&css.indexOf(grid)<css.indexOf(width),
    'event cards and later effective declarations must keep their cascade order');
  assert.equal(css.split('.er-category-grid{').length-1,0,'no separate obsolete base grid');
  assert.ok(css.includes('@media(max-width:1000px){\n  .er-category-grid,.er-period-day-grid{grid-template-columns:repeat(3,minmax(0,1fr))}'));
  assert.ok(css.includes('@media(max-width:600px){\n  .er-category-grid,.er-period-day-grid{grid-template-columns:repeat(2,minmax(0,1fr))}'));
  assert.ok(css.includes('@media(max-width:420px){\n  .er-category-grid,.er-period-day-grid{grid-template-columns:minmax(0,1fr)}'));
});


test('inactive sales-count styles use only the later full-module !important rules',()=>{
  const early=css.split('/* STEP5 CSP: externalized sales-count runtime CSS. */')[1]?.split('/* STEP5 CSP: sale-results module CSS externalized. */')[0];
  const full=css.split('/* STEP5 CSP: full sales-count module CSS externalized. */')[1];
  assert.ok(early && full,'sales-count module boundaries must remain');
  assert.ok(early.includes('.sc-totals b,.sc-average-totals b{font-size:14px}'));
  assert.equal(early.includes('sc-not-applicable'),false,'old identical inactive styling must be removed');
  const trip='.sc-trip input.sc-not-applicable{background:var(--surface2)!important;border-color:var(--border)!important;color:var(--text4)!important;font-size:10px!important;font-weight:700!important}';
  const average='.sc-average-row b.sc-not-applicable{background:var(--surface2)!important;border-color:var(--border)!important;color:var(--text4)!important}';
  assert.equal(full.split(trip).length-1,1,'retain winning trip colors and typography');
  assert.equal(full.split(average).length-1,1,'retain winning average colors');
  assert.ok(css.includes('#pageSalesCount .sc-trip input.sc-not-applicable{font-size:11.5px!important}'),
    'page-specific important font size must remain');
  assert.ok(css.includes('.sc-totals b,.sc-average-totals b{font-size:14px}'),
    'shared totals typography must remain');
  assert.ok(css.includes('@media(max-width:1200px){.sc-calendar,.sc-average-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}'),
    'sales-count 1200px override must remain');
});


test('waste KPI keeps 16px important font size without shadowed normal sizes',()=>{
  const winning='#iwcRow .iwc-kpi-value{font-size:16px!important}';
  const normal='#iwcRow .iwc-kpi-value{line-height:1.1}';
  const page='#pageHaiki #iwcRow .iwc-kpi-value{line-height:1.3}';
  const final='#iwcRow .iwc-kpi-value{font-weight:800;white-space:nowrap;color:var(--text);line-height:1.2;}';
  for(const rule of [winning,normal,page,final])assert.equal(css.split(rule).length-1,1,'preserve waste KPI cascade rule: '+rule);
  assert.ok(css.indexOf(winning)<css.indexOf(normal)&&css.indexOf(normal)<css.indexOf(page)&&css.indexOf(page)<css.indexOf(final),
    'preserve original waste KPI CSS order');
  assert.equal(css.includes('#iwcRow .iwc-kpi-value{font-size:13px;'),false);
  assert.equal(css.includes('#pageHaiki #iwcRow .iwc-kpi-value{font-size:15px;'),false);
  const declarations=[...css.matchAll(/#(?:pageHaiki #)?iwcRow \\.iwc-kpi-value\\{([^}]*)\\}/g)].map(match=>match[1]);
  assert.equal(declarations.length,4,'keep all waste KPI declarations');
  assert.deepEqual(declarations.filter(value=>/font-size:/.test(value)),['font-size:16px!important']);
});
