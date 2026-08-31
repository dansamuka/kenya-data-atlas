import { readFile } from 'node:fs/promises';

const DATASET_CODE = 'DS-IEBC-VOTERS-CONSTITUENCY-2022-P23A';
const RELEASE_CODE = 'REL-IEBC-VOTERS-CONSTITUENCY-2022-P23A';
const INDICATOR_CODE = 'IND-REGISTERED-VOTERS';
const SOURCE_FILE = 'data/p23/source/constituency-voters-2022.csv';
const EXPECTED = 290;
const NATIONAL_TOTAL = 22102532;
const fail = message => { throw new Error(`P23A constituency voters validation failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
function parseCsv(raw) {
  const lines = String(raw).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = (lines.shift() || '').split(',').map(x => x.trim());
  return lines.filter(Boolean).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']));
  });
}

const [sourceRaw, geographies, indicators, datasets, releases, series, observations, summary, execution, adapter] = await Promise.all([
  readFile(SOURCE_FILE, 'utf8'),
  readJson('data/geography/registry/geographies.json'),
  readJson('data/indicators/registry/indicators.json'),
  readJson('data/catalogue/registry/datasets.json'),
  readJson('data/catalogue/registry/releases.json'),
  readJson('data/indicators/registry/series.json'),
  readJson('data/indicators/registry/observations.json'),
  readJson('data/completeness/summary.json'),
  readJson('data/data-completion-execution.json'),
  readFile('assets/sprint2-voters.js', 'utf8')
]);

const sourceRows = parseCsv(sourceRaw);
assert(sourceRows.length === EXPECTED, `source snapshot has ${sourceRows.length} rows, expected ${EXPECTED}`);
assert(new Set(sourceRows.map(r => Number(r.constituency_code))).size === EXPECTED, 'source constituency codes are not unique');
assert(sourceRows.reduce((sum, r) => sum + Number(r.value), 0) === NATIONAL_TOTAL, 'source constituency totals do not reconcile to 22,102,532');

const indicator = indicators.find(i => i.indicator_code === INDICATOR_CODE);
assert(indicator, `${INDICATOR_CODE} is missing`);
const dataset = datasets.find(d => d.dataset_code === DATASET_CODE);
const release = releases.find(r => r.release_code === RELEASE_CODE);
assert(dataset?.publication_status === 'published', 'P23A dataset is not published');
assert(release?.dataset_id === dataset.dataset_id, 'P23A release does not point to P23A dataset');

const constituencies = geographies.filter(g => g.level === 'constituency');
const geoById = new Map(geographies.map(g => [g.geography_id, g]));
const geoByCode = new Map(constituencies.map(g => [Number(g.constituency_code), g]));
assert(constituencies.length === EXPECTED && geoByCode.size === EXPECTED, 'canonical constituency geography is not exactly 290 unique codes');

const p23Series = series.filter(s => s.dataset_id === dataset.dataset_id);
assert(p23Series.length === EXPECTED, `P23A dataset has ${p23Series.length} series, expected ${EXPECTED}`);
assert(p23Series.every(s => s.indicator_id === indicator.indicator_id), 'P23A dataset contains another indicator');
assert(p23Series.every(s => geoById.get(s.geography_id)?.level === 'constituency'), 'P23A dataset contains a non-constituency series');
assert(p23Series.every(s => s.geographic_method === 'aggregated'), 'all P23A constituency voter series must be aggregated');
assert(p23Series.every(s => s.status === 'active'), 'all P23A constituency voter series must be active');
assert(new Set(p23Series.map(s => s.geography_id)).size === EXPECTED, 'P23A constituency series do not cover 290 unique geographies');

const p23SeriesIds = new Set(p23Series.map(s => s.series_id));
const p23Obs = observations.filter(o => p23SeriesIds.has(o.series_id));
assert(p23Obs.length === EXPECTED, `P23A dataset has ${p23Obs.length} observations, expected ${EXPECTED}`);
assert(p23Obs.every(o => o.badge === 'B'), 'all P23A constituency observations must remain B — Official derived');
assert(p23Obs.every(o => o.geographic_method === 'aggregated'), 'all P23A constituency observations must remain aggregated');
assert(p23Obs.every(o => o.source_class === 'official'), 'all P23A observations must retain official source class');
assert(p23Obs.every(o => o.source_release_id === release.release_id && o.source_dataset_id === dataset.dataset_id), 'P23A observation provenance does not reconcile to the canonical dataset/release');
assert(p23Obs.every(o => o.period_start === '2022-06-20' && o.period_end === '2022-06-20'), 'P23A reference date must remain 20 June 2022');
assert(p23Obs.every(o => String(o.source_table || '').includes('First Schedule')), 'P23A observations must retain First Schedule ward-row provenance');
assert(p23Obs.every(o => /no county value is inherited/i.test(String(o.notes || ''))), 'P23A observations must explicitly state anti-inheritance treatment');
assert(p23Obs.reduce((sum, o) => sum + Number(o.value), 0) === NATIONAL_TOTAL, 'canonical constituency observations do not reconcile to 22,102,532');

const obsBySeries = new Map(p23Obs.map(o => [o.series_id, o]));
for (const row of sourceRows) {
  const geo = geoByCode.get(Number(row.constituency_code));
  assert(geo, `source constituency ${row.constituency_code} is not canonical`);
  const matches = p23Series.filter(s => s.geography_id === geo.geography_id);
  assert(matches.length === 1, `${geo.name}: expected exactly one P23A series, found ${matches.length}`);
  const obs = obsBySeries.get(matches[0].series_id);
  assert(Number(obs?.value) === Number(row.value), `${geo.name}: canonical value ${obs?.value} != source snapshot ${row.value}`);
}

const allActiveConstituencyVoterSeries = series.filter(s => s.status === 'active' && s.indicator_id === indicator.indicator_id && geoById.get(s.geography_id)?.level === 'constituency');
assert(allActiveConstituencyVoterSeries.length === EXPECTED, `expected exactly ${EXPECTED} active canonical constituency voter series overall, found ${allActiveConstituencyVoterSeries.length}`);

assert(summary.total_slots === 20115, `governed denominator changed to ${summary.total_slots}`);
assert(summary.unknown_missing === 0, `unknown_missing changed to ${summary.unknown_missing}`);
assert(summary.by_completion_phase?.P21 === 329, `P21 queue changed unexpectedly to ${summary.by_completion_phase?.P21}`);
assert(summary.by_completion_phase?.P23 === 2900, `P23 unresolved should fall from 3,190 to 2,900, found ${summary.by_completion_phase?.P23}`);
assert(summary.resolved_slots === 3769, `resolved slots should be 3,769, found ${summary.resolved_slots}`);
assert(summary.unresolved_slots === 16346, `unresolved slots should be 16,346, found ${summary.unresolved_slots}`);
assert(execution.governed_denominator === summary.total_slots, 'execution overlay denominator no longer matches live completeness');

assert(adapter.includes('ward-only supplement after P23A constituency canonicalisation'), 'Sprint 2 voter adapter has not been narrowed to ward-only supplementation');
assert(!adapter.includes('state.valuesByGeographyId.set(constituency.geography_id'), 'Sprint 2 adapter still injects constituency voter values at runtime');
assert(adapter.includes('mappedCount===1440') || adapter.includes('mappedCount === 1440'), 'Sprint 2 adapter no longer protects 1,440 mapped ward values');
assert(adapter.includes('state.holds.length===10') || adapter.includes('state.holds.length === 10'), 'Sprint 2 adapter no longer protects the 10 ward holds');

console.log(JSON.stringify({
  ok: true,
  dataset_code: DATASET_CODE,
  constituency_series: p23Series.length,
  constituency_observations: p23Obs.length,
  national_total: p23Obs.reduce((sum, o) => sum + Number(o.value), 0),
  governed_denominator: summary.total_slots,
  resolved_slots: summary.resolved_slots,
  p23_remaining: summary.by_completion_phase.P23,
  ward_runtime_supplement: '1,440 mapped + 10 held; constituency injection removed'
}, null, 2));
