// P06 — Published direction and composite-eligibility rules.
//
// This file is the single, versioned source of truth for two questions that
// the P02 mart schema left null for every indicator:
//   1. higher_is_better  — does a larger value represent a better outcome?
//   2. composite_eligible — may this indicator feed a domain score / the
//      P08 composite index at all?
//
// Ground rule applied throughout (kept consistent with the P03 fiscal
// denominator policy already in this repo, which withholds per-capita
// measures rather than approximate them): an indicator is marked
// composite_eligible ONLY if a directional "better/worse" reading is
// substantively defensible AND the value is genuinely comparable across
// counties (normalized, not a raw level, not a national figure applied
// uniformly to every county, not an identity/name field).
//
// higher_is_better === null means "no directional claim is made." Those
// indicators may still be shown with a purely positional rank/percentile
// in P06 (e.g. "4th highest of 47"), but never characterized as good or
// bad, and they are excluded from every composite score.
//
// Categories excluded from directional interpretation, with reasons:
//   - identity fields (MP/MCA name)                    -> not numeric
//   - raw counts/levels without a population/area denominator
//     (budget totals, GCP level, facility counts, road km, land area,
//     population, registered voters)                    -> not comparable
//     across counties of very different size; see fiscal.denominators
//     policy already encoded in scripts/countyiq/build-mart.mjs
//   - national-level figures surfaced at county rows (CBR, T-bill,
//     USD/KES, national GDP/inflation/FDI/remittances, WB internet-use,
//     WB renewable-electricity, WB freshwater-withdrawal, homicide rate,
//     women-in-parliament) -> identical for every county, a "rank" would
//     be meaningless
//   - genuinely contested or ambiguous direction (household size,
//     disability prevalence, social-protection beneficiary counts,
//     home/owner-occupied housing tenure, population growth, net
//     migration, CO2 per capita, hospital-bed utilisation, NG-CDF /
//     ward-fund allocation amounts, turnout, drought bulletin status)
//     -> a higher or lower value is not straightforwardly a better
//     outcome, or the "better" reading is itself a value judgement this
//     project should not assert
//
// Every entry lists a one-line basis so the rule is auditable, per the
// CountyIQ guardrail that every recognition/ranking be reproducible from
// a published rule rather than an implicit judgement call.
export const DIRECTION_RULES = {
  // Demography / Social
  'IND-LITERACY-RATE': { higher_is_better: true, basis: 'Literacy is a direct, uncontested development outcome.' },
  'IND-HOUSING-MATERIAL': { higher_is_better: true, basis: 'Permanent wall/roof material is a standard housing-quality proxy.' },
  'IND-EXAM-PERFORMANCE': { higher_is_better: true, basis: 'Mean KCPE/KCSE score is a direct learning-outcome measure.' },
  'IND-SCHOOL-ATTENDANCE-RATE': { higher_is_better: true, basis: 'Attendance is a direct access-to-education outcome.' },
  'IND-LIFE-EXPECTANCY': { higher_is_better: true, basis: 'Standard health-outcome convention.' },
  'IND-HUMAN-CAPITAL-INDEX': { higher_is_better: true, basis: 'World Bank index is constructed higher-is-better by design.' },
  'IND-POVERTY-RATE-INTL': { higher_is_better: false, basis: 'Standard poverty-headcount convention.' },
  'IND-GINI-WB': { higher_is_better: false, basis: 'Standard inequality convention; lower Gini reflects more even distribution.' },

  // Economy
  'IND-CPI-INFLATION': { higher_is_better: false, basis: 'Already set upstream; higher inflation erodes purchasing power.' },
  'IND-FUEL-PETROL': { higher_is_better: false, basis: 'Already set upstream; higher pump price is a cost burden.' },
  'IND-BUSINESS-LICENSES': { higher_is_better: true, basis: 'More licensed business activity is a standard local-economy signal.' },
  'IND-MOBILE-MONEY-VOLUME': { higher_is_better: true, basis: 'Higher formal financial-service usage is a standard inclusion proxy.' },
  'IND-RENT-BURDEN': { higher_is_better: false, basis: 'Higher rent-to-expenditure share is a standard affordability-stress measure.' },
  'IND-LABOUR-FORCE-PARTICIPATION': { higher_is_better: true, basis: 'Standard labour-market convention.' },

  // Environment
  'IND-FOREST-AREA': { higher_is_better: true, basis: 'Standard environmental-resource convention.' },
  'IND-SAFE-SANITATION': { higher_is_better: true, basis: 'Direct WASH access outcome.' },

  // Health
  'IND-HIV-PREVALENCE': { higher_is_better: false, basis: 'Standard epidemiological convention.' },
  'IND-FACILITY-INFRASTRUCTURE': { higher_is_better: true, basis: 'Facilities with power/water is a direct service-readiness measure.' },
  'IND-HOME-BIRTH-RATE': { higher_is_better: false, basis: 'Facility delivery is the safer-birth benchmark in Kenyan maternal-health policy.' },
  'IND-CONTRACEPTIVE-USE': { higher_is_better: true, basis: 'Standard reproductive-health-access convention.' },
  'IND-SUBSTANCE-ABUSE-PREVALENCE': { higher_is_better: false, basis: 'Standard public-health convention.' },

  // Infrastructure
  'IND-ELECTRICITY-ACCESS-WB': { higher_is_better: true, basis: 'Direct access outcome.' },
  'IND-ELECTRICITY-ACCESS': { higher_is_better: true, basis: 'Direct access outcome.' },
  'IND-WATER-ACCESS': { higher_is_better: true, basis: 'Direct access outcome.' },
  'IND-HEALTH-FACILITY-DENSITY': { higher_is_better: true, basis: 'Already population-normalized (per 10,000), unlike the raw facility count.' },
  'IND-VEHICLE-REGISTRATIONS': { higher_is_better: true, basis: 'Field is defined as a per-capita count, so it is comparable across counties.' },

  // Institutions
  'IND-STATISTICAL-PERFORMANCE': { higher_is_better: true, basis: 'World Bank SPI is constructed higher-is-better by design.' },

  // Public Finance — the P10 delivery-layer measures
  'IND-COUNTY-BUDGET-ABSORPTION': { higher_is_better: true, basis: 'Already set upstream; higher absorption reflects delivery capacity.' },
  'IND-COUNTY-DEVELOPMENT-ABSORPTION': { higher_is_better: true, basis: 'Already set upstream; higher absorption reflects delivery capacity.' },
  'IND-COUNTY-OSR': { higher_is_better: true, basis: 'Own-source revenue performance vs. target is a direct, government-controlled fiscal-management measure.' },
  'IND-COUNTY-PENDING-BILLS': { higher_is_better: false, basis: 'Higher pending bills is a standard fiscal-indiscipline signal (PFM Act reporting).' },

  // Representation
  'IND-NG-CDF-UTILIZATION': { higher_is_better: true, basis: 'Utilization rate is an execution/delivery measure, analogous to budget absorption.' },

  // Resilience
  'IND-FOOD-SECURITY-PHASE': { higher_is_better: false, basis: 'IPC phase is ordinal; a lower phase number is the more food-secure state.' }
};

// IND-COUNTY-AUDIT-OPINION is categorical (unqualified/qualified/adverse/
// disclaimer), not a magnitude, so it is handled by its own ordinal map in
// P10 rather than a boolean direction here.
export const AUDIT_OPINION_ORDER = ['unqualified', 'qualified', 'adverse', 'disclaimer'];

export function directionFor(indicatorCode) {
  return DIRECTION_RULES[indicatorCode]?.higher_is_better ?? null;
}
export function compositeEligible(indicatorCode) {
  return DIRECTION_RULES[indicatorCode]?.higher_is_better !== undefined && DIRECTION_RULES[indicatorCode]?.higher_is_better !== null;
}
