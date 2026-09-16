#!/usr/bin/env node
// P26 -- Permanent 100% slot-resolution gate.
//
// Re-checks, in one place, the exact acceptance criteria the roadmap authorities declare for
// P26 (ROADMAP.md "Track D" and data-completion-roadmap.json's P26 phase entry):
//   1. resolved slot count equals total governed slot count
//   2. unknown_missing equals zero
//   3. hidden active canonical observations equals zero
//   4. prohibited parent-to-child inherited observations equals zero
//   5. numeric/categorical evidence coverage is reported separately from governed slot resolution
//   6. every non-numeric closure state has an auditable reason
//   7. (operational, not checked here) full Atlas rebuild, validation, P16 audit and Pages
//      deployment pass on the exact completion SHA -- verified by CI running this alongside
//      the rest of `npm test` plus the P16 and Pages workflows on the same push.
//
// Items 1, 2 and 6 are already enforced structurally by scripts/completeness/validate-slot-ledger.mjs
// (every resolved slot with a closure status must carry reason/period_label/source/source_url and
// must never carry a fabricated series_code/observation_id/value). This script re-asserts them at
// the summary level as the single authoritative P26 signal, adds the one check nothing else in the
// repo performs (item 3), and reports item 5's split for the permanent dashboard.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P26 permanent completion gate: ${msg}`); };

const ledger = json('data/completeness/slot-ledger.json');
const summary = json('data/completeness/summary.json');
const cascadeSummary = json('data/completeness/local-indicator-cascade-summary.json');
const geographies = json('data/geography/registry/geographies.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');

// --- 1. resolved slot count equals total governed slot count ---
assert(ledger.rows.length === summary.total_slots, 'ledger row count must match summary total_slots');
assert(summary.resolved_slots === summary.total_slots, `resolved slots (${summary.resolved_slots}) must equal total governed slots (${summary.total_slots}) -- P26 requires zero unresolved`);
assert(summary.unresolved_slots === 0, `unresolved_slots must be zero for P26 acceptance, got ${summary.unresolved_slots}`);

// --- 2. unknown_missing equals zero ---
assert(summary.unknown_missing === 0, `unknown_missing must be zero, got ${summary.unknown_missing}`);

// --- 3. hidden active canonical observations equals zero ---
// A "hidden" observation is a real, current (series.latest_observation_id) value for an
// (indicator_code, geo_code) pair that the ledger has instead closed under a governed-closure
// status (official_unavailable / not_applicable / boundary_unresolved / retired_replaced) --
// i.e. real published data effectively hidden behind a closure state rather than surfaced.
const geoById = new Map(geographies.map(g => [g.geography_id, g]));
const indById = new Map(indicators.map(i => [i.indicator_id, i]));
const latestByKey = new Map(); // "indicatorCode|geoCode" -> Set(observation_id)
for (const s of series) {
  const ind = indById.get(s.indicator_id);
  const geo = geoById.get(s.geography_id);
  if (!ind || !geo || !s.latest_observation_id) continue;
  const key = `${ind.indicator_code}|${geo.geo_code}`;
  if (!latestByKey.has(key)) latestByKey.set(key, new Set());
  latestByKey.get(key).add(s.latest_observation_id);
}
const closureStatuses = new Set(['official_unavailable', 'not_applicable', 'boundary_unresolved', 'retired_replaced']);
const hidden = [];
for (const row of ledger.rows) {
  if (!closureStatuses.has(row.status)) continue;
  const key = `${row.indicator_code}|${row.geo_code}`;
  if (latestByKey.has(key)) hidden.push({ slot_key: row.slot_key, ...Object.fromEntries([[key, [...latestByKey.get(key)]]]) });
}
assert(hidden.length === 0, `${hidden.length} closure-status slot(s) have a real active observation available and are hiding it: ${JSON.stringify(hidden.slice(0, 5))}`);

// --- 4. prohibited parent-to-child inherited observations equals zero ---
assert(cascadeSummary.prohibited_parent_child_inheritance_count === 0, `prohibited parent-to-child inheritance must be zero, got ${cascadeSummary.prohibited_parent_child_inheritance_count}`);
assert(cascadeSummary.constituency_disposition_pct === 100, `constituency disposition coverage of active county indicators must be 100%, got ${cascadeSummary.constituency_disposition_pct}%`);
assert(cascadeSummary.ward_disposition_pct === 100, `ward disposition coverage of active county indicators must be 100%, got ${cascadeSummary.ward_disposition_pct}%`);

// --- 5. numeric/categorical evidence coverage reported separately from governed slot resolution ---
const numericStatuses = new Set(['published_direct', 'published_derived', 'published_modelled', 'external_verified']);
const numericCount = ledger.rows.filter(r => numericStatuses.has(r.status)).length;
const governedClosureCount = ledger.rows.filter(r => closureStatuses.has(r.status)).length;
assert(numericCount + governedClosureCount === summary.total_slots, 'numeric-evidence and governed-closure counts must partition the total governed slot count');

// --- 6. every non-numeric closure state has an auditable reason ---
// (structurally enforced by validate-slot-ledger.mjs already; re-asserted here as the P26 signal)
for (const row of ledger.rows) {
  if (!closureStatuses.has(row.status)) continue;
  assert(typeof row.reason === 'string' && row.reason.length > 0, `${row.slot_key}: closure state missing an auditable reason`);
  assert(row.period_label && row.source && row.source_url, `${row.slot_key}: closure state missing period_label/source/source_url`);
}

const numericPct = Number((100 * numericCount / summary.total_slots).toFixed(2));
const governedPct = Number((100 * governedClosureCount / summary.total_slots).toFixed(2));

console.log(`P26_PERMANENT_COMPLETION_GATE_OK total_slots=${summary.total_slots} resolved=${summary.resolved_slots} unresolved=${summary.unresolved_slots} unknown_missing=${summary.unknown_missing} hidden_active_observations=${hidden.length} prohibited_inheritance=${cascadeSummary.prohibited_parent_child_inheritance_count} constituency_disposition_pct=${cascadeSummary.constituency_disposition_pct} ward_disposition_pct=${cascadeSummary.ward_disposition_pct} numeric_evidence_slots=${numericCount} (${numericPct}%) governed_closure_slots=${governedClosureCount} (${governedPct}%)`);
