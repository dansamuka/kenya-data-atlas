#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const write = async (p, v) => writeFile(path.join(root, p), JSON.stringify(v, null, 2) + '\n');
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const writeCsv = async (p, rows) => {
  const fields = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const text = [fields.join(','), ...rows.map(r => fields.map(f => csvCell(r[f])).join(','))].join('\n') + '\n';
  await writeFile(path.join(root, p), text);
};

const config = await read('data/indicators/seed/worldbank-config.json');
const indicatorPath = 'data/indicators/registry/indicators.json';
const seriesPath = 'data/indicators/registry/series.json';
const observationPath = 'data/indicators/registry/observations.json';
const geography = await read('data/geography/registry/geographies.json');
const [indicators, series, observations] = await Promise.all([read(indicatorPath), read(seriesPath), read(observationPath)]);

const kenya = geography.find(g => g.geo_code === config.country_geo_code);
if (!kenya) throw new Error(`Country geography ${config.country_geo_code} not found`);
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
const seriesById = new Map(series.map(s => [s.series_id, s]));
const observationsBySeries = new Map();
for (const o of observations) {
  if (!observationsBySeries.has(o.series_id)) observationsBySeries.set(o.series_id, []);
  observationsBySeries.get(o.series_id).push(o);
}

function latestForSeries(s) {
  return (observationsBySeries.get(s.series_id) || []).sort((a,b) => String(a.period_end).localeCompare(String(b.period_end))).at(-1) || null;
}
function nationalSeriesForIndicatorCode(code) {
  const indicator = indicatorByCode.get(code);
  if (!indicator) return null;
  return series.find(s => s.indicator_id === indicator.indicator_id && s.geography_id === kenya.geography_id && s.status !== 'superseded') || null;
}

// Restore/assign World Bank lifecycle and presentation metadata after the
// generic placeholder-taxonomy pass. National-only means no county/
// constituency/ward applies_to_levels are ever attached here.
for (const def of config.indicators) {
  const row = indicatorByCode.get(def.code);
  if (!row) throw new Error(`World Bank indicator missing from built registry: ${def.code}`);
  row.lifecycle_status = def.lifecycle_status;
  row.active = def.lifecycle_status === 'active';
  row.tab = def.tab;
  row.applies_to_levels = [];
  row.applies_to_geography_subset = '';
  row.expected_source = 'World Bank — World Development Indicators';
  row.expected_source_url = `https://data.worldbank.org/indicator/${def.wb_code}?locations=KE`;
  row.expected_availability_note = def.hold_reason || 'National-only WDI series; never inherit to a subnational geography.';
  row.requires_sampling_uncertainty = false;
  row.ranking_allowed = true;
  row.worldbank_code = def.wb_code;
  row.composite_disclosure = def.composite ? (def.disclosure || 'Compiled index; not a raw statistic.') : '';
}

// Clear previous alternate links before rebuilding them from the current
// registry. This makes the operation idempotent and prevents stale links.
for (const s of series) {
  delete s.comparable_alternate_series_id;
  delete s.headline_display_policy;
}

const display = [];
for (const def of config.indicators.filter(d => d.lifecycle_status === 'active' && d.ingest !== false)) {
  const wbSeries = nationalSeriesForIndicatorCode(def.code);
  if (!wbSeries) continue;
  let alternate = null;
  if (def.comparable_alternate_code && def.alternate_policy !== 'distinct_methodology_no_link') {
    alternate = nationalSeriesForIndicatorCode(def.comparable_alternate_code);
    if (alternate) {
      wbSeries.comparable_alternate_series_id = alternate.series_id;
      alternate.comparable_alternate_series_id = wbSeries.series_id;
      wbSeries.headline_display_policy = def.alternate_policy || 'freshness_primary';
      alternate.headline_display_policy = def.alternate_policy || 'freshness_primary';
    }
  }
  display.push({
    indicator_code: def.code,
    wb_code: def.wb_code,
    series_id: wbSeries.series_id,
    latest_observation_id: wbSeries.latest_observation_id,
    pulse_priority: def.pulse_priority ?? 99,
    headline: Boolean(def.headline),
    badge_hint: def.badge,
    disclosure: def.disclosure || (def.composite ? 'Compiled index; not a raw statistic.' : ''),
    alternate_policy: def.alternate_policy || '',
    comparable_alternate_series_id: alternate?.series_id || '',
    comparable_alternate_indicator_code: alternate ? def.comparable_alternate_code : ''
  });
}

display.sort((a,b) => a.pulse_priority - b.pulse_priority || a.indicator_code.localeCompare(b.indicator_code));
await Promise.all([
  write(indicatorPath, indicators),
  write(seriesPath, series),
  writeCsv('data/indicators/registry/indicators.csv', indicators),
  writeCsv('data/indicators/registry/series.csv', series),
  write('data/indicators/registry/worldbank-display.json', {
    generated_from: 'data/indicators/seed/worldbank-config.json',
    national_only: true,
    rule: 'Store independent series; linked alternates are symmetric metadata. Freshness changes headline position only, never lifecycle status.',
    cards: display
  })
]);

console.log(`World Bank registry metadata applied: ${display.length} active WDI series; ${display.filter(x => x.comparable_alternate_series_id).length} linked alternate pairs from the WB side.`);
