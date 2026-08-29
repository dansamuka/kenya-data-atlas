// P07 — Development Gap Calculator and evidence narrative engine.
//
// Everything here is a template filled from numbers already computed in
// P06 (rank/percentile/median/trend) or the P03 fiscal block. Nothing is
// free-composed: every sentence a user sees can be reconstructed from the
// statistics displayed alongside it, and every gap states its own
// formula, benchmark, period and denominator, per the P07 acceptance
// gates.
import { directionFor } from '../p06/direction-rules.mjs';

const NARRATIVE_METHODOLOGY_VERSION = 'P07-v1';
const STRENGTH_PEER_PERCENTILE = 75;
const WEAKNESS_PEER_PERCENTILE = 25;

function unitSuffix(unitCode) {
  if (unitCode === 'percent') return '%';
  return unitCode ? ` ${unitCode}` : '';
}
function fmt(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value) >= 1000 ? value.toLocaleString('en-KE', { maximumFractionDigits: 0 }) : Number(value.toFixed(2)).toString();
}
function ordinal(n) {
  const r = Math.round(n), mod100 = r % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${r}th`;
  return `${r}${{ 1: 'st', 2: 'nd', 3: 'rd' }[r % 10] || 'th'}`;
}

// Benchmark selection rule (published, fixed): prefer the peer-group
// (population-quartile) median when this county has an eligible peer
// comparison; fall back to the national median only when the peer figure
// is unavailable. The choice actually used is always recorded per gap.
function benchmarkFor(ranking) {
  if (ranking?.peer_group && Number.isFinite(ranking.peer_group.peer_median)) {
    return { source: 'peer_group', value: ranking.peer_group.peer_median, label: `peer-group (tier ${ranking.peer_group.tier}) median` };
  }
  if (Number.isFinite(ranking?.national_median)) {
    return { source: 'national', value: ranking.national_median, label: 'national median' };
  }
  return null;
}

function gapFor(code, name, metric, unitCode) {
  const ranking = metric.ranking;
  if (!ranking?.eligible || ranking.higher_is_better === null) return null;
  const benchmark = benchmarkFor(ranking);
  if (!benchmark) return null;
  const value = metric.latest.value;
  const rawGap = value - benchmark.value;
  const favourable = ranking.higher_is_better ? rawGap >= 0 : rawGap <= 0;
  return {
    indicator_code: code,
    indicator_name: name,
    formula: `county_value − ${benchmark.source}_median`,
    benchmark_source: benchmark.source,
    benchmark_selection_rule: 'peer-group (population-quartile) median preferred; national median used only if no peer median is available',
    period: metric.latest.period_label,
    unit_code: unitCode,
    denominator: metric.latest.transformation === 'level' ? 'none (level indicator)' : metric.latest.transformation,
    county_value: value,
    benchmark_value: benchmark.value,
    gap: Number(rawGap.toFixed(4)),
    higher_is_better: ranking.higher_is_better,
    favourable_to_county: favourable,
    source_url: metric.latest.provenance.source_url
  };
}

// The one place a gap is translated into money: overall budget absorption
// is expenditure/budget, so a percentage-point gap times the actual total
// budget is a real, formula-transparent KES figure. Development absorption
// is NOT converted to money here — this mart has no active development-
// budget denominator distinct from the total budget (the same reason the
// P03 fiscal block already withholds per-capita measures), so a KES
// figure for the development-only gap would not be a real number, only a
// plausible-looking one. That is exactly the "unsupported monetary
// opportunity claim" P07 must not produce. The computation itself lives
// inline in buildGapsAndNarrative, where the fiscal panel is in scope.

export function buildGapsAndNarrative(rows, indicatorById) {
  const byCode = new Map();
  for (const row of rows) for (const [code, m] of Object.entries(row.metrics)) { if (!byCode.has(code)) byCode.set(code, []); byCode.get(code).push({ county: row.county, m }); }

  for (const row of rows) {
    const gaps = [];
    for (const [code, metric] of Object.entries(row.metrics)) {
      const indicator = indicatorById.get(metric.indicator_id);
      const g = gapFor(code, metric.name, metric, metric.latest?.unit_code);
      if (g) gaps.push(g);
    }

    // Monetary counterfactual for overall absorption, computed directly
    // from this county's own 12-year fiscal panel rather than the
    // percentile engine, because it needs the absolute budget figure.
    const fiscalLatest = row.fiscal?.history?.at(-1);
    const overallGap = gaps.find(g => g.indicator_code === 'IND-COUNTY-BUDGET-ABSORPTION');
    let moneyGap = null;
    if (fiscalLatest && overallGap && Number.isFinite(fiscalLatest.budget?.value)) {
      const rateGapPoints = overallGap.gap; // county - benchmark, in percentage points
      const additionalKesMillion = Number((-rateGapPoints / 100 * fiscalLatest.budget.value).toFixed(2));
      moneyGap = {
        indicator_code: 'IND-COUNTY-BUDGET-ABSORPTION',
        formula: '(benchmark_absorption_rate − county_absorption_rate) × county_total_budget',
        benchmark_source: overallGap.benchmark_source,
        period: fiscalLatest.fiscal_year,
        denominator: `${fiscalLatest.fiscal_year} approved total budget`,
        county_rate_pct: overallGap.county_value,
        benchmark_rate_pct: overallGap.benchmark_value,
        county_budget_kes_million: fiscalLatest.budget.value,
        additional_development_spending_kes_million: additionalKesMillion,
        interpretation: additionalKesMillion > 0 ? 'Approved budget that would have been executed at the benchmark absorption rate, and was not.' : 'County already executes at or above the benchmark rate; no gap.',
        source_url: fiscalLatest.budget.provenance?.source_url || null
      };
    }

    // Domain strengths/weaknesses: template sentences from peer
    // percentile only, never free composition.
    const domainStrengths = {}, domainWeaknesses = {};
    for (const g of gaps) {
      const indicator = indicatorById.get(row.metrics[g.indicator_code].indicator_id);
      const domain = row.metrics[g.indicator_code].domain;
      const ranking = row.metrics[g.indicator_code].ranking;
      const peerPct = ranking.peer_group?.percentile ?? ranking.percentile;
      const sentence = strengthSentence(g, ranking);
      if (g.favourable_to_county && peerPct >= STRENGTH_PEER_PERCENTILE) {
        (domainStrengths[domain] ||= []).push(sentence);
      } else if (!g.favourable_to_county && peerPct <= WEAKNESS_PEER_PERCENTILE) {
        (domainWeaknesses[domain] ||= []).push(sentence);
      }
    }
    for (const domain of Object.keys(row.domains)) {
      row.domains[domain].strengths = (domainStrengths[domain] || []).slice(0, 3);
      row.domains[domain].weaknesses = (domainWeaknesses[domain] || []).slice(0, 3);
    }

    // "What changed" — template sentences straight from P06 trend fields.
    const changed = [];
    for (const [code, metric] of Object.entries(row.metrics)) {
      if (!metric.trend?.eligible || !Number.isFinite(metric.trend.one_period_change) || metric.trend.one_period_change === 0) continue;
      if (!['improving', 'worsening'].includes(metric.trend.direction)) continue; // no evaluative "changed" narrative for non-directional metrics
      changed.push(changeSentence(metric));
    }

    row.gaps = {
      methodology_version: NARRATIVE_METHODOLOGY_VERSION,
      benchmark_selection_rule: 'peer-group (population-quartile) median preferred; national median used only if no peer median is available; recorded per gap',
      items: gaps,
      monetary_counterfactual: moneyGap
    };
    row.narrative = {
      methodology_version: NARRATIVE_METHODOLOGY_VERSION,
      reproducible_from: 'P06 ranking/trend fields and the P03 fiscal panel only; no free-form text.',
      working_well: Object.values(domainStrengths).flat().slice(0, 5),
      needs_attention: Object.values(domainWeaknesses).flat().slice(0, 5),
      what_changed: changed.slice(0, 5)
    };
  }
}

function strengthSentence(g, ranking) {
  const dir = g.county_value > g.benchmark_value ? 'higher' : g.county_value < g.benchmark_value ? 'lower' : 'equal to';
  const peer = ranking.peer_group ? `peer-group (tier ${ranking.peer_group.tier})` : 'national';
  const pct = ranking.peer_group?.percentile ?? ranking.percentile;
  return `${g.indicator_name}: ${fmt(g.county_value)}${unitSuffix(g.unit_code)} in ${g.period}, ${ordinal(pct)} percentile within the ${peer} — ${dir} than the ${g.benchmark_source} median of ${fmt(g.benchmark_value)}${unitSuffix(g.unit_code)}.`;
}
function changeUnitSuffix(unitCode) {
  if (unitCode === 'percent') return ' percentage points'; // a change in a rate is pp, not %, to avoid relative/absolute ambiguity
  return unitSuffix(unitCode);
}
function changeSentence(metric) {
  const t = metric.trend, verb = t.direction === 'improving' ? 'improved' : 'worsened';
  return `${metric.name} ${verb} by ${fmt(Math.abs(t.one_period_change))}${changeUnitSuffix(metric.latest.unit_code)} as of ${metric.latest.period_label} (was ${fmt(metric.latest.value - t.one_period_change)}${unitSuffix(metric.latest.unit_code)}, now ${fmt(metric.latest.value)}${unitSuffix(metric.latest.unit_code)}).`;
}

export { NARRATIVE_METHODOLOGY_VERSION };
