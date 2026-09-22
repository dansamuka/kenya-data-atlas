import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMethod } from '../../scripts/p42/method-selection.mjs';

const SURVEY_ALLOWED = ['direct_official', 'matched_local_calculation', 'secondary_verified', 'secondary_corroborated', 'probable_conflicting_value', 'modelled_estimate', 'governed_unavailable'];
const ELECTORAL_ALLOWED = ['direct_official', 'exact_aggregation', 'secondary_verified', 'secondary_corroborated', 'probable_conflicting_value', 'governed_unavailable'];
const GEOMETRY_ALLOWED = ['direct_official', 'spatial_derivation', 'secondary_verified', 'secondary_corroborated', 'probable_conflicting_value', 'governed_unavailable'];

test('already_numeric is feasibility A with the direct method, regardless of treatment class', () => {
  const r = selectMethod({ barrierClassification: 'already_numeric', treatmentClass: 'survey_small_area', allowedStates: SURVEY_ALLOWED });
  assert.equal(r.feasibility_class, 'A');
  assert.equal(r.method_class, 'direct_or_official_derived');
});

test('not_applicable always resolves to feasibility E with no method', () => {
  const r = selectMethod({ barrierClassification: 'not_applicable', treatmentClass: 'institutional_county_only', allowedStates: [] });
  assert.equal(r.feasibility_class, 'E');
  assert.equal(r.method_class, null);
});

test('publication_pending is the highest actionable tier: feasibility A, direct method', () => {
  const r = selectMethod({ barrierClassification: 'publication_pending', treatmentClass: 'education_admin_aggregate', allowedStates: SURVEY_ALLOWED });
  assert.equal(r.feasibility_class, 'A');
  assert.equal(r.method_class, 'direct_or_official_derived');
});

test('access_technical is feasibility B and prefers spatial_derivation when the treatment class allows it', () => {
  const r = selectMethod({ barrierClassification: 'access_technical', treatmentClass: 'facility_service_rate', allowedStates: ['direct_official', 'spatial_derivation', 'modelled_estimate', 'governed_unavailable'] });
  assert.equal(r.feasibility_class, 'B');
  assert.equal(r.method_class, 'spatial_derivation');
});

test('access_technical falls back to direct_or_official_derived when spatial_derivation is not permitted', () => {
  const r = selectMethod({ barrierClassification: 'access_technical', treatmentClass: 'electoral_direct', allowedStates: ELECTORAL_ALLOWED });
  assert.equal(r.feasibility_class, 'B');
  assert.equal(r.method_class, 'direct_or_official_derived');
});

test('boundary_vintage_mismatch becomes a feasibility C spatial_derivation candidate when permitted', () => {
  const r = selectMethod({ barrierClassification: 'boundary_vintage_mismatch', treatmentClass: 'geometry_derived', allowedStates: GEOMETRY_ALLOWED });
  assert.equal(r.feasibility_class, 'C');
  assert.equal(r.method_class, 'spatial_derivation');
});

test('boundary_vintage_mismatch is feasibility E when the treatment class forbids spatial_derivation', () => {
  const r = selectMethod({ barrierClassification: 'boundary_vintage_mismatch', treatmentClass: 'electoral_direct', allowedStates: ELECTORAL_ALLOWED });
  assert.equal(r.feasibility_class, 'E');
  assert.equal(r.method_class, null);
});

test('regulatory_publication_scope, already_attempted_rejected and non_submission are always feasibility E', () => {
  for (const barrierClassification of ['regulatory_publication_scope', 'already_attempted_rejected', 'non_submission']) {
    const r = selectMethod({ barrierClassification, treatmentClass: 'survey_small_area', allowedStates: SURVEY_ALLOWED });
    assert.equal(r.feasibility_class, 'E', `${barrierClassification} should be E`);
    assert.equal(r.method_class, null);
  }
});

test('structural_permanent under survey_small_area becomes a feasibility C small_area_estimation candidate, not an automatic dead end', () => {
  const r = selectMethod({ barrierClassification: 'structural_permanent', treatmentClass: 'survey_small_area', allowedStates: SURVEY_ALLOWED });
  assert.equal(r.feasibility_class, 'C');
  assert.equal(r.method_class, 'small_area_estimation');
});

test('structural_permanent under economic_accounts_small_area prefers constrained_downscaling over small_area_estimation', () => {
  const r = selectMethod({
    barrierClassification: 'structural_permanent',
    treatmentClass: 'economic_accounts_small_area',
    allowedStates: ['direct_official', 'official_administrative_or_geocoded_records', 'secondary_verified', 'secondary_corroborated', 'probable_conflicting_value', 'modelled_estimate', 'governed_unavailable']
  });
  assert.equal(r.feasibility_class, 'C');
  assert.equal(r.method_class, 'constrained_downscaling');
});

test('structural_permanent under electoral_direct stays feasibility E because modelled_estimate is never permitted there', () => {
  const r = selectMethod({ barrierClassification: 'structural_permanent', treatmentClass: 'electoral_direct', allowedStates: ELECTORAL_ALLOWED });
  assert.equal(r.feasibility_class, 'E');
  assert.equal(r.method_class, null);
});

test('throws on an unrecognised barrier classification rather than silently defaulting', () => {
  assert.throws(() => selectMethod({ barrierClassification: 'made_up', treatmentClass: 'survey_small_area', allowedStates: SURVEY_ALLOWED }));
});


test('IND-POPULATION boundary mismatch may use an S5 spatial allocation because modelled_estimate is policy-permitted', () => {
  const r = selectMethod({
    barrierClassification: 'boundary_vintage_mismatch',
    treatmentClass: 'census_or_household_crosswalk',
    allowedStates: ['direct_official', 'exact_aggregation', 'matched_local_calculation', 'secondary_verified', 'secondary_corroborated', 'probable_conflicting_value', 'modelled_estimate', 'governed_unavailable'],
    indicatorId: 'IND-POPULATION'
  });
  assert.equal(r.feasibility_class, 'C');
  assert.equal(r.method_class, 'spatial_derivation');
});

test('historical IND-POP-2009 does not inherit the IND-POPULATION modelling exception', () => {
  const r = selectMethod({
    barrierClassification: 'boundary_vintage_mismatch',
    treatmentClass: 'census_or_household_crosswalk',
    allowedStates: ['direct_official', 'exact_aggregation', 'matched_local_calculation', 'secondary_verified', 'secondary_corroborated', 'probable_conflicting_value', 'modelled_estimate', 'governed_unavailable'],
    indicatorId: 'IND-POP-2009'
  });
  assert.equal(r.feasibility_class, 'E');
  assert.equal(r.method_class, null);
});
