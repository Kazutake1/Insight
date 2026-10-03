const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const camera=require('../insight_sales_count_camera_v1.js');

test('対象日は表示中の販売数年月に制限する',()=>{
  assert.deepEqual(camera.periodBounds({year:'2026',month:2}),{min:'2026-02-01',max:'2026-02-28'});
  assert.deepEqual(camera.periodBounds({year:2028,month:2}),{min:'2028-02-01',max:'2028-02-29'});
  assert.equal(camera.periodBounds({year:2026,month:13}),null);
});

test('現在月なら今日、過去月なら月初を対象日の初期値にする',()=>{
  assert.equal(camera.defaultTargetDate({year:2026,month:10},new Date(2026,9,3)),'2026-10-03');
  assert.equal(camera.defaultTargetDate({year:2026,month:9},new Date(2026,9,3)),'2026-09-01');
});

test('画像は20MB以下のimageだけを受け付ける',()=>{
  assert.equal(camera.isImageFile({size:100,type:'image/jpeg'}),true);
  assert.equal(camera.isImageFile({size:0,type:'image/jpeg'}),false);
  assert.equal(camera.isImageFile({size:100,type:'text/plain'}),false);
  assert.equal(camera.isImageFile({size:camera.MAX_FILE_BYTES+1,type:'image/png'}),false);
});

test('CAMERA-1は画像を永続化・外部送信・自動保存しない',()=>{
  assert.deepEqual(camera.POLICY,{
    persistImages:false,
    externalTransmission:false,
    autoSave:false,
    unmatchedCategory:'discard'
  });
  const source=fs.readFileSync(path.join(__dirname,'..','insight_sales_count_camera_v1.js'),'utf8');
  assert.match(source,/capture="environment"/);
  assert.match(source,/accept="image\/\*"/);
  assert.match(source,/multiple hidden/);
  assert.match(source,/URL\.createObjectURL/);
  assert.match(source,/URL\.revokeObjectURL/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
