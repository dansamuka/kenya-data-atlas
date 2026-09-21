import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyBranch, selectFirstCleanupBatch } from '../../scripts/p38/branch-classifier.mjs';
import { makeBranchFixtures } from './fixtures/workflow-fixtures.mjs';

test('a backup-* branch is always protected_evidence, never a deletion candidate', () => {
  const ctx = makeBranchFixtures();
  const result = classifyBranch({ name: 'backup-p28a-epra-pr160-20260913' }, ctx);
  assert.equal(result.disposition, 'protected_evidence');
  assert.equal(result.deletion_candidate, false);
});

test('a branch with an open PR is active and never a deletion candidate', () => {
  const ctx = makeBranchFixtures();
  const result = classifyBranch({ name: 'feature/open-work' }, ctx);
  assert.equal(result.disposition, 'active_open_pr');
  assert.equal(result.deletion_candidate, false);
});

test('a branch merged via a closed PR is a deletion candidate with a preservation reference', () => {
  const ctx = makeBranchFixtures();
  const result = classifyBranch({ name: 'feature/merged-work' }, ctx);
  assert.equal(result.disposition, 'merged_via_pr');
  assert.equal(result.deletion_candidate, true);
  assert.ok(result.preservation_reference.includes('401'));
});

test('a branch whose PR was closed WITHOUT merging is never a deletion candidate', () => {
  const ctx = makeBranchFixtures();
  const result = classifyBranch({ name: 'feature/abandoned-work' }, ctx);
  assert.equal(result.disposition, 'closed_unmerged_pr_needs_review');
  assert.equal(result.deletion_candidate, false);
});

test('a branch with no PR reference but confirmed ancestor-of-main is a deletion candidate', () => {
  const ctx = { ...makeBranchFixtures(), isAncestorOfMain: true };
  const result = classifyBranch({ name: 'no-pr-but-merged' }, ctx);
  assert.equal(result.disposition, 'merged_no_pr_ancestor_of_main');
  assert.equal(result.deletion_candidate, true);
});

test('a branch with no PR reference and no ancestor confirmation is NEVER a deletion candidate -- absence of evidence is not evidence of safety', () => {
  const ctx = { ...makeBranchFixtures(), isAncestorOfMain: null };
  const result = classifyBranch({ name: 'mystery-branch' }, ctx);
  assert.equal(result.disposition, 'no_pr_reference_needs_manual_review');
  assert.equal(result.deletion_candidate, false);
});

test('a branch with no PR reference and an unconfirmed (undefined) ancestor status is NEVER a deletion candidate', () => {
  const ctx = makeBranchFixtures();
  const result = classifyBranch({ name: 'mystery-branch-2' }, ctx);
  assert.equal(result.deletion_candidate, false);
});

test('selectFirstCleanupBatch only includes deletion candidates and respects the cap', () => {
  const branches = [
    { name: 'a', deletion_candidate: true },
    { name: 'b', deletion_candidate: false },
    { name: 'c', deletion_candidate: true },
    { name: 'd', deletion_candidate: true }
  ];
  const batch = selectFirstCleanupBatch(branches, { limit: 2 });
  assert.equal(batch.length, 2);
  assert.ok(batch.every(b => b.deletion_candidate === true));
});

test('selectFirstCleanupBatch defaults to a 50-branch cap', () => {
  const branches = Array.from({ length: 80 }, (_, i) => ({ name: `b${i}`, deletion_candidate: true }));
  const batch = selectFirstCleanupBatch(branches);
  assert.equal(batch.length, 50);
});
