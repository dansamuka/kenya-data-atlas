// P39 -- archive every P38-classified historical_one_off workflow by narrowing its trigger to
// workflow_dispatch-only. This never deletes a workflow file (preserved as a governed evidence
// record per data/p38/retention-policy.json); it only stops the routine push/pull_request noise
// those files will never usefully fire from again. Re-classifies each file live before archiving
// it, so drift since the P38 snapshot (a file re-broadened, or already archived) is never
// silently overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { planWorkflowArchival } from './workflow-archival-planner.mjs';

const root = process.cwd();
const inventoryPath = path.join(root, 'data/p38/workflow-inventory.json');
const outDir = path.join(root, 'data/p39');
const workflowsDir = path.join(root, '.github/workflows');
const ARCHIVED_ON = process.env.KDA_P39_ARCHIVED_ON || new Date().toISOString().slice(0, 10);

function main() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const candidates = inventory.workflows.filter(w => w.classification === 'historical_one_off');

  const results = [];
  for (const candidate of candidates) {
    const filePath = path.join(workflowsDir, candidate.file);
    const yamlText = fs.readFileSync(filePath, 'utf8');
    const plan = planWorkflowArchival(yamlText, candidate.file, { archivedOn: ARCHIVED_ON });
    if (plan.status === 'archived') {
      fs.writeFileSync(filePath, plan.patchedText);
    }
    results.push({
      file: candidate.file,
      status: plan.status,
      original_triggers: plan.originalTriggers || candidate.triggers,
      original_paths: plan.originalPaths || candidate.paths || null,
      live_classification: plan.liveClassification || null
    });
  }

  const byStatus = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  const report = {
    schema_version: 'kda.p39.workflow-archival-report.v1',
    as_of: ARCHIVED_ON,
    source_inventory: 'data/p38/workflow-inventory.json',
    total_candidates: candidates.length,
    by_status: byStatus,
    results
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'workflow-archival-report.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(
    `P39_ARCHIVE_OK candidates=${candidates.length} ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(' ')}`
  );
}

main();
