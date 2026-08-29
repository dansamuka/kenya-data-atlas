# P07 — Development Gap Calculator and evidence narrative engine

## What this phase adds
For every indicator P06 made ranking-eligible, P07 computes a **gap**
against a benchmark and generates **template sentences** describing it.
Nothing here is free-composed text: every sentence is filled from numbers
already sitting in the mart (P06's rank/percentile/trend fields, P03's
fiscal panel), so it can always be reconstructed by hand from the same
displayed statistics.

## Benchmark selection rule (published, fixed)
Prefer the peer-group (population-quartile) median. Fall back to the
national median only when no peer median is available. Every gap records
which one was actually used (`benchmark_source`).

## The one monetary figure, and why only one
`gaps.monetary_counterfactual` converts the **overall** budget-absorption
gap into a real KES figure:

```
(benchmark_absorption_rate − county_absorption_rate) × county_total_budget
```

This is a real number because the total budget is an actual figure in the
mart and overall absorption is literally expenditure ÷ budget, so a
percentage-point gap times the budget is the KES amount of approved budget
that would have been executed at the benchmark rate.

**Development absorption is deliberately not converted to a KES figure.**
This mart has no active development-budget denominator distinct from the
total budget (the same reason the P03 fiscal block already withholds
per-capita measures) — so a development-only KES figure would look
plausible but would not be a real, traceable number. Producing it anyway
is exactly the "unsupported monetary opportunity claim" the P07 acceptance
gate exists to prevent. The validator explicitly checks that no other gap
formula references currency.

## Narrative sections
Three per county, each capped at 5 items and each sourced from a single
mechanical rule:

- **Working well** — composite-eligible indicators at or above the 75th
  percentile within the county's peer group, on the favourable side of
  their own direction rule.
- **Needs attention** — the mirror case, at or below the 25th percentile.
- **What changed** — indicators with a two-period trend classified
  `improving` or `worsening` in P06 (never shown for non-directional
  indicators, which would have nothing evaluative to say).

## A bug worth recording
The first implementation used the indicator's general `higher_is_better`
rule to decide whether a sentence said "higher" or "lower" than the
benchmark. That is wrong: it produced sentences like "68%... higher than
the median of 83%" for a *weakness* line, because higher-is-better was
true even though this particular county's value was below the benchmark.
Fixed by comparing `county_value` to `benchmark_value` directly. The
validator now includes a regression check that parses the wording back out
of generated sentences and confirms it matches the actual numbers quoted
in the same sentence — this class of bug is easy to miss by eyeballing a
single (favourable) example, which is how it shipped in the first pass.

## Files
- `scripts/p07/gap-calculator.mjs` — gap computation, monetary
  counterfactual, and template narrative generation.
- `scripts/countyiq/validate-p07.mjs` — gate: every gap exposes its
  formula/source/period/denominator, the monetary figure is reproducible
  from its own stated inputs, no other gap references currency, every
  narrative sentence contains a number and a period, and direction wording
  matches the actual county-vs-benchmark comparison.
