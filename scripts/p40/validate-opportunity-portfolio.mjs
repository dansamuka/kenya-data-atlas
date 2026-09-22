// P40 -- offline validation of the committed opportunity portfolio, structural exclusion ledger
// and P41 tranche contract. Re-derives the full reconciliation from source registries on every
// run rather than trusting the committed files' own claims.
import fs from 'node:fs';
import path from 'node:path';
import { REASON_CLASSIFICATIONS, SOURCE_FAMILY, VALID_CLASSIFICATIONS } from './reason-classifications.mjs';
import { rankOpportunities, selectTranche } from './portfolio-ranking.mjs';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`P40_VALIDATE_FAIL ${message}`);
  process.exit(1);
}

function main() {
  const reaudit = readJson('data/audit/local-54-reaudit-queue.json');
  const ledger = readJson('data/completeness/local-54-slot-ledger.json');
  const portfolio = readJson('data/p40/opportunity-portfolio.json');
  const structuralExclusion = readJson('data/p40/structural-exclusion-ledger.json');
  const tranche = readJson('data/p40/p41-tranche-contract.json');

  // 1. Every reaudit-queue reason_id appears exactly once in the portfolio, and vice versa.
  const queueIds = new Set(reaudit.rows.map(r => r.reason_id));
  const portfolioIds = new Set(portfolio.opportunities.map(o => o.reason_id));
  if (queueIds.size !== portfolio.opportunities.length) fail('portfolio has a duplicate or missing reason_id relative to the reaudit queue');
  for (const id of queueIds) if (!portfolioIds.has(id)) fail(`reason_id ${id} in the reaudit queue is missing from the portfolio`);
  for (const id of portfolioIds) if (!queueIds.has(id)) fail(`reason_id ${id} in the portfolio is not in the reaudit queue`);

  // 2. Every classification is valid and matches the committed reason-classifications module.
  for (const o of portfolio.opportunities) {
    const expected = REASON_CLASSIFICATIONS[o.reason_id];
    if (!expected) fail(`reason_id ${o.reason_id} has no entry in reason-classifications.mjs`);
    if (!VALID_CLASSIFICATIONS.has(o.classification)) fail(`reason_id ${o.reason_id} has invalid classification "${o.classification}"`);
    if (o.classification !== expected.classification) fail(`reason_id ${o.reason_id} portfolio classification does not match reason-classifications.mjs`);
    if (o.family !== SOURCE_FAMILY[o.reason_id]) fail(`reason_id ${o.reason_id} portfolio family does not match SOURCE_FAMILY`);
  }

  // 3. Full cell reconciliation against the live slot ledger.
  const byStatus = {};
  for (const row of ledger.rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  const numericCells = ledger.rows.filter(r => r.value !== '').length;
  const totalCells = ledger.rows.length;
  const governedClosureCells = totalCells - numericCells;
  const notApplicableCells = byStatus.not_applicable || 0;
  const retiredReplacedCells = byStatus.retired_replaced || 0;
  const structuralCells = notApplicableCells + retiredReplacedCells;
  const addressableCells = governedClosureCells - structuralCells;

  if (portfolio.reconciliation.total_local_54_cells !== totalCells) fail('portfolio total_local_54_cells does not match the live slot ledger');
  if (portfolio.reconciliation.addressable_cells !== addressableCells) fail('portfolio addressable_cells does not match the live slot ledger reconciliation');
  if (structuralExclusion.total_structural_exclusion_cells !== structuralCells) fail('structural-exclusion-ledger total does not match the live slot ledger');

  const portfolioSum = portfolio.opportunities.reduce((sum, o) => sum + o.cell_count, 0);
  if (portfolioSum !== addressableCells) fail(`portfolio opportunities sum to ${portfolioSum} cells, expected ${addressableCells}`);

  const grandTotal = addressableCells + structuralCells;
  if (grandTotal !== governedClosureCells) fail(`addressable (${addressableCells}) + structural (${structuralCells}) = ${grandTotal}, expected governed_closure_cells ${governedClosureCells}`);

  // 4. Ranking is reproducible from the committed portfolio's own rows.
  const rerankedInput = portfolio.opportunities.map(o => ({ reason_id: o.reason_id, classification: o.classification, cell_count: o.cell_count, family: o.family }));
  const reranked = rankOpportunities(rerankedInput);
  for (let i = 0; i < reranked.length; i += 1) {
    if (reranked[i].reason_id !== portfolio.opportunities[i].reason_id || reranked[i].rank !== portfolio.opportunities[i].rank) {
      fail(`portfolio.opportunities is not in the reproducible rank order at position ${i}`);
    }
  }

  // 5. Tranche selection respects its own caps and is reproducible from the ranked portfolio.
  if (tranche.selected_reason_groups.length > tranche.caps.max_reason_groups) fail('tranche exceeds max_reason_groups');
  if (tranche.selected_source_families.length > tranche.caps.max_source_families) fail('tranche exceeds max_source_families');
  const { selected: expectedSelected, families: expectedFamilies } = selectTranche(reranked, {
    maxGroups: tranche.caps.max_reason_groups,
    maxFamilies: tranche.caps.max_source_families
  });
  const expectedIds = expectedSelected.map(r => r.reason_id);
  if (JSON.stringify(expectedIds) !== JSON.stringify(tranche.selected_reason_groups)) fail('tranche selected_reason_groups does not match a reproducible re-selection from the ranked portfolio');
  if (JSON.stringify(expectedFamilies.sort()) !== JSON.stringify([...tranche.selected_source_families].sort())) fail('tranche selected_source_families does not match a reproducible re-selection');
  for (const id of tranche.selected_reason_groups) if (!portfolioIds.has(id)) fail(`tranche group ${id} does not exist in the portfolio`);

  const tranchePotentialYield = tranche.opportunities.reduce((sum, o) => sum + o.cell_count, 0);
  if (tranchePotentialYield !== tranche.potential_cell_yield) fail('tranche.potential_cell_yield does not match the sum of its own opportunities');

  // 6. The closure gate requires "evidence of access" -- the tranche must carry at least one
  // real, dated live-verification record covering every selected family, not just the frozen
  // (older) evidence-state citations inherited from P31/P32.
  if (!Array.isArray(tranche.live_verification) || tranche.live_verification.length === 0) {
    fail('tranche.live_verification is missing or empty -- P40 must record real, dated access-verification evidence');
  }
  for (const family of tranche.selected_source_families) {
    const covered = tranche.live_verification.some(entry => entry.family && entry.family.startsWith(family));
    if (!covered) fail(`tranche.live_verification has no entry covering selected family "${family}"`);
  }

  console.log(
    `P40_VALIDATE_OK addressable=${addressableCells} structural=${structuralCells} groups=${portfolio.opportunities.length} ` +
    `tranche_groups=${tranche.selected_reason_groups.length} tranche_families=${tranche.selected_source_families.length} tranche_cells=${tranche.potential_cell_yield}`
  );
}

main();
