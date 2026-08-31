import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const readJson=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 business-licences prepare: ${msg}`);};

const CODE='IND-BUSINESS-LICENSES';
const SUCCESSORS=['IND-GCP-CURRENT','IND-AGRICULTURE-GVA','IND-MANUFACTURING-GVA','IND-AGRICULTURE-GCP-SHARE','IND-MANUFACTURING-GCP-SHARE'];
const SOURCE='P21 governed county-licensing comparability review; replacement indicators sourced from KNBS Gross County Product 2025';
const SOURCE_URL='https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf';
const REASON='The original licensed-business count/year-on-year placeholder cannot support one defensible 47-county comparable series: county licensing publications and administrative systems have inconsistent coverage, vintages and licensing definitions, and the Atlas has no governed national source that standardises those counts across all counties. P21 therefore retires the profile-wide business-licence slot rather than stitching together opportunistic county values or treating non-publication as zero. The linked KNBS source supports the replacement economic indicators, not a business-licence count. The Atlas retains stronger 47/47 official county economic evidence through Gross County Product and fixed-definition agriculture/manufacturing GVA and GCP-share measures.';
const countyCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const evidencePath='data/completeness/evidence-states.json';
const evidence=readJson(evidencePath);
evidence.definition='Explicit resolved states for governed public slots where primary official evidence establishes that the requested observation is unavailable, or where a governed P21 decision retires/replaces a weak placeholder with stronger source-backed successors. These states never manufacture a zero, proxy, regional inheritance or synthetic observation.';
let closure=(evidence.states||[]).find(s=>s.indicator_code===CODE&&s.status==='retired_replaced');
if(!closure){
  closure={level:'county',geo_codes:countyCodes,indicator_code:CODE,status:'retired_replaced',period_label:'P21 comparability review · replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:SUCCESSORS,reason:REASON};
  evidence.states.push(closure);
}else{
  Object.assign(closure,{level:'county',geo_codes:countyCodes,period_label:'P21 comparability review · replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:SUCCESSORS,reason:REASON});
}
writeJson(evidencePath,evidence);

const taxonomyPath='data/indicators/seed/placeholder-taxonomy.json';
const taxonomy=readJson(taxonomyPath);
const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def,`${CODE} missing from placeholder taxonomy`);
def.status='retired';
def.source=SOURCE;
def.source_url=SOURCE_URL;
def.note=`Retired/replaced in P21 because no governed 47-county comparable licensed-business count is available across consistent definitions and vintages. Use ${SUCCESSORS.join(', ')} for the Atlas's fixed-definition official county economic evidence; do not interpret those successors as business-licence counts. The linked KNBS source documents the successors, not the retired licence-count concept.`;
writeJson(taxonomyPath,taxonomy);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p21=(roadmap.phases||[]).find(p=>p.id==='P21');
assert(p21,'P21 roadmap phase missing');
const progress=p21.progress||{};
progress.resolved_in_tranche_4=47;
progress.tranche_4_note='Retired/replaced the inconsistent county licensed-business count/year-on-year placeholder across all 47 counties. No mixed-vintage patchwork or zero fill is used; the Atlas points users to fixed-definition official GCP and economic-structure successors instead.';
p21.progress=progress;
p21.status='in_progress';
writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
plan=plan.replace(
  'Following P21 tranches 1–2, the live summary reports **3,479 resolved**, **16,636 unresolved**, **0 unknown blanks**, and **329 P21 rows** remaining.',
  'Following P21 tranches 1–4, the live summary reports **3,573 resolved**, **16,542 unresolved**, **0 unknown blanks**, and **235 P21 rows** remaining.'
);
if(!plan.includes('**P21 tranche 3 — exam-performance replacement:**')){
  plan=plan.replace(
    '**Remaining queue after tranche 2:** **329** across seven 47-county families.',
    '**Remaining queue after tranche 2:** **329** across seven 47-county families.\n\n**P21 tranche 3 — exam-performance replacement:** all 47 `IND-EXAM-PERFORMANCE` slots are retired/replaced rather than manufacturing a mixed KCPE/KCSE county mean. KNEC records 2023 as the final KCPE examination; the Atlas keeps existing school-attendance, school-establishment and teacher indicators as clearly labelled education evidence, not exam-score proxies.\n\n**Remaining queue after tranche 3:** **282** across six 47-county families.'
  );
}
if(!plan.includes('**P21 tranche 4 — business-licence replacement:**')){
  plan=plan.replace(
    '**Key principle:** If a defensible comparable 47-county source does not exist, the correct result is an explicit governed closure or a stronger replacement indicator — not a weak scrape.',
    '**P21 tranche 4 — business-licence replacement:** all 47 `IND-BUSINESS-LICENSES` slots are retired/replaced because county licensing publications and administrative systems do not provide one governed 47-county series with consistent definitions and vintages. The Atlas does not stitch opportunistic county counts together or interpret non-publication as zero; it directs users to fixed-definition official GCP and agriculture/manufacturing economic-structure indicators instead.\n\n**Remaining queue after tranche 4:** **235** across five 47-county families.\n\n**Key principle:** If a defensible comparable 47-county source does not exist, the correct result is an explicit governed closure or a stronger replacement indicator — not a weak scrape.'
  );
}
write(planPath,plan);

console.log('P21_BUSINESS_LICENSES_PREPARE_OK retired_replaced=47 successors=5 plan_synced=true');
