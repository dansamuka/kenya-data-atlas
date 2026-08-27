#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const write = async (p, v) => writeFile(path.join(root, p), JSON.stringify(v, null, 2) + '\n');

const config = await read('data/indicators/seed/worldbank-config.json');
const snapshot = await read('data/indicators/seed/derived/worldbank-latest.json');
const unitPath = 'data/indicators/seed/units.json';
const indicatorPath = 'data/indicators/seed/indicators.json';
const seriesPath = 'data/indicators/seed/series.json';
const observationPath = 'data/indicators/seed/observations.json';
let [units, indicators, series, observations] = await Promise.all([
  read(unitPath), read(indicatorPath), read(seriesPath), read(observationPath)
]);

function upsert(rows, key, row) {
  const i = rows.findIndex(x => x[key] === row[key]);
  if (i >= 0) rows[i] = { ...rows[i], ...row };
  else rows.push(row);
}

for (const u of config.units || []) upsert(units, 'code', u);

for (const def of config.indicators) {
  upsert(indicators, 'code', {
    code: def.code,
    name: def.name,
    short_name: def.short_name || def.name,
    description: def.description,
    topic: def.topic,
    subtopic: def.subtopic || '',
    unit_code: def.unit_code,
    higher_is_better: def.higher_is_better ?? null,
    preferred_frequency: 'annual',
    minimum_geo_level: 'country',
    methodology_url: `https://data.worldbank.org/indicator/${def.wb_code}?locations=KE`
  });
}

// WB series are regenerated from the current snapshot. This avoids leaving a
// stale observation behind if an indicator is deliberately moved back to
// sourced/planned or removed from the approved active configuration.
const wbSeriesCodes = new Set(series.filter(s => String(s.code || '').startsWith('KDA-WB-')).map(s => s.code));
series = series.filter(s => !wbSeriesCodes.has(s.code));
observations = observations.filter(o => !wbSeriesCodes.has(o.series_code));

const snapshotByCode = new Map((snapshot.observations || []).map(o => [o.atlas_indicator_code, o]));
function seriesCode(def) { return `KDA-WB-${def.wb_code.replaceAll('.', '-')}-KEN`; }
function transformation(def) {
  if (def.code === 'IND-GDP-GROWTH' || def.code === 'IND-POPULATION-GROWTH') return 'growth';
  if (def.unit_code === 'usd_per_person' || def.unit_code === 'tonnes_per_person' || def.unit_code === 'per_100000_persons') return 'per_capita';
  if (def.unit_code === 'percent') return 'share';
  return 'level';
}
function status(def) {
  if (def.wb_code === 'SP.POP.TOTL') return 'projected';
  if (def.badge === 'D') return 'estimated';
  return 'final';
}

let emitted = 0;
for (const def of config.indicators) {
  if (def.lifecycle_status !== 'active' || def.ingest === false) continue;
  const obs = snapshotByCode.get(def.code);
  if (!obs) continue;
  const code = seriesCode(def);
  const geographicMethod = def.badge === 'D' ? 'modelled' : 'aggregated';
  series.push({
    code,
    indicator_code: def.code,
    geo_code: config.country_geo_code,
    dataset_code: def.dataset_code,
    frequency: 'annual',
    period_type: 'calendar_year',
    unit_code: def.unit_code,
    price_basis: 'not_applicable',
    transformation: transformation(def),
    geographic_method: geographicMethod,
    comparability_group: `WB-WDI-${def.wb_code}`,
    methodology_url: `https://data.worldbank.org/indicator/${def.wb_code}?locations=KE`
  });
  observations.push({
    series_code: code,
    period_start: obs.period_start,
    period_end: obs.period_end,
    period_type: 'calendar_year',
    period_label: obs.period_label,
    value: obs.value,
    geographic_method: geographicMethod,
    statistical_status: status(def),
    source_class: 'official',
    source_url: obs.source_url,
    published_at: '',
    notes: [
      'World Bank World Development Indicators; national Kenya only.',
      'World Bank is a secondary harmonising compiler, not a Kenyan primary statistical agency.',
      def.disclosure || '',
      `WB code: ${def.wb_code}.`,
      `Retrieved: ${obs.retrieved_at}.`
    ].filter(Boolean).join(' ')
  });
  emitted++;
}

await Promise.all([
  write(unitPath, units), write(indicatorPath, indicators),
  write(seriesPath, series), write(observationPath, observations)
]);
console.log(`World Bank indicator seed applied: ${config.indicators.length} indicator definitions, ${emitted} active national series/observations.`);
