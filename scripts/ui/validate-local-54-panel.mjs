import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(`Local-54 panel UI validation: ${msg}`); };

const profile = read('assets/place-profile.js');
const css = read('assets/place-profile.css');
const provenance = read('assets/provenance-v2.js');
const browserSpec = read('tests/p16/local-54-panel.spec.mjs');

// gate: every constituency and ward renders the governed 54-indicator framework -- the tab must
// be added for every geography level, not gated behind an eligibility check like the other tabs.
assert(profile.includes("tabs.push('local54')"), 'the local54 tab must be pushed unconditionally for county');
assert(profile.includes("(state.taxonomy.tabs?.[geo.level]||[]).filter(tab=>isEligibleConditionalTab(geo,tab)),'local54'"), 'the local54 tab must be appended unconditionally for constituency/ward');

// gate: source tier/period/confidence/conflict are inspectable + secondary evidence is visually
// distinct from official evidence -- the exact public badge vocabulary must be present.
const REQUIRED_BADGE_LABELS = ['Official', 'Derived from official data', 'Secondary — verified', 'Secondary — corroborated', 'Probable value — sources conflict', 'Estimated/modelled', 'Data unavailable', 'Not applicable'];
for (const label of REQUIRED_BADGE_LABELS) assert(profile.includes(label), `place-profile.js must render the required public badge label "${label}"`);
assert(profile.includes('l54-official') && profile.includes('l54-derived') && profile.includes('l54-secondary-verified') && profile.includes('l54-secondary-corroborated') && profile.includes('l54-probable') && profile.includes('l54-modelled') && profile.includes('l54-unavailable') && profile.includes('l54-na'), 'place-profile.js must map every badge label to a namespaced l54-* CSS class');
for (const cls of ['l54-official', 'l54-derived', 'l54-secondary-verified', 'l54-secondary-corroborated', 'l54-probable', 'l54-modelled', 'l54-unavailable', 'l54-na']) {
  assert(css.includes(`.badge.${cls}`), `place-profile.css must style .badge.${cls}`);
}
assert(profile.includes('conflict_note') && profile.includes('l54-conflict'), 'place-profile.js must render an inspectable conflict note when present');
assert(profile.includes("json('data/completeness/local-54-reason-catalogue.json')"), 'place-profile.js must resolve closure reasons from the shared reason catalogue rather than duplicating reason text per-geography');
assert(profile.includes('ind.confidence'), 'place-profile.js must be able to expose confidence -- present in the fetched subset row');
assert(profile.includes('ind.period_label') || profile.includes('period_label'), 'place-profile.js must expose the period for each indicator');

// gate: unavailable/not-applicable indicators remain visible (never omitted) -- every one of the
// 54 fetched rows must be rendered, not filtered by status.
assert(profile.includes('subset.indicators.map(ind=>local54CardHtml(ind,reasonById))'), 'every indicator in the subset must be rendered, including unavailable/not_applicable ones');
assert(!/subset\.indicators\.filter\([^)]*\)\.map\(ind=>local54CardHtml/.test(profile), 'the local-54 card list must not be filtered before rendering -- unavailable/not-applicable cells must remain visible');

// gate: county representative is visible.
assert(profile.includes('local54RepHtml') && profile.includes('subset.representative'), 'place-profile.js must render the representative from the subset');
assert(profile.includes('l54-stale'), 'place-profile.js must flag a representative whose freshness_status is not current');

// gate: secondary evidence cannot be visually mistaken for official evidence -- the older A-E
// badge classes and the newer l54-* classes must never collide, and the unrelated legacy
// provenance popover (registry-driven, does not cover the local-54 evidence model) must not
// hijack l54 badge clicks.
for (const legacy of ['.badge.a{', '.badge.b{', '.badge.c{', '.badge.d{', '.badge.e{']) {
  assert(!css.includes(legacy), `place-profile.css must not redefine the legacy ${legacy} rule from styles.css -- the l54-* vocabulary is namespaced separately`);
}
assert(provenance.includes('isL54Badge'), 'the legacy provenance popover must exempt l54-* badges, which have their own accurate inspection panel');

// gate: automated UI/browser coverage exists for this panel.
assert(browserSpec.includes("toHaveCount(54)"), 'browser regression must assert exactly 54 indicator cards render');
assert(browserSpec.includes('l54-stale'), 'browser regression must assert a stale representative is flagged');
assert(browserSpec.includes('l54-conflict') || browserSpec.includes('conflict history'), 'browser regression must assert conflict history is inspectable');
assert(browserSpec.includes('AxeBuilder'), 'browser regression must include an accessibility gate for the panel');

console.log('P34_LOCAL54_PANEL_UI_OK badge_labels=8 gates=all');
