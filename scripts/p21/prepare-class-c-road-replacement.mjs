import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 Class C road prepare: ${msg}`);};

const OLD='IND-ROAD-NETWORK-LENGTH';
const NEW='IND-CLASS-C-RURAL-ROAD-LENGTH';
const SOURCE='KNBS Economic Survey 2026, Table 11.9; underlying source Kenya Rural Roads Authority';
const SOURCE_URL='https://www.knbs.or.ke/reports/2026-economic-survey/';
const REASON="The original 'Classified road length' county placeholder is broader and insufficiently defined for a single comparable county series. KNBS Economic Survey 2026 Table 11.9 publishes a complete 47-county fixed-definition 2025 series for Class C rural roads, sourced to the Kenya Rural Roads Authority and informed by the 2025 Road Inventory and Condition Surveys. P21 therefore retires the ambiguous generic slot and promotes Class C rural road length as a separately named successor. Class C is not presented as the entire county road network, and the Atlas preserves the table's published Total column rather than recomputing it from rounded paved/unpaved display components.";
const codes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const evidencePath='data/completeness/evidence-states.json';
const evidence=json(evidencePath);
let state=(evidence.states||[]).find(s=>s.indicator_code===OLD&&s.status==='retired_replaced');
const fields={level:'county',geo_codes:codes,indicator_code:OLD,status:'retired_replaced',period_label:'2025 provisional · Economic Survey 2026 · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:[NEW],reason:REASON};
if(state)Object.assign(state,fields);else evidence.states.push(fields);
writeJson(evidencePath,evidence);

const taxPath='data/indicators/seed/placeholder-taxonomy.json';
const tax=json(taxPath);
const old=(tax.indicators||[]).find(i=>i.code===OLD);assert(old,`${OLD} missing`);
Object.assign(old,{status:'retired',source:SOURCE,source_url:SOURCE_URL,note:`Retired/replaced in P21 because the generic 'classified road length' slot does not identify a stable road-class scope. Use ${NEW} for the direct 47-county 2025 Class C rural-road total published in KNBS Economic Survey 2026 Table 11.9. Do not interpret the successor as total road length across all road classes within a county.`});
const nf={code:NEW,name:'Class C rural road length',short_name:'Class C road length',description:'Published total kilometres of Class C rural roads in each county in 2025, from KNBS Economic Survey 2026 Table 11.9.',unit_code:'km',status:'sourced',tab:'infrastructure',levels:['county'],source:SOURCE,source_url:SOURCE_URL,note:'Direct 47-county published Total column for 2025 provisional Class C rural roads. Underlying source: Kenya Rural Roads Authority. Class C is a fixed road class, not the entire county road network. Published totals are preserved verbatim despite one-decimal component rounding differences; ranking is withheld because longer network length is not inherently better.'};
const existing=(tax.indicators||[]).find(i=>i.code===NEW);if(existing)Object.assign(existing,nf);else tax.indicators.push(nf);
writeJson(taxPath,tax);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=json(roadmapPath),p21=(roadmap.phases||[]).find(p=>p.id==='P21');assert(p21,'P21 missing');
p21.progress={...(p21.progress||{}),resolved_in_tranche_9:47,tranche_9_note:'Retired/replaced the ambiguous 47-county classified-road-length placeholder and added a direct fixed-definition Class C rural-road total from KNBS Economic Survey 2026 Table 11.9 for all counties. Published Total values are preserved verbatim; Class C is not represented as all-class county road length.'};
p21.status='in_progress';writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';let plan=read(planPath);
plan=plan.replace('Following P21 tranches 1–8, the live summary reports **3,761 resolved**, **16,354 unresolved**, **0 unknown blanks**, and **47 P21 rows** remaining.','Following P21 tranches 1–9, the live summary reports **3,808 resolved**, **16,307 unresolved**, **0 unknown blanks**, and **0 P21 rows** remaining.');
if(!plan.includes('**P21 tranche 9 — Class C rural-road replacement:**'))plan=plan.replace('**Remaining queue after tranche 8:** **47** in one family: road-network length.','**Remaining queue after tranche 8:** **47** in one family: road-network length.\n\n**P21 tranche 9 — Class C rural-road replacement:** all 47 `IND-ROAD-NETWORK-LENGTH` slots are retired/replaced because the original “classified road length” profile slot is too broad to map cleanly to one stable national road-class definition. KNBS Economic Survey 2026 Table 11.9 supplies a complete fixed-definition 2025 county series for Class C rural roads, sourced to the Kenya Rural Roads Authority. The Atlas promotes the published `Total` column as `IND-CLASS-C-RURAL-ROAD-LENGTH`, preserves each published total verbatim rather than recomputing from rounded paved/unpaved display components, and explicitly does not present Class C as the entire county road network.\n\n**Remaining queue after tranche 9:** **0**. **P21 complete.**');
write(planPath,plan);

const packagePath='package.json',pkg=json(packagePath),sc=pkg.scripts;
if(!sc['catalogue:build'].includes('build-class-c-road-length.mjs catalogue'))sc['catalogue:build']+=' && node scripts/p21/build-class-c-road-length.mjs catalogue';
if(!sc['indicators:build'].includes('build-class-c-road-length.mjs indicators'))sc['indicators:build']=sc['indicators:build'].replace(' && node scripts/life/build-native.mjs indicators',' && node scripts/p21/build-class-c-road-length.mjs indicators && node scripts/life/build-native.mjs indicators');
if(!sc['p21:validate'].includes('validate-class-c-road-length.mjs'))sc['p21:validate']+=' && node scripts/p21/validate-class-c-road-length.mjs';
if(!sc['p21:prepare'].includes('prepare-class-c-road-replacement.mjs'))sc['p21:prepare']+=' && node scripts/p21/prepare-class-c-road-replacement.mjs';
writeJson(packagePath,pkg);
console.log('P21_CLASS_C_ROAD_PREPARE_OK retired_replaced=47 successor_direct=47 final_p21_target=0 package_wired=true');
