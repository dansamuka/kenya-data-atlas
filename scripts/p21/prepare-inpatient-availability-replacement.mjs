import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const readJson=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 inpatient-availability prepare: ${msg}`);};

const OLD='IND-HOSPITAL-BED-UTILIZATION';
const NEW='IND-INPATIENT-SERVICE-AVAILABILITY';
const SOURCE='Ministry of Health — Service Availability and Readiness Assessment (SARA) Main Report, Table 18';
const SOURCE_URL='https://health.go.ke/sites/default/files/2026-06/Main%20Report%20-%20SARA%2021.10.2025.pdf';
const REASON='The original county hospital-bed occupancy/utilisation placeholder cannot be filled defensibly from the published SARA report. The Ministry of Health reports a national average inpatient bed occupancy rate of 46%, but does not publish a governed 47-county occupancy table in the report. Table 18 does publish a complete 47-county percentage of facilities offering inpatient services, with facility denominators. P21 therefore retires the occupancy placeholder rather than allocating the national 46% to counties or treating service availability as utilisation. The new inpatient-service-availability indicator is a clearly labelled successor and must not be interpreted as bed occupancy.';
const countyCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const evidencePath='data/completeness/evidence-states.json';
const evidence=readJson(evidencePath);
evidence.definition='Explicit resolved states for governed public slots where primary official evidence establishes that the requested observation is unavailable, or where a governed P21 decision retires/replaces a weak placeholder with stronger source-backed successors. These states never manufacture a zero, proxy, regional inheritance or synthetic observation.';
let closure=(evidence.states||[]).find(s=>s.indicator_code===OLD&&s.status==='retired_replaced');
if(!closure){
  closure={level:'county',geo_codes:countyCodes,indicator_code:OLD,status:'retired_replaced',period_label:'SARA 2025 report · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:[NEW],reason:REASON};
  evidence.states.push(closure);
}else Object.assign(closure,{level:'county',geo_codes:countyCodes,period_label:'SARA 2025 report · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:[NEW],reason:REASON});
writeJson(evidencePath,evidence);

const taxonomyPath='data/indicators/seed/placeholder-taxonomy.json';
const taxonomy=readJson(taxonomyPath);
const oldDef=(taxonomy.indicators||[]).find(i=>i.code===OLD);
assert(oldDef,`${OLD} missing from placeholder taxonomy`);
oldDef.status='retired';
oldDef.source=SOURCE;
oldDef.source_url=SOURCE_URL;
oldDef.note=`Retired/replaced in P21 because the official SARA report publishes only the national 46% bed-occupancy average, not a governed 47-county occupancy table. Use ${NEW} for the report's directly published 47-county inpatient-service availability percentages. Do not interpret that successor as bed occupancy/utilisation.`;
let newDef=(taxonomy.indicators||[]).find(i=>i.code===NEW);
const newFields={code:NEW,name:'Facilities offering inpatient services',short_name:'Inpatient service availability',description:'Percentage of health facilities reported as offering inpatient services in Ministry of Health SARA Table 18.',unit_code:'percent',status:'sourced',tab:'health',levels:['county'],source:SOURCE,source_url:SOURCE_URL,note:'Published directly for all 47 counties with facility denominators in SARA Table 18. This measures service availability among facilities, not bed occupancy/utilisation, bed density, population access or quality. Ranking is withheld.'};
if(!newDef){taxonomy.indicators.push(newFields);}else Object.assign(newDef,newFields);
writeJson(taxonomyPath,taxonomy);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p21=(roadmap.phases||[]).find(p=>p.id==='P21');
assert(p21,'P21 roadmap phase missing');
const progress=p21.progress||{};
progress.resolved_in_tranche_6=47;
progress.tranche_6_note='Retired/replaced the unsupported 47-county hospital-bed occupancy/utilisation placeholder. Added a separate Ministry of Health SARA Table 18 successor containing direct inpatient-service availability percentages and denominators for all 47 counties; the national 46% occupancy figure is never inherited to counties.';
p21.progress=progress;
p21.status='in_progress';
writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
plan=plan.replace(
  'Following P21 tranches 1–5, the live summary reports **3,620 resolved**, **16,495 unresolved**, **0 unknown blanks**, and **188 P21 rows** remaining.',
  'Following P21 tranches 1–6, the live summary reports **3,667 resolved**, **16,448 unresolved**, **0 unknown blanks**, and **141 P21 rows** remaining.'
);
if(!plan.includes('**P21 tranche 6 — inpatient-service availability replacement:**')){
  plan=plan.replace(
    '**Remaining queue after tranche 5:** **188** across four 47-county families.',
    '**Remaining queue after tranche 5:** **188** across four 47-county families.\n\n**P21 tranche 6 — inpatient-service availability replacement:** all 47 `IND-HOSPITAL-BED-UTILIZATION` slots are retired/replaced because the Ministry of Health SARA report publishes a national 46% inpatient bed-occupancy average but no governed 47-county occupancy table. The Atlas does not allocate that national rate to counties. Instead, the report’s Table 18 is promoted as a separate `IND-INPATIENT-SERVICE-AVAILABILITY` series with direct percentages and facility denominators for all 47 counties; it is explicitly labelled as availability, not utilisation.\n\n**Remaining queue after tranche 6:** **141** across three 47-county families.'
  );
}
write(planPath,plan);

const packagePath='package.json';
const pkg=readJson(packagePath);
const append=(key,cmd)=>{assert(pkg.scripts?.[key],`package script ${key} missing`);if(!pkg.scripts[key].includes(cmd))pkg.scripts[key]+=` && ${cmd}`;};
append('catalogue:build','node scripts/p21/build-inpatient-availability.mjs catalogue');
append('indicators:build','node scripts/p21/build-inpatient-availability.mjs indicators');
append('p21:validate','node scripts/p21/validate-inpatient-availability.mjs');
writeJson(packagePath,pkg);

console.log('P21_INPATIENT_AVAILABILITY_PREPARE_OK retired_replaced=47 successor_direct=47 plan_synced=true package_wired=true');
