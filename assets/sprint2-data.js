/* Kenya Data Atlas — Data Sprint 2: Local Kenya.
 * Populates the first complete electoral drill-down with IEBC 2022 registered
 * voters: 290 constituencies and 1,450 County Assembly Wards.
 *
 * Values are joined ONLY by IEBC numeric county/constituency/ward codes to the
 * canonical geography registry. Nothing is inherited from a parent geography.
 */
(function () {
  'use strict';

  const upstreamFetch = window.fetch.bind(window); // includes Sprint 1 overlay
  const IEBC_GAZETTE = 'https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
  const CODED_SOURCE = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';
  const S2 = {
    version: '2.0',
    ready: null,
    additions: null,
    error: null,
    coverage: { counties: 47, constituencies: 290, wards: 1450 },
    constituencyValueByGeoCode: new Map(),
    wardValueByGeoCode: new Map(),
    geoLevelByCode: new Map(),
    parentCodeByGeoCode: new Map(),
    nameMismatches: []
  };

  function pathEnds(input, suffix) {
    try {
      return new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith(suffix);
    } catch {
      return false;
    }
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

  function parseCodedVoters(raw) {
    const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const header = lines.shift();
    if (!header || !header.includes('Registered Voters')) throw new Error('Sprint 2: unexpected coded IEBC transcription header.');
    return lines.filter(Boolean).map((line, index) => {
      const c = line.split(',');
      if (c.length < 8) throw new Error(`Sprint 2: malformed source row ${index + 2}.`);
      return {
        county_code: Number(c[1]),
        county_name: c[2].trim(),
        constituency_code: Number(c[3]),
        constituency_name: c[4].trim(),
        ward_code: Number(c[5]),
        ward_name: c[6].trim(),
        registered_voters: Number(c[7])
      };
    });
  }

  function parseSimpleCsv(raw) {
    const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = lines.shift().split(',');
    return lines.filter(Boolean).map(line => {
      const cols = line.split(',');
      return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
    });
  }

  function norm(value) {
    return String(value || '').toUpperCase().normalize('NFKD')
      .replace(/[’‘]/g, "'")
      .replace(/[^A-Z0-9]+/g, '');
  }

  function firstSchedulePage(code) {
    const ranges = [
      [1, 20, 3671], [21, 93, 3672], [94, 166, 3673], [167, 239, 3674],
      [240, 312, 3675], [313, 385, 3676], [386, 458, 3677], [459, 531, 3678],
      [532, 604, 3679], [605, 677, 3680], [678, 750, 3681], [751, 823, 3682],
      [824, 896, 3683], [897, 969, 3684], [970, 1042, 3685], [1043, 1115, 3686],
      [1116, 1188, 3687], [1189, 1261, 3688], [1262, 1334, 3689], [1335, 1407, 3690],
      [1408, 1450, 3691]
    ];
    const hit = ranges.find(([lo, hi]) => code >= lo && code <= hi);
    return hit ? String(hit[2]) : '';
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Sprint 2 validation: ${message}`);
  }

  function makeDataset(sourceId) {
    return {
      dataset_id: 's2-ds-iebc-local-voters',
      dataset_code: 'DS-IEBC-VOTERS-LOCAL-2022-S2',
      source_id: sourceId,
      title: 'Registered Voters — 2022 Constituency and County Assembly Ward Schedule',
      topic: 'Elections',
      geographic_coverage: ['constituency', 'ward'],
      frequency: 'electoral_cycle',
      publication_status: 'published',
      known_limitations: 'Ward values are direct official IEBC schedule observations. Constituency values are transparently summed from the ward schedule and badged Official derived. No parent value is allocated downward.'
    };
  }

  function makeRelease(dataset) {
    return {
      release_id: 's2-rel-iebc-local-voters-2022',
      release_code: 'REL-IEBC-VOTERS-LOCAL-2022-S2',
      dataset_id: dataset.dataset_id,
      title: 'Kenya Gazette Notice No. 7290 — Registered Voters per CAW and Constituency',
      reference_period_start: '2022-06-20',
      reference_period_end: '2022-06-20',
      published_at: '2022-06-21',
      discovered_at: '2026-08-26T20:30:00Z',
      ingested_at: '2026-08-26T23:45:00+03:00',
      release_url: IEBC_GAZETTE,
      release_status: 'published',
      version_label: '2022 certified register Gazette schedule',
      release_notes: 'First Schedule provides CAW values; Sprint 2 derives constituency totals by exact summation of child wards and reconciles county totals to the Third Schedule.',
      supersedes_release_id: ''
    };
  }

  function makeSeries({ id, code, indicatorId, geography, unitId, datasetId, method, group, observationId }) {
    return {
      series_id: id,
      series_code: code,
      indicator_id: indicatorId,
      geography_id: geography.geography_id,
      geography_taxonomy: geography.geography_system || 'electoral',
      boundary_version: '2012-01',
      frequency: 'irregular',
      period_type: 'point_in_time',
      unit_id: unitId,
      price_basis: 'not_applicable',
      base_period: '',
      currency: '',
      seasonal_adjustment: 'none',
      transformation: 'level',
      geographic_method: method,
      comparability_group: group,
      dataset_id: datasetId,
      agency_id: '',
      methodology_url: 'data/sprint2/README.md',
      start_period: 'June 2022',
      end_period: 'June 2022',
      latest_observation_id: observationId,
      observation_count: 1,
      last_updated_at: '2026-08-26T23:45:00+03:00',
      next_expected_release: '',
      status: 'active',
      superseded_by_series_id: ''
    };
  }

  function makeObservation({ id, seriesId, geography, value, dataset, release, method, badge, sourceTable, sourcePage, sourceRowLabel, notes }) {
    return {
      observation_id: id,
      series_id: seriesId,
      geography_id: geography.geography_id,
      boundary_version: '2012-01',
      period_start: '2022-06-20',
      period_end: '2022-06-20',
      period_type: 'point_in_time',
      period_label: 'Certified register · June 2022',
      value,
      geographic_method: method,
      statistical_status: 'final',
      source_class: 'official',
      badge,
      source_release_id: release.release_id,
      source_dataset_id: dataset.dataset_id,
      source_table: sourceTable,
      source_sheet: '',
      source_page: sourcePage,
      source_row_label: sourceRowLabel,
      source_url: IEBC_GAZETTE,
      published_at: '2022-06-21',
      ingested_at: '2026-08-26T23:45:00+03:00',
      vintage_id: `${id}-v1`,
      supersedes_observation_id: '',
      lower_bound: null,
      upper_bound: null,
      confidence_level: null,
      standard_error: null,
      sample_size: null,
      suppression_reason: '',
      crosswalk_id: '',
      notes
    };
  }

  async function build() {
    const [codedRaw, geographies, indicators, units, datasets, countyRaw] = await Promise.all([
      getText(CODED_SOURCE),
      getJson('data/geography/registry/geographies.json'),
      getJson('data/indicators/registry/indicators.json'),
      getJson('data/indicators/registry/units.json'),
      getJson('data/catalogue/registry/datasets.json'),
      getText('data/sprint1/voters-2022.csv')
    ]);

    const rows = parseCodedVoters(codedRaw);
    assert(rows.length === 1450, `expected 1,450 domestic ward rows, found ${rows.length}`);
    assert(rows.every(r => Number.isInteger(r.registered_voters) && r.registered_voters > 0), 'every ward must have a positive integer voter count');

    const wardCodes = new Set(rows.map(r => r.ward_code));
    assert(wardCodes.size === 1450, 'ward codes must be unique');
    for (let i = 1; i <= 1450; i += 1) assert(wardCodes.has(i), `missing ward code ${i}`);

    const constituencyCodes = new Set(rows.map(r => r.constituency_code));
    assert(constituencyCodes.size === 290, `expected 290 constituency codes, found ${constituencyCodes.size}`);
    for (let i = 1; i <= 290; i += 1) assert(constituencyCodes.has(i), `missing constituency code ${i}`);

    const nationalTotal = rows.reduce((sum, row) => sum + row.registered_voters, 0);
    assert(nationalTotal === 22102532, `ward schedule total ${nationalTotal} != 22,102,532`);

    const countyByCode = new Map(geographies.filter(g => g.level === 'county').map(g => [Number(g.county_code), g]));
    const constituencyByCode = new Map(geographies.filter(g => g.level === 'constituency').map(g => [Number(g.constituency_code), g]));
    const wardByCode = new Map(geographies.filter(g => g.level === 'ward').map(g => [Number(g.ward_code), g]));
    assert(countyByCode.size === 47 && constituencyByCode.size === 290 && wardByCode.size === 1450, 'canonical geography registry is incomplete');

    const canonicalById = new Map(geographies.map(g => [g.geography_id, g]));
    const constituencyTotals = new Map();
    const countyTotals = new Map();

    for (const row of rows) {
      const county = countyByCode.get(row.county_code);
      const constituency = constituencyByCode.get(row.constituency_code);
      const ward = wardByCode.get(row.ward_code);
      assert(county && constituency && ward, `unresolved geography code at ward ${row.ward_code}`);
      assert(constituency.parent_id === county.geography_id, `constituency ${row.constituency_code} not inside county ${row.county_code}`);
      assert(ward.parent_id === constituency.geography_id, `ward ${row.ward_code} not inside constituency ${row.constituency_code}`);
      assert(Number(ward.county_code) === row.county_code && Number(ward.constituency_code) === row.constituency_code, `ward ${row.ward_code} hierarchy codes disagree`);

      if (norm(county.name) !== norm(row.county_name) || norm(constituency.name) !== norm(row.constituency_name) || norm(ward.name) !== norm(row.ward_name)) {
        S2.nameMismatches.push({ ward_code: row.ward_code, source: `${row.county_name} / ${row.constituency_name} / ${row.ward_name}`, canonical: `${county.name} / ${constituency.name} / ${ward.name}` });
      }
      constituencyTotals.set(row.constituency_code, (constituencyTotals.get(row.constituency_code) || 0) + row.registered_voters);
      countyTotals.set(row.county_code, (countyTotals.get(row.county_code) || 0) + row.registered_voters);
      S2.wardValueByGeoCode.set(ward.geo_code, row.registered_voters);
      S2.geoLevelByCode.set(ward.geo_code, 'ward');
      S2.parentCodeByGeoCode.set(ward.geo_code, constituency.geo_code);
    }

    const countySchedule = parseSimpleCsv(countyRaw);
    assert(countySchedule.length === 47, `Sprint 1 county schedule has ${countySchedule.length} rows`);
    for (const item of countySchedule) {
      const code = Number(String(item.geo_code).replace('KEN-C', ''));
      const expected = Number(item.value);
      assert(countyTotals.get(code) === expected, `county ${code} ward sum ${countyTotals.get(code)} != Gazette county value ${expected}`);
    }

    const voterIndicator = indicators.find(i => i.indicator_code === 'IND-REGISTERED-VOTERS');
    const persons = units.find(u => u.code === 'persons');
    assert(voterIndicator && persons, 'base registered-voters indicator/person unit missing');
    const baseIebcDataset = datasets.find(d => d.dataset_code === 'DS-IEBC-VOTERS') || datasets.find(d => /IEBC.*VOTER/i.test(d.dataset_code || ''));
    assert(baseIebcDataset && baseIebcDataset.source_id, 'base IEBC source mapping missing');

    const dataset = makeDataset(baseIebcDataset.source_id);
    const release = makeRelease(dataset);
    const series = [];
    const observations = [];

    for (const row of rows) {
      const ward = wardByCode.get(row.ward_code);
      const seriesId = `s2-voters-ward-${String(row.ward_code).padStart(4, '0')}`;
      const observationId = `${seriesId}-obs-2022`;
      series.push(makeSeries({
        id: seriesId,
        code: `KDA-VOTERS-2022-${ward.geo_code}`,
        indicatorId: voterIndicator.indicator_id,
        geography: ward,
        unitId: persons.unit_id,
        datasetId: dataset.dataset_id,
        method: 'direct_official',
        group: 'IEBC-REGISTER-2022-WARD-GAZETTE',
        observationId
      }));
      observations.push(makeObservation({
        id: observationId,
        seriesId,
        geography: ward,
        value: row.registered_voters,
        dataset,
        release,
        method: 'direct_official',
        badge: 'A',
        sourceTable: 'First Schedule — Registered Voters per County Assembly Ward',
        sourcePage: firstSchedulePage(row.ward_code),
        sourceRowLabel: row.ward_name,
        notes: `Official IEBC CAW value. Joined to the Atlas by ward code ${row.ward_code}; no parent value inherited.`
      }));
    }

    for (let code = 1; code <= 290; code += 1) {
      const constituency = constituencyByCode.get(code);
      const value = constituencyTotals.get(code);
      assert(constituency && Number.isFinite(value) && value > 0, `invalid constituency aggregate ${code}`);
      const seriesId = `s2-voters-constituency-${String(code).padStart(3, '0')}`;
      const observationId = `${seriesId}-obs-2022`;
      S2.constituencyValueByGeoCode.set(constituency.geo_code, value);
      S2.geoLevelByCode.set(constituency.geo_code, 'constituency');
      const parent = canonicalById.get(constituency.parent_id);
      if (parent) S2.parentCodeByGeoCode.set(constituency.geo_code, parent.geo_code);
      series.push(makeSeries({
        id: seriesId,
        code: `KDA-VOTERS-2022-${constituency.geo_code}`,
        indicatorId: voterIndicator.indicator_id,
        geography: constituency,
        unitId: persons.unit_id,
        datasetId: dataset.dataset_id,
        method: 'derived_official',
        group: 'IEBC-REGISTER-2022-CONSTITUENCY-WARD-SUM',
        observationId
      }));
      observations.push(makeObservation({
        id: observationId,
        seriesId,
        geography: constituency,
        value,
        dataset,
        release,
        method: 'derived_official',
        badge: 'B',
        sourceTable: 'First Schedule — sum of constituent CAW rows',
        sourcePage: '3671–3691',
        sourceRowLabel: constituency.name,
        notes: 'Official-derived constituency total: exact sum of child CAW values from the IEBC First Schedule. No county value allocated downward.'
      }));
    }

    // Locked official anchors from the Gazette Second Schedule / First Schedule.
    assert(constituencyTotals.get(1) === 93561, 'Changamwe constituency anchor failed');
    assert(constituencyTotals.get(2) === 75085, 'Jomvu constituency anchor failed');
    assert(constituencyTotals.get(3) === 135276, 'Kisauni constituency anchor failed');
    assert(constituencyTotals.get(91) === 72997, 'Ol Kalou constituency anchor failed');
    assert(constituencyTotals.get(290) === 123163, 'Mathare constituency anchor failed');
    const wardValue = code => rows.find(r => r.ward_code === code)?.registered_voters;
    assert(wardValue(453) === 13594 && wardValue(454) === 15596 && wardValue(455) === 14695 && wardValue(456) === 13540 && wardValue(457) === 15572, 'Ol Kalou ward anchors failed');
    assert(wardValue(1450) === 19193, 'Kiamaiko ward anchor failed');

    S2.additions = {
      series,
      observations,
      datasets: [dataset],
      releases: [release]
    };
    S2.nationalTotal = nationalTotal;
    S2.constituencyTotals = constituencyTotals;
    S2.countyTotals = countyTotals;
    return S2;
  }

  S2.ready = build().catch(error => {
    console.error(error);
    S2.error = String(error && error.message ? error.message : error);
    S2.additions = { series: [], observations: [], datasets: [], releases: [] };
    return S2;
  });

  window.fetch = async function (input, init) {
    const types = [
      ['data/indicators/registry/indicators.json', 'indicators'],
      ['data/indicators/registry/series.json', 'series'],
      ['data/indicators/registry/observations.json', 'observations'],
      ['data/catalogue/registry/datasets.json', 'datasets'],
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
        description: 'Registered voters in the certified 2022 register. Direct official observations are available for counties and all 1,450 County Assembly Wards; constituency totals are official-derived sums of child wards.',
        minimum_geo_level: 'ward',
        methodology_url: 'data/sprint2/README.md'
      } : item);
    } else {
      const additions = S2.additions[type] || [];
      const idField = { series: 'series_id', observations: 'observation_id', datasets: 'dataset_id', releases: 'release_id' }[type];
      const ids = new Set(base.map(item => item[idField]));
      merged = [...base, ...additions.filter(item => !ids.has(item[idField]))];
    }

    return new Response(JSON.stringify(merged), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  window.KDASprint2 = S2;
})();
