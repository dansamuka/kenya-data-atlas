/* Kenya Data Atlas — Data Sprint 2: Local Kenya.
 * IEBC 2022 registered voters at all 290 constituencies and 1,450 wards.
 *
 * The IEBC 2022 CAW schedule and the Atlas canonical geography do not have
 * perfectly identical ward labels / numbering in every constituency. Sprint 2
 * therefore performs a deterministic, constituency-local one-to-one crosswalk:
 *   1) exact normalized ward-name match;
 *   2) same ward code among the remaining wards;
 *   3) deterministic residual pairing inside the same constituency.
 *
 * Aligned observations are A — Official direct. Any ward that requires a
 * geographic crosswalk is B — Official transformed. No parent statistic is
 * inherited or allocated downward.
 */
(function () {
  'use strict';

  const upstreamFetch = window.fetch.bind(window); // includes Sprint 1 overlay
  const IEBC_GAZETTE = 'https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf';
  const CODED_SOURCE = 'https://raw.githubusercontent.com/samy-migwi/kenya_2022_voters_dashboard_app/29b269a6562262a77faf6d22ba5837f46d35df75/data/voters.csv';

  const S2 = {
    version: '2.2',
    ready: null,
    additions: null,
    error: null,
    coverage: { counties: 47, constituencies: 290, wards: 1450 },
    nationalTotal: null,
    constituencyTotals: new Map(),
    countyTotals: new Map(),
    constituencyValueByGeoCode: new Map(),
    wardValueByGeoCode: new Map(),
    geoLevelByCode: new Map(),
    parentCodeByGeoCode: new Map(),
    sourceLabelByGeoCode: new Map(),
    crosswalks: [],
    crosswalkByGeoCode: new Map()
  };

  function assert(condition, message) {
    if (!condition) throw new Error(`Sprint 2 validation: ${message}`);
  }

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

  function norm(value) {
    return String(value || '')
      .toUpperCase()
      .normalize('NFKD')
      .replace(/[’‘]/g, "'")
      .replace(/\bCITY\b/g, '')
      .replace(/[^A-Z0-9]+/g, '');
  }

  function parseCodedVoters(raw) {
    const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const header = lines.shift();
    assert(header && header.includes('Registered Voters'), 'unexpected coded IEBC transcription header');
    return lines.filter(Boolean).map((line, index) => {
      const c = line.split(',');
      assert(c.length >= 8, `malformed source row ${index + 2}`);
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

  function groupBy(items, keyFn) {
    const out = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(item);
    }
    return out;
  }

  function buildWardCrosswalk(rows, geographies) {
    const sourceByConstituency = groupBy(rows, row => row.constituency_code);
    const canonicalWards = geographies.filter(g => g.level === 'ward');
    const canonicalByConstituency = groupBy(canonicalWards, g => Number(g.constituency_code));
    const mapping = new Map();
    const usedCanonical = new Set();
    const crosswalks = [];

    for (let constituencyCode = 1; constituencyCode <= 290; constituencyCode += 1) {
      const sourceRows = [...(sourceByConstituency.get(constituencyCode) || [])]
        .sort((a, b) => a.ward_code - b.ward_code);
      const canonicalRows = [...(canonicalByConstituency.get(constituencyCode) || [])]
        .sort((a, b) => Number(a.ward_code) - Number(b.ward_code));

      assert(sourceRows.length > 0, `constituency ${constituencyCode} has no IEBC ward rows`);
      assert(
        sourceRows.length === canonicalRows.length,
        `constituency ${constituencyCode}: source has ${sourceRows.length} wards, canonical has ${canonicalRows.length}`
      );

      const unmatchedSource = new Set(sourceRows);
      const unmatchedCanonical = new Set(canonicalRows);

      function assign(source, canonical, method) {
        assert(unmatchedSource.has(source), `source CAW ${source.ward_code} assigned twice`);
        assert(unmatchedCanonical.has(canonical), `canonical ward ${canonical.geo_code} assigned twice`);
        assert(Number(canonical.constituency_code) === source.constituency_code, `crosswalk left constituency ${source.constituency_code}`);
        assert(Number(canonical.county_code) === source.county_code, `crosswalk left county ${source.county_code}`);

        unmatchedSource.delete(source);
        unmatchedCanonical.delete(canonical);
        usedCanonical.add(canonical.geography_id);

        const aligned = source.ward_code === Number(canonical.ward_code)
          && norm(source.ward_name) === norm(canonical.name);
        const crosswalkId = aligned
          ? ''
          : `S2-CAW-XW-${String(source.ward_code).padStart(4, '0')}-${String(canonical.ward_code).padStart(4, '0')}`;

        const record = { source, canonical, aligned, method, crosswalk_id: crosswalkId };
        mapping.set(source.ward_code, record);

        if (!aligned) {
          const item = {
            crosswalk_id: crosswalkId,
            method,
            county_code: source.county_code,
            constituency_code: source.constituency_code,
            source_ward_code: source.ward_code,
            source_name: source.ward_name,
            canonical_ward_code: Number(canonical.ward_code),
            canonical_name: canonical.name,
            canonical_geo_code: canonical.geo_code
          };
          crosswalks.push(item);
          S2.crosswalkByGeoCode.set(canonical.geo_code, item);
        }
      }

      // Phase 1: semantic identity wins, even if the numeric CAW ordering differs.
      for (const source of sourceRows) {
        if (!unmatchedSource.has(source)) continue;
        const candidates = [...unmatchedCanonical].filter(g => norm(g.name) === norm(source.ward_name));
        if (candidates.length === 1) assign(source, candidates[0], 'name_identity');
      }

      // Phase 2: remaining same-code rows are treated as label/version crosswalks.
      for (const source of sourceRows) {
        if (!unmatchedSource.has(source)) continue;
        const candidate = [...unmatchedCanonical].find(g => Number(g.ward_code) === source.ward_code);
        if (candidate) assign(source, candidate, 'code_identity_label_variant');
      }

      // Phase 3: any remaining historical nomenclature differences are paired
      // deterministically inside the same constituency and explicitly downgraded.
      const residualSource = [...unmatchedSource].sort((a, b) => a.ward_code - b.ward_code);
      const residualCanonical = [...unmatchedCanonical].sort((a, b) => Number(a.ward_code) - Number(b.ward_code));
      assert(residualSource.length === residualCanonical.length, `constituency ${constituencyCode}: residual crosswalk imbalance`);
      residualSource.forEach((source, index) => assign(source, residualCanonical[index], 'constituency_residual'));

      assert(unmatchedSource.size === 0 && unmatchedCanonical.size === 0, `constituency ${constituencyCode}: incomplete crosswalk`);
    }

    assert(mapping.size === 1450, `crosswalk resolves ${mapping.size}/1,450 source wards`);
    assert(usedCanonical.size === 1450, `crosswalk covers ${usedCanonical.size}/1,450 canonical wards`);
    assert(crosswalks.length === 61, `expected 61 explicit source/canonical divergences, found ${crosswalks.length}`);

    return { mapping, crosswalks };
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
      known_limitations: 'Ward values are direct IEBC observations. 1,389 ward records align directly to the canonical Atlas ward identity; 61 require an explicit constituency-local geography crosswalk and are badged B. Constituency totals are exact child-ward sums. No parent value is allocated downward.'
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
      release_notes: 'First Schedule provides CAW values. Sprint 2 applies an explicit, validated 2022-source-to-canonical ward crosswalk where labels or ordering differ, derives constituency totals by exact child-ward summation, and reconciles all 47 counties to the Third Schedule.',
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

  function makeObservation({ id, seriesId, geography, value, dataset, release, method, badge, sourceTable, sourcePage, sourceRowLabel, notes, crosswalkId = '' }) {
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
      crosswalk_id: crosswalkId,
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
    const constituencyCodes = new Set(rows.map(r => r.constituency_code));
    const countyCodes = new Set(rows.map(r => r.county_code));
    assert(wardCodes.size === 1450, `expected 1,450 unique source ward codes, found ${wardCodes.size}`);
    assert(constituencyCodes.size === 290, `expected 290 unique constituency codes, found ${constituencyCodes.size}`);
    assert(countyCodes.size === 47, `expected 47 unique county codes, found ${countyCodes.size}`);
    for (let i = 1; i <= 1450; i += 1) assert(wardCodes.has(i), `missing source ward code ${i}`);
    for (let i = 1; i <= 290; i += 1) assert(constituencyCodes.has(i), `missing constituency code ${i}`);
    for (let i = 1; i <= 47; i += 1) assert(countyCodes.has(i), `missing county code ${i}`);

    const nationalTotal = rows.reduce((sum, row) => sum + row.registered_voters, 0);
    assert(nationalTotal === 22102532, `ward schedule total ${nationalTotal} != 22,102,532`);

    const countyByCode = new Map(geographies.filter(g => g.level === 'county').map(g => [Number(g.county_code), g]));
    const constituencyByCode = new Map(geographies.filter(g => g.level === 'constituency').map(g => [Number(g.constituency_code), g]));
    const canonicalById = new Map(geographies.map(g => [g.geography_id, g]));
    assert(countyByCode.size === 47 && constituencyByCode.size === 290, 'canonical county/constituency registry is incomplete');

    for (const row of rows) {
      const county = countyByCode.get(row.county_code);
      const constituency = constituencyByCode.get(row.constituency_code);
      assert(county && constituency, `unresolved county/constituency at source CAW ${row.ward_code}`);
      assert(constituency.parent_id === county.geography_id, `constituency ${row.constituency_code} parent mismatch`);
      assert(norm(county.name) === norm(row.county_name), `source county ${row.county_name} != canonical ${county.name}`);
      assert(norm(constituency.name) === norm(row.constituency_name), `source constituency ${row.constituency_name} != canonical ${constituency.name}`);
    }

    const { mapping, crosswalks } = buildWardCrosswalk(rows, geographies);
    S2.crosswalks = crosswalks;

    const constituencyTotals = new Map();
    const countyTotals = new Map();
    for (const row of rows) {
      constituencyTotals.set(row.constituency_code, (constituencyTotals.get(row.constituency_code) || 0) + row.registered_voters);
      countyTotals.set(row.county_code, (countyTotals.get(row.county_code) || 0) + row.registered_voters);
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
    const baseIebcDataset = datasets.find(d => d.dataset_code === 'DS-IEBC-VOTERS')
      || datasets.find(d => /IEBC.*VOTER/i.test(d.dataset_code || ''));
    assert(voterIndicator && persons && baseIebcDataset?.source_id, 'base IEBC indicator/source mapping missing');

    const dataset = makeDataset(baseIebcDataset.source_id);
    const release = makeRelease(dataset);
    const series = [];
    const observations = [];

    for (const row of rows) {
      const resolved = mapping.get(row.ward_code);
      assert(resolved, `source ward ${row.ward_code} has no resolved canonical ward`);
      const ward = resolved.canonical;
      const aligned = resolved.aligned;
      const seriesId = `s2-voters-ward-${String(ward.ward_code).padStart(4, '0')}`;
      const observationId = `${seriesId}-obs-2022`;
      const method = aligned ? 'direct_official' : 'crosswalked_official';
      const badge = aligned ? 'A' : 'B';
      const group = aligned ? 'IEBC-REGISTER-2022-WARD-GAZETTE' : 'IEBC-REGISTER-2022-WARD-CROSSWALK';

      S2.wardValueByGeoCode.set(ward.geo_code, row.registered_voters);
      S2.geoLevelByCode.set(ward.geo_code, 'ward');
      S2.sourceLabelByGeoCode.set(ward.geo_code, row.ward_name);
      const canonicalParent = canonicalById.get(ward.parent_id);
      if (canonicalParent) S2.parentCodeByGeoCode.set(ward.geo_code, canonicalParent.geo_code);

      series.push(makeSeries({
        id: seriesId,
        code: `KDA-VOTERS-2022-${ward.geo_code}`,
        indicatorId: voterIndicator.indicator_id,
        geography: ward,
        unitId: persons.unit_id,
        datasetId: dataset.dataset_id,
        method,
        group,
        observationId
      }));

      const geographyNote = aligned
        ? `Official IEBC CAW value. Source CAW ${row.ward_code} ${row.ward_name} aligns directly with canonical ward ${ward.geo_code}. No parent value inherited.`
        : `Official IEBC CAW value transformed through explicit geography crosswalk ${resolved.crosswalk_id}: source CAW ${row.ward_code} ${row.ward_name} → canonical ${ward.geo_code} ${ward.name}; method ${resolved.method}. No parent value inherited.`;

      observations.push(makeObservation({
        id: observationId,
        seriesId,
        geography: ward,
        value: row.registered_voters,
        dataset,
        release,
        method,
        badge,
        sourceTable: 'First Schedule — Registered Voters per County Assembly Ward',
        sourcePage: firstSchedulePage(row.ward_code),
        sourceRowLabel: row.ward_name,
        notes: geographyNote,
        crosswalkId: resolved.crosswalk_id
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
        sourceTable: 'First Schedule — exact sum of constituent CAW rows',
        sourcePage: '3671–3691',
        sourceRowLabel: constituency.name,
        notes: 'Official-derived constituency total: exact sum of the IEBC First Schedule CAW values assigned to this constituency. No county value allocated downward.'
      }));
    }

    // Locked official anchors.
    assert(constituencyTotals.get(1) === 93561, 'Changamwe constituency anchor failed');
    assert(constituencyTotals.get(2) === 75085, 'Jomvu constituency anchor failed');
    assert(constituencyTotals.get(3) === 135276, 'Kisauni constituency anchor failed');
    assert(constituencyTotals.get(91) === 72997, 'Ol Kalou constituency anchor failed');
    assert(constituencyTotals.get(290) === 123163, 'Mathare constituency anchor failed');
    const sourceWardValue = code => rows.find(r => r.ward_code === code)?.registered_voters;
    assert(sourceWardValue(453) === 13594 && sourceWardValue(454) === 15596 && sourceWardValue(455) === 14695 && sourceWardValue(456) === 13540 && sourceWardValue(457) === 15572, 'Ol Kalou ward anchors failed');
    assert(sourceWardValue(1450) === 19193, 'Kiamaiko ward anchor failed');

    S2.additions = { series, observations, datasets: [dataset], releases: [release] };
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
        description: 'Registered voters in the certified 2022 register. County observations are official direct; all 290 constituency totals are exact official-derived child-ward sums; all 1,450 ward values are present, with 61 explicitly crosswalked where the 2022 IEBC CAW identity differs from the Atlas canonical label/order.',
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
