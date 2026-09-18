import fs from 'node:fs';

const j = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P31 fuel constituency closure validation: ${msg}`); };

const contract = j('data/p31/fuel-petrol-constituency-closure-contract.json');
const evidenceDoc = j('data/p31/source/epra-fuel-constituency-pricing-review.json');
const geographies = j('data/geography/registry/geographies.json');
const evidence = j('data/completeness/evidence-states.json');
const ledger = j('data/completeness/local-54-slot-ledger.json');
const reasonCatalogue = j('data/completeness/local-54-reason-catalogue.json');
const reasonById = new Map(reasonCatalogue.reasons.map(r => [r.reason_id, r]));
const policy = j('data/policy/local-54-indicator-contract.json');

const conGeos = geographies.filter(g => g.level === 'constituency');
assert(conGeos.length === 290 && new Set(conGeos.map(g => g.geo_code)).size === 290, 'canonical constituency count must remain 290 unique geographies');

assert(contract.schema_version === 'kda.p31.fuel-petrol-constituency-closure.v1', 'unexpected contract schema');

// dynamic_location_price must not permit spatial_derivation -- re-assert the policy fact the
// closure reason depends on, so a future policy change is caught rather than silently stale.
const treatment = policy.treatment_classes.dynamic_location_price;
assert(treatment && !treatment.allowed.includes('spatial_derivation'), 'dynamic_location_price must not allow spatial_derivation (closure reasoning depends on this)');

assert(evidenceDoc.fresh_verification_2026_09, 'evidence file must record a fresh re-verification, not only the prior Sprint 1 methodology');
const checks = evidenceDoc.fresh_verification_2026_09.checks || [];
assert(checks.some(c => /epra\.go\.ke/i.test(c.url) && /15th-september-2026-14th-october-2026/.test(c.url)), 'evidence file must cite the live Sep-Oct 2026 EPRA circular, not only the prior Aug-Sep cycle');
assert(checks.some(c => Array.isArray(c.urls) && c.urls.length >= 2), 'evidence file must corroborate the fresh cycle with at least two independent press sources');

const decision = contract.decisions.find(d => d.indicator_code === 'IND-FUEL-PETROL');
assert(decision, 'contract must carry an IND-FUEL-PETROL decision');
assert(decision.status === 'governed_unavailable', 'constituency closure status must be governed_unavailable');
assert(decision.reason && decision.reason.length > 400, 'closure reason must be a substantive, non-boilerplate explanation');
assert(/pricing town/i.test(decision.reason), 'closure reason must cite the pricing-town regulatory structure');
assert(/Legal Notice No\. 192 of 2022/.test(decision.reason), 'closure reason must cite the governing legal notice');

const state = (evidence.states || []).find(s => s.contract_id === contract.contract_id && s.level === 'constituency' && s.indicator_code === 'IND-FUEL-PETROL');
assert(state, 'evidence-states.json must carry the rendered P31 constituency closure (run scripts/p31/apply-fuel-petrol-constituency-closure.mjs)');
assert(state.status === 'governed_unavailable', 'rendered evidence state must be governed_unavailable');
assert(Array.isArray(state.geo_codes) && state.geo_codes.length === 290 && new Set(state.geo_codes).size === 290, 'rendered evidence state must cover exactly the 290 unique constituencies');
const conCodeSet = new Set(conGeos.map(g => g.geo_code));
assert(state.geo_codes.every(c => conCodeSet.has(c)), 'rendered evidence state must only reference canonical constituency geo_codes');

const rows = ledger.rows.filter(r => r.level === 'constituency' && r.indicator_code === 'IND-FUEL-PETROL');
assert(rows.length === 290, `expected 290 rendered constituency fuel-price slots, got ${rows.length}`);
for (const row of rows) {
  assert(row.resolved === true, `${row.geo_code}: constituency slot must resolve`);
  assert(row.status === 'governed_unavailable', `${row.geo_code}: constituency slot must be an explicit governed_unavailable closure, got ${row.status}`);
  assert(!row.series_code && !row.observation_id, `${row.geo_code}: governed closure must not fabricate a series/observation`);
  assert(row.value === '' || row.value === null, `${row.geo_code}: governed closure must not manufacture a value`);
  const reasonEntry = reasonById.get(row.reason_id);
  assert(reasonEntry, `${row.geo_code}: reason_id ${row.reason_id} not found in reason catalogue`);
  assert(reasonEntry.reason === decision.reason, `${row.geo_code}: rendered row reason diverged from the contract decision`);
}

const uniqueConCovered = new Set(rows.map(r => r.geo_code)).size;
assert(uniqueConCovered === 290, `expected all 290 constituencies represented in the ledger for this indicator, got ${uniqueConCovered}`);

// County-level pricing-town proxy series must remain untouched by this constituency-only closure.
const series = j('data/indicators/registry/series.json');
const indicators = j('data/indicators/registry/indicators.json');
const fuelIndicator = indicators.find(i => i.indicator_code === 'IND-FUEL-PETROL');
const countySeries = series.filter(s => s.indicator_id === fuelIndicator.indicator_id && s.geographic_method === 'proxy');
assert(countySeries.length === 45, `expected the existing 45 county-level EPRA pricing-town proxy series to remain untouched, found ${countySeries.length}`);

console.log('P31_FUEL_PETROL_CONSTITUENCY_CLOSURE_OK constituencies=290 status=governed_unavailable inherited=false');
console.log('P31_FUEL_PETROL_CONSTITUENCY_EVIDENCE_OK fresh_cycle_reverified=true county_proxy_series_untouched=45');
