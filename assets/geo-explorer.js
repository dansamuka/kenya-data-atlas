/* Kenya Data Atlas — Geo Explorer
 *
 * KKMNOW-style statistical choropleth using the Atlas's validated GeoJSON.
 * Hierarchy: Kenya -> County -> Constituency -> Ward.
 *
 * Important rendering note: RFC 7946 GeoJSON exterior rings normally use
 * counter-clockwise winding, while D3's spherical geo renderer expects small
 * exterior polygons clockwise. We therefore clone and normalize ring winding
 * only at render time. The canonical geometry cache/files are never mutated.
 */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  const svg = d3.select('#geo-svg');
  const VIEW_W = 800, VIEW_H = 780, PAD = 18;

  let geographies = [], indicators = [], series = [], observations = [], units = [];
  let agencies = [], sources = [], datasets = [];
  let geoById = new Map();
  const childrenOf = new Map();
  let indicatorById = new Map(), indicatorByCode = new Map();
  let unitById = new Map(), observationById = new Map();
  const seriesByGeoIndicator = new Map();
  const geometryCache = { country: null, county: null, constituency: null, ward: null };

  let currentGeographyId = null;
  let currentIndicatorId = null;
  let renderGeneration = 0;

  async function fetchJson(url) {
    try {
      const response = await fetch(url);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  async function boot() {
    const results = await Promise.all([
      fetchJson('data/geography/registry/geographies.json'),
      fetchJson('data/indicators/registry/indicators.json'),
      fetchJson('data/indicators/registry/series.json'),
      fetchJson('data/indicators/registry/observations.json'),
      fetchJson('data/indicators/registry/units.json'),
      fetchJson('data/catalogue/registry/agencies.json'),
      fetchJson('data/catalogue/registry/sources.json'),
      fetchJson('data/catalogue/registry/datasets.json')
    ]);

    [geographies, indicators, series, observations, units, agencies, sources, datasets] = results;
    if (!geographies || !indicators || !series || !observations || !units) return;

    geoById = new Map(geographies.map(g => [g.geography_id, g]));
    for (const g of geographies) {
      if (!g.parent_id) continue;
      if (!childrenOf.has(g.parent_id)) childrenOf.set(g.parent_id, []);
      childrenOf.get(g.parent_id).push(g.geography_id);
    }

    indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
    indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
    unitById = new Map(units.map(u => [u.unit_id, u]));
    observationById = new Map(observations.map(o => [o.observation_id, o]));

    for (const s of series) {
      const key = `${s.geography_id}|${s.indicator_id}`;
      const existing = seriesByGeoIndicator.get(key);
      if (!existing || (s.observation_count || 0) > (existing.observation_count || 0)) {
        seriesByGeoIndicator.set(key, s);
      }
    }

    populateIndicatorSelect();

    const country = geographies.find(g => g.level === 'country');
    const defaultIndicator = indicatorByCode.get('IND-POPULATION') || indicators[0];
    currentIndicatorId = defaultIndicator ? defaultIndicator.indicator_id : null;

    const initial = parseHash();
    const startGeoId = initial.geoId || (country && country.geography_id);
    if (initial.indicatorId) currentIndicatorId = initial.indicatorId;
    syncIndicatorSelect();

    const indicatorSelect = $('#geo-indicator');
    if (indicatorSelect) {
      indicatorSelect.onchange = () => {
        const ind = indicatorByCode.get(indicatorSelect.value);
        if (ind) currentIndicatorId = ind.indicator_id;
        renderCurrent();
        updateHashInPlace();
      };
    }

    window.addEventListener('hashchange', () => {
      const state = parseHash();
      if (!state.geoId) return;
      const geographyChanged = state.geoId !== currentGeographyId;
      const indicatorChanged = state.indicatorId && state.indicatorId !== currentIndicatorId;
      if (geographyChanged || indicatorChanged) {
        selectGeography(state.geoId, { pushHash: false, indicatorId: state.indicatorId });
      }
    });

    if (startGeoId) await selectGeography(startGeoId, { pushHash: false });

    window.KDAGeo = {
      selectGeography,
      normalizeFeatureForD3,
      ready: true
    };
  }

  function parseHash() {
    const match = location.hash.match(/^#map\/([^?]+)(?:\?indicator=(.+))?$/);
    if (!match) return {};
    const geoCode = decodeURIComponent(match[1]);
    const indicatorCode = match[2] ? decodeURIComponent(match[2]) : null;
    const geo = geographies.find(g => g.geo_code === geoCode);
    const indicator = indicatorCode ? indicatorByCode.get(indicatorCode) : null;
    return {
      geoId: geo ? geo.geography_id : null,
      indicatorId: indicator ? indicator.indicator_id : null
    };
  }

  function hashFor(geographyId, indicatorId) {
    const geo = geoById.get(geographyId);
    const indicator = indicatorById.get(indicatorId);
    if (!geo) return null;
    return `#map/${geo.geo_code}${indicator ? `?indicator=${indicator.indicator_code}` : ''}`;
  }

  function updateHashInPlace() {
    const hash = hashFor(currentGeographyId, currentIndicatorId);
    if (hash) history.replaceState(null, '', hash);
  }

  function pushHash() {
    const hash = hashFor(currentGeographyId, currentIndicatorId);
    if (hash) history.pushState(null, '', hash);
  }

  function populateIndicatorSelect() {
    const select = $('#geo-indicator');
    if (!select) return;
    select.innerHTML = indicators.map(i => `<option value="${i.indicator_code}">${i.name}</option>`).join('');
  }

  function syncIndicatorSelect() {
    const select = $('#geo-indicator');
    if (select && indicatorById.has(currentIndicatorId)) {
      select.value = indicatorById.get(currentIndicatorId).indicator_code;
    }
  }

  const GEOMETRY_FILE = {
    country: 'country.geojson',
    county: 'counties.geojson',
    constituency: 'constituencies.geojson',
    ward: 'wards.geojson'
  };

  async function ensureGeometry(level) {
    if (geometryCache[level]) return geometryCache[level];
    const data = await fetchJson(`data/geography/geometry/${GEOMETRY_FILE[level]}`);
    geometryCache[level] = data;
    return data;
  }

  function childLevelOf(level) {
    return { country: 'county', county: 'constituency', constituency: 'ward' }[level] || null;
  }

  function filterFeatures(collection, idSet) {
    const ids = new Set(idSet);
    return {
      type: 'FeatureCollection',
      features: (collection?.features || []).filter(f => ids.has(f.properties.geography_id))
    };
  }

  function findFeature(collection, id) {
    return (collection?.features || []).find(f => f.properties.geography_id === id) || null;
  }

  // D3 spherical geometry uses the opposite winding convention from RFC 7946
  // for polygons smaller than a hemisphere. A wrongly wound constituency can
  // therefore be interpreted as "the whole world except this constituency",
  // which produces the giant hatched rectangle seen in the browser. These
  // helpers create render-only copies with D3-compatible winding and preserve
  // the canonical cached coordinates/properties untouched.
  function signedRingArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const a = ring[i], b = ring[i + 1];
      area += (a[0] * b[1]) - (b[0] * a[1]);
    }
    return area / 2;
  }

  function normalizeRingForD3(ring, isExterior) {
    const copy = (ring || []).map(position => Array.isArray(position) ? position.slice() : position);
    if (copy.length < 4) return copy;
    const area = signedRingArea(copy);
    if (area === 0) return copy;
    const isClockwise = area < 0;
    const shouldBeClockwise = isExterior;
    if (isClockwise !== shouldBeClockwise) copy.reverse();
    return copy;
  }

  function normalizeGeometryForD3(geometry) {
    if (!geometry) return geometry;
    if (geometry.type === 'Polygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring, index) => normalizeRingForD3(ring, index === 0))
      };
    }
    if (geometry.type === 'MultiPolygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(polygon =>
          polygon.map((ring, index) => normalizeRingForD3(ring, index === 0))
        )
      };
    }
    if (geometry.type === 'GeometryCollection') {
      return {
        ...geometry,
        geometries: geometry.geometries.map(normalizeGeometryForD3)
      };
    }
    return geometry;
  }

  function normalizeFeatureForD3(feature) {
    if (!feature) return feature;
    return {
      ...feature,
      properties: feature.properties,
      geometry: normalizeGeometryForD3(feature.geometry)
    };
  }

  function obsFor(geographyId, indicatorId) {
    if (!indicatorId) return null;
    const s = seriesByGeoIndicator.get(`${geographyId}|${indicatorId}`);
    if (!s || !s.latest_observation_id) return null;
    const o = observationById.get(s.latest_observation_id);
    return o ? { series: s, obs: o } : null;
  }

  function agencyNameFor(seriesRow) {
    if (!seriesRow) return 'Unknown';
    const dataset = datasets.find(d => d.dataset_id === seriesRow.dataset_id);
    const source = dataset ? sources.find(s => s.source_id === dataset.source_id) : null;
    const agency = source
      ? agencies.find(a => a.agency_id === source.agency_id)
      : agencies.find(a => a.agency_id === seriesRow.agency_id);
    return agency ? (agency.abbreviation || agency.name) : 'Unknown';
  }

  function badgeLabel(letter) {
    return {
      A: 'Official direct',
      B: 'Official derived',
      C: 'Spatially derived',
      D: 'Modelled',
      E: 'External'
    }[letter] || 'Not available';
  }

  function formatVal(value, unitCode) {
    const unit = units.find(u => u.code === unitCode);
    const dp = unit ? unit.decimal_places : 0;
    if (unitCode === 'persons' && value >= 1e6) return `${(value / 1e6).toFixed(2)}m`;
    if (unitCode === 'persons' && value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
    return Number(value).toLocaleString('en-KE', {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp
    });
  }

  async function selectGeography(geographyId, options) {
    const opts = options || {};
    const geo = geoById.get(geographyId);
    if (!geo) return;
    currentGeographyId = geographyId;
    if (opts.indicatorId) currentIndicatorId = opts.indicatorId;
    syncIndicatorSelect();
    await renderCurrent();
    if (opts.pushHash === false) updateHashInPlace();
    else pushHash();
  }

  async function renderCurrent() {
    const myGeneration = ++renderGeneration;
    const geo = geoById.get(currentGeographyId);
    if (!geo) return;
    const indicator = indicatorById.get(currentIndicatorId);
    const unit = indicator ? unitById.get(indicator.unit_id) : null;

    let renderList, contextFeature = null, mode;
    if (geo.level === 'country') {
      mode = 'children';
      renderList = filterFeatures(await ensureGeometry('county'), childrenOf.get(geo.geography_id) || []);
    } else if (geo.level === 'county') {
      mode = 'children';
      renderList = filterFeatures(await ensureGeometry('constituency'), childrenOf.get(geo.geography_id) || []);
      contextFeature = findFeature(await ensureGeometry('county'), geo.geography_id);
    } else if (geo.level === 'constituency') {
      mode = 'children';
      renderList = filterFeatures(await ensureGeometry('ward'), childrenOf.get(geo.geography_id) || []);
      contextFeature = findFeature(await ensureGeometry('constituency'), geo.geography_id);
    } else {
      mode = 'siblings';
      const parent = geoById.get(geo.parent_id);
      renderList = filterFeatures(await ensureGeometry('ward'), childrenOf.get(parent.geography_id) || []);
      contextFeature = findFeature(await ensureGeometry('constituency'), parent.geography_id);
    }

    if (myGeneration !== renderGeneration) return;

    renderBreadcrumb(geo);
    renderHeading(geo, indicator);
    if (indicator) renderSourceNote(indicator);
    drawMap(renderList, contextFeature, indicator, unit, mode, geo);
    renderRankingAndSummary(renderList, indicator, unit, geo);
  }

  function renderBreadcrumb(geo) {
    const chain = [];
    let current = geo;
    while (current) {
      chain.unshift(current);
      current = current.parent_id ? geoById.get(current.parent_id) : null;
    }
    const el = $('#geo-breadcrumb');
    if (!el) return;
    el.innerHTML = chain.map((item, index) =>
      (index > 0 ? '<span aria-hidden="true">›</span>' : '') +
      `<button data-geo-id="${item.geography_id}"${index === chain.length - 1 ? ' disabled aria-current="location"' : ''}>${item.name}</button>`
    ).join('');
    $$('button[data-geo-id]', el).forEach(button => {
      button.onclick = () => {
        if (!button.disabled) selectGeography(button.dataset.geoId);
      };
    });
  }

  function renderHeading(geo, indicator) {
    const heading = $('#geo-heading');
    const eyebrow = $('#geo-eyebrow');
    if (!heading || !eyebrow) return;
    const indName = indicator ? indicator.name.toLowerCase() : 'this indicator';

    if (geo.level === 'country') heading.textContent = `How does ${indName} vary across Kenya?`;
    else if (geo.level === 'county') heading.textContent = `How does ${indName} vary across ${geo.name} County?`;
    else if (geo.level === 'constituency') heading.textContent = `How does ${indName} vary across ${geo.name} Constituency?`;
    else heading.textContent = `${geo.name} Ward`;

    const childLevel = childLevelOf(geo.level);
    if (geo.level === 'ward') {
      const parent = geoById.get(geo.parent_id);
      eyebrow.textContent = `Compared with other wards in ${parent ? parent.name : ''} Constituency`;
    } else {
      const count = (childrenOf.get(geo.geography_id) || []).length;
      const label = { county: 'counties', constituency: 'constituencies', ward: 'wards' }[childLevel] || 'places';
      const pair = indicator ? obsFor(geo.geography_id, indicator.indicator_id) : null;
      eyebrow.textContent = `${count} ${label}${pair ? ' · ' + pair.obs.period_label : ''}`;
    }
  }

  function renderSourceNote(indicator) {
    const el = $('#geo-source-note');
    if (!el) return;
    const s = series.find(sr => sr.indicator_id === indicator.indicator_id);
    if (!s) {
      el.textContent = '';
      return;
    }
    const latest = s.latest_observation_id ? observationById.get(s.latest_observation_id) : null;
    el.textContent = latest
      ? `Source: ${agencyNameFor(s)} · ${latest.badge} — ${badgeLabel(latest.badge)}`
      : `Source: ${agencyNameFor(s)}`;
  }

  function ensureDefs() {
    const defs = svg.append('defs');
    const pattern = defs.append('pattern')
      .attr('id', 'geo-no-data-pattern')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(45)')
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#e7e9e6');
    pattern.append('line')
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#c7cbc6').attr('stroke-width', 2);
  }

  const CHOROPLETH_RANGE = ['#eaf2ec', '#c3ddce', '#8fc0a7', '#4f9575', '#123c32'];

  function buildColorScale(values) {
    if (!values.length) return null;
    const unique = [...new Set(values)];
    if (unique.length === 1) return () => CHOROPLETH_RANGE[2];
    return d3.scaleQuantile().domain(values).range(CHOROPLETH_RANGE);
  }

  function setHover(geographyId) {
    $$('.geo-feature').forEach(el => {
      el.classList.toggle('hovered-linked', geographyId !== null && el.getAttribute('data-geo-id') === geographyId);
    });
    $$('.geo-ranking-list button').forEach(el => {
      el.classList.toggle('hovered', geographyId !== null && el.dataset.geoId === geographyId);
    });
  }

  function drawMap(renderList, contextFeature, indicator, unit, mode, geo) {
    svg.selectAll('*').remove();
    ensureDefs();

    // Normalize only the render copies. This is the critical winding fix:
    // neither renderList, contextFeature nor geometryCache is modified.
    const features = renderList.features.map(normalizeFeatureForD3);
    const normalizedContext = contextFeature ? normalizeFeatureForD3(contextFeature) : null;
    if (!features.length) return;

    const fitCollection = {
      type: 'FeatureCollection',
      features: normalizedContext ? [...features, normalizedContext] : features
    };
    const projection = d3.geoMercator().fitExtent(
      [[PAD, PAD], [VIEW_W - PAD, VIEW_H - PAD]],
      fitCollection
    );
    const path = d3.geoPath(projection);

    if (normalizedContext) {
      svg.append('path')
        .datum(normalizedContext)
        .attr('class', 'geo-feature context')
        .attr('d', path);
    }

    const values = [];
    for (const feature of features) {
      const pair = indicator ? obsFor(feature.properties.geography_id, indicator.indicator_id) : null;
      if (pair) values.push(pair.obs.value);
    }
    const colorScale = buildColorScale(values);
    const selectedId = mode === 'siblings' ? geo.geography_id : null;

    const layer = svg.append('g');
    layer.selectAll('path.geo-feature-item')
      .data(features)
      .join('path')
      .attr('class', feature => {
        const gid = feature.properties.geography_id;
        const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
        let className = 'geo-feature';
        if (!pair) className += ' no-data';
        if (mode === 'siblings') className += gid === selectedId ? ' selected' : ' sibling-muted';
        return className;
      })
      .attr('data-geo-id', feature => feature.properties.geography_id)
      .attr('fill', feature => {
        const pair = indicator ? obsFor(feature.properties.geography_id, indicator.indicator_id) : null;
        return pair && colorScale ? colorScale(pair.obs.value) : null;
      })
      .attr('d', path)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', feature => {
        const gid = feature.properties.geography_id;
        const place = geoById.get(gid);
        const placeName = place ? place.name : feature.properties.name;
        const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
        return pair
          ? `${placeName} — ${indicator.name} ${formatVal(pair.obs.value, unit ? unit.code : '')}`
          : `${placeName} — no data`;
      })
      .on('mouseenter', (event, feature) => {
        setHover(feature.properties.geography_id);
        showTooltip(event, feature, indicator, unit);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', () => {
        setHover(null);
        hideTooltip();
      })
      .on('click', (event, feature) => selectGeography(feature.properties.geography_id))
      .on('keydown', (event, feature) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectGeography(feature.properties.geography_id);
        }
      });

    renderLegend(colorScale, values);
  }

  function renderLegend(scale, values) {
    const el = $('#geo-legend');
    if (!el) return;
    if (!values.length || !scale) {
      el.innerHTML = '<div class="geo-legend-item"><i style="background:#e7e9e6;background-image:repeating-linear-gradient(45deg,#e7e9e6,#e7e9e6 2px,#c7cbc6 2px,#c7cbc6 4px)"></i><span>No data available for this view</span></div>';
      return;
    }

    const min = Math.min(...values), max = Math.max(...values);
    const quantiles = scale.quantiles ? scale.quantiles() : [];
    const bounds = [min, ...quantiles, max];
    let html = '';
    for (let i = 0; i < CHOROPLETH_RANGE.length; i += 1) {
      if (bounds[i] === undefined || bounds[i + 1] === undefined) continue;
      html += `<div class="geo-legend-item"><i style="background:${CHOROPLETH_RANGE[i]}"></i><span>${formatVal(bounds[i], '')}–${formatVal(bounds[i + 1], '')}</span></div>`;
    }
    html += '<div class="geo-legend-item"><i style="background:#e7e9e6;background-image:repeating-linear-gradient(45deg,#e7e9e6,#e7e9e6 2px,#c7cbc6 2px,#c7cbc6 4px)"></i><span>No data</span></div>';
    el.innerHTML = html;
  }

  function showTooltip(event, feature, indicator, unit) {
    const tip = $('#geo-tooltip');
    if (!tip) return;
    const gid = feature.properties.geography_id;
    const place = geoById.get(gid);
    const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
    tip.innerHTML = `<strong>${place ? place.name : feature.properties.name}</strong>` +
      (indicator ? `${indicator.name}<br>` : '') +
      (pair
        ? `${formatVal(pair.obs.value, unit ? unit.code : '')} · ${pair.obs.period_label}<span class="geo-tooltip-badge">${pair.obs.badge} · ${agencyNameFor(pair.series)}</span>`
        : 'Data not currently available');
    tip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tip = $('#geo-tooltip');
    const wrap = $('.geo-map-wrap');
    if (!tip || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    tip.style.left = `${event.clientX - rect.left}px`;
    tip.style.top = `${event.clientY - rect.top}px`;
  }

  function hideTooltip() {
    const tip = $('#geo-tooltip');
    if (tip) tip.hidden = true;
  }

  function renderRankingAndSummary(renderList, indicator, unit, geo) {
    const listEl = $('#geo-ranking-list');
    const titleEl = $('#geo-ranking-title');
    const noteEl = $('#geo-ranking-note');
    if (!listEl || !titleEl || !noteEl) return;

    const childLevel = childLevelOf(geo.level) || 'ward';
    const label = { county: 'Counties', constituency: 'Constituencies', ward: 'Wards' }[childLevel] || 'Places';
    titleEl.textContent = `${label} (${renderList.features.length})`;

    const rows = renderList.features.map(feature => {
      const gid = feature.properties.geography_id;
      const place = geoById.get(gid);
      const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
      return { gid, name: place ? place.name : feature.properties.name, pair };
    });

    const withData = rows.filter(r => r.pair).sort((a, b) => b.pair.obs.value - a.pair.obs.value);
    const withoutData = rows.filter(r => !r.pair).sort((a, b) => a.name.localeCompare(b.name));

    const periods = new Set(withData.map(r => r.pair.obs.period_label));
    noteEl.hidden = periods.size <= 1;
    if (periods.size > 1) {
      noteEl.textContent = "Mixed reference periods — each figure is that area's latest available observation, not necessarily the same date.";
    }

    listEl.innerHTML = withData.map((row, index) =>
      `<li><button data-geo-id="${row.gid}" role="option"><span class="geo-rank-num">${index + 1}</span><span>${row.name}</span><span class="geo-rank-value">${formatVal(row.pair.obs.value, unit ? unit.code : '')}</span></button></li>`
    ).join('') + withoutData.map(row =>
      `<li><button data-geo-id="${row.gid}" role="option"><span class="geo-rank-num">—</span><span>${row.name}</span><span class="geo-rank-value geo-rank-nodata">No data</span></button></li>`
    ).join('');

    $$('button[data-geo-id]', listEl).forEach(button => {
      button.onclick = () => selectGeography(button.dataset.geoId);
      button.onmouseenter = () => setHover(button.dataset.geoId);
      button.onmouseleave = () => setHover(null);
      button.onfocus = () => setHover(button.dataset.geoId);
      button.onblur = () => setHover(null);
    });

    renderSummary(geo, indicator, unit);
  }

  function renderSummary(geo, indicator, unit) {
    const el = $('#geo-selected-summary');
    if (!el) return;
    if (!geo.parent_id || !indicator) {
      el.hidden = true;
      return;
    }

    const pair = obsFor(geo.geography_id, indicator.indicator_id);
    const siblingIds = childrenOf.get(geo.parent_id) || [];
    const siblingVals = siblingIds
      .map(id => {
        const siblingPair = obsFor(id, indicator.indicator_id);
        return siblingPair ? { id, value: siblingPair.obs.value } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value);
    const rank = pair ? siblingVals.findIndex(s => s.id === geo.geography_id) + 1 : null;

    let shareHtml = '';
    if (pair && unit && unit.dimension === 'count' && siblingVals.length === siblingIds.length) {
      const total = siblingVals.reduce((sum, sibling) => sum + sibling.value, 0);
      const parent = geoById.get(geo.parent_id);
      if (total > 0) {
        shareHtml = `<div><dt>Share of ${parent.name}</dt><dd>${((pair.obs.value / total) * 100).toFixed(1)}%</dd></div>`;
      }
    }

    let profileLink = '';
    if (geo.level === 'county' && window.KDASelectCountyProfile) {
      profileLink = '<div class="geo-summary-source"><button class="text-link" id="geo-view-profile" style="padding:0">View full county profile →</button></div>';
    }

    el.hidden = false;
    el.innerHTML = `<h4>${geo.name}</h4>` +
      (pair
        ? `<div><dt>${indicator.name}</dt><dd>${formatVal(pair.obs.value, unit ? unit.code : '')}</dd></div>`
        : `<div><dt>${indicator.name}</dt><dd>—</dd></div>`) +
      (rank ? `<div><dt>Rank</dt><dd>#${rank} of ${siblingVals.length}</dd></div>` : '') +
      shareHtml +
      (pair
        ? `<div class="geo-summary-source">${pair.obs.period_label} · ${agencyNameFor(pair.series)} · <b>${pair.obs.badge}</b> — ${badgeLabel(pair.obs.badge)}</div>`
        : `<div class="geo-summary-source">Data not currently available for ${indicator.name.toLowerCase()} at ${geo.level} level.</div>`) +
      profileLink;

    const profileButton = $('#geo-view-profile', el);
    if (profileButton) profileButton.onclick = () => window.KDASelectCountyProfile(geo.name);
  }

  boot();
})();
