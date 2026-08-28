# Kenya Data Atlas — Completion Roadmap

The repository is being completed through bounded, independently deployable phases.

- Machine-readable phase ledger: [`data/project-roadmap.json`](data/project-roadmap.json)
- Full session scopes and acceptance criteria: [`docs/REPO-COMPLETION-PLAN.md`](docs/REPO-COMPLETION-PLAN.md)
- CountyIQ-specific product target and gates: [`docs/countyiq/PLAN.md`](docs/countyiq/PLAN.md) and [`docs/countyiq/GATES.md`](docs/countyiq/GATES.md)

## Current phase

**P00 — Runtime stabilization + CountyIQ sample fallback** is implemented and awaiting the final release/CI evidence check.

## Next phase

**P01 — Initial-load performance + shared registry loader**

P01 will remove duplicate master-registry downloads across the main frontend, lazy-start the heavy geography explorer, make D3/heavy-data failure non-fatal to the shell, and establish an initial-load asset budget.

Recommended next-session instruction:

> Complete P01 from `docs/REPO-COMPLETION-PLAN.md`. Do not restart completed phases. Implement the full phase, run its acceptance checks, push to `main`, and report any unmet gate explicitly.

After a phase passes its evidence checks, update `data/project-roadmap.json` rather than rewriting the whole plan.
