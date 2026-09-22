import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REASON_CLASSIFICATIONS,
  SOURCE_FAMILY,
  VALID_CLASSIFICATIONS,
  CLASSIFICATION_FEASIBILITY_TIER
} from '../../scripts/p40/reason-classifications.mjs';

const root = process.cwd();

test('every reason_id in the committed reaudit queue has exactly one classification', () => {
  const reaudit = JSON.parse(fs.readFileSync(path.join(root, 'data/audit/local-54-reaudit-queue.json'), 'utf8'));
  const queueIds = reaudit.rows.map(r => r.reason_id);
  assert.equal(new Set(queueIds).size, queueIds.length, 'reaudit queue itself has a duplicate reason_id');
  for (const id of queueIds) {
    assert.ok(id in REASON_CLASSIFICATIONS, `${id} is missing a P40 classification`);
    assert.ok(id in SOURCE_FAMILY, `${id} is missing a P40 source_family`);
  }
  assert.equal(Object.keys(REASON_CLASSIFICATIONS).length, queueIds.length, 'classification map has entries not present in the reaudit queue');
});

test('every classification value is one of the valid, tiered enum members', () => {
  for (const [reasonId, entry] of Object.entries(REASON_CLASSIFICATIONS)) {
    assert.ok(VALID_CLASSIFICATIONS.has(entry.classification), `${reasonId} has invalid classification "${entry.classification}"`);
    assert.ok(entry.classification in CLASSIFICATION_FEASIBILITY_TIER, `${reasonId} classification has no feasibility tier`);
    assert.ok(typeof entry.basis === 'string' && entry.basis.length > 10, `${reasonId} is missing a substantive classification basis`);
  }
});

test('publication_pending is the highest feasibility tier and structural_permanent is the lowest', () => {
  const tiers = Object.values(CLASSIFICATION_FEASIBILITY_TIER);
  assert.equal(CLASSIFICATION_FEASIBILITY_TIER.publication_pending, Math.max(...tiers));
  assert.equal(CLASSIFICATION_FEASIBILITY_TIER.structural_permanent, Math.min(...tiers));
});
