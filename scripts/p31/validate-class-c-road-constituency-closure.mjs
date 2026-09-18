import fs from 'node:fs';

const j = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P31 class-C road constituency closure validation: ${msg}`); };

const contract = j('data/p31/class-c-road-constituency-closure-contract.json');
const evidenceDoc = j('data/p31/source/class-c-road-spatial-derivation-attempt.json');
const geographies = j('data/geography/registry/geographies.json');
const evidence = j('data/completeness/evidence-states.json');
const ledger = j('data/completeness/local-54-slot-ledger.json');
const reasonCatalogue = j('data/completeness/local-54-reason-catalogue.json');
const reasonById = new Map(reasonCatalogue.reasons.map(r => [r.reason_id, r]));

const conGeos = geographies.filter(g => g.level === 'constituency');
assert(conGeos.length === 290 && new Set(conGeos.map(g => g.geo_code)).size === 290, 'canonical constituency count must remain 290 unique geographies');

assert(contract.schema_version === 'kda.p31.class-c-road-constituency-closure.v1', 'unexpected contract schema');
assert(contract.attempted_method === 'spatial_derivation', 'contract must record spatial_derivation as the attempted method');
assert(Array.isArray(evidenceDoc.sources_checked) && evidenceDoc.sources_checked.length >= 5, 'evidence file must document a genuine multi-source search');
assert(evidenceDoc.sources_checked.some(s => /krb\.go\.ke|maps\.krb\.go\.ke/i.test(s.url)), 'evidence file must record the KRB Map Portal check');
assert(evidenceDoc.sources_checked.some(s => /energydata\.info/i.test(s.url) && /SHP ZIP/i.test(s.result)), 'evidence file must record the successfully parsed energydata.info SHP ZIP');
assert(evidenceDoc.sources_checked.some(s => /openstreetmap/i.test(s.result)), 'evidence file must record why OpenStreetMap-derived alternatives were rejected as non-official');

const recon = evidenceDoc.reconciliation_test;
assert(recon && typeof recon.result_national === 'string' && /69\.3%/.test(recon.result_national), 'evidence file must record the national reconciliation ratio (69.3%)');
assert(Array.isArray(evidenceDoc.class_c_by_county_reconciliation) && evidenceDoc.class_c_by_county_reconciliation.length === 47, 'evidence file must carry the full 47-county reconciliation table');
for (const row of evidenceDoc.class_c_by_county_reconciliation) {
  assert(Number.isFinite(row.derived_km) && Number.isFinite(row.published_km) && Number.isFinite(row.ratio_pct), `${row.geo_code}: reconciliation row must carry finite derived/published/ratio values`);
}

const decision = contract.decisions.find(d => d.indicator_code === 'IND-CLASS-C-RURAL-ROAD-LENGTH');
assert(decision, 'contract must carry an IND-CLASS-C-RURAL-ROAD-LENGTH decision');
assert(decision.status === 'governed_unavailable', 'constituency closure status must be governed_unavailable');
assert(decision.reason && decision.reason.length > 400, 'closure reason must be a substantive, non-boilerplate explanation');
assert(!/scraper|runner|not yet implemented|todo/i.test(decision.reason), 'closure must not be justified merely by an unfinished scraper/integration');
assert(/69\.3%/.test(decision.reason) && /6,020%/.test(decision.reason), 'closure reason must cite the quantified reconciliation failure');

const state = (evidence.states || []).find(s => s.contract_id === contract.contract_id && s.level === 'constituency' && s.indicator_code === 'IND-CLASS-C-RURAL-ROAD-LENGTH');
assert(state, 'evidence-states.json must carry the rendered P31 constituency closure (run scripts/p31/apply-class-c-road-constituency-closure.mjs)');
assert(state.status === 'governed_unavailable', 'rendered evidence state must be governed_unavailable');
assert(Array.isArray(state.geo_codes) && state.geo_codes.length === 290 && new Set(state.geo_codes).size === 290, 'rendered evidence state must cover exactly the 290 unique constituencies');
const conCodeSet = new Set(conGeos.map(g => g.geo_code));
assert(state.geo_codes.every(c => conCodeSet.has(c)), 'rendered evidence state must only reference canonical constituency geo_codes');

const rows = ledger.rows.filter(r => r.level === 'constituency' && r.indicator_code === 'IND-CLASS-C-RURAL-ROAD-LENGTH');
assert(rows.length === 290, `expected 290 rendered constituency Class-C road slots, got ${rows.length}`);
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

console.log('P31_CLASS_C_ROAD_CONSTITUENCY_CLOSURE_OK constituencies=290 status=governed_unavailable inherited=false');
console.log(`P31_CLASS_C_ROAD_CONSTITUENCY_EVIDENCE_OK sources_checked=${evidenceDoc.sources_checked.length} reconciliation_national_pct=69.3 reconciliation_county_rows=${evidenceDoc.class_c_by_county_reconciliation.length}`);
