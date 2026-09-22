import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSaePilotReadiness } from '../../scripts/p42/sae-readiness.mjs';

function fixture() {
  return {
    sourceReadiness: {
      overall_conclusion: 'conditional_go_for_sae_not_exact_ward_assignment',
      governance: { raw_microdata_may_be_committed: false },
      sources: [{
        id: 'kenada-kdhs-2022',
        geospatial_status: {
          direct_point_in_ward_assignment_allowed: false,
          approved_use: 'geostatistical/small-area modelling with displacement-aware covariate extraction and population-weighted prediction aggregation'
        }
      }]
    },
    pilotContract: {
      pilot_id: 'P42-SAE-001',
      target: { indicator_id: 'IND-STUNTING-RATE', potential_new_cells: 1740 },
      publication_gate: { publish_currently: false },
      external_inputs: [
        { id: 'microdata', required: true, repository_storage: 'forbidden', status: 'not_present' }
      ],
      predeclared_validation_thresholds: {
        county_holdout_mean_absolute_error_pp_max: 5,
        county_holdout_rmse_pp_max: 7,
        holdout_interval_coverage_pct_min: 80,
        final_county_back_aggregation_absolute_bias_pp_max: 0.5,
        median_ward_interval_width_pp_max: 20
      }
    },
    matrixRows: [
      { indicator_id: 'IND-STUNTING-RATE', level: 'county', current_numeric_coverage_cells: 47, feasibility_class: 'A' },
      { indicator_id: 'IND-STUNTING-RATE', level: 'constituency', preferred_method_class: 'small_area_estimation', feasibility_class: 'C' },
      { indicator_id: 'IND-STUNTING-RATE', level: 'ward', preferred_method_class: 'small_area_estimation', feasibility_class: 'C' }
    ]
  };
}

test('current controlled-input state is a clean blocked readiness state, not an error', () => {
  const x = fixture();
  const r = assessSaePilotReadiness(x);
  assert.equal(r.ready_to_fit, false);
  assert.equal(r.errors.length, 0);
  assert.equal(r.blockers.length, 1);
});

test('pilot becomes fit-ready only when required external inputs are explicitly authorized/available', () => {
  const x = fixture();
  x.pilotContract.external_inputs[0].status = 'authorized_external_available';
  const r = assessSaePilotReadiness(x);
  assert.equal(r.ready_to_fit, true);
  assert.equal(r.ready_to_publish, false);
});

test('direct ward assignment of displaced DHS points is a hard error', () => {
  const x = fixture();
  x.sourceReadiness.sources[0].geospatial_status.direct_point_in_ward_assignment_allowed = true;
  const r = assessSaePilotReadiness(x);
  assert.equal(r.ready_to_fit, false);
  assert.match(r.errors.join(' '), /must never be treated as exact ward assignments/);
});

test('raw microdata being committable is a hard governance error', () => {
  const x = fixture();
  x.sourceReadiness.governance.raw_microdata_may_be_committed = true;
  const r = assessSaePilotReadiness(x);
  assert.match(r.errors.join(' '), /raw_microdata_may_be_committed/);
});

test('wrong Local-54 matrix treatment blocks the pilot before fitting', () => {
  const x = fixture();
  x.matrixRows.find(r => r.level === 'ward').feasibility_class = 'E';
  const r = assessSaePilotReadiness(x);
  assert.match(r.errors.join(' '), /ward row must be feasibility C/);
});
