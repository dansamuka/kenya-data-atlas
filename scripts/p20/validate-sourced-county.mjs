import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const assert = (ok, message) => { if (!ok) throw new Error(`P20 validation: ${message}`); };
function csvRows(file) {
  const lines = read(file).trim().split(/\r?\n/);
  const fields = lines.shift().split(',');
  return lines.map(line => {
    const values = line.split(',');
    return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? '']));
  });
}

const geographies = json('data/geography/registry/geographies.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');
const observations = json('data/indicators/registry/observations.json');
const datasets = json('data/catalogue/registry/datasets.json');
const summary = json('data/completeness/summary.json');
const ledger = json('data/completeness/slot-ledger.json');
const connectivity = csvRows('data/p05/source/connectivity-housing-survey-2023-24.csv');
const fiscal = json('data/countyiq/source/p10-fiscal-accountability-2024-25.json');

const counties = geographies.filter(geo => geo.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
const indicatorByCode = new Map(indicators.map(indicator => [indicator.indicator_code, indicator]));
const obsById = new Map(observations.map(obs => [obs.observation_id, obs]));
const datasetById = new Map(datasets.map(dataset => [dataset.dataset_id, dataset]));
const byGeoConnectivity = new Map(connectivity.map(row => [row.geo_code, row]));
const seriesByGeoIndicator = new Map();
for (const row of series) {
  const key = `${row.geography_id}|${row.indicator_id}`;
  if (!seriesByGeoIndicator.has(key)) seriesByGeoIndicator.set(key, []);
  seriesByGeoIndicator.get(key).push(row);
}
function latest(geo, code) {
  const indicator = indicatorByCode.get(code);
  if (!indicator) return null;
  const candidates = (seriesByGeoIndicator.get(`${geo.geography_id}|${indicator.indicator_id}`) || [])
    .map(row => ({ series: row, obs: obsById.get(row.latest_observation_id) }))
    .filter(pair => pair.obs)
    .sort((a,b) => String(b.obs.period_end || b.obs.period_start).localeCompare(String(a.obs.period_end || a.obs.period_start)));
  return candidates[0] || null;
}

try {
  assert(counties.length === 47, `expected 47 counties, found ${counties.length}`);
  assert(connectivity.length === 47 && byGeoConnectivity.size === 47, 'KHS connectivity snapshot must contain 47 unique counties');
  assert(Object.keys(fiscal.counties || {}).length === 47, 'fiscal-accountability snapshot must contain 47 counties');

  const electricity = indicatorByCode.get('IND-ELECTRICITY-ACCESS');
  const osr = indicatorByCode.get('IND-COUNTY-OSR');
  assert(electricity?.lifecycle_status === 'active' && electricity.active === true, 'electricity governed slot must be active');
  assert(osr?.lifecycle_status === 'active' && osr.active === true, 'OSR governed slot must be active');
  assert(electricity.ranking_allowed === false, 'electricity ranking must remain withheld in this promotion');
  assert(osr.ranking_allowed === false, 'OSR ranking must remain withheld in this promotion');

  const osrDataset = datasets.find(dataset => dataset.dataset_code === 'DS-TREASURY-COUNTY-OSR-2024-25-P20');
  assert(osrDataset?.publication_status === 'published', 'P20 OSR dataset must be published in the canonical catalogue');

  let electricityCount = 0;
  let osrCount = 0;
  for (const county of counties) {
    const electricityPair = latest(county, 'IND-ELECTRICITY-ACCESS');
    const sourceElectricity = Number(byGeoConnectivity.get(county.geo_code)?.main_grid_electricity_pct);
    assert(electricityPair, `${county.geo_code}: governed electricity observation missing`);
    assert(Number(electricityPair.obs.value) === sourceElectricity, `${county.geo_code}: electricity value diverges from reviewed KHS snapshot`);
    assert(electricityPair.obs.badge === 'A' && electricityPair.obs.geographic_method === 'direct', `${county.geo_code}: electricity must preserve official-direct provenance`);
    assert(electricityPair.obs.geographic_method !== 'inherited', `${county.geo_code}: electricity inheritance prohibited`);
    assert(String(electricityPair.series.series_code).startsWith('KDA-P20-ELECTRICITY-'), `${county.geo_code}: governed electricity series must use the P20 namespace`);
    const electricityDataset = datasetById.get(electricityPair.series.dataset_id);
    assert(electricityDataset?.dataset_code === 'DS-KNBS-KHS-CONNECTIVITY-2023-24', `${county.geo_code}: electricity must reuse the existing published KHS dataset`);
    electricityCount++;

    const osrPair = latest(county, 'IND-COUNTY-OSR');
    const sourceOsr = Number(fiscal.counties[county.geo_code]?.osr_target_attainment_pct);
    assert(osrPair, `${county.geo_code}: OSR observation missing`);
    assert(Number(osrPair.obs.value) === sourceOsr, `${county.geo_code}: OSR value diverges from reviewed fiscal snapshot`);
    assert(osrPair.obs.badge === 'A' && osrPair.obs.geographic_method === 'direct', `${county.geo_code}: OSR must be official direct evidence`);
    assert(osrPair.obs.period_label === 'FY 2024/25', `${county.geo_code}: OSR period must remain FY 2024/25`);
    assert(osrPair.series.dataset_id === osrDataset.dataset_id, `${county.geo_code}: OSR dataset mismatch`);
    assert(String(osrPair.obs.source_url || '').includes('treasury.go.ke'), `${county.geo_code}: OSR source URL must point to the Treasury BROP`);
    osrCount++;
  }
  assert(electricityCount === 47 && osrCount === 47, `expected 47+47 promoted observations, got ${electricityCount}+${osrCount}`);
  console.log('P20_47X2_SOURCE_RECONCILIATION_OK promoted=94');
  console.log('P20_NO_INHERITANCE_OK');

  // Scope guards: P20 must not convert nearby weak/semantically mismatched
  // sources merely to improve the completion percentage.
  const protectedUnresolved = [
    'IND-COUNTY-PENDING-BILLS',
    'IND-SUBSTANCE-ABUSE-PREVALENCE',
    'IND-HEALTH-FACILITY-DENSITY'
  ];
  for (const code of protectedUnresolved) {
    const rows = ledger.rows.filter(row => row.level === 'county' && row.indicator_code === code);
    assert(rows.length === 47, `${code}: expected 47 governed county slots`);
    assert(rows.every(row => row.resolved === false), `${code}: must remain unresolved until its own source/semantic gate is satisfied`);
  }
  const pending = ledger.rows.filter(row => row.indicator_code === 'IND-COUNTY-PENDING-BILLS');
  assert(pending.every(row => row.value === '' || row.value === null || row.value === undefined), 'pending-bills KES values must not be reverse-engineered from rounded burden percentages');
  console.log('P20_SCOPE_GUARDS_OK pending_bills=substance=facility_density=unresolved');

  assert(summary.total_slots === 20115, `governed slot count changed: ${summary.total_slots}`);
  assert(summary.resolved_slots === 2868, `expected 2,868 resolved slots after P20 audit tranche, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots === 17247, `expected 17,247 unresolved slots, got ${summary.unresolved_slots}`);
  assert(summary.by_completion_phase?.P20 === 517, `expected 517 P20 slots remaining, got ${summary.by_completion_phase?.P20}`);
  assert(summary.unknown_missing === 0, 'unknown_missing must remain zero');
  console.log('P20_COMPLETENESS_OK resolved=2868 p20_remaining=517');
  console.log('P20_SOURCE_TRANCHES_ALL_OK');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
