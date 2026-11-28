import {finishDraft, loadDraft} from './insight_offline_quick_drafts_v1.mjs';

async function cleanConfirmedDraft(draft, revision) {
  try {
    const cleared = await finishDraft(draft.shopId,draft.day,draft.token,'confirmed');
    return {state:'confirmed', revision, cleanup:cleared?'cleared':'not-matched'};
  } catch {
    return {state:'confirmed', revision, cleanup:'pending'};
  }
}

export async function applyIndexedDBQuickDraft({shopId, day, storage}) {
  const draft = await loadDraft(shopId, day);
  if (!draft || draft.state !== 'pending' || draft.basis.mode !== 'indexeddb') return {state:'unavailable'};
  let saved;
  try {
    saved = await storage.saveQuickDraft({shopId,day,token:draft.token});
  } catch {
    const current = await loadDraft(shopId,day).catch(()=>null);
    if (current?.token===draft.token&&current.state==='pending') return {state:'not-started'};
    return {state:'unknown'};
  }
  if (saved.state !== 'confirmed') return saved;
  return cleanConfirmedDraft(draft,saved.revision);
}

export async function recoverIndexedDBQuickDraft({shopId, day, storage}) {
  const draft = await loadDraft(shopId, day);
  if (!draft || draft.state !== 'applying' || draft.basis.mode !== 'indexeddb') return {state:'unavailable'};
  const record = await storage.readQuickDraftEvidence().catch(()=>null);
  if (!record || record.sourceIdentity !== draft.basis.sourceIdentity ||
      record.revision !== draft.basis.revision+1 || record.writeId !== draft.token)
    return {state:'unconfirmed'};
  return cleanConfirmedDraft(draft,record.revision);
}
