# Local Indicator Cascade Contract

## Purpose

Detailed constituency and ward intelligence is a first-class Kenya Data Atlas completion objective, not a best-effort extension of the county product.

**Every active indicator represented at county level MUST receive an explicit constituency and ward disposition before the P18–P26 programme can close.** P23/P24 template completion alone is insufficient.

This requirement may expand the governed local indicator surface and therefore may change the completion denominator. The denominator is not frozen at 20,115 if doing so would hide useful county indicators from constituency or ward users.

## Non-negotiable rule

For each active county indicator, both child levels must be classified as one of:

1. `direct_official` — an authoritative constituency/ward observation exists.
2. `exact_aggregation` — the value is an exact aggregation of authoritative child records.
3. `spatial_derivation` — the value is reproducibly calculated from authoritative geometry/point/line data.
4. `matched_local_calculation` — numerator and denominator are both available for the same child geography and compatible vintage.
5. `modelled_estimate` — a transparent defensible small-area model is approved and clearly labelled as modelled.
6. `governed_unavailable` — a local value cannot currently be produced defensibly; source/evidence constraint and refresh trigger are retained.
7. `not_applicable` — the concept genuinely exists only at the parent institutional/geographic level.

`governed_unavailable` and `not_applicable` count as governed dispositions, but not as published child-level numeric coverage.

## Prohibited shortcuts

- Never copy a county observation into each constituency or ward.
- Never copy a constituency observation into each ward.
- Never divide a parent total equally or by arbitrary shares merely to fill child slots.
- Never treat census sub-counties as electoral constituencies without an authoritative exact crosswalk.
- Never average parent rates downwards.
- Never compute a child rate using a numerator and denominator from incompatible geography or boundary vintages.
- Never classify unfinished source acquisition as `official_unavailable` solely because a scraper/API/runner is blocked.

## Reconciliation

Where an indicator is additive, the pipeline must test, where meaningful:

`Ward → Constituency → County → Kenya`

For rates, percentages and densities, child values must be recomputed from compatible child numerators/denominators rather than averaged from parent values.

## Required programme gates

### P23X — Constituency cascade convergence

P23 cannot be formally closed merely because the original constituency slot queue reaches zero. Before P24 proceeds to formal closure:

- enumerate every active county indicator;
- assign a constituency disposition to 100%;
- materialise every defensible constituency value;
- add newly defensible indicators to the governed local surface even if this expands the original denominator;
- retain explicit provenance, period, unit, method, boundary vintage and uncertainty requirements;
- govern-close genuinely unavailable/not-applicable cases;
- verify zero county→constituency inheritance.

### P24X — Ward cascade convergence

P24 cannot close merely because the original 13,050 ward slots reach zero. It additionally requires:

- a ward disposition for 100% of active county indicators;
- materialisation of every defensible ward value;
- governed treatment of all remaining indicators;
- zero constituency/county→ward inheritance;
- reconciliation for additive measures;
- explicit boundary holds rather than forced spatial matches.

## Completeness metrics

The build must ultimately publish, in addition to slot completeness:

- `active_county_indicators`
- `constituency_disposition_count`
- `constituency_disposition_pct`
- `constituency_numeric_indicator_count`
- `ward_disposition_count`
- `ward_disposition_pct`
- `ward_numeric_indicator_count`
- counts by disposition method
- prohibited parent→child inheritance count

P26 acceptance requires constituency and ward disposition coverage of **100%** for all active county indicators, alongside the ordinary slot-completeness gates.

## Source priority

Prefer, in order: primary official local tables/registries; exact official child aggregation; official administrative microdata/geocoded records; authoritative geometry-based derivation; transparent approved modelling; explicit governed closure.

The objective is maximum defensible local detail, not maximum filled cells.

## Completion definition

The Kenya Data Atlas is not complete until everything it knows at county level has been deliberately evaluated for constituency and ward representation, every responsibly obtainable child-level value has been published, and every remaining gap has an auditable reason rather than silently disappearing from the local experience.
