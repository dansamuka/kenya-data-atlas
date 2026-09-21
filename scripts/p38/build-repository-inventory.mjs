// P38 -- evidence-preserving branch and workflow inventory.
//
// Produces:
//   - data/p38/branch-inventory.json: every non-default remote branch, classified with real
//     PR/merge evidence (never a guess) via scripts/p38/branch-classifier.mjs.
//   - data/p38/workflow-inventory.json: every .github/workflows/*.yml file, classified by its
//     actual trigger shape via scripts/p38/workflow-classifier.mjs.
//   - data/p38/first-cleanup-batch.json: up to 50 branches marked deletion_candidate, each with
//     its SHA, reason and preservation reference -- P38 performs no deletion itself; this batch
//     is P39's authorised starting point.
//   - data/p38/retention-policy.json: the naming/classification rules this build applied, so the
//     policy itself is auditable and not just implicit in the code.
//
// Requires GITHUB_TOKEN + GITHUB_REPOSITORY (a live GitHub API token) -- this script's entire job
// is to classify real, current repository state; there is no meaningful offline mode.
import fs from 'node:fs';
import path from 'node:path';
import { classifyWorkflow } from './workflow-classifier.mjs';
import { classifyBranch, selectFirstCleanupBatch } from './branch-classifier.mjs';

const root = process.cwd();
const outDir = path.join(root, 'data/p38');
const AS_OF = '2026-09-21';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || 'dansamuka/kenya-data-atlas';
if (!token) {
  console.error('P38_BUILD_FAIL GITHUB_TOKEN (or GH_TOKEN) is required -- this build classifies live repository state, not a fixture.');
  process.exit(1);
}
const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');

async function githubJson(p) {
  const response = await fetch(`https://api.github.com${p}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kda-p38-inventory'
    }
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${p}: ${await response.text()}`);
  return response.json();
}

async function githubCollection(p, { maxPages = 10 } = {}) {
  const items = [];
  const separator = p.includes('?') ? '&' : '?';
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubJson(`${p}${separator}page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`Expected array for ${p}`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

async function main() {
  const [branches, allPrs] = await Promise.all([
    githubCollection(`/repos/${encodedRepo}/branches?per_page=100`),
    githubCollection(`/repos/${encodedRepo}/pulls?state=all&per_page=100&sort=updated&direction=desc`)
  ]);

  const openPrsByRef = new Map();
  const closedPrsByRef = new Map();
  for (const pr of allPrs) {
    const ref = pr.head?.ref;
    if (!ref) continue;
    if (pr.state === 'open') {
      if (!openPrsByRef.has(ref)) openPrsByRef.set(ref, pr);
    } else {
      if (!closedPrsByRef.has(ref)) closedPrsByRef.set(ref, []);
      closedPrsByRef.get(ref).push(pr);
    }
  }

  const nonDefaultBranches = branches.filter(b => b.name !== 'main');

  // Only branches with no PR reference at all need a live compare call -- everything else is
  // already decided by PR evidence, which is the strong, reliable signal.
  const needsCompare = nonDefaultBranches.filter(b => !openPrsByRef.has(b.name) && !closedPrsByRef.has(b.name));
  const ancestorByBranch = new Map();
  for (const branch of needsCompare) {
    try {
      const compare = await githubJson(`/repos/${encodedRepo}/compare/main...${encodeURIComponent(branch.name)}`);
      ancestorByBranch.set(branch.name, compare.ahead_by === 0);
    } catch {
      ancestorByBranch.set(branch.name, null);
    }
  }

  const classifiedBranches = nonDefaultBranches.map(branch => {
    const result = classifyBranch(branch, {
      openPrsByRef,
      closedPrsByRef,
      isAncestorOfMain: ancestorByBranch.has(branch.name) ? ancestorByBranch.get(branch.name) : undefined
    });
    return {
      name: branch.name,
      sha: branch.commit?.sha || null,
      protected: Boolean(branch.protected),
      ...result
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const byDisposition = {};
  for (const b of classifiedBranches) byDisposition[b.disposition] = (byDisposition[b.disposition] || 0) + 1;

  const branchInventory = {
    schema_version: 'kda.p38.branch-inventory.v1',
    as_of: AS_OF,
    total_non_default_branches: classifiedBranches.length,
    by_disposition: byDisposition,
    branches: classifiedBranches
  };

  const workflowDir = path.join(root, '.github/workflows');
  const workflowFiles = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  const classifiedWorkflows = workflowFiles.map(file => {
    const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    const result = classifyWorkflow(text, file);
    const nameMatch = text.match(/^name:\s*(.+)$/m);
    return { file, workflow_name: nameMatch ? nameMatch[1].trim() : null, ...result };
  }).sort((a, b) => a.file.localeCompare(b.file));

  const byWorkflowClass = {};
  for (const w of classifiedWorkflows) byWorkflowClass[w.classification] = (byWorkflowClass[w.classification] || 0) + 1;

  const workflowInventory = {
    schema_version: 'kda.p38.workflow-inventory.v1',
    as_of: AS_OF,
    total_workflows: classifiedWorkflows.length,
    by_classification: byWorkflowClass,
    workflows: classifiedWorkflows
  };

  const firstBatch = selectFirstCleanupBatch(classifiedBranches, { limit: 50 }).map(b => ({
    name: b.name,
    sha: b.sha,
    disposition: b.disposition,
    reason: b.reason,
    preservation_reference: b.preservation_reference
  }));
  const firstCleanupBatch = {
    schema_version: 'kda.p38.first-cleanup-batch.v1',
    as_of: AS_OF,
    definition: 'Up to 50 branches whose content is provably already preserved on main (via a merged PR or ancestor-of-main confirmation), selected as P39\'s authorised first deletion batch. P38 performs no deletion itself.',
    batch_size: firstBatch.length,
    total_deletion_candidates: classifiedBranches.filter(b => b.deletion_candidate).length,
    branches: firstBatch
  };

  const retentionPolicy = {
    schema_version: 'kda.p38.retention-policy.v1',
    as_of: AS_OF,
    branch_dispositions: {
      protected_evidence: 'Branch name matches a protected-evidence naming pattern (backup-*, docs/*). Never a deletion candidate.',
      active_open_pr: 'An open PR references this branch. Never a deletion candidate.',
      merged_via_pr: 'A merged PR references this branch -- its content is provably on main. Deletion candidate.',
      closed_unmerged_pr_needs_review: 'A PR referencing this branch was closed without merging. May hold abandoned or superseded work; never an automatic deletion candidate.',
      merged_no_pr_ancestor_of_main: 'No PR references this branch, but its head commit is confirmed (via the GitHub compare API, ahead_by === 0) to already be an ancestor of main. Deletion candidate.',
      no_pr_reference_needs_manual_review: 'No PR references this branch and it is not confirmed as an ancestor of main. Never an automatic deletion candidate -- unique content may exist here.'
    },
    workflow_classifications: {
      permanent_gate: 'Triggers on an unconditional push/pull_request (no path filter) or a schedule -- runs on every future mainline change. Never a cleanup candidate.',
      shared_gate: 'Path-scoped trigger(s) covering more than the workflow\'s own files -- an ongoing shared validation gate. Never a cleanup candidate.',
      historical_one_off: 'Every triggering path (across push and/or pull_request) references only this workflow\'s own files. Will not fire again once its narrow task is closed. P39 archive/disable candidate, not deletion (workflow files are not branches).',
      reusable_manual_tool: 'workflow_dispatch is the only trigger. Kept for reuse, not disabled or removed.',
      needs_manual_review: 'Trigger shape did not match a known pattern. Requires manual classification before any P39 action.'
    },
    rules: [
      'No branch or workflow is deleted, disabled or archived by P38 itself -- this is inventory and classification only.',
      'An open PR, an unresolved (closed-without-merge) PR, or the absence of any PR/ancestor evidence always blocks a deletion_candidate classification.',
      'A workflow file is never deleted outright even when historical_one_off -- P39\'s own scope is archiving/disabling, preserving the file as a governed evidence record.',
      'The first cleanup batch is capped at 50 branches and is reviewable/reconstructable from this file alone (name, sha, reason, preservation_reference).'
    ]
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'branch-inventory.json'), JSON.stringify(branchInventory, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'workflow-inventory.json'), JSON.stringify(workflowInventory, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'first-cleanup-batch.json'), JSON.stringify(firstCleanupBatch, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'retention-policy.json'), JSON.stringify(retentionPolicy, null, 2) + '\n');

  console.log(`P38_INVENTORY_BUILD_OK branches=${classifiedBranches.length} workflows=${classifiedWorkflows.length} deletion_candidates=${firstCleanupBatch.total_deletion_candidates} first_batch=${firstBatch.length}`);
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
