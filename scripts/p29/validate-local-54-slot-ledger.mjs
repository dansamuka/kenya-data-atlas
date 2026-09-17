// P29 -- Validate the complete 54 x local-geography denominator.
//
// Re-checks the roadmap's exact P29 acceptance criteria (data/local-54-completion-roadmap.json):
//   1. 15,660 constituency cells compile (290 geographies x 54 indicators)
//   2. 78,300 ward cells compile (1,450 geographies x 54 indicators)
//   3. 93,960 child-level cells compile (constituency + ward)
//   4. 2,538 county audit cells compile (47 geographies x 54 indicators)
//   5. unknown/unclassified cells equal zero
//   6. disposition (governed closure) and numeric completeness are reported separately
// It also re-derives the ledger deterministically from the canonical registry and asserts every
// row matches -- so a hand-edited or stale ledger fails the same way a missing rebuild would.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = m => { console.error(`P29_LOCAL_54_LEDGER_FAIL ${m}`); process.exitCode = 1; };
const assert = (c, m) => { if (!c) fail(m); };

const ledger = readJson('data/completeness/local-54-slot-ledger.json');
const summary = readJson('data/completeness/local-54-summary.json');
const manifest = readJson('data/completeness/local-54-indicator-manifest.json');
const geographies = readJson('data/geography/registry/geographies.json');
const policy = readJson('data/policy/local-54-indicator-contract.json');
const reasonCatalogue = readJson('data/completeness/local-54-reason-catalogue.json');
const reasonById = new Map(reasonCatalogue.reasons.map(r => [r.reason_id, r]));

assert(ledger.schema_version === 'kda.local-54-slot-ledger.v2', 'ledger schema mismatch');
assert(ledger.rows.length === ledger.expected_cell_instances, `ledger row count ${ledger.rows.length} must equal expected_cell_instances ${ledger.expected_cell_instances}`);

// --- 1-4. exact cell counts ---
assert(summary.constituency_cells === 15660, `constituency cells must equal 15,660, got ${summary.constituency_cells}`);
assert(summary.ward_cells === 78300, `ward cells must equal 78,300, got ${summary.ward_cells}`);
assert(summary.child_level_cells === 93960, `child-level cells must equal 93,960, got ${summary.child_level_cells}`);
assert(summary.county_cells === 2538, `county audit cells must equal 2,538, got ${summary.county_cells}`);
assert(summary.total_cells === 96498, `total cells must equal 96,498, got ${summary.total_cells}`);

// --- 5. unknown/unclassified cells equal zero ---
const numericStatuses = new Set(['published_direct', 'published_derived', 'published_modelled', 'external_verified']);
const closureStatuses = new Set(['official_unavailable', 'governed_unavailable', 'not_applicable', 'boundary_unresolved', 'retired_replaced']);
const unclassified = ledger.rows.filter(r => !numericStatuses.has(r.status) && !closureStatuses.has(r.status));
assert(unclassified.length === 0, `unclassified/unknown cells must equal zero, got ${unclassified.length}: ${JSON.stringify(unclassified.slice(0, 5).map(r => r.slot_key))}`);
assert(summary.unclassified_cells === 0, `summary unclassified_cells must equal zero, got ${summary.unclassified_cells}`);

// --- 6. disposition and numeric completeness reported separately, and partition the total ---
const numericCount = ledger.rows.filter(r => numericStatuses.has(r.status)).length;
const closureCount = ledger.rows.filter(r => closureStatuses.has(r.status)).length;
assert(numericCount + closureCount === ledger.rows.length, 'numeric and governed-closure counts must partition every cell');
assert(summary.numeric_evidence_cells === numericCount, `summary numeric_evidence_cells mismatch: expected ${numericCount}, got ${summary.numeric_evidence_cells}`);
assert(summary.governed_closure_cells === closureCount, `summary governed_closure_cells mismatch: expected ${closureCount}, got ${summary.governed_closure_cells}`);

// Every non-numeric closure state must carry an auditable reason and citation (mirrors P26).
// Closure rows are normalized against the reason catalogue (see build script) rather than
// carrying reason/source/source_url/period_label inline -- resolve reason_id and check there.
for (const row of ledger.rows) {
  if (!closureStatuses.has(row.status)) continue;
  assert(!('reason' in row) && !('source' in row) && !('source_url' in row) && !('period_label' in row), `${row.slot_key}: closure row must not carry denormalized reason fields`);
  const entry = reasonById.get(row.reason_id);
  assert(entry, `${row.slot_key}: reason_id ${row.reason_id} not found in reason catalogue`);
  if (entry) {
    assert(typeof entry.reason === 'string' && entry.reason.length > 0, `${row.slot_key}: closure state missing an auditable reason`);
    assert(entry.period_label && entry.source && entry.source_url, `${row.slot_key}: closure state missing period_label/source/source_url`);
  }
  assert(row.value === '' && row.observation_id === '', `${row.slot_key}: closure state must not carry a fabricated numeric value or observation`);
}
for (const row of ledger.rows) {
  if (numericStatuses.has(row.status)) {
    assert(row.observation_id, `${row.slot_key}: numeric disposition missing observation_id`);
    assert(!('reason_id' in row), `${row.slot_key}: numeric row must not carry a reason_id`);
    assert(typeof row.reason === 'string' && row.reason.length > 0 && row.period_label && row.source && row.source_url, `${row.slot_key}: numeric row missing inline reason/period_label/source/source_url`);
  }
}
assert(reasonCatalogue.reasons.length === new Set(reasonCatalogue.reasons.map(r => r.reason_id)).size, 'duplicate reason_id in reason catalogue');
const usedReasonIds = new Set(ledger.rows.filter(r => closureStatuses.has(r.status)).map(r => r.reason_id));
assert(usedReasonIds.size === reasonCatalogue.reasons.length, `reason catalogue has unused entries: catalogue=${reasonCatalogue.reasons.length} used=${usedReasonIds.size}`);

// --- structural: unique slot keys, valid indicator/geography/treatment-class references ---
const slotKeys = ledger.rows.map(r => r.slot_key);
assert(slotKeys.length === new Set(slotKeys).size, 'duplicate slot_key in ledger');
const codes = new Set(manifest.indicators.map(m => m.indicator_id));
const treatmentByCode = new Map(policy.indicators.map(x => [x.indicator_id, x.treatment_class]));
const geoByCode = new Map(geographies.map(g => [g.geo_code, g]));
for (const row of ledger.rows) {
  assert(codes.has(row.indicator_code), `${row.slot_key}: indicator outside frozen 54: ${row.indicator_code}`);
  assert(treatmentByCode.get(row.indicator_code) === row.treatment_class, `${row.slot_key}: treatment_class mismatch with policy contract`);
  const geo = geoByCode.get(row.geo_code);
  assert(geo && geo.level === row.level, `${row.slot_key}: geography/level mismatch`);
}

// institutional_county_only must be not_applicable below county, and only below county.
for (const row of ledger.rows) {
  if (row.treatment_class === 'institutional_county_only' && row.level !== 'county') {
    assert(row.status === 'not_applicable', `${row.slot_key}: institutional_county_only must be not_applicable below county, got ${row.status}`);
  }
}

// --- deterministic rebuild parity: re-run the build script and diff against the committed outputs ---
execFileSync(process.execPath, ['scripts/p29/build-local-54-slot-ledger.mjs'], { cwd: root, stdio: 'pipe' });
const rebuilt = readJson('data/completeness/local-54-slot-ledger.json');
const rebuiltCatalogue = readJson('data/completeness/local-54-reason-catalogue.json');
assert(JSON.stringify(rebuilt) === JSON.stringify(ledger), 'ledger is not deterministic / not up to date with the canonical registry -- re-run npm run p29:build and commit the result');
assert(JSON.stringify(rebuiltCatalogue) === JSON.stringify(reasonCatalogue), 'reason catalogue is not deterministic / not up to date -- re-run npm run p29:build and commit the result');

if (!process.exitCode) {
  console.log(`P29_LOCAL_54_LEDGER_OK total=${summary.total_cells} county=${summary.county_cells} constituency=${summary.constituency_cells} ward=${summary.ward_cells} child_level=${summary.child_level_cells} unclassified=${unclassified.length} numeric=${numericCount} (${summary.numeric_evidence_pct}%) governed_closure=${closureCount} (${summary.governed_closure_pct}%)`);
}
