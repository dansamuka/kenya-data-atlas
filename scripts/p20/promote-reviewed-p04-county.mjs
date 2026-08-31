import { readFile, writeFile } from 'node:fs/promises';

const read = file => readFile(file, 'utf8');
const write = (file, content) => writeFile(file, content.endsWith('\n') ? content : `${content}\n`);
const replaceOnce = (text, from, to, label) => {
  const at = text.indexOf(from);
  if (at < 0) throw new Error(`P20 P04 patch failed: anchor not found for ${label}`);
  if (text.indexOf(from, at + from.length) >= 0) throw new Error(`P20 P04 patch failed: anchor is not unique for ${label}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
};

// Wire the reviewed P04 promotions into the deterministic build/test pipeline.
{
  const file = 'package.json';
  const pkg = JSON.parse(await read(file));
  pkg.scripts['indicators:build'] = pkg.scripts['indicators:build'].replace(
    'node scripts/p20/build-audit-opinion.mjs indicators && node scripts/life/build-native.mjs indicators',
    'node scripts/p20/build-audit-opinion.mjs indicators && node scripts/p20/build-reviewed-p04-county.mjs && node scripts/life/build-native.mjs indicators'
  );
  pkg.scripts['p20:validate'] = 'node scripts/p20/validate-sourced-county.mjs && node scripts/p20/validate-audit-opinion.mjs && node scripts/p20/validate-reviewed-p04-county.mjs';
  await write(file, JSON.stringify(pkg, null, 2));
}

// Make source changes to the reviewed P04 snapshots regenerate canonical products.
{
  const file = '.github/workflows/placeholder-taxonomy.yml';
  let text = await read(file);
  text = replaceOnce(text,
    "      - 'data/countyiq/source/p10-fiscal-accountability-2024-25.json'\n",
    "      - 'data/countyiq/source/p10-fiscal-accountability-2024-25.json'\n      - 'data/p04/county-social-outcomes.json'\n      - 'data/p04/health-facility-census-2023.json'\n",
    'generated-products P04 source triggers');
  await write(file, text);
}

// Earlier P20 validators retain their source-specific checks but move their
// global completeness assertions to the new cumulative tranche state.
for (const file of ['scripts/p20/validate-sourced-county.mjs','scripts/p20/validate-audit-opinion.mjs']) {
  let text = await read(file);
  text = text.replaceAll('summary.resolved_slots === 2821', 'summary.resolved_slots === 3056')
    .replaceAll('2,821 resolved slots', '3,056 resolved slots')
    .replaceAll('summary.unresolved_slots === 17294', 'summary.unresolved_slots === 17059')
    .replaceAll('17,294 unresolved slots', '17,059 unresolved slots')
    .replaceAll('summary.by_completion_phase?.P20 === 564', 'summary.by_completion_phase?.P20 === 329')
    .replaceAll('564 P20 slots remaining', '329 P20 slots remaining')
    .replaceAll('resolved=2821 p20_remaining=564', 'resolved=3056 p20_remaining=329');
  await write(file, text);
}

// Refresh the human-readable programme baseline/progress.
{
  const file = 'docs/DATA-COMPLETION-PLAN.md';
  let text = await read(file);
  text = text.replace('- **2,821 resolved**', '- **3,056 resolved**')
    .replace('- **17,294 unresolved**', '- **17,059 unresolved**')
    .replace('- **14.03% resolved**', '- **15.19% resolved**')
    .replace('| P20 | 564 |', '| P20 | 329 |')
    .replace('- **141 P20 slots resolved across tranches 1–2**.', '- **141 P20 slots resolved across tranches 1–2**.\n- 47/47 county monetary-poverty estimates, 47/47 under-5 stunting estimates, 47/47 basic-immunisation estimates, 47/47 skilled-birth-attendance estimates, and 47/47 2023 Health Facility Census assessed-facility counts promoted from the already-reviewed P04 source snapshots. Survey precision metadata is retained and point-estimate rankings remain withheld.\n- **376 P20 slots resolved across tranches 1–3**.')
    .replace('**Remaining queue:** **564**.', '**Remaining queue:** **329**.');
  await write(file, text);
}

// Refresh machine-readable programme authority.
{
  const file = 'data/data-completion-roadmap.json';
  const doc = JSON.parse(await read(file));
  doc.baseline.resolved_slots = 3056;
  doc.baseline.unresolved_slots = 17059;
  doc.baseline.resolved_pct = 15.19;
  doc.baseline.remaining_by_phase.P20 = 329;
  const p20 = (doc.phases || []).find(phase => phase.id === 'P20');
  if (!p20) throw new Error('P20 P04 patch failed: P20 roadmap phase missing');
  p20.progress = p20.progress || {};
  p20.progress.resolved_in_tranche_3 = 235;
  p20.progress.resolved_total = 376;
  p20.progress.remaining_slots = 329;
  p20.progress.tranche_3_note = '235 county slots promoted from already-reviewed P04 official source snapshots: poverty, under-5 stunting, basic immunisation, skilled birth attendance, and assessed health-facility counts (47 counties each). Survey standard-error/denominator metadata is retained and point-estimate ranking remains withheld.';
  await write(file, JSON.stringify(doc, null, 2));
}

console.log('P20_P04_PROMOTION_PATCH_OK build=wired validators=updated docs=updated expected_resolved=3056 expected_remaining=329');
