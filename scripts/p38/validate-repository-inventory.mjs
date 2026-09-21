// P38 -- validate the committed branch/workflow inventory snapshot.
//
// Unlike P29/P34/P35's ledgers (derived from static, committed source files, so a fresh rebuild
// must be byte-identical), P38's source data is live repository state -- open PRs and branches
// change continuously, so a fresh rebuild will legitimately differ from a snapshot taken minutes
// earlier. This validator therefore checks the INTERNAL correctness of whatever snapshot is
// currently committed (offline, no GitHub API call), while scripts/p38/*-classifier.mjs's own
// pure-function logic is covered by the deterministic node:test fixtures in tests/p38/. Refreshing
// the snapshot itself is `npm run p38:build` (requires a live GITHUB_TOKEN), run periodically, not
// on every commit.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fail = m => { console.error(`P38_INVENTORY_FAIL ${m}`); process.exitCode = 1; };
const assert = (c, m) => { if (!c) fail(m); };

const branchInventory = readJson('data/p38/branch-inventory.json');
const workflowInventory = readJson('data/p38/workflow-inventory.json');
const firstBatch = readJson('data/p38/first-cleanup-batch.json');
const retentionPolicy = readJson('data/p38/retention-policy.json');

assert(branchInventory.schema_version === 'kda.p38.branch-inventory.v1', 'branch inventory schema mismatch');
assert(workflowInventory.schema_version === 'kda.p38.workflow-inventory.v1', 'workflow inventory schema mismatch');
assert(firstBatch.schema_version === 'kda.p38.first-cleanup-batch.v1', 'first cleanup batch schema mismatch');
assert(retentionPolicy.schema_version === 'kda.p38.retention-policy.v1', 'retention policy schema mismatch');

// --- gate: every branch has a disposition ---
const VALID_BRANCH_DISPOSITIONS = new Set(Object.keys(retentionPolicy.branch_dispositions));
const NEVER_DELETABLE_DISPOSITIONS = new Set(['protected_evidence', 'active_open_pr', 'closed_unmerged_pr_needs_review', 'no_pr_reference_needs_manual_review']);
assert(branchInventory.total_non_default_branches === branchInventory.branches.length, 'total_non_default_branches does not match branches.length');
for (const b of branchInventory.branches) {
  for (const f of ['name', 'sha', 'disposition', 'reason', 'deletion_candidate']) {
    assert(Object.hasOwn(b, f), `${b.name || '(no name)'}: branch missing required field ${f}`);
  }
  assert(VALID_BRANCH_DISPOSITIONS.has(b.disposition), `${b.name}: disposition "${b.disposition}" is not in the documented retention policy`);
  // gate: no open-PR/protected/unresolved branch is proposed for deletion
  if (NEVER_DELETABLE_DISPOSITIONS.has(b.disposition)) {
    assert(b.deletion_candidate === false, `${b.name}: disposition ${b.disposition} must never be a deletion candidate`);
  }
  if (b.deletion_candidate) {
    assert(Boolean(b.preservation_reference), `${b.name}: a deletion candidate must carry a preservation_reference`);
  }
}
assert(new Set(branchInventory.branches.map(b => b.name)).size === branchInventory.branches.length, 'duplicate branch name in inventory');
assert(!branchInventory.branches.some(b => b.name === 'main'), 'the default branch (main) must not appear in the non-default branch inventory');

// --- gate: every workflow has a disposition ---
const VALID_WORKFLOW_CLASSES = new Set(Object.keys(retentionPolicy.workflow_classifications));
assert(workflowInventory.total_workflows === workflowInventory.workflows.length, 'total_workflows does not match workflows.length');
for (const w of workflowInventory.workflows) {
  assert(VALID_WORKFLOW_CLASSES.has(w.classification), `${w.file}: classification "${w.classification}" is not in the documented retention policy`);
}
assert(new Set(workflowInventory.workflows.map(w => w.file)).size === workflowInventory.workflows.length, 'duplicate workflow file in inventory');
// cross-check against the real committed workflow directory, so the snapshot cannot silently omit a file
const workflowDir = path.join(root, '.github/workflows');
const actualWorkflowFiles = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
assert(actualWorkflowFiles.length === workflowInventory.workflows.length, `workflow inventory has ${workflowInventory.workflows.length} entries but .github/workflows/ currently has ${actualWorkflowFiles.length} files -- run npm run p38:build to refresh the snapshot`);
for (const f of actualWorkflowFiles) {
  assert(workflowInventory.workflows.some(w => w.file === f), `${f} exists in .github/workflows/ but is missing from the committed inventory -- run npm run p38:build to refresh the snapshot`);
}

// --- gate: the first cleanup batch is reviewable and reconstructable, capped at 50 ---
assert(firstBatch.branches.length <= 50, `first cleanup batch has ${firstBatch.branches.length} entries, exceeding the 50-branch cap`);
assert(firstBatch.batch_size === firstBatch.branches.length, 'first cleanup batch batch_size does not match branches.length');
const branchByName = new Map(branchInventory.branches.map(b => [b.name, b]));
for (const entry of firstBatch.branches) {
  const source = branchByName.get(entry.name);
  assert(source, `first cleanup batch references ${entry.name}, which is not in the branch inventory`);
  if (source) assert(source.deletion_candidate === true, `first cleanup batch includes ${entry.name}, but the branch inventory does not mark it a deletion candidate`);
  assert(Boolean(entry.preservation_reference), `${entry.name}: first cleanup batch entry missing preservation_reference`);
}
const totalCandidatesInInventory = branchInventory.branches.filter(b => b.deletion_candidate).length;
assert(firstBatch.total_deletion_candidates === totalCandidatesInInventory, 'first cleanup batch total_deletion_candidates does not match the branch inventory');

if (process.exitCode !== 1) {
  console.log(`P38_INVENTORY_OK branches=${branchInventory.total_non_default_branches} workflows=${workflowInventory.total_workflows} deletion_candidates=${totalCandidatesInInventory} first_batch=${firstBatch.branches.length}`);
}
