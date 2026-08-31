import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 water access prepare: ${msg}`);};

const CODE='IND-WATER-ACCESS';
const SOURCE='KNBS 2023/24 Kenya Housing Survey, Table 5.14';
const SOURCE_URL='https://www.knbs.or.ke/reports/2023-24-kenya-housing-survey-basic-report/';

const taxonomyPath='data/indicators/seed/placeholder-taxonomy.json';
const taxonomy=json(taxonomyPath);
const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def,`${CODE} missing from placeholder taxonomy`);
Object.assign(def,{
  status:'sourced',source:SOURCE,source_url:SOURCE_URL,
  note:'Published directly for all 47 counties in KNBS 2023/24 Kenya Housing Survey Table 5.14 as the improved-source subtotal for households. P21 promotes the direct county survey estimates; no parent geography is inherited and ranking remains withheld because standard errors/confidence intervals are not fabricated.'
});
writeJson(taxonomyPath,taxonomy);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=json(roadmapPath);
const p21=roadmap.phases.find(p=>p.id==='P21');
assert(p21,'P21 roadmap phase missing');
p21.status='in_progress';
p21.progress={
  resolved_in_tranche_1:47,
  resolved_in_tranche_2:47,
  resolved_in_p21:94,
  remaining_slots:329,
  tranche_1_note:'Retired/replaced the generic county-dominant-crop placeholder across all 47 counties with stronger fixed-definition maize successors already published in P19.',
  tranche_2_note:'Promoted IND-WATER-ACCESS for all 47 counties from the direct improved-source subtotal in KNBS 2023/24 Kenya Housing Survey Table 5.14. Values are household survey estimates; no lower-level inheritance or fabricated uncertainty is introduced.'
};
writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
const anchor='**Remaining queue after tranche 1:** **376** across eight 47-county families.';
const replacement='**P21 tranche 2 — improved drinking-water access:** 47/47 `IND-WATER-ACCESS` county slots are promoted from KNBS 2023/24 Kenya Housing Survey Table 5.14. The Atlas uses the published improved-source subtotal directly, retains the household-survey definition, withholds rankings where uncertainty is unavailable, and does not inherit values below county.\n\n**Remaining queue after tranche 2:** **329** across seven 47-county families.';
if(plan.includes(anchor))plan=plan.replace(anchor,`${anchor}\n\n${replacement}`);
else if(plan.includes('**Remaining queue after tranche 2:** **329** across seven 47-county families.')){
  // already prepared
}else throw new Error('P21 water access prepare: completion-plan tranche anchor missing');
write(planPath,plan);

console.log('P21_WATER_ACCESS_PREPARE_OK sourced=47 expected_remaining=329');
