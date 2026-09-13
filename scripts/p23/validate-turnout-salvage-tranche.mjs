import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const queue = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/never-attempted-constituencies.json'), 'utf8'));
const triage = JSON.parse(fs.readFileSync(path.join(root, 'data/p23/turnout-followup-triage.json'), 'utf8'));

const fail = (message) => {
  console.error(`P23 turnout salvage tranche validation failed: ${message}`);
  process.exitCode = 1;
};

const untouched = triage?.genuinely_untouched?.constituencies;
const sourceRows = queue?.constituencies;
if (!Array.isArray(untouched)) fail('triage genuinely_untouched.constituencies is missing');
if (!Array.isArray(sourceRows)) fail('source queue constituencies is missing');

const untouchedCodes = new Set(Array.isArray(untouched) ? untouched.map((row) => row.geo_code) : []);
const salvageQueue = Array.isArray(sourceRows) ? sourceRows.filter((row) => !untouchedCodes.has(row.geo_code)) : [];
const governedSalvageCount = triage?.prior_nonpromotable_attempts?.count_within_current_109_row_queue;

if (governedSalvageCount !== 85) fail(`triage governed salvage count must remain 85; saw ${governedSalvageCount}`);
if (salvageQueue.length !== governedSalvageCount) fail(`derived salvage queue must contain ${governedSalvageCount} rows; saw ${salvageQueue.length}`);

const specs = [
  { id: 'salvage-a', path: 'data/p23/turnout-salvage-tranche-a.json', start: 0, count: 8 },
  { id: 'salvage-b', path: 'data/p23/turnout-salvage-tranche-b.json', start: 8, count: 8 },
  { id: 'salvage-c', path: 'data/p23/turnout-salvage-tranche-c.json', start: 16, count: 8 },
  { id: 'salvage-d', path: 'data/p23/turnout-salvage-tranche-d.json', start: 24, count: 8 },
  { id: 'salvage-e', path: 'data/p23/turnout-salvage-tranche-e.json', start: 32, count: 8 },
  { id: 'salvage-f', path: 'data/p23/turnout-salvage-tranche-f.json', start: 40, count: 8 },
  { id: 'salvage-g', path: 'data/p23/turnout-salvage-tranche-g.json', start: 48, count: 8 },
  { id: 'salvage-h', path: 'data/p23/turnout-salvage-tranche-h.json', start: 56, count: 8 },
  { id: 'salvage-i', path: 'data/p23/turnout-salvage-tranche-i.json', start: 64, count: 8 },
  { id: 'salvage-j', path: 'data/p23/turnout-salvage-tranche-j.json', start: 72, count: 8 },
  { id: 'salvage-k', path: 'data/p23/turnout-salvage-tranche-k.json', start: 80, count: 5 },
];

const allowedPriorPrs = new Set([143, 144, 145]);
const forbiddenKeys = new Set(['source_url','form_id','source_pdf_sha256','review_context_image_sha256','verified_value','source_verified','promotion_eligible','promotion_state','turnout_pct','ballots_cast','total_valid_votes','rejected_ballots','registered_voters','candidate_vote_sum']);

const findForbiddenKeys = (value, location, found = []) => {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${location}[${index}]`, found));
    return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) found.push(`${location}.${key}`);
    findForbiddenKeys(nested, `${location}.${key}`, found);
  }
  return found;
};

const seenCodes = new Set();
for (const spec of specs) {
  const filePath = path.join(root, spec.path);
  if (!fs.existsSync(filePath)) {
    fail(`${spec.id} file is missing: ${spec.path}`);
    continue;
  }
  const tranche = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const governance = tranche?.governance;
  if (tranche?.tranche?.id !== spec.id) fail(`${spec.id}: tranche.id must equal ${spec.id}`);
  if (governance?.promotion_authorized_by_this_file !== false) fail(`${spec.id}: promotion_authorized_by_this_file must remain false`);
  if (governance?.no_promotion !== true) fail(`${spec.id}: no_promotion must remain true`);
  if (governance?.no_inheritance !== true) fail(`${spec.id}: no_inheritance must remain true`);
  if (governance?.locator_recovery_only !== true) fail(`${spec.id}: locator_recovery_only must remain true`);
  if (governance?.prior_pr_evidence_is_noncanonical !== true) fail(`${spec.id}: prior PR evidence must remain noncanonical`);
  if (governance?.prior_pr_values_must_not_be_copied !== true) fail(`${spec.id}: prior PR values must not be copied`);
  if (governance?.prior_pr_hashes_must_not_be_copied !== true) fail(`${spec.id}: prior PR hashes must not be copied`);
  if (governance?.fresh_official_download_required_before_review !== true) fail(`${spec.id}: fresh official download must remain required`);
  if (governance?.fresh_hashes_required_before_review !== true) fail(`${spec.id}: fresh hashes must remain required`);
  if (governance?.required_render_dpi_for_any_new_source_verification !== 250) fail(`${spec.id}: new source verification must require exactly 250 DPI`);
  if (governance?.canonical_turnout_values_must_not_be_written_by_this_tranche !== true) fail(`${spec.id}: canonical turnout writes must remain forbidden`);

  const rows = tranche?.tranche?.rows;
  if (!Array.isArray(rows)) {
    fail(`${spec.id}: tranche.rows must be an array`);
    continue;
  }
  if (tranche?.tranche?.count !== rows.length) fail(`${spec.id}: tranche.count must equal rows.length`);
  if (rows.length !== spec.count) fail(`${spec.id}: tranche must contain exactly ${spec.count} rows`);

  const expected = salvageQueue.slice(spec.start, spec.start + spec.count);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const exp = expected[i];
    if (!exp || row.geo_code !== exp.geo_code || row.name !== exp.name) fail(`${spec.id}: row ${i + 1} must match canonical salvage queue positions ${spec.start + 1}-${spec.start + spec.count}`);
    if (row.state !== 'locator_recovered_pending_fresh_review') fail(`${spec.id}: row ${i + 1} must remain locator_recovered_pending_fresh_review before a fresh source review`);
    if (seenCodes.has(row.geo_code)) fail(`${spec.id}: duplicate geo_code across salvage tranches: ${row.geo_code}`);
    seenCodes.add(row.geo_code);

    const locator = row.prior_locator;
    if (!locator || !Array.isArray(locator.pull_requests) || locator.pull_requests.length < 1) fail(`${spec.id}: row ${i + 1} must preserve at least one closed-PR locator`);
    else for (const pr of locator.pull_requests) if (!allowedPriorPrs.has(pr)) fail(`${spec.id}: row ${i + 1} references non-governed prior PR ${pr}`);
    if (!locator || !Array.isArray(locator.files) || locator.files.length < 1) fail(`${spec.id}: row ${i + 1} must preserve at least one prior evidence-file locator`);
    else for (const file of locator.files) if (typeof file !== 'string' || !/^data\/p23\/form34b-.+-source-verification\.json$/.test(file)) fail(`${spec.id}: row ${i + 1} has invalid prior evidence-file locator ${file}`);
    if (typeof locator?.prior_disposition !== 'string' || locator.prior_disposition.length === 0) fail(`${spec.id}: row ${i + 1} must preserve a non-authoritative prior disposition label`);
    for (const location of findForbiddenKeys(row, `${spec.id}.rows[${i}]`)) fail(`${spec.id}: prior locator row contains forbidden inherited source/value field at ${location}`);
  }

  const forbiddenStates = tranche?.forbidden_until_fresh_source_review;
  for (const required of ['source_verified','promotion_eligible','explicit_materialization_authorized']) {
    if (!Array.isArray(forbiddenStates) || !forbiddenStates.includes(required)) fail(`${spec.id}: forbidden_until_fresh_source_review must include ${required}`);
  }
}

if (seenCodes.size !== governedSalvageCount) fail(`salvage tranches must cover all ${governedSalvageCount} unique canonical rows; saw ${seenCodes.size}`);

if (!process.exitCode) {
  console.log(`P23 turnout salvage tranche validation passed: ${salvageQueue.length} canonical salvage rows derived; salvage-a through salvage-k cover positions 1-85 as locator-only; fresh download + fresh hashes + exactly 250-DPI review required; no promotion.`);
}
