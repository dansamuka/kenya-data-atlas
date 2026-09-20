#!/usr/bin/env node
// P32 -- Independently validate the completed Local-54 ward tranche.
//
// P29 proves the complete county/constituency/ward denominator. This validator narrows the
// assurance surface to P32: it checks the full 54 x 1,450 ward cross-product, the disposition
// and anti-inheritance invariants, and the 43 indicator families / 62,350 cells with specific
// P32 evidence. It also rebuilds the P32-generated roads/fuel evidence in memory and rejects
// drift without mutating the working tree.
import fs from 'node:fs';
import path from 'node:path';
import { assertWardCompletion } from './ward-completion-assurance.mjs';
import { buildRoadsFuelWardEvidenceStates } from './build-roads-fuel-ward-evidence-states.mjs';

const root = process.cwd();
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

try {
  const contract = readJson('data/p32/ward-completion-assurance-contract.json');
  const geographies = readJson('data/geography/registry/geographies.json');
  const roadsFuelPath = 'data/completeness/local-54-roads-fuel-ward-evidence-states.json';
  const deterministicPaths = (contract.deterministic_outputs || []).map(item => item.path);
  if (deterministicPaths.length !== 1 || deterministicPaths[0] !== roadsFuelPath) {
    throw new Error(`unexpected P32 deterministic output contract: ${JSON.stringify(deterministicPaths)}`);
  }

  const evidenceDocuments = contract.p32_specific_evidence.files.map(evidencePath => ({
    path: evidencePath,
    document: readJson(evidencePath)
  }));

  const summary = assertWardCompletion({
    contract,
    manifest: readJson('data/completeness/local-54-indicator-manifest.json'),
    geographies,
    ledger: readJson('data/completeness/local-54-slot-ledger.json'),
    policy: readJson('data/policy/local-54-indicator-contract.json'),
    reasonCatalogue: readJson('data/completeness/local-54-reason-catalogue.json'),
    evidenceDocuments,
    deterministicArtifacts: [{
      path: roadsFuelPath,
      committed: readJson(roadsFuelPath),
      rebuilt: buildRoadsFuelWardEvidenceStates(geographies)
    }]
  });

  console.log(
    `P32_WARD_COMPLETION_OK indicators=${summary.indicators} wards=${summary.wards} ` +
    `ward_cells=${summary.ward_cells} unclassified=${summary.unclassified_cells} ` +
    `prohibited_inheritance=${summary.prohibited_parent_to_ward_inheritance_cells} ` +
    `p32_indicator_families=${summary.p32_specific_indicator_families} ` +
    `p32_evidence_cells=${summary.p32_specific_evidence_cells}`
  );
} catch (error) {
  console.error(`P32_WARD_COMPLETION_FAIL ${error.message || error}`);
  process.exit(1);
}
