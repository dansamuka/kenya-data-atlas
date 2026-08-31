import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INGESTED_AT = '2026-08-31T00:00:00.000Z';
const SERIES_PREFIX = 'KDA-P20-P04-';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const csv = rows => {
  const fields = unionFields(rows);
  return [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';
};
const uuid = name => {
  const hash = createHash('sha1').update(`kenya-data-atlas:p20-p04:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

const METRICS = [
  {
    indicator_code: 'IND-POVERTY-RATE', source_key: 'poverty_rate', dataset_code: 'DS-KNBS-POVERTY-2022',
    period_start: '2022-01-01', period_end: '2022-12-31', period_type: 'calendar_year', frequency: 'annual', period_label: '2022',
    source_family: 'poverty', source_table: 'Table 4.4 / Annex Table E.2', comparability_group: 'P20-POVERTY-HEADCOUNT-2022',
    name: 'Poverty rate (monetary)', short_name: 'Poverty rate',
    description: 'Overall individual monetary poverty headcount rate from the Kenya Poverty Report 2022.',
    transformation: 'rate', ranking_allowed: false, requires_sampling_uncertainty: true,
    note: 'County survey estimate from KCHS 2022. The source-reported county standard error is retained; point-estimate league-table ranking remains withheld.'
  },
  {
    indicator_code: 'IND-STUNTING-RATE', source_key: 'stunting_rate', dataset_code: 'DS-KNBS-KDHS-2022-COUNTY',
    period_start: '2022-01-01', period_end: '2022-12-31', period_type: 'calendar_year', frequency: 'annual', period_label: '2022',
    source_family: 'kdhs', source_table_key: 'stunting', comparability_group: 'P20-KDHS-STUNTING-2022',
    name: 'Stunting rate, under-5', short_name: 'Under-5 stunting',
    description: 'Share of children under five below -2 SD height-for-age in the 2022 Kenya Demographic and Health Survey.',
    transformation: 'rate', ranking_allowed: false, requires_sampling_uncertainty: true,
    note: 'KDHS 2022 county estimate. The reported table denominator is retained as sample-size/precision metadata; point-estimate ranking remains withheld.'
  },
  {
    indicator_code: 'IND-IMMUNIZATION-RATE', source_key: 'basic_immunisation_rate', dataset_code: 'DS-KNBS-KDHS-2022-COUNTY',
    period_start: '2022-01-01', period_end: '2022-12-31', period_type: 'calendar_year', frequency: 'annual', period_label: '2022',
    source_family: 'kdhs', source_table_key: 'basic_immunisation', comparability_group: 'P20-KDHS-BASIC-IMMUNISATION-2022',
    name: 'Basic immunisation coverage, age 12–23 months', short_name: 'Basic immunisation',
    description: 'Share of children age 12–23 months fully vaccinated with the basic antigens reported in KDHS 2022.',
    transformation: 'rate', ranking_allowed: false, requires_sampling_uncertainty: true,
    note: 'KDHS 2022 county estimate. The reported table denominator is retained as sample-size/precision metadata; point-estimate ranking remains withheld.'
  },
  {
    indicator_code: 'IND-MATERNAL-HEALTH', source_key: 'skilled_birth_attendance', dataset_code: 'DS-KNBS-KDHS-2022-COUNTY',
    period_start: '2022-01-01', period_end: '2022-12-31', period_type: 'calendar_year', frequency: 'annual', period_label: '2022',
    source_family: 'kdhs', source_table_key: 'skilled_birth_attendance', comparability_group: 'P20-KDHS-SKILLED-BIRTH-ATTENDANCE-2022',
    name: 'Skilled birth attendance rate', short_name: 'Skilled birth attendance',
    description: 'Share of live births assisted by a doctor, nurse, midwife or clinical officer in KDHS 2022.',
    transformation: 'rate', ranking_allowed: false, requires_sampling_uncertainty: true,
    note: 'KDHS 2022 county estimate. The reported table denominator is retained as sample-size/precision metadata; point-estimate ranking remains withheld.'
  }
];

function sourceForMetric(metric, social) {
  const src = social.sources?.[metric.source_family];
  if (!src?.url) throw new Error(`P20 P04: source URL missing for ${metric.indicator_code}`);
  return src;
}
function tableForMetric(metric, social) {
  if (metric.source_table) return metric.source_table;
  const value = social.sources?.kdhs?.tables?.[metric.source_table_key];
  if (!value) throw new Error(`P20 P04: source table missing for ${metric.indicator_code}`);
  return value;
}
function findPublishedDataset(datasets, code) {
  const dataset = datasets.find(row => row.dataset_code === code);
  if (!dataset || !['approved','published'].includes(dataset.publication_status)) {
    throw new Error(`P20 P04: published dataset ${code} is missing`);
  }
  return dataset;
}
function findRelease(releases, dataset, sourceUrl) {
  return releases.find(row => row.dataset_id === dataset.dataset_id && row.release_status === 'published' && row.release_url === sourceUrl)
    || releases.find(row => row.dataset_id === dataset.dataset_id && row.release_status === 'published')
    || null;
}

let [units, indicators, series, observations, geographies, datasets, releases, sources, social, facilities] = await Promise.all([
  readJson('data/indicators/registry/units.json'), readJson('data/indicators/registry/indicators.json'),
  readJson('data/indicators/registry/series.json'), readJson('data/indicators/registry/observations.json'),
  readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'),
  readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json'),
  readJson('data/p04/county-social-outcomes.json'), readJson('data/p04/health-facility-census-2023.json')
]);

const counties = geographies.filter(row => row.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
if (counties.length !== 47) throw new Error(`P20 P04: expected 47 county geographies, found ${counties.length}`);
if ((social.counties || []).length !== 47) throw new Error(`P20 P04: social-outcomes source must contain 47 counties, found ${(social.counties || []).length}`);
if ((facilities.counties || []).length !== 47) throw new Error(`P20 P04: facility source must contain 47 counties, found ${(facilities.counties || []).length}`);
if (facilities.national_total_assessed !== 14883) throw new Error(`P20 P04: facility national total must remain 14,883, found ${facilities.national_total_assessed}`);

const socialByGeo = new Map(social.counties.map(row => [row.geo_code, row]));
const facilityByGeo = new Map(facilities.counties.map(row => [row.geo_code, row]));
const indicatorByCode = new Map(indicators.map(row => [row.indicator_code, row]));
const unitById = new Map(units.map(row => [row.unit_id, row]));
const sourceById = new Map(sources.map(row => [row.source_id, row]));

const oldIds = new Set(series.filter(row => String(row.series_code).startsWith(SERIES_PREFIX)).map(row => row.series_id));
series = series.filter(row => !oldIds.has(row.series_id));
observations = observations.filter(row => !oldIds.has(row.series_id));

for (const metric of METRICS) {
  const indicator = indicatorByCode.get(metric.indicator_code);
  if (!indicator) throw new Error(`P20 P04: target indicator ${metric.indicator_code} missing`);
  const unit = unitById.get(indicator.unit_id);
  if (!unit || unit.code !== 'percent') throw new Error(`P20 P04: ${metric.indicator_code} must use percent unit`);
  const dataset = findPublishedDataset(datasets, metric.dataset_code);
  const source = sourceById.get(dataset.source_id);
  if (!source) throw new Error(`P20 P04: source missing for dataset ${metric.dataset_code}`);
  const sourceInfo = sourceForMetric(metric, social);
  const release = findRelease(releases, dataset, sourceInfo.url);
  const sourceTable = tableForMetric(metric, social);

  for (const county of counties) {
    const sourceRow = socialByGeo.get(county.geo_code);
    const sourceMetric = sourceRow?.metrics?.[metric.source_key];
    if (!sourceMetric || !Number.isFinite(Number(sourceMetric.value))) {
      throw new Error(`P20 P04: ${metric.indicator_code} missing finite value for ${county.geo_code}`);
    }
    const code = `${SERIES_PREFIX}${metric.indicator_code.replace(/^IND-/, '')}-${county.geo_code}`;
    const seriesId = uuid(`series:${code}`);
    const observationId = uuid(`observation:${code}:${metric.period_start}:${metric.period_end}`);
    series.push({
      series_id: seriesId, series_code: code, indicator_id: indicator.indicator_id,
      geography_id: county.geography_id, geography_taxonomy: county.geography_system || 'electoral', boundary_version: '2012-01',
      frequency: metric.frequency, period_type: metric.period_type, unit_id: indicator.unit_id,
      price_basis: 'not_applicable', base_period: '', currency: '', seasonal_adjustment: 'none', transformation: metric.transformation,
      geographic_method: 'direct', comparability_group: metric.comparability_group,
      dataset_id: dataset.dataset_id, agency_id: source.agency_id, methodology_url: sourceInfo.url,
      start_period: metric.period_label, end_period: metric.period_label, latest_observation_id: observationId,
      observation_count: 1, last_updated_at: INGESTED_AT, next_expected_release: '', status: 'active', superseded_by_series_id: ''
    });
    observations.push({
      observation_id: observationId, series_id: seriesId, geography_id: county.geography_id, boundary_version: '2012-01',
      period_start: metric.period_start, period_end: metric.period_end, period_type: metric.period_type, period_label: metric.period_label,
      value: Number(sourceMetric.value), geographic_method: 'direct', statistical_status: 'final', source_class: 'official', badge: 'A',
      source_release_id: release?.release_id || '', source_dataset_id: dataset.dataset_id,
      source_table: sourceTable, source_sheet: '', source_page: '', source_row_label: sourceRow.county_name || county.name,
      source_url: sourceInfo.url, published_at: sourceInfo.published_at || '', ingested_at: INGESTED_AT,
      vintage_id: uuid(`vintage:${code}:${metric.period_start}:1`), supersedes_observation_id: '',
      lower_bound: null, upper_bound: null, confidence_level: null,
      standard_error: sourceMetric.standard_error ?? null, sample_size: sourceMetric.sample_size ?? null,
      suppression_reason: '', crosswalk_id: '', notes: metric.note
    });
  }

  Object.assign(indicator, {
    name: metric.name, short_name: metric.short_name, description: metric.description,
    lifecycle_status: 'active', active: true, comparable: true, ranking_allowed: metric.ranking_allowed,
    requires_sampling_uncertainty: metric.requires_sampling_uncertainty,
    methodology_url: sourceInfo.url, expected_source: dataset.title, expected_source_url: sourceInfo.url,
    expected_availability_note: `Published for all 47 counties for ${metric.period_label}. ${metric.note}`
  });
}

{
  const indicator = indicatorByCode.get('IND-HEALTH-FACILITY-COUNT');
  if (!indicator) throw new Error('P20 P04: IND-HEALTH-FACILITY-COUNT missing');
  const unit = unitById.get(indicator.unit_id);
  if (!unit || unit.code !== 'count') throw new Error('P20 P04: health-facility count must use count unit');
  const dataset = findPublishedDataset(datasets, 'DS-MOH-HEALTH-FACILITY-CENSUS-2023');
  const source = sourceById.get(dataset.source_id);
  if (!source) throw new Error('P20 P04: facility dataset source missing');
  const release = findRelease(releases, dataset, facilities.source_url);
  let total = 0;
  for (const county of counties) {
    const sourceRow = facilityByGeo.get(county.geo_code);
    const value = Number(sourceRow?.value);
    if (!Number.isFinite(value)) throw new Error(`P20 P04: facility count missing for ${county.geo_code}`);
    total += value;
    const code = `${SERIES_PREFIX}HEALTH-FACILITY-COUNT-${county.geo_code}`;
    const seriesId = uuid(`series:${code}`);
    const observationId = uuid(`observation:${code}:2023-08-01:2023-09-30`);
    series.push({
      series_id: seriesId, series_code: code, indicator_id: indicator.indicator_id,
      geography_id: county.geography_id, geography_taxonomy: county.geography_system || 'electoral', boundary_version: '2012-01',
      frequency: 'point_in_time', period_type: 'point_in_time', unit_id: indicator.unit_id,
      price_basis: 'not_applicable', base_period: '', currency: '', seasonal_adjustment: 'none', transformation: 'level',
      geographic_method: 'direct', comparability_group: 'P20-MOH-HEALTH-FACILITY-CENSUS-ASSESSED-2023',
      dataset_id: dataset.dataset_id, agency_id: source.agency_id, methodology_url: facilities.source_url,
      start_period: 'Aug–Sep 2023', end_period: 'Aug–Sep 2023', latest_observation_id: observationId,
      observation_count: 1, last_updated_at: INGESTED_AT, next_expected_release: '', status: 'active', superseded_by_series_id: ''
    });
    observations.push({
      observation_id: observationId, series_id: seriesId, geography_id: county.geography_id, boundary_version: '2012-01',
      period_start: '2023-08-01', period_end: '2023-09-30', period_type: 'point_in_time', period_label: 'Aug–Sep 2023', value,
      geographic_method: 'direct', statistical_status: 'final', source_class: 'official', badge: 'A',
      source_release_id: release?.release_id || '', source_dataset_id: dataset.dataset_id,
      source_table: facilities.source_table, source_sheet: '', source_page: '', source_row_label: sourceRow.county_name || county.name,
      source_url: facilities.source_url, published_at: facilities.published_at || '', ingested_at: INGESTED_AT,
      vintage_id: uuid(`vintage:${code}:2023-08-01:1`), supersedes_observation_id: '',
      lower_bound: null, upper_bound: null, confidence_level: null, standard_error: null, sample_size: null,
      suppression_reason: '', crosswalk_id: '',
      notes: `${facilities.counting_rule} Raw facility counts are retained as contextual inventory evidence and are not ranked.`
    });
  }
  if (total !== facilities.national_total_assessed) throw new Error(`P20 P04: facility county sum ${total} does not reconcile to ${facilities.national_total_assessed}`);
  Object.assign(indicator, {
    name: 'Health facilities assessed (2023 census)', short_name: 'Health facilities assessed',
    description: 'County count of facilities assessed in the August–September 2023 Kenya Health Facility Census.',
    lifecycle_status: 'active', active: true, comparable: true, ranking_allowed: false, requires_sampling_uncertainty: false,
    methodology_url: facilities.source_url, expected_source: facilities.source_title, expected_source_url: facilities.source_url,
    expected_availability_note: `Published for all 47 counties for August–September 2023. ${facilities.counting_rule}`
  });
}

await Promise.all([
  writeFile(path.join(root, 'data/indicators/registry/indicators.json'), JSON.stringify(indicators, null, 2) + '\n'),
  writeFile(path.join(root, 'data/indicators/registry/indicators.csv'), csv(indicators)),
  writeFile(path.join(root, 'data/indicators/registry/series.json'), JSON.stringify(series, null, 2) + '\n'),
  writeFile(path.join(root, 'data/indicators/registry/series.csv'), csv(series)),
  writeFile(path.join(root, 'data/indicators/registry/observations.json'), JSON.stringify(observations, null, 2) + '\n'),
  writeFile(path.join(root, 'data/indicators/registry/observations.csv'), csv(observations))
]);

console.log('P20_P04_INDICATORS_OK poverty=47 stunting=47 immunisation=47 skilled_birth=47 facilities=47 promoted=235');
