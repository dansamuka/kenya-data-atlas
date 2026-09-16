import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const readText = p => fs.readFileSync(path.join(root, p), 'utf8');

function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.filter(Boolean).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

const fail = message => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const assert = (condition, message) => { if (!condition) fail(message); };

const sourceDoc = readJson('data/sprint1/sources.json');
const mappings = parseCsv(readText('data/sprint1/fuel-super-petrol-2026-08.csv'));
const indicators = readJson('data/indicators/registry/indicators.json');
const series = readJson('data/indicators/registry/series.json');
const observations = readJson('data/indicators/registry/observations.json');
const geographies = readJson('data/geography/registry/geographies.json');
const datasets = readJson('data/catalogue/registry/datasets.json');
const releases = readJson('data/catalogue/registry/releases.json');

const source = sourceDoc.sources?.fuel_aug_sep_2026;
assert(source, 'fuel_aug_sep_2026 source metadata is missing');
assert(source.agency === 'Energy & Petroleum Regulatory Authority (EPRA)', 'fuel numeric authority must be EPRA');
assert(/^https:\/\/(www\.)?epra\.go\.ke\//i.test(source.url || ''), 'fuel primary URL must be on epra.go.ke');
assert(/^https:\/\/(www\.)?epra\.go\.ke\//i.test(source.release_url || ''), 'fuel release URL must be on epra.go.ke');
assert(source.quality === 'C', 'fuel source presentation quality must be Class C proxy');
assert(/not a county average/i.test(source.note || ''), 'fuel source note must disclose that values are not county averages');
assert(/secondary/i.test(source.note || ''), 'fuel source note must preserve secondary-source lineage as corroboration/history');

assert(mappings.length === 47, `expected 47 county-to-pricing-town mappings, found ${mappings.length}`);
assert(new Set(mappings.map(r => r.geo_code)).size === 47, 'fuel mapping geo_code values must be unique');
for (const r of mappings) {
  assert(/^KEN-C\d{3}$/.test(r.geo_code), `invalid county geo_code ${r.geo_code}`);
  assert(r.pricing_town, `missing pricing town for ${r.geo_code}`);
  assert(Number.isFinite(Number(r.super_petrol_kes_per_litre)), `invalid petrol value for ${r.geo_code}`);
}

const indicator = indicators.find(i => i.indicator_code === 'IND-FUEL-PETROL');
assert(indicator, 'IND-FUEL-PETROL is missing');
const targetDataset = datasets.find(d => d.dataset_code === 'DS-EPRA-FUEL-MAJOR-TOWNS-S1');
assert(targetDataset, 'DS-EPRA-FUEL-MAJOR-TOWNS-S1 is missing');
const targetRelease = releases.find(r => r.release_code === 'REL-EPRA-FUEL-AUG2026-S1');
assert(targetRelease, 'REL-EPRA-FUEL-AUG2026-S1 is missing');
assert(targetRelease.dataset_id === targetDataset.dataset_id, 'fuel release is attached to the wrong dataset');
assert(targetRelease.release_url === source.release_url, 'fuel release must resolve to the official EPRA release URL');

const geoById = new Map(geographies.map(g => [g.geography_id, g]));
const mappingByGeo = new Map(mappings.map(r => [r.geo_code, r]));
const obsById = new Map(observations.map(o => [o.observation_id, o]));
const targetSeries = series.filter(s => s.indicator_id === indicator.indicator_id && s.dataset_id === targetDataset.dataset_id);
assert(targetSeries.length === 45, `expected 45 Sprint-1 county-linked EPRA series, found ${targetSeries.length}`);

for (const s of targetSeries) {
  const geo = geoById.get(s.geography_id);
  assert(geo?.level === 'county', `${s.series_code}: target fuel series must attach to county geography`);
  const expected = mappingByGeo.get(geo.geo_code);
  assert(expected, `${s.series_code}: no pricing-town mapping for ${geo.geo_code}`);
  assert(s.geographic_method === 'proxy', `${s.series_code}: geographic_method must be proxy`);
  assert(s.comparability_group === 'EPRA-SUPER-PETROL-PRICING-TOWN-AUG2026', `${s.series_code}: unexpected comparability group`);

  const o = obsById.get(s.latest_observation_id);
  assert(o, `${s.series_code}: latest observation missing`);
  assert(o.source_dataset_id === targetDataset.dataset_id, `${s.series_code}: observation dataset mismatch`);
  assert(o.source_release_id === targetRelease.release_id, `${s.series_code}: observation release mismatch`);
  assert(o.source_class === 'official', `${s.series_code}: source_class must be official`);
  assert(o.geographic_method === 'proxy', `${s.series_code}: observation geographic_method must be proxy`);
  assert(o.badge === 'C', `${s.series_code}: official pricing-town proxy must render Badge C`);
  assert(o.source_url === source.url, `${s.series_code}: source URL must be the official EPRA pump-price table`);
  assert(o.source_row_label === expected.pricing_town, `${s.series_code}: pricing-town row label mismatch`);
  assert(Math.abs(Number(o.value) - Number(expected.super_petrol_kes_per_litre)) < 1e-9, `${s.series_code}: value differs from governed mapping`);
  assert(o.period_start === '2026-08-15' && o.period_end === '2026-09-14', `${s.series_code}: wrong EPRA pricing period`);
  assert(/not a county average/i.test(o.notes || ''), `${s.series_code}: proxy disclosure missing`);
  assert(/official EPRA/i.test(o.notes || ''), `${s.series_code}: official EPRA authority not stated`);
  if (geo.geo_code === 'KEN-C018') assert(/Nyahururu.*outside the county/i.test(o.notes || ''), 'Nyandarua must disclose the out-of-county Nyahururu proxy');
}

const targetObs = observations.filter(o => o.source_dataset_id === targetDataset.dataset_id);
assert(targetObs.length === 45, `expected 45 target EPRA observations, found ${targetObs.length}`);
assert(targetObs.every(o => o.source_class !== 'external' && o.badge !== 'E'), 'legacy external/Badge E fuel observations remain');

console.log('PASS: EPRA fuel provenance remediation');
console.log(`      ${mappings.length} governed county-to-pricing-town mappings checked.`);
console.log(`      ${targetSeries.length} Sprint-1 county-linked observations are official EPRA proxies (Badge C), not county averages.`);
console.log('      Secondary Pulse/third-party evidence is retained only as corroboration/history.');
