const {test,expect}=require('@playwright/test');

const before={売上:250,客数:90,廃棄金額:12,haiki:{米飯:10,FF:2}};
const after={売上:255,客数:0,廃棄金額:14,haiki:{FF:2,米飯:12}};
const draft={shopId:'fictional-shop-a',day:'2026-11-24',before,after,
  basis:{build:'fixture-142',features:'fixture-shell',sourceIdentity:'fixture-adoption',mode:'indexeddb',revision:4}};

async function openFixture(page){
  await page.route('**/offline-quick-drafts-fixture',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Fictional quick drafts</title>'
  }));
  await page.goto('/offline-quick-drafts-fixture');
  await page.evaluate(async ()=>{
    window.drafts=await import('/draft/insight_offline_quick_drafts_v1.mjs');
  });
}

test('isolated draft survives offline edits and reload, without sharing slots or overwriting newer drafts',async({page,context})=>{
  await openFixture(page);
  const peer=await context.newPage();
  await openFixture(peer);
  await context.setOffline(true);
  const result=await page.evaluate(data=>drafts.saveDraft(data),draft);
  await context.setOffline(false);
  await page.reload();
  await page.evaluate(async ()=>{
    window.drafts=await import('/draft/insight_offline_quick_drafts_v1.mjs');
  });
  expect(await page.evaluate(({shopId,day})=>drafts.loadDraft(shopId,day),draft)).toEqual(result);
  expect(await page.evaluate(({shopId,day})=>drafts.loadDraft(shopId,'2026-11-25'),draft)).toBeNull();
  expect(await page.evaluate(({day})=>drafts.loadDraft('fictional-shop-b',day),draft)).toBeNull();
  const fresh=await peer.evaluate(({draft,token})=>drafts.saveDraft({...draft,after:{...draft.after,売上:260}},token),
    {draft,token:result.token});
  await expect(page.evaluate(({draft,token})=>drafts.saveDraft(draft,token),{draft,token:result.token}))
    .rejects.toThrow('Draft changed in another tab');
  expect(await page.evaluate(({shopId,day})=>drafts.loadDraft(shopId,day),draft)).toEqual(fresh);
  expect(await page.evaluate(()=>localStorage.getItem('insight_v11'))).toBeNull();
});

test('explicit claim rejects changed authority and only a confirmed receipt clears the pending draft',async({page})=>{
  await openFixture(page);
  const results=await page.evaluate(async ({shopId,day,basis,before,after})=>{
    const saved=await drafts.saveDraft({shopId,day,basis,before,after});
    const current={shopId,day,basis,values:before};
    const claim=comparison=>drafts.claimDraft(shopId,day,saved.token,comparison);
    const wrongTarget=await claim({...current,shopId:'fictional-shop-b'});
    const changed=await claim({...current,values:{...before,客数:91}});
    const revision=await claim({...current,basis:{...basis,revision:5}});
    const version=await claim({...current,basis:{...basis,build:'fixture-143'}});
    const source=await claim({...current,basis:{...basis,sourceIdentity:'different-adoption'}});
    const pending=await drafts.loadDraft(shopId,day);
    const ready=await claim(current);
    const duplicate=await claim(current);
    const unknown=await Promise.resolve().then(()=>drafts.finishDraft(shopId,day,saved.token,'unknown'))
      .then(()=>false,()=>true);
    const applying=await drafts.loadDraft(shopId,day);
    const oldReceipt=await drafts.finishDraft(shopId,day,'wrong-token','confirmed');
    const released=await drafts.finishDraft(shopId,day,saved.token,'not-started');
    const retry=await drafts.loadDraft(shopId,day);
    const obsolete=await drafts.finishDraft(shopId,day,saved.token,'confirmed');
    const secondClaim=await drafts.claimDraft(shopId,day,retry.token,current);
    const confirmed=await drafts.finishDraft(shopId,day,retry.token,'confirmed');
    const deleted=await drafts.loadDraft(shopId,day);
    return {wrongTarget,changed,revision,version,source,pending,ready,duplicate,unknown,applying,oldReceipt,released,retry,
      obsolete,secondClaim,confirmed,deleted};
  },draft);
  expect(results.wrongTarget).toEqual({state:'wrong-target'});
  for(const key of ['changed','revision','version','source']) expect(results[key].state).toBe('conflict');
  expect(results.pending.state).toBe('pending');
  expect(results.ready).toEqual({state:'ready',proposed:after});
  expect(results.duplicate.state).toBe('unavailable');
  expect(results.unknown).toBe(true);
  expect(results.applying.state).toBe('applying');
  expect(results.oldReceipt).toBe(false);
  expect(results.released).toBe(true);
  expect(results.retry.state).toBe('pending');
  expect(results.obsolete).toBe(false);
  expect(results.secondClaim.state).toBe('ready');
  expect(results.confirmed).toBe(true);
  expect(results.deleted).toBeNull();
});

test('a failed draft transaction retains the prior draft and the legacy source',async({page})=>{
  await openFixture(page);
  const result=await page.evaluate(async draft=>{
    const raw='{"fixture":true}';
    localStorage.setItem('insight_v11',raw);
    const legacy={...draft,basis:{...draft.basis,mode:'legacy',revision:null,sourceIdentity:'fixture-digest'}};
    const original=await drafts.saveDraft(legacy);
    const put=IDBObjectStore.prototype.put;
    let failure;
    try{
      IDBObjectStore.prototype.put=()=>{throw new DOMException('Fixture quota failure','QuotaExceededError');};
      failure=await drafts.saveDraft({...legacy,after:{...legacy.after,売上:270}},original.token)
        .catch(error=>error.name);
    }finally{IDBObjectStore.prototype.put=put;}
    const stored=await drafts.loadDraft(draft.shopId,draft.day);
    const differentRaw=await drafts.claimDraft(draft.shopId,draft.day,stored.token,{
      shopId:draft.shopId,day:draft.day,values:draft.before,basis:{...legacy.basis,sourceIdentity:'changed-digest'}
    });
    return {failure,stored,original,differentRaw,raw:localStorage.getItem('insight_v11')};
  },draft);
  expect(result.failure).toBe('QuotaExceededError');
  expect(result.stored).toEqual(result.original);
  expect(result.differentRaw.state).toBe('conflict');
  expect(result.raw).toBe('{"fixture":true}');
});
