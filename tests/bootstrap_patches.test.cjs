const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const patches=require('../insight_bootstrap_patches_v1.js');

const root=path.join(__dirname,'..');
const PARTS=[
  'insight_payload_v1_part01a.txt','insight_payload_v1_part01b.txt',
  'insight_payload_v1_part02.txt','insight_payload_v1_part03.txt',
  'insight_payload_v1_part04a.txt','insight_payload_v1_part04b.txt',
  'insight_payload_v1_part05.txt','insight_payload_v1_part06.txt',
  'insight_payload_v1_part07.txt'
];
function payload(){
  const b64=PARTS.map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('').replace(/\s/g,'');
  return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}

test('現在の圧縮payloadへ全互換パッチを適用できる',()=>{
  const base=payload();
  const patched=patches.apply(base);
  assert.notEqual(patched,base);
  assert.match(patched,/霧/);
  assert.match(patched,/InsightStorage&&typeof window\.InsightStorage\.persistCurrent/);
  assert.match(patched,/integrity="sha512-CQBWl4fJHWbryGE\+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d\+6I\+1zze6Z7kHXO7q3UyZAWw=="/);
  assert.doesNotMatch(patched,/let yearToDelete=null;/);
});

test('互換パッチ対象が欠けたpayloadはsilentに続行しない',()=>{
  assert.throws(()=>patches.apply('<!doctype html><html><body></body></html>'),/互換パッチの適用対象が見つかりません/);
});

test('bootstrap patch moduleは外部通信を行わず保存処理はpayloadへ差し込む文字列として保持する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.match(source,/var safePersist=/);
  assert.match(source,/patch\(originalPersist,safePersist\)/);
});
