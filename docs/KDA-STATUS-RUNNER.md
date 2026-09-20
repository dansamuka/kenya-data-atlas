# KDA Repository Status Runner

The KDA status runner provides a low-cost, deterministic repository health and roadmap dashboard so routine status checks do not require a fresh repository-wide audit.

## What it reads

The runner treats the following as authoritative inputs:

- `data/project-roadmap.json` — P00–P17;
- `data/data-completion-roadmap.json` — P18–P26;
- `data/local-54-completion-roadmap.json` — P27–P35;
- `data/completeness/summary.json` — governed legacy slot completion;
- `data/completeness/local-54-summary.json` — Local-54 denominator and evidence coverage;
- `data/representation/representatives.json` — representation registry when present;
- `package.json`, phase scripts and phase workflows — implementation evidence;
- open PRs and all ahead-of-`main` branches whose name matches the current phase (for example `p31-*`) — ongoing implementation evidence.

When run in GitHub Actions it also makes GitHub API reads for open/merged PRs, current-phase branches, branch divergence from `main`, and the latest critical workflow states.

The active [`P36–P41 successor roadmap`](POST-P35-CLOSURE-PLAN.md) is intentionally separate from the completed 36/36 historical counter. The current runner does not yet ingest it. P37 will add a second successor-progress counter and final-state workflow refresh without rewriting P00–P35 history.

## What it checks

The runner validates that:

- P00–P35 exist exactly once;
- completed phases do not depend on known incomplete phases;
- P26 closure is consistent with 100% governed legacy resolution and zero unknown slots;
- P29 closure is consistent with a Local-54 summary and zero unclassified cells;
- P30 closure is backed by a representation registry and a wired validator;
- completed P32 is backed by its dedicated `p32:validate` gate and is never reported as declaration-only when that gate is present;
- Local-54 roadmap declarations are shown separately from dedicated validators, shared cross-phase gates, phase scripts, workflows and known outputs across P31–P35;
- P31/P32 progress is estimated from distinct frozen Local-54 indicator families with concrete merged or ahead-of-main branch/PR work.

This last check is deliberate: a phase can have scripts, workflows or outputs before the roadmap is formally closed. The dashboard flags that state instead of silently treating the phase as untouched or complete.

## Current-phase progress estimate

For P31 and P32, the runner reports a transparent coverage estimate:

```text
progress % = distinct indicator families with concrete current-phase work / 54
```

The numerator includes both work merged to `main` and work on ahead-of-`main` current-phase branches. The dashboard always shows the two separately:

- **merged coverage** — indicator families already represented by merged current-phase PRs;
- **in-flight coverage** — additional indicator families currently represented on active branches/open PRs.

This is deliberately a **coverage estimate**, not a declaration that phase acceptance criteria are met. It did not close P31 or P32; their roadmap acceptance gates, deterministic rebuilds and validators did. Both phases are now complete, so the estimate is retained only for historical/current-phase compatibility.

Branches are considered current-phase work when their name begins with the current phase ID (for example `p31-`, `p31/` or `p31_`) and they are either ahead of `main` or have an open PR. Branches without PRs are therefore visible rather than silently omitted.

## P32 assurance boundary

P29 remains the whole-Local-54 denominator and deterministic ledger gate. P32 now has a separate assurance contract and validator:

- [`data/p32/ward-completion-assurance-contract.json`](../data/p32/ward-completion-assurance-contract.json) fixes the P32 claim at 54 indicators, 1,450 wards and 78,300 dispositions;
- `npm run p32:validate` independently checks the ward cross-product, zero unknown/unclassified cells, zero prohibited inheritance and 43 specifically investigated P32 indicator families covering 62,350 ward cells;
- focused fixtures intentionally break the denominator, disposition, inheritance, evidence-family and deterministic-rebuild invariants;
- the generated roads/fuel evidence is rebuilt in memory and compared with its committed representation, so validation does not mutate the repository.

This distinction prevents the broad P29 count from being mistaken for evidence that P32's ward-specific research was actually completed.

## Outputs

Every Actions run produces:

- a Markdown dashboard;
- a machine-readable JSON status snapshot;
- a GitHub Actions job summary;
- a 30-day workflow artifact.

For non-PR runs, the workflow creates or updates one canonical issue:

**KDA — Live Repository Status**

The issue is updated in place. Generated status files are not committed back to the repository, avoiding commit loops and repository churn.

## Triggers

The workflow runs:

- on every push to `main`;
- on pull requests that touch status/roadmap/completeness inputs;
- daily at 04:17 UTC (07:17 East Africa Time);
- manually through **Actions → KDA repository status → Run workflow**.

## Local use

Run the lightweight invariant check:

```bash
npm run status:validate
```

Print a dashboard without making GitHub API calls:

```bash
npm run status:build -- --offline
```

Write artifacts locally:

```bash
node scripts/status/build-status.mjs --offline \
  --markdown /tmp/kda-status.md \
  --json /tmp/kda-status.json
```

## Scope

This runner is the canonical **fast status** surface. It is intentionally mechanical and cheap.

It does not replace deeper milestone audits that inspect implementation quality, statistical methodology, UI behaviour or source evidence. Those remain useful after major phases such as P31, P32, P34 and P35.

The runner also does not currently treat GitHub-side zero-job phantom queue records as a separate state. Until P37 closes, API-level checks should distinguish the 24 frozen 13 September 2026 records from fresh queued or in-progress work.
