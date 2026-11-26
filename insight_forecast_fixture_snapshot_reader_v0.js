'use strict';
/*
 * STEP4 FICTIONAL-only SnapshotReader contract prototype.
 * Not imported by the production shell, and has NO InsightStorage adapter.
 * A source-provided fingerprint is not authentication or proof of persistence.
 */
const SNAPSHOT_SCHEMA = 'fictional-snapshot-v0';
let serial = 0;

function reject(code) { throw new Error(code); }
function copy(value) {
  // Lossless fixture data capture: never invoke user-supplied getters or toJSON.
  const seen = new Set();
  function visit(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) reject('non_finite_fixture_value');
      if (Object.is(v, -0) || (Number.isInteger(v) && !Number.isSafeInteger(v))) reject('invalid_fixture_number');
      return v; // finite temperatures may legitimately contain decimals
    }
    if (typeof v !== 'object' || seen.has(v)) reject('invalid_fixture_value');
    const array = Array.isArray(v);
    const proto = Object.getPrototypeOf(v);
    if (array ? proto !== Array.prototype : (proto !== Object.prototype && proto !== null))
      reject('invalid_fixture_object');
    seen.add(v);
    const keys = Reflect.ownKeys(v);
    let result;
    if (array) {
      // A dense array owns exactly its indices and the non-enumerable length.
      if (keys.length !== v.length + 1) reject('invalid_fixture_member');
      result = [];
      for (let i = 0; i < v.length; i++) {
        const desc = Object.getOwnPropertyDescriptor(v, String(i));
        if (!desc || !desc.enumerable || !Object.hasOwn(desc, 'value')) reject('invalid_fixture_member');
        result.push(visit(desc.value));
      }
    } else {
      result = {};
      for (const key of keys) {
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key))
          reject('invalid_fixture_member');
        const desc = Object.getOwnPropertyDescriptor(v, key);
        if (!desc || !desc.enumerable || !Object.hasOwn(desc, 'value')) reject('invalid_fixture_member');
        Object.defineProperty(result, key, { value: visit(desc.value), enumerable: true,
          writable: true, configurable: true });
      }
    }
    seen.delete(v);
    return result;
  }
  return visit(value);
}
// Canonical scalar-only identity avoids invoking inherited toJSON when comparing
// independently observed fictional storage states. It is NOT authentication.
function inspectionToken(value) {
  if (value === null) return 'n';
  if (typeof value === 'string') return 's' + value.length + ':' + value;
  if (typeof value === 'number') return 'd' + String(value) + ';';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (Array.isArray(value))
    return 'a' + value.length + '[' + value.map(inspectionToken).join('') + ']';
  const keys = Object.keys(value);
  return 'o' + keys.length + '{' +
    keys.map(key => inspectionToken(key) + inspectionToken(value[key])).join('') + '}';
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) reject('invalid_target_day');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) reject('invalid_target_day');
  return value;
}
function validTimestamp(value, requireJst) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const calendar = new Date(match[1] + 'T00:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== match[1]) return false;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
  const offset = match[6];
  if (requireJst && offset !== '+09:00') return false;
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}
function jst(value) {
  if (!validTimestamp(value, true)) reject('invalid_jst_timestamp');
  return value;
}
function assertKnownAt(value, issuedAt) {
  if (value === null || value === undefined) return;
  if (!validTimestamp(value, false)) reject('invalid_known_at');
  if (Date.parse(value) > Date.parse(issuedAt)) reject('future_knowledge');
}
function assertNestedKnownAt(value, issuedAt) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) assertNestedKnownAt(child, issuedAt);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'known_at') assertKnownAt(child, issuedAt);
    else assertNestedKnownAt(child, issuedAt);
  }
}
function automaticTargetDay(issuedAt) {
  jst(issuedAt);
  const utc = new Date(day(issuedAt.slice(0, 10)) + 'T00:00:00Z');
  const hour = Number(issuedAt.slice(11, 13));
  utc.setUTCDate(utc.getUTCDate() + (hour < 11 ? 1 : 2));
  return utc.toISOString().slice(0, 10);
}
function scope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('invalid_scope');
  for (const key of ['store_id', 'category_id']) {
    if (typeof value[key] !== 'string' || !/^[a-zA-Z0-9][\w.-]{0,63}$/.test(value[key])) reject('invalid_scope');
  }
  if (!Number.isInteger(value.trip) || value.trip < 1 || value.trip > 3) reject('invalid_scope');
  return copy({ store_id: value.store_id, category_id: value.category_id, trip: value.trip });
}
function sameScope(a, b) {
  return !!a && a.store_id === b.store_id && a.category_id === b.category_id && a.trip === b.trip;
}
function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) reject('invalid_request');
  const allowed = new Set(['scope', 'target_day', 'request_issued_at', 'manual_target', 'purpose', 'history_days']);
  if (Object.keys(request).some(key => !allowed.has(key))) reject('invalid_request');
  const clean = {
    scope: scope(request.scope),
    target_day: day(request.target_day),
    request_issued_at: jst(request.request_issued_at),
    manual_target: request.manual_target,
    purpose: request.purpose,
    history_days: request.history_days
  };
  if (typeof clean.manual_target !== 'boolean') reject('manual_target_required');
  if (!['current_snapshot', 'historical_replay'].includes(clean.purpose)) reject('invalid_purpose');
  if (!Number.isInteger(clean.history_days) || clean.history_days < 1 || clean.history_days > 366) reject('invalid_history_days');
  if (!clean.manual_target && clean.target_day !== automaticTargetDay(clean.request_issued_at)) reject('automatic_target_mismatch');
  return clean;
}
function inspection(source) {
  if (source?.fixture !== true || typeof source.inspect !== 'function' || typeof source.readFixture !== 'function') reject('fixture_source_required');
  const state = copy(source.inspect());
  if (!state || !Number.isInteger(state.pending) || state.pending !== 0 || state.held !== false || state.conflict !== false) reject('source_not_ready');
  if ((typeof state.report_revision !== 'number' && typeof state.report_revision !== 'string') || typeof state.raw_fingerprint !== 'string' || !state.raw_fingerprint || !state.versions || Array.isArray(state.versions) || typeof state.versions !== 'object') reject('source_metadata_unavailable');
  return { token: inspectionToken(state), versions: state.versions };
}
function assertFixture(payload, request) {
  if (!payload || !Array.isArray(payload.history) || payload.history.length > request.history_days) reject('invalid_history');
  const seen = new Set();
  const issuedDay = request.request_issued_at.slice(0, 10);
  for (const record of payload.history) {
    if (!record || !sameScope(record.scope, request.scope)) reject('scope_mismatch');
    const recordDay = day(record.day);
    const earliest = new Date(request.target_day + 'T00:00:00Z');
    earliest.setUTCDate(earliest.getUTCDate() - request.history_days);
    if (seen.has(recordDay) || recordDay >= request.target_day || recordDay > issuedDay || recordDay < earliest.toISOString().slice(0, 10)) reject('history_boundary');
    seen.add(recordDay);
    assertNestedKnownAt(record, request.request_issued_at);
  }
  if (payload.target_evidence !== null && payload.target_evidence !== undefined) {
    if (!sameScope(payload.target_evidence.scope, request.scope) || day(payload.target_evidence.day) !== request.target_day) reject('target_evidence_mismatch');
    assertNestedKnownAt(payload.target_evidence, request.request_issued_at);
  }
}
function createFixtureSnapshotReader(source) {
  if (source?.fixture !== true) reject('fixture_source_required');
  const guards = new WeakMap(); // prevent one reader from approving another source's snapshot
  return Object.freeze({
    read(request) {
      const normalized = freeze(validateRequest(request));
      const before = inspection(source);
      let rawFixture;
      try { rawFixture = source.readFixture(normalized); }
      catch { reject('fixture_read_failed'); }
      const payload = copy(rawFixture);
      const after = inspection(source);
      if (before.token !== after.token) reject('source_changed_during_read');
      assertFixture(payload, normalized);
      const snapshot = freeze({
        schema: SNAPSHOT_SCHEMA,
        snapshot_id: 'fixture-' + (++serial),
        request: normalized,
        source_versions: before.versions,
        history: payload.history,
        target_evidence: payload.target_evidence === undefined ? null : payload.target_evidence
      });
      guards.set(snapshot, before.token);
      return snapshot;
    },
    isCurrent(snapshot) {
      if (!snapshot || !guards.has(snapshot)) return false;
      try { return guards.get(snapshot) === inspection(source).token; }
      catch { return false; }
    }
  });
}
module.exports = Object.freeze({ SNAPSHOT_SCHEMA, automaticTargetDay, createFixtureSnapshotReader });
