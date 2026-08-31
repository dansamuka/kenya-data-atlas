import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/p23/build-registered-voters.mjs <catalogue|indicators>');
  process.exit(2);
}

const DATASET_CODE = 'DS-IEBC-VOTERS-CONSTITUENCY-2022-P23A';
const RELEASE_CODE = 'REL-IEBC-VOTERS-CONSTITUENCY-2022-P23A';
const BASE_DATASET_CODE = 'DS-IEBC-VOTERS';
const INDICATOR_CODE = 'IND-REGISTERED-VOTERS';
const SOURCE_FILE = 'data/p23/source/constituency-voters-2022.csv';
const METHOD = 'aggregated';
const BADGE = 'B';
const REFERENCE_DATE = '2022-06-20';
const PUBLISHED_AT = '2022-06-21';
const INGESTED_AT = '2026-08-31T16:00:00+03:00';
const GAZETTE_URL = 'https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
const NATIONAL_TOTAL = 22102532;
const EXPECTED_ROWS = 290;
const GROUP = 'IEBC-REGISTERED-VOTERS-2022-CERTIFIED-CONSTITUENCY';

const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const readText = async p => readFile(path.join(root, p), 'utf8');
const csvCell = value => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replaceAll('"', '""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(f => csvCell(row[f])).join(','))].join('\n') + '\n';
const unionFields = rows => [...new Set(rows.flatMap(row => Object.keys(row)))];
const uuid = name => {
  const h = createHash('sha1').update(`kenya-data-atlas:p23a:${name}`).digest('hex').slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`;
};
function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines.shift().split(',').map(x => x.trim());
  return lines.filter(Boolean).map((line, index) => {
    const values = line.split(',');
    if (values.length !== headers.length) throw new Error(`P23A source row ${index + 2}: expected ${headers.length} columns, got ${values.length}`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i].trim()]));
  });
}
function validateSource(rows) {
  if (rows.length !== EXPECTED_ROWS) throw new Error(`P23A source: expected ${EXPECTED_ROWS} constituency rows, found ${rows.length}`);
  const codes = new Set(rows.map(r => Number(r.constituency_code)));
  if (codes.size !== EXPECTED_ROWS || Math.min(...codes) !== 1 || Math.max(...codes) !== 290) throw new Error('P23A source: constituency codes must cover 1..290 exactly once');
  if (rows.some(r => !Number.isInteger(Number(r.value)) || Number(r.value) <= 0)) throw new Error('P23A source: every constituency value must be a positive integer');
  if (rows.some(r => !Number.isInteger(Number(r.ward_row_count)) || Number(r.ward_row_count) <= 0)) throw new Error('P23A source: every constituency must retain a positive source ward-row count');
  const total = rows.reduce((sum, r) => sum + Number(r.value), 0);
  if (total !== NATIONAL_TOTAL) throw new Error(`P23A source: constituency total ${total} != ${NATIONAL_TOTAL}`);
  const anchors = new Map([[1,93561],[2,75085],[3,135276],[133,72997],[280,123163]]);
  for (const [code, expected] of anchors) {
    const row = rows.find(r => Number(r.constituency_code) === code);
    if (!row || Number(row.value) !== expected) throw new Error(`P23A source: constituency ${code} anchor != ${expected}`);
  }
}

async function buildCatalogue() {
  const dir = 'data/catalogue/registry';
  const [datasets, releases] = await Promise.all([readJson(`${dir}/datasets.json`), readJson(`${dir}/releases.json`)]);
  const base = datasets.find(d => d.dataset_code === BASE_DATASET_CODE);
  if (!base?.source_id) throw new Error(`P23A catalogue: base dataset ${BASE_DATASET_CODE} missing source_id`);

  const datasetId = uuid(`dataset:${DATASET_CODE}`);
  const releaseId = uuid(`release:${RELEASE_CODE}`);
  const dataset = {
    dataset_id: datasetId,
    dataset_code: DATASET_CODE,
    source_id: base.source_id,
    title: 'Registered Voters — 2022 Constituency Electorate',
    description: 'All 290 constituency registered-voter totals, preserved as exact official-derived sums of the IEBC 2022 First Schedule County Assembly Ward rows.',
    topic: 'Elections',
    geographic_coverage: ['constituency'],
    frequency: 'electoral_cycle',
    publication_status: 'published',
    methodology_url: 'data/sprint2/README.md',
    known_limitations: 'Constituency observations are B — Official derived: exact sums of official IEBC child-ward rows, not county values allocated downward. Ten Mandera East/Lafey ward rows remain included in constituency totals while their current ward geometry is explicitly held; that spatial hold does not reduce constituency coverage.'
  };
  const release = {
    release_id: releaseId,
    release_code: RELEASE_CODE,
    dataset_id: datasetId,
    title: 'Kenya Gazette Notice No. 7290 — 2022 Registered Voters, Constituency Totals',
    reference_period_start: REFERENCE_DATE,
    reference_period_end: REFERENCE_DATE,
    published_at: PUBLISHED_AT,
    discovered_at: INGESTED_AT,
    ingested_at: INGESTED_AT,
    release_url: GAZETTE_URL,
    release_status: 'published',
    version_label: '2022 certified register Gazette schedule',
    release_notes: 'Canonical P23A migration of the already-audited Sprint 2 constituency electorate. Values remain exact sums of all official First Schedule ward rows; the Gazette Second Schedule is retained as published constituency context rather than used to silently relabel the series as direct.',
    supersedes_release_id: ''
  };

  const nextDatasets = datasets.filter(d => d.dataset_code !== DATASET_CODE && d.dataset_id !== datasetId);
  const nextReleases = releases.filter(r => r.release_code !== RELEASE_CODE && r.release_id !== releaseId && r.dataset_id !== datasetId);
  nextDatasets.push(dataset);
  nextReleases.push(release);

  await writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(nextDatasets, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(nextReleases, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/datasets.csv`), csv(nextDatasets, unionFields(nextDatasets)));
  await writeFile(path.join(root, `${dir}/releases.csv`), csv(nextReleases, unionFields(nextReleases)));
  console.log(`P23A catalogue promoted ${DATASET_CODE}.`);
}

async function buildIndicators() {
  const dir = 'data/indicators/registry';
  const [raw, geographies, indicators, units, datasets, releases, sources, series, observations] = await Promise.all([
    readText(SOURCE_FILE),
    readJson('data/geography/registry/geographies.json'),
    readJson(`${dir}/indicators.json`),
    readJson(`${dir}/units.json`),
    readJson('data/catalogue/registry/datasets.json'),
    readJson('data/catalogue/registry/releases.json'),
    readJson('data/catalogue/registry/sources.json'),
    readJson(`${dir}/series.json`),
    readJson(`${dir}/observations.json`)
  ]);
  const rows = parseCsv(raw);
  validateSource(rows);

  const indicator = indicators.find(i => i.indicator_code === INDICATOR_CODE);
  if (!indicator) throw new Error(`P23A indicators: ${INDICATOR_CODE} missing`);
  const unit = units.find(u => u.unit_id === indicator.unit_id);
  if (!unit) throw new Error(`P23A indicators: unit for ${INDICATOR_CODE} missing`);
  const dataset = datasets.find(d => d.dataset_code === DATASET_CODE);
  const release = releases.find(r => r.release_code === RELEASE_CODE);
  if (!dataset || !release) throw new Error('P23A indicators: canonical dataset/release missing; run catalogue build first');
  const source = sources.find(s => s.source_id === dataset.source_id);
  const agencyId = source?.agency_id || '';

  const constituencies = geographies.filter(g => g.level === 'constituency');
  if (constituencies.length !== EXPECTED_ROWS) throw new Error(`P23A indicators: canonical registry has ${constituencies.length} constituencies, expected ${EXPECTED_ROWS}`);
  const geoByCode = new Map(constituencies.map(g => [Number(g.constituency_code), g]));
  if (geoByCode.size !== EXPECTED_ROWS) throw new Error('P23A indicators: constituency codes are not unique');

  const oldSeriesIds = new Set(series.filter(s => s.dataset_id === dataset.dataset_id || String(s.series_code || '').startsWith('KDA-P23A-VOTERS-')).map(s => s.series_id));
  const nextSeries = series.filter(s => !oldSeriesIds.has(s.series_id));
  const nextObservations = observations.filter(o => !oldSeriesIds.has(o.series_id) && o.source_dataset_id !== dataset.dataset_id);

  for (const row of rows) {
    const code = Number(row.constituency_code);
    const geo = geoByCode.get(code);
    if (!geo) throw new Error(`P23A indicators: source constituency ${code} is absent from canonical geography`);
    const sourceName = String(row.constituency_name || '').trim();
    if (!sourceName) throw new Error(`P23A indicators: source constituency ${code} has no name`);
    const seriesCode = `KDA-P23A-VOTERS-${geo.geo_code}`;
    const seriesId = uuid(`series:${seriesCode}`);
    const observationId = uuid(`observation:${seriesCode}:${REFERENCE_DATE}`);
    const wardCount = Number(row.ward_row_count);
    const value = Number(row.value);
    const seriesRow = {
      series_id: seriesId,
      series_code: seriesCode,
      indicator_id: indicator.indicator_id,
      geography_id: geo.geography_id,
      geography_taxonomy: geo.geography_system || 'electoral',
      boundary_version: '2012-01',
      frequency: 'irregular',
      period_type: 'point_in_time',
      unit_id: unit.unit_id,
      price_basis: 'not_applicable',
      base_period: '',
      currency: '',
      seasonal_adjustment: 'none',
      transformation: 'level',
      geographic_method: METHOD,
      comparability_group: GROUP,
      dataset_id: dataset.dataset_id,
      agency_id: agencyId,
      methodology_url: 'data/sprint2/README.md',
      start_period: 'June 2022',
      end_period: 'June 2022',
      latest_observation_id: observationId,
      observation_count: 1,
      last_updated_at: INGESTED_AT,
      next_expected_release: '',
      status: 'active',
      superseded_by_series_id: ''
    };
    const observation = {
      observation_id: observationId,
      series_id: seriesId,
      geography_id: geo.geography_id,
      boundary_version: '2012-01',
      period_start: REFERENCE_DATE,
      period_end: REFERENCE_DATE,
      period_type: 'point_in_time',
      period_label: 'Certified register · June 2022',
      value,
      geographic_method: METHOD,
      statistical_status: 'final',
      source_class: 'official',
      badge: BADGE,
      source_release_id: release.release_id,
      source_dataset_id: dataset.dataset_id,
      source_table: 'First Schedule — Registered Voters per County Assembly Ward',
      source_sheet: '',
      source_page: '',
      source_row_label: `${sourceName} Constituency · exact sum of ${wardCount} official CAW rows`,
      source_url: GAZETTE_URL,
      published_at: PUBLISHED_AT,
      ingested_at: INGESTED_AT,
      vintage_id: uuid(`vintage:${seriesCode}:${REFERENCE_DATE}`),
      supersedes_observation_id: '',
      lower_bound: null,
      upper_bound: null,
      confidence_level: null,
      standard_error: null,
      sample_size: null,
      suppression_reason: '',
      crosswalk_id: '',
      notes: 'B — Official derived. Exact sum of the official IEBC First Schedule child-ward rows for this constituency; no county value is inherited. Mandera East/Lafey source ward rows remain included in constituency totals even where ward geometry is held.'
    };
    nextSeries.push(seriesRow);
    nextObservations.push(observation);
  }

  await writeFile(path.join(root, `${dir}/series.json`), JSON.stringify(nextSeries, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/observations.json`), JSON.stringify(nextObservations, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/series.csv`), csv(nextSeries, unionFields(nextSeries)));
  await writeFile(path.join(root, `${dir}/observations.csv`), csv(nextObservations, unionFields(nextObservations)));
  console.log(`P23A indicators promoted ${EXPECTED_ROWS} constituency voter series/observations; total ${NATIONAL_TOTAL.toLocaleString('en-KE')}.`);
}

if (mode === 'catalogue') await buildCatalogue();
else await buildIndicators();
