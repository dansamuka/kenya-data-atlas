// P06 — Peer groups, percentiles and trend intelligence.
//
// Two things this module deliberately does NOT do, per the P06 acceptance
// gates and the CountyIQ guardrails:
//   - it never implies that being in a given peer group is itself good or
//     bad (peer_group tier is a population-size fact, not a verdict)
//   - it never asserts a "better/worse" direction for an indicator whose
//     higher_is_better rule (see ./direction-rules.mjs) is null; those
//     indicators still get a rank/percentile (purely positional), but
//     trend.direction stays purely descriptive ("rising"/"falling"/
//     "flat") instead of "improving"/"worsening".
import { directionFor } from './direction-rules.mjs';

const POPULATION_CODE = 'IND-POPULATION';
const PEER_METHODOLOGY_VERSION = 'P06-v1';

function stdev(values) {
  const a = values.filter(Number.isFinite);
  if (a.length < 2) return null;
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  return Number(Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length).toFixed(4));
}
function median(values) {
  const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function positionalStats(value, allValues) {
  const valid = allValues.filter(Number.isFinite);
  if (!Number.isFinite(value) || valid.length === 0) return null;
  const rank = 1 + valid.filter(v => v > value).length;
  const tiedBelowOrEqual = valid.filter(v => v <= value).length;
  const percentile = Number(((tiedBelowOrEqual / valid.length) * 100).toFixed(1));
  const med = median(valid);
  return { rank, eligible_count: valid.length, percentile, national_median: med, distance_from_median: Number.isFinite(med) ? Number((value - med).toFixed(4)) : null };
}

// Peer groups are population-size quartiles computed directly from the
// already-ingested, sourced IND-POPULATION series. This is the only axis
// used deliberately: it is 100% reproducible from a single published
// input already in the registry, and a population-size band is a
// descriptive fact, not a development judgement. (An ASAL/non-ASAL axis
// was considered and set aside for this release because no single
// current, authoritative, unambiguous county-by-county ASAL list could
// be confirmed against official sources at implementation time — see
// docs/countyiq/P06-PEER-INTELLIGENCE.md. Missing an authoritative input
// is treated as a reason to omit the axis, not to approximate it.)
export function assignPeerGroups(rows) {
  const pops = rows.map(r => ({ id: r.county.geography_id, code: r.county.geo_code, value: r.metrics[POPULATION_CODE]?.latest?.value ?? null }));
  const known = pops.filter(p => Number.isFinite(p.value));
  if (known.length !== rows.length) {
    throw new Error(`P06 peer grouping requires ${POPULATION_CODE} for all ${rows.length} counties, found ${known.length}`);
  }
  const sorted = known.slice().sort((a, b) => a.value - b.value);
  const q = n => sorted[Math.min(sorted.length - 1, Math.floor((n / 4) * sorted.length))].value;
  const cuts = [q(1), q(2), q(3)];
  const tierOf = v => (v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
  const tierLabel = { 1: 'Q1 — smallest population quartile', 2: 'Q2', 3: 'Q3', 4: 'Q4 — largest population quartile' };
  const byId = new Map(known.map(p => [p.id, { tier: tierOf(p.value), population: p.value }]));
  const definition = {
    version: PEER_METHODOLOGY_VERSION,
    method: 'population_quartile',
    basis_indicator: POPULATION_CODE,
    basis_period: rows[0]?.metrics?.[POPULATION_CODE]?.latest?.period_label ?? null,
    cut_points: cuts,
    reproducible_from: 'Sorted 2019 census county population, split into four equal-count bands.',
    disclaimer: 'Peer-group membership is a population-size classification only. It carries no implication about development performance or data quality.'
  };
  return { byId, definition, tierLabel };
}

export function computeRankingAndTrend(rows, indicatorById, peerGroups) {
  const byCode = new Map();
  for (const row of rows) {
    for (const [code, metric] of Object.entries(row.metrics)) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push({ county: row.county, metric });
    }
  }

  for (const [code, entries] of byCode) {
    const allLatestValues = entries.map(e => (typeof e.metric.latest?.value === 'number' ? e.metric.latest.value : null));
    const hib = directionFor(code);

    for (const entry of entries) {
      const { metric, county } = entry;
      if (!metric.eligibility.ranking_allowed) continue; // leave P02-computed ineligibility untouched
      const value = metric.latest?.value;
      const national = positionalStats(value, allLatestValues);
      if (!national) continue;

      const peerInfo = peerGroups.byId.get(county.geography_id);
      const peerEntries = entries.filter(e => peerGroups.byId.get(e.county.geography_id)?.tier === peerInfo?.tier);
      const peerValues = peerEntries.map(e => e.metric.latest?.value ?? null);
      const peer = positionalStats(value, peerValues);

      metric.ranking = {
        eligible: true,
        rank: national.rank,
        eligible_count: national.eligible_count,
        percentile: national.percentile,
        national_median: national.national_median,
        distance_from_median: national.distance_from_median,
        period_key: metric.ranking?.period_key ?? metric.latest?.period_label ?? null,
        coverage_pct: metric.ranking?.coverage_pct ?? null,
        higher_is_better: hib,
        peer_group: peer ? { tier: peerInfo.tier, rank: peer.rank, eligible_count: peer.eligible_count, percentile: peer.percentile, peer_median: peer.national_median, distance_from_peer_median: peer.distance_from_median } : null
      };

      // Trend: direction/volatility computed from the metric's own active
      // history; national/peer matched-change compares this county's
      // change to how the national and peer medians moved over the same
      // two periods (never a different, mismatched period).
      const numericHistory = (metric.history || []).filter(o => typeof o.value === 'number' && Number.isFinite(o.value));
      const t = metric.trend || {};
      if (numericHistory.length >= 2) {
        const last = numericHistory.at(-1), prev = numericHistory.at(-2), first = numericHistory[0];
        const changes = numericHistory.slice(1).map((o, i) => o.value - numericHistory[i].value);
        t.one_period_change = Number((last.value - prev.value).toFixed(4));
        t.medium_term_change = Number((last.value - first.value).toFixed(4));
        t.medium_term_years = numericHistory.length > 1 ? Number(((new Date(last.period_end || last.period_start).getFullYear()) - (new Date(first.period_end || first.period_start).getFullYear())) || null) : null;
        t.volatility = stdev(changes);
        t.break_in_series = numericHistory.some(o => o.provenance?.badge && numericHistory[0].provenance?.badge && o.provenance.badge !== numericHistory[0].provenance.badge);
        if (hib === null) {
          t.direction = t.one_period_change > 0 ? 'rising' : t.one_period_change < 0 ? 'falling' : 'flat';
        } else {
          const improved = hib ? t.one_period_change > 0 : t.one_period_change < 0;
          t.direction = t.one_period_change === 0 ? 'stable' : improved ? 'improving' : 'worsening';
        }
      } else {
        t.direction = t.direction || 'not_classified';
      }
      metric.trend = { eligible: numericHistory.length >= 2, one_period_change: t.one_period_change ?? null, medium_term_change: t.medium_term_change ?? null, medium_term_years: t.medium_term_years ?? null, national_matched_change: null, peer_matched_change: null, direction: t.direction, volatility: t.volatility ?? null, break_in_series: t.break_in_series ?? false };
    }

    // National / peer matched change: how the median itself moved,
    // computed only over periods common to every county's active history.
    for (const entry of entries) {
      const trend = entry.metric.trend;
      if (!trend?.eligible) continue;
      const periodsForThis = (entry.metric.history || []).map(o => o.period_label);
      const lastPeriod = periodsForThis.at(-1), prevPeriod = periodsForThis.at(-2);
      const nationalAt = pl => median(entries.map(e => (e.metric.history || []).find(o => o.period_label === pl)?.value).filter(v => typeof v === 'number'));
      const nLast = nationalAt(lastPeriod), nPrev = nationalAt(prevPeriod);
      trend.national_matched_change = Number.isFinite(nLast) && Number.isFinite(nPrev) ? Number((nLast - nPrev).toFixed(4)) : null;
      const peerInfo = peerGroups.byId.get(entry.county.geography_id);
      const peerEntries = entries.filter(e => peerGroups.byId.get(e.county.geography_id)?.tier === peerInfo?.tier);
      const peerAt = pl => median(peerEntries.map(e => (e.metric.history || []).find(o => o.period_label === pl)?.value).filter(v => typeof v === 'number'));
      const pLast = peerAt(lastPeriod), pPrev = peerAt(prevPeriod);
      trend.peer_matched_change = Number.isFinite(pLast) && Number.isFinite(pPrev) ? Number((pLast - pPrev).toFixed(4)) : null;
    }
  }
}

export function benchmarksFor(county, peerGroups, tierLabel) {
  const info = peerGroups.byId.get(county.geography_id);
  return {
    national: { methodology_version: PEER_METHODOLOGY_VERSION },
    peer_group: info ? { tier: info.tier, tier_label: tierLabel[info.tier], definition_version: peerGroups.definition.version } : null
  };
}

export { PEER_METHODOLOGY_VERSION };
