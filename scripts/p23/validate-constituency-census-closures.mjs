import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P23 constituency census closure validation: ${msg}`);};

const contract=json('data/p23/constituency-census-closure-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');

assert(contract.schema_version==='kda.p23.constituency-census-closure.v1','unexpected contract schema');
const constituencies=geographies.filter(g=>g.level==='constituency');
assert(constituencies.length===290,`expected 290 canonical constituencies, got ${constituencies.length}`);
const expectedCodes=new Set(constituencies.map(g=>g.geo_code));
assert(expectedCodes.size===290,'canonical constituency geo_codes must be unique');

const expectedSlotCounts={
  'IND-POPULATION':580,
  'IND-HOUSEHOLD-SIZE':290
};
for(const decision of contract.decisions||[]){
  const states=(evidence.states||[]).filter(s=>s.contract_id===contract.contract_id&&s.level==='constituency'&&s.indicator_code===decision.indicator_code);
  assert(states.length===1,`${decision.indicator_code}: expected one expanded evidence-state record, got ${states.length}`);
  const state=states[0];
  assert(state.status==='official_unavailable',`${decision.indicator_code}: closure must remain official_unavailable`);
  assert(state.reason===decision.reason&&state.period_label===decision.period_label&&state.source===decision.source&&state.source_url===decision.source_url,`${decision.indicator_code}: evidence provenance diverged from contract`);
  const stateCodes=new Set(state.geo_codes||[]);
  assert(stateCodes.size===290&&[...expectedCodes].every(code=>stateCodes.has(code)),`${decision.indicator_code}: evidence state must cover exactly the canonical 290 constituencies`);

  const rows=ledger.rows.filter(r=>r.level==='constituency'&&r.indicator_code===decision.indicator_code);
  assert(rows.length===expectedSlotCounts[decision.indicator_code],`${decision.indicator_code}: expected ${expectedSlotCounts[decision.indicator_code]} rendered slots, got ${rows.length}`);
  assert(rows.every(r=>r.resolved===true&&r.status==='official_unavailable'&&r.completion_phase==='complete'),`${decision.indicator_code}: every rendered occurrence must be governed closed`);
  assert(rows.every(r=>!r.series_code&&!r.observation_id&&(r.value===''||r.value===null||r.value===undefined)),`${decision.indicator_code}: closure must not fabricate series, observations or values`);
  assert(rows.every(r=>r.reason===decision.reason&&r.period_label===decision.period_label&&r.source===decision.source&&r.source_url===decision.source_url),`${decision.indicator_code}: rendered provenance must match contract`);
}

const coveredRows=ledger.rows.filter(r=>r.level==='constituency'&&Object.hasOwn(expectedSlotCounts,r.indicator_code));
assert(coveredRows.length===870,`expected 870 P23 census slot occurrences to be covered, got ${coveredRows.length}`);
console.log(`P23_CONSTITUENCY_CENSUS_CLOSURES_OK constituencies=${constituencies.length} rendered_slots=${coveredRows.length} contract=${contract.contract_id}`);
