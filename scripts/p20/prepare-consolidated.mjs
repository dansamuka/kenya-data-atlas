import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const write=(f,s)=>fs.writeFileSync(f,s.endsWith('\n')?s:s+'\n');
const j=f=>JSON.parse(read(f));

// Wire independent workstream builders into one deterministic Atlas build.
{
  const f='package.json'; const p=j(f);
  if(!p.scripts['catalogue:build'].includes('build-disability-prevalence.mjs')) p.scripts['catalogue:build']=p.scripts['catalogue:build'].replace('node scripts/p20/build-household-size.mjs catalogue','node scripts/p20/build-household-size.mjs catalogue && node scripts/p20/build-disability-prevalence.mjs catalogue');
  if(!p.scripts['indicators:build'].includes('build-disability-prevalence.mjs')) p.scripts['indicators:build']=p.scripts['indicators:build'].replace('node scripts/p20/build-household-size.mjs indicators','node scripts/p20/build-household-size.mjs indicators && node scripts/p20/build-disability-prevalence.mjs indicators && node scripts/p20/build-kdhs-additional.mjs');
  p.scripts['p20:validate']='node scripts/p20/validate-sourced-county.mjs && node scripts/p20/validate-audit-opinion.mjs && node scripts/p20/validate-household-size.mjs && node scripts/p20/validate-kdhs-additional.mjs && node scripts/p20/validate-disability-prevalence.mjs && node scripts/p20/validate-consolidated.mjs';
  write(f,JSON.stringify(p,null,2));
}

// Historical tranche validators own their evidence contract, not the moving
// global P20 total. The final total is asserted once by validate-consolidated.
for(const f of ['scripts/p20/validate-sourced-county.mjs','scripts/p20/validate-audit-opinion.mjs','scripts/p20/validate-household-size.mjs','scripts/p20/validate-kdhs-additional.mjs']){
  const lines=read(f).split(/\r?\n/).filter(line=>{
    const s=line.trim();
    if(s.includes('summary.total_slots')) return false;
    if(s.includes('summary.resolved_slots')) return false;
    if(s.includes('summary.unresolved_slots')) return false;
    if(s.includes('summary.by_completion_phase')) return false;
    if(s.includes('summary.unknown_missing')) return false;
    if(s.includes('COMPLETENESS_OK resolved=')) return false;
    return true;
  });
  write(f,lines.join('\n'));
}

// P17 finalization legitimately leaves no "next" phase once every v1 phase is
// complete. Preserve the forward-only rule during development, but accept the
// terminal all-complete state so the publisher can finalize after P20 updates.
{
  const f='scripts/countyiq/validate-p05.mjs'; let s=read(f);
  const old=" const nextPhases=roadmap.phases.filter(x=>x.status==='next');\n assert(nextPhases.length===1,`exactly one phase must be marked next, found ${nextPhases.length}`);\n assert(order.indexOf(nextPhases[0].id)>order.indexOf('P05'),`the next phase (${nextPhases[0].id}) must come after P05 — roadmap must only move forward`);\n console.log(`COUNTYIQ_P05_ROADMAP_OK next=${nextPhases[0].id}`);";
  const neu=" const nextPhases=roadmap.phases.filter(x=>x.status==='next');\n if(nextPhases.length===0){\n   assert(roadmap.phases.every(x=>x.status==='complete'),'zero next phases is permitted only when every v1 roadmap phase is complete');\n   console.log('COUNTYIQ_P05_ROADMAP_OK next=none_all_complete');\n }else{\n   assert(nextPhases.length===1,`exactly one phase must be marked next during active development, found ${nextPhases.length}`);\n   assert(order.indexOf(nextPhases[0].id)>order.indexOf('P05'),`the next phase (${nextPhases[0].id}) must come after P05 — roadmap must only move forward`);\n   console.log(`COUNTYIQ_P05_ROADMAP_OK next=${nextPhases[0].id}`);\n }";
  if(!s.includes(old)) throw new Error('P20 consolidated prep: P05 roadmap gate anchor not found');
  write(f,s.replace(old,neu));
}

// Synchronize completion programme metadata for the first consolidated batch:
// disability + teenage pregnancy + home birth = 141 county slots.
{
  const f='data/data-completion-roadmap.json'; const d=j(f);
  Object.assign(d.baseline,{resolved_slots:3009,unresolved_slots:17106,resolved_pct:14.96});
  d.baseline.remaining_by_phase.P20=376;
  const p20=d.phases.find(x=>x.id==='P20'); if(!p20) throw new Error('P20 roadmap phase missing');
  Object.assign(p20.progress,{remaining_slots:376,resolved_in_consolidated_batch_1:141,resolved_total:329,consolidated_batch_1_note:'Parallel P20 batch: 47/47 KNBS 2019 KPHC disability-prevalence observations plus 47/47 KDHS 2022 teenage-pregnancy and 47/47 home-birth observations. Census values are direct; KDHS observations retain published weighted denominators; rankings remain withheld.'});
  write(f,JSON.stringify(d,null,2));
}
{
  const f='docs/DATA-COMPLETION-PLAN.md'; let s=read(f);
  s=s.replace('- **2,868 resolved**','- **3,009 resolved**').replace('- **17,247 unresolved**','- **17,106 unresolved**').replace('- **14.26% resolved**','- **14.96% resolved**').replace('| P20 | 517 |','| P20 | 376 |');
  s=s.replace('**Remaining queue:** **517**.','- Consolidated batch 1: 47/47 disability prevalence + 47/47 teenage pregnancy + 47/47 home births (**141 slots**).\n- **329 P20 slots resolved across completed promotions.**\n\n**Remaining queue:** **376**.');
  write(f,s);
}
console.log('P20_CONSOLIDATED_PREP_OK batch=141 expected_resolved=3009 expected_remaining=376');
