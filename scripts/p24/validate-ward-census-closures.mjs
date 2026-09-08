import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P24 ward census closure validation: ${msg}`);};

const contract=json('data/p24/ward-census-closure-contract.json');
const geographies=json('data/geography/registry/geographies.json');
const evidence=json('data/completeness/evidence-states.json');
const ledger=json('data/completeness/slot-ledger.json');
const decisionsDoc=json('data/local-indicator-cascade-decisions.json');

assert(contract.schema_version==='kda.p24.ward-census-closure.v1','unexpected contract schema');
const wards=geographies.filter(g=>g.level==='ward');
assert(wards.length===1450,`expected 1,450 canonical wards, got ${wards.length}`);
const expectedCodes=new Set(wards.map(g=>g.geo_code));
assert(expectedCodes.size===1450,'canonical ward geo_codes must be unique');

const expectedSlotCounts={
  'IND-POPULATION':2900 // rendered on both the overview and people profile tabs
};
for(const decision of contract.decisions||[]){
  const states=(evidence.states||[]).filter(s=>s.contract_id===contract.contract_id&&s.level==='ward'&&s.indicator_code===decision.indicator_code);
  assert(states.length===1,`${decision.indicator_code}: expected one expanded evidence-state record, got ${states.length}`);
  const state=states[0];
  assert(state.status==='official_unavailable',`${decision.indicator_code}: closure must remain official_unavailable`);
  assert(state.reason===decision.reason&&state.period_label===decision.period_label&&state.source===decision.source&&state.source_url===decision.source_url,`${decision.indicator_code}: evidence provenance diverged from contract`);
  const stateCodes=new Set(state.geo_codes||[]);
  assert(stateCodes.size===1450&&[...expectedCodes].every(code=>stateCodes.has(code)),`${decision.indicator_code}: evidence state must cover exactly the canonical 1,450 wards`);

  const rows=ledger.rows.filter(r=>r.level==='ward'&&r.indicator_code===decision.indicator_code);
  assert(rows.length===expectedSlotCounts[decision.indicator_code],`${decision.indicator_code}: expected ${expectedSlotCounts[decision.indicator_code]} rendered slots, got ${rows.length}`);
  assert(rows.every(r=>r.resolved===true&&r.status==='official_unavailable'&&r.completion_phase==='complete'),`${decision.indicator_code}: every rendered occurrence must be governed closed`);
  assert(rows.every(r=>!r.series_code&&!r.observation_id&&(r.value===''||r.value===null||r.value===undefined)),`${decision.indicator_code}: closure must not fabricate series, observations or values`);
  assert(rows.every(r=>r.reason===decision.reason&&r.period_label===decision.period_label&&r.source===decision.source&&r.source_url===decision.source_url),`${decision.indicator_code}: rendered provenance must match contract`);
  // Every unique ward geography must be represented exactly twice (overview + people).
  const byWard=new Map();
  for(const r of rows)byWard.set(r.geo_code,(byWard.get(r.geo_code)||0)+1);
  assert(byWard.size===1450,`${decision.indicator_code}: expected all 1,450 wards represented, got ${byWard.size}`);
  assert([...byWard.values()].every(n=>n===2),`${decision.indicator_code}: every ward must render on exactly two profile tabs`);
}

const coveredRows=ledger.rows.filter(r=>r.level==='ward'&&Object.hasOwn(expectedSlotCounts,r.indicator_code));
assert(coveredRows.length===2900,`expected 2,900 P24 census slot occurrences to be covered, got ${coveredRows.length}`);

const decision=(decisionsDoc.decisions||[]).find(d=>d.indicator_code==='IND-POPULATION'&&d.level==='ward');
assert(decision?.disposition==='governed_unavailable',`local-indicator-cascade decision for IND-POPULATION|ward must remain governed_unavailable, got ${decision?.disposition}`);
assert(String(decision.reason||'').length>=20,'IND-POPULATION|ward cascade decision must carry a substantive reason');

console.log(`P24_WARD_CENSUS_CLOSURES_OK wards=${wards.length} rendered_slots=${coveredRows.length} contract=${contract.contract_id}`);
