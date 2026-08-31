# Kenya Data Atlas — Completion Roadmap

Two machine-readable authorities now work together without changing the historical release ledger:

- [`data/project-roadmap.json`](data/project-roadmap.json) remains the P00–P17 implementation/release authority.
- [`data/data-completion-roadmap.json`](data/data-completion-roadmap.json) remains the P18–P26 phase, scope and acceptance authority.
- [`data/data-completion-execution.json`](data/data-completion-execution.json) governs execution scheduling only; it may parallelise work but cannot change phase semantics, the governed denominator or final acceptance gates.

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
- [`data/completeness/summary.json`](data/completeness/summary.json) — live completion counts.
- [`data/completeness/p21-work-queue.json`](data/completeness/p21-work-queue.json) — executable hard-county queue.

The historical 31 August 2026 programme baseline remains **20,115 slot instances, 3,385 resolved (16.83%), 16,730 unresolved and 0 unknown/unclassified blanks**. It is intentionally retained as the baseline snapshot. The live completeness ledger is authoritative after later promotions; following P21 tranches 1–2 it reports **3,479 resolved, 16,636 unresolved and 0 unknown blanks**, with **329 P21 slots** remaining.

This programme preserves the core Atlas rule: **100% completion means 100% governed resolution, not 100% fabricated numbers**. Where no defensible value exists, the closure state must be explicit and auditable: for example not applicable, source not published, boundary unresolved, or retired/replaced.

## Parallel execution model

The formal P18–P26 phase meanings and final closure order do **not** change. What changes is scheduling: independent work may now proceed in parallel where its source and geography contract is already defensible.

### Track A — County completion

`P21 hard county closure → P22 ASAL resilience`

P21 continues one hard county family per PR. P22 retains its original date-aware drought/food-security/climate acceptance rules.

### Track B — Local intelligence accelerator

`P23A constituency pilot → full P23 constituency completion`

**P23A is an accelerator inside P23, not a new governed phase or denominator.** It resolves only slot instances already assigned to P23. Full P23 remains the gate requiring all 290 constituencies to reconcile, explicit election/boundary vintages, deterministic national pipelines and zero county→constituency inheritance.

The first P23A tranche is `IND-REGISTERED-VOTERS`. The statistical authority is IEBC Gazette Notice No. 7290. To preserve the already-audited Sprint 2 contract, the canonical constituency values remain **B — Official derived**: exact sums of all official IEBC First Schedule child-ward rows for each constituency, including the ten source rows that are withheld only from uncertain Mandera East/Lafey ward geometry. The Gazette also contains the Second Schedule per constituency, but P23A does not silently relabel the established derived series as direct without a separate direct-schedule ingestion and validation.

Planned subsequent P23A pipelines, each independently gated, are official turnout history where comparable, current MP identity, NG-CDF allocation, and NG-CDF utilisation/implementation only where a nationally comparable official source exists.

### Track C — Final convergence

`P24 ward completion → P25 remaining public surfaces → P26 permanent 100% gate`

No ward value may be force-matched through a boundary ambiguity, and no constituency/county value may be inherited downward. The existing Mandera East/Lafey hold remains transparent until genuinely reconciled. P26 still requires resolved slots to equal total governed slots, unknown blanks to equal zero, hidden active observations to equal zero and prohibited parent→child inheritance to equal zero.

### Formal closure order

`P18 → P19 → P20 → P21 → P22 → P23 → P24 → P25 → P26`

Parallel execution can bring forward defensible P23 work; it does **not** allow a later phase to claim completion before its original acceptance requirements are satisfied.
