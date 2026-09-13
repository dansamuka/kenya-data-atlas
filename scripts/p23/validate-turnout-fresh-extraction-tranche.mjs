import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const triagePath = path.join(root, 'data/p23/turnout-followup-triage.json');
const triage = JSON.parse(fs.readFileSync(triagePath, 'utf8'));

const fail = (message) => {
  console.error(`P23 fresh extraction tranche validation failed: ${message}`);
  process.exitCode = 1;
};

const trancheSpecs = [
  {
    id: 'fresh-a',
    path: 'data/p23/turnout-fresh-extraction-tranche-a.json',
    start: 0,
    count: 8,
  },
  {
    id: 'fresh-b',
    path: 'data/p23/turnout-fresh-extraction-tranche-b.json',
    start: 8,
    count: 8,
  },
  {
    id: 'fresh-c',
    path: 'data/p23/turnout-fresh-extraction-tranche-c.json',
    start: 16,
    count: 8,
  },
];

const untouched = triage?.genuinely_untouched?.constituencies;
if (!Array.isArray(untouched)) {
  fail('triage genuinely_untouched.constituencies is missing');
}

const seenCodes = new Set();

for (const spec of trancheSpecs) {
  const tranchePath = path.join(root, spec.path);
  if (!fs.existsSync(tranchePath)) {
    fail(`${spec.id} file is missing: ${spec.path}`);
    continue;
  }

  const tranche = JSON.parse(fs.readFileSync(tranchePath, 'utf8'));

  if (tranche?.tranche?.id !== spec.id) fail(`${spec.id} tranche.id must equal ${spec.id}`);
  if (tranche?.governance?.promotion_authorized_by_this_file !== false) fail(`${spec.id}: promotion_authorized_by_this_file must remain false`);
  if (tranche?.governance?.no_promotion !== true) fail(`${spec.id}: no_promotion must remain true`);
  if (tranche?.governance?.no_inheritance !== true) fail(`${spec.id}: no_inheritance must remain true`);
  if (tranche?.governance?.source_discovery_only !== true) fail(`${spec.id}: source_discovery_only must remain true`);
  if (tranche?.governance?.required_render_dpi_for_any_future_source_verification !== 250) fail(`${spec.id}: future source verification must require exactly 250 DPI`);
  if (tranche?.governance?.future_source_verification_must_use_fresh_download_and_hashes !== true) fail(`${spec.id}: fresh download and hashes must remain required`);
  if (tranche?.governance?.canonical_turnout_values_must_not_be_written_by_this_tranche !== true) fail(`${spec.id}: canonical turnout writes must remain forbidden`);

  const rows = tranche?.tranche?.rows;
  if (!Array.isArray(rows)) {
    fail(`${spec.id}: tranche.rows must be an array`);
    continue;
  }

  if (tranche?.tranche?.count !== rows.length) fail(`${spec.id}: tranche.count must equal rows.length`);
  if (rows.length !== spec.count) fail(`${spec.id}: tranche must contain exactly ${spec.count} rows`);

  const expected = Array.isArray(untouched) ? untouched.slice(spec.start, spec.start + spec.count) : [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const exp = expected[i];
    if (!exp || row.geo_code !== exp.geo_code || row.name !== exp.name) {
      fail(`${spec.id}: row ${i + 1} must match canonical untouched queue positions ${spec.start + 1}-${spec.start + spec.count}`);
    }

    if (!['pending_official_source_discovery', 'official_source_located_unreviewed', 'official_source_not_located'].includes(row.state)) {
      fail(`${spec.id}: row ${i + 1} has non-governed state ${row.state}`);
    }

    for (const forbiddenKey of ['verified_value', 'source_verified', 'promotion_eligible', 'promotion_state', 'turnout_pct', 'ballots_cast', 'total_valid_votes', 'rejected_ballots', 'registered_voters']) {
      if (Object.prototype.hasOwnProperty.call(row, forbiddenKey)) {
        fail(`${spec.id}: row ${i + 1} contains forbidden pre-review field ${forbiddenKey}`);
      }
    }

    if (seenCodes.has(row.geo_code)) fail(`${spec.id}: duplicate geo_code across fresh tranches: ${row.geo_code}`);
    seenCodes.add(row.geo_code);
  }

  const forbiddenStates = tranche?.forbidden_until_fresh_source_review;
  for (const required of ['source_verified', 'promotion_eligible', 'explicit_materialization_authorized']) {
    if (!Array.isArray(forbiddenStates) || !forbiddenStates.includes(required)) {
      fail(`${spec.id}: forbidden_until_fresh_source_review must include ${required}`);
    }
  }
}

if (Array.isArray(untouched) && seenCodes.size !== untouched.length) {
  fail(`fresh tranches must cover all ${untouched.length} canonical untouched rows exactly once; saw ${seenCodes.size}`);
}

if (!process.exitCode) {
  console.log('P23 fresh extraction tranche validation passed: fresh-a + fresh-b + fresh-c; all 24 canonical untouched rows; source-discovery only; exactly 250-DPI future review; no promotion.');
}
