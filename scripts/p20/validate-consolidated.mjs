import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 consolidated validation: ${msg}`);};
const summary=j('data/completeness/summary.json');
const ledger=j('data/completeness/slot-ledger.json');
const indicators=['IND-TEENAGE-PREGNANCY','IND-HOME-BIRTH-RATE','IND-DISABILITY-PREVALENCE','IND-CONTRACEPTIVE-USE','IND-FGM-CHILD-MARRIAGE','IND-LITERACY-RATE','IND-HOUSING-MATERIAL'];
try{
  assert(summary.total_slots===20115,`governed slot denominator changed: ${summary.total_slots}`);
  assert(summary.resolved_slots===3197,`expected 3,197 resolved slots, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots===16918,`expected 16,918 unresolved slots, got ${summary.unresolved_slots}`);
  assert(summary.by_completion_phase?.P20===188,`expected 188 P20 slots remaining, got ${summary.by_completion_phase?.P20}`);
  assert(summary.unknown_missing===0,'unknown_missing must remain zero');
  for(const code of indicators){const rows=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code===code);assert(rows.length===47,`${code}: expected 47 governed county rows, got ${rows.length}`);assert(rows.every(r=>r.resolved===true),`${code}: all 47 county rows must resolve`);}
  const p20=ledger.rows.filter(r=>r.completion_phase==='P20'&&!r.resolved);
  const grouped=Object.fromEntries([...new Set(p20.map(r=>r.indicator_code))].sort().map(code=>[code,p20.filter(r=>r.indicator_code===code).length]));
  assert(Object.keys(grouped).length===4,`expected four remaining P20 families, got ${JSON.stringify(grouped)}`);
  assert(Object.values(grouped).every(n=>n===47),`remaining P20 queue must retain whole 47-county families: ${JSON.stringify(grouped)}`);
  for(const code of ['IND-HIV-PREVALENCE','IND-COUNTY-PENDING-BILLS','IND-HEALTH-FACILITY-DENSITY','IND-SUBSTANCE-ABUSE-PREVALENCE']) assert(grouped[code]===47,`${code}: must remain a 47-county unresolved family until its evidence gate is satisfied`);
  console.log(`P20_CONSOLIDATED_COMPLETENESS_OK resolved=${summary.resolved_slots} remaining=${summary.by_completion_phase.P20}`);
  console.log(`P20_CONSOLIDATED_REMAINING_FAMILIES ${JSON.stringify(grouped)}`);
}catch(error){console.error(error.message||error);process.exit(1);}
