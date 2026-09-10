// P25 — site-wide null-state audit validator.
//
// The Local Indicator Cascade Contract's rule extends beyond the county
// cascade: a missing value must never be silently treated as zero, and every
// dash shown to a public visitor must carry an accessible reason nearby. This
// validator asserts, by reading the actual shipped UI source (the same
// discipline as scripts/ui/validate-completion-surface.mjs), that:
//   - Compare and Rankings & Insights never format an absent value as 0 and
//     always attach an explicit "no data" reason next to a missing cell;
//   - CountyIQ's top-line metric cards, county-benchmark rows, social metrics
//     and P05 breadth metrics all expose an explicit reason for a missing
//     observation instead of a bare dash or a borrowed/fake provenance label;
//   - the Evidence Hub keeps verified/not-published/not-found/inaccessible as
//     four distinct, separately labelled states rather than one generic
//     "missing" bucket;
//   - the Opportunity Finder renders a genuinely different message (and
//     styling hook) for "the registry loaded and currently governs zero
//     verified programmes" than for "the registry fetch/parse failed";
//   - the general county/constituency/ward profile-card renderer keeps its
//     established explicit-reason convention for a missing active indicator.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const assert = (ok, msg) => { if (!ok) throw new Error(`P25 null-state audit validation: ${msg}`); };

// --------------------------------------------------------------- Compare
{
  const src = read('assets/compare.js');
  assert(src.includes('No published value at this geography'), 'compare.js must show an explicit reason next to a missing comparison cell, not a bare dash');
  assert(/if\(value===null\|\|value===undefined\|\|Number\.isNaN\(Number\(value\)\)\)return\s*'—'/.test(src), 'compare.js formatValue must return a dash for null/undefined rather than coercing to 0');
  assert(/cell\.obs\?/.test(src), 'compare.js must branch cell rendering on whether an observation exists');
  assert(!/Number\(value\)\s*\|\|\s*0/.test(src), 'compare.js must not silently coerce a missing/NaN value to 0');
}

// --------------------------------------------------------------- Rankings
{
  const src = read('assets/rankings-insights.js');
  assert(src.includes('Not scored'), 'rankings-insights.js must render an explicit "Not scored" reason instead of a bare dash/zero for a withheld fiscal score');
  assert(src.includes('Score withheld'), 'rankings-insights.js must explain why a fiscal score is withheld');
  assert(/finite\(v\)\?.*:'—'/.test(src) || src.includes("finite(v)?Number(v).toLocaleString"), 'rankings-insights.js numeric formatter must fall back to a dash, not 0, for a non-finite value');
  assert(!/Number\(v\)\s*\|\|\s*0/.test(src) && !/Number\(value\)\s*\|\|\s*0/.test(src), 'rankings-insights.js must not silently coerce a missing/NaN value to 0');
}

// --------------------------------------------------------------- CountyIQ
{
  const src = read('assets/countyiq-view.js');
  assert(src.includes('Not published for this county'), 'countyiq-view.js must expose an explicit reason for a missing metric/benchmark, not a bare dash');
  assert(src.includes("hasObs?'':' missing'") || src.includes('hasObs?"":" missing"'), 'countyiq-view.js metricCard must mark a missing top-line metric with a distinct "missing" state, not render it identically to a real observation');
  assert(/badge\?esc\(badge\.toLowerCase\(\)\):'missing'/.test(src), 'countyiq-view.js metricCard must not show a fabricated provenance badge for an indicator with no canonical observation');
  assert(src.includes('Not published for this county') && src.includes("hasValue?"), 'countyiq-view.js benchmark() must expose an explicit reason when the selected county itself has no value, not just show the peer median');
  assert(src.includes('Not published for this county</span>') || src.includes("'Not published for this county'"), 'countyiq-view.js social metrics must retain their explicit missing-value reason');
  assert(src.includes('Not available</span>'), 'countyiq-view.js P05 breadth metrics must retain their explicit missing-value reason');
}

// ----------------------------------------------------------- Evidence Hub
{
  const src = read('assets/evidence-hub.js');
  const required = ['verified_document', 'verified_source_page', 'verified_source_collection', 'not_published', 'not_found', 'inaccessible'];
  for (const state of required) {
    assert(src.includes(`${state}:{label:`), `evidence-hub.js STATE map must define a distinct entry for "${state}"`);
  }
  // Every state must carry its own label AND its own help/title text — the
  // acceptance gate is "distinguishes", so two states sharing identical
  // wording would silently collapse them for a screen-reader user reading
  // the title attribute even if the visible label differs.
  const stateBlockMatch = src.match(/const STATE=\{([\s\S]*?)\};/);
  assert(stateBlockMatch, 'evidence-hub.js must define a STATE map');
  const labels = [...stateBlockMatch[1].matchAll(/label:'([^']+)'/g)].map(m => m[1]);
  const helps = [...stateBlockMatch[1].matchAll(/help:'([^']+)'/g)].map(m => m[1]);
  assert(labels.length === required.length, `evidence-hub.js STATE map must define exactly ${required.length} labels, found ${labels.length}`);
  assert(new Set(labels).size === labels.length, 'evidence-hub.js STATE labels must all be distinct');
  assert(new Set(helps).size === helps.length, 'evidence-hub.js STATE help/title text must all be distinct');
}

// ------------------------------------------------------- Opportunity Finder
{
  const src = read('assets/opportunity-finder.js');
  assert(src.includes('Programme data could not be loaded'), 'opportunity-finder.js must render an explicit data-fetch-error message when the registry fetch/parse fails');
  assert(src.includes('No verified current programmes are published'), 'opportunity-finder.js must render an explicit, non-error empty-registry message when zero programmes are currently governed');
  assert(src.includes('This is not a loading error'), 'opportunity-finder.js empty-registry message must explicitly tell the reader this is not an error');
  assert(src.includes('opportunity-error'), 'opportunity-finder.js must give the data-fetch-error state a distinct styling hook from the empty-registry state');
  assert(/if\(!registry\)\{/.test(src), 'opportunity-finder.js must branch on registry fetch failure (registry === null) separately from an empty programmes array');
  assert(/if\(!registry\.programmes\?\.length\)\{/.test(src), 'opportunity-finder.js must branch on a genuinely empty programmes array separately from a fetch failure');
  assert(src.includes("root.dataset.ready='error'"), 'opportunity-finder.js must record a distinct ready-state for the fetch-error case');
  assert(src.includes("root.dataset.ready='empty'"), 'opportunity-finder.js must record a distinct ready-state for the empty-registry case');
  const css = read('assets/opportunity-finder.css');
  assert(css.includes('.opportunity-empty.opportunity-error'), 'opportunity-finder.css must style the error state distinctly from the plain empty state');
}

// ------------------------------------------------------------ Profile cards
{
  const src = read('assets/place-profile.js');
  assert(src.includes('lifecycle-missing'), 'place-profile.js must keep its distinct missing-indicator card class');
  assert(src.includes('expected_availability_note') && src.includes('No observation is currently available for'), 'place-profile.js must keep an explicit fallback reason for a missing active-indicator card');
  assert(src.includes("badge missing"), 'place-profile.js must not show a real provenance badge on a missing-indicator card');
}

// -------------------------------------------------------- P25 ledger + roadmap
{
  const ledger = json('data/completeness/slot-ledger.json').rows;
  const row = ledger.find(r => r.indicator_code === 'IND-MOBILE-MONEY-VOLUME' && r.geo_code === 'KEN');
  assert(row?.resolved === true, 'the P25 mobile-money ledger slot must be resolved');

  const summary = json('data/completeness/summary.json');
  assert((summary.by_completion_phase?.P25 || 0) === 0, 'live completeness summary must show zero remaining P25 rows');

  const roadmap = json('data/data-completion-roadmap.json');
  const p25 = (roadmap.phases || []).find(p => p.id === 'P25');
  assert(p25, 'P25 roadmap entry must exist');
  const requiredAcceptance = [
    'the final P25 country slot is resolved or governed closed',
    'Compare and Rankings never treat absence as zero',
    'CountyIQ null metrics expose an explicit reason',
    'Evidence Hub distinguishes verified/not-published/not-found/inaccessible',
    'Opportunity Finder distinguishes no verified current programme from a loading/data error',
    'no public route contains an unexplained data dash'
  ];
  assert(JSON.stringify(p25.acceptance) === JSON.stringify(requiredAcceptance), 'P25 roadmap acceptance criteria must remain exactly as documented');
  assert(p25.progress?.mobile_money_slot_resolved === true, 'P25 roadmap progress must record the mobile-money slot as resolved');
  assert(Array.isArray(p25.progress?.ui_surfaces_audited) && p25.progress.ui_surfaces_audited.length >= 5, 'P25 roadmap progress must record which UI surfaces were audited');
}

console.log('P25_NULL_STATE_AUDIT_OK compare=ok rankings=ok countyiq=ok evidence-hub=ok opportunity-finder=ok place-profile=ok ledger=resolved');
