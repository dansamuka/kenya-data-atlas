import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const write=(f,s)=>fs.writeFileSync(f,s.endsWith('\n')?s:s+'\n');
const j=f=>JSON.parse(read(f));

{
  const f='package.json',p=j(f);
  const addAfter=(script,anchor,addition)=>{if(!p.scripts[script].includes(addition))p.scripts[script]=p.scripts[script].replace(anchor,`${anchor} && ${addition}`);};
  addAfter('catalogue:build','node scripts/p20/build-kenphia-hiv-prevalence.mjs catalogue','node scripts/p20/build-health-facility-density.mjs catalogue');
  addAfter('catalogue:build','node scripts/p20/build-health-facility-density.mjs catalogue','node scripts/p20/build-pending-bills.mjs catalogue');
  addAfter('indicators:build','node scripts/p20/build-kenphia-hiv-prevalence.mjs indicators','node scripts/p20/build-health-facility-density.mjs indicators');
  addAfter('indicators:build','node scripts/p20/build-health-facility-density.mjs indicators','node scripts/p20/build-pending-bills.mjs indicators');
  addAfter('indicators:build','node scripts/p20/build-pending-bills.mjs indicators','node scripts/p20/build-substance-availability.mjs indicators');
  p.scripts['p20:validate']='node scripts/p20/validate-sourced-county.mjs && node scripts/p20/validate-audit-opinion.mjs && node scripts/p20/validate-household-size.mjs && node scripts/p20/validate-kdhs-additional.mjs && node scripts/p20/validate-kdhs-contraceptive.mjs && node scripts/p20/validate-kdhs-fgm.mjs && node scripts/p20/validate-kdhs-literacy-women.mjs && node scripts/p20/validate-disability-prevalence.mjs && node scripts/p20/validate-housing-durable-wall.mjs && node scripts/p20/validate-kenphia-hiv-prevalence.mjs && node scripts/p20/validate-health-facility-density.mjs && node scripts/p20/validate-pending-bills.mjs && node scripts/p20/validate-substance-availability.mjs && node scripts/p20/validate-consolidated.mjs';
  write(f,JSON.stringify(p,null,2));
}

// Keep public placeholder metadata semantically aligned with the now-governed
// final P20 decisions. Canonical builders still own active series metadata.
{
  const f='data/indicators/seed/placeholder-taxonomy.json',t=j(f),byCode=new Map((t.indicators||[]).map(x=>[x.code,x]));
  const density=byCode.get('IND-HEALTH-FACILITY-DENSITY');
  if(density)Object.assign(density,{name:'Health facilities assessed per 10,000 residents',description:'Facilities assessed in the August-September 2023 Kenya Health Facility Census per 10,000 KNBS projected 2023 residents.',source:'MoH Kenya Health Facility Census 2023 + KNBS Gross County Product 2024',source_url:'https://www.health.go.ke/sites/default/files/2024-01/Kenya%20Health%20Facility%20Census%20Report%20September%202023.pdf',note:'County P20 values are transparent same-year Badge-B derivations. Constituency and ward values remain later-phase work and must not inherit county rates.'});
  const pending=byCode.get('IND-COUNTY-PENDING-BILLS');
  if(pending)Object.assign(pending,{source:'National Treasury BROP 2025 Table 10; source data Controller of Budget',source_url:'https://www.treasury.go.ke/sites/default/files/2025-Budget-Review-and-Outlook-Paper-1.pdf',note:'Final FY 2024/25 table reports numeric totals for 46 counties. Narok is an official non-submission and is governed as unavailable, not zero.'});
  const substance=byCode.get('IND-SUBSTANCE-ABUSE-PREVALENCE');
  if(substance)Object.assign(substance,{source:'NACADA National Survey on the Status of Drugs and Substance Use in Kenya 2022',source_url:'https://nacada.go.ke/sites/default/files/2023-05/National%20Survey%20on%20the%20Status%20of%20Drugs%20and%20Substance%20Use%20in%20Kenya%202022.pdf',note:'The 2022 survey publishes national, regional, urban and rural estimates, not county prevalence estimates. All 47 county slots are governed as official unavailable; regional rates must not be inherited or allocated.'});
  write(f,JSON.stringify(t,null,2));
}

{
  const f='data/data-completion-roadmap.json',d=j(f);
  Object.assign(d.baseline,{resolved_slots:3385,unresolved_slots:16730,resolved_pct:16.83});
  d.baseline.remaining_by_phase.P20=0;
  const p20=d.phases.find(x=>x.id==='P20');if(!p20)throw new Error('P20 roadmap phase missing');
  Object.assign(p20.progress,{remaining_slots:0,resolved_in_consolidated_batch_1:517,resolved_total:705,completion_status:'complete',consolidated_batch_1_note:'Consolidated P20 completion resolved all 517 slots that remained after the first 188 P20 promotions: 376 county observations across disability, teenage pregnancy, home birth, modern contraceptive use, FGM, women 15–49 literacy, durable wall material and KENPHIA HIV prevalence; plus 47 derived 2023 health-facility-density observations; 46 final FY2024/25 pending-bill observations; Narok pending bills as official non-submission; and all 47 NACADA substance-use county slots as official unavailable because the 2022 survey publishes national/regional/urban-rural rather than county estimates. No regional inheritance, zero fabrication or reverse engineering was used.'});
  write(f,JSON.stringify(d,null,2));
}
{
  const f='docs/DATA-COMPLETION-PLAN.md';let s=read(f);
  s=s.replace(/- \*\*[\d,]+ resolved\*\*/,'- **3,385 resolved**');
  s=s.replace(/- \*\*[\d,]+ unresolved\*\*/,'- **16,730 unresolved**');
  s=s.replace(/- \*\*[\d.]+% resolved\*\*/,'- **16.83% resolved**');
  s=s.replace(/\| P20 \| \d+ \|/,'| P20 | 0 |');
  s=s.replace(/- Consolidated batch 1:.*\(\*\*\d+ slots\*\*\)\./,'- Consolidated batch 1: all eleven remaining P20 county families resolved under governed evidence contracts (**517 slots**): eight numeric/source families (376), facility density (47), pending bills (46 numeric + 1 official non-submission), and substance-use prevalence (47 official county-unavailable states).');
  s=s.replace(/- \*\*[\d,]+ P20 slots resolved across completed promotions\.\*\*/,'- **705 P20 slots resolved across completed promotions; P20 is complete.**');
  s=s.replace(/\*\*Remaining queue:\*\* \*\*\d+\*\*\./,'**Remaining queue:** **0**.');
  write(f,s);
}
console.log('P20_FINAL_PREP_OK resolved=3385 unresolved=16730 p20_remaining=0 explicit_unavailable=48');
