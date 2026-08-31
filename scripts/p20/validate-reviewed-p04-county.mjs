import fs from 'node:fs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(`P20 P04 validation: ${message}`); };

const geographies = json('data/geography/registry/geographies.json');
const indicators = json('data/indicators/registry/indicators.json');
const series = json('data/indicators/registry/series.json');
const observations = json('data/indicators/registry/observations.json');
const datasets = json('data/catalogue/registry/datasets.json');
const summary = json('data/completeness/summary.json');
const social = json('data/p04/county-social-outcomes.json');
const facilities = json('data/p04/health-facility-census-2023.json');

const counties = geographies.filter(row => row.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
const indicatorByCode = new Map(indicators.map(row => [row.indicator_code, row]));
const obsById = new Map(observations.map(row => [row.observation_id, row]));
const datasetById = new Map(datasets.map(row => [row.dataset_id, row]));
const socialByGeo = new Map((social.counties || []).map(row => [row.geo_code, row]));
const facilityByGeo = new Map((facilities.counties || []).map(row => [row.geo_code, row]));
const seriesByGeoIndicator = new Map();
for (const row of series) {
  const key = `${row.geography_id}|${row.indicator_id}`;
  if (!seriesByGeoIndicator.has(key)) seriesByGeoIndicator.set(key, []);
  seriesByGeoIndicator.get(key).push(row);
}
function latest(county, code) {
  const indicator = indicatorByCode.get(code);
  if (!indicator) return null;
  return (seriesByGeoIndicator.get(`${county.geography_id}|${indicator.indicator_id}`) || [])
    .map(row => ({ series: row, obs: obsById.get(row.latest_observation_id) }))
    .filter(pair => pair.obs)
    .sort((a,b) => String(b.obs.period_end || b.obs.period_start).localeCompare(String(a.obs.period_end || a.obs.period_start)))[0] || null;
}

const metrics = [
  { code:'IND-POVERTY-RATE', sourceKey:'poverty_rate', dataset:'DS-KNBS-POVERTY-2022', period:'2022', precision:'standard_error' },
  { code:'IND-STUNTING-RATE', sourceKey:'stunting_rate', dataset:'DS-KNBS-KDHS-2022-COUNTY', period:'2022', precision:'sample_size' },
  { code:'IND-IMMUNIZATION-RATE', sourceKey:'basic_immunisation_rate', dataset:'DS-KNBS-KDHS-2022-COUNTY', period:'2022', precision:'sample_size' },
  { code:'IND-MATERNAL-HEALTH', sourceKey:'skilled_birth_attendance', dataset:'DS-KNBS-KDHS-2022-COUNTY', period:'2022', precision:'sample_size' }
];

try {
  assert(counties.length === 47, `expected 47 counties, found ${counties.length}`);
  assert(socialByGeo.size === 47, `social-outcomes source must map 47 counties, found ${socialByGeo.size}`);
  assert(facilityByGeo.size === 47, `facility source must map 47 counties, found ${facilityByGeo.size}`);
  assert(facilities.national_total_assessed === 14883, `facility national total changed: ${facilities.national_total_assessed}`);

  let promoted = 0;
  for (const metric of metrics) {
    const indicator = indicatorByCode.get(metric.code);
    assert(indicator?.lifecycle_status === 'active' && indicator.active === true, `${metric.code} must be active`);
    assert(indicator.requires_sampling_uncertainty === true, `${metric.code} must preserve survey uncertainty requirement`);
    assert(indicator.ranking_allowed === false, `${metric.code} point-estimate ranking must remain withheld`);
    for (const county of counties) {
      const pair = latest(county, metric.code);
      const sourceMetric = socialByGeo.get(county.geo_code)?.metrics?.[metric.sourceKey];
      assert(pair, `${metric.code} ${county.geo_code}: observation missing`);
      assert(Number(pair.obs.value) === Number(sourceMetric?.value), `${metric.code} ${county.geo_code}: value diverges from reviewed P04 source`);
      assert(pair.obs.badge === 'A' && pair.obs.geographic_method === 'direct', `${metric.code} ${county.geo_code}: must be official direct evidence`);
      assert(pair.obs.period_label === metric.period, `${metric.code} ${county.geo_code}: period mismatch`);
      assert(String(pair.series.series_code).startsWith('KDA-P20-P04-'), `${metric.code} ${county.geo_code}: series namespace mismatch`);
      const dataset = datasetById.get(pair.series.dataset_id);
      assert(dataset?.dataset_code === metric.dataset, `${metric.code} ${county.geo_code}: dataset mismatch`);
      if (metric.precision === 'standard_error') {
        assert(Number(pair.obs.standard_error) === Number(sourceMetric?.standard_error), `${metric.code} ${county.geo_code}: standard error missing/divergent`);
      } else {
        assert(Number(pair.obs.sample_size) === Number(sourceMetric?.sample_size) && Number(pair.obs.sample_size) > 0, `${metric.code} ${county.geo_code}: reported denominator/sample size missing/divergent`);
      }
      promoted++;
    }
  }

  const facilityIndicator = indicatorByCode.get('IND-HEALTH-FACILITY-COUNT');
  assert(facilityIndicator?.lifecycle_status === 'active' && facilityIndicator.active === true, 'health-facility count must be active');
  assert(facilityIndicator.ranking_allowed === false, 'health-facility raw-count ranking must remain withheld');
  let facilityTotal = 0;
  for (const county of counties) {
    const pair = latest(county, 'IND-HEALTH-FACILITY-COUNT');
    const sourceValue = Number(facilityByGeo.get(county.geo_code)?.value);
    assert(pair, `${county.geo_code}: health-facility observation missing`);
    assert(Number(pair.obs.value) === sourceValue, `${county.geo_code}: health-facility count diverges from reviewed census source`);
    assert(pair.obs.badge === 'A' && pair.obs.geographic_method === 'direct', `${county.geo_code}: facility count must be official direct evidence`);
    assert(pair.obs.period_label === 'Aug–Sep 2023', `${county.geo_code}: facility period must remain Aug–Sep 2023`);
    assert(datasetById.get(pair.series.dataset_id)?.dataset_code === 'DS-MOH-HEALTH-FACILITY-CENSUS-2023', `${county.geo_code}: facility dataset mismatch`);
    assert(String(pair.obs.source_url || '').includes('health.go.ke'), `${county.geo_code}: facility source must remain Ministry of Health`);
    facilityTotal += Number(pair.obs.value);
    promoted++;
  }
  assert(facilityTotal === 14883, `facility county sum must reconcile to 14,883, got ${facilityTotal}`);
  assert(promoted === 235, `expected 235 promoted county observations, got ${promoted}`);
  console.log('P20_P04_47X5_RECONCILIATION_OK promoted=235 facility_total=14883');
  console.log('P20_P04_SURVEY_PRECISION_OK poverty=standard_error kdhs=reported_denominator');
  console.log('P20_P04_NO_INHERITANCE_OK');

  assert(summary.total_slots === 20115, `governed slot count changed: ${summary.total_slots}`);
  assert(summary.resolved_slots === 3056, `expected 3,056 resolved slots, got ${summary.resolved_slots}`);
  assert(summary.unresolved_slots === 17059, `expected 17,059 unresolved slots, got ${summary.unresolved_slots}`);
  assert(summary.by_completion_phase?.P20 === 329, `expected 329 P20 slots remaining, got ${summary.by_completion_phase?.P20}`);
  assert(summary.unknown_missing === 0, 'unknown_missing must remain zero');
  console.log('P20_P04_COMPLETENESS_OK resolved=3056 p20_remaining=329');
  console.log('P20_P04_TRANCHE_ALL_OK');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
