import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P23 constituency turnout unavailable validation: ${msg}`); };

const contract = json('data/p23/constituency-turnout-unavailable-contract.json');
const evidence = json('data/completeness/evidence-states.json');
const ledger = json('data/completeness/slot-ledger.json');
const geographies = json('data/geography/registry/geographies.json');

assert(contract.indicator_code === 'IND-TURNOUT-HISTORY' && contract.level === 'constituency', 'contract must target constituency-level IND-TURNOUT-HISTORY');

const constituencyByCode = new Map(geographies.filter(g => g.level === 'constituency').map(g => [g.geo_code, g.name]));

const contractCodes = new Set(contract.decisions.map(d => d.geo_code));
assert(contractCodes.size === contract.decisions.length, 'contract decisions must reference unique constituency geo_codes');

const states = evidence.states || [];
const closureStates = states.filter(s => contract.decisions.some(d => d.contract_id === s.contract_id));
assert(closureStates.length === contract.decisions.length, `expected ${contract.decisions.length} evidence-state entries from this contract, found ${closureStates.length}`);

for (const s of closureStates) {
  assert(s.status === 'official_unavailable', `evidence state ${s.contract_id} must carry status official_unavailable, got ${s.status}`);
  assert(s.level === 'constituency' && s.indicator_code === 'IND-TURNOUT-HISTORY', `evidence state ${s.contract_id} must target constituency IND-TURNOUT-HISTORY`);
  assert(Array.isArray(s.geo_codes) && s.geo_codes.length === 1, `evidence state ${s.contract_id} must carry exactly one geo_code`);
  assert(constituencyByCode.has(s.geo_codes[0]), `evidence state ${s.contract_id} references unknown constituency ${s.geo_codes[0]}`);
  assert(String(s.refresh_trigger || '').length >= 20, `evidence state ${s.contract_id} must carry a substantive refresh_trigger`);
}

// Cross-check against the built slot ledger: every contract geo_code must now resolve
// as official_unavailable / complete for IND-TURNOUT-HISTORY at constituency level.
const rowsByKey = new Map(
  ledger.rows
    .filter(r => r.level === 'constituency' && r.indicator_code === 'IND-TURNOUT-HISTORY')
    .map(r => [r.geo_code, r])
);
let notResolved = [];
for (const geoCode of contractCodes) {
  const row = rowsByKey.get(geoCode);
  if (!row) { notResolved.push(`${geoCode} (missing slot row)`); continue; }
  if (row.status !== 'official_unavailable' || row.resolved !== true || row.completion_phase !== 'complete') {
    notResolved.push(`${geoCode} (status=${row.status} resolved=${row.resolved} phase=${row.completion_phase})`);
  }
}
assert(notResolved.length === 0, `the following contract constituencies are not resolved as official_unavailable in the built slot ledger -- rerun "npm run p23:prepare && npm run completeness:build": ${notResolved.join(', ')}`);

console.log(`P23_CONSTITUENCY_TURNOUT_UNAVAILABLE_VALIDATE_OK decisions=${contract.decisions.length} resolved_in_ledger=${contract.decisions.length - notResolved.length}`);
