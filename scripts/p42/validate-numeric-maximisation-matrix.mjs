// P42 -- offline validation of the committed numeric-maximisation matrix. Re-derives every row's
// aggregate cell counts, barrier classification and method/feasibility selection from source on
// every run, rather than trusting the committed file's own claims.
import fs from 'node:fs';
import path from 'node:path';
import { REASON_CLASSIFICATIONS } from '../p40/reason-classifications.mjs';
import { selectMethod } from './method-selection.mjs';

const root = process.cwd();
const VALID_FEASIBILITY = new Set(['A', 'B', 'C', 'D', 'E']);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`P42_MATRIX_VALIDATE_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const policy = readJson('data/policy/local-54-indicator-contract.json');
  const ledger = readJson('data/completeness/local-54-slot-ledger.json');
  const matrix = readJson('data/p42/numeric-maximisation-matrix.json');

  // 1. Exactly 54 indicators x 3 levels = 162 rows, one each, no duplicates.
  const seen = new Set();
  for (const row of matrix.rows) {
    const key = `${row.indicator_id}|${row.level}`;
    if (seen.has(key)) fail(`duplicate matrix row for ${key}`);
    seen.add(key);
  }
  if (seen.size !== 162) fail(`matrix has ${seen.size} distinct (indicator, level) rows, expected 162 (54 x 3)`);
  for (const indicatorEntry of policy.indicators) {
    for (const level of ['county', 'constituency', 'ward']) {
      if (!seen.has(`${indicatorEntry.indicator_id}|${level}`)) fail(`matrix is missing a row for ${indicatorEntry.indicator_id}/${level}`);
    }
  }

  // 2. Every row's cell counts, applicability and method/feasibility selection are reproducible.
  const agg = new Map();
  for (const row of ledger.rows) {
    const key = `${row.indicator_code}|${row.level}`;
    if (!agg.has(key)) agg.set(key, { total: 0, numeric: 0, statusCounts: {}, reasonIds: new Set() });
    const a = agg.get(key);
    a.total += 1;
    if (row.value !== '') a.numeric += 1;
    a.statusCounts[row.status] = (a.statusCounts[row.status] || 0) + 1;
    if (row.reason_id) a.reasonIds.add(row.reason_id);
  }
  const policyByIndicator = new Map(policy.indicators.map(i => [i.indicator_id, i]));

  let totalCells = 0;
  let numericCells = 0;
  for (const row of matrix.rows) {
    if (!VALID_FEASIBILITY.has(row.feasibility_class)) fail(`${row.indicator_id}/${row.level} has invalid feasibility_class "${row.feasibility_class}"`);

    const a = agg.get(`${row.indicator_id}|${row.level}`);
    if (row.current_numeric_coverage_cells !== a.numeric) fail(`${row.indicator_id}/${row.level} numeric cell count does not match the live slot ledger`);
    if (row.current_numeric_coverage_total_cells !== a.total) fail(`${row.indicator_id}/${row.level} total cell count does not match the live slot ledger`);
    totalCells += a.total;
    numericCells += a.numeric;

    const indicatorEntry = policyByIndicator.get(row.indicator_id);
    if (indicatorEntry.treatment_class !== row.treatment_class) fail(`${row.indicator_id}/${row.level} treatment_class does not match the live policy`);

    const isFullyNumeric = a.numeric === a.total;
    const isFullyNotApplicable = (a.statusCounts.not_applicable || 0) === a.total;
    const isCountyOnlyBelowCounty = row.treatment_class === 'institutional_county_only' && row.level !== 'county';

    let expectedBarrier;
    if (isFullyNumeric) {
      expectedBarrier = 'already_numeric';
    } else if (isCountyOnlyBelowCounty || isFullyNotApplicable) {
      expectedBarrier = 'not_applicable';
    } else {
      const reasonIds = [...a.reasonIds];
      if (reasonIds.length !== 1) fail(`${row.indicator_id}/${row.level} has non-binary reason coverage in the live ledger`);
      const p40Entry = REASON_CLASSIFICATIONS[reasonIds[0]];
      if (!p40Entry) fail(`${row.indicator_id}/${row.level} reason_id ${reasonIds[0]} has no P40 classification`);
      expectedBarrier = p40Entry.classification;
      if (row.reason_id !== reasonIds[0]) fail(`${row.indicator_id}/${row.level} reason_id does not match the live ledger`);
    }
    if (row.barrier_classification !== expectedBarrier) fail(`${row.indicator_id}/${row.level} barrier_classification "${row.barrier_classification}" does not match the reproducible derivation "${expectedBarrier}"`);

    const treatmentPolicy = policy.treatment_classes[row.treatment_class];
    const expectedSelection = selectMethod({ barrierClassification: expectedBarrier, treatmentClass: row.treatment_class, allowedStates: treatmentPolicy.allowed });
    if (row.preferred_method_class !== expectedSelection.method_class) fail(`${row.indicator_id}/${row.level} preferred_method_class does not match the reproducible selection`);
    if (row.feasibility_class !== expectedSelection.feasibility_class) fail(`${row.indicator_id}/${row.level} feasibility_class does not match the reproducible selection`);
  }

  // 3. Grand totals reconcile to the full local-54 denominator.
  if (totalCells !== ledger.rows.length) fail(`matrix rows sum to ${totalCells} total cells, expected ${ledger.rows.length}`);
  const liveNumeric = ledger.rows.filter(r => r.value !== '').length;
  if (numericCells !== liveNumeric) fail(`matrix rows sum to ${numericCells} numeric cells, expected ${liveNumeric} from the live ledger`);

  console.log(`P42_MATRIX_VALIDATE_OK rows=${matrix.rows.length} total_cells=${totalCells} numeric_cells=${numericCells}`);
}

main();
