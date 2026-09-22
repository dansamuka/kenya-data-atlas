// P42 -- build the required 54-indicator x geography (county/constituency/ward) method matrix,
// P42's own first prerequisite output ("Before broad execution, P42 must classify every indicator
// at county, constituency and ward level").
//
// This is a read-only reporting/planning layer over already-governed evidence: P29's slot ledger
// (current disposition per cell), P40's reason-classifications (a genuine barrier reading for
// every closure-reason group), and the local-54 indicator policy's own treatment_class rules
// (what methods a given indicator is actually permitted to use). It creates no numeric values and
// reclassifies nothing in the underlying ledger.
import fs from 'node:fs';
import path from 'node:path';
import { REASON_CLASSIFICATIONS } from '../p40/reason-classifications.mjs';
import { selectMethod } from './method-selection.mjs';

const root = process.cwd();
const AS_OF = process.env.KDA_P42_AS_OF || new Date().toISOString().slice(0, 10);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`P42_MATRIX_BUILD_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const policy = readJson('data/policy/local-54-indicator-contract.json');
  const manifest = readJson('data/completeness/local-54-indicator-manifest.json');
  const ledger = readJson('data/completeness/local-54-slot-ledger.json');
  const catalogue = readJson('data/completeness/local-54-reason-catalogue.json');

  const nameByCode = new Map(manifest.indicators.map(i => [i.indicator_id, { name: i.name, topic: i.topic }]));
  const catalogueById = new Map(catalogue.reasons.map(r => [r.reason_id, r]));

  // Aggregate the 96,498-row slot ledger down to one row per (indicator_code, level) pair.
  const agg = new Map();
  for (const row of ledger.rows) {
    const key = `${row.indicator_code}|${row.level}`;
    if (!agg.has(key)) {
      agg.set(key, { indicator_code: row.indicator_code, level: row.level, total: 0, numeric: 0, statusCounts: {}, reasonIds: new Set() });
    }
    const a = agg.get(key);
    a.total += 1;
    if (row.value !== '') a.numeric += 1;
    a.statusCounts[row.status] = (a.statusCounts[row.status] || 0) + 1;
    if (row.reason_id) a.reasonIds.add(row.reason_id);
  }

  const matrix = [];
  for (const indicatorEntry of policy.indicators) {
    const indicatorId = indicatorEntry.indicator_id;
    const treatmentClass = indicatorEntry.treatment_class;
    const treatmentPolicy = policy.treatment_classes[treatmentClass];
    if (!treatmentPolicy) fail(`indicator ${indicatorId} references unknown treatment_class "${treatmentClass}"`);
    const meta = nameByCode.get(indicatorId) || {};

    for (const level of ['county', 'constituency', 'ward']) {
      const key = `${indicatorId}|${level}`;
      const a = agg.get(key);
      if (!a) fail(`no slot-ledger rows found for ${indicatorId} at ${level}`);

      const currentCoveragePct = Number(((a.numeric / a.total) * 100).toFixed(2));
      const isFullyNumeric = a.numeric === a.total;
      const isFullyNotApplicable = (a.statusCounts.not_applicable || 0) === a.total;
      const isCountyOnlyBelowCounty = treatmentClass === 'institutional_county_only' && level !== 'county';

      let barrierClassification;
      let reasonId = null;
      let source = null;
      let sourceUrl = null;

      if (isFullyNumeric) {
        barrierClassification = 'already_numeric';
      } else if (isCountyOnlyBelowCounty || isFullyNotApplicable) {
        barrierClassification = 'not_applicable';
      } else {
        const reasonIds = [...a.reasonIds];
        if (reasonIds.length !== 1) fail(`${indicatorId}/${level} has ${reasonIds.length} distinct reason_ids, expected exactly 1 (non-binary coverage)`);
        reasonId = reasonIds[0];
        const p40Entry = REASON_CLASSIFICATIONS[reasonId];
        if (!p40Entry) fail(`${indicatorId}/${level} reason_id ${reasonId} is not in the P40 reason-classifications map and is not not_applicable -- P40's addressable portfolio should cover every non-structural closure`);
        barrierClassification = p40Entry.classification;
        const catalogueEntry = catalogueById.get(reasonId);
        source = catalogueEntry?.source || null;
        sourceUrl = catalogueEntry?.source_url || null;
      }

      const selection = selectMethod({ barrierClassification, treatmentClass, allowedStates: treatmentPolicy.allowed });

      matrix.push({
        indicator_id: indicatorId,
        indicator_name: meta.name || null,
        topic: meta.topic || null,
        level,
        treatment_class: treatmentClass,
        applicability: (isCountyOnlyBelowCounty || isFullyNotApplicable) ? 'not_applicable' : 'applicable',
        current_numeric_coverage_cells: a.numeric,
        current_numeric_coverage_total_cells: a.total,
        current_numeric_coverage_pct: currentCoveragePct,
        barrier_classification: barrierClassification,
        reason_id: reasonId,
        candidate_source: source,
        candidate_source_url: sourceUrl,
        preferred_method_class: selection.method_class,
        feasibility_class: selection.feasibility_class,
        rationale: selection.rationale
      });
    }
  }

  const byFeasibility = {};
  const byMethod = {};
  for (const row of matrix) {
    byFeasibility[row.feasibility_class] = (byFeasibility[row.feasibility_class] || 0) + 1;
    const m = row.preferred_method_class || 'none';
    byMethod[m] = (byMethod[m] || 0) + 1;
  }

  const output = {
    schema_version: 'kda.p42.numeric-maximisation-matrix.v1',
    as_of: AS_OF,
    definition: 'The required 54-indicator x geography method matrix (data/p42/numeric-maximisation-contract.json\'s first prerequisite output). Every row is derived mechanically from P29\'s live slot ledger (current disposition), P40\'s individually-justified barrier classification for every closure-reason group, and the local-54 indicator policy\'s own treatment_class rules (what methods this specific indicator is actually permitted to use) -- not a fresh, independent judgement per row. A feasibility_class of C/D means a modelled path is POLICY-PERMITTED and worth designing an engine for; it is not itself a claim that the modelled value has been produced or validated.',
    total_rows: matrix.length,
    by_feasibility_class: byFeasibility,
    by_preferred_method_class: byMethod,
    rows: matrix
  };

  fs.mkdirSync(path.join(root, 'data/p42'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/p42/numeric-maximisation-matrix.json'), JSON.stringify(output, null, 2) + '\n');

  console.log(
    `P42_MATRIX_OK rows=${matrix.length} ` +
    Object.entries(byFeasibility).map(([k, v]) => `${k}=${v}`).join(' ')
  );
}

main();
