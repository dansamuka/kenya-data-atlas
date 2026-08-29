// P12 — Canonical indicator policy layer.
//
// This module is the single executable policy surface for indicator semantics
// used across the Atlas. Builders may add dynamic evidence checks (coverage,
// common periods, provenance, actual history), but they must not redefine the
// static policy questions here: domain, direction, composite eligibility,
// ranking mode, uncertainty requirement, trend permission, parent-value
// inheritance, publication state, or cross-level normalisation rules.

export const INDICATOR_POLICY_VERSION = 'P12-policy-v1';
export const DOMAIN_ORDER = ['economic','fiscal','health','education','living','infrastructure','governance'];
export const DOMAIN_TARGETS = {economic:8,fiscal:8,health:8,education:6,living:7,infrastructure:6,governance:4};

export const DIRECTION_RULES = {
  'IND-LITERACY-RATE': { higher_is_better: true, basis: 'Literacy is a direct, uncontested development outcome.' },
  'IND-HOUSING-MATERIAL': { higher_is_better: true, basis: 'Permanent wall/roof material is a standard housing-quality proxy.' },
  'IND-EXAM-PERFORMANCE': { higher_is_better: true, basis: 'Mean KCPE/KCSE score is a direct learning-outcome measure.' },
  'IND-SCHOOL-ATTENDANCE-RATE': { higher_is_better: true, basis: 'Attendance is a direct access-to-education outcome.' },
  'IND-LIFE-EXPECTANCY': { higher_is_better: true, basis: 'Standard health-outcome convention.' },
  'IND-HUMAN-CAPITAL-INDEX': { higher_is_better: true, basis: 'World Bank index is constructed higher-is-better by design.' },
  'IND-POVERTY-RATE-INTL': { higher_is_better: false, basis: 'Standard poverty-headcount convention.' },
  'IND-GINI-WB': { higher_is_better: false, basis: 'Standard inequality convention; lower Gini reflects more even distribution.' },
  'IND-CPI-INFLATION': { higher_is_better: false, basis: 'Higher inflation erodes purchasing power.' },
  'IND-FUEL-PETROL': { higher_is_better: false, basis: 'Higher pump price is a cost burden.' },
  'IND-BUSINESS-LICENSES': { higher_is_better: true, basis: 'More licensed business activity is a standard local-economy signal.' },
  'IND-MOBILE-MONEY-VOLUME': { higher_is_better: true, basis: 'Higher formal financial-service usage is a standard inclusion proxy.' },
  'IND-RENT-BURDEN': { higher_is_better: false, basis: 'Higher rent-to-expenditure share is a standard affordability-stress measure.' },
  'IND-LABOUR-FORCE-PARTICIPATION': { higher_is_better: true, basis: 'Standard labour-market convention.' },
  'IND-FOREST-AREA': { higher_is_better: true, basis: 'Standard environmental-resource convention.' },
  'IND-SAFE-SANITATION': { higher_is_better: true, basis: 'Direct WASH access outcome.' },
  'IND-HIV-PREVALENCE': { higher_is_better: false, basis: 'Standard epidemiological convention.' },
  'IND-FACILITY-INFRASTRUCTURE': { higher_is_better: true, basis: 'Facilities with power/water is a direct service-readiness measure.' },
  'IND-HOME-BIRTH-RATE': { higher_is_better: false, basis: 'Facility delivery is the safer-birth benchmark in Kenyan maternal-health policy.' },
  'IND-CONTRACEPTIVE-USE': { higher_is_better: true, basis: 'Standard reproductive-health-access convention.' },
  'IND-SUBSTANCE-ABUSE-PREVALENCE': { higher_is_better: false, basis: 'Standard public-health convention.' },
  'IND-ELECTRICITY-ACCESS-WB': { higher_is_better: true, basis: 'Direct access outcome.' },
  'IND-ELECTRICITY-ACCESS': { higher_is_better: true, basis: 'Direct access outcome.' },
  'IND-WATER-ACCESS': { higher_is_better: true, basis: 'Direct access outcome.' },
  'IND-HEALTH-FACILITY-DENSITY': { higher_is_better: true, basis: 'Population-normalized facility availability.' },
  'IND-VEHICLE-REGISTRATIONS': { higher_is_better: true, basis: 'Field is defined as a per-capita count and is county-comparable.' },
  'IND-STATISTICAL-PERFORMANCE': { higher_is_better: true, basis: 'World Bank SPI is constructed higher-is-better by design.' },
  'IND-COUNTY-BUDGET-ABSORPTION': { higher_is_better: true, basis: 'Higher absorption reflects budget execution capacity.' },
  'IND-COUNTY-DEVELOPMENT-ABSORPTION': { higher_is_better: true, basis: 'Higher development absorption reflects execution capacity.' },
  'IND-COUNTY-OSR': { higher_is_better: true, basis: 'Own-source revenue performance versus target is a direct fiscal-management measure.' },
  'IND-COUNTY-PENDING-BILLS': { higher_is_better: false, basis: 'Higher pending-bills burden is a fiscal-management weakness.' },
  'IND-NG-CDF-UTILIZATION': { higher_is_better: true, basis: 'Utilization rate is an execution measure.' },
  'IND-FOOD-SECURITY-PHASE': { higher_is_better: false, basis: 'Lower IPC phase is the more food-secure state.' }
};

export const AUDIT_OPINION_ORDER = ['unqualified', 'qualified', 'adverse', 'disclaimer'];

// Explicit overrides protect known terms from substring/metadata ambiguity.
export const DOMAIN_OVERRIDES = {
  'IND-GCP-CURRENT': 'economic',
  'IND-RENT-BURDEN': 'living',
  'IND-SCHOOL-ATTENDANCE-RATE': 'education',
  'IND-LABOUR-FORCE-PARTICIPATION': 'economic',
  'IND-REGISTERED-VOTERS': 'governance'
};

export function domainForIndicator(indicator) {
  const code = indicator?.indicator_code || '';
  if (DOMAIN_OVERRIDES[code]) return DOMAIN_OVERRIDES[code];
  const text = [indicator?.topic, indicator?.subtopic, indicator?.tab, indicator?.name].filter(Boolean).join(' ').toLowerCase();
  if (/education|school|learning/.test(text)) return 'education';
  if (/health|hiv|stunting|immun|birth|pregnan|facility/.test(text)) return 'health';
  if (/rent|household expenditure/.test(text)) return 'living';
  if (/public finance|fiscal|budget|revenue|expenditure|absorption|pending bill|audit|wage/.test(text)) return 'fiscal';
  if (/representation|election|governance|voter|administration/.test(text)) return 'governance';
  if (/infrastructure|digital|electric|energy|road|water|internet|resilience|environment|land area/.test(text)) return 'infrastructure';
  if (/demograph|housing|population|poverty|living|rent|household/.test(text)) return 'living';
  return 'economic';
}

export function directionFor(indicatorCode) {
  return DIRECTION_RULES[indicatorCode]?.higher_is_better ?? null;
}

export function compositeEligible(indicatorCode) {
  return directionFor(indicatorCode) !== null;
}

export function publicationStatusFor(indicator) {
  const lifecycle = String(indicator?.lifecycle_status || '').toLowerCase();
  if (indicator?.active === false || lifecycle === 'planned') return 'planned';
  if (lifecycle === 'sourced') return 'candidate';
  if (lifecycle === 'active' || indicator?.active === true) return 'published';
  return lifecycle || 'unknown';
}

export function rankingPolicyForIndicator(indicator) {
  const higherIsBetter = directionFor(indicator?.indicator_code);
  const allowed = indicator?.ranking_allowed !== false && indicator?.comparable !== false;
  return {
    allowed,
    mode: higherIsBetter === null ? 'positional_only' : 'directional',
    higher_is_better: higherIsBetter,
    requires_sampling_uncertainty: indicator?.requires_sampling_uncertainty === true,
    static_reason_not_allowed: indicator?.ranking_allowed === false
      ? 'Indicator taxonomy disallows ranking.'
      : indicator?.comparable === false
        ? 'Indicator is not marked comparable.'
        : null
  };
}

const NON_TREND_CODES = new Set(['IND-COUNTY-AUDIT-OPINION']);
export function trendPolicyForIndicator(indicator) {
  const allowed = indicator?.comparable !== false && !NON_TREND_CODES.has(indicator?.indicator_code);
  return {
    allowed,
    rule: 'At least two numeric observations are required; directional wording uses the canonical direction rule and matched comparisons require comparable periods.',
    static_reason_not_allowed: !allowed ? 'Indicator is categorical or not marked comparable.' : null
  };
}

export function inheritancePolicyForIndicator() {
  return {
    parent_value_inheritance_allowed: false,
    rule: 'A parent geography value must never be copied into a child geography. Lower-level publication requires a real observation or an explicitly documented derived series for that geography.'
  };
}

const NORMALIZED_TRANSFORM = /(^|[_\s-])(rate|share|ratio|percent|percentage|per[_\s-]?(?:capita|person)|density|index)(?:$|[_\s-])/i;
const NORMALIZED_DIMENSIONS = new Set(['ratio', 'rate', 'index']);

export function crossLevelPolicyForSeries(seriesRow, indicator, unit) {
  const normalizedByUnit = NORMALIZED_DIMENSIONS.has(unit?.dimension);
  const transformText = [seriesRow?.transformation, seriesRow?.aggregation].filter(Boolean).join(' ');
  const normalizedByTransform = NORMALIZED_TRANSFORM.test(transformText);
  const areaException = indicator?.indicator_code === 'IND-LAND-AREA';
  const eligible = areaException || normalizedByUnit || normalizedByTransform;
  return {
    eligible,
    rule_basis: areaException
      ? 'physical-area exception'
      : normalizedByUnit
        ? `unit.dimension=${unit.dimension}`
        : normalizedByTransform
          ? `series transformation=${seriesRow?.transformation || seriesRow?.aggregation}`
          : 'raw count/currency/other total — same-level only'
  };
}

export function policyForIndicator(indicator) {
  return {
    policy_version: INDICATOR_POLICY_VERSION,
    indicator_code: indicator?.indicator_code || null,
    domain: domainForIndicator(indicator),
    direction: {
      higher_is_better: directionFor(indicator?.indicator_code),
      basis: DIRECTION_RULES[indicator?.indicator_code]?.basis || 'No directional quality claim is made.'
    },
    composite: { eligible: compositeEligible(indicator?.indicator_code) },
    ranking: rankingPolicyForIndicator(indicator),
    uncertainty: { required_for_ranking: indicator?.requires_sampling_uncertainty === true },
    trend: trendPolicyForIndicator(indicator),
    inheritance: inheritancePolicyForIndicator(indicator),
    publication_status: publicationStatusFor(indicator)
  };
}
