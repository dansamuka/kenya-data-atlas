import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const write = (p, v) => fs.writeFileSync(path.join(root, p), v);
const writeJson = (p, v) => write(p, JSON.stringify(v, null, 2) + '\n');
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 constituency turnout closure: ${msg}`); };

const contract = json('data/p23/constituency-turnout-unavailable-contract.json');
const geographies = json('data/geography/registry/geographies.json');

assert(contract.indicator_code === 'IND-TURNOUT-HISTORY' && contract.level === 'constituency', 'contract must target constituency-level IND-TURNOUT-HISTORY');
assert(Array.isArray(contract.decisions) && contract.decisions.length === contract.decision_count, 'decision_count must match decisions array length');

const constituencyByCode = new Map(geographies.filter(g => g.level === 'constituency').map(g => [g.geo_code, g.name]));
assert(constituencyByCode.size === 290, `expected 290 canonical constituencies, got ${constituencyByCode.size}`);

const seenCodes = new Set();
for (const d of contract.decisions) {
  assert(constituencyByCode.has(d.geo_code), `decision references unknown constituency geo_code ${d.geo_code}`);
  const canonicalName = constituencyByCode.get(d.geo_code);
  assert(canonicalName.toLowerCase() === String(d.constituency_name || '').toLowerCase(), `constituency_name mismatch for ${d.geo_code}: contract has "${d.constituency_name}", registry has "${canonicalName}"`);
  assert(!seenCodes.has(d.geo_code), `duplicate decision for ${d.geo_code}`);
  seenCodes.add(d.geo_code);
  assert(String(d.reason || '').length >= 20, `reason too short for ${d.geo_code}`);
  assert(String(d.refresh_trigger || '').length >= 20, `refresh_trigger too short for ${d.geo_code}`);
  assert(String(d.evidence_constraint || '').length > 0, `evidence_constraint missing for ${d.geo_code}`);
}

const contractIds = new Set(contract.decisions.map(d => d.contract_id));

const evidencePath = 'data/completeness/evidence-states.json';
const evidence = json(evidencePath);
const retained = (evidence.states || []).filter(s => !contractIds.has(s.contract_id));
for (const d of contract.decisions) {
  retained.push({
    contract_id: d.contract_id,
    level: contract.level,
    indicator_code: contract.indicator_code,
    status: 'official_unavailable',
    geo_codes: [d.geo_code],
    period_label: contract.period_label,
    source: contract.source,
    source_url: contract.source_url,
    as_of: contract.as_of,
    evidence_constraint: d.evidence_constraint,
    refresh_trigger: d.refresh_trigger,
    reason: d.reason
  });
}
evidence.states = retained;
writeJson(evidencePath, evidence);

console.log(`P23_CONSTITUENCY_TURNOUT_UNAVAILABLE_CLOSURE_OK decisions=${contract.decisions.length} indicator=${contract.indicator_code}`);
