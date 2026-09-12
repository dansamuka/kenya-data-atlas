import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = (message) => {
  console.error(`P27_LOCAL_54_FAIL ${message}`);
  process.exitCode = 1;
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const unique = (values) => [...new Set(values)];
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

const manifest = readJson('data/completeness/local-54-indicator-manifest.json');
const migration = readJson('data/completeness/local-54-migration-map.json');
const contract = readJson('data/policy/local-54-indicator-contract.json');
const sourceGovernance = readJson('data/local-54-source-governance-contract.json');
const legacyContract = readJson('data/local-indicator-cascade-contract.json');
const registry = readJson('data/indicators/registry/indicators.json');
const cascade = readJson('data/completeness/local-indicator-cascade.json');

const manifestIds = manifest.indicators.map((d) => d.indicator_id);
const contractIds = contract.indicators.map((d) => d.indicator_id);
const cascadeIds = unique(cascade.rows.map((d) => d.indicator_code)).sort();
const manifestSorted = [...manifestIds].sort();
const contractSorted = [...contractIds].sort();

assert(manifest.indicator_count === 54, `manifest indicator_count=${manifest.indicator_count}, expected 54`);
assert(manifestIds.length === 54, `manifest rows=${manifestIds.length}, expected 54`);
assert(unique(manifestIds).length === 54, 'manifest contains duplicate indicator IDs');
assert(contract.indicators.length === 54, `contract rows=${contract.indicators.length}, expected 54`);
assert(unique(contractIds).length === 54, 'contract contains duplicate indicator IDs');
assert(cascadeIds.length === 54, `current cascade unique indicators=${cascadeIds.length}, expected 54`);
assert(sameSet(manifestSorted, cascadeIds), 'manifest IDs do not exactly match the current active county cascade IDs');
assert(sameSet(contractSorted, manifestSorted), 'P27 policy contract IDs do not exactly match the frozen manifest IDs');

assert(migration.from?.unique_indicator_slots === 49, 'migration map must preserve the historical P18 count of 49');
assert(migration.to?.active_county_cascade_indicators === 54, 'migration map current active county cascade count must equal 54');
assert(migration.reconciliation_rule?.includes('Do not infer'), 'migration map must prohibit invented 49+5 lineage');

const registryByCode = new Map();
for (const item of registry) {
  if (!registryByCode.has(item.indicator_code)) registryByCode.set(item.indicator_code, []);
  registryByCode.get(item.indicator_code).push(item);
}

for (const code of manifestIds) {
  const matches = registryByCode.get(code) || [];
  assert(matches.length === 1, `${code} has ${matches.length} canonical registry matches, expected 1`);
  if (matches.length !== 1) continue;
  const item = matches[0];
  assert(item.active === true, `${code} is not active in canonical registry`);
  assert(item.lifecycle_status === 'active', `${code} lifecycle_status=${item.lifecycle_status}, expected active`);
  assert(typeof item.description === 'string' && item.description.trim().length > 0, `${code} missing canonical description`);
  assert(typeof item.unit_id === 'string' && item.unit_id.length > 0, `${code} missing unit_id`);
  assert(typeof item.preferred_frequency === 'string' && item.preferred_frequency.length > 0, `${code} missing preferred_frequency`);
  assert(typeof item.ranking_allowed === 'boolean', `${code} missing boolean ranking_allowed`);
  assert(typeof item.requires_sampling_uncertainty === 'boolean', `${code} missing boolean requires_sampling_uncertainty`);
}

for (const entry of contract.indicators) {
  const treatment = contract.treatment_classes[entry.treatment_class];
  assert(Boolean(treatment), `${entry.indicator_id} references unknown treatment class ${entry.treatment_class}`);
  if (treatment) {
    assert(Array.isArray(treatment.allowed) && treatment.allowed.length > 0, `${entry.treatment_class} has no allowed methods`);
    assert(Array.isArray(treatment.conditions) && treatment.conditions.length > 0, `${entry.treatment_class} has no conditions`);
  }
}

const validLevels = new Set(['constituency', 'ward']);
const rowsByIndicator = new Map();
for (const row of cascade.rows) {
  if (!rowsByIndicator.has(row.indicator_code)) rowsByIndicator.set(row.indicator_code, []);
  rowsByIndicator.get(row.indicator_code).push(row);
  assert(validLevels.has(row.level), `legacy cascade contains unexpected level=${row.level} for ${row.indicator_code}`);
  assert((row.inherited_records ?? 0) === 0, `${row.indicator_code}/${row.level} contains inherited_records=${row.inherited_records}`);
}
for (const code of manifestIds) {
  const rows = rowsByIndicator.get(code) || [];
  const levels = rows.map((d) => d.level).sort();
  assert(rows.length === 2, `${code} has ${rows.length} legacy cascade rows, expected 2`);
  assert(levels.join(',') === 'constituency,ward', `${code} legacy cascade levels=${levels.join(',')}, expected constituency,ward`);
}

assert(legacyContract.schema_version === 'kda.local-indicator-cascade.v1', `legacy cascade contract schema changed to ${legacyContract.schema_version}`);
assert(JSON.stringify(legacyContract.levels) === JSON.stringify(['constituency', 'ward']), 'legacy P18–P26 cascade levels must remain constituency+ward only');

const tierIds = sourceGovernance.source_tiers.map((d) => d.id);
const expectedTiers = [
  'S0_direct_primary_official',
  'S1_derived_from_primary_official',
  'S2_secondary_verified_to_identifiable_primary',
  'S3_secondary_corroborated_independent',
  'S4_probable_value_conflicting_sources',
  'S5_transparent_modelled_or_spatial_estimate',
  'S6_governed_unavailable',
  'S7_not_applicable'
];
assert(JSON.stringify(tierIds) === JSON.stringify(expectedTiers), 'source-governance S0–S7 tier sequence is incomplete or reordered');
assert(sourceGovernance.publication_presumption?.includes('Prefer representation'), 'representation-first publication presumption is missing');
assert(sourceGovernance.successor_acceptance?.indicator_contract_count === 54, 'source governance acceptance must require 54 indicators');
assert(sourceGovernance.successor_acceptance?.legacy_preferred_observations_audited_pct === 100, 'P28A legacy preferred-observation audit must be 100%');
assert(sourceGovernance.successor_acceptance?.legacy_unavailable_states_reviewed_pct === 100, 'P28A legacy unavailable-state audit must be 100%');
assert(sourceGovernance.successor_acceptance?.unlabelled_secondary_count === 0, 'unlabelled secondary acceptance must be zero');

if (!process.exitCode) {
  console.log(`P27_LOCAL_54_OK indicators=${manifestIds.length} cascade_decisions=${cascade.rows.length} source_tiers=${tierIds.length} inherited=0`);
}
