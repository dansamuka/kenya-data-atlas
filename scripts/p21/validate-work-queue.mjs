import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 work-queue validation: ${msg}`);};

const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const queue=json('data/completeness/p21-work-queue.json');
const evidence=json('data/completeness/evidence-states.json');
const taxonomy=json('data/indicators/seed/placeholder-taxonomy.json');

assert(queue.schema_version==='kda.completeness.p21-work-queue.v1','unexpected queue schema');
assert(queue.phase==='P21','queue phase must be P21');
assert((summary.by_completion_phase?.P20||0)===0,'P20 must remain closed before P21 proceeds');

const rows=(ledger.rows||[])
  .filter(row=>row.level==='county'&&row.completion_phase==='P21'&&row.resolved===false)
  .sort((a,b)=>a.slot_key.localeCompare(b.slot_key));
const codes=[...new Set(rows.map(row=>row.indicator_code))].sort();
const familyCounts=Object.fromEntries(codes.map(code=>[
  code,
  rows.filter(row=>row.indicator_code===code).length
]));

assert(queue.remaining_slots===rows.length,`queue remaining_slots=${queue.remaining_slots} but ledger has ${rows.length}`);
assert(queue.remaining_slots===(summary.by_completion_phase?.P21||0),'queue count must match completeness summary P21 count');
assert(queue.family_count===codes.length,`queue family_count=${queue.family_count} but ledger has ${codes.length}`);
assert(JSON.stringify(queue.family_counts)===JSON.stringify(familyCounts),'family counts drifted from canonical ledger');
assert(rows.every(row=>row.status==='planned_unresolved'),'P21 queue must contain only governed planned_unresolved rows');
assert(rows.every(row=>row.tab!=='resilience'),'ASAL resilience rows belong to P22, not P21');
assert(Object.values(familyCounts).every(count=>count>0&&count<=47),'P21 family counts must be positive and no wider than the 47-county universe');

if(!familyCounts['IND-BUSINESS-LICENSES']){
  const countyCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
  const successors=['IND-GCP-CURRENT','IND-AGRICULTURE-GVA','IND-MANUFACTURING-GVA','IND-AGRICULTURE-GCP-SHARE','IND-MANUFACTURING-GCP-SHARE'];
  const closure=(evidence.states||[]).find(s=>s.indicator_code==='IND-BUSINESS-LICENSES'&&s.status==='retired_replaced');
  assert(closure,'business-licence retired/replaced evidence state missing');
  assert(closure.level==='county','business-licence closure level must be county');
  assert(JSON.stringify(closure.geo_codes)===JSON.stringify(countyCodes),'business-licence closure must cover exactly all 47 counties');
  assert(JSON.stringify(closure.successor_indicator_codes)===JSON.stringify(successors),'business-licence successor set drifted');
  assert(closure.reason?.includes('linked KNBS source supports the replacement economic indicators, not a business-licence count'),'business-licence closure must distinguish successor evidence from the retired count');
  const def=(taxonomy.indicators||[]).find(i=>i.code==='IND-BUSINESS-LICENSES');
  assert(def?.status==='retired','business-licence taxonomy lifecycle must remain retired');
  assert(def?.note?.includes('do not interpret those successors as business-licence counts'),'business-licence taxonomy must prohibit proxy interpretation');
}

if(!familyCounts['IND-FACILITY-INFRASTRUCTURE']){
  const countyCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);
  const successors=['IND-HEALTH-FACILITY-STOCK','IND-HEALTH-FACILITY-DENSITY'];
  const closure=(evidence.states||[]).find(s=>s.indicator_code==='IND-FACILITY-INFRASTRUCTURE'&&s.status==='retired_replaced');
  assert(closure,'facility-infrastructure retired/replaced evidence state missing');
  assert(closure.level==='county','facility-infrastructure closure level must be county');
  assert(JSON.stringify(closure.geo_codes)===JSON.stringify(countyCodes),'facility-infrastructure closure must cover exactly all 47 counties');
  assert(JSON.stringify(closure.successor_indicator_codes)===JSON.stringify(successors),'facility-infrastructure successor set drifted');
  assert(closure.reason?.includes('successors measure supply, not electricity/water access'),'facility-infrastructure closure must prohibit proxy interpretation');
  const def=(taxonomy.indicators||[]).find(i=>i.code==='IND-FACILITY-INFRASTRUCTURE');
  assert(def?.status==='retired','facility-infrastructure taxonomy lifecycle must remain retired');
  assert(def?.note?.includes('do not interpret those successors as electricity/water access rates'),'facility-infrastructure taxonomy must prohibit proxy interpretation');
}

console.log(`P21_WORK_QUEUE_VALIDATE_OK slots=${rows.length} families=${codes.length}`);
console.log(`P21_P20_DEPENDENCY_CLOSED_OK p20=${summary.by_completion_phase?.P20||0}`);
