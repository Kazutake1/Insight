import {loadDraft, saveDraft} from './drafts.mjs';

// The fixture has fixed fictional source data and no business writer.
const target = {
  shopId:'fictional-cold-start',
  day:'2026-11-24',
  basis:{build:'fixture-build',features:'fixture-features',sourceIdentity:'fixture-source',mode:'indexeddb',revision:4},
  before:{売上:250,客数:90,廃棄金額:12,haiki:{米飯:12}}
};
const form = document.querySelector('form');
const status = document.querySelector('[role=status]');

async function start() {
  const worker = navigator.serviceWorker;
  const scope = new URL('./',location.href);
  const expectedScript = new URL('worker.js',scope).href;
  const registration = await worker.getRegistration(scope.href);
  if ((registration && registration.scope !== scope.href) ||
      [registration?.installing, registration?.waiting, registration?.active, worker.controller]
        .some(candidate => candidate && candidate.scriptURL !== expectedScript))
    throw new Error('Unexpected service worker');

  if (!worker.controller) {
    await worker.register(expectedScript,{scope:scope.href,updateViaCache:'none'});
    const ready = await worker.ready;
    if (ready.scope !== scope.href || ready.active?.scriptURL !== expectedScript)
      throw new Error('Unexpected service worker');
    window.location.reload();
    return;
  }
  if (registration?.active !== worker.controller) throw new Error('Unverified active service worker');
  const stored = await loadDraft(target.shopId,target.day);
  let token = stored?.token ?? null;
  const initial = stored?.after ?? target.before;
  form.elements.sales.value = initial.売上;
  form.elements.customers.value = initial.客数;
  form.elements.waste.value = initial.廃棄金額;
  form.querySelector('fieldset').disabled = false;
  status.textContent = stored ? '下書きを復元しました。' : '下書きを入力できます。';
  let queue = Promise.resolve();
  let edit = 0;
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('input',()=>{
    const currentEdit = ++edit;
    const {sales,customers,waste} = form.elements;
    if (![sales,customers,waste].every(input=>Number.isSafeInteger(input.valueAsNumber))) {
      status.textContent = '下書きを保存できません。数値を確認してください。';
      return;
    }
    const after = {売上:sales.valueAsNumber,客数:customers.valueAsNumber,廃棄金額:waste.valueAsNumber,
      haiki:{米飯:waste.valueAsNumber}};
    status.textContent = '下書きを保存しています。';
    queue = queue.then(async ()=>{
      const saved = await saveDraft({...target,after},token);
      token = saved.token;
      if (currentEdit === edit) status.textContent = '下書きを保存しました。';
    }).catch(()=>{
      if (currentEdit === edit) status.textContent = '下書きを保存できませんでした。';
    });
  });
}

start().catch(()=>{status.textContent='下書き用の画面を開けませんでした。';});
