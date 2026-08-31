import { readFile, writeFile } from 'node:fs/promises';

const read = file => readFile(file, 'utf8');
const write = (file, content) => writeFile(file, content.endsWith('\n') ? content : `${content}\n`);
const replaceOnce = (text, from, to, label) => {
  const at = text.indexOf(from);
  if (at < 0) throw new Error(`P20 audit promotion patch failed: anchor not found for ${label}`);
  if (text.indexOf(from, at + from.length) >= 0) throw new Error(`P20 audit promotion patch failed: anchor is not unique for ${label}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
};

// 1) Upgrade the reviewed P10 source snapshot from a partial indexed extract to
// the complete primary OAG Appendix 1(a) verification.
{
  const file = 'data/countyiq/source/p10-fiscal-accountability-2024-25.json';
  const doc = JSON.parse(await read(file));
  const qualified = Array.from({length: 47}, (_, i) => `KEN-C${String(i + 1).padStart(3, '0')}`);
  doc.method_notes = (doc.method_notes || []).map(note => String(note).startsWith('Audit opinion is a categorical accountability signal')
    ? "Audit opinion is a categorical accountability signal, not a scored component. OAG Appendix 1(a), report pages 69–70, explicitly lists all forty-seven County Executives as 'Qualified' for FY 2023/24; no County Executive recorded an Unqualified, Adverse or Disclaimer opinion."
    : note);
  doc.audit_context_2023_24 = {
    no_county_executive_unqualified: true,
    all_county_executives_qualified: true,
    qualified_geo_codes: qualified,
    no_county_executive_adverse: true,
    no_county_executive_disclaimer: true,
    source_table: 'Appendix 1(a)',
    source_pages: '69-70',
    verification_note: "Primary OAG Appendix 1(a) was re-checked end-to-end on 2026-08-31; all 47 County Executives are explicitly listed as Qualified."
  };
  await write(file, JSON.stringify(doc, null, 2));
}

// 2) Wire the dedicated audit builder/validator into the deterministic pipeline.
{
  const file = 'package.json';
  const pkg = JSON.parse(await read(file));
  pkg.scripts['catalogue:build'] = pkg.scripts['catalogue:build'].replace(
    'node scripts/p20/build-sourced-county.mjs catalogue',
    'node scripts/p20/build-sourced-county.mjs catalogue && node scripts/p20/build-audit-opinion.mjs catalogue'
  );
  pkg.scripts['indicators:build'] = pkg.scripts['indicators:build'].replace(
    'node scripts/p20/build-sourced-county.mjs indicators',
    'node scripts/p20/build-sourced-county.mjs indicators && node scripts/p20/build-audit-opinion.mjs indicators'
  );
  pkg.scripts['p20:validate'] = 'node scripts/p20/validate-sourced-county.mjs && node scripts/p20/validate-audit-opinion.mjs';
  await write(file, JSON.stringify(pkg, null, 2));
}

// 3) First-class categorical observation contract: numeric observations keep
// `value`; categorical observations carry `text_value` with a null numeric value.
{
  const file = 'scripts/indicators/validate-registry.mjs';
  let text = await read(file);
  text = replaceOnce(text,
    "const unitIds = new Set(units.map(u => u.unit_id));\n",
    "const unitIds = new Set(units.map(u => u.unit_id));\nconst unitById = new Map(units.map(u => [u.unit_id, u]));\n",
    'indicator unit lookup');
  text = replaceOnce(text,
    "  if (typeof o.value !== 'number' || Number.isNaN(o.value)) errors.push(`observation ${o.observation_id}: value must be a finite number`);\n",
    "  const observationUnit = unitById.get(parent.unit_id);\n  if (observationUnit?.dimension === 'category') {\n    if (o.value !== null && o.value !== undefined) errors.push(`observation ${o.observation_id}: categorical observation must not carry a numeric value`);\n    if (typeof o.text_value !== 'string' || !o.text_value.trim()) errors.push(`observation ${o.observation_id}: categorical observation requires non-empty text_value`);\n  } else {\n    if (typeof o.value !== 'number' || !Number.isFinite(o.value)) errors.push(`observation ${o.observation_id}: value must be a finite number`);\n    if (o.text_value !== null && o.text_value !== undefined && String(o.text_value).trim()) errors.push(`observation ${o.observation_id}: numeric observation must not carry text_value`);\n  }\n",
    'categorical observation validation');
  await write(file, text);
}

{
  const file = 'db/schema/indicators.sql';
  let text = await read(file);
  text = replaceOnce(text,
    '  value numeric NOT NULL,\n',
    "  value numeric,\n  text_value text,\n  CHECK ((value IS NOT NULL AND text_value IS NULL) OR (value IS NULL AND NULLIF(BTRIM(text_value), '') IS NOT NULL)),\n",
    'observation numeric/text value schema');
  await write(file, text);
}

// 4) Render categorical text directly in profiles and exports.
{
  const file = 'assets/place-profile.js';
  let text = await read(file);
  text = replaceOnce(text,
    "'index_score':'score',category:'category',km:'km'",
    "'index_score':'score',category:'',km:'km'",
    'category unit chip');
  text = replaceOnce(text,
    "  function formatValue(value,unit){\n    const v=Number(value); if(!Number.isFinite(v))return '—';\n",
    "  function formatValue(value,unit){\n    if(unit?.code==='category')return String(value??'').trim()||'—';\n    const v=Number(value); if(!Number.isFinite(v))return '—';\n",
    'category formatter');
  text = text.replaceAll('formatValue(pair.obs.value,unit)', 'formatValue(pair.obs.text_value??pair.obs.value,unit)');
  text = replaceOnce(text,
    "q(p?.obs?.value??''),q(unitLabel(u))",
    "q(p?.obs?.text_value??p?.obs?.value??''),q(unitLabel(u))",
    'profile CSV categorical export');
  await write(file, text);
}

// 5) Preserve categorical evidence in the exact completeness ledger.
{
  const file = 'scripts/completeness/build-slot-ledger.mjs';
  let text = await read(file);
  const before = "value:pair?.obs?.value??''";
  const count = text.split(before).length - 1;
  if (count !== 2) throw new Error(`P20 audit promotion patch failed: expected 2 completeness value anchors, found ${count}`);
  text = text.replaceAll(before, "value:pair?.obs?.text_value??pair?.obs?.value??''");
  await write(file, text);
}

// 6) Existing tranche validator keeps its original source reconciliation but no
// longer asserts that the newly verified audit slot is unresolved.
{
  const file = 'scripts/p20/validate-sourced-county.mjs';
  let text = await read(file);
  text = replaceOnce(text, "    'IND-COUNTY-AUDIT-OPINION',\n", '', 'remove audit scope guard');
  text = replaceOnce(text,
    "  console.log('P20_SCOPE_GUARDS_OK pending_bills=audit=substance=facility_density=unresolved');",
    "  console.log('P20_SCOPE_GUARDS_OK pending_bills=substance=facility_density=unresolved');",
    'scope guard message');
  text = text.replace('summary.resolved_slots === 2774', 'summary.resolved_slots === 2821')
    .replace('expected 2,774 resolved slots after first P20 tranche', 'expected 2,821 resolved slots after P20 audit tranche')
    .replace('summary.unresolved_slots === 17341', 'summary.unresolved_slots === 17294')
    .replace('expected 17,341 unresolved slots', 'expected 17,294 unresolved slots')
    .replace('summary.by_completion_phase?.P20 === 611', 'summary.by_completion_phase?.P20 === 564')
    .replace('expected 611 P20 slots remaining', 'expected 564 P20 slots remaining')
    .replace("P20_COMPLETENESS_OK resolved=2774 p20_remaining=611", "P20_COMPLETENESS_OK resolved=2821 p20_remaining=564")
    .replace("P20_FIRST_TRANCHE_ALL_OK", "P20_SOURCE_TRANCHES_ALL_OK");
  await write(file, text);
}

// 7) Refresh governed completion documentation. The generated completeness
// summary remains authoritative and is rebuilt after this patch.
{
  const file = 'docs/DATA-COMPLETION-PLAN.md';
  let text = await read(file);
  text = text.replace('- **2,774 resolved**', '- **2,821 resolved**')
    .replace('- **17,341 unresolved**', '- **17,294 unresolved**')
    .replace('- **13.79% resolved**', '- **14.03% resolved**')
    .replace('| P20 | 611 |', '| P20 | 564 |')
    .replace('- **94 slots resolved in tranche 1**.', "- **94 slots resolved in tranche 1**.\n- 47/47 FY2023/24 County Executive audit opinions, verified directly from OAG Appendix 1(a), pages 69–70; all are categorically **Qualified**.\n- **141 P20 slots resolved across tranches 1–2**.")
    .replace('**Remaining queue:** **611**.', '**Remaining queue:** **564**.');
  await write(file, text);
}

{
  const file = 'data/data-completion-roadmap.json';
  const doc = JSON.parse(await read(file));
  const baseline = doc.baseline || {};
  if ('resolved_slots' in baseline) baseline.resolved_slots = 2821;
  if ('unresolved_slots' in baseline) baseline.unresolved_slots = 17294;
  if ('resolved_pct' in baseline) baseline.resolved_pct = 14.03;
  if (baseline.remaining_by_phase) baseline.remaining_by_phase.P20 = 564;
  const p20 = (doc.phases || []).find(phase => phase.id === 'P20' || phase.phase_id === 'P20' || phase.phase === 'P20');
  if (p20) {
    p20.status = 'in_progress';
    p20.progress = p20.progress || {};
    p20.progress.resolved_in_tranche_1 = 94;
    p20.progress.resolved_in_tranche_2 = 47;
    p20.progress.resolved_total = 141;
    p20.progress.tranche_2_note = "47/47 County Executive audit-opinion slots promoted from OAG Appendix 1(a), pp. 69–70. All are categorical 'Qualified'; no numeric audit score is created.";
    p20.progress.remaining_slots = 564;
    if ('remaining_slots' in p20) p20.remaining_slots = 564;
  }
  await write(file, JSON.stringify(doc, null, 2));
}

console.log('P20_AUDIT_PROMOTION_PATCH_OK source=47 categorical_contract=ready docs=updated');
