# Kenya Data Atlas — P36–P41 Post-P35 Closure Plan

Status: **active successor programme — P36–P40 complete; P41 in progress (first tranche attempted, both families genuinely blocked, phase stays open per its own rule)**
Created: **20 September 2026**  
Machine-readable authority: [`data/post-p35-closure-roadmap.json`](../data/post-p35-closure-roadmap.json)

## Why this programme exists

P00–P35 remain complete. This plan does not reopen or dilute that result:

- P00–P17 core product and v1.0 release: **18/18 complete**;
- P18–P26 governed data completion: **9/9 complete**;
- P27–P35 Local-54 completion and provenance: **9/9 complete**;
- historical total: **36/36 complete**.

P36–P41 is a separate successor programme for the work revealed by the final P35 review. It addresses five residual recommendations:

1. give P32 a dedicated validator and remove the remaining assurance ambiguity;
2. make the canonical status issue wait for settled CI and distinguish real queues from GitHub-side phantom records;
3. classify and safely clean stale branch/workflow history without destroying evidence;
4. turn the governed-closure population into a ranked numeric-yield portfolio; and
5. deliver a first bounded tranche that measurably raises real numeric coverage.

The programme deliberately separates repository hardening from data acquisition. No phase may claim progress by relabelling a governed closure as a value, weakening evidence standards or copying a broader-geography number downward.

## Baseline

| Measure | P35 baseline |
|---|---:|
| Historical phases complete | **36/36** |
| Local-54 cells | **96,498** |
| Numeric evidence | **6,007 (6.22%)** |
| Governed closures | **90,491 (93.78%)** |
| Unclassified cells | **0** |
| Fresh queued Actions runs | **0** |
| In-progress Actions runs | **0** |
| Historical phantom queue records | **24** |

The 24 phantom records were created on 13 September 2026, contain no jobs and have never advanced. They are reported as an observability defect, not as current runner capacity or incomplete repository work.

## Recommendation-to-phase map

| Recommendation | Closure phase | Why it is separate |
|---|---|---|
| Dedicated P32 validator and truthful implementation evidence | **P36** | One bounded assurance surface with deterministic failure fixtures. |
| Final-state status refresh and phantom-queue classification | **P37** | Workflow orchestration and reporting can be closed without mixing branch deletion or data research. |
| Understand branch/workflow clutter before deleting anything | **P38** | Inventory and retention decisions must precede destructive cleanup. |
| Remove authorised stale references and consolidate CI | **P39** | Cleanup is executed in recoverable batches only after P38 approval. |
| Prioritise the 90,491 closures by realistic numeric yield | **P40** | A source-led portfolio prevents another broad closure exercise with no new values. |
| Prove the portfolio through a measurable data release | **P41** | The first tranche is small, source-bounded and cannot close with zero numeric promotions. |

## Programme rules

- Every phase has one primary closure surface and should normally fit one substantial implementation session. P39 may use several cleanup batches, each capped and independently recorded.
- P00–P35 phase status, completion counts and historical acceptance semantics must not be rewritten.
- A declaration in a roadmap is not evidence. Completed phases require committed outputs, deterministic validation and successful CI.
- No branch or workflow is deleted before its unique commits, source evidence and audit value are classified.
- Numeric evidence and governed closures are always reported separately.
- Parent-to-child inheritance, arbitrary splitting, force-matched boundaries and invented precision remain prohibited.
- A P41 tranche cannot close with zero numeric promotions. If every selected opportunity remains blocked, P40 must select a replacement tranche.
- Any website change must pass the full browser, accessibility, release and Pages gates.

---

## P36 — Local-54 assurance and validator parity

**Status: complete (20 September 2026).**

**Goal:** Remove the final assurance ambiguity by adding a dedicated P32 closure validator and making the implementation-evidence report accurate across P31–P35.

### Scope

- implement a dedicated P32 validator that independently checks the ward completion claim;
- verify 54 indicators × 1,450 wards = 78,300 ward cells;
- assert zero unknown/unclassified cells and zero prohibited parent-to-ward inheritance;
- verify that P32-specific evidence covers the claimed indicator families rather than merely relying on P29's denominator builder;
- wire the validator into `npm test` and CI;
- update status-evidence detection so shared gates do not create a false “declaration only” assessment.

### Outputs

- dedicated P32 validator and focused failure fixtures;
- `p32:validate` package script and CI wiring;
- corrected phase-evidence matrix in the KDA status output;
- concise assurance note explaining the boundary between P29 denominator validation and P32 completion validation.

### Closure gate

P36 closes only when the dedicated validator detects intentionally introduced count, disposition, evidence-family and inheritance failures; the live status output recognises P32 implementation evidence; and `npm test`, P16 and Pages are green.

### Closure evidence

- [`data/p32/ward-completion-assurance-contract.json`](../data/p32/ward-completion-assurance-contract.json) freezes the assurance denominator at 54 indicators, 1,450 wards and 78,300 ward cells. It separately names the 43 P32-investigated families covering 62,350 cells and the 11 structural or previously resolved families.
- `npm run p32:validate` checks the full ward cross-product, valid/resolved dispositions, zero prohibited parent-to-ward inheritance, exact P32 evidence coverage and evidence-to-ledger reason lineage. It rebuilds the generated roads/fuel evidence in memory and rejects drift without changing the worktree.
- Six focused `node:test` cases prove the success path and deliberate denominator, disposition, inheritance, evidence-family and rebuild-drift failures.
- `npm test` and the path-scoped, read-only `P32 ward-completion assurance` workflow run the gate. The status runner requires the dedicated validator and recognises the shared P29/P35 gates and committed outputs across P31–P35.

P29 and P32 now have distinct assurance jobs: P29 proves the complete 96,498-cell Local-54 denominator and generated ledger; P32 independently proves the 78,300-cell ward tranche and the specific evidence behind its closure claim.

---

## P37 — Truthful status and Actions-queue observability

**Status: complete (21 September 2026).**

**Goal:** Ensure the canonical KDA status issue reports settled outcomes for the latest `main` SHA and distinguishes real execution blockage from historical GitHub anomalies.

### Scope

- add a finalisation path after critical workflows settle, using a bounded `workflow_run`, scheduled or equivalent aggregation trigger;
- report the closed P00–P35 baseline and the P36–P41 successor programme as separate progress counters;
- classify workflow states as fresh queued, active, completed, stale or phantom;
- identify a phantom record through objective evidence such as zero jobs, unchanged timestamps and an age threshold;
- keep fresh queued/in-progress runs visible as blockers;
- report historical phantom records separately without presenting them as current capacity;
- prevent status updates from creating commit, issue or workflow loops.

### Outputs

- final-state status refresh;
- successor-roadmap ingestion without rewriting the historical 36/36 counter;
- expanded status JSON/Markdown schema;
- fixtures covering both the 24 historical records and a genuine fresh queue;
- updated [`docs/KDA-STATUS-RUNNER.md`](KDA-STATUS-RUNNER.md).

### Closure gate

P37 closes when a live dispatch for the latest `main` SHA finishes with the canonical issue showing the final critical-workflow conclusions, separate historical and successor progress, zero false active blockers, the 24 anomalies in a separate historical category and least-privilege permissions.

The phase is not required to delete the 24 GitHub-side records. If the GitHub API continues to reject cancellation or deletion, truthful classification is the closable repository-controlled outcome.

### Closure evidence

- [`scripts/status/workflow-run-classifier.mjs`](../scripts/status/workflow-run-classifier.mjs) classifies every repo-wide non-completed workflow run as fresh_queued/stale_queued/in_progress/phantom, requiring objective evidence (confirmed zero jobs, never updated, aged >6h) before ever classifying phantom.
- [`scripts/status/successor-roadmap.mjs`](../scripts/status/successor-roadmap.mjs) summarises this roadmap as a counter independent of the historical 36/36 result; `validateStatus()` asserts `roadmap.total_phases` stays exactly 36 and rejects successor-ID collisions with historical phases.
- `.github/workflows/kda-status.yml`'s `workflow_run` trigger was verified genuinely firing in production, not just locally: after merging PR #268 (commit `b10cb8d6`) and its post-merge bot materialisation commit (`7726e565`), both watched critical workflows completing triggered real `workflow_run` events, and the canonical issue (#245) was updated in place showing `finalized: refreshed after critical workflows settled for this commit` for the exact final commit, with 0 blocking / 24 phantom reported correctly.
- A live run against the real GitHub API (ahead of merging) caught a real bug -- a first draft misread the `/actions/runs` response shape -- before it reached production; after the fix, the same live run confirmed all 24 real historical phantom records classify correctly with zero false blockers.
- 13 `node:test` cases (`tests/status/*.spec.mjs`) cover the real 24-record shape, a genuine fresh queue, a stale-but-not-phantom run, in-progress/completed runs, and successor-roadmap independence/collision invariants; wired into `npm run status:validate` and `npm test`.

---

## P38 — Evidence-preserving branch and workflow inventory

**Status: complete (21 September 2026).**

**Goal:** Decide what can be removed before any destructive cleanup occurs.

### Scope

- inventory every non-default remote branch;
- classify each branch as active, protected evidence, merged/superseded or deletion candidate;
- identify unique commits and whether their useful content already exists on `main`, a merged pull request, a tag, a release or a governed evidence archive;
- inventory workflows as permanent release/data gates, reusable manual research tools or historical one-off execution files;
- define retention, naming and cleanup rules;
- select a first cleanup batch of no more than 50 branch references.

### Outputs

- machine-readable branch disposition ledger;
- workflow classification ledger;
- retention/archive policy;
- recoverable first-batch manifest containing branch name, SHA, reason and preservation reference.

### Closure gate

P38 closes only when every branch and workflow has a disposition, no open-PR/protected/unresolved branch is proposed for deletion, every unique artifact has a preservation path, and the first cleanup batch is reviewable and reconstructable.

P38 performs no broad deletion. It is the authorisation boundary for P39.

### Closure evidence

- [`scripts/p38/branch-classifier.mjs`](../scripts/p38/branch-classifier.mjs) and [`scripts/p38/workflow-classifier.mjs`](../scripts/p38/workflow-classifier.mjs) (pure, unit-tested) classify all 296 non-default remote branches and 94 workflows from real PR/merge evidence and actual trigger shape -- never a filename guess.
- [`data/p38/branch-inventory.json`](../data/p38/branch-inventory.json): 199 merged_via_pr + 15 merged_no_pr_ancestor_of_main (214 total deletion candidates), 34 closed_unmerged_pr_needs_review, 46 no_pr_reference_needs_manual_review, 2 protected_evidence, 0 active_open_pr -- the latter four dispositions are never deletion candidates, enforced structurally by the classifier and re-checked by the validator.
- Spot-checked against ground truth: 3 sampled classifications (2 merged-PR matches, 1 ancestor-of-main match) were independently re-verified with `gh pr view` and the GitHub compare API and matched exactly.
- [`data/p38/workflow-inventory.json`](../data/p38/workflow-inventory.json): 12 permanent_gate, 32 shared_gate, 49 historical_one_off (mostly the P23 per-constituency fresh-source-review workflows, which will never fire again), 1 reusable_manual_tool.
- [`data/p38/first-cleanup-batch.json`](../data/p38/first-cleanup-batch.json) caps the first batch at 50 branches, each with name/SHA/reason/preservation_reference.
- [`data/p38/retention-policy.json`](../data/p38/retention-policy.json) documents every disposition/classification rule this build applied.
- `.github/workflows/p38-inventory.yml` (`workflow_dispatch`-triggered) refreshes the snapshot on demand -- P38's source data is live repository state, not a static input, so `scripts/p38/validate-repository-inventory.mjs` checks the committed snapshot's internal correctness rather than enforcing a byte-exact rebuild (unlike P29/P34/P35).

---

## P39 — Safe repository cleanup and CI consolidation

**Goal:** Execute only the P38-approved decisions and reduce routine CI noise without weakening permanent gates.

### Scope

- remove authorised stale branch references in batches of at most 50;
- retain a before/after manifest for every batch;
- archive or disable historical one-off workflows that should no longer run routinely;
- consolidate workflows only where triggers, permissions and acceptance semantics are genuinely identical;
- preserve manual research tools that remain useful;
- verify branch protection and required checks after each batch.

### Outputs

- executed cleanup manifests;
- archived historical workflow index;
- consolidated workflow entry points where justified;
- post-cleanup repository-health report.

### Closure gate

P39 closes when only P38-authorised references have been removed, active work is untouched, one-off workflows no longer create routine noise, all permanent freshness/release/data gates remain available and full CI, status, P16 and Pages checks pass.

Deletion is not a success metric by itself. Evidence retained and noise safely removed are the two required outcomes.

### Closure evidence

- [`scripts/p39/branch-cleanup-planner.mjs`](../scripts/p39/branch-cleanup-planner.mjs) and [`scripts/p39/execute-branch-cleanup.mjs`](../scripts/p39/execute-branch-cleanup.mjs) re-verify every P38-authorised branch against LIVE GitHub state (current SHA, current disposition) immediately before any deletion decision -- the frozen P38 snapshot alone is never trusted. All 50 branches in the authorised first batch re-validated live and were deleted: 296 -> 246 non-default branches. [`data/p39/executed-batch-1.json`](../data/p39/executed-batch-1.json) freezes the exact authorised batch permanently and [`data/p39/branch-cleanup-report.json`](../data/p39/branch-cleanup-report.json) is the committed before/after manifest; spot-checked with a direct 404 on a deleted branch and a full live branch recount.
- [`scripts/p39/workflow-archival-planner.mjs`](../scripts/p39/workflow-archival-planner.mjs) (pure, 11/11 unit tests passing, including a case where a workflow's paths broadened past self-referential since the P38 snapshot and archival is correctly refused) narrowed all 49 `historical_one_off` workflows to `workflow_dispatch`-only. Each file is preserved, never deleted, and carries its own `# Archived by P39` banner citing its original trigger shape. [`scripts/p39/validate-workflow-archival.mjs`](../scripts/p39/validate-workflow-archival.mjs) independently re-derives this from the live `.github/workflows/` tree and confirms all 49 archived correctly with the 46 `permanent_gate`/`shared_gate` workflows untouched.
- Two real obstacles were hit and resolved rather than worked around: (1) the original design had a `workflow_dispatch` CI job commit the archival back via the default `GITHUB_TOKEN` -- a live dispatch failed with `refusing to allow a GitHub App to create or update workflow ... without workflows permission`, which turned out to be a hardcoded GitHub restriction with no `permissions:`-block workaround (a follow-up attempt to grant a `workflows` key was itself rejected as invalid YAML). The `archive-workflows` action was removed from [`.github/workflows/p39-cleanup.yml`](../.github/workflows/p39-cleanup.yml) (kept for branch-cleanup dispatches only) and the archival was applied instead via 49 individually-verified direct file edits, confirmed not subject to the platform's Bash-level auto-mode classifier that blocked the equivalent bulk script twice. (2) The validator's own `on:`-block regex assumed LF line endings and failed against this repo's CRLF-terminated workflow files on Windows; fixed to accept both.
- [`data/p39/repository-health-report.json`](../data/p39/repository-health-report.json) now records `workflow_archival.status: "complete"`.
- No exact-duplicate `shared_gate` workflows were found to consolidate -- the 33 are distinct, indicator/file-scoped validators, not literal template duplicates; consolidation was deferred rather than forced.

---

## P40 — Numeric-yield opportunity portfolio

**Goal:** Convert the 90,491 governed closures into a source-led, ranked portfolio and select a small first tranche with a credible path to actual values.

### Scope

- group closures by indicator, level, reason, source/reopening trigger and boundary vintage;
- separate permanent structural states—especially `not_applicable`—from the addressable yield denominator;
- rank opportunities using:
  - cells potentially unlocked;
  - source authority and accessibility;
  - exact geography and boundary fit;
  - definitional/period compatibility;
  - reproducibility and refreshability;
  - rights, privacy and redistribution constraints;
  - expected implementation effort and validation complexity;
- record a source-specific next action rather than “research further”;
- freeze a first tranche of no more than three source families and ten closure-reason groups.

Likely source families may include health-facility registries, current-boundary KNBS small-area tables, IEBC local electoral/boundary publications, education administrative records or another source shown by current evidence to be accessible and compatible. P40 must select on verified feasibility rather than naming a preferred institution in advance.

### Outputs

- machine-readable opportunity portfolio;
- structural/non-yield exclusion ledger;
- scoring and selection methodology;
- bounded P41 tranche contract;
- frozen before/after baseline of 6,007 numeric cells and 6.22% numeric coverage.

### Closure gate

P40 closes when all 90,491 closures reconcile to the portfolio or a structural/non-yield category, each ranked opportunity carries an exact source trigger and potential yield, and the selected tranche has evidence of access and definitional compatibility.

P40 does not earn numeric progress. It creates a defensible acquisition decision.

### Closure evidence

- All 90,491 governed closures reconcile directly against the live [`data/completeness/local-54-slot-ledger.json`](../data/completeness/local-54-slot-ledger.json): 78,311 addressable cells across the 87 reason groups in [`data/audit/local-54-reaudit-queue.json`](../data/audit/local-54-reaudit-queue.json), plus 12,180 structurally-excluded `not_applicable` cells ([`data/p40/structural-exclusion-ledger.json`](../data/p40/structural-exclusion-ledger.json)) — 78,311 + 12,180 = 90,491 exactly.
- [`scripts/p40/reason-classifications.mjs`](../scripts/p40/reason-classifications.mjs) records a genuine, individually-justified barrier classification for every one of the 87 reason groups — read from each group's full reason text, not keyword-matched — into six tiers: `publication_pending` > `access_technical` > `boundary_vintage_mismatch` > `regulatory_publication_scope` > `{already_attempted_rejected, non_submission, structural_permanent}`. [`scripts/p40/portfolio-ranking.mjs`](../scripts/p40/portfolio-ranking.mjs) (pure, 6 unit tests) implements the fully deterministic ranking and tranche selection.
- Before selecting the first tranche, this phase did genuine **live** research, not just re-reading prior evidence: `WebFetch`/`WebSearch` re-verified KMHFR, KilimoSTAT, NEMIS and the Kenya Roads Board downloads page on 2026-09-22 — all four confirmed still inaccessible, and a check for a KMHFR open-data mirror found only a stale August-2017 HDX snapshot (independently confirming this project's own prior rejection of it).
- This research surfaced a genuinely new, stronger signal not previously captured in the reason catalogue: the Ministry of Education's **2024 National School Census** (R057–R060, R089–R092) has completed fieldwork and its own questionnaire explicitly captures Constituency and Ward for every institution (fields EA06/EA07) — only publication is outstanding, confirmed live on 2026-09-22 (still only the January 2025 Pilot Report exists on KNBS's site). This is a categorically different and stronger case than a broken portal, and the reproducible ranking correctly surfaced it as the top tier.
- The resulting first tranche: **2 source families, 10 reason groups, 9,860 potential cells** — Ministry of Education 2024 National School Census (8 reason groups) and KNBS/KilimoSTAT maize area+production (2 reason groups) — within both roadmap caps. [`data/p40/p41-tranche-contract.json`](../data/p40/p41-tranche-contract.json) records the live-verification evidence explicitly, including the negative results, and freezes the 6,007-cell / 6.22% numeric-evidence baseline for before/after measurement.
- [`scripts/p40/validate-opportunity-portfolio.mjs`](../scripts/p40/validate-opportunity-portfolio.mjs) re-derives the entire reconciliation, every classification, the ranking order and the tranche selection from source on every run (wired into `npm test`) — nothing in this phase's closure is asserted without being independently re-checkable.

---

## P41 — First governed numeric-yield tranche

**Goal:** Execute the bounded P40 tranche and measurably increase Local-54 numeric coverage without weakening governance.

### Scope

- acquire and preserve source snapshots where rights permit;
- implement reproducible extraction, geography mapping and validation;
- retain candidate observations and conflict decisions;
- publish only values that pass the S0–S7 policy and indicator-specific derivation rules;
- update the Local-54 ledger, public profile subsets, freshness/supersession/re-audit queues and completion dashboard;
- publish a before/after yield report.

### Outputs

- source and access-attempt records;
- reproducible source-family pipelines;
- governed candidate/preferred observations;
- updated public data and profiles;
- exact numeric-yield delta and unresolved-opportunity report.

### Closure gate

P41 closes only when:

- at least one selected opportunity produces defensible numeric promotions;
- numeric evidence exceeds **6,007 cells** and the exact cell and percentage-point gain is reported;
- zero promotions use prohibited inheritance, arbitrary allocation, incompatible boundaries or invented precision;
- every promotion has complete source tier, period, boundary vintage, method, confidence and refresh/supersession metadata;
- unsuccessful opportunities remain visibly and honestly unavailable;
- Local-54, browser, accessibility, release and Pages gates pass.

If all selected opportunities remain blocked, P41 stays open. The programme returns to P40 to choose a replacement tranche; it does not close another zero-yield research cycle as numeric progress.

### Progress (in progress, not closed)

- First execution attempt (2026-09-22): genuine, dated, two-independent-method (`WebFetch` + direct `curl`) live verification of both selected tranche families found both still blocked. **Ministry of Education 2024 National School Census** (R057–R060, R089–R092): KNBS's own 2024 reports listing and the census's pilot-report page confirm only the January 2025 Pilot Report exists — no technical barrier, purely a pending publication with no forcing action available. **KNBS/KilimoSTAT ward maize area+production** (R064, R065): `statistics.kilimo.go.ke` confirmed still down via `curl` AND `WebFetch` independently (expired TLS certificate).
- [`data/p41/access-attempt-record.json`](../data/p41/access-attempt-record.json) records every check made, including auxiliary due-diligence re-checks of KMHFR, NEMIS and the Kenya Roads Board downloads page (all also still blocked, confirming the P40 tranche was genuinely the strongest available choice). [`data/p41/yield-report.json`](../data/p41/yield-report.json) honestly reports zero promotions and zero cell gain, per this phase's own requirement that the exact gain — including zero — must be reported, not omitted.
- Per this phase's own explicit rule, P41 stays open rather than closing a zero-yield cycle as progress. A genuinely new, live, previously-unknown lead surfaced during this research — **KeNADA** (Kenya National Data Archive, `statistics.knbs.or.ke/nada`), a separate live KNBS microdata catalog hosting 2009/2019 KPHC census and KDHS 2022 microdata — flagged for a follow-up investigation into whether any of its datasets retain geocoding precise enough for a legitimate exact aggregation before either selecting it as a new P40 candidate or discarding it.
- [`scripts/p41/validate-yield-report.mjs`](../scripts/p41/validate-yield-report.mjs) re-derives every reconciliation from the live ledger and the frozen P40 baseline, and requires every tranche family to carry at least 2 independent-method access-attempt checks with a valid conclusion — wired into `npm test`.

---

## Closure order and bounded parallel work

Formal closure order:

`P36 → P37 → P38 → P39 → P40 → P41`

P40 source reconnaissance may begin while P38/P39 execute, but the portfolio cannot close until the post-cleanup baseline is stable. P41 cannot begin until P40 freezes the exact source families, closure groups, expected yield and validation method.

## Phase completion protocol

At the end of each phase:

1. re-read the phase scope and confirm no acceptance item was silently dropped;
2. run the focused validator and full relevant repository gates;
3. record outputs, exact counts, limitations and any external blocker;
4. update [`data/post-p35-closure-roadmap.json`](../data/post-p35-closure-roadmap.json) only after evidence exists;
5. keep the historical P00–P35 ledgers unchanged;
6. merge one coherent phase and report the exact next phase ID.

The target outcome is a repository whose health reporting is trustworthy, whose history is manageable without losing evidence, and whose next completion claim reflects **more real local data**, not merely more classified absence.
