# P08 — County Development & Performance Index methodology

## Current publication status

P08 defines the composite methodology; P09 decides what part of that output may be published. After the P09-v2 gate, the current status is **`published_snapshot`**:

- the latest cross-sectional 0–100 score and broad relative-position band may be displayed;
- exact ranks remain diagnostics/sensitivity information;
- longitudinal composite movement remains withheld.

This is not a comprehensive county-development score and is not a governor score.

## Current included indicators

The fixed P08 inclusion rule currently returns five indicators across four domains:

- **fiscal:** overall budget absorption; development budget absorption;
- **living standards:** rent burden;
- **education:** school attendance rate;
- **economic:** labour-force participation.

The living-standards classification reflects the corrected treatment of household rent/expenditure; it is not public-finance expenditure.

## Inclusion rule

An indicator enters the composite only when it:

1. has a published non-null `higher_is_better` direction rule; and
2. is P06 ranking-eligible for all 47 counties with no exception.

No missing county is imputed to make an indicator qualify.

## Normalisation

Each included indicator is winsorized at the national 5th/95th percentiles and min-max scaled to 0–100, oriented so 100 is the favourable end according to the published direction rule.

## Weighting specifications

P08 computes three specifications:

1. `equal_domain` — each represented domain has equal total weight; this is P09's primary published snapshot specification.
2. `equal_indicator` — all five included indicators have equal weight; P09 treats this as the second plausible full-composite specification.
3. `fiscal_execution_only` — an extreme stress test that deliberately drops non-fiscal domains. P09 publishes it as sensitivity evidence but does not use it as the current-snapshot release gate.

## Correlation review

Pairwise correlations among included indicators are published. Highly correlated pairs are flagged so apparent breadth created by near-duplicate measures is visible rather than hidden.

## P09 publication constraint

P08 by itself never promotes a score. `scripts/countyiq/build-mart.mjs` applies the versioned P09 release decision after building the P08 scenarios. See `docs/countyiq/P09-HISTORICAL-VALIDATION.md` for the current snapshot GO / longitudinal NO-GO decision.

## Files

- `scripts/p08/performance-index.mjs` — inclusion, normalization, scenario scores/ranks and correlation diagnostics.
- `scripts/countyiq/validate-p08.mjs` — validates the methodology and permits `published_snapshot` only when the P09 snapshot gate has actually passed.
