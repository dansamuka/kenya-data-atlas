#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDICATOR_POLICY_VERSION, crossLevelPolicyForSeries } from '../policy/indicator-policy.mjs';

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
const indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
const geoById = new Map(geography.map(g => [g.geography_id, g]));
const obsCount = new Map();
for (const o of observations) obsCount.set(o.series_id, (obsCount.get(o.series_id) || 0) + 1);

function classifySeries(seriesRow) {
  const indicator = indicatorById.get(seriesRow.indicator_id);
  if (!indicator) throw new Error(`Series ${seriesRow.series_code || seriesRow.series_id} references missing indicator ${seriesRow.indicator_id}`);
  const unit = unitById.get(seriesRow.unit_id || indicator.unit_id);
  const geo = geoById.get(seriesRow.geography_id);
  const policy = crossLevelPolicyForSeries(seriesRow, indicator, unit);

  return {
    series_code: seriesRow.series_code,
    series_id: seriesRow.series_id,
    indicator_code: indicator.indicator_code,
    indicator_id: indicator.indicator_id,
    name: indicator.name,
    geography_id: seriesRow.geography_id,
    geography_code: geo?.geo_code || '',
    geography_level: geo?.level || '',
    unit_code: unit?.code || '',
    unit_dimension: unit?.dimension || '',
    transformation: seriesRow.transformation || '',
    aggregation: seriesRow.aggregation || '',
    cross_level_eligible: policy.eligible,
    rule_basis: policy.rule_basis
  };
}

// Eligibility is deliberately emitted at series granularity. A normalized
// sibling series must never promote a raw-total sibling under the same
// indicator family.
const seriesRows = series
  .filter(s => (obsCount.get(s.series_id) || 0) > 0)
  .map(classifySeries)
  .sort((a, b) => a.name.localeCompare(b.name) || a.geography_level.localeCompare(b.geography_level) || String(a.series_code).localeCompare(String(b.series_code)));

// Conservative indicator summaries are retained only for backward-compatible
// diagnostics. Consumers making a comparison must use the `series` rows.
const byIndicator = new Map();
for (const row of seriesRows) {
  if (!byIndicator.has(row.indicator_id)) byIndicator.set(row.indicator_id, []);
  byIndicator.get(row.indicator_id).push(row);
}
const indicatorRows = [...byIndicator.values()].map(own => ({
  indicator_code: own[0].indicator_code,
  indicator_id: own[0].indicator_id,
  name: own[0].name,
  unit_code: own[0].unit_code,
  unit_dimension: own[0].unit_dimension,
  available_levels: [...new Set(own.map(r => r.geography_level).filter(Boolean))].sort(),
  cross_level_eligible: own.every(r => r.cross_level_eligible),
  rule_basis: own.every(r => r.cross_level_eligible)
    ? 'all published series are cross-level eligible; consult series rows for the operative decision'
    : 'one or more published series are same-level only; consult series rows for the operative decision'
})).sort((a, b) => a.name.localeCompare(b.name));

await writeFile(path.join(root, 'data/indicators/registry/cross-level-eligibility.json'), JSON.stringify({
  schema_version: '2.0.0',
  policy_version: INDICATOR_POLICY_VERSION,
  generated_from_registry: true,
  granularity: 'series',
  rule: 'Cross-level comparison is decided for the concrete selected series by the canonical P12 indicator-policy layer. Ratio/rate/index units or the selected series own rate/share/ratio/percent/per-capita/per-person/density/index transformation are eligible. IND-LAND-AREA is the sole physical-area exception. Raw counts and currency totals remain same-level only; sibling transformations never promote them.',
  series: seriesRows,
  indicators: indicatorRows
}, null, 2) + '\n');
console.log(`Cross-level eligibility derived for ${seriesRows.length} published series; ${seriesRows.filter(r => r.cross_level_eligible).length} eligible in principle; policy=${INDICATOR_POLICY_VERSION}.`);

// Historical national Pulse observations must live in the canonical registry,
// not only in the first-paint UI product. Apply them after all indicator
// promotion steps so Series, Data, distribution exports and Pulse share one
// source of truth.
await import('./apply-pulse-history-backfill.mjs');
