const {test,expect}=require('@playwright/test');

test('CSP-safe generated controls work on Chromium and WebKit without saving data',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/Index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#nav1')).toBeVisible();
  await page.waitForFunction(()=>!!window.InsightPayloadBindings);

  const result=await page.evaluate(()=>{
    const calls=[];
    const names=['addYear','openBudgetModal','setSalesWeather','doInstall'];
    const originals=Object.fromEntries(names.map(name=>[name,window[name]]));
    const host=document.createElement('div');
    host.id='inlineEventBindingSmoke';
    host.innerHTML=[
      '<input id="ayInput" value="2027">',
      '<button id="ayAddBtn">追加</button>',
      '<button id="haikiBudgetEditBtn">設定</button>',
      '<button data-ri="3" data-sales-weather="雪">雪</button>',
      '<button id="installBannerAddBtn">追加</button>'
    ].join('');
    const banner=document.createElement('div');
    banner.id='installBanner';
    banner.innerHTML='<button id="installBannerCloseBtn">閉じる</button>';
    const hint=document.createElement('div');
    hint.id='iosHint';
    hint.innerHTML='<button id="iosHintCloseBtn">後で</button>';
    const wrap=document.getElementById('addYearInlineWrap');
    const originalWrap=wrap.innerHTML;
    try{
      window.addYear=value=>calls.push(['addYear',value]);
      window.openBudgetModal=()=>calls.push(['openBudgetModal']);
      window.setSalesWeather=(row,weather)=>calls.push(['setSalesWeather',row,weather]);
      window.doInstall=()=>calls.push(['doInstall']);
      document.body.append(host,banner,hint);
      host.querySelector('#ayInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      host.querySelector('#ayAddBtn').click();
      host.querySelector('#haikiBudgetEditBtn').click();
      host.querySelector('[data-sales-weather]').click();
      host.querySelector('#installBannerAddBtn').click();
      banner.querySelector('#installBannerCloseBtn').click();
      hint.querySelector('#iosHintCloseBtn').click();
      wrap.innerHTML='temporary';
      host.querySelector('#ayInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return {calls,bannerRemoved:!document.contains(banner),hintRemoved:!document.contains(hint),escapeCleared:wrap.innerHTML===''};
    }finally{
      for(const name of names)window[name]=originals[name];
      wrap.innerHTML=originalWrap;
      host.remove();
      banner.remove();
      hint.remove();
    }
  });
  expect(result).toEqual({
    calls:[
      ['addYear','2027'],
      ['addYear','2027'],
      ['openBudgetModal'],
      ['setSalesWeather',3,'雪'],
      ['doInstall']
    ],
    bannerRemoved:true,
    hintRemoved:true,
    escapeCleared:true
  });
  expect(errors).toEqual([]);
});
