import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const readJson=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 agriculture prepare: ${msg}`);};

const CODE='IND-AGRI-PRODUCTION';
const SUCCESSORS=['IND-MAIZE-AREA','IND-MAIZE-PRODUCTION','IND-MAIZE-YIELD'];
const SOURCE='KNBS / Ministry of Agriculture and Livestock Development — National Agriculture Production Report 2024, Annex 1';
const SOURCE_URL='https://www.knbs.or.ke/wp-content/uploads/2025/01/National-Agriculture-Production-Report-2024.pdf';
const REASON='The original generic county-dominant-crop placeholder cannot provide one comparable 47-county measure because the crop and unit would vary by county. P19 already exposes fixed-definition maize area, maize production and transparent maize yield for all 47 counties from Annex 1 of the official National Agriculture Production Report 2024. P21 therefore retires and replaces the generic slot rather than duplicating evidence or mixing unlike crop measures.';
const countyCodes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

// 1) Governed closure: preserve the slot in the fixed 20,115 denominator, but
// resolve it explicitly as retired/replaced rather than deleting it or inventing a value.
const evidence=readJson('data/completeness/evidence-states.json');
evidence.definition='Explicit resolved states for governed public slots where primary official evidence establishes that the requested observation is unavailable, or where a governed P21 decision retires/replaces a weak placeholder with stronger source-backed successors. These states never manufacture a zero, proxy, regional inheritance or synthetic observation.';
let closure=(evidence.states||[]).find(s=>s.indicator_code===CODE&&s.status==='retired_replaced');
if(!closure){
  closure={
    level:'county',
    geo_codes:countyCodes,
    indicator_code:CODE,
    status:'retired_replaced',
    period_label:'2023 source · P21 replacement decision',
    source:SOURCE,
    source_url:SOURCE_URL,
    successor_indicator_codes:SUCCESSORS,
    reason:REASON
  };
  evidence.states.push(closure);
}else{
  Object.assign(closure,{level:'county',geo_codes:countyCodes,period_label:'2023 source · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:SUCCESSORS,reason:REASON});
}
writeJson('data/completeness/evidence-states.json',evidence);

// 2) Lifecycle/UI metadata: retain the taxonomy slot but mark the indicator retired.
const taxonomy=readJson('data/indicators/seed/placeholder-taxonomy.json');
const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def,`${CODE} missing from placeholder taxonomy`);
def.status='retired';
def.source=SOURCE;
def.source_url=SOURCE_URL;
def.note=`Retired/replaced in P21. Use ${SUCCESSORS.join(', ')}: fixed-definition county maize measures already published 47/47 from the official 2023 Annex 1 table. The former dominant-crop concept mixed different crops/units and was not retained as a comparable indicator.`;
writeJson('data/indicators/seed/placeholder-taxonomy.json',taxonomy);

// 3) Make the public profile say Replaced, not Planned, and expose the official source.
const profilePath='assets/place-profile.js';
let profile=read(profilePath);
profile=profile.replace("const status=life==='sourced'?'Sourced':'Planned';","const status=life==='sourced'?'Sourced':life==='retired'?'Replaced':'Planned';");
profile=profile.replace("const link=life==='sourced'&&ind.expected_source_url?`<a href=\"${esc(ind.expected_source_url)}\" target=\"_blank\" rel=\"noopener\">Open source ↗</a>`:'';","const link=(life==='sourced'||life==='retired')&&ind.expected_source_url?`<a href=\"${esc(ind.expected_source_url)}\" target=\"_blank\" rel=\"noopener\">Open source ↗</a>`:'';");
assert(profile.includes("life==='retired'?'Replaced'"),'retired profile status patch did not apply');
assert(profile.includes("life==='sourced'||life==='retired'"),'retired source-link patch did not apply');
write(profilePath,profile);

// 4) Update completeness semantics so resolved closures are broader than only
// official non-publication and remain auditable in generated outputs.
const ledgerBuilderPath='scripts/completeness/build-slot-ledger.mjs';
let ledgerBuilder=read(ledgerBuilderPath);
ledgerBuilder=ledgerBuilder.replace(
  'A slot is resolved only when the canonical registry supplies a published/direct, transparently derived, modelled, or verified external observation, or a governed primary-source evidence state establishes that the requested observation is officially unavailable. No parent, regional or missing value is inherited or manufactured.',
  'A slot is resolved only when the canonical registry supplies a published/direct, transparently derived, modelled, or verified external observation, or a governed evidence state explicitly closes the slot as officially unavailable, not applicable, boundary unresolved, or retired/replaced. No parent, regional or missing value is inherited or manufactured.'
);
ledgerBuilder=ledgerBuilder.replace(
  'Every public data slot must end in a defensible resolved evidence state; parent/regional values are never inherited and official non-publication/non-submission is preserved without fabricating a numeric observation.',
  'Every public data slot must end in a defensible resolved evidence state; parent/regional values are never inherited, official non-publication/non-submission is preserved, and retired/replaced slots retain an auditable successor decision without fabricating a numeric observation.'
);
assert(ledgerBuilder.includes('retired/replaced'),'completeness definition patch did not apply');
write(ledgerBuilderPath,ledgerBuilder);

// 5) Machine-readable programme status. This preparation step owns tranche 1
// only; it must never overwrite progress recorded by later P21 tranches.
const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p20=roadmap.phases.find(p=>p.id==='P20');
const p21=roadmap.phases.find(p=>p.id==='P21');
assert(p20&&p21,'P20/P21 roadmap phases missing');
p20.status='complete';
p21.status='in_progress';
const progress=p21.progress||{};
if(progress.resolved_in_tranche_1===undefined)progress.resolved_in_tranche_1=47;
if(progress.tranche_1_note===undefined)progress.tranche_1_note='Retired/replaced the generic county-dominant-crop placeholder across all 47 counties with stronger fixed-definition maize successors already published in P19.';
if(progress.remaining_slots===undefined)progress.remaining_slots=376;
p21.progress=progress;
writeJson(roadmapPath,roadmap);

// 6) Public handoff status.
const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
plan=plan.replace('## P20 — Activate straightforward sourced county slots\n\n**Status: in progress.**','## P20 — Activate straightforward sourced county slots\n\n**Status: complete.**');
plan=plan.replace('## P21 — Resolve hard county slots and retire weak placeholders\n\n**Status: next.**','## P21 — Resolve hard county slots and retire weak placeholders\n\n**Status: in progress.**');
if(!plan.includes('**P21 tranche 1 — agriculture replacement:**')){
  plan=plan.replace('**Queue:** **423**.','**P21 tranche 1 — agriculture replacement:** the 47 generic `IND-AGRI-PRODUCTION` slots are retired/replaced by the already-published, fixed-definition `IND-MAIZE-AREA`, `IND-MAIZE-PRODUCTION` and `IND-MAIZE-YIELD` county series. This preserves the governed denominator while removing a weak mixed-crop concept.\n\n**Remaining queue after tranche 1:** **376** across eight 47-county families.');
}
write(planPath,plan);

// 7) Wire the idempotent preparation and tranche validator into normal builds.
const packagePath='package.json';
const pkg=readJson(packagePath);
pkg.scripts['p21:prepare']='node scripts/p21/prepare-agriculture-replacement.mjs';
if(!pkg.scripts['build:data'].startsWith('npm run p21:prepare && '))pkg.scripts['build:data']=`npm run p21:prepare && ${pkg.scripts['build:data']}`;
pkg.scripts['p21:validate']='node scripts/p21/validate-work-queue.mjs && node scripts/p21/validate-agriculture-replacement.mjs';
writeJson(packagePath,pkg);

console.log(`P21_AGRICULTURE_PREPARE_OK retired_replaced=47 successors=3 remaining_preserved=${p21.progress.remaining_slots}`);
