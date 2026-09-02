# Kenya Data Atlas — Completion Roadmap

Two machine-readable authorities now work together without changing the historical release ledger:

- [`data/project-roadmap.json`](data/project-roadmap.json) remains the P00–P17 implementation/release authority.
- [`data/data-completion-roadmap.json`](data/data-completion-roadmap.json) remains the P18–P26 phase, scope and acceptance authority.
- [`data/data-completion-execution.json`](data/data-completion-execution.json) governs execution scheduling only; it may parallelise work but cannot change phase semantics or final acceptance gates.
- [`docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md`](docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md) is the mandatory local-intelligence convergence contract.

## Completed implementation phases

**P00–P16 are complete**, including P14 as a separately governed **v1.1 Beta** action layer.

The completed implementation surface covers the canonical Kenya → County → Constituency → Ward geography hierarchy, provenance/catalogue governance, source-backed county and national data, CountyIQ analytics, peer/gap/index research outputs, fiscal delivery and administration scorecards, the County Evidence & Knowledge Hub, the Action & Opportunity Finder Beta, public developer distributions, and the P16 real-browser/accessibility/SEO/performance release audit.

Current release-candidate scale includes 1,788 geographies, 98 indicators, 3,370 series, 6,864 observations, 47 CountyIQ profiles/results, 247 county evidence records and 9 verified P14 Beta programme records.

<!-- P17_STATUS_START -->
## v1.0 completion

**P00–P17 are complete.** Kenya Data Atlas v1.0.0 is the closed reproducible statistical/data release. P14 is also implemented as a separately governed v1.1 Beta action layer; its continuing programme-freshness review is maintenance, not an unresolved v1.0 release gate.

Release acceptance: deterministic rebuild and zero drift, full validators, independent geometry audit, Chromium/Firefox/WebKit + axe, Lighthouse budgets, link/crawlability checks, exact-commit GitHub Pages deployment and post-deployment smoke test all pass.
<!-- P17_STATUS_END -->

## Known limits carried honestly into v1.0

P17 does not manufacture completeness. The release register retains known evidence constraints, including Narok's withheld fiscal-delivery score, the Mandera East/Lafey ward spatial hold, the withheld longitudinal composite, continuing P14 programme-freshness obligations and normal volatility of external official-source links.

See [`docs/releases/v1.0.0-unresolved.md`](docs/releases/v1.0.0-unresolved.md).

## Release sequence

`P00–P16 complete → P17 exact-commit release gate → v1.0.0`

P14 remains usable as a v1.1 Beta surface and continues under its own monthly freshness policy after the v1.0 statistical/data release.

## P18–P26 — governed data-completion programme

The Atlas has a separate governed completion programme for resolving every public data slot without changing the historical P00–P17 v1.0 release ledger:

- [`data/data-completion-roadmap.json`](data/data-completion-roadmap.json) — machine-readable P18–P26 phase authority.
- [`data/data-completion-execution.json`](data/data-completion-execution.json) — machine-readable parallel execution overlay.
- [`docs/DATA-COMPLETION-PLAN.md`](docs/DATA-COMPLETION-PLAN.md) — detailed public/session handoff.
- [`data/completeness/summary.json`](data/completeness/summary.json) — live governed-slot completion counts.
- [`data/completeness/local-indicator-cascade-summary.json`](data/completeness/local-indicator-cascade-summary.json) — live county→constituency→ward convergence audit.

The historical 31 August 2026 programme baseline remains **20,115 slot instances, 3,385 resolved (16.83%), 16,730 unresolved and 0 unknown/unclassified blanks**. It is intentionally retained as the baseline snapshot, **not a ceiling on local-data scope**. The live governed denominator may expand when the cascade audit identifies an active county indicator that can or must be explicitly represented at constituency or ward level.

This programme preserves the core Atlas rule: **100% completion means 100% governed resolution, not 100% fabricated numbers**. Where no defensible child value exists, the closure state must be explicit and auditable.

## Parallel execution model

The formal P18–P26 phase meanings and final closure order do **not** change. What changes is scheduling and scope convergence: independent work may proceed in parallel where its source and geography contract is already defensible, and every active county indicator must now receive explicit constituency and ward treatment.

### Track A — County completion

`P21 hard county closure → P22 ASAL resilience`

P21 and P22 are complete under their original acceptance rules. Their source, freshness and anti-inheritance contracts remain active for future refreshes.

### Track B — Constituency completion + convergence

`P23A constituency pipelines → original P23 constituency queue → P23X county-indicator convergence`

**P23A remains an accelerator inside P23, not a separate governed phase.** The first P23A tranche is `IND-REGISTERED-VOTERS`, sourced from IEBC Gazette Notice No. 7290 and materialised as **B — Official derived** through exact sums of official child-ward rows. The current P23 programme also includes direct current MP identity, official-formula NG-CDF allocation, and governed evidence closures where current-boundary local denominators or comparable official series are not defensibly available.

**P23X is now a mandatory convergence gate inside P23.** P23 cannot be declared complete merely because the original placeholder queue reaches zero. Before P23 closes:

- 100% of active county indicators must have an explicit constituency disposition;
- every defensibly obtainable constituency value must be materialised;
- unavailable/not-applicable cases must be explicitly governed;
- additive measures must reconcile where meaningful;
- prohibited county→constituency inheritance must equal zero.

Allowed dispositions and evidence rules are defined in [`docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md`](docs/LOCAL-INDICATOR-CASCADE-CONTRACT.md). The historical 20,115-slot denominator may therefore expand where the convergence audit identifies additional defensible local indicator surfaces.

### Track C — Ward completion + convergence

`P24 original ward queue → P24X county-indicator convergence`

P24 retains its original ward-completion responsibilities and boundary-vintage safeguards. **P24X is now mandatory inside P24.** P24 cannot close until:

- 100% of active county indicators have an explicit ward disposition;
- every defensibly obtainable ward value is materialised;
- unavailable/not-applicable cases are explicitly governed;
- additive measures reconcile Ward → Constituency → County where meaningful;
- prohibited constituency/county→ward inheritance equals zero.

No ward value may be force-matched through a boundary ambiguity, and no constituency/county value may be inherited downward. The existing Mandera East/Lafey hold remains transparent until genuinely reconciled.

### Track D — Final convergence

`P25 remaining public surfaces → P26 permanent completion gate`

P26 now requires both ordinary governed-slot completeness **and local indicator convergence**. Final acceptance requires:

- resolved slots equal the then-current governed denominator;
- unknown blanks = 0;
- hidden active observations = 0;
- prohibited parent→child inheritance = 0;
- constituency disposition coverage of active county indicators = 100%;
- ward disposition coverage of active county indicators = 100%;
- all defensibly obtainable child-level observations identified by the cascade contract are materialised, with explicit governed unavailable/not-applicable states where they are not feasible.

### Formal closure order

`P18 → P19 → P20 → P21 → P22 → P23/P23X → P24/P24X → P25 → P26`

Parallel execution may bring forward defensible local work; it does **not** allow a later phase to claim completion before its acceptance requirements are satisfied.

The governing product objective is now explicit: **everything the Atlas knows at county level must be deliberately evaluated for constituency and ward representation, and every responsibly obtainable local value must be published.**
