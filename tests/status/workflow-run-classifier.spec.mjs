import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWorkflowRun, classifyWorkflowRuns } from '../../scripts/status/workflow-run-classifier.mjs';
import {
  NOW,
  makePhantomRun,
  makeFreshQueuedRun,
  makeStaleQueuedRun,
  makeInProgressRun,
  makeCompletedRun
} from './fixtures/workflow-run-fixtures.mjs';

test('classifies the real historical phantom-record shape as phantom, not blocking', () => {
  const run = makePhantomRun();
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'phantom');
  const result = classifyWorkflowRuns([run], { now: NOW });
  assert.equal(result.phantom.length, 1);
  assert.equal(result.blocking.length, 0);
});

test('a genuine fresh queued run is never classified phantom, even though it has no job-count evidence yet', () => {
  const run = makeFreshQueuedRun();
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'fresh_queued');
  const result = classifyWorkflowRuns([run], { now: NOW });
  assert.equal(result.blocking.length, 1, 'a fresh queued run must remain a visible blocker');
});

test('a stale-but-not-yet-old-enough queued run with zero jobs is stale, not phantom', () => {
  const run = makeStaleQueuedRun();
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'stale_queued');
  const result = classifyWorkflowRuns([run], { now: NOW });
  assert.equal(result.blocking.length, 1, 'a stale run is still a real, reportable blocker');
});

test('in_progress runs are always blocking regardless of age', () => {
  const run = makeInProgressRun();
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'in_progress');
  const result = classifyWorkflowRuns([run], { now: NOW });
  assert.equal(result.blocking.length, 1);
});

test('completed runs are never blocking', () => {
  const run = makeCompletedRun();
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'completed');
  const result = classifyWorkflowRuns([run], { now: NOW });
  assert.equal(result.blocking.length, 0);
});

test('a queued run past the phantom age threshold is NOT phantom if job-count evidence is unavailable -- absence of evidence is not evidence of a phantom', () => {
  const run = makePhantomRun({ jobs_count: null });
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'stale_queued');
});

test('a queued run with zero jobs but recently updated (still being processed) is not phantom', () => {
  const run = makePhantomRun({ updated_at: new Date(NOW - 60 * 1000).toISOString() });
  assert.equal(classifyWorkflowRun(run, { now: NOW }), 'stale_queued');
});

test('the real 24-record scenario: mixed workflow names on the same stale branch all classify as phantom and contribute zero to blocking', () => {
  const runs = [
    makePhantomRun({ id: 1, name: 'Validate Atlas data' }),
    makePhantomRun({ id: 2, name: 'Release rehearsal' }),
    makePhantomRun({ id: 3, name: 'P16 release audit', head_branch: 'main', created_at: '2026-09-13T08:47:04Z', updated_at: '2026-09-13T08:47:04Z' })
  ];
  const result = classifyWorkflowRuns(runs, { now: NOW });
  assert.equal(result.phantom.length, 3);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.total ?? runs.length, 3);
});

test('a real fresh queue alongside historical phantom records is reported as one blocker, not conflated with the phantoms', () => {
  const runs = [makePhantomRun(), makeFreshQueuedRun()];
  const result = classifyWorkflowRuns(runs, { now: NOW });
  assert.equal(result.phantom.length, 1);
  assert.equal(result.blocking.length, 1);
  assert.equal(result.blocking[0].id, makeFreshQueuedRun().id);
});
