import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 constituency evidence-gap closure validation: ${msg}`);};

const contract=json('data/p23/constituency-evidence-gap-closure-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');

assert(contract.schema_version==='kda.p23.constituency-evidence-gap-closure.v1','unexpected contract schema');
const constituencies=geographies.filter(g=>g.level==='constituency');
assert(constituencies.length===290,`expected 290 constituencies, got ${constituencies.length}`);
const expectedCodes=new Set(constituencies.map(g=>g.geo_code));
assert(expectedCodes.size===290,'constituency geo_codes must be unique');

const codes=new Set(['IND-NG-CDF-UTILIZATION','IND-HEALTH-FACILITY-DENSITY']);
assert((contract.decisions||[]).length===2&&contract.decisions.every(d=>codes.has(d.indicator_code)),'contract must contain exactly the two governed gap decisions');

for(const decision of contract.decisions){
  const states=(evidence.states||[]).filter(s=>s.contract_id===contract.contract_id&&s.level==='constituency'&&s.indicator_code===decision.indicator_code);
  assert(states.length===1,`${decision.indicator_code}: expected one expanded evidence record, got ${states.length}`);
  const state=states[0];
  assert(state.status==='official_unavailable',`${decision.indicator_code}: must remain official_unavailable`);
  const stateCodes=new Set(state.geo_codes||[]);
  assert(stateCodes.size===290&&[...expectedCodes].every(code=>stateCodes.has(code)),`${decision.indicator_code}: must cover canonical 290 constituencies`);
  assert(state.reason===decision.reason&&state.period_label===decision.period_label&&state.source===decision.source&&state.source_url===decision.source_url,`${decision.indicator_code}: provenance diverged from contract`);
  assert(state.evidence_constraint===decision.evidence_constraint&&state.refresh_trigger===decision.refresh_trigger,`${decision.indicator_code}: evidence constraint/refresh trigger diverged`);

  const rows=ledger.rows.filter(r=>r.level==='constituency'&&r.indicator_code===decision.indicator_code);
  assert(rows.length===290,`${decision.indicator_code}: expected 290 rendered slots, got ${rows.length}`);
  assert(rows.every(r=>r.resolved===true&&r.status==='official_unavailable'&&r.completion_phase==='complete'),`${decision.indicator_code}: every slot must be governed closed`);
  assert(rows.every(r=>!r.series_code&&!r.observation_id&&(r.value===''||r.value===null||r.value===undefined)),`${decision.indicator_code}: closure must not fabricate values or observations`);
  assert(rows.every(r=>r.reason===decision.reason&&r.period_label===decision.period_label&&r.source===decision.source&&r.source_url===decision.source_url),`${decision.indicator_code}: rendered provenance mismatch`);
}

const covered=ledger.rows.filter(r=>r.level==='constituency'&&codes.has(r.indicator_code));
assert(covered.length===580,`expected 580 governed rendered slots, got ${covered.length}`);
assert(summary.total_slots===20115,'governed denominator changed');
assert(summary.unknown_missing===0,`unknown_missing=${summary.unknown_missing}`);

const turnoutRows=ledger.rows.filter(r=>r.level==='constituency'&&r.indicator_code==='IND-TURNOUT-HISTORY');
assert(turnoutRows.length===290,`expected 290 constituency turnout slots, got ${turnoutRows.length}`);
const resolvedTurnout=turnoutRows.filter(r=>r.resolved===true);
const unresolvedTurnout=turnoutRows.filter(r=>r.resolved!==true);
assert(resolvedTurnout.length+unresolvedTurnout.length===290,'turnout slot partition changed');
assert(resolvedTurnout.every(r=>r.completion_phase==='complete'&&r.series_code&&r.observation_id&&Number.isFinite(Number(r.value))&&Number(r.value)>=0&&Number(r.value)<=100),'resolved turnout slots must be canonical numeric observations in [0,100]');
assert(unresolvedTurnout.every(r=>r.completion_phase==='P23'&&!r.series_code&&!r.observation_id),'unresolved turnout slots must remain value-free P23 work');
const liveP23=ledger.rows.filter(r=>r.completion_phase==='P23');
assert(liveP23.length===unresolvedTurnout.length&&liveP23.every(r=>r.level==='constituency'&&r.indicator_code==='IND-TURNOUT-HISTORY'),'P23 must contain only unresolved constituency turnout slots');
assert(Number(summary.by_completion_phase?.P23)===unresolvedTurnout.length,`expected turnout-only P23 remainder of ${unresolvedTurnout.length}, got ${summary.by_completion_phase?.P23}`);
console.log(`P23_EVIDENCE_GAP_CLOSURES_OK constituencies=290 rendered_slots=580 turnout_resolved=${resolvedTurnout.length} p23_remaining=${unresolvedTurnout.length} unknown=0 contract=${contract.contract_id}`);
