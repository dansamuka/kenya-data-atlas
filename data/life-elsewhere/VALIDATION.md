# County Life / My Life Elsewhere — Release Validation

**Release:** v0.10.0  
**Validated:** 28 August 2026  
**Scope:** five county-level comparison families for Direct Compare and My Life Elsewhere.

## Published metrics

| Family | Indicator | Reference period | Coverage |
|---|---|---|---:|
| Cost & affordability | Rent as a share of household expenditure | 2024 | 47/47 counties |
| Housing | Households owning their main dwelling | 2021 survey | 47/47 counties |
| Health access / supply | Health facilities in the 2023 census target | KMHFL as of 1 Aug 2023 | 47/47 counties |
| Education | Population age 3+ at school / learning institution | 2019 census | 47/47 counties |
| Employment | Labour-force participation rate, age 15–64 | 2019 census | 47/47 counties |

Total frozen source rows: **235 = 5 indicators × 47 counties**.

## Release gates passed

The release branch completed a deterministic `npm run build:data` followed by the complete `npm test` suite.

Validated native state after promotion:

- **42 datasets** and **39 releases** in the catalogue;
- **18 units**;
- **84 indicators**;
- **2,477 series**;
- **5,971 observations**;
- all five County Life indicators have exactly **47 county series and 47 observations**;
- every County Life observation matches the frozen source CSV for geography, value and reference period;
- every observation carries a published dataset/release and source URL;
- all five indicators are direct county observations with Class **A** provenance;
- **no constituency or ward series** exist for these five indicators.

The Ministry of Health target-facility stock reconciles exactly to **14,366 facilities**, matching the published 2023 Health Facility Census national target total.

## Existing-release regression checks

The same build also passed:

- geography registry validation: 1 country / 47 counties / 290 constituencies / 1,450 wards;
- catalogue validation;
- core indicator registry validation;
- lifecycle / placeholder-taxonomy validation;
- World Bank national-integration validation;
- Data Sprint 1 validation;
- native API validation;
- Data Sprint 2 validation;
- Data Sprint 3 validation;
- Compare JavaScript syntax validation.

## Interpretation controls

These measures are deliberately **not** combined into a synthetic quality-of-life score.

- Rent burden is not a general cost-of-living index or a prediction of an individual's rent.
- Owner occupancy is tenure status, not housing quality, affordability or wealth.
- Health-facility stock measures supply context, not travel time, service quality, capacity or personal access.
- School attendance is attendance status, not learning quality or attainment; county age structure affects comparisons.
- Labour-force participation is not unemployment, job quality, earnings or the probability of finding work.

My Life Elsewhere may narrate differences only from matched, traceable observations. Missing values, period differences and geographic limitations must remain visible rather than being filled or inferred.
