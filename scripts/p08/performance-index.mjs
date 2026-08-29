// P08 — County Development & Performance Index research release.
//
// This is a research product, not a marketing score. Per the CountyIQ
// guardrails ("no composite score is published before methodology and
// robustness gates pass"), score_status stays 'research' throughout this
// phase — it can only move to 'published' once P09's historical gate
// passes, and P09 has not run yet.
//
// THE HONEST HEADLINE FINDING OF THIS PHASE: only 5 of the mart's 98
// indicators currently qualify for inclusion (see INDEX_INCLUSION below),
// concentrated in 4 domains (fiscal, living standards, education and economic). This is
// not a placeholder or an oversight — it is what the inclusion rule
// actually returns when applied honestly to the current registry, and it
// is disclosed as the primary limitation of this release rather than
// hidden by loosening the rule. Loosening it (allowing uncertainty-
// restricted survey indicators, or imputing missing counties) would
// violate two CountyIQ guardrails directly: "no missing county is
// silently imputed" and "survey estimates retain uncertainty
// requirements and ranking restrictions from the Atlas indicator
// registry."
import { DIRECTION_RULES } from '../p06/direction-rules.mjs';

const INDEX_METHODOLOGY_VERSION = 'P08-v1';
const WINSOR_LOW = 0.05, WINSOR_HIGH = 0.95;

// Inclusion rule (published, fixed): an indicator enters the composite
// only if (a) it has a published, non-null higher_is_better rule
// (scripts/p06/direction-rules.mjs) AND (b) P06 found it ranking-eligible
// — meaning comparable, A/B/C provenance, one shared period — for all 47
// counties with no exception. This is checked programmatically below,
// not hand-picked; the resulting list is what is reported.
function eligibleIndicatorCodes(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const [code, m] of Object.entries(row.metrics)) {
      if (!m.ranking?.eligible) continue;
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([code, n]) => n === rows.length && DIRECTION_RULES[code]?.higher_is_better != null).map(([code]) => code);
}

function percentile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function winsorizedMinMax(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const lo = percentile(sorted, WINSOR_LOW), hi = percentile(sorted, WINSOR_HIGH);
  const clip = v => Math.min(hi, Math.max(lo, v));
  const span = hi - lo || 1;
  return { normalize: v => Number((((clip(v) - lo) / span) * 100).toFixed(4)), lo, hi };
}
function pearson(a, b) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? null : Number((num / denom).toFixed(3));
}
function rankOf(value, all, higher_is_better) {
  const sorted = higher_is_better ? [...all].sort((a, b) => b - a) : [...all].sort((a, b) => a - b);
  return 1 + sorted.filter(v => (higher_is_better ? v > value : v < value)).length;
}

export function buildPerformanceIndex(rows, indicatorById) {
  const codes = eligibleIndicatorCodes(rows);
  const domainOf = code => rows[0].metrics[code].domain;
  const byDomain = new Map();
  for (const code of codes) { const d = domainOf(code); if (!byDomain.has(d)) byDomain.set(d, []); byDomain.get(d).push(code); }
  const domainsIncluded = [...byDomain.keys()];
  const allDomains = [...new Set(rows[0] ? Object.values(rows[0].metrics).map(m => m.domain) : [])];
  const domainsExcluded = allDomains.filter(d => !domainsIncluded.includes(d));

  // Normalizers built once from the national distribution of each
  // included indicator (winsorized min-max), oriented so 100 = best.
  const normalizers = new Map();
  for (const code of codes) {
    const hib = DIRECTION_RULES[code].higher_is_better;
    const values = rows.map(r => r.metrics[code].latest.value);
    const { normalize, lo, hi } = winsorizedMinMax(values);
    normalizers.set(code, { normalize: v => (hib ? normalize(v) : 100 - normalize(v)), lo, hi, hib });
  }

  // Three published weighting scenarios — this is the sensitivity test,
  // not a single "correct" weighting asserted without alternatives.
  const scenarios = {
    equal_domain: code => 1 / domainsIncluded.length / byDomain.get(domainOf(code)).length,
    equal_indicator: () => 1 / codes.length,
    fiscal_execution_only: code => (domainOf(code) === 'fiscal' ? 1 / byDomain.get('fiscal').length : 0)
  };
  const scenarioIds = Object.keys(scenarios).filter(id => id !== 'fiscal_execution_only' || byDomain.has('fiscal'));

  const scoresByScenario = {};
  for (const id of scenarioIds) {
    const weightOf = scenarios[id];
    scoresByScenario[id] = rows.map(row => {
      let score = 0, weightSum = 0;
      for (const code of codes) {
        const w = weightOf(code);
        if (!w) continue;
        score += w * normalizers.get(code).normalize(row.metrics[code].latest.value);
        weightSum += w;
      }
      return weightSum > 0 ? Number((score / weightSum).toFixed(2)) : null;
    });
  }
  const ranksByScenario = {};
  for (const id of scenarioIds) {
    const scores = scoresByScenario[id];
    ranksByScenario[id] = scores.map(s => (Number.isFinite(s) ? rankOf(s, scores.filter(Number.isFinite), true) : null));
  }

  // Correlation / multicollinearity review among included indicators.
  const correlations = [];
  for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) {
    const a = rows.map(r => r.metrics[codes[i]].latest.value), b = rows.map(r => r.metrics[codes[j]].latest.value);
    const r = pearson(a, b);
    correlations.push({ a: codes[i], b: codes[j], r, flagged_multicollinear: Math.abs(r) > 0.8 });
  }

  const methodology = {
    version: INDEX_METHODOLOGY_VERSION,
    status: 'research',
    label: 'Research/Beta — not a production score. Not yet cleared by the P09 historical-validation gate.',
    inclusion_rule: 'Indicator has a published, non-null higher_is_better rule AND is P06 ranking-eligible (comparable, A/B/C provenance, shared period) for all 47 counties, with zero exceptions.',
    indicators_included: codes,
    domains_included: domainsIncluded,
    domains_excluded: domainsExcluded,
    domain_exclusion_reason: 'No indicator in this domain currently satisfies the inclusion rule for all 47 counties (most are survey estimates the Atlas taxonomy withholds from ranking due to sampling uncertainty, or lack a defensible direction rule). This is disclosed, not resolved, by this release.',
    normalization: `Winsorized min-max per indicator: values are clipped to the [${WINSOR_LOW * 100}th, ${WINSOR_HIGH * 100}th] national percentile before scaling to 0–100, oriented so 100 is always the favourable end per the published direction rule.`,
    missing_data_policy: 'No imputation. An indicator not meeting the inclusion rule for all 47 counties is excluded from the index entirely rather than estimated for the counties that lack it.',
    outlier_policy: `Winsorization at the ${WINSOR_LOW * 100}th/${WINSOR_HIGH * 100}th percentile bounds extreme values' influence on the 0–100 scale without discarding the observation.`,
    weighting_scenarios: scenarioIds,
    weighting_disclosure: 'No single weighting is asserted as correct. Three scenarios are published and a county\'s rank-robustness band is the range across them, not a single scenario\'s result.',
    correlation_review: correlations,
    honest_limitation: `This index currently reflects only ${domainsIncluded.join(', ')} performance (${codes.length} indicators). It is NOT a comprehensive county-development index and must not be described as one — ${domainsExcluded.length} domains (${domainsExcluded.join(', ')}) contribute nothing because no indicator in them yet meets the inclusion rule.`
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ranks = scenarioIds.map(id => ranksByScenario[id][i]).filter(Number.isFinite);
    row.performanceIndex = {
      methodology_version: INDEX_METHODOLOGY_VERSION,
      status: 'research',
      scenarios: Object.fromEntries(scenarioIds.map(id => [id, { score: scoresByScenario[id][i], rank: ranksByScenario[id][i] }])),
      rank_robustness: ranks.length ? { min_rank: Math.min(...ranks), max_rank: Math.max(...ranks), range: Math.max(...ranks) - Math.min(...ranks), eligible_count: rows.length } : null,
      indicators_used: codes
    };
  }

  return methodology;
}

export { INDEX_METHODOLOGY_VERSION };
