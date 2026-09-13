import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const triagePath = path.join(root, 'data/p23/turnout-followup-triage.json');
const tranchePath = path.join(root, 'data/p23/turnout-fresh-extraction-tranche-a.json');

const triage = JSON.parse(fs.readFileSync(triagePath, 'utf8'));
const tranche = JSON.parse(fs.readFileSync(tranchePath, 'utf8'));

const fail = (message) => {
  console.error(`P23 fresh extraction tranche validation failed: ${message}`);
  process.exitCode = 1;
};

if (tranche?.governance?.promotion_authorized_by_this_file !== false) fail('promotion_authorized_by_this_file must remain false');
if (tranche?.governance?.no_promotion !== true) fail('no_promotion must remain true');
if (tranche?.governance?.no_inheritance !== true) fail('no_inheritance must remain true');
if (tranche?.governance?.source_discovery_only !== true) fail('source_discovery_only must remain true');
if (tranche?.governance?.required_render_dpi_for_any_future_source_verification !== 250) fail('future source verification must require exactly 250 DPI');

const rows = tranche?.tranche?.rows;
if (!Array.isArray(rows)) {
  fail('tranche.rows must be an array');
} else {
  if (tranche?.tranche?.count !== rows.length) fail('tranche.count must equal rows.length');
  if (rows.length !== 8) fail('tranche A must contain exactly eight rows');

  const untouched = triage?.genuinely_untouched?.constituencies;
  if (!Array.isArray(untouched)) {
    fail('triage genuinely_untouched.constituencies is missing');
  } else {
    const expected = untouched.slice(0, 8);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const exp = expected[i];
      if (!exp || row.geo_code !== exp.geo_code || row.name !== exp.name) {
        fail(`row ${i + 1} must match the first-eight canonical untouched queue order`);
      }
      if (row.state !== 'pending_official_source_discovery' && row.state !== 'official_source_located_unreviewed' && row.state !== 'official_source_not_located') {
        fail(`row ${i + 1} has non-governed state ${row.state}`);
      }
      for (const forbiddenKey of ['verified_value', 'source_verified', 'promotion_eligible', 'promotion_state', 'turnout_pct', 'ballots_cast', 'total_valid_votes', 'rejected_ballots', 'registered_voters']) {
        if (Object.prototype.hasOwnProperty.call(row, forbiddenKey)) {
          fail(`row ${i + 1} contains forbidden pre-review field ${forbiddenKey}`);
        }
      }
    }
  }

  const codes = rows.map((row) => row.geo_code);
  if (new Set(codes).size !== codes.length) fail('tranche rows must have unique geo_code values');
}

const forbiddenStates = tranche?.forbidden_until_fresh_source_review;
for (const required of ['source_verified', 'promotion_eligible', 'explicit_materialization_authorized']) {
  if (!Array.isArray(forbiddenStates) || !forbiddenStates.includes(required)) {
    fail(`forbidden_until_fresh_source_review must include ${required}`);
  }
}

if (!process.exitCode) {
  console.log('P23 fresh extraction tranche validation passed: 8 untouched rows; source-discovery only; 250-DPI future review; no promotion.');
}
