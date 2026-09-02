import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const assert = (ok, message) => { if (!ok) throw new Error(`P20 household-size validation: ${message}`); };

const geographies = json('data/geography/registry/geographies.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');
const observations = json('data/indicators/registry/observations.json');
const datasets = json('data/catalogue/registry/datasets.json');
const ledger = json('data/completeness/slot-ledger.json');
const source = json('data/p20/source/household-size-2019.json');

const counties = geographies.filter(geo => geo.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
const indicator = indicators.find(row => row.indicator_code === 'IND-HOUSEHOLD-SIZE');
const dataset = datasets.find(row => row.dataset_code === 'DS-KNBS-KPHC-HOUSEHOLD-SIZE-2019-P20');
const obsById = new Map(observations.map(obs => [obs.observation_id, obs]));
const sourceByGeo = new Map((source.counties || []).map(row => [row.geo_code, row]));
const byGeo = new Map();
for (const row of series) {
  if (row.indicator_id !== indicator?.indicator_id) continue;
  const obs = obsById.get(row.latest_observation_id);
  if (obs) byGeo.set(row.geography_id, { series: row, obs });
}

try {
  assert(counties.length === 47, `expected 47 counties, found ${counties.length}`);
  assert(sourceByGeo.size === 47, `source snapshot must contain 47 unique counties, found ${sourceByGeo.size}`);
  assert(indicator?.lifecycle_status === 'active' && indicator.active === true, 'household-size indicator must be active');
  assert(indicator?.ranking_allowed === false, 'household-size ranking must remain withheld');
  assert(dataset?.publication_status === 'published', 'household-size dataset must be published in the canonical catalogue');
  assert(source.source_table === 'Table 2.3 — Distribution of Population, Number of Households and Average Household Size by County', 'source table identity changed unexpectedly');

  let count = 0;
  for (const county of counties) {
    const expected = sourceByGeo.get(county.geo_code);
    assert(expected, `${county.geo_code}: source row missing`);
    const pair = byGeo.get(county.geography_id);
    assert(pair, `${county.geo_code}: household-size observation missing`);
    assert(Number(pair.obs.value) === Number(expected.value), `${county.geo_code}: household-size value diverges from governed KNBS snapshot`);
    assert(pair.obs.badge === 'A' && pair.obs.geographic_method === 'direct', `${county.geo_code}: household size must retain official-direct provenance`);
    assert(pair.obs.geographic_method !== 'inherited', `${county.geo_code}: household-size inheritance prohibited`);
    assert(pair.obs.period_label === '2019 Census', `${county.geo_code}: period label must remain 2019 Census`);
    assert(pair.obs.source_table === source.source_table, `${county.geo_code}: source table mismatch`);
    assert(pair.series.dataset_id === dataset.dataset_id, `${county.geo_code}: dataset mismatch`);
    assert(String(pair.series.series_code).startsWith('KDA-P20-HOUSEHOLD-SIZE-'), `${county.geo_code}: P20 household-size namespace required`);
    const ledgerRow = ledger.rows.find(row => row.level === 'county' && row.geo_code === county.geo_code && row.indicator_code === 'IND-HOUSEHOLD-SIZE');
    assert(ledgerRow?.resolved === true, `${county.geo_code}: household-size completeness slot must be resolved`);
    assert(Number(ledgerRow?.value) === Number(expected.value), `${county.geo_code}: completeness ledger must preserve household-size value`);
    count++;
  }

  const constituencyRows = ledger.rows.filter(row => row.level === 'constituency' && row.indicator_code === 'IND-HOUSEHOLD-SIZE');
  assert(constituencyRows.length === 290, `expected 290 constituency household-size slots, found ${constituencyRows.length}`);
  assert(constituencyRows.every(row => row.geographic_method !== 'inherited'), 'county household-size observations must not be inherited into constituencies');
  assert(constituencyRows.every(row => row.value == null || row.value === ''), 'constituency household-size slots must not acquire a fabricated numeric value');
  assert(constituencyRows.every(row => row.resolved === false || row.status === 'official_unavailable'), 'later phases may only resolve constituency household-size slots through an explicit governed closure');

  assert(count === 47, `expected 47 household-size observations, got ${count}`);
  console.log('P20_HOUSEHOLD_SIZE_47_RECONCILIATION_OK');
  console.log('P20_HOUSEHOLD_SIZE_NO_INHERITANCE_OK constituency=290_governed');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
