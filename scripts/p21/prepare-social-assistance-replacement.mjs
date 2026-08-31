import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const assert=(ok,msg)=>{if(!ok)throw new Error(`P21 social-assistance prepare: ${msg}`);};
const OLD='IND-SOCIAL-PROTECTION-BENEFICIARIES';
const NEW='IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE';
const SOURCE='KNBS and ICF — Kenya Demographic and Health Survey 2022, Volume 1, Table 2.21.3C';
const SOURCE_URL='https://www.knbs.or.ke/reports/kdhs-2022/';
const REASON='The original Inua Jamii beneficiary placeholder is an administrative person-count concept, but no citable complete 47-county administrative beneficiary table has been identified. KDHS 2022 Table 2.21.3C instead publishes a complete 47-county household survey measure: percentage of households receiving a cash transfer or any social assistance. P21 retires the administrative placeholder rather than converting a household percentage into a person count, and promotes the KDHS measure as a separately named successor with survey denominators and ranking withheld.';
const codes=Array.from({length:47},(_,i)=>`KEN-C${String(i+1).padStart(3,'0')}`);

const evidencePath='data/completeness/evidence-states.json';
const evidence=json(evidencePath);
let state=(evidence.states||[]).find(s=>s.indicator_code===OLD&&s.status==='retired_replaced');
const fields={level:'county',geo_codes:codes,indicator_code:OLD,status:'retired_replaced',period_label:'KDHS 2022 · P21 replacement decision',source:SOURCE,source_url:SOURCE_URL,successor_indicator_codes:[NEW],reason:REASON};
if(state)Object.assign(state,fields);else evidence.states.push(fields);
writeJson(evidencePath,evidence);

const taxPath='data/indicators/seed/placeholder-taxonomy.json';
const tax=json(taxPath);
const old=(tax.indicators||[]).find(i=>i.code===OLD);assert(old,`${OLD} missing`);
Object.assign(old,{status:'retired',source:SOURCE,source_url:SOURCE_URL,note:`Retired/replaced in P21. The original slot is an administrative Inua Jamii beneficiary person count; no complete governed 47-county administrative table was located. Use ${NEW} for the distinct KDHS household survey percentage. Do not interpret the successor as an Inua Jamii beneficiary count.`});
const nf={code:NEW,name:'Households receiving cash transfer or social assistance',short_name:'Cash transfer / social assistance',description:'Percentage of households receiving a cash transfer or any social assistance, as published in KDHS 2022 Table 2.21.3C.',unit_code:'percent',status:'sourced',tab:'people',levels:['county'],source:SOURCE,source_url:SOURCE_URL,note:'Direct 47-county KDHS household survey estimate. Broader than Inua Jamii and not an administrative beneficiary count. Household sample sizes are retained; confidence intervals are not fabricated and ranking is withheld.'};
const existing=(tax.indicators||[]).find(i=>i.code===NEW);if(existing)Object.assign(existing,nf);else tax.indicators.push(nf);
tax.survey_indicator_codes=[...new Set([...(tax.survey_indicator_codes||[]),NEW])];
writeJson(taxPath,tax);

const roadmapPath='data/data-completion-roadmap.json';
const roadmap=json(roadmapPath);const p21=(roadmap.phases||[]).find(p=>p.id==='P21');assert(p21,'P21 missing');
p21.progress={...(p21.progress||{}),resolved_in_tranche_7:47,tranche_7_note:'Retired/replaced the 47-county administrative Inua Jamii beneficiary placeholder and added a distinct KDHS 2022 Table 2.21.3C household cash-transfer/social-assistance percentage for all counties, preserving household denominators and withholding rankings.'};
p21.status='in_progress';writeJson(roadmapPath,roadmap);

const planPath='docs/DATA-COMPLETION-PLAN.md';let plan=read(planPath);
plan=plan.replace('Following P21 tranches 1–6, the live summary reports **3,667 resolved**, **16,448 unresolved**, **0 unknown blanks**, and **141 P21 rows** remaining.','Following P21 tranches 1–7, the live summary reports **3,714 resolved**, **16,401 unresolved**, **0 unknown blanks**, and **94 P21 rows** remaining.');
if(!plan.includes('**P21 tranche 7 — social-assistance replacement:**'))plan=plan.replace('**Remaining queue after tranche 6:** **141** across three 47-county families.','**Remaining queue after tranche 6:** **141** across three 47-county families.\n\n**P21 tranche 7 — social-assistance replacement:** all 47 `IND-SOCIAL-PROTECTION-BENEFICIARIES` slots are retired/replaced because the original slot is an administrative Inua Jamii beneficiary person-count concept and no governed complete 47-county administrative table has been identified. KDHS 2022 Table 2.21.3C is promoted separately as `IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE`, a direct 47-county household survey percentage with household denominators. The Atlas does not convert this percentage into beneficiary persons, does not label it Inua Jamii coverage, and withholds county ranking because sampling uncertainty intervals are not published in the table.\n\n**Remaining queue after tranche 7:** **94** across two 47-county families.');
write(planPath,plan);

const packagePath='package.json';const pkg=json(packagePath);const sc=pkg.scripts;
if(!sc['catalogue:build'].includes('build-social-assistance.mjs catalogue'))sc['catalogue:build']+=' && node scripts/p21/build-social-assistance.mjs catalogue';
if(!sc['indicators:build'].includes('build-social-assistance.mjs indicators'))sc['indicators:build']=sc['indicators:build'].replace(' && node scripts/life/build-native.mjs indicators',' && node scripts/p21/build-social-assistance.mjs indicators && node scripts/life/build-native.mjs indicators');
if(!sc['p21:validate'].includes('validate-social-assistance.mjs'))sc['p21:validate']+=' && node scripts/p21/validate-social-assistance.mjs';
if(!sc['p21:prepare'].includes('prepare-social-assistance-replacement.mjs'))sc['p21:prepare']+=' && node scripts/p21/prepare-social-assistance-replacement.mjs';
writeJson(packagePath,pkg);
console.log('P21_SOCIAL_ASSISTANCE_PREPARE_OK retired_replaced=47 successor_direct=47 plan_synced=true package_wired=true');
