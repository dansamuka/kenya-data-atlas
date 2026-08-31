import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_FILE = 'data/p20/source/kdhs-2022-additional-county.json';
const DATASET_CODE = 'DS-KNBS-KDHS-2022-COUNTY';
const PREFIX = 'KDA-P20-KDHS-';
const INGESTED_AT = '2026-08-31T00:00:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root,p),'utf8'));
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"','""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const csv = rows => {
  const fields = unionFields(rows);
  return [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';
};
const uuid = name => {
  const hash = createHash('sha1').update(`kenya-data-atlas:p20-kdhs-extra:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0,16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

const METRICS = [
  {
    indicator_code:'IND-TEENAGE-PREGNANCY', key:'teenage_pregnancy_pct', sample_key:'teenage_pregnancy_sample_size',
    short:'TEENAGE-PREGNANCY', name:'Teenage pregnancy, age 15–19', short_name:'Teenage pregnancy',
    description:'Percentage of women age 15–19 who have ever been pregnant in the 2022 Kenya Demographic and Health Survey.',
    source_table:'Key Indicators Report Table 6C — Teenage pregnancy by county',
    source_url_key:'key_indicators_report_url', comparability_group:'P20-KDHS-TEENAGE-PREGNANCY-2022',
    period_start:'2022-02-17', period_end:'2022-07-19', period_label:'2022 KDHS',
    note:'KDHS 2022 county point estimate. The source-reported number of women age 15–19 is retained as survey precision metadata. Sensitive point-estimate ranking remains prohibited.'
  },
  {
    indicator_code:'IND-HOME-BIRTH-RATE', key:'home_birth_pct', sample_key:'home_birth_sample_size',
    short:'HOME-BIRTH', name:'Home birth rate', short_name:'Home births',
    description:'Percentage of live births in the two years before the 2022 Kenya Demographic and Health Survey that occurred at home.',
    source_table:'Final Report Volume 1 Table 9.7C — Place of delivery by county',
    source_url_key:'final_report_url', comparability_group:'P20-KDHS-HOME-BIRTH-2022',
    period_start:'2020-02-17', period_end:'2022-07-19', period_label:'2022 KDHS · births in preceding 2 years',
    note:'KDHS 2022 county point estimate for live births in the two years before interview. The source-reported number of births is retained as survey precision metadata; individual reference windows vary with interview date.'
  }
];

let [source,units,indicators,series,observations,geographies,datasets,releases,sources] = await Promise.all([
  readJson(SOURCE_FILE), readJson('data/indicators/registry/units.json'), readJson('data/indicators/registry/indicators.json'),
  readJson('data/indicators/registry/series.json'), readJson('data/indicators/registry/observations.json'),
  readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'),
  readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json')
]);

const counties = geographies.filter(row => row.level === 'county').sort((a,b)=>String(a.geo_code).localeCompare(String(b.geo_code)));
if (counties.length !== 47) throw new Error(`P20 KDHS extra: expected 47 counties, found ${counties.length}`);
if ((source.counties||[]).length !== 47) throw new Error(`P20 KDHS extra: source must contain 47 counties, found ${(source.counties||[]).length}`);
const sourceByGeo = new Map(source.counties.map(row => [row.geo_code,row]));
for (const county of counties) if (!sourceByGeo.has(county.geo_code)) throw new Error(`P20 KDHS extra: source missing ${county.geo_code}`);

const dataset = datasets.find(row => row.dataset_code === DATASET_CODE);
if (!dataset || !['approved','published'].includes(dataset.publication_status)) throw new Error(`P20 KDHS extra: ${DATASET_CODE} is not published`);
const catalogueSource = sources.find(row => row.source_id === dataset.source_id);
if (!catalogueSource) throw new Error('P20 KDHS extra: dataset source missing');
const release = releases.find(row => row.dataset_id === dataset.dataset_id && row.release_status === 'published') || null;
const indicatorByCode = new Map(indicators.map(row => [row.indicator_code,row]));
const unitById = new Map(units.map(row => [row.unit_id,row]));

const oldSeriesIds = new Set(series.filter(row => String(row.series_code).startsWith(PREFIX)).map(row => row.series_id));
series = series.filter(row => !oldSeriesIds.has(row.series_id));
observations = observations.filter(row => !oldSeriesIds.has(row.series_id));

for (const metric of METRICS) {
  const indicator = indicatorByCode.get(metric.indicator_code);
  if (!indicator) throw new Error(`P20 KDHS extra: missing ${metric.indicator_code}`);
  const unit = unitById.get(indicator.unit_id);
  if (!unit || unit.code !== 'percent') throw new Error(`P20 KDHS extra: ${metric.indicator_code} must use percent`);
  const sourceUrl = source[metric.source_url_key];
  if (!sourceUrl) throw new Error(`P20 KDHS extra: source URL missing for ${metric.indicator_code}`);

  Object.assign(indicator, {
    name:metric.name, short_name:metric.short_name, description:metric.description,
    methodology_url:sourceUrl, active:true, lifecycle_status:'active', comparable:true,
    expected_source:'Kenya Demographic and Health Survey 2022', expected_source_url:source.landing_page_url,
    expected_availability_note:`Published for all 47 counties. ${metric.note}`,
    requires_sampling_uncertainty:true, ranking_allowed:false
  });

  for (const county of counties) {
    const src = sourceByGeo.get(county.geo_code);
    const value = Number(src[metric.key]);
    const sampleSize = Number(src[metric.sample_key]);
    if (!Number.isFinite(value)) throw new Error(`P20 KDHS extra: ${metric.indicator_code} ${county.geo_code} missing value`);
    if (!Number.isFinite(sampleSize) || sampleSize <= 0) throw new Error(`P20 KDHS extra: ${metric.indicator_code} ${county.geo_code} missing source denominator`);
    const seriesCode = `${PREFIX}${metric.short}-${county.geo_code}`;
    const seriesId = uuid(`series:${seriesCode}`);
    const observationId = uuid(`observation:${seriesCode}:${metric.period_start}:${metric.period_end}`);
    series.push({
      series_id:seriesId, series_code:seriesCode, indicator_id:indicator.indicator_id,
      geography_id:county.geography_id, geography_taxonomy:county.geography_system||'electoral', boundary_version:'2012-01',
      frequency:'periodic', period_type:'survey_period', unit_id:indicator.unit_id, price_basis:'not_applicable', base_period:'', currency:'',
      seasonal_adjustment:'none', transformation:'level', geographic_method:'direct', comparability_group:metric.comparability_group,
      dataset_id:dataset.dataset_id, agency_id:catalogueSource.agency_id, methodology_url:sourceUrl,
      start_period:metric.period_label, end_period:metric.period_label, latest_observation_id:observationId, observation_count:1,
      last_updated_at:INGESTED_AT, next_expected_release:'', status:'active', superseded_by_series_id:''
    });
    observations.push({
      observation_id:observationId, series_id:seriesId, geography_id:county.geography_id, boundary_version:'2012-01',
      period_start:metric.period_start, period_end:metric.period_end, period_type:'survey_period', period_label:metric.period_label,
      value, geographic_method:'direct', statistical_status:'final', source_class:'official', badge:'A',
      source_release_id:release?.release_id||'', source_dataset_id:dataset.dataset_id, source_table:metric.source_table,
      source_sheet:'', source_page:'', source_row_label:src.county_name, source_url:sourceUrl, published_at:'', ingested_at:INGESTED_AT,
      vintage_id:uuid(`vintage:${seriesCode}:${metric.period_start}:1`), supersedes_observation_id:'',
      lower_bound:null, upper_bound:null, confidence_level:null, standard_error:null, sample_size:sampleSize,
      suppression_reason:'', crosswalk_id:'', notes:metric.note
    });
  }
}

await Promise.all([
  writeFile(path.join(root,'data/indicators/registry/indicators.json'),JSON.stringify(indicators,null,2)+'\n'),
  writeFile(path.join(root,'data/indicators/registry/indicators.csv'),csv(indicators)),
  writeFile(path.join(root,'data/indicators/registry/series.json'),JSON.stringify(series,null,2)+'\n'),
  writeFile(path.join(root,'data/indicators/registry/series.csv'),csv(series)),
  writeFile(path.join(root,'data/indicators/registry/observations.json'),JSON.stringify(observations,null,2)+'\n'),
  writeFile(path.join(root,'data/indicators/registry/observations.csv'),csv(observations))
]);

console.log('P20_KDHS_ADDITIONAL_OK teenage_pregnancy=47 home_birth=47 promoted=94 precision=source_denominator');
