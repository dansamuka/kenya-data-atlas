/* Kenya Data Atlas — Data Sprint 1 UI supplements.
 * Keeps the core UI intact and adds county-core facts, coverage disclosure and
 * a direct machine-readable download.
 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function fmtCount(value) {
    return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 0 });
  }

  function fmtBn(kshMillion) {
    return `KES ${(Number(kshMillion) / 1000).toLocaleString('en-KE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}bn`;
  }

  function fact(label, value, note, badge) {
    const article = document.createElement('article');
    article.dataset.sprint1 = 'true';
    article.innerHTML =
      `<span>${label}</span><strong>${value}</strong><small>${note}</small>` +
      `<b class="badge ${(badge || 'a').toLowerCase()}">${badge || 'A'}</b>`;
    return article;
  }

  /*
   * Choropleth repair (0.6.1): geo-explorer.js writes each computed D3 colour
   * as an SVG presentation attribute. The base stylesheet also declares a
   * fill on .geo-feature; CSS therefore wins the cascade and made every data
   * polygon look pale even though the legend and values were correct.
   *
   * Mirror the computed presentation attribute into an inline style. This is
   * deliberately a rendering-only fix: values, classes and canonical geometry
   * are untouched. No-data features keep their hatch pattern from CSS.
   */
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
    const observer = new MutationObserver(() => syncChoroplethFills());
    observer.observe(svg, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['fill', 'class']
    });
    syncChoroplethFills();
  }

  function renderCountyFacts(name) {
    const S1 = window.KDASprint1;
    if (!S1 || !S1.additions) return;
    const code = S1.geoCodeByName.get(String(name || '').toLowerCase());
    const snap = code ? S1.snapshotByCode.get(code) : null;
    const container = $('.quick-facts');
    if (!snap || !container) return;

    $$('[data-sprint1="true"]', container).forEach(el => el.remove());

    const populationCard = [...container.querySelectorAll('article')].find(article => {
      const label = article.querySelector('span');
      return label && label.textContent.trim() === 'Population';
    });
    if (populationCard && snap.population_2009 != null) {
      const small = populationCard.querySelector('small');
      if (small) {
        small.dataset.sprint1History = 'true';
        const base = small.textContent.replace(/ · 2009:.*$/, '');
        small.textContent = `${base} · 2009: ${fmtCount(snap.population_2009)}`;
      }
    }

    if (snap.voters_2022 != null) {
      container.appendChild(fact(
        'Registered voters',
        fmtCount(snap.voters_2022),
        '2022 Gazette county schedule · IEBC · Official direct',
        'A'
      ));
    }

    if (snap.gcp_2024_ksh_mn != null) {
      container.appendChild(fact(
        'Gross County Product',
        fmtBn(snap.gcp_2024_ksh_mn),
        '2024 preliminary · current prices · KNBS',
        'A'
      ));
    }

    if (snap.budget_fy2024_25) {
      container.appendChild(fact(
        'Budget absorption',
        `${Number(snap.budget_fy2024_25.overall_absorption_pct).toFixed(0)}%`,
        `FY 2024/25 · budget ${fmtBn(snap.budget_fy2024_25.budget_total_ksh_mn)} · OCoB`,
        'A'
      ));
      container.appendChild(fact(
        'County expenditure',
        fmtBn(snap.budget_fy2024_25.expenditure_total_ksh_mn),
        `FY 2024/25 · development absorption ${Number(snap.budget_fy2024_25.development_absorption_pct).toFixed(0)}% · OCoB`,
        'A'
      ));
    }

    if (snap.fuel_pricing_town) {
      const existing = [...container.querySelectorAll('article')].find(article => {
        const label = article.querySelector('span');
        return label && label.textContent.trim() === 'Super Petrol price';
      });
      if (existing) {
        const strong = existing.querySelector('strong');
        const small = existing.querySelector('small');
        const badge = existing.querySelector('.badge');
        if (strong) strong.textContent = `${Number(snap.fuel_pricing_town.super_petrol_kes_per_litre).toFixed(2)}/L`;
        if (small) {
          const nyandaruaCaveat = name === 'Nyandarua' ? ' · nearest published pricing town' : '';
          small.textContent = `${snap.fuel_pricing_town.pricing_town} pricing town${nyandaruaCaveat} · 15 Aug–14 Sep 2026 · not a county average`;
        }
        if (badge && !['Nairobi City', 'Mombasa'].includes(name)) {
          badge.textContent = 'E';
          badge.className = 'badge e';
        }
      }
    }
  }

  function renderCoverage() {
    const S1 = window.KDASprint1;
    const select = $('#geo-indicator');
    const sourceNote = $('#geo-source-note');
    if (!S1 || !select || !sourceNote) return;

    let line = $('#sprint1-coverage');
    if (!line) {
      line = document.createElement('p');
      line.id = 'sprint1-coverage';
      line.setAttribute('role', 'status');
      line.style.cssText = [
        'margin:.7rem 0 0',
        'padding:.55rem .75rem',
        'border:1px solid rgba(18,60,50,.16)',
        'border-radius:999px',
        'display:inline-block',
        'font-size:.82rem',
        'font-weight:600',
        'background:rgba(18,60,50,.045)'
      ].join(';');
      sourceNote.insertAdjacentElement('afterend', line);
    }

    const item = S1.coverage[select.value];
    if (!item) {
      line.hidden = true;
      return;
    }
    line.hidden = false;
    line.textContent = `Coverage: ${item.note}`;
  }

  function updateCatalogue() {
    const S1 = window.KDASprint1;
    if (!S1) return;
    const coverage = $('.catalogue-section .coverage');
    if (coverage) {
      const cells = coverage.querySelectorAll('div');
      if (cells[0]) cells[0].innerHTML = '<strong>13</strong><span>active indicators</span>';
      if (cells[1]) cells[1].innerHTML = '<strong>5</strong><span>Sprint 1 source releases</span>';
      if (cells[2]) cells[2].innerHTML = '<strong>4</strong><span>geographic levels</span>';
    }

    const copy = $('.catalogue-copy');
    if (copy && !$('#sprint1-source-link')) {
      const link = document.createElement('a');
      link.id = 'sprint1-source-link';
      link.className = 'primary-button';
      link.href = 'data/sprint1/README.md';
      link.textContent = 'Open County Core sources →';
      link.style.cssText = 'display:inline-flex;margin-left:.55rem;text-decoration:none';
      const button = copy.querySelector('.primary-button');
      if (button) button.insertAdjacentElement('afterend', link);
      else copy.appendChild(link);
    }
  }

  async function waitForApp() {
    for (let i = 0; i < 120; i += 1) {
      const picker = $('#county-picker');
      if (picker && picker.options.length && window.KDASelectCountyProfile) return picker;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return $('#county-picker');
  }

  async function boot() {
    const S1 = window.KDASprint1;
    if (!S1) return;
    await S1.ready;

    // The fuel file now contains one representative published pricing town for
    // every county. These are town prices used for county navigation, not
    // county averages; Nyandarua uses the nearest published pricing town.
    S1.coverage['IND-FUEL-PETROL'] = {
      available: 47,
      total: 47,
      note: '47/47 counties · representative EPRA pricing towns · not county averages'
    };

    installChoroplethFillRepair();

    const picker = await waitForApp();
    if (S1.error) return;

    if (picker) {
      renderCountyFacts(picker.value);
      picker.addEventListener('change', () => {
        setTimeout(() => renderCountyFacts(picker.value), 0);
      });
    }

    const originalSelect = window.KDASelectCountyProfile;
    if (typeof originalSelect === 'function' && !originalSelect.__sprint1Wrapped) {
      const wrapped = function (name) {
        const result = originalSelect(name);
        setTimeout(() => renderCountyFacts(name), 0);
        return result;
      };
      wrapped.__sprint1Wrapped = true;
      window.KDASelectCountyProfile = wrapped;
    }

    const indicator = $('#geo-indicator');
    if (indicator) indicator.addEventListener('change', () => setTimeout(renderCoverage, 0));
    window.addEventListener('hashchange', () => setTimeout(renderCoverage, 0));
    renderCoverage();
    updateCatalogue();
  }

  boot().catch(error => console.error('Sprint 1 UI:', error));
})();