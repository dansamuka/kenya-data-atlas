# Data Sprint 1 — County Core

Implemented 26 August 2026. Validated and remediated after live-browser review on the same date. Native-registry migration completed in v0.8.0.

Data Sprint 1 expands Kenya Data Atlas from a thin indicator prototype into a source-backed county data layer while preserving the project's central rule: **never invent lower-level values and never copy a county statistic into a constituency or ward.**

## Coverage added

| Dataset | Coverage | History | Quality |
|---|---:|---:|---|
| 2009 Census population | 47/47 counties | 2009, alongside existing 2019 census | A — official direct |
| 2022 registered voters | 47/47 counties | 2022 county Gazette schedule | A — official direct |
| Gross County Product, current prices | 47/47 counties | 2020–2024 | A — official direct |
| County budget | 47/47 counties | FY 2024/25 | A — official direct |
| County expenditure | 47/47 counties | FY 2024/25 | A — official direct |
| Overall budget absorption | 47/47 counties | FY 2024/25 | A — official direct |
| Development budget absorption | 47/47 counties | FY 2024/25 | A — official direct |
| Super Petrol representative pricing town | 47/47 county display slots | 15 Aug–14 Sep 2026 | Existing Nairobi/Mombasa retain base provenance; added representative-town rows are E — external |

## Source decisions

### Population — KNBS 2009 census

Source: Kenya National Bureau of Statistics, *2013 Statistical Abstract*, Table 4a, “Kenya Population and Housing Census, August 2009 — Population Distribution by Sex, Number of Households, Area, Density and County”.

Official source: <https://www.knbs.or.ke/wp-content/uploads/2023/09/2013-Statistical-Abstract.pdf>

The 47 county values sum exactly to the published Kenya total of **38,610,097**. No reconstruction from districts is used.

### Registered voters — IEBC 2022 county Gazette schedule

Source: IEBC / *Kenya Gazette*, 21 June 2022, Third Schedule, “Registered Voters per County for the 2022 General Election”.

Official source: <https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf>

The county schedule sums to **22,102,532**. The Atlas also carries the later KPMG-audited national topline of **22,120,458**. These are different release vintages. Sprint 1 preserves both rather than scaling or forcing the county rows to equal the later national number.

Audit context: <https://www.iebc.or.ke/uploads/resources/JqmDO7vRL0.pdf>

### Gross County Product — KNBS 2025 report

Source: KNBS, *2025 Gross County Product*, Table 8, “Gross County Product at Current Prices, 2020–2024”.

Official source: <https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf>

Unit: **KSh million**. The 2024 column is preliminary. Published county rows are retained as printed; rounded county rows are not silently altered to force reconciliation to a printed total.

### County budget implementation — Office of the Controller of Budget

Source: Office of the Controller of Budget, *County Governments Budget Implementation Review Report FY 2024/25*, Table 2.5.

Official publication page: <https://cob.go.ke/download/county-governments-budget-implementation-review-report-fy-2024-25/>

Fields loaded for every county: total budget, total expenditure, overall absorption rate and development budget absorption rate. No budget statistic is allocated below county.

### EPRA fuel prices — representative pricing towns, not county averages

EPRA publishes maximum retail prices by **pricing town/location**, not as one statistical average for each county. The remediated release uses one representative published pricing town for each county display slot. **Forty-six of 47 mappings use a pricing town physically in the same county. Nyandarua is the one explicit exception: Nyahururu is used as the nearest published pricing town and is labelled as a proxy.** None of these values should be interpreted as a county mean or county-wide tariff.

EPRA stated that Super Petrol remained unchanged for the **15 August–14 September 2026** cycle. The representative values therefore use the prior full pricing-town PMS schedule, whose Super Petrol values remained applicable to the new cycle.

Current-cycle corroboration: <https://www.pulse.co.ke/story/epra-announces-august-september-fuel-prices-2026081413042614562>

Pinned full-town transcription used for the representative values: <https://github.com/erickarugu/fuelkenya/blob/main/api/data/epra-cycles/2026-07-15_to_2026-08-14.csv>

Because the machine-readable full-town transcription is external rather than an archived official EPRA file, added representative-town observations remain **E — external**. The Atlas keeps this conservative provenance badge even though the underlying schedule is EPRA-based.

## Choropleth rendering remediation

The live browser review identified a UI defect: the D3 map correctly calculated quantile colours and wrote them to SVG `fill` attributes, but the stylesheet also declared a fixed `fill` for `.geo-feature`. CSS won the cascade, so the map looked uniformly pale while the legend displayed multiple bins.

`assets/sprint1-ui.js` promotes the computed D3 fill attribute to an inline style for data-bearing polygons. No-data polygons retain their hatch pattern. A regression assertion in `scripts/indicators/validate-sprint1.mjs` prevents this specific defect from silently returning.

## Source package

The files under `data/sprint1/` remain the human-auditable source package:

- `population-2009.csv` — 47 official county census totals.
- `voters-2022.csv` — 47-county IEBC Gazette schedule.
- `gcp-2020-2024.csv` — 47 counties × 5 annual current-price GCP observations.
- `county-budget-fy2024-25.csv` — 47 county fiscal-year budget implementation rows.
- `fuel-super-petrol-2026-08.csv` — 47 representative pricing-town rows for county navigation.
- `fuel-super-petrol-2026-08-audit.csv` — explicit mapping method for every fuel display row.
- `sources.json` — source and provenance manifest.
- `VALIDATION.md` — release audit findings and validation scope.

## Native publication architecture

As of **v0.8.0**, Sprint 1 is no longer injected into the browser with a `window.fetch` monkey-patch. `npm run build:data` now compiles the County Core package into the same committed machine-readable products used by the rest of the Atlas:

- `data/catalogue/registry/datasets.json` / `.csv`
- `data/catalogue/registry/releases.json` / `.csv`
- `data/indicators/registry/units.json` / `.csv`
- `data/indicators/registry/indicators.json` / `.csv`
- `data/indicators/registry/series.json` / `.csv`
- `data/indicators/registry/observations.json` / `.csv`

The build-time promoter is `scripts/sprint1/build-native.mjs`. The public application reads those committed registries directly. Therefore a user downloading the JSON/CSV registry gets the same Sprint 1 data that the live site sees; JavaScript execution is no longer required to obtain the County Core data.

New indicators:

- `IND-GCP-CURRENT`
- `IND-COUNTY-BUDGET-TOTAL`
- `IND-COUNTY-EXPENDITURE-TOTAL`
- `IND-COUNTY-BUDGET-ABSORPTION`
- `IND-COUNTY-DEVELOPMENT-ABSORPTION`

Existing indicators extended:

- `IND-POPULATION` — adds 2009 county history to the existing county population series.
- `IND-REGISTERED-VOTERS` — adds all 47 counties.
- `IND-FUEL-PETROL` — adds representative pricing-town observations across all 47 county display slots, with explicit non-county-average treatment.

`npm run native-api:validate` independently checks that all 47 counties are present in the committed registries for the Sprint 1 coverage contract, including all 235 GCP county-year observations and all 188 county-budget measure observations.

## CI reproducibility

The primary CI workflow now rebuilds the data products before validation and fails if deterministic source-derived outputs differ from what is committed. It then runs the normal validators and the independent Shapely geography audit. This closes the former gap where a seed file and its generated registry could drift while both still looked individually valid.

For fuel, the preferred long-term visualization is a **pricing-town point layer** rather than a county choropleth. The county view is a navigation convenience and is explicitly labelled representative. GCP values are **current-price totals** and should not be interpreted as real economic growth without constant-price series.
