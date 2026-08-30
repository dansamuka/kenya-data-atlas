# Kenya Data Atlas — Completion Roadmap

The repository is being completed through bounded, independently deployable phases.

- Machine-readable phase ledger: [`data/project-roadmap.json`](data/project-roadmap.json)
- Full session scopes and acceptance criteria: [`docs/REPO-COMPLETION-PLAN.md`](docs/REPO-COMPLETION-PLAN.md)
- CountyIQ-specific product target and gates: [`docs/countyiq/PLAN.md`](docs/countyiq/PLAN.md) and [`docs/countyiq/GATES.md`](docs/countyiq/GATES.md)

## Completed phases

P00 through P13 are complete. See `data/project-roadmap.json` (the authoritative, machine-readable ledger) for full outputs/acceptance criteria per phase; per-phase detail docs live in `docs/countyiq/`.

- **P00** — Runtime stabilization + CountyIQ sample fallback
- **P01** — Initial-load performance + shared registry loader
- **P02** — CountyIQ canonical analytical mart
- **P03** — County fiscal history and denominator discipline (12-year FY2013/14–FY2024/25 panel)
- **P04** — County health and living-standards ingestion
- **P05** — County education, economy, agriculture and infrastructure breadth
- **P06** — Peer groups, percentiles and trend intelligence (`docs/countyiq/P06-PEER-INTELLIGENCE.md`)
- **P07** — Development Gap Calculator and evidence narrative engine (`docs/countyiq/P07-GAPS-AND-NARRATIVE.md`)
- **P08** — County Development & Performance Index research release (`docs/countyiq/P08-PERFORMANCE-INDEX.md`) — **Research/Beta, not production.** Only 5 indicators across 4 of 7 domains currently qualify; see the doc's "headline finding."
- **P09** — Historical validation and publication-scope decision (`docs/countyiq/P09-HISTORICAL-VALIDATION.md`) — **current snapshot published; longitudinal composite withheld.** The five-band latest cross-section passes the stated robustness gate across plausible full-composite weightings, while exact ranks remain diagnostic and no historical composite trend is claimed.
- **P10** — County fiscal delivery and accountability layer (`docs/countyiq/P10-DELIVERY-LAYER.md`) — **published.** Common-period FY2024/25 score across execution, OSR target attainment and arrears control; wage-ceiling and audit evidence remain non-scored accountability signals. Missing data are never imputed: 46 counties receive complete scores and Narok is explicitly incomplete.
- **P11** — Administration-period scorecards and evidence-based recognition (`docs/countyiq/P11-RECOGNITION.md`) — **published for all 47 counties.** Uses FY2021/22 as the last full pre-election baseline, treats FY2022/23 as transition context, and compares to FY2024/25 without assigning a personal governor causal score. Recognition is reproducible from published fiscal rules.
- **P12** — Canonical Convergence & Governance (`docs/P12-CANONICAL-CONVERGENCE.md`) — **complete.** One versioned policy now governs domain, direction, composite/ranking/trend semantics, uncertainty, inheritance and cross-level normalisation across CountyIQ and registry products; drift is mechanically tested.
- **P13** — County Evidence & Knowledge Hub (`docs/P13-COUNTY-EVIDENCE-HUB.md`) — **complete.** 47/47 third-generation CIDP evidence coverage plus source-honest budget, audit, CFSP/CBROP and county planning-document doorways with explicit verification states.

## Next phase

**P14 — Action & Opportunity Finder Beta**

Build the action layer on top of the governed CountyIQ and county evidence foundations. Every live programme must have a primary URL, verification date and reproducible match rationale; expired, paused, unknown and closed programmes cannot appear as live.

Recommended next-session instruction:

> Complete P14 from `data/project-roadmap.json`. Do not restart completed phases. Implement the full phase, run its acceptance checks, and report any unmet gate explicitly.

After a phase passes its evidence checks, update `data/project-roadmap.json` and this file together — both are considered part of the same handoff, not one authoritative and one optional.
