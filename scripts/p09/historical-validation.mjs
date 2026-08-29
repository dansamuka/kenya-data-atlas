// P09 — Historical validation and publication-scope decision.
//
// P08 produces a cross-sectional composite from the latest comparable
// observations. P09 deliberately asks two different questions:
//   1. Is the latest cross-sectional snapshot robust enough to publish?
//   2. Is there enough comparable history to publish longitudinal
//      composite movement as if it were a stable time series?
//
// These are not the same claim. A current snapshot can be robust to
// plausible weighting choices even when several inputs are single-period
// observations and therefore cannot support a historical composite.
const RELEASE_DECISION_VERSION = 'P09-v2';
const BACKTESTABLE_CODES = ['IND-COUNTY-BUDGET-ABSORPTION', 'IND-COUNTY-DEVELOPMENT-ABSORPTION'];
const PLAUSIBLE_FULL_COMPOSITE_SCENARIOS = ['equal_domain', 'equal_indicator'];
const STRESS_SCENARIO = 'fiscal_execution_only';
const SNAPSHOT_BANDS = [
  { band: 1, label: 'Top 20%', max_share: 0.20 },
  { band: 2, label: 'Upper-middle 20%', max_share: 0.40 },
  { band: 3, label: 'Middle 20%', max_share: 0.60 },
  { band: 4, label: 'Lower-middle 20%', max_share: 0.80 },
  { band: 5, label: 'Bottom 20%', max_share: 1.00 }
];

function spearman(rankA, rankB) {
  const n = rankA.length;
  const d2 = rankA.reduce((s, r, i) => s + (r - rankB[i]) ** 2, 0);
  return Number((1 - (6 * d2) / (n * (n ** 2 - 1))).toFixed(3));
}
function rankVector(values) {
  const sorted = values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const ranks = new Array(values.length);
  sorted.forEach(([, i], pos) => { ranks[i] = pos + 1; });
  return ranks;
}
function bandForRank(rank, eligibleCount) {
  if (!Number.isFinite(rank) || !Number.isFinite(eligibleCount) || eligibleCount <= 0) return null;
  const share = rank / eligibleCount;
  return SNAPSHOT_BANDS.find(b => share <= b.max_share + Number.EPSILON) || SNAPSHOT_BANDS.at(-1);
}
function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function buildHistoricalValidation(rows, performanceIndexMethodology) {
  const included = performanceIndexMethodology.indicators_included || [];
  const untestable = included.filter(c => !BACKTESTABLE_CODES.includes(c));
  const availableBacktestCodes = BACKTESTABLE_CODES.filter(c => included.includes(c));

  // Historical fiscal sub-index. Each year is normalized only against
  // that year's cross-county distribution so future values never leak
  // into an earlier year's rank.
  const years = rows[0]?.fiscal?.history?.map(h => h.fiscal_year) || [];
  const yearScores = years.map((fy, yi) => {
    const overall = rows.map(r => r.fiscal.history[yi].overall_absorption.value);
    const dev = rows.map(r => r.fiscal.history[yi].development_absorption.value);
    const norm = arr => {
      const lo = Math.min(...arr), hi = Math.max(...arr), span = (hi - lo) || 1;
      return arr.map(v => ((v - lo) / span) * 100);
    };
    const no = norm(overall), nd = norm(dev);
    return rows.map((_, i) => Number(((no[i] + nd[i]) / 2).toFixed(2)));
  });
  const yearRanks = yearScores.map(rankVector);
  const consecutivePairs = [];
  for (let y = 1; y < yearRanks.length; y++) {
    consecutivePairs.push({
      from: years[y - 1],
      to: years[y],
      spearman: spearman(yearRanks[y - 1], yearRanks[y]),
      mean_abs_rank_change: Number((mean(yearRanks[y].map((r, i) => Math.abs(r - yearRanks[y - 1][i]))) || 0).toFixed(2))
    });
  }
  const avgSpearman = Number((mean(consecutivePairs.map(p => p.spearman)) || 0).toFixed(3));
  const avgMeanAbsRankChange = Number((mean(consecutivePairs.map(p => p.mean_abs_rank_change)) || 0).toFixed(2));

  // Snapshot robustness is evaluated only across plausible *full*
  // composite weighting choices. The fiscal-only scenario intentionally
  // drops whole domains and is retained as an extreme stress test; using
  // it as a publication gate would answer a different question.
  const plausible = PLAUSIBLE_FULL_COMPOSITE_SCENARIOS.filter(id => performanceIndexMethodology.weighting_scenarios?.includes(id));
  const stressAvailable = performanceIndexMethodology.weighting_scenarios?.includes(STRESS_SCENARIO);
  let sameBand = 0, sameOrAdjacentBand = 0;
  const plausibleRankRanges = [], stressRankRanges = [];

  for (const row of rows) {
    const plausibleRanks = plausible.map(id => row.performanceIndex.scenarios?.[id]?.rank).filter(Number.isFinite);
    const plausibleBands = plausibleRanks.map(r => bandForRank(r, rows.length)?.band).filter(Number.isFinite);
    const minRank = plausibleRanks.length ? Math.min(...plausibleRanks) : null;
    const maxRank = plausibleRanks.length ? Math.max(...plausibleRanks) : null;
    const minBand = plausibleBands.length ? Math.min(...plausibleBands) : null;
    const maxBand = plausibleBands.length ? Math.max(...plausibleBands) : null;
    if (plausibleBands.length && minBand === maxBand) sameBand++;
    if (plausibleBands.length && maxBand - minBand <= 1) sameOrAdjacentBand++;
    if (Number.isFinite(minRank) && Number.isFinite(maxRank)) plausibleRankRanges.push(maxRank - minRank);

    const allRanks = [...plausibleRanks];
    if (stressAvailable && Number.isFinite(row.performanceIndex.scenarios?.[STRESS_SCENARIO]?.rank)) allRanks.push(row.performanceIndex.scenarios[STRESS_SCENARIO].rank);
    if (allRanks.length) stressRankRanges.push(Math.max(...allRanks) - Math.min(...allRanks));

    const primary = row.performanceIndex.scenarios?.equal_domain || row.performanceIndex.scenarios?.equal_indicator || null;
    const primaryBand = primary ? bandForRank(primary.rank, rows.length) : null;
    row.performanceIndex.snapshot = primary ? {
      status: 'published_snapshot',
      score: primary.score,
      score_scale: '0–100',
      primary_weighting: row.performanceIndex.scenarios?.equal_domain ? 'equal_domain' : 'equal_indicator',
      relative_position_band: primaryBand?.band || null,
      relative_position_label: primaryBand?.label || null,
      exact_rank_status: 'diagnostic_only',
      primary_exact_rank_diagnostic: primary.rank,
      plausible_weighting_rank_range: Number.isFinite(minRank) ? { min_rank: minRank, max_rank: maxRank, range: maxRank - minRank } : null,
      plausible_weighting_band_range: Number.isFinite(minBand) ? { min_band: minBand, max_band: maxBand, width: maxBand - minBand } : null,
      robustness: Number.isFinite(minBand) ? (minBand === maxBand ? 'same_band' : (maxBand - minBand <= 1 ? 'adjacent_band' : 'material_band_shift')) : 'not_testable',
      longitudinal_change_status: 'withheld'
    } : null;
  }

  const plausibleAdjacentShare = rows.length ? sameOrAdjacentBand / rows.length : 0;
  const snapshotReasons = [];
  if (plausible.length < 2) snapshotReasons.push('Fewer than two plausible full-composite weighting scenarios are available for a meaningful sensitivity test.');
  if (plausibleAdjacentShare < 0.85) snapshotReasons.push(`Only ${(plausibleAdjacentShare * 100).toFixed(0)}% of counties stay in the same or an adjacent relative-position band across plausible full-composite weighting scenarios; the publication threshold is 85%.`);
  const snapshotDecision = snapshotReasons.length ? 'no-go' : 'go';

  const longitudinalReasons = [];
  if (untestable.length) longitudinalReasons.push(`${untestable.length} of ${included.length} included indicators (${untestable.join(', ')}) have only one comparable observed period, so a historical composite cannot be reconstructed without inventing history.`);
  if (avgSpearman < 0.8) longitudinalReasons.push(`The historically observable fiscal-execution sub-index has average consecutive-year Spearman rank correlation ${avgSpearman}, below the pre-declared 0.80 stability threshold; year-to-year ordering is too mobile to support a strong longitudinal composite claim.`);
  const longitudinalDecision = longitudinalReasons.length ? 'no-go' : 'go';

  const plausibleRange20 = plausibleRankRanges.filter(x => x >= 20).length;
  const stressRange20 = stressRankRanges.filter(x => x >= 20).length;

  return {
    version: RELEASE_DECISION_VERSION,
    release_scope: snapshotDecision === 'go' ? 'snapshot_only' : 'research_only',
    resulting_status: snapshotDecision === 'go' ? 'published_snapshot' : 'research',
    publication_statement: snapshotDecision === 'go'
      ? 'GO for the latest cross-sectional snapshot as a 0–100 score plus broad relative-position band. Exact rank remains diagnostic only. NO-GO for longitudinal composite movement until currently single-period inputs acquire comparable history and the historical stability gate is met.'
      : 'NO-GO for public composite publication; retain Research/Beta until the snapshot robustness gate is met.',
    snapshot_release: {
      decision: snapshotDecision,
      decision_rule: 'GO when at least two plausible full-composite weighting scenarios are available and at least 85% of counties remain in the same or an adjacent 20-percentage-point relative-position band across those scenarios.',
      reasons_if_no_go: snapshotReasons,
      primary_weighting: 'equal_domain',
      plausible_weighting_scenarios: plausible,
      stress_scenario_excluded_from_gate: stressAvailable ? STRESS_SCENARIO : null,
      stress_scenario_reason: 'The fiscal-only scenario deliberately removes non-fiscal domains. It is an extreme specification stress test, not an alternative full-composite weighting, so it is disclosed separately rather than allowed to determine the snapshot publication gate.',
      bands: SNAPSHOT_BANDS.map(({ band, label }) => ({ band, label })),
      counties_same_band: sameBand,
      counties_same_or_adjacent_band: sameOrAdjacentBand,
      same_or_adjacent_share: Number(plausibleAdjacentShare.toFixed(3)),
      average_plausible_rank_range: Number((mean(plausibleRankRanges) || 0).toFixed(1)),
      counties_with_plausible_rank_range_20_or_more: plausibleRange20,
      total_counties: rows.length,
      exact_rank_publication: 'diagnostic_only'
    },
    longitudinal_release: {
      decision: longitudinalDecision,
      decision_rule: 'GO only when every included indicator has at least two comparable observed periods and the historically reconstructable sub-index has average consecutive-year Spearman rank correlation of at least 0.80.',
      reasons_if_no_go: longitudinalReasons,
      historical_backtest: {
        indicators_backtested: availableBacktestCodes,
        indicators_not_backtestable: untestable,
        years_covered: years,
        consecutive_year_pairs: consecutivePairs,
        average_spearman_rank_correlation: avgSpearman,
        average_mean_absolute_rank_change: avgMeanAbsRankChange,
        interpretation: avgSpearman >= 0.8
          ? 'The reconstructable historical sub-index meets the stated stability threshold.'
          : 'The reconstructable historical sub-index shows material year-to-year rank movement; this is evidence against publishing a strong longitudinal composite claim.'
      }
    },
    extreme_stress_test: {
      scenario: stressAvailable ? STRESS_SCENARIO : null,
      average_rank_range_when_included: Number((mean(stressRankRanges) || 0).toFixed(1)),
      counties_with_rank_range_20_or_more_when_included: stressRange20,
      total_counties: rows.length
    },
    next_review_trigger: 'Re-run the longitudinal gate when rent burden, school attendance and labour-force participation each have at least two methodologically comparable county observations; re-run the snapshot gate whenever the indicator set, direction rules, normalization or weighting scenarios change.'
  };
}

export { RELEASE_DECISION_VERSION, PLAUSIBLE_FULL_COMPOSITE_SCENARIOS, SNAPSHOT_BANDS };
