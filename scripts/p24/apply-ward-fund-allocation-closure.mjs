import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const writeJson = async (p, v) => writeFile(path.join(root, p), JSON.stringify(v, null, 2) + '\n');
const assert = (ok, msg) => { if (!ok) throw new Error(`P24 ward-fund closure prepare: ${msg}`); };

const contract = await readJson('data/p24/ward-fund-allocation-closure-contract.json');
assert(contract.schema_version === 'kda.p24.ward-fund-allocation-closure.v1', 'unexpected contract schema');
assert(contract.status === 'not_applicable', 'ward-fund contract must resolve as not_applicable');

const geographies = await readJson('data/geography/registry/geographies.json');
const wards = geographies.filter(g => g.level === 'ward').sort((a, b) => a.geo_code.localeCompare(b.geo_code));
assert(wards.length === contract.expected_wards, `expected ${contract.expected_wards} canonical wards, got ${wards.length}`);
const codes = wards.map(w => w.geo_code);
assert(new Set(codes).size === codes.length, 'ward geo_codes must be unique');

const evidencePath = 'data/completeness/evidence-states.json';
const evidence = await readJson(evidencePath);
evidence.definition = 'Explicit resolved states for governed public slots where primary official evidence establishes that the requested observation is unavailable, where a governed phase decision retires/replaces a weak placeholder, where research establishes that no uniform officially comparable programme exists for the indicator concept (not applicable), or where an authoritative child geometry cannot yet be safely and uniquely matched to source data (boundary unresolved). P22 time-sensitive closures may also resolve a snapshot when the exact current county observation is unavailable under explicit freshness, geography or measure-definition contracts. These states never manufacture a zero, proxy, regional inheritance or synthetic observation.';

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

// Align the indicator's own placeholder-taxonomy metadata with the finding: a
// primary source landscape was reviewed (NG-CDF Act, county Ward Fund Acts,
// the pending County Wards Bill) and it does not support one governed
// national ward-fund series, so the indicator stays inactive but moves from
// "planned" (no review yet) to "sourced" (reviewed; no defensible series).
const taxonomyPath = 'data/indicators/seed/placeholder-taxonomy.json';
const taxonomy = await readJson(taxonomyPath);
const def = (taxonomy.indicators || []).find(i => i.code === contract.indicator_code);
assert(def, `${contract.indicator_code}: placeholder-taxonomy definition missing`);
def.status = 'sourced';
def.source = 'NG-CDF Act, 2015 (as amended); non-uniform county Ward Development Fund legislation; County Wards (Equitable Development) Bill, 2024 (not enacted)';
def.source_url = contract.source_url;
def.note = 'No uniform official national ward-fund programme exists (NG-CDF is constituency-level; county Ward Development Funds are ad hoc and non-uniform; the County Wards (Equitable Development) Bill is not enacted). Closed not_applicable under data/p24/ward-fund-allocation-closure-contract.json rather than divided from a county/constituency total.';
await writeJson(taxonomyPath, taxonomy);

console.log(`P24_WARD_FUND_CLOSURE_PREPARE_OK wards=${codes.length} status=${contract.status} contract=${contract.contract_id}`);
