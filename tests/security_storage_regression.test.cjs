const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');

function safePersistSource(){
  const bootstrap=fs.readFileSync(path.join(root,'insight_bootstrap_patches_v1.js'),'utf8');
  const marker='var safePersist=',start=bootstrap.indexOf(marker);
  const end=bootstrap.indexOf(';\nif(html.indexOf(originalPersist)',start);
  assert.ok(start>=0&&end>start,'安全な保存処理がbootstrap moduleに定義されていること');
  return vm.runInNewContext(bootstrap.slice(start+marker.length,end));
}

test('共通保存処理は成功時だけtrueを返す',()=>{
  const calls=[];
  const context={
    SK:'insight',allStores:{current:'a'},
    localStorage:{setItem:(key,value)=>calls.push([key,value])},
    alert:()=>assert.fail('保存成功時に警告を出さないこと'),
    window:{addEventListener:()=>{}},Error
  };
  vm.runInNewContext(safePersistSource(),context);
  assert.equal(context.persist(),true);
  assert.deepEqual(calls,[['insight','{"current":"a"}']]);
});

test('共通保存処理はStorage読込後に共有保存層へ委譲する',()=>{
  const calls=[];
  const context={
    SK:'insight',allStores:{current:'a'},
    localStorage:{setItem:()=>assert.fail('共有保存層がある場合はfallbackへ書かないこと')},
    alert:()=>assert.fail('保存成功時に警告を出さないこと'),
    window:{
      InsightStorage:{persistCurrent:value=>{calls.push(value);return true;}},
      addEventListener:()=>{}
    },
    Error
  };
  vm.runInNewContext(safePersistSource(),context);
  assert.equal(context.persist(),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0],context.allStores);
});

test('共通保存処理は失敗時に成功表示へ進ませない',()=>{
  const alerts=[];let errorHandler;
  const context={
    SK:'insight',allStores:{current:'a'},
    localStorage:{setItem:()=>{throw new Error('quota');}},
    alert:message=>alerts.push(message),
    window:{addEventListener:(type,handler)=>{if(type==='error')errorHandler=handler;}},Error
  };
  vm.runInNewContext(safePersistSource(),context);
  assert.throws(()=>context.persist(),error=>error&&error.name==='InsightPersistError');
  assert.match(alerts[0],/現在の変更は保存されていません/);
  let prevented=false;errorHandler({error:{name:'InsightPersistError'},preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);
});

test('セール実績の店舗名はHTMLではなく文字列として描画する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_sales_count_v1.js'),'utf8');
  const start=source.indexOf('function renderAnalysis()');
  const end=source.indexOf('function disp(',start);
  assert.ok(start>=0&&end>start,'セール実績描画処理が存在すること');
  const render=source.slice(start,end);
  assert.match(render,/values=\[x\.date,[\s\S]*x\.store/);
  assert.match(render,/tr\.append\(el\('td',String\(value\)\)\)/);
  assert.doesNotMatch(render,/innerHTML=[^;]*x\.store/);
});

test('天気地点名はHTMLとして解釈せず文字列として描画する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_weather_location_v1.js'),'utf8');
  const malicious='<img src=x onerror="globalThis.__weatherXss=1">';
  const createdTags=[];
  let weatherButton=null;
  const menu={
    children:[],style:{},
    appendChild(node){this.children.push(node);},
    insertBefore(node,ref){const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,node);}
  };
  const document={
    getElementById(id){
      if(id==='storeMenu')return menu;
      if(id==='weatherLocationMenuItem')return weatherButton;
      return null;
    },
    createElement(tag){
      createdTags.push(tag);
      const node={
        tagName:tag,children:[],style:{},
        appendChild(child){this.children.push(child);},
        set innerHTML(_value){assert.fail('天気地点名の描画にinnerHTMLを使用しないこと');}
      };
      if(tag==='button')weatherButton=node;
      return node;
    },
    createTextNode(value){return {nodeType:3,textContent:String(value)};}
  };
  const context={document,store:{weatherLocation:{label:malicious}},showStoreMenu:()=>{},console};
  vm.createContext(context);
  vm.runInContext(source,context);
  context.showStoreMenu();
  assert.deepEqual(createdTags,['button','span']);
  assert.equal(menu.children[0],weatherButton);
  assert.equal(weatherButton.children[1].textContent,' 天気地点：'+malicious);
  assert.equal(context.__weatherXss,undefined);
});

test('Index.htmlは必要先だけを許可するCSPを定義する',()=>{
  const index=fs.readFileSync(path.join(root,'Index.html'),'utf8');
  const match=index.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(match,'Content-Security-Policyが定義されていること');
  const policy=match[1];
  [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://geocoding-api.open-meteo.com https://api.open-meteo.com https://historical-forecast-api.open-meteo.com https://www.jma.go.jp",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "worker-src 'none'",
    "upgrade-insecure-requests"
  ].forEach(directive=>assert.ok(policy.includes(directive),'CSPに '+directive+' が含まれること'));
  assert.doesNotMatch(policy,/'unsafe-eval'/);
  assert.ok(index.indexOf('Content-Security-Policy')<index.indexOf('https://unpkg.com/pako'),'CSPは外部スクリプトより前に定義すること');
});

test('販売数入力は不正値の保存と同じページの再読込を防ぐ',()=>{
  const source=fs.readFileSync(path.join(root,'insight_sales_count_v1.js'),'utf8');
  assert.match(source,/querySelector\('#pageSalesCount input:invalid'\)/);
  assert.match(source,/invalid\.reportValidity\(\)/);
  assert.match(source,/if\(currentNav==='salesCounts'\)return/);
});

test('カテゴリー保存後も選択中カテゴリーの未保存入力を保持する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_sales_count_v1.js'),'utf8');
  const start=source.indexOf("d.querySelector('[data-save]').onclick");
  const end=source.indexOf("d.addEventListener('close'",start);
  const handler=source.slice(start,end);
  assert.match(handler,/previousDraft=state\.draft/);
  assert.match(handler,/state\.draft=previousDraft/);
  assert.match(handler,/setDirty\(wasDirty\)/);
  assert.match(handler,/未保存の変更があります/);
});

test('バックアップ復元は実在日と有効なカテゴリーマスターを検査する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_backup_guard_v1.js'),'utf8');
  assert.match(source,/function validSalesCountDate/);
  assert.match(source,/categories\.length/);
  assert.match(source,/categories\.some\(function\(c\)/);
  assert.match(source,/!validSalesCountDate\(date\)/);
  assert.match(source,/InsightStorage\.migrateSnapshot\(next\)/);
  assert.match(source,/CURRENT_SCHEMA_VERSION/);
});

test('通常バックアップは日時・店舗数・対象年度を持つv2形式で保存する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_backup_guard_v1.js'),'utf8');
  assert.match(source,/BACKUP_FORMAT="InsightBackup",BACKUP_FORMAT_VERSION=2/);
  assert.match(source,/createdAt:now\.toISOString\(\)/);
  assert.match(source,/storeCount:stores\.length/);
  assert.match(source,/years:backupYears\(snapshot\)/);
  assert.match(source,/stores:stores/);
  assert.match(source,/data:snapshot/);
  assert.match(source,/Insight_backup_all_stores_/);
});

test('復元前検査はデータ健全性を確認し重大エラーを保存前に拒否する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_backup_guard_v1.js'),'utf8');
  assert.match(source,/InsightDataHealth\.check\(snapshot\)/);
  assert.match(source,/if\(report\.counts\.errors\)/);
  assert.ok(source.indexOf('runRestorePreflight(newAll)')<source.indexOf('InsightStorage.writeSnapshot(newAll)'));
  assert.match(source,/バックアップ日時：/);
  assert.match(source,/店舗数：/);
  assert.match(source,/対象年度：/);
  assert.match(source,/復元前検査：/);
});

test('新旧バックアップ形式を復元対象として維持する',()=>{
  const source=fs.readFileSync(path.join(root,'insight_backup_guard_v1.js'),'utf8');
  assert.match(source,/Object\.prototype\.hasOwnProperty\.call\(raw,"backupInfo"\)/);
  assert.match(source,/return \{data:raw,info:null,legacy:true\}/);
  assert.match(source,/Array\.isArray\(raw\.years\)&&isPlainObject\(raw\.data\)/);
});

test('販売数入力を開いたままバックアップ復元しても復元後データを再読込する',()=>{
  const sales=fs.readFileSync(path.join(root,'insight_sales_count_v1.js'),'utf8');
  const backup=fs.readFileSync(path.join(root,'insight_backup_guard_v1.js'),'utf8');
  assert.match(sales,/function reloadFromStore\(\)/);
  assert.match(sales,/model\.reloadFromStore=reloadFromStore/);
  assert.match(sales,/if\(!selectedCategory\(\)\|\|selectedCategory\(\)\.hidden\)state\.categoryId=/);
  assert.match(backup,/InsightSalesCount\.reloadFromStore/);
  assert.doesNotMatch(backup,/currentNav==='salesCounts'\)gotoNav\('salesCounts'\)/);
});

test('バックアップ復元後も共有年月を復元先店舗の年度構成へ整合させる',()=>{
  const source=fs.readFileSync(path.join(root,'insight_backup_guard_v1.js'),'utf8');
  assert.match(source,/InsightPagePeriodSync\.reconcileCurrentStore/);
});
