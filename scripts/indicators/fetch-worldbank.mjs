#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.join(root, 'data/indicators/seed/worldbank-config.json');
const outPath = path.join(root, 'data/indicators/seed/derived/worldbank-latest.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));

let previous = { observations: [] };
try { previous = JSON.parse(await readFile(outPath, 'utf8')); } catch {}
const previousByCode = new Map((previous.observations || []).map(o => [o.wb_code, o]));

async function fetchIndicator(def) {
  const url = `https://api.worldbank.org/v2/country/${config.country_iso3}/indicator/${encodeURIComponent(def.wb_code)}?format=json&per_page=100&date=2010:2026`;
  const res = await fetch(url, { headers: { 'user-agent': 'Kenya-Data-Atlas/1.0 (+https://github.com/dansamuka/kenya-data-atlas)' } });
  if (!res.ok) throw new Error(`World Bank API returned ${res.status} for ${def.wb_code}`);
  const payload = await res.json();
  const observations = Array.isArray(payload) ? payload[1] : null;
  const latest = (observations || []).find(o => o && o.value !== null && o.value !== undefined);
  if (!latest) return null;

  const period = String(latest.date);
  const old = previousByCode.get(def.wb_code);
  const unchanged = old && old.period_label === period && Number(old.value) === Number(latest.value);
  return {
    wb_code: def.wb_code,
    atlas_indicator_code: def.code,
    wb_indicator_name: latest.indicator?.value || def.name,
    value: Number(latest.value),
    period_start: `${period}-01-01`,
    period_end: `${period}-12-31`,
    period_label: period,
    source_url: `https://data.worldbank.org/indicator/${def.wb_code}?locations=KE`,
    api_url: url,
    retrieved_at: unchanged ? old.retrieved_at : new Date().toISOString(),
    unchanged_from_previous_snapshot: Boolean(unchanged)
  };
}

const active = config.indicators.filter(d => d.ingest !== false && d.lifecycle_status === 'active');
const results = [];
const missing = [];
for (const def of active) {
  const row = await fetchIndicator(def);
  if (row) results.push(row);
  else missing.push({ wb_code: def.wb_code, atlas_indicator_code: def.code, reason: 'No non-null observation returned by World Bank API for 2010:2026.' });
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify({
  source: 'World Bank World Development Indicators',
  country: config.country_iso3,
  national_only: true,
  generated_at: new Date().toISOString(),
  observations: results,
  missing,
  excluded: config.excluded || []
}, null, 2) + '\n');

console.log(`World Bank WDI: ${results.length} latest non-null observations; ${missing.length} missing; ${results.filter(r => r.unchanged_from_previous_snapshot).length} unchanged snapshots retained.`);
