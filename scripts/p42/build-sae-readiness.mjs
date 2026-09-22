#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assessSaePilotReadiness } from './sae-readiness.mjs';

const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const sourceReadiness = read('data/p42/kenada-source-readiness.json');
const pilotContract = read('data/p42/sae-pilot-contract.json');
const matrix = read('data/p42/numeric-maximisation-matrix.json');

const report = assessSaePilotReadiness({
  sourceReadiness,
  pilotContract,
  matrixRows: matrix.rows
});
report.assessed_on = sourceReadiness.assessed_on;

fs.writeFileSync(path.join(root, 'data/p42/sae-pilot-readiness-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`P42_SAE_READINESS built ready_to_fit=${report.ready_to_fit} blockers=${report.blockers.length} errors=${report.errors.length}`);
