#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function patchFile(rel, transform) {
  const abs = path.join(root, rel);
  const before = await readFile(abs, 'utf8');
  const after = transform(before);
  if (after === before) { console.log(`${rel}: already patched`); return; }
  await writeFile(abs, after);
  console.log(`${rel}: patched`);
}

await patchFile('db/schema/indicators.sql', text => {
  let out = text;
  if (!out.includes('comparable_alternate_series_id uuid REFERENCES series(series_id)')) {
    out = out.replace(
      "  superseded_by_series_id uuid REFERENCES series(series_id),\n\n  CHECK (price_basis",
      "  superseded_by_series_id uuid REFERENCES series(series_id),\n\n  -- Comparable concept from an independent source/method. This is display metadata,\n  -- never a merge: both series retain their own lifecycle, provenance and observations.\n  comparable_alternate_series_id uuid REFERENCES series(series_id),\n\n  CHECK (price_basis"
    );
    out = out.replace(
      'CREATE INDEX series_comparability_idx ON series(comparability_group);',
      'CREATE INDEX series_comparability_idx ON series(comparability_group);\nCREATE INDEX series_alternate_idx ON series(comparable_alternate_series_id);'
    );
  }
  out = out.replace(
    "CHECK (geographic_method = 'direct' OR crosswalk_id IS NOT NULL OR geographic_method = 'aggregated'),",
    "CHECK (geographic_method IN ('direct', 'aggregated', 'modelled') OR crosswalk_id IS NOT NULL),"
  );
  return out;
});

await patchFile('scripts/indicators/validate-registry.mjs', text => {
  if (text.includes('// ------------------------------------------------ alternate-series symmetry')) return text;
  const marker = '// ------------------------------------------------------------- observations\n';
  const block = `// ------------------------------------------------ alternate-series symmetry\n// Comparable alternates are independent series joined only for display. The\n// link must be symmetric, never self-referential, and never cross a non-active\n// lifecycle boundary. Freshness selects display position only.\nconst seriesByIdForAlternates = new Map(series.map(s => [s.series_id, s]));\nconst indicatorByIdForAlternates = new Map(indicators.map(i => [i.indicator_id, i]));\nfor (const s of series) {\n  if (!s.comparable_alternate_series_id) continue;\n  const alternate = seriesByIdForAlternates.get(s.comparable_alternate_series_id);\n  if (!alternate) { errors.push(\`series \${s.series_code}: comparable_alternate_series_id is orphaned\`); continue; }\n  if (alternate.series_id === s.series_id) errors.push(\`series \${s.series_code}: comparable alternate cannot point to itself\`);\n  if (alternate.comparable_alternate_series_id !== s.series_id) errors.push(\`series \${s.series_code}: alternate link to \${alternate.series_code} is not symmetric\`);\n  const a = indicatorByIdForAlternates.get(s.indicator_id);\n  const b = indicatorByIdForAlternates.get(alternate.indicator_id);\n  if (a?.lifecycle_status && a.lifecycle_status !== 'active') errors.push(\`series \${s.series_code}: alternate-linked indicator \${a.indicator_code} is not active\`);\n  if (b?.lifecycle_status && b.lifecycle_status !== 'active') errors.push(\`series \${s.series_code}: alternate-linked indicator \${b.indicator_code} is not active\`);\n}\n\n`;
  if (!text.includes(marker)) throw new Error('validate-registry.mjs insertion marker not found');
  return text.replace(marker, block + marker);
});
