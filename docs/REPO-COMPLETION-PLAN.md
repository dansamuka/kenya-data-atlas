# Kenya Data Atlas — Repository Completion Plan

Status: **living session plan**  
Machine-readable source: `data/project-roadmap.json`  
Goal: finish the repository through bounded, independently deployable phases that can each be implemented, validated and pushed in one substantial working session wherever practical.

## How to use this plan

Start each future session with one phase ID, for example:

> Complete P02 from `docs/REPO-COMPLETION-PLAN.md`. Do not restart completed phases. Implement the full phase, run its acceptance checks, push to `main`, and report any unmet gate explicitly.

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

The remaining work is therefore primarily **analytical integration, county data breadth, decision intelligence, action layers and public-launch hardening**.

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

**Status: next.**

**Purpose:** stop CountyIQ from being a special frontend join of Sprint CSVs.

Implement:

- `scripts/countyiq/build-county-summary.mjs`.
- `data/countyiq/county-summary.json` generated from canonical geography/indicator/series/observation/catalogue registries.
- latest + history + provenance + ranking eligibility + uncertainty + transformation metadata.
- 47-county deterministic coverage validator.
- CountyIQ runtime switched from direct Sprint CSV joins to the mart.

**Push boundary:** builder + generated mart + validator + runtime migration.

**Exit:** 47/47; deterministic rebuild; source/period/unit/badge retained; direct production Sprint CSV joins gone.

---

## P03 — Twelve-year fiscal experience + denominator discipline

Use what is already strong before acquiring more data.

Implement:

- FY2013/14–FY2024/25 county fiscal history.
- total budget, expenditure, overall absorption, development absorption.
- 1/3/5-year change where comparable.
- volatility/stability presentation where analytically meaningful.
- explicit population denominator registry/selection for any per-capita measure.

**Important:** do not invent a 2024 county population denominator merely to show GCP per capita. Use only an explicit compatible official/projection series.

**Exit:** every county has the full 12-year fiscal display; common-period rankings only; denominator metadata visible.

---

## P04 — Health + living-standards activation

This session should focus only on social/health source activation, because survey uncertainty and coverage rules need concentrated review.

Priority candidates already identified in the CountyIQ scaffold:

- monetary poverty;
- stunting;
- immunisation;
- skilled birth attendance;
- HIV prevalence;
- health facility count;
- literacy/household/housing measures where source tables support county comparability.

For survey indicators capture estimate, reference period, sample/standard error or confidence interval where available, and ranking eligibility.

**Exit:** no survey statistic becomes headline/rankable without the required uncertainty metadata and coverage rule.

---

## P05 — Education + economic structure + agriculture + infrastructure

Close the remaining domain breadth gap through primary county-comparable data only.

Target the smallest coherent source packages rather than chasing dozens of one-off indicators. Every new family must enter catalogue → indicator → series → observation → validation, not just the browser.

**Stage-B target:** at least **20 active CountyIQ-eligible indicators across at least 5 domains**.

**Exit:** breadth threshold met; all new indicators documented; zero national-to-county inheritance.

---

## P06 — Peer groups + percentile + trend engine

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

Restore the best part of the old “opportunity cost” concept without speculative claims.

Build transparent counterfactuals such as:

- additional executed development spending if absorption reached a selected peer benchmark;
- service-count gap to a peer/national reference where denominator and interpretation support it.

Then generate the county “what is working / what needs attention / what changed” narrative directly from the same auditable calculations.

**Exit:** every gap shows formula, period, denominator, benchmark and source; narratives are reproducible and non-causal.

---

## P08 — County Development & Performance Index research release

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

Test whether P08 deserves promotion.

Run historical versions where data permits, analyse stability, investigate implausible rank movements, and document whether the index remains research-only or becomes a normal CountyIQ result.

**Exit:** explicit go/no-go decision with evidence, not simply a nicer visual score.

---

## P10 — County Government Delivery + Accountability

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

## P12 — Verified County Opportunity Finder

Create a proper opportunity registry with:

- programme/funder;
- primary URL;
- eligibility;
- opening/deadline;
- official amount where available;
- sectors/counties/entities;
- verification date;
- status;
- match rationale.

**Exit:** expired or unverified records cannot appear as live; no scarcity countdown without source evidence.

---

## P13 — County Knowledge Hub

Build the county document layer:

- CIDP;
- ADP;
- CFSP;
- CBROP;
- approved budgets;
- Controller of Budget reports;
- Auditor-General reports;
- statistical abstracts/profiles;
- sector/climate/investment plans where official.

**Exit:** no `href="#"` placeholder; each document has county, period, type, source URL and verification metadata.

---

## P14 — Atlas-wide UI/data convergence

Technical-debt cleanup after the new CountyIQ/data products exist.

Audit every user-facing factual number and every data-loading surface. Remove stale comments, hidden dependencies on retired interfaces, duplicate browser overlays and hardcoded values that now have canonical equivalents.

Target state:

`canonical registries → generated display products → UI`

rather than many UI-specific datasets.

**Exit:** Compare, profiles, map, series and CountyIQ share the same provenance/missing-period conventions.

---

## P15 — Data distribution + developer surface

The repository already has good machine-readable registries and PostgreSQL/PostGIS schema. Package them into a stable developer experience:

- versioned downloadable data bundle;
- schema/version documentation;
- example queries;
- release metadata;
- optional lightweight API architecture if a static data API is insufficient.

Do not deploy server infrastructure merely for appearance; the static JSON/CSV release can remain the primary API if it satisfies the use case.

---

## P16 — Accessibility + browser + SEO + performance release audit

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

Run sequentially:

`P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09`

After P07, `P12` and `P13` can be done independently while index/accountability work continues. `P10` can begin after sufficient fiscal/accountability data is active. Finish with `P14 → P15 → P16 → P17`.

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
