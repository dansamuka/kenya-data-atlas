import fs from 'node:fs';
import path from 'node:path';

// P24: applies the governed ward-level closure for IND-HEALTH-FACILITY-DENSITY
// documented in data/p24/ward-health-facility-density-closure-contract.json.
//
// The Atlas's stated method for this indicator at ward level is spatial_derivation
// (point-in-polygon facility counts against data/geography/geometry/wards.geojson,
// divided by a ward population denominator). That method was attempted and could
// not be completed defensibly: the designated source (KMHFR) is unreachable from
// the build environment, no genuine alternative official geocoded facility list
// was found, and the ward population denominator does not yet exist either. See
// the contract file for the full evidence trail. This script renders that decision
// into data/completeness/evidence-states.json so scripts/completeness/build-slot-ledger.mjs
// resolves all 1,450 ward slots as an explicit official_unavailable closure rather
// than leaving them silently unresolved.
//
// Idempotent: re-running replaces any prior state recorded under the same contract_id.

const root = process.cwd();
const contractPath = 'data/p24/ward-health-facility-density-closure-contract.json';
const evidencePath = 'data/completeness/evidence-states.json';
const geographiesPath = 'data/geography/registry/geographies.json';

const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const contract = readJson(contractPath);
const geographies = readJson(geographiesPath);
const evidence = readJson(evidencePath);

const wardCodes = geographies
  .filter(g => g.level === 'ward')
  .map(g => g.geo_code)
  .sort((a, b) => a.localeCompare(b));

if (wardCodes.length !== contract.expected_wards || new Set(wardCodes).size !== contract.expected_wards) {
  throw new Error(`P24 ward facility-density closure: expected ${contract.expected_wards} unique wards, got ${wardCodes.length}/${new Set(wardCodes).size}`);
}
if (contract.level !== 'ward') throw new Error('P24 ward facility-density closure: contract level must be ward');
if (!Array.isArray(contract.decisions) || contract.decisions.length === 0) {
  throw new Error('P24 ward facility-density closure: contract has no decisions');
}

const states = (evidence.states || []).filter(s => s.contract_id !== contract.contract_id);
for (const decision of contract.decisions) {
  if (decision.status !== 'official_unavailable') {
    throw new Error(`P24 ward facility-density closure: unsupported decision status ${decision.status}`);
  }
  states.push({
    contract_id: contract.contract_id,
    level: 'ward',
    indicator_code: decision.indicator_code,
    status: decision.status,
    geo_codes: wardCodes,
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

console.log(`P24_WARD_HEALTH_FACILITY_DENSITY_CLOSURE_APPLIED wards=${wardCodes.length} decisions=${contract.decisions.length}`);
