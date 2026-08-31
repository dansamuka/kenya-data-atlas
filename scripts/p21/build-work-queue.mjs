import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const outPath=path.join(root,'data/completeness/p21-work-queue.json');

const ledger=readJson('data/completeness/slot-ledger.json');
const rows=(ledger.rows||[])
  .filter(row=>row.level==='county'&&row.completion_phase==='P21'&&row.resolved===false)
  .sort((a,b)=>a.slot_key.localeCompare(b.slot_key));

const codes=[...new Set(rows.map(row=>row.indicator_code))].sort();
const familyCounts=Object.fromEntries(codes.map(code=>[
  code,
  rows.filter(row=>row.indicator_code===code).length
]));

const queue={
  schema_version:'kda.completeness.p21-work-queue.v1',
  phase:'P21',
  definition:'Executable aggregate queue for unresolved county slots assigned to P21. The canonical slot ledger remains the row-level authority; this file groups that queue by indicator family so source, derivation, replacement and retirement work can be completed without maintaining a second manual list.',
  source_ledger:'data/completeness/slot-ledger.json',
  queue_filter:{
    level:'county',
    completion_phase:'P21',
    resolved:false
  },
  remaining_slots:rows.length,
  family_count:codes.length,
  family_counts:familyCounts
};

fs.writeFileSync(outPath,JSON.stringify(queue,null,2)+'\n');
console.log(`P21_WORK_QUEUE_OK slots=${queue.remaining_slots} families=${queue.family_count}`);
