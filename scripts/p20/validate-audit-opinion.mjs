import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const assert = (ok, message) => { if (!ok) throw new Error(`P20 audit validation: ${message}`); };

const geographies = json('data/geography/registry/geographies.json');
const units = json('data/indicators/registry/units.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');
const observations = json('data/indicators/registry/observations.json');
const datasets = json('data/catalogue/registry/datasets.json');
const summary = json('data/completeness/summary.json');
const ledger = json('data/completeness/slot-ledger.json');
const fiscal = json('data/countyiq/source/p10-fiscal-accountability-2024-25.json');

const counties = geographies.filter(geo => geo.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
const indicator = indicators.find(row => row.indicator_code === 'IND-COUNTY-AUDIT-OPINION');
const categoryUnit = units.find(row => row.code === 'category');
const dataset = datasets.find(row => row.dataset_code === 'DS-OAG-COUNTY-EXECUTIVE-AUDIT-2023-24-P20');
const obsById = new Map(observations.map(obs => [obs.observation_id, obs]));
const byGeo = new Map();
for (const row of series) {
  if (row.indicator_id !== indicator?.indicator_id) continue;
  const obs = obsById.get(row.latest_observation_id);
  if (obs) byGeo.set(row.geography_id, { series: row, obs });
}

try {
  assert(counties.length === 47, `expected 47 counties, found ${counties.length}`);
  assert(fiscal.audit_context_2023_24?.all_county_executives_qualified === true, 'source snapshot must explicitly confirm all County Executives were Qualified');
  const qualified = new Set(fiscal.audit_context_2023_24?.qualified_geo_codes || []);
  assert(qualified.size === 47, `source snapshot must contain 47 unique qualified county codes, found ${qualified.size}`);
  assert(indicator?.lifecycle_status === 'active' && indicator.active === true, 'audit-opinion indicator must be active');
  assert(indicator?.ranking_allowed === false, 'audit-opinion ranking must be prohibited');
  assert(categoryUnit && indicator.unit_id === categoryUnit.unit_id, 'audit-opinion indicator must use the categorical unit');
  assert(dataset?.publication_status === 'published', 'OAG audit dataset must be published in the canonical catalogue');

  let count = 0;
  for (const county of counties) {
    assert(qualified.has(county.geo_code), `${county.geo_code}: canonical county missing from verified OAG Qualified list`);
    const pair = byGeo.get(county.geography_id);
    assert(pair, `${county.geo_code}: audit opinion observation missing`);
    assert(pair.obs.value === null, `${county.geo_code}: categorical audit opinion must not carry a numeric value`);
    assert(pair.obs.text_value === 'Qualified', `${county.geo_code}: audit opinion must be the verified category Qualified`);
    assert(pair.obs.badge === 'A' && pair.obs.geographic_method === 'direct', `${county.geo_code}: audit opinion must retain official-direct provenance`);
    assert(pair.obs.source_table === 'Appendix 1(a)', `${county.geo_code}: source table must remain Appendix 1(a)`);
    assert(pair.obs.source_page === '69-70', `${county.geo_code}: source page reference must remain 69-70`);
    assert(String(pair.obs.source_url || '').includes('oagkenya.go.ke'), `${county.geo_code}: source URL must point to OAG`);
    assert(String(pair.series.series_code).startsWith('KDA-P20-AUDIT-OPINION-'), `${county.geo_code}: series must use the P20 audit namespace`);
    assert(pair.series.dataset_id === dataset.dataset_id, `${county.geo_code}: audit dataset mismatch`);
    const ledgerRow = ledger.rows.find(row => row.level === 'county' && row.geo_code === county.geo_code && row.indicator_code === 'IND-COUNTY-AUDIT-OPINION');
    assert(ledgerRow?.resolved === true, `${county.geo_code}: audit completeness slot must be resolved`);
    assert(ledgerRow?.value === 'Qualified', `${county.geo_code}: completeness ledger must preserve the categorical text value`);
    count++;
  }
  assert(count === 47, `expected 47 verified audit observations, got ${count}`);
  assert(summary.total_slots === 20115, `governed slot count changed: ${summary.total_slots}`);
  assert(summary.resolved_slots === 2821, `expected 2,821 resolved slots after audit tranche, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots === 17294, `expected 17,294 unresolved slots, got ${summary.unresolved_slots}`);
  assert(summary.by_completion_phase?.P20 === 564, `expected 564 P20 slots remaining, got ${summary.by_completion_phase?.P20}`);
  assert(summary.unknown_missing === 0, 'unknown_missing must remain zero');
  console.log('P20_AUDIT_47X47_RECONCILIATION_OK category=Qualified');
  console.log('P20_AUDIT_NO_NUMERIC_SCORE_OK');
  console.log('P20_AUDIT_COMPLETENESS_OK resolved=2821 p20_remaining=564');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
