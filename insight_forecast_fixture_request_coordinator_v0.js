'use strict';
/*
 * STEP4 FICTIONAL-only RequestCoordinator prototype.
 * No UI binding, InsightStorage access, Worker, network or forecast evaluator.
 * Cancelling work is advisory; epoch + source recheck is the adoption gate.
 */
function createFixtureRequestCoordinator({ reader, evaluate, session_id }) {
  const ABORTED = Symbol('fixture_request_aborted');
  if (!reader || typeof reader.read !== 'function' || typeof reader.isCurrent !== 'function' || typeof evaluate !== 'function') throw new Error('invalid_coordinator_adapter');
  if (typeof session_id !== 'string' || !/^[a-zA-Z0-9][\w.-]{0,63}$/.test(session_id)) throw new Error('invalid_session_id');
  let epoch = 0;
  let sequence = 0;
  let active = null;
  let disposed = false;
  function invalidate() {
    epoch++;
    if (active) active.abort();
    active = null;
    return epoch;
  }
  function stale(reason, context = null) {
    // Never expose the stale forecast value. No old READY -> HELD rewriting.
    return { accepted: false, freshness: 'stale', reason, context };
  }
  async function request(input) {
    if (disposed) return stale('disposed');
    invalidate(); // even a same-scope A -> B -> A starts a new epoch
    const mine = epoch;
    const request_id = session_id + ':' + (++sequence);
    let snapshot;
    try { snapshot = reader.read(input); }
    catch { return stale('snapshot_unavailable'); } // do not log source/raw/error
    let snapshotCurrent = false;
    try { snapshotCurrent = reader.isCurrent(snapshot); }
    catch { return stale('snapshot_unavailable'); }
    if (!snapshotCurrent) return stale('snapshot_changed');
    const controller = new AbortController();
    active = controller;
    const context = Object.freeze({
      session_id, request_id, epoch: mine, snapshot_id: snapshot.snapshot_id,
      scope: snapshot.request.scope, target_day: snapshot.request.target_day,
      source_versions: snapshot.source_versions, issued_at: snapshot.request.request_issued_at
    });
    // A non-cooperative evaluator may ignore AbortSignal indefinitely.
    // Settle our own request as stale on abort; Promise.race also observes
    // late evaluation rejection without exposing raw errors or READY values.
    let resolveAbort;
    const aborted = new Promise(resolve => { resolveAbort = resolve; });
    const onAbort = () => resolveAbort(ABORTED);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([
        Promise.resolve(evaluate(snapshot, { signal: controller.signal, context })),
        aborted
      ]);
      if (result === ABORTED || disposed || mine !== epoch || active !== controller || controller.signal.aborted || !reader.isCurrent(snapshot)) return stale('superseded_or_changed', context);
      return { accepted: true, freshness: 'current', context, result };
    } catch {
      return stale('evaluation_failed_or_aborted', context); // suppress sensitive exception text
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
      if (active === controller) active = null;
    }
  }
  return Object.freeze({
    request,
    invalidate(reason) {
      if (disposed) return epoch;
      // Reason is an internal signal only; it is never logged or sent anywhere.
      void reason;
      return invalidate();
    },
    dispose() {
      if (disposed) return;
      invalidate();
      disposed = true;
    },
    getEpoch() { return epoch; }
  });
}
module.exports = Object.freeze({ createFixtureRequestCoordinator });
