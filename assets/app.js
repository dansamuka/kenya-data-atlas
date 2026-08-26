/* Kenya Data Atlas — static MVP interactions.
 *
 * As of this build, six real indicators (population, inflation, USD/KES, the
 * Central Bank Rate, the 91-day Treasury bill, registered voters) and one
 * Atlas-derived indicator with full 47-county coverage (land area) are
 * rendered directly from data/indicators/registry/*.json — not from a
 * hardcoded demo array. Anything not yet backed by real, published data is
 * shown as "—  Data not currently available" rather than invented, per
 * docs/methodology/indicators.md and the product spec's own missing-data
 * principle (§3.3).
 */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let timer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('show'), 3200);
}
$$('[data-toast]').forEach(b => b.onclick = () => toast(b.dataset.toast));

function download(name, rows) {
  const blob = new Blob([rows], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// A-E badges render the same way everywhere a value's provenance is shown.
// "Demo" and "N/A" remain distinct classes — never merged with a real badge
// letter — so a real A and an unlabelled demo value can never look alike.
function badgeHtml(letter) {
  if (letter === 'Demo') return '<span class="badge demo">Demo</span>';
  if (!letter) return '<span class="badge missing">N/A</span>';
  return `<span class="badge ${letter.toLowerCase()}">${letter}</span>`;
}
function badgeLabel(letter) {
  return { A: 'Official direct', B: 'Official derived', C: 'Spatially derived', D: 'Modelled', E: 'External' }[letter] ?? 'Not available';
}

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- menu / nav
const menu = $('.menu-button');
menu.onclick = () => {
  const n = $('#main-nav');
  const open = n.classList.toggle('open');
  menu.setAttribute('aria-expanded', open);
};
$('#main-nav').onclick = () => { $('#main-nav').classList.remove('open'); menu.setAttribute('aria-expanded', false); };

// -------------------------------------------------------------------- boot
(async function main() {
  try {
  const [geographies, indicators, series, observations, units, agencies, sources, datasets] = await Promise.all([
    fetchJson('data/geography/registry/geographies.json'),
    fetchJson('data/indicators/registry/indicators.json'),
    fetchJson('data/indicators/registry/series.json'),
    fetchJson('data/indicators/registry/observations.json'),
    fetchJson('data/indicators/registry/units.json'),
    fetchJson('data/catalogue/registry/agencies.json'),
    fetchJson('data/catalogue/registry/sources.json'),
    fetchJson('data/catalogue/registry/datasets.json')
  ]);

  // The real registry may not be present (e.g. a fork that hasn't run
  // `npm run build:data` yet). Degrade to the demo-only sections rather than
  // throwing — but never blend a missing real value with an invented one.
  const haveIndicators = Boolean(indicators && series && observations && units);

  const geoById = new Map((geographies ?? []).map(g => [g.geography_id, g]));
  const unitById = new Map((units ?? []).map(u => [u.unit_id, u]));
  const indicatorByCode = new Map((indicators ?? []).map(i => [i.indicator_code, i]));
  const seriesById = new Map((series ?? []).map(s => [s.series_id, s]));
  const seriesByCode = new Map((series ?? []).map(s => [s.series_code, s]));
  const observationById = new Map((observations ?? []).map(o => [o.observation_id, o]));
  const sourceById = new Map((sources ?? []).map(s => [s.source_id, s]));
  const agencyById = new Map((agencies ?? []).map(a => [a.agency_id, a]));

  function agencyNameFor(seriesRow) {
    const agency = agencyById.get(seriesRow?.agency_id);
    return agency?.abbreviation || agency?.name || 'Unknown source';
  }
  function latestObs(seriesCode) {
    const s = seriesByCode.get(seriesCode);
    if (!s || !s.latest_observation_id) return null;
    return { series: s, obs: observationById.get(s.latest_observation_id) };
  }
  function allObs(seriesCode) {
    const s = seriesByCode.get(seriesCode);
    if (!s) return [];
    return (observations ?? []).filter(o => o.series_id === s.series_id).sort((a, b) => a.period_start.localeCompare(b.period_start));
  }
  function formatValue(value, unitCode, decimals) {
    const unit = [...unitById.values()].find(u => u.code === unitCode);
    const dp = decimals ?? unit?.decimal_places ?? 0;
    if (unitCode === 'persons' && value >= 1e6) return `${(value / 1e6).toFixed(2)}m`;
    if (unitCode === 'persons' && value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
    return value.toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  // ------------------------------------------------------------ Kenya Pulse
  // Six real cards. Nothing fabricated stands next to them: indicators the
  // Atlas has not yet cleared for publication simply are not shown here,
  // rather than shown with an invented number (spec §3.3, §9).
  const pulseCards = [
    { code: 'KDA-CPI-YOY-KEN', label: 'Consumer price inflation', unit: 'percent', suffix: '%' },
    { code: 'KDA-USDKES-KEN', label: 'USD / KES', unit: 'kes_per_usd', suffix: '' },
    { code: 'KDA-CBR-KEN', label: 'Central Bank Rate', unit: 'percent', suffix: '%' },
    { code: 'KDA-TBILL91-KEN', label: '91-day Treasury bill', unit: 'percent', suffix: '%' },
    { code: 'KDA-POP-TOTAL-KEN', label: 'Population', unit: 'persons', suffix: '' },
    { code: 'KDA-VOTERS-KEN', label: 'Registered voters', unit: 'persons', suffix: '' }
  ];

  if (haveIndicators) {
    $('#pulse-grid').innerHTML = pulseCards.map(card => {
      const latest = latestObs(card.code);
      if (!latest) return '';
      const { series: s, obs } = latest;
      const history = allObs(card.code);
      const previous = history.length > 1 ? history[history.length - 2] : null;
      const delta = previous ? obs.value - previous.value : null;
      const deltaText = delta === null ? 'Single observation on file' : `${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} ${Math.abs(delta).toLocaleString('en-KE', { maximumFractionDigits: 3 })}${card.suffix} from ${previous.period_label}`;
      return `<article class="metric-card">${badgeHtml(obs.badge)}<span class="label">${card.label}</span><strong>${formatValue(obs.value, card.unit)}${card.suffix}</strong><span class="delta">${deltaText}</span><small>${obs.period_label} · ${agencyNameFor(s)}</small></article>`;
    }).join('');
  }

  // Hero pulse card: inflation, with a real (short, honest) sparkline.
  const inflation = latestObs('KDA-CPI-YOY-KEN');
  if (inflation) {
    const { obs } = inflation;
    const history = allObs('KDA-CPI-YOY-KEN');
    const previous = history.length > 1 ? history[history.length - 2] : null;
    $('.pulse-card .metric-label').textContent = 'Consumer price inflation';
    $('.pulse-card .feature-value').innerHTML = `${obs.value}<span>%</span>`;
    $('.pulse-card .trend').innerHTML = previous
      ? `<span>${obs.value > previous.value ? '↑' : '↓'} ${Math.abs(obs.value - previous.value).toFixed(1)} pp</span> from ${previous.period_label}`
      : '<span>Single observation on file</span>';
    if (history.length >= 2) {
      const max = Math.max(...history.map(o => o.value));
      $('.sparkline').innerHTML = history.map(o => `<i style="height:${Math.max(18, (o.value / max) * 100)}%" title="${o.period_label}: ${o.value}%"></i>`).join('');
      $('.sparkline').setAttribute('aria-label', `Real inflation observations: ${history.map(o => `${o.period_label} ${o.value}%`).join(', ')}`);
    }
    const source = agencyNameFor(inflation.series);
    $('.pulse-card dl').innerHTML = `<div><dt>Reference period</dt><dd>${obs.period_label}</dd></div><div><dt>Source</dt><dd>${source} · ${badgeLabel(obs.badge)}</dd></div>`;
  }

  // --------------------------------------------------------- County profile
  // A single profile section, re-rendered for whichever county is selected.
  // Coverage varies by indicator: population and land area are real for all
  // 47 counties; fuel price is real for exactly 2 (Nairobi, Mombasa); voters
  // and GCP are not yet available for any county and are always shown as
  // honest gaps rather than filled in with Nakuru's numbers or anything else.
  const allCounties = (geographies ?? [])
    .filter(g => g.level === 'county')
    .map(g => g.name)
    .sort((a, b) => a.localeCompare(b));

  const countyPicker = $('#county-picker');
  if (countyPicker) countyPicker.innerHTML = allCounties.map(name => `<option${name === 'Nakuru' ? ' selected' : ''}>${name}</option>`).join('');

  function countyGeo(name) {
    return (geographies ?? []).find(g => g.level === 'county' && g.name === name);
  }
  function countySeriesCode(indicatorCode, name) {
    const geo = countyGeo(name);
    if (!geo) return null;
    if (indicatorCode === 'IND-POPULATION') return `KDA-POP-TOTAL-${geo.geo_code}`;
    if (indicatorCode === 'IND-LAND-AREA') return `KDA-AREA-${geo.geo_code}`;
    if (indicatorCode === 'IND-FUEL-PETROL') return `KDA-FUEL-PETROL-${geo.geo_code}`;
    return null;
  }

  let currentCounty = 'Nakuru';

  function renderProfile(name) {
    currentCounty = name;
    const geo = countyGeo(name);
    const population = latestObs(countySeriesCode('IND-POPULATION', name));
    const area = latestObs(countySeriesCode('IND-LAND-AREA', name));
    const fuel = latestObs(countySeriesCode('IND-FUEL-PETROL', name));

    $('#profile-breadcrumb-county').textContent = name;
    $('#profile-eyebrow').textContent = geo ? `Area profile · County ${String(geo.county_code).padStart(3, '0')}` : 'Area profile';
    $('#profile-title').textContent = `${name} County`;
    if (countyPicker && countyPicker.value !== name) countyPicker.value = name;

    const factHtml = (label, obsPair, unitCode, suffix, unavailableNote) => {
      if (!obsPair) return `<article><span>${label}</span><strong>—</strong><small>${unavailableNote}</small><b class="badge missing">N/A</b></article>`;
      const { obs } = obsPair;
      return `<article><span>${label}</span><strong>${formatValue(obs.value, unitCode)}${suffix}</strong><small>${obs.period_label} · ${badgeLabel(obs.badge)}</small><b class="badge ${obs.badge.toLowerCase()}">${obs.badge}</b></article>`;
    };
    const quickFacts = $('.quick-facts');
    if (quickFacts) quickFacts.innerHTML = [
      factHtml('Population', population, 'persons', '', 'Data not currently available'),
      factHtml('Land area', area, 'km2', ' km²', 'Data not currently available'),
      factHtml('Super Petrol price', fuel, 'kes_per_litre', '/L', 'Only Nairobi and Mombasa are loaded so far'),
      '<article><span>GCP per person</span><strong>—</strong><small>Not yet available — GCP is published episodically, not annually (see methodology)</small><b class="badge missing">N/A</b></article>'
    ].join('');

    const chartCard = $('.chart-card');
    if (chartCard) {
      if (population) {
        const { obs, series: s } = population;
        chartCard.innerHTML = `<div class="card-head"><div><small>What do we know?</small><h3>Population</h3></div>${badgeHtml(obs.badge)}</div>
          <div style="padding:2rem 0"><div class="feature-value" style="font-size:3rem">${formatValue(obs.value, 'persons')}</div>
          <p class="source-note" style="margin-top:1rem">${obs.period_label} · ${agencyNameFor(s)}. Only the 2019 enumeration is loaded; earlier censuses are not yet in the registry, so no trend line is shown rather than an invented one.</p></div>`;
      } else {
        chartCard.innerHTML = `<div class="card-head"><div><small>What do we know?</small><h3>Population</h3></div>${badgeHtml(null)}</div><p class="source-note" style="margin-top:1rem">Data not currently available for ${name}.</p>`;
      }
    }
  }

  function selectCounty(name) {
    renderProfile(name);
    document.getElementById('profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const addCompareBtn = $('#profile-add-compare');
  if (addCompareBtn) addCompareBtn.onclick = () => {
    if (compareCounties.includes(currentCounty)) { toast(`${currentCounty} is already in the comparison.`); return; }
    if (!areaByCountyName.has(currentCounty)) { toast(`No real data available yet for ${currentCounty} in the comparison indicator.`); return; }
    if (compareCounties.length >= 4) { toast('Comparison is limited to four places in this prototype.'); return; }
    compareCounties.push(currentCounty);
    renderCompare();
    toast(`Added ${currentCounty} to the comparison below.`);
  };
  const downloadProfileBtn = $('#profile-download');
  if (downloadProfileBtn) downloadProfileBtn.onclick = () => {
    const population = latestObs(countySeriesCode('IND-POPULATION', currentCounty));
    const area = latestObs(countySeriesCode('IND-LAND-AREA', currentCounty));
    const fuel = latestObs(countySeriesCode('IND-FUEL-PETROL', currentCounty));
    const rows = [['indicator', 'value', 'unit', 'reference_period', 'badge', 'source_url'].join(',')];
    for (const [label, pair, unit] of [['population', population, 'persons'], ['land_area_km2', area, 'km2'], ['petrol_price_kes_per_litre', fuel, 'kes_per_litre']]) {
      if (pair) rows.push([label, pair.obs.value, unit, `"${pair.obs.period_label}"`, pair.obs.badge, pair.obs.source_url].join(','));
    }
    download(`kenya-data-atlas-${currentCounty.toLowerCase().replace(/\s+/g, '-')}.csv`, rows.join('\n'));
  };
  if (countyPicker) countyPicker.onchange = () => selectCounty(countyPicker.value);
  if (allCounties.length) renderProfile(currentCounty);
  window.KDASelectCountyProfile = selectCounty;

  // ---------------------------------------------------------------- Rankings
  // Land area is the only indicator with full 47-county coverage, so it is
  // the one real ranking on the page. The dropdown reflects that honestly
  // rather than offering options the Atlas cannot yet back.
  const rankingSelect = $('#ranking-indicator');
  if (rankingSelect) rankingSelect.innerHTML = '<option>Land area (all 47 counties)</option>';

  function countyAreaRows() {
    const areaIndicator = indicatorByCode.get('IND-LAND-AREA');
    if (!areaIndicator) return [];
    return (series ?? [])
      .filter(s => s.indicator_id === areaIndicator.indicator_id)
      .map(s => {
        const geo = geoById.get(s.geography_id);
        const obs = observationById.get(s.latest_observation_id);
        return geo && obs && geo.level === 'county' ? { name: geo.name, value: obs.value, badge: obs.badge, period: obs.period_label } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value);
  }

  const rankingRows = countyAreaRows();
  if (rankingRows.length) {
    const n = rankingRows.length;
    $('#ranking-body').innerHTML = rankingRows.map((r, i) => {
      const percentile = Math.round(((n - i) / n) * 100);
      return `<tr><td>${i + 1}</td><td><strong>${r.name}</strong></td><td>${formatValue(r.value, 'km2')} km²</td><td><span class="percentile"><i style="width:${percentile}%"></i></span>${percentile}th</td><td>${r.period}</td><td>${badgeHtml(r.badge)}</td></tr>`;
    }).join('');
    const toolbarNote = $('.ranking-toolbar span');
    if (toolbarNote) toolbarNote.innerHTML = `<b>${n}</b> counties · real, computed values`;
    $('#download-ranking').onclick = () => {
      const csvRows = [['rank', 'county', 'area_km2', 'percentile', 'reference_period', 'badge'].join(',')]
        .concat(rankingRows.map((r, i) => [i + 1, r.name, r.value, Math.round(((n - i) / n) * 100), `"${r.period}"`, r.badge].join(',')));
      download('kenya-data-atlas-county-land-area.csv', csvRows.join('\n'));
    };
  }

  // ---------------------------------------------------------------- Compare
  // Real land-area comparison. "Add county" pulls from the same real,
  // full-coverage indicator rather than a fixed demo array.
  const areaByCountyName = new Map(rankingRows.map(r => [r.name, r]));
  const compareCounties = ['Nakuru', 'Kiambu', 'Uasin Gishu'].filter(n => areaByCountyName.has(n));

  function renderCompare() {
    const values = compareCounties.map(n => areaByCountyName.get(n)).filter(Boolean);
    if (!values.length) return;
    const max = Math.max(...values.map(v => v.value));
    $('#comparison-chart').innerHTML = values.map(v =>
      `<div class="bar-row"><span>${v.name}</span><div class="bar-track"><div class="bar-fill" style="width:${(v.value / max) * 100}%">${formatValue(v.value, 'km2')} km²</div></div><strong>${badgeHtml(v.badge)}</strong></div>`
    ).join('');
    const all = rankingRows.map(r => r.value).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];
    const upperQuartile = all[Math.floor(all.length * 0.75)];
    const benchmarkRow = $('.benchmark-row');
    if (benchmarkRow) benchmarkRow.innerHTML = `<span>County median <strong>${formatValue(median, 'km2')} km²</strong></span><span>Upper quartile <strong>${formatValue(upperQuartile, 'km2')} km²</strong></span><span>Reference period <strong>${rankingRows[0]?.period ?? ''}</strong></span>`;
  }
  if (rankingRows.length) {
    renderCompare();
    const compareSelect = $('#compare-indicator');
    if (compareSelect) compareSelect.innerHTML = '<option>Land area</option>';
    $('#add-place').onclick = () => {
      const extra = ['Mombasa', 'Machakos', 'Kisumu', 'Kajiado'].find(n => areaByCountyName.has(n) && !compareCounties.includes(n));
      if (!extra) { toast('All available comparison counties are already shown, or this county is not yet in the real registry.'); return; }
      if (compareCounties.length >= 4) { toast('Comparison is limited to four places in this prototype.'); return; }
      compareCounties.push(extra);
      renderCompare();
    };
  }

  // ------------------------------------------------------------ Series page
  const cpiSeries = seriesByCode.get('KDA-CPI-YOY-KEN');
  const cpiHistory = allObs('KDA-CPI-YOY-KEN');
  if (cpiSeries && cpiHistory.length) {
    const latest = cpiHistory.at(-1);
    const sideBadge = $('.series-side .badge');
    if (sideBadge) sideBadge.outerHTML = `<span class="badge ${latest.badge.toLowerCase()}">${latest.badge} · ${badgeLabel(latest.badge)}</span>`;
    const sv = $('.series-value'); if (sv) sv.textContent = `${latest.value}%`;
    const sideSmall = $('.series-side > small'); if (sideSmall) sideSmall.textContent = `${latest.period_label} · Monthly`;
    // Two real points, drawn plainly — no interpolated curve implying data
    // between them that does not exist.
    const chart = $('.large-chart svg');
    if (chart && cpiHistory.length === 2) {
      const [a, b] = cpiHistory;
      const minV = Math.min(a.value, b.value) - 0.3, maxV = Math.max(a.value, b.value) + 0.3;
      const y = v => 220 - ((v - minV) / (maxV - minV)) * 180;
      chart.innerHTML = `<path class="grid" d="M30 40H780M30 100H780M30 160H780M30 220H780"/><path class="series-line" d="M60 ${y(a.value)} L740 ${y(b.value)}"/><circle cx="60" cy="${y(a.value)}" r="5" fill="var(--red)"/><circle cx="740" cy="${y(b.value)}" r="5" fill="var(--red)"/>`;
    }
    const currentPoint = $('.current-point'); if (currentPoint) currentPoint.textContent = `${latest.value}%`;
    const meta = $('.series-meta');
    if (meta) meta.innerHTML = `<span><small>Series ID</small>${cpiSeries.series_code}</span><span><small>Unit</small>Percent</span><span><small>Source</small>${agencyNameFor(cpiSeries)}</span><span><small>Updated</small>${new Date().toISOString().slice(0, 10)}</span>`;
  }

  // -------------------------------------------------------------- Catalogue
  // Coverage numbers are computed from the real fetched registries, not
  // hand-maintained strings that go stale the moment content is added.
  if (datasets && agencies) {
    const publishedDatasets = datasets.filter(d => ['approved', 'published'].includes(d.publication_status));
    const distinctAgencies = new Set(publishedDatasets.map(d => sourceById.get(d.source_id)?.agency_id).filter(Boolean));
    const coverage = $('.coverage');
    if (coverage) coverage.innerHTML = `<div><strong>${indicators?.length ?? 0}</strong><span>real indicators</span></div><div><strong>${distinctAgencies.size}</strong><span>source families</span></div><div><strong>4</strong><span>geographic levels</span></div>`;
  }
  fetch('data/catalogue/registry/datasets.json').then(r => r.ok ? r.json() : Promise.reject()).then(items => {
    const featured = items.filter(d => ['approved', 'published'].includes(d.publication_status)).slice(0, 6);
    const shown = featured.length ? featured : items.slice(0, 6);
    $('#dataset-list').innerHTML = shown.map(x => `<article class="dataset"><span class="dataset-icon">${x.topic.slice(0, 2)}</span><div><h3>${x.title}</h3><p>${x.topic} · ${x.geographic_coverage.join(', ')} · ${x.publication_status}</p></div><button aria-label="Open ${x.title}" data-toast="Registry code: ${x.dataset_code}. ${x.known_limitations}">→</button></article>`).join('');
    $$('#dataset-list [data-toast]').forEach(b => b.onclick = () => toast(b.dataset.toast));
  }).catch(() => {});

  // -------------------------------------------------------------------- Map
  // The schematic 56-cell grid has been removed entirely and replaced by
  // assets/geo-explorer.js, which renders the Atlas's real, validated
  // boundary geometry as an interactive choropleth (Kenya -> County ->
  // Constituency -> Ward). County-picker selections here still drive the
  // single-page county profile below; the geo-explorer section above is the
  // primary way to browse by place now.

  // ------------------------------------------------------------------ Search
  // Extended to match real indicator names alongside real geographies.
  // Geography results resolve to a real geography_id and hand off to the
  // SAME selection function the map and rankings use (window.KDAGeo),
  // rather than sending every result to the same generic profile.
  const input = $('#atlas-search'), results = $('#search-results');
  async function search(q) {
    const query = q.trim().toLowerCase();
    if (!query) { results.hidden = true; return; }
    const registry = geographies ?? [];
    const geos = registry.filter(g => `${g.name} ${g.level} ${g.geo_code}`.toLowerCase().includes(query))
      .slice(0, 6).map(g => ({ label: g.name, sub: `${g.level[0].toUpperCase() + g.level.slice(1)} · ${g.geo_code}`, code: g.geo_code, geoId: g.geography_id, kind: 'geo' }));
    const inds = (indicators ?? []).filter(i => `${i.name} ${i.short_name} ${i.topic}`.toLowerCase().includes(query))
      .slice(0, 4).map(i => ({ label: i.name, sub: `Indicator · ${i.topic}`, code: i.indicator_code, geoId: '', kind: 'indicator' }));
    const found = [...geos, ...inds].slice(0, 10);
    results.innerHTML = found.map(x => `<button class="search-result" role="option" data-result="${x.label}" data-code="${x.code}" data-geo-id="${x.geoId}" data-kind="${x.kind}"><span>${x.label}</span><small>${x.sub}</small></button>`).join('')
      || '<div class="search-result"><span>No matching geography or indicator</span><small>Try another term</small></div>';
    results.hidden = false;
    $$('[data-result]').forEach(b => b.onclick = () => {
      input.value = b.dataset.result;
      results.hidden = true;
      if (b.dataset.kind === 'indicator') {
        location.hash = 'series';
        toast(`Opened the ${b.dataset.result} indicator (${b.dataset.code}).`);
        return;
      }
      if (window.KDAGeo && b.dataset.geoId) {
        window.KDAGeo.selectGeography(b.dataset.geoId);
        document.getElementById('geo-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        toast(`Found ${b.dataset.result} in the canonical registry (${b.dataset.code}). Map is still loading — try again in a moment.`);
      }
    });
  }
  input.oninput = e => search(e.target.value);
  input.onfocus = () => { if (input.value) search(input.value); };
  document.addEventListener('click', e => { if (!e.target.closest('.search-shell')) results.hidden = true; });
  $$('[data-search]').forEach(b => b.onclick = () => { input.value = b.dataset.search; input.focus(); search(input.value); });
  $$('[data-focus-search]').forEach(b => b.onclick = () => { input.focus(); scrollTo({ top: 0, behavior: 'smooth' }); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); scrollTo({ top: 0, behavior: 'smooth' }); } });
  } catch (err) {
    document.body.dataset.bootError = (err && err.stack) || String(err);
  }
})();
