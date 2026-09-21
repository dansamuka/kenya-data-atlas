// P39 -- offline structural validation of the committed branch-cleanup report against the P38
// batch it must have been generated from. Never touches the network -- live-state re-verification
// already happened inside execute-branch-cleanup.mjs at build time; this only checks the
// committed report is internally consistent and never exceeded its authorised scope.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const KNOWN_ACTIONS = new Set([
  'deleted',
  'dry_run_would_delete',
  'already_gone',
  'skipped_drift',
  'skipped_disposition_changed'
]);
const DELETION_ACTIONS = new Set(['deleted', 'dry_run_would_delete']);

function fail(message) {
  console.error(`P39_CLEANUP_VALIDATE_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const reportPath = path.join(root, 'data/p39/branch-cleanup-report.json');
  if (!fs.existsSync(reportPath)) fail('data/p39/branch-cleanup-report.json is missing -- run npm run p39:cleanup-branches first');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  if (!report.batch_source) fail('report.batch_source is missing -- cannot verify which authorised batch this report came from');
  const batchPath = path.join(root, report.batch_source);
  if (!fs.existsSync(batchPath)) fail(`report.batch_source "${report.batch_source}" does not exist`);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

  if (report.total_in_batch !== batch.branches.length) {
    fail(`report.total_in_batch=${report.total_in_batch} does not match ${batch.branches.length} branches in ${report.batch_source}`);
  }

  const batchByName = new Map(batch.branches.map(b => [b.name, b]));
  const reportedNames = new Set();

  for (const entry of report.results) {
    if (reportedNames.has(entry.name)) fail(`branch ${entry.name} appears more than once in the cleanup report`);
    reportedNames.add(entry.name);

    const batchEntry = batchByName.get(entry.name);
    if (!batchEntry) fail(`branch ${entry.name} in the cleanup report is not in the P38-authorised batch -- P39 must never act outside its authorised scope`);

    if (!KNOWN_ACTIONS.has(entry.action)) fail(`branch ${entry.name} has unknown action "${entry.action}"`);
    if (entry.sha_recorded !== batchEntry.sha) fail(`branch ${entry.name} sha_recorded does not match the P38 batch's recorded sha`);
    if (entry.disposition_recorded !== batchEntry.disposition) fail(`branch ${entry.name} disposition_recorded does not match the P38 batch's recorded disposition`);

    if (DELETION_ACTIONS.has(entry.action) && !entry.preservation_reference) {
      fail(`branch ${entry.name} is marked ${entry.action} but has no preservation_reference`);
    }
  }

  for (const batchEntry of batch.branches) {
    if (!reportedNames.has(batchEntry.name)) fail(`branch ${batchEntry.name} is in the P38-authorised batch but has no entry in the cleanup report`);
  }

  if (report.mode === 'executed') {
    const deletedCount = report.results.filter(r => r.action === 'deleted').length;
    console.log(`P39_CLEANUP_VALIDATE_OK mode=executed total=${batch.branches.length} deleted=${deletedCount}`);
  } else {
    console.log(`P39_CLEANUP_VALIDATE_OK mode=${report.mode} total=${batch.branches.length}`);
  }
}

main();
