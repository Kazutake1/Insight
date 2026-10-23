'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { automaticTargetDay, createFixtureSnapshotReader } = require('../insight_forecast_fixture_snapshot_reader_v0.js');
const { createFixtureRequestCoordinator } = require('../insight_forecast_fixture_request_coordinator_v0.js');

const scope = Object.freeze({ store_id: 'lab_a', category_id: 'fictional_rice', trip: 1 });
function req(overrides = {}) {
  return {
    scope: { ...scope }, target_day: '2026-10-25',
    request_issued_at: '2026-10-24T10:59:00+09:00',
    manual_target: false, purpose: 'current_snapshot', history_days: 84,
    ...overrides
  };
}
function fixture() {
  const state = {
    pending: 0, held: false, conflict: false, report_revision: 1,
    raw_fingerprint: 'fake-raw-v1',
    versions: { calendar: 'fake-calendar-1', weather: 'fake-weather-1', policy: 'fake-policy-1', registry: null }
  };
  const payload = {
    history: [
      { scope: { ...scope }, day: '2026-10-23', sales: { state: 'entered', value: 0 }, delivery: { state: 'missing', value: null }, weather: { known_at: null, source: 'saved' } },
      { scope: { ...scope }, day: '2026-10-22', sales: { state: 'invalid', value: null }, trip: { status: 'unknown', inferred: true }, event: { confirmation: 'unknown' } }
    ],
    target_evidence: { scope: { ...scope }, day: '2026-10-25', known_at: null, sale: 'unknown', event: 'unknown' }
  };
  let reads = 0;
  let inspections = 0;
  return {
    fixture: true,
    state, payload,
    get reads() { return reads; },
    get inspections() { return inspections; },
    inspect() { inspections++; return structuredClone(state); },
    readFixture() { reads++; return structuredClone(payload); }
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, bad) => { resolve = ok; reject = bad; });
  return { promise, resolve, reject };
}

test('S01: clone is frozen and source data, explicit zero and missing are unchanged', () => {
  const src = fixture();
  const before = structuredClone(src.payload);
  const reader = createFixtureSnapshotReader(src);
  const snap = reader.read(req());
  assert.equal(src.reads, 1);
  assert.equal(src.inspections, 2);
  assert.deepEqual(src.payload, before);
  assert.equal(snap.history[0].sales.value, 0);
  assert.equal(snap.history[0].delivery.value, null);
  assert.equal(snap.history[1].trip.status, 'unknown');
  assert.equal(snap.target_evidence.event, 'unknown');
  assert.ok(Object.isFrozen(snap.history[0].sales));
  assert.throws(() => { snap.history[0].sales.value = 99; }, TypeError);
  assert.equal(reader.isCurrent(snap), true);
});
test('S02: mismatched store/category/trip and invalid identifiers fail closed', () => {
  for (const changed of [{ store_id: 'lab_b' }, { category_id: 'fictional_bread' }, { trip: 2 }]) {
    const src = fixture();
    src.payload.history[0].scope = { ...scope, ...changed };
    assert.throws(() => createFixtureSnapshotReader(src).read(req()), /scope_mismatch/);
  }
  for (const bad of [0, 4, '1', true, 1.5]) assert.throws(() => createFixtureSnapshotReader(fixture()).read(req({ scope: { ...scope, trip: bad } })), /invalid_scope/);
});
test('S03: 10:59 JST is next day, 11:00 is day after, manual flag remains explicit', () => {
  assert.equal(automaticTargetDay('2026-10-24T10:59:59+09:00'), '2026-10-25');
  assert.equal(automaticTargetDay('2026-10-24T11:00:00+09:00'), '2026-10-26');
  assert.throws(() => createFixtureSnapshotReader(fixture()).read(req({ request_issued_at: '2026-10-24T11:00:00+09:00' })), /automatic_target_mismatch/);
  assert.equal(createFixtureSnapshotReader(fixture()).read(req({ manual_target: true })).request.manual_target, true);
  assert.throws(() => createFixtureSnapshotReader(fixture()).read(req({ manual_target: null })), /manual_target_required/);
});
test('S04: omissions, unknown event categories, and missing registry evidence are not promoted', () => {
  const snap = createFixtureSnapshotReader(fixture()).read(req());
  assert.equal(snap.source_versions.registry, null);
  assert.equal(snap.history[1].event.confirmation, 'unknown');
  assert.equal(snap.target_evidence.sale, 'unknown');
  assert.equal(snap.history[1].sales.state, 'invalid');
});
test('S05: historical known_at unknown remains unknown; future-known records rejected', () => {
  const src = fixture();
  src.payload.history[0].known_at = null;
  assert.equal(createFixtureSnapshotReader(src).read(req()).history[0].known_at, null);
  src.payload.history[0].known_at = '2026-10-26T09:00:00+09:00';
  assert.throws(() => createFixtureSnapshotReader(src).read(req()), /future_knowledge/);
  src.payload.history[0].known_at = null;
  src.payload.history[0].day = '2026-10-25';
  assert.throws(() => createFixtureSnapshotReader(src).read(req()), /history_boundary/);
});
test('S01/S06: report state pending, held and conflict all block read', () => {
  for (const [field, bad] of [['pending', 1], ['held', true], ['conflict', true]]) {
    const src = fixture(); src.state[field] = bad;
    assert.throws(() => createFixtureSnapshotReader(src).read(req()), /source_not_ready/);
    assert.equal(src.reads, 0);
  }
});
test('S06: source changes during read discard entire snapshot', () => {
  const src = fixture(); const originalRead = src.readFixture;
  src.readFixture = (...args) => { const result = originalRead(...args); src.state.raw_fingerprint = 'fake-raw-v2'; return result; };
  assert.throws(() => createFixtureSnapshotReader(src).read(req()), /source_changed_during_read/);
});
test('S06: revision, raw fingerprint, versions, and unsafe state invalidate snapshot', () => {
  for (const update of [
    s => { s.report_revision++; }, s => { s.raw_fingerprint += '-changed'; },
    s => { s.versions.weather = 'fake-new'; }, s => { s.pending = 1; },
    s => { s.held = true; }, s => { s.conflict = true; }
  ]) {
    const src = fixture(); const reader = createFixtureSnapshotReader(src);
    const snap = reader.read(req());
    update(src.state);
    assert.equal(reader.isCurrent(snap), false);
  }
});
test('S02: malformed scope, date, period, source data and nonfinite counts rejected', () => {
  for (const overrides of [
    { target_day: '2026-02-30' },
    { request_issued_at: '2026-10-24T10:59:00Z' },
    { history_days: 0 }, { history_days: 367 },
    { purpose: 'unexpected' }
  ]) assert.throws(() => createFixtureSnapshotReader(fixture()).read(req(overrides)));
  const src = fixture(); src.payload.history[0].sales.value = NaN;
  assert.throws(() => createFixtureSnapshotReader(src).read(req()), /non_finite_fixture_value/);
});
test('S06: latest async result is adopted only with unchanged scope and source', async () => {
  const src = fixture(); const reader = createFixtureSnapshotReader(src);
  const coord = createFixtureRequestCoordinator({ reader, session_id: 'fake-session', evaluate: async () => ({ outcome: 'completed', conditions: 'candidate', forecast: 'HELD' }) });
  const response = await coord.request(req());
  assert.equal(response.accepted, true);
  assert.equal(response.freshness, 'current');
  assert.equal(response.result.forecast, 'HELD');
  assert.equal(response.context.target_day, '2026-10-25');
  assert.equal(response.context.source_versions.policy, 'fake-policy-1');
});
test('S06: A -> B -> A increases epoch and never revives old response', async () => {
  const src = fixture(); const reader = createFixtureSnapshotReader(src);
  const pending = [deferred(), deferred(), deferred()];
  let i = 0;
  const coord = createFixtureRequestCoordinator({ reader, session_id: 'fake-session', evaluate: () => pending[i++].promise });
  const oldA = coord.request(req());
  const B = coord.request(req({ scope: { ...scope, store_id: 'lab_b' } }));
  // B is not present in the fixture and must fail before evaluation.
  assert.equal((await B).accepted, false);
  const newA = coord.request(req());
  pending[0].resolve({ forecast: 'READY', evidence: 'old' });
  pending[1].resolve({ forecast: 'HELD', evidence: 'new' });
  assert.equal((await oldA).accepted, false);
  assert.equal((await newA).accepted, true);
  assert.equal(coord.getEpoch(), 3);
});
test('S06: storage, restore, policy and forecast changes invalidate in-flight output', async () => {
  for (const cause of ['storage-event', 'save-start', 'save-failed', 'restore', 'forecast-refetched', 'policy-changed', 'selection-changed']) {
    const pending = deferred();
    const coord = createFixtureRequestCoordinator({
      reader: createFixtureSnapshotReader(fixture()),
      session_id: 'fake-session', evaluate: () => pending.promise
    });
    const task = coord.request(req());
    coord.invalidate(cause);
    pending.resolve({ outcome: 'completed', forecast: 'READY' });
    const result = await task;
    assert.equal(result.accepted, false);
    assert.equal(result.result, undefined);
    assert.equal(result.freshness, 'stale');
  }
});
test('S06: source mutating after async start discards even an otherwise READY result', async () => {
  const src = fixture(); const pending = deferred();
  const coord = createFixtureRequestCoordinator({ reader: createFixtureSnapshotReader(src), session_id: 'fake-session', evaluate: () => pending.promise });
  const task = coord.request(req());
  src.state.raw_fingerprint = 'fake-changed';
  pending.resolve({ forecast: 'READY' });
  const result = await task;
  assert.equal(result.accepted, false);
  assert.equal(result.result, undefined);
});
test('S06: failure text never leaks returned error to caller', async () => {
  const coord = createFixtureRequestCoordinator({
    reader: createFixtureSnapshotReader(fixture()), session_id: 'fake-session',
    evaluate: async () => { throw Error('synthetic-sensitive-do-not-print'); }
  });
  const response = await coord.request(req());
  assert.equal(response.accepted, false);
  assert.ok(!JSON.stringify(response).includes('synthetic-sensitive'));
});
test('S06: disposed coordinator rejects and aborts pending work', async () => {
  const pending = deferred();
  const coord = createFixtureRequestCoordinator({ reader: createFixtureSnapshotReader(fixture()), session_id: 'fake-session', evaluate: () => pending.promise });
  const task = coord.request(req());
  coord.dispose();
  pending.resolve({ forecast: 'READY' });
  assert.equal((await task).accepted, false);
  assert.equal((await coord.request(req())).reason, 'disposed');
});
test('S07/S08: prototypes do not import app storage, workers, forecast evaluator or network', () => {
  for (const filename of ['insight_forecast_fixture_snapshot_reader_v0.js', 'insight_forecast_fixture_request_coordinator_v0.js']) {
    const body = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    assert.doesNotMatch(body, /\brequire\s*\(/);
    assert.doesNotMatch(body, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|WebSocket|Worker)\s*\(/);
  }
});
