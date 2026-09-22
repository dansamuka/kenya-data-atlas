// P41 -- offline validation of the committed access-attempt record and yield report. Re-derives
// the reconciliation against the live slot ledger and the frozen P40 baseline on every run.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const VALID_ATTEMPT_CONCLUSIONS = new Set(['still_pending', 'unreachable', 'numeric_promotion']);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`P41_VALIDATE_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const tranche = readJson('data/p40/p41-tranche-contract.json');
  const accessRecord = readJson('data/p41/access-attempt-record.json');
  const report = readJson('data/p41/yield-report.json');
  const ledger = readJson('data/completeness/local-54-slot-ledger.json');

  // 1. Every family in the tranche has an access-attempt entry, and vice versa.
  const trancheFamilies = new Set(tranche.selected_source_families);
  const recordedFamilies = new Set(accessRecord.attempts.map(a => a.family));
  for (const family of trancheFamilies) {
    if (!recordedFamilies.has(family)) fail(`tranche family "${family}" has no access-attempt entry`);
  }
  for (const family of recordedFamilies) {
    if (!trancheFamilies.has(family)) fail(`access-attempt entry for "${family}" is not one of the tranche's selected families`);
  }

  // 2. Every attempt has at least two independent check methods and a valid conclusion.
  for (const attempt of accessRecord.attempts) {
    if (!Array.isArray(attempt.checks) || attempt.checks.length < 2) {
      fail(`access-attempt for "${attempt.family}" has fewer than 2 checks -- P41 requires independent-method verification, not a single tool call`);
    }
    const methods = new Set(attempt.checks.map(c => c.method));
    if (methods.size < 2) fail(`access-attempt for "${attempt.family}" only used one distinct check method (${[...methods]}) -- needs at least two independent methods`);
    if (!VALID_ATTEMPT_CONCLUSIONS.has(attempt.conclusion)) fail(`access-attempt for "${attempt.family}" has invalid conclusion "${attempt.conclusion}"`);
    for (const group of attempt.reason_groups) {
      if (!tranche.selected_reason_groups.includes(group)) fail(`access-attempt for "${attempt.family}" references reason group "${group}" not in the tranche`);
    }
  }
  for (const group of tranche.selected_reason_groups) {
    const covered = accessRecord.attempts.some(a => a.reason_groups.includes(group));
    if (!covered) fail(`tranche reason group "${group}" has no access-attempt coverage`);
  }

  // 3. Yield report reconciles against the live ledger and the frozen P40 baseline.
  const totalCells = ledger.rows.length;
  const numericCellsNow = ledger.rows.filter(r => r.value !== '').length;
  if (report.current.numeric_evidence_cells !== numericCellsNow) fail('yield report current numeric_evidence_cells does not match the live slot ledger');
  if (report.baseline.numeric_evidence_cells !== tranche.frozen_baseline.numeric_evidence_cells) fail('yield report baseline does not match the frozen P40 tranche baseline');
  const expectedCellGain = numericCellsNow - tranche.frozen_baseline.numeric_evidence_cells;
  if (report.cell_gain !== expectedCellGain) fail(`yield report cell_gain (${report.cell_gain}) does not match the re-derived gain (${expectedCellGain})`);

  // 4. Outcome/roadmap_disposition consistency -- never claim a promotion the report doesn't list.
  if (report.promotion_count !== report.promotions.length) fail('yield report promotion_count does not match promotions.length');
  if (report.promotions.length > 0 && report.outcome !== 'numeric_promotion') fail('yield report has promotions but outcome is not "numeric_promotion"');
  if (report.promotions.length === 0 && report.outcome !== 'zero_yield_blocked') fail('yield report has zero promotions but outcome is not "zero_yield_blocked"');
  if (report.outcome === 'zero_yield_blocked' && report.cell_gain !== 0) fail('yield report claims zero_yield_blocked but cell_gain is non-zero');
  if (report.outcome === 'numeric_promotion' && report.cell_gain <= 0) fail('yield report claims numeric_promotion but cell_gain is not positive');

  console.log(
    `P41_VALIDATE_OK outcome=${report.outcome} cell_gain=${report.cell_gain} ` +
    `attempts=${accessRecord.attempts.length} families_covered=${recordedFamilies.size}`
  );
}

main();
