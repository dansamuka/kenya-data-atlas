import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWardCompletion } from '../../scripts/p32/ward-completion-assurance.mjs';
import { makeValidWardCompletionFixture } from './fixtures/ward-completion-fixtures.mjs';

function messages(fixture) {
  return validateWardCompletion(fixture).errors.join('\n');
}

test('accepts a complete, specifically evidenced ward tranche', () => {
  const result = validateWardCompletion(makeValidWardCompletionFixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.ward_cells, 4);
  assert.equal(result.summary.p32_specific_evidence_cells, 2);
});

test('rejects a broken ward denominator', () => {
  const fixture = makeValidWardCompletionFixture();
  fixture.ledger.rows.pop();
  assert.match(messages(fixture), /ward cells must equal 4|ward denominator is missing 1 cell/);
});

test('rejects an unknown disposition', () => {
  const fixture = makeValidWardCompletionFixture();
  fixture.ledger.rows[1].status = 'unclassified';
  assert.match(messages(fixture), /unknown\/unclassified ward cells must equal zero/);
});

test('rejects parent-to-ward inheritance', () => {
  const fixture = makeValidWardCompletionFixture();
  fixture.ledger.rows[0].geographic_method = 'inherited';
  assert.match(messages(fixture), /prohibited parent-to-ward inheritance must equal zero/);
});

test('rejects a missing P32-specific evidence family', () => {
  const fixture = makeValidWardCompletionFixture();
  fixture.evidenceDocuments[0].document.states = [];
  assert.match(messages(fixture), /specific P32 evidence indicator families mismatch/);
});

test('rejects deterministic rebuild drift', () => {
  const fixture = makeValidWardCompletionFixture();
  fixture.deterministicArtifacts[0].rebuilt.rows.push(3);
  assert.match(messages(fixture), /deterministic rebuild drift detected/);
});
