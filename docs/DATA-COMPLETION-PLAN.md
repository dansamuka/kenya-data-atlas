# Kenya Data Atlas — P18–P26 Data Completion Plan

Status: **active governed completion programme**

Machine-readable phase authority: [`data/data-completion-roadmap.json`](../data/data-completion-roadmap.json)  
Machine-readable execution authority: [`data/data-completion-execution.json`](../data/data-completion-execution.json)  
Live completion ledger: [`data/completeness/summary.json`](../data/completeness/summary.json)

## Why this programme exists

The original `P00–P17` roadmap governs the Atlas product build and v1.0 release process. The next programme is different: it is a **data-completion programme** whose purpose is to resolve every public data slot while preserving the Atlas rule that missing local values must never be invented, silently inherited from a broader geography, or filled from a weak source merely to improve a percentage.

For that reason, `P18–P26` is documented separately rather than being appended to `data/project-roadmap.json`. This preserves the exact P17/v1.0 release-count semantics while giving the continuing work the same session-sized, acceptance-gated structure used for P00–P17.

## Historical baseline and live state

The programme baseline established on 31 August 2026 was:

- **20,115 total slot instances**
- **3,385 resolved**
- **16,730 unresolved**
- **16.83% resolved**
- **49 unique indicator slots**
- **0 unknown/unclassified blanks**

Baseline unresolved queue:

| Phase | Queue |
|---|---:|
| P20 | 0 |
| P21 | 423 |
| P22 | 66 |
| P23 | 3,190 |
| P24 | 13,050 |
| P25 | 1 |

The historical baseline remains fixed for auditability. The machine-readable live ledger is authoritative after subsequent tranches. Following P21 tranches 1–5, the live summary reports **3,620 resolved**, **16,495 unresolved**, **0 unknown blanks**, and **188 P21 rows** remaining.

## Completion semantics

A slot is not considered complete just because a card has something displayed. The final programme distinguishes:

- direct published observations;
- transparently derived/modelled observations allowed by policy;
- verified external observations;
- governed non-numeric closure states such as **not applicable**, **source not published**, **boundary unresolved**, or **retired/replaced**.

The final P26 dashboard will report **slot resolution** separately from **numeric/categorical evidence coverage**. This allows the Atlas to reach 100% governed resolution without pretending that a value exists where no defensible value exists.

## Parallel execution model — scheduling changes, governance does not

The P18–P26 phase definitions, governed slot allocations and acceptance gates remain unchanged in `data/data-completion-roadmap.json`. A separate execution overlay now allows independent work to proceed in parallel where the source and geography contract is already strong.

### Track A — County completion

`P21 → P22`

P21 remains the active hard-county closure track and continues one indicator family per PR. P22 may be prepared once its date-aware source/freshness contracts are defensible, but P21's own acceptance requirements are not waived.

### Track B — Local intelligence accelerator

`P23A → P23`

**P23A is not a new governed phase.** It is an accelerator inside P23. It can resolve only pre-existing P23 slot instances and cannot change the **20,115-slot denominator**. Full P23 remains the completion gate for all 290 constituencies.

P23A starts with reusable national pipelines rather than 290 hand-maintained files. Initial order:

1. `IND-REGISTERED-VOTERS` / constituency electorate;
2. official turnout history where citable and comparable;
3. current MP identity;
4. NG-CDF allocation;
5. NG-CDF utilisation/implementation only where a nationally comparable official source exists.

The first tranche is unusually mature already: Sprint 2 has audited **290/290 constituency totals** from IEBC Gazette Notice No. 7290. The existing treatment is deliberately **B — Official derived**: each constituency is the exact sum of all official IEBC First Schedule child-ward rows. The ten Mandera East/Lafey rows remain in those constituency totals even though their ward polygons are withheld. The Gazette also contains a Second Schedule per constituency, but P23A preserves the established derivation method unless a separate direct-schedule ingestion is independently built and validated.

P23A acceptance for every family:

- primary/official statistical authority is citable;
- every promoted row reconciles to the canonical constituency registry;
- registered-voter migration preserves the audited B/Official-derived treatment;
- election/boundary vintage is explicit;
- no county value is inherited downward;
- only existing P23 slots are resolved and the governed denominator stays fixed;
- unresolved mappings remain unresolved rather than force-matched;
- deterministic builder + validator exist;
- full Atlas and P16 gates pass before merge.

### Track C — Final convergence

`P24 → P25 → P26`

The ward layer, remaining public-surface closure and permanent 100% gate keep their original dependencies. P24 cannot claim completion before full P23 acceptance. The Mandera East/Lafey spatial hold remains visible until genuinely reconciled.

**Formal phase closure order remains:** `P18 → P19 → P20 → P21 → P22 → P23 → P24 → P25 → P26`.

---

## P18 — Exact completeness ledger and false-empty elimination

**Status: complete.**

**Goal:** Convert the entire public data surface into a deterministic slot ledger and eliminate false empties caused by stale placeholder lifecycle metadata.

**Core outputs**
- `data/completeness/slot-ledger.json`
- `data/completeness/slot-ledger.csv`
- `data/completeness/summary.json`
- phase assignment for every unresolved slot
- zero-unknown completeness gate
- lifecycle precedence correction in county profiles

**Acceptance**
- 20,115 slot instances compile deterministically.
- 49 unique governed indicators are represented.
- `unknown_missing = 0`.
- Every unresolved row has a later phase or closure path.
- An active canonical observation cannot be downgraded to a placeholder by taxonomy metadata.

**Completion note:** Completed in PR #23.

---

## P19 — Surface existing 47/47 county sector data

**Status: complete.**

**Goal:** Use the strong county data already in the Atlas before searching for new sources.

**Core outputs**
- education measures surfaced;
- connectivity/electricity measures surfaced;
- economic-structure measures surfaced;
- agriculture production/yield measures surfaced;
- no duplication of canonical observations;
- no artificial inflation of the P18 denominator.

**Acceptance**
- selected sector indicators reconcile 47/47 counties;
- source/period/provenance remain visible;
- supplementary data does not double-count governed slot completion;
- Atlas and P16 gates pass.

**Completion note:** Completed in PR #25. Fourteen existing sector indicators covering 658 county observations were surfaced more effectively.

---

## P20 — Activate straightforward sourced county slots

**Status: complete.**

**Goal:** Turn sourced-but-uningested county placeholders into canonical active observations using already-reviewed primary source families.

**Primary source families**
- KNBS Census / household and living-standard tables;
- KDHS county health tables;
- Controller of Budget fiscal tables;
- Auditor-General categorical results;
- verified electricity and facility-density sources.

**Completed so far**
- 47/47 main-grid electricity slots;
- 47/47 FY2024/25 own-source-revenue target-attainment slots;
- **94 slots resolved in tranche 1**.
- 47/47 FY2023/24 County Executive audit opinions, verified directly from OAG Appendix 1(a), pages 69–70; all are categorically **Qualified**.
- **141 P20 slots resolved across tranches 1–2**.
- 47/47 county average-household-size slots from KNBS 2019 KPHC Volume I Table 2.3.
- **188 P20 slots resolved across tranches 1–3**.
- Consolidated batch 1: all eleven remaining P20 county families resolved under governed evidence contracts (**517 slots**): eight numeric/source families (376), facility density (47), pending bills (46 numeric + 1 official non-submission), and substance-use prevalence (47 official county-unavailable states).
- **705 P20 slots resolved across completed promotions; P20 is complete.**

**Remaining queue:** **0**.

**Acceptance**
- P20 queue reaches zero;
- survey uncertainty/sample rules remain intact;
- no duplicate series are created;
- categorical audit outcomes are not forced into unsupported numeric rankings;
- every tranche passes deterministic build and release gates.

---

## P21 — Resolve hard county slots and retire weak placeholders

**Status: in progress.**

**Goal:** Close the county slots that require a harder source decision, derivation, or deliberate replacement/retirement.

**Target areas**
- social-protection beneficiaries;
- exam-performance source decision;
- business-licence replace/retire decision;
- facility electricity/water and hospital-capacity measures;
- road length;
- improved-water access;
- vehicle registrations.

**P21 tranche 1 — agriculture replacement:** the 47 generic `IND-AGRI-PRODUCTION` slots are retired/replaced by the already-published, fixed-definition `IND-MAIZE-AREA`, `IND-MAIZE-PRODUCTION` and `IND-MAIZE-YIELD` county series. This preserves the governed denominator while removing a weak mixed-crop concept.

**Remaining queue after tranche 1:** **376** across eight 47-county families.

**P21 tranche 2 — improved drinking-water access:** 47/47 `IND-WATER-ACCESS` county slots are promoted from KNBS 2023/24 Kenya Housing Survey Table 5.14. The Atlas uses the published improved-source subtotal directly, retains the household-survey definition, withholds rankings where uncertainty is unavailable, and does not inherit values below county.

**Remaining queue after tranche 2:** **329** across seven 47-county families.

**P21 tranche 3 — exam-performance replacement:** all 47 `IND-EXAM-PERFORMANCE` slots are retired/replaced rather than manufacturing a mixed KCPE/KCSE county mean. KNEC records 2023 as the final KCPE examination; the Atlas keeps existing school-attendance, school-establishment and teacher indicators as clearly labelled education evidence, not exam-score proxies.

**Remaining queue after tranche 3:** **282** across six 47-county families.

**P21 tranche 4 — business-licence replacement:** all 47 `IND-BUSINESS-LICENSES` slots are retired/replaced because county licensing publications and administrative systems do not provide one governed 47-county series with consistent definitions and vintages. The Atlas does not stitch opportunistic county counts together or interpret non-publication as zero; it directs users to fixed-definition official GCP and agriculture/manufacturing economic-structure indicators instead.

**Remaining queue after tranche 4:** **235** across five 47-county families.

**P21 tranche 5 — facility-infrastructure replacement:** all 47 `IND-FACILITY-INFRASTRUCTURE` slots are retired/replaced because the original profile field combines electricity and water into one undefined percentage and the official 2023 Health Facility Census does not provide one governed 47-county combined amenity series. The Atlas does not infer county rates from charts or manufacture a combined score; existing health-facility stock and density indicators remain the clearly labelled county infrastructure-supply measures.

**Remaining queue after tranche 5:** **188** across four 47-county families.

**Key principle:** If a defensible comparable 47-county source does not exist, the correct result is an explicit governed closure or a stronger replacement indicator — not a weak scrape.

**Acceptance**
- all 423 rows resolved or governed closed;
- every retired slot has a documented reason;
- no unexplained planned county card remains.

---

## P22 — ASAL resilience completion

**Status: planned.**

**Goal:** Complete the resilience layer for eligible ASAL counties with current, date-aware evidence.

**Target data**
- NDMA food-security phase;
- NDMA drought early-warning status;
- rainfall/temperature anomaly evidence;
- ASAL eligibility and freshness metadata.

**Queue:** **66** slot instances.

**Acceptance**
- all 66 resolved or evidence-constrained;
- 22 whole-county ASAL eligibility is reproducible;
- partial-ASAL geography is not silently promoted to whole-county status;
- stale alerts cannot appear as current.

---

## P23 — Constituency layer completion

**Status: full phase planned; P23A national-pipeline accelerator in progress.**

**Goal:** Complete the constituency surface through reusable national pipelines, not 290 hand-maintained files.

**Target pipelines**
- IEBC voter and turnout history;
- MP identity;
- NG-CDF allocation;
- NG-CDF utilisation/implementation;
- authoritative census/household measures where published;
- permitted spatial service aggregation.

**Queue:** **3,190** remaining slot instances at the pre-P23A baseline. P23A resolves rows from this existing queue; it creates no additional slots.

**P23A first tranche — constituency registered voters:** migrate the already-audited Sprint 2 `IND-REGISTERED-VOTERS` constituency statistics into the native canonical registry across all 290 constituencies. Values remain **B — Official derived**, exact sums of all official IEBC First Schedule child-ward rows. The source authority is Gazette Notice No. 7290. The Mandera ward geometry hold does not reduce constituency totals because all source rows remain statistically included.

**Acceptance**
- all 290 constituencies reconcile to the canonical registry;
- no county value is inherited downward;
- boundary and election vintages are explicit;
- all P23 rows are resolved or governed closed.

---

## P24 — Ward layer completion

**Status: planned.**

**Goal:** Resolve the remaining ward-level surface through national crosswalks, representation/election data and controlled spatial aggregation.

**Target pipelines**
- MCA identity;
- ward election turnout;
- health/service aggregation;
- land-area derivation where geometry is authoritative;
- conditional ward-fund treatment;
- preservation of known boundary holds.

**Queue:** **13,050** remaining slot instances.

**Acceptance**
- all 1,450 statistical wards remain represented;
- no constituency/county value is inherited;
- boundary mismatches are explicit;
- non-uniform ward-fund programmes are marked not applicable rather than fabricated;
- Mandera East/Lafey spatial constraints remain transparent until genuinely resolved.

---

## P25 — National Pulse and non-profile surface closure

**Status: planned.**

**Goal:** Close the final national placeholder and audit all public surfaces for unexplained missing states.

**Target**
- national mobile-money series or governed replacement;
- Pulse completeness;
- CountyIQ null-state reasons;
- Compare/Rankings missing-value behaviour;
- Evidence Hub state matrix;
- Opportunity Finder explicit no-match state.

**Ledger queue:** **1** national slot.

**Acceptance**
- final national slot is resolved or governed closed;
- absence is never treated as zero;
- public routes contain no unexplained data dash.

---

## P26 — Permanent 100% slot-resolution gate

**Status: planned.**

**Goal:** Turn the completion exercise into a permanent release control so later data work cannot reintroduce hidden or unexplained gaps.

**Final outputs**
- 100% slot-resolution dashboard;
- separate numeric/categorical evidence-coverage metric;
- CI gate for unknown blanks;
- CI gate for hidden active observations;
- CI gate for prohibited parent→child inheritance;
- explicit closure-state taxonomy;
- maintenance playbook.

**Final acceptance**
- **resolved slots = total governed slots**;
- **unknown blanks = 0**;
- **hidden active observations = 0**;
- **prohibited parent→child inheritance = 0**;
- every non-numeric closure has an auditable reason;
- exact completion SHA passes full Atlas build, validation, P16 and Pages deployment.

---

## Recommended execution from this point

Run two evidence-independent streams while retaining the formal phase closure order:

- **County stream:** continue P21 one family per PR; prepare P22 only under its original freshness/geography rules.
- **Local stream:** start P23A by migrating the 290 audited IEBC constituency registered-voter observations into the native canonical registry; then advance to the next official national constituency pipeline.
- **Convergence:** full P23 acceptance remains mandatory before P24 can complete; P25 and P26 remain unchanged.

The next implementation instructions are:

> **Continue P21 without weakening evidence rules. In parallel, canonicalise the existing official-derived IEBC constituency registered-voter series as P23A tranche 1. Do not create a second denominator, inherit county values downward, or force unresolved ward geography.**
