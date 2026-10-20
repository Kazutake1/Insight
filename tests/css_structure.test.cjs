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
