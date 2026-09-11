import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const writeJson = async (p, v) => writeFile(path.join(root, p), JSON.stringify(v, null, 2) + '\n');
const assert = (ok, msg) => { if (!ok) throw new Error(`P24 ward voters boundary hold prepare: ${msg}`); };

const contract = await readJson('data/p24/ward-voters-boundary-hold-contract.json');
assert(contract.schema_version === 'kda.p24.ward-voters-boundary-hold.v1', 'unexpected contract schema');
assert(contract.status === 'boundary_unresolved', 'ward voter contract must resolve as boundary_unresolved');

const geographies = await readJson('data/geography/registry/geographies.json');
const held = geographies
  .filter(g => g.level === 'ward' && Number(g.county_code) === contract.county_code && (contract.held_constituency_codes || []).includes(Number(g.constituency_code)))
  .sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
assert(held.length === contract.expected_held_wards, `expected ${contract.expected_held_wards} held wards, got ${held.length}`);
const codes = held.map(w => w.geo_code);
assert(new Set(codes).size === codes.length, 'held ward geo_codes must be unique');

// Cross-check against the audited P23X ward-voter materialisation: these ten
// wards must be exactly the wards that received no published series there,
// so the boundary hold and the ledger closure describe the same ten rows.
const series = await readJson('data/indicators/registry/series.json');
const indicators = await readJson('data/indicators/registry/indicators.json');
const votersIndicator = indicators.find(i => i.indicator_code === contract.indicator_code);
assert(votersIndicator, `${contract.indicator_code}: indicator missing`);
const heldGeographyIds = new Set(held.map(w => w.geography_id));
const publishedForHeld = series.filter(s => s.indicator_id === votersIndicator.indicator_id && heldGeographyIds.has(s.geography_id));
assert(publishedForHeld.length === 0, `${publishedForHeld.length} of the ten Mandera East/Lafey wards unexpectedly already have a published ${contract.indicator_code} series; boundary hold and materialisation have diverged`);

const evidencePath = 'data/completeness/evidence-states.json';
const evidence = await readJson(evidencePath);
const retained = (evidence.states || []).filter(s => s.contract_id !== contract.contract_id);
const generated = {
  contract_id: contract.contract_id,
  level: contract.level,
  geo_codes: codes,
  indicator_code: contract.indicator_code,
  status: contract.status,
  period_label: contract.period_label,
  source: contract.source,
  source_url: contract.source_url,
  as_of: contract.as_of,
  evidence_constraint: contract.evidence_constraint,
  refresh_trigger: contract.refresh_trigger,
  reason: contract.reason
};
evidence.states = [...retained, generated];
await writeJson(evidencePath, evidence);

console.log(`P24_WARD_VOTERS_BOUNDARY_HOLD_PREPARE_OK wards=${codes.length} status=${contract.status} contract=${contract.contract_id}`);
