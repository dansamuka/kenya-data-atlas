# Kenya Data Atlas — P36–P41 Post-P35 Closure Plan

Status: **active successor programme — P36 next**  
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

---

## P37 — Truthful status and Actions-queue observability

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

---

## P38 — Evidence-preserving branch and workflow inventory

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
