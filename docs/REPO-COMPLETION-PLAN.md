# Kenya Data Atlas — Repository Completion Plan

Status: **living session plan**  
Machine-readable source: `data/project-roadmap.json`  
Goal: finish the repository through bounded, independently deployable phases that can each be implemented, validated and pushed in one substantial working session wherever practical.

## How to use this plan

Start each future session with one phase ID, for example:

> Complete P13 from `docs/REPO-COMPLETION-PLAN.md`. Do not restart completed phases. Implement the full phase, run its acceptance checks, push to `main`, and report any unmet gate explicitly.

A phase is deliberately scoped so the session ends with a coherent release rather than a half-built cross-cutting change. If a phase reveals a material blocker, record it instead of silently substituting demo or lower-quality data.

## Current baseline

Already complete and not to be restarted without a regression/correction:

- Governance/statistical publication foundation.
- Canonical Kenya → County → Constituency → Ward registry.
- Validated geometry hierarchy.
- Source/dataset/provenance registry.
- Sprint 1 County Core.
- Sprint 2 Local Kenya voter hierarchy.
- World Bank national integration with no county inheritance.
- Sprint 3 historical national/fiscal package.
- County Life five-family 47/47 package.
- Main Compare workspace.
- CountyIQ evidence-first redesign and target-state scaffold.
- P00 CountyIQ runtime stabilization and source-backed sample fallback.
- P01 shared registry loader, compact first-paint data product, lazy Geo Explorer/D3 path, deferred heavy registries and initial-load performance budget.
- P02 canonical 47-county CountyIQ analytical mart with deterministic registry-derived build, provenance/eligibility metadata and mart-backed runtime.
- P03 twelve-year county fiscal experience with common-period rankings, exact 1/3/5-year changes, absorption volatility, responsive history UI and explicit denominator withholding.
- P04 47-county health and living-standards package with 2022 poverty/KDHS survey precision metadata, withheld survey rankings, and the 2023 Health Facility Census assessed-facility inventory.
- P05 47-county education, economic-structure, agriculture and infrastructure breadth package, adding 14 source-backed county indicators and taking CountyIQ to 34 fully county-covered indicators across 7 domains.

With P00–P13 complete and P15 now released, the remaining v1.0 work is **real-browser/accessibility/SEO/performance hardening (P16) and final release closeout (P17)**. P14 Opportunity Finder is explicitly deferred to v1.1 Beta because programme freshness requires continuing maintenance.

---

## P00 — Runtime stabilization + CountyIQ sample fallback

**Status: complete.**

**Purpose:** CountyIQ must remain inspectable even when browser fetches fail.

This phase introduced a bundled six-county source-backed core snapshot and an explicitly synthetic mature-product preview. Production data remains the first choice. A failed production fetch no longer deletes the CountyIQ navigation/roadmap/methodology surface.

**Push boundary:** resilience code + sample bundle + styling + runtime validation.

**Exit:** CountyIQ can degrade to the bundled snapshot while clearly identifying fallback mode; synthetic index/opportunity examples are visibly marked Demo.

---

## P01 — Initial-load performance + shared registry loader

**Status: complete.**

P01 introduced one shared cached loader, migrated the main shell/Compare/Geo Explorer away from independent heavy fetch paths, moved D3 and map geometry off first paint, created a deterministic compact national pulse product, and added a measurable asset-budget validator.

Release evidence: the full Atlas workflow passed deterministic rebuild, seed/output drift checks, all geography/catalogue/indicator/Sprint/County Life validators, and the independent Shapely geometry audit.

Measured P01 guardrail at release: direct local first-paint JavaScript ≈ 82 KB and first-paint data ≈ 9 KB, while master observations (~8.2 MB), series (~3.0 MB) and ward geometry (~44.4 MB) are deferred.

**Do not reopen:** shared loader/lazy-loading architecture unless a regression or later convergence phase requires a deliberate change.

---

## P02 — CountyIQ canonical analytical mart

**Status: complete.**

P02 introduced `scripts/countyiq/build-mart.mjs` and the generated `data/countyiq/county-summary.json`, derived from canonical geography, catalogue, indicator, series and observation registries. The mart contains exactly 47 counties and retains latest/history, unit, provenance/source lineage, uncertainty and ranking-eligibility metadata.

The integrated CountyIQ route now loads the canonical mart through the shared Atlas loader instead of joining Sprint CSVs in the browser. Deterministic rebuild, committed-output drift checks, the full Atlas validation suite and the independent Shapely geometry audit passed before merge; GitHub Pages then deployed the generated mart successfully.

**Do not reopen:** direct Sprint CSV joins in production CountyIQ are retired; later analytical constructs remain gated to their own phases.

---

## P03 — Twelve-year fiscal experience + denominator discipline

**Status: complete.**

P03 extended the canonical CountyIQ mart with a synchronized 47-county × 12-fiscal-year panel covering FY2013/14–FY2024/25 for total budget, total expenditure, overall budget absorption and development budget absorption. Every annual record retains canonical observation and provenance/source lineage.

The release adds exact 1/3/5-year comparable changes, descriptive twelve-year absorption volatility, and rankings calculated only against all 47 counties in the same fiscal year. Budget/expenditure ranks are explicitly scale positions; absorption ranks are rate positions and are not causal performance scores.

P03 also publishes machine-readable denominator discipline: county population interpolation is prohibited, Kenya-level population cannot be inherited to counties, and per-capita fiscal measures remain withheld because the active canonical registry does not yet contain an explicitly compatible annual county population series across the full fiscal panel.

Release evidence: the focused P03 validator passed 47 × 12 coverage, canonical traceability, common-period rankings, denominator discipline and responsive fiscal UI checks. The exact PR candidate then passed deterministic rebuild, committed-output drift, the full Atlas validation suite and the independent Shapely geometry audit. The merged generated mart subsequently deployed successfully to GitHub Pages.

**Do not reopen:** do not introduce interpolated county denominators or browser-side Sprint fiscal joins; future per-capita measures require a separately activated compatible population series.

---

## P04 — Health + living-standards activation

**Status: complete.**

P04 activated a coherent five-indicator county social-outcomes package across all 47 counties: 2022 overall poverty with KNBS source-reported standard errors; 2022 KDHS stunting, basic immunisation and skilled birth attendance with source table denominators retained as precision metadata; and the 2023 Ministry of Health Health Facility Census assessed-facility inventory, reconciling to 14,883 assessed facilities.

Survey point estimates and raw facility counts remain deliberately unranked in this phase. CountyIQ exposes source, period and available precision evidence without inventing confidence intervals or presenting a composite health score. P04 does not introduce HIV estimates, per-capita facility rates, governor scores or causal performance claims.

Release evidence: the exact PR candidate passed deterministic rebuild, committed-output drift checks, the full Atlas validation suite and the independent Shapely geometry audit. PR #12 merged to `main`; the generated-data workflow then published the canonical CountyIQ mart, and the resulting publish head deployed successfully to GitHub Pages.

**Do not reopen:** survey rankings remain gated to later comparison methodology; source precision must remain explicit and no missing uncertainty field may be fabricated.

---

## P05 — Education + economic structure + agriculture + infrastructure

**Status: complete.**

P05 closed the Stage-B domain-breadth gap with four compact official-source packages, all entered through catalogue → indicator → series → observation → CountyIQ rather than as browser-only data.

The release adds 14 county indicators across all 47 counties (658 county metrics): public primary and secondary school establishments and TSC teacher establishments; agriculture and manufacturing GVA plus transparent shares of 2024 GCP; 2023 maize area, production and Atlas-derived yield; and 2023/24 internet use, computer use and household main-grid electricity connection. Derived sector shares and maize yield remain explicitly distinguished from directly published values.

The completed CountyIQ mart has at least 34 fully county-covered active indicators across 7 domains, exceeding the Stage-B target of at least 20 indicators across at least 5 domains. The package preserves source reference periods, provenance and denominator meaning, and introduces zero national-to-county or county-to-lower-geography inheritance.

Release evidence before PR: the focused P05 validator passed source reconciliation, four dataset-provenance packages, 47 × 14 coverage, non-inheritance, derived-value badge checks, UI integration and the breadth gate. The full registry then passed with 21 units, 98 indicators, 3,370 series and 6,864 observations; the independent Shapely geometry audit reported 0 critical issues and 0 warnings.

**Do not reopen:** do not convert these mixed-period breadth measures into an ungoverned composite score or ranking. Peer comparison, percentiles and trend logic belong to P06.

---

## P06 — Peer groups + percentile + trend engine

**Status: complete.**

Do this before a composite score.

Implement:

- transparent first-generation peer groups;
- versioned inputs/rules;
- peer median/rank;
- national percentile;
- matched 1/3/5-year trends where observations permit;
- revision/comparability flags.

A later statistical clustering method may replace/augment rule-based groups, but the production definition must always be reproducible.

**Exit:** every displayed peer comparison can be reconstructed from a published peer definition.

---

## P07 — Development Gap Calculator + evidence narratives

**Status: complete.**

Restore the best part of the old “opportunity cost” concept without speculative claims.

Build transparent counterfactuals such as:

- additional executed development spending if absorption reached a selected peer benchmark;
- service-count gap to a peer/national reference where denominator and interpretation support it.

Then generate the county “what is working / what needs attention / what changed” narrative directly from the same auditable calculations.

**Exit:** every gap shows formula, period, denominator, benchmark and source; narratives are reproducible and non-causal.

---

## P08 — County Development & Performance Index research release

**Status: complete.**

A dedicated methodology session.

Implement and publish:

- indicator inclusion rules;
- directionality;
- normalization;
- missing-data treatment;
- outlier treatment;
- weights;
- correlation/multicollinearity review;
- alternative weighting scenarios;
- rank robustness bands.

Ship as **Research/Beta**, not as a definitive county/governor score.

**Exit:** score can be regenerated from published inputs/methodology and shows robustness range.

---

## P09 — Historical index validation + production decision

**Status: complete.**

Test whether P08 deserves promotion.

Run historical versions where data permits, analyse stability, investigate implausible rank movements, and document whether the index remains research-only or becomes a normal CountyIQ result.

**Exit:** explicit go/no-go decision with evidence, not simply a nicer visual score.

---

## P10 — County Government Delivery + Accountability

**Status: complete.**

Build a second analytical construct that is narrower than county outcomes.

Candidate components:

- budget execution;
- own-source revenue and target attainment;
- pending bills;
- compensation/wage burden;
- Auditor-General outcomes/findings;
- selected directly government-linked service/project measures.

**Exit:** published methodology clearly explains why each metric is attributable enough to belong in a government delivery layer.

---

## P11 — Administration scorecards + CountyIQ Recognition

**Status: complete.**

Reintroduce leadership-period presentation only after P10.

Show:

- administration term baseline;
- latest delivery indicators;
- peer/national movement;
- fiscal/accountability record;
- explicit limits on causal attribution.

Replace “Presidential Awards” with algorithmic **CountyIQ Recognition** categories generated from published rules.

**Exit:** no political leader receives a personal causal score based simply on broad county outcomes.

---

## P12 — Canonical Convergence & Governance

**Status: complete.**

P12 makes static indicator semantics a governed product rather than scattered implementation detail. The versioned executable policy in `scripts/policy/indicator-policy.mjs` now owns domain, direction, composite eligibility, ranking mode, uncertainty requirement, trend permission, parent-value inheritance, publication state and cross-level normalisation rules.

The generated `data/policy/indicator-policy.json` exposes the policy publicly for all indicators and observed series. CountyIQ, P06 direction/trend logic and the cross-level eligibility builder consume the same canonical layer, while dynamic evidence checks such as coverage, common periods, provenance and actual history remain independently validated.

Release evidence: all 98 indicator policies, all 3,370 published observed-series cross-level decisions and all 47 CountyIQ county records passed the P12 convergence validator; P03–P11 remained green; full `npm test` and the independent Shapely geometry audit passed.

**Exit:** no main analytical path carries a duplicate domain/direction/cross-level policy, parent geography values remain non-inheritable, and policy drift is a test failure. See `docs/P12-CANONICAL-CONVERGENCE.md`.

---

## P13 — County Evidence & Knowledge Hub

**Status: complete.**

P13 adds a generated, county-scoped official-document registry and searchable Evidence Hub inside CountyIQ. All 47 counties have a verified 2023–2027 CIDP document or official source page. Common evidence doorways cover Controller of Budget implementation reporting, Auditor-General county audit collections, CFSP and CBROP discovery, with richer official ADP/CFSP/CBROP/budget source hubs where separately verified.

The registry distinguishes `verified_document`, `verified_source_page`, `verified_source_collection`, `not_published`, `not_found` and `inaccessible`. A collection link is never labelled as an exact county file, unavailable states require a reason, and placeholder/fragment links are rejected.

Release evidence: 47/47 CIDP coverage, at least four non-CIDP 47-county evidence doorways, full Atlas tests and the independent geometry audit pass.

**Exit:** every county has a durable official-document doorway and evidence-state drift fails CI. See `docs/P13-COUNTY-EVIDENCE-HUB.md`.

---

## P14 — Action & Opportunity Finder Beta

**Status: deferred.**

**Target:** v1.1 Beta. This phase is intentionally not a v1.0 blocker because live opportunity/deadline accuracy requires an ongoing freshness operation after launch.

Build the action layer after the canonical/evidence foundations rather than as a small national-programme list. Connect published P07 gaps and P10/P11 context to a verified, date-aware programme registry.

Each live record needs programme/funder, primary URL, beneficiary and geographic eligibility, sector, application method, opening/deadline or rolling status, verification date, next-review date and explicit live/paused/closed/unknown state. Amounts, rates and deadlines are shown only when source-backed.

**Exit:** stale or unverified programmes cannot appear as live, and every match rationale is reproducible from programme rules plus displayed county evidence. Ship this surface as Beta because freshness requires continuing maintenance.

---

## P15 — Data distribution + developer surface

**Status: complete.**

P15 packages the canonical registries, CountyIQ results and county evidence into a stable static developer experience without creating a parallel data store. It publishes a versioned manifest, checksums, JSON Schemas, NDJSON, flattened result/evidence CSVs and query-sized county/indicator bundles.

Implemented release surface:

- versioned downloadable data bundle;
- schema/version documentation;
- example queries;
- release metadata;
- static manifest/subset API as the primary developer interface; server infrastructure remains unnecessary for v1.0.

Release evidence is documented in `docs/P15-DATA-DISTRIBUTION.md`; consumer examples and versioning rules are in `docs/DEVELOPER.md`. Parquet remains a reproducible consumer-side conversion rather than a second canonical binary store.

---

## P16 — Accessibility + browser + SEO + performance release audit

**Status: next.**

Recommended next-session instruction: **Complete P16** from `data/project-roadmap.json`. Do not restart completed phases.

A dedicated public-launch hardening session:

- WCAG 2.2 AA review;
- keyboard/focus/contrast/labels;
- Chrome/Firefox/Safari/Edge smoke checks;
- mobile layout;
- broken links;
- metadata/social cards/SEO;
- JS console errors;
- page/asset weight;
- slow-network degradation.

**Exit:** critical issues fixed; remaining limitations documented.

---

## P17 — Final reproducibility + governance + v1.0

**Status: planned.**

Final closeout session.

Run/reconcile:

```bash
npm run build:data
npm test
npm run geography:audit
```

Then:

- reconcile the repository completion ledger;
- re-measure published counts;
- review corrections/revisions/data quality;
- rewrite README from “static MVP” to the actual v1.0 state;
- update CHANGELOG/release notes;
- list genuinely unresolved external-data constraints rather than hiding them.

**v1.0 should mean:** the declared product is reproducible, source-auditable, usable, performant and methodologically honest—not that every desirable Kenyan dataset exists.

## Recommended session order

The v1.0 sequence is now:

`P00–P13 complete → P15 complete → P16 next → P17 → v1.0`

P14 is explicitly deferred to `v1.1 Beta`; P17 must not weaken evidence or browser gates merely to pull that maintenance-heavy action layer into v1.0.

## Session completion protocol

At the end of every phase:

1. re-read the phase scope and ensure no required output was silently skipped;
2. run the phase-specific validator(s);
3. run the relevant existing release validators;
4. push the coherent phase to `main`;
5. confirm CI/Pages state where applicable;
6. update `data/project-roadmap.json` status only after evidence exists;
7. report the exact next phase ID.

This structure is intentionally designed so a future session can begin with only **“Complete P0X”** and recover the expected scope without re-planning the whole project.
