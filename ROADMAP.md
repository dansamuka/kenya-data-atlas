# Kenya Data Atlas — Completion Roadmap

Two machine-readable authorities now work together without changing the historical release ledger:

- [`data/project-roadmap.json`](data/project-roadmap.json) remains the P00–P17 implementation/release authority.
- [`data/data-completion-roadmap.json`](data/data-completion-roadmap.json) remains the P18–P26 phase, scope and acceptance authority.
- [`data/data-completion-execution.json`](data/data-completion-execution.json) governs execution scheduling only; it may parallelise work but cannot change phase semantics or final acceptance gates.
- [`docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md`](docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md) is the mandatory local-intelligence convergence contract.

## Completed implementation phases

<!-- P17_STATUS_START -->
**P00–P17 are complete.** Kenya Data Atlas v1.0.0 remains the closed reproducible statistical/data release. P14 remains a separately governed v1.1 Beta action layer.
<!-- P17_STATUS_END -->

The P18–P26 programme continues independently and does not rewrite the historical P00–P17 release ledger.

## P18–P26 — governed data-completion programme

The historical 31 August 2026 baseline remains **20,115 slot instances, 3,385 resolved (16.83%), 16,730 unresolved and 0 unknown/unclassified blanks**. It remains a historical baseline, **not a ceiling on local-data scope**. The live denominator may expand when the cascade audit identifies an active county indicator that can or must be explicitly represented at constituency or ward level.

100% completion means 100% governed resolution, not 100% fabricated numbers. Where no defensible child value exists, the closure state must be explicit and auditable.

### Local-intelligence value rule

**Every active indicator represented at county level must receive an explicit constituency AND ward disposition.** Completing only the original P23/P24 placeholder slots is no longer sufficient for programme completion.

For every county indicator the Atlas must attempt, in order: direct official local data; exact official child aggregation; reproducible spatial derivation; matched local numerator/denominator calculation; explicitly approved modelled estimate; governed unavailable/not-applicable closure.

Parent values may never be copied downward merely to fill a child slot. The detailed rules and metrics are defined in `docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md`.

## Execution tracks

### Track A — County completion

`P21 hard county closure → P22 ASAL resilience` — complete.

### Track B — Constituency completion + convergence

`P23A pipelines → original P23 queue closure → P23X county-indicator cascade convergence`

P23X is a mandatory convergence gate inside P23. It does not change the formal phase numbering, but it may expand P23 scope and the governed denominator. P23 cannot be declared complete until:

- 100% of active county indicators have a constituency disposition;
- every defensibly obtainable constituency value is materialised;
- unavailable/not-applicable cases are explicitly governed;
- additive measures reconcile where meaningful;
- prohibited county→constituency inheritance equals zero.

### Track C — Ward completion + convergence

`P24 original ward queue → P24X county-indicator cascade convergence`

P24X is a mandatory convergence gate inside P24 and may expand the governed ward surface. P24 cannot be declared complete until:

- 100% of active county indicators have a ward disposition;
- every defensibly obtainable ward value is materialised;
- unavailable/not-applicable cases are explicitly governed;
- additive measures reconcile Ward → Constituency → County where meaningful;
- boundary-vintage mismatches remain explicit;
- prohibited constituency/county→ward inheritance equals zero.

The existing Mandera East/Lafey spatial hold remains transparent until genuinely reconciled.

### Track D — Final convergence

`P25 remaining public surfaces → P26 permanent completion gate`

P26 now requires both ordinary governed slot completeness **and local indicator convergence**. Required final conditions include:

- resolved slots equal the then-current governed denominator;
- unknown blanks = 0;
- hidden active observations = 0;
- prohibited parent→child inheritance = 0;
- constituency disposition coverage of active county indicators = 100%;
- ward disposition coverage of active county indicators = 100%;
- all defensibly obtainable child-level observations identified by the cascade contract are materialised or have an explicit blocker/evidence state.

## Formal closure order

`P18 → P19 → P20 → P21 → P22 → P23/P23X → P24/P24X → P25 → P26`

The governing product objective is now explicit: **everything the Atlas knows at county level must be deliberately evaluated for constituency and ward representation, and every responsibly obtainable local value must be published.**
