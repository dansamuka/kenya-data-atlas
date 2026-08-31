import { readFile, writeFile } from 'node:fs/promises';

const read = file => readFile(file,'utf8');
const write = (file,content) => writeFile(file,content.endsWith('\n')?content:`${content}\n`);
const replaceOnce=(text,from,to,label)=>{
  const at=text.indexOf(from);
  if(at<0) throw new Error(`P20 KDHS patch failed: anchor not found for ${label}`);
  if(text.indexOf(from,at+from.length)>=0) throw new Error(`P20 KDHS patch failed: anchor is not unique for ${label}`);
  return text.slice(0,at)+to+text.slice(at+from.length);
};

{
  const file='package.json';
  const pkg=JSON.parse(await read(file));
  pkg.scripts['indicators:build']=pkg.scripts['indicators:build'].replace(
    'node scripts/p20/build-audit-opinion.mjs indicators && node scripts/life/build-native.mjs indicators',
    'node scripts/p20/build-audit-opinion.mjs indicators && node scripts/p20/build-kdhs-additional.mjs && node scripts/life/build-native.mjs indicators'
  );
  if(!pkg.scripts['indicators:build'].includes('build-kdhs-additional.mjs')) throw new Error('P20 KDHS patch failed: indicators build was not wired');
  pkg.scripts['p20:validate']='node scripts/p20/validate-sourced-county.mjs && node scripts/p20/validate-audit-opinion.mjs && node scripts/p20/validate-kdhs-additional.mjs';
  await write(file,JSON.stringify(pkg,null,2));
}

{
  const file='.github/workflows/placeholder-taxonomy.yml';
  let text=await read(file);
  text=replaceOnce(text,
    "      - 'data/countyiq/source/p10-fiscal-accountability-2024-25.json'\n",
    "      - 'data/countyiq/source/p10-fiscal-accountability-2024-25.json'\n      - 'data/p20/source/kdhs-2022-additional-county.json'\n",
    'generated-products KDHS source trigger');
  await write(file,text);
}

for(const file of ['scripts/p20/validate-sourced-county.mjs','scripts/p20/validate-audit-opinion.mjs']){
  let text=await read(file);
  text=text.replaceAll('summary.resolved_slots === 2821','summary.resolved_slots === 2915')
    .replaceAll('2,821 resolved slots','2,915 resolved slots')
    .replaceAll('summary.unresolved_slots === 17294','summary.unresolved_slots === 17200')
    .replaceAll('17,294 unresolved slots','17,200 unresolved slots')
    .replaceAll('summary.by_completion_phase?.P20 === 564','summary.by_completion_phase?.P20 === 470')
    .replaceAll('564 P20 slots remaining','470 P20 slots remaining')
    .replaceAll('resolved=2821 p20_remaining=564','resolved=2915 p20_remaining=470');
  await write(file,text);
}

{
  const file='docs/DATA-COMPLETION-PLAN.md';
  let text=await read(file);
  text=text.replace('- **2,821 resolved**','- **2,915 resolved**')
    .replace('- **17,294 unresolved**','- **17,200 unresolved**')
    .replace('- **14.03% resolved**','- **14.49% resolved**')
    .replace('| P20 | 564 |','| P20 | 470 |')
    .replace('- **141 P20 slots resolved across tranches 1–2**.','- **141 P20 slots resolved across tranches 1–2**.\n- 47/47 KDHS 2022 teenage-pregnancy estimates and 47/47 home-birth estimates promoted with the source-reported weighted denominator retained as survey precision metadata; point-estimate rankings remain withheld.\n- **235 P20 slots resolved across tranches 1–3**.')
    .replace('**Remaining queue:** **564**.','**Remaining queue:** **470**.');
  if(!text.includes('**Remaining queue:** **470**.')) throw new Error('P20 KDHS patch failed: completion plan baseline not updated');
  await write(file,text);
}

{
  const file='data/data-completion-roadmap.json';
  const doc=JSON.parse(await read(file));
  doc.baseline.resolved_slots=2915;
  doc.baseline.unresolved_slots=17200;
  doc.baseline.resolved_pct=14.49;
  doc.baseline.remaining_by_phase.P20=470;
  const p20=(doc.phases||[]).find(phase=>phase.id==='P20');
  if(!p20) throw new Error('P20 KDHS patch failed: P20 roadmap phase missing');
  p20.progress=p20.progress||{};
  p20.progress.resolved_in_tranche_3=94;
  p20.progress.resolved_total=235;
  p20.progress.remaining_slots=470;
  p20.progress.tranche_3_note='94 county slots promoted from KDHS 2022: teenage pregnancy (Table 6C) and home births (Table 9.7C), 47 counties each. Published weighted denominators are retained as survey precision metadata; point-estimate rankings remain withheld.';
  await write(file,JSON.stringify(doc,null,2));
}

console.log('P20_KDHS_PROMOTION_PATCH_OK expected_resolved=2915 expected_remaining=470');
