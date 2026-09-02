# KDA Rankings + Pulse visual cleanup — ready-to-apply patch spec

## Purpose

Correct the two remaining visual-clarity defects visible on the public KDA site without changing any published data, ranking logic, values, periods, provenance, or canonical tables.

1. Rankings charts must use **three-letter county codes as the default visual label** and reveal the full county name/context only through interaction or pinned state.
2. Home and National Pulse metric cards must contain **one mini-chart only**. The retained chart is the lower reddish history sparkline; the duplicate green sparkline is removed.

## Non-goals

- No change to diagnostic ranks, plausible ranges, percentiles, indicator direction, or published values.
- No change to fiscal methodology or composite weights.
- No redesign of the canonical Rankings tables.
- No new modelled or interpolated observations.

## Files

### New

- `assets/visual-clarity-cleanup.js` — idempotent progressive-enhancement cleanup for Rankings and Home/Pulse.
- `tests/p16/rankings-pulse-visual-cleanup.spec.mjs` — browser acceptance contract.

### Updated

- `assets/lazy-integrations.js` — loads visual clarity on Home, National Pulse and Rankings routes from the shared route-aware bootstrap.
- `tests/p16/rankings-legibility.spec.mjs` — updates the prior selective-label contract to the new all-county acronym contract.

## Rankings contract

### Default county labels

- Every rendered Development position dot displays exactly one three-letter county code by default.
- Every rendered Indicator national-distribution dot displays exactly one three-letter county code by default.
- Full county-name helper spans inside the dot buttons are removed because the button's `aria-label` already carries the complete accessible name and published context.
- County marks retain their existing x/y positions, lane assignment, whiskers, rank, percentile, value, and source semantics.

### Interaction

- Pointer hover and keyboard focus reveal a compact full-name/context card adjacent to the mark.
- Clicking/tapping a county mark pins that county using the existing Atlas-wide pin API and URL state.
- A pinned Development county receives a persistent `YOU ARE HERE` callout with its full county name.
- Indicator Rankings retain the existing `YOU ARE HERE` callout and pinned-county summary cards.
- Hover/focus callouts are presentation only; accessible names remain on the mark buttons.

### Accessibility

- All county buttons remain keyboard reachable.
- Full county/context stays in `aria-label` even though the visual label is abbreviated.
- Enter/Space/click behavior continues to use the existing Atlas pin state.
- `prefers-reduced-motion` remains respected.
- Canonical tables remain the source of truth and fallback.

### Responsive behavior

- Existing internal chart horizontal scrolling is retained as a fallback.
- The page itself must not horizontally overflow on mobile.
- Three-letter labels use the existing packed lanes; no full county-name text is persistently placed inside the plots.

## Home + National Pulse contract

### Single mini-chart

For every source-backed `.metric-card` on `#pulse-grid`, `#home-glance` or `#home-glance-grid`:

- remove every `.v2-card-spark` instance (the duplicate upper/green enhancement);
- retain at most one `.viz-card-spark` instance;
- if a retained sparkline is not yet present but the card has at least two published observations in `initial-pulse.json`, create the same single history sparkline from those published observations;
- style the retained sparkline as the reddish history line used in the lower card visual;
- never create a trend for a single observation.

The Home clone and the Pulse source grid must therefore converge to the same one-chart DOM contract regardless of route order.

## Loading contract

- Visual clarity is loaded by the shared route-aware integration bootstrap, not by a CountyIQ-only cleanup path.
- Initial Home (`#/` or no hash), National Pulse and Rankings all load the module.
- Route transitions to `home`, `pulse` or `rankings` also load/re-run it idempotently.
- Module readiness is set only after its first asynchronous Pulse/Home cleanup pass completes.

## Acceptance criteria

### Rankings

- 47 Development dots render 47 visible three-letter labels.
- No Development dot contains a leaked `.sr-only` full-name child.
- Hover/focus on a Development mark reveals its full county name.
- Clicking a Development mark updates `pinned=` URL state and displays `YOU ARE HERE` plus the full name.
- Indicator distribution renders one visible three-letter label per plotted county dot.
- No Indicator dot contains a leaked `.sr-only` full-name child.
- Hover/focus reveals the full county name; click/tap preserves the existing indicator pin contract.
- No uncaught runtime errors.
- Mobile has no page-level horizontal overflow.

### Home / Pulse

- The visual-clarity module loads and reaches `ready` on both routes.
- `.v2-card-spark` count is zero on Home and Pulse metric-card grids.
- No metric card contains more than one `.viz-card-spark`.
- At least one source-backed card on each surface renders a retained reddish sparkline.
- Card values, deltas, reference periods, source labels, badges, and series links remain unchanged.

## Release gate

The patch is mergeable only when the exact PR head passes:

1. P16 release audit
2. Validate Atlas data
3. Release rehearsal
4. P22 NDMA freshness governance
5. P22 food-security source gate
6. Data completion execution governance
7. Pulse history coverage

Do not weaken a meaningful assertion to obtain a green build; fix the underlying visual/runtime defect instead.
