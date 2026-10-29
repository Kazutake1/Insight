(function(root){
'use strict';
/*
 * OFF-REPOSITORY DESIGN PROTOTYPE ONLY; not wired into Insight.
 * Runs in a browser without bundlers, or in the Node CommonJS test harness.
 * In-memory observation of explicitly registered business operations.
 * This module does NOT certify app-wide cleanliness, provenance, or model use.
 * No Storage access, UI access, networking, logs, or business data retention.
 */

const FIXED_KINDS = Object.freeze(['sales_count_save', 'sales_category_save', 'sales_period_change', 'weather_bulk_run', 'hourly_customers_save', 'weather_location_set', 'weather_location_clear', 'waste_budget_save', 'kyaku_month_clear', 'selected_input_day_clear', 'quick_selected_date_clear', 'quick_daily_save', 'input_month_save', 'store_selector_change']);
const END_OUTCOMES = Object.freeze(['completed', 'cancelled_before_mutation', 'failed', 'partial', 'unknown']);

function createOperationObserver(options = {}) {
  // Invalid or throwing test configuration is a reason to hold, not a reason
  // for observer construction to change a caller's save control-flow.
  // The artificial maxEpoch option is for exhaustion tests, never business UI.
  let maxEpoch = Number.MAX_SAFE_INTEGER;
  let configurationInvalid = false;
  try {
    if (options === null || typeof options !== 'object') {
      configurationInvalid = true;
    } else if (Object.prototype.hasOwnProperty.call(options, 'maxEpoch')) {
      const supplied = options.maxEpoch;
      if (!Number.isSafeInteger(supplied) || supplied <= 0) configurationInvalid = true;
      else maxEpoch = supplied;
    }
  } catch (_) { configurationInvalid = true; }

  let initialized = false;
  let held = configurationInvalid;
  let epoch = 0;
  const active = new Set();

  function hold() { held = true; }
  function advance() {
    if (epoch >= maxEpoch) { hold(); return false; }
    epoch += 1;
    return true;
  }

  function initialize() {
    try {
      if (initialized || held) { hold(); return false; }
      if (!advance()) return false;
      initialized = true;
      return true;
    } catch (_) { hold(); return false; }
  }

  // Even after HELD, valid tokens are tracked when possible. HELD never clears.
  function begin(kind) {
    try {
      if (!initialized || !FIXED_KINDS.includes(kind)) { hold(); return null; }
      if (!advance()) return null;
      const token = Object.freeze(Object.create(null));
      active.add(token);
      return token;
    } catch (_) { hold(); return null; }
  }

  function end(token, outcome) {
    try {
      if (!active.has(token)) { hold(); return false; }
      active.delete(token); // Remove the exact token once, never decrement an unrelated operation.
      if (!advance()) return false;
      if (!END_OUTCOMES.includes(outcome)) { hold(); return false; }
      if (outcome === 'failed' || outcome === 'partial' || outcome === 'unknown') hold();
      // 'completed' and 'cancelled_before_mutation' attest only to a registered
      // caller's operation boundary, not storage/DOM/provenance consistency.
      return true;
    } catch (_) { hold(); return false; }
  }

  function invalidate() {
    try { hold(); return true; } catch (_) { hold(); return false; }
  }

  function status() {
    try {
      return Object.freeze({
        scope: 'registered-operations-only',
        state: held ? 'HELD' : !initialized ? 'UNAVAILABLE' : active.size ? 'ACTIVE' : 'IDLE_OBSERVED',
        activeCount: active.size,
        epoch
      });
    } catch (_) {
      hold();
      return Object.freeze({scope: 'registered-operations-only', state: 'HELD', activeCount: null, epoch: null});
    }
  }

  return Object.freeze({initialize, begin, end, invalidate, status});
}

const API = Object.freeze({createOperationObserver});
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else if (root && !Object.prototype.hasOwnProperty.call(root, 'InsightOperationObserverV0')) {
  Object.defineProperty(root, 'InsightOperationObserverV0',
    {value:API, writable:false, enumerable:false, configurable:false});
}
})(typeof window !== 'undefined' ? window : undefined);
