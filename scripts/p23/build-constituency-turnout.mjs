import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const P23_DIR = path.join(root, 'data/p23');
const INGESTED_AT = '2026-09-04T07:24:00.000Z';
const PORTAL_URL = 'https://forms.iebc.or.ke';
const readJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const csvCell = v => `"${String(Array.isArray(v) ? v.join('|') : v ?? '').replaceAll('"','""')}"`;
const csv = (rows, fields) => [fields.join(','), ...rows.map(r => fields.map(f => csvCell(r[f])).join(','))].join('\n') + '\n';
const unionFields = rows => [...new Set(rows.flatMap(r => Object.keys(r)))];
const uuid = name => { const h=createHash('sha1').update(`kenya-data-atlas:p23-turnout:${name}`).digest('hex').slice(0,32); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`; };
const assert = (ok,msg) => { if (!ok) throw new Error(`P23 constituency turnout: ${msg}`); };

async function verifiedRows() {
  const names = (await readdir(P23_DIR)).filter(name => /^form34b-.+-source-verification\.json$/.test(name)).sort();
  const rows = [];
  for (const name of names) {
    const evidence = JSON.parse(await readFile(path.join(P23_DIR, name), 'utf8'));
    if (evidence.verification_state !== 'verified' || evidence.promotion_eligible !== true) continue;
    const f = evidence.field_evidence || {};
    for (const field of ['registered_voters','total_valid_votes','rejected_ballots']) {
      assert(f[field]?.verification_state === 'source_verified', `${name}: ${field} is not source_verified`);
      assert(Number.isInteger(f[field]?.verified_value), `${name}: ${field} verified value missing`);
    }
    const registered = f.registered_voters.verified_value;
    const valid = f.total_valid_votes.verified_value;
    const rejected = f.rejected_ballots.verified_value;
    assert(registered > 0, `${name}: registered voters must be positive`);
    assert(valid >= 0 && rejected >= 0 && valid + rejected <= registered, `${name}: invalid turnout arithmetic`);
    const turnout = 100 * (valid + rejected) / registered;
    assert(Math.abs(turnout - Number(evidence.row_reconciliation?.turnout_pct)) < 1e-12, `${name}: turnout derivation changed`);
    rows.push({ name, evidence, turnout });
  }
  assert(rows.length > 0, 'no promotion-eligible source-verified Form 34B rows');
  assert(new Set(rows.map(r => r.evidence.sample.geo_code)).size === rows.length, 'duplicate verified geography');
  assert(new Set(rows.map(r => Number(r.evidence.sample.constituency_code))).size === rows.length, 'duplicate verified constituency code');
  return rows;
}

const mode = process.argv[2];
assert(['catalogue','indicators'].includes(mode), 'usage: build-constituency-turnout.mjs <catalogue|indicators>');
const verified = await verifiedRows();

if (mode === 'catalogue') {
  const dir = 'data/catalogue/registry';
  const [datasets, releases] = await Promise.all([readJson(`${dir}/datasets.json`), readJson(`${dir}/releases.json`)]);
  const base = datasets.find(d => d.dataset_code === 'DS-IEBC-VOTERS-CONSTITUENCY-2022-P23') || datasets.find(d => d.dataset_code === 'DS-IEBC-VOTERS-COUNTY-2022-S1');
  assert(base?.source_id, 'IEBC source dataset missing');
  const code = 'DS-IEBC-FORM34B-TURNOUT-2022-P23';
  let ds = datasets.find(d => d.dataset_code === code);
  if (!ds) {
    ds = {
      dataset_id: uuid(`dataset:${code}`), dataset_code: code, source_id: base.source_id,
      title: '2022 Presidential Election — Constituency Turnout from Form 34B',
      description: 'Source-verified constituency presidential turnout derived only from official IEBC Form 34B final TOTAL rows. Coverage expands only as individual constituency source-image reviews satisfy the P23 extraction contract.',
      topic: 'Elections', geographic_coverage: ['constituency'], frequency: 'electoral_cycle', publication_status: 'published',
      methodology_url: 'data/p23/form34b-extraction-contract.json',
      known_limitations: 'Only independently source-image-verified Form 34B rows are materialized. OCR-only candidates, partial pages, inherited county values and unresolved forms remain excluded.'
    };
    datasets.push(ds);
  }
  const rcode = 'REL-IEBC-FORM34B-TURNOUT-2022-P23';
  if (!releases.some(r => r.release_code === rcode)) {
    releases.push({
      release_id: uuid(`release:${rcode}`), release_code: rcode, dataset_id: ds.dataset_id,
      title: 'IEBC 2022 Presidential Form 34B — source-verified constituency turnout',
      reference_period_start: '2022-08-09', reference_period_end: '2022-08-09', published_at: '',
      discovered_at: INGESTED_AT, ingested_at: INGESTED_AT, release_url: PORTAL_URL, release_status: 'published',
      version_label: 'P23 source-verified Form 34B rollout',
      release_notes: 'Canonical observations are created only for constituencies with a committed source-verification evidence record satisfying data/p23/form34b-extraction-contract.json.',
      supersedes_release_id: ''
    });
  }
  await writeFile(path.join(root, `${dir}/datasets.json`), JSON.stringify(datasets, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/releases.json`), JSON.stringify(releases, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/datasets.csv`), csv(datasets, unionFields(datasets)));
  await writeFile(path.join(root, `${dir}/releases.csv`), csv(releases, unionFields(releases)));
  console.log(`P23_FORM34B_TURNOUT_CATALOGUE verified_rows=${verified.length} values_logged=0`);
} else {
  const dir = 'data/indicators/registry';
  const [units, indicators, series, observations, geos, datasets, releases, sources] = await Promise.all([
    readJson(`${dir}/units.json`), readJson(`${dir}/indicators.json`), readJson(`${dir}/series.json`), readJson(`${dir}/observations.json`),
    readJson('data/geography/registry/geographies.json'), readJson('data/catalogue/registry/datasets.json'), readJson('data/catalogue/registry/releases.json'), readJson('data/catalogue/registry/sources.json')
  ]);
  const ind = indicators.find(i => i.indicator_code === 'IND-TURNOUT-HISTORY');
  assert(ind, 'turnout indicator missing');
  const unit = units.find(u => u.unit_id === ind.unit_id);
  assert(unit, 'turnout unit missing');
  const ds = datasets.find(d => d.dataset_code === 'DS-IEBC-FORM34B-TURNOUT-2022-P23');
  const rel = releases.find(r => r.release_code === 'REL-IEBC-FORM34B-TURNOUT-2022-P23');
  assert(ds && rel, 'P23 turnout catalogue objects missing');
  const agency = sources.find(s => s.source_id === ds.source_id)?.agency_id || '';
  const geoByCode = new Map(geos.filter(g => g.level === 'constituency').map(g => [g.geo_code, g]));
  const seriesByCode = new Map(series.map(s => [s.series_code, s]));
  const obsIds = new Set(observations.map(o => o.observation_id));

  for (const row of verified) {
    const evidence = row.evidence;
    const sample = evidence.sample;
    const code = Number(sample.constituency_code);
    const geo = geoByCode.get(sample.geo_code);
    assert(geo, `${sample.geo_code}: canonical constituency missing`);
    assert(Number(geo.constituency_code) === code, `${sample.geo_code}: constituency code mismatch`);
    const scode = `KDA-TURNOUT-CON-${String(code).padStart(3,'0')}-2022-PRES`;
    let s = seriesByCode.get(scode);
    if (!s) {
      s = {
        series_id: uuid(`series:${scode}`), series_code: scode, indicator_id: ind.indicator_id,
        geography_id: geo.geography_id, geography_taxonomy: geo.geography_system || 'electoral', boundary_version: '2012-01',
        frequency: 'electoral_cycle', period_type: 'point_in_time', unit_id: unit.unit_id, price_basis: 'not_applicable',
        base_period: '', currency: '', seasonal_adjustment: 'none', transformation: 'level', geographic_method: 'direct',
        comparability_group: 'IEBC-PRESIDENTIAL-TURNOUT-2022-FORM34B', dataset_id: ds.dataset_id, agency_id: agency,
        methodology_url: 'data/p23/form34b-extraction-contract.json', start_period: '2022-08-09', end_period: '2022-08-09',
        latest_observation_id: '', observation_count: 1, last_updated_at: INGESTED_AT, next_expected_release: '', status: 'active', superseded_by_series_id: ''
      };
      series.push(s); seriesByCode.set(scode, s);
    }
    const oid = uuid(`observation:${scode}:2022-08-09`);
    if (!obsIds.has(oid)) {
      observations.push({
        observation_id: oid, series_id: s.series_id, geography_id: geo.geography_id, boundary_version: '2012-01',
        period_start: '2022-08-09', period_end: '2022-08-09', period_type: 'point_in_time', period_label: '2022 presidential election',
        value: row.turnout, geographic_method: 'direct', statistical_status: 'final', source_class: 'official', badge: 'A',
        source_release_id: rel.release_id, source_dataset_id: ds.dataset_id, source_table: 'Form 34B — final TOTAL row', source_sheet: '',
        source_page: String(sample.page_number), source_row_label: 'TOTAL', source_url: sample.source_url, published_at: '', ingested_at: INGESTED_AT,
        vintage_id: uuid(`vintage:${scode}:2022-08-09:1`), supersedes_observation_id: '', lower_bound: null, upper_bound: null,
        confidence_level: null, standard_error: null, sample_size: null, suppression_reason: '', crosswalk_id: '',
        notes: `A — Official direct. Turnout derived exactly from source-verified Form 34B integers in data/p23/${row.name}; no parent value, media tally or OCR-only candidate is promoted.`
      });
      obsIds.add(oid);
    }
    s.latest_observation_id = oid;
    s.observation_count = observations.filter(o => o.series_id === s.series_id).length;
  }

  await writeFile(path.join(root, `${dir}/series.json`), JSON.stringify(series, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/observations.json`), JSON.stringify(observations, null, 2) + '\n');
  await writeFile(path.join(root, `${dir}/series.csv`), csv(series, unionFields(series)));
  await writeFile(path.join(root, `${dir}/observations.csv`), csv(observations, unionFields(observations)));
  console.log(`P23_FORM34B_TURNOUT_PROMOTED verified_rows=${verified.length} source_verified=true values_logged=0`);
}
