# Data Sprint 1 — Validation Report

**Audit date:** 26 August 2026  
**Architecture migration:** 27 August 2026 (v0.8.0)  
**Scope:** every Sprint 1 source file, county join, numerical field, published period, provenance rule, committed machine-readable registry and the live choropleth rendering path.

## Result

**PASS with one disclosed modelling caveat.**

The post-release review found one UI defect and one coverage-design shortfall. Both were remediated. The later v0.8.0 architecture review also closed the runtime-overlay gap by compiling Sprint 1 into the native committed registries.

1. **Choropleth rendering defect — fixed.** D3 correctly computed five quantile colours and placed them in SVG `fill` attributes. The stylesheet also declared a fixed `.geo-feature` fill, which won the CSS cascade and visually flattened all counties to the same pale shade. The remediation mirrors the computed colour into inline style and preserves the hatch pattern for missing data.
2. **Fuel coverage shortfall — remediated.** The initial release exposed only five pricing-town links. The county view now carries one representative published pricing town for every county display slot. These are explicitly *not county averages*. Forty-six use a pricing town in the same county. **Nyandarua uses Nyahururu as the nearest published pricing-town proxy**, and that exception is disclosed in the UI, source manifest and audit mapping.
3. **Runtime-only publication architecture — fixed in v0.8.0.** Sprint 1 source files are now compiled by `scripts/sprint1/build-native.mjs` during `npm run build:data`. The committed `data/indicators/registry/*` and `data/catalogue/registry/*` files therefore contain County Core data directly. `index.html` no longer loads the former Sprint 1 fetch injector.

## Dataset validation

| Dataset | Row coverage | Validation performed | Result |
|---|---:|---|---|
| 2009 population | 47/47 | Canonical county IDs/names, finite positive values, exact national total 38,610,097, source anchors, native-registry coverage | PASS |
| 2022 registered voters | 47/47 | Canonical county IDs/names, finite values, exact Gazette county-schedule total 22,102,532, release-vintage separation from 22,120,458 national topline, source anchors, native-registry coverage | PASS |
| GCP 2020–2024 | 47/47 × 5 years | Canonical county IDs/names, 235 finite positive observations, 2024 preliminary treatment, source anchors, native-registry 47×5 coverage | PASS |
| County budget FY2024/25 | 47/47 | Budget/expenditure positivity, absorption 0–100%, expenditure-to-budget arithmetic, source anchors, four native measures × 47 counties | PASS |
| Super Petrol representative town | 47/47 display slots | Canonical county IDs/names, price plausibility, audited town mapping, source anchors, explicit proxy flag for Nyandarua, native-registry coverage | PASS with disclosed proxy |

## Source checks

### KNBS — 2009 population

The Atlas uses the official KNBS county table from the *2013 Statistical Abstract*. The 47 rows reconcile exactly to **38,610,097**. Anchor checks include Nairobi City, Kakamega and Bungoma.

### IEBC — 2022 registered voters

The Atlas preserves the **21 June 2022 Gazette county schedule** exactly. Its 47 county rows sum to **22,102,532**. The later audited national topline of **22,120,458** is retained as a different release vintage rather than being used to scale county values.

### KNBS — 2025 Gross County Product

All 47 county rows contain five annual current-price observations (2020–2024). The validator checks all 235 cells for finite positive values and separately locks source-audited 2024 anchors including Nairobi City, Nakuru, Turkana and Kiambu. 2024 remains explicitly marked preliminary.

### Office of the Controller of Budget — FY2024/25

Every county has budget, expenditure, overall absorption and development absorption. The validator checks all 188 numerical fields, enforces valid rate ranges and independently recomputes overall absorption from expenditure / budget within the published rounding tolerance. Source anchors include Nairobi City, Nakuru, Kisii, Nandi and Kisumu.

### EPRA — Super Petrol

EPRA prices are published by pricing town/location, not as county averages. EPRA stated that Super Petrol remained unchanged for **15 August–14 September 2026**, so the prior cycle's complete PMS town schedule remains applicable for Super Petrol.

`fuel-super-petrol-2026-08-audit.csv` records the mapping used for every county display slot. Forty-six are `direct_same_county`; Nyandarua is `nearest_published_pricing_town` using Nyahururu. Added representative-town observations remain conservatively badged **E — external** because the full machine-readable town schedule used by the Atlas is an external transcription of the EPRA schedule.

## Native machine-readable API validation

The County Core publication contract is now tested against the committed static registries, not merely against the browser view. `npm run native-api:validate` fails unless:

- all **13 indicators** are present in `data/indicators/registry/indicators.json`;
- all five narrow Sprint 1 datasets and releases are present in `data/catalogue/registry/`;
- each of the 47 counties has 2009 and 2019 population observations;
- each county has the 2022 Gazette registered-voter observation;
- all **47 GCP series × 5 years = 235 observations** are present;
- all **4 county-budget measures × 47 counties = 188 observations** are present;
- all 47 county navigation slots have a fuel pricing-town observation with the required caveat;
- the page does not load the retired `assets/sprint1-data.js` runtime injector;
- the old lower-page Compare/Rankings product surfaces remain retired rather than presenting a stale second ranking system.

## Automated regression coverage

`npm test` now fails if any of the following occurs:

- a Sprint 1 county dataset has fewer/more than 47 rows;
- a county code does not resolve to the canonical geography registry;
- a county label disagrees with the canonical name;
- the 2009 population total changes from 38,610,097;
- the IEBC county-schedule total changes from 22,102,532 or is incorrectly scaled to 22,120,458;
- any GCP observation is missing/non-finite/non-positive;
- county budget/expenditure/rates fail numerical or arithmetic checks;
- fuel representative coverage is not 47/47;
- a fuel row disagrees with the explicit audit mapping;
- Nyandarua loses its proxy disclosure;
- the choropleth inline-fill repair is removed;
- County Core data disappears from the committed machine-readable registries;
- the retired runtime Sprint 1 fetch injector is loaded again.

The GitHub Actions release gate additionally runs **`npm run build:data` before validation**, compares deterministic generated data products with the committed files, and fails on build drift. It also installs Shapely and runs **`npm run geography:audit`**, making the independent topology/containment check mandatory rather than a manual convention.

## Remaining modelling caveat

The Sprint 1 publication architecture is now native and reproducible; the former browser-overlay limitation is closed. The one retained modelling caveat concerns fuel geography: a future **pricing-town point layer** is statistically cleaner than a county choropleth. The present county display is a clearly labelled representative-town view, not a claim that each county has one official county-wide fuel price.
