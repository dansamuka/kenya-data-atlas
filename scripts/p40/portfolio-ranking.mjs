// P40 -- pure ranking and tranche-selection logic over the opportunity portfolio (no I/O).
import { CLASSIFICATION_FEASIBILITY_TIER } from './reason-classifications.mjs';

// Ranks opportunities by feasibility tier first (a publication_pending census beats a structural
// survey-domain ceiling regardless of cell count), then by potential yield (cell_count) within the
// same tier, then by reason_id for a fully deterministic tie-break.
export function rankOpportunities(rows) {
  const ranked = [...rows].sort((a, b) => {
    const tierDiff = CLASSIFICATION_FEASIBILITY_TIER[b.classification] - CLASSIFICATION_FEASIBILITY_TIER[a.classification];
    if (tierDiff !== 0) return tierDiff;
    const cellDiff = b.cell_count - a.cell_count;
    if (cellDiff !== 0) return cellDiff;
    return a.reason_id.localeCompare(b.reason_id);
  });
  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}

// Selects the first P41 tranche from an already-ranked list, walking down in rank order and
// admitting a reason group only if it fits within BOTH caps at once -- never partially admits a
// source family's groups out of rank order, and never exceeds either cap.
export function selectTranche(rankedRows, { maxGroups = 10, maxFamilies = 3 } = {}) {
  const selected = [];
  const families = new Set();
  for (const row of rankedRows) {
    const wouldAddFamily = !families.has(row.family) && families.size + 1 > maxFamilies;
    if (selected.length >= maxGroups) break;
    if (wouldAddFamily) continue;
    selected.push(row);
    families.add(row.family);
  }
  return { selected, families: [...families] };
}
