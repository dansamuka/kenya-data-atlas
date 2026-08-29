// P10 — County government fiscal delivery and accountability layer.
//
// This is intentionally narrower than broad county development outcomes.
// The score uses only directly government-linked public-finance measures
// observed on a coherent FY2024/25 reference period. Wage-ceiling and
// audit-opinion evidence are published alongside the score as categorical
// accountability signals, but are not converted into arbitrary numeric
// points.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DELIVERY_METHODOLOGY_VERSION = 'P10-v2';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_PATH = 'data/countyiq/source/p10-fiscal-accountability-2024-25.json';
const ABSORPTION_CODES = ['IND-COUNTY-BUDGET-ABSORPTION', 'IND-COUNTY-DEVELOPMENT-ABSORPTION'];
const PILLAR_WEIGHTS = { execution: 1 / 3, revenue_mobilisation: 1 / 3, arrears_control: 1 / 3 };

function sourceData() {
  return JSON.parse(fs.readFileSync(path.join(root, SOURCE_PATH), 'utf8'));
}
function percentile(sorted, q) {
  const idx = (sorted.length - 1) * q, lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function winsorizedMinMax(values, { inverse = false } = {}) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return { normalize: () => null, low: null, high: null };
  const low = percentile(clean, 0.05), high = percentile(clean, 0.95), span = (high - low) || 1;
  return {
    low: Number(low.toFixed(4)),
    high: Number(high.toFixed(4)),
    normalize(value) {
      if (!Number.isFinite(value)) return null;
      const clipped = Math.min(high, Math.max(low, value));
      const scaled = ((clipped - low) / span) * 100;
      return Number((inverse ? 100 - scaled : scaled).toFixed(2));
    }
  };
}
function rankOf(value, all) {
  if (!Number.isFinite(value)) return null;
  return 1 + all.filter(v => Number.isFinite(v) && v > value).length;
}
function round2(v) { return Number.isFinite(v) ? Number(v.toFixed(2)) : null; }

export function buildDeliveryLayer(rows) {
  const src = sourceData();
  const countySource = src.counties || {};
  const latestFY = src.reference_fiscal_year;

  const overall = rows.map(r => r.fiscal.history.find(h => h.fiscal_year === latestFY)?.overall_absorption?.value ?? null);
  const development = rows.map(r => r.fiscal.history.find(h => h.fiscal_year === latestFY)?.development_absorption?.value ?? null);
  const osrCapped = rows.map(r => {
    const raw = countySource[r.geography.geo_code]?.osr_target_attainment_pct;
    return Number.isFinite(raw) ? Math.min(100, raw) : null;
  });
  const pending = rows.map(r => countySource[r.geography.geo_code]?.pending_bills_pct_budget ?? null);

  const normOverall = winsorizedMinMax(overall);
  const normDevelopment = winsorizedMinMax(development);
  const normOsr = winsorizedMinMax(osrCapped);
  const normPending = winsorizedMinMax(pending, { inverse: true });

  const provisional = rows.map((row, i) => {
    const geo = row.geography.geo_code;
    const s = countySource[geo] || {};
    const latest = row.fiscal.history.find(h => h.fiscal_year === latestFY);
    const executionOverall = normOverall.normalize(overall[i]);
    const executionDevelopment = normDevelopment.normalize(development[i]);
    const execution = Number.isFinite(executionOverall) && Number.isFinite(executionDevelopment)
      ? round2((executionOverall + executionDevelopment) / 2) : null;
    const revenue = normOsr.normalize(osrCapped[i]);
    const arrears = normPending.normalize(pending[i]);
    const complete = [execution, revenue, arrears].every(Number.isFinite);
    const score = complete ? round2(execution * PILLAR_WEIGHTS.execution + revenue * PILLAR_WEIGHTS.revenue_mobilisation + arrears * PILLAR_WEIGHTS.arrears_control) : null;
    const wageCompliant = src.wage_compliance.compliant_geo_codes.includes(geo);
    const exactQualified = src.audit_context_2023_24.exact_qualified_geo_codes_from_indexed_appendix_extract.includes(geo);

    return {
      geo,
      score,
      complete,
      record: {
        methodology_version: DELIVERY_METHODOLOGY_VERSION,
        status: complete ? 'published' : 'published_incomplete',
        score,
        rank: null,
        eligible_count: null,
        reference_fiscal_year: latestFY,
        score_scope: 'fiscal_delivery_only',
        source_urls: {
          treasury_brop: src.sources.treasury_brop.source_url,
          oag_summary: src.sources.oag_summary.source_url,
          pfm_regulations: src.sources.pfm_regulations.source_url
        },
        pillars: {
          execution: {
            score: execution,
            weight: PILLAR_WEIGHTS.execution,
            measures: {
              overall_absorption_pct: latest?.overall_absorption?.value ?? null,
              development_absorption_pct: latest?.development_absorption?.value ?? null,
              overall_normalized: executionOverall,
              development_normalized: executionDevelopment
            }
          },
          revenue_mobilisation: {
            score: revenue,
            weight: PILLAR_WEIGHTS.revenue_mobilisation,
            measures: {
              osr_target_attainment_pct: s.osr_target_attainment_pct ?? null,
              scoring_value_capped_at_100_pct: osrCapped[i],
              cap_policy: 'Attainment above 100% is displayed as reported but capped at 100% for scoring so counties are not rewarded for target under-setting or target overshoot beyond full attainment.'
            }
          },
          arrears_control: {
            score: arrears,
            weight: PILLAR_WEIGHTS.arrears_control,
            measures: {
              pending_bills_pct_budget: s.pending_bills_pct_budget ?? null,
              data_status: Number.isFinite(s.pending_bills_pct_budget) ? 'reported' : (s.pending_bills_status || 'missing'),
              direction: 'lower_is_better'
            }
          }
        },
        accountability_signals: {
          wage_ceiling: {
            period: latestFY,
            statutory_ceiling_pct_of_total_revenue: src.wage_compliance.ceiling_pct,
            compliant: wageCompliant,
            exact_ratio_pct_if_explicitly_reported: s.wage_ratio_pct ?? null,
            scored: false,
            source_url: src.sources.pfm_regulations.source_url
          },
          audit_opinion: {
            period: src.sources.oag_summary.period.replace(/^FY\s*/i, ''),
            unqualified: false,
            exact_opinion_if_verified: exactQualified ? 'Qualified' : null,
            exact_opinion_status: exactQualified ? 'verified_from_indexed_appendix_extract' : 'modified_opinion_exact_class_not_extracted',
            scored: false,
            source_url: src.sources.oag_summary.source_url
          }
        },
        missing_data: complete ? [] : [
          !Number.isFinite(execution) ? 'execution' : null,
          !Number.isFinite(revenue) ? 'revenue_mobilisation' : null,
          !Number.isFinite(arrears) ? 'arrears_control' : null
        ].filter(Boolean),
        imputation_used: false,
        attribution_note: 'This is a county-government fiscal delivery score for a stated fiscal year. It is not a personal governor score and does not claim that one office-holder caused the observed result.'
      }
    };
  });

  const eligibleScores = provisional.map(x => x.score).filter(Number.isFinite);
  for (const item of provisional) {
    item.record.eligible_count = eligibleScores.length;
    item.record.rank = rankOf(item.score, eligibleScores);
    const row = rows.find(r => r.geography.geo_code === item.geo);
    row.deliveryLayer = item.record;
  }

  return {
    version: DELIVERY_METHODOLOGY_VERSION,
    publication_status: 'published',
    title: 'County Fiscal Delivery & Accountability',
    scope: 'A narrow public-finance construct using only directly government-linked FY2024/25 measures: budget execution, own-source-revenue target attainment and pending-bills burden. Broad social/economic outcomes are excluded from the score.',
    reference_fiscal_year: latestFY,
    source_fixture: SOURCE_PATH,
    sources: src.sources,
    measures_active: [
      { id: 'overall_absorption_pct', registry_indicator: ABSORPTION_CODES[0], pillar: 'execution' },
      { id: 'development_absorption_pct', registry_indicator: ABSORPTION_CODES[1], pillar: 'execution' },
      { id: 'osr_target_attainment_pct', source_table: 'National Treasury 2025 BROP Table 8 / Annex Table 7', pillar: 'revenue_mobilisation' },
      { id: 'pending_bills_pct_budget', source_table: 'National Treasury 2025 BROP Table 10', pillar: 'arrears_control' }
    ],
    pillars_scored: [
      { id: 'execution', weight: PILLAR_WEIGHTS.execution, construction: 'Mean of normalized overall and development budget absorption.' },
      { id: 'revenue_mobilisation', weight: PILLAR_WEIGHTS.revenue_mobilisation, construction: 'Normalized OSR target attainment, with scoring input capped at 100% while the published raw attainment remains visible.' },
      { id: 'arrears_control', weight: PILLAR_WEIGHTS.arrears_control, construction: 'Inverse-normalized pending bills as a share of approved budget; lower burden is better.' }
    ],
    accountability_signals_not_scored: [
      { id: 'wage_ceiling_compliance', reason: 'Published as statutory compliance/non-compliance. The final source does not provide a consistently extracted exact ratio for every county, and a binary legal-compliance flag is not treated as an arbitrary cardinal score.' },
      { id: 'audit_opinion', reason: 'Published as audit context. Modified audit-opinion categories are not given arbitrary numeric distances, and exact classes are only shown where verified from the indexed OAG appendix extract.' }
    ],
    weighting: 'Equal one-third weight across execution, revenue mobilisation and arrears control. The two absorption measures are averaged inside the execution pillar so fiscal execution is not double-counted.',
    normalization: 'Winsorized min-max at the 5th/95th percentile within the FY2024/25 county distribution. Pending-bills burden is direction-reversed after normalization. No imputation.',
    osr_cap_policy: 'Raw OSR attainment above 100% remains visible, but the scoring input is capped at 100% to avoid rewarding target under-setting or overshoot beyond complete target attainment.',
    missing_data_policy: 'No imputation. A county missing any scored pillar receives no overall delivery score or rank but retains all available pillar/accountability evidence. Narok is withheld from the composite because the final published pending-bills table records no submitted value.',
    eligible_count: eligibleScores.length,
    incomplete_geo_codes: provisional.filter(x => !x.complete).map(x => x.geo),
    wage_ceiling_context: src.wage_compliance,
    audit_context: src.audit_context_2023_24,
    attribution_guardrail: 'The layer evaluates a county government fiscal record for a specified period. It does not assign broad county outcomes to a governor and does not convert the score into a claim of personal causation.'
  };
}

export { DELIVERY_METHODOLOGY_VERSION, SOURCE_PATH, PILLAR_WEIGHTS };
