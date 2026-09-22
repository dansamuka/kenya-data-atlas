// P42 -- validate the planned full Local-54 best-available numeric maximisation contract.
// This validates the phase definition and frozen baseline now; execution outputs are added by P42 itself.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
function fail(message) { console.error('P42_CONTRACT_FAIL ' + message); process.exit(1); }

const contract = readJson('data/p42/numeric-maximisation-contract.json');
const local54 = readJson('data/policy/local-54-indicator-contract.json');
const summary = readJson('data/completeness/local-54-summary.json');

if (contract.phase !== 'P42') fail('phase must be P42');
if (JSON.stringify(contract.depends_on) !== JSON.stringify(['P41'])) fail('P42 must depend on P41');
if (!contract.governing_policy?.unavailable_last_resort) fail('unavailable must be explicitly last resort');
if (!contract.governing_policy?.cannot_close_on_zero_numeric_gain) fail('phase must not close with zero numeric gain');
if (!contract.governing_policy?.official_only_view_must_remain_available) fail('Official/observed-only view requirement is missing');

const indicators = local54.indicators || [];
if (indicators.length !== 54) fail('local-54 contract has ' + indicators.length + ' indicators, expected 54');
if (new Set(indicators.map(r => r.indicator_id)).size !== 54) fail('local-54 indicator IDs are not unique');

const baseline = contract.frozen_pre_p41_baseline;
for (const key of ['total_cells','numeric_evidence_cells','numeric_evidence_pct','governed_closure_cells','governed_closure_pct']) {
  if (baseline[key] !== summary[key]) fail('baseline ' + key + '=' + baseline[key] + ' does not match local-54 summary ' + summary[key]);
}

const requiredMethods = new Set(['direct_or_official_derived','secondary_verified_or_corroborated','spatial_derivation','small_area_estimation','temporal_projection','constrained_downscaling','probable_value_conflict']);
const actualMethods = new Set((contract.method_classes || []).map(m => m.id));
for (const method of requiredMethods) if (!actualMethods.has(method)) fail('missing method class ' + method);
if ((contract.required_indicator_matrix_fields || []).length < 10) fail('indicator matrix is under-specified');
if ((contract.reusable_engines || []).length < 6) fail('reusable engine scope is under-specified');
if ((contract.validation_framework || []).length < 5) fail('validation framework is under-specified');
if ((contract.coverage_kpis || []).find(k => k.id === 'best_available_numeric_coverage') == null) fail('best-available numeric coverage KPI is missing');
if ((contract.acceptance || []).length < 8) fail('P42 acceptance criteria are under-specified');

console.log('P42_CONTRACT_OK indicators=54 methods=' + actualMethods.size + ' engines=' + contract.reusable_engines.length + ' baseline_numeric=' + baseline.numeric_evidence_cells + '/' + baseline.total_cells);
