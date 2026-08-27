#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const [config, indicators, series, observations, geography, display, eligibility] = await Promise.all([
  read('data/indicators/seed/worldbank-config.json'),
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/geography/registry/geographies.json'),
  read('data/indicators/registry/worldbank-display.json'),
  read('data/indicators/registry/cross-level-eligibility.json')
]);

const errors = [];
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const seriesById = new Map(series.map(s => [s.series_id, s]));
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
    for (const o of observationsBySeries.get(s.series_id) || []) {
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
  const sourceIndicator = indicators.find(i => i.indicator_id === s.indicator_id);
  const altIndicator = indicators.find(i => i.indicator_id === alt.indicator_id);
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

// Cross-level eligibility file must be derived from actual registry availability.
for (const row of eligibility.indicators || []) {
  if (!row.cross_level_eligible) continue;
  if (['count','currency'].includes(row.unit_dimension) && row.indicator_code !== 'IND-LAND-AREA') {
    const indicator = indicatorByCode.get(row.indicator_code);
    const own = indicator ? series.filter(s => s.indicator_id === indicator.indicator_id) : [];
    if (!own.some(s => ['rate','share','per_capita'].includes(s.transformation))) {
      errors.push(`${row.indicator_code}: raw ${row.unit_dimension} total incorrectly marked cross-level eligible`);
    }
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} World Bank integration error(s)\n` + errors.map(e => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`PASS: World Bank integration — ${config.indicators.filter(d => d.lifecycle_status === 'active').length} configured active indicators, national-only enforcement, B/D badges, symmetric alternates, sourced-only remittances, and registry-derived cross-level eligibility.`);
