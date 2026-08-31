import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/p20/build-audit-opinion.mjs <catalogue|indicators>');
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
  const hash = createHash('sha1').update(`kenya-data-atlas:p20-audit:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

const AGENCY_CODE = 'OAG';
const SOURCE_CODE = 'OAG-COUNTY-AUDIT';
const DATASET_CODE = 'DS-OAG-COUNTY-EXECUTIVE-AUDIT-2023-24-P20';
const RELEASE_CODE = 'REL-OAG-COUNTY-EXECUTIVE-AUDIT-2023-24-P20';
const SERIES_PREFIX = 'KDA-P20-AUDIT-OPINION-';
const EXPECTED_CODES = Array.from({length: 47}, (_, i) => `KEN-C${String(i + 1).padStart(3, '0')}`);

function validateSnapshot(snapshot) {
  const audit = snapshot.audit_context_2023_24 || {};
  const qualified = new Set(audit.qualified_geo_codes || []);
  if (audit.all_county_executives_qualified !== true) throw new Error('P20 audit: source snapshot must explicitly confirm all County Executives were Qualified');
  if (qualified.size !== 47 || EXPECTED_CODES.some(code => !qualified.has(code))) throw new Error('P20 audit: qualified county mapping must reconcile exactly 47/47 canonical county codes');
  if (!snapshot.sources?.oag_summary?.source_url) throw new Error('P20 audit: OAG source URL missing');
  return { audit, qualified, source: snapshot.sources.oag_summary };
}

async function buildCatalogue() {
  const dir = 'data/catalogue/registry';
  let [agencies, sources, datasets, releases, snapshot] = await Promise.all([
    readJson(`${dir}/agencies.json`), readJson(`${dir}/sources.json`), readJson(`${dir}/datasets.json`), readJson(`${dir}/releases.json`),
    readJson('data/countyiq/source/p10-fiscal-accountability-2024-25.json')
  ]);
  const { source: oag } = validateSnapshot(snapshot);

  let agency = agencies.find(row => row.agency_code === AGENCY_CODE);
  if (!agency) {
    agency = {
      agency_id: uuid(`agency:${AGENCY_CODE}`), agency_code: AGENCY_CODE,
      name: 'Office of the Auditor-General', abbreviation: 'OAG', agency_type: 'constitutional_office',
      official_url: 'https://www.oagkenya.go.ke/', jurisdiction: 'Kenya',
      description: 'Kenya’s supreme public-sector audit institution and publisher of county-government audit opinions.', active: true
    };
    agencies.push(agency);
  }

  let source = sources.find(row => row.source_code === SOURCE_CODE);
  if (!source) {
    source = {
      source_id: uuid(`source:${SOURCE_CODE}`), source_code: SOURCE_CODE, agency_id: agency.agency_id,
      name: 'County government audit summary reports', source_type: 'report_series', landing_page_url: 'https://www.oagkenya.go.ke/',
      expected_cadence: 'annual', source_priority: 'critical', access_method: 'pdf_download', reuse_status: 'public_official_report',
      licence_name: null, licence_url: null, attribution_text: 'Source: Office of the Auditor-General, Kenya',
      assessment_status: 'approved_with_conditions', assessment_note: 'Categorical audit opinions may be published only where the official appendix supplies an exact county mapping.', active: true
    };
    sources.push(source);
  }

  let dataset = datasets.find(row => row.dataset_code === DATASET_CODE);
  if (!dataset) {
    dataset = {
      dataset_id: uuid(`dataset:${DATASET_CODE}`), dataset_code: DATASET_CODE, source_id: source.source_id,
      title: 'County Executive audit opinions, FY2023/24',
      description: 'Categorical audit opinion for each of Kenya’s 47 County Executives from Appendix 1(a) of the Auditor-General summary report for FY2023/24.',
      topic: 'Public Finance', geographic_coverage: ['county'], frequency: 'annual', publication_status: 'published',
      methodology_url: oag.source_url,
      known_limitations: 'The observation is the categorical audit opinion only. It is not converted to a numeric performance score or ranking.'
    };
    datasets.push(dataset);
  }

  if (!releases.some(row => row.release_code === RELEASE_CODE)) {
    releases.push({
      release_id: uuid(`release:${RELEASE_CODE}`), release_code: RELEASE_CODE, dataset_id: dataset.dataset_id,
      title: 'County Executive audit opinions — FY2023/24', reference_period_start: '2023-07-01', reference_period_end: '2024-06-30',
      published_at: '2025-04-01', discovered_at: INGESTED_AT, ingested_at: INGESTED_AT, release_url: oag.source_url,
      release_status: 'published', version_label: 'P20 governed county-source promotion',
      release_notes: `${oag.audit_table || 'Appendix 1(a)'}; all 47 County Executives are explicitly listed as Qualified on report pages 69–70.`,
      supersedes_release_id: ''
    });
  }

  await Promise.all([
    writeFile(path.join(root, `${dir}/agencies.json`), JSON.stringify(agencies, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/agencies.csv`), csv(agencies)),
    writeFile(path.join(root, `${dir}/sources.json`), JSON.stringify(sources, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/sources.csv`), csv(sources)),
    writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(datasets, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/datasets.csv`), csv(datasets)),
    writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(releases, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/releases.csv`), csv(releases))
  ]);
  console.log('P20_AUDIT_CATALOGUE_OK agency=1 source=1 dataset=1 release=1');
}

async function buildIndicators() {
  const dir = 'data/indicators/registry';
  let [units, indicators, series, observations, geographies, datasets, releases, sources, snapshot] = await Promise.all([
    readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`), readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'),
    readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json'),
    readJson('data/countyiq/source/p10-fiscal-accountability-2024-25.json')
  ]);
  const { qualified, source: oag } = validateSnapshot(snapshot);
  const counties = geographies.filter(geo => geo.level === 'county').sort((a,b) => String(a.geo_code).localeCompare(String(b.geo_code)));
  if (counties.length !== 47 || counties.some(county => !qualified.has(county.geo_code))) throw new Error('P20 audit: canonical county registry does not reconcile with the verified 47-county OAG appendix');

  const indicator = indicators.find(row => row.indicator_code === 'IND-COUNTY-AUDIT-OPINION');
  const unit = units.find(row => row.code === 'category');
  const dataset = datasets.find(row => row.dataset_code === DATASET_CODE);
  const release = releases.find(row => row.release_code === RELEASE_CODE);
  const source = dataset ? sources.find(row => row.source_id === dataset.source_id) : null;
  if (!indicator || !unit || !dataset || !release || !source) throw new Error('P20 audit: required indicator/unit/catalogue records are missing; run catalogue mode first');

  const oldIds = new Set(series.filter(row => String(row.series_code).startsWith(SERIES_PREFIX)).map(row => row.series_id));
  series = series.filter(row => !oldIds.has(row.series_id));
  observations = observations.filter(row => !oldIds.has(row.series_id));

  for (const county of counties) {
    const code = `${SERIES_PREFIX}${county.geo_code}`;
    const seriesId = uuid(`series:${code}`);
    const observationId = uuid(`observation:${code}:2023-07-01:2024-06-30`);
    series.push({
      series_id: seriesId, series_code: code, indicator_id: indicator.indicator_id, geography_id: county.geography_id,
      geography_taxonomy: county.geography_system || 'electoral', boundary_version: '2012-01', frequency: 'annual', period_type: 'fiscal_year',
      unit_id: unit.unit_id, price_basis: 'not_applicable', base_period: '', currency: '', seasonal_adjustment: 'none', transformation: 'level',
      geographic_method: 'direct', comparability_group: 'P20-COUNTY-EXECUTIVE-AUDIT-OPINION-FY2023-24',
      dataset_id: dataset.dataset_id, agency_id: source.agency_id, methodology_url: oag.source_url,
      start_period: 'FY 2023/24', end_period: 'FY 2023/24', latest_observation_id: observationId, observation_count: 1,
      last_updated_at: INGESTED_AT, next_expected_release: '', status: 'active', superseded_by_series_id: ''
    });
    observations.push({
      observation_id: observationId, series_id: seriesId, geography_id: county.geography_id, boundary_version: '2012-01',
      period_start: '2023-07-01', period_end: '2024-06-30', period_type: 'fiscal_year', period_label: 'FY 2023/24',
      value: null, text_value: 'Qualified', geographic_method: 'direct', statistical_status: 'final', source_class: 'official', badge: 'A',
      source_release_id: release.release_id, source_dataset_id: dataset.dataset_id, source_table: oag.audit_table || 'Appendix 1(a)',
      source_sheet: '', source_page: '69-70', source_row_label: `${county.name} County`, source_url: oag.source_url,
      published_at: '2025-04-01', ingested_at: INGESTED_AT, vintage_id: uuid(`vintage:${code}:2023-07-01:1`), supersedes_observation_id: '',
      lower_bound: null, upper_bound: null, confidence_level: null, standard_error: null, sample_size: null,
      suppression_reason: '', crosswalk_id: '',
      notes: 'Categorical County Executive audit opinion copied directly from OAG Appendix 1(a), pp. 69–70. No numeric score, ordinal conversion or ranking is applied.'
    });
  }

  Object.assign(indicator, {
    name: 'County Executive audit opinion', short_name: 'Audit opinion',
    description: 'Auditor-General categorical opinion on the County Executive financial statements for FY2023/24.',
    unit_id: unit.unit_id, lifecycle_status: 'active', active: true, comparable: true, ranking_allowed: false,
    methodology_url: oag.source_url, expected_source: 'Office of the Auditor-General — Summary Report on County Governments 2023/2024',
    expected_source_url: oag.source_url,
    expected_availability_note: 'Appendix 1(a) lists all 47 County Executives as Qualified for FY2023/24. The Atlas stores the category as text and does not convert it to a numeric score.'
  });

  await Promise.all([
    writeFile(path.join(root, `${dir}/indicators.json`), JSON.stringify(indicators, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/indicators.csv`), csv(indicators)),
    writeFile(path.join(root, `${dir}/series.json`), JSON.stringify(series, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/series.csv`), csv(series)),
    writeFile(path.join(root, `${dir}/observations.json`), JSON.stringify(observations, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/observations.csv`), csv(observations))
  ]);
  console.log('P20_AUDIT_INDICATORS_OK qualified=47 categorical=47 numeric_scores=0');
}

if (mode === 'catalogue') await buildCatalogue();
else await buildIndicators();
