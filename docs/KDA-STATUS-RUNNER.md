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

When run in GitHub Actions it also makes GitHub API reads for open/merged PRs, current-phase branches, branch divergence from `main`, the latest critical workflow states, and a repo-wide Actions-queue snapshot (all non-completed runs, any branch).

- `data/post-p35-closure-roadmap.json` — the active P36–P42 successor programme.

The active [`P36–P42 successor roadmap`](POST-P35-CLOSURE-PLAN.md) is ingested as a second, fully independent progress counter (`status.successor_roadmap`). It is never merged into `status.roadmap`, and `validateStatus()` asserts `roadmap.total_phases === 36` on every run specifically to guard against that -- the completed 36/36 historical counter cannot be rewritten by successor-programme progress.

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

## Actions-queue health (fresh / active / stale / phantom)

`scripts/status/workflow-run-classifier.mjs` classifies every non-completed workflow run repo-wide (not just on `main` -- the 24 historical records this exists for sit on a long-merged, unrelated branch):

- **completed** — settled, reported via the existing critical-workflow section;
- **in_progress** — always a real, active blocker;
- **fresh_queued** — queued recently; a real blocker, reported as such;
- **stale_queued** — queued longer than 30 minutes but not yet phantom-confirmed; still a real, reportable blocker;
- **phantom** — queued, zero jobs (confirmed via the Actions jobs API), never updated since creation, and older than 6 hours. This is the objective, checkable evidence standard: a run is only ever phantom-classified when job-count evidence is actually available and reads zero. If job-count evidence is unavailable, a run is never phantom-classified.

Phantom records are reported separately (`data.github.actions_queue_health.phantom`) and never counted in `blocking_count`. `validateStatus()` asserts `blocking_count` always equals `fresh_queued + stale_queued + in_progress`, excluding phantom, by construction.

This does not delete or cancel the 24 GitHub-side phantom records. If the GitHub API continues to reject cancellation or deletion of those specific queue entries, truthful classification -- reporting them as historical anomalies rather than as current blocking capacity -- is the repository-controlled outcome P37 requires.

Fixtures covering the real 24-record shape and a genuine fresh queue: `tests/status/fixtures/workflow-run-fixtures.mjs`, exercised by `tests/status/workflow-run-classifier.spec.mjs` (`npm run status:validate`).

## Post-workflow finalization

A push-triggered status refresh reports a live, possibly mid-flight snapshot: the critical workflows for that commit (`Validate Atlas data`, `Release rehearsal`, `P16 release audit`) may still be running. `.github/workflows/kda-status.yml` also listens for `workflow_run` completion of each of those three workflows and re-runs the status refresh for that exact commit (`ref: github.event.workflow_run.head_sha`), gated to `main` only. Because the script always re-queries live state, by the time the last of the three watched workflows completes, that finalization run reflects all three conclusions. The rendered dashboard marks this explicitly: *"finalized: refreshed after critical workflows settled for this commit"* vs. *"live snapshot -- critical workflows for this commit may still be running"*.

This cannot create a self-triggering loop: `KDA repository status` is not among the three watched workflow names, so its own runs never trigger another `workflow_run` event, and the canonical issue is updated in place rather than via a commit.

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

- on every push to `main` (live snapshot);
- once each of `Validate Atlas data`, `Release rehearsal` and `P16 release audit` completes on `main` (finalized snapshot for that exact commit);
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
