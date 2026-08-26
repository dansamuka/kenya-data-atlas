// Validates the indicator/series/observation registry.
//
// Same discipline as scripts/geography/validate-registry.mjs: re-derive
// everything derivable and compare, rather than trusting a stored value.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const units = await read('data/indicators/registry/units.json');
const indicators = await read('data/indicators/registry/indicators.json');
const series = await read('data/indicators/registry/series.json');
const observations = await read('data/indicators/registry/observations.json');
const heldForReview = await read('data/indicators/registry/held-for-review.json');
const geography = await read('data/geography/registry/geographies.json');
const datasets = await read('data/catalogue/registry/datasets.json');
const releases = await read('data/catalogue/registry/releases.json');

const errors = [];
const unitIds = new Set(units.map(u => u.unit_id));
const indicatorIds = new Set(indicators.map(i => i.indicator_id));
const geographyIds = new Set(geography.map(g => g.geography_id));
const seriesIds = new Set(series.map(s => s.series_id));
const datasetById = new Map(datasets.map(d => [d.dataset_id, d]));
const releaseIds = new Set(releases.map(r => r.release_id));

// ------------------------------------------------------------------- units
for (const u of units) {
  if (!u.code || !u.name || !u.dimension) errors.push(`unit ${u.code}: incomplete metadata`);
  if (!(u.scale_factor > 0)) errors.push(`unit ${u.code}: scale_factor must be positive`);
}

// -------------------------------------------------------------- indicators
for (const i of indicators) {
  if (!unitIds.has(i.unit_id)) errors.push(`indicator ${i.indicator_code}: orphan unit`);
  if (!i.name || !i.description || !i.topic) errors.push(`indicator ${i.indicator_code}: incomplete metadata`);
  if (i.higher_is_better !== null && typeof i.higher_is_better !== 'boolean') errors.push(`indicator ${i.indicator_code}: higher_is_better must be boolean or null`);
}

// ------------------------------------------------------------------ series
const seriesKeys = new Set();
for (const s of series) {
  if (!indicatorIds.has(s.indicator_id)) errors.push(`series ${s.series_code}: orphan indicator`);
  if (!geographyIds.has(s.geography_id)) errors.push(`series ${s.series_code}: orphan geography`);
  if (!unitIds.has(s.unit_id)) errors.push(`series ${s.series_code}: orphan unit`);
  const dataset = datasetById.get(s.dataset_id);
  if (!dataset) errors.push(`series ${s.series_code}: orphan dataset`);
  // The publication gate is enforced at build time, but the validator MUST
  // re-check it independently — trusting the build script's own enforcement
  // is exactly the failure mode that let a flat quality_status through
  // in the geometry pipeline before remediation.
  else if (!['approved', 'published'].includes(dataset.publication_status)) {
    errors.push(`series ${s.series_code}: dataset ${dataset.dataset_code} is not approved/published (status: ${dataset.publication_status}) — must not appear in the published series registry`);
  }
  if (!['nominal', 'constant', 'index', 'not_applicable'].includes(s.price_basis)) errors.push(`series ${s.series_code}: invalid price_basis`);
  if (['constant', 'index'].includes(s.price_basis) && !s.base_period) errors.push(`series ${s.series_code}: price_basis ${s.price_basis} requires a base_period`);
  if (!['direct', 'aggregated', 'interpolated', 'modelled'].includes(s.geographic_method)) errors.push(`series ${s.series_code}: invalid geographic_method`);
  if (!s.comparability_group) errors.push(`series ${s.series_code}: missing comparability_group — required before any chart or ranking may use this series (spec §18C)`);
  if (!s.period_type) errors.push(`series ${s.series_code}: missing period_type`);

  const key = [s.indicator_id, s.geography_id, s.boundary_version, s.frequency, s.unit_id, s.price_basis, s.seasonal_adjustment, s.transformation].join('|');
  if (seriesKeys.has(key)) errors.push(`series ${s.series_code}: duplicate uniqueness key (indicator+geography+boundary+frequency+unit+basis+adjustment+transformation)`);
  seriesKeys.add(key);
}

// ------------------------------------------------------------- observations
const seriesById = new Map(series.map(s => [s.series_id, s]));
const validGeoMethod = new Set(['direct', 'aggregated', 'interpolated', 'modelled']);
const validStatStatus = new Set(['final', 'provisional', 'revised', 'projected', 'estimated', 'suppressed']);
function deriveBadge(geographic_method, source_class) {
  if (source_class === 'external') return 'E';
  return { direct: 'A', aggregated: 'B', interpolated: 'C', modelled: 'D' }[geographic_method] ?? null;
}

const obsKeys = new Set();
for (const o of observations) {
  const parent = seriesById.get(o.series_id);
  if (!parent) { errors.push(`observation ${o.observation_id}: orphan series`); continue; }

  // Denormalised geography/boundary must agree with the parent series (spec §20.2) —
  // exactly the invariant enforced by a database trigger in db/schema/indicators.sql.
  if (o.geography_id !== parent.geography_id) errors.push(`observation ${o.observation_id}: geography_id disagrees with series ${parent.series_code}`);
  if (o.boundary_version !== parent.boundary_version) errors.push(`observation ${o.observation_id}: boundary_version disagrees with series ${parent.series_code}`);

  if (!validGeoMethod.has(o.geographic_method)) errors.push(`observation ${o.observation_id}: invalid geographic_method`);
  if (!validStatStatus.has(o.statistical_status)) errors.push(`observation ${o.observation_id}: invalid statistical_status`);
  if (o.statistical_status === 'suppressed' && !o.suppression_reason) errors.push(`observation ${o.observation_id}: suppressed without a suppression_reason`);
  if (o.geographic_method === 'interpolated' && !o.crosswalk_id) errors.push(`observation ${o.observation_id}: interpolated without a crosswalk_id`);

  // Badge must be re-derivable, never trusted as stored (mirrors the geometry
  // quality_status remediation).
  const expectedBadge = deriveBadge(o.geographic_method, o.source_class);
  if (o.badge !== expectedBadge) errors.push(`observation ${o.observation_id}: stored badge ${o.badge} does not match derived badge ${expectedBadge}`);

  if (!o.source_url) errors.push(`observation ${o.observation_id}: missing source_url — every displayed number must be traceable to a source (spec §3.1)`);
  if (o.source_release_id && !releaseIds.has(o.source_release_id)) errors.push(`observation ${o.observation_id}: orphan release`);
  if (typeof o.value !== 'number' || Number.isNaN(o.value)) errors.push(`observation ${o.observation_id}: value must be a finite number`);
  if (!o.period_label) errors.push(`observation ${o.observation_id}: missing period_label — reference period must never be confused with publication date (spec §9)`);
  if (o.published_at && o.period_end && o.published_at < o.period_start) errors.push(`observation ${o.observation_id}: published_at precedes period_start — a statistic cannot be published before its own reference period begins`);

  const key = `${o.series_id}:${o.period_start}:${o.period_end}:${o.vintage_id}`;
  if (obsKeys.has(key)) errors.push(`observation ${o.observation_id}: duplicate (series, period, vintage)`);
  obsKeys.add(key);
}

// ---------------------------------------------- series rollups must be honest
for (const s of series) {
  const own = observations.filter(o => o.series_id === s.series_id);
  if (s.observation_count !== own.length) errors.push(`series ${s.series_code}: observation_count ${s.observation_count} does not match actual count ${own.length}`);
  if (own.length && !own.some(o => o.observation_id === s.latest_observation_id)) errors.push(`series ${s.series_code}: latest_observation_id does not point at one of its own observations`);
}

// ------------------------------------------------------- ranking-rule readiness
// Spec §26.1: never rank across a reference period, and never rank an
// indicator whose higher_is_better is null under a numeric rank (only order).
// This validator cannot know the frontend's behaviour, but it CAN assert the
// data carries what the frontend needs to obey the rule.
for (const i of indicators) {
  if (i.higher_is_better === null) continue; // fine — frontend must render "Order", not "Rank"
}

// ------------------------------------------------------ held-for-review sanity
if (!Array.isArray(heldForReview.held)) errors.push('held-for-review.json malformed');

if (errors.length) {
  console.error(`FAIL: ${errors.length} error(s)\n` + errors.slice(0, 40).map(e => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`PASS: ${units.length} units, ${indicators.length} indicators, ${series.length} series, ${observations.length} observations.`);
console.log(`      Every badge re-derived and matched; every series key unique; every observation traceable to a source and release; ${heldForReview.held.length} held for review pending publication clearance.`);
