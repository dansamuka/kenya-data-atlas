# Kenya Data Atlas — Completion Roadmap

The repository is being completed through bounded, independently deployable phases. The machine-readable authority is [`data/project-roadmap.json`](data/project-roadmap.json).

## Completed core phases

**P00–P13 are complete. P15 is complete.** The core geography, provenance, indicator registry, historical data, CountyIQ analytics, rankings/results, canonical policy, county evidence and developer distribution surface are now implemented and validated.

Key current products include 1,788 geographies, 98 indicators, 3,370 series, 6,864 observations, 47 CountyIQ profiles, 14 complete county indicator leaderboards, 47 development snapshots, 46 complete fiscal-delivery scores and 247 county evidence records.

## Deferred post-v1.0 Beta

**P14 — Action & Opportunity Finder Beta** is explicitly **deferred to v1.1 Beta**. Programme freshness, deadlines and eligibility require continuing maintenance; this useful action layer is not necessary to make the underlying Atlas source-auditable, reproducible and release-ready.

## Next phase

**P16 — Real-browser accessibility, SEO and performance release audit**

Run the public product through Chromium, Firefox and WebKit; close critical WCAG 2.2 AA issues; test keyboard/focus/mobile journeys; enforce Lighthouse/performance budgets; and run a reproducible external-link and crawlability audit.

Recommended next-session instruction:

> Complete P16 from `data/project-roadmap.json`. Do not restart completed phases. Run real-browser, accessibility, link-integrity, SEO and performance gates and report any unmet release blocker explicitly.

## Final v1.0 phase

**P17 — Final reproducibility, governance and v1.0 release** follows P16. It will run the final deterministic rebuild, reconcile data/revision status, finish release notes/manifests and verify that GitHub Pages serves the exact release commit.

## Release sequence

Core v1.0 track: **P15 → P16 → P17 → v1.0**.

Post-v1.0 action track: **P14 → v1.1 Beta**.
