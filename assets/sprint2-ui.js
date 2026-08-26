/* Kenya Data Atlas — Data Sprint 2 UI supplements.
 * Makes Local Kenya coverage, crosswalk quality and the Mandera boundary hold
 * explicit while the user drills Kenya -> County -> Constituency -> Ward.
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
  function constituencyCodeForWard(code) { return code.replace(/-W\d+$/, ''); }
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
  function formatCount(value) { return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 0 }); }
  function holdCount(constituencyGeoCode) {
    const S2 = window.KDASprint2;
    return S2 ? S2.spatialHolds.filter(item => item.constituency_geo_code === constituencyGeoCode).length : 0;
  }
  function crosswalkCount(constituencyGeoCode) {
    const S2 = window.KDASprint2;
    const n = constituencyNumber(constituencyGeoCode);
    return S2 && n ? S2.crosswalks.filter(item => item.constituency_code === n).length : 0;
  }

  function contextualCoverage() {
    const S2 = window.KDASprint2;
    const select = $('#geo-indicator');
    if (!S2 || !select || select.value !== 'IND-REGISTERED-VOTERS') return null;
    const code = selectedGeoCode();
    const level = levelForCode(code);

    if (level === 'country') {
      const x = S2.crosswalks.length;
      return {
        text: `Coverage: 47/47 counties · 290/290 constituencies · 1,440/1,450 wards spatially mapped · ${x} mapped ward crosswalks · 10 ward rows on boundary hold`,
        source: `Source: IEBC · ${1440 - x} A — direct-aligned mapped wards · ${x} B — explicitly crosswalked mapped wards · all 1,450 source rows retained in totals`
      };
    }

    if (level === 'county') {
      const n = childCount(code, 'constituency');
      const isMandera = code === 'KEN-C009';
      return {
        text: isMandera
          ? `Coverage: ${n}/${n} constituencies · 10 ward rows on spatial boundary hold in Mandera East/Lafey`
          : `Coverage: ${n}/${n} constituencies in this county · registered-voter drill-down populated to ward level`,
        source: isMandera
          ? 'Source: IEBC · constituency totals use every published CAW row; uncertain ward geometry is not guessed'
          : 'Source: IEBC · constituency values are exact sums of published CAW observations · no county value allocated downward'
      };
    }

    if (level === 'constituency') {
      const expected = S2.sourceWardCountByGeoCode.get(code) || 0;
      const mapped = childCount(code, 'ward');
      const held = holdCount(code);
      const crossed = crosswalkCount(code);
      const total = S2.constituencyValueByGeoCode.get(code);
      if (held) {
        return {
          text: `Coverage: ${mapped}/${expected} wards spatially mapped · ${held} official ward rows held pending boundary reconciliation${total != null ? ` · ${formatCount(total)} constituency voters` : ''}`,
          source: 'Source: IEBC · constituency total B — Official derived from all child CAW rows · ward polygons intentionally withheld rather than misassigned'
        };
      }
      return {
        text: `Coverage: ${mapped}/${expected} wards spatially mapped · ${crossed} explicit geography ${crossed === 1 ? 'crosswalk' : 'crosswalks'}${total != null ? ` · ${formatCount(total)} voters` : ''}`,
        source: crossed
          ? `Source: IEBC · ${mapped - crossed} A — direct-aligned wards · ${crossed} B — crosswalked wards · constituency total B — Official derived`
          : 'Source: IEBC · all child wards A — Official direct-aligned · constituency total B — Official derived'
      };
    }

    const parent = constituencyCodeForWard(code);
    if (S2.heldConstituencyGeoCodes.has(parent)) {
      return {
        text: 'Ward-level value withheld from this polygon · official source row exists but current boundary attribution is unresolved',
        source: 'Source: IEBC · boundary hold · see Data Sprint 2 methodology for Mandera East/Lafey exception'
      };
    }
    const value = S2.wardValueByGeoCode.get(code);
    const crosswalk = S2.crosswalkByGeoCode.get(code);
    if (crosswalk) {
      return {
        text: `Coverage: exact IEBC ward observation${value != null ? ` · ${formatCount(value)} registered voters` : ''} · explicit geography crosswalk`,
        source: `Source: IEBC · B — Official transformed · source CAW ${String(crosswalk.source_ward_code).padStart(4, '0')} ${crosswalk.source_name} → Atlas ${crosswalk.canonical_name} · ${crosswalk.match_method.replaceAll('_', ' ')}`
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
    if (line) { line.hidden = false; line.textContent = context.text; }
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
    if (sprint1) sprint1.insertAdjacentElement('afterend', link); else copy.appendChild(link);

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
    if (S2.error) { console.error('Sprint 2 UI unavailable:', S2.error); return; }
    addCatalogueLink();
    installRefreshHooks();
    setTimeout(refreshLocalContext, 80);
  }

  boot().catch(error => console.error('Sprint 2 UI:', error));
})();