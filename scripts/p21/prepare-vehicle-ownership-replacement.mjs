import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 vehicle-ownership prepare: ${msg}`);};

const OLD='IND-VEHICLE-REGISTRATIONS';
const SUCCESSORS=['IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP'];
const SOURCE='KNBS — 2019 Kenya Population and Housing Census, Volume IV, Table 2.36';
const SOURCE_URL='https://repository.knbs.or.ke/handle/knbs-ke-repo/451';
const REASON='The original vehicle-registration placeholder is an administrative registered-vehicle stock/count concept, but no governed complete 47-county NTSA registration table has been identified. KNBS 2019 KPHC Volume IV Table 2.36 publishes complete 47-county percentages of conventional households owning motorcycles and cars. P21 therefore retires the registration-count placeholder rather than converting ownership percentages into vehicle counts or registration rates, and promotes the two census ownership measures as separately named successors. No synthetic combined vehicle-ownership percentage is created because household asset ownership can overlap.';
const codes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const evidencePath='data/completeness/evidence-states.json';
const evidence=json(evidencePath);
let state=(evidence.states||[]).find(s=>s.indicator_code===OLD&&s.status==='retired_replaced');
const fields={level:'county',geo_codes:codes,indicator_code:OLD,status:'retired_replaced',period_label:'2019 KPHC · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:SUCCESSORS,reason:REASON};
if(state)Object.assign(state,fields);else evidence.states.push(fields);
writeJson(evidencePath,evidence);

const taxPath='data/indicators/seed/placeholder-taxonomy.json';
const tax=json(taxPath);
const old=(tax.indicators||[]).find(i=>i.code===OLD);assert(old,`${OLD} missing`);
Object.assign(old,{status:'retired',source:SOURCE,source_url:SOURCE_URL,note:`Retired/replaced in P21. No governed complete 47-county administrative registration table was identified. Use ${SUCCESSORS.join(' and ')} for the separate KNBS 2019 Census household-ownership percentages. Do not interpret either successor as a registered-vehicle count, vehicle stock, NTSA registration location or vehicles per capita.`});
const defs=[
  {code:SUCCESSORS[0],name:'Households owning a motorcycle',short_name:'Motorcycle ownership',description:'Percentage of conventional households owning a motorcycle in KNBS 2019 KPHC Volume IV Table 2.36.'},
  {code:SUCCESSORS[1],name:'Households owning a car',short_name:'Car ownership',description:'Percentage of conventional households owning a car in KNBS 2019 KPHC Volume IV Table 2.36.'}
];
for(const d of defs){const f={...d,unit_code:'percent',status:'sourced',tab:'infrastructure',levels:['county'],source:SOURCE,source_url:SOURCE_URL,note:'Direct 47-county census household-asset ownership percentage. This is not an administrative vehicle-registration count. The indicator is non-directional for Atlas scoring/ranking and is never summed with other ownership columns into a synthetic unduplicated vehicle total.'};const existing=(tax.indicators||[]).find(i=>i.code===d.code);if(existing)Object.assign(existing,f);else tax.indicators.push(f);}
writeJson(taxPath,tax);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=json(roadmapPath),p21=(roadmap.phases||[]).find(p=>p.id==='P21');assert(p21,'P21 missing');
p21.progress={...(p21.progress||{}),resolved_in_tranche_8:47,tranche_8_note:'Retired/replaced the 47-county administrative registered-vehicle placeholder and added separate KNBS 2019 Census motorcycle-ownership and car-ownership percentages for all counties. No registration counts, per-capita rates or synthetic combined vehicle-ownership shares are inferred.'};
p21.status='in_progress';writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';let plan=read(planPath);
plan=plan.replace('Following P21 tranches 1–7, the live summary reports **3,714 resolved**, **16,401 unresolved**, **0 unknown blanks**, and **94 P21 rows** remaining.','Following P21 tranches 1–8, the live summary reports **3,761 resolved**, **16,354 unresolved**, **0 unknown blanks**, and **47 P21 rows** remaining.');
if(!plan.includes('**P21 tranche 8 — vehicle-ownership replacement:**'))plan=plan.replace('**Remaining queue after tranche 7:** **94** across two 47-county families.','**Remaining queue after tranche 7:** **94** across two 47-county families.\n\n**P21 tranche 8 — vehicle-ownership replacement:** all 47 `IND-VEHICLE-REGISTRATIONS` slots are retired/replaced because the original profile slot is an administrative registered-vehicle count/per-capita concept and no governed complete 47-county NTSA registration table has been identified. KNBS 2019 KPHC Volume IV Table 2.36 is promoted separately through `IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP` and `IND-HOUSEHOLD-CAR-OWNERSHIP`, both direct county percentages of conventional households. The Atlas does not turn these percentages into vehicle counts or registration rates and does not sum overlapping ownership columns into a synthetic total.\n\n**Remaining queue after tranche 8:** **47** in one family: road-network length.');
write(planPath,plan);

const packagePath='package.json',pkg=json(packagePath),sc=pkg.scripts;
if(!sc['catalogue:build'].includes('build-vehicle-ownership.mjs catalogue'))sc['catalogue:build']+=' && node scripts/p21/build-vehicle-ownership.mjs catalogue';
if(!sc['indicators:build'].includes('build-vehicle-ownership.mjs indicators'))sc['indicators:build']=sc['indicators:build'].replace(' && node scripts/life/build-native.mjs indicators',' && node scripts/p21/build-vehicle-ownership.mjs indicators && node scripts/life/build-native.mjs indicators');
if(!sc['p21:validate'].includes('validate-vehicle-ownership.mjs'))sc['p21:validate']+=' && node scripts/p21/validate-vehicle-ownership.mjs';
if(!sc['p21:prepare'].includes('prepare-vehicle-ownership-replacement.mjs'))sc['p21:prepare']+=' && node scripts/p21/prepare-vehicle-ownership-replacement.mjs';
writeJson(packagePath,pkg);
console.log('P21_VEHICLE_OWNERSHIP_PREPARE_OK retired_replaced=47 successors=2 direct_series_target=94 plan_synced=true package_wired=true');
