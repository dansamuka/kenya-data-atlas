#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDir = path.join(root, 'data/distribution');
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const rel = p => p.split(path.sep).join('/');
const writeText = (p, text) => {
  const full = path.join(root, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
};
const writeJson = (p, value) => writeText(p, JSON.stringify(value, null, 2) + '\n');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const fileMeta = p => ({ path: rel(p), bytes: fs.statSync(path.join(root, p)).size, sha256: sha256(p) });
const ndjson = rows => rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
const csvCell = value => {
  const rendered = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${rendered.replaceAll('"', '""')}"`;
};
const csv = (rows, fields) => [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';
const safeFile = value => String(value).replace(/[^A-Za-z0-9._-]/g, '_');

const pkg = readJson('package.json');
const units = readJson('data/indicators/registry/units.json');
const indicators = readJson('data/indicators/registry/indicators.json');
const series = readJson('data/indicators/registry/series.json');
const observations = readJson('data/indicators/registry/observations.json');
const geographies = readJson('data/geography/registry/geographies.json');
const agencies = readJson('data/catalogue/registry/agencies.json');
const sources = readJson('data/catalogue/registry/sources.json');
const datasets = readJson('data/catalogue/registry/datasets.json');
const releases = readJson('data/catalogue/registry/releases.json');
const policy = readJson('data/policy/indicator-policy.json');
const evidence = readJson('data/evidence/county-documents.json');
const results = readJson('data/results/county-results.json');

const CONTRACT_VERSION = '1.0.0';
const releaseDate = evidence.meta?.verification_date || '2026-08-30';
const generatedAt = results.generated_at || evidence.meta?.generated_at || `${releaseDate}T00:00:00.000Z`;

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const geoById = new Map(geographies.map(row => [row.geography_id, row]));
const geoByCode = new Map(geographies.map(row => [row.geo_code, row]));
const indicatorById = new Map(indicators.map(row => [row.indicator_id, row]));
const unitById = new Map(units.map(row => [row.unit_id, row]));
const datasetById = new Map(datasets.map(row => [row.dataset_id, row]));
const seriesById = new Map(series.map(row => [row.series_id, row]));
const evidenceRows = Array.isArray(evidence.counties) ? evidence.counties.flatMap(county => county.documents || []) : [];
const countyGeographies = geographies.filter(row => row.level === 'county').sort((a, b) => a.geo_code.localeCompare(b.geo_code));
const resultsByCounty = new Map((results.counties || []).map(row => [row.geo_code, row]));

const schemas = {
  'indicator.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/indicator.schema.json',
    title: 'Kenya Data Atlas indicator record', type: 'object', additionalProperties: true,
    required: ['indicator_id', 'indicator_code', 'name', 'topic', 'unit_id', 'active'],
    properties: { indicator_id: { type: 'string' }, indicator_code: { type: 'string', pattern: '^IND-' }, name: { type: 'string' }, topic: { type: 'string' }, unit_id: { type: 'string' }, active: { type: 'boolean' } }
  },
  'series.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/series.schema.json',
    title: 'Kenya Data Atlas series record', type: 'object', additionalProperties: true,
    required: ['series_id', 'series_code', 'indicator_id', 'geography_id', 'unit_id', 'dataset_id', 'status'],
    properties: { series_id: { type: 'string' }, series_code: { type: 'string' }, indicator_id: { type: 'string' }, geography_id: { type: 'string' }, unit_id: { type: 'string' }, dataset_id: { type: 'string' }, status: { type: 'string' } }
  },
  'observation.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/observation.schema.json',
    title: 'Kenya Data Atlas observation record', type: 'object', additionalProperties: true,
    required: ['observation_id', 'series_id', 'geography_id', 'period_start', 'period_end', 'period_label', 'value', 'source_dataset_id', 'source_url'],
    properties: { observation_id: { type: 'string' }, series_id: { type: 'string' }, geography_id: { type: 'string' }, period_start: { type: 'string' }, period_end: { type: 'string' }, period_label: { type: 'string' }, value: { type: ['number', 'null'] }, source_dataset_id: { type: 'string' }, source_url: { type: ['string', 'null'] } }
  },
  'geography.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/geography.schema.json',
    title: 'Kenya Data Atlas geography record', type: 'object', additionalProperties: true,
    required: ['geography_id', 'geo_code', 'name', 'level', 'geography_system'],
    properties: { geography_id: { type: 'string' }, geo_code: { type: 'string' }, name: { type: 'string' }, level: { enum: ['country', 'county', 'constituency', 'ward'] }, geography_system: { type: 'string' } }
  },
  'dataset.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/dataset.schema.json',
    title: 'Kenya Data Atlas dataset record', type: 'object', additionalProperties: true,
    required: ['dataset_id', 'dataset_code', 'source_id', 'title', 'publication_status'],
    properties: { dataset_id: { type: 'string' }, dataset_code: { type: 'string' }, source_id: { type: 'string' }, title: { type: 'string' }, publication_status: { type: 'string' } }
  },
  'county-result.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/county-result.schema.json',
    title: 'Kenya Data Atlas county analytical result', type: 'object', additionalProperties: true,
    required: ['geo_code', 'name', 'metrics', 'fiscal_delivery', 'administration', 'evidence'],
    properties: { geo_code: { type: 'string', pattern: '^KEN-C[0-9]{3}$' }, name: { type: 'string' }, metrics: { type: 'array' }, fiscal_delivery: { type: 'object' }, administration: { type: 'object' }, evidence: { type: 'object' } }
  },
  'evidence-record.schema.json': {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://dansamuka.github.io/kenya-data-atlas/data/distribution/schemas/evidence-record.schema.json',
    title: 'Kenya Data Atlas county evidence record', type: 'object', additionalProperties: true,
    required: ['record_id', 'geo_code', 'county_name', 'family', 'title', 'period', 'publisher', 'verification_state', 'verified_at'],
    properties: { record_id: { type: 'string' }, geo_code: { type: 'string' }, county_name: { type: 'string' }, family: { type: 'string' }, title: { type: 'string' }, period: { type: 'string' }, publisher: { type: 'string' }, verification_state: { type: 'string' }, verified_at: { type: 'string' } }
  }
};
for (const [name, schema] of Object.entries(schemas)) writeJson(`data/distribution/schemas/${name}`, { ...schema, 'x-kda-contract-version': CONTRACT_VERSION });

const ndjsonProducts = [
  ['units', units], ['indicators', indicators], ['series', series], ['observations', observations], ['geographies', geographies],
  ['agencies', agencies], ['sources', sources], ['datasets', datasets], ['releases', releases], ['county-results', results.counties || []], ['evidence-records', evidenceRows]
];
for (const [name, rows] of ndjsonProducts) writeText(`data/distribution/ndjson/${name}.ndjson`, ndjson(rows));

const countySummaryRows = (results.counties || []).map(row => ({
  geo_code: row.geo_code,
  county: row.name,
  development_score: row.development_snapshot?.score ?? null,
  development_band: row.development_snapshot?.relative_position_label ?? null,
  development_diagnostic_rank: row.development_snapshot?.diagnostic_rank ?? null,
  fiscal_delivery_score: row.fiscal_delivery?.score ?? null,
  fiscal_delivery_rank: row.fiscal_delivery?.rank ?? null,
  overall_absorption_change_pp: row.administration?.overall_absorption_change_pp ?? null,
  development_absorption_change_pp: row.administration?.development_absorption_change_pp ?? null,
  evidence_count: row.evidence?.count ?? 0
}));
writeText('data/distribution/csv/county-results.csv', csv(countySummaryRows, ['geo_code','county','development_score','development_band','development_diagnostic_rank','fiscal_delivery_score','fiscal_delivery_rank','overall_absorption_change_pp','development_absorption_change_pp','evidence_count']));
writeText('data/distribution/csv/evidence-records.csv', csv(evidenceRows, ['record_id','geo_code','county_name','family','title','period','publisher','scope','document_url','source_page_url','verification_state','link_status','verified_at','verification_method','reason','notes']));

const enrichSeries = row => {
  const geo = geoById.get(row.geography_id);
  const ind = indicatorById.get(row.indicator_id);
  const unit = unitById.get(row.unit_id);
  const dataset = datasetById.get(row.dataset_id);
  return { ...row, geo_code: geo?.geo_code ?? null, geography_name: geo?.name ?? null, geography_level: geo?.level ?? null, indicator_code: ind?.indicator_code ?? null, unit_code: unit?.code ?? null, dataset_code: dataset?.dataset_code ?? null };
};
const enrichObservation = row => {
  const s = seriesById.get(row.series_id);
  const geo = geoById.get(row.geography_id);
  const ind = s ? indicatorById.get(s.indicator_id) : null;
  const unit = s ? unitById.get(s.unit_id) : null;
  const dataset = s ? datasetById.get(s.dataset_id) : null;
  return { ...row, series_code: s?.series_code ?? null, indicator_code: ind?.indicator_code ?? null, geo_code: geo?.geo_code ?? null, unit_code: unit?.code ?? null, dataset_code: dataset?.dataset_code ?? null };
};

const countyIndex = [];
for (const geo of countyGeographies) {
  const ownSeries = series.filter(row => row.geography_id === geo.geography_id).sort((a,b) => a.series_code.localeCompare(b.series_code));
  const ownSeriesIds = new Set(ownSeries.map(row => row.series_id));
  const ownObs = observations.filter(row => ownSeriesIds.has(row.series_id)).sort((a,b) => a.period_start.localeCompare(b.period_start) || a.observation_id.localeCompare(b.observation_id));
  const ownEvidence = evidenceRows.filter(row => row.geo_code === geo.geo_code).sort((a,b) => a.family.localeCompare(b.family) || a.record_id.localeCompare(b.record_id));
  const payload = {
    schema_version: 'kda.county-subset.v1', data_contract_version: CONTRACT_VERSION, application_version: pkg.version,
    geography: geo, county_result: resultsByCounty.get(geo.geo_code) || null,
    series: ownSeries.map(enrichSeries), observations: ownObs.map(enrichObservation), evidence: ownEvidence
  };
  const p = `data/distribution/subsets/counties/${safeFile(geo.geo_code)}.json`;
  writeJson(p, payload);
  countyIndex.push({ geo_code: geo.geo_code, name: geo.name, path: p, series_count: ownSeries.length, observation_count: ownObs.length, evidence_count: ownEvidence.length });
}
writeJson('data/distribution/subsets/counties/index.json', countyIndex);

const indicatorIndex = [];
for (const indicator of [...indicators].sort((a,b) => a.indicator_code.localeCompare(b.indicator_code))) {
  const ownSeries = series.filter(row => row.indicator_id === indicator.indicator_id).sort((a,b) => a.series_code.localeCompare(b.series_code));
  const ownSeriesIds = new Set(ownSeries.map(row => row.series_id));
  const ownObs = observations.filter(row => ownSeriesIds.has(row.series_id)).sort((a,b) => a.period_start.localeCompare(b.period_start) || a.observation_id.localeCompare(b.observation_id));
  const payload = {
    schema_version: 'kda.indicator-subset.v1', data_contract_version: CONTRACT_VERSION, application_version: pkg.version,
    indicator, unit: unitById.get(indicator.unit_id) || null, series: ownSeries.map(enrichSeries), observations: ownObs.map(enrichObservation)
  };
  const p = `data/distribution/subsets/indicators/${safeFile(indicator.indicator_code)}.json`;
  writeJson(p, payload);
  indicatorIndex.push({ indicator_code: indicator.indicator_code, name: indicator.name, path: p, series_count: ownSeries.length, observation_count: ownObs.length });
}
writeJson('data/distribution/subsets/indicators/index.json', indicatorIndex);

const productSpecs = [
  { id:'units', description:'Unit definitions', count:units.length, schema:null, json:'data/indicators/registry/units.json', csv:'data/indicators/registry/units.csv', ndjson:'data/distribution/ndjson/units.ndjson' },
  { id:'indicators', description:'Canonical indicator definitions', count:indicators.length, schema:'data/distribution/schemas/indicator.schema.json', json:'data/indicators/registry/indicators.json', csv:'data/indicators/registry/indicators.csv', ndjson:'data/distribution/ndjson/indicators.ndjson' },
  { id:'series', description:'Concrete geography-specific statistical series', count:series.length, schema:'data/distribution/schemas/series.schema.json', json:'data/indicators/registry/series.json', csv:'data/indicators/registry/series.csv', ndjson:'data/distribution/ndjson/series.ndjson' },
  { id:'observations', description:'Published observations with provenance and uncertainty fields', count:observations.length, schema:'data/distribution/schemas/observation.schema.json', json:'data/indicators/registry/observations.json', csv:'data/indicators/registry/observations.csv', ndjson:'data/distribution/ndjson/observations.ndjson' },
  { id:'geographies', description:'Kenya → County → Constituency → Ward registry', count:geographies.length, schema:'data/distribution/schemas/geography.schema.json', json:'data/geography/registry/geographies.json', csv:'data/geography/registry/geographies.csv', ndjson:'data/distribution/ndjson/geographies.ndjson' },
  { id:'agencies', description:'Publishing/source agencies', count:agencies.length, schema:null, json:'data/catalogue/registry/agencies.json', csv:'data/catalogue/registry/agencies.csv', ndjson:'data/distribution/ndjson/agencies.ndjson' },
  { id:'sources', description:'Source registry', count:sources.length, schema:null, json:'data/catalogue/registry/sources.json', csv:'data/catalogue/registry/sources.csv', ndjson:'data/distribution/ndjson/sources.ndjson' },
  { id:'datasets', description:'Dataset catalogue', count:datasets.length, schema:'data/distribution/schemas/dataset.schema.json', json:'data/catalogue/registry/datasets.json', csv:'data/catalogue/registry/datasets.csv', ndjson:'data/distribution/ndjson/datasets.ndjson' },
  { id:'releases', description:'Source release catalogue', count:releases.length, schema:null, json:'data/catalogue/registry/releases.json', csv:'data/catalogue/registry/releases.csv', ndjson:'data/distribution/ndjson/releases.ndjson' },
  { id:'county-results', description:'Published CountyIQ rankings, snapshots, fiscal delivery, scorecards and recognition inputs', count:(results.counties||[]).length, schema:'data/distribution/schemas/county-result.schema.json', json:'data/results/county-results.json', csv:'data/distribution/csv/county-results.csv', ndjson:'data/distribution/ndjson/county-results.ndjson' },
  { id:'county-evidence', description:'Verified county planning, budget and accountability evidence records', count:evidenceRows.length, schema:'data/distribution/schemas/evidence-record.schema.json', json:'data/evidence/county-documents.json', csv:'data/distribution/csv/evidence-records.csv', ndjson:'data/distribution/ndjson/evidence-records.ndjson' },
  { id:'indicator-policy', description:'Canonical methodology/governance policy registry', count:indicators.length, schema:null, json:'data/policy/indicator-policy.json' }
];
const products = productSpecs.map(spec => {
  const formats = {};
  for (const format of ['json','csv','ndjson']) if (spec[format]) formats[format] = fileMeta(spec[format]);
  return { id:spec.id, description:spec.description, record_count:spec.count, schema:spec.schema, formats };
});

const manifest = {
  schema_version: 'kda.distribution-manifest.v1',
  application_version: pkg.version,
  data_contract_version: CONTRACT_VERSION,
  release_date: releaseDate,
  generated_at: generatedAt,
  counts: { units:units.length, indicators:indicators.length, series:series.length, observations:observations.length, geographies:geographies.length, counties:countyGeographies.length, datasets:datasets.length, evidence_records:evidenceRows.length, public_county_results:(results.counties||[]).length },
  methodology_versions: { indicator_policy: policy.meta?.policy_version || policy.policy_version || null, public_results: results.schema_version || null, county_evidence: evidence.meta?.schema_version || null },
  products,
  subsets: {
    counties: { count: countyIndex.length, index: fileMeta('data/distribution/subsets/counties/index.json'), path_pattern: 'data/distribution/subsets/counties/{geo_code}.json' },
    indicators: { count: indicatorIndex.length, index: fileMeta('data/distribution/subsets/indicators/index.json'), path_pattern: 'data/distribution/subsets/indicators/{indicator_code}.json' }
  },
  format_availability: {
    json: { status:'published', note:'Canonical JSON arrays plus query-sized subset JSON.' },
    csv: { status:'published', note:'Canonical registry CSV plus flattened county-results and evidence CSV.' },
    ndjson: { status:'published', note:'Streaming-friendly one-record-per-line distributions.' },
    parquet: { status:'not_committed', note:'Not committed in P15 to avoid adding a heavy binary build dependency to the deterministic static pipeline. Developer documentation includes a reproducible local conversion recipe from the published CSV/NDJSON.' }
  },
  versioning: {
    contract_rule: 'Breaking field/semantic changes increment data_contract_version; data refreshes may increment application/data release version without breaking the contract.',
    pinning: 'For reproducible research, pin a Git commit or release tag rather than consuming main.'
  },
  licensing: {
    code: 'MIT — see LICENSE.',
    data: 'No blanket relicensing of third-party source data. See DATA-NOTICE.md and each dataset/source record.'
  }
};
writeJson('data/distribution/manifest.json', manifest);

const readme = `# Kenya Data Atlas data distribution\n\nThis directory is the stable, machine-readable developer entry point introduced in P15.\n\n- Application/data release: **${pkg.version}**\n- Data contract: **${CONTRACT_VERSION}**\n- Indicators: **${indicators.length}**\n- Series: **${series.length.toLocaleString('en-US')}**\n- Observations: **${observations.length.toLocaleString('en-US')}**\n- Geographies: **${geographies.length.toLocaleString('en-US')}**\n- County subsets: **${countyIndex.length}**\n- Indicator subsets: **${indicatorIndex.length}**\n\nStart with \`manifest.json\`. JSON, CSV and NDJSON are published directly. Parquet is intentionally not committed in this phase; see \`docs/DEVELOPER.md\` for the conversion recipe and version-pinning guidance.\n`;
writeText('data/distribution/README.md', readme);

const checksumPaths = new Set();
for (const product of products) {
  for (const format of Object.values(product.formats)) checksumPaths.add(format.path);
  if (product.schema) checksumPaths.add(product.schema);
}
for (const row of countyIndex) checksumPaths.add(row.path);
for (const row of indicatorIndex) checksumPaths.add(row.path);
for (const p of ['data/distribution/subsets/counties/index.json','data/distribution/subsets/indicators/index.json','data/distribution/manifest.json','data/distribution/README.md']) checksumPaths.add(p);
const checksumLines = [...checksumPaths].sort().map(p => `${sha256(p)}  ${p}`);
writeText('data/distribution/checksums.sha256', checksumLines.join('\n') + '\n');

console.log(`P15_DISTRIBUTION_BUILT version=${pkg.version} contract=${CONTRACT_VERSION} indicators=${indicators.length} series=${series.length} observations=${observations.length} counties=${countyIndex.length} indicator_subsets=${indicatorIndex.length}`);
