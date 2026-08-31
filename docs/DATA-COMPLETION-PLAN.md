# Kenya Data Atlas — P18–P26 Data Completion Plan

Status: **active governed completion programme**

Machine-readable authority: [`data/data-completion-roadmap.json`](../data/data-completion-roadmap.json)  
Live completion ledger: [`data/completeness/summary.json`](../data/completeness/summary.json)

## Why this programme exists

The original `P00–P17` roadmap governs the Atlas product build and v1.0 release process. The next programme is different: it is a **data-completion programme** whose purpose is to resolve every public data slot while preserving the Atlas rule that missing local values must never be invented, silently inherited from a broader geography, or filled from a weak source merely to improve a percentage.

For that reason, `P18–P26` is documented separately rather than being appended to `data/project-roadmap.json`. This preserves the exact P17/v1.0 release-count semantics while giving the continuing work the same session-sized, acceptance-gated structure used for P00–P17.

## Current baseline

As of 31 August 2026 the governed completeness surface is:

- **20,115 total slot instances**
- **2,868 resolved**
- **17,247 unresolved**
- **14.02% resolved**
- **49 unique indicator slots**
- **0 unknown/unclassified blanks**

Current unresolved queue:

| Phase | Queue |
|---|---:|
| P20 | 517 |
| P21 | 423 |
| P22 | 66 |
| P23 | 3,190 |
| P24 | 13,050 |
| P25 | 1 |

The machine-readable ledger is authoritative if these figures change after a new data tranche.

## Completion semantics

A slot is not considered complete just because a card has something displayed. The final programme distinguishes:

- direct published observations;
- transparently derived/modelled observations allowed by policy;
- verified external observations;
- governed non-numeric closure states such as **not applicable**, **source not published**, **boundary unresolved**, or **retired/replaced**.

The final P26 dashboard will report **slot resolution** separately from **numeric/categorical evidence coverage**. This allows the Atlas to reach 100% governed resolution without pretending that a value exists where no defensible value exists.

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

**Status: in progress.**

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

**Remaining queue:** **517**.

**Acceptance**
- P20 queue reaches zero;
- survey uncertainty/sample rules remain intact;
- no duplicate series are created;
- categorical audit outcomes are not forced into unsupported numeric rankings;
- every tranche passes deterministic build and release gates.

---

## P21 — Resolve hard county slots and retire weak placeholders

**Status: next.**

**Goal:** Close the county slots that require a harder source decision, derivation, or deliberate replacement/retirement.

**Target areas**
- social-protection beneficiaries;
- exam-performance source decision;
- business-licence replace/retire decision;
- facility electricity/water and hospital-capacity measures;
- road length;
- improved-water access;
- vehicle registrations.

**Queue:** **423**.

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

**Status: planned.**

**Goal:** Complete the constituency surface through reusable national pipelines, not 290 hand-maintained files.

**Target pipelines**
- IEBC voter and turnout history;
- MP identity;
- NG-CDF allocation;
- NG-CDF utilisation/implementation;
- authoritative census/household measures where published;
- permitted spatial service aggregation.

**Queue:** **3,190** remaining slot instances.

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

## Recommended execution sequence

`P18 complete → P19 complete → P20 in progress → P21 → P22 → P23 → P24 → P25 → P26`

The next implementation instruction is:

> **Continue P20 until its governed queue reaches zero, then start P21. Do not restart P18/P19 or weaken evidence rules to improve completion.**
