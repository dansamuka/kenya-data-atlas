import fs from 'node:fs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

// Correct the placeholder metadata to the exact primary table now governed by P20.
const taxonomyPath = 'data/indicators/seed/placeholder-taxonomy.json';
const taxonomy = readJson(taxonomyPath);
const household = (taxonomy.indicators || []).find(row => row.code === 'IND-HOUSEHOLD-SIZE');
if (!household) throw new Error('P20 household-size prep: taxonomy indicator missing');
household.source = 'KNBS 2019 Kenya Population and Housing Census, Volume I, Table 2.3';
household.source_url = 'https://repository.knbs.or.ke/handle/knbs-ke-repo/385';
household.note = 'County average household size is published directly in Volume I Table 2.3. Do not inherit county values to constituencies; lower-level activation requires its own governed source mapping.';
writeJson(taxonomyPath, taxonomy);

// County geo codes are authoritative for source reconciliation. Normalize only
// punctuation/spacing in the redundant name cross-check so official spellings
// such as Taita/Taveta and canonical Taita Taveta reconcile without weakening
// the exact KEN-C001..C047 code gate.
const builderPath = 'scripts/p20/build-household-size.mjs';
let builder = fs.readFileSync(builderPath, 'utf8');
if (!builder.includes('const normalizeCountyName = value =>')) {
  builder = builder.replace(
    "const formalCountyName = geo => geo?.geo_code === 'KEN-C047' ? 'Nairobi City' : geo?.name;",
    "const formalCountyName = geo => geo?.geo_code === 'KEN-C047' ? 'Nairobi City' : geo?.name;\nconst normalizeCountyName = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');"
  );
}
builder = builder.replace(
  'if (sourceRow.county_name !== formalCountyName(county)) {',
  'if (normalizeCountyName(sourceRow.county_name) !== normalizeCountyName(formalCountyName(county))) {'
);
fs.writeFileSync(builderPath, builder);

// Update the machine-readable completion programme after the 47-county tranche.
const roadmapPath = 'data/data-completion-roadmap.json';
const roadmap = readJson(roadmapPath);
Object.assign(roadmap.baseline, {
  resolved_slots: 2868,
  unresolved_slots: 17247,
  resolved_pct: 14.26
});
roadmap.baseline.remaining_by_phase.P20 = 517;
const p20 = roadmap.phases.find(phase => phase.id === 'P20');
if (!p20) throw new Error('P20 household-size prep: roadmap P20 phase missing');
Object.assign(p20.progress, {
  remaining_slots: 517,
  resolved_in_tranche_3: 47,
  resolved_total: 188,
  tranche_3_note: '47/47 county average-household-size slots promoted from KNBS 2019 KPHC Volume I Table 2.3. Values are direct census observations; no constituency inheritance is applied.'
});
writeJson(roadmapPath, roadmap);

// Keep the human-readable completion plan synchronized with the ledger target.
const docsPath = 'docs/DATA-COMPLETION-PLAN.md';
let docs = fs.readFileSync(docsPath, 'utf8');
docs = docs
  .replace('- **2,821 resolved**', '- **2,868 resolved**')
  .replace('- **17,294 unresolved**', '- **17,247 unresolved**')
  .replace('- **14.03% resolved**', '- **14.26% resolved**')
  .replace('| P20 | 564 |', '| P20 | 517 |')
  .replace('- **141 P20 slots resolved across tranches 1–2**.\n\n**Remaining queue:** **564**.', '- **141 P20 slots resolved across tranches 1–2**.\n- 47/47 county average-household-size slots from KNBS 2019 KPHC Volume I Table 2.3.\n- **188 P20 slots resolved across tranches 1–3**.\n\n**Remaining queue:** **517**.');
fs.writeFileSync(docsPath, docs);

// Existing tranche validators assert the global completeness totals as a release gate.
for (const file of ['scripts/p20/validate-sourced-county.mjs', 'scripts/p20/validate-audit-opinion.mjs']) {
  let text = fs.readFileSync(file, 'utf8');
  text = text
    .replaceAll('summary.resolved_slots === 2821', 'summary.resolved_slots === 2868')
    .replaceAll('2,821 resolved slots', '2,868 resolved slots')
    .replaceAll('summary.unresolved_slots === 17294', 'summary.unresolved_slots === 17247')
    .replaceAll('17,294 unresolved slots', '17,247 unresolved slots')
    .replaceAll('summary.by_completion_phase?.P20 === 564', 'summary.by_completion_phase?.P20 === 517')
    .replaceAll('564 P20 slots remaining', '517 P20 slots remaining')
    .replaceAll('resolved=2821 p20_remaining=564', 'resolved=2868 p20_remaining=517');
  fs.writeFileSync(file, text);
}

console.log('P20_HOUSEHOLD_SIZE_PREP_OK expected_resolved=2868 expected_p20_remaining=517');
