// P06 compatibility surface.
//
// P12 moved the executable indicator-policy rules into one canonical module.
// Keep this file as a stable import path for P06–P11 code and any external
// tooling that still imports ./direction-rules.mjs.
export {
  INDICATOR_POLICY_VERSION,
  DIRECTION_RULES,
  AUDIT_OPINION_ORDER,
  directionFor,
  compositeEligible
} from '../policy/indicator-policy.mjs';
