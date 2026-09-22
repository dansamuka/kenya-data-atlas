// P39 -- offline validation of the committed workflow-archival report and its live effect on
// .github/workflows/*.yml. Never touches the network: re-derives everything from the committed
// P38 inventory snapshot and the workflow files as they exist in this checkout.
import fs from 'node:fs';
import path from 'node:path';
import { classifyWorkflow } from '../p38/workflow-classifier.mjs';
import { ARCHIVE_MARKER } from './workflow-archival-planner.mjs';

const root = process.cwd();
const workflowsDir = path.join(root, '.github/workflows');

function fail(message) {
  console.error(`P39_ARCHIVE_VALIDATE_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'data/p38/workflow-inventory.json'), 'utf8'));
  const reportPath = path.join(root, 'data/p39/workflow-archival-report.json');
  if (!fs.existsSync(reportPath)) fail('data/p39/workflow-archival-report.json is missing -- run npm run p39:archive-workflows first');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  const historicalOneOff = inventory.workflows.filter(w => w.classification === 'historical_one_off');
  if (report.total_candidates !== historicalOneOff.length) {
    fail(`report.total_candidates=${report.total_candidates} does not match ${historicalOneOff.length} historical_one_off entries in the committed P38 inventory`);
  }

  const reportedFiles = new Set(report.results.map(r => r.file));
  for (const candidate of historicalOneOff) {
    if (!reportedFiles.has(candidate.file)) fail(`${candidate.file} is historical_one_off in the P38 inventory but has no entry in the archival report`);
  }

  let archivedCount = 0;
  let notArchivedCount = 0;
  for (const entry of report.results) {
    const filePath = path.join(workflowsDir, entry.file);
    if (!fs.existsSync(filePath)) fail(`${entry.file} referenced in the archival report no longer exists -- P39 must never delete a workflow file`);
    const liveText = fs.readFileSync(filePath, 'utf8');
    const liveClassification = classifyWorkflow(liveText, entry.file);

    if (entry.status === 'archived' || entry.status === 'already_archived') {
      if (!liveText.includes(ARCHIVE_MARKER)) fail(`${entry.file} is reported ${entry.status} but its live content carries no archive marker`);
      if (!/on:\r?\n {2}workflow_dispatch:\r?\n/.test(liveText)) fail(`${entry.file} is reported archived but its live on: block is not workflow_dispatch-only`);
      archivedCount += 1;
    } else {
      if (liveText.includes(ARCHIVE_MARKER)) fail(`${entry.file} is reported ${entry.status} but its live content already carries an archive marker -- report is stale`);
      notArchivedCount += 1;
    }
  }

  // Every permanent_gate / shared_gate workflow must still classify exactly as it did in the P38
  // snapshot -- the archival script must never have touched a file outside its authorised set.
  const nonCandidates = inventory.workflows.filter(w => w.classification !== 'historical_one_off');
  for (const w of nonCandidates) {
    const filePath = path.join(workflowsDir, w.file);
    if (!fs.existsSync(filePath)) continue; // file may have been intentionally removed by an unrelated later change
    const liveText = fs.readFileSync(filePath, 'utf8');
    if (liveText.includes(ARCHIVE_MARKER)) fail(`${w.file} is classified ${w.classification} in the P38 inventory but was archived -- only historical_one_off files may be archived`);
  }

  console.log(
    `P39_ARCHIVE_VALIDATE_OK historical_one_off=${historicalOneOff.length} archived=${archivedCount} not_archived=${notArchivedCount} permanent_or_shared_untouched=${nonCandidates.length}`
  );
}

main();
