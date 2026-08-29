# P09 — Historical validation and publication-scope decision

## Publication decision

P09 now separates two claims that the earlier gate incorrectly treated as one:

1. **Can the latest cross-sectional composite be shown publicly? — GO, with constraints.**
2. **Can the composite be interpreted as a stable longitudinal county-performance series? — NO-GO.**

The released status is therefore `published_snapshot`, not `published` without qualification.

### What is public

CountyIQ may show:

- the latest 0–100 P08 composite snapshot;
- an equal-domain weighting as the primary specification;
- a broad five-band relative position (`Top 20%`, `Upper-middle 20%`, `Middle 20%`, `Lower-middle 20%`, `Bottom 20%`);
- exact scenario ranks only as clearly labelled diagnostics/sensitivity information.

It may **not** describe exact rank as a settled league-table position or show composite improvement/decline through time.

## Snapshot robustness gate

The gate uses the two plausible *full-composite* specifications:

- `equal_domain`;
- `equal_indicator`.

`fiscal_execution_only` remains published as an extreme stress test, but is excluded from the release gate because it removes whole non-fiscal domains rather than simply choosing a different full-composite weighting.

The pre-declared snapshot rule is:

> GO only when at least two plausible full-composite weighting scenarios exist and at least 85% of counties remain in the same or an adjacent 20-percentage-point relative-position band across them.

Observed result: **47 of 47 counties (100%) remain in the same or an adjacent band**; 25 remain in exactly the same band. The average exact-rank range across the two plausible specifications is about **4.5 places**, and no county has a plausible-scenario range of 20 or more places.

This is enough to publish a **banded current snapshot**. It is not evidence that the exact numerical rank is model-free.

## Longitudinal gate: NO-GO

Only two of the five included indicators have multi-year county history:

- `IND-COUNTY-BUDGET-ABSORPTION`;
- `IND-COUNTY-DEVELOPMENT-ABSORPTION`.

The remaining three are single-period inputs and therefore cannot be reconstructed historically without fabrication:

- `IND-RENT-BURDEN`;
- `IND-SCHOOL-ATTENDANCE-RATE`;
- `IND-LABOUR-FORCE-PARTICIPATION`.

The reconstructable fiscal-execution sub-index covers FY2013/14–FY2024/25. Average consecutive-year Spearman rank correlation is about **0.43**, below the stated 0.80 longitudinal-stability gate. The correct interpretation is that fiscal-execution ordering moves materially from year to year.

Accordingly, CountyIQ must not publish a historical composite trend or claim that a county's current snapshot rank represents a durable underlying ordering.

## Domain-classification correction

P09 also depends on the corrected upstream classification of household rent burden as **living standards**, not public finance. The earlier keyword classifier picked up “household expenditure” and incorrectly treated rent burden as fiscal. The exception is now explicit in `scripts/countyiq/build-mart.mjs`.

## Files

- `scripts/p09/historical-validation.mjs` — P09-v2 split snapshot/longitudinal gates and band robustness.
- `scripts/countyiq/validate-p09.mjs` — mechanically verifies the GO/NO-GO scope, 85% band gate, exact-rank restriction and longitudinal withholding.
- `data/countyiq/county-summary.json` — each county contains `performanceIndex.snapshot` and the full versioned release decision.
