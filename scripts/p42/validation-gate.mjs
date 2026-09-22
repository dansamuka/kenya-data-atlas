// P42 -- the shared validation gate every modelled (S4/S5) engine must pass through before
// publishing anything, per data/p42/numeric-maximisation-contract.json's own validation_framework:
//   "S5 small-area models require uncertainty intervals and out-of-sample or hold-out validation
//    where data permit."
//   "Modelled child estimates must be back-aggregated to known higher-level observations and
//    residual bias reported."
//   "No universal accuracy threshold is assumed: each indicator family must declare and justify
//    its publication threshold before model execution."
//   "A method that fails its declared validation gate cannot publish merely to increase coverage."
//
// This module is method-agnostic (small_area_estimation, constrained_downscaling and
// temporal_projection all funnel through it) and deliberately produces NO modelled values itself
// -- it only judges values an engine has already produced against thresholds that engine must
// declare up front. There is no default threshold anywhere in this file: every function throws if
// asked to evaluate without one, so a future caller can never silently ship an unvalidated
// coverage-maximising shortcut.
export function evaluateBackAggregation({ childEstimates, authoritativeParentTotal, maxAbsoluteBiasPct }) {
  if (typeof maxAbsoluteBiasPct !== 'number') {
    throw new Error('evaluateBackAggregation: maxAbsoluteBiasPct must be explicitly declared by the calling indicator family before evaluation -- no default is assumed.');
  }
  if (!Array.isArray(childEstimates) || childEstimates.length === 0) {
    throw new Error('evaluateBackAggregation: childEstimates must be a non-empty array.');
  }
  const childSum = childEstimates.reduce((a, b) => a + b, 0);
  const biasAbsolute = childSum - authoritativeParentTotal;
  const biasPct = authoritativeParentTotal === 0 ? null : Number(((biasAbsolute / authoritativeParentTotal) * 100).toFixed(4));
  const pass = biasPct !== null && Math.abs(biasPct) <= maxAbsoluteBiasPct;
  return {
    child_sum: childSum,
    authoritative_parent_total: authoritativeParentTotal,
    bias_absolute: biasAbsolute,
    bias_pct: biasPct,
    max_absolute_bias_pct: maxAbsoluteBiasPct,
    pass,
    reason: pass
      ? 'back-aggregation reconciles within the declared threshold'
      : biasPct === null
        ? 'authoritative parent total is zero; a bias percentage is undefined, so this cannot pass'
        : `back-aggregation bias ${biasPct}% exceeds the declared threshold of ${maxAbsoluteBiasPct}%`
  };
}

export function evaluateHoldOut({ predictions, heldOutObserved, maxMeanAbsolutePctError }) {
  if (typeof maxMeanAbsolutePctError !== 'number') {
    throw new Error('evaluateHoldOut: maxMeanAbsolutePctError must be explicitly declared by the calling indicator family before evaluation -- no default is assumed.');
  }
  if (!Array.isArray(predictions) || !Array.isArray(heldOutObserved) || predictions.length !== heldOutObserved.length || predictions.length === 0) {
    throw new Error('evaluateHoldOut: predictions and heldOutObserved must be non-empty arrays of equal length.');
  }
  const pctErrors = predictions.map((p, i) => (heldOutObserved[i] === 0 ? null : Math.abs((p - heldOutObserved[i]) / heldOutObserved[i]) * 100));
  const valid = pctErrors.filter(e => e !== null);
  if (valid.length === 0) {
    return { mean_absolute_pct_error: null, n_valid_points: 0, n_total_points: predictions.length, max_mean_absolute_pct_error: maxMeanAbsolutePctError, pass: false, reason: 'every hold-out point has a zero observed value; percentage error is undefined for all of them, so this cannot pass.' };
  }
  const mape = Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(4));
  const pass = mape <= maxMeanAbsolutePctError;
  return {
    mean_absolute_pct_error: mape,
    n_valid_points: valid.length,
    n_total_points: predictions.length,
    max_mean_absolute_pct_error: maxMeanAbsolutePctError,
    pass,
    reason: pass
      ? 'mean absolute percentage error is within the declared threshold'
      : `mean absolute percentage error ${mape}% exceeds the declared threshold of ${maxMeanAbsolutePctError}%`
  };
}

// The single decision point every P42 modelling engine must call before writing any value to the
// slot ledger. Coverage gain is never itself a reason to publish -- only a passed gate is.
export function decidePublication({ backAggregation, holdOut = null, requireHoldOutWhenDataPermits = false }) {
  if (!backAggregation || typeof backAggregation.pass !== 'boolean') {
    throw new Error('decidePublication: backAggregation must be the result of evaluateBackAggregation.');
  }
  if (!backAggregation.pass) {
    return { publish: false, reason: `back-aggregation check failed: ${backAggregation.reason}` };
  }
  if (requireHoldOutWhenDataPermits && !holdOut) {
    return { publish: false, reason: 'hold-out validation was declared required (data permits it) but was not provided.' };
  }
  if (holdOut) {
    if (typeof holdOut.pass !== 'boolean') throw new Error('decidePublication: holdOut, when provided, must be the result of evaluateHoldOut.');
    if (!holdOut.pass) return { publish: false, reason: `hold-out validation failed: ${holdOut.reason}` };
  }
  return { publish: true, reason: 'all declared validation gates passed.' };
}
