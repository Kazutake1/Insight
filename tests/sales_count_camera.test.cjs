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
  assert.equal(camera.VERSION,12);
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
  assert.match(source,/className='sc-camera-open'/);
  assert.match(source,/aria-label','カメラ読取'/);
  assert.match(source,/sc-camera-open-icon/);
  assert.match(source,/読取範囲を指定/);
  assert.match(source,/sc-camera-crop-selection/);
  assert.match(source,/canvas\.toBlob/);
  assert.match(source,/worker\.recognize\(ocrInput/);
  assert.match(source,/tessedit_char_whitelist:'0123456789'/);
  assert.match(source,/fixedGridPlan/);
  assert.match(source,/readFixedGridCells/);
  assert.match(source,/sc-camera-crop-handle/);
  assert.match(source,/warpQuadImage/);
  assert.doesNotMatch(source,/button\.textContent='カメラ読取'/);
  assert.match(source,/URL\.createObjectURL/);
  assert.match(source,/URL\.revokeObjectURL/);
  assert.match(source,/cacheMethod:'none'/);
  assert.match(source,/workerBlobURL:false/);
  assert.match(source,/vendor\/ocr\//);
  assert.doesNotMatch(source,/cdn\.jsdelivr|unpkg\.com|projectnaptha/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|InsightStorage|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test('OCR切り取り範囲は0-1へ正規化しピクセル座標へ変換する',()=>{
  const crop=camera.normalizeCropRect({x:0.1,y:0.2,w:0.5,h:0.4});
  assert.ok(Math.abs(crop.x-0.1)<1e-9);
  assert.ok(Math.abs(crop.y-0.2)<1e-9);
  assert.ok(Math.abs(crop.w-0.5)<1e-9);
  assert.ok(Math.abs(crop.h-0.4)<1e-9);
  const clamped=camera.normalizeCropRect({x:-0.2,y:0.1,w:0.8,h:1.2});
  assert.ok(Math.abs(clamped.x-0)<1e-9);
  assert.ok(Math.abs(clamped.y-0.1)<1e-9);
  assert.ok(Math.abs(clamped.w-0.6)<1e-9);
  assert.ok(Math.abs(clamped.h-0.9)<1e-9);
  assert.equal(camera.normalizeCropRect({x:0.2,y:0.2,w:0.001,h:0.5}),null);
  assert.deepEqual(camera.cropPixelRect({x:0.25,y:0.25,w:0.5,h:0.5},1000,800),{x:250,y:200,w:500,h:400,full:false});
  assert.deepEqual(camera.cropPixelRect(null,1000,800),{x:0,y:0,w:1000,h:800,full:true});
});

test('台形補正の四隅は交差を拒否し有効範囲を保持する',()=>{
  const quad=camera.normalizeQuad([
    {x:0.1,y:0.1},{x:0.9,y:0.15},{x:0.85,y:0.9},{x:0.12,y:0.85}
  ]);
  assert.ok(quad);
  assert.deepEqual(camera.quadBoundingRect(quad),{x:0.1,y:0.1,w:0.8,h:0.8});
  assert.equal(camera.normalizeQuad([
    {x:0.1,y:0.1},{x:0.9,y:0.9},{x:0.9,y:0.1},{x:0.1,y:0.9}
  ]),null);
});

test('固定表は日付列×3便×納品販売のセル座標を作る',()=>{
  const w=(text,x,y,confidence=95)=>({text,confidence,bbox:{x0:x-8,y0:y-6,x1:x+8,y1:y+6}});
  const lines=[
    {index:0,text:'10/30 10/31',confidence:98,bbox:{x0:60,y0:30,x1:420,y1:50},words:[w('10/30',120,40,99),w('10/31',300,40,99)]},
    {index:1,text:'1 2 3 1 2 3',confidence:95,bbox:{x0:55,y0:62,x1:365,y1:78},words:[w('1',70,70),w('2',120,70),w('3',170,70),w('1',250,70),w('2',300,70),w('3',350,70)]},
    {index:2,text:'おにぎり',confidence:97,bbox:{x0:10,y0:92,x1:90,y1:108},words:[w('おにぎり',50,100)]},
    {index:3,text:'納品数 10 20 30 40 50 60',confidence:93,bbox:{x0:10,y0:122,x1:370,y1:138},words:[w('納品数',30,130),w('10',70,130),w('20',120,130),w('30',170,130),w('40',250,130),w('50',300,130),w('60',350,130)]},
    {index:4,text:'販売数 9 18 27 36 45 54',confidence:92,bbox:{x0:10,y0:152,x1:370,y1:168},words:[w('販売数',30,160),w('9',70,160),w('18',120,160),w('27',170,160),w('36',250,160),w('45',300,160),w('54',350,160)]},
    {index:5,text:'廃棄数 1 2 3 4 5 6',confidence:92,bbox:{x0:10,y0:182,x1:370,y1:198},words:[w('廃棄数',30,190),w('1',70,190),w('2',120,190),w('3',170,190),w('4',250,190),w('5',300,190),w('6',350,190)]}
  ];
  const plan=camera.fixedGridPlan(lines,[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}],'2025-11-01');
  assert.deepEqual(plan.dates,['2025-10-30','2025-10-31']);
  const slots=camera.fixedGridSlots(plan);
  assert.equal(slots.length,12);
  assert.equal(slots.filter(slot=>slot.field==='delivery').length,6);
  assert.equal(slots.filter(slot=>slot.field==='sales').length,6);
  assert.equal(slots.some(slot=>slot.field==='waste'),false);
});

test('固定表の数字セルは2回以上一致した値だけ採用する',()=>{
  const slots=[
    {key:'2025-11-01|a|1|delivery',date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'delivery'},
    {key:'2025-11-01|a|1|sales',date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'sales'}
  ];
  const a=new Map([
    [slots[0].key,{value:10,confidence:92}],
    [slots[1].key,{value:9,confidence:91}]
  ]);
  const b=new Map([
    [slots[0].key,{value:10,confidence:88}],
    [slots[1].key,{value:806,confidence:80}]
  ]);
  const c=new Map([
    [slots[0].key,{value:10,confidence:90}],
    [slots[1].key,{value:9,confidence:87}]
  ]);
  const result=camera.fixedCellConsensus([a,b,c],slots);
  assert.equal(result.cells.length,2);
  assert.equal(result.cells.find(cell=>cell.field==='delivery').value,10);
  assert.equal(result.cells.find(cell=>cell.field==='sales').value,9);
  const unresolved=camera.fixedCellConsensus([a,b],slots);
  assert.equal(unresolved.cells.length,1);
  assert.equal(unresolved.unresolved,1);
});

test('日付が1日だけ欠落し列間隔が一致する場合だけ補完する',()=>{
  const anchors=[
    {iso:'2025-10-27',x:100,y:40},
    {iso:'2025-10-29',x:300,y:40},
    {iso:'2025-10-30',x:400,y:40},
    {iso:'2025-10-31',x:500,y:40},
    {iso:'2025-11-01',x:600,y:40},
    {iso:'2025-11-02',x:700,y:40},
    {iso:'2025-11-03',x:800,y:40}
  ];
  const recovered=camera.recoverSingleMissingDateAnchor(anchors);
  assert.deepEqual(recovered.map(item=>item.iso),[
    '2025-10-27','2025-10-28','2025-10-29','2025-10-30',
    '2025-10-31','2025-11-01','2025-11-02','2025-11-03'
  ]);
  const inferred=recovered.find(item=>item.iso==='2025-10-28');
  assert.equal(inferred.x,200);
  assert.equal(inferred.recoveredDateGap,true);

  const irregular=camera.recoverSingleMissingDateAnchor([
    {iso:'2025-10-27',x:100,y:40},
    {iso:'2025-10-29',x:245,y:40},
    {iso:'2025-10-30',x:400,y:40},
    {iso:'2025-10-31',x:500,y:40},
    {iso:'2025-11-01',x:600,y:40}
  ]);
  assert.deepEqual(irregular.map(item=>item.iso),['2025-10-27','2025-10-29','2025-10-30','2025-10-31','2025-11-01']);
});

test('納品販売ラベルを読めなくてもカテゴリー直下の数値行Y座標から固定表を作る',()=>{
  const w=(text,x,y,confidence=95)=>({text,confidence,bbox:{x0:x-8,y0:y-6,x1:x+8,y1:y+6}});
  const lines=[
    {index:0,text:'10/27 10/29 10/30 10/31 11/1 11/2 11/3',confidence:96,bbox:{x0:50,y0:28,x1:850,y1:52},words:[
      w('10/27',100,40,98),w('10/29',300,40,98),w('10/30',400,40,98),w('10/31',500,40,98),w('11/1',600,40,98),w('11/2',700,40,98),w('11/3',800,40,98)
    ]},
    {index:1,text:'おにぎり',confidence:97,bbox:{x0:8,y0:88,x1:100,y1:112},words:[w('おにぎり',50,100,98)]},
    {index:2,text:'xxxx',confidence:84,bbox:{x0:5,y0:122,x1:850,y1:140},words:[
      w('10',66,131),w('20',100,131),w('30',134,131),
      w('40',266,131),w('50',300,131),w('60',334,131),
      w('70',366,131),w('80',400,131),w('90',434,131),
      w('11',466,131),w('22',500,131),w('33',534,131),
      w('44',566,131),w('55',600,131),w('66',634,131),
      w('77',666,131),w('88',700,131),w('99',734,131),
      w('12',766,131),w('23',800,131),w('34',834,131)
    ]},
    {index:3,text:'yyyy',confidence:83,bbox:{x0:5,y0:152,x1:850,y1:170},words:[
      w('9',66,161),w('18',100,161),w('27',134,161),
      w('36',266,161),w('45',300,161),w('54',334,161),
      w('63',366,161),w('72',400,161),w('81',434,161),
      w('14',466,161),w('25',500,161),w('35',534,161),
      w('46',566,161),w('57',600,161),w('68',634,161),
      w('79',666,161),w('89',700,161),w('98',734,161),
      w('13',766,161),w('24',800,161),w('35',834,161)
    ]},
    {index:4,text:'zzzz',confidence:82,bbox:{x0:5,y0:182,x1:850,y1:200},words:[
      w('1',66,191),w('2',100,191),w('3',134,191),w('4',266,191),w('5',300,191),w('6',334,191)
    ]}
  ];
  const cats=[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}];
  const plan=camera.fixedGridPlan(lines,cats,'2025-11-01');
  assert.ok(plan);
  assert.deepEqual(plan.dates,[
    '2025-10-27','2025-10-28','2025-10-29','2025-10-30',
    '2025-10-31','2025-11-01','2025-11-02','2025-11-03'
  ]);
  assert.equal(plan.categories[0].delivery.source,'numeric-cluster');
  assert.equal(plan.categories[0].sales.source,'numeric-cluster');
  assert.equal(plan.categories[0].delivery.y,131);
  assert.equal(plan.categories[0].sales.y,161);
  const slots=camera.fixedGridSlots(plan);
  assert.equal(slots.length,48);
  assert.equal(slots.filter(slot=>slot.field==='delivery').length,24);
  assert.equal(slots.filter(slot=>slot.field==='sales').length,24);
});

test('OCR各回が不完全でも複数回の座標を統合して固定表を復元する',()=>{
  const w=(text,x,y,confidence=95)=>({text,confidence,bbox:{x0:x-8,y0:y-6,x1:x+8,y1:y+6}});
  const line=(index,text,y,words)=>({index,text,confidence:92,bbox:{x0:5,y0:y-9,x1:850,y1:y+9},words});
  const pass1={lines:[
    line(0,'10/27 10/28 10/29 10/30',40,[w('10/27',100,40),w('10/28',200,40),w('10/29',300,40),w('10/30',400,40)]),
    line(1,'おにぎり',100,[w('おにぎり',50,100,98)]),
    line(2,'x',131,[w('10',66,131),w('20',100,131),w('30',134,131),w('40',166,131)]),
    line(3,'y',161,[w('9',66,161),w('18',100,161),w('27',134,161),w('36',166,161)])
  ]};
  const pass2={lines:[
    line(0,'10/30 10/31 11/1 11/2 11/3',40,[w('10/30',400,40),w('10/31',500,40),w('11/1',600,40),w('11/2',700,40),w('11/3',800,40)]),
    line(1,'おにぎり',101,[w('おにぎり',50,101,98)]),
    line(2,'?',132,[w('50',266,132),w('60',300,132),w('70',334,132),w('80',366,132)]),
    line(3,'?',162,[w('45',266,162),w('54',300,162),w('63',334,162),w('72',366,162)])
  ]};
  const cats=[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}];
  const plan=camera.fixedGridPlanFromPasses([pass1,pass2],cats,'2025-11-01');
  assert.ok(plan);
  assert.equal(plan.geometrySource,'multi-pass');
  assert.deepEqual(plan.dates,[
    '2025-10-27','2025-10-28','2025-10-29','2025-10-30',
    '2025-10-31','2025-11-01','2025-11-02','2025-11-03'
  ]);
  assert.equal(plan.categories.length,1);
  assert.equal(plan.categories[0].delivery.source,'numeric-cluster');
  assert.equal(plan.categories[0].sales.source,'numeric-cluster');
  assert.equal(camera.fixedGridSlots(plan).length,48);
});

test('複数日画面は対象日の直接OCR失敗でも日付範囲から判定する',()=>{
  assert.equal(camera.evaluateTargetDate([
    {iso:'2025-10-30'},{iso:'2025-10-31'},{iso:'2025-11-02'},{iso:'2025-11-03'}
  ],'2025-11-01'),true);
  assert.equal(camera.evaluateTargetDate([
    {iso:'2025-11-02'},{iso:'2025-11-03'},{iso:'2025-11-04'}
  ],'2025-11-01'),true);
  assert.equal(camera.evaluateTargetDate([{iso:'2025-10-03'}],'2025-11-01'),null);
  assert.equal(camera.evaluateTargetDate([
    {iso:'2025-10-01'},{iso:'2025-10-02'},{iso:'2025-10-03'},{iso:'2025-10-04'}
  ],'2025-11-01'),false);
});

test('月日だけのOCRは対象日基準で年跨ぎを補完する',()=>{
  const dates=camera.extractDateCandidates('12/30 12/31 1/2 1/3','2026-01-01');
  assert.deepEqual(dates.map(x=>x.iso),['2025-12-30','2025-12-31','2026-01-02','2026-01-03']);
  assert.equal(camera.evaluateTargetDate(dates,'2026-01-01'),true);
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

test('複数日表を日付×カテゴリー×3便×納品販売へ構造化する',()=>{
  function w(text,x,y,confidence=95){return {text,confidence,bbox:{x0:x-10,y0:y-8,x1:x+10,y1:y+8}};}
  const lines=[
    {index:0,text:'11/1(土) 11/2(日)',confidence:95,bbox:{x0:70,y0:32,x1:330,y1:48},words:[w('11/1(土)',120,40),w('11/2(日)',300,40)]},
    {index:1,text:'1 2 3 1 2 3',confidence:95,bbox:{x0:55,y0:62,x1:365,y1:78},words:[w('1',70,70),w('2',120,70),w('3',170,70),w('1',250,70),w('2',300,70),w('3',350,70)]},
    {index:2,text:'おにぎり',confidence:97,bbox:{x0:10,y0:92,x1:90,y1:108},words:[w('おにぎり',50,100)]},
    {index:3,text:'納品数 10 20 30 40 50 60',confidence:93,bbox:{x0:10,y0:122,x1:370,y1:138},words:[w('納品数',30,130),w('10',70,130),w('20',120,130),w('30',170,130),w('40',250,130),w('50',300,130),w('60',350,130)]},
    {index:4,text:'販売数 9 18 27 36 45 54',confidence:92,bbox:{x0:10,y0:152,x1:370,y1:168},words:[w('販売数',30,160),w('9',70,160),w('18',120,160),w('27',170,160),w('36',250,160),w('45',300,160),w('54',350,160)]}
  ];
  const categories=[{id:'cat_onigiri',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}];
  const result=camera.buildMultiDayData(lines,categories,'2025-11-01');
  assert.deepEqual(result.dates,['2025-11-01','2025-11-02']);
  assert.equal(result.categories.length,1);
  assert.equal(result.cells.length,12);
  assert.equal(result.cells.find(x=>x.date==='2025-11-01'&&x.trip===1&&x.field==='delivery').value,10);
  assert.equal(result.cells.find(x=>x.date==='2025-11-02'&&x.trip===3&&x.field==='sales').value,54);
});

test('分割された日付OCRを再結合し認識済み3日を3便グループへ対応させる',()=>{
  function w(text,x,y,confidence=95){return {text,confidence,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'10 / 28 10 / 29 10 / 30',bbox:{x0:40,y0:30,x1:550,y1:50},words:[w('10',80,40),w('/',100,40),w('28',120,40),w('10',260,40),w('/',280,40),w('29',300,40),w('10',440,40),w('/',460,40),w('30',480,40)]},
    {index:1,text:'1 2 3 1 2 3 1 2 3',bbox:{x0:40,y0:60,x1:550,y1:80},words:[w('1',70,70),w('2',120,70),w('3',170,70),w('1',250,70),w('2',300,70),w('3',350,70),w('1',430,70),w('2',480,70),w('3',530,70)]},
    {index:2,text:'おにぎり',bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100)]},
    {index:3,text:'納品数 10 20 30 40 50 60 70 80 90',bbox:{x0:10,y0:120,x1:550,y1:140},words:[w('納品数',30,130),w('10',70,130),w('20',120,130),w('30',170,130),w('40',250,130),w('50',300,130),w('60',350,130),w('70',430,130),w('80',480,130),w('90',530,130)]},
    {index:4,text:'販売数 9 18 27 36 45 54 63 72 81',bbox:{x0:10,y0:150,x1:550,y1:170},words:[w('販売数',30,160),w('9',70,160),w('18',120,160),w('27',170,160),w('36',250,160),w('45',300,160),w('54',350,160),w('63',430,160),w('72',480,160),w('81',530,160)]}
  ];
  const categories=[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}];
  const result=camera.buildMultiDayData(lines,categories,'2025-10-28');
  assert.deepEqual(result.dates,['2025-10-28','2025-10-29','2025-10-30']);
  assert.equal(result.cells.length,18);
  assert.equal(result.cells.find(x=>x.date==='2025-10-30'&&x.trip===3&&x.field==='sales').value,81);
});

test('認識できていない日付は3便グループ数から推測して追加しない',()=>{
  function w(text,x,y,confidence=95){return {text,confidence,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'10 / 28 10 / 29',bbox:{x0:40,y0:30,x1:340,y1:50},words:[w('10',80,40),w('/',100,40),w('28',120,40),w('10',260,40),w('/',280,40),w('29',300,40)]},
    {index:1,text:'1 2 3 1 2 3 1 2 3',bbox:{x0:40,y0:60,x1:550,y1:80},words:[w('1',70,70),w('2',120,70),w('3',170,70),w('1',250,70),w('2',300,70),w('3',350,70),w('1',430,70),w('2',480,70),w('3',530,70)]},
    {index:2,text:'おにぎり',bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100)]},
    {index:3,text:'納品数 10 20 30 40 50 60 70 80 90',bbox:{x0:10,y0:120,x1:550,y1:140},words:[w('納品数',30,130),w('10',70,130),w('20',120,130),w('30',170,130),w('40',250,130),w('50',300,130),w('60',350,130),w('70',430,130),w('80',480,130),w('90',530,130)]},
    {index:4,text:'販売数 9 18 27 36 45 54 63 72 81',bbox:{x0:10,y0:150,x1:550,y1:170},words:[w('販売数',30,160),w('9',70,160),w('18',120,160),w('27',170,160),w('36',250,160),w('45',300,160),w('54',350,160),w('63',430,160),w('72',480,160),w('81',530,160)]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}],'2025-10-28');
  assert.deepEqual(result.dates,['2025-10-28','2025-10-29']);
  assert.equal(result.cells.some(x=>x.date==='2025-10-30'),false);
});

test('納品数・販売数ラベルを読み損ねてもカテゴリー直下の数値行から補完する',()=>{
  function w(text,x,y){return {text,confidence:92,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'11/1',bbox:{x0:80,y0:30,x1:160,y1:50},words:[w('11/1',120,40)]},
    {index:1,text:'1 2 3',bbox:{x0:50,y0:60,x1:190,y1:80},words:[w('1',70,70),w('2',120,70),w('3',170,70)]},
    {index:2,text:'おにぎり',bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100)]},
    {index:3,text:'納晶 10 20 30',bbox:{x0:10,y0:120,x1:190,y1:140},words:[w('納晶',30,130),w('10',70,130),w('20',120,130),w('30',170,130)]},
    {index:4,text:'阪売 9 18 27',bbox:{x0:10,y0:150,x1:190,y1:170},words:[w('阪売',30,160),w('9',70,160),w('18',120,160),w('27',170,160)]},
    {index:5,text:'廃棄数 1 2 3',bbox:{x0:10,y0:180,x1:190,y1:200},words:[w('廃棄数',30,190),w('1',70,190),w('2',120,190),w('3',170,190)]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]}],'2025-11-01');
  assert.equal(result.cells.length,6);
  assert.equal(result.cells.find(x=>x.trip===2&&x.field==='delivery').value,20);
  assert.equal(result.cells.find(x=>x.trip===2&&x.field==='sales').value,18);
});

test('wordのbboxがなくてもline bboxと数値順が完全一致すれば構造化する',()=>{
  const lines=[
    {index:0,text:'10/28 10/29',confidence:93,bbox:{x0:50,y0:30,x1:410,y1:50},words:[]},
    {index:1,text:'1 2 3 1 2 3',confidence:96,bbox:{x0:50,y0:60,x1:410,y1:80},words:[]},
    {index:2,text:'おにぎり',confidence:97,bbox:{x0:10,y0:90,x1:90,y1:110},words:[]},
    {index:3,text:'納品数 10 20 30 40 50 60',confidence:91,bbox:{x0:10,y0:120,x1:410,y1:140},words:[]},
    {index:4,text:'販売数 9 18 27 36 45 54',confidence:90,bbox:{x0:10,y0:150,x1:410,y1:170},words:[]},
    {index:5,text:'廃棄数 1 2 3 4 5 6',confidence:92,bbox:{x0:10,y0:180,x1:410,y1:200},words:[]},
    {index:6,text:'欠品率 0.0 0.0 0.0 0.0 0.0 0.0',confidence:92,bbox:{x0:10,y0:210,x1:410,y1:230},words:[]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]}],'2025-10-28');
  assert.deepEqual(result.dates,['2025-10-28','2025-10-29']);
  assert.equal(result.cells.length,12);
  assert.equal(result.cells.find(x=>x.date==='2025-10-28'&&x.trip===2&&x.field==='delivery').value,20);
  assert.equal(result.cells.find(x=>x.date==='2025-10-29'&&x.trip===3&&x.field==='sales').value,54);
  assert.ok(result.cells.every(x=>x.fallback===true));
});

test('line順フォールバックは余分な数字がある行を推測で確定しない',()=>{
  const lines=[
    {index:0,text:'11/1',confidence:93,bbox:{x0:50,y0:30,x1:230,y1:50},words:[]},
    {index:1,text:'1 2 3',confidence:96,bbox:{x0:50,y0:60,x1:230,y1:80},words:[]},
    {index:2,text:'おにぎり',confidence:97,bbox:{x0:10,y0:90,x1:90,y1:110},words:[]},
    {index:3,text:'納品数 10 20 30 999',confidence:91,bbox:{x0:10,y0:120,x1:230,y1:140},words:[]},
    {index:4,text:'販売数 9 18 27',confidence:90,bbox:{x0:10,y0:150,x1:230,y1:170},words:[]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]}],'2025-11-01');
  assert.equal(result.cells.filter(x=>x.field==='delivery').length,0);
  assert.equal(result.cells.filter(x=>x.field==='sales').length,3);
  assert.equal(result.cells.some(x=>x.value===999),false);
});

test('ラベルがない数値行は納品・販売と推測しない',()=>{
  function w(text,x,y,confidence=95){return {text,confidence,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'11/1',confidence:95,bbox:{x0:100,y0:30,x1:200,y1:50},words:[w('11/1',150,40)]},
    {index:1,text:'1 2 3',confidence:96,bbox:{x0:80,y0:60,x1:220,y1:80},words:[w('1',100,70),w('2',150,70),w('3',200,70)]},
    {index:2,text:'おにぎり',confidence:97,bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100)]},
    {index:3,text:'10 20 30',confidence:90,bbox:{x0:80,y0:120,x1:220,y1:140},words:[w('10',100,130),w('20',150,130),w('30',200,130)]},
    {index:4,text:'9 18 27',confidence:90,bbox:{x0:80,y0:150,x1:220,y1:170},words:[w('9',100,160),w('18',150,160),w('27',200,160)]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,true,true]}],'2025-11-01');
  assert.equal(result.cells.length,0);
});

test('2方式OCRで値が一致しないセルは空欄にする',()=>{
  const base={dates:['2025-11-01'],categories:[{id:'a',name:'おにぎり',activeTrips:[true,true,true]}],warnings:[],cells:[
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'delivery',value:10,confidence:94,method:'bbox',geometryApproximate:false},
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'sales',value:9,confidence:93,method:'bbox',geometryApproximate:false}
  ]};
  const second=JSON.parse(JSON.stringify(base));
  second.cells[1].value=806;
  second.cells[1].confidence=62;
  const result=camera.consensusMultiDayResults([base,second]);
  assert.equal(result.cells.length,1);
  assert.equal(result.cells[0].field,'delivery');
  assert.equal(result.cells[0].value,10);
  assert.ok(result.warnings.some(message=>message.includes('一致しない 1項目')));
});

test('低信頼の一致値は2方式で同じでも自動確定しない',()=>{
  const a={dates:['2025-11-01'],categories:[{id:'a',name:'おにぎり',activeTrips:[true,true,true]}],warnings:[],cells:[
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:2,field:'sales',value:438,confidence:61,method:'bbox',geometryApproximate:false}
  ]};
  const b=JSON.parse(JSON.stringify(a));
  b.cells[0].confidence=65;
  const result=camera.consensusMultiDayResults([a,b]);
  assert.equal(result.cells.length,0);
  assert.ok(result.warnings.some(message=>message.includes('信頼度または位置情報が不足した 1項目')));
});

test('便番号ヘッダーを読めなくても連続日の日付座標から3便列を復元する',()=>{
  function w(text,x,y,confidence=95){return {text,confidence,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'10/30 10/31',confidence:97,bbox:{x0:70,y0:30,x1:350,y1:50},words:[w('10/30',120,40,99),w('10/31',300,40,99)]},
    {index:1,text:'おにぎり',confidence:97,bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100,98)]},
    {index:2,text:'納晶 10 20 30 40 50 60',confidence:92,bbox:{x0:10,y0:120,x1:390,y1:140},words:[w('納晶',25,130,88),w('10',60,130,94),w('20',120,130,95),w('30',180,130,94),w('40',240,130,95),w('50',300,130,94),w('60',360,130,95)]},
    {index:3,text:'阪売 9 18 27 36 45 54',confidence:92,bbox:{x0:10,y0:150,x1:390,y1:170},words:[w('阪売',25,160,88),w('9',60,160,94),w('18',120,160,95),w('27',180,160,94),w('36',240,160,95),w('45',300,160,94),w('54',360,160,95)]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}],'2025-10-30');
  assert.deepEqual(result.dates,['2025-10-30','2025-10-31']);
  assert.equal(result.cells.length,12);
  assert.equal(result.cells.find(x=>x.date==='2025-10-30'&&x.trip===1&&x.field==='delivery').value,10);
  assert.equal(result.cells.find(x=>x.date==='2025-10-31'&&x.trip===3&&x.field==='sales').value,54);
  assert.ok(result.cells.every(x=>x.geometryApproximate===true));
});

test('日付間隔が不規則な場合は便列を推測しない',()=>{
  function w(text,x,y,confidence=95){return {text,confidence,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'10/30 10/31 11/1',confidence:97,bbox:{x0:70,y0:30,x1:650,y1:50},words:[w('10/30',120,40,99),w('10/31',220,40,99),w('11/1',620,40,99)]},
    {index:1,text:'おにぎり',confidence:97,bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100,98)]},
    {index:2,text:'納品数 10 20 30',confidence:92,bbox:{x0:10,y0:120,x1:200,y1:140},words:[w('納品数',25,130,90),w('10',60,130,94),w('20',120,130,95),w('30',180,130,94)]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',aliases:[],hidden:false,activeTrips:[true,true,true]}],'2025-10-30');
  assert.equal(result.cells.length,0);
});

test('2方式で一致しないセルがあれば3回目OCRを実行対象にする',()=>{
  const category={id:'a',name:'おにぎり',activeTrips:[true,true,true]};
  const empty={dates:['2025-11-01'],categories:[category],warnings:[],cells:[]};
  const second={dates:['2025-11-01'],categories:[category],warnings:[],cells:[
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'delivery',value:10,confidence:90,method:'bbox',geometryApproximate:true},
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'sales',value:9,confidence:90,method:'bbox',geometryApproximate:true}
  ]};
  const consensus=camera.consensusMultiDayResults([empty,second]);
  assert.equal(consensus.cells.length,0);
  assert.equal(camera.shouldRunThirdPass([empty,second],consensus),true);
});

test('OCR2とOCR3で同じ値ならOCR1が0項目でも採用する',()=>{
  const category={id:'a',name:'おにぎり',activeTrips:[true,true,true]};
  const empty={dates:['2025-11-01'],categories:[category],warnings:[],cells:[]};
  const second={dates:['2025-11-01'],categories:[category],warnings:[],cells:[
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'delivery',value:10,confidence:90,method:'bbox',geometryApproximate:true},
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'sales',value:9,confidence:90,method:'bbox',geometryApproximate:true}
  ]};
  const third=JSON.parse(JSON.stringify(second));
  third.cells[0].confidence=88;
  third.cells[1].confidence=87;
  const consensus=camera.consensusMultiDayResults([empty,second,third]);
  assert.equal(consensus.cells.length,2);
  assert.equal(consensus.cells.every(cell=>cell.consensus===true),true);
  assert.equal(camera.shouldRunThirdPass([second,third],consensus),false);
});

test('3回目OCRでも一致しない値は空欄のままにする',()=>{
  const category={id:'a',name:'おにぎり',activeTrips:[true,true,true]};
  const empty={dates:['2025-11-01'],categories:[category],warnings:[],cells:[]};
  const second={dates:['2025-11-01'],categories:[category],warnings:[],cells:[
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'sales',value:9,confidence:90,method:'bbox',geometryApproximate:true}
  ]};
  const third=JSON.parse(JSON.stringify(second));
  third.cells[0].value=806;
  const consensus=camera.consensusMultiDayResults([empty,second,third]);
  assert.equal(consensus.cells.length,0);
  assert.ok(consensus.warnings.some(message=>message.includes('一致しない 1項目')));
});

test('対象外便は複数日OCR結果から除外する',()=>{
  function w(text,x,y){return {text,confidence:95,bbox:{x0:x-8,y0:y-7,x1:x+8,y1:y+7}};}
  const lines=[
    {index:0,text:'11/1',bbox:{x0:80,y0:30,x1:160,y1:50},words:[w('11/1',120,40)]},
    {index:1,text:'1 2 3',bbox:{x0:50,y0:60,x1:190,y1:80},words:[w('1',70,70),w('2',120,70),w('3',170,70)]},
    {index:2,text:'おにぎり',bbox:{x0:10,y0:90,x1:90,y1:110},words:[w('おにぎり',50,100)]},
    {index:3,text:'納品数 10 20 30',bbox:{x0:10,y0:120,x1:190,y1:140},words:[w('納品数',30,130),w('10',70,130),w('20',120,130),w('30',170,130)]},
    {index:4,text:'販売数 9 18 27',bbox:{x0:10,y0:150,x1:190,y1:170},words:[w('販売数',30,160),w('9',70,160),w('18',120,160),w('27',170,160)]}
  ];
  const result=camera.buildMultiDayData(lines,[{id:'a',name:'おにぎり',hidden:false,aliases:[],activeTrips:[true,false,true]}],'2025-11-01');
  assert.equal(result.cells.some(x=>x.trip===2),false);
  assert.equal(result.cells.length,4);
});

test('複数画像の同一値は統合し不一致だけ要確認にする',()=>{
  const a={dates:['2025-11-01'],categories:[{id:'a',name:'おにぎり',activeTrips:[true,true,true]}],warnings:[],cells:[
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'delivery',value:10,confidence:90},
    {date:'2025-11-01',categoryId:'a',categoryName:'おにぎり',trip:1,field:'sales',value:9,confidence:92}
  ]};
  const b=JSON.parse(JSON.stringify(a));
  b.cells[1].value=8;
  const merged=camera.mergeMultiDayResults([a,b]);
  const delivery=merged.cells.find(x=>x.field==='delivery');
  const sales=merged.cells.find(x=>x.field==='sales');
  assert.equal(delivery.conflict,false);
  assert.equal(delivery.value,10);
  assert.equal(sales.conflict,true);
  assert.equal(sales.value,null);
  assert.deepEqual(sales.values,[9,8]);
  assert.equal(merged.reviewCount,1);
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
