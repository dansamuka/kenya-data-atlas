// P40 -- build the numeric-yield opportunity portfolio from already-governed evidence.
//
// Reconciles all 90,491 local-54 governed closures (data/completeness/local-54-slot-ledger.json)
// into two disjoint sets:
//   - the addressable denominator: the 78,311 cells behind the 87 reason groups in
//     data/audit/local-54-reaudit-queue.json (official_unavailable / governed_unavailable /
//     boundary_unresolved), each barrier-classified in scripts/p40/reason-classifications.mjs from
//     a genuine reading of its full reason text;
//   - the structural exclusion ledger: the 12,180 not_applicable cells, permanently out of scope
//     per the roadmap's own rule (not "unavailable pending future evidence").
//
// This build produces no new numeric values and reclassifies nothing in the underlying local-54
// ledger -- it is a read-only reporting/ranking layer over already-governed closures.
import fs from 'node:fs';
import path from 'node:path';
import { REASON_CLASSIFICATIONS, SOURCE_FAMILY, VALID_CLASSIFICATIONS } from './reason-classifications.mjs';
import { rankOpportunities, selectTranche } from './portfolio-ranking.mjs';

const root = process.cwd();
const outDir = path.join(root, 'data/p40');
const AS_OF = process.env.KDA_P40_AS_OF || new Date().toISOString().slice(0, 10);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`P40_BUILD_FAIL ${message}`);
  process.exit(1);
}

// Real, live checks performed while building this portfolio (2026-09-22), not a claim inferred
// from the underlying evidence-state citations' own (older) check dates. Recorded verbatim as the
// closure gate's "evidence of access" for the selected tranche's two families, whatever the
// outcome -- including the negative results, which are exactly the kind of honest input the
// roadmap's own fallback rule expects P41 to act on.
const LIVE_VERIFICATION_LOG = [
  {
    checked_on: '2026-09-22',
    target: 'https://www.knbs.or.ke/reports_category/2024/ (KNBS 2024 report listing)',
    family: 'moe-2024-national-school-census',
    result: 'still_pending',
    detail: 'Live fetch of KNBS\'s 2024 reports category page lists 10 reports; no 2024 National School Census main report (only the January 2025 Pilot Report, already known, is published anywhere as of this check). Matches the 2026-09-18 evidence-state finding -- no change.'
  },
  {
    checked_on: '2026-09-22',
    target: 'https://kmhfr.health.go.ke/public/facilities',
    family: 'moh-kmhfr (considered, not selected into this tranche)',
    result: 'unreachable',
    detail: 'ECONNREFUSED. Consistent with every prior check (P24, P28A 2026-09-16, P31/P32 2026-09-18) -- persistently down, not a transient outage. Its only public mirror (HDX) is an August 2017 snapshot, independently re-confirmed stale in this session\'s own research and already known unusable to this project (no coordinates, predates the 2023 census).'
  },
  {
    checked_on: '2026-09-22',
    target: 'https://statistics.kilimo.go.ke (KilimoSTAT)',
    family: 'knbs-kilimostat-maize',
    result: 'unreachable',
    detail: 'TLS certificate expired. Matches the 2026-09-19 evidence-state finding -- no change. A live web search independently confirmed no Kenyan county government publishes a citable ward-level maize report as an alternative.'
  },
  {
    checked_on: '2026-09-22',
    target: 'https://nemis.education.go.ke',
    family: 'moe-2024-national-school-census (alternate avenue considered)',
    result: 'unreachable',
    detail: 'ECONNREFUSED, consistent with R057\'s own finding (TLS handshake failure; HTTP fallback is a credentialed login screen only). This is why the tranche relies on the pending census publication, not a NEMIS re-check, as its credible path.'
  },
  {
    checked_on: '2026-09-22',
    target: 'https://krb.go.ke/downloads/ (Kenya Roads Board)',
    family: 'krb-class-c-roads (not addressable; already_attempted_rejected)',
    result: 'confirms_no_bulk_gis_available',
    detail: 'Live fetch lists corporate/technical/planning documents only -- no downloadable GIS/shapefile/classified road-network dataset. Confirms this remains a dead end, consistent with the already-rejected P31 spatial-derivation attempt.'
  }
];

function main() {
  const reaudit = readJson('data/audit/local-54-reaudit-queue.json');
  const catalogue = readJson('data/completeness/local-54-reason-catalogue.json');
  const ledger = readJson('data/completeness/local-54-slot-ledger.json');

  const catalogueById = new Map(catalogue.reasons.map(r => [r.reason_id, r]));

  // Reconcile against the slot ledger directly -- this is the single source of truth for every
  // cell's disposition, not just the reaudit queue's own header count.
  const byStatus = {};
  for (const row of ledger.rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  const numericCells = ledger.rows.filter(r => r.value !== '').length;
  const totalCells = ledger.rows.length;
  const governedClosureCells = totalCells - numericCells;
  const notApplicableCells = byStatus.not_applicable || 0;
  const retiredReplacedCells = byStatus.retired_replaced || 0;
  const structuralExclusionCells = notApplicableCells + retiredReplacedCells;
  const addressableCellsFromLedger = governedClosureCells - structuralExclusionCells;

  const opportunities = [];
  let addressableCellsFromQueue = 0;
  for (const row of reaudit.rows) {
    const classification = REASON_CLASSIFICATIONS[row.reason_id];
    if (!classification) fail(`reason_id ${row.reason_id} in the reaudit queue has no P40 barrier classification`);
    if (!VALID_CLASSIFICATIONS.has(classification.classification)) {
      fail(`reason_id ${row.reason_id} has unknown classification "${classification.classification}"`);
    }
    const family = SOURCE_FAMILY[row.reason_id];
    if (!family) fail(`reason_id ${row.reason_id} has no source_family mapping`);
    const catalogueEntry = catalogueById.get(row.reason_id);
    if (!catalogueEntry) fail(`reason_id ${row.reason_id} not found in the reason catalogue`);

    addressableCellsFromQueue += row.cell_count;
    opportunities.push({
      reason_id: row.reason_id,
      indicator_codes: row.indicator_codes,
      levels: row.levels,
      cell_count: row.cell_count,
      source: row.source,
      source_url: catalogueEntry.source_url || null,
      refresh_trigger: row.refresh_trigger,
      classification: classification.classification,
      classification_basis: classification.basis,
      family
    });
  }

  if (addressableCellsFromQueue !== addressableCellsFromLedger) {
    fail(
      `addressable cell count mismatch: reaudit queue sums to ${addressableCellsFromQueue}, ` +
      `but slot-ledger governed_closure minus structural exclusions is ${addressableCellsFromLedger}`
    );
  }

  const ranked = rankOpportunities(opportunities);
  const { selected, families } = selectTranche(ranked, { maxGroups: 10, maxFamilies: 3 });
  const tranchCellTotal = selected.reduce((sum, r) => sum + r.cell_count, 0);

  const byClassification = {};
  for (const o of opportunities) byClassification[o.classification] = (byClassification[o.classification] || 0) + o.cell_count;

  const portfolio = {
    schema_version: 'kda.p40.opportunity-portfolio.v1',
    as_of: AS_OF,
    reconciliation: {
      total_local_54_cells: totalCells,
      numeric_cells: numericCells,
      governed_closure_cells: governedClosureCells,
      structural_exclusion_cells: structuralExclusionCells,
      addressable_cells: addressableCellsFromLedger,
      addressable_reason_groups: opportunities.length
    },
    cells_by_classification: byClassification,
    ranking_methodology: 'Primary key: barrier-classification feasibility tier (publication_pending=4 > access_technical=3 > boundary_vintage_mismatch=2 > regulatory_publication_scope=1 > already_attempted_rejected=non_submission=structural_permanent=0). Secondary key within a tier: cell_count descending (larger potential yield first). Tertiary key: reason_id ascending, for full determinism. See scripts/p40/reason-classifications.mjs for the classification of every reason group and scripts/p40/portfolio-ranking.mjs for the ranking/selection implementation.',
    opportunities: ranked
  };

  const structuralExclusion = {
    schema_version: 'kda.p40.structural-exclusion-ledger.v1',
    as_of: AS_OF,
    definition: 'The local-54 cells permanently excluded from the P40 addressable numeric-yield denominator: not_applicable (structurally inapplicable to that geography, e.g. an indicator defined only above ward level) and retired_replaced (superseded by a successor indicator). These are not "unavailable pending future evidence" -- no future source discovery would change their disposition.',
    not_applicable_cells: notApplicableCells,
    retired_replaced_cells: retiredReplacedCells,
    total_structural_exclusion_cells: structuralExclusionCells
  };

  const tranche = {
    schema_version: 'kda.p40.p41-tranche-contract.v1',
    as_of: AS_OF,
    frozen_baseline: {
      numeric_evidence_cells: numericCells,
      numeric_evidence_pct: Number(((numericCells / totalCells) * 100).toFixed(2))
    },
    caps: { max_source_families: 3, max_reason_groups: 10 },
    selected_source_families: families,
    selected_reason_groups: selected.map(r => r.reason_id),
    potential_cell_yield: tranchCellTotal,
    opportunities: selected,
    live_verification: LIVE_VERIFICATION_LOG,
    fallback_rule: "Per data/post-p35-closure-roadmap.json's P40/P41 programme rules: a data-yield tranche cannot close with zero numeric promotions. If live re-verification at P41 execution time finds every selected opportunity still blocked, this tranche must be revised and a replacement tranche selected from the next-ranked opportunities in data/p40/opportunity-portfolio.json rather than closing P41 empty."
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'opportunity-portfolio.json'), JSON.stringify(portfolio, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'structural-exclusion-ledger.json'), JSON.stringify(structuralExclusion, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'p41-tranche-contract.json'), JSON.stringify(tranche, null, 2) + '\n');

  console.log(
    `P40_PORTFOLIO_OK addressable=${addressableCellsFromLedger} structural_exclusion=${structuralExclusionCells} ` +
    `groups=${opportunities.length} tranche_groups=${selected.length} tranche_families=${families.length} tranche_cells=${tranchCellTotal}`
  );
}

main();
