import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOpportunities, selectTranche } from '../../scripts/p40/portfolio-ranking.mjs';

const FIXTURE_ROWS = [
  { reason_id: 'RA', classification: 'structural_permanent', cell_count: 5000, family: 'fam-structural' },
  { reason_id: 'RB', classification: 'publication_pending', cell_count: 100, family: 'fam-pending' },
  { reason_id: 'RC', classification: 'access_technical', cell_count: 1450, family: 'fam-access-1' },
  { reason_id: 'RD', classification: 'access_technical', cell_count: 1450, family: 'fam-access-2' },
  { reason_id: 'RE', classification: 'access_technical', cell_count: 290, family: 'fam-access-1' }
];

test('rankOpportunities puts a higher feasibility tier above a larger structural-barrier cell count', () => {
  const ranked = rankOpportunities(FIXTURE_ROWS);
  assert.equal(ranked[0].reason_id, 'RB', 'publication_pending outranks structural_permanent even with far fewer cells');
  assert.equal(ranked[ranked.length - 1].reason_id, 'RA', 'structural_permanent (tier 0) sorts last despite the largest cell_count');
});

test('rankOpportunities breaks ties within a tier by cell_count descending, then reason_id', () => {
  const ranked = rankOpportunities(FIXTURE_ROWS);
  const accessTechnical = ranked.filter(r => r.classification === 'access_technical');
  assert.deepEqual(accessTechnical.map(r => r.reason_id), ['RC', 'RD', 'RE']);
});

test('rankOpportunities assigns a contiguous 1-based rank', () => {
  const ranked = rankOpportunities(FIXTURE_ROWS);
  assert.deepEqual(ranked.map(r => r.rank), [1, 2, 3, 4, 5]);
});

test('selectTranche respects the group cap', () => {
  const ranked = rankOpportunities(FIXTURE_ROWS);
  const { selected } = selectTranche(ranked, { maxGroups: 2, maxFamilies: 10 });
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map(r => r.reason_id), ['RB', 'RC']);
});

test('selectTranche respects the family cap by skipping a new family once the cap is reached, without stopping', () => {
  const ranked = rankOpportunities(FIXTURE_ROWS);
  // fam-pending, fam-access-1, fam-access-2 would be 3 distinct families in rank order (RB, RC, RD);
  // capping at 2 families must skip RD (a 3rd family) but still admit RE (back in fam-access-1).
  const { selected, families } = selectTranche(ranked, { maxGroups: 10, maxFamilies: 2 });
  assert.deepEqual(selected.map(r => r.reason_id), ['RB', 'RC', 'RE']);
  assert.deepEqual(families.sort(), ['fam-access-1', 'fam-pending']);
});

test('selectTranche never exceeds maxGroups even when more families would fit', () => {
  const ranked = rankOpportunities(FIXTURE_ROWS);
  const { selected } = selectTranche(ranked, { maxGroups: 1, maxFamilies: 5 });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].reason_id, 'RB');
});
