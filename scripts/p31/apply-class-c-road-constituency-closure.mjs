import fs from 'node:fs';
import path from 'node:path';

// P31: applies the governed constituency-level closure for IND-CLASS-C-RURAL-ROAD-LENGTH
// documented in data/p31/class-c-road-constituency-closure-contract.json.
//
// IND-CLASS-C-RURAL-ROAD-LENGTH (treatment_class network_spatial) explicitly permits
// spatial_derivation. A real classified national road-network GIS layer was located,
// downloaded and parsed (World Bank/ESMAP "Kenya - Roads", KRB-attributed), but a
// geometry-intersection reconciliation check against this project's own canonical county
// polygons showed its Class C-coded segments reconcile to only 69.3% of the already-published
// KNBS county totals nationally, with individual county ratios ranging from 29.9% to 6,020% --
// far outside any defensible margin. See data/p31/source/class-c-road-spatial-derivation-attempt.json
// for the full evidence trail and reconciliation table. This script renders that decision into
// data/completeness/evidence-states.json so scripts/p29/build-local-54-slot-ledger.mjs resolves
// all 290 constituency slots as an explicit governed_unavailable closure rather than falling
// through to the generic P29 blanket-closure reason.
//
// Idempotent: re-running replaces any prior state recorded under the same contract_id.

const root = process.cwd();
const contractPath = 'data/p31/class-c-road-constituency-closure-contract.json';
const evidencePath = 'data/completeness/evidence-states.json';
const geographiesPath = 'data/geography/registry/geographies.json';

const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const contract = readJson(contractPath);
const geographies = readJson(geographiesPath);
const evidence = readJson(evidencePath);

const constituencyCodes = geographies
  .filter(g => g.level === 'constituency')
  .map(g => g.geo_code)
  .sort((a, b) => a.localeCompare(b));

if (constituencyCodes.length !== contract.expected_constituencies || new Set(constituencyCodes).size !== contract.expected_constituencies) {
  throw new Error(`P31 class-C road constituency closure: expected ${contract.expected_constituencies} unique constituencies, got ${constituencyCodes.length}/${new Set(constituencyCodes).size}`);
}
if (contract.level !== 'constituency') throw new Error('P31 class-C road constituency closure: contract level must be constituency');
if (!Array.isArray(contract.decisions) || contract.decisions.length === 0) {
  throw new Error('P31 class-C road constituency closure: contract has no decisions');
}

const states = (evidence.states || []).filter(s => s.contract_id !== contract.contract_id);
for (const decision of contract.decisions) {
  if (decision.status !== 'governed_unavailable') {
    throw new Error(`P31 class-C road constituency closure: unsupported decision status ${decision.status}`);
  }
  states.push({
    contract_id: contract.contract_id,
    level: 'constituency',
    indicator_code: decision.indicator_code,
    status: decision.status,
    geo_codes: constituencyCodes,
    period_label: decision.period_label,
    source: decision.source,
    source_url: decision.source_url,
    reason: decision.reason,
    as_of: contract.as_of,
    evidence_constraint: decision.evidence_constraint,
    refresh_trigger: decision.refresh_trigger
  });
}

evidence.states = states;
fs.writeFileSync(path.join(root, evidencePath), JSON.stringify(evidence, null, 2) + '\n');

console.log(`P31_CLASS_C_ROAD_CONSTITUENCY_CLOSURE_APPLIED constituencies=${constituencyCodes.length} decisions=${contract.decisions.length}`);
