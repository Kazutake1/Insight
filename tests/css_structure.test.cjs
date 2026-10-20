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
    '.ai-workspace-grid{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}',
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
