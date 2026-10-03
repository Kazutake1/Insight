const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const camera=require('../insight_sales_count_camera_v1.js');

const root=path.join(__dirname,'..');

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

test('CAMERA-2は同一オリジンのローカルOCRを使用し画像を永続化しない',()=>{
  assert.equal(camera.VERSION,2);
  assert.deepEqual(camera.POLICY,{
    persistImages:false,
    externalTransmission:false,
    autoSave:false,
    unmatchedCategory:'discard'
  });
  assert.deepEqual(camera.OCR_POLICY,{
    engine:'Tesseract.js',
    version:'7.0.0',
    language:'jpn',
    assetOrigin:'same-origin',
    cacheMethod:'none',
    workerBlobURL:false
  });
  const assets=camera.localOcrAssets('https://example.com/Insight/Index.html');
  assert.equal(assets.workerPath,'https://example.com/Insight/vendor/ocr/worker.min.js');
  assert.equal(assets.corePath,'https://example.com/Insight/vendor/ocr');
  assert.equal(assets.langPath,'https://example.com/Insight/vendor/ocr/lang');

  const source=fs.readFileSync(path.join(root,'insight_sales_count_camera_v1.js'),'utf8');
  assert.match(source,/capture="environment"/);
  assert.match(source,/URL\.createObjectURL/);
  assert.match(source,/URL\.revokeObjectURL/);
  assert.match(source,/cacheMethod:'none'/);
  assert.match(source,/workerBlobURL:false/);
  assert.match(source,/vendor\/ocr\//);
  assert.doesNotMatch(source,/cdn\.jsdelivr|unpkg\.com|projectnaptha/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('OCRレイアウトから行・単語・座標を抽出できる',()=>{
  const lines=camera.extractLayout([
    {paragraphs:[{lines:[
      {text:'おにぎり 納品数 10 20 30',confidence:94,bbox:{x0:1,y0:2,x1:300,y1:30},words:[
        {text:'おにぎり',confidence:98,bbox:{x0:1,y0:2,x1:80,y1:30}},
        {text:'納品数',confidence:93,bbox:{x0:90,y0:2,x1:140,y1:30}}
      ]}
    ]}]}
  ]);
  assert.equal(lines.length,1);
  assert.equal(lines[0].text,'おにぎり 納品数 10 20 30');
  assert.equal(lines[0].words.length,2);
  assert.deepEqual(lines[0].bbox,{x0:1,y0:2,x1:300,y1:30});
});

test('登録カテゴリーだけを名称・aliasesで照合し未登録カテゴリーは破棄する',()=>{
  const categories=[
    {id:'a',name:'おにぎり',aliases:['旧おむすび'],hidden:false},
    {id:'b',name:'サンドイッチ',aliases:[],hidden:false},
    {id:'c',name:'非表示商品',aliases:[],hidden:true}
  ];
  assert.deepEqual(camera.matchCategories('おにぎり 販売数',[],categories).map(x=>x.id),['a']);
  assert.deepEqual(camera.matchCategories('旧 おむすび 納品数',[],categories).map(x=>x.id),['a']);
  assert.deepEqual(camera.matchCategories('未登録商品 非表示商品',[],categories),[]);
});

test('OCR結果から日付・登録カテゴリー・納品販売ラベル・数字候補を抽出する',()=>{
  const categories=[
    {id:'cat_onigiri',name:'おにぎり',aliases:[],hidden:false},
    {id:'cat_other',name:'別商品',aliases:[],hidden:false}
  ];
  const text='10月3日\nおにぎり\n1便 2便 3便\n納品数 10 20 30\n販売数 9 18 27\n未登録商品 1 2';
  const result=camera.analyzeOcrData({text,confidence:91},categories,'2026-10-03');
  assert.equal(result.targetDateMatched,true);
  assert.ok(result.dateCandidates.some(x=>x.iso==='2026-10-03'));
  assert.deepEqual(result.matchedCategories.map(x=>x.id),['cat_onigiri']);
  assert.equal(result.labels.delivery.found,true);
  assert.equal(result.labels.sales.found,true);
  assert.deepEqual(result.labels.trips.map(x=>x.found),[true,true,true]);
  assert.ok(result.numberCandidates.some(x=>x.value===10));
  assert.ok(result.numberCandidates.some(x=>x.value===27));
});

test('ローカルOCRランタイム資産はリポジトリ内に固定されている',()=>{
  const files=[
    ['vendor/ocr/tesseract.min.js',50000],
    ['vendor/ocr/worker.min.js',100000],
    ['vendor/ocr/tesseract-core.wasm.js',3000000],
    ['vendor/ocr/tesseract-core-simd.wasm.js',3000000],
    ['vendor/ocr/tesseract-core-lstm.wasm.js',3000000],
    ['vendor/ocr/tesseract-core-simd-lstm.wasm.js',3000000],
    ['vendor/ocr/tesseract-core-relaxedsimd.wasm.js',3000000],
    ['vendor/ocr/tesseract-core-relaxedsimd-lstm.wasm.js',3000000],
    ['vendor/ocr/lang/jpn.traineddata.gz',1000000]
  ];
  files.forEach(([name,min])=>{
    const stat=fs.statSync(path.join(root,name));
    assert.ok(stat.isFile(),name+' must be a file');
    assert.ok(stat.size>min,name+' is unexpectedly small: '+stat.size);
  });
});
