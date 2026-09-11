import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['catalogue', 'indicators'].includes(mode)) {
  console.error('Usage: node scripts/p25/build-mobile-money-volume.mjs <catalogue|indicators>');
  process.exit(2);
}

const SOURCE_FILE = 'data/p25/source/mobile-money-cico-cbk-2026.json';
const DATASET_CODE = 'DS-CBK-MOBILE-MONEY-CICO-2026-P25';
const RELEASE_CODE = 'REL-CBK-MOBILE-MONEY-CICO-2026-P25';
const INDICATOR_CODE = 'IND-MOBILE-MONEY-VOLUME';
const PREFIX = 'KDA-P25-MOBILE-MONEY-VOLUME-';
const INGESTED_AT = '2026-09-09T00:00:00.000Z';

const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"', '""')}"`;
const csv = rows => {
  const fields = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return [fields.join(','), ...rows.map(r => fields.map(f => csvCell(r[f])).join(','))].join('\n') + '\n';
};
const uuid = name => {
  const h = createHash('sha1').update(`kenya-data-atlas:p25-mobile-money-volume:${name}`).digest();
  h[6] = (h[6] & 15) | 80;
  h[8] = (h[8] & 63) | 128;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

function validate(source) {
  const months = source.months || [];
  if (months.length < 1) throw new Error('P25 mobile money: source must contain at least one monthly observation');
  for (const m of months) {
    if (!m.period_start || !m.period_end || !m.period_label) throw new Error(`P25 mobile money: incomplete period metadata for ${m.period_label || m.period_start}`);
    if (!Number.isFinite(Number(m.value_kes_million)) || Number(m.value_kes_million) <= 0) throw new Error(`P25 mobile money: invalid value_kes_million for ${m.period_label}`);
    if (Math.round(Number(m.value_ksh_billion) * 1000) !== Number(m.value_kes_million)) throw new Error(`P25 mobile money: value_kes_million does not match value_ksh_billion*1000 for ${m.period_label}`);
  }
  if (!source.source_url || !source.publisher || !source.unit) throw new Error('P25 mobile money: source metadata incomplete');
  return { months };
}

async function buildCatalogue() {
  const dir = 'data/catalogue/registry';
  const [datasets, releases, sources, source] = await Promise.all([
    readJson(`${dir}/datasets.json`),
    readJson(`${dir}/releases.json`),
    readJson(`${dir}/sources.json`),
    readJson(SOURCE_FILE)
  ]);
  const { months } = validate(source);
  const src = sources.find(s => s.source_code === 'CBK-STATISTICS');
  if (!src) throw new Error('P25 mobile money: CBK-STATISTICS source missing');
  const latest = months[months.length - 1];

  const datasetFields = {
    source_id: src.source_id,
    title: 'CBK National Payments System — Mobile money agent cash-in/cash-out (CICO), national monthly',
    description: 'National monthly value of mobile money agent cash-in/cash-out (CICO) transactions, published directly by the Central Bank of Kenya on its Mobile Payments statistics table.',
    topic: 'Financial inclusion / payments',
    geographic_coverage: ['country'],
    frequency: 'monthly',
    publication_status: 'published',
    methodology_url: source.source_url,
    known_limitations: 'This series is CBK\'s published agent cash-in/cash-out (CICO) transaction value only. It is CBK\'s own headline national mobile-money activity metric, but it is not a reconciled economy-wide total across every mobile-money rail (person-to-person transfers, paybill, till/merchant payments not routed through agent CICO are excluded). The Atlas does not relabel it as "total mobile money transactions" and does not combine it with unrelated CBK payment-system tables to manufacture a broader total. The source is a live, continuously-updated statistics table rather than a static report; figures are captured and dated at ingestion time.'
  };
  let dataset = datasets.find(d => d.dataset_code === DATASET_CODE);
  if (!dataset) { dataset = { dataset_id: uuid(`dataset:${DATASET_CODE}`), dataset_code: DATASET_CODE, ...datasetFields }; datasets.push(dataset); }
  else Object.assign(dataset, datasetFields);

  const releaseFields = {
    release_code: RELEASE_CODE,
    dataset_id: dataset.dataset_id,
    title: `CBK Mobile Payments statistics — through ${latest.period_label}`,
    reference_period_start: months[0].period_start,
    reference_period_end: latest.period_end,
    published_at: latest.published_at || latest.period_end,
    discovered_at: INGESTED_AT,
    ingested_at: INGESTED_AT,
    release_url: source.source_url,
    release_status: 'published',
    version_label: 'P25 national Pulse closure',
    release_notes: `${source.publication}; ${source.source_table}. The Atlas promotes only the published Total Agent Cash in Cash Out (Value KSh billions) column, converted to KES millions, and does not present it as covering every mobile-money transaction type.`,
    supersedes_release_id: ''
  };
  let release = releases.find(r => r.release_code === RELEASE_CODE);
  if (!release) { release = { release_id: uuid(`release:${RELEASE_CODE}`), ...releaseFields }; releases.push(release); }
  else Object.assign(release, releaseFields);

  await Promise.all([
    writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(datasets, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/datasets.csv`), csv(datasets)),
    writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(releases, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/releases.csv`), csv(releases))
  ]);
  console.log(`P25_MOBILE_MONEY_CATALOGUE_OK dataset=1 release=1 months=${months.length} latest=${latest.period_label}`);
}

async function buildIndicators() {
  const dir = 'data/indicators/registry';
  let [source, units, indicators, series, observations, geographies, datasets, releases, sources] = await Promise.all([
    readJson(SOURCE_FILE),
    readJson(`${dir}/units.json`),
    readJson(`${dir}/indicators.json`),
    readJson(`${dir}/series.json`),
    readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'),
    readJson('data/catalogue/registry/datasets.json'),
    readJson('data/catalogue/registry/releases.json'),
    readJson('data/catalogue/registry/sources.json')
  ]);
  const { months } = validate(source);
  const country = geographies.find(g => g.level === 'country' && g.geo_code === 'KEN');
  if (!country) throw new Error('P25 mobile money: KEN country geography missing');

  const indicator = indicators.find(i => i.indicator_code === INDICATOR_CODE);
  const unit = units.find(u => u.code === source.unit);
  const dataset = datasets.find(d => d.dataset_code === DATASET_CODE);
  const release = releases.find(r => r.release_code === RELEASE_CODE);
  const catSource = dataset ? sources.find(s => s.source_id === dataset.source_id) : null;
  if (!indicator || !unit || !dataset || !release || !catSource) throw new Error('P25 mobile money: required indicator/unit/catalogue records missing; run catalogue mode first');

  const oldIds = new Set(series.filter(s => String(s.series_code || '').startsWith(PREFIX)).map(s => s.series_id));
  series = series.filter(s => !oldIds.has(s.series_id));
  observations = observations.filter(o => !oldIds.has(o.series_id));

  Object.assign(indicator, {
    description: 'National monthly value of mobile money agent cash-in/cash-out (CICO) transactions, published directly by the Central Bank of Kenya on its Mobile Payments statistics table. This is CBK\'s own headline national mobile-money activity series; it does not cover every mobile-money transaction type (see expected_availability_note).',
    unit_id: unit.unit_id,
    methodology_url: source.source_url,
    minimum_geo_level: 'country',
    active: true,
    lifecycle_status: 'active',
    comparable: true,
    ranking_allowed: false,
    requires_sampling_uncertainty: false,
    higher_is_better: true,
    expected_source: 'Central Bank of Kenya — National Payments System, Mobile Payments statistics',
    expected_source_url: source.source_url,
    expected_availability_note: 'Country-only Pulse slot. Value is CBK\'s published agent cash-in/cash-out (CICO) transaction value, its headline national mobile-money metric, not a reconciled total across every mobile-money rail (P2P transfers, paybill and till/merchant payments outside agent CICO are excluded). No county breakdown is published by CBK for this series, so it remains a national_pulse slot rather than a profile indicator.'
  });

  const rows = [];
  for (const m of months) {
    const code = `${PREFIX}${m.period_label.replace(/\s+/g, '-')}`;
    const sid = uuid(`series:${INDICATOR_CODE}:${country.geo_code}`);
    const oid = uuid(`observation:${code}`);
    rows.push({ m, sid, oid, code });
  }
  const latestRow = rows[rows.length - 1];

  const seriesRecord = {
    series_id: latestRow.sid,
    series_code: `KDA-P25-MOBILE-MONEY-VOLUME-KEN`,
    indicator_id: indicator.indicator_id,
    geography_id: country.geography_id,
    geography_taxonomy: country.geography_system || 'electoral',
    boundary_version: '',
    frequency: 'monthly',
    period_type: 'month',
    unit_id: unit.unit_id,
    price_basis: 'nominal',
    base_period: '',
    currency: 'KES',
    seasonal_adjustment: 'none',
    transformation: 'level',
    geographic_method: 'direct',
    comparability_group: 'P25-CBK-MOBILE-MONEY-CICO-NATIONAL',
    dataset_id: dataset.dataset_id,
    agency_id: catSource.agency_id,
    methodology_url: source.source_url,
    start_period: months[0].period_label,
    end_period: latestRow.m.period_label,
    latest_observation_id: latestRow.oid,
    observation_count: rows.length,
    last_updated_at: INGESTED_AT,
    next_expected_release: '',
    status: 'active',
    superseded_by_series_id: ''
  };
  series.push(seriesRecord);

  for (const { m, sid, oid } of rows) {
    observations.push({
      observation_id: oid,
      series_id: sid,
      geography_id: country.geography_id,
      boundary_version: '',
      period_start: m.period_start,
      period_end: m.period_end,
      period_type: 'month',
      period_label: m.period_label,
      value: Number(m.value_kes_million),
      geographic_method: 'direct',
      statistical_status: 'final',
      source_class: 'official',
      badge: 'A',
      source_release_id: release.release_id,
      source_dataset_id: dataset.dataset_id,
      source_table: source.source_table,
      source_sheet: '',
      source_page: '',
      source_row_label: m.period_label,
      source_url: source.source_url,
      published_at: m.published_at || m.period_end,
      ingested_at: INGESTED_AT,
      vintage_id: uuid(`vintage:${sid}:${m.period_start}:1`),
      supersedes_observation_id: '',
      lower_bound: null,
      upper_bound: null,
      confidence_level: null,
      standard_error: null,
      sample_size: null,
      suppression_reason: '',
      crosswalk_id: '',
      notes: `Value of mobile money agent cash-in/cash-out (CICO) transactions, published directly by CBK for ${m.period_label} (Ksh ${m.value_ksh_billion} billion, converted verbatim to KES millions). Context only, not part of the canonical value: CBK also published ${m.cico_volume_million_transactions} million CICO transactions, ${m.active_agents.toLocaleString('en-US')} active agents and ${m.registered_accounts_million} million registered mobile-money accounts for the same month. This is agent CICO activity only, not a reconciled total across every mobile-money transaction type.`
    });
  }

  await Promise.all([
    writeFile(path.join(root, `${dir}/indicators.json`), JSON.stringify(indicators, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/indicators.csv`), csv(indicators)),
    writeFile(path.join(root, `${dir}/series.json`), JSON.stringify(series, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/series.csv`), csv(series)),
    writeFile(path.join(root, `${dir}/observations.json`), JSON.stringify(observations, null, 2) + '\n'),
    writeFile(path.join(root, `${dir}/observations.csv`), csv(observations))
  ]);
  console.log(`P25_MOBILE_MONEY_INDICATORS_OK country=KEN months=${rows.length} latest=${latestRow.m.period_label} value_kes_million=${latestRow.m.value_kes_million}`);
}

if (mode === 'catalogue') await buildCatalogue();
else await buildIndicators();
