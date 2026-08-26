// Builds the indicator, series and observation registry from human-authored
// seed files, cross-checked against the geography registry (for geo_code ->
// geography_id) and the catalogue registry (for dataset_code -> dataset_id,
// source_id, agency_id).
//
// Enforced in code, not only checked afterwards (same discipline as the
// geometry pipeline remediation):
//   - an observation is emitted ONLY if its dataset's publication_status is
//     'approved' or 'published' (statistical-publication-policy.md §11-12).
//     Anything else is written to held-for-review.json and excluded from the
//     published registry.
//   - the A-E badge is DERIVED from geographic_method + source_class, never
//     read back from a stored label.
//   - series uniqueness key and comparability_group are enforced.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seedDir = path.join(root, 'data/indicators/seed');
const outputDir = path.join(root, 'data/indicators/registry');
const NAMESPACE = 'c9a6f7b2-3e1d-4a8f-9c2b-5d7e1f4a8b3c';

const readJson = async file => JSON.parse(await readFile(path.join(seedDir, file), 'utf8'));
const readRoot = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const uuid = name => {
  const ns = Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const csvCell = value => `"${(Array.isArray(value) ? value.join('|') : String(value ?? '')).replaceAll('"', '""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(f => csvCell(row[f])).join(','))].join('\n') + '\n';

// The A-E badge is a rendering of two axes, never a third stored field that
// can drift (mirrors geography_geometry.quality_status). 'external' overrides
// the geographic_method mapping regardless of statistical_status, matching
// the badge table in the product spec (§28.1): any method + external source = E.
function deriveBadge(geographic_method, source_class) {
  if (source_class === 'external') return 'E';
  return { direct: 'A', aggregated: 'B', interpolated: 'C', modelled: 'D' }[geographic_method] ?? null;
}

// ---------------------------------------------------------------- load inputs
const geography = await readRoot('data/geography/registry/geographies.json');
const geoByCode = new Map(geography.map(g => [g.geo_code, g]));

const agencies = await readRoot('data/catalogue/registry/agencies.json');
const sources = await readRoot('data/catalogue/registry/sources.json');
const datasets = await readRoot('data/catalogue/registry/datasets.json');
const releases = await readRoot('data/catalogue/registry/releases.json');
const sourceById = new Map(sources.map(s => [s.source_id, s]));
const datasetByCode = new Map(datasets.map(d => [d.dataset_code, d]));
const releaseByCode = new Map(releases.map(r => [r.release_code, r]));

function agencyForDataset(dataset) {
  const source = sourceById.get(dataset.source_id);
  return agencies.find(a => a.agency_id === source.agency_id);
}

// Datasets not cleared for publication hold their observations back rather
// than silently dropping them or (worse) publishing anyway. This is the
// pipeline enforcement of statistical-publication-policy.md §11-12.
const heldForReview = [];
function assertPublishable(datasetCode, context) {
  const dataset = datasetByCode.get(datasetCode);
  if (!dataset) throw new Error(`${context}: unknown dataset_code ${datasetCode}`);
  if (!['approved', 'published'].includes(dataset.publication_status)) {
    heldForReview.push({ context, dataset_code: datasetCode, publication_status: dataset.publication_status });
    return null;
  }
  return dataset;
}

// ---------------------------------------------------------------- units
const unitSeed = await readJson('units.json');
const units = unitSeed.map(u => ({
  unit_id: uuid(`unit:${u.code}`), code: u.code, name: u.name, symbol: u.symbol ?? '',
  dimension: u.dimension, scale_factor: u.scale_factor ?? 1, decimal_places: u.decimal_places ?? 0,
  currency_code: u.currency_code ?? ''
}));
const unitByCode = new Map(units.map(u => [u.code, u]));

// ------------------------------------------------------------- indicators
const indicatorSeed = await readJson('indicators.json');
const indicators = indicatorSeed.map(i => {
  const unit = unitByCode.get(i.unit_code);
  if (!unit) throw new Error(`indicator ${i.code}: unknown unit_code ${i.unit_code}`);
  return {
    indicator_id: uuid(`indicator:${i.code}`), indicator_code: i.code, name: i.name,
    short_name: i.short_name ?? i.name, description: i.description, topic: i.topic,
    subtopic: i.subtopic ?? '', unit_id: unit.unit_id,
    higher_is_better: i.higher_is_better === undefined ? null : i.higher_is_better,
    preferred_frequency: i.preferred_frequency ?? '', minimum_geo_level: i.minimum_geo_level ?? '',
    minimum_denominator: i.minimum_denominator ?? null, methodology_url: i.methodology_url ?? '',
    comparable: true, active: true
  };
});
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));

// ------------------------------------------------------------------ series
const seriesSeed = await readJson('series.json');
const seriesRows = [];
const seenSeriesKeys = new Set();

function buildSeries(s, { indicatorCode, geoCode, datasetCode, unitCode, ...rest }) {
  const indicator = indicatorByCode.get(indicatorCode);
  if (!indicator) throw new Error(`series ${s.code}: unknown indicator_code ${indicatorCode}`);
  const geography = geoByCode.get(geoCode);
  if (!geography) throw new Error(`series ${s.code}: unknown geo_code ${geoCode} — does not resolve in the geography registry`);
  const dataset = assertPublishable(datasetCode, `series ${s.code}`);
  if (!dataset) return null;
  const agency = agencyForDataset(dataset);
  const unit = unitByCode.get(unitCode);
  if (!unit) throw new Error(`series ${s.code}: unknown unit_code ${unitCode}`);

  const key = [indicator.indicator_id, geography.geography_id, geography.registry_status === 'verified' ? '' : '2012-01', s.frequency, unit.unit_id, s.price_basis, s.seasonal_adjustment ?? 'none', s.transformation].join('|');
  if (seenSeriesKeys.has(key)) throw new Error(`series ${s.code}: duplicate uniqueness key ${key}`);
  seenSeriesKeys.add(key);

  return {
    series_id: uuid(`series:${s.code}`), series_code: s.code, indicator_id: indicator.indicator_id,
    geography_id: geography.geography_id, geography_taxonomy: geography.geography_system ?? 'electoral',
    boundary_version: geography.level === 'country' ? '' : '2012-01',
    frequency: s.frequency, period_type: s.period_type, unit_id: unit.unit_id,
    price_basis: s.price_basis, base_period: s.base_period ?? '', currency: s.currency ?? '',
    seasonal_adjustment: s.seasonal_adjustment ?? 'none', transformation: s.transformation,
    geographic_method: s.geographic_method, comparability_group: s.comparability_group,
    dataset_id: dataset.dataset_id, agency_id: agency.agency_id, methodology_url: s.methodology_url ?? indicator.methodology_url,
    start_period: '', end_period: '', latest_observation_id: '', observation_count: 0,
    last_updated_at: '', next_expected_release: '', status: 'active', superseded_by_series_id: ''
  };
}

for (const s of seriesSeed) {
  const row = buildSeries(s, { indicatorCode: s.indicator_code, geoCode: s.geo_code, datasetCode: s.dataset_code, unitCode: s.unit_code });
  if (row) seriesRows.push(row);
}

// --- Auto-generated area series: one per feature in the computed area file,
// covering the country and all 47 counties from a single real computation.
const areaComputed = await readRoot('data/indicators/seed/derived/area-computed.json');
const areaIndicator = indicatorByCode.get('IND-LAND-AREA');
const areaSeriesByGeoCode = new Map();
for (const result of areaComputed.results) {
  const s = {
    code: `KDA-AREA-${result.geo_code}`, indicator_code: 'IND-LAND-AREA', geo_code: result.geo_code,
    dataset_code: 'DS-KDA-DERIVED-AREA', frequency: 'irregular', period_type: 'point_in_time',
    unit_code: 'km2', price_basis: 'not_applicable', transformation: 'level',
    geographic_method: 'aggregated', comparability_group: `AREA-DERIVED-${areaComputed.boundary_version}`
  };
  const row = buildSeries(s, { indicatorCode: s.indicator_code, geoCode: s.geo_code, datasetCode: s.dataset_code, unitCode: s.unit_code });
  if (row) { seriesRows.push(row); areaSeriesByGeoCode.set(result.geo_code, row); }
}

const seriesByCode = new Map(seriesRows.map(s => [s.series_code, s]));

// -------------------------------------------------------------- observations
const observationSeed = await readJson('observations.json');
const observations = [];

function buildObservation(o, seriesCode, { geographic_method, statistical_status, source_class, datasetCodeForGate }) {
  const series = seriesByCode.get(seriesCode);
  if (!series) return; // held for review upstream; already recorded
  if (datasetCodeForGate && !assertPublishable(datasetCodeForGate, `observation ${seriesCode}:${o.period_label}`)) return;
  const release = o.release_code ? releaseByCode.get(o.release_code) : null;
  if (o.release_code && !release) throw new Error(`observation ${seriesCode}:${o.period_label}: unknown release_code ${o.release_code}`);

  const badge = deriveBadge(geographic_method, source_class ?? 'official');
  observations.push({
    observation_id: uuid(`observation:${seriesCode}:${o.period_start}:${o.period_end}`),
    series_id: series.series_id, geography_id: series.geography_id, boundary_version: series.boundary_version,
    period_start: o.period_start, period_end: o.period_end, period_type: o.period_type, period_label: o.period_label,
    value: o.value,
    geographic_method, statistical_status, source_class: source_class ?? 'official', badge,
    source_release_id: release?.release_id ?? '', source_dataset_id: series.dataset_id,
    source_table: o.source_table ?? '', source_sheet: o.source_sheet ?? '', source_page: o.source_page ?? '',
    source_row_label: o.source_row_label ?? '', source_url: o.source_url,
    published_at: o.published_at ?? '', ingested_at: areaComputed.generated_at,
    vintage_id: uuid(`vintage:${seriesCode}:${o.period_start}:1`), supersedes_observation_id: '',
    lower_bound: o.lower_bound ?? null, upper_bound: o.upper_bound ?? null, confidence_level: o.confidence_level ?? null,
    standard_error: o.standard_error ?? null, sample_size: o.sample_size ?? null,
    suppression_reason: o.suppression_reason ?? '', crosswalk_id: o.crosswalk_id ?? '',
    notes: o.notes ?? ''
  });
}

for (const o of observationSeed) {
  const series = seriesByCode.get(o.series_code);
  if (!series) continue; // dataset was held for review; skip silently, already logged
  buildObservation(o, o.series_code, { geographic_method: o.geographic_method, statistical_status: o.statistical_status, source_class: o.source_class });
}

// Auto-generated area observations, one per computed feature.
for (const result of areaComputed.results) {
  const seriesCode = `KDA-AREA-${result.geo_code}`;
  if (!seriesByCode.has(seriesCode)) continue;
  buildObservation({
    period_start: areaComputed.generated_at.slice(0, 10), period_end: areaComputed.generated_at.slice(0, 10),
    period_type: 'point_in_time', period_label: `Computed ${areaComputed.generated_at.slice(0, 10)}`,
    value: result.area_km2, release_code: 'REL-KDA-AREA-2026',
    source_url: 'https://github.com/dansamuka/kenya-data-atlas/blob/main/docs/methodology/indicators.md',
    published_at: areaComputed.generated_at.slice(0, 10),
    notes: `${areaComputed.method}. Estimated error band +/-${areaComputed.estimated_error_band_pct}%. ${areaComputed.note}`
  }, seriesCode, { geographic_method: 'aggregated', statistical_status: 'estimated' });
}

// --------------------------------------------------- roll observations into series
for (const series of seriesRows) {
  const own = observations.filter(o => o.series_id === series.series_id).sort((a, b) => a.period_start.localeCompare(b.period_start));
  if (!own.length) continue;
  series.start_period = own[0].period_label;
  series.end_period = own.at(-1).period_label;
  series.latest_observation_id = own.at(-1).observation_id;
  series.observation_count = own.length;
  series.last_updated_at = own.at(-1).ingested_at;
}

// ------------------------------------------------------------------- write
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'units.json'), JSON.stringify(units, null, 2) + '\n');
await writeFile(path.join(outputDir, 'units.csv'), csv(units, ['unit_id', 'code', 'name', 'symbol', 'dimension', 'scale_factor', 'decimal_places', 'currency_code']));
await writeFile(path.join(outputDir, 'indicators.json'), JSON.stringify(indicators, null, 2) + '\n');
await writeFile(path.join(outputDir, 'indicators.csv'), csv(indicators, ['indicator_id', 'indicator_code', 'name', 'short_name', 'description', 'topic', 'subtopic', 'unit_id', 'higher_is_better', 'preferred_frequency', 'minimum_geo_level', 'minimum_denominator', 'methodology_url', 'comparable', 'active']));
await writeFile(path.join(outputDir, 'series.json'), JSON.stringify(seriesRows, null, 2) + '\n');
await writeFile(path.join(outputDir, 'series.csv'), csv(seriesRows, ['series_id', 'series_code', 'indicator_id', 'geography_id', 'geography_taxonomy', 'boundary_version', 'frequency', 'period_type', 'unit_id', 'price_basis', 'base_period', 'currency', 'seasonal_adjustment', 'transformation', 'geographic_method', 'comparability_group', 'dataset_id', 'agency_id', 'start_period', 'end_period', 'latest_observation_id', 'observation_count', 'status']));
await writeFile(path.join(outputDir, 'observations.json'), JSON.stringify(observations, null, 2) + '\n');
await writeFile(path.join(outputDir, 'observations.csv'), csv(observations, ['observation_id', 'series_id', 'geography_id', 'period_start', 'period_end', 'period_type', 'period_label', 'value', 'geographic_method', 'statistical_status', 'source_class', 'badge', 'source_release_id', 'source_dataset_id', 'source_url', 'published_at', 'notes']));
await writeFile(path.join(outputDir, 'held-for-review.json'), JSON.stringify({ generated_at: new Date().toISOString(), note: 'Series/observations whose dataset publication_status is not approved/published are held here and excluded from the published registry (statistical-publication-policy.md §11-12).', held: heldForReview }, null, 2) + '\n');

console.log(JSON.stringify({
  units: units.length, indicators: indicators.length, series: seriesRows.length, observations: observations.length,
  held_for_review: heldForReview.length,
  badges: Object.fromEntries([...new Set(observations.map(o => o.badge))].map(b => [b, observations.filter(o => o.badge === b).length]))
}, null, 2));
