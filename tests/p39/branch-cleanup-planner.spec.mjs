import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBranchForCleanup, planBranchCleanup } from '../../scripts/p39/branch-cleanup-planner.mjs';

const baseEntry = {
  name: 'chatgpt/example-branch',
  sha: 'aaa111',
  disposition: 'merged_via_pr',
  reason: 'content merged via PR #95',
  preservation_reference: 'https://github.com/dansamuka/kenya-data-atlas/pull/95'
};

test('branch still matching sha and disposition is eligible for deletion', () => {
  const result = reconcileBranchForCleanup(baseEntry, { exists: true, sha: 'aaa111', dispositionStillValid: true });
  assert.equal(result.action, 'eligible_for_deletion');
});

test('branch already deleted on the remote is reported already_gone, never as a failure', () => {
  const result = reconcileBranchForCleanup(baseEntry, { exists: false, sha: null, dispositionStillValid: null });
  assert.equal(result.action, 'already_gone');
});

test('a live sha that no longer matches the P38 snapshot blocks deletion as drift', () => {
  const result = reconcileBranchForCleanup(baseEntry, { exists: true, sha: 'bbb222', dispositionStillValid: true });
  assert.equal(result.action, 'skipped_drift');
  assert.match(result.detail, /bbb222/);
});

test('a disposition that no longer re-validates live blocks deletion even with a matching sha', () => {
  const result = reconcileBranchForCleanup(baseEntry, { exists: true, sha: 'aaa111', dispositionStillValid: false });
  assert.equal(result.action, 'skipped_disposition_changed');
});

test('sha drift is checked before disposition validity, since a changed branch needs fresh classification first', () => {
  const result = reconcileBranchForCleanup(baseEntry, { exists: true, sha: 'ccc333', dispositionStillValid: false });
  assert.equal(result.action, 'skipped_drift');
});

test('planBranchCleanup maps every batch entry to its own reconciled action by name', () => {
  const entries = [
    baseEntry,
    { ...baseEntry, name: 'chatgpt/second-branch', sha: 'ddd444' }
  ];
  const liveStateByName = new Map([
    ['chatgpt/example-branch', { exists: true, sha: 'aaa111', dispositionStillValid: true }],
    ['chatgpt/second-branch', { exists: false, sha: null, dispositionStillValid: null }]
  ]);
  const results = planBranchCleanup(entries, liveStateByName);
  assert.equal(results.length, 2);
  assert.equal(results[0].action, 'eligible_for_deletion');
  assert.equal(results[1].action, 'already_gone');
});
