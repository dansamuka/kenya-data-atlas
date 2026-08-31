import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const writeJson=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const outPath='data/completeness/p21-work-queue.json';

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

writeJson(outPath,queue);

// Keep the machine-readable programme handoff synchronized with the canonical
// queue after every deterministic rebuild. P21 began with 423 governed slots;
// the live queue, not a frozen tranche count, is the progress authority.
const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p21=(roadmap.phases||[]).find(p=>p.id==='P21');
if(!p21)throw new Error('P21 roadmap phase missing');
const progress=p21.progress||{};
progress.resolved_in_tranche_1=47;
progress.tranche_1_note='Retired/replaced the generic county-dominant-crop placeholder across all 47 counties with stronger fixed-definition maize successors already published in P19.';
if(!familyCounts['IND-WATER-ACCESS']){
  progress.resolved_in_tranche_2=47;
  progress.tranche_2_note='Promoted IND-WATER-ACCESS for all 47 counties from the direct improved-source subtotal in KNBS 2023/24 Kenya Housing Survey Table 5.14. Values are household survey estimates; no lower-level inheritance or fabricated uncertainty is introduced.';
}
if(!familyCounts['IND-EXAM-PERFORMANCE']){
  progress.resolved_in_tranche_3=47;
  progress.tranche_3_note='Retired/replaced the unstable mixed KCPE/KCSE county mean-score placeholder across all 47 counties. KNEC records 2023 as the final KCPE examination; no stable official 47-county mean is manufactured. Existing source-backed attendance, school and teacher indicators remain the governed education successors without being presented as exam-score proxies.';
}
progress.resolved_in_p21=423-queue.remaining_slots;
progress.remaining_slots=queue.remaining_slots;
p21.progress=progress;
p21.status=queue.remaining_slots===0?'complete':'in_progress';
writeJson(roadmapPath,roadmap);

console.log(`P21_WORK_QUEUE_OK slots=${queue.remaining_slots} families=${queue.family_count} resolved=${progress.resolved_in_p21}`);
