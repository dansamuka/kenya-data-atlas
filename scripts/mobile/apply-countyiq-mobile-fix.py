from pathlib import Path

CSS_MARKER = '/* CountyIQ mobile screenshot hardening — 29 Aug 2026 */'
CSS_BLOCK = r'''

/* CountyIQ mobile screenshot hardening — 29 Aug 2026 */
@media(max-width:760px){
  /* Keep the opening screen compact and make the searchable county control read as one control. */
  .ciq-hero{padding-top:2.15rem;gap:1rem}
  .ciq-hero h1{font-size:clamp(2.65rem,12vw,3.55rem);line-height:.94}
  .ciq-intro{margin-top:.85rem}
  .ciq-controls{padding:.85rem}
  .ciq-controls label{position:relative}
  .ciq-controls select{padding-right:3.45rem}
  .ciq-controls .kda-select-search-trigger{position:absolute;right:.3rem;bottom:.3rem;width:40px;height:40px;min-width:40px;margin:0;padding:0;display:grid;place-items:center;border-radius:8px;background:#f6f4ed;z-index:2}
  .ciq-mode{margin-top:.55rem}

  /* Reduce unnecessary vertical travel without reducing the evidence shown. */
  .ciq-place-facts,.kda-place-facts{margin:1rem 0;padding:.95rem}
  .kda-place-facts-grid{gap:.5rem}
  .kda-place-fact{min-width:0}
  .ciq-grid{gap:.75rem;margin-top:.75rem}
  .ciq-card{box-shadow:0 7px 22px rgba(22,43,35,.035)}
  .ciq-card-head p{max-width:none}
  .ciq-benchmarks{gap:.85rem}
  .ciq-benchmark{padding-bottom:.8rem}

  /* Fiscal summary and changes stay in compact 2-up grids on phones. */
  .ciq-fiscal-insights{grid-template-columns:repeat(2,minmax(0,1fr))!important;margin-top:.75rem}
  .ciq-fiscal-insights>div{padding:.75rem .7rem;min-height:94px}
  .ciq-fiscal-insights strong{font-size:1.12rem}
  .ciq-fiscal-history{margin-top:.85rem;overflow:visible}
  .ciq-fiscal-chart{padding:.7rem}
  .ciq-fiscal-chart svg{min-height:165px!important}

  /* Critical fix: preserve one real all-years fiscal table on mobile. */
  .ciq-fiscal-table-wrap{display:block;max-width:100%;overflow-x:auto!important;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;margin-top:.75rem;border-radius:.7rem;scrollbar-width:thin}
  .ciq-fiscal-table{display:table!important;width:100%!important;min-width:720px!important;border-collapse:collapse!important;font-size:.66rem!important}
  .ciq-fiscal-table thead{display:table-header-group!important}
  .ciq-fiscal-table tbody{display:table-row-group!important}
  .ciq-fiscal-table tr{display:table-row!important;width:auto!important;margin:0!important;border:0!important;background:#fff!important}
  .ciq-fiscal-table th,.ciq-fiscal-table td{display:table-cell!important;width:auto!important;padding:.62rem .5rem!important;text-align:right!important;white-space:nowrap!important;border-bottom:1px solid var(--line)!important}
  .ciq-fiscal-table td::before{content:none!important;display:none!important}
  .ciq-fiscal-table th:first-child,.ciq-fiscal-table td:first-child{position:sticky;left:0;z-index:2;text-align:left!important;min-width:82px;background:#f7f5ee!important;box-shadow:1px 0 0 var(--line)}
  .ciq-fiscal-table thead th:first-child{z-index:3}
  .ciq-fiscal-table th:nth-child(2),.ciq-fiscal-table td:nth-child(2),.ciq-fiscal-table th:nth-child(3),.ciq-fiscal-table td:nth-child(3){min-width:100px}
  .ciq-fiscal-table th:nth-child(4),.ciq-fiscal-table td:nth-child(4),.ciq-fiscal-table th:nth-child(5),.ciq-fiscal-table td:nth-child(5){min-width:92px}
  .ciq-fiscal-table th:nth-child(6),.ciq-fiscal-table td:nth-child(6){min-width:135px}
  .ciq-fiscal-table th:last-child,.ciq-fiscal-table td:last-child{min-width:70px}

  /* The five county-outcome cells are much too tall as a single-column phone feed. */
  .ciq-social-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ciq-social-metric{padding:.8rem;min-height:118px}
  .ciq-social-metric strong{font-size:1.35rem}
  .ciq-social-metric span,.ciq-social-metric em,.ciq-social-metric a{font-size:.59rem}
}

@media(max-width:430px){
  .ciq-fiscal-insights{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ciq-fiscal-insights>div{min-height:88px}
  .ciq-fiscal-table{min-width:680px!important}
  .ciq-social-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}

@media(max-width:350px){
  .ciq-hero h1{font-size:2.55rem}
  .ciq-fiscal-insights{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ciq-social-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ciq-social-metric{padding:.7rem;min-height:112px}
}
'''

css_path = Path('assets/mobile.css')
css = css_path.read_text()
if CSS_MARKER not in css:
    css_path.write_text(css.rstrip() + CSS_BLOCK + '\n')

validator_path = Path('scripts/ui/validate-mobile.mjs')
validator = validator_path.read_text()
anchor = "  console.log('MOBILE_OVERFLOW_GUARD_OK');\n\n  console.log('MOBILE_UI_ALL_OK');"
replacement = """  console.log('MOBILE_OVERFLOW_GUARD_OK');

  for(const token of [
    'CountyIQ mobile screenshot hardening',
    '.ciq-fiscal-table{display:table!important',
    '.ciq-fiscal-table thead{display:table-header-group!important}',
    '.ciq-fiscal-table td::before{content:none!important',
    'position:sticky;left:0',
    '.ciq-fiscal-insights{grid-template-columns:repeat(2,minmax(0,1fr))!important',
    '.ciq-social-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important',
    '.ciq-controls .kda-select-search-trigger{position:absolute'
  ]) assert(mobile.includes(token),`CountyIQ screenshot fix missing ${token}`);
  console.log('MOBILE_COUNTYIQ_DENSITY_OK fiscal=table-scroll sticky-fy insights=2up outcomes=2up');

  console.log('MOBILE_UI_ALL_OK');"""
if 'MOBILE_COUNTYIQ_DENSITY_OK' not in validator:
    if anchor not in validator:
        raise SystemExit('validate-mobile insertion anchor not found')
    validator_path.write_text(validator.replace(anchor, replacement))

print('MOBILE_COUNTYIQ_PATCH_APPLIED')
