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
