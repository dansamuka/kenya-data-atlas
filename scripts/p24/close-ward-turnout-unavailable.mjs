import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const write = (p, v) => fs.writeFileSync(path.join(root, p), v);
const writeJson = (p, v) => write(p, JSON.stringify(v, null, 2) + '\n');
const assert = (ok, msg) => { if (!ok) throw new Error(`P24 ward turnout closure: ${msg}`); };

const contract = json('data/p24/ward-turnout-history-unavailable-contract.json');
const geographies = json('data/geography/registry/geographies.json');

assert(contract.phase === 'P24' && contract.status === 'official_unavailable', 'contract must be an active P24 official_unavailable closure');
assert(contract.indicator_code === 'IND-TURNOUT-HISTORY' && contract.level === 'ward', 'contract must target ward-level IND-TURNOUT-HISTORY');
assert(contract.governed_slot_count === 1450, 'contract governed slot count must remain 1,450');

const wards = geographies.filter(g => g.level === 'ward');
assert(wards.length === 1450, `expected 1,450 canonical wards, got ${wards.length}`);
const codes = wards.map(g => g.geo_code).sort();
assert(new Set(codes).size === 1450, 'ward geo_codes must be unique');

const evidencePath = 'data/completeness/evidence-states.json';
const evidence = json(evidencePath);
const retained = (evidence.states || []).filter(s => s.contract_id !== contract.contract_id);
retained.push({
  contract_id: contract.contract_id,
  level: 'ward',
  indicator_code: contract.indicator_code,
  status: contract.status,
  geo_codes: codes,
  period_label: contract.period_label,
  source: contract.source,
  source_url: contract.source_url,
  as_of: contract.as_of,
  evidence_constraint: contract.evidence_constraint,
  refresh_trigger: contract.refresh_trigger,
  reason: contract.reason
});
evidence.states = retained;
writeJson(evidencePath, evidence);

const roadmapPath = 'data/data-completion-roadmap.json';
const roadmap = json(roadmapPath);
const p24 = (roadmap.phases || []).find(p => p.id === 'P24');
assert(p24, 'P24 roadmap phase missing');
p24.progress = {
  ...(p24.progress || {}),
  ward_turnout_history_closure: {
    indicator_code: 'IND-TURNOUT-HISTORY',
    governed_slots: 1450,
    resolved_total: 1450,
    direct_current_observations: 0,
    evidence_constrained_current_unavailable: 1450,
    remaining_slots_this_family: 0,
    completion_as_of: contract.as_of,
    completion_note: 'All 1,450 ward IND-TURNOUT-HISTORY slots are closed as governed official_unavailable. No ready-made official ward-level turnout aggregate exists; producing real values would require a dedicated Form 34A (re-summed to ward) or Form 36B ward-tally source-verification pipeline of the same class as the P23 Form34B effort, at up to five times the geographic unit count. No constituency value is copied down and no proxy/estimate is used. Each closure carries a refresh trigger for later official supersession.'
  },
  remaining_slots_other_ward_families: 13050 - 1450,
  next_family: 'Remaining P24 ward families (MCA identity, service/facility aggregation, land-area derivation, ward-fund treatment) are unresolved by this closure and require separate, dedicated tranches.'
};
writeJson(roadmapPath, roadmap);

const planPath = 'docs/DATA-COMPLETION-PLAN.md';
let plan = read(planPath);
const marker = '**P24 ward-turnout-history closure';
if (!plan.includes(marker)) {
  plan += `\n\n${marker} — governed_unavailable:** as of **8 September 2026**, all **1,450** ward \`IND-TURNOUT-HISTORY\` slots are closed as governed \`official_unavailable\` rather than forced. Research confirmed no official body (IEBC or otherwise) publishes a single already-aggregated, citable ward-level turnout table; the IEBC Result Forms Portal exposes only individual scanned per-polling-station/per-ward form images (Form 34A, Form 36B), the published registered-voters-per-ward table carries no votes-cast figures, the 2022 Post-Election Evaluation Report is national-level narrative only, and third-party sites re-publish the same raw IEBC form images rather than an independent official aggregate. Constituency-level turnout is already resolved via the source-verified Form 34B pipeline in P23; replicating that same verification-grade extraction at ward granularity (1,450 units, roughly five times the constituency count, against Form 34A or Form 36B source documents) is a distinct, dedicated future programme of comparable-or-greater scope and is not attempted in this session. No constituency turnout value is copied down to any ward, and no registered-voter-share or other proxy estimate is used. Each closure carries an explicit refresh trigger. See \`data/p24/ward-turnout-history-unavailable-contract.json\` for the full research log and reasoning. **Remaining P24 queue after this closure: ${13050 - 1450} slot instances across other ward families.**\n`;
  write(planPath, plan);
}

console.log(`P24_WARD_TURNOUT_CLOSURE_OK wards=${codes.length} indicator=${contract.indicator_code} status=${contract.status}`);
