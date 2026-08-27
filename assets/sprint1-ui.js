/* Kenya Data Atlas — County Core UI (native-registry edition).
 * Sprint 1 data is compiled into data/indicators/registry at build time.
 * This file only provides county-profile supplements, coverage disclosure and
 * the choropleth rendering guard; it does not inject or monkey-patch data.
 */
(function () {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const coverage = {
    'IND-POPULATION': { available: 47, note: '47/47 counties · 2009 + 2019 census history' },
    'IND-LAND-AREA': { available: 47, note: '47/47 counties' },
    'IND-REGISTERED-VOTERS': { available: 47, note: '47/47 counties · 2022 Gazette county schedule' },
    'IND-GCP-CURRENT': { available: 47, note: '47/47 counties · 2020–2024' },
    'IND-COUNTY-BUDGET-TOTAL': { available: 47, note: '47/47 counties · FY 2024/25' },
    'IND-COUNTY-EXPENDITURE-TOTAL': { available: 47, note: '47/47 counties · FY 2024/25' },
    'IND-COUNTY-BUDGET-ABSORPTION': { available: 47, note: '47/47 counties · FY 2024/25' },
    'IND-COUNTY-DEVELOPMENT-ABSORPTION': { available: 47, note: '47/47 counties · FY 2024/25' },
    'IND-FUEL-PETROL': { available: 47, note: '47/47 counties · representative EPRA pricing towns · not county averages' }
  };
  let state = null;
  const fmtCount = v => Number(v).toLocaleString('en-KE', { maximumFractionDigits: 0 });
  const fmtBn = v => `KES ${(Number(v) / 1000).toLocaleString('en-KE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}bn`;

  async function json(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  function fact(label, value, note, badge) {
    const article = document.createElement('article');
    article.dataset.sprint1 = 'true';
    article.innerHTML = `<span>${label}</span><strong>${value}</strong><small>${note}</small><b class="badge ${badge.toLowerCase()}">${badge}</b>`;
    return article;
  }

  function syncChoroplethFills() {
    $$('#geo-svg .geo-feature').forEach(path => {
      if (path.classList.contains('no-data')) {
        path.style.removeProperty('fill');
        return;
      }
      const computedFill = path.getAttribute('fill');
      if (computedFill) path.style.fill = computedFill;
    });
  }
  function installChoroplethFillRepair() {
    const svg = $('#geo-svg');
    if (!svg || svg.dataset.fillRepairInstalled === 'true') return;
    svg.dataset.fillRepairInstalled = 'true';
    new MutationObserver(syncChoroplethFills).observe(svg, { childList:true, subtree:true, attributes:true, attributeFilter:['fill','class'] });
    syncChoroplethFills();
  }

  function latestFor(indicatorCode, geoId) {
    if (!state) return null;
    const ind = state.indicatorByCode.get(indicatorCode);
    if (!ind) return null;
    const candidates = state.series.filter(s => s.indicator_id === ind.indicator_id && s.geography_id === geoId && s.latest_observation_id);
    if (!candidates.length) return null;
    const rows = candidates.map(s => ({ series:s, obs:state.obsById.get(s.latest_observation_id) })).filter(x => x.obs);
    rows.sort((a,b) => String(b.obs.period_end).localeCompare(String(a.obs.period_end)));
    return rows[0] || null;
  }
  function historyFor(indicatorCode, geoId) {
    if (!state) return [];
    const ind = state.indicatorByCode.get(indicatorCode); if (!ind) return [];
    const ids = new Set(state.series.filter(s => s.indicator_id === ind.indicator_id && s.geography_id === geoId).map(s => s.series_id));
    return state.observations.filter(o => ids.has(o.series_id)).sort((a,b) => String(a.period_start).localeCompare(String(b.period_start)));
  }

  function renderCountyFacts(name) {
    if (!state) return;
    const geo = state.countyByName.get(String(name || '').toLowerCase());
    const container = $('.quick-facts');
    if (!geo || !container) return;
    $$('[data-sprint1="true"]', container).forEach(el => el.remove());

    const popHistory = historyFor('IND-POPULATION', geo.geography_id);
    const pop2009 = popHistory.find(o => o.period_label === '2009 census');
    const populationCard = [...container.querySelectorAll('article')].find(a => a.querySelector('span')?.textContent.trim() === 'Population');
    if (populationCard && pop2009) {
      const small = populationCard.querySelector('small');
      if (small) small.textContent = `${small.textContent.replace(/ · 2009:.*$/, '')} · 2009: ${fmtCount(pop2009.value)}`;
    }

    const voters = latestFor('IND-REGISTERED-VOTERS', geo.geography_id);
    const gcp = latestFor('IND-GCP-CURRENT', geo.geography_id);
    const budget = latestFor('IND-COUNTY-BUDGET-TOTAL', geo.geography_id);
    const spend = latestFor('IND-COUNTY-EXPENDITURE-TOTAL', geo.geography_id);
    const absorption = latestFor('IND-COUNTY-BUDGET-ABSORPTION', geo.geography_id);
    const devAbs = latestFor('IND-COUNTY-DEVELOPMENT-ABSORPTION', geo.geography_id);
    const fuel = latestFor('IND-FUEL-PETROL', geo.geography_id);

    if (voters) container.appendChild(fact('Registered voters', fmtCount(voters.obs.value), `${voters.obs.period_label} · IEBC · Official direct`, voters.obs.badge));
    if (gcp) container.appendChild(fact('Gross County Product', fmtBn(gcp.obs.value), `${gcp.obs.period_label} · current prices · KNBS`, gcp.obs.badge));
    if (absorption && budget) container.appendChild(fact('Budget absorption', `${Number(absorption.obs.value).toFixed(0)}%`, `FY 2024/25 · budget ${fmtBn(budget.obs.value)} · OCoB`, absorption.obs.badge));
    if (spend && devAbs) container.appendChild(fact('County expenditure', fmtBn(spend.obs.value), `FY 2024/25 · development absorption ${Number(devAbs.obs.value).toFixed(0)}% · OCoB`, spend.obs.badge));

    if (fuel) {
      const existing = [...container.querySelectorAll('article')].find(a => a.querySelector('span')?.textContent.trim() === 'Super Petrol price');
      if (existing) {
        existing.querySelector('strong').textContent = `${Number(fuel.obs.value).toFixed(2)}/L`;
        const town = fuel.obs.source_row_label || 'Published pricing town';
        const caveat = geo.name === 'Nyandarua' ? ' · nearest published pricing town' : '';
        existing.querySelector('small').textContent = `${town} pricing town${caveat} · ${fuel.obs.period_label} · not a county average`;
        const badge = existing.querySelector('.badge');
        if (badge) { badge.textContent = fuel.obs.badge; badge.className = `badge ${fuel.obs.badge.toLowerCase()}`; }
      }
    }
  }

  function renderCoverage() {
    const select = $('#geo-indicator'), sourceNote = $('#geo-source-note');
    if (!select || !sourceNote) return;
    let line = $('#sprint1-coverage');
    if (!line) {
      line = document.createElement('p');
      line.id = 'sprint1-coverage';
      line.setAttribute('role','status');
      line.style.cssText = 'margin:.7rem 0 0;padding:.55rem .75rem;border:1px solid rgba(18,60,50,.16);border-radius:999px;display:inline-block;font-size:.82rem;font-weight:600;background:rgba(18,60,50,.045)';
      sourceNote.insertAdjacentElement('afterend', line);
    }
    const item = coverage[select.value];
    line.hidden = !item;
    if (item) line.textContent = `Coverage: ${item.note}`;
  }

  function updateCatalogue() {
    const coverageNode = $('.catalogue-section .coverage');
    if (coverageNode && state) {
      const cells = coverageNode.querySelectorAll('div');
      if (cells[0]) cells[0].innerHTML = `<strong>${state.indicators.length}</strong><span>active indicators</span>`;
      if (cells[1]) cells[1].innerHTML = '<strong>Native</strong><span>downloadable registries</span>';
      if (cells[2]) cells[2].innerHTML = '<strong>4</strong><span>geographic levels</span>';
    }
    const copy = $('.catalogue-copy');
    if (copy && !$('#sprint1-source-link')) {
      const link = document.createElement('a');
      link.id='sprint1-source-link'; link.className='primary-button'; link.href='data/sprint1/README.md';
      link.textContent='Open County Core sources →'; link.style.cssText='display:inline-flex;margin-left:.55rem;text-decoration:none';
      const button=copy.querySelector('.primary-button'); if (button) button.insertAdjacentElement('afterend',link); else copy.appendChild(link);
    }
  }

  async function waitForApp() {
    for (let i=0;i<120;i+=1) {
      const picker=$('#county-picker');
      if (picker?.options.length && window.KDASelectCountyProfile) return picker;
      await new Promise(r=>setTimeout(r,50));
    }
    return $('#county-picker');
  }

  async function boot() {
    const [geographies, indicators, series, observations] = await Promise.all([
      json('data/geography/registry/geographies.json'), json('data/indicators/registry/indicators.json'),
      json('data/indicators/registry/series.json'), json('data/indicators/registry/observations.json')
    ]);
    state = {
      indicators, series, observations,
      indicatorByCode:new Map(indicators.map(i=>[i.indicator_code,i])),
      obsById:new Map(observations.map(o=>[o.observation_id,o])),
      countyByName:new Map(geographies.filter(g=>g.level==='county').map(g=>[g.name.toLowerCase(),g]))
    };
    installChoroplethFillRepair();
    const picker = await waitForApp();
    if (picker) {
      renderCountyFacts(picker.value);
      picker.addEventListener('change',()=>setTimeout(()=>renderCountyFacts(picker.value),0));
    }
    const original = window.KDASelectCountyProfile;
    if (typeof original === 'function' && !original.__countyCoreWrapped) {
      const wrapped = name => { const result=original(name); setTimeout(()=>renderCountyFacts(name),0); return result; };
      wrapped.__countyCoreWrapped=true; window.KDASelectCountyProfile=wrapped;
    }
    $('#geo-indicator')?.addEventListener('change',()=>setTimeout(renderCoverage,0));
    window.addEventListener('hashchange',()=>setTimeout(renderCoverage,0));
    renderCoverage(); updateCatalogue();
  }
  boot().catch(error=>console.error('County Core UI:',error));
})();
