# Data Sprint 1 — County Core

Implemented 26 August 2026.

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
| Super Petrol | 5 county-linked pricing towns | 15 Aug–14 Sep 2026 | Existing Nairobi/Mombasa observations retain their base provenance; three added town rows are E — external |

## Source decisions

### Population — KNBS 2009 census

Source: Kenya National Bureau of Statistics, *2013 Statistical Abstract*, Table 4a, “Kenya Population and Housing Census, August 2009 — Population Distribution by Sex, Number of Households, Area, Density and County”.

Official source: <https://www.knbs.or.ke/wp-content/uploads/2023/09/2013-Statistical-Abstract.pdf>

The 47 county values sum exactly to the published Kenya total of **38,610,097**. No reconstruction from districts is used.

### Registered voters — IEBC 2022 county Gazette schedule

Source: IEBC / *Kenya Gazette*, 21 June 2022, Third Schedule, “Registered Voters per County for the 2022 General Election”.

Official source: <https://www.iebc.or.ke/uploads/resources/L7k6ob1bau.pdf>

The county schedule sums to **22,102,532**. The Atlas already carries the later KPMG-audited national topline of **22,120,458**. These are different release vintages. Sprint 1 preserves both rather than scaling or forcing the county rows to equal the later national number.

Audit context: <https://www.iebc.or.ke/uploads/resources/JqmDO7vRL0.pdf>

### Gross County Product — KNBS 2025 report

Source: KNBS, *2025 Gross County Product*, Table 8, “Gross County Product at Current Prices, 2020–2024”.

Official source: <https://www.knbs.or.ke/wp-content/uploads/2025/12/2025-Gross-County-Product.pdf>

Unit: **KSh million**. The 2024 column is preliminary. Published county rows are retained as printed; rounded county rows are not silently altered to force reconciliation to a printed total.

### County budget implementation — Office of the Controller of Budget

Source: Office of the Controller of Budget, *County Governments Budget Implementation Review Report FY 2024/25*, Table 2.5.

Official publication page: <https://cob.go.ke/download/county-governments-budget-implementation-review-report-fy-2024-25/>

Fields loaded for every county: total budget, total expenditure, overall absorption rate and development budget absorption rate. No budget statistic is allocated below county.

### EPRA fuel prices

The existing Atlas already carries Nairobi and Mombasa Super Petrol observations. Sprint 1 adds Nakuru, Eldoret/Uasin Gishu and Kisumu for the 15 August–14 September 2026 cycle. Super Petrol was unchanged for this cycle.

The current-cycle public town comparison is also independently visible through FuelKenya's EPRA-based town feed: <https://fuelkenya.com/>.

A pricing town is **not** a county statistic. The three added town observations are therefore badged **E — external**, linked to counties only for navigation, and explicitly labelled as pricing-town values rather than county averages.

## Files

- `population-2009.csv` — 47 official county census totals.
- `voters-2022.csv` — 47-county IEBC Gazette schedule.
- `gcp-2020-2024.csv` — 47 counties × 5 annual current-price GCP observations.
- `county-budget-fy2024-25.csv` — 47 county fiscal-year budget implementation rows.
- `fuel-super-petrol-2026-08.csv` — five county-linked pricing towns.
- `sources.json` — source and provenance manifest.

## Runtime publication architecture

`assets/sprint1-data.js` is a transparent additive layer that loads the source files above, resolves every `geo_code` against the canonical geography registry, and adds the resulting series/observations to the JSON registry responses used by the static application.

The overlay creates **332 county series and 520 observations**, plus five new indicators and five source releases. It leaves the existing generated registries untouched and creates no constituency or ward observations.

New indicators:

- `IND-GCP-CURRENT`
- `IND-COUNTY-BUDGET-TOTAL`
- `IND-COUNTY-EXPENDITURE-TOTAL`
- `IND-COUNTY-BUDGET-ABSORPTION`
- `IND-COUNTY-DEVELOPMENT-ABSORPTION`

Existing indicators extended:

- `IND-POPULATION` — adds 2009 county history.
- `IND-REGISTERED-VOTERS` — adds all 47 counties.
- `IND-FUEL-PETROL` — adds three additional major pricing-town observations with explicit external-source treatment.

## Known limitation / next migration

The Sprint 1 overlay is intentionally additive so the public static site can use the data immediately. The next data-engineering migration should move these releases into the native `data/indicators/seed/` and catalogue build pipeline so regenerated `registry/*.json` and `registry/*.csv` files contain the same observations without the browser overlay.

GCP values are **current-price totals** and should not be interpreted as real economic growth without constant-price series.
