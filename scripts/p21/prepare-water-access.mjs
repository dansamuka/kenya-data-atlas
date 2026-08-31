import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const readJson=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 water prepare: ${msg}`);};

const CODE='IND-WATER-ACCESS';
const SOURCE='Kenya National Bureau of Statistics — 2019 Kenya Population and Housing Census, Volume IV drinking-water table + Housing Conditions and Amenities Appendix 15 / Atlas H.8';
const SOURCE_URL='https://www.knbs.or.ke/wp-content/uploads/2023/09/2019-Kenya-population-and-Housing-Census-Analytical-Report-on-Housing-Conditions-and-Amenities.pdf';
const NOTE='P21 county promotion. All 47 county values are transparently derived from the committed 2019 KPHC Volume IV source table by summing the eight drinking-water categories classified as improved by KNBS: protected spring, protected well, borehole/tube well, piped into dwelling, piped to yard/plot, bottled water, rain/harvested water, and public tap/standpipe. Source category shares are rounded to one decimal place, so a derived county subtotal can differ by about 0.1 percentage point from the separately printed Appendix subtotal. National reconciliation anchor is 64.8%. No constituency or ward inheritance.';

const taxonomyPath='data/indicators/seed/placeholder-taxonomy.json';
const taxonomy=readJson(taxonomyPath);
const def=(taxonomy.indicators||[]).find(i=>i.code===CODE);
assert(def,`${CODE} missing from placeholder taxonomy`);
def.status='sourced';
def.source=SOURCE;
def.source_url=SOURCE_URL;
def.note=NOTE;
writeJson(taxonomyPath,taxonomy);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=readJson(roadmapPath);
const p21=roadmap.phases.find(p=>p.id==='P21');
assert(p21,'P21 roadmap phase missing');
p21.status='in_progress';
p21.progress={
  resolved_in_tranche_1:47,
  resolved_in_tranche_2:47,
  resolved_in_p21:94,
  remaining_slots:329,
  tranche_1_note:'Retired/replaced the generic county-dominant-crop placeholder across all 47 counties in favour of fixed-definition maize area, production and yield already published from the official National Agriculture Production Report 2024.',
  tranche_2_note:'Promoted improved drinking-water access across all 47 counties from the 2019 KPHC. Values are transparent same-county subtotals of the eight KNBS improved-source categories from the committed Volume IV source table, reconciled to the published national 64.8% anchor. No geographic inheritance or crosswalk is used.'
};
writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';
let plan=read(planPath);
if(!plan.includes('**P21 tranche 2 — improved water access:**')){
  const marker='**Remaining queue after tranche 1:** **376** across eight 47-county families.';
  const replacement=`${marker}\n\n**P21 tranche 2 — improved water access:** activate all 47 county \`IND-WATER-ACCESS\` slots from the 2019 KPHC drinking-water table. The Atlas uses the eight KNBS improved-source categories and publishes the county subtotal as Badge B transparent derivation because the source category shares are rounded to one decimal place. The national subtotal reconciles to the official 64.8% anchor.\n\n**Remaining queue after tranche 2:** **329** across seven 47-county families.`;
  assert(plan.includes(marker),'tranche 1 handoff marker missing from completion plan');
  plan=plan.replace(marker,replacement);
}
write(planPath,plan);

console.log('P21_WATER_PREPARE_OK sourced=47 expected_remaining=329 national_anchor=64.8');
