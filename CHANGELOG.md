# Changelog

## 1.0.0 — 30 August 2026 — P17 final reproducibility, governance and release

Closes the Kenya Data Atlas v1.0 programme after the exact release commit passes all required reproducibility, browser, accessibility, performance, geometry and deployment gates.

- Completes P17 and the P00–P17 repository completion ledger.
- Publishes the v1.0 release manifest and explicit unresolved-items register.
- Reconciles README, ROADMAP, citation metadata and application version to the released state.
- Requires deterministic `build:data` with zero committed-output drift, full `npm test`, independent Shapely geometry audit, Chromium/Firefox/WebKit smoke + axe checks and Lighthouse budgets.
- Requires GitHub Pages to deploy the exact release commit and pass a live post-deployment smoke test before the `v1.0.0` tag/release is created.
- Preserves known evidence limits instead of filling them by approximation, including Narok's withheld fiscal-delivery score, the Mandera East/Lafey ward spatial hold, the withheld longitudinal composite and continuing P14 freshness obligations.

See `docs/releases/v1.0.0.md`, `docs/releases/v1.0.0-unresolved.md` and `data/release/v1.0.0.json`.

## 0.18.0 — 30 August 2026 — P15 data distribution and developer surface

Turns the validated Atlas registries and CountyIQ outputs into a stable public developer interface.

- Publishes `data/distribution/manifest.json` with application/data version, independent data-contract version, product counts, methodology versions, byte sizes and SHA-256 hashes.
- Adds NDJSON distributions for core registry/catalogue/results/evidence products while keeping canonical JSON/CSV as the source of truth.
- Adds Draft 2020-12 JSON Schemas for indicators, series, observations, geographies, datasets, county results and evidence records.
- Generates 47 county bundles and 98 indicator bundles for query-sized consumption.
- Adds `checksums.sha256`, developer examples, MIT software licensing, a source-data rights notice and citation metadata.
- Explicitly defers P14 Opportunity Finder to v1.1 Beta and advances P16 real-browser/accessibility/SEO/performance hardening as the next v1.0 gate.

See `docs/P15-DATA-DISTRIBUTION.md` and `docs/DEVELOPER.md`.

## 0.16.1 — 29 August 2026 — CountyIQ P09–P11 publication hardening

Promotes P09–P11 from analytical preview to a publication-safe release without overstating what the evidence can support.

- **P09 — published current snapshot, longitudinal composite withheld.** The 0–100 County Development Snapshot is public only as a latest cross-section with five broad relative-position bands. The snapshot passes the published robustness gate: all 47 counties remain in the same or an adjacent band across the two plausible full-composite weighting specifications. Exact ranks remain sensitivity diagnostics, not a settled league table. A historical composite trend remains withheld because only 2 of 5 inputs have multi-year county history and the reconstructable fiscal sub-index has weak (~0.43) average year-over-year Spearman rank stability.
- **P10 — published fiscal delivery & accountability layer.** Uses a common FY2024/25 reference period and three equally weighted pillars: budget execution, OSR target attainment, and arrears control. Wage-ceiling and audit evidence are disclosed but deliberately not assigned arbitrary score points. No missing values are imputed; 46 counties receive complete scores and Narok's overall score is explicitly withheld because the final pending-bills source does not contain a submitted county value.
- **P11 — published administration-period scorecards and recognition.** All 47 counties receive a county-administration-period record using FY2021/22 as the last full pre-election baseline, FY2022/23 as transition context only, and FY2024/25 as the latest full fiscal year. The model keeps `office_holder_name: null` and `person_attribution: false`; recognition is generated mechanically from published fiscal rules, not from a personal governor score or a historical development composite.

See `docs/countyiq/P09-HISTORICAL-VALIDATION.md`, `docs/countyiq/P10-DELIVERY-LAYER.md`, and `docs/countyiq/P11-RECOGNITION.md`.

## 0.13.0 — 29 August 2026 — CountyIQ P08: Performance Index (Research/Beta)

Ships the composite index as a research product, explicitly labelled Research/Beta and not cleared for production. Headline finding, disclosed rather than hidden: only 5 of 98 indicators (fiscal budget/development absorption, rent burden, school attendance, labour-force participation) currently meet the inclusion rule for all 47 counties — 4 of 7 domains contribute nothing yet, and the index must not be described as comprehensive. Three published weighting scenarios, a correlation/multicollinearity review, and a per-county rank-robustness band (several counties swing 20+ places out of 47 depending on weighting alone). See `docs/countyiq/P08-PERFORMANCE-INDEX.md`.

## 0.12.0 — 29 August 2026 — CountyIQ P07: gap calculator and evidence narrative

Peer/national benchmark gaps for every P06-ranked indicator, each exposing its own formula, benchmark source, period and denominator. One real monetary counterfactual (overall budget-absorption gap × total budget, in KES) — deliberately not extended to development absorption, which has no active development-budget denominator to multiply against. Template-generated "working well / needs attention / what changed" narrative, reconstructible from the same displayed numbers. See `docs/countyiq/P07-GAPS-AND-NARRATIVE.md`, including a direction-wording bug caught and fixed during this phase.

## 0.11.0 — 29 August 2026 — CountyIQ P04–P06: health, breadth and peer intelligence

Closes a changelog gap: P04 and P05 shipped in the prior session without a changelog entry, and this release adds P06 on top of them.

- **P04 — County health and living-standards ingestion.** Poverty, stunting, immunisation, skilled-birth-attendance and health-facility-count indicators for all 47 counties, sourced with full survey-precision metadata; league-table ranking withheld per the Atlas indicator taxonomy where sampling uncertainty applies.
- **P05 — County education, economy, agriculture and infrastructure breadth.** Fourteen additional indicators (658 county-metric rows) covering TSC school/teacher counts, GCP economic structure, maize production and KHS connectivity, each reconciled against its official source total.
- **P06 — Peer groups, percentiles and trend intelligence.** Every indicator's `ranking` and `trend` slots are now populated: national and population-quartile-peer rank/percentile, and direction/volatility trend classification. Ships a published, versioned direction/composite-eligibility ruleset for all 98 registry indicators (`scripts/p06/direction-rules.mjs`). See `docs/countyiq/P06-PEER-INTELLIGENCE.md`.

## 0.10.0 — 28 August 2026 — County Life / My Life Elsewhere

Publishes five complete county-level comparison families for the dedicated Compare workspace. Direct Compare can place the new metrics side by side across counties; My Life Elsewhere can translate matched observations into plain-language differences without inventing a composite quality-of-life score.

### County Life metrics

- Cost & affordability — rent as a share of household expenditure, 2024: **47/47 counties**.
- Housing — households owning their main dwelling, 2021 survey: **47/47 counties**.
- Health access / supply — health facilities in the 2023 census target: **47/47 counties**.
- Education — population age 3+ at school / learning institution, 2019 census: **47/47 counties**.
- Employment — labour-force participation rate, age 15–64, 2019 census: **47/47 counties**.

Frozen County Life source package: **235 rows = 5 indicators × 47 counties**. The Ministry of Health facility-stock table reconciles to the published national target of **14,366 facilities**.

### Quality and release controls

- All five indicators are direct county observations with source URL, dataset/release provenance and reference period.
- No County Life value is inherited to a constituency or ward.
- Rent burden remains a rent-cost measure, not a synthetic cost-of-living index.
- Owner occupancy is tenure status, not housing quality or household wealth.
- Facility stock is supply context, not travel-time access or service quality.
- School attendance is not a learning-quality measure and remains sensitive to county age structure.
- Labour-force participation is distinct from unemployment, earnings and job quality.
- The deterministic v0.10.0 build passed the complete Atlas test suite at **84 indicators, 2,477 series and 5,971 observations**.

See `data/life-elsewhere/VALIDATION.md` for the release audit.

---

## 0.9.0 — 28 August 2026 — Historical Kenya

Publishes Data Sprint 3 as a deterministic native-registry release alongside the existing World Bank national integration, County Core and Local Kenya datasets.

### Historical series

- KNBS CPI inflation: 259 monthly observations.
- CBK Central Bank Rate: 122 historical decisions.
- CBK USD/KES monthly average: 403 observations.
- CBK 91-day Treasury bill monthly average: 405 observations.
- EPRA Nairobi pricing-town Super Petrol: 6 historical cycles, explicitly not treated as a Nairobi County average.
- Controller of Budget county fiscal history: 517 rows covering all 47 counties for FY2013/14–FY2023/24.
- Together with Sprint 1 FY2024/25, county fiscal series now span 12 fiscal years.

### Quality and release controls

- Controller of Budget history is never inherited below county level.
- Monthly FX is kept distinct from the existing daily series.
- Monthly T-bill averages are kept distinct from auction observations.
- A governed `proxy` geographic method maps documented pricing-town proxies to Class C / spatially derived rather than mislabelling them as official direct county values.
- Sprint 3 is wired into `npm run build:data`, `npm test` and the native API validator.
- The combined World Bank + Sprint 3 release passed the full Atlas build and validation suite at 79 indicators, 2,242 series and 5,736 observations before promotion.

See `data/sprint3/VALIDATION.md` for the release audit.

---

## 0.4.0 — 26 August 2026 — Geography integrity remediation

Closes every finding in the Phase 1 build audit. All four critical findings are
resolved and independently verified; three structural findings are implemented.

### Critical fixes

**C1 — `NaN` in the canonical registry.**
The source transcription carries the Excel error value `#N/A` in `CONSTITUENCY ID` for
all five Baringo North ward rows, and a double space in the name. This produced
`KEN-C030-CONNaN` for the constituency and its five wards, and left constituency code
158 missing from the 1..290 sequence.

- Spreadsheet error values (`#N/A`, `#REF!`, `#VALUE!` and similar) are now rejected at
  parse time with a message naming the record. They are never coerced to a number.
- Internal whitespace is collapsed at parse time. Three source names were affected:
  `BARINGO  NORTH`, `CENTRAL  WARD`, `KITUTU   CENTRAL`.
- Repairs go through a new, reviewable `corrections.csv` carrying field, original value,
  replacement, reason, evidence and reviewer. Applied corrections are written to
  `registry/applied-corrections.json` on every build and surfaced by `npm test`.
- Baringo North is now `KEN-C030-CON158`; the constituency sequence is complete.

**C2 — Baringo North's polygon was a 60-hectare sliver in Kisumu.**
The reference constituency shapefile contains five blank padding records with empty
names and sliver geometry. A blank name normalises to a blank name, so `Baringo  North`
matched one of them — and was recorded with `match_score: 0`, a perfect score.

- Source records with a blank name are dropped before matching and listed in the report
  (5 constituency records, 1 county record).
- `unresolved_duplicate_matches` is now an **error**, not a warning. Two source polygons
  claiming one geography can no longer pass.
- Polygons below a degeneracy floor are rejected and fail the build.

**C3 — 20 ward polygons sat outside their assigned constituency.**
Resolved by S3 below. All 1,450 wards now sit at ≥99% inside their constituency.

**C4 — 85 invalid polygons.**
Every polygon is normalised to valid OGC geometry during ingest via a clipping union.
Materially defective geometry — where the repair changes the area — is recorded with the
area delta rather than repaired silently. `ST_IsValid` is now a schema constraint.

### Structural changes

**S1 — `boundary_version` records the delimitation era, not the source file.**
Was `HDX-KENYA-ELECTIONS-COUNTIES-2018` and similar. Now `2012-01` for every record,
with provenance moved to `geometry_source_id` and `geometry_revision`. Obtaining
IEBC-issued geometry for the same boundaries will bump the revision, not create a
spurious new era that orphans attached observations. Per the IEBC's January 2026 phased
approach, `2012-01` remains the only era until after the August 2027 election.

**S2 — the ward layer's taxonomy caveat is recorded.**
The ward geometry is titled *Administrative Wards in Kenya 1450* and is attached to
geographies recorded as `electoral`. The equivalence is probably right and is not
confirmed by the publisher. Recorded as an open item in `source-manifest.json` rather
than assumed.

**S3 — parents are dissolved from children.**
County, constituency and country geometry is now derived by dissolving the canonical
ward layer (`scripts/geography/derive-parents.mjs`). The 2018 layers move to
`data/geography/reference/` as independent cross-checks, with divergence measured and
published rather than discarded.

**S4 — `quality_status` is derived, not flat.**
Was `validated_external` on all 1,788 records. Now derived from match method and
measured containment across six states, and propagated upward through dissolved parents.

**S5 — one geometry report.**
The stale `validation-report.json` is removed. Reports are `geometry-validation-report.json`
(ingest), `derived-geometry-report.json` (dissolve) and `reference-divergence.json`
(registered disagreements), each regenerated by the command that owns it, each with a
status that is a function of its findings.

### Measured effect

| | Before | After |
|---|---|---|
| Malformed `geo_code` | 6 | 0 |
| Constituency code sequence | 158 missing | complete 1..290 |
| Names with irregular whitespace | 3 | 0 |
| Invalid polygons | 85 wards, 1 county, 1 constituency | 0 |
| Degenerate polygons | 1 | 0 |
| Unresolved duplicate source matches | 4 | 0 |
| Wards <90% inside their constituency | 198 of 1,450 | 0 |
| Wards outside their constituency entirely | 20 | 0 |
| Constituencies with <90% ward-union coverage | 81 of 290 | 0 |
| Ward-union coverage of constituency (median / min) | 0.963 / 0.000 | 1.000 / 1.000 |
| Independent audit result | 9 critical, 4 warnings | 0 critical, 0 warnings |

Reference-layer divergence is retained and published, not eliminated: 194 registered
divergences, of which 15 are parent conflicts where the registry was verified correct
against the 2012 delimitation and the third-party layer is wrong.

### Validator

`validate-registry.mjs` was rewritten. The previous version passed a constituency whose
code was the string `"NaN"` because uniqueness held and the hierarchy resolved.
Uniqueness is not well-formedness and a complete hierarchy is not a complete sequence.
Added assertions: per-level `geo_code` patterns, integer identifier columns, agreement
between numeric columns and the embedded code, complete `1..N` sequences, name
whitespace hygiene, ancestor-code agreement, boundary era, presence of
`geometry_source_id` and `geometry_revision`, non-flat quality labels, ring closure,
minimum ring size, degeneracy, per-level completeness, and zero nesting failures.

`scripts/geography/audit-geometry.py` is an independent checker written against the
published artefacts alone. Run with `npm run geography:audit` (needs `pip install shapely`).

### Schema

- `geography_geometry`: added `geometry_revision`, `geometry_source_id`, `derivation`;
  widened `quality_status`; unique key now includes the revision; partial unique index
  on the current revision; `ST_IsValid` and non-degeneracy check constraints.
- `geography_crosswalk`: separate source and target boundary versions, constrained
  method vocabulary, required `weight`, `weight_basis`, `weight_reference`, `created_by`
  and `reviewed_by`, a uniqueness key, and a deferred constraint trigger asserting that
  weights sum to 1.0 per source geography.
- New `source_correction` table mirroring `corrections.csv`.

### Dependency

`polygon-clipping` is now a pipeline dependency for dissolve, validity repair and
containment measurement. The published site remains static with no build step and no
runtime dependencies.

---

## 0.3.0 — Phase 1 and 2

Canonical geography registry (1 / 47 / 290 / 1,450), external boundary ingest, source
and provenance catalogue, Phase 0 governance package, static prototype.
