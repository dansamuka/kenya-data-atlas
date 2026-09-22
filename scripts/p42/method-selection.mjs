// P42 -- pure method/feasibility selection logic for one (indicator, level) matrix row (no I/O).
//
// Translates P40's 7-tier barrier classification (already a genuine, individually-justified
// reading of each closure's evidence -- see scripts/p40/reason-classifications.mjs) into P42's
// method_class + feasibility_class vocabulary, constrained by what data/policy/
// local-54-indicator-contract.json's treatment_classes actually PERMIT for that indicator. A
// barrier classification never overrides the governing policy: e.g. structural_permanent under
// survey_small_area is a genuine small_area_estimation (feasibility C) candidate per the policy's
// own "modelled_estimate" allowance, but the identical structural_permanent barrier under
// electoral_direct (which never allows modelled_estimate) stays feasibility E.
export const P42_METHOD_TO_POLICY_STATE = {
  direct_or_official_derived: 'direct_official',
  secondary_verified_or_corroborated: 'secondary_verified',
  spatial_derivation: 'spatial_derivation',
  small_area_estimation: 'modelled_estimate',
  temporal_projection: 'modelled_estimate',
  constrained_downscaling: 'modelled_estimate',
  probable_value_conflict: 'probable_conflicting_value'
};

function allows(allowedStates, method) {
  return allowedStates.includes(P42_METHOD_TO_POLICY_STATE[method]);
}

// Picks the modelled method that fits a treatment_class's own real-world shape, not a generic
// default -- economic-accounts and agriculture indicators are about reconciling to an authoritative
// higher-level total (constrained_downscaling), survey-based rate indicators are about estimating
// within an under-sampled domain (small_area_estimation).
const MODELLED_METHOD_BY_TREATMENT_CLASS = {
  survey_small_area: 'small_area_estimation',
  economic_accounts_small_area: 'constrained_downscaling',
  agriculture_local: 'constrained_downscaling',
  census_or_household_crosswalk: 'small_area_estimation',
  education_admin_aggregate: 'small_area_estimation',
  facility_service_rate: 'small_area_estimation'
};

export function selectMethod({ barrierClassification, treatmentClass, allowedStates }) {
  switch (barrierClassification) {
    case 'already_numeric':
      return { method_class: 'direct_or_official_derived', feasibility_class: 'A', rationale: 'already resolved with a numeric S0/S1 value; no further method needed.' };

    case 'not_applicable':
      return { method_class: null, feasibility_class: 'E', rationale: 'structurally not applicable at this geography per the indicator\'s own treatment_class scope.' };

    case 'publication_pending':
      return { method_class: 'direct_or_official_derived', feasibility_class: 'A', rationale: 'source data collection is complete and natively captures this geography; only a pending publication step remains -- a deterministic direct-official path once released.' };

    case 'access_technical': {
      const method = allows(allowedStates, 'spatial_derivation') ? 'spatial_derivation' : 'direct_or_official_derived';
      return { method_class: method, feasibility_class: 'B', rationale: 'a live registry that structurally supports this geography is currently unreachable; reproducible once access is restored.' };
    }

    case 'boundary_vintage_mismatch': {
      if (allows(allowedStates, 'spatial_derivation')) {
        return { method_class: 'spatial_derivation', feasibility_class: 'C', rationale: 'source data exists but at an incompatible boundary vintage; a genuine geometry crosswalk (not population/equal-share allocation) may resolve it, pending a verified boundary source.' };
      }
      return { method_class: null, feasibility_class: 'E', rationale: 'source data exists at an incompatible boundary vintage and this indicator\'s treatment_class does not permit a spatial-derivation crosswalk.' };
    }

    case 'regulatory_publication_scope':
      return { method_class: null, feasibility_class: 'E', rationale: 'a regulator publishes only for a fixed statutory list of locations by law; no permitted method changes this.' };

    case 'already_attempted_rejected':
      return { method_class: null, feasibility_class: 'E', rationale: 'a genuine derivation was already attempted and formally rejected for reconciliation or policy reasons; needs a genuinely new source, not a new method.' };

    case 'non_submission':
      return { method_class: null, feasibility_class: 'E', rationale: 'a specific entity did not submit required data; not a source-discovery or modelling problem.' };

    case 'structural_permanent': {
      const modelledMethod = MODELLED_METHOD_BY_TREATMENT_CLASS[treatmentClass];
      if (modelledMethod && allows(allowedStates, modelledMethod)) {
        return {
          method_class: modelledMethod,
          feasibility_class: 'C',
          rationale: `the underlying source's own sampling/compilation domain never reaches this geography directly, but ${treatmentClass}'s governing policy explicitly permits a transparent, validated modelled_estimate -- a genuine ${modelledMethod} candidate pending indicator-specific validation, not automatically excluded.`
        };
      }
      return { method_class: null, feasibility_class: 'E', rationale: 'the underlying source\'s own design never reaches this geography, and this indicator\'s treatment_class does not permit a modelled estimate as a substitute.' };
    }

    default:
      throw new Error(`selectMethod: unknown barrierClassification "${barrierClassification}"`);
  }
}
