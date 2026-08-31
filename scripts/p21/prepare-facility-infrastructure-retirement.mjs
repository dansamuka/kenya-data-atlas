import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const readJson=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 facility-infrastructure prepare: ${msg}`);};

const CODE='IND-FACILITY-INFRASTRUCTURE';
const SUCCESSORS=['IND-HEALTH-FACILITY-STOCK','IND-HEALTH-FACILITY-DENSITY'];
const SOURCE='Ministry of Health — Kenya Health Facility Census Report September 2023';
const SOURCE_URL='https://www.health.go.ke/sites/default/files/2024-01/Kenya%20Health%20Facility%20Census%20Report%20September%202023.pdf';
const REASON="The original 'Facilities with electricity/water (%)' placeholder combines two distinct amenity concepts into one undefined county percentage. The published 2023 Health Facility Census reports reliable-water and reliable-power availability as facility-readiness results, while its published county table covers census coverage rather than a governed 47-county combined water/power amenity series. P21 therefore retires the mixed placeholder instead of reverse-engineering county values from figures, combining unlike measures, or fabricating missing values. The Atlas retains source-backed county health-infrastructure evidence through facility stock and facility density; those successors measure supply, not electricity/water access.";
const countyCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const evidencePath='data/completeness/evidence-states.json';
const evidence=readJson(evidencePath);
evidence.definition='Explicit resolved states for governed public slots where primary official evidence establishes that the requested observation is unavailable, or where a governed P21 decision retires/replaces a weak placeholder with stronger source-backed successors. These states never manufacture a zero, proxy, regional inheritance or synthetic observation.';
let closure=(evidence.states||[]).find(s=>s.indicator_code===CODE&&s.status==='retired_replaced');
if(!closure){
  closure={level:'county',geo_codes:countyCodes,indicator_code:CODE,status:'retired_replaced',period_label:'August–September 2023 Health Facility Census · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:SUCCESSORS,reason:REASON};
  evidence.states.push(closure);
}else{
  Object.assign(closure,{level:'county',geo_codes:countyCodes,period_label:'August–September 2023 Health Facility Census · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:SUCCESSORS,reason:REASON});
}
writeJson(evidencePath,evidence);

const taxonomyPath='data/indicators/seed/placeholder-taxonomy.json';
const taxonomy=readJson(taxonomyPath);
const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def,`${CODE} missing from placeholder taxonomy`);
def.status='retired';
def.source=SOURCE;
def.source_url=SOURCE_URL;
def.note=`Retired/replaced in P21 because the original field combines electricity and water into one undefined percentage and the official census does not publish one governed 47-county combined amenity series. Use ${SUCCESSORS.join(' and ')} for source-backed county health-infrastructure supply evidence; do not interpret those successors as electricity/water access rates.`;
writeJson(taxonomyPath,taxonomy);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p21=(roadmap.phases||[]).find(p=>p.id==='P21');
assert(p21,'P21 roadmap phase missing');
const progress=p21.progress||{};
progress.resolved_in_tranche_5=47;
progress.tranche_5_note='Retired/replaced the mixed facility electricity/water placeholder across all 47 counties. The Atlas does not reverse-engineer county amenity rates from census figures or combine unlike water/power measures; existing facility stock and density remain clearly labelled supply measures.';
p21.progress=progress;
p21.status='in_progress';
writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
plan=plan.replace(
  'Following P21 tranches 1–4, the live summary reports **3,573 resolved**, **16,542 unresolved**, **0 unknown blanks**, and **235 P21 rows** remaining.',
  'Following P21 tranches 1–5, the live summary reports **3,620 resolved**, **16,495 unresolved**, **0 unknown blanks**, and **188 P21 rows** remaining.'
);
if(!plan.includes('**P21 tranche 5 — facility-infrastructure replacement:**')){
  plan=plan.replace(
    '**Remaining queue after tranche 4:** **235** across five 47-county families.',
    '**Remaining queue after tranche 4:** **235** across five 47-county families.\n\n**P21 tranche 5 — facility-infrastructure replacement:** all 47 `IND-FACILITY-INFRASTRUCTURE` slots are retired/replaced because the original profile field combines electricity and water into one undefined percentage and the official 2023 Health Facility Census does not provide one governed 47-county combined amenity series. The Atlas does not infer county rates from charts or manufacture a combined score; existing health-facility stock and density indicators remain the clearly labelled county infrastructure-supply measures.\n\n**Remaining queue after tranche 5:** **188** across four 47-county families.'
  );
}
write(planPath,plan);

console.log('P21_FACILITY_INFRASTRUCTURE_PREPARE_OK retired_replaced=47 successors=2 plan_synced=true');
