import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const json = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const assert = (ok, msg) => { if (!ok) throw new Error(`P24 ward turnout closure validation: ${msg}`); };

const contract = json('data/p24/ward-turnout-history-unavailable-contract.json');
const evidence = json('data/completeness/evidence-states.json');
const geographies = json('data/geography/registry/geographies.json');
const ledger = json('data/completeness/slot-ledger.json');

assert(contract.governed_slot_count === 1450, 'contract must remain scoped to exactly 1,450 governed ward slots');
assert(Array.isArray(contract.research_log) && contract.research_log.length >= 3, 'contract must retain a research log documenting the sourcing search');
assert(String(contract.refresh_trigger || '').length > 0, 'contract must define a refresh trigger');
assert(String(contract.reason || '').length > 0, 'contract must define a reason');

const wards = geographies.filter(g => g.level === 'ward');
assert(wards.length === 1450, `expected 1,450 canonical wards, got ${wards.length}`);
const canonicalWardCodes = new Set(wards.map(g => g.geo_code));

const state = (evidence.states || []).find(s => s.contract_id === contract.contract_id);
assert(state, 'evidence-states.json must contain the P24 ward turnout closure state');
assert(state.level === 'ward' && state.indicator_code === 'IND-TURNOUT-HISTORY' && state.status === 'official_unavailable', 'closure state must target ward IND-TURNOUT-HISTORY as official_unavailable');
assert(Array.isArray(state.geo_codes) && state.geo_codes.length === 1450, `closure state must cover exactly 1,450 wards, got ${state.geo_codes?.length}`);
assert(new Set(state.geo_codes).size === 1450, 'closure state ward codes must be unique');
for (const code of state.geo_codes) assert(canonicalWardCodes.has(code), `${code}: not a canonical ward geo_code`);
for (const code of canonicalWardCodes) assert(state.geo_codes.includes(code), `${code}: canonical ward missing from closure`);
assert(state.period_label === contract.period_label && state.source === contract.source && state.source_url === contract.source_url, 'closure state provenance must match the contract');
assert(state.as_of === contract.as_of, 'closure state as_of must match the contract');
assert(String(state.evidence_constraint || '').length > 0, 'closure state must retain an evidence constraint');
assert(String(state.refresh_trigger || '').length > 0, 'closure state must retain a refresh trigger');

const wardTurnoutRows = ledger.rows.filter(r => r.level === 'ward' && r.indicator_code === 'IND-TURNOUT-HISTORY');
assert(wardTurnoutRows.length === 1450, `expected 1,450 rendered ward turnout slots, got ${wardTurnoutRows.length}`);
for (const row of wardTurnoutRows) {
  assert(row.resolved === true, `${row.slot_key}: must be resolved`);
  assert(row.status === 'official_unavailable', `${row.slot_key}: must carry status official_unavailable`);
  assert(row.completion_phase === 'complete', `${row.slot_key}: must be marked complete`);
  assert(!row.series_code && !row.observation_id, `${row.slot_key}: governed closure must not fabricate a canonical series/observation`);
  assert(row.value === '' || row.value === null || row.value === undefined, `${row.slot_key}: governed closure must not carry a fabricated numeric value`);
  assert(row.reason === contract.reason, `${row.slot_key}: rendered reason must match the contract`);
  assert(row.source === contract.source && row.source_url === contract.source_url, `${row.slot_key}: rendered provenance must match the contract`);
}

// Never permit an inherited constituency/county turnout value to leak into any ward slot.
for (const row of wardTurnoutRows) {
  assert(row.geographic_method !== 'inherited', `${row.slot_key}: parent inheritance is prohibited`);
}

console.log(`P24_WARD_TURNOUT_CLOSURE_VALIDATE_OK wards=${state.geo_codes.length} rendered_rows=${wardTurnoutRows.length} status=official_unavailable`);
