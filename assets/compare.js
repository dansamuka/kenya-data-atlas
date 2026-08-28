/* Kenya Data Atlas — dedicated Compare workspace.
 *
 * Direct mode: every published county metric available for the selected places,
 * side by side, with common-period discipline, topic filters and metric search.
 *
 * My Life Elsewhere mode: a resident-facing county-to-county comparison.
 * It deliberately uses a curated set of measurements that can be explained in
 * normal-life language. Direct Compare remains the exhaustive statistical view.
 */
(() => {
  const root = document.querySelector('#compare');
  if (!root || !root.classList.contains('compare-hub')) return;

  if (!document.querySelector('link[data-life-language-style]')) {
    const lifeStyle = document.createElement('link');
    lifeStyle.rel = 'stylesheet';
    lifeStyle.href = 'assets/compare-life-natural.css';
    lifeStyle.dataset.lifeLanguageStyle = 'true';
    document.head.appendChild(lifeStyle);
  }

  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const TOPIC_ORDER = { people: 1, economy: 2, health: 3, finance: 4, representation: 5, infrastructure: 6, resilience: 7 };
  const TOPIC_LABELS = { people: 'People', economy: 'Economy', health: 'Health', finance: 'Public finance', representation: 'Representation', infrastructure: 'Infrastructure', resilience: 'Resilience' };

  const LIFE_CATEGORY_ORDER = ['costs', 'housing', 'health', 'education', 'work', 'community', 'local-services'];
  const LIFE_CATEGORY_LABELS = {
    costs: 'Household costs',
    housing: 'Home & housing',
    health: 'Health nearby',
    education: 'Education',
    work: 'Work & opportunity',
    community: 'Community & place',
    'local-services': 'Local services'
  };

  const fetchJson = async url => {
    try {
      const r = await fetch(url);
      return r.ok ? r.json() : null;
    } catch {
      return null;
    }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const normTopic = indicator => String(indicator.tab || indicator.topic || 'other').toLowerCase();

  const lifePanel = $('[data-compare-panel="life"]');
  if (lifePanel) {
    const lifeTitle = $('.compare-panel-head h3', lifePanel);
    const lifeIntro = $('.compare-panel-head p', lifePanel);
    const lifeLabels = $$('.compare-life-controls label', lifePanel);
    const lifeLimit = $('.life-limitations', lifePanel);
    if (lifeTitle) lifeTitle.textContent = 'Picture your everyday life in another county.';
    if (lifeIntro) lifeIntro.textContent = 'Choose where you live now and another county. We turn comparable county statistics into plain statements about housing, household costs, health, education, work and the community around you.';
    if (lifeLabels[0]?.firstChild) lifeLabels[0].firstChild.textContent = 'I live in ';
    if (lifeLabels[1]?.firstChild) lifeLabels[1].firstChild.textContent = 'What if I lived in ';
    if (lifeLimit) lifeLimit.innerHTML = '<strong>How to read this:</strong> these comparisons describe the county around you, not your personal future. We only use a statistic when both counties have a genuinely comparable published value, and we keep the exact figures and reference period underneath each statement.';
  }

  Promise.all([
    fetchJson('data/geography/registry/geographies.json'),
    fetchJson('data/indicators/registry/indicators.json'),
    fetchJson('data/indicators/registry/series.json'),
    fetchJson('data/indicators/registry/observations.json'),
    fetchJson('data/indicators/registry/units.json'),
    fetchJson('data/catalogue/registry/agencies.json')
  ]).then(([geographies, indicators, series, observations, units, agencies]) => {
    if (![geographies, indicators, series, observations, units].every(Array.isArray)) {
      $('#compare-direct-table').innerHTML = '<div class="compare-empty">The published comparison registries could not be loaded.</div>';
      $('#life-cards').innerHTML = '<div class="life-empty">The published comparison registries could not be loaded.</div>';
      return;
    }

    const countyGeos = geographies.filter(g => g.level === 'county').sort((a, b) => a.name.localeCompare(b.name));
    const geoById = new Map(geographies.map(g => [g.geography_id, g]));
    const unitById = new Map(units.map(u => [u.unit_id, u]));
    const agencyById = new Map((agencies || []).map(a => [a.agency_id, a]));
    const obsBySeries = new Map();
    for (const o of observations) {
      if (!obsBySeries.has(o.series_id)) obsBySeries.set(o.series_id, []);
      obsBySeries.get(o.series_id).push(o);
    }
    for (const rows of obsBySeries.values()) rows.sort((a, b) => a.period_start.localeCompare(b.period_start) || a.period_end.localeCompare(b.period_end));

    const countySeries = series.filter(s => geoById.get(s.geography_id)?.level === 'county' && (obsBySeries.get(s.series_id)?.length || 0));
    const seriesByIndicator = new Map();
    for (const s of countySeries) {
      if (!seriesByIndicator.has(s.indicator_id)) seriesByIndicator.set(s.indicator_id, []);
      seriesByIndicator.get(s.indicator_id).push(s);
    }

    const preferredCounty = pattern => countyGeos.find(g => pattern.test(g.name))?.name;
    const defaults = [preferredCounty(/^Nakuru$/i), preferredCounty(/^Nairobi/i), preferredCounty(/^Kiambu$/i)].filter(Boolean);
    while (defaults.length < Math.min(3, countyGeos.length)) {
      const next = countyGeos.find(g => !defaults.includes(g.name));
      if (!next) break;
      defaults.push(next.name);
    }

    const state = {
      direct: defaults.slice(0, Math.max(2, Math.min(3, defaults.length))),
      home: defaults[0] || countyGeos[0]?.name || '',
      away: defaults[1] || countyGeos[1]?.name || countyGeos[0]?.name || '',
      topic: 'all',
      query: ''
    };

    const countyOptions = selected => countyGeos.map(g => `<option value="${escapeHtml(g.name)}"${g.name === selected ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
    const countyByName = name => countyGeos.find(g => g.name === name);
    const seriesGroupKey = s => [s.comparability_group || '', s.unit_id || '', s.frequency || '', s.period_type || '', s.transformation || '', s.price_basis || '', s.seasonal_adjustment || ''].join('|');
    const periodKey = o => `${o.period_start}|${o.period_end}`;

    function formatValue(value, unit) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
      const n = Number(value);
      const dp = unit?.decimal_places ?? 1;
      if (unit?.code === 'persons' || unit?.code === 'count') return new Intl.NumberFormat('en-KE', { notation: Math.abs(n) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(n) >= 100000 ? 2 : 0 }).format(n);
      if (unit?.code === 'kes_million') return `KSh ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(n)} mn`;
      if (unit?.code === 'kes_per_litre') return `KSh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L`;
      if (unit?.code === 'percent') return `${n.toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp })}%`;
      if (unit?.code === 'km2') return `${n.toLocaleString('en-KE', { maximumFractionDigits: 1 })} km²`;
      if (unit?.code === 'usd') return `US$${new Intl.NumberFormat('en-KE', { notation: Math.abs(n) >= 1000000 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(n)}`;
      if (unit?.code === 'usd_per_person') return `US$${n.toLocaleString('en-KE', { maximumFractionDigits: 2 })}/person`;
      const numeric = n.toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      return unit?.symbol ? `${numeric} ${unit.symbol}` : numeric;
    }

    function badgeHtml(letter) {
      if (!letter) return '<span class="badge missing">N/A</span>';
      return `<span class="badge ${escapeHtml(String(letter).toLowerCase())}">${escapeHtml(letter)}</span>`;
    }

    function latestObservation(seriesRow) {
      const rows = obsBySeries.get(seriesRow?.series_id) || [];
      return rows.at(-1) || null;
    }

    function bestGroupForIndicator(indicatorId, geoIds) {
      const candidates = seriesByIndicator.get(indicatorId) || [];
      const groups = new Map();
      for (const s of candidates) {
        if (!geoIds.includes(s.geography_id)) continue;
        const key = seriesGroupKey(s);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      return [...groups.entries()].map(([key, rows]) => ({
        key,
        rows,
        coverage: new Set(rows.map(s => s.geography_id)).size,
        recency: rows.map(latestObservation).filter(Boolean).map(o => o.period_end).sort().at(-1) || ''
      })).sort((a, b) => b.coverage - a.coverage || b.recency.localeCompare(a.recency))[0] || null;
    }

    function comparableMetric(indicator, selectedNames) {
      const selectedGeos = selectedNames.map(countyByName).filter(Boolean);
      const geoIds = selectedGeos.map(g => g.geography_id);
      const group = bestGroupForIndicator(indicator.indicator_id, geoIds);
      if (!group) return null;

      const seriesForGeo = new Map();
      for (const s of group.rows) {
        const current = seriesForGeo.get(s.geography_id);
        if (!current || (latestObservation(s)?.period_end || '') > (latestObservation(current)?.period_end || '')) seriesForGeo.set(s.geography_id, s);
      }

      let common = null;
      if (selectedGeos.every(g => seriesForGeo.has(g.geography_id))) {
        const periodMaps = selectedGeos.map(g => new Map((obsBySeries.get(seriesForGeo.get(g.geography_id).series_id) || []).map(o => [periodKey(o), o])));
        const shared = [...periodMaps[0].keys()].filter(key => periodMaps.every(m => m.has(key))).sort();
        const latestShared = shared.at(-1);
        if (latestShared) common = new Map(selectedGeos.map((g, i) => [g.geography_id, periodMaps[i].get(latestShared)]));
      }

      const cells = selectedGeos.map(g => {
        const s = seriesForGeo.get(g.geography_id);
        const obs = common?.get(g.geography_id) || latestObservation(s);
        return { geo: g, series: s || null, obs: obs || null };
      });
      const available = cells.filter(c => c.obs).length;
      if (!available) return null;

      return {
        indicator,
        topic: normTopic(indicator),
        groupKey: group.key,
        unit: unitById.get(group.rows[0]?.unit_id || indicator.unit_id),
        cells,
        matched: Boolean(common && available === selectedGeos.length),
        available,
        total: selectedGeos.length,
        commonPeriod: common ? [...common.values()][0]?.period_label || '' : ''
      };
    }

    function allMetrics(selectedNames) {
      return indicators
        .filter(i => i.lifecycle_status === 'active' && seriesByIndicator.has(i.indicator_id))
        .map(i => comparableMetric(i, selectedNames))
        .filter(Boolean)
        .sort((a, b) => (TOPIC_ORDER[a.topic] || 50) - (TOPIC_ORDER[b.topic] || 50) || a.indicator.name.localeCompare(b.indicator.name));
    }

    function renderPlaceStrip() {
      const strip = $('#compare-place-strip');
      strip.innerHTML = state.direct.map((name, index) => `<div class="compare-place-card" data-place-index="${index}">
        <label>Place ${index + 1}<select aria-label="Comparison place ${index + 1}">${countyOptions(name)}</select></label>
        ${state.direct.length > 2 ? '<button class="remove-place" type="button" aria-label="Remove place">×</button>' : ''}
      </div>`).join('');
      $$('.compare-place-card', strip).forEach(card => {
        const index = Number(card.dataset.placeIndex);
        const select = $('select', card);
        select.addEventListener('change', () => {
          if (state.direct.some((n, i) => i !== index && n === select.value)) {
            select.value = state.direct[index];
            return;
          }
          state.direct[index] = select.value;
          renderDirect();
        });
        $('.remove-place', card)?.addEventListener('click', () => {
          state.direct.splice(index, 1);
          renderDirect();
        });
      });
    }

    function renderDirect() {
      renderPlaceStrip();
      const metrics = allMetrics(state.direct);
      const matchedCount = metrics.filter(m => m.matched).length;
      const partialCount = metrics.length - matchedCount;
      const topics = [...new Set(metrics.map(m => m.topic))];
      const filtered = metrics.filter(m => (state.topic === 'all' || m.topic === state.topic) && (!state.query || `${m.indicator.name} ${m.indicator.subtopic || ''} ${m.indicator.topic || ''}`.toLowerCase().includes(state.query.toLowerCase())));

      $('#compare-direct-summary').innerHTML = `<div class="compare-coverage-note"><span><strong>${metrics.length}</strong> published county metrics available for these places. <strong>${matchedCount}</strong> have a common reference period${partialCount ? `; ${partialCount} remain visible with explicit period/gap warnings` : ''}.</span><span class="status-chip${partialCount ? ' partial' : ''}">${partialCount ? 'Matched + transparent gaps' : 'Fully matched'}</span></div>
        <div class="compare-tools"><div class="compare-topic-filters"><button type="button" data-topic="all" class="${state.topic === 'all' ? 'active' : ''}">All metrics <span>${metrics.length}</span></button>${topics.map(t => `<button type="button" data-topic="${escapeHtml(t)}" class="${state.topic === t ? 'active' : ''}">${escapeHtml(TOPIC_LABELS[t] || t)} <span>${metrics.filter(m => m.topic === t).length}</span></button>`).join('')}</div><label class="compare-search"><span>Find a metric</span><input type="search" value="${escapeHtml(state.query)}" placeholder="Population, budget, petrol…"></label></div>`;

      $$('[data-topic]', $('#compare-direct-summary')).forEach(btn => btn.addEventListener('click', () => { state.topic = btn.dataset.topic; renderDirect(); }));
      $('.compare-search input', $('#compare-direct-summary'))?.addEventListener('input', e => { state.query = e.target.value; renderDirect(); });

      const grouped = new Map();
      for (const metric of filtered) {
        if (!grouped.has(metric.topic)) grouped.set(metric.topic, []);
        grouped.get(metric.topic).push(metric);
      }
      if (!filtered.length) {
        $('#compare-direct-table').innerHTML = '<div class="compare-empty">No published county metrics match this filter.</div>';
        return;
      }

      $('#compare-direct-table').innerHTML = [...grouped.entries()].map(([topic, rows]) => `<section class="compare-topic">
        <div class="compare-topic-title">${escapeHtml(TOPIC_LABELS[topic] || topic)}</div>
        <table class="compare-matrix"><thead><tr><th>Metric</th>${state.direct.map(n => `<th>${escapeHtml(n)}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(metric => `<tr><td><span class="compare-metric-name">${escapeHtml(metric.indicator.name)}</span><span class="compare-metric-meta"><span>${escapeHtml(metric.indicator.subtopic || metric.indicator.topic || '')}</span><span class="compare-status ${metric.matched ? 'matched' : 'partial'}">${metric.matched ? 'Matched period' : 'Period/gap warning'}</span></span></td>
          ${metric.cells.map(cell => cell.obs ? `<td><span class="compare-cell-value">${escapeHtml(formatValue(cell.obs.value, metric.unit))}</span><span class="compare-cell-meta"><span>${escapeHtml(cell.obs.period_label)}</span>${badgeHtml(cell.obs.badge)}<span>${escapeHtml(agencyById.get(cell.series?.agency_id)?.abbreviation || agencyById.get(cell.series?.agency_id)?.name || '')}</span></span></td>` : '<td><span class="compare-cell-missing">—</span><span class="compare-cell-meta">No published value at this geography</span></td>').join('')}
        </tr>`).join('')}</tbody></table></section>`).join('');
    }

    const lifeCode = metric => metric.indicator.indicator_code || '';

    function countDifferencePhrase(homeValue, awayValue, noun) {
      if (homeValue === awayValue) return `about the same number of ${noun}`;
      if (homeValue === 0) return `${Math.round(awayValue).toLocaleString('en-KE')} ${noun}`;
      const pct = ((awayValue - homeValue) / Math.abs(homeValue)) * 100;
      if (awayValue > homeValue && awayValue / homeValue >= 2) return `${(awayValue / homeValue).toFixed(awayValue / homeValue >= 10 ? 0 : 1)} times as many ${noun}`;
      return `${Math.abs(pct).toFixed(Math.abs(pct) >= 10 ? 0 : 1)}% ${awayValue > homeValue ? 'more' : 'fewer'} ${noun}`;
    }

    function percentChange(a, b) {
      return a === 0 ? null : ((b - a) / Math.abs(a)) * 100;
    }

    function makeLifeNarrative(metric) {
      const [home, away] = metric.cells;
      if (!home?.obs || !away?.obs) return null;
      const a = Number(home.obs.value), b = Number(away.obs.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

      const code = lifeCode(metric);
      const name = metric.indicator.name.toLowerCase();
      const delta = b - a;
      const pct = percentChange(a, b);
      const pp = Math.abs(delta).toFixed(1);
      const pctAbs = pct === null ? null : Math.abs(pct);
      const period = away.obs.period_label || metric.commonPeriod || '';
      const detailValues = `${state.home}: ${formatValue(a, metric.unit)} · ${state.away}: ${formatValue(b, metric.unit)} · ${period}`;
      let category;
      let label;
      let headline;
      let explanation;
      let polarity = 'neutral';
      let magnitude = pctAbs ?? Math.abs(delta);

      if (code === 'IND-RENT-BURDEN') {
        category = 'costs';
        label = 'Rent and household spending';
        headline = delta === 0
          ? 'feel about the same squeeze from rent in the household budget'
          : delta > 0
            ? `feel a tighter squeeze on housing, with rent taking ${pp} percentage points more of the household budget`
            : `have a little more breathing room on housing, with rent taking ${pp} percentage points less of the household budget`;
        explanation = `In ${state.home}, rent accounts for ${formatValue(a, metric.unit)} of household expenditure. In ${state.away}, it accounts for ${formatValue(b, metric.unit)}.`;
        polarity = delta < 0 ? 'positive' : delta > 0 ? 'negative' : 'neutral';
        magnitude = Math.abs(delta);
      } else if (code === 'IND-HOUSING-OWNER-OCCUPIED') {
        category = 'housing';
        label = 'Owning your home';
        headline = delta === 0
          ? 'have about the same shot at living in a home you own'
          : delta > 0
            ? `have a better shot at owning the roof over your head — owner-occupied homes are ${pp} percentage points more common`
            : `have a tougher shot at owning the roof over your head — owner-occupied homes are ${pp} percentage points less common`;
        explanation = `${formatValue(a, metric.unit)} of households in ${state.home} own their main dwelling, compared with ${formatValue(b, metric.unit)} in ${state.away}.`;
        polarity = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
        magnitude = Math.abs(delta);
      } else if (code === 'IND-HEALTH-FACILITY-STOCK') {
        category = 'health';
        label = 'Health facilities around the county';
        const facilityRatio = a > 0 ? b / a : null;
        headline = delta === 0
          ? 'have about the same number of medical facilities around the county'
          : delta > 0
            ? facilityRatio && facilityRatio >= 1.5
              ? `have many more medical facilities around the county — about ${facilityRatio.toFixed(1)}× as many are listed`
              : `have ${countDifferencePhrase(a, b, 'health facilities')} around the county`
            : `have ${countDifferencePhrase(a, b, 'health facilities')} around the county`;
        explanation = `${state.home} had ${formatValue(a, metric.unit)} facilities in the 2023 census target, while ${state.away} had ${formatValue(b, metric.unit)}. This is a facility-count comparison, not a promise of shorter travel times or better care.`;
        polarity = 'neutral';
      } else if (code === 'IND-SCHOOL-ATTENDANCE-RATE') {
        category = 'education';
        label = 'Being in school or learning';
        headline = delta === 0
          ? 'notice about the same student presence in the community'
          : delta > 0
            ? `notice a more student-heavy community, with ${pp} percentage points more people aged 3+ in school or a learning institution`
            : `notice a less student-heavy community, with ${pp} percentage points fewer people aged 3+ in school or a learning institution`;
        explanation = `School or learning-institution attendance was ${formatValue(a, metric.unit)} in ${state.home} and ${formatValue(b, metric.unit)} in ${state.away}.`;
        polarity = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
        magnitude = Math.abs(delta);
      } else if (code === 'IND-LABOUR-FORCE-PARTICIPATION') {
        category = 'work';
        label = 'Working-age people in the labour force';
        headline = delta === 0
          ? 'live in a labour market with about the same share of working-age adults active'
          : delta > 0
            ? `live in a busier labour market, with ${pp} percentage points more working-age adults working or actively looking for work`
            : `live in a quieter labour market, with ${pp} percentage points fewer working-age adults working or actively looking for work`;
        explanation = `Among people aged 15–64, labour-force participation was ${formatValue(a, metric.unit)} in ${state.home} and ${formatValue(b, metric.unit)} in ${state.away}.`;
        polarity = 'neutral';
        magnitude = Math.abs(delta);
      } else if (code === 'IND-FUEL-PETROL' || (name.includes('petrol') || name.includes('fuel')) && metric.unit?.code === 'kes_per_litre') {
        category = 'costs';
        label = 'Filling up the car';
        headline = delta === 0
          ? 'feel about the same hit at the petrol pump'
          : delta > 0
            ? `feel a little more pinch at the pump, paying KSh ${Math.abs(delta).toFixed(2)} more for every litre of Super Petrol`
            : `save a bit at the pump, paying KSh ${Math.abs(delta).toFixed(2)} less for every litre of Super Petrol`;
        explanation = `The published price is ${formatValue(a, metric.unit)} in ${state.home} and ${formatValue(b, metric.unit)} in ${state.away}.`;
        polarity = delta < 0 ? 'positive' : delta > 0 ? 'negative' : 'neutral';
      } else if (code === 'IND-POPULATION' || name === 'population') {
        category = 'community';
        label = 'How many people share the county';
        headline = delta === 0
          ? 'experience a county with about the same number of residents'
          : delta > 0
            ? `experience a busier, more populous county, sharing it with ${pctAbs?.toFixed(0) || 'many'}% more residents`
            : `experience a less populous county, sharing it with ${pctAbs?.toFixed(0) || 'many'}% fewer residents`;
        explanation = `${state.home} had ${formatValue(a, metric.unit)} residents in this reference period, compared with ${formatValue(b, metric.unit)} in ${state.away}.`;
        polarity = 'neutral';
      } else if (code === 'IND-LAND-AREA' || name.includes('land area')) {
        category = 'community';
        label = 'How much ground the county covers';
        const ratio = b / a;
        headline = delta === 0
          ? 'have about the same amount of ground to cover across the county'
          : ratio >= 1
            ? `have far more ground to cover, living in a county about ${ratio.toFixed(ratio >= 10 ? 0 : 1)} times the physical size`
            : `have less ground to cover, living in a county about ${(1 / ratio).toFixed((1 / ratio) >= 10 ? 0 : 1)} times smaller by land area`;
        explanation = `${state.home} covers ${formatValue(a, metric.unit)} and ${state.away} covers ${formatValue(b, metric.unit)}.`;
        polarity = 'neutral';
      } else if (name.includes('gross county product') && (name.includes('per capita') || name.includes('per person'))) {
        category = 'work';
        label = 'Economic output per resident';
        headline = delta === 0
          ? 'live in a county with about the same economic output per resident'
          : `live in a county where economic output per resident is ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% ${delta > 0 ? 'higher' : 'lower'}`;
        explanation = `${state.home}: ${formatValue(a, metric.unit)} per resident · ${state.away}: ${formatValue(b, metric.unit)} per resident. This is economic output, not personal income.`;
        polarity = 'neutral';
      } else if (name.includes('budget') && !name.includes('absorption')) {
        category = 'local-services';
        label = 'Money available to county government';
        headline = delta === 0
          ? 'rely on a county government working with about the same size budget'
          : delta > 0
            ? `rely on a county government with deeper pockets — its published budget is ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% larger`
            : `rely on a county government with a leaner budget — its published budget is ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% smaller`;
        explanation = `${state.home}'s published county budget was ${formatValue(a, metric.unit)}; ${state.away}'s was ${formatValue(b, metric.unit)}. A larger budget does not automatically mean better services.`;
        polarity = 'neutral';
      } else if (name.includes('expenditure') && !name.includes('absorption')) {
        category = 'local-services';
        label = 'County government spending';
        headline = delta === 0
          ? 'see about the same level of county government spending'
          : `see ${pctAbs?.toFixed(pctAbs >= 10 ? 0 : 1)}% ${delta > 0 ? 'more' : 'less'} county government spending`;
        explanation = `${state.home}: ${formatValue(a, metric.unit)} · ${state.away}: ${formatValue(b, metric.unit)}. This describes government spending, not household spending.`;
        polarity = 'neutral';
      } else if (name.includes('absorption')) {
        category = 'local-services';
        label = 'How much of the county budget gets used';
        headline = delta === 0
          ? 'see about the same share of the county budget used'
          : `see ${pp} percentage points ${delta > 0 ? 'more' : 'less'} of the county budget used`;
        explanation = `${state.home}'s published absorption rate was ${formatValue(a, metric.unit)}, compared with ${formatValue(b, metric.unit)} in ${state.away}.`;
        polarity = 'neutral';
        magnitude = Math.abs(delta);
      } else if (name.includes('registered voter')) {
        category = 'community';
        label = 'Size of the local electorate';
        headline = delta === 0
          ? 'be part of an electorate about the same size'
          : `be part of an electorate with ${pctAbs?.toFixed(0)}% ${delta > 0 ? 'more' : 'fewer'} registered voters`;
        explanation = `${state.home}: ${formatValue(a, metric.unit)} registered voters · ${state.away}: ${formatValue(b, metric.unit)}.`;
        polarity = 'neutral';
      } else {
        return null;
      }

      const sourceName = agencyById.get(away.series?.agency_id)?.abbreviation || agencyById.get(away.series?.agency_id)?.name || '';
      return {
        metric,
        category,
        label,
        headline,
        explanation,
        detailValues,
        sourceName,
        polarity,
        magnitude
      };
    }

    function renderLifeControls() {
      $('#life-home').innerHTML = countyOptions(state.home);
      $('#life-away').innerHTML = countyOptions(state.away);
      $('#life-home').value = state.home;
      $('#life-away').value = state.away;
    }

    function renderLife() {
      renderLifeControls();
      if (state.home === state.away) {
        $('#life-hero').innerHTML = '<div><h3>Choose two different counties.</h3><p>Pick where you live now and another county to see how familiar parts of everyday life compare.</p></div>';
        $('#life-cards').innerHTML = '';
        return;
      }

      const metrics = allMetrics([state.home, state.away]).filter(m => m.matched && m.available === 2);
      const narratives = metrics.map(makeLifeNarrative).filter(Boolean);
      narratives.sort((a, b) => LIFE_CATEGORY_ORDER.indexOf(a.category) - LIFE_CATEGORY_ORDER.indexOf(b.category) || b.magnitude - a.magnitude);

      const grouped = new Map();
      for (const d of narratives) {
        if (!grouped.has(d.category)) grouped.set(d.category, []);
        grouped.get(d.category).push(d);
      }

      const everyday = narratives.filter(d => ['costs', 'housing', 'health', 'education', 'work'].includes(d.category));
      const highlights = everyday.slice(0, 5);
      const summarySentence = highlights.length
        ? `The clearest measured differences are in ${highlights.map(d => d.label.toLowerCase()).slice(0, -1).join(', ')}${highlights.length > 1 ? ` and ${highlights.at(-1).label.toLowerCase()}` : highlights[0].label.toLowerCase()}.`
        : 'The Atlas has only a small number of everyday-life measures that can be compared responsibly for this pair.';

      $('#life-hero').innerHTML = `<div>
        <p class="eyebrow">${escapeHtml(state.home)} → ${escapeHtml(state.away)}</p>
        <h3>If <em>${escapeHtml(state.away)}</em> were home instead of ${escapeHtml(state.home)}…</h3>
        <p>${escapeHtml(summarySentence)} These are county statistics, so they describe the place around you—not a prediction of your personal circumstances.</p>
        ${highlights.length ? `<div class="life-summary-grid">${highlights.map(d => `<div class="life-summary-item"><small>${escapeHtml(LIFE_CATEGORY_LABELS[d.category])}</small><strong>${escapeHtml(d.headline)}</strong></div>`).join('')}</div>` : ''}
      </div>
      <div class="life-match-count"><strong>${narratives.length}</strong><span>everyday-life comparisons with matched periods</span><small>${grouped.size} resident-facing categories</small></div>`;

      $('#life-cards').innerHTML = narratives.length
        ? `<div class="life-breakdown-intro"><p class="eyebrow">${escapeHtml(state.away)} vs. ${escapeHtml(state.home)}</p><h3>If you lived in ${escapeHtml(state.away)} instead of ${escapeHtml(state.home)}, you would:</h3></div>
          ${LIFE_CATEGORY_ORDER.filter(category => grouped.has(category)).map(category => {
            const rows = grouped.get(category);
            return `<section class="life-topic">
              <div class="life-topic-head"><span>${escapeHtml(LIFE_CATEGORY_LABELS[category])}</span><small>${rows.length} everyday comparison${rows.length === 1 ? '' : 's'}</small></div>
              <div class="life-topic-list">${rows.map(d => `<article class="life-card ${d.polarity}">
                <div class="life-card-top"><div><small>${escapeHtml(d.label)}</small><strong>${escapeHtml(d.headline)}</strong></div>${badgeHtml(d.metric.cells[1].obs.badge)}</div>
                <p class="life-explanation">${escapeHtml(d.explanation)}</p>
                <div class="life-values"><span><b>${escapeHtml(state.home)}</b>${escapeHtml(formatValue(d.metric.cells[0].obs.value, d.metric.unit))}</span><span class="life-arrow">→</span><span><b>${escapeHtml(state.away)}</b>${escapeHtml(formatValue(d.metric.cells[1].obs.value, d.metric.unit))}</span></div>
                <p class="life-source-line">${escapeHtml(d.metric.cells[1].obs.period_label)}${d.sourceName ? ` · ${escapeHtml(d.sourceName)}` : ''} · ${escapeHtml(d.metric.indicator.name)}</p>
              </article>`).join('')}</div>
            </section>`;
          }).join('')}`
        : '<div class="life-empty">There are not yet enough matched county observations that can be translated responsibly into everyday-life comparisons for these two counties. Try Direct Compare for the full statistical view.</div>';
    }

    function downloadDirectCsv() {
      const metrics = allMetrics(state.direct);
      const header = ['metric', 'topic', 'unit', ...state.direct.flatMap(n => [`${n} value`, `${n} period`, `${n} badge`])];
      const rows = [header.map(csvCell).join(',')];
      for (const m of metrics) {
        const base = [m.indicator.name, TOPIC_LABELS[m.topic] || m.topic, m.unit?.name || ''];
        const cells = m.cells.flatMap(c => c.obs ? [c.obs.value, c.obs.period_label, c.obs.badge] : ['', '', '']);
        rows.push([...base, ...cells].map(csvCell).join(','));
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kenya-data-atlas-compare-${state.direct.map(n => n.toLowerCase().replace(/\s+/g, '-')).join('-vs-')}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    $$('[data-compare-mode]').forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.compareMode;
      $$('[data-compare-mode]').forEach(b => {
        const active = b === button;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      $$('[data-compare-panel]').forEach(panel => { panel.hidden = panel.dataset.comparePanel !== mode; });
      if (mode === 'life') renderLife();
    }));

    $('#compare-add-place').addEventListener('click', () => {
      if (state.direct.length >= 4) return;
      const next = countyGeos.find(g => !state.direct.includes(g.name));
      if (!next) return;
      state.direct.push(next.name);
      renderDirect();
    });
    $('#compare-download').addEventListener('click', downloadDirectCsv);
    $('#life-home').addEventListener('change', e => { state.home = e.target.value; renderLife(); });
    $('#life-away').addEventListener('change', e => { state.away = e.target.value; renderLife(); });
    $('#life-swap').addEventListener('click', () => { [state.home, state.away] = [state.away, state.home]; renderLife(); });

    renderDirect();
    renderLife();
  }).catch(() => {
    $('#compare-direct-table').innerHTML = '<div class="compare-empty">Comparison could not be initialized.</div>';
  });
})();
