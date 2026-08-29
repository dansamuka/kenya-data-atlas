# P06 — Peer groups, percentiles and trend intelligence

## What this phase adds
Every indicator in the CountyIQ mart already carried empty `ranking` and
`trend` slots (defined back in P02) and an empty `benchmarks` block. P06
fills those in:

- **Peer groups** — each county is assigned to one of four population-size
  tiers (quartiles of the 2019 census county population). This is the only
  peer axis shipped in this release.
- **National and peer-group rank/percentile** for every indicator the
  existing P02 taxonomy already permits to be ranked.
- **Trend classification** — one-period and medium-term change, volatility
  (standard deviation of period-over-period change), and a direction label,
  computed from each indicator's own active history.
- **Direction and composite-eligibility rules** for all 98 registry
  indicators — see `scripts/p06/direction-rules.mjs`, the single published,
  versioned source of truth for "does higher mean better here."

## Why population quartiles, and not an ASAL/non-ASAL axis
An arid/semi-arid-lands split was considered, since it is a real and
policy-relevant grouping in Kenya. It was set aside for this release: the
23-county figure is consistently cited by the Council of Governors and
NDMA, but a single, current, unambiguous county-by-county list could not be
confirmed against an official primary source at implementation time —
published secondary sources disagree on specific county membership (a 2014
academic classification differs from figures used in more recent drought
bulletins). Per this project's standing rule, an unconfirmed classification
is left out rather than approximated. Population-quartile grouping was used
instead because it is fully reproducible from a single indicator (
`IND-POPULATION`) already active in this registry with an A-grade
provenance badge. Extending peer grouping to include a verified ASAL axis
is a candidate for a future phase, not this one.

## Direction rules: what "higher is better" means and does not mean
`higher_is_better` is asserted only where a directional reading is
substantively defensible and the value is genuinely comparable across
counties. It is deliberately left `null` (no value judgement made) for:

- identity fields (MP/MCA name)
- raw levels without a population or area denominator (budget totals, GCP
  level, facility counts, road km, land area, registered voters) — these
  are not comparable across counties of very different size, consistent
  with the per-capita-withholding policy already in the P03 fiscal block
- national-level figures that are identical for every county (CBR,
  T-bill rate, USD/KES, national GDP/inflation/FDI, several World
  Bank series) — ranking an identical value is meaningless
- indicators where a "better" reading is itself a contested value
  judgement this project should not assert (household size, population
  growth, net migration, housing tenure, disability prevalence,
  hospital-bed utilisation, CDF/ward-fund allocation amounts, turnout)

A `null` direction does not remove an indicator from `ranking` — a
position is still shown (e.g. "4th highest of 47") — but it is never
described as good or bad, and it is excluded from every composite score,
now and in P08.

## Trend language
When `higher_is_better` is set, `trend.direction` uses evaluative language
(`improving` / `worsening` / `stable`). When it is `null`, `trend.direction`
uses purely descriptive language (`rising` / `falling` / `flat`) — the
validator enforces that these two vocabularies are never mixed.

## What P06 deliberately does not do
- It does not compute a domain score or any composite index. Domain and
  overall scores remain `null` / `not_published` — that is P08's job, and
  per the CountyIQ guardrails a composite must not be published before its
  own methodology and robustness gates pass.
- It does not change any existing ranking-eligibility decision made by the
  P02 taxonomy (`ranking_allowed`, `comparable`, badge/coverage/period
  requirements). P06 only computes rank/percentile/trend for metrics that
  were already eligible; it never overrides an ineligibility.

## Files
- `scripts/p06/direction-rules.mjs` — published direction + eligibility
  rules for all 98 indicators, with a one-line basis per rule.
- `scripts/p06/apply-direction-rules.mjs` — applies the rules onto
  `data/indicators/registry/indicators.json` (`higher_is_better`).
- `scripts/p06/peer-intelligence.mjs` — peer-group assignment and the
  rank/percentile/trend computation, called from
  `scripts/countyiq/build-mart.mjs`.
- `scripts/countyiq/validate-p06.mjs` — gate: methodology is published,
  peer tiers are balanced and neutrally labelled, ranking values are in
  range and mirror the published direction rule, directional/non-directional
  trend vocabularies are never mixed, UI surfaces the feature, roadmap
  moved forward correctly.
