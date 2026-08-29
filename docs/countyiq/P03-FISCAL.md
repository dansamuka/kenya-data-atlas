# P03 — County fiscal history and denominator discipline

P03 exposes the strongest already-published county history in the Atlas without creating another data store. The CountyIQ fiscal panel is generated from the canonical indicator registries, whose Controller of Budget observations originate in the frozen Sprint 3 source snapshots plus Sprint 1 FY2024/25.

## Fiscal panel

- Coverage: all 47 counties, FY2013/14 through FY2024/25 (12 fiscal years).
- Measures: total budget, total expenditure, overall budget absorption, and development budget absorption.
- Every fiscal row retains canonical observation IDs and source/provenance metadata.
- 1-year, 3-year and 5-year changes are calculated only from exact fiscal-year endpoints. Budget/expenditure changes are percentages; absorption changes are percentage points.
- Absorption volatility is the population standard deviation of the 12 published annual rates. It is descriptive and is not a quality score.

## Ranking discipline

Every displayed fiscal rank is calculated against the 47 counties in the same fiscal year. Budget and expenditure ranks are explicitly scale positions, not performance rankings. Absorption ranks are same-year rate positions and likewise do not imply causal or administrative performance.

## Denominator discipline

Per-capita budget and expenditure are not published in P03. The canonical Atlas does not currently contain an explicit compatible annual county population denominator aligned to all twelve fiscal years. County census observations are not silently interpolated, projected or rolled forward, and Kenya-level population series are never inherited to counties.

The mart publishes this withholding decision as machine-readable denominator metadata. A future per-capita measure may be activated only when an official or otherwise explicitly approved county population series supplies compatible periods and its methodology is documented.

## Reproducibility

`scripts/countyiq/build-mart.mjs` produces the panel deterministically. `scripts/countyiq/validate-p03.mjs` requires 47 x 12 fiscal coverage, common-period rankings, canonical observation traceability, explicit denominator withholding, and the mobile fiscal UI.
