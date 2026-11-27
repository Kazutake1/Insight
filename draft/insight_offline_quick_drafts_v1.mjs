// Isolated prototype. The normal app and the offline viewer do not load this module.
const databaseName = 'insight-offline-quick-drafts-v1';
const storeName = 'drafts';
const quantityFields = ['売上', '客数', '廃棄金額'];

function draftKey(shopId, day) {
  if (typeof shopId !== 'string' || !shopId || typeof day !== 'string' ||
      !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid draft target');
  const date = new Date(day);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    throw new Error('Invalid draft target');
  return JSON.stringify([shopId, day]);
}

function normalizeBasis(basis) {
  if (!basis || typeof basis.build !== 'string' || !basis.build ||
      typeof basis.features !== 'string' || !basis.features ||
      typeof basis.sourceIdentity !== 'string' || !basis.sourceIdentity ||
      !['legacy', 'indexeddb'].includes(basis.mode) ||
      (basis.mode === 'legacy' ? basis.revision !== null :
        !Number.isSafeInteger(basis.revision) || basis.revision < 0)) throw new Error('Invalid draft basis');
  const {build, features, sourceIdentity, mode, revision} = basis;
  return {build, features, sourceIdentity, mode, revision};
}

function readValues(values) {
  const {haiki} = values;
  if (!haiki || typeof haiki !== 'object' || Array.isArray(haiki))
    throw new Error('Invalid waste categories');
  const keys = Object.keys(haiki).sort();
  if (!keys.length || !keys.every(key => key && Number.isSafeInteger(haiki[key])))
    throw new Error('Invalid waste categories');
  if (!quantityFields.every(key => Number.isSafeInteger(values[key])))
    throw new Error('Invalid draft quantity');
  return {売上:values.売上, 客数:values.客数, 廃棄金額:values.廃棄金額, haiki:Object.fromEntries(keys.map(key => [key, haiki[key]]))};
}

export function createDraft({shopId, day, basis, before, after}) {
  const key = draftKey(shopId, day);
  const original = readValues(before);
  const proposed = readValues(after);
  const categoryKeys = value => JSON.stringify(Object.keys(value.haiki));
  if (categoryKeys(original) !== categoryKeys(proposed) ||
      Object.values(proposed.haiki).reduce((total, value) => total + BigInt(value), 0n) !== BigInt(proposed.廃棄金額))
    throw new Error('Invalid waste changes');
  if (JSON.stringify(original) === JSON.stringify(proposed)) throw new Error('No draft changes');
  return {schema:1, key, shopId, day, basis:normalizeBasis(basis), before:original, after:proposed};
}

export function compareDraft(draft, current) {
  try {
    const valid = createDraft(draft);
    const values = readValues(current.values);
    const basis = normalizeBasis(current.basis);
    if (draft.schema !== 1 || valid.key !== draft.key || draft.key !== draftKey(current.shopId, current.day))
      return {state:'wrong-target'};
    // An unknown source, build or revision blocks the entire draft before any write.
    if (JSON.stringify(valid.basis) !== JSON.stringify(basis) ||
        JSON.stringify(valid.before) !== JSON.stringify(values))
      return {state:'conflict', original:valid.before, current:values, proposed:valid.after};
    return {state:'ready', proposed:valid.after};
  } catch {
    return {state:'invalid'};
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, {keyPath:'key'});
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Draft database is blocked'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) database.close();
      else resolve(database);
    };
  });
}

async function transact(key, mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let result, failure;
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => {
        try { result = operation(request.result ?? null, store); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Draft transaction aborted'));
    });
  } finally {
    database.close();
  }
}

export function loadDraft(shopId, day) {
  return transact(draftKey(shopId, day), 'readonly', stored => stored);
}

export function saveDraft(input, expectedToken = null) {
  const draft = createDraft(input);
  return transact(draft.key, 'readwrite', (stored, store) => {
    if ((stored?.token ?? null) !== expectedToken || (stored && stored.state !== 'pending'))
      throw new Error('Draft changed in another tab');
    if (stored && (JSON.stringify(stored.basis) !== JSON.stringify(draft.basis) ||
        JSON.stringify(stored.before) !== JSON.stringify(draft.before)))
      throw new Error('Draft basis cannot change during an edit');
    const next = {...draft, token:crypto.randomUUID(), state:'pending'};
    store.put(next);
    return next;
  });
}

// Claim a draft before the existing business save. A crash or uncertain result
// leaves a durable applying record that cannot be automatically retried.
export function claimDraft(shopId, day, token, current) {
  return transact(draftKey(shopId, day), 'readwrite', (stored, store) => {
    if (!stored || stored.token !== token || stored.state !== 'pending') return {state:'unavailable'};
    const comparison = compareDraft(stored, current);
    if (comparison.state !== 'ready') return comparison;
    store.put({...stored, state:'applying'});
    return comparison;
  });
}

export function finishDraft(shopId, day, token, outcome) {
  if (!['confirmed', 'not-started'].includes(outcome)) throw new Error('Draft result remains unconfirmed');
  return transact(draftKey(shopId, day), 'readwrite', (stored, store) => {
    if (!stored || stored.token !== token || stored.state !== 'applying') return false;
    if (outcome === 'confirmed') store.delete(stored.key);
    else store.put({...stored, token:crypto.randomUUID(), state:'pending'});
    return true;
  });
}
