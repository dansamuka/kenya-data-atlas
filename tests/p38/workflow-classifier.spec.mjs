import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWorkflow } from '../../scripts/p38/workflow-classifier.mjs';
import {
  PERMANENT_GATE_UNCONDITIONAL_PUSH,
  PERMANENT_GATE_SCHEDULE,
  HISTORICAL_ONE_OFF_DUAL_TRIGGER,
  SHARED_GATE_BROAD_PATHS,
  REUSABLE_MANUAL_TOOL,
  NEEDS_MANUAL_REVIEW_UNKNOWN_SHAPE
} from './fixtures/workflow-fixtures.mjs';

test('an unconditional push trigger (no path filter) classifies as a permanent gate', () => {
  const result = classifyWorkflow(PERMANENT_GATE_UNCONDITIONAL_PUSH, 'validate.yml');
  assert.equal(result.classification, 'permanent_gate');
});

test('a scheduled trigger classifies as a permanent gate', () => {
  const result = classifyWorkflow(PERMANENT_GATE_SCHEDULE, 'kda-status.yml');
  assert.equal(result.classification, 'permanent_gate');
});

test('a workflow with BOTH push and pull_request triggers, both scoped to only its own files, is historical_one_off -- trigger type alone must not decide this', () => {
  const result = classifyWorkflow(HISTORICAL_ONE_OFF_DUAL_TRIGGER, 'p23-wajir-west-fresh-source-review.yml');
  assert.equal(result.classification, 'historical_one_off');
  assert.ok(result.paths.every(p => p.includes('wajir-west') || p.includes('.github/workflows/')));
});

test('a workflow whose paths reference broad canonical registries (not just its own file) is a shared_gate, not historical', () => {
  const result = classifyWorkflow(SHARED_GATE_BROAD_PATHS, 'p23-form34b-source-verification.yml');
  assert.equal(result.classification, 'shared_gate');
});

test('workflow_dispatch as the sole trigger is a reusable manual tool', () => {
  const result = classifyWorkflow(REUSABLE_MANUAL_TOOL, 'p23-salvage-fresh-download.yml');
  assert.equal(result.classification, 'reusable_manual_tool');
});

test('an unrecognized trigger shape falls back to needs_manual_review rather than a guess', () => {
  const result = classifyWorkflow(NEEDS_MANUAL_REVIEW_UNKNOWN_SHAPE, 'something-unusual.yml');
  assert.equal(result.classification, 'needs_manual_review');
});

test('every real workflow file in .github/workflows classifies without throwing', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.resolve('.github/workflows');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'expected at least one real workflow file to classify against');
  const validClasses = new Set(['permanent_gate', 'shared_gate', 'historical_one_off', 'reusable_manual_tool', 'needs_manual_review']);
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const result = classifyWorkflow(text, file);
    assert.ok(validClasses.has(result.classification), `${file} produced an invalid classification: ${result.classification}`);
  }
});
