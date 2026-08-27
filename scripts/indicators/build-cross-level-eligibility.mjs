#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const [indicators, units, series, observations, geography] = await Promise.all([
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/units.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/geography/registry/geographies.json')
]);

const unitById = new Map(units.map(u => [u.unit_id, u]));
const geoById = new Map(geography.map(g => [g.geography_id, g]));
const obsCount = new Map();
for (const o of observations) obsCount.set(o.series_id, (obsCount.get(o.series_id) || 0) + 1);

const rows = [];
for (const indicator of indicators) {
  const own = series.filter(s => s.indicator_id === indicator.indicator_id && (obsCount.get(s.series_id) || 0) > 0);
  if (!own.length) continue;
  const unit = unitById.get(indicator.unit_id);
  const levels = [...new Set(own.map(s => geoById.get(s.geography_id)?.level).filter(Boolean))].sort();
  const normalizedByUnit = ['ratio', 'rate', 'index'].includes(unit?.dimension);
  const normalizedByTransform = own.some(s => ['rate', 'share', 'per_capita'].includes(s.transformation));
  const areaException = indicator.indicator_code === 'IND-LAND-AREA';
  const eligible = areaException || normalizedByUnit || normalizedByTransform;
  rows.push({
    indicator_code: indicator.indicator_code,
    indicator_id: indicator.indicator_id,
    name: indicator.name,
    unit_code: unit?.code || '',
    unit_dimension: unit?.dimension || '',
    available_levels: levels,
    cross_level_eligible: eligible,
    rule_basis: areaException ? 'physical-area exception' : normalizedByUnit ? `unit.dimension=${unit.dimension}` : normalizedByTransform ? 'series transformation is rate/share/per_capita' : 'raw count/currency/other total — same-level only'
  });
}
rows.sort((a,b) => a.name.localeCompare(b.name));

await writeFile(path.join(root, 'data/indicators/registry/cross-level-eligibility.json'), JSON.stringify({
  generated_from_registry: true,
  rule: "Cross-level comparison requires unit dimension ratio/rate/index or a rate/share/per_capita series transformation. IND-LAND-AREA is the sole physical-area exception. Raw counts and currency totals remain same-level only.",
  indicators: rows
}, null, 2) + '\n');
console.log(`Cross-level eligibility derived for ${rows.length} indicators; ${rows.filter(r => r.cross_level_eligible).length} eligible in principle.`);
