/* Kenya Data Atlas — World Bank national integration + cross-level compare.
 * Additive layer: runs after app.js and reads only published registries.
 */
(() => {
  const $ = s => document.querySelector(s);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fetchJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

  function badgeHtml(letter) {
    const label = {B:'Official derived',D:'Modelled'}[letter] || 'Quality';
    return `<span class="badge ${String(letter).toLowerCase()}" title="${label}">${escapeHtml(letter)}</span>`;
  }

  (async function boot() {
    try {
      const [indicators, series, observations, units, geographies, agencies, display, eligibility] = await Promise.all([
        fetchJson('data/indicators/registry/indicators.json'),
        fetchJson('data/indicators/registry/series.json'),
        fetchJson('data/indicators/registry/observations.json'),
        fetchJson('data/indicators/registry/units.json'),
        fetchJson('data/geography/registry/geographies.json'),
        fetchJson('data/catalogue/registry/agencies.json'),
        fetchJson('data/indicators/registry/worldbank-display.json'),
        fetchJson('data/indicators/registry/cross-level-eligibility.json')
      ]);

      const indicatorById = new Map(indicators.map(i => [i.indicator_id, i]));
      const indicatorByCode = new Map(indicators.map(i => [i.indicator_code, i]));
      const seriesById = new Map(series.map(s => [s.series_id, s]));
      const obsById = new Map(observations.map(o => [o.observation_id, o]));
      const unitById = new Map(units.map(u => [u.unit_id, u]));
      const geoById = new Map(geographies.map(g => [g.geography_id, g]));
      const agencyById = new Map(agencies.map(a => [a.agency_id, a]));
      const observationsBySeries = new Map();
      for (const o of observations) {
        if (!observationsBySeries.has(o.series_id)) observationsBySeries.set(o.series_id, []);
        observationsBySeries.get(o.series_id).push(o);
      }

      const latest = s => obsById.get(s?.latest_observation_id) || (observationsBySeries.get(s?.series_id) || []).sort((a,b) => String(a.period_end).localeCompare(String(b.period_end))).at(-1) || null;
      const agencyName = s => {
        const a = agencyById.get(s?.agency_id);
        return a?.abbreviation || a?.name || 'Source';
      };
      const unitForSeries = s => unitById.get(s?.unit_id);
      function formatValue(value, unit) {
        const code = unit?.code || '';
        const dp = unit?.decimal_places ?? 1;
        if (code === 'persons') {
          if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}m`;
          if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
          return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 0 });
        }
        if (code === 'usd') {
          if (Math.abs(value) >= 1e9) return `US$${(value / 1e9).toFixed(2)}bn`;
          if (Math.abs(value) >= 1e6) return `US$${(value / 1e6).toFixed(1)}m`;
          return `US$${Number(value).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
        }
        if (code === 'usd_per_person') return `US$${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const number = Number(value).toLocaleString('en-KE', { minimumFractionDigits: Math.min(dp, 2), maximumFractionDigits: Math.min(Math.max(dp, 1), 2) });
        if (code === 'percent') return `${number}%`;
        if (code === 'years') return `${number} years`;
        if (code === 'tonnes_per_person') return `${number} t/person`;
        if (code === 'per_100000_persons') return `${number} per 100k`;
        if (code === 'km2') return `${number} km²`;
        return unit?.symbol && unit.symbol !== 'score' ? `${number} ${unit.symbol}` : number;
      }
      function yearOf(o) { return Number(String(o?.period_end || o?.period_label || '').slice(0,4)) || 0; }
      function choosePrimary(aSeries, bSeries, policy) {
        const aObs = latest(aSeries), bObs = latest(bSeries);
        if (!bSeries || !bObs) return { primarySeries:aSeries, primaryObs:aObs, alternateSeries:null, alternateObs:null };
        if (policy === 'native_primary_background_only') return { primarySeries:bSeries, primaryObs:bObs, alternateSeries:aSeries, alternateObs:aObs };
        if (policy === 'pulse_projection_primary_profile_census_primary') {
          return yearOf(aObs) > yearOf(bObs)
            ? { primarySeries:aSeries, primaryObs:aObs, alternateSeries:bSeries, alternateObs:bObs }
            : { primarySeries:bSeries, primaryObs:bObs, alternateSeries:aSeries, alternateObs:aObs };
        }
        if (yearOf(aObs) === yearOf(bObs)) {
          const aWb = String(aSeries.series_code).startsWith('KDA-WB-');
          const bWb = String(bSeries.series_code).startsWith('KDA-WB-');
          if (aWb && !bWb) return { primarySeries:bSeries, primaryObs:bObs, alternateSeries:aSeries, alternateObs:aObs };
        }
        return String(aObs.period_end) >= String(bObs.period_end)
          ? { primarySeries:aSeries, primaryObs:aObs, alternateSeries:bSeries, alternateObs:bObs }
          : { primarySeries:bSeries, primaryObs:bObs, alternateSeries:aSeries, alternateObs:aObs };
      }

      function seriesLink(seriesRow, text) {
        return `<button class="wb-alt-link" data-open-series="${escapeHtml(seriesRow.series_id)}">${text}</button>`;
      }
      function renderCard(card) {
        const wbSeries = seriesById.get(card.series_id);
        if (!wbSeries) return '';
        const alternate = card.comparable_alternate_series_id ? seriesById.get(card.comparable_alternate_series_id) : null;
        const selected = choosePrimary(wbSeries, alternate, card.alternate_policy);
        if (!selected.primaryObs) return '';
        const indicator = indicatorById.get(selected.primarySeries.indicator_id);
        const unit = unitForSeries(selected.primarySeries);
        const alternateLine = selected.alternateObs
          ? seriesLink(selected.alternateSeries, `cf. ${escapeHtml(formatValue(selected.alternateObs.value, unitForSeries(selected.alternateSeries)))} (${escapeHtml(agencyName(selected.alternateSeries))}, ${escapeHtml(selected.alternateObs.period_label)})`)
          : '';
        const disclosure = card.disclosure ? `<span class="wb-disclosure">${escapeHtml(card.disclosure)}</span>` : '';
        return `<article class="metric-card wb-metric-card" data-wb-indicator="${escapeHtml(card.indicator_code)}">
          ${badgeHtml(selected.primaryObs.badge)}
          <span class="label">${escapeHtml(indicator?.short_name || indicator?.name || card.indicator_code)}</span>
          <strong>${escapeHtml(formatValue(selected.primaryObs.value, unit))}</strong>
          ${alternateLine ? `<span class="delta wb-alternate">${alternateLine}</span>` : '<span class="delta">National WDI series</span>'}
          <small>${escapeHtml(selected.primaryObs.period_label)} · ${escapeHtml(agencyName(selected.primarySeries))}</small>
          ${disclosure}
        </article>`;
      }

      // Population: on the National Pulse, the fresher WB/UN projection may lead,
      // but the KNBS census remains visible one click away and profile pages stay census-led.
      const populationCard = (display.cards || []).find(c => c.indicator_code === 'IND-POPULATION-WB');
      if (populationCard) {
        const existing = [...document.querySelectorAll('#pulse-grid .metric-card')].find(el => el.querySelector('.label')?.textContent.trim() === 'Population');
        if (existing) existing.outerHTML = renderCard(populationCard);
      }

      // Inflation: keep KNBS monthly as headline; add WB annual only as background context.
      const inflationCard = (display.cards || []).find(c => c.indicator_code === 'IND-CPI-INFLATION-WB-ANNUAL');
      if (inflationCard) {
        const wbSeries = seriesById.get(inflationCard.series_id), wbObs = latest(wbSeries);
        const existing = [...document.querySelectorAll('#pulse-grid .metric-card')].find(el => el.querySelector('.label')?.textContent.includes('Consumer price inflation'));
        if (existing && wbSeries && wbObs && !existing.querySelector('.wb-background-ref')) {
          const line = document.createElement('span');
          line.className = 'delta wb-background-ref';
          line.innerHTML = seriesLink(wbSeries, `WB annual reference: ${escapeHtml(formatValue(wbObs.value, unitForSeries(wbSeries)))} (${escapeHtml(wbObs.period_label)})`);
          existing.querySelector('small')?.before(line);
        }
      }

      const excludeDuplicate = new Set(['IND-POPULATION-WB','IND-CPI-INFLATION-WB-ANNUAL']);
      const additional = (display.cards || []).filter(c => !excludeDuplicate.has(c.indicator_code));
      const pulseSection = $('#explore');
      if (pulseSection && additional.length && !$('#wb-national-indicators')) {
        const block = document.createElement('div');
        block.id = 'wb-national-indicators';
        block.className = 'wb-pulse-block';
        const featured = additional.filter(c => c.headline).slice(0, 6);
        const rest = additional.filter(c => !featured.includes(c));
        block.innerHTML = `<div class="wb-pulse-heading"><div><p class="eyebrow">Internationally harmonised · Kenya national only</p><h3>Additional national indicators</h3></div><p>World Bank WDI is shown as a secondary harmonising source. These values never flow down to counties, constituencies or wards.</p></div>
          <div class="metric-grid wb-featured-grid">${featured.map(renderCard).join('')}</div>
          ${rest.length ? `<details class="wb-more"><summary>Show ${rest.length} more national indicators</summary><div class="metric-grid wb-more-grid">${rest.map(renderCard).join('')}</div></details>` : ''}`;
        $('#pulse-grid').insertAdjacentElement('afterend', block);
      }

      function openSeries(seriesId) {
        const s = seriesById.get(seriesId), o = latest(s), indicator = indicatorById.get(s?.indicator_id), unit = unitForSeries(s);
        if (!s || !o) return;
        const section = $('#series');
        const side = $('.series-side');
        const main = $('.series-main');
        if (side) side.innerHTML = `${badgeHtml(o.badge)}<p>${escapeHtml(geoById.get(s.geography_id)?.name || 'Kenya')}</p><h3>${escapeHtml(indicator?.name || s.series_code)}</h3><div class="series-value">${escapeHtml(formatValue(o.value, unit))}</div><small>${escapeHtml(o.period_label)} · ${escapeHtml(s.frequency)}</small><button class="text-link" onclick="location.hash='catalogue'">Source catalogue →</button>`;
        if (main) main.innerHTML = `<div class="series-toolbar"><div><strong>${escapeHtml(s.series_code)}</strong></div></div><div class="wb-series-provenance"><span><small>Source</small>${escapeHtml(agencyName(s))}</span><span><small>Badge</small>${escapeHtml(o.badge)} · ${o.badge === 'B' ? 'Official derived' : 'Modelled'}</span><span><small>Reference</small>${escapeHtml(o.period_label)}</span><span><small>Unit</small>${escapeHtml(unit?.name || '')}</span></div><p class="source-note">${escapeHtml(o.notes || '')}</p><a class="text-link" href="${escapeHtml(o.source_url)}" target="_blank" rel="noopener">Open source ↗</a>`;
        section?.scrollIntoView({ behavior:'smooth', block:'start' });
        location.hash = 'series';
      }
      document.addEventListener('click', e => {
        const b = e.target.closest('[data-open-series]');
        if (!b) return;
        e.preventDefault();
        openSeries(b.dataset.openSeries);
      });

      // ------------------------------------------------ Cross-level comparison
      // Eligibility is decided for each concrete series, not for an indicator
      // family. A normalized sibling can therefore never promote a raw total.
      function buildCrossLevelCompare() {
        if ($('#cross-level-compare')) return;
        const anchor = $('#geo-explorer');
        if (!anchor) return;
        const section = document.createElement('section');
        section.className = 'section cross-level-section';
        section.id = 'cross-level-compare';
        section.innerHTML = `<div class="section-heading"><div><p class="eyebrow">Compare across levels</p><h2>County ↔ constituency ↔ ward</h2></div><p>Only normalized series—or the explicit land-area exception—appear here. Raw population, voter and currency totals remain same-level only.</p></div>
          <div class="cross-level-controls" id="cross-level-controls"></div>
          <label class="select-label cross-indicator-label">Indicator<select id="cross-level-indicator" aria-label="Cross-level comparison indicator"></select></label>
          <p class="cross-level-note" id="cross-level-note"></p>
          <div class="cross-level-chart" id="cross-level-chart"></div>`;
        anchor.insertAdjacentElement('afterend', section);

        const levels = ['county','constituency','ward'];
        const state = levels.map(level => ({ level, geoId:'' }));
        const controls = $('#cross-level-controls');
        const indicatorSelect = $('#cross-level-indicator');
        const note = $('#cross-level-note');
        const chart = $('#cross-level-chart');

        function optionsForLevel(level) {
          return geographies.filter(g => g.level === level).sort((a,b) => a.name.localeCompare(b.name));
        }
        function preferred(level, names) {
          const rows = optionsForLevel(level);
          return rows.find(g => names.includes(g.name)) || rows[0];
        }
        state[0].geoId = preferred('county', ['Nakuru'])?.geography_id || '';
        state[1].geoId = preferred('constituency', ['Naivasha','Ol Kalou'])?.geography_id || '';
        state[2].geoId = preferred('ward', ['Kaimbaga'])?.geography_id || '';

        function renderControls() {
          controls.innerHTML = state.map((slot, index) => {
            const rows = optionsForLevel(slot.level);
            return `<div class="cross-place"><label>Level<select data-cross-level="${index}">${levels.map(l => `<option value="${l}"${l===slot.level?' selected':''}>${l[0].toUpperCase()+l.slice(1)}</option>`).join('')}</select></label><label>Place<select data-cross-place="${index}">${rows.map(g => `<option value="${g.geography_id}"${g.geography_id===slot.geoId?' selected':''}>${escapeHtml(g.name)}</option>`).join('')}</select></label></div>`;
          }).join('<span class="cross-vs">vs</span>');
          controls.querySelectorAll('[data-cross-level]').forEach(sel => sel.onchange = () => {
            const i = Number(sel.dataset.crossLevel);
            state[i].level = sel.value;
            state[i].geoId = optionsForLevel(sel.value)[0]?.geography_id || '';
            renderControls(); updateIndicatorOptions();
          });
          controls.querySelectorAll('[data-cross-place]').forEach(sel => sel.onchange = () => {
            state[Number(sel.dataset.crossPlace)].geoId = sel.value;
            updateIndicatorOptions();
          });
        }

        const eligibilityBySeriesId = new Map((eligibility.series || []).map(r => [r.series_id, r]));
        function latestSeriesFor(indicatorId, geoId) {
          return series.find(s => s.indicator_id === indicatorId && s.geography_id === geoId && latest(s));
        }
        function eligibleForCurrentPlaces() {
          return indicators.map(indicator => {
            const selectedSeries = state.map(slot => latestSeriesFor(indicator.indicator_id, slot.geoId));
            if (selectedSeries.some(s => !s)) return null;
            const rules = selectedSeries.map(s => eligibilityBySeriesId.get(s.series_id));
            if (rules.some(rule => !rule?.cross_level_eligible)) return null;
            return {
              indicator_code: indicator.indicator_code,
              indicator_id: indicator.indicator_id,
              name: indicator.name,
              series_ids: selectedSeries.map(s => s.series_id)
            };
          }).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
        }
        function updateIndicatorOptions() {
          const previous = indicatorSelect.value;
          const eligible = eligibleForCurrentPlaces();
          indicatorSelect.innerHTML = eligible.map(r => `<option value="${r.indicator_code}">${escapeHtml(r.name)}</option>`).join('');
          if (!eligible.length) {
            note.textContent = 'No concrete series is cross-level eligible and populated at all three selected places — try Land area where coverage exists, or compare places at the same level instead.';
            chart.innerHTML = '';
            indicatorSelect.disabled = true;
            return;
          }
          indicatorSelect.disabled = false;
          if (eligible.some(r => r.indicator_code === previous)) indicatorSelect.value = previous;
          note.textContent = `${eligible.length} indicator${eligible.length===1?'':'s'} genuinely comparable for these selected places. Eligibility is checked on each selected series; the scale is linear from zero.`;
          renderChart();
        }
        function renderChart() {
          const indicator = indicatorByCode.get(indicatorSelect.value);
          if (!indicator) return;
          const rows = state.map(slot => {
            const s = latestSeriesFor(indicator.indicator_id, slot.geoId);
            const rule = s ? eligibilityBySeriesId.get(s.series_id) : null;
            return s && rule?.cross_level_eligible ? { geo:geoById.get(slot.geoId), s, o:latest(s), unit:unitForSeries(s), rule } : null;
          }).filter(Boolean);
          if (rows.length !== state.length) { updateIndicatorOptions(); return; }
          const max = Math.max(...rows.map(r => Number(r.o.value)), 0);
          chart.innerHTML = rows.map(r => {
            const width = max > 0 ? (Number(r.o.value) / max) * 100 : 0;
            return `<div class="cross-bar-row"><div class="cross-bar-label"><strong>${escapeHtml(r.geo.name)}</strong><small>${escapeHtml(r.geo.level)}</small></div><div class="cross-bar-track"><div class="cross-bar-fill" style="width:${width}%"></div></div><div class="cross-bar-value">${escapeHtml(formatValue(r.o.value, r.unit))}<small>${escapeHtml(r.o.period_label)}</small></div></div>`;
          }).join('');
        }
        indicatorSelect.onchange = renderChart;
        renderControls(); updateIndicatorOptions();
      }
      buildCrossLevelCompare();
    } catch (err) {
      console.error('World Bank integration layer failed safely:', err);
    }
  })();
})();
