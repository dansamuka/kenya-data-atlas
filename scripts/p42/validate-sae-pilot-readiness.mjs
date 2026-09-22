#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assessSaePilotReadiness } from './sae-readiness.mjs';

const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const sourceReadiness = read('data/p42/kenada-source-readiness.json');
const pilotContract = read('data/p42/sae-pilot-contract.json');
const matrix = read('data/p42/numeric-maximisation-matrix.json');
const committed = read('data/p42/sae-pilot-readiness-report.json');
const expected = assessSaePilotReadiness({ sourceReadiness, pilotContract, matrixRows: matrix.rows });
expected.assessed_on = sourceReadiness.assessed_on;

if (JSON.stringify(committed) !== JSON.stringify(expected)) {
  console.error('P42_SAE_READINESS_FAIL committed readiness report does not match deterministic rebuild');
  process.exit(1);
}
if (committed.errors.length) {
  console.error('P42_SAE_READINESS_FAIL contract/source errors: ' + committed.errors.join('; '));
  process.exit(1);
}
if (committed.ready_to_publish) {
  console.error('P42_SAE_READINESS_FAIL no model has been fit; readiness report must not authorize publication');
  process.exit(1);
}
if (committed.ready_to_fit) {
  console.error('P42_SAE_READINESS_FAIL controlled microdata/GPS/covariate inputs are intentionally absent from this public-repo execution; report should remain blocked');
  process.exit(1);
}
console.log(`P42_SAE_READINESS_OK pilot=${committed.pilot_id} blockers=${committed.blockers.length} potential_cells=${committed.potential_new_cells}`);
