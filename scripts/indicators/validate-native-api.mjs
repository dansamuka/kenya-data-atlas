import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const text = async p => readFile(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const [geos, units, indicators, series, observations, datasets, releases, index, sprint1Loader] = await Promise.all([
  read('data/geography/registry/geographies.json'),
  read('data/indicators/registry/units.json'),
  read('data/indicators/registry/indicators.json'),
  read('data/indicators/registry/series.json'),
  read('data/indicators/registry/observations.json'),
  read('data/catalogue/registry/datasets.json'),
  read('data/catalogue/registry/releases.json'),
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
assert(indicators.length === 13, `expected 13 native indicators after Sprint 1 promotion, found ${indicators.length}`);

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

let population2009 = 0, voters2022 = 0, gcpSeries = 0, gcpObs = 0, budgetCells = 0, fuelCounties = 0;
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

assert(population2009 === 47 && voters2022 === 47, 'native county coverage incomplete');
assert(gcpSeries === 47 && gcpObs === 235, `native GCP coverage ${gcpSeries} series/${gcpObs} observations != 47/235`);
assert(budgetCells === 188, `native county-budget coverage ${budgetCells} != 188`);
assert(fuelCounties === 47, `native fuel county-linked coverage ${fuelCounties} != 47`);

// The downloadable registry is now the source consumed by the page. Sprint 1's
// historical runtime fetch wrapper must never be loaded again.
assert(!index.includes('<script src="assets/sprint1-data.js"></script>'), 'index.html still loads the retired Sprint 1 runtime injector');
if (sprint1Loader) assert(!/window\.fetch\s*=/.test(sprint1Loader), 'retired assets/sprint1-data.js still monkey-patches window.fetch');

// The Geo Explorer is the sole user-facing ranking surface. Legacy compatibility
// DOM may remain for old app.js code, but it must be hidden and absent from nav.
assert(!index.includes('<a href="#compare">') && !index.includes('<a href="#rankings">'), 'legacy Compare/Rankings links are still exposed in main navigation');
assert(/id="compare" hidden/.test(index) && /id="rankings" hidden/.test(index), 'legacy Compare/Rankings compatibility sections are not hidden');

console.log(`PASS: native API contains ${indicators.length} indicators, ${series.length} series and ${observations.length} observations.`);
console.log('      Sprint 1: 47/47 population history, voters, GCP, four budget measures and county-linked fuel observations are in committed registries.');
console.log('      Runtime Sprint 1 fetch injection: disabled. Geo Explorer: sole visible ranking surface.');
