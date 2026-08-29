// P11 — Administration-period scorecards and evidence-based CountyIQ
// Recognition.
//
// The publication subject is an election-cycle administration period,
// not a named politician. That permits useful temporal comparison while
// preserving the core attribution guardrail: association with an
// administration period is not evidence of personal causation.
const RECOGNITION_METHODOLOGY_VERSION = 'P11-v2';
const ADMIN_CYCLE = {
  id: 'county-administration-cycle-2022',
  subject: 'county_administration_period',
  election_date: '2022-08-09',
  expected_next_general_election_date: '2027-08-10',
  election_source_name: 'Independent Electoral and Boundaries Commission — 2022 General Election',
  election_source_url: 'https://www.iebc.or.ke/uploads/resources/eoCHxhumTD.pdf',
  constitutional_basis: 'Constitution of Kenya, Article 180(1): county governors are elected on the same day as a general election, on the second Tuesday in August every fifth year.',
  constitutional_source_url: 'https://new.kenyalaw.org/akn/ke/act/2010/constitution/eng@2022-12-31#art_180',
  baseline_fiscal_year: '2021/22',
  transition_fiscal_year: '2022/23',
  first_full_cycle_fiscal_year: '2023/24',
  latest_full_cycle_fiscal_year: '2024/25',
  transition_treatment: 'FY2022/23 straddles the August 2022 election and administrative transition, so it is shown as context but excluded from baseline-to-current change calculations.'
};

const RECOGNITION_RULES = [
  {
    id: 'current-fiscal-delivery-leaders',
    label: 'Current fiscal delivery leaders',
    entry_type: 'ranking',
    field: 'deliveryLayer.score',
    direction: 'higher_is_better',
    eligible: 'Counties with complete P10 FY2024/25 scores only.',
    formula: 'P10 County Fiscal Delivery & Accountability score for FY2024/25.',
    tie_rule: 'Top five positions by score; all counties tied at the fifth-place score are included.'
  },
  {
    id: 'most-improved-overall-absorption',
    label: 'Most improved overall budget absorption this administration cycle',
    entry_type: 'ranking',
    field: 'overall_absorption',
    direction: 'higher_is_better',
    eligible: 'All counties with FY2021/22 baseline and FY2024/25 latest values.',
    formula: 'overall_absorption[FY2024/25] − overall_absorption[FY2021/22]. FY2022/23 is excluded as a transition year.',
    tie_rule: 'Top five positions by percentage-point improvement; all counties tied at the fifth-place value are included.'
  },
  {
    id: 'most-improved-development-absorption',
    label: 'Most improved development absorption this administration cycle',
    entry_type: 'ranking',
    field: 'development_absorption',
    direction: 'higher_is_better',
    eligible: 'All counties with FY2021/22 baseline and FY2024/25 latest values.',
    formula: 'development_absorption[FY2024/25] − development_absorption[FY2021/22]. FY2022/23 is excluded as a transition year.',
    tie_rule: 'Top five positions by percentage-point improvement; all counties tied at the fifth-place value are included.'
  },
  {
    id: 'osr-target-attainment-leaders',
    label: 'Own-source-revenue target attainment leaders',
    entry_type: 'ranking',
    field: 'deliveryLayer.pillars.revenue_mobilisation.measures.osr_target_attainment_pct',
    direction: 'higher_is_better',
    eligible: 'Counties with a published FY2024/25 OSR target-attainment value.',
    formula: 'Published FY2024/25 OSR collected ÷ county OSR target × 100. Recognition uses the reported raw attainment; the P10 score itself caps this input at 100%.',
    tie_rule: 'Top five positions by reported attainment; all counties tied at the fifth-place value are included.'
  },
  {
    id: 'lowest-pending-bills-burden',
    label: 'Lowest pending-bills burden',
    entry_type: 'ranking',
    field: 'deliveryLayer.pillars.arrears_control.measures.pending_bills_pct_budget',
    direction: 'lower_is_better',
    eligible: 'Counties with a submitted FY2024/25 pending-bills value.',
    formula: 'Published pending bills ÷ approved FY2024/25 county budget × 100.',
    tie_rule: 'Top five positions with the lowest burden; all counties tied at the fifth-place value are included. Missing/non-submitted values are not ranked.'
  },
  {
    id: 'wage-ceiling-compliance',
    label: 'Wage-ceiling compliance',
    entry_type: 'qualification',
    field: 'deliveryLayer.accountability_signals.wage_ceiling.compliant',
    direction: 'qualifies_if_true',
    eligible: 'All counties, using the final FY2024/25 published compliance statement.',
    formula: 'County qualifies when personnel emoluments are at or below the statutory 35% of total county revenue ceiling.',
    tie_rule: 'No ranking. Every compliant county is shown equally.'
  }
];

function fiscalValue(row, fy, key) {
  return row.fiscal.history.find(h => h.fiscal_year === fy)?.[key]?.value ?? null;
}
function round3(v) { return Number.isFinite(v) ? Number(v.toFixed(3)) : null; }
function rankList(items, direction, topN = 5) {
  const sorted = items.slice().sort((a, b) => direction === 'lower_is_better' ? a.value - b.value : b.value - a.value);
  if (!sorted.length) return { ranked: [], cutoff: null };
  const cutoff = sorted[Math.min(topN, sorted.length) - 1].value;
  let last = null, rank = 0, seen = 0;
  const ranked = sorted.map(item => {
    seen++;
    if (last === null || item.value !== last) rank = seen;
    last = item.value;
    return { ...item, rank };
  });
  const top = ranked.filter(x => direction === 'lower_is_better' ? x.value <= cutoff : x.value >= cutoff);
  return { ranked, top, cutoff };
}

export function buildRecognition(rows) {
  const periods = rows.map(row => {
    const baselineOverall = fiscalValue(row, ADMIN_CYCLE.baseline_fiscal_year, 'overall_absorption');
    const latestOverall = fiscalValue(row, ADMIN_CYCLE.latest_full_cycle_fiscal_year, 'overall_absorption');
    const transitionOverall = fiscalValue(row, ADMIN_CYCLE.transition_fiscal_year, 'overall_absorption');
    const firstFullOverall = fiscalValue(row, ADMIN_CYCLE.first_full_cycle_fiscal_year, 'overall_absorption');
    const baselineDev = fiscalValue(row, ADMIN_CYCLE.baseline_fiscal_year, 'development_absorption');
    const latestDev = fiscalValue(row, ADMIN_CYCLE.latest_full_cycle_fiscal_year, 'development_absorption');
    const transitionDev = fiscalValue(row, ADMIN_CYCLE.transition_fiscal_year, 'development_absorption');
    const firstFullDev = fiscalValue(row, ADMIN_CYCLE.first_full_cycle_fiscal_year, 'development_absorption');
    const delivery = row.deliveryLayer;
    const p10Complete = Number.isFinite(delivery?.score);

    const record = {
      county_geo_code: row.geography.geo_code,
      county_name: row.geography.name,
      administration_cycle_id: ADMIN_CYCLE.id,
      subject: 'county_administration_period',
      office_holder_name: null,
      person_attribution: false,
      election_date: ADMIN_CYCLE.election_date,
      baseline_fiscal_year: ADMIN_CYCLE.baseline_fiscal_year,
      transition_fiscal_year: ADMIN_CYCLE.transition_fiscal_year,
      first_full_cycle_fiscal_year: ADMIN_CYCLE.first_full_cycle_fiscal_year,
      latest_full_cycle_fiscal_year: ADMIN_CYCLE.latest_full_cycle_fiscal_year,
      fiscal_changes: {
        overall_absorption_pp: {
          baseline: baselineOverall,
          transition_context: transitionOverall,
          first_full_cycle: firstFullOverall,
          latest: latestOverall,
          baseline_to_latest_change: Number.isFinite(baselineOverall) && Number.isFinite(latestOverall) ? round3(latestOverall - baselineOverall) : null
        },
        development_absorption_pp: {
          baseline: baselineDev,
          transition_context: transitionDev,
          first_full_cycle: firstFullDev,
          latest: latestDev,
          baseline_to_latest_change: Number.isFinite(baselineDev) && Number.isFinite(latestDev) ? round3(latestDev - baselineDev) : null
        }
      },
      current_fiscal_accountability: {
        p10_score: delivery?.score ?? null,
        p10_rank: delivery?.rank ?? null,
        p10_eligible_count: delivery?.eligible_count ?? null,
        osr_target_attainment_pct: delivery?.pillars?.revenue_mobilisation?.measures?.osr_target_attainment_pct ?? null,
        pending_bills_pct_budget: delivery?.pillars?.arrears_control?.measures?.pending_bills_pct_budget ?? null,
        wage_ceiling_compliant: delivery?.accountability_signals?.wage_ceiling?.compliant ?? null,
        audit_unqualified: delivery?.accountability_signals?.audit_opinion?.unqualified ?? null,
        audit_exact_opinion_if_verified: delivery?.accountability_signals?.audit_opinion?.exact_opinion_if_verified ?? null
      },
      data_status: p10Complete ? 'published' : 'published_incomplete',
      attribution_caution: 'This record associates fiscal outcomes with an election-cycle administration period only. It does not claim that a named governor personally caused the changes; outcomes also reflect county assemblies, public servants, inherited obligations, national transfers, macroeconomic conditions and other factors.'
    };
    row.administrationScorecard = record;
    return record;
  });

  const bucket = new Map(RECOGNITION_RULES.map(r => [r.id, []]));
  for (const row of rows) {
    const a = row.administrationScorecard;
    if (Number.isFinite(row.deliveryLayer?.score)) bucket.get('current-fiscal-delivery-leaders').push({ county: row.geography.name, geo_code: row.geography.geo_code, value: row.deliveryLayer.score, period: ADMIN_CYCLE.latest_full_cycle_fiscal_year, unit: 'score_0_100' });
    const overallChange = a.fiscal_changes.overall_absorption_pp.baseline_to_latest_change;
    const devChange = a.fiscal_changes.development_absorption_pp.baseline_to_latest_change;
    if (Number.isFinite(overallChange)) bucket.get('most-improved-overall-absorption').push({ county: row.geography.name, geo_code: row.geography.geo_code, value: overallChange, period: `${ADMIN_CYCLE.baseline_fiscal_year}→${ADMIN_CYCLE.latest_full_cycle_fiscal_year}`, unit: 'percentage_points' });
    if (Number.isFinite(devChange)) bucket.get('most-improved-development-absorption').push({ county: row.geography.name, geo_code: row.geography.geo_code, value: devChange, period: `${ADMIN_CYCLE.baseline_fiscal_year}→${ADMIN_CYCLE.latest_full_cycle_fiscal_year}`, unit: 'percentage_points' });
    const osr = row.deliveryLayer?.pillars?.revenue_mobilisation?.measures?.osr_target_attainment_pct;
    if (Number.isFinite(osr)) bucket.get('osr-target-attainment-leaders').push({ county: row.geography.name, geo_code: row.geography.geo_code, value: osr, period: ADMIN_CYCLE.latest_full_cycle_fiscal_year, unit: 'percent' });
    const pending = row.deliveryLayer?.pillars?.arrears_control?.measures?.pending_bills_pct_budget;
    if (Number.isFinite(pending)) bucket.get('lowest-pending-bills-burden').push({ county: row.geography.name, geo_code: row.geography.geo_code, value: pending, period: ADMIN_CYCLE.latest_full_cycle_fiscal_year, unit: 'percent_of_approved_budget' });
    if (row.deliveryLayer?.accountability_signals?.wage_ceiling?.compliant === true) bucket.get('wage-ceiling-compliance').push({ county: row.geography.name, geo_code: row.geography.geo_code, value: 1, period: ADMIN_CYCLE.latest_full_cycle_fiscal_year, unit: 'compliant', rank: null });
  }

  const recognitions = RECOGNITION_RULES.map(rule => {
    const items = bucket.get(rule.id);
    if (rule.entry_type === 'qualification') {
      return { ...rule, eligible_count: rows.length, qualifying_count: items.length, top: items.map(x => ({ ...x, rank: null })) };
    }
    const { ranked, top } = rankList(items, rule.direction, 5);
    return { ...rule, eligible_count: items.length, top, ranking_count: ranked.length };
  });

  for (const row of rows) {
    row.recognition = {
      methodology_version: RECOGNITION_METHODOLOGY_VERSION,
      subject_level: 'county_administration_period',
      person_attribution: false,
      entries: recognitions.map(r => {
        const hit = r.top.find(t => t.geo_code === row.geography.geo_code);
        return { id: r.id, label: r.label, entry_type: r.entry_type, qualifies: Boolean(hit), rank: hit?.rank ?? null, value: hit?.value ?? null, unit: hit?.unit ?? null };
      })
    };
  }

  return {
    version: RECOGNITION_METHODOLOGY_VERSION,
    publication_status: 'published',
    subject: 'county_administration_period',
    person_attribution: false,
    attribution_statement: 'Administration-period presentation is a temporal comparison, not a personal causal score. No named governor is scored or credited/blamed for broad county outcomes.',
    performance_index_excluded: 'The P08/P09 development snapshot is excluded from administration recognition because P09 has not cleared it for longitudinal composite movement. P11 recognition uses only P10 fiscal/accountability evidence and directly observed fiscal change.',
    administration_periods: {
      status: 'published',
      cycle_definition: ADMIN_CYCLE,
      records: periods,
      record_count: periods.length
    },
    transition_year_policy: ADMIN_CYCLE.transition_treatment,
    recognition_rules_published: RECOGNITION_RULES,
    county_recognition: recognitions,
    source_visibility: {
      election_cycle: [ADMIN_CYCLE.election_source_url, ADMIN_CYCLE.constitutional_source_url],
      fiscal_accountability: 'See mart.meta.delivery_layer_methodology.sources and each county.deliveryLayer accountability signal.'
    }
  };
}

export { RECOGNITION_METHODOLOGY_VERSION, ADMIN_CYCLE, RECOGNITION_RULES };
