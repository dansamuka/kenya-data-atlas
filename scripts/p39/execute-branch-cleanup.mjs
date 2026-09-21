// P39 -- execute (or, by default, dry-run) the P38-authorised first branch-cleanup batch.
// Every branch is re-verified against LIVE GitHub state immediately before any deletion decision:
// its SHA must still match the P38 snapshot, and its disposition (merged-via-PR, or ancestor-of-
// main) is re-checked live, never trusted from the frozen batch file alone. Deletion only ever
// happens with --execute; the default mode only produces a report of what would happen.
//
// Requires GITHUB_TOKEN (or GH_TOKEN) -- this is a live-state operation, not a fixture rebuild.
import fs from 'node:fs';
import path from 'node:path';
import { planBranchCleanup } from './branch-cleanup-planner.mjs';

const root = process.cwd();
// Defaults to the live P38 snapshot for a NEW batch. Once a batch has been executed, its exact
// branch list is copied to a permanent data/p39/executed-batch-N.json snapshot (P38's own
// inventory is designed to be refreshed/replaced on demand, so the live file cannot serve as a
// stable historical reference once P39 starts consuming batches from it) -- pass
// --batch=data/p39/executed-batch-N.json to re-run or re-report against a past batch.
const batchArg = process.argv.find(arg => arg.startsWith('--batch='));
const batchRelativePath = batchArg ? batchArg.slice('--batch='.length) : 'data/p38/first-cleanup-batch.json';
const batchPath = path.join(root, batchRelativePath);
const outDir = path.join(root, 'data/p39');
const EXECUTE = process.argv.includes('--execute');
const AS_OF = process.env.KDA_P39_ARCHIVED_ON || new Date().toISOString().slice(0, 10);

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || 'dansamuka/kenya-data-atlas';
if (!token) {
  console.error('P39_CLEANUP_FAIL GITHUB_TOKEN (or GH_TOKEN) is required -- this reconciles live branch state, not a fixture.');
  process.exit(1);
}
const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');

async function githubRequest(p, options = {}) {
  return fetch(`https://api.github.com${p}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kda-p39-cleanup',
      ...(options.headers || {})
    }
  });
}

async function fetchLiveBranch(name) {
  const encoded = name.split('/').map(encodeURIComponent).join('/');
  const response = await githubRequest(`/repos/${encodedRepo}/branches/${encoded}`);
  if (response.status === 404) return { exists: false, sha: null };
  if (!response.ok) throw new Error(`GitHub API ${response.status} fetching branch ${name}: ${await response.text()}`);
  const body = await response.json();
  return { exists: true, sha: body.commit.sha };
}

async function revalidateDisposition(entry, liveSha) {
  if (entry.disposition === 'merged_via_pr') {
    const match = entry.preservation_reference.match(/\/pull\/(\d+)$/);
    if (!match) return false;
    const response = await githubRequest(`/repos/${encodedRepo}/pulls/${match[1]}`);
    if (!response.ok) return false;
    const pr = await response.json();
    return Boolean(pr.merged_at);
  }
  if (entry.disposition === 'merged_no_pr_ancestor_of_main') {
    const encodedSha = encodeURIComponent(liveSha);
    const response = await githubRequest(`/repos/${encodedRepo}/compare/main...${encodedSha}`);
    if (!response.ok) return false;
    const comparison = await response.json();
    return comparison.ahead_by === 0;
  }
  // Only merged_via_pr and merged_no_pr_ancestor_of_main are ever deletion_candidate: true
  // (see scripts/p38/branch-classifier.mjs) -- anything else reaching here is unexpected input.
  return false;
}

async function deleteBranch(name) {
  const encoded = name.split('/').map(encodeURIComponent).join('/');
  const response = await githubRequest(`/repos/${encodedRepo}/git/refs/heads/${encoded}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`GitHub API ${response.status} deleting branch ${name}: ${await response.text()}`);
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const liveStateByName = new Map();
  for (const entry of batch.branches) {
    const live = await fetchLiveBranch(entry.name);
    let dispositionStillValid = null;
    if (live.exists && live.sha === entry.sha) {
      dispositionStillValid = await revalidateDisposition(entry, live.sha);
    }
    liveStateByName.set(entry.name, { ...live, dispositionStillValid });
  }

  const plans = planBranchCleanup(batch.branches, liveStateByName);
  const byBranch = new Map(batch.branches.map(b => [b.name, b]));

  const results = [];
  for (const plan of plans) {
    const entry = byBranch.get(plan.name);
    let action = plan.action;
    if (plan.action === 'eligible_for_deletion') {
      if (EXECUTE) {
        await deleteBranch(plan.name);
        action = 'deleted';
      } else {
        action = 'dry_run_would_delete';
      }
    }
    results.push({
      name: plan.name,
      sha_recorded: entry.sha,
      disposition_recorded: entry.disposition,
      preservation_reference: entry.preservation_reference,
      action,
      detail: plan.detail
    });
  }

  const byAction = {};
  for (const r of results) byAction[r.action] = (byAction[r.action] || 0) + 1;

  const report = {
    schema_version: 'kda.p39.branch-cleanup-report.v1',
    as_of: AS_OF,
    mode: EXECUTE ? 'executed' : 'dry_run',
    batch_source: batchRelativePath,
    total_in_batch: batch.branches.length,
    by_action: byAction,
    results
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'branch-cleanup-report.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(
    `P39_CLEANUP_OK mode=${report.mode} total=${batch.branches.length} ${Object.entries(byAction).map(([k, v]) => `${k}=${v}`).join(' ')}`
  );
}

main().catch(err => {
  console.error(`P39_CLEANUP_FAIL ${err.message}`);
  process.exit(1);
});
