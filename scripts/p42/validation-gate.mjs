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
export function decidePublication({ backAggregation, holdOut = null, requireHoldOutWhenDataPermits = false, additionalChecks = [] }) {
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
    if (typeof holdOut.pass !== 'boolean') throw new Error('decidePublication: holdOut, when provided, must be a valid gate result.');
    if (!holdOut.pass) return { publish: false, reason: `hold-out validation failed: ${holdOut.reason}` };
  }
  if (!Array.isArray(additionalChecks)) throw new Error('decidePublication: additionalChecks must be an array of gate results.');
  for (const check of additionalChecks) {
    if (!check || typeof check.pass !== 'boolean') throw new Error('decidePublication: every additional check must expose a boolean pass field.');
    if (!check.pass) return { publish: false, reason: `additional validation failed: ${check.reason || 'unnamed check failed'}` };
  }
  return { publish: true, reason: 'all declared validation gates passed.' };
}


export function evaluateRateBackAggregation({ childRates, childWeights, authoritativeParentRate, maxAbsoluteBiasPp }) {
  if (typeof maxAbsoluteBiasPp !== 'number') {
    throw new Error('evaluateRateBackAggregation: maxAbsoluteBiasPp must be explicitly declared by the calling indicator family before evaluation -- no default is assumed.');
  }
  if (!Array.isArray(childRates) || !Array.isArray(childWeights) || childRates.length === 0 || childRates.length !== childWeights.length) {
    throw new Error('evaluateRateBackAggregation: childRates and childWeights must be non-empty arrays of equal length.');
  }
  if (childWeights.some(w => !Number.isFinite(w) || w < 0)) {
    throw new Error('evaluateRateBackAggregation: childWeights must be finite and non-negative.');
  }
  if (childRates.some(r => !Number.isFinite(r) || r < 0 || r > 100)) {
    throw new Error('evaluateRateBackAggregation: childRates must be finite percentages in [0, 100].');
  }
  if (!Number.isFinite(authoritativeParentRate) || authoritativeParentRate < 0 || authoritativeParentRate > 100) {
    throw new Error('evaluateRateBackAggregation: authoritativeParentRate must be a finite percentage in [0, 100].');
  }
  const weightSum = childWeights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) throw new Error('evaluateRateBackAggregation: childWeights must sum to a positive value.');
  const weightedRate = childRates.reduce((sum, rate, i) => sum + rate * childWeights[i], 0) / weightSum;
  const biasPp = Number((weightedRate - authoritativeParentRate).toFixed(4));
  const pass = Math.abs(biasPp) <= maxAbsoluteBiasPp;
  return {
    weighted_child_rate: Number(weightedRate.toFixed(4)),
    authoritative_parent_rate: authoritativeParentRate,
    bias_pp: biasPp,
    max_absolute_bias_pp: maxAbsoluteBiasPp,
    weight_sum: weightSum,
    pass,
    reason: pass
      ? 'population-weighted child rates reconcile within the declared percentage-point threshold'
      : `population-weighted back-aggregation bias ${biasPp} percentage points exceeds the declared threshold of ${maxAbsoluteBiasPp}`
  };
}

export function evaluateRateHoldOut({ predictions, heldOutObserved, maxMeanAbsoluteErrorPp, maxRootMeanSquaredErrorPp }) {
  if (typeof maxMeanAbsoluteErrorPp !== 'number' || typeof maxRootMeanSquaredErrorPp !== 'number') {
    throw new Error('evaluateRateHoldOut: both MAE and RMSE percentage-point thresholds must be explicitly declared -- no defaults are assumed.');
  }
  if (!Array.isArray(predictions) || !Array.isArray(heldOutObserved) || predictions.length !== heldOutObserved.length || predictions.length === 0) {
    throw new Error('evaluateRateHoldOut: predictions and heldOutObserved must be non-empty arrays of equal length.');
  }
  const errors = predictions.map((p, i) => {
    if (!Number.isFinite(p) || !Number.isFinite(heldOutObserved[i])) throw new Error('evaluateRateHoldOut: every prediction and observation must be finite.');
    return p - heldOutObserved[i];
  });
  const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
  const pass = mae <= maxMeanAbsoluteErrorPp && rmse <= maxRootMeanSquaredErrorPp;
  return {
    mean_absolute_error_pp: Number(mae.toFixed(4)),
    root_mean_squared_error_pp: Number(rmse.toFixed(4)),
    n_points: errors.length,
    max_mean_absolute_error_pp: maxMeanAbsoluteErrorPp,
    max_root_mean_squared_error_pp: maxRootMeanSquaredErrorPp,
    pass,
    reason: pass
      ? 'held-out rate errors are within both declared percentage-point thresholds'
      : `held-out rate error exceeds a declared threshold (MAE=${mae.toFixed(4)}pp, RMSE=${rmse.toFixed(4)}pp)`
  };
}

export function evaluateIntervalCoverage({ lowerBounds, upperBounds, heldOutObserved, minCoveragePct }) {
  if (typeof minCoveragePct !== 'number') {
    throw new Error('evaluateIntervalCoverage: minCoveragePct must be explicitly declared -- no default is assumed.');
  }
  if (!Array.isArray(lowerBounds) || !Array.isArray(upperBounds) || !Array.isArray(heldOutObserved) ||
      lowerBounds.length === 0 || lowerBounds.length !== upperBounds.length || lowerBounds.length !== heldOutObserved.length) {
    throw new Error('evaluateIntervalCoverage: lowerBounds, upperBounds and heldOutObserved must be non-empty arrays of equal length.');
  }
  let covered = 0;
  for (let i = 0; i < heldOutObserved.length; i += 1) {
    const lo = lowerBounds[i];
    const hi = upperBounds[i];
    const obs = heldOutObserved[i];
    if (![lo, hi, obs].every(Number.isFinite) || lo > hi) throw new Error('evaluateIntervalCoverage: intervals/observations must be finite and lower <= upper.');
    if (obs >= lo && obs <= hi) covered += 1;
  }
  const coveragePct = (covered / heldOutObserved.length) * 100;
  const pass = coveragePct >= minCoveragePct;
  return {
    coverage_pct: Number(coveragePct.toFixed(4)),
    covered_points: covered,
    n_points: heldOutObserved.length,
    min_coverage_pct: minCoveragePct,
    pass,
    reason: pass
      ? 'held-out interval coverage meets the declared minimum'
      : `held-out interval coverage ${coveragePct.toFixed(4)}% is below the declared minimum of ${minCoveragePct}%`
  };
}

export function evaluateIntervalWidth({ lowerBounds, upperBounds, maxMedianWidthPp }) {
  if (typeof maxMedianWidthPp !== 'number') {
    throw new Error('evaluateIntervalWidth: maxMedianWidthPp must be explicitly declared -- no default is assumed.');
  }
  if (!Array.isArray(lowerBounds) || !Array.isArray(upperBounds) || lowerBounds.length === 0 || lowerBounds.length !== upperBounds.length) {
    throw new Error('evaluateIntervalWidth: lowerBounds and upperBounds must be non-empty arrays of equal length.');
  }
  const widths = lowerBounds.map((lo, i) => {
    const hi = upperBounds[i];
    if (![lo, hi].every(Number.isFinite) || lo > hi) throw new Error('evaluateIntervalWidth: intervals must be finite and lower <= upper.');
    return hi - lo;
  }).sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);
  const median = widths.length % 2 ? widths[mid] : (widths[mid - 1] + widths[mid]) / 2;
  const pass = median <= maxMedianWidthPp;
  return {
    median_interval_width_pp: Number(median.toFixed(4)),
    max_median_width_pp: maxMedianWidthPp,
    n_intervals: widths.length,
    pass,
    reason: pass
      ? 'median uncertainty interval width is within the declared threshold'
      : `median interval width ${median.toFixed(4)}pp exceeds the declared threshold of ${maxMedianWidthPp}pp`
  };
}
