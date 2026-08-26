/* Kenya Data Atlas — Geo Explorer
 *
 * A KKMNOW-style statistical choropleth built on D3 v7 and the Atlas's own
 * real, validated boundary geometry (data/geography/geometry/*.geojson,
 * boundary_version 2012-01). Replaces the old 56-cell schematic grid
 * entirely — every polygon here is a real ward/constituency/county/country
 * boundary from the same dissolved-from-wards geometry hardened during the
 * Phase 1 geometry audit.
 *
 * Hierarchy: Kenya -> County -> Constituency -> Ward. One rendering function
 * drives every level; there is no per-county hardcoded logic anywhere here.
 *
 * Data-integrity rule enforced throughout: a geography with no observation
 * for the selected indicator is rendered as "no data" — it NEVER inherits
 * its parent's value. See obsFor(), which looks up only the exact
 * (geography_id, indicator_id) pair and returns null on any miss.
 */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  const svg = d3.select('#geo-svg');
  const VIEW_W = 800, VIEW_H = 780, PAD = 18;

  // ---------------------------------------------------------------- state
  let geographies = [], indicators = [], series = [], observations = [], units = [];
  let agencies = [], sources = [], datasets = [];
  let geoById = new Map();
  const childrenOf = new Map();
  let indicatorById = new Map(), indicatorByCode = new Map();
  let unitById = new Map();
  let observationById = new Map();
  const seriesByGeoIndicator = new Map(); // `${geography_id}|${indicator_id}` -> best series row

  const geometryCache = { country: null, county: null, constituency: null, ward: null };

  let currentGeographyId = null;
  let currentIndicatorId = null;

  async function fetchJson(url) {
    try { const r = await fetch(url); return r.ok ? await r.json() : null; }
    catch { return null; }
  }

  // ------------------------------------------------------------------ boot
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
      if (!existing || (s.observation_count || 0) > (existing.observation_count || 0)) seriesByGeoIndicator.set(key, s);
    }

    populateIndicatorSelect();

    const country = geographies.find(g => g.level === 'country');
    const defaultIndicator = indicatorByCode.get('IND-POPULATION') || indicators[0];
    currentIndicatorId = defaultIndicator ? defaultIndicator.indicator_id : null;

    const initial = parseHash();
    const startGeoId = initial.geoId || (country && country.geography_id);
    if (initial.indicatorId) currentIndicatorId = initial.indicatorId;
    if ($('#geo-indicator') && indicatorById.has(currentIndicatorId)) {
      $('#geo-indicator').value = indicatorById.get(currentIndicatorId).indicator_code;
    }

    $('#geo-indicator').onchange = () => {
      const ind = indicatorByCode.get($('#geo-indicator').value);
      if (ind) currentIndicatorId = ind.indicator_id;
      renderCurrent();
      updateHashInPlace();
    };

    window.addEventListener('hashchange', () => {
      const h = parseHash();
      if (h.geoId && h.geoId !== currentGeographyId) selectGeography(h.geoId, { pushHash: false, indicatorId: h.indicatorId });
    });

    if (startGeoId) await selectGeography(startGeoId, { pushHash: false });

    // The one shared geography-selection function. Search, map clicks and
    // ranking clicks all call this — there is no second implementation.
    window.KDAGeo = { selectGeography, ready: true };
  }

  // --------------------------------------------------------------- hashing
  function parseHash() {
    const m = location.hash.match(/^#map\/([^?]+)(?:\?indicator=(.+))?$/);
    if (!m) return {};
    const geoCode = decodeURIComponent(m[1]);
    const indicatorCode = m[2] ? decodeURIComponent(m[2]) : null;
    const geo = geographies.find(g => g.geo_code === geoCode);
    const ind = indicatorCode ? indicatorByCode.get(indicatorCode) : null;
    return { geoId: geo ? geo.geography_id : null, indicatorId: ind ? ind.indicator_id : null };
  }
  function hashFor(geographyId, indicatorId) {
    const geo = geoById.get(geographyId);
    const ind = indicatorById.get(indicatorId);
    if (!geo) return null;
    return `#map/${geo.geo_code}${ind ? `?indicator=${ind.indicator_code}` : ''}`;
  }
  function updateHashInPlace() {
    const h = hashFor(currentGeographyId, currentIndicatorId);
    if (h) history.replaceState(null, '', h);
  }
  function pushHash() {
    const h = hashFor(currentGeographyId, currentIndicatorId);
    if (h) history.pushState(null, '', h);
  }

  function populateIndicatorSelect() {
    $('#geo-indicator').innerHTML = indicators.map(i => `<option value="${i.indicator_code}">${i.name}</option>`).join('');
  }

  // ------------------------------------------------------- geometry loading
  // Lazy by design: county geometry loads at boot (it's the default view);
  // constituency geometry loads only once a county is first opened; ward
  // geometry (the 43MB file) loads only once a constituency is first opened.
  // Each is cached in memory after first load and never re-fetched.
  const GEOMETRY_FILE = { country: 'country.geojson', county: 'counties.geojson', constituency: 'constituencies.geojson', ward: 'wards.geojson' };
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
    const set = new Set(idSet);
    return { type: 'FeatureCollection', features: (collection?.features || []).filter(f => set.has(f.properties.geography_id)) };
  }
  function findFeature(collection, id) {
    return (collection?.features || []).find(f => f.properties.geography_id === id) || null;
  }

  // -------------------------------------------------------- observation join
  // The ONLY place geometry and statistics meet. Looks up the exact
  // (geography_id, indicator_id) pair — never a parent's value, never an
  // assumption from a name match.
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
    const agency = source ? agencies.find(a => a.agency_id === source.agency_id) : agencies.find(a => a.agency_id === seriesRow.agency_id);
    return agency ? (agency.abbreviation || agency.name) : 'Unknown';
  }
  function badgeLabel(letter) {
    return { A: 'Official direct', B: 'Official derived', C: 'Spatially derived', D: 'Modelled', E: 'External' }[letter] || 'Not available';
  }
  function formatVal(value, unitCode) {
    const unit = units.find(u => u.code === unitCode);
    const dp = unit ? unit.decimal_places : 0;
    if (unitCode === 'persons' && value >= 1e6) return `${(value / 1e6).toFixed(2)}m`;
    if (unitCode === 'persons' && value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
    return Number(value).toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  // --------------------------------------------------------- core selection
  async function selectGeography(geographyId, opts) {
    opts = opts || {};
    const geo = geoById.get(geographyId);
    if (!geo) return;
    currentGeographyId = geographyId;
    if (opts.indicatorId) currentIndicatorId = opts.indicatorId;
    if ($('#geo-indicator') && indicatorById.has(currentIndicatorId)) {
      $('#geo-indicator').value = indicatorById.get(currentIndicatorId).indicator_code;
    }
    await renderCurrent();
    if (opts.pushHash === false) updateHashInPlace(); else pushHash();
  }

  let renderGeneration = 0;

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
      // ward: terminal level. Show siblings within the parent constituency,
      // with the selected ward strongly highlighted and the rest muted —
      // never a single polygon floating alone (spec Level 4).
      mode = 'siblings';
      const parent = geoById.get(geo.parent_id);
      renderList = filterFeatures(await ensureGeometry('ward'), childrenOf.get(parent.geography_id) || []);
      contextFeature = findFeature(await ensureGeometry('constituency'), parent.geography_id);
    }

    // Geometry loading is async and can take real time (wards.geojson is
    // ~43MB). If the user has since navigated elsewhere, a slower-but-older
    // render must never overwrite a faster-but-newer one — discard silently
    // rather than flashing stale content or corrupting the displayed state.
    if (myGeneration !== renderGeneration) return;

    renderBreadcrumb(geo);
    renderHeading(geo, indicator);
    if (indicator) renderSourceNote(indicator);
    drawMap(renderList, contextFeature, indicator, unit, mode, geo);
    renderRankingAndSummary(renderList, indicator, unit, geo);
  }

  // ------------------------------------------------------------ breadcrumb
  function renderBreadcrumb(geo) {
    const chain = [];
    let g = geo;
    while (g) { chain.unshift(g); g = g.parent_id ? geoById.get(g.parent_id) : null; }
    const el = $('#geo-breadcrumb');
    el.innerHTML = chain.map((c, i) => (i > 0 ? '<span aria-hidden="true">›</span>' : '') +
      `<button data-geo-id="${c.geography_id}"${i === chain.length - 1 ? ' disabled aria-current="location"' : ''}>${c.name}</button>`).join('');
    $$('button[data-geo-id]', el).forEach(b => b.onclick = () => { if (!b.disabled) selectGeography(b.dataset.geoId); });
  }

  // -------------------------------------------------------------- heading
  function renderHeading(geo, indicator) {
    const heading = $('#geo-heading'), eyebrow = $('#geo-eyebrow');
    const indName = indicator ? indicator.name.toLowerCase() : 'this indicator';
    if (geo.level === 'country') heading.textContent = `How does ${indName} vary across Kenya?`;
    else if (geo.level === 'county') heading.textContent = `How does ${indName} vary across ${geo.name} County?`;
    else if (geo.level === 'constituency') heading.textContent = `How does ${indName} vary across ${geo.name} Constituency?`;
    else heading.textContent = `${geo.name} Ward`;

    const childLvl = childLevelOf(geo.level);
    if (geo.level === 'ward') {
      const parent = geoById.get(geo.parent_id);
      eyebrow.textContent = `Compared with other wards in ${parent ? parent.name : ''} Constituency`;
    } else {
      const count = (childrenOf.get(geo.geography_id) || []).length;
      const label = { county: 'counties', constituency: 'constituencies', ward: 'wards' }[childLvl] || 'places';
      const pair = indicator ? obsFor(geo.geography_id, indicator.indicator_id) : null;
      eyebrow.textContent = `${count} ${label}${pair ? ' · ' + pair.obs.period_label : ''}`;
    }
  }
  function renderSourceNote(indicator) {
    const el = $('#geo-source-note');
    const s = series.find(sr => sr.indicator_id === indicator.indicator_id);
    if (!s) { el.textContent = ''; return; }
    const latest = s.latest_observation_id ? observationById.get(s.latest_observation_id) : null;
    el.textContent = latest ? `Source: ${agencyNameFor(s)} · ${latest.badge} — ${badgeLabel(latest.badge)}` : `Source: ${agencyNameFor(s)}`;
  }

  // ------------------------------------------------------------- the map
  function ensureDefs() {
    const defs = svg.append('defs');
    const pattern = defs.append('pattern').attr('id', 'geo-no-data-pattern')
      .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)').attr('patternUnits', 'userSpaceOnUse');
    pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#e7e9e6');
    pattern.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', '#c7cbc6').attr('stroke-width', 2);
  }

  const CHOROPLETH_RANGE = ['#eaf2ec', '#c3ddce', '#8fc0a7', '#4f9575', '#123c32'];
  function buildColorScale(values) {
    if (!values.length) return null;
    const uniq = [...new Set(values)];
    if (uniq.length === 1) return () => CHOROPLETH_RANGE[2];
    return d3.scaleQuantile().domain(values).range(CHOROPLETH_RANGE);
  }

  let hoveredId = null;
  function setHover(gid) {
    hoveredId = gid;
    $$('.geo-feature').forEach(el => el.classList.toggle('hovered-linked', gid !== null && el.getAttribute('data-geo-id') === gid));
    $$('.geo-ranking-list button').forEach(el => el.classList.toggle('hovered', gid !== null && el.dataset.geoId === gid));
  }

  function drawMap(renderList, contextFeature, indicator, unit, mode, geo) {
    svg.selectAll('*').remove();
    ensureDefs();

    const features = renderList.features;
    if (!features.length) return;
    const fitCollection = { type: 'FeatureCollection', features: contextFeature ? [...features, contextFeature] : features };
    const projection = d3.geoMercator().fitExtent([[PAD, PAD], [VIEW_W - PAD, VIEW_H - PAD]], fitCollection);
    const path = d3.geoPath(projection);

    if (contextFeature) {
      svg.append('path').datum(contextFeature).attr('class', 'geo-feature context').attr('d', path);
    }

    const values = [];
    for (const f of features) {
      const pair = indicator ? obsFor(f.properties.geography_id, indicator.indicator_id) : null;
      if (pair) values.push(pair.obs.value);
    }
    const colorScale = buildColorScale(values);
    const selectedId = mode === 'siblings' ? geo.geography_id : null;

    const layer = svg.append('g');
    layer.selectAll('path.geo-feature-item')
      .data(features)
      .join('path')
      .attr('class', d => {
        const gid = d.properties.geography_id;
        const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
        let cls = 'geo-feature';
        if (!pair) cls += ' no-data';
        if (mode === 'siblings') cls += (gid === selectedId ? ' selected' : ' sibling-muted');
        return cls;
      })
      .attr('data-geo-id', d => d.properties.geography_id)
      .attr('fill', d => {
        const pair = indicator ? obsFor(d.properties.geography_id, indicator.indicator_id) : null;
        return pair && colorScale ? colorScale(pair.obs.value) : null;
      })
      .attr('d', path)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', d => {
        const gid = d.properties.geography_id;
        const g = geoById.get(gid);
        const gname = g ? g.name : d.properties.name;
        const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
        return pair ? `${gname} — ${indicator.name} ${formatVal(pair.obs.value, unit ? unit.code : '')}` : `${gname} — no data`;
      })
      .on('mouseenter', function (event, d) { setHover(d.properties.geography_id); showTooltip(event, d, indicator, unit); })
      .on('mousemove', moveTooltip)
      .on('mouseleave', function () { setHover(null); hideTooltip(); })
      .on('click', (event, d) => selectGeography(d.properties.geography_id))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectGeography(d.properties.geography_id); }
      });

    renderLegend(colorScale, values);
  }

  function renderLegend(scale, values) {
    const el = $('#geo-legend');
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

  function showTooltip(event, d, indicator, unit) {
    const tip = $('#geo-tooltip');
    const gid = d.properties.geography_id;
    const geo = geoById.get(gid);
    const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
    tip.innerHTML = `<strong>${geo ? geo.name : d.properties.name}</strong>` +
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
    const rect = wrap.getBoundingClientRect();
    tip.style.left = `${event.clientX - rect.left}px`;
    tip.style.top = `${event.clientY - rect.top}px`;
  }
  function hideTooltip() { $('#geo-tooltip').hidden = true; }

  // -------------------------------------------------------------- ranking
  function renderRankingAndSummary(renderList, indicator, unit, geo) {
    const listEl = $('#geo-ranking-list'), titleEl = $('#geo-ranking-title'), noteEl = $('#geo-ranking-note');
    const childLvl = childLevelOf(geo.level) || 'ward';
    const label = { county: 'Counties', constituency: 'Constituencies', ward: 'Wards' }[childLvl] || 'Places';
    titleEl.textContent = `${label} (${renderList.features.length})`;

    const rows = renderList.features.map(f => {
      const gid = f.properties.geography_id;
      const g = geoById.get(gid);
      const pair = indicator ? obsFor(gid, indicator.indicator_id) : null;
      return { gid, name: g ? g.name : f.properties.name, pair };
    });
    const withData = rows.filter(r => r.pair).sort((a, b) => b.pair.obs.value - a.pair.obs.value);
    const withoutData = rows.filter(r => !r.pair).sort((a, b) => a.name.localeCompare(b.name));

    // Comparability check (spec: never silently compare incompatible periods).
    const periods = new Set(withData.map(r => r.pair.obs.period_label));
    noteEl.hidden = periods.size <= 1;
    if (periods.size > 1) noteEl.textContent = "Mixed reference periods — each figure is that area's latest available observation, not necessarily the same date.";

    listEl.innerHTML = withData.map((r, i) =>
      `<li><button data-geo-id="${r.gid}" role="option"><span class="geo-rank-num">${i + 1}</span><span>${r.name}</span><span class="geo-rank-value">${formatVal(r.pair.obs.value, unit ? unit.code : '')}</span></button></li>`
    ).join('') + withoutData.map(r =>
      `<li><button data-geo-id="${r.gid}" role="option"><span class="geo-rank-num">—</span><span>${r.name}</span><span class="geo-rank-value geo-rank-nodata">No data</span></button></li>`
    ).join('');

    $$('button[data-geo-id]', listEl).forEach(b => {
      b.onclick = () => selectGeography(b.dataset.geoId);
      b.onmouseenter = () => setHover(b.dataset.geoId);
      b.onmouseleave = () => setHover(null);
      b.onfocus = () => setHover(b.dataset.geoId);
      b.onblur = () => setHover(null);
    });

    renderSummary(geo, indicator, unit);
  }

  // --------------------------------------------------------------- summary
  function renderSummary(geo, indicator, unit) {
    const el = $('#geo-selected-summary');
    if (!geo.parent_id || !indicator) { el.hidden = true; return; }
    const pair = obsFor(geo.geography_id, indicator.indicator_id);
    const siblingIds = childrenOf.get(geo.parent_id) || [];
    const siblingVals = siblingIds
      .map(id => { const p = obsFor(id, indicator.indicator_id); return p ? { id, value: p.obs.value } : null; })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value);
    const rank = pair ? siblingVals.findIndex(s => s.id === geo.geography_id) + 1 : null;

    let shareHtml = '';
    if (pair && unit && unit.dimension === 'count') {
      const total = siblingVals.reduce((a, b) => a + b.value, 0);
      const parent = geoById.get(geo.parent_id);
      if (total > 0) shareHtml = `<div><dt>Share of ${parent.name}</dt><dd>${((pair.obs.value / total) * 100).toFixed(1)}%</dd></div>`;
    }

    let profileLink = '';
    if (geo.level === 'county' && window.KDASelectCountyProfile) profileLink = `<div class="geo-summary-source"><button class="text-link" id="geo-view-profile" style="padding:0">View full county profile →</button></div>`;

    el.hidden = false;
    el.innerHTML = `<h4>${geo.name}</h4>` +
      (pair ? `<div><dt>${indicator.name}</dt><dd>${formatVal(pair.obs.value, unit ? unit.code : '')}</dd></div>` : `<div><dt>${indicator.name}</dt><dd>—</dd></div>`) +
      (rank ? `<div><dt>Rank</dt><dd>#${rank} of ${siblingVals.length}</dd></div>` : '') +
      shareHtml +
      (pair
        ? `<div class="geo-summary-source">${pair.obs.period_label} · ${agencyNameFor(pair.series)} · <b>${pair.obs.badge}</b> — ${badgeLabel(pair.obs.badge)}</div>`
        : `<div class="geo-summary-source">Data not currently available for ${indicator.name.toLowerCase()} at ${geo.level} level.</div>`) +
      profileLink;

    const profileBtn = $('#geo-view-profile', el);
    if (profileBtn) profileBtn.onclick = () => window.KDASelectCountyProfile(geo.name);
  }

  boot();
})();
