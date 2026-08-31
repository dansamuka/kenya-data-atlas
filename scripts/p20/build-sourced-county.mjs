import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/p20/build-sourced-county.mjs <catalogue|indicators>');
  process.exit(2);
}

const INGESTED_AT = '2026-08-31T00:00:00.000Z';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const csv = rows => {
  const fields = unionFields(rows);
  return [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';
};
const uuid = name => {
  const hash = createHash('sha1').update(`kenya-data-atlas:p20:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

const DATASET_CODE = 'DS-TREASURY-COUNTY-OSR-2024-25-P20';
const RELEASE_CODE = 'REL-TREASURY-COUNTY-OSR-2024-25-P20';
const P20_PREFIX = 'KDA-P20-';

async function buildCatalogue() {
  const dir = 'data/catalogue/registry';
  const [datasets, releases, sources] = await Promise.all([
    readJson(`${dir}/datasets.json`), readJson(`${dir}/releases.json`), readJson(`${dir}/sources.json`)
  ]);
  const treasury = sources.find(source => source.source_code === 'TREASURY-FISCAL');
  if (!treasury) throw new Error('P20: TREASURY-FISCAL source is missing from the canonical catalogue');

  const source = await readJson('data/countyiq/source/p10-fiscal-accountability-2024-25.json');
  const brop = source.sources?.treasury_brop;
  if (!brop?.source_url) throw new Error('P20: fiscal-accountability source snapshot is missing the Treasury BROP URL');
  const countyRows = Object.entries(source.counties || {});
  if (countyRows.length !== 47) throw new Error(`P20: fiscal-accountability source must contain 47 counties, found ${countyRows.length}`);
  if (countyRows.some(([,row]) => !Number.isFinite(Number(row.osr_target_attainment_pct)))) {
    throw new Error('P20: every county must have a finite published OSR target-attainment value');
  }

  let dataset = datasets.find(row => row.dataset_code === DATASET_CODE);
  if (!dataset) {
    dataset = {
      dataset_id: uuid(`dataset:${DATASET_CODE}`),
      dataset_code: DATASET_CODE,
      source_id: treasury.source_id,
      title: '2025 Budget Review and Outlook Paper — County OSR Target Attainment',
      description: 'FY2024/25 county own-source revenue target-attainment percentages published by the National Treasury using Controller of Budget data.',
      topic: 'Public Finance',
      geographic_coverage: ['county'],
      frequency: 'annual',
      publication_status: 'published',
      methodology_url: brop.source_url,
      known_limitations: 'Full-year own-source revenue including FIF/AiA divided by the published target. Values are retained at the whole-percentage precision published in the 2025 BROP; no missing county is estimated or interpolated.'
    };
    datasets.push(dataset);
  }

  if (!releases.some(row => row.release_code === RELEASE_CODE)) {
    releases.push({
      release_id: uuid(`release:${RELEASE_CODE}`),
      release_code: RELEASE_CODE,
      dataset_id: dataset.dataset_id,
      title: 'County OSR target attainment — FY2024/25',
      reference_period_start: '2024-07-01',
      reference_period_end: '2025-06-30',
      published_at: '',
      discovered_at: INGESTED_AT,
      ingested_at: INGESTED_AT,
      release_url: brop.source_url,
      release_status: 'published',
      version_label: 'P20 governed county-source promotion',
      release_notes: `National Treasury 2025 BROP ${brop.osr_table || 'Table 8 / Annex Table 7'}; primary data agency stated in the source snapshot as ${brop.primary_data_agency || 'Office of the Controller of Budget'}.`,
      supersedes_release_id: ''
    });
  }

  await Promise.all([
    writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(datasets, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/datasets.csv`), csv(datasets)),
    writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(releases, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/releases.csv`), csv(releases))
  ]);
  console.log('P20_CATALOGUE_OK datasets=1 releases=1');
}

function latestObservation(series, observations) {
  if (series.latest_observation_id) {
    const exact = observations.find(obs => obs.observation_id === series.latest_observation_id);
    if (exact) return exact;
  }
  return [...observations].sort((a,b) => String(a.period_end || a.period_start || '').localeCompare(String(b.period_end || b.period_start || ''))).at(-1) || null;
}

async function buildIndicators() {
  const dir = 'data/indicators/registry';
  let [units, indicators, series, observations, geographies, datasets, releases, sources, manifest, fiscal] = await Promise.all([
    readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`), readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'),
    readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json'),
    readJson('data/p05/source/manifest.json'), readJson('data/countyiq/source/p10-fiscal-accountability-2024-25.json')
  ]);

  const counties = geographies.filter(geo => geo.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
  if (counties.length !== 47) throw new Error(`P20: expected 47 county geographies, found ${counties.length}`);
  const indicatorByCode = new Map(indicators.map(indicator => [indicator.indicator_code, indicator]));
  const unitByCode = new Map(units.map(unit => [unit.code, unit]));
  const datasetByCode = new Map(datasets.map(dataset => [dataset.dataset_code, dataset]));
  const releaseByCode = new Map(releases.map(release => [release.release_code, release]));
  const sourceById = new Map(sources.map(source => [source.source_id, source]));
  const obsBySeries = new Map();
  for (const obs of observations) {
    if (!obsBySeries.has(obs.series_id)) obsBySeries.set(obs.series_id, []);
    obsBySeries.get(obs.series_id).push(obs);
  }

  const electricitySource = indicatorByCode.get('IND-MAIN-GRID-ELECTRICITY');
  const electricityTarget = indicatorByCode.get('IND-ELECTRICITY-ACCESS');
  const osrTarget = indicatorByCode.get('IND-COUNTY-OSR');
  if (!electricitySource || !electricityTarget || !osrTarget) throw new Error('P20: required source/target indicators are missing after placeholder taxonomy application');
  const pct = unitByCode.get('percent');
  if (!pct) throw new Error('P20: percent unit missing');

  // Idempotence: generated P20 products are rebuilt from their reviewed source
  // snapshots each time rather than incrementally mutating prior output.
  const oldP20SeriesIds = new Set(series.filter(row => String(row.series_code).startsWith(P20_PREFIX)).map(row => row.series_id));
  series = series.filter(row => !oldP20SeriesIds.has(row.series_id));
  observations = observations.filter(row => !oldP20SeriesIds.has(row.series_id));

  // 1) Governed electricity slot: reuse the already-published 47-county KHS
  // series from P05/P19. We clone the canonical evidence under the governed
  // placeholder indicator instead of fetching, estimating or duplicating a
  // separate data source.
  const sourceSeriesByGeo = new Map();
  for (const row of series) {
    if (row.indicator_id !== electricitySource.indicator_id) continue;
    const own = obsBySeries.get(row.series_id) || [];
    if (!latestObservation(row, own)) continue;
    sourceSeriesByGeo.set(row.geography_id, { row, own });
  }
  if (sourceSeriesByGeo.size !== 47) throw new Error(`P20: main-grid electricity source coverage must be 47/47, found ${sourceSeriesByGeo.size}`);

  for (const county of counties) {
    const sourcePack = sourceSeriesByGeo.get(county.geography_id);
    if (!sourcePack) throw new Error(`P20: missing electricity source series for ${county.geo_code}`);
    const code = `${P20_PREFIX}ELECTRICITY-${county.geo_code}`;
    const seriesId = uuid(`series:${code}`);
    const cloned = sourcePack.own.map(obs => ({
      ...obs,
      observation_id: uuid(`observation:${code}:${obs.period_start}:${obs.period_end}`),
      series_id: seriesId,
      vintage_id: uuid(`vintage:${code}:${obs.period_start}:1`),
      supersedes_observation_id: '',
      notes: `${obs.notes ? `${obs.notes} ` : ''}P20 governed-slot alias of the already-published KHS main-grid electricity observation; no value transformation or geographic inheritance.`
    })).sort((a,b) => String(a.period_start).localeCompare(String(b.period_start)));
    const latest = cloned.at(-1);
    series.push({
      ...sourcePack.row,
      series_id: seriesId,
      series_code: code,
      indicator_id: electricityTarget.indicator_id,
      comparability_group: 'P20-ELECTRICITY-ACCESS-KHS-2023-24',
      start_period: cloned[0]?.period_label || '',
      end_period: latest?.period_label || '',
      latest_observation_id: latest?.observation_id || '',
      observation_count: cloned.length,
      last_updated_at: latest?.ingested_at || INGESTED_AT
    });
    observations.push(...cloned);
  }
  Object.assign(electricityTarget, {
    name: 'Households connected to main-grid electricity',
    short_name: 'Main-grid electricity',
    description: 'Share of households connected to electricity on the main grid in the 2023/24 Kenya Housing Survey.',
    unit_id: pct.unit_id,
    lifecycle_status: 'active', active: true, comparable: true, ranking_allowed: false,
    methodology_url: manifest.sources?.housing_ch5 || electricitySource.methodology_url || '',
    expected_source: 'KNBS 2023/24 Kenya Housing Survey — Housing Characteristics, Amenities and Adequacy',
    expected_source_url: manifest.sources?.housing_ch5 || electricitySource.methodology_url || '',
    expected_availability_note: 'Published for all 47 counties. This governed profile slot reuses the canonical P05/P19 main-grid electricity series; no parent value is inherited.'
  });

  // 2) County own-source revenue target attainment: a direct 47-county table
  // already reviewed for P10. P20 promotes that source snapshot to the
  // canonical indicator registry while retaining the publication precision.
  const osrDataset = datasetByCode.get(DATASET_CODE);
  const osrRelease = releaseByCode.get(RELEASE_CODE);
  if (!osrDataset || !osrRelease) throw new Error('P20: OSR catalogue dataset/release missing; run catalogue mode first');
  const source = sourceById.get(osrDataset.source_id);
  if (!source) throw new Error('P20: OSR catalogue source missing');
  const sourceRows = fiscal.counties || {};
  if (Object.keys(sourceRows).length !== 47) throw new Error('P20: OSR source snapshot must contain 47 counties');
  const sourceUrl = fiscal.sources?.treasury_brop?.source_url || osrRelease.release_url;
  const sourceTable = fiscal.sources?.treasury_brop?.osr_table || 'Table 8 / Annex Table 7';

  for (const county of counties) {
    const value = Number(sourceRows[county.geo_code]?.osr_target_attainment_pct);
    if (!Number.isFinite(value)) throw new Error(`P20: missing finite OSR target-attainment value for ${county.geo_code}`);
    const code = `${P20_PREFIX}COUNTY-OSR-${county.geo_code}`;
    const seriesId = uuid(`series:${code}`);
    const observationId = uuid(`observation:${code}:2024-07-01:2025-06-30`);
    series.push({
      series_id: seriesId, series_code: code, indicator_id: osrTarget.indicator_id,
      geography_id: county.geography_id, geography_taxonomy: county.geography_system || 'electoral', boundary_version: '2012-01',
      frequency: 'annual', period_type: 'fiscal_year', unit_id: pct.unit_id,
      price_basis: 'not_applicable', base_period: '', currency: '', seasonal_adjustment: 'none', transformation: 'rate',
      geographic_method: 'direct', comparability_group: 'P20-COUNTY-OSR-ATTAINMENT-FY2024-25',
      dataset_id: osrDataset.dataset_id, agency_id: source.agency_id, methodology_url: sourceUrl,
      start_period: 'FY 2024/25', end_period: 'FY 2024/25', latest_observation_id: observationId,
      observation_count: 1, last_updated_at: INGESTED_AT, next_expected_release: '', status: 'active', superseded_by_series_id: ''
    });
    observations.push({
      observation_id: observationId, series_id: seriesId, geography_id: county.geography_id, boundary_version: '2012-01',
      period_start: '2024-07-01', period_end: '2025-06-30', period_type: 'fiscal_year', period_label: 'FY 2024/25', value,
      geographic_method: 'direct', statistical_status: 'final', source_class: 'official', badge: 'A',
      source_release_id: osrRelease.release_id, source_dataset_id: osrDataset.dataset_id,
      source_table: sourceTable, source_sheet: '', source_page: '', source_row_label: county.name,
      source_url: sourceUrl, published_at: '', ingested_at: INGESTED_AT,
      vintage_id: uuid(`vintage:${code}:2024-07-01:1`), supersedes_observation_id: '',
      lower_bound: null, upper_bound: null, confidence_level: null, standard_error: null, sample_size: null,
      suppression_reason: '', crosswalk_id: '',
      notes: 'Published full-year own-source revenue target attainment, including FIF/AiA, retained at the whole-percentage precision in the 2025 BROP. The source document identifies Controller of Budget data; no interpolation or county substitution is used.'
    });
  }
  Object.assign(osrTarget, {
    name: 'Own-source revenue target attainment', short_name: 'OSR target attainment',
    description: 'County own-source revenue collected as a percentage of the published FY2024/25 target.',
    unit_id: pct.unit_id, lifecycle_status: 'active', active: true, comparable: true, ranking_allowed: false,
    methodology_url: sourceUrl,
    expected_source: 'National Treasury 2025 BROP using Controller of Budget data', expected_source_url: sourceUrl,
    expected_availability_note: 'Published for all 47 counties for FY2024/25. Values retain the source table’s whole-percentage precision.'
  });

  await Promise.all([
    writeFile(path.join(root, `${dir}/indicators.json`), JSON.stringify(indicators, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/indicators.csv`), csv(indicators)),
    writeFile(path.join(root, `${dir}/series.json`), JSON.stringify(series, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/series.csv`), csv(series)),
    writeFile(path.join(root, `${dir}/observations.json`), JSON.stringify(observations, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/observations.csv`), csv(observations))
  ]);
  console.log('P20_INDICATORS_OK electricity=47 osr=47 promoted=94');
}

if (mode === 'catalogue') await buildCatalogue();
else await buildIndicators();
