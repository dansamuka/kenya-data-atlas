import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const text = async p => readFile(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const [geos, units, indicators, series, observations, datasets, releases, taxonomy, index, lazy, sprint1Loader] = await Promise.all([
  read('data/geography/registry/geographies.json'),
  read('data/indicators/registry/units.json'),
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/catalogue/registry/datasets.json'),
  read('data/catalogue/registry/releases.json'),
  read('data/indicators/seed/placeholder-taxonomy.json'),
  text('index.html'),
  text('assets/lazy-integrations.js'),
  text('assets/sprint1-data.js').catch(() => '')
]);

const counties = geos.filter(g => g.level === 'county');
assert(counties.length === 47, `canonical county count ${counties.length} != 47`);
assert(units.some(u => u.code === 'kes_million'), 'native unit registry is missing kes_million');

const requiredIndicators = [
  'IND-POPULATION', 'IND-LAND-AREA', 'IND-REGISTERED-VOTERS', 'IND-FUEL-PETROL',
  'IND-GCP-CURRENT', 'IND-COUNTY-BUDGET-TOTAL', 'IND-COUNTY-EXPENDITURE-TOTAL',
  'IND-COUNTY-BUDGET-ABSORPTION', 'IND-COUNTY-DEVELOPMENT-ABSORPTION',
  'IND-CPI-INFLATION', 'IND-CBR', 'IND-USD-KES-MONTHLY-AVG', 'IND-TBILL-91-MONTHLY-AVG'
];
const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
for (const code of requiredIndicators) assert(indicatorByCode.has(code), `native indicator registry missing ${code}`);

for (const def of taxonomy.indicators || []) {
  assert(indicatorByCode.has(def.code), `native indicator registry missing taxonomy slot ${def.code}`);
}
for (const i of indicators) {
  assert(['planned','sourced','active','retired'].includes(i.lifecycle_status), `${i.indicator_code}: missing/invalid lifecycle_status in native API`);
  assert(typeof i.tab === 'string' && i.tab.length > 0, `${i.indicator_code}: missing tab in native API`);
  assert(Array.isArray(i.applies_to_levels), `${i.indicator_code}: applies_to_levels is not an array in native API`);
}
assert(indicatorByCode.get('IND-POP-2009')?.lifecycle_status === 'active', 'native API missing active IND-POP-2009 profile slot');
assert(indicatorByCode.get('IND-HEALTH-FACILITY-COUNT')?.lifecycle_status === 'active', 'native API missing active P04 health-facility indicator');
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
    assert(rows.length === 1, `${county.geo_code}: ${code} should have exactly one native series, found ${rows.length}`);
    assert(values.some(o => o.period_start === '2024-07-01' && o.period_end === '2025-06-30'), `${county.geo_code}: ${code} missing FY 2024/25 observation`);
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
assert(budgetCells === 188, `native county-budget series coverage ${budgetCells} != 188`);
assert(fuelCounties === 47, `native fuel county-linked coverage ${fuelCounties} != 47`);

assert(!index.includes('<script src="assets/sprint1-data.js"></script>'), 'index.html still loads the retired Sprint 1 runtime injector');
if (sprint1Loader) assert(!/window\.fetch\s*=/.test(sprint1Loader), 'retired assets/sprint1-data.js still monkey-patches window.fetch');

// Compare and the new Results/Rankings workspace are first-class routed
// product surfaces. The retired pre-router ranking DOM remains hidden only for
// compatibility with older shell code; reject only that legacy #rankings link.
assert(index.includes('<a href="#/compare" data-view-link="compare">Compare</a>'), 'dedicated routed Compare tab is missing from navigation');
assert(index.includes('id="compare" data-view="compare"') && index.includes('class="section compare-hub"'), 'dedicated routed Compare workspace is missing');
assert(index.includes('data-compare-mode="direct"') && index.includes('data-compare-mode="life"'), 'Compare workspace is missing Direct or My Life Elsewhere mode');
assert(lazy.includes("assets/compare.js") && lazy.includes("assets/compare.css") && lazy.includes("view==='compare'"), 'Compare assets are not route-loaded by lazy-integrations.js');
assert(!index.includes('<script src="assets/compare.js"></script>') && !index.includes('<link rel="stylesheet" href="assets/compare.css">'), 'Compare assets must stay off the homepage cold-load path');
assert(index.includes('<a href="#/rankings" data-view-link="rankings">Rankings</a>'), 'canonical routed Rankings results tab is missing from navigation');
assert(!index.includes('<a href="#rankings">'), 'retired legacy #rankings link is exposed in navigation');
assert(/id="compare-legacy" hidden/.test(index), 'legacy Compare compatibility section is not hidden');
assert(/id="rankings-legacy" hidden/.test(index), 'legacy Rankings compatibility section is not hidden');

console.log(`PASS: native API contains ${indicators.length} indicators, ${series.length} series and ${observations.length} observations.`);
console.log('      Lifecycle-aware taxonomy slots and Sprint 3 historical indicators coexist in the native API.');
console.log('      Sprint 1 invariants remain present while county fiscal series may contain earlier validated history.');
console.log('      Runtime Sprint 1 fetch injection: disabled. Compare: dedicated routed two-mode surface. Rankings: dedicated routed results surface; legacy ranking DOM remains hidden.');
