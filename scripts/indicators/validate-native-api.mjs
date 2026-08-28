import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const text = async p => readFile(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const [geos, units, indicators, series, observations, datasets, releases, taxonomy, index, sprint1Loader] = await Promise.all([
  read('data/geography/registry/geographies.json'),
  read('data/indicators/registry/units.json'),
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/catalogue/registry/datasets.json'),
  read('data/catalogue/registry/releases.json'),
  read('data/indicators/seed/placeholder-taxonomy.json'),
  text('index.html'),
  text('assets/sprint1-data.js').catch(() => '')
]);

const counties = geos.filter(g => g.level === 'county');
assert(counties.length === 47, `canonical county count ${counties.length} != 47`);
assert(units.some(u => u.code === 'kes_million'), 'native unit registry is missing kes_million');

const requiredIndicators = [
  'IND-POPULATION', 'IND-LAND-AREA', 'IND-REGISTERED-VOTERS', 'IND-FUEL-PETROL',
  'IND-GCP-CURRENT', 'IND-COUNTY-BUDGET-TOTAL', 'IND-COUNTY-EXPENDITURE-TOTAL',
  'IND-COUNTY-BUDGET-ABSORPTION', 'IND-COUNTY-DEVELOPMENT-ABSORPTION'
];
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
for (const code of requiredIndicators) assert(indicatorByCode.has(code), `native indicator registry missing ${code}`);

// The native registry now deliberately contains active data indicators AND
// planned/sourced taxonomy slots. Do not hardcode the old Sprint-1 count of 13:
// a lifecycle promotion must not require changing this API test. Instead, the
// taxonomy itself defines which profile/Pulse indicator codes must exist.
for (const def of taxonomy.indicators || []) {
  assert(indicatorByCode.has(def.code), `native indicator registry missing taxonomy slot ${def.code}`);
}
for (const i of indicators) {
  assert(['planned','sourced','active','retired'].includes(i.lifecycle_status), `${i.indicator_code}: missing/invalid lifecycle_status in native API`);
  assert(typeof i.tab === 'string' && i.tab.length > 0, `${i.indicator_code}: missing tab in native API`);
  assert(Array.isArray(i.applies_to_levels), `${i.indicator_code}: applies_to_levels is not an array in native API`);
}
assert(indicatorByCode.get('IND-POP-2009')?.lifecycle_status === 'active', 'native API missing active IND-POP-2009 profile slot');
assert(indicatorByCode.get('IND-HEALTH-FACILITY-COUNT')?.lifecycle_status === 'sourced', 'native API missing sourced health-facility placeholder');
assert(indicatorByCode.get('IND-MOBILE-MONEY-VOLUME')?.lifecycle_status === 'planned', 'native API missing planned national mobile-money slot');

const requiredDatasets = [
  'DS-KNBS-CENSUS-2009-COUNTY-S1',
  'DS-IEBC-VOTERS-COUNTY-2022-S1',
  'DS-KNBS-GCP-2025-S1',
  'DS-COB-COUNTY-BUDGET-FY2024-25-S1',
  'DS-EPRA-FUEL-MAJOR-TOWNS-S1'
];
for (const code of requiredDatasets) {
  const ds = datasets.find(d => d.dataset_code === code);
  assert(ds, `native catalogue missing ${code}`);
  assert(ds.publication_status === 'published', `${code} is not published`);
}
const requiredReleases = [
  'REL-KNBS-POP2009-COUNTY-S1', 'REL-IEBC-VOTERS-COUNTY-2022-S1',
  'REL-KNBS-GCP-2025-S1', 'REL-COB-FY2024-25-S1', 'REL-EPRA-FUEL-AUG2026-S1'
];
for (const code of requiredReleases) assert(releases.some(r => r.release_code === code), `native catalogue missing release ${code}`);

const seriesByIndicatorGeo = new Map();
for (const s of series) {
  const key = `${s.indicator_id}|${s.geography_id}`;
  if (!seriesByIndicatorGeo.has(key)) seriesByIndicatorGeo.set(key, []);
  seriesByIndicatorGeo.get(key).push(s);
}
function ownSeries(indicatorCode, geoId) {
  const ind = indicatorByCode.get(indicatorCode);
  return ind ? (seriesByIndicatorGeo.get(`${ind.indicator_id}|${geoId}`) || []) : [];
}
function ownObs(rows) {
  const ids = new Set(rows.map(s => s.series_id));
  return observations.filter(o => ids.has(o.series_id));
}

let population2009 = 0, voters2022 = 0, gcpSeries = 0, gcpObs = 0, budgetCells = 0, fuelCounties = 0, population2009Slots = 0;
const budgetIndicators = [
  'IND-COUNTY-BUDGET-TOTAL', 'IND-COUNTY-EXPENDITURE-TOTAL',
  'IND-COUNTY-BUDGET-ABSORPTION', 'IND-COUNTY-DEVELOPMENT-ABSORPTION'
];
for (const county of counties) {
  const popRows = ownSeries('IND-POPULATION', county.geography_id);
  const popObs = ownObs(popRows);
  assert(popRows.length >= 1, `${county.geo_code}: no native population series`);
  assert(popObs.some(o => o.period_label === '2009 census'), `${county.geo_code}: native registry missing 2009 population observation`);
  assert(popObs.some(o => o.period_start === '2019-08-24' && /2019/.test(o.period_label)), `${county.geo_code}: native registry missing 2019 population observation`);
  population2009 += 1;

  // Placeholder Category v2 exposes the already-ingested 2009 observation as
  // its own active fixed profile slot, without duplicating/source-inventing data.
  const pop2009Rows = ownSeries('IND-POP-2009', county.geography_id);
  const pop2009Obs = ownObs(pop2009Rows);
  assert(pop2009Rows.length === 1 && pop2009Obs.length === 1, `${county.geo_code}: IND-POP-2009 slot is not exactly one series/observation`);
  assert(pop2009Obs[0].period_label === '2009 census', `${county.geo_code}: IND-POP-2009 does not point to the 2009 census observation`);
  population2009Slots += 1;

  const voterRows = ownSeries('IND-REGISTERED-VOTERS', county.geography_id);
  const voterObs = ownObs(voterRows);
  assert(voterObs.some(o => o.period_start === '2022-06-20' && Number.isFinite(o.value)), `${county.geo_code}: native registry missing 2022 voters`);
  voters2022 += 1;

  const gcpRows = ownSeries('IND-GCP-CURRENT', county.geography_id);
  const gcpValues = ownObs(gcpRows);
  assert(gcpRows.length === 1, `${county.geo_code}: expected one native GCP series, found ${gcpRows.length}`);
  assert(gcpValues.length === 5, `${county.geo_code}: expected five native GCP observations, found ${gcpValues.length}`);
  gcpSeries += gcpRows.length; gcpObs += gcpValues.length;

  for (const code of budgetIndicators) {
    const rows = ownSeries(code, county.geography_id);
    const values = ownObs(rows);
    assert(rows.length === 1 && values.length === 1, `${county.geo_code}: ${code} native coverage is not exactly one series/observation`);
    budgetCells += 1;
  }

  const fuelRows = ownSeries('IND-FUEL-PETROL', county.geography_id);
  const fuelObs = ownObs(fuelRows);
  assert(fuelRows.length >= 1 && fuelObs.length >= 1, `${county.geo_code}: native registry missing county-linked petrol observation`);
  assert(fuelObs.some(o => /not a county average/i.test(o.notes || '') || ['KEN-C001','KEN-C047'].includes(county.geo_code)), `${county.geo_code}: fuel observation lacks pricing-town/county-average caveat`);
  fuelCounties += 1;
}

assert(population2009 === 47 && population2009Slots === 47 && voters2022 === 47, 'native county/profile coverage incomplete');
assert(gcpSeries === 47 && gcpObs === 235, `native GCP coverage ${gcpSeries} series/${gcpObs} observations != 47/235`);
assert(budgetCells === 188, `native county-budget coverage ${budgetCells} != 188`);
assert(fuelCounties === 47, `native fuel county-linked coverage ${fuelCounties} != 47`);

// The downloadable registry is now the source consumed by the page. Sprint 1's
// historical runtime fetch wrapper must never be loaded again.
assert(!index.includes('<script src="assets/sprint1-data.js"></script>'), 'index.html still loads the retired Sprint 1 runtime injector');
if (sprint1Loader) assert(!/window\.fetch\s*=/.test(sprint1Loader), 'retired assets/sprint1-data.js still monkey-patches window.fetch');

// Compare is now a first-class, non-ranking product surface. The Geo Explorer
// remains the sole user-facing ranking surface; the old comparison/ranking DOM
// may remain only as hidden compatibility markup for older app.js code.
const compareNavLinks = index.match(/<a href="#compare">/g) || [];
assert(compareNavLinks.length >= 1, 'dedicated Compare tab is missing from navigation');
assert(index.includes('id="compare"') && index.includes('class="section compare-hub"'), 'dedicated Compare workspace is missing');
assert(index.includes('data-compare-mode="direct"') && index.includes('data-compare-mode="life"'), 'Compare workspace is missing Direct or My Life Elsewhere mode');
assert(index.includes('<script src="assets/compare.js"></script>') && index.includes('<link rel="stylesheet" href="assets/compare.css">'), 'Compare assets are not loaded by index.html');
assert(!index.includes('<a href="#rankings">'), 'retired Rankings link is exposed in main navigation');
assert(/id="compare-legacy" hidden/.test(index), 'legacy Compare compatibility section is not hidden');
assert(/id="rankings" hidden/.test(index), 'legacy Rankings compatibility section is not hidden');

console.log(`PASS: native API contains ${indicators.length} indicators, ${series.length} series and ${observations.length} observations.`);
console.log('      Lifecycle-aware taxonomy slots are native; future planned/sourced -> active promotions do not require this validator to change.');
console.log('      Sprint 1: 47/47 population history, dedicated 2009 profile slot, voters, GCP, four budget measures and county-linked fuel observations are in committed registries.');
console.log('      Runtime Sprint 1 fetch injection: disabled. Compare: dedicated two-mode surface. Geo Explorer: sole visible ranking surface.');
