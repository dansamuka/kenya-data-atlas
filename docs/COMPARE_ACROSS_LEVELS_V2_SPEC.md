# Compare Across Levels v2 — Product & Display Specification

## Purpose

`Across levels` is the Kenya Data Atlas comparison mode for asking a specific question:

> How does the same genuinely comparable indicator differ between a county, constituency and ward?

It must never create comparability by inheriting a county value into a constituency/ward, mixing incompatible units, or presenting raw totals as if geographic scale did not matter.

The experience should feel analytical and playful at the same time: a user should immediately see the geography ladder, understand why an indicator is allowed, and visually compare values without needing to understand the underlying registry model.

## Core product principles

1. **One measure, multiple levels.** The same indicator contract must be used for all selected geographies.
2. **No fake equivalence.** Cross-level charts may only use series cleared by the canonical eligibility registry.
3. **No inherited values.** Every displayed value must belong to the selected geography itself.
4. **Period transparency.** Prefer a common reference period. If periods differ, show the mismatch before the chart and on every row.
5. **Scale honesty.** Raw population, voter and currency totals remain same-level only. Rates, shares, indices, per-person measures, density and the documented land-area exception may cross levels.
6. **Shareable state.** The URL must preserve mode, selected places, selected indicator, topic and small-multiples mode.

## Interaction model

### 1. Mode switch

Compare exposes three first-class modes:

- Direct compare
- My life elsewhere
- Across levels

Clicking `Across levels` must immediately open its own panel and must not be overwritten by the Direct/Life URL synchronizer.

### 2. Geography ladder

The first visual block is a three-card ladder:

- 01 County
- 02 Constituency
- 03 Ward

Each card contains a level selector and place selector. Users may choose independent places across Kenya. A dedicated `Align to one hierarchy` action snaps the three cards into a nested county → constituency → ward chain using the current county/ancestor where possible.

A relationship indicator shows either:

- **Nested hierarchy** — the constituency belongs to the county and the ward belongs to the constituency; or
- **Independent places** — structurally comparable, but not a parent-child chain.

### 3. Indicator workbench

The workbench contains:

- search field;
- topic chips with counts;
- a selector containing only currently comparable indicators;
- Small multiples toggle;
- CSV download.

The selector should not make the user hunt through invalid metrics. Ineligible/unavailable metrics are summarized separately under `Why some indicators are not shown`.

### 4. Comparability passport

Before the visualization, show four explicit checks:

- Series eligibility
- Units & transform
- Reference period
- No inheritance

The passport is not decorative. It explains why the chart is valid and immediately exposes a period mismatch.

### 5. Hero comparison chart

For a selected indicator, render three horizontal value rows with:

- geography level and name;
- zero-baseline proportional bar;
- formatted value;
- difference versus the first selected geography;
- published period;
- source agency;
- quality badge.

For percentage units, the difference versus the first place is expressed in percentage points. For other numeric measures, show the relative percentage difference where the baseline is non-zero.

The chart must explicitly state that each concrete series passed the cross-level eligibility gate when the selected levels differ.

### 6. Small multiples

Small multiples show up to nine comparable indicators at once. Each indicator keeps its own independent scale to avoid mixing units. The user can return to a single indicator without losing geography selections.

## Visual direction

The display should feel distinct from the ordinary county comparison table while remaining part of the Atlas design system.

- Large editorial serif headline: `One measure. Three levels. No fake equivalence.`
- Deep Kenya-Atlas green comparability card.
- Three numbered geography cards connected conceptually as a ladder.
- Rounded relationship/status elements, but square-edged analytical cards for charts.
- Strong hierarchy between explanation, controls and results.
- Dense data remains readable on desktop; mobile collapses to one-column cards without horizontal page overflow.

## Data contract

For each active indicator and selected geography:

1. Find published series for the exact geography and indicator.
2. Group series by comparison contract:
   - comparability group;
   - unit;
   - frequency;
   - period type;
   - transformation;
   - price basis;
   - seasonal adjustment.
3. Require a common contract across all selected places.
4. When more than one geographic level is present, require `cross_level_eligible === true` for every selected concrete series.
5. Prefer the latest common reference period.
6. If there is no common period, use each series' latest observation only with a visible period warning.
7. Reject non-numeric observations from the chart.

## URL contract

Across-level state uses the Compare route:

`#/compare?mode=cross-level&x0=<geo_code>&x1=<geo_code>&x2=<geo_code>&xindicator=<indicator_id>`

Optional state:

- `xmulti=1`
- `xtopic=<topic-key>`

The route coordinator must recognize `mode=cross-level` as a third mode rather than coercing it to `direct` or `life`.

## Failure behavior

If the eligibility registry or comparison data cannot load:

- the Across-level panel shows a local error message;
- Direct Compare remains usable;
- no fallback or inherited geography value is shown.

If no metric is eligible for the selected places:

- show an honest empty state;
- suggest changing geography combination or clearing the filter;
- do not silently switch to another level or metric.

## Accessibility

- Mode button uses tab semantics already established by Compare.
- Every selector has an accessible label.
- Bars expose a text `aria-label` with place, value and period.
- Status is communicated with text as well as color.
- All controls remain keyboard reachable.
- Reduced-motion users receive no staged passport animation.
- Mobile layout must not create document-level horizontal scrolling.

## Acceptance tests

1. `Across levels` appears after the Compare workspace loads.
2. Clicking it keeps the Across-level panel visible for at least the next render cycle and updates the URL to `mode=cross-level`.
3. Direct → Across levels → Direct → Across levels switching works without reload.
4. A deep link with `mode=cross-level` restores the panel.
5. Changing geography does not cause the router to switch back to Direct or Life.
6. The indicator selector contains at least one valid option for the default county/constituency/ward chain when current data supports one.
7. The result area either shows a governed chart or an explicit honest empty/error state.
8. The page has no uncaught JavaScript error during the interaction.
9. Mobile view at 390px does not overflow the document horizontally.
10. CSV download uses only the selected exact geography series and includes eligibility metadata.
