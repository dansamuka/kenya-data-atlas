// P41 -- build the honest before/after numeric-yield report for this execution cycle.
//
// Per data/post-p35-closure-roadmap.json's own P41 closure gate: "If all selected opportunities
// remain blocked, P41 stays open... it does not close another zero-yield research cycle as
// numeric progress." This script does not fabricate a promotion to satisfy that gate -- it
// reports the real outcome (0 promotions, this cycle) exactly as required by the gate's own
// separate rule that "the exact cell and percentage-point gain is reported", which applies
// whether that gain is positive or zero.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const AS_OF = process.env.KDA_P41_AS_OF || new Date().toISOString().slice(0, 10);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`P41_YIELD_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const tranche = readJson('data/p40/p41-tranche-contract.json');
  const accessRecord = readJson('data/p41/access-attempt-record.json');
  const ledger = readJson('data/completeness/local-54-slot-ledger.json');

  const totalCells = ledger.rows.length;
  const numericCellsNow = ledger.rows.filter(r => r.value !== '').length;

  if (numericCellsNow !== tranche.frozen_baseline.numeric_evidence_cells) {
    fail(
      `live numeric cell count (${numericCellsNow}) differs from the frozen P40 baseline ` +
      `(${tranche.frozen_baseline.numeric_evidence_cells}) -- either a promotion landed outside ` +
      `this script's tracking, or the baseline needs re-freezing before this report can be trusted`
    );
  }

  const promotions = [];
  const cellGain = numericCellsNow - tranche.frozen_baseline.numeric_evidence_cells;
  const pctGain = Number(((numericCellsNow / totalCells) * 100 - tranche.frozen_baseline.numeric_evidence_pct).toFixed(2));

  const allBlocked = accessRecord.attempts.every(a => a.conclusion === 'still_pending' || a.conclusion === 'unreachable');

  const report = {
    schema_version: 'kda.p41.yield-report.v1',
    as_of: AS_OF,
    tranche_reference: 'data/p40/p41-tranche-contract.json',
    access_attempt_reference: 'data/p41/access-attempt-record.json',
    baseline: tranche.frozen_baseline,
    current: {
      numeric_evidence_cells: numericCellsNow,
      numeric_evidence_pct: Number(((numericCellsNow / totalCells) * 100).toFixed(2))
    },
    cell_gain: cellGain,
    percentage_point_gain: pctGain,
    promotions,
    promotion_count: promotions.length,
    all_selected_opportunities_blocked: allBlocked,
    outcome: promotions.length > 0 ? 'numeric_promotion' : 'zero_yield_blocked',
    roadmap_disposition: promotions.length > 0
      ? 'P41 closure gate met: at least one selected opportunity produced a defensible numeric promotion.'
      : 'Per the roadmap\'s own P41 closure gate: all selected opportunities remain blocked (see data/p41/access-attempt-record.json for the dated, two-method-verified evidence), so P41 stays open rather than closing as a zero-yield cycle. The programme returns to P40 to consider a replacement tranche -- see access-attempt-record.json\'s auxiliary_due_diligence_checks for a flagged candidate (KeNADA, statistics.knbs.or.ke/nada) not yet investigated deeply enough to select.'
  };

  fs.mkdirSync(path.join(root, 'data/p41'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/p41/yield-report.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`P41_YIELD_OK outcome=${report.outcome} cell_gain=${cellGain} pct_gain=${pctGain} promotions=${promotions.length}`);
}

main();
