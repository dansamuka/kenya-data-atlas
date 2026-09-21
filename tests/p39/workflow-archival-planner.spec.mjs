import test from 'node:test';
import assert from 'node:assert/strict';
import { planWorkflowArchival, ARCHIVE_MARKER } from '../../scripts/p39/workflow-archival-planner.mjs';
import {
  PUSH_PLUS_DISPATCH_YAML,
  PULL_REQUEST_ONLY_YAML,
  BROADENED_SHARED_GATE_YAML,
  NO_ON_BLOCK_YAML
} from './fixtures/workflow-yaml-fixtures.mjs';

test('archives a push+workflow_dispatch historical_one_off, replacing the on: block with dispatch-only', () => {
  const result = planWorkflowArchival(PUSH_PLUS_DISPATCH_YAML, 'labels-governance.yml', { archivedOn: '2026-09-22' });
  assert.equal(result.status, 'archived');
  assert.match(result.patchedText, /on:\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(result.patchedText, /push:/);
  assert.match(result.patchedText, new RegExp(ARCHIVE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(result.originalTriggers, ['push', 'workflow_dispatch']);
  // everything outside the on: block is preserved verbatim
  assert.match(result.patchedText, /jobs:\n {2}normalize-labels:/);
});

test('archives a pull_request-only historical_one_off and adds workflow_dispatch as the sole trigger', () => {
  const result = planWorkflowArchival(
    PULL_REQUEST_ONLY_YAML,
    'p23-cycle1-terminal-classification-30way-shards11-12-new4.yml',
    { archivedOn: '2026-09-22' }
  );
  assert.equal(result.status, 'archived');
  assert.match(result.patchedText, /on:\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(result.patchedText, /pull_request:/);
});

test('is idempotent -- a file already carrying the archive marker is left untouched', () => {
  const first = planWorkflowArchival(PUSH_PLUS_DISPATCH_YAML, 'labels-governance.yml', { archivedOn: '2026-09-22' });
  const second = planWorkflowArchival(first.patchedText, 'labels-governance.yml', { archivedOn: '2026-09-23' });
  assert.equal(second.status, 'already_archived');
  assert.equal(second.patchedText, null);
});

test('refuses to archive a workflow whose live paths broadened past self-referential since the P38 snapshot', () => {
  const result = planWorkflowArchival(
    BROADENED_SHARED_GATE_YAML,
    'p23-cycle1-terminal-classification-30way-shards11-12-new4.yml',
    { archivedOn: '2026-09-22' }
  );
  assert.equal(result.status, 'skipped_not_historical_one_off');
  assert.equal(result.liveClassification, 'shared_gate');
  assert.equal(result.patchedText, null);
});

test('a file with no on: block never classifies as historical_one_off, so archival is refused via the classification gate', () => {
  const result = planWorkflowArchival(NO_ON_BLOCK_YAML, 'malformed.yml', { archivedOn: '2026-09-22' });
  assert.equal(result.status, 'skipped_not_historical_one_off');
  assert.equal(result.liveClassification, 'needs_manual_review');
  assert.equal(result.patchedText, null);
});
