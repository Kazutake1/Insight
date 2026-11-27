import {claimDraft, finishDraft, loadDraft} from './insight_offline_quick_drafts_v1.mjs';

function targetRow(snapshot, shopId, day) {
  const [year, month, date] = day.split('-');
  const store = Object.hasOwn(snapshot.stores, shopId) ? snapshot.stores[shopId] : null;
  if (snapshot.current !== shopId || !store?.years?.some(value => String(value) === year)) return null;
  const row = store?.data?.[year]?.[Number(month)+'月']?.[Number(date)-1];
  return row && String(row.d) === String(Number(date)) ? row : null;
}

export async function applyIndexedDBQuickDraft({shopId, day, storage, build, features}) {
  const draft = await loadDraft(shopId, day);
  if (!draft || draft.state !== 'pending' || draft.basis.mode !== 'indexeddb') return {state:'unavailable'};
  if (draft.basis.build !== build || draft.basis.features !== features) return {state:'conflict'};
  const today = new Date();
  const localDay = [today.getFullYear(), today.getMonth()+1, today.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-');
  if (day > localDay) return {state:'wrong-target'};

  let comparison;
  const saved = await storage.saveQuickDraft({
    sourceIdentity:draft.basis.sourceIdentity, revision:draft.basis.revision, token:draft.token,
    async prepare(snapshot){
      const row = targetRow(snapshot, shopId, day);
      if (!row) return null;
      comparison = await claimDraft(shopId, day, draft.token, {shopId, day, basis:draft.basis, values:row});
      if (comparison.state !== 'ready') return null;
      Object.assign(row, comparison.proposed);
      return snapshot;
    }
  });
  if (saved.state !== 'confirmed') return comparison ?? saved;
  await finishDraft(shopId, day, draft.token, 'confirmed');
  return {state:'confirmed', revision:saved.revision};
}

export async function recoverIndexedDBQuickDraft({shopId, day, storage}) {
  const draft = await loadDraft(shopId, day);
  if (!draft || draft.state !== 'applying' || draft.basis.mode !== 'indexeddb') return {state:'unavailable'};
  const record = await storage.readQuickDraftEvidence();
  // An older receipt may have been superseded or the save may be on hold.
  // Keep the draft unless the active, verified record still identifies this write.
  if (record.sourceIdentity !== draft.basis.sourceIdentity || record.revision !== draft.basis.revision+1 ||
      record.writeId !== draft.token) return {state:'unconfirmed'};
  const cleared = await finishDraft(shopId, day, draft.token, 'confirmed');
  return {state:cleared?'confirmed':'unavailable'};
}
