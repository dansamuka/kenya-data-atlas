import fs from 'node:fs';
const j=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P20 consolidated validation: ${msg}`);};
const summary=j('data/completeness/summary.json');
const ledger=j('data/completeness/slot-ledger.json');
const numericFamilies=['IND-TEENAGE-PREGNANCY','IND-HOME-BIRTH-RATE','IND-DISABILITY-PREVALENCE','IND-CONTRACEPTIVE-USE','IND-FGM-CHILD-MARRIAGE','IND-LITERACY-RATE','IND-HOUSING-MATERIAL','IND-HIV-PREVALENCE','IND-HEALTH-FACILITY-DENSITY'];
try{
  assert(summary.total_slots===20115,`governed slot denominator changed: ${summary.total_slots}`);
  assert(summary.resolved_slots===3385,`expected 3,385 resolved slots, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots===16730,`expected 16,730 unresolved slots, got ${summary.unresolved_slots}`);
  assert((summary.by_completion_phase?.P20||0)===0,`expected zero P20 slots remaining, got ${summary.by_completion_phase?.P20}`);
  assert(summary.unknown_missing===0,'unknown_missing must remain zero');
  for(const code of numericFamilies){const rows=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code===code);assert(rows.length===47,`${code}: expected 47 governed county rows, got ${rows.length}`);assert(rows.every(r=>r.resolved===true),`${code}: all 47 county rows must resolve`);}
  const pending=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code==='IND-COUNTY-PENDING-BILLS');
  assert(pending.length===47&&pending.every(r=>r.resolved===true),'all 47 pending-bills county slots must resolve');
  assert(pending.filter(r=>r.status==='published_direct').length===46,'pending bills must contain exactly 46 published-direct county values');
  assert(pending.filter(r=>r.status==='official_unavailable'&&r.geo_code==='KEN-C033').length===1,'Narok pending bills must be the single official-unavailable row');
  const substance=ledger.rows.filter(r=>r.level==='county'&&r.indicator_code==='IND-SUBSTANCE-ABUSE-PREVALENCE');
  assert(substance.length===47&&substance.every(r=>r.resolved===true&&r.status==='official_unavailable'),'all 47 substance-use county slots must resolve as official_unavailable');
  assert(ledger.rows.filter(r=>r.status==='official_unavailable').length===48,'explicit official-unavailable inventory must contain 48 governed rows');
  const p20=ledger.rows.filter(r=>r.completion_phase==='P20'&&!r.resolved);
  assert(p20.length===0,`P20 queue must be empty, found ${p20.length}`);
  console.log(`P20_CONSOLIDATED_COMPLETENESS_OK resolved=${summary.resolved_slots} remaining=0`);
  console.log('P20_FINAL_FAMILIES_OK facility_density=47 pending_bills=46+1_unavailable substance=47_unavailable');
  console.log('P20_COMPLETE_OK queue=0');
}catch(error){console.error(error.message||error);process.exit(1);}
