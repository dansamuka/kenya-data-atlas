#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const [config, indicators, series, observations, units, geography, display, eligibility] = await Promise.all([
  read('data/indicators/seed/worldbank-config.json'),
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/indicators/registry/units.json'),
  read('data/geography/registry/geographies.json'),
  read('data/indicators/registry/worldbank-display.json'),
  read('data/indicators/registry/cross-level-eligibility.json')
]);

const errors = [];
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
const seriesById = new Map(series.map(s => [s.series_id, s]));
const unitById = new Map(units.map(u => [u.unit_id, u]));
const geoById = new Map(geography.map(g => [g.geography_id, g]));
const observationsBySeries = new Map();
for (const o of observations) {
  if (!observationsBySeries.has(o.series_id)) observationsBySeries.set(o.series_id, []);
  observationsBySeries.get(o.series_id).push(o);
}
const wbDefs = new Map(config.indicators.map(d => [d.code, d]));

for (const def of config.indicators) {
  const indicator = indicatorByCode.get(def.code);
  if (!indicator) { errors.push(`${def.code}: missing indicator registry row`); continue; }
  if (indicator.lifecycle_status !== def.lifecycle_status) errors.push(`${def.code}: lifecycle ${indicator.lifecycle_status} != configured ${def.lifecycle_status}`);
  const own = series.filter(s => s.indicator_id === indicator.indicator_id);
  if (def.lifecycle_status !== 'active' && own.length) errors.push(`${def.code}: ${def.lifecycle_status} indicator must have zero published series`);
  for (const s of own) {
    const geo = geoById.get(s.geography_id);
    if (geo?.level !== 'country') errors.push(`${def.code}: World Bank series ${s.series_code} is not national-only (${geo?.level || 'unknown'})`);
    if (!String(s.series_code).startsWith('KDA-WB-')) errors.push(`${def.code}: unexpected World Bank series code ${s.series_code}`);
    const history = observationsBySeries.get(s.series_id) || [];
    if (def.lifecycle_status === 'active' && history.length < 2) errors.push(`${def.code}: active national series must retain source history, found ${history.length} observation(s)`);
    const periods = new Set();
    for (const o of history) {
      if (periods.has(o.period_label)) errors.push(`${def.code}: duplicate history period ${o.period_label}`);
      periods.add(o.period_label);
      if (!['B','D'].includes(o.badge)) errors.push(`${def.code}: World Bank observation badge must be B or D, got ${o.badge}`);
      if (def.badge !== o.badge) errors.push(`${def.code}: stored/derived badge ${o.badge} != configured ${def.badge}`);
      if (o.badge === 'A') errors.push(`${def.code}: badge A is prohibited for World Bank`);
      if (typeof o.value !== 'number' || Number.isNaN(o.value)) errors.push(`${def.code}: non-numeric/null observation leaked into registry`);
    }
  }
}

// Comparable alternate links are metadata links, never merges. They must be
// symmetric and may only join active series. Freshness never changes lifecycle.
for (const s of series) {
  if (!s.comparable_alternate_series_id) continue;
  const alt = seriesById.get(s.comparable_alternate_series_id);
  if (!alt) { errors.push(`${s.series_code}: alternate series missing`); continue; }
  if (alt.series_id === s.series_id) errors.push(`${s.series_code}: alternate points to itself`);
  if (alt.comparable_alternate_series_id !== s.series_id) errors.push(`${s.series_code}: alternate link is not symmetric with ${alt.series_code}`);
  const sourceIndicator = indicatorById.get(s.indicator_id);
  const altIndicator = indicatorById.get(alt.indicator_id);
  if (sourceIndicator?.lifecycle_status !== 'active' || altIndicator?.lifecycle_status !== 'active') {
    errors.push(`${s.series_code}: alternate link crosses a non-active lifecycle boundary`);
  }
}

const remittances = indicatorByCode.get('IND-REMITTANCES-GDP');
if (remittances && series.some(s => s.indicator_id === remittances.indicator_id)) errors.push('IND-REMITTANCES-GDP must remain sourced-only with zero published series pending CBK-primary treatment');
if (indicatorByCode.has('GC.DOD.TOTL.GD.ZS') || indicatorByCode.has('IND-GOVT-DEBT-WB')) errors.push('World Bank debt-to-GDP no-data indicator must not be fabricated');

const povertyIntl = indicatorByCode.get('IND-POVERTY-RATE-INTL');
const povertyDomestic = indicatorByCode.get('IND-POVERTY-RATE');
if (povertyIntl && povertyDomestic) {
  const intlSeries = series.filter(s => s.indicator_id === povertyIntl.indicator_id);
  const domesticIds = new Set(series.filter(s => s.indicator_id === povertyDomestic.indicator_id).map(s => s.series_id));
  if (intlSeries.some(s => domesticIds.has(s.comparable_alternate_series_id))) errors.push('International $3/day poverty must not be bracket-linked to the KNBS domestic poverty line');
}

// Display metadata must be registry-backed; no card for a missing/non-active series.
for (const card of display.cards || []) {
  const def = wbDefs.get(card.indicator_code);
  const s = seriesById.get(card.series_id);
  if (!def || !s) errors.push(`display card ${card.indicator_code}: missing config or series`);
  if (def?.lifecycle_status !== 'active') errors.push(`display card ${card.indicator_code}: non-active indicator exposed`);
}

// Cross-level eligibility is an operative SERIES-level decision. In
// particular, a rate/per-capita sibling must never make its raw-total sibling
// comparable across levels.
const NORMALIZED_TRANSFORM = /(^|[_\s-])(rate|share|ratio|percent|percentage|per[_\s-]?(?:capita|person)|density|index)(?:$|[_\s-])/i;
const NORMALIZED_DIMENSIONS = new Set(['ratio', 'rate', 'index']);
const publishedSeries = series.filter(s => (observationsBySeries.get(s.series_id) || []).length > 0);
const eligibilityRows = eligibility.series || [];
if (eligibility.schema_version !== '2.0.0') errors.push(`cross-level eligibility schema_version must be 2.0.0, got ${eligibility.schema_version || 'missing'}`);
if (eligibility.granularity !== 'series') errors.push(`cross-level eligibility granularity must be series, got ${eligibility.granularity || 'missing'}`);
if (eligibilityRows.length !== publishedSeries.length) errors.push(`cross-level eligibility has ${eligibilityRows.length} series rows; expected ${publishedSeries.length} published series`);

const eligibilityBySeriesId = new Map();
for (const row of eligibilityRows) {
  if (!row.series_id) { errors.push('cross-level eligibility row missing series_id'); continue; }
  if (eligibilityBySeriesId.has(row.series_id)) errors.push(`${row.series_code || row.series_id}: duplicate series-level eligibility row`);
  eligibilityBySeriesId.set(row.series_id, row);
}

for (const s of publishedSeries) {
  const row = eligibilityBySeriesId.get(s.series_id);
  if (!row) { errors.push(`${s.series_code}: missing series-level eligibility row`); continue; }
  const indicator = indicatorById.get(s.indicator_id);
  const unit = unitById.get(s.unit_id || indicator?.unit_id);
  const geo = geoById.get(s.geography_id);
  const transformBlob = [s.transformation, s.aggregation].filter(Boolean).join(' ');
  const normalizedByUnit = NORMALIZED_DIMENSIONS.has(unit?.dimension);
  const normalizedByOwnTransform = NORMALIZED_TRANSFORM.test(transformBlob);
  const areaException = indicator?.indicator_code === 'IND-LAND-AREA';
  const expectedEligible = areaException || normalizedByUnit || normalizedByOwnTransform;

  if (row.indicator_code !== indicator?.indicator_code) errors.push(`${s.series_code}: eligibility indicator_code ${row.indicator_code} != ${indicator?.indicator_code}`);
  if (row.geography_id !== s.geography_id) errors.push(`${s.series_code}: eligibility geography_id does not match selected series`);
  if (row.geography_level !== (geo?.level || '')) errors.push(`${s.series_code}: eligibility geography_level ${row.geography_level} != ${geo?.level || ''}`);
  if ((row.transformation || '') !== (s.transformation || '')) errors.push(`${s.series_code}: eligibility transformation does not match the concrete series`);
  if ((row.aggregation || '') !== (s.aggregation || '')) errors.push(`${s.series_code}: eligibility aggregation does not match the concrete series`);
  if (row.cross_level_eligible !== expectedEligible) {
    errors.push(`${s.series_code}: cross-level=${row.cross_level_eligible} but concrete series requires ${expectedEligible} (unit=${unit?.dimension || 'unknown'}, transformation=${s.transformation || 'none'}, aggregation=${s.aggregation || 'none'})`);
  }
  if (!expectedEligible && row.cross_level_eligible) errors.push(`${s.series_code}: raw/non-normalized series was promoted by sibling metadata`);
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} World Bank integration error(s)\n` + errors.map(e => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`PASS: World Bank integration — ${config.indicators.filter(d => d.lifecycle_status === 'active').length} configured active indicators, national-only enforcement, B/D badges, symmetric alternates, sourced-only remittances, and ${eligibilityRows.length} explicit series-level cross-level eligibility decisions.`);
