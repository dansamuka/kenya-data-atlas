import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBackAggregation, evaluateHoldOut, evaluateRateBackAggregation, evaluateRateHoldOut, evaluateIntervalCoverage, evaluateIntervalWidth, decidePublication } from '../../scripts/p42/validation-gate.mjs';

test('evaluateBackAggregation throws if no threshold is declared -- there is no default', () => {
  assert.throws(() => evaluateBackAggregation({ childEstimates: [1, 2, 3], authoritativeParentTotal: 6 }));
});

test('evaluateBackAggregation passes when child estimates reconcile within the declared threshold', () => {
  const r = evaluateBackAggregation({ childEstimates: [10, 20, 29.8], authoritativeParentTotal: 60, maxAbsoluteBiasPct: 1 });
  assert.equal(r.pass, true);
  assert.equal(r.child_sum, 59.8);
});

test('evaluateBackAggregation fails when the bias exceeds the declared threshold, even by a small margin', () => {
  const r = evaluateBackAggregation({ childEstimates: [10, 20, 25], authoritativeParentTotal: 60, maxAbsoluteBiasPct: 1 });
  assert.equal(r.pass, false);
  assert.match(r.reason, /exceeds the declared threshold/);
});

test('evaluateBackAggregation refuses to pass when the authoritative total is zero (undefined bias percentage)', () => {
  const r = evaluateBackAggregation({ childEstimates: [0, 0, 0.5], authoritativeParentTotal: 0, maxAbsoluteBiasPct: 5 });
  assert.equal(r.pass, false);
  assert.equal(r.bias_pct, null);
});

test('evaluateHoldOut throws if no threshold is declared', () => {
  assert.throws(() => evaluateHoldOut({ predictions: [1, 2], heldOutObserved: [1, 2] }));
});

test('evaluateHoldOut passes when mean absolute percentage error is within the declared threshold', () => {
  const r = evaluateHoldOut({ predictions: [98, 205, 51], heldOutObserved: [100, 200, 50], maxMeanAbsolutePctError: 5 });
  assert.equal(r.pass, true);
  assert.equal(r.n_valid_points, 3);
});

test('evaluateHoldOut fails when mean absolute percentage error exceeds the declared threshold', () => {
  const r = evaluateHoldOut({ predictions: [150, 205, 51], heldOutObserved: [100, 200, 50], maxMeanAbsolutePctError: 5 });
  assert.equal(r.pass, false);
});

test('evaluateHoldOut refuses to pass when every observed value is zero (no evaluable points)', () => {
  const r = evaluateHoldOut({ predictions: [3, 4], heldOutObserved: [0, 0], maxMeanAbsolutePctError: 10 });
  assert.equal(r.pass, false);
  assert.equal(r.n_valid_points, 0);
});

test('decidePublication refuses to publish when back-aggregation fails, regardless of hold-out result', () => {
  const backAggregation = evaluateBackAggregation({ childEstimates: [10, 20, 25], authoritativeParentTotal: 60, maxAbsoluteBiasPct: 1 });
  const holdOut = evaluateHoldOut({ predictions: [100], heldOutObserved: [100], maxMeanAbsolutePctError: 5 });
  const decision = decidePublication({ backAggregation, holdOut });
  assert.equal(decision.publish, false);
  assert.match(decision.reason, /back-aggregation check failed/);
});

test('decidePublication refuses to publish when hold-out is required but not provided', () => {
  const backAggregation = evaluateBackAggregation({ childEstimates: [10, 20, 30], authoritativeParentTotal: 60, maxAbsoluteBiasPct: 1 });
  const decision = decidePublication({ backAggregation, requireHoldOutWhenDataPermits: true });
  assert.equal(decision.publish, false);
  assert.match(decision.reason, /hold-out validation was declared required/);
});

test('decidePublication refuses to publish when hold-out is provided but fails, even with clean back-aggregation', () => {
  const backAggregation = evaluateBackAggregation({ childEstimates: [10, 20, 30], authoritativeParentTotal: 60, maxAbsoluteBiasPct: 1 });
  const holdOut = evaluateHoldOut({ predictions: [150], heldOutObserved: [100], maxMeanAbsolutePctError: 5 });
  const decision = decidePublication({ backAggregation, holdOut });
  assert.equal(decision.publish, false);
  assert.match(decision.reason, /hold-out validation failed/);
});

test('decidePublication publishes only when every declared gate genuinely passes', () => {
  const backAggregation = evaluateBackAggregation({ childEstimates: [10, 20, 30], authoritativeParentTotal: 60, maxAbsoluteBiasPct: 1 });
  const holdOut = evaluateHoldOut({ predictions: [101], heldOutObserved: [100], maxMeanAbsolutePctError: 5 });
  const decision = decidePublication({ backAggregation, holdOut, requireHoldOutWhenDataPermits: true });
  assert.equal(decision.publish, true);
});

test('decidePublication throws on a malformed backAggregation argument rather than silently defaulting to a decision', () => {
  assert.throws(() => decidePublication({ backAggregation: { notPass: true } }));
});


test('evaluateRateBackAggregation population-weights child rates instead of summing percentages', () => {
  const r = evaluateRateBackAggregation({
    childRates: [10, 30],
    childWeights: [75, 25],
    authoritativeParentRate: 15,
    maxAbsoluteBiasPp: 0.1
  });
  assert.equal(r.weighted_child_rate, 15);
  assert.equal(r.pass, true);
});

test('evaluateRateBackAggregation fails when the weighted rate misses the parent control', () => {
  const r = evaluateRateBackAggregation({
    childRates: [10, 30],
    childWeights: [50, 50],
    authoritativeParentRate: 15,
    maxAbsoluteBiasPp: 0.5
  });
  assert.equal(r.weighted_child_rate, 20);
  assert.equal(r.pass, false);
});

test('evaluateRateBackAggregation refuses missing thresholds and invalid weights', () => {
  assert.throws(() => evaluateRateBackAggregation({ childRates: [10], childWeights: [1], authoritativeParentRate: 10 }));
  assert.throws(() => evaluateRateBackAggregation({ childRates: [10], childWeights: [-1], authoritativeParentRate: 10, maxAbsoluteBiasPp: 1 }));
});

test('evaluateRateHoldOut judges rates in percentage points using both MAE and RMSE', () => {
  const r = evaluateRateHoldOut({
    predictions: [20, 31, 39],
    heldOutObserved: [20, 30, 40],
    maxMeanAbsoluteErrorPp: 2,
    maxRootMeanSquaredErrorPp: 2
  });
  assert.equal(r.pass, true);
  assert.equal(r.mean_absolute_error_pp, 0.6667);
});

test('evaluateRateHoldOut fails if either declared error threshold is exceeded', () => {
  const r = evaluateRateHoldOut({
    predictions: [10, 40],
    heldOutObserved: [20, 30],
    maxMeanAbsoluteErrorPp: 9,
    maxRootMeanSquaredErrorPp: 11
  });
  assert.equal(r.pass, false);
});

test('evaluateIntervalCoverage requires the predeclared minimum coverage', () => {
  const r = evaluateIntervalCoverage({
    lowerBounds: [10, 20, 30, 40, 50],
    upperBounds: [20, 30, 40, 50, 60],
    heldOutObserved: [15, 25, 35, 45, 70],
    minCoveragePct: 80
  });
  assert.equal(r.coverage_pct, 80);
  assert.equal(r.pass, true);
});

test('evaluateIntervalWidth blocks overly imprecise public estimates', () => {
  const r = evaluateIntervalWidth({
    lowerBounds: [10, 10, 10],
    upperBounds: [20, 31, 40],
    maxMedianWidthPp: 20
  });
  assert.equal(r.median_interval_width_pp, 21);
  assert.equal(r.pass, false);
});

test('decidePublication applies additional uncertainty gates after rate hold-out and reconciliation', () => {
  const backAggregation = evaluateRateBackAggregation({
    childRates: [14.8, 15.2],
    childWeights: [1, 1],
    authoritativeParentRate: 15,
    maxAbsoluteBiasPp: 0.5
  });
  const holdOut = evaluateRateHoldOut({
    predictions: [19, 31],
    heldOutObserved: [20, 30],
    maxMeanAbsoluteErrorPp: 5,
    maxRootMeanSquaredErrorPp: 7
  });
  const intervalCoverage = evaluateIntervalCoverage({
    lowerBounds: [10, 20],
    upperBounds: [30, 40],
    heldOutObserved: [20, 30],
    minCoveragePct: 80
  });
  const intervalWidth = evaluateIntervalWidth({
    lowerBounds: [10, 20],
    upperBounds: [25, 35],
    maxMedianWidthPp: 20
  });
  const decision = decidePublication({
    backAggregation,
    holdOut,
    requireHoldOutWhenDataPermits: true,
    additionalChecks: [intervalCoverage, intervalWidth]
  });
  assert.equal(decision.publish, true);
});

test('decidePublication refuses a model when an additional uncertainty gate fails', () => {
  const backAggregation = evaluateRateBackAggregation({
    childRates: [15],
    childWeights: [1],
    authoritativeParentRate: 15,
    maxAbsoluteBiasPp: 0.5
  });
  const intervalWidth = evaluateIntervalWidth({
    lowerBounds: [0, 0],
    upperBounds: [30, 40],
    maxMedianWidthPp: 20
  });
  const decision = decidePublication({ backAggregation, additionalChecks: [intervalWidth] });
  assert.equal(decision.publish, false);
  assert.match(decision.reason, /additional validation failed/);
});
