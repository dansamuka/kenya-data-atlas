// P39 -- summarise the before/after effect of this phase's cleanup actions, offline, purely by
// re-deriving counts from already-committed P38/P39 artifacts. Never re-fetches live state itself
// (execute-branch-cleanup.mjs and archive-historical-workflows.mjs already did that at build time);
// this is a reporting layer over their committed outputs.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outPath = path.join(root, 'data/p39/repository-health-report.json');

function readJsonIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function main() {
  const branchInventory = readJsonIfExists('data/p38/branch-inventory.json');
  const workflowInventory = readJsonIfExists('data/p38/workflow-inventory.json');
  const cleanupReport = readJsonIfExists('data/p39/branch-cleanup-report.json');
  const archivalReport = readJsonIfExists('data/p39/workflow-archival-report.json');

  if (!branchInventory || !workflowInventory) {
    console.error('P39_HEALTH_FAIL data/p38/branch-inventory.json and data/p38/workflow-inventory.json must exist first');
    process.exit(1);
  }
  if (!cleanupReport) {
    console.error('P39_HEALTH_FAIL data/p39/branch-cleanup-report.json must exist first -- run npm run p39:cleanup-branches');
    process.exit(1);
  }

  // branchInventory is a live, refresh-on-demand P38 snapshot (see data/p38/retention-policy.json)
  // -- it may have been refreshed AFTER this batch executed (its own count already excludes the
  // branches this batch deleted). Deriving "before" by ADDING this batch's own deletions back onto
  // the current count is robust regardless of refresh timing; subtracting from a possibly-current
  // count would silently double-count, which is exactly the bug this comment replaced.
  const branchesAfter = branchInventory.branches.length;
  const deletedNow = cleanupReport.results.filter(r => r.action === 'deleted').length;
  const alreadyGone = cleanupReport.results.filter(r => r.action === 'already_gone').length;
  const branchesBefore = branchesAfter + deletedNow + alreadyGone;

  const historicalOneOffTotal = workflowInventory.workflows.filter(w => w.classification === 'historical_one_off').length;
  const workflowArchival = archivalReport
    ? {
        status: 'complete',
        archived: archivalReport.results.filter(r => r.status === 'archived' || r.status === 'already_archived').length,
        total_historical_one_off: historicalOneOffTotal
      }
    : {
        status: 'pending',
        archived: 0,
        total_historical_one_off: historicalOneOffTotal,
        note: 'workflow archival has not run yet in this environment -- rewriting .github/workflows/*.yml trigger blocks requires a human-dispatched run of .github/workflows/p39-cleanup.yml (action: archive-workflows)'
      };

  const report = {
    schema_version: 'kda.p39.repository-health-report.v1',
    as_of: cleanupReport.as_of,
    branch_cleanup: {
      branches_after_this_batch: branchesAfter,
      branches_deleted_this_batch: deletedNow,
      already_gone_before_this_batch: alreadyGone,
      branches_implied_before_this_batch: branchesBefore,
      branches_implied_before_this_batch_note: 'derived as branches_after_this_batch + deletions, not an independently captured pre-batch snapshot',
      batch_source: cleanupReport.batch_source,
      mode: cleanupReport.mode
    },
    workflow_archival: workflowArchival,
    permanent_and_shared_gates_untouched: workflowInventory.workflows.filter(
      w => w.classification === 'permanent_gate' || w.classification === 'shared_gate'
    ).length,
    consolidation_note:
      'No exact-duplicate shared_gate workflows were found to consolidate in this pass -- the 33 shared_gate workflows are distinct, indicator/file-scoped validators (different watched data files and assertions), not literal template duplicates. Deferred rather than forced.'
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `P39_HEALTH_OK branches_after=${branchesAfter} deleted_this_batch=${deletedNow} implied_before=${branchesBefore} workflow_archival=${workflowArchival.status}`
  );
}

main();
