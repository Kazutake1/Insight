const {test,expect}=require('@playwright/test');
const path=require('node:path');

for(const failure of ['before marker','after marker','after activation','final marker write','none']){
  test('adoption restart: '+failure,async({page})=>{
    const url='/indexeddb-marker-order-fixture';
    const marker='insight_test_only_adoption_order';
    const raw=' {"current":"a","stores":{"a":{"years":["2025"],"data":{"2025":{}}}}}\n';
    await page.route('**'+url,route=>route.fulfill({
      body:'<!doctype html><script>var SK="insight_v11";</script>',contentType:'text/html'
    }));
    async function open(){
      await page.goto(url);
      for(const file of ['../../insight_storage_v1.js','../fixtures/indexeddb-verified-restart.js']){
        await page.addScriptTag({path:path.join(__dirname,file)});
      }
      await page.evaluate(()=>{
        window.gate=InsightIndexedDBRestartGate.create(()=>localStorage.getItem(SK));
      });
    }
    await open();
    const interrupted=await page.evaluate(async ({marker,raw,failure})=>{
      localStorage.setItem(SK,raw);
      function writeMarker(status,id){
        if((status==='preparing'&&failure==='before marker')||
           (status==='active'&&failure==='final marker write')){
          throw new DOMException('Injected marker write failure','QuotaExceededError');
        }
        localStorage.setItem(marker,JSON.stringify({status,id}));
      }
      try{
        // Persist the intent before activating a candidate or permitting edits.
        writeMarker('preparing',null);
        if(failure==='after marker')return 'interrupted';
        const id=await gate.prepare();
        writeMarker('preparing',id);
        await gate.activate(id);
        if(failure==='after activation')return 'interrupted';
        writeMarker('active',id);
        return 'completed';
      }catch(error){return error.name;}
    },{marker,raw,failure});

    await open();
    const restarted=await page.evaluate(async ({marker,raw})=>{
      const recorded=JSON.parse(localStorage.getItem(marker));
      const record=await gate.inspect();
      const decision=(!record&&!recorded)?'manual migration only':
        (recorded?.status==='active'&&record?.status==='active'&&
          record.sourceMatches&&recorded.id===record.id)?'active':'hold';
      let revision=null;
      if(decision==='active')revision=(await gate.load()).revision;
      return {decision,revision,markerStatus:recorded?.status??null,dbStatus:record?.status??null,
        sourceMatches:localStorage.getItem(SK)===raw};
    },{marker,raw});
    const expected={
      'before marker':['QuotaExceededError','manual migration only',null,null,null],
      'after marker':['interrupted','hold',null,'preparing',null],
      'after activation':['interrupted','hold',null,'preparing','active'],
      'final marker write':['QuotaExceededError','hold',null,'preparing','active'],
      none:['completed','active',0,'active','active']
    };
    const [result,decision,revision,markerStatus,dbStatus]=expected[failure];
    expect(interrupted).toBe(result);
    expect(restarted).toEqual({decision,revision,markerStatus,dbStatus,sourceMatches:true});
  });
}
