import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/p20/build-household-size.mjs <catalogue|indicators>');
  process.exit(2);
}

const INGESTED_AT = '2026-08-31T07:00:00.000Z';
const DATASET_CODE = 'DS-KNBS-KPHC-HOUSEHOLD-SIZE-2019-P20';
const RELEASE_CODE = 'REL-KNBS-KPHC-HOUSEHOLD-SIZE-2019-P20';
const SERIES_PREFIX = 'KDA-P20-HOUSEHOLD-SIZE-';
const EXPECTED_CODES = Array.from({ length: 47 }, (_, i) => `KEN-C${String(i + 1).padStart(3, '0')}`);
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const csv = rows => {
  const fields = unionFields(rows);
  return [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';
};
const uuid = name => {
  const hash = createHash('sha1').update(`kenya-data-atlas:p20-household-size:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const formalCountyName = geo => geo?.geo_code === 'KEN-C047' ? 'Nairobi City' : geo?.name;
const normalizeCountyName = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

function validateSnapshot(snapshot) {
  const rows = snapshot.counties || [];
  const byCode = new Map(rows.map(row => [row.geo_code, row]));
  if (rows.length !== 47 || byCode.size !== 47 || EXPECTED_CODES.some(code => !byCode.has(code))) {
    throw new Error(`P20 household size: source snapshot must reconcile exactly 47/47 county codes; rows=${rows.length} unique=${byCode.size}`);
  }
  if (rows.some(row => !Number.isFinite(Number(row.value)) || Number(row.value) <= 0)) {
    throw new Error('P20 household size: every county requires a positive finite published household-size value');
  }
  if (!snapshot.source_url || !snapshot.source_table) throw new Error('P20 household size: source metadata is incomplete');
  return { rows, byCode };
}

async function buildCatalogue() {
  const dir = 'data/catalogue/registry';
  let [datasets, releases, sources, snapshot] = await Promise.all([
    readJson(`${dir}/datasets.json`), readJson(`${dir}/releases.json`), readJson(`${dir}/sources.json`),
    readJson('data/p20/source/household-size-2019.json')
  ]);
  validateSnapshot(snapshot);
  const source = sources.find(row => row.source_code === 'KNBS-STATISTICS');
  if (!source) throw new Error('P20 household size: KNBS-STATISTICS source missing from canonical catalogue');

  let dataset = datasets.find(row => row.dataset_code === DATASET_CODE);
  if (!dataset) {
    dataset = {
      dataset_id: uuid(`dataset:${DATASET_CODE}`),
      dataset_code: DATASET_CODE,
      source_id: source.source_id,
      title: '2019 KPHC — Average Household Size by County',
      description: 'Average household size for all 47 counties, transcribed from KNBS 2019 KPHC Volume I Table 2.3.',
      topic: 'Demography',
      geographic_coverage: ['county'],
      frequency: 'decennial',
      publication_status: 'published',
      methodology_url: snapshot.source_url,
      known_limitations: '2019 census snapshot. KNBS Table 2.3 excludes the special population from the conventional-household denominator; no current-year interpolation is made.'
    };
    datasets.push(dataset);
  }

  if (!releases.some(row => row.release_code === RELEASE_CODE)) {
    releases.push({
      release_id: uuid(`release:${RELEASE_CODE}`),
      release_code: RELEASE_CODE,
      dataset_id: dataset.dataset_id,
      title: '2019 KPHC average household size by county — Table 2.3',
      reference_period_start: snapshot.reference_period_start,
      reference_period_end: snapshot.reference_period_end,
      published_at: snapshot.published_at,
      discovered_at: INGESTED_AT,
      ingested_at: INGESTED_AT,
      release_url: snapshot.source_url,
      release_status: 'published',
      version_label: 'P20 governed county-source promotion',
      release_notes: `${snapshot.publication}; ${snapshot.source_table}. Values are direct reported county averages; no interpolation or parent-geography inheritance.`,
      supersedes_release_id: ''
    });
  }

  await Promise.all([
    writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(datasets, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/datasets.csv`), csv(datasets)),
    writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(releases, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/releases.csv`), csv(releases))
  ]);
  console.log('P20_HOUSEHOLD_SIZE_CATALOGUE_OK dataset=1 release=1');
}

async function buildIndicators() {
  const dir = 'data/indicators/registry';
  let [units, indicators, series, observations, geographies, datasets, releases, sources, snapshot] = await Promise.all([
    readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`), readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'),
    readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json'),
    readJson('data/p20/source/household-size-2019.json')
  ]);
  const { byCode } = validateSnapshot(snapshot);
  const counties = geographies.filter(geo => geo.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
  if (counties.length !== 47) throw new Error(`P20 household size: expected 47 canonical counties, found ${counties.length}`);
  for (const county of counties) {
    const sourceRow = byCode.get(county.geo_code);
    if (!sourceRow) throw new Error(`P20 household size: ${county.geo_code} absent from source snapshot`);
    if (normalizeCountyName(sourceRow.county_name) !== normalizeCountyName(formalCountyName(county))) {
      throw new Error(`P20 household size: county-name mismatch ${county.geo_code}: ${sourceRow.county_name} vs ${formalCountyName(county)}`);
    }
  }

  const indicator = indicators.find(row => row.indicator_code === 'IND-HOUSEHOLD-SIZE');
  const unit = units.find(row => row.code === 'persons_per_household');
  const dataset = datasets.find(row => row.dataset_code === DATASET_CODE);
  const release = releases.find(row => row.release_code === RELEASE_CODE);
  const source = dataset ? sources.find(row => row.source_id === dataset.source_id) : null;
  if (!indicator || !unit || !dataset || !release || !source) throw new Error('P20 household size: required indicator/unit/catalogue records missing; run catalogue mode first');

  const oldIds = new Set(series.filter(row => String(row.series_code).startsWith(SERIES_PREFIX)).map(row => row.series_id));
  series = series.filter(row => !oldIds.has(row.series_id));
  observations = observations.filter(row => !oldIds.has(row.series_id));

  for (const county of counties) {
    const sourceRow = byCode.get(county.geo_code);
    const code = `${SERIES_PREFIX}${county.geo_code}`;
    const seriesId = uuid(`series:${code}`);
    const observationId = uuid(`observation:${code}:${snapshot.reference_period_start}:${snapshot.reference_period_end}`);
    series.push({
      series_id: seriesId,
      series_code: code,
      indicator_id: indicator.indicator_id,
      geography_id: county.geography_id,
      geography_taxonomy: county.geography_system || 'electoral',
      boundary_version: '2012-01',
      frequency: 'decennial',
      period_type: 'census',
      unit_id: unit.unit_id,
      price_basis: 'not_applicable',
      base_period: '',
      currency: '',
      seasonal_adjustment: 'none',
      transformation: 'level',
      geographic_method: 'direct',
      comparability_group: 'P20-KPHC-2019-HOUSEHOLD-SIZE-COUNTY',
      dataset_id: dataset.dataset_id,
      agency_id: source.agency_id,
      methodology_url: snapshot.source_url,
      start_period: snapshot.period_label,
      end_period: snapshot.period_label,
      latest_observation_id: observationId,
      observation_count: 1,
      last_updated_at: INGESTED_AT,
      next_expected_release: '',
      status: 'active',
      superseded_by_series_id: ''
    });
    observations.push({
      observation_id: observationId,
      series_id: seriesId,
      geography_id: county.geography_id,
      boundary_version: '2012-01',
      period_start: snapshot.reference_period_start,
      period_end: snapshot.reference_period_end,
      period_type: 'census',
      period_label: snapshot.period_label,
      value: Number(sourceRow.value),
      geographic_method: 'direct',
      statistical_status: 'final',
      source_class: 'official',
      badge: 'A',
      source_release_id: release.release_id,
      source_dataset_id: dataset.dataset_id,
      source_table: snapshot.source_table,
      source_sheet: '',
      source_page: '',
      source_row_label: sourceRow.county_name,
      source_url: snapshot.source_url,
      published_at: snapshot.published_at,
      ingested_at: INGESTED_AT,
      vintage_id: uuid(`vintage:${code}:${snapshot.reference_period_start}:1`),
      supersedes_observation_id: '',
      lower_bound: null,
      upper_bound: null,
      confidence_level: null,
      standard_error: null,
      sample_size: null,
      suppression_reason: '',
      crosswalk_id: '',
      notes: 'Direct KNBS 2019 KPHC Table 2.3 county average household size. The source excludes the special population from the conventional-household denominator. No value transformation, interpolation, or geographic inheritance is applied.'
    });
  }

  Object.assign(indicator, {
    name: 'Average household size',
    short_name: 'Household size',
    description: 'Average number of persons per conventional household in the 2019 Kenya Population and Housing Census.',
    unit_id: unit.unit_id,
    lifecycle_status: 'active',
    active: true,
    comparable: true,
    ranking_allowed: false,
    methodology_url: snapshot.source_url,
    expected_source: 'KNBS 2019 Kenya Population and Housing Census, Volume I, Table 2.3',
    expected_source_url: snapshot.source_url,
    expected_availability_note: 'Published directly for all 47 counties in KNBS 2019 KPHC Volume I Table 2.3. County values are census observations and are not inherited to constituencies.'
  });

  await Promise.all([
    writeFile(path.join(root, `${dir}/indicators.json`), JSON.stringify(indicators, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/indicators.csv`), csv(indicators)),
    writeFile(path.join(root, `${dir}/series.json`), JSON.stringify(series, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/series.csv`), csv(series)),
    writeFile(path.join(root, `${dir}/observations.json`), JSON.stringify(observations, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/observations.csv`), csv(observations))
  ]);
  console.log('P20_HOUSEHOLD_SIZE_INDICATORS_OK counties=47 direct=47');
}

if (mode === 'catalogue') await buildCatalogue();
else await buildIndicators();
