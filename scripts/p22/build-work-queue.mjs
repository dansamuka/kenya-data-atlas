import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const writeJson=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');

const ledger=readJson('data/completeness/slot-ledger.json');
const rows=(ledger.rows||[])
  .filter(row=>row.level==='county'&&row.completion_phase==='P22'&&row.resolved===false)
  .sort((a,b)=>a.slot_key.localeCompare(b.slot_key));
const codes=[...new Set(rows.map(row=>row.indicator_code))].sort();
const familyCounts=Object.fromEntries(codes.map(code=>[code,rows.filter(row=>row.indicator_code===code).length]));
const queue={
  schema_version:'kda.completeness.p22-work-queue.v1',
  phase:'P22',
  definition:'Executable queue for unresolved whole-county ASAL resilience slots assigned to P22. The canonical slot ledger is authoritative; explicit freshness/geography/measure evidence states remove rows from this queue without manufacturing values.',
  source_ledger:'data/completeness/slot-ledger.json',
  remaining_slots:rows.length,
  family_count:codes.length,
  family_counts:familyCounts
};
writeJson('data/completeness/p22-work-queue.json',queue);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p22=(roadmap.phases||[]).find(p=>p.id==='P22');
if(!p22)throw new Error('P22 roadmap phase missing');
p22.progress={...(p22.progress||{}),remaining_slots:queue.remaining_slots};
p22.status=queue.remaining_slots===0?'complete':'in_progress';
writeJson(roadmapPath,roadmap);

console.log(`P22_WORK_QUEUE_OK slots=${queue.remaining_slots} families=${queue.family_count}`);
