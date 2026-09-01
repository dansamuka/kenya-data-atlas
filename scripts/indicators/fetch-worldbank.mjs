#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.join(root, 'data/indicators/seed/worldbank-config.json');
const outPath = path.join(root, 'data/indicators/seed/derived/worldbank-latest.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));

let previous = { observations: [], missing: [], excluded: [], generated_at: null };
try { previous = JSON.parse(await readFile(outPath, 'utf8')); } catch {}
const previousByKey = new Map((previous.observations || []).map(o => [`${o.wb_code}:${o.period_label}`, o]));
const currentYear = new Date().getUTCFullYear();

async function fetchIndicator(def) {
  const url = `https://api.worldbank.org/v2/country/${config.country_iso3}/indicator/${encodeURIComponent(def.wb_code)}?format=json&per_page=100&date=2010:${currentYear}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Kenya-Data-Atlas/1.0 (+https://github.com/dansamuka/kenya-data-atlas)' } });
  if (!res.ok) throw new Error(`World Bank API returned ${res.status} for ${def.wb_code}`);
  const payload = await res.json();
  const observations = Array.isArray(payload) ? payload[1] : null;
  const populated = (observations || []).filter(o => o && o.value !== null && o.value !== undefined);
  if (!populated.length) return null;
  let unchangedCount = 0;
  return {
    rows: populated.map(observation => {
      const period = String(observation.date);
      const old = previousByKey.get(`${def.wb_code}:${period}`);
      const unchanged = Boolean(old && Number(old.value) === Number(observation.value));
      if (unchanged) unchangedCount++;
      return {
        wb_code: def.wb_code,
        atlas_indicator_code: def.code,
        wb_indicator_name: observation.indicator?.value || def.name,
        value: Number(observation.value),
        period_start: `${period}-01-01`,
        period_end: `${period}-12-31`,
        period_label: period,
        source_url: `https://data.worldbank.org/indicator/${def.wb_code}?locations=KE`,
        retrieved_at: unchanged ? old.retrieved_at : new Date().toISOString()
      };
    }),
    unchangedCount
  };
}

const active = config.indicators.filter(d => d.ingest !== false && d.lifecycle_status === 'active');
const results = [];
const missing = [];
let unchangedCount = 0;
for (const def of active) {
  const fetched = await fetchIndicator(def);
  if (fetched) {
    results.push(...fetched.rows);
    unchangedCount += fetched.unchangedCount;
  } else {
    missing.push({ wb_code: def.wb_code, atlas_indicator_code: def.code, reason: `No non-null observation returned by World Bank API for 2010:${currentYear}.` });
  }
}

const stableJson = value => JSON.stringify(value || []);
const allObservationsUnchanged = results.length === (previous.observations || []).length && unchangedCount === results.length;
const limitationsUnchanged = stableJson(missing) === stableJson(previous.missing) && stableJson(config.excluded || []) === stableJson(previous.excluded);
const generatedAt = allObservationsUnchanged && limitationsUnchanged && previous.generated_at
  ? previous.generated_at
  : new Date().toISOString();

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify({
  source: 'World Bank World Development Indicators',
  country: config.country_iso3,
  national_only: true,
  generated_at: generatedAt,
  observations: results,
  missing,
  excluded: config.excluded || []
}, null, 2) + '\n');

console.log(`World Bank WDI: ${results.length} historical observations across ${active.length} national series; ${missing.length} missing; ${unchangedCount} unchanged observations. Snapshot timestamp ${generatedAt === previous.generated_at ? 'retained' : 'advanced'}.`);
