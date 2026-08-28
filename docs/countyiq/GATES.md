# CountyIQ — Acceptance Gate Ledger

Purpose: make the gap between the current CountyIQ and the intended final product visible and testable. A checked gate requires evidence; planned product gates remain open until their observable outcome exists.

## Scaffold release gates

- [ ] **CQ-S0-G1 — Machine-readable target state exists and parses.**
  - CHECK: `node scripts/countyiq/validate-scaffold.mjs roadmap`
  - EXPECT: `COUNTYIQ_ROADMAP_OK`

- [ ] **CQ-S0-G2 — Final analytical mart contract exists and is structurally valid.**
  - CHECK: `node scripts/countyiq/validate-scaffold.mjs schema`
  - EXPECT: `COUNTYIQ_SCHEMA_OK`

- [ ] **CQ-S0-G3 — Website exposes the target-state scaffold from the same roadmap file.**
  - CHECK: `node scripts/countyiq/validate-scaffold.mjs website`
  - EXPECT: `COUNTYIQ_WEBSITE_SCAFFOLD_OK`

- [ ] **CQ-S0-G4 — CountyIQ JavaScript remains syntactically valid.**
  - CHECK: `node --check assets/countyiq.js && node --check assets/countyiq-roadmap.js && echo COUNTYIQ_JS_OK`
  - EXPECT: `COUNTYIQ_JS_OK`

- [ ] **CQ-S0-G5 — CountyIQ scaffold validation is part of the repository test command.**
  - CHECK: `node scripts/countyiq/validate-scaffold.mjs ci`
  - EXPECT: `COUNTYIQ_CI_WIRED_OK`

## Stage A — architecture gates

- [ ] **CQ-A-G1 — Generated county mart exists for all 47 counties.**
  - CHECK: `node scripts/countyiq/validate-county-summary.mjs coverage`
  - EXPECT: `COUNTYIQ_COUNTY_MART_47_OK`

- [ ] **CQ-A-G2 — CountyIQ uses the generated mart, not direct production CSV joins.**
  - CHECK: `node scripts/countyiq/validate-county-summary.mjs runtime`
  - EXPECT: `COUNTYIQ_RUNTIME_MART_ONLY_OK`

- [ ] **CQ-A-G3 — Every surfaced statistic preserves source, period, unit and provenance badge.**
  - CHECK: `node scripts/countyiq/validate-county-summary.mjs provenance`
  - EXPECT: `COUNTYIQ_PROVENANCE_COMPLETE_OK`

- [ ] **CQ-A-G4 — CountyIQ mart rebuild is deterministic.**
  - CHECK: `npm run countyiq:build && git diff --exit-code -- data/countyiq/county-summary.json`
  - EXPECT: no diff and exit 0.

## Stage B — evidence breadth gates

- [ ] **CQ-B-G1 — At least 20 active CountyIQ-eligible indicators span at least 5 domains.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs breadth-stage-b`
  - EXPECT: `COUNTYIQ_BREADTH_STAGE_B_OK`

- [ ] **CQ-B-G2 — Twelve fiscal years are surfaced for every county without missing county-year rows.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs fiscal-history`
  - EXPECT: `COUNTYIQ_FISCAL_12Y_47_OK`

- [ ] **CQ-B-G3 — Per-capita metrics use an explicit period-compatible denominator.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs denominators`
  - EXPECT: `COUNTYIQ_DENOMINATORS_OK`

- [ ] **CQ-B-G4 — Survey indicators carry required uncertainty metadata before activation.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs uncertainty`
  - EXPECT: `COUNTYIQ_SURVEY_UNCERTAINTY_OK`

## Stage C — benchmarking gates

- [ ] **CQ-C-G1 — Every production peer group has a versioned reproducible definition.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs peers`
  - EXPECT: `COUNTYIQ_PEERS_REPRODUCIBLE_OK`

- [ ] **CQ-C-G2 — Rankings require common indicator definition, period and eligibility threshold.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs rankings`
  - EXPECT: `COUNTYIQ_RANKING_GUARDS_OK`

- [ ] **CQ-C-G3 — Eligible indicators expose matched national and peer trends.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs trends`
  - EXPECT: `COUNTYIQ_TRENDS_OK`

- [ ] **CQ-C-G4 — Development-gap calculations expose formula, benchmark, denominator and source.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs gaps`
  - EXPECT: `COUNTYIQ_GAPS_AUDITABLE_OK`

## Stage D — composite index gates

- [ ] **CQ-D-G1 — Composite methodology documents normalization, directions, weights, missing-data and outlier treatment.**
  - CHECK: `node scripts/countyiq/validate-index.mjs methodology`
  - EXPECT: `COUNTYIQ_INDEX_METHOD_OK`

- [ ] **CQ-D-G2 — Correlation and multicollinearity review is published.**
  - CHECK: `node scripts/countyiq/validate-index.mjs correlation`
  - EXPECT: `COUNTYIQ_INDEX_CORRELATION_OK`

- [ ] **CQ-D-G3 — Weight sensitivity and rank robustness are measured.**
  - CHECK: `node scripts/countyiq/validate-index.mjs sensitivity`
  - EXPECT: `COUNTYIQ_INDEX_SENSITIVITY_OK`

- [ ] **CQ-D-G4 — Historical stability/back-testing is documented before the score loses beta/research status.**
  - CHECK: `node scripts/countyiq/validate-index.mjs history`
  - EXPECT: `COUNTYIQ_INDEX_HISTORY_OK`

## Stage E — accountability gates

- [ ] **CQ-E-G1 — County Government Delivery Score uses only documented government-linked measures.**
  - CHECK: `node scripts/countyiq/validate-accountability.mjs delivery-score`
  - EXPECT: `COUNTYIQ_DELIVERY_SCORE_OK`

- [ ] **CQ-E-G2 — Governor/administration pages separate outcomes from attributable delivery evidence.**
  - CHECK: `node scripts/countyiq/validate-accountability.mjs attribution`
  - EXPECT: `COUNTYIQ_ATTRIBUTION_GUARDS_OK`

- [ ] **CQ-E-G3 — Public-opinion measures are displayed only from a documented defensible series.**
  - CHECK: `node scripts/countyiq/validate-accountability.mjs opinion`
  - EXPECT: `COUNTYIQ_OPINION_SOURCE_OK`

## Stage F — action layer gates

- [ ] **CQ-F-G1 — Every live funding/programme opportunity has a primary source and verification date.**
  - CHECK: `node scripts/countyiq/validate-action.mjs opportunities`
  - EXPECT: `COUNTYIQ_OPPORTUNITIES_VERIFIED_OK`

- [ ] **CQ-F-G2 — Expired or unverifiable opportunities cannot render as live alerts.**
  - CHECK: `node scripts/countyiq/validate-action.mjs expiry`
  - EXPECT: `COUNTYIQ_OPPORTUNITY_EXPIRY_OK`

- [ ] **CQ-F-G3 — County Knowledge Hub documents carry county, type, period, publisher and primary URL.**
  - CHECK: `node scripts/countyiq/validate-action.mjs knowledge`
  - EXPECT: `COUNTYIQ_KNOWLEDGE_METADATA_OK`

- [ ] **CQ-F-G4 — Recognition/awards are generated from machine-readable reproducible rules.**
  - CHECK: `node scripts/countyiq/validate-action.mjs recognition`
  - EXPECT: `COUNTYIQ_RECOGNITION_RULES_OK`

## Stage G — mature product gates

- [ ] **CQ-G-G1 — At least 30 robust county indicators span all seven target domains.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs breadth-stage-g`
  - EXPECT: `COUNTYIQ_BREADTH_STAGE_G_OK`

- [ ] **CQ-G-G2 — Every CountyIQ number supports source/methodology drill-through.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs drillthrough`
  - EXPECT: `COUNTYIQ_DRILLTHROUGH_OK`

- [ ] **CQ-G-G3 — Stale data, revisions and expected releases are surfaced automatically.**
  - CHECK: `node scripts/countyiq/validate-maturity.mjs freshness`
  - EXPECT: `COUNTYIQ_FRESHNESS_OK`

- [ ] **CQ-G-G4 — Full repository validation, accessibility and static-site performance gates pass.**
  - CHECK: `npm test`
  - EXPECT: exit 0 with all CountyIQ and Atlas validators passing.

## Completion rule

Do not describe CountyIQ as 100% complete while any Stage G gate is open. Earlier stages may be released independently if their own gates are met and later functionality is visibly labelled planned/beta rather than implied complete.
