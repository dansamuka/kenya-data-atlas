# Kenya Data Atlas — Completion Roadmap

The machine-readable completion authority is [`data/project-roadmap.json`](data/project-roadmap.json). This document is the concise public handoff.

## Completed implementation phases

**P00–P16 are complete**, including P14 as a separately governed **v1.1 Beta** action layer.

The completed implementation surface covers the canonical Kenya → County → Constituency → Ward geography hierarchy, provenance/catalogue governance, source-backed county and national data, CountyIQ analytics, peer/gap/index research outputs, fiscal delivery and administration scorecards, the County Evidence & Knowledge Hub, the Action & Opportunity Finder Beta, public developer distributions, and the P16 real-browser/accessibility/SEO/performance release audit.

Current release-candidate scale includes 1,788 geographies, 98 indicators, 3,370 series, 6,864 observations, 47 CountyIQ profiles/results, 247 county evidence records and 9 verified P14 Beta programme records.

<!-- P17_STATUS_START -->
## P17 — final reproducibility, governance and v1.0 release

**P17 is the release candidate gate.** No substantial product feature remains on the v1.0 path. The candidate must pass the deterministic data rebuild, zero generated-output drift, full validators, independent Shapely geometry audit, Chromium/Firefox/WebKit + axe checks, Lighthouse budgets and GitHub Pages deployment for the exact candidate SHA.

Only after those candidate gates pass does the P17 publisher write the v1.0 completion ledger and application version. That exact final release commit must then pass the same data/browser/deployment gates again and a live post-deployment smoke test before the immutable `v1.0.0` tag and GitHub release are created.
<!-- P17_STATUS_END -->

## Known limits carried honestly into v1.0

P17 does not manufacture completeness. The release register retains known evidence constraints, including Narok's withheld fiscal-delivery score, the Mandera East/Lafey ward spatial hold, the withheld longitudinal composite, continuing P14 programme-freshness obligations and normal volatility of external official-source links.

See [`docs/releases/v1.0.0-unresolved.md`](docs/releases/v1.0.0-unresolved.md).

## Release sequence

`P00–P16 complete → P17 exact-commit release gate → v1.0.0`

P14 remains usable as a v1.1 Beta surface and continues under its own monthly freshness policy after the v1.0 statistical/data release.

## P18–P26 — governed data-completion programme

The Atlas now also has a separate, machine-readable **data-completion roadmap** for resolving every governed public data slot without changing the historical P00–P17 v1.0 release ledger:

- [`data/data-completion-roadmap.json`](data/data-completion-roadmap.json) — machine-readable P18–P26 phase authority.
- [`docs/DATA-COMPLETION-PLAN.md`](docs/DATA-COMPLETION-PLAN.md) — detailed public/session handoff.
- [`data/completeness/summary.json`](data/completeness/summary.json) — live completion counts.

Current state: **P18 complete → P19 complete → P20 in progress → P21 next → P22–P26 planned**.

At the 31 August 2026 baseline, the governed surface contains **20,115 slot instances**, of which **2,774 are resolved (13.79%)**, with **0 unknown/unclassified blanks**. The machine-readable summary is authoritative as later tranches change these counts.

This programme preserves the core Atlas rule: **100% completion means 100% governed resolution, not 100% fabricated numbers**. Where no defensible value exists, the eventual closure state must be explicit and auditable (for example not applicable, source not published, boundary unresolved, or retired/replaced).

### Data-completion sequence

`P18 ledger → P19 existing-data surfacing → P20 straightforward county ingestion → P21 hard county closure → P22 ASAL → P23 constituency → P24 ward → P25 remaining public surfaces → P26 permanent 100% gate`
