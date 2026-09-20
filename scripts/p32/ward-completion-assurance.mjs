const NUMERIC_DISPOSITIONS = new Set([
  'published_direct',
  'published_derived',
  'published_modelled',
  'external_verified'
]);

const CLOSURE_DISPOSITIONS = new Set([
  'official_unavailable',
  'governed_unavailable',
  'not_applicable',
  'boundary_unresolved',
  'retired_replaced'
]);

const MAX_ERRORS = 60;

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareSets(actualValues, expectedValues, label, addError) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  const missing = [...expected].filter(value => !actual.has(value));
  const unexpected = [...actual].filter(value => !expected.has(value));
  if (missing.length || unexpected.length) {
    addError(
      `${label} mismatch: missing=${JSON.stringify(missing.slice(0, 8))} ` +
      `unexpected=${JSON.stringify(unexpected.slice(0, 8))}`
    );
  }
}

function evidenceDocumentMap(evidenceDocuments = []) {
  return new Map(evidenceDocuments.map(item => [item.path, item.document]));
}

export function validateWardCompletion({
  contract,
  manifest,
  geographies,
  ledger,
  policy,
  reasonCatalogue,
  evidenceDocuments,
  deterministicArtifacts = []
}) {
  const errors = [];
  let suppressedErrors = 0;
  const addError = message => {
    if (errors.length < MAX_ERRORS) errors.push(message);
    else suppressedErrors += 1;
  };

  if (contract?.schema_version !== 'kda.p32.ward-completion-assurance.v1') {
    addError('P32 assurance contract schema mismatch');
  }

  const expected = contract?.expected || {};
  const manifestCodes = (manifest?.indicators || []).map(item => item.indicator_id);
  const uniqueManifestCodes = sortedUnique(manifestCodes);
  if (manifestCodes.length !== expected.indicator_count) {
    addError(`indicator denominator must equal ${expected.indicator_count}, got ${manifestCodes.length}`);
  }
  if (uniqueManifestCodes.length !== manifestCodes.length) {
    addError('Local-54 manifest contains duplicate indicator IDs');
  }

  const specificCodes = contract?.p32_specific_evidence?.indicator_codes || [];
  const structuralCodes = contract?.outside_p32_specific_evidence?.structural_not_applicable_indicator_codes || [];
  const preResolvedCodes = contract?.outside_p32_specific_evidence?.already_resolved_before_p32_indicator_codes || [];
  const partitionCodes = [...specificCodes, ...structuralCodes, ...preResolvedCodes];
  if (specificCodes.length !== expected.p32_specific_indicator_count) {
    addError(`P32-specific indicator contract must contain ${expected.p32_specific_indicator_count} codes, got ${specificCodes.length}`);
  }
  if (new Set(partitionCodes).size !== partitionCodes.length) {
    addError('P32 indicator partition contains duplicate codes');
  }
  compareSets(partitionCodes, uniqueManifestCodes, 'P32 indicator partition', addError);

  const treatmentByIndicator = new Map((policy?.indicators || []).map(item => [item.indicator_id, item.treatment_class]));
  for (const code of structuralCodes) {
    if (treatmentByIndicator.get(code) !== 'institutional_county_only') {
      addError(`${code}: structural P32 exclusion must use institutional_county_only treatment`);
    }
  }
  if (policy?.acceptance?.parent_child_inheritance_prohibited !== true) {
    addError('Local-54 policy must explicitly prohibit parent-child inheritance');
  }

  const wards = (geographies || []).filter(geography => geography.level === 'ward');
  const wardCodes = wards.map(geography => geography.geo_code);
  const uniqueWardCodes = sortedUnique(wardCodes);
  if (wards.length !== expected.ward_count) {
    addError(`ward geography denominator must equal ${expected.ward_count}, got ${wards.length}`);
  }
  if (uniqueWardCodes.length !== wards.length) {
    addError('ward geography registry contains duplicate geo_codes');
  }

  const wardCodeSet = new Set(uniqueWardCodes);
  const indicatorCodeSet = new Set(uniqueManifestCodes);
  const allowedDispositions = new Set(contract?.allowed_dispositions || []);
  const allowedMethods = new Set(contract?.allowed_geographic_methods || []);
  const prohibitedMethods = new Set(contract?.prohibited_parent_child_methods || []);
  const wardRows = (ledger?.rows || []).filter(row => row.level === 'ward');
  if (wardRows.length !== expected.ward_cell_count) {
    addError(`ward cells must equal ${expected.ward_cell_count}, got ${wardRows.length}`);
  }

  const rowByCell = new Map();
  const dispositionCounts = {};
  let unclassifiedCells = 0;
  let unresolvedCells = 0;
  let prohibitedInheritanceCells = 0;

  for (const row of wardRows) {
    const cellKey = `${row.geo_code}|${row.indicator_code}`;
    if (rowByCell.has(cellKey)) addError(`${cellKey}: duplicate ward-indicator cell`);
    rowByCell.set(cellKey, row);

    if (!wardCodeSet.has(row.geo_code)) addError(`${cellKey}: unknown ward geo_code`);
    if (!indicatorCodeSet.has(row.indicator_code)) addError(`${cellKey}: indicator outside the frozen Local-54 manifest`);
    if (row.resolved !== true) unresolvedCells += 1;

    const status = String(row.status || '');
    dispositionCounts[status] = (dispositionCounts[status] || 0) + 1;
    if (!allowedDispositions.has(status)) unclassifiedCells += 1;

    const method = String(row.geographic_method || '').toLowerCase();
    if (prohibitedMethods.has(method)) prohibitedInheritanceCells += 1;
    if (!allowedMethods.has(method)) addError(`${cellKey}: geographic_method "${method}" is outside the closed allowed vocabulary`);
  }

  if (unresolvedCells) addError(`unknown/unresolved ward cells must equal zero, got ${unresolvedCells}`);
  if (unclassifiedCells) addError(`unknown/unclassified ward cells must equal zero, got ${unclassifiedCells}`);
  if (prohibitedInheritanceCells) {
    addError(`prohibited parent-to-ward inheritance must equal zero, got ${prohibitedInheritanceCells}`);
  }

  let missingCellCount = 0;
  const missingCellSamples = [];
  for (const wardCode of uniqueWardCodes) {
    for (const indicatorCode of uniqueManifestCodes) {
      const cellKey = `${wardCode}|${indicatorCode}`;
      if (!rowByCell.has(cellKey)) {
        missingCellCount += 1;
        if (missingCellSamples.length < 8) missingCellSamples.push(cellKey);
      }
    }
  }
  if (missingCellCount) {
    addError(`ward denominator is missing ${missingCellCount} cell(s): ${JSON.stringify(missingCellSamples)}`);
  }

  for (const code of structuralCodes) {
    const invalid = wardRows.filter(row => row.indicator_code === code && row.status !== 'not_applicable').length;
    if (invalid) addError(`${code}: ${invalid} structural ward cell(s) are not not_applicable`);
  }

  const requiredEvidenceFiles = contract?.p32_specific_evidence?.files || [];
  const documentsByPath = evidenceDocumentMap(evidenceDocuments);
  const p32States = [];
  for (const evidencePath of requiredEvidenceFiles) {
    const document = documentsByPath.get(evidencePath);
    if (!document) {
      addError(`missing required P32 evidence file ${evidencePath}`);
      continue;
    }
    if (document.schema_version !== 'kda.completeness.evidence-states.v1') {
      addError(`${evidencePath}: evidence-state schema mismatch`);
    }
    for (const state of document.states || []) {
      if (state.level === 'ward' && String(state.contract_id || '').startsWith('P32-')) {
        p32States.push({ ...state, evidence_file: evidencePath });
      }
    }
  }

  const stateIndicatorCodes = p32States.map(state => state.indicator_code);
  compareSets(stateIndicatorCodes, specificCodes, 'specific P32 evidence indicator families', addError);
  if (p32States.length !== expected.p32_specific_indicator_count) {
    addError(
      `specific P32 evidence must contain one state for each of ${expected.p32_specific_indicator_count} ` +
      `indicator families, got ${p32States.length}`
    );
  }
  if (new Set(stateIndicatorCodes).size !== p32States.length) {
    addError('specific P32 evidence contains duplicate indicator-family states');
  }

  const reasonById = new Map((reasonCatalogue?.reasons || []).map(reason => [reason.reason_id, reason]));
  const evidenceCellKeys = new Set();
  let duplicateEvidenceCells = 0;
  let currentClosureCells = 0;
  let supersededByNumericCells = 0;

  for (const state of p32States) {
    const stateLabel = `${state.evidence_file}:${state.indicator_code}`;
    if (!specificCodes.includes(state.indicator_code)) {
      addError(`${stateLabel}: indicator is outside the frozen P32-specific evidence set`);
    }
    if (!CLOSURE_DISPOSITIONS.has(state.status)) {
      addError(`${stateLabel}: P32 evidence status must be a governed closure, got ${state.status}`);
    }
    for (const field of ['contract_id', 'period_label', 'source', 'source_url', 'reason']) {
      if (typeof state[field] !== 'string' || state[field].trim() === '') {
        addError(`${stateLabel}: missing ${field}`);
      }
    }
    if (state.source_url && !/^https:\/\//.test(state.source_url)) {
      addError(`${stateLabel}: source_url must use https`);
    }

    const geoCodes = Array.isArray(state.geo_codes) ? state.geo_codes : [];
    if (geoCodes.length !== expected.ward_count) {
      addError(`${stateLabel}: must cover ${expected.ward_count} wards, got ${geoCodes.length}`);
    }
    if (new Set(geoCodes).size !== geoCodes.length) {
      addError(`${stateLabel}: contains duplicate ward geo_codes`);
    }
    compareSets(geoCodes, uniqueWardCodes, `${stateLabel} ward coverage`, addError);

    for (const wardCode of geoCodes) {
      const cellKey = `${wardCode}|${state.indicator_code}`;
      if (evidenceCellKeys.has(cellKey)) duplicateEvidenceCells += 1;
      evidenceCellKeys.add(cellKey);

      const row = rowByCell.get(cellKey);
      if (!row) continue;
      if (NUMERIC_DISPOSITIONS.has(row.status)) {
        supersededByNumericCells += 1;
        continue;
      }
      currentClosureCells += 1;
      if (row.status !== state.status) {
        addError(`${cellKey}: ledger disposition ${row.status} does not match P32 evidence ${state.status}`);
        continue;
      }
      const reason = reasonById.get(row.reason_id);
      if (!reason) {
        addError(`${cellKey}: closure reason_id ${row.reason_id || '(missing)'} is absent from the reason catalogue`);
        continue;
      }
      for (const field of ['period_label', 'source', 'source_url', 'reason']) {
        if (reason[field] !== state[field]) {
          addError(`${cellKey}: ledger reason catalogue does not preserve the specific P32 ${field}`);
          break;
        }
      }
    }
  }

  if (duplicateEvidenceCells) {
    addError(`specific P32 evidence contains ${duplicateEvidenceCells} duplicate ward-indicator assignment(s)`);
  }
  if (evidenceCellKeys.size !== expected.p32_specific_evidence_cell_count) {
    addError(
      `specific P32 evidence must cover ${expected.p32_specific_evidence_cell_count} ward cells, ` +
      `got ${evidenceCellKeys.size}`
    );
  }

  for (const artifact of deterministicArtifacts) {
    if (!sameJson(artifact.committed, artifact.rebuilt)) {
      addError(`${artifact.path || artifact.name || 'P32 artifact'}: deterministic rebuild drift detected`);
    }
  }

  if (suppressedErrors) errors.push(`... ${suppressedErrors} additional validation error(s) suppressed`);

  return {
    errors,
    summary: {
      indicators: uniqueManifestCodes.length,
      wards: uniqueWardCodes.length,
      ward_cells: wardRows.length,
      unclassified_cells: unclassifiedCells,
      unresolved_cells: unresolvedCells,
      prohibited_parent_to_ward_inheritance_cells: prohibitedInheritanceCells,
      p32_specific_indicator_families: new Set(stateIndicatorCodes).size,
      p32_specific_evidence_cells: evidenceCellKeys.size,
      p32_evidence_current_closure_cells: currentClosureCells,
      p32_evidence_superseded_by_numeric_cells: supersededByNumericCells,
      dispositions: dispositionCounts
    }
  };
}

export function assertWardCompletion(inputs) {
  const result = validateWardCompletion(inputs);
  if (result.errors.length) {
    throw new Error(`P32 ward-completion assurance failed:\n- ${result.errors.join('\n- ')}`);
  }
  return result.summary;
}
