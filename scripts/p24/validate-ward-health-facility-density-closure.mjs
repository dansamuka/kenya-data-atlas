import fs from 'node:fs';

const j = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P24 ward facility-density closure validation: ${msg}`); };

const contract = j('data/p24/ward-health-facility-density-closure-contract.json');
const geographies = j('data/geography/registry/geographies.json');
const evidence = j('data/completeness/evidence-states.json');
const ledger = j('data/completeness/slot-ledger.json');
const summary = j('data/completeness/summary.json');

const wardGeos = geographies.filter(g => g.level === 'ward');
assert(wardGeos.length === 1450 && new Set(wardGeos.map(g => g.geo_code)).size === 1450, 'canonical ward count must remain 1,450 unique geographies');

assert(contract.schema_version === 'kda.p24.ward-health-facility-density-closure.v1', 'unexpected contract schema');
assert(contract.attempted_method === 'spatial_derivation', 'contract must record spatial_derivation as the attempted method');
assert(Array.isArray(contract.sources_attempted) && contract.sources_attempted.length >= 3, 'contract must document a genuine multi-source search, not a single unfinished attempt');
assert(contract.sources_attempted.some(s => /kmhfr/i.test(s.url) && /unreachable/i.test(s.result)), 'contract must record the KMHFR access attempt and its result');
assert(contract.sources_attempted.some(s => /openstreetmap|osm/i.test(s.result)), 'contract must record why OpenStreetMap-derived alternatives were rejected as non-official');

const decision = contract.decisions.find(d => d.indicator_code === 'IND-HEALTH-FACILITY-DENSITY');
assert(decision, 'contract must carry an IND-HEALTH-FACILITY-DENSITY decision');
assert(decision.status === 'official_unavailable', 'ward closure status must be official_unavailable');
assert(decision.reason && decision.reason.length > 200, 'closure reason must be a substantive, non-boilerplate explanation');
assert(!/scraper|runner|not yet implemented|todo/i.test(decision.reason), 'closure must not be justified merely by an unfinished scraper/integration');

const state = (evidence.states || []).find(s => s.contract_id === contract.contract_id && s.level === 'ward' && s.indicator_code === 'IND-HEALTH-FACILITY-DENSITY');
assert(state, 'evidence-states.json must carry the rendered P24 ward closure (run scripts/p24/apply-ward-health-facility-density-closure.mjs)');
assert(state.status === 'official_unavailable', 'rendered evidence state must be official_unavailable');
assert(Array.isArray(state.geo_codes) && state.geo_codes.length === 1450 && new Set(state.geo_codes).size === 1450, 'rendered evidence state must cover exactly the 1,450 unique wards');
const wardCodeSet = new Set(wardGeos.map(g => g.geo_code));
assert(state.geo_codes.every(c => wardCodeSet.has(c)), 'rendered evidence state must only reference canonical ward geo_codes');

const rows = ledger.rows.filter(r => r.level === 'ward' && r.indicator_code === 'IND-HEALTH-FACILITY-DENSITY');
assert(rows.length === 1450, `expected 1,450 rendered ward density slots, got ${rows.length}`);
for (const row of rows) {
  assert(row.resolved === true, `${row.geo_code}: ward density slot must resolve`);
  assert(row.completion_phase === 'complete', `${row.geo_code}: resolved ward density slot must be marked complete`);
  assert(row.status === 'official_unavailable', `${row.geo_code}: ward density slot must be an explicit official_unavailable closure, got ${row.status}`);
  assert(row.geographic_method !== 'inherited' && row.status !== 'inherited', `${row.geo_code}: county/constituency density must not be inherited to ward`);
  assert(!row.series_code && !row.observation_id, `${row.geo_code}: governed closure must not fabricate a series/observation`);
  assert(row.value === '' || row.value === null, `${row.geo_code}: governed closure must not manufacture a value`);
  assert(row.reason === decision.reason && row.source === decision.source && row.source_url === decision.source_url && row.period_label === decision.period_label, `${row.geo_code}: rendered row provenance diverged from the contract decision`);
}

const uniqueWardsCovered = new Set(rows.map(r => r.geo_code)).size;
assert(uniqueWardsCovered === 1450, `expected all 1,450 wards represented in the ledger for this indicator, got ${uniqueWardsCovered}`);

assert((summary.by_level?.ward || 0) >= 1450, 'ward slot summary must still include the density slots');

console.log('P24_WARD_HEALTH_FACILITY_DENSITY_CLOSURE_OK wards=1450 status=official_unavailable inherited=false');
console.log(`P24_WARD_HEALTH_FACILITY_DENSITY_EVIDENCE_OK sources_attempted=${contract.sources_attempted.length} kmhfr_reachable=false official_geocoded_alternative_found=false`);
