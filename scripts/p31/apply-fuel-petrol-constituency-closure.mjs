import fs from 'node:fs';
import path from 'node:path';

// P31: applies the governed constituency-level closure for IND-FUEL-PETROL documented in
// data/p31/fuel-petrol-constituency-closure-contract.json.
//
// EPRA regulates Super Petrol maximum retail prices by a small, named set of pricing towns
// (Petroleum Act 2019 s.101(y) / Legal Notice No. 192 of 2022), never below county level, as
// already established and validated for this Atlas's county-level series (data/sprint1,
// scripts/p28/validate-epra-fuel-provenance.mjs). This P31 review re-verified that structure
// against the live 15 Sep-14 Oct 2026 EPRA pricing cycle rather than assuming the prior cycle
// still applied; see data/p31/source/epra-fuel-constituency-pricing-review.json for the evidence
// trail. dynamic_location_price also does not permit spatial_derivation as a construction method
// (data/policy/local-54-indicator-contract.json), so there is no permitted path from the county
// pricing-town proxy down to constituency. This script renders that decision into
// data/completeness/evidence-states.json so scripts/p29/build-local-54-slot-ledger.mjs resolves
// all 290 constituency slots as an explicit governed_unavailable closure rather than falling
// through to the generic P29 blanket-closure reason.
//
// Idempotent: re-running replaces any prior state recorded under the same contract_id.

const root = process.cwd();
const contractPath = 'data/p31/fuel-petrol-constituency-closure-contract.json';
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
  throw new Error(`P31 fuel constituency closure: expected ${contract.expected_constituencies} unique constituencies, got ${constituencyCodes.length}/${new Set(constituencyCodes).size}`);
}
if (contract.level !== 'constituency') throw new Error('P31 fuel constituency closure: contract level must be constituency');
if (!Array.isArray(contract.decisions) || contract.decisions.length === 0) {
  throw new Error('P31 fuel constituency closure: contract has no decisions');
}

const states = (evidence.states || []).filter(s => s.contract_id !== contract.contract_id);
for (const decision of contract.decisions) {
  if (decision.status !== 'governed_unavailable') {
    throw new Error(`P31 fuel constituency closure: unsupported decision status ${decision.status}`);
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

console.log(`P31_FUEL_PETROL_CONSTITUENCY_CLOSURE_APPLIED constituencies=${constituencyCodes.length} decisions=${contract.decisions.length}`);
