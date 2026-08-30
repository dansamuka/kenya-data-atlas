# Kenya Data Atlas — Completion Roadmap

The repository is being completed through bounded, independently deployable phases. The machine-readable authority is [`data/project-roadmap.json`](data/project-roadmap.json).

## Completed core phases

**P00–P13, P15 and P16 are complete.** The core geography, provenance, indicator registry, historical data, CountyIQ analytics, rankings/results, canonical policy, county evidence and developer distribution surface are implemented and validated. P16 also closes the public-launch browser, accessibility, SEO, performance and link-integrity audit: Chromium, Firefox and WebKit smoke/axe gates pass, core Lighthouse budgets pass, and reproducible crawlability/link-health evidence is retained.

Key current products include 1,788 geographies, 98 indicators, 3,370 series, 6,864 observations, 47 CountyIQ profiles, 14 complete county indicator leaderboards, 47 development snapshots, 46 complete fiscal-delivery scores and 247 county evidence records.

## Deferred post-v1.0 Beta

**P14 — Action & Opportunity Finder Beta** is explicitly **deferred to v1.1 Beta**. Programme freshness, deadlines and eligibility require continuing maintenance; this useful action layer is not necessary to make the underlying Atlas source-auditable, reproducible and release-ready.

## Next and final v1.0 phase

**P17 — Final reproducibility, governance and v1.0 release**

Run the final deterministic rebuild, reconcile data and revision status, complete release notes/manifests and the unresolved-items register, verify that GitHub Pages serves the exact release commit, and perform the post-deployment smoke test before publishing v1.0.

Recommended next-session instruction:

> Complete P17 from `data/project-roadmap.json`. Do not restart completed phases. Run the final deterministic rebuild, governance/revision review, release manifest and exact-commit deployment checks; do not publish v1.0 while any required gate is red.

## Release sequence

Core v1.0 track: **P15 → P16 → P17 → v1.0**.

Post-v1.0 action track: **P14 → v1.1 Beta**.
