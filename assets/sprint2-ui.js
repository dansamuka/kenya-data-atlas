/* Kenya Data Atlas — Data Sprint 2 UI supplements.
 * Makes Local Kenya coverage and geography-crosswalk quality explicit as the
 * user drills Kenya -> County -> Constituency -> Ward for registered voters.
 */
(function () {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);

  function selectedGeoCode() {
    const match = location.hash.match(/^#map\/([^?]+)/);
    return match ? decodeURIComponent(match[1]) : 'KEN';
  }

  function levelForCode(code) {
    if (/-W\d+$/.test(code)) return 'ward';
    if (/-CON\d+$/.test(code)) return 'constituency';
    if (/^KEN-C\d+$/.test(code)) return 'county';
    return 'country';
  }

  function countyNumber(code) {
    const match = code.match(/^KEN-C(\d{3})/);
    return match ? Number(match[1]) : null;
  }

  function constituencyNumber(code) {
    const match = code.match(/-CON(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function childCount(parentCode, childLevel) {
    const S2 = window.KDASprint2;
    if (!S2) return 0;
    let count = 0;
    for (const [code, parent] of S2.parentCodeByGeoCode.entries()) {
      if (parent === parentCode && S2.geoLevelByCode.get(code) === childLevel) count += 1;
    }
    return count;
  }

  function crosswalkCount(code, level) {
    const S2 = window.KDASprint2;
    if (!S2) return 0;
    if (level === 'country') return S2.crosswalks.length;
    if (level === 'county') {
      const n = countyNumber(code);
      return S2.crosswalks.filter(x => x.county_code === n).length;
    }
    if (level === 'constituency') {
      const n = constituencyNumber(code);
      return S2.crosswalks.filter(x => x.constituency_code === n).length;
    }
    return S2.crosswalkByGeoCode.has(code) ? 1 : 0;
  }

  function formatCount(value) {
    return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 0 });
  }

  function contextualCoverage() {
    const S2 = window.KDASprint2;
    const select = $('#geo-indicator');
    if (!S2 || !select || select.value !== 'IND-REGISTERED-VOTERS') return null;
    const code = selectedGeoCode();
    const level = levelForCode(code);

    if (level === 'country') {
      return {
        text: 'Coverage: 47/47 counties · 290/290 constituencies · 1,450/1,450 wards · certified register 2022',
        source: `Source: IEBC · ward geography: 1,389 A — direct-aligned + ${crosswalkCount(code, level)} B — explicit crosswalks · constituency totals B — official derived`
      };
    }

    if (level === 'county') {
      const n = childCount(code, 'constituency');
      const x = crosswalkCount(code, level);
      return {
        text: `Coverage: ${n}/${n} constituencies in this county · 290/290 nationally · ${x} crosswalked ward ${x === 1 ? 'identity' : 'identities'}`,
        source: 'Source: IEBC · constituency values are exact sums of published CAW observations · no county value allocated downward'
      };
    }

    if (level === 'constituency') {
      const n = childCount(code, 'ward');
      const x = crosswalkCount(code, level);
      const total = S2.constituencyValueByGeoCode.get(code);
      return {
        text: `Coverage: ${n}/${n} wards in this constituency · ${x} explicit geography ${x === 1 ? 'crosswalk' : 'crosswalks'}${total != null ? ` · ${formatCount(total)} voters` : ''}`,
        source: x
          ? `Source: IEBC · ${n - x} A — direct-aligned ward ${n - x === 1 ? 'observation' : 'observations'} · ${x} B — crosswalked · constituency total B — official derived`
          : 'Source: IEBC · all child wards A — direct-aligned · constituency total B — official derived'
      };
    }

    const value = S2.wardValueByGeoCode.get(code);
    const crosswalk = S2.crosswalkByGeoCode.get(code);
    if (crosswalk) {
      return {
        text: `Coverage: exact IEBC ward observation${value != null ? ` · ${formatCount(value)} registered voters` : ''} · explicit geography crosswalk`,
        source: `Source: IEBC · B — Official transformed · source CAW ${String(crosswalk.source_ward_code).padStart(4, '0')} ${crosswalk.source_name} → Atlas ${crosswalk.canonical_name} · ${crosswalk.method.replaceAll('_', ' ')}`
      };
    }

    return {
      text: `Coverage: exact ward observation${value != null ? ` · ${formatCount(value)} registered voters` : ''} · certified register 2022`,
      source: 'Source: IEBC · A — Official direct-aligned · Kenya Gazette First Schedule'
    };
  }

  function ensureCoverageChip() {
    const sourceNote = $('#geo-source-note');
    if (!sourceNote) return null;
    let line = $('#sprint1-coverage');
    if (!line) {
      line = document.createElement('p');
      line.id = 'sprint1-coverage';
      line.setAttribute('role', 'status');
      line.style.cssText = 'margin:.7rem 0 0;padding:.55rem .75rem;border:1px solid rgba(18,60,50,.16);border-radius:999px;display:inline-block;font-size:.82rem;font-weight:600;background:rgba(18,60,50,.045)';
      sourceNote.insertAdjacentElement('afterend', line);
    }
    return line;
  }

  function refreshLocalContext() {
    const S2 = window.KDASprint2;
    if (!S2 || S2.error) return;
    const context = contextualCoverage();
    if (!context) return;
    const line = ensureCoverageChip();
    const sourceNote = $('#geo-source-note');
    if (line) {
      line.hidden = false;
      line.textContent = context.text;
    }
    if (sourceNote) sourceNote.textContent = context.source;
  }

  function addCatalogueLink() {
    const copy = $('.catalogue-copy');
    if (!copy || $('#sprint2-source-link')) return;
    const link = document.createElement('a');
    link.id = 'sprint2-source-link';
    link.className = 'primary-button';
    link.href = 'data/sprint2/README.md';
    link.textContent = 'Open Local Kenya sources →';
    link.style.cssText = 'display:inline-flex;margin-left:.55rem;margin-top:.55rem;text-decoration:none';
    const sprint1 = $('#sprint1-source-link');
    if (sprint1) sprint1.insertAdjacentElement('afterend', link);
    else copy.appendChild(link);

    const coverage = $('.catalogue-section .coverage');
    if (coverage) {
      const cells = coverage.querySelectorAll('div');
      if (cells[0]) cells[0].innerHTML = '<strong>13</strong><span>active indicators</span>';
      if (cells[1]) cells[1].innerHTML = '<strong>6</strong><span>validated source releases</span>';
      if (cells[2]) cells[2].innerHTML = '<strong>4</strong><span>populated geographic levels</span>';
    }
  }

  function installRefreshHooks() {
    const indicator = $('#geo-indicator');
    if (indicator) indicator.addEventListener('change', () => setTimeout(refreshLocalContext, 30));
    window.addEventListener('hashchange', () => setTimeout(refreshLocalContext, 30));
    const breadcrumb = $('#geo-breadcrumb');
    if (breadcrumb) breadcrumb.addEventListener('click', () => setTimeout(refreshLocalContext, 50));

    const sourceNote = $('#geo-source-note');
    if (sourceNote) {
      let applying = false;
      new MutationObserver(() => {
        if (applying) return;
        const context = contextualCoverage();
        if (!context || sourceNote.textContent === context.source) return;
        applying = true;
        sourceNote.textContent = context.source;
        applying = false;
      }).observe(sourceNote, { childList: true, characterData: true, subtree: true });
    }
  }

  async function boot() {
    const S2 = window.KDASprint2;
    if (!S2) return;
    await S2.ready;
    if (S2.error) {
      console.error('Sprint 2 UI unavailable:', S2.error);
      return;
    }
    addCatalogueLink();
    installRefreshHooks();
    setTimeout(refreshLocalContext, 80);
  }

  boot().catch(error => console.error('Sprint 2 UI:', error));
})();
