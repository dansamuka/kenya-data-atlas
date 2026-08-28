# CountyIQ — Target-State Completion Plan

Status: **living product-completion contract**  
Scope: CountyIQ analytical experience inside Kenya Data Atlas  
Target: deliver the full original CountyIQ decision-intelligence ambition without weakening Atlas provenance, geography, comparability or missing-data discipline.

## 0. Product contract

CountyIQ is the analytical layer on top of Kenya Data Atlas. The Atlas remains the canonical evidence layer; CountyIQ interprets, compares, ranks and explains only data that satisfies Atlas publication rules.

The mature product should answer, for every county:

1. **What is the county like?** — scale, population, economy, living standards and structural context.
2. **How is it performing?** — outcomes and delivery measures, with trends.
3. **Compared with whom?** — national rank, percentile and statistically defensible peers.
4. **Is it improving?** — short- and medium-term change using comparable observations.
5. **What is driving the result?** — domain decomposition and transparent indicator contributions.
6. **How is county government performing?** — a separate delivery/accountability layer, not a causal attribution of all county outcomes to a governor.
7. **Where are the gaps?** — transparent benchmark-gap calculations, never invented opportunity values.
8. **What can decision-makers do next?** — verified programmes, funding opportunities, documents and source-backed priorities.
9. **Can every conclusion be audited?** — source, period, geography, transformation, uncertainty, version and methodology must remain visible.

## 1. Depth tree

### 1.1 Foundation — one analytical data contract

**Outcome:** CountyIQ consumes one generated county analytical mart derived from canonical Atlas registries.

- 1.1.1 Define `data/countyiq/target-schema.json`.
- 1.1.2 Define `data/countyiq/roadmap.json` as the machine-readable target-state and readiness ledger.
- 1.1.3 Build `scripts/countyiq/build-county-summary.mjs` to generate `data/countyiq/county-summary.json` from geography, indicator, series, observation, unit, dataset and provenance registries.
- 1.1.4 Store per metric: indicator id/code, geography id/code, period, value, unit, badge, source, statistical status, ranking eligibility, higher-is-better, uncertainty fields and transformation.
- 1.1.5 Derive rankings/percentiles only when the indicator, period and geography coverage satisfy the published eligibility rules.
- 1.1.6 Expose current/historical values without loading the entire master observation registry in the browser.

**Exit:** the current direct Sprint CSV reads in CountyIQ are replaced by the generated mart and a deterministic rebuild reproduces the committed output.

### 1.2 Data breadth — populate the county evidence base

**Outcome:** at least 30 robust county indicators across seven domains, with no synthetic fill for missing counties.

#### Economy & opportunity
- Gross County Product — integrated.
- GCP growth — derived from integrated series.
- GCP per person — requires period-compatible population denominator.
- sector composition — ingest official county GCP tables if available.
- business activity — ingest only comparable primary county series.
- agricultural production/productivity — indicator-specific official tables.

#### Public finance
- approved budget — integrated.
- expenditure — integrated.
- overall absorption — integrated.
- development absorption — integrated.
- 12-year fiscal history — integrated in Atlas; expose in CountyIQ.
- own-source revenue — next Controller of Budget/Treasury ingestion.
- OSR target attainment — derive once target and actual are source-backed.
- pending bills — ingest consistent county history.
- wage/compensation burden — ingest comparable fiscal series.
- development share of expenditure — derive from published fiscal components.

#### Human development & living standards
- monetary poverty — source identified; ingest county estimates with uncertainty.
- literacy — source identified; activate only with valid county observations.
- household size — source identified.
- housing quality/material — source identified.
- water access — source and denominator to be verified.
- sanitation — source and denominator to be verified.
- electricity access — source and denominator to be verified.

#### Health
- health facility count — source identified via KMHFR.
- stunting — source identified via KDHS; uncertainty required.
- full immunisation — source identified via KDHS; uncertainty required.
- skilled birth attendance — source identified via KDHS; uncertainty required.
- HIV prevalence — source identified; uncertainty required.
- teenage pregnancy — source identified; ranking restrictions retained.
- facility infrastructure — source identified/planned.

#### Education & human capital
- enrolment/participation — identify comparable Ministry/KNBS primary table.
- completion/transition — identify comparable primary table.
- literacy — shared human-development measure.
- examination outcomes — use only if KNEC publishes a defensible county table.
- TVET/tertiary access — define only after primary-source coverage assessment.

#### Infrastructure & resilience
- land area — integrated.
- road/network measures — acquire authoritative county-comparable source.
- internet/digital access — prefer county primary/official measure; national WDI must not be inherited.
- food-security phase — ingest seasonal assessments with period labels.
- climate/environment exposure — define transparent physical indicators.
- fuel pricing — retain as pricing-town context, not county performance.

#### Institutions & accountability
- audit opinion/findings — structure Auditor-General county outputs.
- pending bills — shared public-finance/accountability signal.
- budget credibility — derive only from consistent approved/revised/executed figures.
- procurement/project delivery — only if a defensible primary dataset can be built.
- data transparency — measure publication completeness using a published rubric.

**Publication rule:** headline ranking requires a common definition and reference period plus >=90% county coverage unless the methodology specifies a stricter threshold. Lower coverage may appear in profiles but not as a 47-county league table.

### 1.3 Benchmarking — make comparison structurally fair

**Outcome:** CountyIQ supports national comparison and defensible peer comparison.

- 1.3.1 Start with transparent rule-based peer groups documented from observable county characteristics.
- 1.3.2 Build a research version of statistical peer clustering using population, urbanisation, density, economic scale/structure, land/aridity and living-standard measures.
- 1.3.3 Version every peer-group definition.
- 1.3.4 Display national median, peer median, rank, percentile and distance-to-peer benchmark.
- 1.3.5 Never treat peer membership as a quality judgement.

**Exit:** every peer comparison can be reproduced from a published peer definition and input variables.

### 1.4 Time & trend intelligence

**Outcome:** CountyIQ answers whether conditions are changing rather than merely showing a snapshot.

For eligible indicators expose:
- latest observation;
- one-period change;
- 3- or 5-year change where available;
- national change over the same interval;
- peer-median change over the same interval;
- trend consistency/volatility;
- explicit break-in-series and preliminary/revised flags.

First flagship: **12-year County Fiscal Performance** using Controller of Budget history plus FY2024/25.

### 1.5 County Development & Performance Index

**Outcome:** restore the composite ambition as a transparent, versioned derived product.

Prerequisites:
- sufficient domain breadth;
- stable coverage;
- directionality checked;
- normalization selected and documented;
- outlier treatment documented;
- missing-data rules documented;
- correlation/multicollinearity review;
- weighting rationale;
- sensitivity analysis;
- rank-robustness testing;
- historical back-testing/stability analysis;
- public methodology and version history.

The product should publish:
- overall score;
- pillar scores;
- rank and percentile;
- change since comparable baseline;
- peer rank;
- contribution breakdown;
- uncertainty/robustness range when reasonable alternative specifications change rank materially.

**Do not publish** a composite simply because a weighting formula exists.

### 1.6 County Government Delivery & Accountability Score

**Outcome:** separate government-controllable delivery from broad county outcomes.

Candidate dimensions:
- budget execution;
- development execution;
- OSR performance;
- pending bills;
- wage burden;
- audit/accountability findings;
- service-availability indicators directly linked to county functions;
- project-delivery evidence where defensible.

This is distinct from the County Development & Performance Index.

### 1.7 Governor / administration scorecards

**Outcome:** restore the leadership view without unsupported causal attribution.

A governor page may show:
- administration term;
- baseline vs latest county-government delivery metrics;
- peer and national changes;
- fiscal/accountability record;
- selected service-delivery changes;
- source-backed public-opinion series only when a defensible dataset exists.

Required disclaimer: county outcomes reflect many actors and conditions; the scorecard does not establish personal causation by the governor.

### 1.8 Evidence-based recognition

**Outcome:** replace unsupported Presidential Awards with reproducible CountyIQ recognition.

Examples:
- Most Improved County;
- Fiscal Execution Leader;
- Human Development Leader;
- Economic Momentum Leader;
- Best Peer-Group Performer;
- Data Transparency Leader.

Every recognition must have a machine-readable rule, eligible indicator set, reference period and tie rule. No editorial award may masquerade as an official state honour.

### 1.9 Development Gap Calculator

**Outcome:** restore the opportunity-cost concept as transparent counterfactual arithmetic.

Examples:
- extra development expenditure if a county matched peer-median absorption;
- number of additional service users/outcomes implied by closing an eligible rate gap, using an explicit denominator;
- economic/fiscal gap to peer median where units and period are compatible.

Every calculation must expose formula, benchmark, denominator, period and source. Avoid causal language unless a causal model is separately validated.

### 1.10 County Opportunity Finder

**Outcome:** turn the old scarcity/funding concept into a verified programme database.

Each opportunity record must include:
- programme/funder;
- primary source URL;
- programme status;
- eligible applicant type;
- geography/sector eligibility;
- opening and deadline dates;
- amount/range if officially published;
- eligibility criteria;
- verification date;
- match rationale;
- whether match is rule-based or manually reviewed.

Expired/unverified programmes must never render as live scarcity alerts.

### 1.11 County Knowledge Hub

**Outcome:** make CountyIQ the fastest evidence entry point for each county.

Document classes:
- CIDP;
- Annual Development Plan;
- County Fiscal Strategy Paper;
- County Budget Review and Outlook Paper;
- approved budgets;
- Controller of Budget reports;
- Auditor-General reports;
- county statistical abstracts;
- sector plans;
- spatial/climate/investment plans;
- source datasets used in CountyIQ.

Each document requires county, document type, period, publication date, publisher, primary URL, local archive status and extraction/indexing status.

### 1.12 Production hardening

**Outcome:** CountyIQ is maintainable, auditable and safe to update.

- deterministic data build;
- schema validation;
- regression tests;
- accessibility checks;
- mobile layout checks;
- no hardcoded production statistics;
- broken-link checks for primary sources;
- stale-data/expected-release monitoring;
- correction/revision workflow;
- methodology/version changelog;
- performance budget for static hosting;
- graceful missing-data states.

## 2. Release stages

### Stage A — Architecture complete
CountyIQ mart schema, builder, roadmap ledger and validation integrated into CI.

### Stage B — Evidence breadth
>=20 active, useful county indicators across >=5 domains; fiscal history and matched denominators surfaced.

### Stage C — Benchmark intelligence
Peer groups, percentiles, trends and gap calculations in production.

### Stage D — Composite research release
County Development & Performance Index published as beta/research with sensitivity and robustness disclosures.

### Stage E — Accountability release
County Government Delivery Score and administration scorecards with attribution caveats.

### Stage F — Action layer
Verified Opportunity Finder, Knowledge Hub and evidence-based recognition live.

### Stage G — Mature CountyIQ
>=30 robust county indicators across seven domains; automated updates; versioned scores; full source drill-through; historical and peer comparisons; production validation passing.

## 3. Priority order from current state

1. Generated CountyIQ mart and validation.
2. 12-year fiscal performance experience.
3. Population denominator strategy + GCP/person and per-capita fiscal metrics.
4. KDHS/KNBS poverty and health ingestion with uncertainty.
5. OSR, pending bills and wage-burden fiscal/accountability measures.
6. Infrastructure/education/agriculture/business breadth.
7. Versioned peer groups.
8. Development Gap Calculator.
9. Composite-index research and sensitivity testing.
10. County Government Delivery Score.
11. Administration/governor scorecards.
12. Opportunity Finder.
13. Knowledge Hub and reproducible recognition.
14. Automated release/staleness monitoring and final production hardening.

## 4. Definition of 100% of intended vision

CountyIQ is considered functionally complete when it can, for every county, provide a source-auditable profile; multi-domain performance view; time trend; national and peer comparison; defensible overall and domain indices; separate county-government delivery/accountability view; administration context; transparent development-gap calculations; verified opportunity matching; county document hub; reproducible recognition; and complete methodology/source drill-through — while retaining honest missing-data, uncertainty and geography controls.
