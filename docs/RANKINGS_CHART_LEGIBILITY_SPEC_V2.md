# Kenya Data Atlas — Rankings Chart Legibility Spec v2

Status: implementation contract
Route: `#/rankings`
Baseline: `main@593cb180e8064a07627ca4bffbc085e62ab5e288`

## Problem

The Rankings visuals are data-correct but visually over-compressed. At desktop widths, 47 county marks can occupy only ~136–154 px of plot height, causing county names and marks to collide. The problem is vertical density, not lack of horizontal scrolling.

## Non-negotiable data contract

- Canonical tables remain the accessible source of truth.
- No new scores, ranks, percentiles, trends, plausible ranges, weights, or observations may be created.
- Development-spectrum x-position uses published diagnostic rank; whiskers use the published plausible rank range.
- Indicator-distribution x-position uses published national rank; percentile text uses the published ranking output.
- Every county remains keyboard reachable through an interactive mark even when its visible text label is suppressed.
- Hover/focus tooltips and `aria-label` retain full county context.

## Desktop geometry

### Development snapshot — position spectrum

- Plot minimum width: 920 px.
- Plot height: 360 px.
- Seven deterministic collision-avoidance lanes.
- Marks use lane packing based on x-distance; do not use simple `index % laneCount` assignment.
- Lane centres start at 52 px with 36 px separation.
- Diagnostic axis remains at the bottom with at least 48 px reserved below the lowest lane.
- Whiskers stay aligned to the same lane as their county dot.

Persistent county labels are deliberately sparse:
- ranks 1–5;
- ranks 43–47;
- currently pinned county;
- labels introduced by hover or keyboard focus.

All other counties remain visible as dots/whiskers and reveal their county name on hover/focus.

### Indicator rankings — national distribution

- Plot minimum width: 920 px.
- Plot height: 250 px.
- Four deterministic collision-avoidance lanes.
- Dots are vertically separated while x-position continues to represent published national rank.
- The pinned county is always visibly labelled and retains the `You are here` treatment.
- Persistent labels: top 3, median-ranked observation, bottom 3, and pinned county.
- All other county names are hover/focus labels only.
- Context cards below the plot remain unchanged: pinned county, national rank, percentile, latest value/period.

### Indicator value beeswarm — “Where counties actually sit”

- Card receives more vertical breathing room.
- SVG presentation target: at least 230 px on desktop and 190 px on small screens.
- Dot hover/focus target is visually enlarged without changing the underlying value position.
- This remains a secondary value-distribution view; the national-rank distribution and canonical table remain authoritative for ranking.

## Typography and interaction

- Persistent county label: 12–13 px desktop, 11–12 px mobile, line-height >= 1.2.
- Labels use a light opaque background/halo so they remain readable over whiskers and neighbouring marks.
- Hover/focus brings the active mark and label to the foreground.
- Pinned county uses the existing rust/red accent and must remain distinguishable without relying on motion.
- `prefers-reduced-motion: reduce` removes transitions/animations but does not remove labels or focus state.

## Mobile

At viewport widths <= 720 px:
- route/page must not gain horizontal overflow;
- each plot remains internally horizontally scrollable;
- development plot min-width: 820 px; plot height: 330 px;
- indicator rank plot min-width: 820 px; plot height: 230 px;
- persistent label density does not increase;
- pinned label remains visible.

## Acceptance tests

Browser tests must verify:

1. Development plot renders >= 330 px high on desktop.
2. Development uses at least six occupied lanes with 47 published county marks.
3. Persistent development labels are bounded (<= 12 before interaction) and include rank 1 and rank 47.
4. Hover/focus reveals a previously suppressed county label.
5. Indicator plot renders >= 220 px high on desktop.
6. Indicator persistent labels are bounded (<= 8 before interaction).
7. Clicking a county dot updates the `pinned` URL state and keeps `You are here` visible.
8. The pinned county has a visible text label in the plot and matching highlighted table row.
9. At 390 px viewport width, document `scrollWidth <= clientWidth + 1`.
10. No uncaught browser errors.

## Scope boundary

This increment is purely a legibility/accessibility refinement. Fiscal-composite redesign remains a separate visual increment so that Rankings readability can be validated and released independently.