# Kenya Data Atlas — Completion Roadmap

The repository is being completed through bounded, independently deployable phases.

- Machine-readable phase ledger: [`data/project-roadmap.json`](data/project-roadmap.json)
- Full session scopes and acceptance criteria: [`docs/REPO-COMPLETION-PLAN.md`](docs/REPO-COMPLETION-PLAN.md)
- CountyIQ-specific product target and gates: [`docs/countyiq/PLAN.md`](docs/countyiq/PLAN.md) and [`docs/countyiq/GATES.md`](docs/countyiq/GATES.md)

## Completed phases

**P00 — Runtime stabilization + CountyIQ sample fallback** is complete.

**P01 — Initial-load performance + shared registry loader** is complete. The release workflow passed deterministic rebuild, seed/output drift checks, the full Atlas validation suite and the independent Shapely geometry audit. P01 also established a measured first-paint budget and moved D3, master registries and large geography assets off the initial load path.

## Next phase

**P02 — CountyIQ canonical analytical mart**

P02 will generate one deterministic 47-county analytical product from the canonical Atlas registries and migrate CountyIQ away from browser-side Sprint CSV joins. The mart must retain source, period, unit, badge/provenance, history, ranking eligibility, uncertainty and transformation metadata.

Recommended next-session instruction:

> Complete P02 from `docs/REPO-COMPLETION-PLAN.md`. Do not restart completed phases. Implement the full phase, run its acceptance checks, push to `main`, and report any unmet gate explicitly.

After a phase passes its evidence checks, update `data/project-roadmap.json` rather than rewriting the whole plan.
