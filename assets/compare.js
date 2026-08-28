/* Kenya Data Atlas — dedicated Compare tab.
 *
 * Two modes:
 * 1) Direct Compare: all published county indicators are put side by side.
 * 2) My Life Elsewhere: a narrative county-to-county view inspired by the
 *    question "what would life look like elsewhere?". It uses only matched,
 *    genuinely comparable Atlas observations and never invents missing costs.
 */
(() => {
  const root = document.querySelector('#compare');
  if (!root || !root.classList.contains('compare-hub')) return;

  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];

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
    const indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
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
      away: defaults[1] || countyGeos[1]?.name || countyGeos[0]?.name || ''
    };

    const countyOptions = selected => countyGeos.map(g => `<option value="${escapeHtml(g.name)}"${g.name === selected ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
    const countyByName = name => countyGeos.find(g => g.name === name);
    const seriesGroupKey = s => [s.comparability_group || '', s.unit_id || '', s.frequency || '', s.period_type || '', s.transformation || '', s.price_basis || '', s.seasonal_adjustment || ''].join('|');
    const periodKey = o => `${o.period_start}|${o.period_end}`;

    function formatValue(value, unit) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
      const n = Number(value);
      const dp = unit?.decimal_places ?? 1;
      if (unit?.code === 'persons' || unit?.code === 'count') {
        return new Intl.NumberFormat('en-KE', { notation: Math.abs(n) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(n) >= 100000 ? 2 : 0 }).format(n);
      }
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
      const ranked = [...groups.entries()].map(([key, rows]) => ({
        key,
        rows,
        coverage: new Set(rows.map(s => s.geography_id)).size,
        recency: rows.map(latestObservation).filter(Boolean).map(o => o.period_end).sort().at(-1) || ''
      })).sort((a, b) => b.coverage - a.coverage || b.recency.localeCompare(a.recency));
      return ranked[0] || null;
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
        .sort((a, b) => {
          const order = { people: 1, economy: 2, health: 3, finance: 4, representation: 5, infrastructure: 6, resilience: 7 };
          return (order[a.indicator.tab] || 50) - (order[b.indicator.tab] || 50) || a.indicator.name.localeCompare(b.indicator.name);
        });
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
      $('#compare-direct-summary').innerHTML = `<div class="compare-coverage-note"><span><strong>${metrics.length}</strong> published county metrics found for the selected places. <strong>${matchedCount}</strong> have a common comparable reference period${partialCount ? `; ${partialCount} are shown with explicit period/gap warnings` : ''}.</span><span class="status-chip${partialCount ? ' partial' : ''}">${partialCount ? 'Matched + transparent gaps' : 'Fully matched'}</span></div>`;

      const grouped = new Map();
      for (const metric of metrics) {
        const topic = metric.indicator.tab || metric.indicator.topic || 'Other';
        if (!grouped.has(topic)) grouped.set(topic, []);
        grouped.get(topic).push(metric);
      }
      if (!metrics.length) {
        $('#compare-direct-table').innerHTML = '<div class="compare-empty">No published county metrics are available for this selection yet.</div>';
        return;
      }

      $('#compare-direct-table').innerHTML = [...grouped.entries()].map(([topic, rows]) => `<section class="compare-topic">
        <div class="compare-topic-title">${escapeHtml(topic)}</div>
        <table class="compare-matrix"><thead><tr><th>Metric</th>${state.direct.map(n => `<th>${escapeHtml(n)}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(metric => `<tr><td><span class="compare-metric-name">${escapeHtml(metric.indicator.name)}</span><span class="compare-metric-meta"><span>${escapeHtml(metric.indicator.subtopic || metric.indicator.topic || '')}</span><span class="compare-status ${metric.matched ? 'matched' : 'partial'}">${metric.matched ? 'Matched period' : 'Period/gap warning'}</span></span></td>
          ${metric.cells.map(cell => cell.obs ? `<td><span class="compare-cell-value">${escapeHtml(formatValue(cell.obs.value, metric.unit))}</span><span class="compare-cell-meta"><span>${escapeHtml(cell.obs.period_label)}</span>${badgeHtml(cell.obs.badge)}<span>${escapeHtml(agencyById.get(cell.series?.agency_id)?.abbreviation || agencyById.get(cell.series?.agency_id)?.name || '')}</span></span></td>` : '<td><span class="compare-cell-missing">—</span><span class="compare-cell-meta">No published value at this geography</span></td>').join('')}
        </tr>`).join('')}</tbody></table></section>`).join('');
    }

    function lifePriority(metric) {
      const n = metric.indicator.name.toLowerCase();
      if (n.includes('population')) return 100;
      if (n.includes('petrol') || n.includes('fuel')) return 95;
      if (n.includes('per capita') || n.includes('per person')) return 90;
      if (n.includes('budget') && !n.includes('absorption')) return 85;
      if (n.includes('expenditure')) return 80;
      if (n.includes('absorption')) return 75;
      if (n.includes('voter')) return 65;
      if (n.includes('area')) return 60;
      return 20;
    }

    function describeLife(metric) {
      const [home, away] = metric.cells;
      if (!home?.obs || !away?.obs) return null;
      const a = Number(home.obs.value), b = Number(away.obs.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      const unit = metric.unit;
      const name = metric.indicator.name;
      const lowerName = name.toLowerCase();
      const delta = b - a;
      const pct = a === 0 ? null : (delta / Math.abs(a)) * 100;
      const direction = delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'about the same';
      const polarity = metric.indicator.higher_is_better === true ? (delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral')
        : metric.indicator.higher_is_better === false ? (delta < 0 ? 'positive' : delta > 0 ? 'negative' : 'neutral') : 'neutral';
      let headline;

      if (lowerName.includes('population') && pct !== null) headline = `You would live among ${Math.abs(pct).toFixed(0)}% ${delta >= 0 ? 'more' : 'fewer'} people.`;
      else if (lowerName.includes('area') && a > 0 && b > 0) {
        const ratio = b / a;
        headline = ratio >= 1 ? `Your county would be ${ratio.toFixed(ratio >= 10 ? 0 : 1)}× larger by land area.` : `Your county would be ${(1 / ratio).toFixed((1 / ratio) >= 10 ? 0 : 1)}× smaller by land area.`;
      }
      else if ((lowerName.includes('petrol') || lowerName.includes('fuel')) && unit?.code === 'kes_per_litre') headline = `Super Petrol would be KSh ${Math.abs(delta).toFixed(2)}/L ${delta > 0 ? 'more expensive' : delta < 0 ? 'cheaper' : 'about the same price'}.`;
      else if (unit?.code === 'percent') headline = `${name} would be ${Math.abs(delta).toFixed(1)} percentage points ${direction === 'about the same' ? 'different' : direction}.`;
      else if (pct !== null) headline = `${name} would be ${Math.abs(pct).toFixed(Math.abs(pct) >= 10 ? 0 : 1)}% ${direction === 'about the same' ? 'different' : direction}.`;
      else headline = `${name}: ${formatValue(b, unit)} in ${state.away}.`;

      return {
        metric,
        headline,
        polarity,
        detail: `${state.home}: ${formatValue(a, unit)} · ${state.away}: ${formatValue(b, unit)} · ${away.obs.period_label}`
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
        $('#life-hero').innerHTML = '<div><h3>Choose two different counties.</h3><p>The elsewhere mode compares place-level conditions only where the Atlas has comparable published observations.</p></div>';
        $('#life-cards').innerHTML = '';
        return;
      }
      const metrics = allMetrics([state.home, state.away]).filter(m => m.matched && m.available === 2);
      const narratives = metrics.map(m => ({ m, d: describeLife(m) })).filter(x => x.d).sort((a, b) => lifePriority(b.m) - lifePriority(a.m)).slice(0, 10).map(x => x.d);
      $('#life-hero').innerHTML = `<div><p class="eyebrow">${escapeHtml(state.home)} → ${escapeHtml(state.away)}</p><h3>What changes if <em>${escapeHtml(state.away)}</em> is home?</h3><p>This is a Kenya-specific adaptation of the “life elsewhere” idea: simple, human-readable differences using the Atlas's own traceable county data.</p></div><div class="life-match-count"><strong>${metrics.length}</strong><span>matched county indicators with a common reference period</span></div>`;
      $('#life-cards').innerHTML = narratives.length ? narratives.map(d => `<article class="life-card ${d.polarity}">${badgeHtml(d.metric.cells[1].obs.badge)}<small>${escapeHtml(d.metric.indicator.name)}</small><strong>${escapeHtml(d.headline)}</strong><p>${escapeHtml(d.detail)}</p></article>`).join('') : '<div class="life-empty">There are not yet enough common-period observations to produce a responsible elsewhere comparison for these two counties.</div>';
    }

    function downloadDirectCsv() {
      const metrics = allMetrics(state.direct);
      const header = ['metric', 'topic', 'unit', ...state.direct.flatMap(n => [`${n} value`, `${n} period`, `${n} badge`])];
      const rows = [header.map(csvCell).join(',')];
      for (const m of metrics) {
        const base = [m.indicator.name, m.indicator.tab || m.indicator.topic || '', m.unit?.name || ''];
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

    // Mode tabs.
    $$('[data-compare-mode]').forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.compareMode;
      $$('[data-compare-mode]').forEach(b => b.classList.toggle('active', b === button));
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
