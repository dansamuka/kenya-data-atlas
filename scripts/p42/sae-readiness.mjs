// P42 -- deterministic readiness assessment for the first survey small-area-estimation pilot.
// Pure logic: no network calls, no microdata reads, and no sensitive paths.
// The public repository may record metadata/hashes and model diagnostics, never raw KNBS/DHS microdata.

export function assessSaePilotReadiness({ sourceReadiness, pilotContract, matrixRows }) {
  const errors = [];
  const blockers = [];

  if (!sourceReadiness || sourceReadiness.overall_conclusion !== 'conditional_go_for_sae_not_exact_ward_assignment') {
    errors.push('KeNADA source-readiness decision must explicitly allow SAE while prohibiting exact ward assignment.');
  }
  if (sourceReadiness?.governance?.raw_microdata_may_be_committed !== false) {
    errors.push('raw_microdata_may_be_committed must be false.');
  }

  const kdhs = sourceReadiness?.sources?.find(s => s.id === 'kenada-kdhs-2022');
  if (!kdhs) errors.push('kenada-kdhs-2022 source assessment is missing.');
  else {
    if (kdhs.geospatial_status?.direct_point_in_ward_assignment_allowed !== false) {
      errors.push('DHS displaced coordinates must never be treated as exact ward assignments.');
    }
    if (kdhs.geospatial_status?.approved_use !== 'geostatistical/small-area modelling with displacement-aware covariate extraction and population-weighted prediction aggregation') {
      errors.push('KDHS approved geospatial use must be the displacement-aware SAE path.');
    }
  }

  if (pilotContract?.target?.indicator_id !== 'IND-STUNTING-RATE') {
    errors.push('first SAE pilot must target IND-STUNTING-RATE.');
  }
  if (pilotContract?.target?.potential_new_cells !== 1740) {
    errors.push('stunting pilot potential_new_cells must be 1,740 (290 constituency + 1,450 ward).');
  }
  if (pilotContract?.publication_gate?.publish_currently !== false) {
    errors.push('pilot must remain non-publishable until real inputs and validation results exist.');
  }

  const rows = Array.isArray(matrixRows) ? matrixRows.filter(r => r.indicator_id === 'IND-STUNTING-RATE') : [];
  const byLevel = new Map(rows.map(r => [r.level, r]));
  const county = byLevel.get('county');
  const constituency = byLevel.get('constituency');
  const ward = byLevel.get('ward');
  if (!county || county.current_numeric_coverage_cells !== 47 || county.feasibility_class !== 'A') {
    errors.push('stunting county control row must exist with 47 numeric cells and feasibility A.');
  }
  for (const [level, row] of [['constituency', constituency], ['ward', ward]]) {
    if (!row || row.preferred_method_class !== 'small_area_estimation' || row.feasibility_class !== 'C') {
      errors.push(`stunting ${level} row must be feasibility C small_area_estimation.`);
    }
  }

  for (const input of pilotContract?.external_inputs || []) {
    if (!input.required) continue;
    const readyStates = new Set(['available', 'authorized_external_available', 'existing_repo_asset']);
    if (!readyStates.has(input.status)) {
      blockers.push({
        input_id: input.id,
        status: input.status,
        reason: 'required input is not yet fit-ready'
      });
    }
  }

  if (pilotContract?.external_inputs?.some(i => i.repository_storage === 'forbidden' && i.status === 'available')) {
    errors.push('a controlled raw input cannot be marked repository-available; use authorized_external_available.');
  }

  const thresholds = pilotContract?.predeclared_validation_thresholds || {};
  for (const key of [
    'county_holdout_mean_absolute_error_pp_max',
    'county_holdout_rmse_pp_max',
    'holdout_interval_coverage_pct_min',
    'final_county_back_aggregation_absolute_bias_pp_max',
    'median_ward_interval_width_pp_max'
  ]) {
    if (typeof thresholds[key] !== 'number') errors.push(`missing explicit pilot validation threshold: ${key}`);
  }

  return {
    schema_version: 'kda.p42.sae-readiness-report.v1',
    pilot_id: pilotContract?.pilot_id || null,
    target_indicator_id: pilotContract?.target?.indicator_id || null,
    potential_new_cells: pilotContract?.target?.potential_new_cells || null,
    source_path: kdhs ? 'KDHS 2022 public-use recode + DHS registered geographic data' : null,
    ready_to_fit: errors.length === 0 && blockers.length === 0,
    ready_to_publish: false,
    errors,
    blockers,
    next_action: blockers.length
      ? 'satisfy controlled external inputs without committing raw respondent/cluster data, then rerun SAE preflight'
      : 'fit the predeclared stunting model and run all P42 validation gates before any publication'
  };
}
