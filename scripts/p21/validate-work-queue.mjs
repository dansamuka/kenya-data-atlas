import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 work-queue validation: ${msg}`);};

const ledger=json('data/completeness/slot-ledger.json');
const summary=json('data/completeness/summary.json');
const queue=json('data/completeness/p21-work-queue.json');

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

console.log(`P21_WORK_QUEUE_VALIDATE_OK slots=${rows.length} families=${codes.length}`);
console.log(`P21_P20_DEPENDENCY_CLOSED_OK p20=${summary.by_completion_phase?.P20||0}`);
