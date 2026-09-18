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
- `package.json`, phase scripts and phase workflows — implementation evidence.

When run in GitHub Actions it also makes a small number of GitHub API reads for open PRs, the latest merged PR and the latest critical workflow states.

## What it checks

The runner validates that:

- P00–P35 exist exactly once;
- completed phases do not depend on known incomplete phases;
- P26 closure is consistent with 100% governed legacy resolution and zero unknown slots;
- P29 closure is consistent with a Local-54 summary and zero unclassified cells;
- P30 closure is backed by a representation registry and a wired validator;
- Local-54 roadmap declarations are shown separately from implementation evidence.

This last check is deliberate: a phase can have scripts, workflows or outputs before the roadmap is formally closed. The dashboard flags that state instead of silently treating the phase as untouched or complete.

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
