'use strict';
/*
 * Offline regression of the exact FICTIONAL fixture pinned by lab PR #61.
 * Runs the real Insight JS Bridge (not a reimplementation).
 * It DOES NOT execute Python or assert evaluator parity on its own.
 * Case dto_edits are injected AFTER the Bridge, and are never attributed
 * to a successful raw Bridge output.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bridge = require('../insight_forecast_conditions_bridge_proto_v1.js');

const fixturePath = path.join(__dirname, 'fixtures/forecast_conditions_bridge_v0.json');
const bytes = fs.readFileSync(fixturePath);
const fixture = JSON.parse(bytes.toString('utf8'));
const expectedSha256 = '352cc0d3eb70d75329f7b48635ee6782c80f9d4f329a8b728e25444cd37925d4';
const baseBridgeSha = 'a2eeb21c3061d56702fa17fc5e7f757d29b154cd';

function duplicate(value) {
  return JSON.parse(JSON.stringify(value));
}
function applyEdits(source, edits, caseName) {
  for (const [index, edit] of (edits || []).entries()) {
    assert.ok(Array.isArray(edit.path) && edit.path.length > 0,
      caseName + ': invalid edit path ' + index);
    let cursor = source;
    for (const part of edit.path.slice(0, -1)) {
      assert.ok(cursor !== null && typeof cursor === 'object' &&
        Object.hasOwn(cursor, part), caseName + ': unknown intermediate ' + part);
      cursor = cursor[part];
    }
    const last = edit.path.at(-1);
    assert.ok(cursor !== null && typeof cursor === 'object' &&
      Object.hasOwn(cursor, last), caseName + ': unknown edited leaf ' + last);
    if (edit.remove === true) {
      assert.equal(Object.hasOwn(edit, 'value'), false,
        caseName + ': remove edit must not have a value');
      delete cursor[last];
    } else {
      assert.ok(Object.hasOwn(edit, 'value'), caseName + ': replacement value missing');
      cursor[last] = duplicate(edit.value);
    }
  }
  return source;
}

test('Shared fixture matches Work pinned bytes, provenance and 33 unique cases', () => {
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expectedSha256);
  assert.equal(fixture.fixture_version, 'fictional-conditions-bridge-parity-v0');
  assert.equal(fixture.kind, 'FICTIONAL');
  assert.equal(fixture.provenance.insight_commit, baseBridgeSha);
  assert.equal(fixture.provenance.lab_base_commit,
    '7b31cc07709ed3d061024341453859504a15599e');
  assert.equal(fixture.cases.length, 33);
  assert.equal(new Set(fixture.cases.map(c => c.id)).size, 33);
});

test('Shared fixture separates Bridge errors, post-Bridge mutations and eligibility', () => {
  const outcomes = {candidate: 0, not_candidate: 0, undetermined: 0,
    bridge_rejected: 0, evaluator_rejected: 0};
  for (const c of fixture.cases) {
    if (c.expected.bridge_error) {
      outcomes.bridge_rejected++;
      assert.equal(Object.hasOwn(c, 'dto'), false);
    } else if (c.expected.outcome === 'rejected') {
      outcomes.evaluator_rejected++;
      assert.ok((c.dto_edits || []).length > 0);
    } else {
      outcomes[c.expected.eligibility]++;
    }
  }
  assert.deepEqual(outcomes, {candidate: 5, not_candidate: 5, undetermined: 13,
    bridge_rejected: 5, evaluator_rejected: 5});
});

for (const c of fixture.cases) {
  test('FICTIONAL Bridge shared fixture: ' + c.id, () => {
    const envelope = applyEdits(duplicate(fixture.base_envelope), c.envelope_edits, c.id);
    const target = c.default_evidence === true ? undefined :
      applyEdits(duplicate(fixture.base_target_evidence), c.evidence_edits, c.id);
    const inputBefore = JSON.stringify(envelope);
    const targetBefore = JSON.stringify(target);
    const expected = c.expected;

    if (expected.bridge_error) {
      assert.throws(
        () => bridge.toConditionInputDTO(envelope, target),
        e => e instanceof Error && e.message === expected.bridge_error,
        'Expected Bridge to reject its own input (not a post-Bridge DTO mutation)'
      );
    } else {
      const rawBridgeDto = bridge.toConditionInputDTO(envelope, target);
      // Post-Bridge mutations represent Python evaluator rejection cases.
      const withInjectedFaults = applyEdits(duplicate(rawBridgeDto), c.dto_edits, c.id);
      assert.deepEqual(withInjectedFaults, c.dto);
      assert.equal(Object.hasOwn(rawBridgeDto, 'eligibility'), false);
      assert.equal(Object.hasOwn(rawBridgeDto, 'forecast_status'), false);
      if ((c.dto_edits || []).length) {
        assert.notDeepEqual(rawBridgeDto, withInjectedFaults,
          'An injected DTO fault must never be treated as Bridge output');
      } else {
        assert.deepEqual(rawBridgeDto, c.dto);
      }
      if (c.default_evidence === true) {
        assert.equal(rawBridgeDto.calendar.state, 'unknown');
        assert.equal(rawBridgeDto.calendar.version, null);
        assert.deepEqual(rawBridgeDto.registries.map(x => x.read_state),
          ['unavailable', 'unavailable']);
      }
    }
    assert.equal(JSON.stringify(envelope), inputBefore,
      'Bridge mutated caller envelope');
    assert.equal(JSON.stringify(target), targetBefore,
      'Bridge mutated caller target evidence');
  });
}
