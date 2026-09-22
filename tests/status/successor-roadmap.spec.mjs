import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSuccessorRoadmap } from '../../scripts/status/successor-roadmap.mjs';
import { makeSuccessorRoadmapFixture } from './fixtures/workflow-run-fixtures.mjs';

test('summarizes the successor roadmap independently of the historical 36/36 counter', () => {
  const summary = summarizeSuccessorRoadmap(makeSuccessorRoadmapFixture());
  assert.equal(summary.total_phases, 7);
  assert.equal(summary.complete_phases, 1);
  assert.equal(summary.completion_pct, 14.29);
  assert.deepEqual(summary.current_phase, { id: 'P37', title: 'Truthful status and Actions-queue observability', status: 'next' });
});

test('reports all phases complete with no current phase when the successor programme finishes', () => {
  const fixture = makeSuccessorRoadmapFixture({
    phases: makeSuccessorRoadmapFixture().phases.map(p => ({ ...p, status: 'complete' }))
  });
  const summary = summarizeSuccessorRoadmap(fixture);
  assert.equal(summary.complete_phases, 7);
  assert.equal(summary.current_phase, null);
});

test('falls back to the first non-complete phase if none is explicitly marked "next"', () => {
  const fixture = makeSuccessorRoadmapFixture({
    phases: makeSuccessorRoadmapFixture().phases.map(p => (p.id === 'P37' ? { ...p, status: 'planned' } : p))
  });
  const summary = summarizeSuccessorRoadmap(fixture);
  assert.equal(summary.current_phase.id, 'P37');
});

test('never invents phase IDs that collide with the historical P00-P35 range', () => {
  const summary = summarizeSuccessorRoadmap(makeSuccessorRoadmapFixture());
  const historicalIds = new Set(Array.from({ length: 36 }, (_, n) => `P${String(n).padStart(2, '0')}`));
  const colliding = summary.phases.filter(p => historicalIds.has(p.id));
  assert.deepEqual(colliding, [], 'successor phase IDs must all be P36 or above');
});
