/* Kenya Data Atlas — Data Sprint 2: Local Kenya.
 * IEBC 2022 registered voters at all 290 constituencies and 1,450 source wards.
 * 1,440 ward rows are safely attached to the current Atlas ward geometry.
 * Ten Mandera East/Lafey rows remain in statistical totals but are withheld
 * from ward geometry because the current external boundary layer conflicts
 * with the operative IEBC ward configuration.
 */
(function () {
  'use strict';

  const upstreamFetch = window.fetch.bind(window); // includes Sprint 1 overlay
  const IEBC_GAZETTE = 'https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
  const CODED_SOURCE = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
  const SPATIAL_HOLD_CONSTITUENCIES = new Set([43, 44]); // Mandera East, Lafey
  const HOLD_REASON = 'Official IEBC ward rows are retained in totals but withheld from current ward polygons until the Mandera East/Lafey boundary source is reconciled.';

  const S2 = {
    version: '2.3',
    ready: null,
    additions: null,
    error: null,
    coverage: { counties: 47, constituencies: 290, ward_source_rows: 1450, mapped_wards: 1440, spatial_holds: 10 },
    nationalTotal: null,
    constituencyTotals: new Map(),
    countyTotals: new Map(),
    constituencyValueByGeoCode: new Map(),
    sourceWardCountByGeoCode: new Map(),
    wardValueByGeoCode: new Map(),
    geoLevelByCode: new Map(),
    parentCodeByGeoCode: new Map(),
    heldConstituencyGeoCodes: new Set(),
    crosswalks: [],
    spatialHolds: []
  };

  function assert(condition, message) { if (!condition) throw new Error(`Sprint 2 validation: ${message}`); }
  function pathEnds(input, suffix) {
    try { return new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith(suffix); }
    catch { return false; }
  }
  async function getText(url) {
    const response = await upstreamFetch(url);
    if (!response.ok) throw new Error(`Sprint 2 load failed: ${url} (${response.status})`);
    return response.text();
  }
  async function getJson(url) {
    const response = await upstreamFetch(url);
    if (!response.ok) throw new Error(`Sprint 2 load failed: ${url} (${response.status})`);
    return response.json();
  }
  function norm(value) {
    return String(value || '').toUpperCase().normalize('NFKD')
      .replace(/[’‘]/g, "'").replace(/\bCITY\b/g, '').replace(/[^A-Z0-9]+/g, '');
  }
  function parseCoded(raw) {
    const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const header = lines.shift();
    assert(header && header.includes('Registered Voters'), 'unexpected coded IEBC transcription header');
    return lines.filter(Boolean).map((line, index) => {
      const c = line.split(',');
      assert(c.length >= 8, `malformed source row ${index + 2}`);
      return {
        county_code: Number(c[1]), county_name: c[2].trim(), constituency_code: Number(c[3]),
        constituency_name: c[4].trim(), ward_code: Number(c[5]), ward_name: c[6].trim(), registered_voters: Number(c[7])
      };
    });
  }
  function parseSimpleCsv(raw) {
    const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = lines.shift().split(',');
    return lines.filter(Boolean).map(line => {
      const c = line.split(',');
      return Object.fromEntries(headers.map((h, i) => [h, c[i]]));
    });
  }
  function groupBy(items, keyFn) {
    const out = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(item);
    }
    return out;
  }
  function firstSchedulePage(code) {
    const hit = [
      [1,20,3671],[21,93,3672],[94,166,3673],[167,239,3674],[240,312,3675],[313,385,3676],
      [386,458,3677],[459,531,3678],[532,604,3679],[605,677,3680],[678,750,3681],[751,823,3682],
      [824,896,3683],[897,969,3684],[970,1042,3685],[1043,1115,3686],[1116,1188,3687],[1189,1261,3688],
      [1262,1334,3689],[1335,1407,3690],[1408,1450,3691]
    ].find(([lo, hi]) => code >= lo && code <= hi);
    return hit ? String(hit[2]) : '';
  }

  // Constituency-local deterministic crosswalk. Exact names are assigned first,
  // then remaining same-code label variants, then a residual one-to-one remainder.
  // The two known Mandera boundary-conflict constituencies never enter this routine.
  function resolveSafeConstituency(sourceRows, canonicalRows) {
    const available = new Map(canonicalRows.map(g => [Number(g.ward_code), g]));
    const mapped = new Map();
    const method = new Map();

    for (const row of sourceRows) {
      const candidates = [...available.values()].filter(g => norm(g.name) === norm(row.ward_name));
      if (candidates.length === 1) {
        const ward = candidates[0];
        mapped.set(row.ward_code, ward);
        method.set(row.ward_code, Number(ward.ward_code) === row.ward_code ? 'code_and_name' : 'name_crosswalk');
        available.delete(Number(ward.ward_code));
      }
    }
    for (const row of sourceRows) {
      if (mapped.has(row.ward_code)) continue;
      const direct = available.get(row.ward_code);
      if (direct) {
        mapped.set(row.ward_code, direct);
        method.set(row.ward_code, 'code_label_variant');
        available.delete(row.ward_code);
      }
    }
    const remainingSource = sourceRows.filter(row => !mapped.has(row.ward_code)).sort((a, b) => a.ward_code - b.ward_code);
    const remainingCanonical = [...available.values()].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
    assert(remainingSource.length === remainingCanonical.length, `residual crosswalk imbalance in constituency ${sourceRows[0].constituency_code}`);
    remainingSource.forEach((row, i) => {
      mapped.set(row.ward_code, remainingCanonical[i]);
      method.set(row.ward_code, 'residual_one_to_one');
    });
    assert(mapped.size === sourceRows.length, `incomplete crosswalk in constituency ${sourceRows[0].constituency_code}`);
    return { mapped, method };
  }

  function makeDataset(sourceId) {
    return {
      dataset_id: 's2-ds-iebc-local-voters', dataset_code: 'DS-IEBC-VOTERS-LOCAL-2022-S2', source_id: sourceId,
      title: 'Registered Voters — 2022 Constituency and County Assembly Ward Schedule', topic: 'Elections',
      geographic_coverage: ['constituency', 'ward'], frequency: 'electoral_cycle', publication_status: 'published',
      known_limitations: 'All 1,450 domestic IEBC ward rows are ingested and reconcile to constituency/county totals. 1,440 are spatially published. Ten Mandera East/Lafey rows are held from current ward geometry because the external boundary layer conflicts with the operative IEBC configuration; no value is forced onto an uncertain polygon.'
    };
  }
  function makeRelease(dataset) {
    return {
      release_id: 's2-rel-iebc-local-voters-2022', release_code: 'REL-IEBC-VOTERS-LOCAL-2022-S2', dataset_id: dataset.dataset_id,
      title: 'Kenya Gazette Notice No. 7290 — Registered Voters per CAW and Constituency',
      reference_period_start: '2022-06-20', reference_period_end: '2022-06-20', published_at: '2022-06-21',
      discovered_at: '2026-08-26T20:30:00Z', ingested_at: '2026-08-26T23:45:00+03:00', release_url: IEBC_GAZETTE,
      release_status: 'published', version_label: '2022 certified register Gazette schedule',
      release_notes: 'First Schedule supplies all 1,450 domestic CAW values. Constituency totals are exact sums and all 47 county sums reconcile to the Third Schedule. Ten Mandera East/Lafey rows remain in totals but are withheld from current ward geometry.', supersedes_release_id: ''
    };
  }
  function makeSeries(id, code, indicator, geography, unit, dataset, method, group, observationId) {
    return {
      series_id: id, series_code: code, indicator_id: indicator.indicator_id, geography_id: geography.geography_id,
      geography_taxonomy: geography.geography_system || 'electoral', boundary_version: '2012-01', frequency: 'irregular',
      period_type: 'point_in_time', unit_id: unit.unit_id, price_basis: 'not_applicable', base_period: '', currency: '',
      seasonal_adjustment: 'none', transformation: 'level', geographic_method: method, comparability_group: group,
      dataset_id: dataset.dataset_id, agency_id: '', methodology_url: 'data/sprint2/README.md', start_period: 'June 2022',
      end_period: 'June 2022', latest_observation_id: observationId, observation_count: 1,
      last_updated_at: '2026-08-26T23:45:00+03:00', next_expected_release: '', status: 'active', superseded_by_series_id: ''
    };
  }
  function makeObservation(id, seriesId, geography, value, dataset, release, method, badge, table, page, label, notes, crosswalkId = '') {
    return {
      observation_id: id, series_id: seriesId, geography_id: geography.geography_id, boundary_version: '2012-01',
      period_start: '2022-06-20', period_end: '2022-06-20', period_type: 'point_in_time', period_label: 'Certified register · June 2022',
      value, geographic_method: method, statistical_status: 'final', source_class: 'official', badge,
      source_release_id: release.release_id, source_dataset_id: dataset.dataset_id, source_table: table, source_sheet: '',
      source_page: page, source_row_label: label, source_url: IEBC_GAZETTE, published_at: '2022-06-21',
      ingested_at: '2026-08-26T23:45:00+03:00', vintage_id: `${id}-v1`, supersedes_observation_id: '',
      lower_bound: null, upper_bound: null, confidence_level: null, standard_error: null, sample_size: null,
      suppression_reason: '', crosswalk_id: crosswalkId, notes
    };
  }

  async function build() {
    const [raw, geographies, indicators, units, datasets, countyRaw] = await Promise.all([
      getText(CODED_SOURCE), getJson('data/geography/registry/geographies.json'), getJson('data/indicators/registry/indicators.json'),
      getJson('data/indicators/registry/units.json'), getJson('data/catalogue/registry/datasets.json'), getText('data/sprint1/voters-2022.csv')
    ]);
    const rows = parseCoded(raw);
    assert(rows.length === 1450, `expected 1,450 domestic ward rows, found ${rows.length}`);
    assert(rows.every(r => Number.isInteger(r.registered_voters) && r.registered_voters > 0), 'every ward must have a positive integer voter count');
    assert(new Set(rows.map(r => r.ward_code)).size === 1450, 'source ward codes are not unique');
    assert(new Set(rows.map(r => r.constituency_code)).size === 290, 'source constituency coverage is not 290');
    const nationalTotal = rows.reduce((sum, row) => sum + row.registered_voters, 0);
    assert(nationalTotal === 22102532, `ward schedule total ${nationalTotal} != 22,102,532`);

    const counties = new Map(geographies.filter(g => g.level === 'county').map(g => [Number(g.county_code), g]));
    const constituencies = new Map(geographies.filter(g => g.level === 'constituency').map(g => [Number(g.constituency_code), g]));
    const canonicalWardsByConstituency = groupBy(geographies.filter(g => g.level === 'ward'), g => Number(g.constituency_code));
    assert(counties.size === 47 && constituencies.size === 290 && geographies.filter(g => g.level === 'ward').length === 1450, 'canonical geography registry is incomplete');

    const sourceByConstituency = groupBy(rows, row => row.constituency_code);
    const constituencyTotals = new Map();
    const countyTotals = new Map();
    for (const row of rows) {
      constituencyTotals.set(row.constituency_code, (constituencyTotals.get(row.constituency_code) || 0) + row.registered_voters);
      countyTotals.set(row.county_code, (countyTotals.get(row.county_code) || 0) + row.registered_voters);
    }
    for (const item of parseSimpleCsv(countyRaw)) {
      const code = Number(item.geo_code.replace('KEN-C', ''));
      assert(countyTotals.get(code) === Number(item.value), `county ${code} ward sum does not equal Gazette county value`);
    }

    const resolved = new Map();
    const usedCanonical = new Set();
    for (let code = 1; code <= 290; code += 1) {
      const constituency = constituencies.get(code);
      const sourceRows = sourceByConstituency.get(code) || [];
      assert(constituency && sourceRows.length, `missing constituency ${code}`);
      S2.constituencyValueByGeoCode.set(constituency.geo_code, constituencyTotals.get(code));
      S2.sourceWardCountByGeoCode.set(constituency.geo_code, sourceRows.length);
      S2.geoLevelByCode.set(constituency.geo_code, 'constituency');
      const county = counties.get(Number(constituency.county_code));
      if (county) S2.parentCodeByGeoCode.set(constituency.geo_code, county.geo_code);

      if (SPATIAL_HOLD_CONSTITUENCIES.has(code)) {
        S2.heldConstituencyGeoCodes.add(constituency.geo_code);
        sourceRows.forEach(row => S2.spatialHolds.push({
          constituency_code: code, constituency_geo_code: constituency.geo_code, source_ward_code: row.ward_code,
          source_ward_name: row.ward_name, registered_voters: row.registered_voters, reason: HOLD_REASON
        }));
        continue;
      }

      const canonicalRows = canonicalWardsByConstituency.get(code) || [];
      assert(canonicalRows.length === sourceRows.length, `ward-count mismatch in constituency ${code}`);
      const { mapped, method } = resolveSafeConstituency(sourceRows, canonicalRows);
      for (const row of sourceRows) {
        const ward = mapped.get(row.ward_code);
        assert(ward && !usedCanonical.has(ward.geography_id), `non-unique ward crosswalk at source CAW ${row.ward_code}`);
        usedCanonical.add(ward.geography_id);
        resolved.set(row.ward_code, ward);
        S2.wardValueByGeoCode.set(ward.geo_code, row.registered_voters);
        S2.geoLevelByCode.set(ward.geo_code, 'ward');
        S2.parentCodeByGeoCode.set(ward.geo_code, constituency.geo_code);
        const codeDiff = Number(ward.ward_code) !== row.ward_code;
        const labelDiff = norm(ward.name) !== norm(row.ward_name);
        if (codeDiff || labelDiff) S2.crosswalks.push({
          source_ward_code: row.ward_code, canonical_ward_code: Number(ward.ward_code), source_name: row.ward_name,
          canonical_name: ward.name, constituency_code: code, match_method: method.get(row.ward_code)
        });
      }
    }
    assert(usedCanonical.size === 1440, `expected 1,440 safely mapped wards, found ${usedCanonical.size}`);
    assert(S2.spatialHolds.length === 10, `expected 10 spatial holds, found ${S2.spatialHolds.length}`);

    const voterIndicator = indicators.find(i => i.indicator_code === 'IND-REGISTERED-VOTERS');
    const persons = units.find(u => u.code === 'persons');
    const baseIebcDataset = datasets.find(d => d.dataset_code === 'DS-IEBC-VOTERS') || datasets.find(d => /IEBC.*VOTER/i.test(d.dataset_code || ''));
    assert(voterIndicator && persons && baseIebcDataset?.source_id, 'base IEBC indicator/source mapping missing');
    const dataset = makeDataset(baseIebcDataset.source_id);
    const release = makeRelease(dataset);
    const series = [];
    const observations = [];

    for (const row of rows) {
      const ward = resolved.get(row.ward_code);
      if (!ward) continue; // documented spatial hold
      const x = S2.crosswalks.find(item => item.source_ward_code === row.ward_code);
      const crosswalkId = x ? `S2-CAW-XW-${String(row.ward_code).padStart(4, '0')}-${String(ward.ward_code).padStart(4, '0')}` : '';
      const seriesId = `s2-voters-ward-${String(ward.ward_code).padStart(4, '0')}`;
      const observationId = `${seriesId}-obs-2022`;
      series.push(makeSeries(seriesId, `KDA-VOTERS-2022-${ward.geo_code}`, voterIndicator, ward, persons, dataset, 'direct_official', 'IEBC-REGISTER-2022-WARD-GAZETTE', observationId));
      observations.push(makeObservation(
        observationId, seriesId, ward, row.registered_voters, dataset, release, 'direct_official', 'A',
        'First Schedule — Registered Voters per County Assembly Ward', firstSchedulePage(row.ward_code), row.ward_name,
        `Official IEBC CAW value. Source CAW code ${row.ward_code}; canonical Atlas ward ${ward.geo_code}. No parent value inherited.`, crosswalkId
      ));
    }

    for (let code = 1; code <= 290; code += 1) {
      const constituency = constituencies.get(code);
      const value = constituencyTotals.get(code);
      const seriesId = `s2-voters-constituency-${String(code).padStart(3, '0')}`;
      const observationId = `${seriesId}-obs-2022`;
      series.push(makeSeries(seriesId, `KDA-VOTERS-2022-${constituency.geo_code}`, voterIndicator, constituency, persons, dataset, 'derived_official', 'IEBC-REGISTER-2022-CONSTITUENCY-WARD-SUM', observationId));
      observations.push(makeObservation(
        observationId, seriesId, constituency, value, dataset, release, 'derived_official', 'B',
        'First Schedule — exact sum of child CAW rows', '3671–3691', constituency.name,
        SPATIAL_HOLD_CONSTITUENCIES.has(code)
          ? 'Official-derived constituency total from all five IEBC CAW rows. Ward rows remain in the total but are not attached to current external ward polygons pending boundary reconciliation.'
          : 'Official-derived constituency total: exact sum of direct child CAW values. No county value allocated downward.'
      ));
    }

    assert(series.length === 1730 && observations.length === 1730, 'expected 1,730 Sprint 2 published series/observations');
    assert(constituencyTotals.get(1) === 93561 && constituencyTotals.get(2) === 75085 && constituencyTotals.get(3) === 135276, 'Mombasa anchors failed');
    assert(constituencyTotals.get(91) === 72997, 'Ol Kalou anchor failed');
    assert(constituencyTotals.get(290) === 123163, 'Mathare anchor failed');

    S2.additions = { series, observations, datasets: [dataset], releases: [release] };
    S2.nationalTotal = nationalTotal;
    S2.constituencyTotals = constituencyTotals;
    S2.countyTotals = countyTotals;
    return S2;
  }

  S2.ready = build().catch(error => {
    console.error(error);
    S2.error = String(error?.message || error);
    S2.additions = { series: [], observations: [], datasets: [], releases: [] };
    return S2;
  });

  window.fetch = async function (input, init) {
    const types = [
      ['data/indicators/registry/indicators.json', 'indicators'], ['data/indicators/registry/series.json', 'series'],
      ['data/indicators/registry/observations.json', 'observations'], ['data/catalogue/registry/datasets.json', 'datasets'],
      ['data/catalogue/registry/releases.json', 'releases']
    ];
    const hit = types.find(([path]) => pathEnds(input, path));
    if (!hit || (init?.method && String(init.method).toUpperCase() !== 'GET')) return upstreamFetch(input, init);
    const response = await upstreamFetch(input, init);
    if (!response.ok) return response;
    await S2.ready;
    const base = await response.json();
    const type = hit[1];
    let merged = base;
    if (type === 'indicators') {
      merged = base.map(item => item.indicator_code === 'IND-REGISTERED-VOTERS' ? {
        ...item,
        description: 'Registered voters in the certified 2022 register. All 1,450 domestic ward rows are ingested; 1,440 are safely published on current ward geometry, while 10 Mandera East/Lafey rows are held from spatial attribution pending boundary reconciliation. Constituency totals use all source rows.',
        minimum_geo_level: 'ward', methodology_url: 'data/sprint2/README.md'
      } : item);
    } else {
      const additions = S2.additions[type] || [];
      const idField = { series: 'series_id', observations: 'observation_id', datasets: 'dataset_id', releases: 'release_id' }[type];
      const ids = new Set(base.map(item => item[idField]));
      merged = [...base, ...additions.filter(item => !ids.has(item[idField]))];
    }
    return new Response(JSON.stringify(merged), {
      status: response.status, statusText: response.statusText, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  window.KDASprint2 = S2;
})();
